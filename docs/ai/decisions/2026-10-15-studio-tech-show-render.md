# Studio, Tech and Show — three renders of one room (2026-10-15)

**Owner, 2026-10-15 06:5x–07:2x** (four screenshots, Studio v2-9/v2-11 and room page v2-7/v2-9): *"we can have 2 ways to render: one
for the light show, the other for showcase"* → *"I mean 3 looks — Studio and Tech are not the same"* → *"in the light show we don't
need everything there, just the things for the show — Studio work when we create — and the showcase one, which is the
all-accessible link."* Tech: *"looks where lasers and lights are just the shapes, not other things — like the bad-quality lasers one"*.

## The decision

A room is drawn for one of three **purposes** (`render`), orthogonal to **quality** (Low / High = what the DEVICE can carry,
`outputMode.js`). Both are render-time only: the room draws a copy, **the document is never written**.

| render | who, where | what it draws |
|---|---|---|
| **Studio** | the author, the Studio viewport | the building view: edit tools, gizmos, labels, lamp bodies, the scene's air — the document as authored |
| **Tech** | the crew in the live show: room page → Display → Tech | the schematic: ONLY the show's things — the rig (lamp bodies, beam cones and laser lines as plain flat shapes in their own colour), the cue state, the floor and the hall as plain grey faces. No air, no fog, no bloom, no additive glow, no textures, no machines, no outside, no other objects |
| **Show** | the audience and a client: the public link (`/<space>`, `/<space>/p/<id>`), room page default, the Studio's **Preview** | the room as the audience sees it: the scene's own air, bloom, lasers as lines with halo |

Precedent (established method): CAD and previsualisation tools keep the drawing view apart from the rendered view —
Vectorworks (Spotlight's host) has render modes from *Wireframe* / *Shaded* to *Renderworks* on one model. Lighting
previz (grandMA3 3D, Capture) has similar operator views; their exact mode names were not checked in this job (owed,
not claimed). Our Tech is that schematic, drawn live from the same desk state.

## Fields each render reads and overrides — `renderPlan(document, { mode, quality })` (src/shared/renderPlan.js)

| field | Studio | Tech | Show |
|---|---|---|---|
| `renderSettings.atmosphere` (haze, σs, g) | as authored | **dropped** (no air) | as authored |
| `renderSettings.bloom` | as authored | **dropped** | as authored |
| `renderSettings.surfaces` (floor reflection) | as authored | **dropped** | as authored |
| `renderSettings.shadows` / `shadowCasting` | as authored | **off** | as authored |
| `renderSettings.look` (render-time only) | — | **`'schematic'`**: beams flat (normal blending, fixed opacity), lasers as plain lines to their first surface, textured surfaces grey | — |
| `worldState.fog` | as authored | **off** | as authored |
| `worldState.ambientLight` | as authored | **white 0.6** (the hall readable, never tinted) | as authored |
| `entities` | all | **only** rig (lamps, lights, beams, pieces), the building, the floor/stage, cameras, and any parent of those | all |
| layers (`smartView.layers`) | viewer's | **machines off, outside off** | viewer's |
| chrome | edit tools | none; the show chip (scene name, cue) stays | none |

**Quality on top** (the two axes combine, in this order: render first, then quality): Low = `outputDocument` (no
shadows, no bloom, no floor model, no antialias, DPR 1, light pool on) on whatever the render left; High = the render's
copy as is. Tech is already light (no air, no bloom, no shadows); Tech + Low only adds DPR 1 and no antialias.

**The Scene window's "Light environment" rows** (src/shared/lightEnv.js: atmosphere, exposure, bloom, surfaces, fog,
ambient) are what **Show** and **Studio** draw; **Tech ignores them all except exposure** (its look is fixed so a crew
reads the same schematic in every version). Try in that section stays a Studio-side preview of Show's light.

## Where the switch is

- Room page: Display → **Tech | Show** (Show is the default); `?render=tech|show` in the address wins, then the tab's
  own choice (sessionStorage `di.view.render`). `?render=studio` on the room page draws Show (the room page has no edit
  tools; stated, not hidden).
- Studio: the viewport is Studio; **Preview** opens the room page with `?render=show`.

## Limits, owed

- Hover in Tech (a lamp's name, part, level, DMX address) and an on-screen cue clock: **owed** (ledger row) — Tech shows
  the scene name through the existing show chip only.
- "Lamp bodies dark" in Show: the bodies render as they do today; a darker body material is owed if the GPU look asks.
- The look is unvalidated until seen on the GPU (v2-11 "second-drop" and "green-breath", Tech and Show from one camera).
