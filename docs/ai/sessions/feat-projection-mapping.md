## 2026-08-27 — a projection mapper in the platform, so a space can be put on a wall

Built the `map` lane: `/{space}/map/{projectId}` (the desk) and
`/{space}/map/{projectId}/out` (the signal). A map is a project whose entities
are other projects — a list of surfaces, each one four corners, a polygon mask
and a source. Written for the hosq Dilijan showcase, where five children's
worlds have to land on five coloured rectangles of paper taped to a container
wall, from one projector.

- **DOM, not WebGL, and that is the architecture rather than a shortcut.** A
  browser cannot sample a cross-origin page into a texture, and half the sources
  that matter are cross-origin pages. `transform: matrix3d` from a solved
  homography IS a corner-pin, and an `<iframe>` pins exactly like a `<canvas>`.
  Accepts quad corner-pin only — no mesh warp, no soft-edge blending.
- `mappingState` added to the document schema with five ops, all invertible;
  undo puts a deleted surface back in its place in the paint order. Mirrored
  into `shared/projectSchema.cjs`.
- Sources: project, web page, video, image, colour, and five alignment test
  patterns that carry the surface's name.
- The desk and the output render the same `MapStage`, so there is no second
  path that could disagree about the geometry.
- Preview-boot queue lifted out of `SpaceHub.jsx` into
  `src/utils/previewBootQueue.js` and shared. SpaceHub's behaviour is unchanged.

Three things were measured rather than reasoned about, all of them after
something looked wrong on screen:

- **A project surface is an iframe, not a mounted `<LiveProjectScene>`.** Mounted
  directly it rendered at a third of its surface, anchored top-left: R3F sizes
  its drawing surface from `getBoundingClientRect()`, and under a corner-pin
  that is the transformed rect.
- **Over HTTP/1.1 a wall caps at four live page surfaces.** Each page holds a
  project event stream open and a browser allows ~6 persistent connections per
  origin; at five, four stayed black on "Loading live experience" forever.
  Proved it was the transport by putting an HTTP/2 front in front of the same
  dev stack — all five then came up. Both deployments answer h2, so this bites
  `npm run dev`, not di-studio.xyz. The desk warns when it applies
  (`transportCeiling.js`).
- **Arrow nudge is one OUTPUT pixel**, not one preview pixel — the first version
  made the step depend on how wide the browser window happened to be.

Also: a mask below three points is now KEPT rather than normalized away, or a
shape could not be traced click by click at all. `serverXR` watches only
`serverXR/src`, so that schema change needed a server restart — which looked
exactly like the client silently refusing to save.

Seen, not inferred: desk and output shot at every stage; corner drag, arrow
nudge and mask trace driven through a real browser and read back from the
server; five di.iiii scenes and three of the camp's own recovered pages
confirmed running live and correctly pinned.

Still open: no mesh warp or edge blending; the output has no fullscreen button
of its own (drag the window and press F11); nothing schedules or sequences
surfaces over time.
