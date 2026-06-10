# Question Analytics — Preparation Notes (Phase 2)

Phase 2 stores the data structure required for future analytics. No calculations are performed yet.

## Per-question fields (`AssessmentQuestion`)

| Field | Analytics use |
|-------|----------------|
| `topic` | Weak topic detection across cohort |
| `cognitiveLevel` | Bloom's / cognitive performance breakdown |
| `difficulty` | Difficulty vs attainment analysis |
| `marks` | Weighted averages, question difficulty index |
| `analyticsMetadata` | Runtime analytics cache (JSON) |

### `analyticsMetadata` placeholder shape

```json
{
  "averageScore": null,
  "attemptCount": null,
  "weakTopicFlag": null,
  "cognitiveLevelPerformance": null,
  "difficultyPerformance": null
}
```

## Per-assessment rollup (`Assessment.analyticsSnapshot`)

Reserved for aggregate rollups: topic heatmaps, class averages, HOD moderation insights.

## Future calculations (Phase 3+)

- **Average per question** — `sum(learnerScores) / count(learners)` per `questionId`
- **Weak topics** — topics where cohort average &lt; threshold % of `marks`
- **Cognitive level performance** — group by `cognitiveLevel`, compare attainment
- **Difficulty performance** — group by `difficulty`, compare expected vs actual

---

*No OCR, AI marking, or learner scripts in Phase 2.*
