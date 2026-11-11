# Session note: feat/deck-wall-live (2026-11-12)

Owner asks (N3853, N3855): the wall in the 3D room shows the live picture of the deck, in step with the lights, and does not move.
"yes scenes work but visuals not connected". Before this: the wall was a box with a still picture on it.

## What
- `src/project/viewport/liveWall.js` (pure): the gate, the viewer switch, the drawn list.
- `src/project/viewport/LiveWall.jsx`: `useRoomWall`, `LiveWallSources` (the existing `LiveScreens`, lazy), `LiveWallSwitch` (words: Live wall).
- Room views that draw the project's entities and had no live screens now mount them: the Scene room (`RawViewport.jsx`) and the
  walk view (`LiveProjectScene.jsx`, which the show view's Walk uses). The Studio viewport already mounted `LiveScreens`; unchanged
  (and so it has no switch: see not done). The Perform desk has no room window (`src/perform` draws none).
- `scripts/rigbuild/wall-live.mjs`: dry by default; makes the deck's mapping surface when missing and ONE static plane `<wall>-live`
  on the audience face of the wall box. `--mode still|live` is the undo.

## Why this shape
- One live screen path: `liveScreen.js` + `LiveScreens.jsx`; nothing new draws pictures. `useTopNetwork` and the wall output page are untouched.
- Gate: nothing is mounted unless the room holds a drawn screen entity (type plane, `components.surface`, not hidden) and the viewer's switch is on.
- The switch is localStorage (`di.room.liveWall`, stored only as `off`), never the document. Off: screen entities are left out of the drawn
  list, no source runs, the still picture shows.
- The plane sits 10 mm off the cabinet face, 5 mm in front of the still (which sits 5 mm off), so the two do not z-fight.
- `animation: {mode: static}` because walk mode gives a loose object an idle drift (`entityAnimation.js` resolveAnimation).

## Cost
One more decode of the deck in the room view, and one texture upload per frame (liveScreen.js caps: network 15 per second, video per frame).
The operator turns it off with Live wall when frames matter.

## Undo
`node scripts/rigbuild/wall-live.mjs ... --mode still --apply` hides the live plane; the still picture was never removed. The viewer
switch is per browser. The branch can be left unmerged.

## Tested / not tested
See the pull request and the report of the job; this note is filled with the results there.
