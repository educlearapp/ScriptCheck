/**
 * Deploy ScriptCheck beta to Render.
 *
 *   RENDER_API_KEY=... node scripts/deploy-beta-render.mjs
 *
 * Creates/updates scriptcheck-beta-backend + scriptcheck-beta-frontend env vars
 * and triggers deploys. Run `npm run build` locally first to verify.
 */
const SERVICES = {
  backend: "scriptcheck-beta-backend",
  frontend: "scriptcheck-beta-frontend",
};

const BETA_API_URL = process.env.BETA_API_URL || "https://api.beta.scriptcheck.co.za";
const RENDER_KEY = process.env.RENDER_API_KEY || "";

async function renderFetch(path, opts = {}) {
  const res = await fetch(`https://api.render.com/v1${path}`, {
    ...opts,
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${RENDER_KEY}`,
      "Content-Type": "application/json",
      ...(opts.headers || {}),
    },
  });
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!res.ok) {
    throw new Error(`Render ${path} ${res.status}: ${JSON.stringify(data).slice(0, 500)}`);
  }
  return data;
}

async function findServiceId(name) {
  let cursor = "";
  for (let page = 0; page < 20; page++) {
    const q = new URLSearchParams({ limit: "100", name });
    if (cursor) q.set("cursor", cursor);
    const data = await renderFetch(`/services?${q}`);
    const rows = Array.isArray(data) ? data : [];
    for (const row of rows) {
      const svc = row.service || row;
      if (svc?.name === name || svc?.slug === name) return svc.id;
    }
    cursor = data?.cursor || "";
    if (!cursor || rows.length === 0) break;
  }
  throw new Error(`Service not found: ${name}`);
}

async function patchEnv(serviceId, entries) {
  const env = await renderFetch(`/services/${serviceId}/env-vars`);
  const rows = Array.isArray(env) ? env : [];
  for (const [key, value] of Object.entries(entries)) {
    const existing = rows.find((r) => (r.envVar || r).key === key);
    const id = existing?.envVar?.id || existing?.id;
    if (id) {
      await renderFetch(`/services/${serviceId}/env-vars/${id}`, {
        method: "PUT",
        body: JSON.stringify({ value }),
      });
    } else {
      await renderFetch(`/services/${serviceId}/env-vars`, {
        method: "POST",
        body: JSON.stringify({ key, value }),
      });
    }
    console.log(`  env ${key} set`);
  }
}

async function triggerDeploy(serviceId, serviceName) {
  const deploy = await renderFetch(`/services/${serviceId}/deploys`, {
    method: "POST",
    body: JSON.stringify({ clearCache: true }),
  });
  const id = deploy.id || deploy.deploy?.id;
  console.log(`Deploy triggered for ${serviceName}: ${id || "ok"}`);
}

async function main() {
  if (!RENDER_KEY) {
    console.error("Set RENDER_API_KEY");
    process.exit(1);
  }

  const backendId = await findServiceId(SERVICES.backend);
  const frontendId = await findServiceId(SERVICES.frontend);

  console.log("Patching backend env…");
  await patchEnv(backendId, {
    APP_ENV: "beta",
    NODE_ENV: "production",
    CORS_ORIGINS: "https://beta.scriptcheck.co.za,https://beta.scriptcheck.educlear.co.za",
  });

  console.log("Patching frontend env…");
  await patchEnv(frontendId, {
    VITE_API_URL: BETA_API_URL,
    VITE_APP_ENV: "beta",
  });

  console.log("Triggering deploys…");
  await triggerDeploy(backendId, SERVICES.backend);
  await triggerDeploy(frontendId, SERVICES.frontend);

  console.log("\nBeta deployment triggered.");
  console.log(`Frontend: https://beta.scriptcheck.co.za (or Render URL)`);
  console.log(`API: ${BETA_API_URL}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
