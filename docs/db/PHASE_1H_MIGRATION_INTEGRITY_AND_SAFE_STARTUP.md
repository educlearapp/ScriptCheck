# Phase 1H — Migration Integrity & Safe Beta Startup

**Status:** Local implementation complete — **not** a production migration or baselining authorisation  
**Branch:** `phase-1h-migration-integrity-safe-startup`  
**Starting SHA:** `9fe81822f99cae135fc9fd5a13cb05fd3803d095`  
**Date:** 2026-08-04  

**Verdict:** Phase 1H closes two Phase 1G blockers locally: (1) an independent migration checksum verifier that fails closed when Prisma 5.22 would not, and (2) removal of automatic `prisma db push --accept-data-loss` from beta startup.

**Explicit warning:** Phase 1H does **not** authorise production migration, production baselining, or any `migrate deploy` / `migrate resolve` against working or production databases.

---

## 1. Previous unsafe behaviour

| Path | Behaviour | Risk |
|------|-----------|------|
| `backend/src/bootstrap.ts` when `APP_ENV=beta` | `execSync("npx prisma db push --skip-generate --accept-data-loss")` then seed | Destructive schema sync on every beta boot; no migration history; can accept data loss |
| `backend/package.json` `db:push` | Unguarded `prisma db push` | Easy to point at wrong `DATABASE_URL` |
| Prisma 5.22 `migrate status` / `migrate deploy` | Does not reliably block when `_prisma_migrations.checksum` is corrupted (Phase 1G evidence) | Silent history corruption |

Render beta (`render.yaml`) uses `npm start` → `node dist/index.js` → `bootstrapOnStartup()` — so beta inherited the push path.

---

## 2. New startup contract

| Script | Mutates DB? | Role |
|--------|-------------|------|
| `npm start` / `start` | No schema mutation | App listen; beta runs integrity then seed only |
| `npm run start:beta` | No schema mutation | Explicit integrity gate then `node dist/index.js` |
| `db:verify-integrity` | Read-only | Independent checksum / history verifier |
| `db:release-gate` | Read-only | Pre-deploy readiness (integrity + `prisma validate`) |
| `db:migrate:deploy` | Yes (explicit) | Reviewed migration apply — **not** called from startup |
| `db:push` | Blocked | Prints guidance and exits 1 |
| `db:push:disposable` | Yes (manual) | Local disposable DBs only; requires acknowledgement |

### Beta bootstrap (`bootstrapOnStartup`)

1. If `APP_ENV !== "beta"` → return (development unchanged).
2. Run `scripts/verify-migration-integrity.mjs` (read-only).
3. On non-zero exit → refuse to listen.
4. On success → seed curriculum + beta users (data only).
5. Never push, never `--accept-data-loss`, never resolve/baseline/deploy.

### Pending-migration policy (preferred)

**Startup fails** with a clear message that an authorised deployment step must run reviewed migrations before the application starts. Silent continue is not allowed.

---

## 3. Checksum algorithm and evidence

Authoritative source: Prisma engines `schema-connector` `checksum.rs`:

- SHA-256 over the migration script as a UTF-8 string
- Lowercase zero-padded hex (64 characters)
- Matching also accepts CRLF↔LF variants and legacy non-zero-padded hex

Local proof: on disposable DBs, checksums written by Prisma 5.22 `migrate resolve --applied` equal:

```js
createHash("sha256").update(fs.readFileSync("migration.sql", "utf8")).digest("hex")
```

Engines fixture: `renderChecksum("hello")` =
`2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824`

---

## 4. Integrity verifier

**Script:** `backend/scripts/verify-migration-integrity.mjs`  
**Library:** `backend/scripts/lib/migrationIntegrity.mjs`

- Read-only; queries `_prisma_migrations` only; reads repository `migration.sql` files
- Requires identifiable `DATABASE_URL` / `SCRIPTCHECK_VERIFY_DATABASE_URL` / `--database-url`
- Masks credentials in output
- Does **not** create `_prisma_migrations` when missing
- Never recommends automatic `migrate deploy`

### Exit codes

| Code | Meaning |
|------|---------|
| 0 | Healthy (no blocking issues; no pending when pending fails closed) |
| 2 | Usage / target unidentified |
| 3 | Connection failure |
| 10 | Missing `_prisma_migrations` (baselining required) |
| 11 | Checksum mismatch |
| 12 | Applied migration missing locally |
| 13 | Failed / incomplete migration row |
| 14 | Rolled back without successful re-apply |
| 15 | Pending repository migrations |
| 16 | Duplicate / malformed history |
| 20 | Other unsafe |

`--allow-pending` demotes pending to a warning (release tooling only). Beta startup does **not** pass this flag.

---

## 5. Release gate

**Script:** `backend/scripts/verify-database-release-readiness.mjs`  
**npm:** `db:release-gate`

Combines target identification, integrity verification, pending/failed reporting, and `prisma validate`. Sets `writesPerformed: false`. Does not deploy, resolve, baseline, or push.

---

## 6. Manual migration procedure (authorised operators only)

1. Confirm target is intended (never assume).
2. Run `db:release-gate` against the target (read-only).
3. If missing history → stop; complete a **separately approved** baselining phase (Phase 1F/1G). Do not invent resolve steps here.
4. If pending and baselined → run **explicit** `db:migrate:deploy` as a separate command (not from app startup).
5. Re-run integrity verifier; confirm exit 0.
6. Start the application.

---

## 7. Disposable developer workflow

```bash
export DATABASE_URL='postgresql://USER@localhost:5432/scriptcheck_phase1h_a?schema=public'
export DISPOSABLE_DB_ACK=I_UNDERSTAND_THIS_IS_DISPOSABLE
npm run db:push:disposable --workspace=backend
```

Guards refuse:

- Non-localhost hosts
- Working DB name `scriptcheck`
- Production/provider host markers
- Missing acknowledgement
- Non-disposable-looking names (unless overridden)

`--accept-data-loss` only if `ALLOW_DATA_LOSS=1` is set explicitly. Prefer migrations for reviewed environments.

---

## 8. Production-target guards

Defence in depth only — **not** perfect security. Safest default is refusal. See `databaseTargetGuards.mjs`.

---

## 9. Recovery guidance

| Symptom | Action |
|---------|--------|
| Missing history | Reviewed baselining (Phase 1F); never auto-deploy from startup |
| Checksum mismatch | Restore original `migration.sql` from VCS; investigate who changed history |
| Pending | Authorised `migrate deploy` after gate pass |
| Failed row | Follow Prisma failed-migration recovery; re-verify with this tool |
| Working DB | Leave untouched until a production-readiness phase |

---

## 10. Remaining blockers (unchanged / still explicit)

1. **Production schema parity** has not been confirmed via read-only inspection.
2. Prisma 5.22 still does not reliably block checksum corruption on its own — independent verification is now mandatory, but operators must actually run it.
3. Repository has **no** complete greenfield initialization migration.
4. **No** migration deployment may run against working or production databases until a separately approved production-readiness phase resolves these blockers.
5. Beta environments that still lack `_prisma_migrations` will **fail closed** on startup until baselined — this is intentional.

---

## 11. Inventory (startup / migrate paths)

See final Phase 1H report §7 and evidence under `docs/db/evidence/phase1h/`.
