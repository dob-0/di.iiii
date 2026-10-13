## 2026-10-13 — cloud: the cranes writer is guarded (forty_watt_route_r3 kept, ok:false caught)

- `scripts/place/moxir_v2_cranes.py build` REPLACED `forty_watt_route_r3` in `moxir-lasers-on-crane-2026-10-09.json` with its own constant, dropping the file's `owner_decision` and `precondition` (21 keys in, 19 out). Red test first, then the writer merges (`dict(existing, **FORTY_ROUTE_R3)`); the merged values equal the committed file.
- New `scripts/place/moxir-v2-cranes-writer.test.js`: runs the real `build()` (real `lay_patch`, merge and writer) in a scratch copy of `rigs/` with `checks()`/`data()` stubbed, because the hall GLB is not in git. Three tests: keys kept; the good build passes the patch gate (no `ok:false`); a build that writes `ok:false` into the patch block fails the gate.
- Place suite, same container, python deps installed: 339 passed before, 342 after. (The 337 → 342 figure was measured on a machine with the GLB; this container skips 27 for the missing GLB.)
- Not verified: the stubbed `checks()` numbers (still `moxir-v2-cranes.test.js`'s job); a real `build` against the GLB.
