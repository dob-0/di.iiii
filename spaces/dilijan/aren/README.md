# Aren's yard and wall, one view

Owner, 2026-10-21 (N1123): *"and Բակը · The yard Պատը · The wall make from this 2 , only one and look what we can take"*.

`yard.html` is the second tab of the project `the-yard` on the Dilijan space: **AirCanvas | Բակը · Պատը · Yard · Wall**.
It is built into the project by `scripts/space/combine-pages.mjs --spec spaces/dilijan/combine-aren.json` (the tab is
`{ "file": "aren/yard.html" }`). One canvas, one renderer: one 3D view live at a time.

## What the two pages were (read from their code, 2026-10-21)

| | Բակը · The yard (the-yard's own page, kept as `yard-original`) | Պատը · The wall (`elevation`, "Dilijan 26.08.2026") |
|---|---|---|
| Data | measured cloud, 89 999 coloured points; mesh of 3 parts (main, wall_mid, wall_right), 181 k faces; photos 1024/832/832 px | the same 3 scans as fragments (courtyard, cabin, wall), 76 k faces; photos 1024/2048/2048 px; a baked contact shadow |
| Look | the cloud, swept by a red reveal front; then the photos, unlit | 5 looks: colour, mono (grey except the red chalk), scan (a red line), cloud (points sampled on the mesh), wire |
| Camera | a 78.5 s tour on rails (reveal 7, tour 50, fade to surfaces 5, hold 13, out 3.5); tall screens widen the field of view | the fragments in a row (an elevation), orbit around it, idle drift on the front arc, fit to the screen |
| Hands | drag, wheel; Space pauses the tour | drag with inertia, pinch, wheel; keys 1-5, arrows, R, double click |
| Motion | | the fragments arrive on their side and settle (2.3 s) |
| Cost | pixel ratio up to 2, every frame | adaptive pixel ratio 0.75-1.5, every other frame when idle |
| Extras | VR/AR entry, the "aren · dilijan" mark, the arrival "ԲԱԿԸ" | the arrival "ՊԱՏԸ" |

## The finding the design rests on

The wall's three fragments are the yard's own scans, decimated, with sharper photos on the two walls. Registered on the yard's
measured cloud by `register.py` (yaw search with an FFT shift, then trimmed ICP; nearest-point distances of 5 000 fragment vertices):

| fragment | yard part | yaw | median | p90 | within 5 cm |
|---|---|---|---|---|---|
| courtyard | main | 0° (359.98) | 1.4 cm | 3.0 cm | 96 % |
| wall | wall_right | 229.77° | 2.2 cm | 4.7 cm | 92 % |
| cabin | none | - | (best 4.7 cm) | (26.7 cm) | (52 %) |

The cabin is NOT in the yard's scan: no pose fits its shape (above) or its photo (a colour-aware search over 360° and the 24 best
shifts: best r = 0.26, 15 % of it within 4 cm). It is shown only in Պատը, arriving the way the wall page brings it in;
the yard keeps its own part there, wall_mid (from the yard page's mesh and photo).

The courtyard sits at the same place in both pages' frames (shift 0.4 mm, 0.844 m, -2.2 mm), so the one view puts the wall
page's frame on it: the courtyard never moves, and the wall and the cabin step out to its side.

## What the one view keeps, and why

- **From the yard:** the measured cloud with its red reveal front and the tour (the truest record of the place, and Aren's
  own walk through it), the VR/AR entry, the tall-screen field of view, the mark.
- **From the wall:** the fragments as the surfaces in BOTH arrangements (4x the photo pixels on the two walls, where the red
  chalk is; 76 k faces instead of 181 k), the five looks, the row layout, the contact shadow, pinch and inertia, the adaptive
  resolution and idle frame skipping.
- **New, to make it one:** the switch Բակը · The yard / Պատը · The wall. The wall rises 2.2 m (above the
  courtyard's walls, 1.69 m), travel, turn and land in the row; the camera swings round above the yard, never through it.
  In the yard the cycle runs as before; a picked look holds until R or a double click.
- **Left out:** the yard's own mesh and its three JPEGs (the same surfaces with blurrier photos; 2.2 MB); the second arrival
  (one remains: "ԲԱԿԸ · ՊԱՏԸ"); in the yard, the wall's sampled cloud (the measured cloud is shown instead; it cannot travel
  with the fragments, so in Պատը the cloud look still samples them); the yard's drag direction (the wall's is used: drag up
  looks from higher).
- **Downloads:** 2.48 MB (cloud 0.79 + pack 1.69) instead of 4.69 MB for the two pages.

## Limits

- Photos, fixed 2026-10-21 after the owner's look ("all textures in not the right place"): the wall page decoded its
  photos with flipY=false; measured against the cloud's own colours, flipY=true is right (courtyard r 0.89, wall 0.65;
  the yard page's own parts 0.71-0.84) and flipY=false gives r about 0, so every face showed another part of the atlas.
  The ORIGINAL wall page (elevation) has the same fault; the yard page was right (its 09-28 note). Not the cause, tested:
  a swapped photo (each fits only its own fragment), a re-encoded or resized atlas (served bytes hash to their ids).
- Measured on the agent screen only (Chromium, RTX 3080): 60 fps in both arrangements at 1440x900 and 390x844. Not seen on
  a real phone or headset.

## Rebuild, apply, undo (scratch stack first; dev needs `--assets-from` a server that holds the assets)

```
python3 -I spaces/dilijan/aren/register.py --api http://dilijan-test.diiii.localhost/serverXR   # the poses (IN_YARD)
node scripts/space/combine-pages.mjs --api http://dilijan-test.diiii.localhost/serverXR --spec spaces/dilijan/combine-aren.json --apply
node scripts/space/apply-structure.mjs spaces/dilijan/structure.json --api http://dilijan-test.diiii.localhost/serverXR --apply
node scripts/space/combine-pages.mjs --api … --undo BACKUP.json --apply    # back; empties yard-original if unchanged
```

Data: the assets of `the-yard` (scans of the Dilijan camp yard, Aren, August 2026, from the camp's own pages); no new media.
