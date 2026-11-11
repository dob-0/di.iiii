## 2026-11-12 — demo/platina-2026-11-13: the shared Platina build for aylmo and ponyo

- What it is: one branch both show machines build from until the pieces land in dev. dev `c9c908e63` (#1268, what aylmo's
  installed di runs) + `fix/output-no-placeholder` (#1270, 87da44141) + `feat/platina-space` (#1257, 4f0b97620) +
  `feat/platina-lights` (e9598d38c). One conflict, `docs/ai/known-fixes.md`: both sides' new entries kept, nothing else.
- Asked by the owner's board (build-platina-board, after N3836/N3847): "push demo/platina-2026-11-13 to GitHub, so both
  machines build from one branch". Pushed as a plain branch to dob-0, no PR: the cleaner end state is dev once #1270 and
  platina-lights land.
- Seen on ponyo (RTX 5060, Chrome 157, scratch stack on 127.0.0.1): the lights previs built with `stage-base.mjs` +
  `epic-build.mjs --rig scripts/place/rigs/platina-rig-scenes-v3-2026-11-12.json --hall none --apply` (127 entities,
  37 looks, 36 cues) renders; a deck in platina-screen with all 18 deck effects and the wall
  `/platina/map/platina-screen/out` at 1024x640 draw.
- Found, not fixed: while a deck layer plays a camera clip and the page may not use the camera, `/out` draws ALL black,
  not just that layer (since #1270 there is no card to say why). With the camera allowed it draws.
- Not tested here: the full test suite (Windows baseline in the fork notes); the deck with the artist's loops (they
  arrive by `di follow` through dev.diiii.xyz).
