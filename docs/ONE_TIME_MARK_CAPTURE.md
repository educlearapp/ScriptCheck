# One-Time Mark Capture Architecture

## Principle

**Capture once. Report everywhere.**

`LearnerAssessmentMark` is the canonical source of truth for learner assessment results within ScriptCheck.

## Data Flow

```
Script Marking (ScriptQuestionMark)
        │
        ▼
  syncMarkFromScript()
        │
        ▼
LearnerAssessmentMark  ──►  Learner reports
        │                   Subject analysis
        │                   Class analysis
        │                   Grade analysis
        └──────────────────► Moderation reports
```

## Model

- **LearnerAssessmentMark** — one record per learner per assessment (`@@unique([assessmentId, learnerId])`)
- Links optionally to **LearnerScript** via `learnerScriptId`
- Stores `teacherMark`, `hodMark`, `finalMark`, `finalPercentage`
- Source tracked via `MarkCaptureSource` enum (`SCRIPT_MARKING`, `MANUAL`, `IMPORT`)

## Write Path

Marks are written only through:

1. **Script marking** — `syncMarkFromScript()` called after mark save/recalculation in `scriptMarking.ts`
2. **Future: manual capture** — direct entry for non-script assessments
3. **Future: import** — bulk CSV/API import

## Read Path

All reporting surfaces read from `LearnerAssessmentMark`:

| Surface | Endpoint / Service |
|---------|-------------------|
| Assessment results | `mark-capture/assessments/:id` |
| Learner history | `mark-capture/learners/:id` |
| Dashboard uncaptured count | `countUncapturedLearners()` |
| Analytics snapshots | Derived from captured marks (future phase) |

## Future Phases

- **At-risk learner identification** — trend analysis across `LearnerAssessmentMark` history
- **Secure examination paper storage** — link `ExamSession` papers to assessments without duplicate mark entry
- **Rubric-based marking** — criterion scores roll up to `finalMark` before capture

## Rules

1. Never duplicate mark entry in reports UI
2. Updates to script marks propagate via upsert, not insert
3. Published results lock the capture record (future enforcement)
