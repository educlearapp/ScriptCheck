/**
 * Read-only migration integrity verification (independent of Prisma deploy).
 */

import fs from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { scriptMatchesChecksum, renderChecksum } from "./migrationChecksum.mjs";
import { maskDatabaseUrl } from "./databaseTargetGuards.mjs";

/** Exit codes for CLI / bootstrap. */
export const EXIT = {
  HEALTHY: 0,
  USAGE: 2,
  CONNECTION: 3,
  MISSING_HISTORY: 10,
  CHECKSUM_MISMATCH: 11,
  APPLIED_MISSING_LOCALLY: 12,
  FAILED_MIGRATION: 13,
  ROLLED_BACK_UNRESOLVED: 14,
  PENDING: 15,
  MALFORMED_HISTORY: 16,
  UNSAFE: 20,
};

export const STATUS = {
  HEALTHY: "healthy",
  PENDING: "pending",
  MISSING_HISTORY: "missing_history",
  CHECKSUM_MISMATCH: "checksum_mismatch",
  APPLIED_MISSING_LOCALLY: "applied_migration_missing_locally",
  FAILED_MIGRATION: "failed_migration",
  ROLLED_BACK_UNRESOLVED: "rolled_back_unresolved",
  DUPLICATE_OR_MALFORMED: "duplicate_or_malformed_history",
  CONNECTION_FAILURE: "connection_failure",
  TARGET_UNIDENTIFIED: "target_unidentified",
};

/**
 * List repository migration directories that contain migration.sql
 */
export function listRepositoryMigrations(migrationsDir) {
  if (!fs.existsSync(migrationsDir)) {
    return [];
  }
  const entries = fs.readdirSync(migrationsDir, { withFileTypes: true });
  const names = [];
  for (const ent of entries) {
    if (!ent.isDirectory()) continue;
    if (ent.name.startsWith(".")) continue;
    const sqlPath = path.join(migrationsDir, ent.name, "migration.sql");
    if (fs.existsSync(sqlPath)) names.push(ent.name);
  }
  names.sort();
  return names;
}

export function readMigrationSql(migrationsDir, name) {
  const sqlPath = path.join(migrationsDir, name, "migration.sql");
  return fs.readFileSync(sqlPath, "utf8");
}

function classifyPrimaryStatus(issues) {
  const order = [
    STATUS.TARGET_UNIDENTIFIED,
    STATUS.CONNECTION_FAILURE,
    STATUS.MISSING_HISTORY,
    STATUS.FAILED_MIGRATION,
    STATUS.ROLLED_BACK_UNRESOLVED,
    STATUS.CHECKSUM_MISMATCH,
    STATUS.APPLIED_MISSING_LOCALLY,
    STATUS.DUPLICATE_OR_MALFORMED,
    STATUS.PENDING,
  ];
  for (const s of order) {
    if (issues.some((i) => i.code === s)) return s;
  }
  return STATUS.HEALTHY;
}

function exitCodeForStatus(status) {
  switch (status) {
    case STATUS.HEALTHY:
      return EXIT.HEALTHY;
    case STATUS.TARGET_UNIDENTIFIED:
      return EXIT.USAGE;
    case STATUS.CONNECTION_FAILURE:
      return EXIT.CONNECTION;
    case STATUS.MISSING_HISTORY:
      return EXIT.MISSING_HISTORY;
    case STATUS.CHECKSUM_MISMATCH:
      return EXIT.CHECKSUM_MISMATCH;
    case STATUS.APPLIED_MISSING_LOCALLY:
      return EXIT.APPLIED_MISSING_LOCALLY;
    case STATUS.FAILED_MIGRATION:
      return EXIT.FAILED_MIGRATION;
    case STATUS.ROLLED_BACK_UNRESOLVED:
      return EXIT.ROLLED_BACK_UNRESOLVED;
    case STATUS.PENDING:
      return EXIT.PENDING;
    case STATUS.DUPLICATE_OR_MALFORMED:
      return EXIT.MALFORMED_HISTORY;
    default:
      return EXIT.UNSAFE;
  }
}

/**
 * @param {object} options
 * @param {string} options.databaseUrl
 * @param {string} options.migrationsDir
 * @param {boolean} [options.failOnPending=true]
 * @param {import('@prisma/client').PrismaClient} [options.prisma]
 */
export async function verifyMigrationIntegrity(options) {
  const {
    databaseUrl,
    migrationsDir,
    failOnPending = true,
    prisma: externalPrisma,
  } = options;

  const masked = maskDatabaseUrl(databaseUrl);
  const issues = [];
  const warnings = [];

  if (!databaseUrl || !String(databaseUrl).trim()) {
    return buildResult({
      status: STATUS.TARGET_UNIDENTIFIED,
      ok: false,
      maskedTarget: masked,
      issues: [
        {
          code: STATUS.TARGET_UNIDENTIFIED,
          message:
            "Database target unidentified. Pass --database-url or set DATABASE_URL / SCRIPTCHECK_VERIFY_DATABASE_URL.",
        },
      ],
      warnings,
      migrationsDir,
      repositoryMigrations: [],
      historyRows: [],
      pending: [],
      applied: [],
    });
  }

  if (!migrationsDir || !fs.existsSync(migrationsDir)) {
    issues.push({
      code: STATUS.APPLIED_MISSING_LOCALLY,
      message: `Migrations directory not found: ${migrationsDir || "(unset)"}`,
    });
  }

  const repoNames = migrationsDir && fs.existsSync(migrationsDir)
    ? listRepositoryMigrations(migrationsDir)
    : [];
  const repoSet = new Set(repoNames);

  // Detect duplicate folder names (filesystem cannot have duplicates; check empty sql dirs separately)
  const nameCounts = new Map();
  for (const n of repoNames) nameCounts.set(n, (nameCounts.get(n) || 0) + 1);

  let prisma = externalPrisma;
  let ownsPrisma = false;
  let historyRows = [];

  try {
    if (!prisma) {
      prisma = new PrismaClient({
        datasources: { db: { url: databaseUrl } },
        log: ["error"],
      });
      ownsPrisma = true;
    }

    // Probe connection
    await prisma.$queryRaw`SELECT 1`;

    const tableCheck = await prisma.$queryRaw`
      SELECT EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name = '_prisma_migrations'
      ) AS "exists"
    `;
    const hasTable = Boolean(tableCheck?.[0]?.exists);
    if (!hasTable) {
      issues.push({
        code: STATUS.MISSING_HISTORY,
        message:
          "Table _prisma_migrations does not exist. Baselining is required before migrate deploy. Do not run migrate deploy automatically.",
      });
      return buildResult({
        status: STATUS.MISSING_HISTORY,
        ok: false,
        maskedTarget: masked,
        issues,
        warnings,
        migrationsDir,
        repositoryMigrations: repoNames,
        historyRows: [],
        pending: repoNames,
        applied: [],
      });
    }

    historyRows = await prisma.$queryRaw`
      SELECT
        id,
        checksum,
        finished_at AS "finishedAt",
        migration_name AS "migrationName",
        logs,
        rolled_back_at AS "rolledBackAt",
        started_at AS "startedAt",
        applied_steps_count AS "appliedStepsCount"
      FROM "_prisma_migrations"
      ORDER BY started_at ASC, migration_name ASC
    `;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    issues.push({
      code: STATUS.CONNECTION_FAILURE,
      message: `Database connection or query failed: ${message}`,
    });
    return buildResult({
      status: STATUS.CONNECTION_FAILURE,
      ok: false,
      maskedTarget: masked,
      issues,
      warnings,
      migrationsDir,
      repositoryMigrations: repoNames,
      historyRows: [],
      pending: [],
      applied: [],
    });
  } finally {
    if (ownsPrisma && prisma) {
      await prisma.$disconnect().catch(() => {});
    }
  }

  const successfulByName = new Map();
  const rowsByName = new Map();

  for (const row of historyRows) {
    const name = row.migrationName;
    if (!rowsByName.has(name)) rowsByName.set(name, []);
    rowsByName.get(name).push(row);

    const failed =
      row.finishedAt == null && row.rolledBackAt == null;
    if (failed) {
      issues.push({
        code: STATUS.FAILED_MIGRATION,
        migration: name,
        message: `Failed or incomplete migration "${name}" (started_at set, finished_at and rolled_back_at null)`,
      });
    }

    if (row.rolledBackAt != null && row.finishedAt == null) {
      // rolled back — wait until we know if a later successful apply exists
    }

    if (row.finishedAt != null && row.rolledBackAt == null) {
      if (successfulByName.has(name)) {
        issues.push({
          code: STATUS.DUPLICATE_OR_MALFORMED,
          migration: name,
          message: `Duplicate successful apply recorded for "${name}"`,
        });
      } else {
        successfulByName.set(name, row);
      }
    }
  }

  for (const [name, rows] of rowsByName) {
    const hasSuccess = successfulByName.has(name);
    const rolledOnly = rows.some((r) => r.rolledBackAt != null) && !hasSuccess;
    if (rolledOnly) {
      issues.push({
        code: STATUS.ROLLED_BACK_UNRESOLVED,
        migration: name,
        message: `Migration "${name}" is rolled back with no successful re-apply`,
      });
    }
  }

  const applied = [...successfulByName.keys()].sort();
  const pending = repoNames.filter((n) => !successfulByName.has(n));

  for (const [name, row] of successfulByName) {
    if (!repoSet.has(name)) {
      issues.push({
        code: STATUS.APPLIED_MISSING_LOCALLY,
        migration: name,
        message: `Applied migration "${name}" is missing from the repository migrations directory`,
      });
      continue;
    }

    const sqlPath = path.join(migrationsDir, name, "migration.sql");
    if (!fs.existsSync(sqlPath)) {
      issues.push({
        code: STATUS.APPLIED_MISSING_LOCALLY,
        migration: name,
        message: `migration.sql missing for applied migration "${name}"`,
      });
      continue;
    }

    const script = fs.readFileSync(sqlPath, "utf8");
    const expected = renderChecksum(script);
    if (!scriptMatchesChecksum(script, row.checksum)) {
      issues.push({
        code: STATUS.CHECKSUM_MISMATCH,
        migration: name,
        message: `Checksum mismatch for "${name}"`,
        expected,
        recorded: row.checksum,
      });
    }

    // Also check non-success history rows for same name (Prisma may still compare)
    for (const hist of rowsByName.get(name) || []) {
      if (hist === row) continue;
      if (hist.checksum && !scriptMatchesChecksum(script, hist.checksum)) {
        warnings.push({
          code: "historical_checksum_differs",
          migration: name,
          message: `Historical row for "${name}" has a different checksum (id=${hist.id})`,
        });
      }
    }
  }

  if (pending.length > 0) {
    const issue = {
      code: STATUS.PENDING,
      message: `Pending repository migrations not applied: ${pending.join(", ")}`,
      migrations: pending,
    };
    if (failOnPending) {
      issues.push(issue);
    } else {
      warnings.push(issue);
    }
  }

  // Ordering: repository lexical/timestamp order vs successful apply started_at order
  const appliedOrder = applied;
  const expectedOrder = repoNames.filter((n) => successfulByName.has(n));
  if (appliedOrder.join("\0") !== expectedOrder.join("\0")) {
    // Compare by started_at sequence
    const byStart = [...successfulByName.values()].sort(
      (a, b) => new Date(a.startedAt) - new Date(b.startedAt)
    );
    const startNames = byStart.map((r) => r.migrationName);
    if (startNames.join("\0") !== expectedOrder.join("\0")) {
      warnings.push({
        code: "ordering_anomaly",
        message: `Applied migration start order [${startNames.join(", ")}] differs from repository order [${expectedOrder.join(", ")}]`,
      });
    }
  }

  const status = classifyPrimaryStatus(issues);
  const ok = status === STATUS.HEALTHY && issues.length === 0;

  return buildResult({
    status: ok ? STATUS.HEALTHY : status,
    ok,
    maskedTarget: masked,
    issues,
    warnings,
    migrationsDir,
    repositoryMigrations: repoNames,
    historyRows: historyRows.map((r) => ({
      id: r.id,
      migrationName: r.migrationName,
      checksum: r.checksum,
      finishedAt: r.finishedAt,
      rolledBackAt: r.rolledBackAt,
      startedAt: r.startedAt,
    })),
    pending,
    applied,
  });
}

function buildResult(partial) {
  const status = partial.status;
  return {
    ...partial,
    exitCode: exitCodeForStatus(status === STATUS.HEALTHY && partial.ok ? STATUS.HEALTHY : status),
    checkedAt: new Date().toISOString(),
    readOnly: true,
  };
}

export function formatHumanReport(result) {
  const lines = [];
  lines.push(`Migration integrity: ${result.ok ? "HEALTHY" : "BLOCKED"} (${result.status})`);
  lines.push(`Target: ${result.maskedTarget}`);
  lines.push(`Repository migrations: ${result.repositoryMigrations.length}`);
  lines.push(`Applied (successful): ${result.applied.length}`);
  lines.push(`Pending: ${result.pending.length}${result.pending.length ? ` [${result.pending.join(", ")}]` : ""}`);
  if (result.issues.length) {
    lines.push("Issues:");
    for (const issue of result.issues) {
      lines.push(`  - [${issue.code}] ${issue.message}`);
    }
  }
  if (result.warnings.length) {
    lines.push("Warnings:");
    for (const w of result.warnings) {
      lines.push(`  - [${w.code}] ${w.message}`);
    }
  }
  if (!result.ok && result.status === STATUS.MISSING_HISTORY) {
    lines.push(
      "Action: complete a reviewed baselining phase. Do not run prisma migrate deploy automatically from application startup."
    );
  }
  if (!result.ok && result.status === STATUS.PENDING) {
    lines.push(
      "Action: an authorised deployment step must run reviewed migrations (prisma migrate deploy) before the application starts."
    );
  }
  if (!result.ok && result.status === STATUS.CHECKSUM_MISMATCH) {
    lines.push(
      "Action: restore the original migration.sql or investigate history corruption. Do not bypass with db push."
    );
  }
  return lines.join("\n");
}
