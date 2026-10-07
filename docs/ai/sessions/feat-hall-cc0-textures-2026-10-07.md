## 2026-10-07 — the hall gets CC0 surfaces (opt-in `hall.py --textures`)

- Owner's screenshot of MOXIR beta looked flat; objects were plain colours with no maps (measured: every hall mesh a
  `MeshStandardMaterial` with no map and no normal map; floor one 12-triangle quad). Owner said "use CC0 textures, go".
- `scripts/place/hall-textures.py` fetches four pinned ambientCG sets (CC0 1.0, sha256 in `hall-textures.json`, retrieved
  2026-10-07), tints each colour map to the photo-sampled mean in `MATERIALS` (linear light), and `hall.py --textures`
  adds box-projected UVs (metres) plus colour + normal maps. Default output is unchanged. Guard: `hall-textures.test.js`.
- Seen: standalone viewer, plain vs textured, same camera (worn concrete, rusty girder, dusty floor; geometry identical).
- 2026-10-08 follow-up: maps deduped per set (normal map once per set; colour map once per set with a glTF
  baseColorFactor per material); each set's own Roughness map is now the metallicRoughness texture. GLB 6.06 -> 5.59 MB
  (plain 3.20). Colour means within 0.003 and roughness means within 0.001 of the table (measured on the baked files).
  Seen in the standalone viewer, plain vs previous vs new, two cameras: geometry identical, mean pixel diff 0.3-0.5/255.
  Plain (no `--textures`) GLB is byte-identical to before. Guards added in `hall-textures.test.js`.
- NOT done: the textured GLB is not re-imported into any project (needs a backup and the owner's look first); not seen
  on the owner's screen; the sets are stand-ins picked by eye, to be replaced by photographs of the hall's own surfaces;
  the metal set's roughness map is clipped by the scaling (smooth source map); the textured GLB's UVs (~0.9 MB) remain.
