# MOXIR audit, area B: show control (moxir-hall-known-full)

Audited 2026-10-04/05, read-only. Sources read: dev API `GET /serverXR/api/projects/moxir-hall-known-full/document`
(HTTP 200, 126 900 B), local install same path (HTTP 200, 126 900 B), origin/dev files via `git show`
(rig, show.json, fixtures.json, moxir.json types, RIG_BUILD.md, src/rigbuild/*, serverXR/src/lighting/*),
the installed di's data on disk (`~/.di/data/spaces/moxir/lighting/show.json`, `~/.di/data/follows.json`),
`~/Downloads/rig-equipment/moxir-hall-equipment.csv`, branch origin/feat/lasercube-out-2026-10-03 (read only).
Not done (by rule): no browser, so no page was SEEN (deck, patch sheet, crew link, /light). `GET /moxir/scenes/<project>`
on the API host is 404 by design: it is a front-end route (src/RootApp.jsx:646). I did not call /light/api on the
local install because the first request builds the desk (binds Art-Net, starts the 40 Hz loop).
Scratch copies of everything: this folder.

Legend: CONFIRMED = I saw the value. SUSPECTED = inferred from code/docs, not seen running.

## Summary

The project document for Known-full is internally consistent (patch has no overlaps, 10 cues all resolve to looks,
dev == local). But the show that would actually reach lamps is not Known-full:
the local desk holds the Minimal's show, the show clock is unset, the PARs/B380F channel ORDER is only a Sevan test map,
and nothing in dev drives the six LaserCubes. Five show-stoppers, three safety/wrong-vs-real, rest gap/cosmetic.

---

## SHOW-STOPPERS

### B1. The desk on aylmo does not hold Known-full; it runs the Minimal's 5 cues in a loop. (show-stopper, CONFIRMED)
- Evidence: `~/.di/data/spaces/moxir/lighting/show.json` (131 KB, written 23:59 on 10-04): `cues.project = "moxir-hall-minimal"`,
  5 cues (Blackout + one shaft, The blade, Red room, White cathedral + the X, The hit), `running: true`, `loop: true`,
  `index 2`, layer firing `rig-red-room`. 241 patched fixtures, **0** with `rigKey` starting `moxir-hall-known-full`.
  Fixtures come from 7 other versions: full-ground 58, minimal-ground 46, minimal 36, minimal-cut-movers-oldhall 36,
  minimal-halo-heads-oldhall 36, minimal-xflat-oldhall 27, minimal-halo 2. Desk looks: 5 (`rig-one-beam`, `rig-slow-sweep`,
  `rig-red-room`, `rig-white-cathedral`, `rig-strobe-hit`); none of the 10 Known-full look ids (`rig-k-monolith` ...) exist on the desk.
- Why it matters: the desk is the only thing that speaks Art-Net (serverXR/src/lighting). "What we see now we will see in real life"
  fails: whoever opens /light or switches OUTPUT on gets the Minimal, not the owner's chosen setup.
- Fix: one scripted load of Known-full to the desk (patch.mjs --exact / show-loop.mjs, RIG_BUILD.md section 19) after clearing the other 7 versions' fixtures;
  RIG_BUILD.md section 19.4 already lists "a rule that only the space's chosen version patches onto its desk" as OWED. Do it with a one-command undo and a backup of `show.json`.

### B2. Desk universes U1-U4 are 100 % full of other versions' lamps, so Known-full cannot land at its planned addresses. (show-stopper, CONFIRMED)
- Evidence: channels used per desk universe (computed from show.json widths): U1 512, U2 512, U3 512, U4 512, U5 368.
  Known-full needs U1 = 512 channels (1-512) and U2 = 176 (1-176).
- Why: rigpatch.js either reports `overlap ... not patched` (rigpatch.js:274) or moves lamps to free slots (U5+), so the crew's
  patch sheet (U1.001...) and the real DMX would disagree. Same trap as RIG_BUILD.md section 19.4 ("opening As-ordered re-patched 32 lamps into free slots").
- Fix: as B1 (clear first, then patch exact). Gate with `patch-sheet.mjs` (it fails on another project's fixture in the show's universes).

### B3. The show clock is not running: `mappingState.showEpoch` is unset on dev AND local. (show-stopper, CONFIRMED)
- Evidence: dev and local `mappingState` keys: output, background, surfaces, cues(10), reference, grid, fade, loop:true. No `showEpoch`, no `showSource`.
  src/rigbuild/showClock.js:36-40: `showOf` returns null unless `showEpoch` is a positive number. So no viewer computes a cue; the room shows "the room as saved".
- Second effect: with a desk answering (aylmo), showClock.js header precedence says the desk drives the room unless `showSource: 'clock'`; here the desk is the Minimal (B1), so the aylmo room view of Known-full would be driven by the Minimal's cues.
- Fix: for the show, `scripts/rigbuild/show-clock.mjs` writes ONE op `setMappingState {showEpoch, loop:true}`; decide per tier who is the driver and set `showSource` explicitly. The epoch is deliberately volatile and excluded from the follow audit (tier-sync.mjs VOLATILE_PATHS), so do not expect dev and local to agree on it; each tier starts its own. For the 17 Oct night the desk (not the clock) is the driver; make that a written, scripted choice.

### B4. Nothing on origin/dev drives the six LaserCubes. (show-stopper for the lasers, CONFIRMED)
- Evidence: fixture docs show `"dmx": false` on rig-lasercube-cut-01..06 (type ext-lc-ultra-mk2), rig file `policy.dmx.offDmx` lists `EXT-LC-ULTRA-MK2`, and docs/ai/sessions/feat-moxir-lasercube-2026-10-04.md: "Not done: ... the Raw laser nodes and server output". The only driver code is on **unmerged** branch `origin/feat/lasercube-out-2026-10-03` (serverXR/src/lighting/laser/{lane,protocol,shapes}.js, `/laser` route, Raw "Laser" + "LaserCube Out" nodes). Its own session note: "NOT done: no real cube yet", proven only against a fake cube on 127.0.0.1. `git merge-base --is-ancestor` says it is NOT in dev.
- Also: that lane has one "cube IP + rate" per panel (SUSPECTED: one cube per lane; six cubes need six lanes or a Cube-Link/broadcast plan; unknown).
- Also: all 10 cues have the laser group at level 0 (`truss-top/ext-lc-ultra-mk2` = 0 in every look; CONFIRMED), and no cue, clock or desk step triggers a laser look. So even with a driver, no show cue starts a laser frame. The scene deck refuses to light a laser without a sign-off marker (model.js:117), correct but it means lasers are off by design until sign-off.
- Fix: merge/land the lane through the proper route (branch, test, review); test on one real cube per its test plan; write a laser cue plan (what is drawn when, from Raw) and a hard OFF/dead-man check; Class 4 sign-off by a certified laser safety officer stays owed (rig policy.lasers.signoff).

### B5. DMX channel ORDER of the PARs and B380Fs is not from the maker; only the Sevan desk map. (show-stopper until confirmed on the units, CONFIRMED as to status)
- Evidence: fixtures.json: UP-PL5403 `dmx_channels [8]` note "its channel ORDER is published nowhere (owed)"; UP-B380F `[16]` same. RIG_BUILD.md 18.1: the real modes carry the TESTED list from the Sevan festival rig (`TESTED_CHANNEL_LISTS`, basis TESTED). Known-full's patch uses modes `8ch` and `16ch` (doc fixture.mode), so lamps follow the Sevan map: PAR = dimmer, R, G, B, W, strobe, ch7 and ch8 unused; B380F = pan, tilt, pan fine, tilt fine, speed, frost, strobe (255 open, 0-3 dark), dimmer, colour, gobo, prism1, prism1 rot, prism2, prism2 rot, focus, reset (always 0).
- Why: this is a measured-on-these-units map from one earlier night, not a maker chart. The rental house's charts are still owed (`~/Downloads/moxir-patch/questions-for-rental.md`, drafted not sent). Unknowns that touch the show: what PAR ch7/ch8 do at 0 (SUSPECTED program/speed, harmless at 0); the strobe rates (ASSUMED 1-20 Hz in the assumed mode; the rig says "no strobe channel used"); B380F strobe channel default 255 (open) must be held by the desk, and the dimmer channel has no default.
- Mixed state on the desk: 27 of the Minimal's PARs are patched in `8ch-assumed` (UPlus stand-in order: dimmer, R, G, B, W, strobe, function, speed), 99 PARs in `8ch`. Two different maps for the same lamp type on one desk (CONFIRMED in show.json).
- Fix: test the real units before the show (one PAR, one B380F, per channel), or get the rental house's chart; record result as TESTED in fixtures.json; make Known-full use only the confirmed mode.

---

## SAFETY

### B6. Mover pan/tilt travel while a cue is lit at 0 s fade. (safety, SUSPECTED)
- Evidence (CONFIRMED values, SUSPECTED consequence): cue "Crown" (fade 3) backstage B380F aim `fan spread 24` then "The hit" (fade 0, hold 4) aims `vertical`, level 1; then "Fan hit" (fade 0) aims `fan spread 10`. Cue 10 and 9 both change the 7 booth beams' aim with a 0 s fade. Real moving heads slew over seconds (speed channel), so the beams sweep while lit. The B380F `speed` channel is not mentioned in any look (levels/aims only).
- Why: the beams are 1.8 deg, 500 W-class and all on the floor behind the DJ; policy says no ground mover passes through the dance zone below 2.5 m. The policy was checked on the aims as targets (ground-movers.mjs), not on the travel between aims. The "Light box" cue also uses `in_deg 28` on the 10 column-base beams; whether any of that crosses the crowd's 2.5 m eye height is not shown in the document (unknown; leave to area A / the ground-movers proof).
- Fix: pre-position (a blind move one cue earlier at level 0) before any hit; or fade >= the head's slew time; add speed values to the looks.

### B7. Laser: the owner's "laser 0 in all looks" is a safe state, but there is no scripted stop path in the show. (safety, CONFIRMED values, SUSPECTED gap)
- Evidence: see B4. The lane branch has OFF twice + 3 s dead-man + SIGTERM OFF; the document/desk have no laser cue and no "all lasers OFF" cue. A pulled cable or kill -9 cannot send OFF (its own note).
- Fix: a hardware key/interlock and the laser safety officer's procedure; not a software cue.

### B8. A `Blackout` / hold-0 rule: no cue waits for GO, loop is auto; no manual stop cue for the crew. (safety/gap, SUSPECTED)
- Evidence: all 10 cues hold >= 4 s (show.json); `loop: true`. The desk has a blackout switch (show.json `blackout: false`, master 255). A crew's own stop is the desk's blackout only.
- Fix: write down who owns blackout on the night; test it on the real desk.

---

## WRONG-VS-REAL

### W1. The patch puts 57 fixtures on one DMX line (U1) with 0 spare channels, and mixes the air truss, the nave columns and the floor. (wrong-vs-real, CONFIRMED values, SUSPECTED consequence)
- Evidence (dev doc, entities `components.fixture`): U1 = 50 PL5403 at 1..400 then 7 B380F at 401..512 (last `rig-beam380-backstage-07` at 497, ends at 512). U2 = 10 column B380F 1..160 + lighthouse 161..176. Channel use U1 512/512, U2 176/512. U3/U4 unused though the order has a 4-universe node (CSV row "Art-Net / sACN node ... 4 universes").
- Compare: the Minimal's patch plan (`moxir-2026-10-17-minimal.patch.json`, "method") says one universe per data run (crane line, each wall, booth), blocks on round numbers, and each universe keeps at least half of its 512 spare. Known-full has no patch plan file (none in scripts/place/rigs); addresses are index-order packing (fixture.index 1..68).
- Why: 57 devices on one RS-485 line exceeds the 32 unit-load limit of DMX512-A without a splitter (SUSPECTED: depends on the units' load, unknown). The CSV (the real order) lists no splitter, no cable, no PDU, no distribution; only the node. A lamp added on the night has nowhere in U1.
- Fix: write `moxir-2026-10-17-known-full.patch.json` (data runs on U1..U4), re-patch, and put the splitter/cable list into the order.

### W2. Order vs rig counts do not agree on the PARs; the CSV is stale. (wrong-vs-real, CONFIRMED values)
- Evidence: CSV `UP-PL5403 qty 24, stock 50, placed 24, source 'ordered as "50x UP-PL5403"'`; Known-full patches 50. CSV `UP-B380F qty 18, placed 18` agrees (7+10+1 = 18). CSV lists UP-250BSW (12), UP-HK1915 (8), UP-LA40WF (2), UP-Q108S (6), UP-YH600F (4) as ordered; Known-full has none of them. CSV has no smoke machine row (UP-YZ31P x4) and no LaserCube row, while the rig has 4 smoke + 6 LaserCube; MDG ATMe x2 is in the CSV, the rig has 6 hazers of type EXT-HAZER. So "the order" and "the setup" differ in 3 places: PAR 24 vs 50, unplaced heavy gear, lasers.
- Fix: re-export the equipment CSV from the Known-full project; settle 24 vs 50 PARs with the rental house (fixtures.json writes 50x).

### W3. Rig file text is stale about the lasers. (wrong-vs-real / cosmetic, CONFIRMED)
- Evidence: moxir-2026-10-17-known-full.json `variant.summary`: "... the 2 fixed UP-LA40WF, held dark until the laser sign-off", and `status` "PROPOSAL ... Nothing here is checked against the venue". The document has 6 LaserCube Ultra MK2 and no UP-LA40WF (session note 10-04). `writtenAt 2026-09-28`.
- Fix: update the summary.

### W4. B380F "colour" in looks is a CSS hex; the real unit has a colour wheel. (wrong-vs-real, SUSPECTED)
- Evidence: looks colour `backdrop` and `named-beam380-lighthouse` = `#eef3ff` (bluish white), `column-bases` `#eef3ff`; the B380F `color` channel is "Colour wheel (0 white, 12 colour 1...)". How `#eef3ff` maps to a wheel slot (open white, or a colour-1 slot) is not shown; I did not read dmxDecode/looks mapping to the end. Unknown.
- Fix: check the desk's DMX for `rig-k-vista` on the B380F colour channel (should be 0 = open white).

### W5. White on PARs is the W emitter; looks say `#ffffff`. (wrong-vs-real, SUSPECTED)
- Evidence: show.json `why`: "White is the PARs' own W emitter, red is R alone". The desk's mapping from `#ffffff` to R+G+B+W vs W only is not shown (unknown). Matters for brightness and for the real 162 W per PAR power.
- Fix: print the desk's DMX values for `rig-k-monolith` and check them against what the show.json text claims.

---

## GAPS

### G1. Cues vs looks (CONFIRMED all resolve). 
10 cues in `mappingState.cues` (ids show-01..show-10) match show.json 1:1 (names, fade, hold, order): Monolith 0/12, The blade 4/16, Vista 6/16, Red room 5/12 (`gs-red-room`), Forest 5/12, Light box 6/16, Haze wall 5/10 (`gs-haze-wall`), Crown 3/12, The hit 0/4, Fan hit 0/4. All 10 `lightLook` ids resolve to a look in `rig-show.rigLooks` (25 looks stored; 15 of them are not in the cue list: gs-one-shaft, gs-columns-below, gs-roof-reveal, gs-slow-fan, gs-cross-beams, gs-white-cathedral, gs-laser-roof, k-doors, k-the-x, k-tunnel, k-green-core, k-amber-dust, k-lights-up, k-one-shaft, k-cathedral-x = unused spares; two of those, gs-laser-roof, is a laser look). No look references a group that no longer exists: all 12 keys in looks (`truss/up-pl5403`, `truss-top/...`, `named-par-*`, `column-faces/...`, `backdrop/...`, `column-bases/...`, `named-beam380-lighthouse/...`, `truss-top/ext-lc-ultra-mk2`) map to groups present in the rig. (My first match by group name failed; the doc renames groups to position/type by looks.mjs, as designed.)
- The look levels in the doc differ from the rig file only by that renaming (checked by key mapping; I did not diff every number: SUSPECTED same).

### G2. Loop is 114 s; the scene deck allows only 60-90 s. (gap, CONFIRMED arithmetic, SUSPECTED behaviour)
- Evidence: loop = sum of holds (fade is inside the hold; `loopSecondsOf`, model.js:63): 12+16+16+12+12+16+10+12+4+4 = **114 s**. `LOOP_RANGE_S = {min 60, max 90}` (model.js:20) and guardSceneChange (model.js:136) refuses any change that alters the loop length to a value outside 60-90.
- Why: on `/moxir/scenes/moxir-hall-known-full` any retime of a hold that leaves the loop >90 is refused with "the loop would be N s, outside 60-90 s" (SUSPECTED; not seen in a browser). To fit the range the crew would need to cut >= 24 s in one edit... a single-cue change cannot get there, so the deck cannot be used to shorten it.
- Fix: decide the show length (the actual night's length is unknown to me), then either set the loop within the range by script, or change the deck's range.

### G3. Intensities. (CONFIRMED values)
Levels are 0..1 per group per look. Peaks: PARs 1.0 only in Monolith (press), Crown, The hit (X + curtain), Vista; truss-top bridge 0.6 max; column-faces 0.6 max (0.2 in Light box); neighbour (forest) 0.6 max; B380F backstage 1.0 in Crown/Fan hit, 0.8 haze wall, 0.4 red room, 0.3 vista; column-bases 1.0 in Light box and Crown; lighthouse 1.0 in Monolith/Vista/Crown. `truss/up-pl5403` (the X) is lit in only one cue (The hit); `named-par-neighbour` in only one (Forest); `column-bases` in two. All 50 PARs and 18 beams are used at least once; the laser group in none.
- Hazers and smoke are by hand (off DMX): no cue, so haze density in each look is the operator's job; the room's look is drawn with heavy haze (`air` 1.5) so the "same as in real life" depends on a hand action that is not in any cue list. (gap)

### G4. Stray projection surface in a light show. (gap/cosmetic, CONFIRMED)
`mappingState.surfaces` holds one "Surface 1" with source `ndi / PONYO (TouchDesigner)`, brightness 1.69, contrast 1.34, saturation 0.42, hue 92, opacity 1, enabled, 1280x720. Looks like leftover from a mapping test. If a projection output is ever opened with this doc it would draw a TouchDesigner NDI source. Fix: remove or disable.

### G5. The desk's own looks are missing fixtures. (gap, CONFIRMED, only on the Minimal that is on the desk)
Each of the 5 desk looks lists 36 fixture ids; 7 of them (`fxmumvwkml156..162`) no longer exist on the desk. So even the Minimal currently drives 29 lamps, not 36.

### G6. The `Art-Net node` is not in the order beyond one row; ports vs universes. (gap, CONFIRMED)
CSV: 1 node, "4 universes", supplier "other supplier", added by hand. Known-full needs 2 universes (U1, U2), 4 ports available; the plan says "planning equivalent: Luminex LumiNode 4", not bought. Art-Net numbering: desk U1 = Art-Net Port-Address 0 = sACN 1 (rigpatch.js:34; documents are 1-based and the desk 0-based, consistent). No node IP/subnet is recorded anywhere I read (unknown).

### G7. Pages I could not see. (gap, unknown)
Scene deck `/moxir/scenes/moxir-hall-known-full`, patch sheet `/moxir/patch/...`, plot, crew link `/moxir/crew/...`, desk `/light/?space=moxir`: routes exist in src/RootApp.jsx (lines 600-662) and RIG_BUILD.md section 12 says crew is read-only and the patch sheet and crew link are ungated (RIG_BUILD.md:1857). Not opened (rule: no browsers). Status unknown.

---

## DEV vs LOCAL

CONFIRMED identical: a recursive diff of the two documents (127 entities, mappingState with 10 cues, rigLooks, rigVariant, fixtures) found only `projectMeta.createdAt` (dev 1791137266188, local 1791142257565) and `updatedAt` (dev 1791137267593, local 1791142260028), the local copy about 83 min later, which is normal for a follow carry. Sizes equal (126 900 B). The local `moxir` space is followed from `https://dev.diiii.xyz/serverXR` since 2026-10-04T19:30Z (follows.json). Not compared: the desk show (`spaces/moxir/lighting/show.json`) on dev, because /light is a local-runtime lane and dev has no desk (src/routes/lightingRoutes.js); so the desk state exists on aylmo only and travels with the space bundle only if the follow carries it (unknown). Per the owner's rule "dev and local stay one", the desk's show is a difference that is not explained by follow: it is an open row.

## Other notes
- A document-level hint: the rig doc entity `rig-show` has `rigVariant.id = known-full-ponyo-10-04`, `copyOf {projectId: moxir-hall-known-full, id: known-full, label: PONYO 10-04}`: the version row says the "chosen setup" is the PONYO copy, whose project id is `moxir-hall-known-full`. Consistent with the owner's choice; `known-ground-ponyo-10-04` (moxir-hall-known-ground) is its sibling.
- While reading `~/.di/data/follows.json` I let the first lines print, which exposed sync tokens in this session's tool output (not sent anywhere, not written to this report). They are in the transcript only; rotate if that transcript is shared.

## Owed, in order
1. Clear the desk, load Known-full exactly (scripted, with undo), see U1-U2 patch sheet agree (B1, B2).
2. Test real PAR and B380F channel maps; fix the order from the units or the rental house's chart (B5).
3. Write a Known-full patch plan with data runs and splitters; add them to the order (W1, W2).
4. Show clock and driver choice, scripted (B3).
5. Land and prove the LaserCube lane on a real cube; laser cue plan; Class 4 sign-off (B4, B7).
6. Mover pre-position before the hits (B6); loop length vs deck range (G2); remove stray surface (G4); correct rig text (W3).
