## 2026-11-10 — scan.glb passes the glTF validator (container repair only)

- A global check found `src/algoVrithm/assets/scan.glb` with 2 validator errors (ACCESSOR_TOTAL_OFFSET_ALIGNMENT). Repacked the binary chunk with 4-byte-aligned bufferViews; no data, material, node or texture changed (identity proof and 0-pixel render diff are in the PR).
- Added `scripts/gltf-validate.test.js` and the pinned devDependency `gltf-validator` so every tracked .glb/.gltf is validated on each test run.
- Not tested: the work running live with the new file on a headset or phone.
