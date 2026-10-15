# The connected workflow, words for looks, versions in one place — plan

2026-10-13 · cloud routine · base `fix/moxir-selection-box-and-scenes-2026-10-13` · branch
`cloud/workflow-words-versions-2026-10-13`

The owner's decisions 5–6 (`docs/ai/decisions/2026-10-13-views-library-words-workflow.md`): *"in MOXIR the Nodes and
the Lights control the lights and the lasers; everything connected"*; the looks and the Dilijan things get Studio
words (proposed here, nobody renames code); a production's versions in one place, selectable from inside, the MOXIR
versions kept as examples. Read beside the inventory, sections B and C3
(`docs/ai/plans/2026-10-13-moxir-tools-into-di-iiii.md` — **on PR #901's branch
`cloud/moxir-tools-inventory-2026-10-13`, not on this base**; read from there).

**How much to trust this.** Every arrow below was read in code on this base, with the file named. Nothing was run
against a real Light desk, a real lamp or a LaserCube: the whole chain past the browser is **UNVERIFIED** on hardware.
Sizes (S/M/L) are estimates. Only the two S items marked DONE were built, each with a test seen red without its fix.

## (a) The chain as it is

```
 STUDIO (/{space}/studio/…)                    scripts (rigbuild/looks.mjs, place/*.py, ground-scenes.mjs)
   ScenePicker — pick a look to SEE it            │ write components.rigLooks on the show entity (`rig-show`)
   (viewport only, never sent anywhere)           ▼
        ▲                        ┌───────── the PROJECT document ─────────┐
        │ scenesOf()             │ components.rigLooks.looks[]  (the looks)│
        └────────────────────────│ mappingState.cues[] .lightLook=rig-<id> │◄── Scenes deck /{space}/scenes/… (4 controls a
                                 │ mappingState.showEpoch / loop           │    look, loop timeline; writes looks + cues)
                                 └──────┬───────────────────┬──────────────┘
                 Cards page button      │                   │ every viewer, no desk (hosted)
     "put the looks on the desk"        │                   ▼
     patchRoom + POST /light/api/looks/add (rig-<id>,       src/rigbuild/showClock.js — t = (now − showEpoch) mod loop
     deskLookValues.js) + createMappingCue                  → RoomLookFollower poses the room's lamps (a picture only)
                                        ▼
 LIGHT (local only, /light, serverXR/src/lighting)  ── one show, one patch, one cue list PER MACHINE (desk.js)
   looks (rig-…)  · scenes (the desk's own) · cue runner (cuerun.js, fires a cue's lightLook)
   layers, FX, master, blackout · GET /api/clock (bpm, beat epoch) · GET /api/fireable (looks + scenes)
        │ Art-Net / sACN / Enttec (artnet.js, sacn.js, enttec.js)          │ GET /light/api/dmx
        ▼                                                                   ▼
   LAMPS (UPlight rental units; the DMX laser UP-LA40WF is held dark      the ROOM: "DMX wins" (useRigLook.js),
   by the laser gate until sign-off)                                       SHOW chip says the desk drives
        ▲
 NODES (/{space}/raw/projects/…)
   DMX Out (DmxOutPanelWindow.jsx, dmxRigClient.js): Master · Channel/Value · Blackout · Scene ─► the desk
   Show clock (src/perform/useShowClock.js) ◄── polls GET /light/api/clock (tempo and beat, NOT the cue)
   Laser ─► Laser Out (device.laser.out) ─► POST /laser/api/frames ─► serverXR/src/laser/laserEngine.js
                                                    │ armed only with the sign-off phrase; keep-in zone; still-beam guard
                                                    ├─► LaserCubes over UDP (lasercubeProtocol.js) — UNVERIFIED on a real cube
                                                    └─► the room reads GET /laser/api/frames (laserView.js) and draws beams
```

So today: the looks live in the project; the desk gets them only when someone presses the Cards page button; the desk
drives the lamps and the room; the Nodes canvas can push levels, blackout and a desk *scene*; the LaserCubes are
driven only from Nodes. "Everything connected" breaks at the gaps below.

## The gaps

| # | Gap (measured) | Size | Sketch |
|---|---|---|---|
| G1 | **A Nodes wire could not fire a project's look.** DMX Out's Scene port resolved words against the desk's *scenes* only (`/scenes/summary`, `/scenes/recall`); the project's looks reach the desk as *looks* (`rig-<id>`, `/looks/add`). A wire saying "peak" fired nothing, with no word. | S — **DONE** | On a miss, read `GET /light/api/fireable` and `POST /looks/fire` by desk id, project look id (`rig-`+id) or title; a scene still wins; an unknown word fires nothing. `dmxRigClient.js resolveLookId/readDeskLooks`, `DmxOutPanelWindow.jsx`. Commit "fix(nodes): a DMX Out wire naming a project's look fires it on the desk". |
| G2 | **The Studio scene picker found the show by the id `rig-show`**; the other four readers (`rigLooksOf`, sceneDeck `showEntityOf`, serverXR `showRemote`, `useRigLook`) take the entity that carries the looks. Latent: every document today uses `rig-show`. | S — **DONE** | One rule. `src/studio/utils/scenesOf.js` + `scenesOf.test.js`. |
| G3 | **Nodes cannot read which look is on.** The Nodes show clock reads the desk's *tempo* (`/api/clock`: bpm, beat epoch); the *cue* clock (`showClock.js`, `mappingState.showEpoch`) and the desk's runner (`cuerun.js`) are invisible to the graph. So the lasers (Nodes-only) cannot follow the looks. | M | A "Show" source node (`show.look`): outputs the live look id, its title, cue index, seconds into the cue and fade 0…1 — from the desk's cue runner where one answers (local), else from `showClock.js` on the document (same precedence as `showDriver`). Wire `look` → a Laser node's preset to make the lasers follow the show. Registry + runtime + inspector + palette label + wiki. |
| G4 | **A look cannot say anything about the LaserCubes.** `rigLooks` carries lamps' levels/colour/aim; a look like "Laser into the roof" has no laser frame — the cubes draw only what a Nodes graph sends. | L | `look.lasers: { shape, colour, size, spin }` per cube group, normalised in both schema copies; the Nodes laser path renders it when G3's node says the look is on. Safety: unchanged engine guards (disarmed at start, keep-in, still-beam); nothing a look says can arm a cube. Needs the officer's sign-off before any real test. |
| G5 | **The looks reach the desk only by a button.** Change a look in the Scenes deck or Studio and the desk keeps the old one until someone presses "put the looks on the desk" on the Cards page (`CardsSurface.jsx:340-357`); nothing says they differ. | M | Compare desk `rig-…` looks with the document's (ids + a values hash, `deskLooksWithValues`) on the Cards page and the Studio picker; a "the desk has older looks — send" line. Never write on open (a reader never writes, the Cards rule). |
| G6 | **A desk serves one space's patch and one cue list per machine**, while a Nodes project and the rig project are two projects. G1's look lookup matches by name across whatever looks the desk holds — another room's stale `rig-…` looks included (`staleDeskLooks` exists, nobody calls it from Nodes). | S–M | Scope G1's match to the looks of the project the desk runs (`/api/clock` reports only the loaded show's *space*, `show.space`; the cue runner knows its project), or show "these looks belong to <project>" in the DMX Out panel. Not built: needs a desk run to confirm what `show` holds. UNVERIFIED. |
| G7 | **Studio cannot author a look**: scripts write `rigLooks` (`looks.mjs`, `moxir_v2_8_floor.py`, `ground-scenes.mjs`); the Scenes deck edits four controls and copies. | L | Inventory B2: select lamps → level/colour → "Save as look". Unchanged here. |
| G8 | **Three different laser lists** decide refusal, the scene deck and the room's laser view. | S–M | Owned by the inventory, C2 (a generated capability table + a failing test first). Not duplicated here so two routines do not race on it. |

Order proposed: G6 → G3 → G5 → G4 (G4 only after the laser officer); G7 and G8 per the inventory.

## (b) Words — proposed in `docs/ai/vocabulary.md`, not applied

Measured: the Studio says **SCENES** for a lighting look (`ScenePicker.jsx`, the Scenes deck, the room's cue list,
the show page), while the Cards page, the room's SHOW chip and the desk say **look**. The dictionary already gives
**scene** one meaning — the 3D place — and Light gives *scene* a second, narrower one (one step of values, beside
looks). Proposal: **look** is the Studio word ("the wall", "peak" are looks; a **cue** plays a look; the **show** is the
cues in order). Kept as the owner's call, because his own word since 2026-10-12 has been "scenes". The Dilijan words
are proposed with their ambiguity said out loud — see the vocabulary's new "Proposed" section.

## (c) Versions in one place

**Measured today.** The list exists and is generic (`src/shared/productionVersions.js`; one private project
`<production>-versions`; five statuses, at most one `for-the-show`). The row (`RigVersionSwitch.jsx`) reads it **when
the viewer may read the list**, else falls back to the space's rows, else to each version's stored `siblings`
(`rigVariant.js versionLinks`) — three sources, three possible rows. **The Studio has no version control at all**: no
file under `src/studio/` imports `productionVersions` or `rigVariant`; every status change, register, copy and archive
is a script (`scripts/production/versions.mjs`, `archive-versions.mjs`, `scripts/rigbuild/copy-version.mjs`).

**One door, the switch inside** means: one place a member opens — the version row in the room and in the Studio —
where the list is read and changed, and the fallbacks retire.

| # | Step | Size | Sketch |
|---|---|---|---|
| V1 | The Studio shows the version row (it already shows on the published room) | S–M | Mount `RigVersionSwitch` in `bare` mode in the Studio's scene bar; links go to the Studio of each version, not the viewer. Not built here: needs a desktop + phone look in a real browser, which this run could not do. |
| V2 | Set a status from inside | M | For a member (the list readable): a status menu per version in the row's fold, writing `statusOps` / `entryOps` through the list project's ops route — the same ops `versions.mjs` sends, with its refusals (second for-the-show) shown as the sentence. |
| V3 | Keep a copy / archive from inside | L | Server-side: a project copy with its assets plus the list entry in one action (today `copy-version.mjs` + `archive-versions.mjs`). Publishes projects — owner's call on who may. |
| V4 | Nothing left behind: migrate every set to a list, then retire `siblings` | M | A boot-or-sync migration that writes `<set>-versions` for every set with `rigVariant` marks and no list (`versions-audit.mjs` already finds them), then `versionLinks` stops reading `siblings`. Per the owner's rule "write it everywhere". |
| V5 | MOXIR's versions as the examples | — | Data, not code: they stay the `moxir` space's `moxir-2026-10-17-versions` list. No production name enters runtime code or defaults; the wiki may point at them as the worked example. |

Order proposed: V1 → V2 → V4 → V3.

## Not done here

G3–G8 and V1–V4 (sizes above); no browser, desk, lamp or cube was touched; the words are proposals.
