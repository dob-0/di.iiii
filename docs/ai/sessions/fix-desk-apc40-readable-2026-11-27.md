## 2026-11-27 — the drawn APC40 is readable: fit by width, 11 px floor

- Owner: "fix and update ui that i can see what is what". Measured by dob-39: scale 0.65 at 1534x830, pad names 3.9-7.2 px, leader labels 6.8 px (height-bound fit, buttons table took 312 px of the width).
- `serverXR/src/lighting/ui/apc40draw.js`: the unit is fitted by WIDTH only (scale 1.124 at 1534x830, 1.126 at 1536x864); the legend sits below it in two columns (PADS list left, BUTTONS table right) and the pane scrolls. Pad names are sized in px on screen (14 down to 11); a name that does not fit at 11 shows its short form (leading code "R1", "H3", or number + word "5 Comet"), full name as the pad's title and in the PADS list. Leader labels 12 px on screen.
- Check: `serverXR/src/lighting/tools/apc40-readable-check.mjs` (headless, scratch desk on 127.0.0.1 only, the 100-row reikaMap.fixture.json, all 3 look pages of the 98-look Reika copy): min pad name 11.0 px, min leader label 12.0 px at both sizes, 0 cut.
- Not checked: the owner's real screen, the live desk, other widths below 1000 px (single column).
- Rollback: revert the PR.
