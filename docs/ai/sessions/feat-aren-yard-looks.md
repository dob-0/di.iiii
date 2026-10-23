## 2026-10-23 — Aren's yard opens on the photographed surfaces; the five looks are named

- Owner: "make it not like now particles … nothing is understood". The yard now starts in Colour (the scan's own photos), not the cloud-then-surfaces cycle; the looks are named buttons (Գույն · Colour, Մոնո · Mono, Սկան · Scan, Կետեր · Points, Ցանց · Wire) instead of five unlabelled dots.
- Dev showed only the-yard's original page (points for ~57 s); the combined view (combine-aren.json) still has to be applied on dev after merge.
- Seen on the test copy dilijan-front.diiii.localhost/dilijan/the-yard at 4, 15 and 40 s.
- Owner 10-23: "leave the map … look dinosaurs": the yard's three pieces stand as ONE building, fitted by the photos (painted lines across the corners, eave and foot lines), measured scale 2.443 m per scan unit, wall_mid scanned at x1.674. Record `spaces/dilijan/one-building.json` + `.md`, scripts in `spaces/dilijan/aren/one-building/`, hand-edit route `aren/to_blender.py`. IN_YARD gained `s`; the yard tour now circles the building outside its walls (the old rail ran through them). The wall view (Պատը) is unchanged.
- Trap found: the fit's `visual.json` wall pose already had the old IN_YARD folded in; composing it again put the dinosaur wall 5 units off. The pose is now re-derived from the Blender file the renders came from (residual 0).
- Owner 10-23 ("we dont need the wall anymore delete it"): the Wall view (Պատը) is gone from the page: no switch; the tab is "Բակը · Yard". Its code (IN_WALL, elevation) stays unused for now; removing it is owed.
