## 2026-11-05 — feat/place-plan-shell: a wall plan becomes the plain shell of a room (layer 1)

- Adds `scripts/place/plan_shell.py`: a wall-plan JSON (walls_solid, walls_light, optional new_walls, columns, stairs, optional floor_rects_m) plus heights becomes a GLB (floor slabs, walls as boxes on their centre line with a thickness, columns, stair blocks as solid blocks, a separate hideable ceiling node) and a place.json that `import.mjs` reads. Every wall end is the plan's own number; the tool's `--glb` mode reads the end points back from the GLB's vertices.
- Test: `scripts/place/plan-shell.test.js` (wall count, wall ends within 0.01 m, the GLB opens, a 0.05 m move is caught, no production named in the code). It is the first piece of a room built layer by layer: shell, then openings, furniture, zones, lights.
- No second geometry rule: the room frame (x, up, -y) is the one the other place models use. Writing the GLB needs only numpy (no Blender).
- Still undone: PR and merge are the lead's.
