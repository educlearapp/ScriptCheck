# Phase 1F — Production Migration Baseline Strategy

**Status:** Planning and read-only verification only  
**Branch:** `phase-1f-db-baseline-strategy`  
**Starting SHA:** `7969d27fb7c643f2fb46021390598a3474278cf7`  
**Date:** 2026-08-04  
**Verdict:** Strategy complete. **Do not** run `prisma migrate deploy` against working or production databases until a separate, reviewed baselining phase is approved and executed.

---

## 1. Baseline verification

| Item | Value |
|------|--------|
| Branch | `phase-1f-db-baseline-strategy` |
| Current / starting SHA | `7969d27fb7c643f2fb46021390598a3474278cf7` |
| `origin/main` SHA | `4cfcf139a68f88f5528e0753c16f2cc70aae886b` |
| Local database | `postgresql://dasilvaacademy@localhost:5432/scriptcheck` (local disposable) |
| Backend URL | `http://localhost:3001` |
| Frontend URL | `http://localhost:5174` |
| Prisma | `5.22.0` (`@prisma/client` 5.22.0) |
| Migration folders | See §2 |
| Migration status (working DB) | 3 migrations found; **all three reported as not applied** |
| `_prisma_migrations` on working DB | **Does not exist** |
| Production accessed | **No** |

---

## 2. Migration inventory

The repository contains **exactly three** migration directories. Git history shows **no deleted** historical migrations under `backend/prisma/migrations/` — the product schema was never expressed as a complete Prisma migrate chain.

### 2.1 Inventory table

| Folder | Timestamp | Purpose | Reflected in working schema? | Prisma status | Safe to `migrate deploy` as-is? | Blocked? |
|--------|-----------|---------|------------------------------|---------------|----------------------------------|----------|
| `20250612120000_timetable_foundation` | 2025-06-12 12:00 | Timetable foundation: enums `TimetableRoomType`, `PeriodType`; tables `SchoolClass`, `TimetableRoom`, `SchoolDayTemplate`, `PeriodDefinition`, `TeacherAssignment`, `SubjectRequirement` + FKs/indexes | **Yes** (all present) | Pending | **No** — objects already exist; deploy would fail with “already exists” | **Yes** — pending + already applied via `db push` |
| `20250612140000_lesson_timetable_builder` | 2025-06-12 14:00 | Lesson builder: enums `LessonTimetableStatus`, `DayOfWeek`; tables `LessonTimetable`, `LessonEntry` + FKs/indexes | **Yes** (all present) | Pending | **No** — same | **Yes** — depends on foundation objects; also already present |
| `20260804122500_add_script_teacher_review_fields` | 2026-08-04 12:25 | Phase 1E: add `LearnerScript.flaggedForReview` (bool NOT NULL default false) and `privateTeacherNotes` (text nullable) | **Yes** (columns match) | Pending | **No** on current working/prod-shaped DBs that already have columns — would fail “column already exists” | **Yes** until history is baselined; SQL itself is correct for a DB that lacks the columns |

Introducing commits (evidence):

- `c282204` — *Add timetable foundation setup* (creates first migration folder)
- `c443e2a` — *Add manual lesson timetable builder*
- `7969d27` — *chore(db): formalize teacher review fields migration* (Phase 1E)

### 2.2 Dependency chain

```text
[NO INIT / BASELINE MIGRATION IN REPO]
        │
        │  (schema created historically via prisma db push — see §4)
        ▼
20250612120000_timetable_foundation
        │
        │  requires Workspace, User, subject tables already in DB
        │  (assumed present; migration does not create core ScriptCheck tables)
        ▼
20250612140000_lesson_timetable_builder
        │
        │  FK to SchoolDayTemplate, Workspace, User, subjects, rooms
        ▼
20260804122500_add_script_teacher_review_fields
        │
        │  requires LearnerScript table already present
        ▼
[END OF REPO MIGRATE CHAIN]
```

**Critical implication:** Even a “clean empty database” cannot be built with `migrate deploy` alone — there is **no** init migration that creates `Workspace`, `User`, `Assessment`, `LearnerScript`, etc. Those exist only in `schema.prisma` and were pushed with `db push`.

---

## 3. Schema drift report (working DB ↔ Prisma schema)

### Method (read-only)

```bash
npx prisma migrate diff \
  --from-url "$DATABASE_URL" \
  --to-schema-datamodel prisma/schema.prisma \
  --script
```

and the reverse:

```bash
npx prisma migrate diff \
  --from-schema-datamodel prisma/schema.prisma \
  --to-url "$DATABASE_URL" \
  --script
```

### Result

Both directions produced:

```sql
-- This is an empty migration.
```

### Interpretation

| Category | Finding |
|----------|---------|
| Missing tables (in DB vs schema) | **None detected** by Prisma diff |
| Extra tables (in DB vs schema) | **None detected** |
| Missing / extra columns | **None detected** |
| Index / constraint / default / nullable / enum drift | **None detected** by Prisma diff |
| Working table count | **64** public base tables |
| Review columns | Present with expected types/nullability/defaults |
| Timetable objects | All migration-created tables and enums **present** |
| `_prisma_migrations` | **Absent** (not part of `schema.prisma`; expected given history) |

**Evidence file:** `docs/db/evidence/schema-drift-empty.sql`

**Caveat:** `migrate diff` is the authoritative Prisma view of drift for deploy planning. It does not invent a migration history. Matching schema **does not** mean migrations are “applied” in Prisma’s bookkeeping sense.

---

## 4. Why `_prisma_migrations` is missing (evidence-based)

### 4.1 Repository evidence

1. **Only three migration folders have ever existed** in git (`git log --diff-filter=A -- backend/prisma/migrations`). There is no prior migrate chain for core ScriptCheck tables.

2. **Package scripts favour `db push`, not migrate:**
   - Initial commit `e466582` `backend/package.json` already defined `"db:push": "prisma db push"` and had **no** `migrate deploy` script.
   - Current `backend/package.json` still exposes `db:push` / `db:generate` / `db:studio` only.

3. **Beta bootstrap explicitly syncs schema with `db push`:**
   - File: `backend/src/bootstrap.ts`
   - Commit introducing behaviour: `aadbd04` (*fix(beta): bootstrap schema sync and seed beta HOD accounts on startup*)
   - Code runs on beta startup:

```ts
execSync("npx prisma db push --skip-generate --accept-data-loss", { cwd: backendRoot, stdio: "pipe" });
```

   Comment in source: *“Render does not run migrations or seed separately — this runs once at startup.”*

4. **`prisma db push` does not create or maintain `_prisma_migrations`.** That table is created and updated by `migrate dev` / `migrate deploy` / `migrate resolve`. Absence of the table on the working DB is consistent with a push-based lifecycle.

5. **Working DB facts:**
   - `_prisma_migrations` → false
   - Full schema including timetable + Phase 1E columns → present
   - `migrate status` → all three SQL migrations “not applied” (bookkeeping only)

### 4.2 Historical reason (supported conclusion)

ScriptCheck’s local and beta databases were evolved primarily with **`prisma db push`** (and beta startup bootstrap), not with a cumulative `prisma migrate` history. Timetable and Phase 1E SQL files were added to the repo for intentional change tracking, but were **never applied through migrate** on the working database; equivalent schema changes arrived via push / ad-hoc SQL (Phase 1D local `ALTER TABLE`).

### 4.3 Risk and impact

| Area | Impact |
|------|--------|
| Local / beta today | App works; schema matches `schema.prisma` |
| `migrate deploy` now | **Unsafe:** would attempt to CREATE already-existing timetable objects, then ADD already-existing columns → hard failure; or, on a true empty DB, fail earlier because core tables are missing from the migrate chain |
| Future production | Cannot treat repo migrations as a complete deploy path until baselining + (likely) an init/baseline migration strategy is designed and rehearsed |
| Auditability | No Prisma record of which SQL versions were applied to which environment |

### 4.4 What this phase does **not** do

- Does not create `_prisma_migrations`
- Does not run `migrate resolve`
- Does not baseline any database
- Does not apply timetable or Phase 1E migrations

---

## 5. Production migration strategy (staged)

> This is a **plan for a future phase**. No stage below was executed here.

### Stage 1 — Repository cleanup

| | |
|--|--|
| **Objectives** | Inventory complete (done in 1F); decide fate of push-based bootstrap vs migrate-based deploys; freeze accidental new `db push` on production pathways; document that Phase 1E SQL is the only additive ScriptCheck migration currently intentional for marking UX |
| **Preconditions** | Phase 1E merged or cherry-picked decision made; owners assigned |
| **Rollback** | Docs-only / config-only changes; revert commits |
| **Success** | Written policy: production never uses `db push --accept-data-loss`; CI fails if bootstrap uses push on production env |
| **Failure** | Production still boots with `db push --accept-data-loss` |
| **Risks** | Beta still depends on push until migrate path exists |
| **Approvals** | Engineering lead + platform owner |

### Stage 2 — Migration history reconciliation (design)

| | |
|--|--|
| **Objectives** | Design how to represent “current production schema = known good” without re-running CREATE for existing objects; decide whether to (a) generate a squashed baseline migration from production schema, or (b) mark existing SQL as already applied after cryptographic/content verification |
| **Preconditions** | Read-only production schema dump available; staging clone available; Stage 1 policy approved |
| **Rollback** | Design docs only |
| **Success** | Approved decision record choosing baseline approach A or B with exact commands |
| **Failure** | Ambiguity about production column parity |
| **Risks** | Mis-marking migrations as applied when SQL did not match; accepting data-loss push history |
| **Approvals** | Engineering lead + DBA/platform + product (if downtime) |

**Preferred direction (recommendation):**  
Generate a **squashed baseline** from a production (or production-clone) schema dump as migration `0_baseline`, then keep `20260804122500_…` only if those columns are **absent** on that dump; if columns already exist on production, the Phase 1E migration must be recorded as already applied **only after** column-level verification — never blindly.

### Stage 3 — Safe baseline (execution on disposable clone first)

| | |
|--|--|
| **Objectives** | On a **disposable clone** of production: create `_prisma_migrations` via the approved Prisma baseline workflow; ensure status is clean; ensure pending SQL will not recreate existing objects |
| **Preconditions** | Stage 2 decision; disposable clone; backups of clone |
| **Rollback** | Destroy clone; never touch production |
| **Success** | `migrate status` healthy on clone; schema unchanged by baseline bookkeeping |
| **Failure** | Any DDL unexpectedly applied; status inconsistent |
| **Risks** | Operator runs commands against wrong DATABASE_URL |
| **Approvals** | Dual control: operator + reviewer watching command targets |

### Stage 4 — Dry-run verification

| | |
|--|--|
| **Objectives** | `migrate diff` empty (or only expected pending); deploy dry-run of **next** real migration on clone; regression suite green |
| **Preconditions** | Stage 3 success on clone |
| **Rollback** | Restore clone from snapshot |
| **Success** | No unexpected DDL; apps against clone pass teacher/HOD/marking checks |
| **Failure** | Drift appears; deploy attempts forbidden DDL |
| **Risks** | Shadow DB differences vs real Postgres extensions |
| **Approvals** | Engineering lead |

### Stage 5 — Production rehearsal

| | |
|--|--|
| **Objectives** | Full rehearsal on staging that mirrors production size/extensions; timed runbook; rollback rehearsal |
| **Preconditions** | Stage 4; maintenance window plan; backup verified restorable |
| **Rollback** | Staging restore from backup |
| **Success** | Runbook executed within RTO; monitoring quiet |
| **Failure** | Timeout, lock contention, failed checks |
| **Risks** | Staging not identical to production |
| **Approvals** | Engineering + ops |

### Stage 6 — Production deployment

| | |
|--|--|
| **Objectives** | Apply **only** approved pending migrations that are not already reflected; or baseline-only if schema already complete |
| **Preconditions** | Stage 5; explicit go/no-go; backups; feature flags as needed |
| **Rollback** | Restore from backup / reverse migration only if one was designed and tested (Phase 1E ADD COLUMN reverse is drop column — **data loss for notes/flags** — avoid unless empty) |
| **Success** | `_prisma_migrations` consistent; app healthy; no timetable surprise DDL |
| **Failure** | Deploy error; schema drift after |
| **Risks** | Highest — production data |
| **Approvals** | Engineering lead + ops + product owner |

---

## 6. Timetable migrations assessment

| Question | Answer |
|----------|--------|
| Why pending? | Present in `prisma/migrations` but never applied via migrate; schema arrived via `db push` / bootstrap |
| Safe to apply now on working DB? | **No** — tables/enums already exist |
| Dependencies | Foundation before builder; both assume core ScriptCheck tables already exist |
| Blocking issues | Duplicate object creation; incomplete migrate chain for core schema; Phase 1F/1E release blocker for any blanket `migrate deploy` |
| Precede or follow ScriptCheck marking migrations? | **Logically precede** Phase 1E in folder order, but **operationally** both must be reconciled as “already in schema” before any deploy. Do **not** apply them as live DDL on current DBs |

**Do not apply in this phase** (and not until baselining decides how to record them).

---

## 7. Prisma strategy review

| Tool | Advantages | Disadvantages | Risk | Appropriate for ScriptCheck? |
|------|------------|---------------|------|------------------------------|
| `migrate deploy` | Production-standard; audited history | Needs coherent migration chain + `_prisma_migrations` | **Critical** if used before baseline | **Yes — after** Stage 3–5 |
| `migrate resolve` | Marks migration applied without SQL | Easy to lie about history | **High** if unverified | **Only** after column/table proof on target DB |
| `db push` | Fast local/beta sync | No history; `--accept-data-loss` danger | **Critical** on prod | **Local/dev only**; remove from production bootstrap |
| Baseline (squash / init) | Creates honest starting point | Large carefully reviewed SQL | **Medium** if rehearsed | **Required** next major DB phase |
| Shadow database | Validates migrate dev | Needs permissions; not a substitute for prod clone | **Low–medium** | Useful in CI after chain exists |

### Preferred order for ScriptCheck

1. Stop production/beta reliance on `db push --accept-data-loss` (replace with migrate once ready).  
2. Capture production schema → design squashed baseline + reconciliation of the three existing folders.  
3. Rehearse on clones.  
4. Baseline production bookkeeping.  
5. Thereafter only forward `migrate deploy` of new migrations.

---

## 8. Release readiness checklist

### Repository
- [ ] Migration policy documented and linked from README/ops runbook  
- [ ] No production path calls `db push --accept-data-loss`  
- [ ] Phase 1E migration SQL unchanged and reviewed  
- [ ] Timetable migrations explicitly classified (baseline-as-applied vs rewrite)

### Migration history
- [ ] `_prisma_migrations` strategy approved  
- [ ] Clone baselined successfully  
- [ ] Production baselined (future)  
- [ ] `migrate status` clean on each environment after baseline

### Schema
- [ ] `migrate diff` empty (env schema vs `schema.prisma`) before release  
- [ ] Timetable objects inventory checked  
- [ ] Phase 1E columns verified on target

### Prisma
- [ ] `prisma validate`  
- [ ] Client generate in CI  
- [ ] Shadow DB or clone dry-run in CI (post-baseline)

### Tests / apps
- [ ] Frontend tests + build  
- [ ] Backend tests + build  
- [ ] Teacher golden path / marking / HOD / results / Paper Vault / marking pack smoke  
- [ ] Auth / school isolation checks  

### Data & ops
- [ ] Backup taken and restore tested  
- [ ] Monitoring / error budgets watched during deploy  
- [ ] Rollback runbook signed  
- [ ] Approval gates: eng + ops (+ product if user-visible downtime)

### Explicit non-goals until baseline phase
- [ ] ~~Run `migrate deploy` on working DB~~  
- [ ] ~~Run `migrate resolve` without verification~~  
- [ ] ~~Apply timetable DDL on DBs that already have those tables~~

---

## 9. Risks and open questions

### Risks
1. Operator runs `migrate deploy` against production before baseline → DDL failures or partial apply.  
2. Beta bootstrap `db push --accept-data-loss` remains capable of destructive sync.  
3. Squashed baseline drifts from true production if dump is stale.  
4. Phase 1E columns already on some envs but not others → env-specific resolve needed.

### Open questions (for next phase)
1. Does **production** already contain timetable tables and Phase 1E columns? (Requires approved read-only prod inspection — **not done in 1F**.)  
2. Should beta keep push temporarily, or move to migrate immediately after baseline?  
3. Is a maintenance window acceptable for baseline bookkeeping?  
4. Should timetable feature be considered GA (keep) or deferred (migrations quarantined)?

---

## 10. Verification performed in Phase 1F (read-only)

| Check | Result |
|-------|--------|
| Frontend vitest (1A–1E suites) | **29 passed** (5 files) |
| Frontend `tsc --noEmit` | **Pass** |
| Frontend production build | **Pass** |
| Backend production build (`prisma generate && tsc`) | **Pass** |
| Backend teacherReviewValidation unit tests | **6 passed** |
| `prisma validate` | **Pass** |
| `prisma format` | **Pass** (no schema behaviour change committed) |
| `migrate diff` DB ↔ schema (both directions) | **Empty** — no DDL drift |
| Migrations executed | **None** |
| Baseline / resolve | **None** |
| Local API / frontend health after verification | `/health` OK; `:5174` → 200 |

Recorded at end of phase in the final report commit message / CI local run:

- Frontend build  
- Backend build  
- Frontend tests (phase suites)  
- Backend validation unit tests  
- `prisma validate`  
- `prisma format` (no intentional schema behaviour change; format may no-op if already formatted)  
- Schema comparison via `migrate diff` (empty both directions)  
- **No** migrations executed  
- **No** baseline / resolve  

---

## 11. Confirmations

| Control | Status |
|---------|--------|
| No migrations applied | Confirmed |
| No baseline performed | Confirmed |
| No `migrate resolve` | Confirmed |
| No production access | Confirmed |
| Main unchanged | Confirmed at planning time (`4cfcf13…`) |
| Not pushed / not deployed | This document ships in a local-only commit pending approval |

---

## Appendix A — Evidence commands

```bash
# Migration status (working)
cd backend && npx prisma migrate status

# Drift
npx prisma migrate diff --from-url "$DATABASE_URL" --to-schema-datamodel prisma/schema.prisma --script
npx prisma migrate diff --from-schema-datamodel prisma/schema.prisma --to-url "$DATABASE_URL" --script

# History of migration additions
git log --diff-filter=A --summary -- backend/prisma/migrations

# Bootstrap evidence
git show aadbd04:backend/src/bootstrap.ts
```

## Appendix B — Phase 1E migration SQL (unchanged reference)

```sql
-- AlterTable
ALTER TABLE "LearnerScript" ADD COLUMN     "flaggedForReview" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "privateTeacherNotes" TEXT;
```
