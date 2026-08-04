#!/usr/bin/env node
/**
 * Pre-deployment release readiness gate (read-only).
 *
 * Combines target identification, migration history presence, independent
 * checksum verification, failed/pending reporting, and prisma validate.
 *
 * Does NOT: migrate deploy, migrate resolve, baseline, db push, or generate SQL.
 */

import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  verifyMigrationIntegrity,
  formatHumanReport,
  EXIT,
} from "./lib/migrationIntegrity.mjs";
import { maskDatabaseUrl, parseDatabaseUrl } from "./lib/databaseTargetGuards.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.resolve(__dirname, "..");
const defaultMigrationsDir = path.join(backendRoot, "prisma", "migrations");

function parseArgs(argv) {
  const opts = {
    json: false,
    allowPending: false,
    databaseUrl: null,
    skipPrismaValidate: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--json") opts.json = true;
    else if (a === "--allow-pending") opts.allowPending = true;
    else if (a === "--database-url") opts.databaseUrl = argv[++i];
    else if (a === "--skip-prisma-validate") opts.skipPrismaValidate = true;
    else if (a === "--help" || a === "-h") opts.help = true;
    else {
      console.error(`Unknown argument: ${a}`);
      process.exit(EXIT.USAGE);
    }
  }
  return opts;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) {
    console.log("verify-database-release-readiness.mjs — read-only release gate");
    process.exit(0);
  }

  const databaseUrl =
    opts.databaseUrl ||
    process.env.SCRIPTCHECK_VERIFY_DATABASE_URL ||
    process.env.DATABASE_URL ||
    null;

  if (!databaseUrl) {
    console.error("Refusing: database target unidentified.");
    process.exit(EXIT.USAGE);
  }

  let parsed = null;
  try {
    parsed = parseDatabaseUrl(databaseUrl);
  } catch {
    console.error("Refusing: DATABASE_URL is not a valid URL.");
    process.exit(EXIT.USAGE);
  }

  const integrity = await verifyMigrationIntegrity({
    databaseUrl,
    migrationsDir: defaultMigrationsDir,
    failOnPending: !opts.allowPending,
  });

  let prismaValidate = { ok: null, output: null };
  if (!opts.skipPrismaValidate) {
    try {
      const output = execFileSync("npx", ["prisma", "validate"], {
        cwd: backendRoot,
        encoding: "utf8",
        env: process.env,
      });
      prismaValidate = { ok: true, output: output.trim() };
    } catch (err) {
      prismaValidate = {
        ok: false,
        output: err instanceof Error ? String(err.stdout || err.message) : String(err),
      };
    }
  }

  const gate = {
    readOnly: true,
    writesPerformed: false,
    maskedTarget: maskDatabaseUrl(databaseUrl),
    target: {
      hostname: parsed.hostname,
      database: parsed.database,
      port: parsed.port,
    },
    integrity,
    prismaValidate,
    ok: integrity.ok && (prismaValidate.ok === null || prismaValidate.ok === true),
    checkedAt: new Date().toISOString(),
    note:
      "Phase 1H gate does not authorise production migration or baselining. Pending migrations require an authorised, separate deploy step.",
  };

  if (opts.json) {
    console.log(JSON.stringify(gate, null, 2));
  } else {
    console.log("=== Database release readiness (read-only) ===");
    console.log(`Target: ${gate.maskedTarget}`);
    console.log(`Host/DB: ${gate.target.hostname} / ${gate.target.database}`);
    console.log(formatHumanReport(integrity));
    if (prismaValidate.ok === true) console.log("prisma validate: OK");
    if (prismaValidate.ok === false) console.log("prisma validate: FAIL\n" + prismaValidate.output);
    console.log(gate.ok ? "GATE: PASS" : "GATE: BLOCKED");
    console.log(gate.note);
  }

  if (!gate.ok) {
    process.exit(integrity.ok ? EXIT.UNSAFE : integrity.exitCode);
  }
  process.exit(EXIT.HEALTHY);
}

main().catch((err) => {
  console.error("Release gate crashed:", err instanceof Error ? err.message : err);
  process.exit(EXIT.UNSAFE);
});
