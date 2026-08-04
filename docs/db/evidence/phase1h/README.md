# Phase 1H evidence

Disposable local verification only. Working database fingerprints:

- `00-working-db-before.json`
- `99-working-db-after.json`

Both must show `scriptcheck`, `has_prisma_migrations: false`, `table_count: 64`.

| File | Proof |
|------|--------|
| `01-healthy-integrity.txt` | Verifier exit 0 on baselined sandbox A |
| `02-release-gate-healthy.txt` | Gate PASS |
| `03-missing-history.txt` | Exit 10; `_prisma_migrations` still absent |
| `04-checksum-mismatch.txt` | Independent exit 11; Prisma `migrate status` still exit 0 |
| `05-unsafe-push-refused.txt` | Disposable helper exit 20 against working DB name |
| `06-beta-bootstrap-blocks.txt` | Beta bootstrap refuses missing history |
| `07-beta-bootstrap-healthy.txt` | Beta bootstrap proceeds after integrity OK |

Sandbox DBs: `scriptcheck_phase1h_a`, `scriptcheck_phase1h_b`, `scriptcheck_phase1h_c`
