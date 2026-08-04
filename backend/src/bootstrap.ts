import { execFileSync } from "child_process";
import path from "path";
import { getAppEnvironment } from "./config/env";
import { seedCurriculumCatalog } from "./seed/seedCurriculum";
import { seedBetaTestData } from "./seed/seedBetaTestData";

/**
 * Beta startup contract (Phase 1H):
 * 1. Never mutate schema from startup (no prisma db sync / push helpers).
 * 2. Never baseline, resolve, or migrate from application startup.
 * 3. Run the independent migration-integrity verifier (read-only).
 * 4. Refuse startup on missing history, checksum mismatch, failed migrations,
 *    missing applied files, or pending migrations.
 * 5. Only then seed curriculum / beta test users (data, not schema).
 */
export async function bootstrapOnStartup(): Promise<void> {
  if (getAppEnvironment() !== "beta") return;

  const backendRoot = path.join(__dirname, "..");
  const verifier = path.join(backendRoot, "scripts", "verify-migration-integrity.mjs");

  console.log("[bootstrap] Beta environment — verifying migration integrity (read-only)…");

  try {
    execFileSync(process.execPath, [verifier], {
      cwd: backendRoot,
      env: process.env,
      stdio: "inherit",
    });
  } catch (err) {
    console.error(
      "[bootstrap] Migration integrity check failed. Refusing to start.\n" +
        "An authorised deployment step must apply reviewed migrations before beta starts.\n" +
        "Do not sync schema from application startup. Do not auto-baseline from startup."
    );
    throw err;
  }

  console.log("[bootstrap] Migration integrity OK — seeding curriculum catalog and beta test users…");
  await seedCurriculumCatalog();
  await seedBetaTestData();
  console.log("[bootstrap] Beta bootstrap complete");
}
