/**
 * Defence-in-depth guards for mutating database helpers.
 * Name/host checks are not perfect security — safest default is refusal.
 */

const DEFAULT_FORBIDDEN_DB_NAMES = new Set([
  "scriptcheck", // local working database
  "scriptcheck_prod",
  "scriptcheck_production",
  "production",
  "prod",
]);

const DEFAULT_FORBIDDEN_HOST_MARKERS = [
  "render.com",
  "amazonaws.com",
  "rds.amazonaws.com",
  "neon.tech",
  "supabase.co",
  "azure.com",
  "digitalocean.com",
  "scriptcheck.co.za",
];

const DEFAULT_FORBIDDEN_URL_MARKERS = [
  "production",
  "prod-",
  "-prod",
  "scriptcheck-prod",
  "scriptcheck_prod",
];

/**
 * Mask credentials in a DATABASE_URL for logs.
 * postgresql://user:pass@host:5432/db → postgresql://user:***@host:5432/db
 */
export function maskDatabaseUrl(url) {
  if (!url || typeof url !== "string") return "(unset)";
  try {
    const u = new URL(url);
    if (u.password) u.password = "***";
    return u.toString();
  } catch {
    return url.replace(/:([^:@/]+)@/, ":***@");
  }
}

export function parseDatabaseUrl(url) {
  const u = new URL(url);
  const database = (u.pathname || "/").replace(/^\//, "").split("?")[0];
  return {
    protocol: u.protocol,
    hostname: u.hostname,
    port: u.port || null,
    database,
    username: decodeURIComponent(u.username || ""),
  };
}

/**
 * Evaluate whether a target is allowed for a mutating disposable helper.
 * @returns {{ ok: boolean, reasons: string[] }}
 */
export function evaluateDisposableTarget(url, options = {}) {
  const reasons = [];
  if (!url || typeof url !== "string" || !url.trim()) {
    return { ok: false, reasons: ["DATABASE_URL is missing or empty"] };
  }

  let parsed;
  try {
    parsed = parseDatabaseUrl(url);
  } catch {
    return { ok: false, reasons: ["DATABASE_URL is not a valid URL"] };
  }

  const host = (parsed.hostname || "").toLowerCase();
  const dbName = (parsed.database || "").toLowerCase();
  const urlLower = url.toLowerCase();

  const forbiddenNames = new Set([
    ...DEFAULT_FORBIDDEN_DB_NAMES,
    ...(options.extraForbiddenDbNames || []),
  ]);
  const forbiddenHosts = [
    ...DEFAULT_FORBIDDEN_HOST_MARKERS,
    ...(options.extraForbiddenHostMarkers || []),
  ];
  const forbiddenMarkers = [
    ...DEFAULT_FORBIDDEN_URL_MARKERS,
    ...(options.extraForbiddenUrlMarkers || []),
  ];

  if (options.requireLocalhost !== false) {
    if (host !== "localhost" && host !== "127.0.0.1" && host !== "::1") {
      reasons.push(`host "${host}" is not localhost (disposable helper requires local only)`);
    }
  }

  if (forbiddenNames.has(dbName)) {
    reasons.push(`database name "${dbName}" is forbidden (working/production marker)`);
  }

  if (!dbName.startsWith("scriptcheck_phase") && !dbName.includes("disposable") && !dbName.includes("_tmp") && !dbName.includes("sandbox")) {
    // Soft rule: prefer disposable naming; still require acknowledgement for other local names
    if (!options.allowNonDisposableName) {
      reasons.push(
        `database name "${dbName}" does not look disposable (expected scriptcheck_phase*, *disposable*, *sandbox*, or *_tmp*)`
      );
    }
  }

  for (const marker of forbiddenHosts) {
    if (host.includes(marker.toLowerCase())) {
      reasons.push(`host contains production/provider marker "${marker}"`);
    }
  }

  for (const marker of forbiddenMarkers) {
    if (urlLower.includes(marker.toLowerCase())) {
      reasons.push(`URL contains production marker "${marker}"`);
    }
  }

  const ack = options.acknowledgement || "";
  if (ack !== "I_UNDERSTAND_THIS_IS_DISPOSABLE") {
    reasons.push(
      'missing acknowledgement: set DISPOSABLE_DB_ACK=I_UNDERSTAND_THIS_IS_DISPOSABLE'
    );
  }

  return { ok: reasons.length === 0, reasons, parsed };
}

export function assertDisposableTargetOrThrow(url, options = {}) {
  const result = evaluateDisposableTarget(url, options);
  if (!result.ok) {
    const err = new Error(
      `Refusing mutating database helper for ${maskDatabaseUrl(url)}:\n- ${result.reasons.join("\n- ")}`
    );
    err.code = "UNSAFE_DATABASE_TARGET";
    err.reasons = result.reasons;
    throw err;
  }
  return result;
}
