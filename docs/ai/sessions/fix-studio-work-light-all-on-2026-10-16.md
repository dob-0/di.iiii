# Studio "Work light" lights every lamp (2026-10-16 18:2x–19:xx)
**Asked:** "I want to turn on work light and half of devices not turn on — fix that fast now" (screenshot 182604, MOXIR v2.11 in the Studio).
**Cause (measured):** Work light ('' = no scene) drew each lamp as SAVED; MOXIR's room is rested on a red look: 28 of 40 washes and 12 of 18 beams saved #ff3a12, which read as off in a dark hall;
and every scene's baked floor glow (rig-wash:<look>) stayed at its saved opacity. With Work light pressed on plain dev, 52 of 96 spot lights drew at intensity 0.
**Fix:** src/rigbuild/workLight.js — under Work light every lamp is drawn white (#ffffff) at its own saved strength and no scene's baked glow is drawn; wired in StudioViewport only for rigLook === ''.
A view only: document, desk and show untouched. RoomLookFollower's '' (no preview) is unchanged.
**Tests:** workLight.test.js 4; vitest src/rigbuild/workLight.test.js src/studio — 95 files, 717 passed. **Seen:** agent screen, Floor 1.7 m, Work light: dev dark with cyan beams; this branch the hall lit white
(~/di-health/merge-proof/work-light-before-after.png). **Not done:** the 36 LaserCube lines still play their own frames (colours) under Work light — owner to say if they should go dark or white.
