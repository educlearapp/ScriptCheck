import { execSync } from "child_process";
import path from "path";
import { getAppEnvironment } from "./config/env";
import { seedCurriculumCatalog } from "./seed/seedCurriculum";
import { seedBetaTestData } from "./seed/seedBetaTestData";

/**
 * On beta deploy, ensure schema matches Prisma and beta test users exist.
 * Render does not run migrations or seed separately — this runs once at startup.
 */
export async function bootstrapOnStartup(): Promise<void> {
  if (getAppEnvironment() !== "beta") return;

  const backendRoot = path.join(__dirname, "..");
  console.log("[bootstrap] Beta environment — syncing database schema…");

  try {
    execSync("npx prisma db push --skip-generate --accept-data-loss", {
      cwd: backendRoot,
      stdio: "pipe",
    });
    console.log("[bootstrap] Schema synced");
  } catch (err) {
    console.error("[bootstrap] prisma db push failed:", err);
    throw err;
  }

  console.log("[bootstrap] Seeding curriculum catalog and beta test users…");
  await seedCurriculumCatalog();
  await seedBetaTestData();
  console.log("[bootstrap] Beta bootstrap complete");
}
