# The XR production cycle — from a place to a show that connects in one click, and back

Status: DESIGN, 2026-10-07. Nothing here is built except what a row says exists. Read-only: no server
was written to, no dev data changed, no render run.

Owner, 2026-10-07: *"we go to the place, check the photos and video, use the tools we have for scanning …
the 3D copy of the place, the virtual environment, and the fixtures on hand … the full map: where the visual
artists will be, the light operators, everything … when we set all the items, we go to the place, start to
connect everything, and it works in one click … exactly the same as what we see in the virtual."*

Words (`docs/ai/vocabulary.md`): **place** = the real room (the Charentsavan hall). **space** = its twin in
di.iiii (`moxir`). **project** = one thing in the space (a rig version, the sources wall). **scene** = the 3D
hall you walk. **object** = one thing in the scene (a PAR, a truss, a person's position). **production** =
a place, a client, a work and a run (MOXIR, 17 Oct 2026).

This builds on three documents and does not repeat them:

| document | what it already settles | where |
|---|---|---|
| `EVENT_LAYERS.md` | the layers L0 to L10, CHECK / LOOK / SIGN, the nine agent roles, the 12-step runbook | `origin/docs/event-layers-agents-mcp`; being activated in PR #808 (`feat/event-agents-2026-10-07`) |
| `TOOLS_MAP_2026-10-05.md` | every MOXIR tool, the mess ranked, and the rule *git = design, one build command, everything else derived* | commit `88261e7e`, the `moxir` docs folder on that commit (not on dev) |
| `RIG_BUILD.md` | the data model, the standards, the patch plan, MVR export, the picture (§20, §23) | `docs/architecture/RIG_BUILD.md` (2,375 lines) |

Every claim is tagged **CONFIRMED** (seen: file:line, a command, a PR) or **SUSPECTED** (inferred or not
reachable from here). Practice is named with its source; where the source was not opened in this
session it says so.

---

## 0. The cycle in one picture

```
 capture ─► place model ─► virtual environment ─► items on hand ─► design ─► THE FULL MAP
 (L1)        (L2)           (picture)              (L3)             (L4–L7)   (people, devices, paths)
                                                                                  │
   ▲                                                                              ▼
 re-capture ◄─ strike ◄─ SHOW ◄─ "one click" connect ◄─ get-in ◄─ rehearse ◄─ patch + network plan
 (L1 again)             (L10)      (NEW: connect.mjs)    (L10)     (L8)        (L6 + NEW node plan)
```

The loop closes: the place model after the show is the input of the next production in the same place.
The owner's rule for the whole loop (TOOLS_MAP §4.1, CONFIRMED): **git holds the design; one build command
makes the show project; everything else reads it.** This document adds the stages that were missing from
the layer model: the picture, the full map, the network plan, the connect step, strike and re-capture.

---

## 1. The cycle, stage by stage

Who: **owner** (decides by looking: LOOK), **Emilya** (content and scenes, PONYO), an **agent role** from
`EVENT_LAYERS.md` §2.1, a **signer** (rigging engineer, laser safety officer, electrician: SIGN). A stage is
done only with its CHECK and its LOOK; the on-site stages also need SIGN (EVENT_LAYERS §0).

| # | stage | input | output (the one source) | tool today | check that proves it | who |
|---|---|---|---|---|---|---|
| 1 | **Capture** (L1) | phone walk at `/{space}/scan`; files sent to di.bo; photos as FILES (Telegram "photo" strips EXIF) | the space's `sources` project (the wall) + EXIF table | CONFIRMED `src/scan/ScanSurface.jsx`, `src/scan/sourceWall.js`, `scripts/place/add-sources.mjs`, `photo_meta.py`; di.bo inbox pull every 15 min (`di-inbox-pull.timer`, CONFIRMED `systemctl --user list-timers`) | frame count and sharp count (`frame-stats.py`); every file has a licence and consent line | owner / Emilya shoot; `venue-capture` sorts |
| 2 | **Place model** (L2) | frames + one tape-measured edge + the map pin (OSM, ODbL) | `scripts/place/rigs/<place>-hall-dims-<date>.json`, `-features-<date>.json`; the hall GLB **pinned by sha256** (TOOLS_MAP §4.2) | CONFIRMED `scripts/place/place.mjs --from-space`, `reconstruct.py`, `fit.mjs`, `hall.py` (Blender, parametric), `import.mjs --replace` | `hall-crane.test.js`, `hall-show.test.js`; each dimension carries value, range, method, confidence | `hall-modeller`; owner LOOK element by element (the "arcs" lesson) |
| 3 | **Virtual environment** (the picture) | the rig file's `night` block; reference photographs (RIG_BUILD §20.1) | a `picture` block in the rig file (see §3 below) | PARTLY: `apply-picture.mjs` writes `night` (CONFIRMED RIG_BUILD §23); exposure and haze are written by hand by `realism.mjs` (CONFIRMED §23: "in no rig file") | luma per cue within the §20.1 target (`luma.mjs`); a light-meter and photo test on site (owed, §23) | `scene-writer`; owner LOOK |
| 4 | **Items on hand** (L3) | the rental list (xlsx), what the studio owns, makers' pages | `src/rigbuild/types/<place>.json` (generated), `scripts/place/fixtures/fixtures.json`, the private source list in di-atlas | CONFIRMED `rental.mjs`, `types.mjs --check`, `fetch-equipment-media.mjs`; `/{space}/equipment/{project}` | every code has status (confirmed / probable / equivalent / unknown) + URL + date; prices never in this repo (`noSupplierPrices.test.js`) | `equipment-verifier`; rental house confirms modes |
| 5 | **Design** (L4–L7) | hall + types + the versions file | `scripts/place/rigs/<place>-versions-<date>.json` → one generated rig file per version + `.show.json` | CONFIRMED `scripts/rigbuild/versions.mjs`, `load-version.mjs`, `copy-version.mjs`, `looks.mjs`, `show-cues.mjs`; lasers: PR #776 (Nodes editor, `/laser`, OPEN); video: Raw nodes + `docs/architecture/NDI.md` (file exists, not read here); **sound positions: MISSING** (SUSPECTED: no sound in any rig file) | `versions.test.js`, `bridle-limit.test.js`, policy (L5, not built), `show-clock.test.js` | `rig-planner`, `scene-writer`, Emilya (scenes); owner picks by looking |
| 6 | **The full map** | the chosen version | the SAME version document, with **people positions, device positions and paths as objects** with a `role` (FOH, VJ, laser op, sound, crew, hazer, media server, switch) | **MISSING.** Today the document holds lamps, truss, decks, the DJ riser (`moxir-2026-10-17-full.json:26`, CONFIRMED); `power.csv` per circuit (patch-sheet, CONFIRMED); no person, no cable, no network path | every role has a position; every device has a power path to a circuit and a data path to a node; sum per circuit ≤ its rating | `rig-planner` drafts; owner LOOK on the plot |
| 7 | **Patch and network plan** (L6) | the version + the node list | `<place>-<date>-<version>.patch.json` (universes, blocks, mode, node) + **`node-plan.csv`** (one row per node port) + **an IP plan** (NEW) + `laser.json` (six cube IPs, PR #776) | CONFIRMED `patch-plan.mjs`, `patch.mjs --exact`, `patch-sheet.mjs` (writes `node-plan.csv`, `patch-sheet.mjs:17`), `export-mvr.mjs`, `validate-mvr.mjs`; **Known · full's patch plan and `desk-plan.mjs` are only in PR #766 (OPEN)** | `patch-plan` exits 0; MVR validates against the pinned XSDs; sheet exit 0 = document = plan = desk | `patch-planner`; a console operator imports the MVR (owed since RIG_BUILD §8) |
| 8 | **Rehearse in virtual** (L7–L8) | the project on Light and in the scene | cue list + `showEpoch`; frames per cue | CONFIRMED `/{space}/visualise/{project}` (the room drawn from DMX, RIG_BUILD §18), `show-loop.mjs`, `cue-frames.mjs`, `look-compare.mjs` | each cue's luma in target; GPU renderer string proven; console clean (`show-check`) | `show-check`; owner LOOK on his screen and phone |
| 9 | **Get-in on site** (L10) | the sheets, the safety packet, the rental order | the built rig | print: `patch-sheet.mjs --pdf`, `PlotPrint.jsx`, `/{space}/crew/{project}`; packet: `rigging-safety-checklist` drafts | walk-through against the sheet; every hang point, circuit and laser in the packet | crew; **SIGN** rigging engineer, electrician, LSO |
| 10 | **"One click" connect** | the node plan + the show on Light + `laser.json` | a red/green list; output ON only when green | **MISSING** as one step. Parts exist: Art-Net poll `POST /api/discover` (CONFIRMED `serverXR/src/lighting/desk.js:2210`), output OFF by default (`LIGHTING_DESK.md` "two rules"), `/laser` `GET state` (#776) | every planned node answers at its planned IP with its planned Port-Addresses; every cube answers; nothing unplanned transmits | the owner presses it; §2 below |
| 11 | **Show** | Light, Raw (lasers, video), hazers | the record: `show-record.mjs`, `show-video.mjs` (CONFIRMED in `scripts/rigbuild/`) | the show clock runs (`/light/api/clock`, never `/light/api/show` from a probe: that restarted a loop on 10-05) | the LSO holds the arm phrase; hazers by hand (workaround, §5) | light op, VJ, LSO, owner |
| 12 | **Strike** | the built rig | the rental return list; the "as built" diff | **MISSING**: no return list script; `rental.mjs` prints the order, not the return | counts out = counts in; damages listed | crew; `rental-and-paper` |
| 13 | **Update the place** (re-capture) | a second walk, now with the room empty and the lights off | new dims / features JSON, a new hall GLB sha256; the old one kept as a labelled copy | the same as stage 1 and 2; `copy-version.mjs` keeps the old | the new hall differs from the old by a stated number per edge | `hall-modeller`; owner LOOK |

The runbook in EVENT_LAYERS §4 covers stages 1, 2, 4, 5, 7, 8, 9. Stages 3, 6, 10, 12, 13 are this
document's additions.

---

## 2. "One click" made real

The claim behind the owner's sentence is a standard one in touring practice: the show is prepared off site
on a model, the network is planned on paper, and on site the console **discovers** what is plugged in and
**compares** it with the plan. What must be true for di.iiii to do the same:

### 2.1 Four things that must be true before the click

| must be true | standard or practice | we have today | by 17 Oct | later |
|---|---|---|---|---|
| **A pre-assigned address plan**: every node has a fixed IP, every port a Port-Address (universe), every lamp its address and mode | Art-Net 4 (Artistic Licence, *Art-Net 4 Protocol Release V1.4*, cited `LIGHTING_DESK.md:215`); ANSI E1.31-2018 for sACN universes; ANSI E1.11 for the 512 slots; a show network has no DHCP, so addresses are typed in advance (the desk's own comment, CONFIRMED `desk.js:96-98`) | the patch plan (`*.patch.json`) and `node-plan.csv` exist; **no IP plan file**; the desk's targets are typed into its UI (`state.output.targets`) | write a network file `moxir-2026-10-17.network.json` beside the rig files: nodes `{name, ip, mac?, ports:[{port, universe}]}`, lasers `{id, ip}`, the switch, the desk's own IP; `node-plan.csv` derives from it | the IP plan inside the MVR as `AUXData` (MVR 1.6 has no network schema; keep ours beside it) |
| **A device identity check**: the thing at that IP is the thing the plan says | **ANSI E1.20-2010 (R2017) RDM**: discovery and `DEVICE_INFO` per fixture over the DMX line, through an RDM-capable node; **Art-Net `ArtPollReply`** carries the node's MAC, IP, short name and its `SwOut` Port-Addresses (Art-Net 4 §ArtPollReply) | Art-Net poll exists (`artnet.poll`, `desk.js:2210`); **no RDM anywhere** (CONFIRMED: grep of `src serverXR shared scripts` finds only the "no RDM" flags the desk advertises, `dmxin.js:124,142`); whether the rental nodes do RDM: UNVERIFIED (the UP-B380F spec says "DMX + RDM", `RIG_BUILD.md:2088`, STILL ASSUMED) | **known-MAC table**: the `ArtPollReply` MAC per node, taken once at the first power-up on site, written into the network file; then compare on every poll | RDM discovery through the node (`ArtTodRequest` / `ArtRdm` in Art-Net 4, or E1.20 over a USB RDM interface) so each lamp reports its model and start address |
| **An auto-verify with a red/green list** | grandMA3's *Network* and *DMX protocols* windows show nodes found vs configured; Eos shows gateway status (product manuals, MA Lighting and ETC; not opened in this session) | nothing shows the comparison; the desk's device list shows what answered | `scripts/production/connect.mjs` (NEW): reads the network file, polls, compares, prints the list, exits non-zero on red; a page `/{space}/connect/{project}` (NEW) shows the same list | the page drives the output switch: green = output ON offered; red = stays OFF |
| **A fallback** | manual addresses (the desk's `manual` list, `desk.js:97`); Art-Net broadcast; a second universe path | output OFF by default on a di.iiii install; `di up --lan` is the only start that binds the LAN (`LIGHTING_DESK.md`, CONFIRMED) | the printed sheet and `node-plan.csv`: a crew member types the IPs into the nodes by hand; the desk's `manual` list carries the plan | sACN with priorities as the second path (the desk already merges sACN with `priority 0..200`, `patch-sheet.mjs:103`), after the universe-0 fix |

### 2.2 What one click does, in order (the connect script, NEW)

```
node scripts/production/connect.mjs --production moxir-2026-10-17 --version known-full [--dry-run]
```

1. **Lock.** Refuse unless the show lock (TOOLS_MAP §4.2: rig blob, patch blob, hall sha256, commit) matches
   the project on this install. A mismatch names the file.
2. **Light.** Put the version on the desk exact-or-fail (`desk-plan.mjs`, PR #766), output untouched.
3. **Network.** Set the desk's interface and unicast targets from the network file; `artnet.poll`.
4. **Compare.** For every planned node: answered (IP) · identity (MAC equal) · ports (`SwOut` equals the
   plan). For every laser: `GET /laser/state` shows the cube at its IP. Unplanned responders are listed too.
5. **Show the list** in the terminal and on the page: green / red / unplanned, with the plan's value beside
   the found value. Exit 1 on any red.
6. **Offer output ON** only when all green, or when the owner waives a red line by name (the waiver rule of
   EVENT_LAYERS §1.1: reason, by, date; a waiver never turns red into green, it prints WAIVED).
7. **Lasers stay disarmed.** Arming is the LSO's phrase in `/laser` (PR #776), never part of the click.

**Why it then equals the virtual.** The room on the visualiser is drawn from the same DMX the desk sends
(`RIG_BUILD.md` §18, CONFIRMED). If the plan matched the discovered network, the universe and address a lamp
receives on site is the one the visualiser drew. What the click cannot prove: the lamp's **mode switch** on
its own menu (RDM later), the **hang and aim** (the crew and the owner's LOOK), and the **haze** (by hand,
§3).

### 2.3 Standards and practice, named

| name | what it gives us | status of the source |
|---|---|---|
| ANSI E1.20-2010 (R2017), Remote Device Management | discovery, device info, start-address read and set over DMX | not opened here; ESTA publishes it free (tsp.esta.org) |
| ANSI E1.31-2018, sACN | universes 1–63999, priorities, 2.5 s loss | cited in `LIGHTING_DESK.md:221`; the desk's output sends universe 0 for U1, which E1.31 reserves: **owed desk fix** (`RIG_BUILD.md` §4.5, CONFIRMED) |
| Art-Net 4 (Artistic Licence, V1.4) | ArtPoll / ArtPollReply (node identity), ArtDmx, two-source merge limit | cited `LIGHTING_DESK.md:215`; the desk implements poll and reply (`dmxin.js`, `desk.js`) |
| GDTF 1.2 (DIN SPEC 15800:2022), MVR 1.6 (DIN SPEC 15801:2023) | fixture types and the scene for a console; our export validates against the pinned XSDs | `RIG_BUILD.md` §1, §6, CONFIRMED; a real console import is **owed** since §8 |
| ILDA IDN (IDN-Hello, IDN-Stream) and ILDA ISP-DB25 | the laser industry's network and analog interfaces | not opened here. **Not used:** the LaserCube Ultra MK2 speaks its maker's own UDP protocol (ports 45457/45458, written from `lasercube-core`'s source, PR #776). IDN matters only when a projector with an IDN or ISP interface is rented |
| IEC 60825-1 (laser safety) | classes, the keep-in zone, the LSO | cited in `EVENT_LAYERS.md`; the zone and the arm phrase are in #776 |
| grandMA3 / Eos network setup; pre-visualisation in Capture, Vectorworks Vision, disguise Designer | the practice: plan on the model, import MVR, discover on site, compare | product documentation, not opened; the method, not the products, is what we take |

---

## 3. The virtual environment — its parameters and where they live

Owner: *"in the virtual we work with the environment and change many parameters there: the haze state, light
places, global lights, and so on."* Today the picture is held in six places that drift (TOOLS_MAP §2,
"Picture" row, CONFIRMED). The fix in one line: **one `picture` block in the rig file, written by
`apply-picture.mjs`, read by nothing else.**

| parameter | what it is on the night | lives today (CONFIRMED) | should live (one source) |
|---|---|---|---|
| haze density | the hazer's output; beams visible or not | `renderSettings.atmosphere` σ 0.05 written by hand by `realism.mjs` ("in no rig file", `RIG_BUILD.md` §23) | `picture.haze.sigma` in the rig file; the on-site hazer has no DMX (by hand), so the value is **matched by eye on site**, and the match is written back as a measured number (owed: light-meter and photo test, §23) |
| fog (depth fall-off) | how far you see down the hall | `night.fog {near 60, far 250}` in every rig file (`moxir-2026-10-17.json:395-397`); `worldState.fog` in the project; drifted to 0/32 on dev (§23) | `picture.fog` (rename `night` → `picture`, keep the fields) |
| global / ambient light | the hall's own light: work light, exit signs, the city through the roof | `night.ambient` 0.8, `night.directional` 0.35 (`moxir-2026-10-17.json:387-394`); `work-light.mjs` sets a work-light state | `picture.ambient`, `picture.directional`, with named **presets** `work`, `show`, `house` |
| exposure | the camera's exposure; the "porthole" defect came from exposure 3.5 against fog 32 | `toneMappingExposure` 3.5 by `realism.mjs:179`; never in a rig file (§23) | `picture.exposure` (one number, 1.0 unless measured) |
| time of night | which preset is on when | `showEpoch` (the show clock, `RIG_BUILD.md` §16) is the only clock; no "time of night" | `picture.presets` keyed by cue or clock time: `work` before doors, `show` from the first cue |
| crowd | bodies that block beams and take light | **none** (grep of rig files and `src/rigbuild`: only an aim named `at-the-crowd-low`, `moxir-2026-10-17-full.json:443`) | later: `picture.crowd {density, height}` drawn as a dark layer at 1.7 m; not for 17 Oct |
| light places | where the fixtures hang | the versions file → the rig file → the document (TOOLS_MAP §2) | unchanged: the versions file is the source |

Rule: `realism.mjs` keeps only what the note in §23 gives it (the hall copy and the beam apertures) and stops
writing picture values. `apply-picture.mjs --dry-run` prints `before → after`; `--undo` exists (§23).

---

## 4. Scanning via di.bo

### 4.1 What exists (CONFIRMED unless marked)

| piece | path | note |
|---|---|---|
| the phone camera page | `/{space}/scan`, `src/scan/ScanSurface.jsx`; walk pieces of 30 s uploaded as they close; coaching on sharpness, directions covered, one measured wall (`docs/architecture/PLACE.md` "Scanning from the platform") | seen on a Playwright phone at DPR 3; a real phone end to end is **not verified** (memory, 09-22) |
| the build route | `POST /api/spaces/:id/place/build`, `serverXR/src/routes/placeRoutes.js`; local install only, hosted tiers answer 404 | spawns `place.mjs` detached |
| the pipeline | `scripts/place/place.mjs --from <dir>` or `--from-space <space>`; frames → reconstruction (Meshroom on Colab L4 or local 3080) → crush → fit → `import.mjs` | about an hour, nearly all reconstruction (`scripts/place/README.md`) |
| the di.bo inbox | files sent to the bot land on the Mac and are pulled to aylmo `/mnt/data/footage/inbox/` every 15 min, sha256-checked (`di-inbox-pull.timer`; `ExecStart=~/.local/share/di-inbox-pull/pull-inbox.sh`) | the pull script lives **outside any repo** (SUSPECTED: `~/.local/share/` is not a checkout): a rule-5 gap, owed |
| large files | Bot API caps downloads at 20 MB; the large-file door `fetch-large.py` (di-bo's `setup-fetch-large` script) takes any size | videos needed this door; the owner opened it 09-21 |
| a scan command in di.bo | **none** (grep of di-bo `README.md` and `CURRENT.md` for scan / place / mesh: no hit; `bot.mjs`'s `COMMANDS` table not read: SUSPECTED none) | |

### 4.2 The smallest path: "send video to di.bo → place model updated"

1. **Inbox → the wall.** A timer step after the pull: `node scripts/place/add-sources.mjs --from
   /mnt/data/footage/inbox/<chat>/<date> --space <space>` (CONFIRMED `add-sources.mjs` exists, PR #753).
   Which space: a caption on the di.bo message (`#moxir`) or the bot's one command `/place <space>` (NEW,
   one row in `COMMANDS`). No caption, no space: the file waits in the inbox and di.bo says so.
2. **The wall → the hall.** The same `POST /api/spaces/:id/place/build` the scan page presses, on the
   studio machine; or the owner presses **Make the hall** on `/{space}/scan`.
3. **The hall → the project.** `import.mjs --replace` after a backup to `~/di-backups/`; the new GLB's sha256
   goes into the lock; the old hall kept as a labelled copy.

Three steps, two of them existing; the new code is one timer step and one bot command.

### 4.3 The limit, stated

The footage is the limit, not the tool: MOXIR's 67 frames gave the same roof-and-trusses fragment on Colab
and on the local 3080 (10 min, CONFIRMED in the MOXIR memory). What a usable walk needs (memory 09-22):
**3–5 minutes, landscape, slow, nobody in frame, exposure locked, circling the pillars, the floor in
frame.** The 17 Oct hall is therefore the **parametric** model (`hall.py` from measured dims), not a mesh;
the scan feeds the measurement (fit, EXIF, sun), not the walls. Phone traps still open: `local.thedi.studio`
resolves to the mesh router address; a phone on the Ucom wifi cannot reach it (memory).

---

## 5. MOXIR now (17 Oct; site visit 2026-10-08)

### 5.1 By hand for this show — named workarounds, each with its real fix owed

| workaround | why it is one | the real fix (owed) |
|---|---|---|
| Light runs Minimal's loop with 241 lamps of 7 versions; Known · full is not on it (TOOLS_MAP §3 #1, CONFIRMED 10-05; SUSPECTED unchanged today) | the crew would patch the wrong show | land PR #766 (`desk-plan.mjs` + `known-full.patch.json`), then `patch-sheet.mjs` exit 0 |
| exposure 3.5 and haze σ set by `realism.mjs` on some projects only | the picture drifts per project | the `picture` block (§3) |
| hazers and smoke by hand (no DMX) | the haze state in the virtual cannot be sent; it is matched by eye | a hazer with DMX in the next rental; until then a timed hand-cue sheet beside the cue list |
| `laser.json` with the six cube IPs typed on site (PR #776 "not done") | the lasers are outside the plan until the night | the network file (§2.1) holds the six IPs; cubes get static addresses |
| the hall GLB outside git, one per project (TOOLS_MAP §3 #9) | the scene can differ from the design | sha256 in the show lock; a copy in `~/di-backups/` |
| the show built by scripts outside git (`migrate-moxir.sh` and friends, TOOLS_MAP §1.4) | nobody else can rebuild it | `build-show.mjs` (TOOLS_MAP §4.3) |
| sACN sends universe 0 for U1 (`RIG_BUILD.md` §4.5) | an sACN node set to 1 gets nothing | offset by one in the desk; until then Art-Net only, written on the sheet |
| the inbox pull script in `~/.local/share` | hand-made state | move it into di-bo or di-atlas with its timer unit |

### 5.2 The order of work, 10-07 → 10-17

| day | work | check |
|---|---|---|
| 10-07 | land the truss flip (`feat/moxir-truss-flip-2026-10-07`: Known · full hangs the cut flipped, `archive-versions.mjs`), PR #808 (agents), PR #766 (desk plan) | `bridle-limit.test.js`, `archive-versions.test.js`, `desk-plan.test.js` green; one version left visible |
| 10-08 | **site visit** (§5.3); photos as files and the slow walk into `moxir-sources` | the capture list ticked; EXIF survived; the tape numbers typed |
| 10-09 | hall corrections: new `moxir-hall-dims-2026-10-08.json` / features; rebuild Known · full from git (`versions.mjs` → `load-version.mjs` after `copy-version.mjs`); `apply-picture.mjs --dry-run` then apply | hall tests green; `rebuild-compare.mjs` (PR #767) equal; owner LOOK |
| 10-10 | the network file: node IPs, Port-Addresses, the six cube IPs, the desk's IP, the switch; `patch-plan.mjs`, `patch-sheet.mjs --pdf`, `export-mvr.mjs` + `validate-mvr.mjs` | all exit 0; the sheet shows "Art-Net only" |
| 10-11–12 | Known · full onto Light (`desk-plan.mjs`); cues (`show-loop.mjs`); rehearse in `/moxir/visualise/…`; `connect.mjs --dry-run` against the plan (no network yet: every line red by design) | `show-clock.test.js`; luma per cue in target; the red list reads right |
| 10-13–14 | the full map (§1 stage 6) as objects: FOH, VJ, laser op, hazer positions, power runs per circuit; rental order confirmed; the safety packet drafted (`rigging-safety-checklist`) | sum per circuit ≤ rating; every laser in the packet with its zone |
| 10-15 | **SIGN**: rigging engineer (crane bridge hang, tie-off), electrician (circuits), LSO (zones, arm phrase) | the packet signed |
| 10-16 | get-in: hang by the sheet; power; network; first power-up writes the MACs; `connect.mjs` until green; output ON; lasers aimed with the zone, disarmed | green list; owner LOOK cue by cue |
| 10-17 | show; `show-record.mjs` | the record kept |
| 10-18 | strike: return counts; re-capture walk of the empty hall (stage 13) | counts out = in; a new dims file or "unchanged" |

### 5.3 What the site visit tomorrow must capture (10-08)

Into `moxir-sources` (files, not Telegram photos) and into one dims JSON. Each number: value, how measured,
who.

| what | how | why |
|---|---|---|
| one long tape edge (≥ 20 m) and the hall width at the DJ end | tape or laser measure, twice | the scale anchor (`--scale-edge`); the 8.15 vs 7.95 m hang question (TOOLS_MAP §2) |
| the crane bridge: height under it, its rolled position, the tie-off path, what the hook can hold (plate) | tape, photo of the rating plate | the rigging SIGN |
| the low walls' tops and the press, with heights | tape, photo | the cut and the movers (ground only) |
| **power**: the board's location, phases, each MCB rating, socket types, the run to the truss and to FOH | photos of the board and labels; paces for the runs | the electrician SIGN; `power.csv` per circuit |
| **network**: where FOH and the desk sit, the run to the truss nodes, to the six cubes, to the VJ; is there any house Art-Net or wifi | paces; photos | the network file; cable lengths to order |
| the hazers and smoke machines on site (model, power, position); where the air moves (doors, roof gaps) | photo | the hand-cue sheet; the haze match |
| the house light at night: a lux reading at the floor centre with the work light on and off | a phone lux app at minimum; a light meter if on hand | `picture.ambient` measured, not guessed (§3) |
| the slow walk: 3–5 min, landscape, exposure locked, nobody in frame, around the pillars, floor in frame | the phone at `/moxir/scan` or files to di.bo | the mesh (§4.3) |
| exits, fire exits, the audience line, the DJ riser, where people may not stand (laser zone) | photos, a sketch | the full map and the LSO packet |
| a photo of every rental item already on site, and its label | file with EXIF | `equipment-verifier` |

---

## 6. The minimum we build next, ranked by what it saves on the NEXT place

| # | build | size | saves | why this rank |
|---|---|---|---|---|
| 1 | **`picture` block** in the rig file; `apply-picture.mjs` reads it; `realism.mjs` stops writing picture values | small (one script, one field rename, one test) | the six-place drift that cost the 10-04 "porthole" night | every scene reads one source; the owner's "environment parameters" get one home |
| 2 | **network file + `connect.mjs` + the red/green page** (§2.2) | medium (a JSON schema, a script over `artnet.poll`, one page) | the get-in hours spent typing IPs and guessing which node is which | this IS the one click; the first run on 10-16 measures it |
| 3 | **`build-show.mjs` + the show lock** (TOOLS_MAP §4.3) | medium | re-building a version by hand from scripts outside git | the next place starts from git, not from PONYO |
| 4 | **the full map**: people, devices, cable and power paths as objects with a `role`; printed on the plot | medium (a schema in `src/rigbuild/`, the plot layer, `power.csv` joins) | the "where does the VJ sit" questions on site | the owner asked for it by name |
| 5 | **di.bo → wall**: the inbox step + `/place <space>` (§4.2); the pull script into a repo | small | the manual copy from the inbox to `add-sources.mjs` | the footage, not the tool, is still the limit, so this is 5th, not 1st |
| 6 | **the job record** (L0) and `job.get` | small | nothing holds a production today | needed before an agent can run the runbook unattended |
| 7 | **RDM** through a capable node | later, needs hardware | the mode-switch check per lamp | only pays at rig scale (`LIGHTING_DESK_DESIGN.md:227`) |
| 8 | **crowd** in the picture; **sound** positions in the design | later | realism; a complete map | not for 17 Oct |

Nothing above is validated: each row is a method written down first (house rule 1); the number it saves
is measured on its first run and written back here.

---

## 7. Two picture modes — operate fast, look in full

Owner, 2026-10-07: *"where you do the live performance of the lights, you don't need to see it in high
quality with the full light and haze."* The industry splits the same way: a console's **2D layout / fixture
sheet** (grandMA3's Layout view and Fixture Sheet; ChamSys MagicQ's Plan view beside MagicVis) shows state
(colour, intensity, position) as symbols with no haze, while the **3D pre-vis** (MagicVis, Capture with its
quality presets, Vectorworks Vision, disguise) draws beams in haze for the look. Product manuals, not opened
in this session; the split, not the products, is what we take.

### 7.1 What exists, measured (CONFIRMED)

| piece | what it does | measured |
|---|---|---|
| **Output mode, Full/Lite** (`src/project/viewport/outputMode.js`, commit `d10b500c`; PR #745 was closed, the code landed) | Lite keeps every beam cone and lens and the haze; pools the real lights to 4 (`OUTPUT_POOL_SLOTS`); drops shadows, bloom, reflections, antialias; DPR 1. `?quality=full\|lite` wins, then the Full/Lite button (remembered per browser), else Lite unless the work machine with a fine pointer | known-full, 68 lamps, AMD 860M: full 57 fps and the hall unlit for 18 s of shader compiles; Lite 264–355 fps (`outputMode.js:8-11`) |
| **the visualiser** `/{space}/visualise/{project}` (RIG_BUILD §18) | the room drawn from the desk's DMX, beside the desk | desk API → drawn lamp **33.8 ms** median at 60 fps; Art-Net on loopback → drawn lamp 37.8 ms; two windows 30.8 ms (`RIG_BUILD.md` §18 table). The 3080 holds 60 fps (the cap); the owner's Intel iGPU in Flatpak Chromium 14–19 fps, a frame 50–70 ms (§18) |
| `renderSettings` in the document (`src/shared/sceneSchema.js:9`; `atmosphere.haze` tested in `projectSchema.test.js:853`) | the scene's render parameters, per project | the picture drift of §3 |
| the Walk / Free view buttons on `/moxir` (version row, `RigVersionSwitch.jsx`) | camera modes, not quality | SUSPECTED: not re-read here |

So two of the three modes exist and are measured. What is missing is the **schematic** one.

### 7.2 The three modes and how the switch works

| mode | draws | haze | real lights | target | machine |
|---|---|---|---|---|---|
| **Operate** (NEW) | the hall as lines; every lamp a **dot or short cone** in its colour at its intensity, pan/tilt as the cone's direction; movers show their beam as a line to the floor hit; groups and the cue name as text | none | none (unlit flat colours) | **≥ 60 fps and ≤ 40 ms DMX → drawn** on the operator's machine, including the owner's iGPU; the number that must not grow is the 33.8 ms | the operator's laptop at FOH, any browser |
| **Lite** (exists) | cones, lenses, haze, 4 pooled lights | yes | 4 | 60 fps on a phone or iGPU (measured 264–355 fps on the 860M) | phones, visitors, the crew page |
| **Full** (exists) | everything: shadows, bloom, reflections | yes | up to 8 real + beam-only (venue memory: 90 real = 1 fps, 8 + 82 beam-only = 240 fps on the 3080) | 60 fps on the 3080; the look, the luma targets of §20 | the work machine with the 3080 |

The switch: one more value in the same place, `?quality=operate|lite|full`, the same stored key
(`di.view.quality`) and the same button with three states; the DMX stream and the document are the same in
all three, only the renderer differs (`outputMode.js` already says "the document is never written: the room
draws a copy"). Operate mode is the default on `/{space}/visualise` when the desk is sending; Full is the
default for `/{space}/build`. A mode never changes the document, so switching costs nothing to undo.

Done when: Operate measured on the owner's iGPU at ≥ 60 fps and ≤ 40 ms with the §18 method (`vis-see.mjs`,
`vis-head.mjs`), seen on his screen. Not for 17 Oct unless the measurement is cheap; the Lite visualiser is
the fallback on the night (Lite already holds 60 fps on weaker hardware than the 3080).

---

## 8. Fast fixture placement — move it fast, and it lands in the one source

Owner: *"change the device places easily and fast."* The tension: the fastest hand tool writes ops into the
show project (five pages do: Equipment, Build, Plot, Cards, ScenesDeck, TOOLS_MAP §3 #5, CONFIRMED), and the
design lives in git (the versions file → the rig file). Today a hand move on the page and a re-run of a script
fight over the same project ("whatever ran last", TOOLS_MAP §3 #2).

### 8.1 What exists (CONFIRMED)

| piece | path | what it gives |
|---|---|---|
| Build page (first person, place a lamp, E for the inventory) | `/{space}/build/{project}`, `src/rigbuild/BuildSurface.jsx`; writes ops | the fastest hand placement |
| Plot page (plan view, drag) | `/{space}/plot/{project}`; writes ops | the plan the crew reads |
| Cards page (positions, looks, cues) | `/{space}/cards/{project}`; writes ops | aims and looks per position |
| snap and clamp points | `src/rigbuild/pieces.js:6,29,101` (a clamp every 0.5 m along a truss; `snap.js` joins pieces by their points; a lamp's own position follows its clamp) | a move lands on a legal point, never floating |
| the rig file and the versions file | `scripts/place/rigs/<place>-versions-<date>.json`, generated rig files, `versions.mjs` | the design; `rebuild-compare.mjs` (PR #767) proves a project equals its file |
| restore copies | `copy-version.mjs` | a labelled copy before a replacing write |
| the proposal operations | `rig.version.propose` / `rig.proposal.apply` with `expectedHash`, `dry_run`, restore point (EVENT_LAYERS §3.3, designed, not built) | an agent's move as a diff first |

### 8.2 The rule: the page proposes, the file decides

1. **A hand move on Build or Plot is a proposal, not the design.** The page keeps writing ops (nothing
   changes on screen), but the project carries a flag `rig.dirty = true` with the list of moved ids, shown on
   the version row as "3 moves not in the design".
2. **"Keep"** on that row runs `scripts/rigbuild/keep-moves.mjs` (NEW): reads the moved objects, writes their
   positions into the versions file as **overrides** (`versions[id].overrides[{entity, position, rotation,
   clamp}]`), regenerates the rig file, runs `rebuild-compare.mjs`, and commits on a branch. "Discard" restores
   from the last copy. Either way the flag clears.
3. **An agent's move is text to the same file.** *"Move group `wash-left` 2 m house left"* = edit the versions
   file (a group's `offset` or one override), regenerate, compare, propose. Through the door it is
   `rig.version.propose` with `change: {ops|versionSpec}` and `dry_run: true`, then `rig.proposal.apply` with
   `expectedHash` (EVENT_LAYERS §3.3). On the terminal it is the `rig-planner` agent (`.claude/agents/
   rig-planner.md`, PR #808, allowed `versions.mjs`, `load-version.mjs`, `copy-version.mjs`) with the
   `venue-show` skill (`.claude/skills/venue-show/SKILL.md`) that already names where each fact lives.
4. **Snap always.** Every write path (page, script, agent) passes `pieces.js` clamp points; a position off
   every point is refused with the nearest point named, so a "2 m left" that lands between clamps says so.
5. **The policy gate runs on every keep** (L5: `policy-check.mjs`, not built), so a fast move cannot hang a
   mover above 0.6 m by accident.

| part | md | agent | MCP entry (EVENT_LAYERS §3.3) | skill |
|---|---|---|---|---|
| hand move + Keep | `RIG_BUILD.md` §12 (Build) and §10 (Plot) gain a "Keep / Discard" paragraph | none (a person) | `rig.version.get` to show the diff | none |
| text move | `EVENT_LAYERS.md` §2.1 rig-planner row | `rig-planner` (#808) | `rig.version.propose`, `rig.proposal.apply` | `venue-show` (#808): add the override syntax and the two commands |
| snap refusal | `pieces.js` header comment | none | the propose answer's `refused` list | none |
| keep-moves.mjs | `scripts/rigbuild/README.md` | `patch-planner` re-runs the patch after a keep | `rig.patch.propose` | `venue-show` |

Build first: `keep-moves.mjs` and the flag (small). Not to build: a second hand editor; the three pages are
enough once their moves can be kept.

---

## 9. Auto-generated md, agents and skills — one source, every tool set

Owner: *"we need auto md, agents and skills generation, so di.iiii is 100 % synced with all modern and
future tool sets."* The principle is the same as the rest of this document: the code and the data are the
source; the files a tool reads are derived; a check fails when they drift.

### 9.1 What already generates and checks (CONFIRMED)

| source | derived | the check |
|---|---|---|
| serverXR's live Express router | the catalogue (`serverXR/src/catalogue/`, OpenAPI 3.1 with `x-di-reach`, `x-di-role`, `x-di-agent`); the MCP reads it at start, so the tool list follows the server (`SPEC_agent_door.md` §4; phase 1 in PR #567, merge status UNVERIFIED) | a contract test boots serverXR, walks the router, fails when a route has no entry or an entry names no route (§4 "grows in parallel, enforced") |
| the required AI docs list | `docs/ai/*` (`scripts/sync-agent-docs.mjs`, `REQUIRED_AI_DOC_FILES`) | `npm run docs:ai:check` (`check-agent-docs.mjs`, `check-doc-paths.mjs`) in the validation list of `AGENTS.md` |
| hand-written | `.claude/agents/*.md` (14 files on `feat/event-agents-2026-10-07`: the nine event roles plus backend, infra, nodes, qa, schema …), `.claude/skills/venue-show/SKILL.md`, `run-di-iiii`, `open-call` (PR #808) | none: a role's `allowed-tools` can name a script that no longer exists |

### 9.2 What to generate, from what

| derived file | generated from | generator (NEW) | drift check (CI) |
|---|---|---|---|
| `.claude/agents/<role>.md` **frontmatter** (`allowed-tools`, `model`) | a roles table `docs/ai/roles/event-roles.json` (NEW: role, layer, scripts, model, budget: the EVENT_LAYERS §2.1 table as data) + the scripts that exist on disk | `scripts/gen-agents.mjs` writes the frontmatter and keeps the hand-written body below a marker | fails when an allowed script path does not exist, or the frontmatter differs from the table |
| `.claude/skills/venue-show/SKILL.md` "where each fact lives" and "the command for each job" tables | `scripts/rigbuild/README.md`, `scripts/place/README.md` and the `--help` of each script | the same generator, one section | fails when a command in the skill is not a script on disk |
| `AGENTS.md` sections (the role router, the validation commands) | `docs/ai/roles/*.md` and `package.json` scripts | `sync-agent-docs.mjs` already owns `docs/ai/`; extend it | `docs:ai:check` already runs |
| the MCP tool list | the catalogue (already) | exists | the contract test (already) |
| a tool-neutral `AGENTS.md` for other tool sets | `AGENTS.md` itself (it is already the cross-tool convention: the Claude entry `CLAUDE.md` is one line, `@AGENTS.md`) | nothing to generate | `docs:ai:check` |

### 9.3 Formats and how stable they are (what to pin)

| format | who publishes it | stability | what we pin |
|---|---|---|---|
| **MCP** (Model Context Protocol) | open protocol, JSON-RPC, versioned by date; our door cites the 2026-07-28 revision (`EVENT_LAYERS.md` sources) | moving yearly, with a negotiated `protocolVersion` | the revision string in the door's handshake; the SDK version in `package.json` |
| **OpenAPI 3.1 / JSON Schema 2020-12** | OpenAPI Initiative / IETF drafts | stable for years | the `openapi: 3.1.0` string; the XSD-style sha256 habit for anything downloaded |
| **AGENTS.md** | a cross-tool convention (agents.md), read by several coding agents; Claude Code reads it through `CLAUDE.md`'s `@AGENTS.md` | a convention, not a spec; its only rule is "a Markdown file at the root" | nothing to pin; keep it the only hand-written router |
| **Agent Skills** (`SKILL.md` with YAML frontmatter `name`, `description`) | an open format published by Anthropic (agentskills.io; not opened here) | young (2025); the frontmatter is the contract | the two frontmatter keys; everything else is prose |
| **`.claude/agents/*.md`** (frontmatter `name`, `description`, `model`, `allowed-tools`) | Claude Code's own | tool-specific; a different tool will not read it | generate it, never hand-maintain it; the roles table is the source |

### 9.4 Scope, honest

**Build first:** the roles table as data, `gen-agents.mjs` for the frontmatter, and the existence check in
`docs:ai:check` (one small script, one JSON, one test). That alone removes the drift that matters: an agent
allowed to run a script that moved.

**Not to build:** a generator for the prose of an agent file (the body is judgement, written once by a
person and reviewed); a generator per tool set (AGENTS.md plus MCP already cover any tool that reads either);
"100 % synced with future tool sets" as a promise: what we can promise is **one source, derived files, a
check that fails on drift**, and a new tool set costs one small adapter from the same source.

---

## 10. Owed and open (not rounded up)

- The real console import of the MVR (owed since `RIG_BUILD.md` §8).
- The sACN universe-0 desk fix (§4.5).
- A real phone end to end on `/{space}/scan` (never verified).
- The light-meter + photo test that matches the picture to reality (§23).
- Whether Light still holds Minimal today was not re-read (SUSPECTED; the fix is #766 either way).
- The parallel branches `feat/moxir-site-survey-2026-10-07` and `feat/mcp-rig-tools-2026-10-07` were not on
  origin at 04:15 +04 (`git branch -r`); their results, when pushed, feed §5.3 and §2 respectively.
- Sources not opened in this session: ANSI E1.20, E1.31, Art-Net 4, DIN SPEC 15800/15801, ILDA IDN, the
  MA, ETC, Capture, Vision and disguise manuals. They are named as the field's practice; a sentence that
  depends on a clause should open the clause first.
