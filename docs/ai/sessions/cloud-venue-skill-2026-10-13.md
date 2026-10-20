## 2026-10-13 — the venue workflow as a skill set (paint_plan → read_paint → layout → render → integrate → review)

Cloud agent, scheduled. Docs only: seven `.claude/skills/` files, no code, no behaviour, no look changed.

- **What changed:** `.claude/skills/venue/SKILL.md` (the index: the six steps, their scripts, the rules that hold on
  every step) and one skill per step — `venue-paint-plan` (`scripts/place/paint_plan.py`), `venue-read-paint`
  (`read_paint.py`; older `paint_zones.py`), `venue-layout` (`occlusion_sky.py`, `moxir_v2.py`, `moxir_v2_spread.py` +
  `moxir_v2_eyes.py`, `moxir_v2_compose.py`, `moxir_v2_symmetry.py`), `venue-render` (`rigbuild/epic-build.mjs` on a
  scratch stack, `moxir-v2-true-frames.cjs`, `moxir-v2-probe.cjs`, `frame_luma.py`, `rigbuild/look-probe.mjs`,
  `rig-look.mjs`, `moxir_render.py`), `venue-integrate` (`rig.mjs`, `hall-show.mjs`, `rigbuild/swap-hall.mjs`,
  `rigbuild/patch-table.mjs`), `venue-review` (`moxir_v2_page.py`, `moxir_v2_spread.py page`, `rigbuild/look-compare.mjs`,
  `compose.py`, `moxir_site_sheet.py`). Every command is quoted from the named script's own header or
  `scripts/place/README.md`; every script path named was checked to exist.
- **Tests, before (origin/dev) → after (this branch), full `npx vitest run`, same container:**
  10 091 tests, 203 failed / 9 697 passed / 189 skipped / 2 expected fail on BOTH, identical failing list (diffed).
  Cause: `serverXR/node_modules` was not installed in the container. After `npm ci` in `serverXR`,
  `npx vitest run serverXR scripts/di` → 2 318 tests, 4 failed / 2 308 passed / 6 skipped; the 4 are
  `scripts/di/oneAddressPrinted.test.js` (a `diiii.localhost` address expected, `localhost` printed) and fail
  identically on origin/dev — environment, not this branch.
- **UNVERIFIED:** no step script was run; flags are as their headers say. `moxir_render.py`'s header says
  `--exposure 0`, its code defaults to 3.0 (noted in the skill, not changed). The step order puts render before
  integrate as the task asked; in practice render runs on a scratch copy made by `epic-build.mjs` and integrate
  writes the venue's real project — that split is my reading of PROGRESS 2026-10-09, not an owner rule. The scripts
  are MOXIR-pinned; a second venue would need its own.
- **Next:** the owner reads the seven skills and says whether the step split (esp. render vs integrate) is how he works;
  then a dry run of steps 1–2 on the MOXIR plan to prove the commands as written.

## 2026-10-20 — update onto dev: one source

dev gained `docs/ai/skills/venue-to-show.md` (14 steps, traps, standing choices). To keep ONE source the seven skills became 8-line pointers and their script usage moved, once, into that file's section 6 (net +192 lines there, the skills 274 -> 56 lines). The other option (skills as source, venue-to-show pointing in) would have moved the 93-line process text and its step-check into seven files. CURRENT.md is dev's copy. check-agent-docs and check-doc-paths pass.
