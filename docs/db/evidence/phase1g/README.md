# Phase 1G evidence index

Disposable sandbox rehearsal artifacts. Does **not** overwrite Phase 1F evidence.

| File | Description |
|------|-------------|
| `00-working-db-before.json` | Working DB fingerprint before rehearsal |
| `99-working-db-after.json` | Working DB fingerprint after rehearsal |
| `01-sandbox-a-rehearsal.txt` | Push → fail deploy → verify → resolve → status/diff/deploy |
| `02-future-fail-recovery.txt` | Future probe migration, empty-B failure, C failure tests |
| `03-recovery-replay.txt` | Fresh B recovery procedure |

Cleanup sandboxes when finished:

```bash
dropdb scriptcheck_phase1g_a || true
dropdb scriptcheck_phase1g_b || true
dropdb scriptcheck_phase1g_c || true
```
