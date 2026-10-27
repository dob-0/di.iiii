## 2026-10-22 — Aren's scans as the one building, on the map (N1145.3)

- The owner rejected the one-line Պատը (N1145.2): "look to map … 4 parts of the one building … full like building". Stacked on #1067
  (feat/dilijan-aren-one-view, merged in), since the page `spaces/dilijan/aren/yard.html` is not on dev yet.
- Footprint: OSM API 0.6 way 457239427 (Overpass unreachable from aylmo; the OSM API answers), the building 13 m from the Apicius
  Armenia node 13296475769 inside its site (way 1447247415). `scripts/place/osm_footprint.py` -> `spaces/dilijan/building-footprint.json`.
- `spaces/dilijan/aren/building.py`: pieces where the yard scan holds them (no layout); similarity fit of the scan's long face
  (main + wall_mid, bend and north corner) on the footprint's north-west face: 3.84 m/unit, 42.9 deg; facade->edge median 0.14/0.17 m,
  p90 0.29/0.33 m; corners 0.39/0.50 m. -> `spaces/dilijan/building-pieces.json`, IN_WALL / WALL_VIEW / FOOT in the page.
- `scripts/space/refresh-combined-tab.mjs`: refresh one file tab of a combined page (backup, read-back, --undo).
- Scratch stack only (dilijan-front); checkpoint ~/di-backups/dilijan-building-2026-10-22/RESTORE.md. Tests: spaces/dilijan/aren 17 passed.
- Open: which side the yard is on (north-west kept: its ground and the yard wall; the courtyard's photographed side says south-east);
  main runs 5.3 m past the footprint's west corner; the main page (dilijan-home hero + 3D band) not started — after his look.
