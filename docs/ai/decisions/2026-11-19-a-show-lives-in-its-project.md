# A show lives in its project; the machine keeps only the wire

**Date:** 2026-11-19 · **Asked by:** the owner, who answered *"yes"* (ledger rows N5539 and N5587) to two questions: *"The one home
for a show: the project (my pick, it already holds the lamps, looks and cues) or the space (smaller job, the doubles stay)?"* and
*"Start the move now? Step one: the decision record and a plan as one pull request, no new agents, no desk changed before you merge."* ·
**Words:** `docs/ai/vocabulary.md` (space, project, place, production, lamp, look, cue, show). A *light scene* here is a scene of
the light desk, not the 3D scene. *The wire* is every fact about one machine and its cables. *Run state* is what a desk holds
while a show plays.

**How the first yes was read:** a yes to a question with two answers, taken as the advised one, the project. One word from the
owner (space) turns this record. **What this record changes:** no code and no data. The move itself is the plan,
`docs/architecture/SHOW_IN_THE_PROJECT.md`: six steps, each its own job on the owner's word.

## Problem

One show is kept in several stores with different owners. Only a part of it goes with a shared project.

| Part of a show | Kept in | Belongs to | Goes with a shared project |
|---|---|---|---|
| Lamps with their patch, designed looks, the cue list, laser objects with their frames | the project document | the project | yes |
| The light desk's show: patch, looks, light scenes, effects, the MIDI map | `<spacesDir>/<id>/lighting/show.json` | the space | no |
| The laser desk's bank of looks, its palette, the link from a light scene to a laser look | `<dataDir>/laser/desk.json` | the machine | no |
| The output: which wire, where it is sent, on or off | `<dataDir>/lighting/show.json`, key `output` | the machine | no, by design |
| Scene hotkeys, pane splits | browser storage | one browser | no |

Proof of each row, in order:

- `shared/projectSchema.cjs:989` "const universe = fixtureInt(fixture.universe, 1, 63999)" · `shared/projectSchema.cjs:1199` "if (sourceComponents.rigLooks) {" · `shared/projectSchema.cjs:248` "id of a laser-desk look made live when the cue fires, after the light." · `serverXR/src/laser/laserShow.js:1` "a project's laser lines, played on the real LaserCubes."
- `scripts/space-bundle.mjs:7` "the space's light show (lighting/show.json, the lighting desk's" · `docs/architecture/LIGHTING_SHOW_PORTABILITY.md:23` "scenes, looks, layers, sets, effects, LFOs, audio settings and the MIDI map."
- `serverXR/src/laser/laserDesk.js:19` "the bank, the clock and the setup are kept in … the live look is not." · `serverXR/src/laser/laserDesk.js:261` "followLight: false, palette: []"
- `serverXR/src/lighting/desk.js:631` "disk.output = state.output;" · `scripts/space-bundle.mjs:233` "delete show.output"
- `docs/architecture/LIGHTING_SHOW_PORTABILITY.md:101` "Per-browser things are not per show"

Four things are kept twice, and what is changed on the desk has no road back to the project:

| What | In the project | On the desk | Road |
|---|---|---|---|
| Looks | designed looks | copies named `rig-…`, one value per lamp | a button sends them; nothing comes back |
| Cue list | the project's cues | the desk's cue runner | pushed by the page; nothing comes back |
| Patch | unit number, universe and address on each lamp | lamps in the show file; a lamp made from a project carries a key to the project's lamp | the desk gives addresses, the page writes them back into the document |
| Laser pictures | frames on a laser object | the looks of the laser desk's bank | none: two homes |

- `src/rigbuild/CardsSurface.jsx:355` "await fetch(lightingApiUrl('api/looks/add')" · `src/rigbuild/looks.js:31` "export const DESK_LOOK_PREFIX = 'rig-'"
- `src/rigbuild/cueRun.js:47` "post('api/cues/load', { project: projectId, list: deskCueList(cues)"
- `src/rigbuild/autoPatch.js:14` "export const rigKeyOf = (projectId, entityId) =>" · `serverXR/src/lighting/rigpatch.js:10` "The desk allocates; the room records."
- The two laser homes are the first and the third row of the table above.

Counted by script on one machine (aylmo) on 2026-11-18; keys, counts and sizes only, no value was read:

- 40 of its 342 project documents hold a show: 2,799 lamps, 1,062 designed looks, 1,017 cues.
- Its three light desk files (the machine's own and those of two spaces) hold 218 looks. 217 are named as copies made from a
  project, and 0 light scenes are kept.
- The desk file of one space (moxir) is fed by nine projects.
- 1,703 of the 2,799 lamps carry a universe and an address in the document.
- It has no laser desk file. The machines that played a show were not read.

Three answers to "where does a show belong" stand in the records at once:

| Answer | Where it stands |
|---|---|
| The machine | `di-atlas/decisions/2026-09-20-one-project-one-stage.md:22` "Never universe/address in the document." · `di-atlas/decisions/2026-09-23-layers-what-inside-what.md:248` "lives in one file … per machine, not in a project" |
| The space | `docs/architecture/LIGHTING_SHOW_PORTABILITY.md:8` "one show per space, carried in the space's" · `di-atlas/decisions/2026-09-23-connect-everything.md:136` "Recommendation: the space. One show per space, carried in its file, run only on a local install." |
| The project | as built, the patch is in the documents (the first proof above); the owner's sentence of 2026-09-23: `docs/architecture/LIGHTING_SHOW_PORTABILITY.md:9` "what we need can easy work offline and then share the project from one device to" |

`di-atlas` is the studio's notes repo and is not public. Its lines were read from its default branch.

## Options considered

| Option | What it gives | Why not (alone) |
|---|---|---|
| **The project** | The unit the owner shares. It already holds most of a show. Follow already carries it. A hosted page already plays its cue list with no desk. | The desks must learn to load from a project and to write back; one migration. |
| The space (the answer of 2026-09-23; the runner-up) | A smaller job: the space's file gains the laser bank and the link, and follow learns to carry the light show. | The four doubles stay. One desk file keeps mixing the projects of a space. A project shared alone still arrives without its lights. |
| The machine (the line of 2026-09-20) | Nothing to build. | It is not what is built: the patch is in the documents. Nothing made on a desk travels. |
| A production object above the projects | It matches how the studio speaks of a show night. | One more store, and the dictionary says no: `docs/ai/vocabulary.md:34` "It uses di.iiii; it does not live in it." |

- `serverXR/src/follow/streams.js:27` "const projectStream = (projectId) => ({" · `src/rigbuild/showClock.js:1` "a rig's cue list played with no desk"

## Pick: the project

1. **What the show says lives in the project and goes with it.** As today: lamps with their patch, designed looks, the cue
   list, laser objects with their frames. New: what is made on the light desk (looks, light scenes, layers, sets, effects, LFOs,
   audio settings, the MIDI map) and on the laser desk (the bank of looks, the palette, the link from a light scene to a laser look).
2. **The wire stays on the machine and is never carried.** The output (which wire, where it is sent, on or off), the fixture
   type library of the house, the laser cubes' addresses and serials, zones, safety, arming.
3. **Run state stays with the desk and is never carried.** Which show is loaded, what is live, the clock, the last cue, who may
   choose the cue.

The desks stay. They play and edit the project's show, one show loaded at a time. Their own files stay as built copies and as
the named rollback until the owner names the new default. A production gets no object of its own; a venue's facts stay with the space.

Why this one:

1. It is the unit the owner shares (2026-11-12: create in di.iiii, share each project to the machine that runs its show). A
   shared project then arrives with its lights and its laser.
2. It finishes a move that is mostly done: the counts above.
3. It removes the four doubles: one source, and the desk's copy is built from it.
4. A project can then say which lights are its own. Today one desk file holds parts of nine projects.
5. The record already draws the line there: `docs/architecture/LIGHTING_SHOW_PORTABILITY.md:45` "The patch travels; the wiring does not."
6. Established show tools hold a show this way: the patch is part of the show and is bound again for another rig. QLab 5: "The
   Light Patch tab allows you to view and edit the instruments and light groups in the workspace."
   (<https://qlab.app/docs/v5/lighting/light-patch-editor/>). Avolites Titan: "The Fixture Exchange function enables you to
   repatch fixtures in your show using alternative fixtures, retaining important elements such as cue times, shapes and
   legends." (<https://manual.avolites.com/docs/patching/changing-the-patch>). Both pages were opened on 2026-11-18.
7. The join back is already built: `src/rigbuild/autoPatch.js:14` "export const rigKeyOf = (projectId, entityId) =>". On aylmo
   140 of 152 desk lamps carry that key.

## What this replaces, line by line

| On record | What stands now |
|---|---|
| `docs/architecture/LIGHTING_SHOW_PORTABILITY.md:8` "one show per space, carried in the space's" and `docs/architecture/LIGHTING_SHOW_PORTABILITY.md:14` "A space owns its own light show." | Replaced as the aim. Both stay true of what is built until the steps of the plan land. |
| The first reason of the plan of 2026-09-03: `495604454:docs/architecture/LIGHTING_SHOW_PORTABILITY.md:80` "The unit is the space, not the project." It feared two projects of one room owning two unrelated light libraries. | Already so. On aylmo 40 documents hold a show of their own (2,799 lamps, 1,062 designed looks and 1,017 cues in all); in moxir 39 projects carry 15 different lamp counts; and the one desk file of that space mixes the looks of nine projects. |
| Its second reason: `495604454:docs/architecture/LIGHTING_SHOW_PORTABILITY.md:83` "Weight, and who pays it." | The weight is already in the documents. In the largest one the designed looks take 1,293,897 characters and the laser objects 7,940,786; the desk file of that space is 1,507,376 bytes, and 175 of its 176 looks are named as copies. What a visitor's page is sent is not checked; step 1 of the plan measures it. |
| `docs/architecture/LIGHTING_SHOW_PORTABILITY.md:61` "A visitor never downloads it." | Changes. What is made on the desks would be in a project a visitor can open. No output and no cube address is among it. The owner is asked before the first step that writes it there (step 3 of the plan). |
| `di-atlas/decisions/2026-09-23-connect-everything.md:136` "Recommendation: the space." | Replaced by this pick. |
| `di-atlas/decisions/2026-09-23-layers-what-inside-what.md:248` "lives in one file … per machine, not in a project" | Replaced by this pick. |
| `di-atlas/decisions/2026-09-20-one-project-one-stage.md:22` "Never universe/address in the document." | **Not decided here.** As built, the documents carry both (1,703 of 2,799 lamps). Advised: the line is struck. The owner is asked before the first step that reads the patch from the project (step 2 of the plan). |

The two notes in `di-atlas` are not edited by this record; a pointer there is owed.

## What stays

- One cue carries the light and the laser: `src/map/cueFiring.js:56` "The laser look goes right after the light: one cue, one go."
- The output never leaves the machine: `docs/architecture/LIGHTING_SHOW_PORTABILITY.md:36` "Output stays off, and the rig stays with the machine."
- A desk reaches hardware, so it runs on a local install only: `serverXR/src/localRuntimeGuard.js:27` "A device route is an outbound socket someone else can aim."
- One show is loaded at a time: `docs/architecture/LIGHTING_SHOW_PORTABILITY.md:27` "The desk runs one show at a time."
- The laser show is already read from the project by the server: `serverXR/src/index.js:537` "readProjectDocument(SPACES_DIR, project.spaceId, project.projectId)"
- The laser rig is keyed by the cube's serial: `serverXR/src/laser/laserConfig.js:5` "EVERYTHING IS KEYED BY SERIAL."

## What it costs

- The desks learn to load a show from a project and to write what the operator makes back into it. On dev today 0 lines of
  `serverXR/src/lighting/desk.js` name a project document (the command is in the plan).
- Looks are keyed by the project's lamp and no longer by the desk's own id (`serverXR/src/lighting/looks.js:73` "for (const [fixtureId, attrs] of Object.entries(values)) {"):
  one migration, the old file kept beside the new one.
- What the operator makes on a show night lands in the project on the show machine and must come home by the project's road.
  Which side wins when both changed is not settled here.
- Not solved by this pick: each project of a place carries its own copy of the rig. The cure is owed:
  `docs/architecture/LIGHTING_SHOW_PORTABILITY.md:89` "Rebinding a travelling show to a venue's rig"
- The custom fixture types in the desk files (5, 5 and 17 on aylmo) need a home. Not read for this record.

## Not decided here

Each is the owner's, and each is asked before the first step of the plan whose build depends on the answer:

1. The line of 2026-09-20: struck, or the patch moves out of the project. Advised: struck. Asked before step 2.
2. What a visitor may open once the desks' content is in the project. Measured first, in step 1. Asked before step 3.
3. The new default: the desks read the project unless told otherwise. Asked before step 6.

## Undo

This record and the plan change no code and no data: revert the pull request that added them. Every later step adds and
leaves the desks' own files in place, and each names its own undo of one command in the plan.

## How this was checked

- Read by four readers on 2026-11-18 (lights, laser, project, records): 362 of their 362 quotes were found by script within
  three lines of the line named. Their report is kept with the job, outside the repo.
- Every `path:line` "quote" in this record was checked by script against the branch that adds it; the count is in the pull request.
- The real files were counted by script on aylmo on 2026-11-18: keys, counts and sizes only.
- Not checked: the show files on the show machines; whether a hosted tier holds a light show file of any space; what a
  visitor's page is sent.
