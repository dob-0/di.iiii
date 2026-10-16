# Loading feedback — design A: one load line

Status: **proposal**, not built. 2026-10-16. Sketch: [loading-feedback-A.html](loading-feedback-A.html)
(open it in a browser, it is static).

The owner opened the Studio on a big project. For about 10 s only the lamps showed. There was no
hall and no toolbars, and nothing said anything was still loading, so he thought di had crashed.
His words: *"make loading things but complementary to our system — everything that loads, we will see."*

**Design A in one line:** every wait in di reports to one register. One component, the
**load line**, draws that register as a 2 px progress line along the top edge of the surface, with
one quiet text line under it: `loading the hall · 2.1 of 3.3 MB`. It never covers what is
already drawn. When something fails it says so in plain words, and that message stays on screen.

---

## 1. Survey: what di loads, and what the person sees

The line numbers are from `dev` at the branch point of this proposal. "Signal" means what tells
the person the thing is still coming.

### Studio (`/<space>/<project>`, the editor)

| What loads | Where (file:line) | On screen while it loads | Signal today | What the code already knows | When it fails |
|---|---|---|---|---|---|
| Studio's code chunk | `src/RootApp.jsx:92`, `:115` (`React.lazy` + `RouteSurfaceFallback`) | full-screen black with the ring | the ring alone; its label goes to screen readers only (`RouteSurfaceFallback.jsx:9-14`, every caller passes no `text`). After 8 s: "still waiting for …" (`LoadingScreen.jsx:22,48-62`) | nothing (a chunk either resolves or it doesn't) | one automatic reload (`utils/lazyWithReload.js:9-26`), then `ViewFailed`: "This view stopped working." (`AppErrorBoundary.jsx:31-68`) |
| The project file (one JSON GET) | `useProjectDocumentSync.js:302-337`, `projectStore.js:44-66` | black cover with the ring, "loading the project" (`StudioShell.jsx:725-727`) | **yes**: the text, then "still waiting for the project file…" after 8 s | `state.loading` / `hasLoaded`, no bytes. **Once it arrives, it lists every file and its size** (`src/project/layers.js:181-208`, `counts.fileBytes`) | an error card with `loadError` (`StudioShell.jsx:728-730`) |
| Edits kept in this browser from a past visit | `useProjectDocumentSync.js:246-290` | nothing | none | `pendingOpCount` | console warning (`:261`) |
| Live sync and presence | `useProjectDocumentSync.js`, `useProjectPresence.js` | nothing; the sync state goes to the control cluster (`StudioShell.jsx:826`) | a small sync dot | `pendingOpCount`, `presenceState` | sync-error / auth-expired state |
| **Models: .glb / .gltf / .fbx / .obj / .stl (the hall)** | `objectComponents/ModelObject.jsx:100-260`. Fetch at `:152-158`; queue of 3 at `services/assetSources.js:6,144-154,340-358` | **nothing**: `if (!loadedScene) return null` (`ModelObject.jsx:288`) | **none.** A private counter `modelsLoading()` (`modelLoads.js:6-15`) feeds only the camera's speed (`useCameraNavigation.js:127`) | `content-length` is there but never read (`response.arrayBuffer()` `:158`, `response.blob()` `assetSources.js:357`). The file's expected size is in the project file. Queue length and active count are known (`assetSources.js:6`) | **console.warn only** (`ModelObject.jsx:191`). The hall stays invisible forever and nobody is told |
| Rig lamp bodies (lazy chunk + `useGLTF`) | `StudioViewport.jsx:66`, `:897-901`, `rigbuild/FixtureBodies.jsx` | nothing (`fallback={null}`) | none | drei's progress store (three's `DefaultLoadingManager`) | none |
| Pictures | `ImageObject.jsx:22-74` | nothing, then a dim tile on failure | none | `DefaultLoadingManager` item counts | dim placeholder tile (`:54-80`) |
| Textures on shapes | `PrimitiveMaterial.jsx:12-24` | an untextured material | none | `DefaultLoadingManager` | not surfaced |
| HDR / EXR environment | `WorldEnvironment.jsx:27-42` | the scene without its environment light | none | the loader has an `onProgress` slot, passed `undefined` (`:38`) | console warning (`:40`) |
| Video | `VideoObject.jsx:56,174,203` | nothing | none | `<video>` `progress` / `buffered` / `readyState` | not surfaced |
| Sound | `AudioObject.jsx:26-130` | — | none | none | silent `catch {}` (`:11,67,89,91,129`) |
| Lazy 3D parts (SmartView, RigMirror, Bloom, QualityGovernor, Measure) | `StudioViewport.jsx:69,829,917`; `RenderSettingsEffect.jsx:22-26,146-157` | nothing | none | none | no boundary seen |
| **Every object in the scene, together** | `StudioViewport.jsx:854-914`: one `<Suspense fallback={null}>` around all of them | if one object suspends (a troika `<Text>` waiting on its font: `EntityLink.jsx:71`, `PortalObject.jsx:371`, `RigMirror.jsx:76`), **the whole scene blanks**, with no word | none | none | `SceneEntityErrorBoundary` per object |
| Toolbars and panels | `StudioShell.jsx:339`, `:762-896`, `:967` | hidden only while `bare` (the project has loaded and holds nothing) | — | `layers.loaded / held / empty` | — |
| Export (the one progress display di has) | `StudioEditor.jsx:1305`, `project/transfer/studioProjectBundle.js:82-129`, `StudioShellPanels.jsx:1880` | progress with phase and percent | **yes** | `{phase, completed, total, percent}` | export status |

**The owner's 10 s, explained as far as the code allows.** The lamps are objects in the project
file, so the "loading the project" cover had already gone when they drew. The hall is a model, so
it was being fetched (possibly queued behind two others) and then parsed, while
`ModelObject` drew `null` and nothing reported it. Parsing a big GLB (Draco, KTX2, meshopt) and
uploading its textures runs on the main thread, and that can stall the page's paint. **The
missing toolbars are not explained by the code:** `bare` is false while the file loads, and lamps
from the file count as held (`layers.js:190-234`). Two candidates remain. A main-thread stall
during the parse would freeze the paint. Or the lamps came from the rig rather than the file, so
the project read as bare. **A build must measure this first** (watch `layers.loaded/held/empty`
and record a Performance trace while that project opens) and must not guess.

### The other surfaces

| Surface | Where | On screen while it loads | Signal today | What the code already knows | When it fails |
|---|---|---|---|---|---|
| Every lazy route (~35) | `RootApp.jsx:51-111`, `:115-906`; `index.html:87` (empty `#root` before JS) | black with the ring; the words are for screen readers only | the 8 s "still waiting" line | none | reload once, then `ViewFailed` |
| Room page `/<space>/p/<project>` | `RootApp.jsx:206-222` → `SpaceSurfaceApp.jsx:116-154` → `project/components/PublicProjectViewer.jsx` | **up to four rings in a row**: "Loading" (public check, `RootApp:210`), "Loading space" (`SpaceSurfaceApp:117`), "Loading project" (`:128`), "Loading live experience" (`Viewer:69,942`). Then the scene with **no signal** while its models stream (`LiveProjectScene.jsx:388`, `fallback={null}`) | rings, invisible words | the project GET is about 2 MB with no stream reader (`Viewer:466`). Models are the same `ModelObject` path as in the Studio | a card "Could not load the live project." / MissingProjectCard (`Viewer:250-258,944-952`). A failed space fetch falls through silently (`SpaceSurfaceApp:48-60`). A failed model: console only |
| Spaces (`/spaces`, SpaceHub) | `studio/components/SpaceHub.jsx:353`, `:1375` | the hub's own layout with a small ring and "loading". Cards show a kept poster or nothing until their preview boots | inline rings for invites, history, linker (`:1032,1075,1143`) | the space count and project titles (`:453-464`); the preview boot queue, 2 at a time (`utils/previewBootQueue.js:8`) | `ssh-status-error` with the message (`:467,1376-1378`). A failed title quietly becomes the id (`:460`). A preview that never answers is released by timeout, with no message (`:250`) |
| Nodes (`/<space>/raw/…`) | `RootApp.jsx:140-170,792`; `raw/components/RawEditor.jsx:3183` | the ring "Loading the node editor", then the editor's toolbar with "Loading project…" over the canvas | text | `state.loading / loadError` (`projectStore.js:25-66`); "Bringing it in…" for a drop (`RawEditor:3313-3315`) | `.raw-overlay-message.is-error` (`:3184`), `raw-sync-alert` role=alert (`:3086`), `alert()` when storage is full (`:691`) |
| Perform (`/<space>/perform/<id>`) | `RootApp.jsx:706-721`, `perform/PerformApp.jsx:6-8` (wraps RawEditor) | as in Nodes | as in Nodes | as in Nodes | as in Nodes |
| Light (`/light/`, local installs) | `RootApp.jsx:181-184,942-953`; the desk is plain JS in `serverXR/src/lighting/ui/` | a ring, then a full reload into the desk's static page, which fills in on the first `api/state` poll | "Loading the library…" (`ui/index.html:240`, `app.js:599`); the status strip via `say()` (`app.js:197-208`) | poll results (fixture and node counts) | **the best in di**: `#statusStrip.bad` latches "server offline — is node server.js still running?…" after 2 failed polls (`app.js:283-293`) |

**What di already has to build on:**

- `src/components/LoadingScreen.jsx` is the one loading indicator. It is the ring the owner picked
  on 2026-10-15, with a drawn `text` line and an 8 s "still waiting for …" line. It is
  imported in 21 files. Most route callers never pass `text`, so its words stay hidden.
- `src/objectComponents/modelLoads.js` is already a register, with one integer in it. Its comment
  explains why models stay out of `DefaultLoadingManager`: the V1 editor's drei `<Loader/>` would
  cover the canvas. Design A keeps that separation.
- The project file names every file it needs and its size (`layers.js`). Without reading a
  single header, the line can say "2.1 of 3.3 MB".
- The export already reports `{phase, completed, total}`. Design A uses the same shape.
- The light desk's status strip is the right voice: one line that says what is wrong and stays.

**What nobody has:** no shared status line, no toast, no `<progress>`. Three model-sized loads
(models, environment, sound) fail with at most a console line.

---

## 2. Design A

### 2.1 Two pieces, one rule

1. **The register** (`src/shared/loading/loads.js`, no React): every wait calls
   `beginLoad({ what, kind, total })` and gets back `{ progress(done, total?), parsing(), done(), fail(reason) }`.
   A hook `useLoads()` (`useSyncExternalStore`) reads it. `modelLoads.js` becomes a thin
   wrapper over it, and `modelsLoading()` keeps its contract for the camera.
2. **The load line** (`src/components/LoadLine.jsx` + `loadLine.css`): mounted once per surface,
   at the top edge of that surface's root. It draws the register.

**The rule:** *if a person can wait for it, it reports to the register. If it reports, the line can
say it.* Nothing else is allowed to invent its own loading UI. The ring (`LoadingScreen`) stays,
but only where **nothing is drawn yet** (a route chunk before any toolbar exists, and the project
file before the room exists). Everywhere else, the line is used.

### 2.2 What it looks like

```
┌ appbar ─────────────────────────────────────────────────────────────┐
├████████████████████████████▌········································ ┤ ← 2 px, --di-cyan on --di-line
  loading the hall · 2.1 of 3.3 MB · 2 more files                       ← one line, mono, --di-dim
```

- **The line:** 2 px tall, full width of the surface, flush under the appbar (or the top
  edge where there is no appbar). Track `--di-line`, fill `--di-cyan`, no corners. It shows the
  sum of every running load: bytes done / bytes expected, or files done / files when no byte count
  is known.
- **The text:** one line, `var(--di-mono)`, `var(--di-text-2)` (10 px) with
  `letter-spacing: 0.02em`, in `--di-dim`. Lower case, like the ring's own text ("loading the
  project"). It sits in the top-left of the viewport on a `--di-scrim` strip only as wide as the
  words, `--di-radius` (2 px), padding `--di-space-1` / `--di-space-2`. `pointer-events: none`,
  except on a failure's two words.
- **Never over the room:** the line covers 2 px of the viewport, and the text strip covers one
  10 px line at most 60 ch wide. Nothing dims, blurs or blocks input. A toolbar is never hidden
  because something is loading.

### 2.3 What it says (vocabulary-checked)

`<verb> <what> · <how far> [· <n> more files]`, the biggest unfinished load first.

| State | Text | The line |
|---|---|---|
| bytes known | `loading the hall · 2.1 of 3.3 MB` | fills by bytes |
| total unknown | `loading the hall · 1.4 MB so far` | a 20 % segment walks the track (`--di-motion-base`, never with reduced motion), **always with words next to it** |
| downloaded, now parsing on the main thread | `preparing the hall · 3.3 MB` | full, at half opacity |
| several | `loading the hall · 2.1 of 3.3 MB · 4 more files` | the sum of all of them |
| slow (no byte for 8 s, the ring's own threshold) | `still waiting for the hall · nothing arrived for 8 s` | stops, in `--di-warning` |
| failed | `the hall did not load · 404 · try again · details` | full, `--di-danger`; **it stays** until the person presses try again or ×, or a reload works |
| all done | `all 6 files in · 14.2 MB · 9.4 s` for 1.5 s, then the line and the text fade (`--di-motion-base`) | full, then gone |

**What** is the object's own name in the project (`entity.name`, so "the hall" when the person
called it the hall). If it has no name, it is the kind in dictionary words: *a model*, *a picture*,
*a video*, *a sound*, *the scene's light* (environment), *the project*, *the lamps* (rig bodies),
*the tools* (a lazy panel chunk). It never says entity, asset, chunk, document, scene (as a
project), Raw or seed (vocabulary.md, "Banned").

### 2.4 When it shows

1. **Not before 400 ms.** A cached load that ends sooner never flashes. Once shown, it stays at least
   600 ms.
2. **Every load in a surface counts**, including ones started before the line mounted (the
   register holds them).
3. **A failure outlives the load.** Failed entries stay in the register until they are dismissed
   or retried, and the text stays in danger colour. With two failures: `2 files did not load ·
   details`, and *details* opens the list (name, reason, size, try again for each).
4. **Projector rule:** where a surface is an output to a wall (Projection's output, Nodes' Out,
   any `?render=show` window that is fullscreen on a second display), the line is **not drawn**. It
   is never white on a projector. Failures there go to the operator's surface, which is a build
   step: the register is per-tab, so this only works where the operator is in the same tab.
   Otherwise the failure stays in the output tab's console, as today. That gap is listed below.
5. **Phone:** the same line, under `env(safe-area-inset-top)`. The text truncates with an
   ellipsis before the `·` count, never the name.
6. **Screen readers:** `role="status" aria-live="polite"` announces only start ("loading the hall"),
   done and fail. A failure is `role="alert"`. Byte ticks are not announced.

### 2.5 Room page and other surfaces

- **Room page:** the four rings in a row collapse into one ring, with drawn words that change
  ("finding the space", "opening the project"). From the moment the scene is drawn, the load line
  takes over for its models. Visitors are waiting too, and they deserve the words more than anyone.
- **Spaces:** the line counts previews ("previews · 3 of 11"); a title that fell back to its id
  reports as a quiet fail.
- **Nodes / Perform:** the "Loading project…" overlay stays (nothing is drawn yet); a dropped file
  reports to the register instead of its own "Bringing it in…".
- **Light:** it is plain JS in serverXR, so it gets no component. It already has the strip that
  this design copies. A build only aligns its wording.
- **Route rings:** `RouteSurfaceFallback` passes its label as drawn `text` ("loading Studio"), so
  no ring in di is ever bare again. This is a one-line change, and it could ship first.

---

## 3. What a build would touch

| File | Change |
|---|---|
| `src/shared/loading/loads.js` + `.test.js` (new) | the register: begin / progress / parsing / done / fail / dismiss / retry, subscribe, totals, a 400 ms show gate |
| `src/components/LoadLine.jsx` + `loadLine.css` + `.test.jsx` (new) | the component; the css uses only spine tokens (add it to `SPINE_FILES`) |
| `src/objectComponents/modelLoads.js` | becomes a wrapper over the register; `modelsLoading()` is kept |
| `src/objectComponents/ModelObject.jsx` | streams `response.body` with a reader (bytes, `content-length` or the project's size), then `parsing()`, then `done()`/`fail()`. The silent `console.warn` becomes a `fail` |
| `src/services/assetSources.js` | the same reader for `blob()` downloads; a queued file reports "waiting" (counts, no bytes) |
| `WorldEnvironment.jsx`, `ImageObject.jsx`, `PrimitiveMaterial.jsx`, `VideoObject.jsx`, `AudioObject.jsx` | report to the register; `AudioObject`'s `catch {}` blocks report a fail |
| `src/studio/components/StudioViewport.jsx:854-914` | **one Suspense per object** instead of one for all, so a font wait no longer blanks every object; lazy 3D parts report as "the tools" |
| `src/studio/components/StudioShell.jsx` | mount `<LoadLine />` under the appbar |
| `project/components/PublicProjectViewer.jsx`, `SpaceSurfaceApp.jsx`, `RootApp.jsx:206-222` | one ring for the room page, then the line |
| `src/components/RouteSurfaceFallback.jsx` | draw its label as `text` |
| `SpaceHub.jsx`, `RawEditor.jsx` | mount the line; report previews and drops |
| `src/wiki/wikiContent.js` | a short "when something is loading" section (bump `updated`) |
| `docs/ai/known-fixes.md` | the silent model fail, as a fixed defect, with the register test as its guard |

Not touched: `serverXR/` (the light desk's strip already does this). No new dependency.

## 4. What it costs

- **Build:** about one focused day for the register, the line, the model path and the Studio
  mount, with tests. Half a day more for the room page, Spaces, Nodes and the other loaders.
  Then verification on desktop and a phone, with the owner's own big project and a throttled
  network, and the screenshots opened.
- **Runtime:** one module-level store; the line re-renders at most every 100 ms (throttled). A
  `ReadableStream` reader adds no copy over `arrayBuffer()` when the chunks are concatenated into
  one preallocated buffer, which is possible when `content-length` or the project's size is
  known.
- **Risk:** streaming a body changes how model bytes are read (fall back to `arrayBuffer()` when
  `response.body` is missing). Splitting the scene's Suspense changes mount order, so it needs a
  test that one suspended object leaves the others drawn.
- **Open:** (1) why the toolbars were missing; measure it, as in §1. (2) Failures on a projector
  output in another tab or window have no way back to the operator yet. (3) Whether the ring and
  the line should meet: the line could take over the ring's place even on the project file, using
  the room's own toolbar. Design A says no for now: with nothing drawn, the ring is the honest
  picture.

---

Job cost (this proposal): about 25 minutes wall clock. About 30 tool calls in this session,
plus two read-only survey agents (22 and 31 tool calls, about 2 min each).
