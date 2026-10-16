## 2026-10-16 — Studio "Work light" lights every lamp, white, whatever the desk plays
**Asked:** "I want to turn on work light and half of devices not turn on — fix that fast now" (screenshot 182604, MOXIR v2.11 in the Studio).
**Cause (measured):** Work light ('' = no scene) drew each lamp as SAVED; MOXIR's room is rested on a red look: 28 of 40 washes and 12 of 18 beams saved #ff3a12, which read as off in a dark hall;
and every scene's baked floor glow (rig-wash:<look>) stayed at its saved opacity. With Work light pressed on plain dev, 52 of 96 spot lights drew at intensity 0.
**Fix:** src/rigbuild/workLight.js — under Work light every lamp is drawn white (#ffffff) at its own saved strength and no scene's baked glow is drawn; wired in StudioViewport only for rigLook === ''.
A view only: document, desk and show untouched. RoomLookFollower's '' (no preview) is unchanged.
**Tests:** workLight.test.js 4; vitest src/rigbuild/workLight.test.js src/studio — 95 files, 717 passed. **Seen:** agent screen, Floor 1.7 m, Work light: dev dark with cyan beams; this branch the hall lit white
(~/di-health/merge-proof/work-light-before-after.png). **Not done:** the 36 LaserCube lines still play their own frames (colours) under Work light — owner to say if they should go dark or white.

## 2026-10-16 (second pass) — a live lighting desk no longer repaints lamps under Work light

- **Asked again:** the owner looked at the test copy at 19:2x: "it still not all work lights works".
- **Cause (measured, agent screen, owner's di with its desk playing):** every lamp with a fixture number (PL5403 ×40, B380F ×18, LA40WF ×2)
  is drawn through `useLiveLightEntity` (src/rigMirror/liveLight.js), which replaces colour and level with what the live desk emits.
  That ran after the work-light override, so with Work light pressed: PL5403 20/40 lit and none white (desk colours), B380F 6/18, LA40WF 0/2.
  Only the 36 LaserCubes (no fixture number) obeyed — the same 42 of 96 white the first pass saw, so landing dev (#1003) changed nothing here.
- **Fix:** StudioViewport provides `DeskLightContext` = false while Work light is on; `useLiveLightEntity(entity, { enabled: false })` hands the
  lamp through untouched and does not watch the desk. Follow the show and every scene still follow the desk.
- **After:** 96/96 spot lights lit and #ffffff, 96/96 beams drawn (PL5403 40/40, B380F 18/18, LA40WF 2/2, LC Ultra 36/36), default quality.
  Tests: liveLight.test.jsx + workLight.test.js new cases; vitest src/rigMirror src/rigbuild src/studio 225 files, 2446 passed.
- **Not tested:** the owner's own screen; the public room page (it draws `lookDrawn`, untouched); the laser-line material colour (the probe could not read the shader uniform; the lamp's light is white).
