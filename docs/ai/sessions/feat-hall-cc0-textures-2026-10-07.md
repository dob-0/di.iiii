## 2026-10-07 — the hall gets CC0 surfaces (opt-in `hall.py --textures`)

- Owner's screenshot of MOXIR beta looked flat; objects were plain colours with no maps (measured: every hall mesh a
  `MeshStandardMaterial` with no map and no normal map; floor one 12-triangle quad). Owner said "use CC0 textures, go".
- `scripts/place/hall-textures.py` fetches four pinned ambientCG sets (CC0 1.0, sha256 in `hall-textures.json`, retrieved
  2026-10-07), tints each colour map to the photo-sampled mean in `MATERIALS` (linear light), and `hall.py --textures`
  adds box-projected UVs (metres) plus colour + normal maps. Default output is unchanged. Guard: `hall-textures.test.js`.
- Seen: standalone viewer, plain vs textured, same camera (worn concrete, rusty girder, dusty floor; geometry identical).
- NOT done: the textured GLB is not re-imported into any project (needs a backup and the owner's look first); not seen
  on the owner's screen; GLB is 6.1 MB against 3.2 MB (one copy of each map per material — dedupe owed); the sets are
  stand-ins picked by eye, to be replaced by photographs of the hall's own surfaces.
