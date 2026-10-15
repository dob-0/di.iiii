## 2026-10-15 — Palette audit and light-environment table tools become di.iiii features (N811.2, N811.8)

Branch `feat/migrate-palette-2026-10-15`. Rule: "Nothing is left behind" (owner 2026-10-13). Venue-to-show skill: the palette step and step 8 (environment picker).

Rule: "Nothing is left behind" (owner 2026-10-13). Ledger rows N811.2 (palette audit) and N811.8 (light-environment table). Venue-to-show skill steps: the palette step, and step 8 (environment picker).

| Was (agent-reports-2026-10-15/moxir-50/…) | Now | Change |
| --- | --- | --- |
| scenes-tools/palette.py | `scripts/place/palette_lib.py` (maths + loader) + `scripts/place/rigs/palette-moxir-2026-10-15.json` (the 19 colours, 3 surfaces, 14 wheel slots) | table is data; lamp hexes identical to the old module (checked: C, NAME, WHEEL equal) |
| scenes-tools/palette_sample.py | `scripts/place/palette_sample.py` | args only, `--help`; fixed a NaN crash when a stratum is one flat colour |
| scenes-tools/palette_samples.json | `scripts/place/rigs/palette-teasers-moxir-2026-10-15.json` | `_source`, `_licence` (derived statistics only, clips stay in the inbox, never published), `_date` |
| scenes-tools/teaser_stats.py | `scripts/place/palette_stats.py` | `file` is the base name (no `/inbox/` split) |
| scenes-tools/flashrate.cjs | `scripts/measure/flashrate.cjs` | path argument resolved, `--help` |
| light-env-data/table.py | `scripts/place/light_env_table.py` | `OUT.json DOC.json…` arguments; row `v` = file name |
| light-env-data/analyze.py | `scripts/place/light_env_analyze.py` | `SHOTS_DIR OUT.json` |
| light-env-data/haze.mjs (+reg.mjs, json-loader.mjs) | `scripts/place/light_env_haze.mjs` | repo-relative import, JSON loader inline |
| light-env-data/fetch.mjs | `scripts/place/light_env_fetch.mjs` | `--api --tag --out --token-file ID…` |

Tests: `scripts/place/palette-tools.test.js`, `scripts/place/light-env-tools.test.js` (vitest, synthetic inputs). Real-data check: table and haze on the audit's documents give the same rows/lines as the old scripts (v2-11 row equal; v2-10 haze line identical). Not tested: fetch against a live server; palette_sample on the real teasers (clips stay on aylmo).
Not migrated (not in these rows): scenes50.py / sheet.py that import the old `palette.py` — their job must switch to `palette_lib.load(...)`.
