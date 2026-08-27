# Projection mapping — the `map` lane

`/{space}/map/{projectId}` — the mapper's desk
`/{space}/map/{projectId}/out` — the signal

A **map** is a project whose entities are other projects. It holds a list of
**surfaces**; each surface is four corners, a polygon mask, and a source. Point
a projector at a wall, drag each surface onto the shape it belongs to, and the
work runs there.

Built 2026-08-27 for the hosq Dilijan day camp, where five children's worlds had
to land on five coloured rectangles of paper taped to a container wall, from one
projector, in a room that only just goes dark.

## Why this is DOM and not WebGL

Every mapping tool worth copying — Resolume's Advanced Output, MadMapper's
surface list, KantanMapper's hand-drawn shapes — composites textures. We cannot.

**A browser cannot sample a cross-origin page into a texture.** Half the sources
that matter are cross-origin pages: work made somewhere else, published
elsewhere, reachable only by URL. A texture compositor could not show them at
all.

What a browser *can* do is apply a projective transform to any element:
`transform: matrix3d(...)` with non-zero perspective terms IS a corner-pin. An
`<iframe>` pins exactly like a `<canvas>` does. So every surface is a DOM layer:

| need | mechanism |
|---|---|
| corner-pin | `matrix3d` from a solved homography (`cornerPin.js`) |
| non-rectangular mask | `clip-path: polygon()` in the surface's own space |
| brightness / hue correction | `filter` |
| overlap | `mix-blend-mode` |

Limits this accepts, honestly: **quad corner-pin only** — no mesh warp for a
curved surface, and no soft-edge blending between two projectors. For flat paper
on a flat wall, a corner-pin is exactly enough.

## The files

| file | what it is |
|---|---|
| `cornerPin.js` | the maths — homography solve, `matrix3d`, masks, filters |
| `mapRouting.js` | the two addresses |
| `MapStage.jsx` | every surface, pinned, at a given pixel size. **The desk and the output both render this** — there is no second path that could disagree about the geometry |
| `MapSourceView.jsx` | what a surface shows |
| `MapEditorOverlay.jsx` | corner and mask handles |
| `MapSurface.jsx` | the desk |
| `MapOutput.jsx` | the signal |
| `mapTestPattern.jsx` | alignment patterns |
| `transportCeiling.js` | the HTTP/1.1 ceiling and its warning |
| `useMapDocument.js` | the document, the op layer, and the BroadcastChannel courier |

Schema lives in `src/shared/projectSchema.js` as `mappingState`, mirrored in
`shared/projectSchema.cjs`. Ops: `setMappingState`, `createMappingSurface`,
`setMappingSurface`, `reorderMappingSurfaces`, `deleteMappingSurface` — all with
inverses, so undo restores a deleted surface to its place in the paint order.

## Facts that were learned the hard way

**Corners are stored normalised (0..1 of the output frame.)** A mapping aligned
on a laptop lands unchanged on a projector at another resolution. The wall does
not move because the signal changed.

**`transform-origin: 0 0` is load-bearing.** The matrix is solved for a box
whose origin is its top-left. Any other origin shifts every surface.

**A project surface is an iframe, not a mounted scene.** The first build mounted
`<LiveProjectScene>` directly and it rendered at about a third of its surface,
anchored top-left: @react-three/fiber sizes its drawing surface from
`getBoundingClientRect()`, and a rect measured under a corner-pin is the
*transformed* rect. An iframe has its own layout viewport, so the page inside is
laid out at the surface's real size and the transform scales the finished
picture as one piece. It also reuses `?preview=1`, which the platform already
built for exactly this (static camera, no chrome, low-power loop).

**Page surfaces boot through a queue** (`utils/previewBootQueue.js`, shared with
SpaceHub). Five asked to start together all stalled on "Loading live
experience"; one at a time they are up in seconds.

**Over HTTP/1.1 the wall caps at four live page surfaces.** Each page holds a
project event stream open, the output page holds one itself, and a browser
allows about six persistent connections per origin — past that every remaining
request queues forever. Measured: five project surfaces over HTTP/1.1 gave one
scene and four black rectangles; the same five over HTTP/2 all came up. Both
`di-studio.xyz` and `staging.di-studio.xyz` answer h2, so a deployed wall is
fine. `npm run dev` is plain HTTP/1.1, and a show driven from a laptop running
the dev server is exactly where this bites. The desk warns when it applies.

**Alignment patterns are full white on black and nothing softer.** A projector
throwing a mid-grey line onto coloured paper in a half-dark room leaves nothing
for the eye to align to.

**Projecting onto coloured paper is subtractive.** Orange paper absorbs blue;
every source is tinted toward the paper's own hue. Either make that the idea
(each world seen through its owner's colour) or use white fields with a coloured
border. The per-surface brightness/contrast/saturation/hue controls exist to
claw some of it back, not to fix it.

**`serverXR` watches only `serverXR/src`.** Editing `shared/projectSchema.cjs`
needs a server restart or the running process keeps the old normalizer — which
looks exactly like the client silently refusing to save.

## Looking at it

```
node scripts/look-map.mjs <out-dir> [base] [space] [project]
```

Shoots the desk and the output and reports what was drawn. It asserts nothing:
a mapping is a visual thing, and the numbers are there so a black screenshot can
be told apart from an empty mapping.
