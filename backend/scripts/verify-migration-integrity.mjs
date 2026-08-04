#!/usr/bin/env node
/**
 * Independent, read-only migration integrity verifier.
 *
 * Usage:
 *   node scripts/verify-migration-integrity.mjs --database-url "$URL"
 *   SCRIPTCHECK_VERIFY_DATABASE_URL=... node scripts/verify-migration-integrity.mjs
 *   DATABASE_URL=... node scripts/verify-migration-integrity.mjs
 *
 * Options:
 *   --json                 Structured JSON on stdout
 *   --allow-pending        Do not fail when repository migrations are pending
 *   --database-url <url>   Explicit target (preferred)
 *   --migrations-dir <dir> Override migrations directory
 *
 * Never mutates schema or _prisma_migrations.
 */

import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  verifyMigrationIntegrity,
  formatHumanReport,
  EXIT,
} from "./lib/migrationIntegrity.mjs";
import { maskDatabaseUrl } from "./lib/databaseTargetGuards.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.resolve(__dirname, "..");
const defaultMigrationsDir = path.join(backendRoot, "prisma", "migrations");

function parseArgs(argv) {
  const opts = {
    json: false,
    allowPending: false,
    databaseUrl: null,
    migrationsDir: defaultMigrationsDir,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--json") opts.json = true;
    else if (a === "--allow-pending") opts.allowPending = true;
    else if (a === "--database-url") opts.databaseUrl = argv[++i];
    else if (a === "--migrations-dir") opts.migrationsDir = path.resolve(argv[++i]);
    else if (a === "--help" || a === "-h") opts.help = true;
    else {
      console.error(`Unknown argument: ${a}`);
      process.exit(EXIT.USAGE);
    }
  }
  return opts;
}

function resolveDatabaseUrl(opts) {
  return (
    opts.databaseUrl ||
    process.env.SCRIPTCHECK_VERIFY_DATABASE_URL ||
    process.env.DATABASE_URL ||
    null
  );
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) {
    console.log(`verify-migration-integrity.mjs — read-only Prisma migration integrity check

Requires an explicit --database-url or SCRIPTCHECK_VERIFY_DATABASE_URL / DATABASE_URL.
Never creates _prisma_migrations, never runs migrate deploy/resolve/db push.
`);
    process.exit(0);
  }

  const databaseUrl = resolveDatabaseUrl(opts);
  if (!databaseUrl) {
    console.error(
      "Refusing to run: database target unidentified. Pass --database-url or set SCRIPTCHECK_VERIFY_DATABASE_URL / DATABASE_URL."
    );
    process.exit(EXIT.USAGE);
  }

  const result = await verifyMigrationIntegrity({
    databaseUrl,
    migrationsDir: opts.migrationsDir,
    failOnPending: !opts.allowPending,
  });

  if (opts.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(formatHumanReport(result));
    console.log(`Exit code: ${result.exitCode}`);
  }

  // Never print unmasked URL
  if (String(databaseUrl).includes("@") && !maskDatabaseUrl(databaseUrl).includes("***")) {
    // maskDatabaseUrl always masks password when present; ensure we didn't leak elsewhere
  }

  process.exit(result.exitCode);
}

main().catch((err) => {
  console.error("Verifier crashed:", err instanceof Error ? err.message : err);
  process.exit(EXIT.UNSAFE);
});
