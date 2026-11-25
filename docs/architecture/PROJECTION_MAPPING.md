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
| `cornerPin.js` | the maths — homography solve, `matrix3d`, masks, filters, snapping |
| `mapRouting.js` | the two addresses |
| `MapStage.jsx` | every surface, pinned, at a given pixel size. **The desk and the output both render this** — there is no second path that could disagree about the geometry |
| `MapSourceView.jsx` | what a surface shows |
| `MapEditorOverlay.jsx` | corner and mask handles |
| `MapSurface.jsx` | the desk |
| `MapInspector.jsx` | one surface's properties, and copying between surfaces |
| `MapCueList.jsx` | named states of the show, and playback |
| `MapOutput.jsx` | the signal, plus its own fullscreen and display picker |
| `mapTestPattern.jsx` | alignment patterns, and the dim identification card a new surface starts on |
| `transportCeiling.js` | the HTTP/1.1 ceiling and its warning |
| `useMapDocument.js` | the document, the op layer, and the BroadcastChannel courier |
| `lightingLink.js` | the one wire to the lighting desk at `/light` |

Schema lives in `src/shared/projectSchema.js` as `mappingState`, mirrored in
`shared/projectSchema.cjs`. Ops: `setMappingState`, `createMappingSurface`,
`setMappingSurface`, `reorderMappingSurfaces`, `deleteMappingSurface`,
`createMappingCue`, `setMappingCue`, `reorderMappingCues`, `deleteMappingCue`,
`createMappingVisual`, `setMappingVisual`, `deleteMappingVisual`,
`reorderMappingVisuals` —
all with inverses, so undo restores a deleted surface or cue to its place in the
order.

## Cues

A cue is a named state of the show that a number key fires: which surfaces are
up, how bright, showing what. `Play` advances through them on each cue's hold
time; a hold of zero means "wait for a person" and playback stops there, which
is a stage manager's standby, not an error.

**A cue holds no geometry, and the schema enforces it** — corners and masks are
dropped from a cue's surface map on the way in. Corners and masks are the wall;
cues are the show. A cue that could move an alignment would let one keystroke
undo an afternoon spent on a ladder.

Firing a cue is ONE op batch: the fade and every surface it touches land in the
same document version, so the wall never shows a half-applied cue. The fade is a
CSS transition on the surfaces themselves — the desk preview and the wall read
the same number out of the same document, so one cue cannot fade at two speeds.
`.map-stage-surface` declares `transition: opacity 0s` in CSS so a cue only has
to change the DURATION; a transition introduced for the first time in the same
style change as the value it should animate does not reliably run.

Playback state is deliberately NOT in the document. Two windows watching one
mapping must not each believe they are running the show.

**A cue can also carry light.** `cue.lightScene` is optional and holds the ID of
a scene on the lighting desk (`serverXR/src/lighting`, served at `/light` on a
LOCAL di.iiii). Firing the cue POSTs `/light/api/scenes/recall {id, fadeMs}` —
the cue's own fade, converted from seconds once, in `lightingLink.js`. The ID is
stored and the NAME is shown: a scene renamed at the venue is still the scene
the cue meant.

Every call to the lighting desk goes through `lightingLink.js`, and every one is
fire-and-forget with a catch. The desk is absent far more often than it is
present — a hosted di.iiii answers 404 for the whole `/light` tree — and a
projection cue that waited on a rig, or threw when there wasn't one, would make
the wall depend on the least available thing in the room. The wall is the
promise; the light is a bonus. For the same reason the toolbar's "Light" link
and the cue editor's scene picker are drawn only after a `GET /light/api/summary`
probe answers 200, so a hosted tab never offers a door that leads to a 404.

The field is emitted only when it holds something, so every mapping written
before cues could carry light round-trips byte-identical.

## Screens and visuals (2026-10-25)

A show used to be surfaces only. A surface was both a place on the wall and the
thing playing there, so ten visuals meant ten surfaces stacked on one rectangle,
switched by cues that copied every surface's source. That is how a cue recorded
before a fix put an old visual back in the middle of a show. Now the two are
apart.

A screen is a surface whose source is `wall`. It shows its own piece of the wall
picture: `input` is a rectangle `[x, y, w, h]` in the output's normalised space,
and the corners are where that rectangle lands. With no `input`, the screen shows
the box its corners make, so a screen nobody has warped shows exactly the pixels
under it.

`mapping.visuals` is the bank, and `mapping.playing` is the id of the visual on
the wall. The wall picture is drawn at the output's own width and height, so a
visual made for 3200x1440 lands pixel for pixel. A screen of kind `visual` is the
exception: it plays one visual from the bank by itself, fitted to that screen.

Unwarped plain screens (no mask, full opacity, no filter, no blend) share ONE
copy of the playing visual, clipped to their rectangles. We do this because an
HTML visual is an iframe, an iframe cannot be sampled and copied, and so every
extra copy costs a full frame of its own. A warped screen, or one with a mask,
dimming or a blend, has to be drawn bent or blended on its own, so it gets its
own copy.

Playing a visual goes through the performance path, never undo history. It is
what a person does live, and Ctrl+Z in the middle of a show must not walk the
wall back through every visual that was played.

HTML visuals are uploaded project assets. The server serves them with
`Content-Security-Policy: sandbox allow-scripts allow-pointer-lock`, and the
desk frames them with the same sandbox and without `allow-same-origin`. The file
lives on our own origin, and `allow-same-origin` would hand it our session. It
runs as nobody, which is all a visual needs.

Old surfaces and cues still work as they did. Cues are hidden on the desk when a
project has none, so a screens-and-visuals show does not carry an empty cue panel.

## The mapping window (2026-10-25)

The Mapping button opens a window that copies Resolume Arena's Advanced Output
button for button (`src/map/MapAdvancedOutput.jsx`). Two tabs: Input Selection
(which piece of the composition each slice takes) and Output Transformation
(where it lands on the wall and how it bends). A slice tree sits under its
screen, front-first, with a Help box under it that explains whatever the mouse
is over. The toolbar has zoom, undo and redo, hand, snap, grid, and the two
tools, Transform (move, scale, rotate whole slices) and Edit Points (bend
them). The right panel has typed values with a minus and a plus, flip, Is Key,
Black BG, brightness, contrast, red, green, blue, Soft Edge and Warping.

A slice is drawn in three steps, and the maths is in `src/map/sliceGeometry.js`:

1. Input. `input` and `inputRotation` choose the piece of the wall picture.
2. Warp. A grid of points bends the slice's own unit square.
3. Pin. The unit square is corner-pinned onto the four `corners` by a
   homography.

`corners` stays the one source of truth for where a slice sits. We do this
because the 3D screen link, the Perform desk and every older build still read
only corners, and a slice must stay where it was for all of them.

The numbers in Transform mode (X, Y, Left, Top, Width, Height, Rotation) are
read from the corners and written back to them as an affine move: translate,
scale along the slice's own axes, or rotate about its centre. A slice that is
already keystoned keeps its keystone when you widen it, and a rotated slice
widens along its length, not along the screen. The numbers for a keystoned quad
are averages a person would call its size.

Warp points are stored in the pre-pin local space, on `surface.warp`
(`mode`, `divisionsX`, `divisionsY`, `points`), row-major, with
(2^d + 1) points each way and the four corner points forced to the corners.
Because they live before the pin, moving or rotating the whole slice carries
its bends with it. Changing Subdivisions resamples the old surface at the new
points, so the shape you already bent is kept. Three modes: linear (bilinear
inside each cell), bezier (a Catmull-Rom patch through every point) and
perspective (points ignored, corners only). A warp costs nothing until a point
has actually moved (`isWarpActive`).

The bent picture is drawn by a WebGL mesh (`MapMeshLayer.jsx`), a 32 by 32
lattice textured with the source, and only for sources whose pixels a page may
read: video, image, camera, test card and colour. A web page cannot be on that
list. It is an iframe, a browser never lets the page around an iframe read its
pixels, and so it cannot become a texture. A warped slice showing a web page
keeps its four corners and the usual corner-pin transform, and the window says
so beside the Subdivisions rows. The mesh keeps the canvas to the slice's own
bounding box, and does not lose its context on unmount, because StrictMode
mounts twice and a lost context stays lost.

Soft edge is for the overlap of two projectors. It is Paul Bourke's edge-blend
curve, and Power, Luminance and Gamma are his three numbers. Left, right, top
and bottom say how far in from each edge the fade reaches. On the CSS path it
is a `mask-image` of two linear gradients, intersected; on the mesh it is the
same curve as a 256-pixel lookup texture.

Colour (brightness, contrast, red, green, blue) is one SVG `feComponentTransfer`
per slice, drawn into a hidden `svg.map-colour-defs` and pointed at by the
slice's CSS filter. One filter per slice and not a pile of CSS filters, so
brightness and contrast are not applied twice and each channel gets its own
slope and intercept. At the defaults there is no filter at all.

Is Key makes a slice a luma key: `grayscale(1)` plus `mix-blend-mode:
multiply`, so where the slice is dark the slices under it disappear. Black BG
off makes the slice's background transparent, so what is under it shows
through.

Every change in the window is made as it is clicked, so the wall follows live.
Cancel puts back a snapshot taken when the window opened: it deletes slices
that did not exist, sets or recreates the ones that did, restores the order
and the output size, and closes. Save & Close just closes.

Presets live in `localStorage` on that machine (`di.map.presets.v1`), by name,
holding every slice and the output size. They are not part of the project and
do not travel with it. The layouts in the same menu (`screenPresets`) replace
all slices.

Tests: `sliceGeometry.test.js`, `MapStage.slice.test.jsx`,
`MapAdvancedOutput.test.jsx`.

## Snapping

Corner drags snap to a grid (off by default) and then to guides: every corner of
every other surface, plus the frame's edges and centre. X and Y snap
independently, because a corner often wants a neighbour's height without wanting
its column, and the line it agreed with is drawn while dragging — a snap nobody
can see is a snap nobody can trust. **Alt ignores both.** Every tool that snaps
needs one key that doesn't, or the surface that genuinely sits a hair off its
neighbour cannot be expressed at all.

One modifier, one meaning: alt is "ignore snapping" everywhere, so removing a
mask point is SHIFT-click. The two met once and reaching for an unsnapped mask
point deleted it instead.

## The wall photo

A photograph of the wall can sit behind the surfaces on the desk, at an
adjustable opacity, to trace paper edges over. It is never drawn on the output —
it is a tracing aid, not part of the show.

A file chosen from disk is held as a blob URL **in that browser only**: it means
nothing to another machine, and a wall photo baked into the document as base64
would follow every edit forever. `reference.url` in the document is for a photo
that has a real address.

Automatic shape detection from the photo is deliberately NOT here. A phone photo
is taken from where a person stood, not from where the projector stands, so the
quad it yields is the wrong quad — it would look like an alignment and be a lie.
Trace over the photo, then correct against the projector.

## Carrying a mapping between machines

Export and Import move the whole `mappingState` as readable JSON, in a paste box
rather than a file download: the machine that aligns a wall is often not the
machine that made the mapping, and text crosses a chat window, a notes app or a
USB stick alike. Import REPLACES — a merge would silently keep surfaces the
person pasting has never seen — and applies as one op batch, so a half-applied
import can never be what is on the wall when somebody walks in.

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
`di-studio.xyz` and `dev.diiii.xyz` answer h2, so a deployed wall is
fine. `npm run dev` is plain HTTP/1.1, and a show driven from a laptop running
the dev server is exactly where this bites. The desk warns when it applies.

**Alignment patterns are full white on black and nothing softer.** A projector
throwing a mid-grey line onto coloured paper in a half-dark room leaves nothing
for the eye to align to.

**But a new surface is not born on one.** The owner's standing rule — never put
white on the projector, warm colours only — was set in a club at midnight after
a white test card hit the wall, and on a two-machine rig the wall is lit from
the instant somebody presses Add, before anyone has chosen what the surface
shows. So a new surface starts on `test`/`card`: a dim warm **identification
card** that names the surface, deep amber on near-black, nothing above ~38% of
full brightness and no pixel anywhere near white. Measured on the real `/out`
page at 1440x900: max luminance 96.4/255, zero pixels with min(r,g,b) > 200;
the same surface switched to the grid on purpose reads 255/255 and 7,574 of
them. Several fresh surfaces are told apart by the name each one prints, which
is what somebody aiming three projectors one at a time actually needs.

**The card is a `ref`, not a `source.kind`.** `MAPPING_SOURCE_KINDS` is a closed
list and `normalizeMappingSurface` replaces any kind it has not heard of with the
default — so a `card` KIND opened by an older build would be rewritten to `test`
and the choice lost for good. A `ref` is a free string: an older build keeps it
byte-identical and merely draws the grid meanwhile. Same reasoning applies to
anything else added to the source model.

**Projecting onto coloured paper is subtractive.** Orange paper absorbs blue;
every source is tinted toward the paper's own hue. Either make that the idea
(each world seen through its owner's colour) or use white fields with a coloured
border. The per-surface brightness/contrast/saturation/hue controls exist to
claw some of it back, not to fix it.

**A generated id must go LAST when building a surface from another one.**
`{ id, ...patch }` let Duplicate — which passes the whole surface it is copying,
`id` included — keep the original id, so `createMappingSurface` saw an id that
already existed and dropped the op. The button did nothing at all, silently, and
only a count-before/count-after check found it.

**An empty `ref` does not mean "unfinished".** For a camera it means "whichever
camera this machine has". A `!ref` fallback that caught every kind quietly
rendered a test pattern instead and made the whole camera branch unreachable.
Only `url`, `video` and `image` are meaningless without an address.

**`serverXR` used to watch only `serverXR/src`.** Editing `shared/projectSchema.cjs`
then needed a manual restart, or the running process kept the old normalizer and
silently dropped every field it had not heard of — which looks exactly like the
client refusing to save, and cost an hour twice before the cause was found. Its
dev script now watches `../shared` as well. If a field you just added comes back
missing from a GET, check the server actually reloaded before suspecting
anything else.

## Looking at it

```
node scripts/look-map.mjs <out-dir> [base] [space] [project]
node scripts/map-tools-check.mjs <out-dir> [base] [api] [space] [project]
```

`look-map` shoots the desk and the output and reports what was drawn. It asserts
nothing: a mapping is a visual thing, and the numbers are there so a black
screenshot can be told apart from an empty mapping.

`map-tools-check` DRIVES the desk — fires cues by key, drags a corner into a
neighbour to prove the snap, duplicates, pastes, masks, exports — and reads each
result back from the server rather than from the page. Both bugs in the list
above were found by it and by nothing else.
