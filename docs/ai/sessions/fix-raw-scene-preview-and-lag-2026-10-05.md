# Raw: the preview, the lag, the visual bugs (2026-10-05)

Branch `fix/raw-scene-preview-and-lag-2026-10-05` off origin/dev ee1bacf2. Throwaway stacks `di-dev up rawprev-before|rawprev-now --api scratch` (25084310 and this branch), wiped at the end.

## Findings

Measured with real pointer input (Playwright, 1568x882, DPR 1.25):
- The 3D scene was never beside the cards in either build. Selecting a Box showed its settings only; the scene was the fullscreen Scene button. Before 25084310 List/Text windows stood over the canvas (retired by #777, on purpose).
- Object cards never drew a picture; node cards (Cube, Sphere) do, in both builds.
- Found on the way: in-card editing of a Text (#769) never opened with a real click.
- Lag: not reproduced. Frame deltas are 16.7 ms (p95 16.7-16.8, max 16.8), zero long tasks, in all four gestures, on all three builds, 3 runs each. Limit: headless Chromium, vsync-capped, 8 cards. The owner's laptop (fan fault, 95-100 C) is not this run. Open: profile on his machine.

## Owed

 account button not seen (scratch stacks run with auth off); the owner's 1950x1440 window not reproduced; React re-render counts not taken.
