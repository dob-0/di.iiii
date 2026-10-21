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
| cabin | wall_mid, scanned apart at 1.19x its size: no shared atlas, so no UV fit; `elevation.py` registers it by its facade (N1145, below) | 0.58 cm (scale 0.840) | 2.00 cm | - |

The wall leans 4.3 degrees in the yard; the wall page stood it upright. The first registration (N1123, yaw-only ICP) could
not turn it back, so the wall stood up to 8.2 cm off (p90) until N1131.

## What the one view keeps, and why

- **Բակը is the yard page's own texturing** (N1131, owner: "wrong texturing, it is not the right textured"): the yard's
  own mesh parts main and wall_mid with their own photos, drawn as photographed (unlit, full colour, the way the yard
  page drew them), under the measured cloud, its red reveal front and the tour; the VR/AR entry, the tall-screen field of
  view, the mark.
- **The wall's sharper photo is kept where it truly fits:** at its exact pose the wall fragment fits the yard's cloud as
  well as the yard's own wall_right (r_patch 0.99 both; 97 % and 98 % of it within 3 cm) with 6x the photo pixels, so it
  stands in the yard and travels to the elevation.
- **Պատը is the wall page's:** the fragments wall, cabin and courtyard (laid out as one building since N1145, below), the five
  looks in its light, the contact shadow (one per piece), pinch and inertia, adaptive resolution, idle frame skipping. The courtyard fragment and main are the same
  surface: they swap at the start and the end of the move (0.05 s), the colour eases from photographed to the wall's light.
- **New, to make it one:** the switch Բակը · The yard / Պատը · The wall. The wall rises 2.2 m (above the courtyard's
  walls, 1.69 m), travels, turns and lands in the elevation; the camera swings round above the yard, never through it.
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
| cabin fragment (Պատը) | 0.94 (0.01) | scanned apart (wall_mid, 1.19x): not by UV | 0.55 at the facade registration (N1145; wall_mid's own photo 0.97: another photo set) | - | - |
| before N1131: wall at the yaw-only pose | | 54 % | 0.78 | 70 % | |

Wrong mappings tried for each surface: flipY=false, u/v swapped, u mirrored, every other photo of its set.
Rendered against the yard page itself (same camera, auto look at the hold; aren-tex harness): mean |dRGB| 26-45 and luma
0.62-0.77x before, 0.7-3.6 and 1.00x after, at 1440x900 and 390x844.

## Պատը as one building, an elevation (N1145, 2026-10-21)

Owner: *"look walls parallel, windows parallel it the one building … fix wall windows here"* (the wall view). Measured with
`elevation.py` on the scans in the page (scratch stack, seed 7); "before" is the page as N1131 left it.

**What he saw, and why (measured).** The three facades were already within 2.74 degrees of each other in plane (yaw 2.55 /
2.67 / 3.52, tilt 2.28 / 1.36 / 0.28 for wall / cabin / courtyard). They looked "at different angles" for three reasons: the
camera looked 24 degrees from the left and 17 degrees from above (theta -0.42, phi 0.30), so the chalk wall's real roof slope
(-5 degrees) read flat while the level eaves of the other pieces ran uphill; the cabin was rolled 1.45 degrees in its own
plane, so its window row sloped; and the window rows stood at different heights.

**What the page does now.** The pieces are laid out as the developed elevation of architectural drawing: each facade is turned
onto the courtyard's facade plane with its photographed side to the viewer, levelled to true horizontal, its foot on one ground
line, in the order wall | cabin | courtyard, with the gaps taken from the scan (0 cm: the pieces meet; the wall round the
corner at 55 degrees, the cabin along the line). The courtyard does not move. Nothing is stretched or drawn in: the cabin
keeps its scanned shape at the yard's scale (0.840 of its own, below). The camera faces the facades (theta 0.06, phi 0.10) and
the idle drift stays within 7 degrees of that, so it stays an elevation. It frames everything drawn: 17.46 m along the level
line, tent and divider included (the facades alone span 14.70 m; fitted to them the courtyard's tent was cut off at the right
edge of a phone, seen in the first after picture). The baked contact shadow is cut per piece and travels with it.

| measure (elevation.py) | before | after |
|---|---|---|
| max angle between the facade normals | 2.74 degrees | 0.13 degrees |
| roll of each facade's edge lines, wall / cabin / courtyard | 0.48 / 1.45 / -0.15 degrees | -0.10 / 0.23 / -0.14 degrees |
| feet (ground line) spread, three pieces | 5.15 cm | 0.22 cm |
| sill spread inside a piece, cabin / courtyard | 4.0 / 2.0 cm | 1.0 / 1.0 cm (one pixel) |
| sill spread across the pieces | 13.4 cm | 16.5 cm: two real window types (Limits) |

Moved from the scan, developed elevation: wall turned 131.5 degrees, moved 15.5 m (unfolded round the corner), 3.0 cm down;
cabin turned 173.2 degrees, moved 8.8 m, 3.7 cm up, scale 0.840; courtyard 0.

**The cabin is the yard's back wall.** The wall page's "cabin" is `wall_mid`, scanned apart at 1.19x its size; that is why it
shares no atlas and why the rigid-only search (N1123, N1131) found nothing. Evidence: the elevation pictures of the two overlap at
scale 0.840 (door, dish, all 3 window frames, the criss-cross strings); ICP with a scale on the meshes leaves a residual median
0.58 cm, p90 2.00 cm, 94 % within 3 cm.

| step | method (source) |
|---|---|
| facade plane | sequential RANSAC (Fischler and Bolles 1981) on area-weighted samples, refined by the PCA plane of the inliers |
| photographed side | the triangles' winding normals; all six meshes share one convention (ground normals +0.97 to +0.98 up) |
| level | projection-profile skew of the orthographic elevation (Postl 1986), roof-edge and foot bands masked; the foot's Theil-Sen line when too few edges |
| window frames | reported only: components that repeat in one row (Lee and Nevatia 2004; Mueller et al. 2007) |
| a piece scanned apart | elevation-image NCC for the start, then trimmed ICP with a uniform scale (Umeyama 1991) |
| layout | developed elevation; gaps measured in the scan's plan |

Rebuild (reads the scans from the scratch stack, writes `IN_WALL` and `WALL_VIEW` into `yard.html`; about 3 minutes) and test
(4 cases with known answers, about 200 s; `aren-building.test.mjs` runs them and checks the page):

```
python3 -I spaces/dilijan/aren/elevation.py --api http://dilijan-test.diiii.localhost/serverXR --write
python3 -I -m unittest discover -s spaces/dilijan/aren -p elevation_test.py
```

## Limits

- Holes: the yard's own mesh has small holes (near the bean bags) where the paper shows through, as on the yard page; the
  wall page's courtyard had them filled. The yard keeps its own record.
- The cabin's photo is another photo set than wall_mid's, so it is checked by its seams (r 0.94) and, weakly, against the
  yard cloud at its facade registration (r_patch 0.55, against 0.97 for wall_mid's own photo). The earlier line "not in the
  yard scan" was wrong (N1145): the rigid-only search of N1123 and N1131 could not find a piece at another scale.
- Պատը as one building (N1145): the sill and head lines of the cabin (sill 0.30, head 0.65-0.69) and of the courtyard (sill
  0.49-0.50, head 1.05-1.09) are different window types of the one scan (yard units). With every foot on one ground line they
  cannot also share one sill line unless something is stretched (about 16 cm), so they do not: windows are parallel and
  level, not on common sill lines. Inside each piece the sills are on one line (within 1 cm, one pixel of the elevation).
- One elevation cannot show all three pieces from their photographed sides with true neighbours: the courtyard's window
  facade was photographed from outside (+z), the cabin and the wall from inside the courtyard (-z), so the courtyard's own
  left to right runs against the building line (its divider end is at its far right, not next to the cabin). A mirrored
  photo would fix it and would be false; the order kept is the wall page's own and the courtyard's view: wall | cabin | courtyard.
- The scan's absolute scale is unverified (a door measures about 0.6 "m"): only relative sizes are used.
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
