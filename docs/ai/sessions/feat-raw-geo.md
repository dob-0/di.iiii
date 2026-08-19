## 2026-08-19 — the Geo: a clear place to collect a scene

The owner, after the desk trilogy: "still mess — when add geo its empty geo,
nothing in it, not even grid; it's a clear geo you can enter and in it collect
what you need — object, light… and so on." Two facts made that true: no
container was simply a PLACE (the desk draws a shell box, the constructor only
wears primitive descriptors, a world hides its children), and a Light could
not be collected at all — `world.light` was a settings card with no body.

- **`geom.geo`, label Geo** — TouchDesigner's Geometry COMP by name, the
  plainest container there is: spatial, a container, renders its children
  through the childMap like any spatial parent, adds NOTHING of its own. Empty
  it shows a faint cyan floor tile (2×2 grid + a near-invisible pickable
  plate), because an empty place reading as void was the exact report.
- **`world.light` is standable**: render spatial-3d, new `color`/`intensity`/
  `position` inputs; placed INSIDE any container it renders a real
  `pointLight` plus a small emissive marker. Unparented at root it draws
  nothing — every existing document keeps exactly the look it had, and the
  ambient/directional per-scope settings job is untouched. Guarded both ways
  in RawViewport.test.
- Anatomy manifest resynced (its gate caught the new cases, again);
  PLACEABLE_CONTAINER_LABELS and all container hints pick Geo up automatically.

### Verified

Driven end-to-end at 1440×900 and screenshot-read: place Geo (footprint tile
visible on the empty desk) → enter (`inside Geo ?`, grid there) → collect a
Cube and a Light by double-click (both appear behind the cards as they land,
the Light as a glowing orb) → walk out: the Geo card reads `2 ›` and the cube
and light stand IN the geo in the room. No console errors.

### Left deliberately

- A Light inside a Geo lights the scene it renders in (one three.js tree), but
  per-scope ambient settings still come from the CURRENT scope's active Light
  only — TD's render-scoping (Light Masks) is its own feature.
- The container zoo (Desk/Stage/Constructor) is untouched; the Geo is the
  recommended default and the wiki says so. Retiring or folding the others is
  an owner decision.
