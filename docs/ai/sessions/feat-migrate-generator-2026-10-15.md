# feat/migrate-generator-2026-10-15 — one rig generator + the energy data in git

Brief: `~/work/agent-reports-2026-10-15/moxir-50/briefs/migrate-generator.md` (lead 0142g6MW, owner 16:4x "run parallel agents
to do fast"). Rows N811.7 (energy data) and N811.10 (one generator). Rule: "Nothing is left behind".

## What changed

- `scripts/place/rig_generate.py` (new): `hang` / `build` / `check`; hang file + scenes file → rig file, the unit checks
  (ids, p/r, shared DMX channel) and the scenes checks. Decision `docs/ai/decisions/2026-10-15-one-rig-generator.md`.
- `scripts/place/scenes_to_rig.py`: the scene → look loop moved into `looks_from_scenes()` (no behaviour change; the CLI
  gives the same looks, checked against the generator on the 50 scenes) and `main()` behind `__main__`, so both tools share it.
- `scripts/place/rigs/moxir-hang-v2-11-2026-10-15.json` (new, 479 KB): the v2.11 hang, taken by `rig_generate.py hang`.
- `scripts/place/rigs/moxir-energy-2026-10-15.json` + `.source.txt` (N811.7): energy pass 4, the designed energy per scene.
- `scripts/place/rig-generate-py.test.js` (new, 4 tests): groups line + mirror, refusals, the v2.11 proof, the energy file.
- `docs/ai/skills/venue-to-show.md`: step 5's row names the generator (one line; section 5's table is left to the lead,
  because three other migration jobs edit it).

## Validation

- `npx vitest run scripts/place scripts/rigbuild`: 83 files, 1435 passed, 2 expected fail.
- v2.11 proof: `build` (hang + 50 scenes) then `check --against moxir-v2-11-energy-2026-10-15.json` → same on fixtures, solids,
  stage, atmosphere, views, showSource, loop, not_hung, looks, cues.
- `npm run lint`: exit 0.

## Open

- The 20 `moxir_v*.py` builders stay (frozen record; seven tests and `src/rigbuild/plotModel.js` name them).
- `groups` has `line` and `mirror` only; arcs and crane cuts are listed unit by unit.
- `move_lamps.py` / `delete_entities.py` / `aim_lasers.py` on a hang file: ASSUMED to work (same `fixtures` key), not tested.
- The word "hang file" is proposed (vocabulary gives *layout* to the Studio's panels); the owner may pick another.
