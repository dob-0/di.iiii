# worldState.fog + translucency depth (2026-08-24, the vast-space unlock)

The owner asked for VAST — "the box is closing the space; in 3D we can build
the impossible". VPE's audit found walk mode hard-capped at a 50m fog wall
with a 200m far plane (LiveProjectScene 8..50 fog), so no vast composition
could be seen at all.

- `worldState.fog: null | {near, far}` (both schema mirrors, validated,
  default null = exactly the old look). Walk-mode fog reads it; the camera
  far plane follows (`min(600, max(200, far*1.15))`). View mode already saw
  1000m with no fog — untouched.
- PrimitiveMaterial: translucent surfaces below opacity 0.5 stop writing
  depth — overlapping ghost boxes no longer hole-punch particles/grids
  behind them (three.js default depthWrite bit us the moment two glass
  boxes overlapped).
- Tests: fog normalization (defaults, clamping, junk rejection).
