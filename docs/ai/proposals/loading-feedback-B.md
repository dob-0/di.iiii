# Loading feedback: design B, "the place fills in"

Status: **proposal**. Nothing under `src/` or `serverXR/` is changed by this branch.
Sketch: [loading-feedback-B.html](loading-feedback-B.html). Open it in a browser.
Written 2026-10-16 as one of two independent designs.

## The report

The owner opened the Studio on a big project. For about 10 s he saw only lamps: no hall, no
toolbars, and nothing that said it was loading. He took it for a crash. In his words: *"make
loading things but complementary to our system — everything that loads, we will see"*.

## 1. Survey: every wait a person can hit

Reading the table: **On screen** is what is drawn during the wait. **Says so?** is whether
anything tells the person the wait is still going. **Failure** is what happens when it fails.
**Code already knows** is any number we could show today without new work.

| # | Wait | file:line | On screen | Says so? | Failure | Code already knows |
|---|---|---|---|---|---|---|
| 1 | Code chunk for any route (lazy import) | `src/RootApp.jsx:92,115,145,177`; `src/components/RouteSurfaceFallback.jsx` | `LoadingScreen`: a black page with the ring | The ring only. Its label is spoken, not drawn. After 8 s: "still waiting for …" | `lazyWithReload` reloads once, then `RouteErrorBoundary` takes over | nothing (an import has no progress) |
| 2 | **Studio: the project file** | `src/project/hooks/useProjectDocumentSync.js:302-341`; flags in `src/project/state/projectStore.js:25-66` | `src/studio/components/StudioShell.jsx:725-727`: an **opaque** black `LoadingScreen variant="cover"` at z-index 30 (`src/components/loadingScreen.css:70`) over the viewport | "loading the project", then "still waiting for the project file" after 8 s | `loadError` as a card (`StudioShell.jsx:728`) | loading / loaded / error only. It is one GET: `Content-Length` is sent and never read |
| 3 | **Studio: models (the hall)** | `src/objectComponents/ModelObject.jsx:100-160` → `src/services/assetSources.js:317-357` (`response.blob()`, at most 3 at once, `:7`) → `GLTFLoader.parse` | **Nothing where the hall will be.** The arrival lights (`src/studio/components/StudioViewport.jsx:816-821`) and the lamp markers (`:828-832`) sit outside the entity `Suspense`, so they draw right away. That is the owner's "only lamps" | **Nothing** | `console.warn` only (`ModelObject.jsx:188-193`); the model just never appears | a count of models in flight (`src/objectComponents/modelLoads.js`), read only by the camera's auto speed. Each asset's `size` is recorded at upload (`serverXR/src/projectStore.js:640`) and carried on `document.assets` (read at `src/studio/components/StudioEditor.jsx:271-277`), so **the total bytes are known before the first byte arrives**. `Content-Length` is sent (`serverXR/src/routes/projectRoutes.js:1238`) and never read |
| 4 | Studio: all root objects behind one `Suspense` | `src/studio/components/StudioViewport.jsx:854` (also 829, 882, 899, 917) | `fallback={null}`: one suspending child (a `Text3D` font) **blanks every object** | nothing | nothing | nothing |
| 5 | Studio: HDRI environment | `src/project/viewport/WorldEnvironment.jsx:27` | no environment light until it loads | nothing | nothing | three's `DefaultLoadingManager`, which drei's `useProgress` reads |
| 6 | Studio: textures, images | `src/objectComponents/ImageObject.jsx:22`, `PrimitiveMaterial.jsx:24` | untextured or blank surfaces | nothing | nothing | `DefaultLoadingManager` |
| 7 | Studio: video | `src/objectComponents/VideoObject.jsx:104` | an empty plane | nothing | nothing | the media element's `progress` and `canplay` events (not wired) |
| 8 | Studio: fonts, fixture bodies | `Text3DObject.jsx:28`, `src/rigbuild/FixtureBodies.jsx:103` (`useGLTF`) | text or bodies missing | nothing | nothing | `useProgress` sees fixture bodies |
| 9 | Studio: lazy render effects | `src/project/viewport/RenderSettingsEffect.jsx:22-26,146-148` | `fallback={null}` | nothing | nothing | nothing |
| 10 | Room / show page `/<space>/p/<project>`: the space | `src/SpaceSurfaceApp.jsx:116-117` | `LoadingScreen "Loading space"` | the ring | `status:'error'` is set, then falls through to `<App/>`. **No message** | status only |
| 11 | Room page: the project file + 3D chunk | `src/project/components/PublicProjectViewer.jsx:69,235-260,757,942`; `PublicProjectSceneSurface.jsx:19-32` | full-bleed `LoadingScreen "Loading live experience"`. In embed mode, **nothing at all** | the ring + the 8 s line | an error card or `MissingProjectCard` (`:944-953`) | status only |
| 12 | Room page: models | same path as #3 | the room draws without them; they pop in | **nothing** | `console.warn` | same as #3 |
| 13 | Spaces list / space hub | `src/studio/components/SpaceHub.jsx:443-467,1375-1378` | an inline ring + "loading" | yes | `.ssh-status-error` | status only |
| 14 | Hub: space card previews | `SpaceHub.jsx:62-74,262-283` | the saved picture, or an empty box while the iframe boots | nothing per card | none (a 12 s backstop frees the slot) | a 4-slot boot queue and "has painted" messages |
| 15 | Hub: GitHub panel | `SpaceHub.jsx:1136` | plain "Loading…" | text only | not shown | — |
| 16 | Space contents page | `src/pages/SpaceContentsPage.jsx:166-182` | `RouteSurfaceFallback` | the ring | `.sc-lede` error text | — |
| 17 | Nodes (Raw): the project file | `src/raw/components/RawEditor.jsx:3091-3092,3183-3184` | the canvas + "Loading project…" text | text, no ring | `raw-overlay-message is-error` | status only |
| 18 | Nodes: scene contents | `src/raw/components/RawViewport.jsx:1151`, `GraphRoomNodes.jsx:67` | `fallback={null}` | nothing | nothing | — |
| 19 | Nodes `/out` (projector) | `src/raw/components/RawOutSurface.jsx:61-64` | an empty viewport | nothing | `raw-out-message` | — |
| 20 | Perform | `src/perform/PerformApp.jsx` (wraps RawEditor); `src/perform/PerformDesk.jsx:274` | same as Nodes; the preset name reads "Loading…" | same as Nodes | same as Nodes | — |
| 21 | Light desk `/light` (vanilla, served by serverXR) | `serverXR/src/lighting/ui/app.js:229-295,599` | the static HTML shell, empty until the first `api/state` poll answers | nothing on the first load; the library says "Loading the library…" | after 2 failed polls, a "server offline — …" banner in `#statusStrip` | a count of failed polls |
| 22 | V1 editor (compatibility) | `src/components/EditorLayout.jsx:4,243` | drei `<Loader/>` | **a percent bar**, the only real progress in the app, and it **covers** the canvas | — | `DefaultLoadingManager` items |
| 23 | Export (the only progress shown in Studio) | `src/project/transfer/studioProjectBundle.js:82-129`, shown at `StudioShellPanels.jsx:1880` | phase, completed / total, percent | yes | yes | everything |

### What the survey says

- **Before anything is drawn, di says it is waiting** (the ring, the 8 s line). **After the
  first frame, it says nothing.** Every wait from #3 to #9 is silent, and the biggest one (the
  hall) is one of them.
- **The numbers are already there and never reach the screen:** asset `size` on the
  document, `Content-Length` on every asset response, the `modelLoads` count, `useProgress`,
  and the export's phase counter.
- **Failures after the first frame are invisible.** A model that fails is a `console.warn`;
  the person sees a room with a hole in it.
- **The only real progress bar (V1's drei `<Loader/>`) hides what is drawn.** That is the
  thing this design forbids. `modelLoads.js` already records that wiring models into it
  "made the V1 editor's drei `<Loader/>` cover the canvas for every model download".

### "Lamps, no toolbars": what the code says, and what it does not

The lamps follow from #3: the lights and lamp markers draw outside the entity `Suspense`, and
the hall has no placeholder. **No code path hides the toolbars while models load.**
`StudioShell.jsx:339`'s "bare" rule hides panels only for a loaded, *empty* project. The
two candidates:

- (a) the opaque project-file cover (#2) sits over the toolbars too;
- (b) `GLTFLoader.parse` on a large `arrayBuffer`, plus the first shader compile, holds the
  main thread, so the toolbars are mounted but not yet painted.

Neither is confirmed. The build's first step is to reproduce it with the profiler on the
owner's project. If (b), part of the fix is parsing off the main thread (a worker for Draco
is already how `GLTFLoader` decodes; the parse itself is not), and **the list below must be
drawn before the parse starts**, so it is on screen even while the thread is held.

## 2. The design: "the place fills in"

One rule, written for the person: **what is already here stays drawn; what is still coming is
drawn as its outline, with its name and how far it has come; what failed says so, in the same
place.**

### 2.1 One ledger, one component

- **The ledger** (`src/components/arrivals/arrivals.js`, about 120 lines, no React). Every
  wait registers one entry:
  `{ id, what, kind, done, total, unit, state, error, retry, startedAt }`.
  - `what` is the person's word: "the project file", "the hall", "lamp bodies", "the sky".
  - `unit` is `bytes` or `count`.
  - `state` is `waiting` (queued behind the 3-stream limit), `coming`, `unpacking` (bytes
    done, parsing), `here`, or `failed`.
  - It is a plain store with `subscribe` and `snapshot`, the same shape as `modelLoads.js`,
    which it absorbs. `modelsLoading()` keeps its export, so the camera's auto speed is
    untouched.
- **The component** `<StillComing/>` (`src/components/arrivals/StillComing.jsx` + `.css`,
  written in the spine from its first line, and added to `SPINE_FILES` in
  `src/styles/spine.test.js`). It is the one loading component. It reads the ledger and has
  two placements:
  - **`corner`**: once anything is drawn. A small rectangle, bottom-left of the viewport,
    above the account button (`--di-account-btn-clear`). It never covers the centre and never
    takes a click it does not need.
  - **`alone`**: when nothing can be drawn yet (no project file, no code). It is the same
    list, centred, on black, with the ring kept as its first line (the ring the owner chose
    on 2026-10-15 stays the one round thing). This placement **replaces** `LoadingScreen`'s
    body, so every one of its ~30 call sites keeps working and gains a named line.
    `LoadingScreen` becomes a thin wrapper.

### 2.2 What a line says

```
still coming · 3                          9.4 of 31.0 MB
──────────────────────────────────────────────────────
the hall              ▮▮▮▮▮▮▯▯▯▯▯   2.1 of 3.3 MB
lamp bodies           ▮▮▮▮▮▮▮▮▯▯▯   11 of 14
the sky               waiting its turn
──────────────────────────────────────────────────────
the stage curtain     did not arrive · 404 · try again
```

- Words, then numbers, in the house mono (`--di-mono`, `--di-text-2`), lower case like the
  bar. A bar is a 2 px rectangle in `--di-cyan` on `--di-line`. No spinner.
- Bytes are shown in MB with one decimal, sized against the **document's recorded
  `size`**, which is known before the response arrives. `Content-Length` is used when the
  document has no size. With neither, the line counts ("11 of 14") or just says "coming",
  and **never invents a percent**.
- After the bytes: "the hall · unpacking". Parsing a 30 MB glb is a wait too, and it is the
  one most likely to look like a crash.
- `waiting its turn` for an entry queued behind `MAX_CONCURRENT_STREAMS`
  (`src/services/assetSources.js:7`). It is true, and it explains why a bar has not moved.
- The header counts what is left, and the total in bytes when every entry has bytes.
- Failure: the line turns `--di-danger`, says **what** did not arrive and **why** in a few
  words ("404", "not on this server", "the network dropped"), and offers **try again** when
  the ledger holds a `retry`. A failed line stays until the person dismisses it, or until a
  retry succeeds. It never fades on its own. The `console.warn` stays as well.
- Spoken: the corner list is `role="status"` `aria-live="polite"`, and it announces only
  "the hall is here", "the hall did not arrive", "all here". It does not read every byte
  tick.

### 2.3 When it shows (the rules)

1. **Nothing for the first 400 ms.** A wait that ends before then is never shown, so a warm
   cache does not flash a list.
2. **Once shown, at least 800 ms**, so a list that appears does not blink away unread.
3. **Gone 1.2 s after the last entry is `here`**, with one last line "all here". Failed
   entries stay (rule 2.2).
4. **Never opaque over something drawn.** No placement may cover a canvas that has drawn a
   frame. The Studio's project-file cover (#2) becomes `alone` placement on the *viewport
   only*. The bar and the toolbars draw from the first frame, disabled where they need the
   project.
5. **Every wait registers, or it is a bug.** A `Suspense` with `fallback={null}` around
   something a person waits for must register an entry. A test greps for unregistered
   `fallback={null}` around scene content, the same way `spine.test.js` guards styles, and
   lists today's boundaries as named debt that may only shrink.
6. **Tiny things do not get a line.** Entries under 200 KB fold into one line ("12 small
   files · 7 of 12"). The list never grows past 6 lines; the rest fold into "and 9 more".
   **On a phone** the list folds to its header, the biggest line and any failure, so it never
   covers the room (the sketch's phone width shows it).
7. **The room page in Show render, and embeds:** the corner list is reduced to one line and
   the header count, so an audience sees "the hall · 2.1 of 3.3 MB" and nothing that looks
   like an editor. In Tech render it is drawn in full; the crew needs to know.

### 2.4 The place shows it: ghosts

The list says *what*. The scene says *where*.

- **A model still coming is drawn as its outline:** a dashed `--di-cyan-line` box at the
  model's place, rotation and scale, with its name and its line as one small label pinned to
  the box (drei `Html`, the same as the existing selection pill). It is a box with straight
  edges: no glow, no animation except the dash moving slowly while bytes arrive. It stops
  dead when nothing is arriving, so a stall looks like a stall.
- **Where the box comes from.** The first time a model ever loads, its bounds are unknown, so
  the ghost is a floor cross with the label at the entity's origin. Once it loads, its local
  bounding box is kept in IndexedDB under the asset's id. Ids are content addresses
  (SHA-256), so the bounds can never go stale. Every later load, on any project that uses that
  file, draws the true box from the first frame. There is no schema change. Writing the
  bounds into the asset record on the server, so a stranger's first visit also gets a box, is
  a **later and separate** call for the schema owner.
- **The hall gets this for free:** it is the largest model, so its ghost is the room's walls
  in outline. The person sees the shape of the room they are about to stand in, and the lamps
  hang inside it.
- **Failed:** the box turns `--di-danger`, dashed, and its label says "the hall did not
  arrive". It stays where the hole is, instead of an unexplained gap.
- **Textures:** the surface keeps its flat material with a faint hatch until the texture
  arrives. **The sky (HDRI):** list only, since it has no place. **Fonts:** a hairline where
  the text will sit.
- **One boundary per object.** `StudioViewport.jsx:854`'s single `Suspense` around every
  root entity is split into one per entity (inside the existing `SceneEntityErrorBoundary`),
  so one font no longer blanks everything. Its fallback is that entity's ghost.
- **Ghosts are not objects.** They are never selectable or saved, never shown in the
  Outliner, never in an export, and never drawn in a publish screenshot.

### 2.5 Each surface, after

| Surface | Before the first frame | After it |
|---|---|---|
| Studio | bar + toolbars drawn; viewport shows `alone`: "the project file · 0.4 of 1.2 MB" | corner list + ghosts |
| Room page `/<space>/p/<project>` | `alone` with the work's title as the header line: "Front Room · the project file" | ghosts + a one-line corner in Show render, the full list in Tech |
| Embed | `alone`, small (fixes "nothing at all", #11) | one line |
| Spaces hub | the inline ring stays, with a named line ("your spaces") | each card's empty box carries a dashed outline and "starting" until it paints; "did not start" after the 12 s backstop instead of silence |
| Nodes / Perform | `alone` on the canvas replaces the bare "Loading project…" | the corner list for scene contents (#18) |
| `/out` (projector) | **one line, bottom-left, 50% ink**, and only during the first load. It must never be on a wall during a show | nothing after the first frame; failures go to the operator's Nodes view, not the wall |
| Light desk `/light` | a small vanilla twin of `alone` in `index.html` (same words, same CSS tokens copied in); it is not React and must not become React for this | "waiting for the desk" on the first poll, instead of an empty shell |
| V1 | drei `<Loader/>` is left alone (compatibility work) | — |

## 3. Files a build would touch

New:
- `src/components/arrivals/arrivals.js`: the ledger (absorbs `src/objectComponents/modelLoads.js`)
- `src/components/arrivals/StillComing.jsx`, `stillComing.css`: the one component
- `src/components/arrivals/Ghost.jsx`: the outline in the scene
- `src/components/arrivals/ghostBounds.js`: the bounds cache in IndexedDB
- tests: the ledger, the show/hide rules (fake timers), and the `fallback={null}` guard

Changed:
- `src/services/assetSources.js:341-357`: read `response.body` with a reader against `Content-Length` or the recorded size, and report into the ledger (`waiting` while queued)
- `src/objectComponents/ModelObject.jsx`: register, `unpacking`, `here`, `failed` + `retry`; draw `<Ghost/>` while `loaded` is null
- `src/objectComponents/modelLoads.js`: becomes a re-export of the ledger
- `src/studio/components/StudioShell.jsx:725-727`: the cover becomes `alone` on the viewport only; the corner list mounts
- `src/studio/components/StudioViewport.jsx:829,854,882,899,917`: one boundary per entity, ghost fallbacks
- `src/project/hooks/useProjectDocumentSync.js:302-341`: stream the document GET for bytes
- `src/project/viewport/WorldEnvironment.jsx`, `ImageObject.jsx`, `PrimitiveMaterial.jsx`, `VideoObject.jsx`: register
- `src/components/LoadingScreen.jsx`, `src/components/loadingScreen.css`: become the `alone` placement
- `src/project/components/PublicProjectViewer.jsx`, `src/SpaceSurfaceApp.jsx:116` (the swallowed error, #10), `src/studio/components/SpaceHub.jsx`, `src/raw/components/RawEditor.jsx`, `src/raw/components/RawOutSurface.jsx`
- `serverXR/src/lighting/ui/index.html`, `app.js`: the vanilla twin
- `src/styles/spine.test.js`: add `stillComing.css` to `SPINE_FILES`
- `src/wiki/wikiContent.js`: one article, "what is still coming" (bump `updated`)
- `docs/ai/vocabulary.md`: the drawn words "still coming", "waiting its turn", "unpacking", "did not arrive", "all here"
- `docs/ai/known-fixes.md` + a regression guard: "a model that fails is only a console.warn" and "the room page's space error falls through silently" are bugs, and they ship as fixes

Not touched: the schema, `shared/`, serverXR's asset routes (`Content-Length` is already sent), Move 1.

## 4. What it costs

| Piece | Size | Risk |
|---|---|---|
| Ledger + `StillComing` + CSS + tests | ~400 lines, 1 session | low |
| Byte streaming in `assetSources` + `ModelObject` wiring | ~120 lines | medium: the stream reader must hand back the same `Blob`. The IndexedDB cache path must not register a 0-byte "wait" |
| Ghosts + bounds cache + per-entity boundaries | ~250 lines, 1 session | medium: splitting the `Suspense` changes mount order. Verify the camera's auto speed and the arrival frame still wait for the hall |
| Surfaces (room page, hub, Nodes, `/out`, `/light`) | ~250 lines, 1 session | low; `/out` needs a live-wall check |
| Verification: desktop + 5 phones on a throttled network (`verify:surfaces`) and the owner's big project | half a session | — |

About **3–4 sessions**. Each step can ship alone, in this order: ledger + corner list
(fixes the owner's report on its own), then bytes, then ghosts, then the other surfaces.

**Performance:** byte ticks are throttled to 4 per second into React; the ledger is plain JS.
Ghost boxes are line segments with one material, which costs nothing next to the hall they
stand in for.

## 5. Open questions for the owner

1. Ghost on a stranger's first visit (bounds stored on the server's asset record), or only
   from the second visit (local cache)? This proposal ships the local cache and leaves the
   server record as a schema decision.
2. In Show render on the public room page, should the audience see the corner line at all,
   or only the ghosts?

## Job cost

About 25 minutes of wall time. 26 tool calls in this session, plus 2 read-only survey agents
(72 tool calls between them). No build and no tests were run; this branch changes no code.
