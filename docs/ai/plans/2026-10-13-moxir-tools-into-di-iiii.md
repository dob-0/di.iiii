# What MOXIR built that di.iiii should keep — inventory and plan

2026-10-13 · analysis only, no feature code · base `fix/moxir-selection-box-and-scenes-2026-10-13`

**The owner's ask (2026-10-13):** *"in the Studio there are buttons that could migrate to other
spaces (floor 1.7 m, DJ, top, plan, side, rig…); we need flexibility: which views the viewer has,
which the Studio has, what goes live for visitors and what is for the work process; the working
process from v1 and before built tools for MOXIR and left them behind; I need all of it adapted
into di.iiii, connected and synced together."*

Words per `docs/ai/vocabulary.md`: **space** (the address), **project** (one thing made in it),
**scene** (the 3D place), **object**, **place** (the real hall in Charentsavan), **production**
(MOXIR: place + client + work + run). *Live* = what a visitor meets on the published room;
*work* = what the team uses to make it.

## Method, and how much to trust it

Every row below was read in code (four read-only passes over `src/`, `serverXR/src/`, `shared/`,
`scripts/` and the MOXIR docs, then spot-checked by hand: `EYE_HEIGHT = 1.7`, the one-file type
library, `RIG_SHOW_ID`, `sceneBar` gate, `EditInStudio`, `LASER_TYPE_IDS` vs `LASER_TYPES`,
`no-blinder`, `items/media.json` store, `build-moxir-versions.mjs` constants,
`lite-vs-full-gpu.cjs` defaults, `hall.py:1299`). Nothing was run in a browser. Claims not read in
code are marked **UNVERIFIED**. Sizes are estimates, not measurements.

## The headline

1. **No runtime code checks the space id `moxir`.** serverXR, `shared/` and `src/shared/` key on
   nothing called moxir; routes are generic `/{space}/{tool}/{project}`. The only space-id literal
   in runtime `src/` is `src/rigbuild/items/media.json:5` (`"space": "moxir"`).
2. **MOXIR is baked in as data and conventions instead:** the one fixture library
   (`src/rigbuild/types/index.js:3-5` imports only `moxir.json`), six hand-kept type-id sets,
   the 1.7 m eye height and club-shaped view titles, the entity ids `rig-show` / `rig-out-*` /
   `hall-*`, crane-hall aim rules, and ~130 scripts whose defaults name `moxir` / `moxir-hall`.
3. **What a visitor sees vs what the Studio shows is fixed in code, not a setting.** There is no
   per-project or per-space field for "which views are live". The viewer passes
   `{bar:'visitor', constraints:true, deepLink:true}` (`PublicProjectSceneSurface.jsx:192-199`),
   the Studio `{bar:'studio', constraints:false, deepLink:false}`
   (`StudioPresentationSurface.jsx:36`). Authored `presentationState.viewPresets` can relabel,
   move or add a view but **cannot hide one** (`smartViewGeometry.js:550-567` always emits the six
   built-in ids). This is the owner's "flexibility" gap, exactly.
4. **One safety gap found:** laser recognition is three different hand lists.
   `shared/laserMoments.cjs:29` (show page / favourites refusal) = `up-la40wf, ext-lc-ultra-mk2`;
   `src/rigbuild/sceneDeck/model.js:22` (scene deck) = `up-la40wf` only;
   `src/rigbuild/laserView.js:16` = `ext-lc-ultra-mk2` only. `laserMoments.test.js` guards the
   server list against `moxir.json` — but a project can carry its own types in
   `rentalList.types` (`rental.js:35-46` `libraryWithShow`), and a laser arriving that way is
   refused on the show page only if its *group name* contains "laser" (`laserMoments.cjs:41`).
   For MOXIR today this is covered (RIG_BUILD §24 notes the deck's missing LaserCube as an owner
   call); for a second production it is a real hole. Fix belongs before any other production.

## The table

`S` ≈ a day, `M` ≈ 2–4 days, `L` ≈ a week+ (estimates). Risk = what breaks if done wrong.

### A. Views and the bars that hold them

| # | Tool (where) | What it does | Hard-wired to MOXIR | Becomes, for any space | Live / work | Size | Risk | Connects to |
|---|---|---|---|---|---|---|---|---|
| A1 | **Smart view presets** — `src/project/viewport/smartView/smartViewGeometry.js:448-583`, `SmartViewBar.jsx` | Six named cameras (Floor, DJ, Top, Side, Rig, Crane), keys 1–6, `#view-<id>` deep link, X-ray | `EYE_HEIGHT = 1.7` (`:42`); Floor "12–18 m back… MOXIR floor camera 15.5 m" (`:485`); DJ assumes a riser in front of a rig (`:491`); titles "Dance floor", "The DJ" (`:33-40`); stage = names matching `riser|stage|booth|deck` (`SmartView.jsx:562`) | A **view list in the project document**: `presentationState.views[] = {id, label, camera, live: bool, key}`; the six computed views become *suggestions* the author accepts, renames or deletes. Eye height a project number (default 1.7). Titles from the view, not from a club. | both — each view flagged | M | Medium: every room with a model shows the bar today; changing defaults moves every published room's buttons | `normalizePresentationState` (`projectSchema.js:1467`), `setPresentationState` op, viewer, Studio, `views-v2.mjs` / `aim-views.mjs` (which already write `viewPresets`) |
| A2 | **Authored views** — `presentationState.viewPresets`, `sanitizeViewPresets` (`SmartView.jsx:317, 592`) | Override a built-in id or append extras | Written only by MOXIR scripts (`views-v2.mjs:16-41`: 'Floor 1.7 m', 'DJ', 'Top plan', 'Side', 'Under the lasers'; looks up `rig-dj-table`, `ext-lc-ultra-mk2`) | A **Studio control: "Save this view"** — the current Studio camera becomes a named view; a tick for "visitors see it". Replaces views-v2/aim-views for anyone | work → live | S–M | Low | A1; Studio camera state |
| A3 | **Visitor/Studio bar config** — `PublicProjectSceneSurface.jsx:192-199`, `StudioPresentationSurface.jsx:36` | Picks bar style, camera limits, deep links | Not MOXIR — but code-fixed, no setting | A per-project **"what visitors get"** block: views on/off, layers on/off, walk on/off, show chip on/off, version switch on/off. Studio always gets everything (work). | the switch itself is work; it decides live | M | Medium (it is the publish surface: golden rule "public is a door") | A1, A4, B1, C3 |
| A4 | **Layer toggles Roof · Walls · Machines · Outside** — `PublicProjectViewer.jsx:709-733`, `smartViewGeometry.js:741-761` | See-through the building; `?layers=` | "Outside" = ids `^rig-out-` (`:760-761`, "MOXIR v2.6"); roof/walls from `hall.py` mesh names `hall-frame`, `hall-deck`, `hall-skylight` (`:44-48`); only reachable inside the SceneBar, i.e. only in a room with a rig | A **layer tag on objects** (`components.layer = roof|walls|machines|outside`) the author sets in the Inspector; ids stay a fallback. Offered in any room with a building, rig or not. | live | M | Low–medium (classification changes what a visitor can hide) | Studio Inspector, hall import (`import.mjs`), A3 |
| A5 | **SceneBar** — `src/rigbuild/SceneBar.jsx:56-107` | One top strip: versions · Edit in Studio · SHOW chip · layers · sound · Walk/Fly · Inside/Free · Lite/Full | Gate `roomHasRig` (`PublicProjectViewer.jsx:253, 324`): a room without lamps gets loose floating buttons instead | The viewer's **one toolbar for every room**, its contents chosen by A3, not by "has a rig" | live | M | Medium (layout measured on phones — `rigVersionLayout.js` numbers are from MOXIR v1.1 at 390×844) | A3, `rigVersionLayout.js`, known-fixes "Walk / Fly … full pills" (no round things) |
| A6 | **Edit in Studio link** — `SceneBar.jsx:39-51` | Link to `/{space}/{project}/studio` | Not MOXIR. Rendered for **every visitor**, no role check in the component | Show only to people who may edit (or say "Sign in to edit"). UNVERIFIED: whether the Studio route gates a visitor itself (likely; then this is copy, not access) | live | S | Low | auth/session hook, `rigToolAccess.js` |
| A7 | **ScenePicker (Studio)** — `src/studio/components/ScenePicker.jsx`, `src/studio/utils/scenesOf.js:8` | Studio panel: "Follow the show", "Work light", one row per cue+look with its intent; previews light in the viewport | Looks read from entity id `'rig-show'` only (`RIG_SHOW_ID`, `rental.js:17`); selection is local, never saved | Keep; find the show entity by component (`rigLooks`), not id. Add "make this the opening look" for visitors. | work | S | Low | B2, B3 |
| A8 | **Studio control cluster** — `StudioControlCluster.jsx` | Preview, Lights (rig mirror), Send positions to the desk, View live, Simple/All tools, VR/AR | "Lights" / "Send positions" only with a local Light (`StudioShell.jsx:811`) | Already generic; on a hosted tier say what Light is instead of hiding (vocabulary: never "desk" in copy — "Send positions to the desk" breaks the rule today) | work | S | Low | Light (local), vocabulary guard `src/copyVocabulary.test.js` |
| A9 | **Studio pane views** — `StudioViewportLayout.jsx:9-17` | Perspective/Top/Front/Back/Right/Left + split | None. Known bug: Front/Back bar does nothing on the Studio surface (`setEditMode` undefined; cloud brief `2026-10-13-studio-workflow-sweep.md:25-27`) — UNVERIFIED by me | The *work* views; with A1 the project's named views appear here too, so a camera saved in one shows in the other | work | S | Low | A1 |
| A10 | **Walk / Fly, Inside/Free, Lite/Full** — `PublicProjectViewer.jsx:533-601` | Movement, keep-inside, quality | None (`di.view.lockInside` per browser) | Already generic; just become A3 switches | live | S | Low | A3 |

### B. Looks, cues, show, Light

| # | Tool | What it does | Hard-wired to MOXIR | Becomes | Live / work | Size | Risk | Connects to |
|---|---|---|---|---|---|---|---|---|
| B1 | **SHOW chip + RoomLookFollower** — `src/rigbuild/RoomLookFollower.jsx` | Poses the room's lamps by the live look; "SHOW · <look> · next in N s", preview row (this viewer only) | Type library = MOXIR only (C1). Clock driver generic (`showClock.js:36-52`) | Keep; on/off per project via A3 | live | S | Low | C1, B4 |
| B2 | **Looks** — `components.rigLooks` (schema `projectSchema.js:880-948`), `looks.js`, `lookRules.js` | Group levels/colour/aim per look | Written only by scripts (`looks.mjs`, `moxir_v2_8_floor.py`, `ground-scenes.mjs`); `WASH_TYPES = ['up-pl5403']` (`looks.js:308`); aim rules ported from MOXIR `AIM_RULES` read cranes/runways/lanterns, fall back to `runway 6 m`, `roof 12 m` (`looks.js:67-78`); position names `column-faces`, `dance-columns`… | **Look authoring in Studio**: select lamps → set level/colour → "Save as look". Aim rules become optional helpers keyed on the venue record (E1), not on crane names. UNVERIFIED: whether Cards can already author a look by hand (schema comment says scripts write them) | work | L | Medium–high (looks drive real DMX via Light) | C1, E1, A7, Light |
| B3 | **Cue list / show clock** — `mappingState.cues`, `showEpoch`, `loop` | The order and timing of looks; hosted tiers play it on the wall clock | None in code; `show-loop.mjs:54` example default `moxir-hall-minimal`; "start on the clock" exists only as `show-clock.mjs` | A **Studio cue list editor** (drag looks into order, fade/hold) + a "Start the show" control replacing `show-clock.mjs` (UNVERIFIED that none exists in-product) | work → live | M | Medium | B2, B4, `src/map/` cue list (projection already has `MapCueList.jsx` — reuse, do not fork) |
| B4 | **Show page** `/{space}/show/{project}` — `ShowSurface.jsx`, `serverXR/src/routes/showRoutes.js`, `serverXR/src/show/showRemote.js` | Phone remote: everyone sees the cue; who may choose = operator / team / everyone; favourites | None by id; control stored `<dataDir>/show/control.json` keyed `${space}/${project}`; "ember/ash" palette words (`showRemote.js:56`); 10 favourites (owner's ask) | Already a di.iiii feature. Needs the laser list from C2 and the A3 switch for whether the room links to it | live (team + visitors) | S | **High if C2 is skipped** | C2, B3, Light |
| B5 | **RoomCueList / RoomFavourites** — `src/rigbuild/RoomCueList.jsx`, `RoomFavourites.jsx` | Scene bricks in the room; up to 10 favourite buttons | Comments only; defaults "first ten non-laser looks" | Keep; A3 switch | live | S | Low | B4, C2 |
| B6 | **Scenes deck** `/{space}/scenes/{project}` — `ScenesDeck.jsx`, `sceneDeck/model.js` | Four controls per scene, loop timeline, sync by carried file | `LASER_TYPES = ['up-la40wf']` (`:22`, misses the LaserCube); `BLINDER_TYPES = ['up-cob200']` (`:24`) and **throws `no-blinder`** for a rig without one (`:178`) | Read laser/strobe from the fixture type's `category` / capability, not ids; a rig without a blinder gets a deck without the strobe control, not an error | work | S–M | Medium (laser) | C1, C2 |
| B7 | **Light (local)** `/light` — `serverXR/src/lighting/*` | Patch, looks, cue runner, Art-Net out; one show per space in `<spacesDir>/<id>/lighting/show.json` | None at runtime (comments, tests). One loaded show and one cue list **per machine** (`desk.js:44-57`) | Stays local by design. Make the "which project is loaded" state visible in the Studio and the show page (`otherShow`/`otherList` already reported) | work (operator) | S | Low | B3, B4, A8 |
| B8 | **Lasers** — `serverXR/src/laser/*`, `laserView.js` | LaserCube streaming, disarmed at start; room draws the frames | `LASERCUBE_TYPE = 'ext-lc-ultra-mk2'` (`laserView.js:16`) | Driven by the type's `category: laser` + a protocol field | work (operator) | S | High (eyes) | C2 |

### C. The rig and the fixture library

| # | Tool | What it does | Hard-wired to MOXIR | Becomes | Live / work | Size | Risk | Connects to |
|---|---|---|---|---|---|---|---|---|
| C1 | **Fixture library** — `src/rigbuild/types/index.js:3-5`, `types/moxir.json` (13 types), `fixtureTypes.js:26-110`, `assumedProfiles.js:82-300` | Every rig surface's types, channel lists, ASSUMED modes | The only library is named and filled for MOXIR (UPlight + LaserCube); generated by `scripts/rigbuild/types.mjs` with `out` default `moxir.json` (`:41`) | **One di.iiii library** (rename the file, keep ids) + per-project types already carried in `rentalList.types` (`libraryWithShow`, `rental.js:35`). An OFL import in Studio for a new lamp | work | M | Medium (every rig surface reads it) | C2, B2, B6, D1 |
| C2 | **Laser and capability lists** — `shared/laserMoments.cjs:29`, `sceneDeck/model.js:22-24`, `laserView.js:16`, `plotSymbols.js:24,30`, `looks.js:303,308`, `PlotSurface.jsx:340` | Decide laser refusal, plot symbols, wash level, blinders, default lamp | Six hand-kept id sets, three different laser lists (headline 4) | **One generated capability table** (`shared/`, CJS so the server reads it) built from C1 + a check that every project-carried type with `category: laser` is refused on the show page. First, a test that fails on today's gap | live safety | S–M | **High** | C1, B4, B6, B8 |
| C3 | **Versions switch** — `RigVersionSwitch.jsx`, `rigVariant.js`, `src/shared/productionVersions.js` | Row of version links; private `<production>-versions` list with statuses for-the-show / candidate / kept-copy / concept / archived | `shortTitle` shaped on "MOXIR v1.1 · looks" (generic regex); phone layout numbers from MOXIR | Already generic by decision (2026-10-04, "for all future project too"). Missing: **Studio controls** for keep a copy / set status / archive (today `copy-version.mjs`, `versions.mjs set-status`, `archive-versions.mjs`). Visitor sees the switch only if A3 says so — decision record says visitors never see the *list* | both | M | Medium (publishes projects) | A3, scripts/production, space-publish |
| C4 | **Rig tools** `/{space}/{equipment,build,crew,plot,cards,patch,visualise,touch}/{project}` — `src/rigbuild/*Surface.jsx`, `rigTools.js:27-44`, `rigToolAccess.js:23-31` | Rental list, first-person build, plot, cards, patch sheet, visualiser | Plot defaults `lampType 'up-250bsw'` (`PlotSurface.jsx:340`); plot camera 6 m tuned to MOXIR cranes (`plotGeometry.js:451`); positions offsets from `rig-lib.mjs` (`positions.js:17-20`); item cards' kept files point at `/api/spaces/moxir/assets/…` from **any** space (`items/media.json:5`, `items/media.js:62-64`) | Already routed per space and gated. Fix defaults to come from C1/E1; media store = the space being viewed, or a shared di.iiii store | work | M | Low–medium | C1, E1, A3 (crew-only row still owed, RIG_BUILD:1072) |
| C5 | **Auto-patch / rig mirror** — `useRigAutoPatch.js`, `autoPatch.js`, `rigpatch.js` | Room ↔ Light patch, `rigKey = "<project>:<entity>"` | None | Already generic; local only | work | — | Low | B7 |
| C6 | **MVR export** — `mvr.js` | MVR 1.6 + GDTF | Rig boxes = ids `^rig-` | A Studio "Download MVR" button | work | S | Low | C1 |

### D. Scripts (scripts/place, rigbuild, production, nav, measure)

| # | Family | Files | Hard-wired to MOXIR | Becomes | Size | Risk |
|---|---|---|---|---|---|---|
| D1 | Footage → space (`place.mjs`, `import.mjs`, `api.mjs`…) | ~22 | Examples only (`place.mjs:6-7`). Already in-product as **Make the hall** on `/{space}/scan` (README) | Keep as-is | — | — |
| D2 | Hall model (`hall.py`, survey/photo scripts, `rigs/moxir-hall-*.json`) | ~19 code + ~45 data | Crane-hall placeholders (`hall.py:90-97`); metadata string `'(MOXIR, Charentsavan). Not a scan.'` (`:1299`) | → E1 venue record | M | Low |
| D3 | Rig hanging engine (`rig.mjs`, `rig-lib.mjs`, `load-plot.mjs`, `footprints`, `safety`) | ~25 | `moxir.mjs:43,150,164` (`moxir-hall`, rig file, `space: 'moxir'`); `rehang.mjs:108`; `rig-links.mjs:104` default `'moxir'`; `kit-from-full.mjs:31`; crane mount rules (`rig-lib.mjs:1252`) | Defaults removed (required `--space/--project`); footprints/safety as live checks in Build/Plot; `moxir.mjs` stays as MOXIR's acceptance test | M | Low |
| D4 | MOXIR design generators (`moxir_v1*.py`, `moxir_v2_*.py`, `lights_beta_*`, `epic_*`, `occlusion*`, `right_line_clear.py`) | ~33 + ~60 dated rig JSONs | Chained dated inputs (`moxir_v2_8_floor.py:44, 217`), pinned GLB + sha256 (`occlusion_lib.py:30-33`), fixture models and hall coordinates as literals | **Historical.** Keep the *methods* as generic tools: ray-cast occlusion against named hall triangles, laser safety height (IEC TR 60825-3, `v2_4_fan`), "place from where the audience stands" scoring, grow-by-uncertainty clearance → a Studio "beam clearance" check later (L) | L (for the check) | Medium |
| D5 | Looks/scenes writers (`looks.mjs`, `motion-looks.mjs`, `worklight-looks.mjs`, `ground-scenes.mjs`, `show-*.mjs`) | ~14 + 6 show JSONs | `motion-looks.mjs:20` refuses any project but `moxir-v1-1-motion`; `ground-scenes.mjs:169` file names | CLI twins of B2/B3; once Studio authors looks, these become import tools | — | Low |
| D6 | Patch / rental / MVR (`patch-*.mjs`, `rental.mjs`, `export-mvr.mjs`) | ~11 + 15 rentals | Data only; rental parser built for one rental house's sheet (UNVERIFIED how general) | Keep; C4/C6 | — | Low |
| D7 | Versions (`rigbuild/versions.mjs`, `copy-version`, `load-version`, `scripts/production/*`) | ~18 | `versions.mjs:35,38` file constants; `build-moxir-versions.mjs:35-36` (`PRODUCTION = 'moxir-2026-10-17'`, `SPACE = 'moxir'`, ONE-TIME); `versions-report.mjs:66` | production/* already generic → C3 Studio controls | — | Low |
| D8 | Render/verify probes (`rig-look.mjs`, `vis-see.mjs`, `look-probe.mjs`, `moxir-v2-*.cjs`) | ~16 | `rig-look.mjs:162` and `vis-see.mjs:44-45` default `moxir` / `moxir-hall-minimal` | Neutral defaults; "Export loop video" Studio action later | S | Low |
| D9 | Nav / measure benchmarks | 16 | `lite-vs-full-gpu.cjs:59-60` default `moxir` / `moxir-v2-stage-lasers` | Need a neutral fixture project committed for CI; MOXIR stays a named case | S | Low |

### E. Data the place gave us

| # | What | Where now | Becomes | Size |
|---|---|---|---|---|
| E1 | **Venue record** — dims with value/range/confidence/source, zones (dance floor, stage, backstage), massing | `scripts/place/rigs/moxir-hall-dims-*.json`, `*.hall.json`, `components.venuePlan` (`projectSchema.js:640-697`, derived by `venuePlan.js:31-43`) | First-class in the scene's document (venuePlan already is); zones as editable floor objects; feeds A1 (audience side, stage), B2 (aim rules), C4 (plot) | M |
| E2 | Measurement mode | `?measure`, Alt+Shift+M (`MEASUREMENT_MODE.md:15-24`) | Stays work-only (not on the visitor's UI, by design) | — |

## Proposed order

1. **C2 — one laser/capability table, with a failing test first.** Small, and the only row that
   can hurt a person. Must precede any second production using these tools.
2. **A1 + A2 + A3 — views as project data, each with a "visitors see it" tick, and a Studio
   "Save this view".** This is the owner's ask in one move: the six MOXIR buttons become
   suggestions any space can keep, rename, hide, or add to; the same list shows in the Studio
   (work) and, filtered, in the viewer (live). A5/A10 fold into A3's switches.
3. **A6 + A8** — visitor-facing copy and access (Edit in Studio to editors only; "desk" out of
   copy). Small, removes two vocabulary/door faults.
4. **C1 — one di.iiii fixture library** (rename, keep ids), project-carried types first-class;
   then **C4** defaults off MOXIR values and the item-media store off `moxir`.
5. **A4** layer tags; **A7** show entity by component, not `rig-show`.
6. **C3** — Studio version controls (keep a copy / status / archive) on the existing
   production-versions decision.
7. **B2 + B3** — look and cue authoring in Studio (the big one; reuse projection's cue list).
8. **E1** venue record; **D3/D8/D9** script defaults off `moxir`; **D4** moved to a dated
   `scripts/place/moxir/` (or archived), methods extracted only when a second venue needs them.

Each step is its own PR, with a known-fixes entry and a guard where it fixes a fault (C2, A6, B6).

## Questions only the owner can answer

1. **Live by default:** when a space has a building, should a visitor get *no* views until the
   author ticks them, or all suggested views until the author hides some? (Today: all six,
   always, unhideable.)
2. **Where the live/work choice lives:** per project (each version decides its own visitor
   buttons), per space (one rule for every project in it), or per production (all MOXIR versions
   share one)? The version list is already keyed by production, not space.
3. **The fixture library:** one shared di.iiii library everyone adds to, or each production
   carries its own types in its project (as `rentalList.types` already allows), with UPlight's
   13 as a starter set?
4. **Words on screen:** the show page and scene deck call a light look a "scene", which the
   vocabulary reserves for the 3D place; and Lamp vs Light for the placed object is still open.
   Which words?
5. **MOXIR's history:** the ~33 dated design scripts and ~100 dated rig/rental JSONs — keep them
   in place as the record, move them under a `moxir/` folder, or take them out of the repo into
   MOXIR's own space/backup?

## What was not done

No browser run, no change to any document or space, no feature code. Whether the Studio route
itself refuses a visitor, whether Cards can author a look by hand, and how general the rental
parser is were not read (UNVERIFIED above).
