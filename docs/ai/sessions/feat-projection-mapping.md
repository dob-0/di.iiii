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

## 2026-08-28 — the toolkit around the mapper, and the Dilijan wall actually traced

The lane grew the tools a wall needs on a show night, and the camp's own wall
was traced out of its photograph into a real mapping.

- **Cues.** A named state of the show under a number key: which surfaces are up,
  how bright, showing what. Play advances on each cue's hold time; a hold of
  zero is a standby and playback stops there. **A cue holds no geometry and the
  schema enforces it** — corners and masks are dropped on the way in, because a
  keystroke must never be able to move an alignment. Firing is one op batch, and
  the fade is a CSS transition read off the same document by the desk and the
  wall, so one cue cannot fade at two speeds. Playback state is deliberately not
  in the document.
- **Snapping and guides.** Corners snap to every other surface's corners and to
  the frame, x and y independently, with the agreed line drawn while dragging.
  Optional grid. Alt ignores everything — which forced removing a mask point
  onto shift-click, since alt already meant "don't snap" and the two met.
- **A wall photo behind the surfaces on the desk**, to trace over. Never
  projected. A file from disk stays a blob URL in that browser only.
- **Camera surfaces**, duplicate, copy/paste shape and look, mask-from-outline,
  and export/import of a whole mapping as text.
- **Fullscreen and a display picker on `/out`**, hiding with the cursor.
- `serverXR`'s dev script now watches `../shared`. Editing the CJS schema mirror
  and getting a stale normalizer cost an hour twice; that class is closed.

**The Dilijan wall is traced.** `scripts/` has no part in this — the tracing was
done against the photograph in the camp's own material and the result lives at
`~/Documents/hosq-camp/dilijan-wall-mapping.json`: five surfaces named for the
five kids, corners from each paper's extreme points, and a MASK per surface from
the simplified convex hull of its blob, which is what carries the cut corners the
papers actually have (9–13 points each). Verified by underlaying the photograph
on the desk and seeing every surface sit on its paper.

Two silent failures, both found by driving the desk and reading the SERVER back,
neither visible in a screenshot:

- **Duplicate did nothing.** `{ id, ...patch }` let the copied surface's own id
  win over the generated one, so `createMappingSurface` saw an existing id and
  dropped the op. The generated id goes last now.
- **The camera branch was unreachable.** A `!ref` fallback caught every kind, so
  a camera surface with no named device — which IS the default camera — rendered
  a test pattern. Only `url`, `video` and `image` are meaningless without an
  address.

Also fixed on the way: a `python` edit that silently did not apply because it had
no assertion, which is why the duplicate fix appeared not to work the first time.

Not built, deliberately: **automatic shape detection from a wall photo.** A phone
photo is taken from where a person stood and the projector stands somewhere else,
so the quad it yields is the wrong quad — it would look like an alignment and be
a lie. The photo is an underlay to trace over instead. **A scrubbing timeline**
is also not here; cues with hold times are what a room actually runs on, and a
scrub bar needs a time model the document does not have. Still no mesh warp and
no soft-edge blending.
