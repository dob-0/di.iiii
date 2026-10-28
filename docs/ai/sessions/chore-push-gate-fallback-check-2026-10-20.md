## 2026-10-20 — the push gate runs the silent-fallback check that CI runs

- `scripts/push-checks.sh` now runs `npm run check:fallback-patterns`; on 2026-10-20 PRs #724 and #811 each passed the local gate and then failed CI on it.
