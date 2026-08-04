# Phase 1H — Startup / database path inventory

| File | Command / behaviour | Environment | Automatic? | Risk | Action taken |
|------|---------------------|-------------|------------|------|--------------|
| `backend/src/bootstrap.ts` | Was `prisma db push --accept-data-loss`; now integrity verifier + seed | `APP_ENV=beta` | Yes on beta start | Was critical | Replaced |
| `backend/src/index.ts` | Calls `bootstrapOnStartup()` then listen | All | Yes | Depends on bootstrap | Unchanged call site |
| `backend/package.json` `start` | `node dist/index.js` | Deploy/local | Manual/platform | Low (no schema mutate) | Kept |
| `backend/package.json` `start:beta` | integrity then start | Explicit beta | Manual | Low | Added |
| `backend/package.json` `db:push` | Blocked helper | Dev | Manual | Was high | Blocked |
| `backend/package.json` `db:push:disposable` | Guarded push | Local disposable | Manual | Medium if misused | Added with guards |
| `backend/package.json` `db:migrate:deploy` | `prisma migrate deploy` | Explicit | Manual | High if premature | Added; not wired to start |
| `backend/package.json` `db:verify-integrity` | Read-only verifier | Any identified URL | Manual/startup | None | Added |
| `backend/package.json` `db:release-gate` | Read-only gate | Any identified URL | Manual | None | Added |
| `backend/package.json` `db:generate` / `build` | `prisma generate` | Build | Build | None | Kept |
| `render.yaml` | `npm start` | Beta Render | Platform | Inherits bootstrap | No change needed (bootstrap fixed) |
| `Dockerfile.backend` | `node dist/index.js` | Container | Platform | Inherits bootstrap | Unchanged |
| `docker-compose.beta.yml` | Builds backend with `APP_ENV=beta` | Local beta compose | Compose | Inherits bootstrap | Unchanged |
| `scripts/deploy-beta-render.mjs` | Triggers Render deploy | Ops | Manual | Deploy only | Untouched |
| `README.md` | Setup docs previously said `db:push` | Docs | Manual | Misleading | Updated to disposable |
| Phase 1F/1G docs | Historical evidence of push/resolve | Docs | N/A | N/A | Left unchanged |

No GitHub Actions workflows found under `.github/`.
