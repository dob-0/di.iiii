## 2026-09-18 — a forced space replace no longer deletes what the file does not carry

Found while putting Emilya's WCC export on all three tiers.

- `space-bundle.mjs import --force` used `INSERT OR REPLACE INTO spaces`; the REPLACE's delete
  cascaded to every project of the space, the space dir was removed whole, and label/owner
  reset to the file's. The local tier lost 8 history projects this way (restored from a hand-made
  copy of `di.db` + the space dir).
- Now: upserts, extra projects kept (and listed) unless `--prune`, label/owner survive, and a
  before-copy lands in `<data-root>/_backups/space-replace/<id>-<time>.diiii` unless `--no-backup`.
- `--prune` is the old whole-replace, said out loud.
- Not changed: the HTTP route `POST /api/spaces/bundle` still never passes `--force`.
- Ops note: `_backups/space-replace/` lives inside the tier's data volume and is not swept by anything.
- Project `state` / `deleted_at` / `slug` / `position` now travel (3 trashed + 4 archived WCC projects had arrived LIVE on dev and prod).
- On a hosted tier (`release.json` → `deployEnv`), a forced replace must pass `--tier dev|prod` and it must match — the 09-17 "meant for dev, landed on prod" guard. `DI_TIER_OVERRIDE` exists for the test only.
