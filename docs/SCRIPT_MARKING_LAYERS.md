# Script Marking Layers — Concept Notes (Future Phase)

ScriptCheck will use a **layered annotation model** on a single scanned script. No rescanning is required when marking moves between teacher and HOD.

## Design principle

One original scan serves as the immutable base. All marking and moderation annotations are stored as **separate vector layers** overlaid on the same document coordinates.

## Layers

| Layer | Colour | Owner | Purpose |
|-------|--------|-------|---------|
| **Original script** | — (base image) | System | Single OCR/scan capture; never modified |
| **Teacher marking** | Red | Teacher | Marks, ticks, crosses, comments, scores per question |
| **HOD moderation** | Green | HOD / Moderator | Review annotations, adjustments, approval notes |

## Workflow integration

1. Teacher completes marking on the **red layer** after assessment is `WRITTEN` / `MARKING`.
2. HOD reviews on the **green layer** without altering the original scan or teacher layer.
3. Both layers remain visible independently (toggle or combined view).
4. Audit trail links layer changes to `AssessmentModerationAudit` and future `ScriptMarkEvent` records.

## Technical direction (not implemented in Phase 1.1)

- Store layer data as JSON/SVG annotations keyed by `assessmentId` + `learnerScriptId` + `layerType`.
- Coordinate system normalised to page dimensions (0–1) for resolution independence.
- Original layer referenced by `storageUrl` on a future `LearnerScript` model.
- Layer versioning: append-only edits with `createdBy` and `createdAt`.

## Benefits

- **No rescanning** — one upload per learner script.
- **Clear accountability** — teacher vs HOD marks are visually and audibly separated.
- **Moderation-friendly** — HOD can add green notes without overwriting teacher red marks.
- **AI-ready** — future AI suggestions can render as a distinct preview layer before teacher acceptance.

---

*Phase 1.1 establishes HOD assessment moderation only. Script layers are documented here for Phase 3+ marking implementation.*
