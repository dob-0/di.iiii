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
