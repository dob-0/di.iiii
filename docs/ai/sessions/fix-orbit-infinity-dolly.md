## 2026-09-02 — view mode keeps moving past the minimum zoom

- **"When I zoom max I can't move — the camera feels stuck"** (owner, on the Cascade
  club). `CameraControls` stopped dead at `minDistance` 0.35 and every drag then orbited
  a pivot a hand's width in front of the lens. `infinityDolly` on: past the minimum the
  wheel carries the pivot forward, so zooming keeps walking you into the room. One orbit
  rig serves Studio, the public viewer and the hub, so it is everywhere. Reproduced and
  re-shot — 40 vs 65 wheel ticks were the same frame before, different places after.
  Guard: `src/studio/components/studioOrbitInfinityDolly.test.js`; ledger row in
  `docs/ai/known-fixes.md`.
- Found while composing that club's opening shot, NOT fixed here: **a locked fixed
  camera ignores its target.** `StudioOrbit` returns null when `enabled` is false (a
  caged/locked camera), so `setLookAt` never runs and the r3f camera sits at the authored
  position staring at the origin — every locked composed entry stares at the floor.
  Workaround in data: `locked: false`. The fix belongs in `StudioOrbit`: apply position +
  lookAt to the raw camera when navigation is off.
- Dropped from this session on purpose: a `worldState.walkBounds` (one box) that was
  committed on `feat/walk-bounds` and never pushed — PR #310 (`feat/scene-room-controls`)
  carries `worldState.walkableAreas`, a union of rectangles with sliding and recovery, and
  supersedes it. The club's floor becomes one rectangle there once #310 lands.
