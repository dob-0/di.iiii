# Portal approach-reveal + camera cage fix (2026-08-24, camp morning)

The owner's screenshot of /dilijan: five wide bilingual door nameplates
overlapping each other and the sign text from the entry camera. The labels
were always-on billboards — from any distance, five of them stack.

- **PortalObject**: door nameplates now reveal on APPROACH (≤8m fade-in, walk),
  on hover (orbit), and always in the editor. Entry view is clean geometry +
  colour. Exported `labelRevealTarget` (tested). Ring got a fake-bloom additive
  glow sprite + a translucent membrane disc — the membrane is also a click/tap
  target, fixing the ring-band-only ~40px tap trap. Hover lifts emissive +
  cursor. `reference.labelPlate` honoured in gateway mode.
- **PublicProjectSceneSurface**: `entryView:'fixed-camera'` no longer disables
  navigation wholesale — only `fixedCamera.locked === true` does (exported
  `isCameraCaged`, tested). An authored camera is the opening shot, not a cage;
  this was the owner's "can't move the camera" bug, properly this time.
- **arriveWalking.js** (new): walking through a portal sets a one-shot
  sessionStorage flag; the destination viewer consumes it when ready and enters
  walk mode if its walk gate is open. You walk through a door, you arrive
  walking.

No bloom via EffectComposer anywhere: it renders black in WebXR (memory
`reference_dii_room_craft`); the glow is geometry on purpose.
