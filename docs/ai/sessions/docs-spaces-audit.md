## 2026-09-16 — spaces audit: every space across local, dev and live (read-only)

- Read every space, project row and document on the three tiers (local API + read-only
  sqlite, dev.diiii.xyz, di-studio.xyz), and fingerprinted each document with tier-sync's own
  `documentSignature`. Checked 1,516 listed assets for 404s. Wrote nothing to any tier.
- Result in `docs/research/2026-09-16-spaces-audit.md`: 32 spaces. Same 12 · newer on dev 1 ·
  local ahead 1 · both changed 9 · one tier only 9.
- Needs attention:
  - live `network`, `cascade` and `the-light-put-back` are not permanent (about 24 days to the prune).
  - live `main` still has the 76 stray images.
  - live `library` has 51 PDFs that return 404.
  - `tier-sync-baseline.json` matches 0 of 131 projects, so `--changed` refuses everything until it is rebuilt.
  - `start-check`'s timestamp mode over-reports (94 NOT LATEST, mostly identical content).
  - `LIVE_API_URL=https://staging.di-studio.xyz` in `serverXR/.env.local` no longer resolves.
