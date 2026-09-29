## 2026-09-29 — one command to publish a space's update to dev

- `scripts/space-publish.mjs` (`npm run space:publish -- --space <id>`): tier-sync --changed →
  show-clock --epoch now on the published project → visitor check (published 200, private 404 and
  unlisted). Unknown options are refused (tier-sync ignores them silently: `--skip` looked like it
  worked). 4 tests.
- tier-sync: `mappingState.showEpoch` is volatile (each tier starts its own show clock); the
  baseline after a write is the destination's READ-BACK shape (dev filled AI-effect defaults in on
  write, so the sent shape made every MOXIR project read "both sides changed"). 3 tests.
- Measured: dry run on moxir refused all 4 projects before; the diff of moxir-hall-full local vs dev
  was only createdAt/updatedAt + `effect.prompt ""` / `effect.strength 0.5`.
- Owed: the three MOXIR show projects need one `--force` push to record a true baseline.
