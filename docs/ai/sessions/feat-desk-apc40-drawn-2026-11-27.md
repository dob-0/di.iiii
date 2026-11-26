# feat: the light desk's MIDI pane draws the APC40 mkII (2026-11-27)

Owner N7270/N7272: "where the ui of the apc40 that i can see what is what", "we have the midi ui from the di sound".
Stacks on #1388 (`perf/midi-led-instant-2026-11-27`): merge that first.

## What
- `ui/apc40draw.js` (new): the music page's APC40 drawing (studio-music `page/devices.js`) ported with its geometry, sources and a licence note in the header. Brand: no glow/bevel, mono type.
- Pure part `apc40View(model)`: pad name + LED colour (through `apc40Lights`, so drawing = real LEDs), button labels from the map (preset layout when unmapped), blackout marked danger.
- Pane above the two columns: drawing + legend (what each button does, on-air look, colour key). Pad click = same `target.apply()` as the real pad, so the ARM gate holds; a press flashes (2px outline, 160 ms).
- Under 640 px wide the drawing is hidden, the legend stays.

## Checked (test copy `di-dev up apc40-drawn --api scratch`, copy of the Reika checkpoint 2026-11-26-222045, output disabled; live desk and music page untouched)
- vitest `serverXR/src/lighting`: 13 files, 122 tests pass (apc40draw.test.js: 13 new).
- Pictures at 1534x830, 1536x864 (eDP-1 2560x1440 at 1.667), 1280x720, 900x800, 390x800: 48 labels, 0 cut, 0 outside, 0 side text cut; smallest label drawn 6.2 px (1534), 6.6 px (1536) for the longest look names; full names in the legend title/hover.
- Safe click: no POST, text "(not armed - nothing sent)". Armed click: one `api/looks/fire`, pad turns red.
- Not checked: the real APC40 (the owner is playing it), real Web MIDI. 390 px page overflow is the top nav, not this pane.
## Rollback
Revert the PR.
