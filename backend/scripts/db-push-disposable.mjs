#!/usr/bin/env node
/**
 * Manual-only schema sync for disposable local databases.
 *
 * NOT a deployment mechanism. Never called by application startup, CI deploy, or beta bootstrap.
 *
 * Requires:
 *   DISPOSABLE_DB_ACK=I_UNDERSTAND_THIS_IS_DISPOSABLE
 *   DATABASE_URL pointing at a local disposable database
 *
 * Does NOT pass --accept-data-loss by default.
 * Optional: ALLOW_DATA_LOSS=1 to add --accept-data-loss (still blocked for unsafe targets).
 */

import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  assertDisposableTargetOrThrow,
  maskDatabaseUrl,
} from "./lib/databaseTargetGuards.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.resolve(__dirname, "..");

function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("Refusing: DATABASE_URL is required.");
    process.exit(2);
  }

  try {
    assertDisposableTargetOrThrow(databaseUrl, {
      acknowledgement: process.env.DISPOSABLE_DB_ACK || "",
    });
  } catch (err) {
    console.error(err instanceof Error ? err.message : err);
    process.exit(20);
  }

  const args = ["prisma", "db", "push", "--skip-generate"];
  if (process.env.ALLOW_DATA_LOSS === "1") {
    console.warn("WARNING: ALLOW_DATA_LOSS=1 — adding --accept-data-loss");
    args.push("--accept-data-loss");
  }

  console.log(`db:push:disposable → ${maskDatabaseUrl(databaseUrl)}`);
  console.log("This is NOT a deployment path. Prefer prisma migrate for reviewed environments.");

  const result = spawnSync("npx", args, {
    cwd: backendRoot,
    env: process.env,
    stdio: "inherit",
  });

  process.exit(result.status ?? 1);
}

main();
