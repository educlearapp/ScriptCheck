# Phase 1G — Disposable Baseline Reconciliation Proof

**Status:** Local sandbox rehearsal only  
**Branch:** `phase-1g-baseline-rehearsal`  
**Starting SHA:** `2ce447f7e5d52798c35d29ef9f2d08d0ebebdf85`  
**Final SHA:** tip of `phase-1g-baseline-rehearsal` after this documentation commit  
**Date:** 2026-08-04  

**Verdict:** **Pass with residual risks documented.** The Phase 1F verify-then-`migrate resolve --applied` path successfully reconciles migration history on disposable clones that already match `schema.prisma`. It is **not** yet a green light for production until production schema parity is confirmed read-only and checksum monitoring is handled operationally.

---

## 1. Starting point

| Item | Value |
|------|--------|
| Branch | `phase-1g-baseline-rehearsal` |
| Starting SHA | `2ce447f7e5d52798c35d29ef9f2d08d0ebebdf85` |
| `origin/main` | `4cfcf139a68f88f5528e0753c16f2cc70aae886b` |
| Working database | `scriptcheck` @ `localhost` (**untouched**) |
| Backend / Frontend | `http://localhost:3001` / `http://localhost:5174` |
| Production accessed | **No** |

Working DB before/after snapshots: `00-working-db-before.json`, `99-working-db-after.json`  
Both: `has_prisma_migrations: false`, `tableCount: 64`, database name `scriptcheck`.

---

## 2. Sandbox databases

| Database | Purpose |
|----------|---------|
| `scriptcheck_phase1g_a` | Primary baseline rehearsal + future-migration probe |
| `scriptcheck_phase1g_b` | Empty-deploy failure + recovery replay |
| `scriptcheck_phase1g_c` | Failure scenarios (P3005, duplicate resolve, checksum, drift) |

**Connection strings (local only):**

```text
postgresql://dasilvaacademy@localhost:5432/scriptcheck_phase1g_a?schema=public
postgresql://dasilvaacademy@localhost:5432/scriptcheck_phase1g_b?schema=public
postgresql://dasilvaacademy@localhost:5432/scriptcheck_phase1g_c?schema=public
```

**Cleanup:**

```bash
psql postgresql://dasilvaacademy@localhost:5432/postgres -c 'DROP DATABASE IF EXISTS scriptcheck_phase1g_a'
psql postgresql://dasilvaacademy@localhost:5432/postgres -c 'DROP DATABASE IF EXISTS scriptcheck_phase1g_b'
psql postgresql://dasilvaacademy@localhost:5432/postgres -c 'DROP DATABASE IF EXISTS scriptcheck_phase1g_c'
```

---

## 3. Baseline rehearsal (sandbox A)

### 3.1 Reproduce repository / environment state

```bash
DATABASE_URL='…/scriptcheck_phase1g_a?schema=public' \
  npx prisma db push --skip-generate --accept-data-loss
```

Result: full schema synced; **no** `_prisma_migrations` (mirrors push-based working/beta posture).

### 3.2 Naive `migrate deploy` before baseline

```bash
DATABASE_URL='…/scriptcheck_phase1g_a?schema=public' npx prisma migrate deploy
```

**Observed:** `P3005` — *The database schema is not empty* (Prisma refuses deploy without history on non-empty DB).  
**Note:** This fails **before** attempting CREATE/ADD of existing objects. Empty-DB behaviour differs (see B).

### 3.3 Object verification (mandatory before resolve)

Verified present before any `migrate resolve`:

- Timetable tables: `SchoolClass`, `TimetableRoom`, `SchoolDayTemplate`, `PeriodDefinition`, `TeacherAssignment`, `SubjectRequirement`, `LessonTimetable`, `LessonEntry`
- Enums: `TimetableRoomType`, `PeriodType`, `LessonTimetableStatus`, `DayOfWeek`
- Phase 1E columns on `LearnerScript`: `flaggedForReview`, `privateTeacherNotes`

### 3.4 Stage 3 baseline (verify → resolve)

```bash
npx prisma migrate resolve --applied 20250612120000_timetable_foundation
npx prisma migrate resolve --applied 20250612140000_lesson_timetable_builder
npx prisma migrate resolve --applied 20260804122500_add_script_teacher_review_fields
```

Each reported: *Migration … marked as applied.*

### 3.5 Post-baseline state

- `migrate status` → **Database schema is up to date!**
- `_prisma_migrations`: 3 rows, unique names, finished, not rolled back, order correct
- Checksums match SHA-256 of each `migration.sql` file (**allMatch: true**)
- `migrate diff` DB→schema and schema→DB → empty
- `migrate deploy` ×2 → **No pending migrations to apply**

Detailed log: `01-sandbox-a-rehearsal.log`

---

## 4. Migration history verification (A)

| Check | Result |
|-------|--------|
| `_prisma_migrations` exists | Yes |
| Expected entries (3) | Yes |
| No duplicates | Yes |
| Correct order | foundation → lesson builder → Phase 1E |
| Checksums vs files | Match |
| Internally consistent | Yes (`applied_steps_count` 0 for resolve-marked rows is expected) |

---

## 5. Schema drift verification

On baselined A (before disposable future probe):

```text
-- This is an empty migration.
```

(both directions)

---

## 6. Future deployment rehearsal

Used an **isolated** migrations copy under `/tmp/phase1g-future` (repository migrations **not** modified).

Added disposable migration `20260804140000_phase1g_future_probe` adding `LearnerScript.phase1gProbe`.

```bash
DATABASE_URL=…/scriptcheck_phase1g_a \
  prisma migrate deploy --schema=/tmp/phase1g-future/prisma/schema.prisma
```

| Check | Result |
|-------|--------|
| Applied once | Yes — column created |
| No duplicate tables/columns on first apply | Yes |
| Second deploy | No-op |
| Repo migration folders unchanged | Yes |

Probe column later dropped on A for cleanup/drift demos only.

---

## 7. Failure scenarios (sandbox C / B)

| Scenario | Expected / observed Prisma behaviour |
|----------|--------------------------------------|
| `migrate deploy` on push-populated DB without history | **P3005** schema not empty |
| `migrate deploy` on **empty** DB | Applies first migration then **P3018** / `42P01` — `relation "Workspace" does not exist` (incomplete migrate chain) |
| Duplicate `migrate resolve --applied` | **P3008** already recorded as applied |
| Corrupt checksum (`deadbeef`) then `migrate status` / `migrate deploy` | **Observed gap:** Prisma 5.22 still reported *up to date* / no pending — **does not block deploy**. Operators must verify checksums manually (as in §4). |
| Schema drift (`DROP privateTeacherNotes`) then `migrate diff` | Emits `ALTER TABLE … ADD COLUMN "privateTeacherNotes" TEXT` |

Log: `02-future-fail-recovery.log`

---

## 8. Recovery scenarios (sandbox B)

1. Empty B + `migrate deploy` → fails (missing `Workspace`).  
2. Recovery procedure replayed successfully:

```bash
DROP/CREATE scriptcheck_phase1g_b
DATABASE_URL=…/scriptcheck_phase1g_b prisma db push --skip-generate --accept-data-loss
# verify timetable tables + Phase 1E columns
prisma migrate resolve --applied 20250612120000_timetable_foundation
prisma migrate resolve --applied 20250612140000_lesson_timetable_builder
prisma migrate resolve --applied 20260804122500_add_script_teacher_review_fields
prisma migrate status   # up to date
prisma migrate diff …   # empty
prisma migrate deploy   # no-op
```

Log: `03-recovery-replay.log`

No undocumented manual SQL required beyond verification queries and intentional failure/drift probes.

---

## 9. Release readiness conclusion

### If production were cloned today, would the approved strategy work?

**Conditionally yes — for a clone that already matches `schema.prisma` via historical `db push`.**

Sandbox A proved:

1. Verify objects/columns exist  
2. `migrate resolve --applied` in timestamp order  
3. Empty drift  
4. Subsequent `migrate deploy` is a no-op  
5. A **new** forward migration can deploy cleanly afterward  

### Remaining blockers before production

1. **Production schema parity unknown** — 1G did not read production. Need approved read-only `migrate diff` / inventory against production (or a true prod clone).  
2. **Checksum enforcement gap** — corrupted checksum did not fail `migrate status`/`deploy` in Prisma 5.22; add operational checksum verification to the runbook.  
3. **Empty DB cannot be built from repo migrations alone** — still no init/baseline migration for core tables; greenfield still needs push or a future squash.  
4. **Beta bootstrap still uses `db push --accept-data-loss`** — policy Stage 1 from Phase 1F still open.  
5. **Hard rule remains:** do not run migrate deploy on working/production until a reviewed baselining phase executes the verified runbook against the real target after parity checks.

Phase 1F strategy document **left unchanged** (observations here refine operational detail without invalidating the verify→resolve approach).

---

## 10. Regression (no application code changes)

| Check | Result |
|-------|--------|
| Frontend phase tests (1A–1E) | **29 passed** |
| Backend teacherReviewValidation tests | **6 passed** |
| Frontend build | **Pass** |
| Backend build | **Pass** |
| `prisma validate` | **Pass** |

Application behaviour / OCR / AI / workflows / Phase 1E SQL / timetable SQL: **unchanged**.

---

## 11. Files changed (this phase)

- `docs/db/PHASE_1G_BASELINE_RECONCILIATION_PROOF.md` (this file)
- `docs/db/evidence/phase1g/*` (logs + before/after working DB JSON)

---

## 12. Confirmations

| Control | Status |
|---------|--------|
| Working database untouched | Confirmed (`scriptcheck`, no `_prisma_migrations`, 64 tables) |
| Production untouched | Confirmed |
| No deployment / merge / push | Confirmed (pending approval) |
| Main unchanged | Confirmed at rehearsal time |
| Repo migrations not modified | Confirmed |
