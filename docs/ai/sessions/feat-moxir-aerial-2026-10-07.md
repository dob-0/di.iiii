## 2026-10-07 — MOXIR hall measured from above: the grid holds (4 × 24 m, 6 m, 18 bays); lanterns 2.8 m short, end walls 0.7 m out

- Owner: *"the columns are still not right … check the building sizes from Google Maps and other sources"*.
- New `scripts/place/aerial_measure.py`, pinned in `aerial_requirements.txt` (venv `~/tools/geo/.venv`). Subcommands:
  - `osm`: Overpass, with fallback mirrors.
  - `ms`: Microsoft ML footprints by quadkey.
  - `overture`: timed out, owed.
  - `releases`: the distinct Esri Wayback captures, with Esri's own metadata.
  - `imagery`: tile stitching warped to UTM 38N, plus a world file.
  - `profile`: hall-frame rectification, deskew and edge profiles.
  - `comb`: the 6 m / 12 m phase-coherence test (Rayleigh).
  - `shadow`: lantern height from the shadow (NOAA solar equations).
  - `draw`: the owner overlays.
- Result in `docs/moxir/AERIAL_2026-10-07.md`, with the record `scripts/place/rigs/moxir-aerial-2026-10-07.json` (a new
  layer; nothing older edited) and data in `docs/moxir/aerial-2026-10-07/`. Owner images are in
  `~/Downloads/moxir/aerial/` (private: Esri imagery).
- Two Maxar captures were used (WV-3 2020-10-30, GE-1 2024-08-22; Esri serves z18 = 0.455 m/px here). They agree:
  roof 108.2 × 97.3 m, 4 spans × 24.0, lanterns over spans 2 and 3 (the nave and its SW neighbour), joint 53.3 m from
  the NW edge and 54.9 m from the SE edge, bearing 144.1° true.
- The 2020 roof has a 6 m rhythm, phase-coherent over 16 strips (p < 1e-4), and no 12 m rhythm.
- OSM way 289841504 (v1, 2014) is 3.5 m too narrow. Microsoft's footprint is rotated 3.2°.
- The model is wrong in two places:
  - lantern segments: ±6.0…±46.9 measured, ±7.25…±45.75 in the model;
  - end walls: outer face ±54.1 measured, ±54.8 in the model.
  Columns cannot be seen from above. The roof does not show any different pitch or span count.
- New finding: by 2024 a solar plant covers the roof, and a dark lattice band runs over the nave's right row (x +12)
  and the joint. It is SUSPECTED to be a stripped deck or cable routes. A photo straight up is owed at the 10-08 visit.
- Owed:
  - the layer file that applies the lantern and end-wall corrections, with the owner's look first;
  - the owner's 4 Google Maps measurements (in the doc);
  - Overture as a third footprint;
  - automatic edge labelling, if this is rerun on new imagery.
