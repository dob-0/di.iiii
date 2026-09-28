## 2026-09-28 — walk mode moves like a person in a game: world-space velocity, one-step starts and stops, frame-rate independent

- Target set by the owner mid-task: game traversal feel for walking a venue (MOXIR hall), NOT shooter
  mechanics — no jump, no CS counter-strafe, no walk-slow. Shift is a gentle sprint (1.5x).
- New pure module `src/components/walkPhysics.js` (+ `walkPhysics.test.js`, 23 tests): Unreal
  `CharacterMovementComponent::CalcVelocity` / `ApplyVelocityBraking` model, world-space velocity,
  input clamped to length 1, fixed 128 Hz tick with render interpolation (Fiedler "Fix Your Timestep!").
  Constants and sources in `walkModeConfig.js`; values marked TUNED are ours, not a publication's.
- Measured with the pure module (unit tests + a replay of the old per-frame code):
  top 5.2 -> 3.62 m/s; diagonal 7.35 -> 3.62 m/s; 0-to-top 0.37 -> 0.45 s; stop 0.52 s / 1.36 m ->
  0.37 s / 0.47 m; world velocity kept after a 180-degree flick -97 % -> 90 %; distance after 1 s at
  30/60/144/240 fps 4.320/4.277/4.252/4.245 -> 2.787 at all four.
- Fly: same model in 3D, vertical = horizontal = 5.2 m/s (was 4.5/5.2), drone rule kept; the wheel
  sets fly speed while flying (x1.25 per notch, 0.25-4x; Unreal Editor / Blender Walk-Fly); in walk it
  still dollies, now eased over ~0.1 s. Leaving fly glides down (SmoothDamp, capped 8 m/s).
- XR locomotion unchanged on purpose (`XR_MOVE_SPEED` 5.2, constant velocity — VR comfort).
- Head bob default OFF, read from `getLookSettings().bob` — `src/components/walkLookSettings.js` is a
  STUB until the look lane's real getter lands; replace its body with a re-export.
- `window.__walkProbe = []` (set before load) makes the Walker log one pose/velocity sample per frame.
- Seen in the owner's Flatpak Chromium (Intel iGPU, DPR 1.5) in /moxir on his local tier: walk, diagonal,
  sprint, fly up/forward/faster, landing; diagonal peak 3.620, fly vertical 5.200, stop distance
  0.44-0.46 m in every segment. The hall ran at a median 224 ms/frame there (a game was running) — too
  slow to judge feel by eye; a 60 fps look on the NVIDIA card is OWED: walk mode's WebGL context fails to
  create under ANGLE-Vulkan/PRIME after the hall loads (orbit view renders fine) — cause not found.
