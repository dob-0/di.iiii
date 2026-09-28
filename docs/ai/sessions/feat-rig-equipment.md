## 2026-09-28 — the equipment list and the inventory: `/{space}/equipment/{project}`, E in build mode

- Asked: a place to add and delete devices (not everything on the quote is used), then — the
  same day — a Minecraft-style inventory with item cards ("what is what", real alternatives).
  Method and checks: `docs/architecture/RIG_BUILD.md` §13.
- One draft PR on #622 (`feat/rig-equipment`). The list keeps its component name
  (`rentalList`) so A, B and C follow with no copy; new fields in both schema copies.
- Content: `src/rigbuild/items/*.json`, written by three research agents from cited sources
  (maker pages, manuals, ILDA/HSE/FDA for lasers, OSHA for CO₂, ANSI E1.11/E1.31, Art-Net 4);
  checked by `items.test.js`. Renders: `blender -b --factory-startup -P
  scripts/rigbuild/item-renders.py` (Workbench, CPU, seconds). Photos: Wikimedia Commons only.
- Own stack: server :4395, vite :5395 (never 4000/443/80 or the other agents' ports); data the
  rigbuild3d baseline bundle imported into the session scratchpad (`rigequip/data`), desk show
  from the same baseline. Harness: `rigequip/shot.mjs` (headless, 3D off, DPR 2 / DPR 3, a
  narrow-text sweep) and `rigequip/gpu.mjs` (PRIME + ANGLE/Vulkan, renderer string checked,
  95 °C guard). Shots: `~/Downloads/rig-equipment/`.
- Thermal: 2D headless throughout; the renders on the CPU in Workbench (≤ 78 °C); the first GPU
  run peaked 79 °C; the second started at 85 °C and hit 97 °C — the guard closed it. Wait below
  80 °C before a GPU run.
- Changed: E is the inventory in build mode, as in Minecraft; lowering the hand is Z (was E).
- Owed: see RIG_BUILD.md §13.7.
