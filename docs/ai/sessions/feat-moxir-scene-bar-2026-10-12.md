# feat/moxir-scene-bar — one scene bar, Edit in Studio, the v2.3–v2.6 scenes, hall envelope, offline renders (2026-10-12)

Owner (2026-10-11/12): the lasers to the entrance, then fanned over the whole air; the lights gathered round the DJ in lines;
the outside drawn; "we need a button to go to the edit studio … UI/UX is messed, fix that all"; "what we see is a different
thing" (renderer, next branch). Lead chat (info@), session https://claude.ai/code/session_01UNHVw2UvuhRNSHukj2cxnE.

## What changed
- `src/rigbuild/SceneBar.jsx` (new) — one top strip on rig scenes: version switch, Edit in Studio (a real link to
  `/{space}/{project}/studio`), the SHOW chip; right: Sound, Walk/Fly, Free, Lite/Full, the dev-copy chip. Shows in walk mode
  too. `rigVariant.js shortTitle` names versions one way (v1.1, v1.1 looks, v2.6, Old (n)). `smartViewGeometry.js` takes any
  named view camera after the six built-in ids. Tests: SceneBar.test.jsx, shortTitle cases, a views test.
- `scripts/place/moxir_v2_3_aerial.py`, `moxir_v2_4_fan.py`, `moxir_v2_5_gathered.py` and their rigs (v2.3 one point above the
  door; v2.4 the fan over the air with a lasers-only previs look; v2.5/v2.6 gathered lines round the DJ and the floor, 8+2
  washes outside, ground/road/forecourt as GUESS boxes). `scripts/rigbuild/views-v2.mjs` re-aims the view buttons from the rig.
- `scripts/place/hall.py --shell-alpha` (the envelope as a 30 % see-through shell, faint self-light), `hall-show.mjs
  --double-sided --night --shell-glow`; hall v12 record `rigs/moxir-hall-2026-10-12-v12-shell.hall.json`.
- `scripts/place/moxir_render.py` — offline Cycles previs (haze volume, every spotlight, fixed views); the owner wants the
  real-time look instead, so it is the reference picture for the renderer branch, not a deliverable.
- `scripts/rigbuild/epic-build.mjs` — rig-shell-*/rig-out-* boxes are rig-file solids (removed when a rig no longer lists them).

## Checks
- `npx vitest run src/rigbuild src/project/viewport/smartView src/project/components/PublicProjectViewer.test.jsx
  src/components/TreeChip.test.jsx` → 1714 passed (126 files). Lint clean on touched files.
- Seen: agent-screen shots desktop 1600 / walk / phone 390 in `~/work/agent-reports-2026-10-09/moxir-lead/scene-bar/`;
  the owner saw the bar live on the scratch stack (moxir-one, `moxir-test.diiii.localhost/moxir/v2-6`).

## Limits
- Scratch only; nothing on dev or the owner's di until his look. Build button not done (needs a server job / the agent door).
- Views menu in walk mode and the title ticker still owed; the laser margins (v2.3–v2.6) and the outside are UNVALIDATED.

## 2026-10-12 03:00–06:5x (lead, info@) — the night's second half
- Hall v13: the ghost shell got an opaque inner skin (hall.py `shell_box`); the 30 % shell had veiled every beam farther than the hall centre.
- SmartView: per-scene occlusion-fade switch; then the see-through job (f5de6ae7): free-orbit collision, near-lens fade, Roof·Walls·Machines·Outside layers.
- Show chip: PREVIEW row (a look for this viewer only). Studio: Cues section removed from the control cluster; undo/redo by key place
  (Ctrl+Shift+Z, Armenian layout), Lock/Unlock any object + Lock the hall, box select with a Select tool (b310ce53; Shift/Ctrl-drag owed).
- MOXIR v2.7 (moxir-v2-7, slug v2-7): side lines X0±8.2, laser net 36 lines under the hand rule (5.4 m), two UP-LA40WF on the entrance wall,
  five looks; every throw walked (throws-of-cut.mjs); the +x machines stay (show-cleared `kept_for_the_show`).
- Tools: di-open (di-atlas), rules "work sterile", "di-open", template item 13 (code jobs on their own tree).

## 2026-10-12 19:4x – 2026-10-13 01:0x (lead, info@) — the lasers and the ground, from the dance floor
- Asked: lasers close over the heads with the cubes kept on the far crane; the ground fixtures "no logic, asymmetric".
- Measured first (`lid_probe.py`, scratchpad): from the far crane a line over the dance floor ends on the entry wall, so the
  rules (entry >= 9.0 m, DJ crane >= 9.2 m) hold it at 9.0–9.3 m; the hand rule alone would allow 5.4 m. Said to the owner.
- Ground audit of v2.7: inside pairs mirror about the DJ axis in place AND aim (0 faults); the asymmetry he sees is the
  outside 8+2 washes (one side only, another item) and the air singles; the 14 side washes read as scattered glows.
- `scripts/place/moxir_v2_8_floor.py` (`--lasers crane|matrix|columns`): v2.8 = the v2.7 net lowered to the rules
  (22 lines to the side walls 5.4–5.7 m, 14 to the entry 9.2–9.8 m) + the RED TENT (14 side washes tilted 30° in);
  v2.9 = a comb of 24 lines 1 m apart over the floor at 9.2–9.65 m + 12 diagonals; the column try (lasers on the nave
  column brackets at 6.0 m — a lid at 6.0–7.7 m, not asked) kept only as a rig file.
- Scratch stack moxir-one: projects moxir-v2-8 (slug v2-8) and moxir-v2-9 (slug v2-9), copies of v2-7; backup in
  `~/di-backups/moxir-scratch/2026-10-13-v2-8/`. Heat: the owner's v2-7 tab held the package at 100 °C; blanked (the
  job's own tab), 74 °C after. Pictures: `floor-shots.cjs` through the Views bar (`__diRoom.camera` is not exposed on
  the show route in time; the repo's motion-probe.cjs pattern).
- Owed: lamp/crane strikes along the lines (laser-margin run); the outside washes; the cut truss level and the air
  singles if he says so; a lattice of crossings needs the cubes spread along the girder (his word).
