# Phone double-tap has a real handler (plan PR 1.9)

## What was wrong

The graph and the room relied on the browser synthesizing `dblclick` from
two touch taps on `touch-action: none` elements. Chromium synthesizes it;
the 2026-08-20 real-phone test found the canvas dead at step one.

## What changed

New `createTapTracker` (src/raw/utils/useDoubleTap.js): a pure state
machine — touch only, second finger poisons (pinch), slide beyond 12px is a
pan, two taps within 350ms/24px complete on the second up. `up()` returns
whether a double-tap completed, so callers fire their own freshest handler;
`justFired()` guards Chromium firing BOTH the tracker and its synthesized
dblclick. Wired into RawGraphSurface (palette at the tap) and the room's
floor plane (place at the raycast point, interactive views only). Thresholds
exported for one-line tuning after the device pass.

## Verified

8 unit tests on the machine (interval, radius, slide, pinch-poison + recover,
mouse ignored, double-fire guard, triple-tap fires once). Emulated iPhone
(hasTouch, Chromium): double-tap opens the palette, cube created, screenshots
read. REAL-DEVICE CHECK OWED: Chromium emulation cannot prove iOS — the owner
must double-tap staging on their phone before this is called fixed;
thresholds are exported constants for the tuning that may follow.
