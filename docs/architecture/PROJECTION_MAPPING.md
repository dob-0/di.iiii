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
| `mapTestPattern.jsx` | alignment patterns |
| `transportCeiling.js` | the HTTP/1.1 ceiling and its warning |
| `useMapDocument.js` | the document, the op layer, and the BroadcastChannel courier |
| `lightingLink.js` | the one wire to the lighting desk at `/light` |

Schema lives in `src/shared/projectSchema.js` as `mappingState`, mirrored in
`shared/projectSchema.cjs`. Ops: `setMappingState`, `createMappingSurface`,
`setMappingSurface`, `reorderMappingSurfaces`, `deleteMappingSurface`,
`createMappingCue`, `setMappingCue`, `reorderMappingCues`, `deleteMappingCue` —
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
