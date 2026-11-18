# A show in its project: the plan of the move

**Status: a plan. Nothing on this page is built.** Decided on 2026-11-19: a show lives in its project, and the machine keeps
only the wire (`docs/ai/decisions/2026-11-19-a-show-lives-in-its-project.md`). This page is the road there: six steps, each its
own job and its own pull request, each started on the owner's word. What is built today is described in
`docs/architecture/LIGHTING_SHOW_PORTABILITY.md` and `docs/architecture/LIGHTING_DESK.md`.

Words: `docs/ai/vocabulary.md` (space, project, lamp, look, cue, show). A *light scene* is a scene of the light desk, not the
3D scene. *The wire* is every fact about one machine and its cables. *Run state* is what a desk holds while a show plays. *The
desks* are the light desk at `/light` and the laser desk at `/laser`. A *DMX frame* is the values a look sends, lamp by lamp.

## 1. The aim

| Kind | What it is | Home after the move | Goes with a shared project |
|---|---|---|---|
| What the show says | lamps with their patch, looks, light scenes, effects, the cue list, the controller map; laser objects, the laser bank of looks, the palette, the link from a light scene to a laser look | the project | yes |
| The wire | the output, the fixture type library of the house, the laser cubes' addresses and serials, zones, safety, arming | the machine | never |
| Run state | which show is loaded, what is live, the clock, the last cue, who may choose the cue | the desk, on the machine | never |

The desks stay. They play and edit the project's show, one show loaded at a time.

## 2. Where each part is today, and where it goes

| Part | Kept today | After the move | Step |
|---|---|---|---|
| Lamps with their patch | the project document; a copy on the light desk, each lamp with a key to the project's lamp | the project; the desk's copy is built from it | 2 |
| Designed looks | the project document; copies on the light desk, sent by a button | the project; the desk's copy is built from it | 2 |
| The cue list | the project document; pushed to the desk's cue runner by the page | the project; the desk reads it | 2 |
| Laser objects with their frames | the project document; the server already plays them from there | no change | none |
| What is made on the light desk: looks, light scenes, layers, sets, effects, LFOs, audio settings, the MIDI map | the space's light show file, `<spacesDir>/<id>/lighting/show.json` | the project | 3 for what is new, 4 for what exists |
| What is made on the laser desk: the bank of looks, the palette, the link | the machine's laser desk file, `<dataDir>/laser/desk.json` | the project | 3 and 4 |
| The output | the machine's own show file, key `output` | no change | never |
| The laser rig: cubes by serial, zones, safety | the machine's laser file | no change | never |
| Run state | the desks, on the machine | no change | never |
| Scene hotkeys, pane splits and other per-browser things | browser storage | not moved by this plan; step 1 lists them | open |

Proof, in the order of the rows:

- Lamps: `shared/projectSchema.cjs:989` "const universe = fixtureInt(fixture.universe, 1, 63999)" · `src/rigbuild/autoPatch.js:14` "export const rigKeyOf = (projectId, entityId) =>" · `serverXR/src/lighting/rigpatch.js:10` "The desk allocates; the room records."
- Designed looks: `shared/projectSchema.cjs:1199` "if (sourceComponents.rigLooks) {" · `src/rigbuild/CardsSurface.jsx:355` "await fetch(lightingApiUrl('api/looks/add')" · `src/rigbuild/looks.js:31` "export const DESK_LOOK_PREFIX = 'rig-'"
- The cue list: `src/rigbuild/cueRun.js:47` "post('api/cues/load', { project: projectId, list: deskCueList(cues)" · `src/rigbuild/showClock.js:1` "a rig's cue list played with no desk"
- Laser objects: `serverXR/src/laser/laserShow.js:1` "a project's laser lines, played on the real LaserCubes." · `serverXR/src/index.js:537` "readProjectDocument(SPACES_DIR, project.spaceId, project.projectId)"
- The light desk: `docs/architecture/LIGHTING_SHOW_PORTABILITY.md:22` "The show holds the patch (fixtures, groups, the fixture types it made or imported)," · `docs/architecture/LIGHTING_SHOW_PORTABILITY.md:23` "scenes, looks, layers, sets, effects, LFOs, audio settings and the MIDI map."
- The laser desk: `serverXR/src/laser/laserDesk.js:19` "the bank, the clock and the setup are kept in … the live look is not." · `serverXR/src/laser/laserDesk.js:261` "followLight: false, palette: []" · `serverXR/src/laser/sceneLink.js:7` "THE DATA is the laser desk's own saved show (desk.json)"
- The output: `serverXR/src/lighting/desk.js:57` "const MACHINE_SHOW = path.join(DATA, 'show.json');" · `serverXR/src/lighting/desk.js:631` "disk.output = state.output;" · `scripts/space-bundle.mjs:233` "delete show.output"
- The laser rig: `serverXR/src/laser/laserConfig.js:1` "WRITE laser.json FROM THE PANEL" · `serverXR/src/laser/laserConfig.js:5` "EVERYTHING IS KEYED BY SERIAL."
- Run state: `serverXR/src/lighting/desk.js:60` "const LOADED = path.join(DATA, 'desk.json');" · `serverXR/src/routes/showRoutes.js:45` "The operator's setting (who may choose) and the last choice are kept per project in"
- Per browser: `docs/architecture/LIGHTING_SHOW_PORTABILITY.md:101` "Per-browser things are not per show" · `src/rigbuild/sceneDeck/ledger.js:3` "Per project, in this browser's localStorage" · `src/perform/useShowClock.js:34` "const FOLLOW_KEY = 'dii.perform.followLight'"

Counted by script on one machine (aylmo) on 2026-11-18; keys, counts and sizes only, no value was read:

- 40 of its 342 project documents hold a show: 2,799 lamps, 1,062 designed looks, 1,017 cues. 39 of the 40 are in one space.
- Its three light desk files hold 218 looks. 211 are copies of a designed look that exists today; 6 are copies whose designed
  look matches none today; 1 is not named as a copy. They hold 0 light scenes.
- 140 of the 152 desk lamps carry a key to a project's lamp; 12 do not.
- No laser desk file is on that machine.

Counted on the branch that adds this page (the commands are in section 9): the light desk has 59 POST and 20 GET routes, the
laser desk 21 and 4, and 32 lines in 19 files of `src/` name a desk address. 0 lines of `serverXR/src/lighting/desk.js` name a
project document.

## 3. Rules every step keeps

1. A step adds. Nothing is replaced before the owner's word. What a step replaces is named in its spec before building and
   survives as a mode, a tool or an archive.
2. Each step is its own job and its own pull request, with a test that prints a number and an undo of one command.
3. Lights and laser move in the same step wherever both sides exist.
4. Nothing reaches a show machine before it ran on the rehearsal machine (r-di). A checkpoint of the show is taken before a
   show machine changes.
5. The output and the laser rig never enter a project, a file that travels or a log.
6. A field added to the project document is named and normalised in both schema copies in the same change, guarded by
   `serverXR/src/schemaSync.test.js`, with a round-trip test. The reason: `docs/architecture/LIGHTING_SHOW_PORTABILITY.md:110` "rebuilds the document from the keys it knows, on write and again on read, and the write still answers 200."
7. A migration writes beside the old file and never edits it. The desks' own files stay as the named rollback until step 6.
8. No real show goes into the repo. A test reads a made-up show kept with the test; a real show is read only by a command on
   the machine that holds it.

## 4. The steps

### Step 1. Count every machine (read-only)

- **Builds:** one read-only command in `scripts/` (planned). For the machine it runs on it prints: per project document, the
  lamps, designed looks, cues and laser objects; per desk file, the lamps, looks, light scenes, effects, custom fixture types
  and what names a project. It also lists the per-browser stores by name, from the code. It reads keys, counts and sizes,
  never a value, and writes nothing.
- **Also measures** the three numbers of section 5.
- **Touches:** `scripts/` only.
- **Test:** on aylmo it prints the numbers of 2026-11-18 above, or names the cause of each difference. Then it runs on the
  rehearsal machine and on each show machine, and each machine's list is kept.
- **Gives:** per machine, the list of what only a desk holds (the work of step 4), and the numbers that settle section 5.
- **Undo:** remove the command.

### Step 2. The desks load a project's show from the project

- **Today:** the page pushes copies to the light desk: the looks by a button, the cue list when it runs (the proof is in
  section 2). The light desk's server does not read a project document.
- **Builds:** the light desk's server reads the loaded project's lamps, designed looks and cue list from the project
  document, the way the laser show is already read, and builds its copy from them. A switch on the machine chooses between the
  copy as today and the copy built from the project. The switch starts off.
- **Known cost:** a designed look becomes desk values in the page's code today: `src/rigbuild/deskLookValues.js:1` "THE DESK'S LOOKS WITH THEIR DMX".
  The server has to get the same result from the same code; the test below is the proof that it does.
- **Laser:** nothing to build in this step. The server already plays laser objects from the project. The laser desk's bank
  moves in steps 3 and 4.
- **Touches:** `serverXR/src/lighting/` and a test. No schema, no data file.
- **Test:** for every desk copy that names a designed look (aylmo: 211 of 218 looks), the DMX frame computed from the project
  is compared with the frame of the stored copy, lamp by lamp. The command prints same, differ and missing; each difference is
  listed with its cause; unexplained: 0. With the switch off, the desks' own tests pass unchanged.
- **Undo:** the switch off.

### Step 3. What is made on a desk is written into the project

- **Builds:** a look, light scene, effect or controller map made on the light desk, and a look, palette or link made on the
  laser desk, is written into the loaded project. A look with one value per lamp is keyed by the project's lamp (the key of
  section 2) and no longer by the desk's own id: `serverXR/src/lighting/looks.js:73` "for (const [fixtureId, attrs] of Object.entries(values)) {".
  The light desk already knows three scopes of a look (`serverXR/src/lighting/looks.js:44` "const SCOPES = ['each', 'type', 'global'];");
  how many looks are of each scope is counted by step 1. Where it is written, inside the document or in a file of the
  project, is section 5.
- **Touches:** both schema copies in the same change (`shared/projectSchema.cjs:2108` "const normalizeProjectDocument = (document = {}) => {"
  and `src/shared/projectSchema.js:2196` "export const normalizeProjectDocument = (document = {}) => {"), the schema-sync test,
  and the desks' save paths. Why both copies: `docs/architecture/LIGHTING_SHOW_PORTABILITY.md:108` "and a key the schema does not name does not survive there:"
- **Test:** a round trip per kind (write, normalise, read, normalise again; equal for N of N kinds); the schema-sync test
  green; on a second machine that follows the project, the new look is there with no file carried by hand. The rehearsal
  machine first.
- **The owner's question before this step:** question 1 of section 7.
- **Undo:** the switch off. The new fields stay in the documents, unread.

### Step 4. One migration of what only the desks keep

- **Builds:** one command with a dry run. The dry run prints counts per kind and writes nothing. The real run writes what the
  desks' files hold and no project has (light scenes, effects, layers, the controller map; the laser bank, the palette, the
  link) into the project each belongs to, in the form of step 3.
- **Which project:** by the key each desk lamp carries to its project's lamp (aylmo: 140 of 152 lamps carry it). What
  matches no designed look or carries no key (aylmo: 7 of 218 looks, 12 of 152 lamps) is listed for the owner and is not
  guessed.
- **The desk file is never edited.** It stays beside the project as the rollback.
- **Test:** counts per kind equal before and after (N of N); the same DMX frame for every moved look (N of N); every cue's
  laser look is found. Today a cue can name a laser look that the desk of this machine does not have: `src/map/MapCueList.jsx:278` "(not on the desk)".
- **The owner's question before this step:** question 2 of section 7.
- **Undo:** the command removes what it wrote. The desk file was never changed.

### Step 5. A shared project brings its lights and its laser

- **Builds:** nothing new if section 5 puts the show inside the document: follow already carries each project
  (`serverXR/src/follow/streams.js:27` "const projectStream = (projectId) => ({"). If the show is a file of the project, three
  carriers learn that file: follow, the space file and tier sync. Today the space file carries the light show and nothing of
  the laser (`scripts/space-bundle.mjs:7` "the space's light show (lighting/show.json, the lighting desk's"; 0 lines of that
  tool name a laser), and tier sync carries neither: `docs/architecture/LIGHTING_SHOW_PORTABILITY.md:95` "Tier sync does not carry the show."
- **Also settles:** how what the operator changes on a show night comes home, and which side wins when both changed
  (section 8).
- **Test,** on a second machine whose desks are empty: follow the project, open the desks, the show loads. Looks, cues and
  laser looks: N of N. Steps done by hand: 0. The output stays off until that machine's own wire is set. The rehearsal machine
  first, then one show machine with a checkpoint taken before.
- **Undo:** stop following. The desks' own files still hold the show.

### Step 6. The new default, on the owner's word

- **Builds:** the switch starts on: a desk reads the project unless told otherwise. The desks' own files become built copies.
  `docs/architecture/LIGHTING_SHOW_PORTABILITY.md` and `docs/architecture/LIGHTING_DESK.md` are rewritten to what is built.
- **Test:** one full run of a real show on the rehearsal machine, then on its show machine: every look and every cue played
  once and seen on the rig, the count printed.
- **The owner's question before this step:** question 3 of section 7.
- **Undo:** the switch off. The last proven version is named in the step's record.

## 5. The fork: inside the document, or a file of the project

- **Advised: inside the project document.** Every carrier and the version history already hold the document. The designed
  looks, the cue list and the laser frames are there today.
- **Runner-up: a file that belongs to the project,** kept beside its document, if the weight is too much. Then follow, the
  space file and tier sync each learn the file (step 5).
- **Measured on aylmo on 2026-11-18:** the largest project document is 60,651,601 bytes as saved; 51,305,245 of them are
  spaces and line breaks. Written compact, its 38 laser objects take 7,940,786 characters, its 120 designed looks 1,293,897
  and its 80 lamps 9,667. The light desk file of the same space is 1,507,376 bytes.
- **Known:** inside the document means schema work in both copies (rule 6). The desk writes its file whole:
  `docs/architecture/LIGHTING_SHOW_PORTABILITY.md:24` "written the way the machine's show always was: whole, to a temp file, renamed, with"
- **Not checked:** what a visitor's page is sent.
- **Settled before step 3** by three numbers from step 1: the size of the show part of each document, written compact; the
  bytes a visitor's page is sent with and without it; the save time of the largest document. The limits are written into
  step 3's spec, and the owner is told the numbers.

## 6. The work in flight

Eight pull requests were open on this ground when this page was written. None is touched by this plan. The state was read on
2026-11-19; the files were counted on 2026-11-18. The last column is a reading of each file list, not a review.

| Pull request | What it is | State | Files | Schema files | Desk server files | For the move |
|---|---|---|---|---|---|---|
| 1277 | the one-show line of the deck (deck round 4) | draft | 280 | 3 | 0 | adds a bridge; read before step 3 |
| 1282 | deck round 5: the live wall and the newest lights | draft | 321 | 3 | 0 | adds a bridge; read before step 3 |
| 1274 | the wall plays the deck live in the room | draft | 379 | 4 | 0 | adds a store in the browser; read before step 3 |
| 1291 | show desk: a controller map, big scene tiles, a bigger laser side | ready | 25 | 0 | 16 | adds a store in the browser; read before step 2 |
| 1252 | light desk: follow times and colour effects | ready | 28 | 0 | 25 | grows the light desk's own file; read before step 2 |
| 1218 | the laser desk at `/laser` | ready | 26 | 0 | 9 | adds a file store; read before step 2 |
| 1269 | a patch for one show: 50 units on 3 universes | draft | 11 | 0 | 0 | adds a file store; read before step 4 |
| 1257 | space content: facts and a light plot | ready | 4 | 0 | 0 | grows a space; not on the road of a step |

0 of the 8 touch follow or the space file. 0 of the 8 move a store into the project. Each step's job reads the open pull
requests again before it starts.

## 7. The owner's questions, each at its step

| # | Asked before | Question | Advised | Yes means | No means |
|---|---|---|---|---|---|
| 1 | step 3 | Strike the line of 2026-09-20? | yes | The patch stays in the project, as built. A desk plays a shared project with no patching by hand. | The patch moves out of the project into a machine file. A shared project arrives without addresses and each machine patches it again. |
| 2 | step 4 | May everyone who can open a project get its whole show, the part made on the desks too? | yes, unless the numbers of step 1 say the weight is too much | One rule for the whole project. Nothing of the wire is in it. | The part made on the desks is held back from a visitor's page: one more filter to build and to test. |
| 3 | step 6 | Is the project the default source of the desks? | yes, after step 5 passed on a show machine | The switch starts on. | Reading from the project stays a mode, chosen per machine. |

The line of question 1: `di-atlas/decisions/2026-09-20-one-project-one-stage.md:22` "Never universe/address in the document."
As built, the documents carry both: on aylmo 1,703 of 2,799 lamps have a universe and an address. `di-atlas` is the studio's
notes repo and is not public.

## 8. Open, not solved by this plan

1. **Each project of a room carries its own copy of the rig.** In one space on aylmo 39 projects carry 15 different lamp
   counts. The cure is owed: `docs/architecture/LIGHTING_SHOW_PORTABILITY.md:86` "The fixture index as the identity" and
   `docs/architecture/LIGHTING_SHOW_PORTABILITY.md:89` "Rebinding a travelling show to a venue's rig"
2. **The custom fixture types in the desk files** (aylmo: 5, 5 and 17) need a home: the library of the house on the machine,
   or the project that uses them. Not read for this plan; step 1 counts them.
3. **Show-night changes.** What the operator makes on a show night lands in the project on the show machine. Its road home,
   and which side wins when both changed, is written into step 5's spec before that step starts.
4. **Controller maps have more than one home.** The light desk's MIDI map is in the space's show file (section 2). The deck's
   map is in the project: `src/perform/midi/useDeckMidi.js:22` "The user's overrides live in node.values.midiMap, next to values.deck".
   Pull request 1291 adds a map for the show desk. One home is owed.
5. **One show at a time stays.** `docs/architecture/LIGHTING_SHOW_PORTABILITY.md:98` "One show at a time means two pages for two spaces take turns."
   The resolver that is owed there (`docs/architecture/LIGHTING_SHOW_PORTABILITY.md:91` "A cue fires on the loaded show.") is not
   part of this plan.
6. **Not checked:** the show files on the show machines; whether a hosted tier holds a light show file of any space; what a
   visitor's page is sent; why pull request 1218 is open while a laser desk is on dev; why one desk file on aylmo has 44 lamps
   while the project they came from has 80.

## 9. How this page was checked

The counts of section 2, run in the root of the branch that adds this page:

```text
grep -c -P "^\s*'POST /[^']+'\s*:" serverXR/src/lighting/desk.js                     59
grep -c -P "^\s*'GET /[^']+'\s*:" serverXR/src/lighting/desk.js                      20
grep -c -P "document\.json|/projects/|'projects'" serverXR/src/lighting/desk.js      0
grep -c -P '\.post\(\s*.[^,]*desk' serverXR/src/routes/laserRoutes.js                21
grep -c -P '\.get\(\s*.[^,]*desk' serverXR/src/routes/laserRoutes.js                 4
grep -r -P 'light/api|laser/api' src | grep -v -P '^[^:]*\.test\.' | wc -l           32
grep -rl -P 'light/api|laser/api' src | grep -v -P '\.test\.' | wc -l                19
grep -rl -P 'lightingApiUrl\(' src | grep -v -P '\.test\.' | wc -l                   9
grep -c -i laser scripts/space-bundle.mjs                                            0
```

- Every `path:line` "quote" on this page was checked by script against the branch that adds it: the quote starts on the line
  named. The count is in the pull request. The script is kept with the job, outside the repo.
- The real files were counted by script on aylmo on 2026-11-18: keys, counts and sizes only.
- The pull requests of section 6 were read by their file lists, not reviewed.
