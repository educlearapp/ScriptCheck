const DEFAULT_ORIGINS = [
  "http://localhost:5174",
  "http://localhost:5173",
  "http://127.0.0.1:5174",
];

const BETA_ORIGINS = [
  "https://beta.scriptcheck.co.za",
  "https://www.beta.scriptcheck.co.za",
  "https://beta.scriptcheck.educlear.co.za",
];

const PRODUCTION_ORIGINS = [
  "https://scriptcheck.co.za",
  "https://www.scriptcheck.co.za",
];

function parseExtraOrigins(): string[] {
  const raw = process.env.CORS_ORIGINS?.trim();
  if (!raw) return [];
  return raw
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);
}

export function getAllowedOrigins(): string[] {
  const env = (process.env.APP_ENV || process.env.NODE_ENV || "development").toLowerCase();
  const origins = new Set<string>([...DEFAULT_ORIGINS, ...parseExtraOrigins()]);

  if (env === "beta" || env === "production") {
    for (const o of BETA_ORIGINS) origins.add(o);
  }
  if (env === "production") {
    for (const o of PRODUCTION_ORIGINS) origins.add(o);
  }

  return [...origins];
}
