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

The wall page's fragments wall and courtyard ARE the yard's own parts wall_right and main, decimated: they share the
photo atlas (the courtyard's UVs equal main's, median |du| 0.0000, |dv| 0.0001; the wall's photo is wall_right's atlas at
2048 px with real detail above 832 px: 0.88 % of the luma energy against 0.10 % for an upscale). The same UV is the same
surface point, so `register.py` fits each pose through the UVs (trimmed Kabsch; no search):

| fragment | yard part | residual median | p90 | tilt |
|---|---|---|---|---|
| wall | wall_right | 0.01 cm | 0.22 cm | 4.30 degrees |
| courtyard | main | 0.03 cm | 0.40 cm | 0.00 |
| cabin | none: shares no atlas, matches no shape | - | - | - |

The wall leans 4.3 degrees in the yard; the wall page stood it upright. The first registration (N1123, yaw-only ICP) could
not turn it back, so the wall stood up to 8.2 cm off (p90) until N1131.

## What the one view keeps, and why

- **Բակը is the yard page's own texturing** (N1131, owner: "wrong texturing, it is not the right textured"): the yard's
  own mesh parts main and wall_mid with their own photos, drawn as photographed (unlit, full colour, the way the yard
  page drew them), under the measured cloud, its red reveal front and the tour; the VR/AR entry, the tall-screen field of
  view, the mark.
- **The wall's sharper photo is kept where it truly fits:** at its exact pose the wall fragment fits the yard's cloud as
  well as the yard's own wall_right (r_patch 0.99 both; 97 % and 98 % of it within 3 cm) with 6x the photo pixels, so it
  stands in the yard and travels to the row.
- **Պատը is the wall page's:** the fragments wall, cabin and courtyard, the five looks in its light, the row, the contact
  shadow, pinch and inertia, adaptive resolution, idle frame skipping. The courtyard fragment and main are the same
  surface: they swap at the start and the end of the move (0.05 s), the colour eases from photographed to the wall's light.
- **New, to make it one:** the switch Բակը · The yard / Պատը · The wall. The wall rises 2.2 m (above the courtyard's
  walls, 1.69 m), travels, turns and lands in the row; the camera swings round above the yard, never through it.
- **Left out:** the yard's wall_right (the wall fragment covers it) and the second arrival (one remains: "ԲԱԿԸ · ՊԱՏԸ").
- **Downloads:** 2.64 MB (cloud 0.79, mesh 1.80 with its two photos 0.30, pack 1.69 minus what is shared) instead of
  4.69 MB for the two pages. Faces drawn: about 153 k in Բակը (the yard page drew 181 k), 76 k in Պատը.

## Photos, measured per fragment (texcheck.py, 2026-10-21, N1131)

Seams: the colour on both sides of a 3D edge shared by two charts (r of luma; flipY=false in brackets). Cloud: the photo at
the surface against the yard cloud's own colours within 3 cm, at the page's poses (10 cm patches, exposure fitted).

| surface | seams r | cover | r_patch | good | best wrong mapping r_patch |
|---|---|---|---|---|---|
| yard main (Բակը) | 0.85 (-0.01) | 98 % | 0.99 | 96 % | 0.09 |
| yard wall_mid (Բակը) | 0.72 (0.03) | 98 % | 0.97 | 94 % | 0.10 |
| wall fragment (both) | 0.89 (-0.00) | 97 % | 0.99 | 97 % | 0.30 |
| courtyard fragment (Պատը) | 0.86 (-0.02) | 93 % | 0.97 | 93 % | 0.09 |
| cabin fragment (Պատը) | 0.94 (0.01) | not in the yard scan | | | |
| before N1131: wall at the yaw-only pose | | 54 % | 0.78 | 70 % | |

Wrong mappings tried for each surface: flipY=false, u/v swapped, u mirrored, every other photo of its set.
Rendered against the yard page itself (same camera, auto look at the hold; aren-tex harness): mean |dRGB| 26-45 and luma
0.62-0.77x before, 0.7-3.6 and 1.00x after, at 1440x900 and 390x844.

## Limits

- Holes: the yard's own mesh has small holes (near the bean bags) where the paper shows through, as on the yard page; the
  wall page's courtyard had them filled. The yard keeps its own record.
- The cabin is not in the yard scan, so its photo can be checked only by its seams (r 0.94).
- Measured on the agent screen only (Chromium, RTX 3080). Not seen on a real phone or headset.

## Rebuild, apply, undo (scratch stack first; dev needs `--assets-from` a server that holds the assets)

```
python3 -I spaces/dilijan/aren/register.py --api http://dilijan-test.diiii.localhost/serverXR   # the poses (IN_YARD)
python3 -I spaces/dilijan/aren/texcheck.py --api http://dilijan-test.diiii.localhost/serverXR   # the photo table above
node scripts/space/combine-pages.mjs --api http://dilijan-test.diiii.localhost/serverXR --spec spaces/dilijan/combine-aren.json --apply
node scripts/space/apply-structure.mjs spaces/dilijan/structure.json --api http://dilijan-test.diiii.localhost/serverXR --apply
node scripts/space/combine-pages.mjs --api … --undo BACKUP.json --apply    # back; empties yard-original if unchanged
```

The target's token (`DI_TOKEN`) never goes to an `--assets-from` server on another host; give that one its own
`DI_ASSETS_TOKEN` if it needs one. A run that stops after keeping `yard-original` still leaves its backup, so `--undo`
empties it.

Data: the assets of `the-yard` (scans of the Dilijan camp yard, Aren, August 2026, from the camp's own pages); no new media.
