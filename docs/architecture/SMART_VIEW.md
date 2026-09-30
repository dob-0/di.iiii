# Smart view — seeing into a building from anywhere

The owner, 2026-09-29, on MOXIR: *"when i move the mouse i go out from the building and
nothing visible so can we make smart thing like, when something front it will be
transparent or something like that i need and want smart view methods"*.

A room that holds a building (a place: MOXIR's hall) used to go black the moment the orbit
camera left it: the walls face outward, the authored haze (fog 0–32 m) swallows everything
past 32 m, and nothing stops the camera from dropping under the floor. The smart view is the
platform's answer, for every room with a building in it — not MOXIR code.

Code: `src/project/viewport/smartView/` — `smartViewGeometry.js` (every decision, as plain
functions, tested in `smartViewGeometry.test.js`), `SmartView.jsx` (inside the canvas: measures
the scene and applies the decisions), `SmartViewBar.jsx` (the row), `useSmartViewState.js`
(keys, the link). Mounted by `StudioViewport` when a surface passes `smartView`:

| surface | `smartView` | row | camera limits | link |
|---|---|---|---|---|
| published room, orbit (`PublicProjectSceneSurface`) | on, unless the camera is locked or it is a `?preview=1` card | bottom centre | yes | `#view-…` |
| published room inside another page (`?embed=1`) | on | only with `&views=1` | yes | no |
| Studio viewport pane (`StudioPresentationSurface`) | on | top centre of the pane | no | no |
| walk / fly (`LiveProjectScene`), plot / cards rooms | off (untouched) | — | — | — |

The visualiser split (PR #644, not on dev when this landed) shows the room as
`PublicProjectViewer` with `&embed=1`, so it gets the fade, the cutaway and the limits as
they are, and the row as soon as it adds `&views=1` to its room frame's address.

## The five methods and where each comes from

1. **Occlusion fade** — the third-person camera practice of games: Unreal Engine's
   *DitherTemporalAA* / camera-depth-fade material functions and Unity's dithered
   "see-through" occluders. What stands between the camera and its target is **screen-door
   dithered** away (Mulder, Groen & van Wijk, *Pixel masks for screen-door transparency*,
   IEEE Visualization 1998): a 4×4 Bayer mask discards up to 85 % of the fragments of the
   building that are (a) inside a circle around the target on screen (26 % of the short
   side, soft edge) and (b) nearer than the target. Discard, not alpha blending: nothing has
   to be sorted, depth stays true, and the beams and haze behind draw exactly as before.
   Whether to fade at all is decided by a raycast: five rays (a centre ray and four at a
   0.35–1.2 m radius around the target — the usual approximation of a sphere-cast), 15 times
   a second, against the building's meshes only, through **three-mesh-bvh** (BVH, now a
   direct dependency at the version drei already pulled in). A hit on a part the cutaway
   already removed does not count. The strength eases in (≈0.08 s half-life) and out (≈0.2 s).
2. **Cutaway from outside** — the architectural section box (Revit's *Section Box*,
   Navisworks sectioning) and The Sims' "walls down". Six clip planes shared by every
   building material: the roof, the four walls, and a section plane a preset may bring.
   Inside the building nothing is cut. Outside (beyond the footprint, or above the roof cut)
   the roof is cut just under its lowest named part (MOXIR: the space frame's bottom chord,
   11 m → 10.95 m) and every wall you are beyond is cut 1.2 m inside its line (the wall and
   the columns built into it go together). Planes slide into place (0.1 s half-life) and are
   parked far away when off — a uniform change, never a shader recompile. The authored fog
   stands back by exactly the camera's distance outside the building, so the inside reads as
   it does from the doorway.
3. **View presets** — named cameras, as lighting visualisers ship them (Capture, WYSIWYG,
   Vectorworks Vision saved views). Keys 1–6 and the row:
   `Floor` eye 1.7 m in the crowd · `DJ` riser front edge, eye 1.7 m over the deck, up at the
   lamps · `Top` straight down, an 18° lens (reads as a plan, the Studio's own long-lens
   trick) fitted to the footprint and the viewport's aspect · `Side` from beyond the nearer
   long wall, square to the audience axis, a 24° lens, with a section plane 2 m past the rig
   so everything between is cut · `Rig` the lamps filling a 45° lens · `Crane` high over the
   crowd (under the roof cut), looking down at the stage. The audience side is the direction
   from the rig to the room's opening shot. Interior views go through `fitCameraToAspect`
   with the room's `walkableAreas` (the portrait-phone rule of PR #655: widen, never back
   through a wall); `Top` and `Side` are computed for the aspect directly. Transitions are
   camera-controls' own `setLookAt(…, true)`; the lens eases through StudioOrbit's lerp.
   `#view-top` (etc.) opens on that view; choosing one writes the hash with `replaceState`;
   taking the camera lets it go (the hash clears, a section drops).
4. **X-ray** — Blender's *X-Ray* (and its binding, Alt+Z): the building's surfaces at 7 % of
   their opacity with depth writes off, and its edges (`EdgesGeometry`, 28°) drawn faint;
   the rig, lamps and beams untouched. The roof is not drawn in x-ray, and edges are made
   only for meshes up to 12 000 triangles: MOXIR's roof is a 41k-triangle space frame, and
   ghosting it over the whole screen measured 42.8 fps at the crane view against 74 without
   x-ray (see Measured).
5. **Camera limits** (visitor surfaces only) — camera-controls' own API, nothing hand-rolled:
   `maxPolarAngle` recomputed each frame so the camera stays 0.3 m over the floor at the
   current distance, `maxDistance` = 1.6 × the building's radius (or the farthest preset),
   `setBoundary` keeps the orbit target inside the building (never under its floor). With
   the target held inside, a camera outside always has the building in front of it, and the
   cutaway opens it — the black screen cannot happen.

## What is "the building"

In order (`isArchitectureEntity`, `enclosingModelIds`):

1. the place pipeline's hall — entity id `place-hall`, or any entity with a `venuePlan`
   (`scripts/place/import.mjs`, `src/rigbuild/venuePlan.js`);
2. an explicit `components.viewRole: 'architecture'` (any other `viewRole` says no);
3. a model whose name says building (`hall`, `building`, `venue`, `room`, `walls`,
   `warehouse`, `factory`, `scan`, `place`, `interior`);
4. at runtime, when none of those: a model at least 4 m across whose box holds half or more of
   the room's other entities.

A lamp, beam or rig piece (`light`, `fixture`, `beam`, `piece`, any light type) never is.

Inside the building, meshes are sorted by name (`meshRole`): `hall.py` merges one mesh per
material, so the names are `hall-frame` (space frame), `hall-deck`, `hall-skylight` → roof;
`hall-floor`, `hall-zone-*` → floor (never faded, never cut, never a raycast target); the rest
→ wall. A mesh with no telling name that is flat at floor level is floor. Because MOXIR's
walls and columns share one merged mesh, the fade and the cut work per fragment (shader and
clip planes), not per mesh — the one method that works with merged and unmerged models
alike. The walls' line comes from the venue plan's `outline` when the place has one (MOXIR's
model reaches past the door with its entry platform), else from the model's box.

## Authored views

`presentationState.viewPresets` — read, never written by this code:

```json
[{ "id": "floor", "position": [0, 1.7, 20.3], "target": [0, 5, 4.8], "fov": 55, "label": "Floor 15 m" }]
```

`id` is one of `floor dj top side rig crane`; an authored view replaces the computed one of
that id. The rig agents' `cameras.json` (`~/Downloads/moxir-the-cut/cameras.json`) maps
`floor-15m → floor`, `dj-up → dj`. No MOXIR document carries the field yet — adding it is a
content change for the owner's word (it passes through `normalizePresentationState` as is).

## Measured

See the table in `docs/ai/sessions/feat-smart-view.md` (moved to PROGRESS.md at land):
frame rate before/after on MOXIR `moxir-hall-minimal`, RTX 3080 (ANGLE on Vulkan, PRIME
offload), uncapped (`--disable-gpu-vsync --disable-frame-rate-limit`), 1440×900 at DPR 2.

## Limits, said plainly

- The fade circle is a fixed share of the screen, not fitted to the subject's projected size.
- A click on a cut-away part of the building still selects the building (pointer raycasts
  know nothing of clip planes) — in Studio this can pick the hall through a cut wall.
- Room bounds are axis-aligned: a building turned off the world axes gets a loose box and a
  looser cut. MOXIR is axis-aligned by construction (`hall.py`).
- The graph lane's published renderer (`PublicGraphSurface`) and walk mode do not have it.
