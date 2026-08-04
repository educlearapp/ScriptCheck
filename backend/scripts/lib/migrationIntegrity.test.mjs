import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync, spawnSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";
import {
  renderChecksum,
  scriptMatchesChecksum,
} from "./migrationChecksum.mjs";
import {
  verifyMigrationIntegrity,
  STATUS,
  EXIT,
} from "./migrationIntegrity.mjs";
import {
  evaluateDisposableTarget,
  maskDatabaseUrl,
} from "./databaseTargetGuards.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.resolve(__dirname, "../..");
const repoMigrations = path.join(backendRoot, "prisma", "migrations");

const SANDBOX_A =
  process.env.PHASE1H_DB_A ||
  "postgresql://dasilvaacademy@localhost:5432/scriptcheck_phase1h_a?schema=public";
const SANDBOX_B =
  process.env.PHASE1H_DB_B ||
  "postgresql://dasilvaacademy@localhost:5432/scriptcheck_phase1h_b?schema=public";
const SANDBOX_C =
  process.env.PHASE1H_DB_C ||
  "postgresql://dasilvaacademy@localhost:5432/scriptcheck_phase1h_c?schema=public";

const ACK = { DISPOSABLE_DB_ACK: "I_UNDERSTAND_THIS_IS_DISPOSABLE" };

function sha256File(filePath) {
  return createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

async function resetSandbox(url) {
  const prisma = new PrismaClient({ datasources: { db: { url } } });
  try {
    await prisma.$executeRawUnsafe(`DROP SCHEMA IF EXISTS public CASCADE`);
    await prisma.$executeRawUnsafe(`CREATE SCHEMA public`);
    await prisma.$executeRawUnsafe(`GRANT ALL ON SCHEMA public TO PUBLIC`);
  } finally {
    await prisma.$disconnect();
  }
}

function pushDisposable(url) {
  const r = spawnSync(
    process.execPath,
    [path.join(backendRoot, "scripts/db-push-disposable.mjs")],
    {
      cwd: backendRoot,
      env: { ...process.env, DATABASE_URL: url, ...ACK },
      encoding: "utf8",
    }
  );
  if (r.status !== 0) {
    throw new Error(`db-push-disposable failed: ${r.stderr || r.stdout}`);
  }
}

function resolveApplied(url, name) {
  execFileSync(
    "npx",
    ["prisma", "migrate", "resolve", "--applied", name],
    {
      cwd: backendRoot,
      env: { ...process.env, DATABASE_URL: url },
      stdio: "pipe",
    }
  );
}

const CORE_MIGRATIONS = [
  "20250612120000_timetable_foundation",
  "20250612140000_lesson_timetable_builder",
  "20260804122500_add_script_teacher_review_fields",
];

async function prepareHealthy(url) {
  await resetSandbox(url);
  pushDisposable(url);
  for (const m of CORE_MIGRATIONS) resolveApplied(url, m);
}

describe("migrationChecksum (Prisma 5.22 contract)", () => {
  it("matches Prisma hello fixture from engines checksum.rs", () => {
    assert.equal(
      renderChecksum("hello"),
      "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824"
    );
  });

  it("matches repository migration.sql SHA-256", () => {
    for (const name of CORE_MIGRATIONS) {
      const file = path.join(repoMigrations, name, "migration.sql");
      const text = fs.readFileSync(file, "utf8");
      assert.equal(renderChecksum(text), sha256File(file));
    }
  });

  it("accepts CRLF/LF equivalent scripts", () => {
    const unix = "SELECT 1;\nSELECT 2;\n";
    const win = "SELECT 1;\r\nSELECT 2;\r\n";
    const checksum = renderChecksum(unix);
    assert.equal(scriptMatchesChecksum(win, checksum), true);
  });
});

describe("credential masking", () => {
  it("never prints passwords", () => {
    const masked = maskDatabaseUrl(
      "postgresql://user:s3cret-pass@localhost:5432/scriptcheck_phase1h_a"
    );
    assert.equal(masked.includes("s3cret-pass"), false);
    assert.equal(masked.includes("***"), true);
  });
});

describe("disposable target guards", () => {
  it("refuses working database name", () => {
    const r = evaluateDisposableTarget(
      "postgresql://u@localhost:5432/scriptcheck?schema=public",
      { acknowledgement: ACK.DISPOSABLE_DB_ACK }
    );
    assert.equal(r.ok, false);
    assert.ok(r.reasons.some((x) => x.includes("forbidden")));
  });

  it("requires acknowledgement", () => {
    const r = evaluateDisposableTarget(SANDBOX_A, { acknowledgement: "" });
    assert.equal(r.ok, false);
  });

  it("allows acknowledged local disposable name", () => {
    const r = evaluateDisposableTarget(SANDBOX_A, {
      acknowledgement: ACK.DISPOSABLE_DB_ACK,
    });
    assert.equal(r.ok, true);
  });

  it("refuses remote hosts", () => {
    const r = evaluateDisposableTarget(
      "postgresql://u:p@db.example.render.com:5432/scriptcheck_phase1h_a",
      { acknowledgement: ACK.DISPOSABLE_DB_ACK }
    );
    assert.equal(r.ok, false);
  });
});

describe("verifyMigrationIntegrity (disposable DBs)", () => {
  it("detects missing _prisma_migrations without creating it", async () => {
    await resetSandbox(SANDBOX_C);
    const before = await tableExists(SANDBOX_C, "_prisma_migrations");
    assert.equal(before, false);
    const result = await verifyMigrationIntegrity({
      databaseUrl: SANDBOX_C,
      migrationsDir: repoMigrations,
    });
    assert.equal(result.status, STATUS.MISSING_HISTORY);
    assert.equal(result.ok, false);
    assert.equal(result.exitCode, EXIT.MISSING_HISTORY);
    const after = await tableExists(SANDBOX_C, "_prisma_migrations");
    assert.equal(after, false);
  });

  it("passes on healthy Prisma-applied history (multiple migrations)", async () => {
    await prepareHealthy(SANDBOX_A);
    const result = await verifyMigrationIntegrity({
      databaseUrl: SANDBOX_A,
      migrationsDir: repoMigrations,
    });
    assert.equal(result.ok, true, formatIssues(result));
    assert.equal(result.status, STATUS.HEALTHY);
    assert.equal(result.applied.length, 3);
    assert.equal(result.pending.length, 0);
    // Evidence: independent checksum equals Prisma-written checksum
    for (const row of result.historyRows) {
      if (!row.finishedAt || row.rolledBackAt) continue;
      const script = fs.readFileSync(
        path.join(repoMigrations, row.migrationName, "migration.sql"),
        "utf8"
      );
      assert.equal(row.checksum, renderChecksum(script));
    }
  });

  it("reports pending repository migration", async () => {
    await prepareHealthy(SANDBOX_A);
    const tmpMig = path.join(os.tmpdir(), `phase1h-pending-${Date.now()}`);
    fs.mkdirSync(path.join(tmpMig, "20990101000000_phase1h_pending_probe"), {
      recursive: true,
    });
    // Copy existing migrations + pending
    for (const name of CORE_MIGRATIONS) {
      const dest = path.join(tmpMig, name);
      fs.cpSync(path.join(repoMigrations, name), dest, { recursive: true });
    }
    fs.writeFileSync(
      path.join(tmpMig, "20990101000000_phase1h_pending_probe", "migration.sql"),
      "-- pending probe\nSELECT 1;\n"
    );

    const result = await verifyMigrationIntegrity({
      databaseUrl: SANDBOX_A,
      migrationsDir: tmpMig,
      failOnPending: true,
    });
    assert.equal(result.ok, false);
    assert.equal(result.status, STATUS.PENDING);
    assert.ok(result.pending.includes("20990101000000_phase1h_pending_probe"));
    fs.rmSync(tmpMig, { recursive: true, force: true });
  });

  it("detects checksum mismatch and recovers when file restored", async () => {
    await prepareHealthy(SANDBOX_B);
    const target = path.join(
      repoMigrations,
      "20260804122500_add_script_teacher_review_fields",
      "migration.sql"
    );
    const original = fs.readFileSync(target, "utf8");
    try {
      fs.writeFileSync(target, original + "\n-- corrupted by phase1h test\n");
      const bad = await verifyMigrationIntegrity({
        databaseUrl: SANDBOX_B,
        migrationsDir: repoMigrations,
      });
      assert.equal(bad.status, STATUS.CHECKSUM_MISMATCH);
      assert.equal(bad.ok, false);
    } finally {
      fs.writeFileSync(target, original);
    }
    const good = await verifyMigrationIntegrity({
      databaseUrl: SANDBOX_B,
      migrationsDir: repoMigrations,
    });
    assert.equal(good.ok, true, formatIssues(good));
  });

  it("detects applied migration directory missing locally", async () => {
    await prepareHealthy(SANDBOX_B);
    const tmpMig = path.join(os.tmpdir(), `phase1h-missing-${Date.now()}`);
    fs.mkdirSync(tmpMig, { recursive: true });
    // Only copy two of three
    for (const name of CORE_MIGRATIONS.slice(0, 2)) {
      fs.cpSync(path.join(repoMigrations, name), path.join(tmpMig, name), {
        recursive: true,
      });
    }
    const result = await verifyMigrationIntegrity({
      databaseUrl: SANDBOX_B,
      migrationsDir: tmpMig,
      failOnPending: false,
    });
    assert.equal(result.status, STATUS.APPLIED_MISSING_LOCALLY);
    assert.equal(result.ok, false);
    fs.rmSync(tmpMig, { recursive: true, force: true });
  });

  it("detects failed migration row", async () => {
    await prepareHealthy(SANDBOX_B);
    const prisma = new PrismaClient({ datasources: { db: { url: SANDBOX_B } } });
    try {
      await prisma.$executeRawUnsafe(`
        INSERT INTO "_prisma_migrations" (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count)
        VALUES (
          '00000000-0000-4000-8000-00000000fail',
          'deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef',
          NULL,
          '20990102000000_phase1h_failed_probe',
          'intentional failure',
          NULL,
          NOW(),
          0
        )
      `);
    } finally {
      await prisma.$disconnect();
    }
    const result = await verifyMigrationIntegrity({
      databaseUrl: SANDBOX_B,
      migrationsDir: repoMigrations,
      failOnPending: false,
    });
    assert.equal(result.status, STATUS.FAILED_MIGRATION);
    assert.equal(result.ok, false);
  });

  it("detects rolled-back without successful re-apply", async () => {
    await resetSandbox(SANDBOX_C);
    pushDisposable(SANDBOX_C);
    // Create history table by resolving one, then mark rolled back only
    resolveApplied(SANDBOX_C, CORE_MIGRATIONS[0]);
    const prisma = new PrismaClient({ datasources: { db: { url: SANDBOX_C } } });
    try {
      await prisma.$executeRawUnsafe(`
        UPDATE "_prisma_migrations"
        SET rolled_back_at = NOW(), finished_at = NULL
        WHERE migration_name = '${CORE_MIGRATIONS[0]}'
      `);
    } finally {
      await prisma.$disconnect();
    }
    const result = await verifyMigrationIntegrity({
      databaseUrl: SANDBOX_C,
      migrationsDir: repoMigrations,
      failOnPending: false,
    });
    assert.equal(result.status, STATUS.ROLLED_BACK_UNRESOLVED);
    assert.equal(result.ok, false);
  });

  it("detects applied migration present in history but absent from repository", async () => {
    await prepareHealthy(SANDBOX_A);
    const prisma = new PrismaClient({ datasources: { db: { url: SANDBOX_A } } });
    try {
      await prisma.$executeRawUnsafe(`
        INSERT INTO "_prisma_migrations" (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count)
        VALUES (
          '00000000-0000-4000-8000-00000000gone',
          '${renderChecksum("-- gone")}',
          NOW(),
          '20990103000000_phase1h_absent_from_repo',
          NULL,
          NULL,
          NOW(),
          1
        )
      `);
    } finally {
      await prisma.$disconnect();
    }
    const result = await verifyMigrationIntegrity({
      databaseUrl: SANDBOX_A,
      migrationsDir: repoMigrations,
      failOnPending: false,
    });
    assert.equal(result.status, STATUS.APPLIED_MISSING_LOCALLY);
    assert.equal(result.ok, false);
  });

  it("reports connection failure", async () => {
    const result = await verifyMigrationIntegrity({
      databaseUrl:
        "postgresql://nobody:wrong@127.0.0.1:1/does_not_exist_phase1h?schema=public",
      migrationsDir: repoMigrations,
    });
    assert.equal(result.status, STATUS.CONNECTION_FAILURE);
    assert.equal(result.ok, false);
  });

  it("refuses unidentified target", async () => {
    const result = await verifyMigrationIntegrity({
      databaseUrl: "",
      migrationsDir: repoMigrations,
    });
    assert.equal(result.status, STATUS.TARGET_UNIDENTIFIED);
    assert.equal(result.ok, false);
  });
});

describe("startup contract source guarantees", () => {
  it("bootstrap never invokes db push or accept-data-loss", () => {
    const src = fs.readFileSync(
      path.join(backendRoot, "src/bootstrap.ts"),
      "utf8"
    );
    assert.equal(/\bprisma\s+db\s+push\b/.test(src), false);
    assert.equal(/accept-data-loss/.test(src), false);
    assert.equal(/execSync\s*\(\s*["']npx prisma/.test(src), false);
    assert.equal(src.includes("verify-migration-integrity.mjs"), true);
  });

  it("start script does not mutate database", () => {
    const pkg = JSON.parse(
      fs.readFileSync(path.join(backendRoot, "package.json"), "utf8")
    );
    assert.equal(pkg.scripts.start, "node dist/index.js");
    assert.equal(pkg.scripts["db:push"].includes("db-push-blocked"), true);
    assert.ok(pkg.scripts["start:beta"].includes("verify-migration-integrity"));
  });
});

describe("release gate is read-only", () => {
  it("gate module performs no mutating prisma commands", () => {
    const src = fs.readFileSync(
      path.join(backendRoot, "scripts/verify-database-release-readiness.mjs"),
      "utf8"
    );
    assert.equal(/\bprisma\s+migrate\s+deploy\b/.test(src), false);
    assert.equal(/\bprisma\s+migrate\s+resolve\b/.test(src), false);
    assert.equal(/\bprisma\s+db\s+push\b/.test(src), false);
    assert.equal(src.includes("writesPerformed: false"), true);
    assert.equal(src.includes("prisma validate"), true);
  });
});

async function tableExists(url, name) {
  const prisma = new PrismaClient({ datasources: { db: { url } } });
  try {
    const rows = await prisma.$queryRaw`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = ${name}
      ) AS "exists"
    `;
    return Boolean(rows[0]?.exists);
  } finally {
    await prisma.$disconnect();
  }
}

function formatIssues(result) {
  return JSON.stringify(result.issues, null, 2);
}
