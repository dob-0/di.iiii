## 2026-11-27 07:59 — show desk check tools: light page picture check, missing-looks audit

- Moved two read-only tools from a report folder into `scripts/show/`: `light_page_check.mjs` (from minimap_check.mjs; same measuring, now takes --url/--out/--sizes and --expect N or --show) and `desk_missing_looks.py` (as it was). Owner N7279.7, N7034.4, N7279.3.
- light_page_check refuses any host but 127.0.0.1, localhost or *-test.diiii.localhost (exit 2): the old tool's default was the live desk. Fit maths are pure exported functions with tests; the browser part only gathers boxes.
- Tests: `scripts/show/desk-check-tools.test.mjs` (host refusal, fit functions incl. cut light, fill under 50 %, 3 px return, the 11-27 numbers; missing looks rc 0/1/2, 5-letter rule).
- Real run on a scratch desk made by the recipe from this worktree (show copy of the Reika desk, read-only): PASS at 4 of 4 sizes, 33 lights, 0 cut; `--expect 34` exits 1. Output in the chat's scratch folder.
- README: scratch-desk recipe, "Before a look is called lost", and the mirror_sync-first rule for loading looks (exit 2 = a sign never seen on the rig; the load stops).
- Fixed the hand-typed time in `fix-aim-fine-trim-compat-2026-11-26.md` (05:0 + x) with the commit time of e30c50a3f.
