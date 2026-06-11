export type AppEnvironment = "development" | "beta" | "production";

export function getAppEnvironment(): AppEnvironment {
  const raw = (process.env.APP_ENV || process.env.NODE_ENV || "development").toLowerCase();
  if (raw === "beta" || raw === "production") return raw;
  return "development";
}

export function isProductionLike(): boolean {
  const env = getAppEnvironment();
  return env === "beta" || env === "production";
}
