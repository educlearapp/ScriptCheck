# ScriptCheck — Phase 1 Foundation (+ 1.1 HOD Moderation + 2 Assessment Engine)

**AI-powered assessment, moderation, marking and academic intelligence platform** for South African schools.

Supported curriculums from day one: **CAPS**, **IEB**, **Cambridge**.

## Tech stack (aligned with EduClear)

| Layer | Choice | Rationale |
|-------|--------|-----------|
| Frontend | React 19 + Vite + TypeScript + React Router | Same proven stack as EduClear |
| Backend | Express 5 + TypeScript | Familiar API patterns, fast iteration |
| Database | PostgreSQL + Prisma ORM | Strong relational modelling for schools, roles, assessments |
| Auth | JWT + bcryptjs | Matches EduClear auth foundation |

## Phase 1 scope (included)

- Project scaffold (monorepo: `backend/` + `frontend/`)
- Authentication foundation (login, JWT, `/auth/me`)
- School, User, SchoolRole models
- Curriculum enums (CAPS, IEB, CAMBRIDGE)
- Subject and Grade models (curriculum-separated)
- Assessment model with full metadata and lifecycle statuses
- Role-based dashboard placeholders (Teacher, HOD, Principal/Admin)
- Basic navigation and black/gold UI foundation
- API routes for auth, schools, users, curriculum, subjects, assessments

## Phase 2 — Assessment engine foundation (included)

- `AssessmentQuestion` model with full question metadata
- Question CRUD API (add, edit, delete per assessment)
- Assessment detail page with question list and marks summary
- Declared vs calculated marks comparison (mismatch warning)
- Create assessment redirects to detail page for question building
- HOD can review question list on assessment detail (read-only)
- Analytics placeholder fields on questions (`analyticsMetadata`) and assessments (`analyticsSnapshot`)

## Phase 1.1 — HOD moderation workflow (included)

- Teacher submits assessment to HOD (`DRAFT` / `RETURNED_TO_TEACHER` → `SUBMITTED_TO_HOD`)
- HOD approves (`SUBMITTED_TO_HOD` → `APPROVED`) or returns with required comment (`→ RETURNED_TO_TEACHER`)
- New statuses: `SUBMITTED_TO_HOD`, `RETURNED_TO_TEACHER` (existing statuses retained)
- `AssessmentModerationAudit` trail: action, from/to status, performer, comment, timestamp
- HOD moderation queue page (`/moderation/queue`)
- Concept notes for future script marking layers (`docs/SCRIPT_MARKING_LAYERS.md`)

## Phase 1 exclusions (not built yet)

- AI marking engine
- OCR / script upload
- Learner script separation
- Question bank / paper generator
- Payments / EduClear integration
- Production AI API calls

## Project structure

```
ScriptCheck/
├── docs/
│   └── SCRIPT_MARKING_LAYERS.md  # Future layered marking concept
├── backend/
│   ├── prisma/schema.prisma    # Database schema
│   └── src/
│       ├── index.ts            # Express entry
│       ├── middleware/         # Auth & role guards
│       ├── routes/             # API route modules
│       ├── services/           # Auth + moderation workflow
│       └── seed.ts             # Demo school seed
└── frontend/
    └── src/
        ├── pages/              # Login, dashboards, assessments
        ├── components/layout/  # Sidebar, top bar, shell
        ├── auth/               # Session & route guard
        └── styles/             # Black/gold theme
```

## API routes

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Service health |
| POST | `/auth/login` | Email/password login |
| GET | `/auth/me` | Current user profile |
| GET | `/schools/current` | Current school |
| GET | `/users` | School users (management roles) |
| GET | `/users/roles` | School role definitions |
| GET | `/curriculum` | Curriculum metadata |
| GET | `/subjects` | Subjects (optional `?curriculum=`) |
| GET | `/subjects/grades` | Grades (optional `?curriculum=`) |
| GET | `/assessments` | List assessments |
| POST | `/assessments` | Create assessment (draft) |
| GET | `/assessments/moderation-queue` | HOD moderation queue |
| GET | `/assessments/:id` | Assessment detail (includes marks summary) |
| GET | `/assessments/:id/questions` | List questions + marks summary |
| POST | `/assessments/:id/questions` | Add question |
| PUT | `/assessments/:id/questions/:questionId` | Update question |
| DELETE | `/assessments/:id/questions/:questionId` | Delete question |
| GET | `/assessments/:id/moderation-audit` | Moderation audit trail |
| POST | `/assessments/:id/submit-to-hod` | Teacher submits to HOD |
| POST | `/assessments/:id/approve` | HOD approves assessment |
| POST | `/assessments/:id/return` | HOD returns with comment |

## Frontend routes

| Path | Page |
|------|------|
| `/login` | Login |
| `/dashboard` | Role-based dashboard |
| `/assessments` | Assessments list |
| `/assessments/new` | Create assessment |
| `/assessments/:id` | Assessment detail + questions |
| `/moderation/queue` | HOD moderation queue |
| `/users` | Users & roles placeholder |
| `/curriculum` | Curriculum & subjects placeholder |

## User roles

`OWNER` · `PRINCIPAL` · `DEPUTY_PRINCIPAL` · `HOD` · `TEACHER` · `MODERATOR` · `ADMIN`

## Assessment lifecycle

**Phase 1.1 moderation path:**

`DRAFT` → `SUBMITTED_TO_HOD` → `APPROVED` → …

`SUBMITTED_TO_HOD` → `RETURNED_TO_TEACHER` → (teacher revises) → `SUBMITTED_TO_HOD`

**Full lifecycle (future phases included):**

`DRAFT` · `SUBMITTED_TO_HOD` · `RETURNED_TO_TEACHER` · `AI_REVIEW` · `HOD_REVIEW` · `APPROVED` · `WRITTEN` · `MARKING` · `MARKED` · `PUBLISHED`

## Script marking layers (concept — not implemented)

See [`docs/SCRIPT_MARKING_LAYERS.md`](docs/SCRIPT_MARKING_LAYERS.md):

- **Original script** — single scan, never modified
- **Teacher layer** — red annotations
- **HOD layer** — green moderation annotations
- No rescanning required between marking stages

## Getting started

### Prerequisites

- Node.js 20+
- PostgreSQL

### Setup

```bash
cd ScriptCheck
npm install

# Backend env
cp backend/.env.example backend/.env
# Edit DATABASE_URL and JWT_SECRET

# Push schema
npm run db:push --workspace=backend

# Seed demo data
npm run seed --workspace=backend
```

### Development

```bash
# Terminal 1 — API (port 3001)
npm run dev:backend

# Terminal 2 — UI (port 5174)
npm run dev:frontend
```

Set `VITE_API_URL=http://localhost:3001` in `frontend/.env` if needed.

### Demo logins (after seed)

Password for all: `ScriptCheck2026!`

- `principal@scriptcheck-demo.school` — PRINCIPAL
- `hod.math@scriptcheck-demo.school` — HOD
- `teacher@scriptcheck-demo.school` — TEACHER

### Beta logins (Render beta environment)

API: `https://scriptcheck-beta-backend.onrender.com`

Password for all beta test users: `ScriptCheckBeta2026!`

- `hod.math@scriptcheck-beta.school` — HOD + TEACHER
- `hod.english@scriptcheck-beta.school` — HOD + TEACHER
- `hod.science@scriptcheck-beta.school` — HOD + TEACHER
- `teacher.beta@scriptcheck-beta.school` — TEACHER

### Build & typecheck

```bash
npm run typecheck
npm run build
```

## Next recommended step (Phase 3)

1. Learner script model and script upload (no OCR yet)
2. Per-learner question scoring linked to `AssessmentQuestion`
3. Analytics engine — compute averages, weak topics, cognitive/difficulty performance
4. Moderation audit history on assessment detail page
5. Auto-sync declared `totalMarks` from question sum (optional teacher override)

---

*ScriptCheck is a separate project from EduClear. No EduClear production files are modified.*
