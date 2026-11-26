## 2026-11-26 — light desk: per-light pan/tilt home trim and an Aim page of trim faders

- Per-fixture limits.panTrim / tiltTrim (-255..255 DMX steps) applied in the engine after invert and min/max, clamped; stored through POST /api/fixtures/limits.
- New Aim page (tab next to Fader): every fixture with a pan or tilt channel, grouped by universe in address order, one column per light with Tilt and Pan trim faders (-128..128), number box and a 0 reset; sends live at about 20/s, last value always sent.
- Pictured headless at 1280x800 and 1920x1080 against a standalone desk with output disabled; no horizontal overflow.
- Not done: no flash/identify route exists on the desk, so a light cannot be picked to identify from this page.
