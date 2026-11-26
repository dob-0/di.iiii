# fix/touch-compact-2026-11-26

## 2026-11-26 — Touch page compact, minimap fixed

Owner N6942 (picture of his 761x799 window): "ui is to huge and take the too many space optmize it do the screen shots and messure everything"; N6944: "check also the minimap it bagged".

Measured headless on the live desk at 761x799, 1536x864, 768x864, 1280x800, 639x678, 390x844 (scratchpad touchshot.cjs):
- before at 761x799: live strip 301 px, look tile 177x90, Depth/Speed/Master tracks 39 px, TAP and FX off past the right edge, the rig drawn 26x27 px in a 735x107 box.
- after: strip 245 px (173 wide), tile 144x61, fader tracks 139 px, 0 items past the edge, 0 overlaps, rig 72x81 (236x267 wide).

Cause of the minimap: fitStage kept 96 px of vertical air (for the Setup plan's labels); the Touch box is ~107 px tall, so 11 px were left for the rig.
Compact sizes only with a mouse (pointer: fine); a finger keeps the 44 px targets.
- Wiring guard: a .touchwrap grid now passes only if every child has a fixed grid row and the strip row is auto; checked that it still fails when the strip loses its row. Lighting vitest 83 passed.
