## 2026-09-30 — review scope: today's MOXIR code, in areas (for cloud review routines)

This file is the scope of two read-only review routines (A and B) that run in Claude cloud sessions. It holds no code change. It is the branch-named session note of `docs/moxir-review-scope-2026-09-30`.

### House rules the code is judged against (docs/ai/golden_rules.md)
Measured, not claimed. Controls are rectangles (corners of at most 2 px) with touch targets of at least 44 px. Safety rules are tests: a strobe never exceeds 3 flashes per second; a laser is off unless flagged (requiresLaserSignOff) and hangs at least 3 m above any floor a person stands on; no moving head is hung above 0.6 m in a ground version. No write to the owner's data without a restore point. A number that is borrowed or assumed must never read as measured.

### Method (every area)
1. Read the files at the named ref (`git show <ref>:<path>`, or check the ref out in a throwaway worktree). You may run single test files with `npx vitest run <filter>` and tiny node scripts to PROVE a claim.
2. Look for REAL defects: correctness bugs, safety-rule holes, data-safety problems, accessibility / touch / rectangle violations, silent wrong numbers, undocumented assumptions presented as facts. No style nits. No invented problems: an empty list for an area is a valid, honest result.
3. At most 6 findings per area, strongest first. For each: severity (high / medium / low), file and line at that ref, the claim in one sentence, the evidence (quote the lines), a concrete failing input or scenario, the smallest fix.
4. Before you write a finding down, try to REFUTE it: read the path that would handle it, run a script. Keep it only if it survives; write refuted candidates as one line each under "Refuted".
5. Say what you did NOT read. Nothing here was seen on a screen: do not claim visual results.

### Output
Append each area to the report file named in your prompt as soon as the area is done, then commit and push that branch (so a cut-off run keeps the finished areas). Format per area: heading, "Findings" (numbered), "Refuted", "Not read".

## Areas for routine A (safety-critical)
### A1 — Truss clamps in rig-lib, washLevelOf, the versions cap in the schema, the strobe cap
- Ref: `origin/preview/rigbuilder-13-2026-09-30`
- Files: scripts/place/rig-lib.mjs (slopedLineRigging, pickGeometry, segment), scripts/rigbuild/truss-hang.test.js (on branch origin/fix/truss-hangs-from-the-crane if not on the ref), src/rigbuild/looks.js (washLevelOf, withWashLevel), src/shared/projectSchema.js and shared/projectSchema.cjs (RIG_VERSIONS_CAP, normalizeRigVariant), src/rigbuild/strobeCap.js and every place a strobe rate is produced (src/rigbuild/dmxDecode.js, dmxPose.js, rigFlash.js, deskLookValues.js, scripts/rigbuild/show-loop.mjs)
- Focus: SAFETY: can a strobe exceed 3 flashes per second by ANY path (a look's own strobeHz, rigFlash hz, beam.strobeHz, DMX decode of a console, cue fades, the desk's own strobe fixture class, the visualiser)? Is the cap applied to the DMX channel encoding as well as the drawing? Is the ESM/CJS schema mirror identical (normalizeRigVariant, cap, copyOf)? Does washLevelOf still behave for old projects whose keys have no type? Do the new clamp boxes collide with anything or create duplicate entity ids across the 3 picks? Are the truss piece materials (metallic 0.8, no environment map) a visibility problem the drawn clamps do not solve?

### A2 — Ground-mover policy guard and the ground scenes' safety rules
- Ref: `origin/feat/moxir-ground-scenes`
- Files: scripts/rigbuild/ground-movers.mjs, scripts/rigbuild/ground-movers.test.js, scripts/rigbuild/ground-scenes.mjs, scripts/rigbuild/ground-scenes.test.js, scripts/rigbuild/versions.mjs (the policy pass-through lines), scripts/place/rigs/moxir-versions-2026-10-17.json (candidates minimal-ground and full-ground)
- Focus: Can the policy guard be BYPASSED: a mover whose type is not in the isMover list, a group named differently, a rig file without the opt-in flag but named 'ground', mountHeight measured on the wrong face, a beam that only clears 2.5 m at rest but sweeps below in a fade between two looks (the report says in-between poses are reasoned, not measured); laser rules (>= 3 m, rising aims, 0 in every look unless flagged, not in the loop) and how 'requiresLaserSignOff' is enforced; strobe event counting per second in cue lists; loop length arithmetic (sum of holds, fades inside holds); effect machines 'on the floor' near the crowd with no distance rule.

### A3 — Scene deck layer 1: model, history, hash, three-way sync compare, bundle
- Ref: `origin/feat/scene-deck-model`
- Files: src/rigbuild/sceneDeck/*.js and its test file; docs/architecture/RIG_BUILD.md section 21
- Focus: Canonical hash: key order, floats (-0, NaN, Infinity, 0.1+0.2), undefined vs missing, arrays vs sets; does the hash ignore exactly what it claims to ignore; three-way compare matrix completeness (added on both sides, deleted on one side, renamed id, reordered loop); planSync: is a restore point ALWAYS the first action before take-theirs, can keep-both break the 60-90 s loop; guardSceneChange: can any control write a laser above 0 without requiresLaserSignOff, break the ground-mover policy, or set a strobe rate; history/undo inverse ops correctness; parseBundle: prototype pollution (__proto__, constructor), size limits, duplicate ids, non-finite numbers, huge strings; timestamps or documentVersion must never decide which side is newer.

### A4 — Scene deck screens A and B (layer 2)
- Ref: `origin/preview/rigbuilder-13-2026-09-30`
- Files: src/rigbuild/ScenesDeck.jsx, src/rigbuild/ScenesSurface.jsx, src/rigbuild/scenes.css, src/rigbuild/scenesRouting.js, src/rigbuild/sceneDeck/ledger.js, preview.js, bundle.js, src/rigbuild/ScenesDeck.test.jsx, the route lines in src/RootApp.jsx and src/rigbuild/rigTools.js
- Focus: The take-theirs path: guard, then a restore point, then the write — is the ORDER enforced in code, and what happens when the write fails halfway? Does every control AND the sync path go through guardSceneChange (a laser above 0 without requiresLaserSignOff, a strobe above 3 flashes/s, a mover moved off the ground policy)? Lost updates: is the document version checked when the deck writes? The localStorage ledger: corruption, quota exceeded, private mode (every read and write must be inside try/catch and the page must still render). Text from a carried bundle reaching the DOM (scene titles, ids): any dangerouslySetInnerHTML, href or style built from it. Undo / restore-last-good semantics; the loop staying at 60-90 s; timers and animation frames of the 2D preview that survive an unmount; touch targets of at least 44 px and corners of at most 2 px; keyboard operation; the phone at 390 px CSS width.

### A5 — Light pool (room lights follow the scene inside the eight-light budget; flag OFF by default)
- Ref: `origin/preview/rigbuilder-13-2026-09-30`
- Files: src/rigbuild/lightPool.js, src/rigbuild/useLightPool.js, src/rigbuild/RoomLookFollower.jsx (the integration line), src/rigbuild/lightPool.test.js
- Focus: The invariant that the number of real lights NEVER changes (no shader recompile); NaN or missing fields in a lamp; hysteresis (hold 1500 ms, 15 % margin) bugs and oscillation; the 400 ms hand-over dip continuity; behaviour when fewer lit lamps than slots; the 12-slot ceiling; per-frame allocation and cost at 30 Hz on an Intel iGPU at 14-19 fps; that flag OFF really returns the same array (identity) and changes nothing for any existing project; the `?lightPool=1` parsing (injection, persistence).

## Areas for routine B (data and tooling)
### B1 — One baked wash per look (room + writer)
- Ref: `origin/preview/rigbuilder-13-2026-09-30`
- Files: src/rigbuild/looks.js (withLookWash and its helpers), src/rigbuild/useRigLook.js (the wiring), scripts/place/wash-plan.mjs, scripts/place/rig.mjs (--wash-per-look), scripts/rigbuild/load-plot.mjs and rehang.mjs (keep lists), src/rigbuild/lookWash.test.js, scripts/place/wash-plan.test.js
- Focus: ASSET DELETION: assets are content-addressed and shared when two looks bake the same bytes — can removing a stale rig-wash:<look> entity delete an asset another entity (or another look) still uses? The 2 MB cap arithmetic and the message when it refuses. The cross-fade: opacity math, the runtime.visible flag versus opacity 0 (does a hidden model still cost GPU or load time on an Intel iGPU?), useMemo dependency churn (the assets array identity recomputing at 30 Hz), per-frame allocation in withLookWash, the cases lookId undefined, desk-driven looks (lookIdOfDesk), fromLookId equal to toLookId, a look with no wash falling back to the single rig-wash, and an older project with no per-look wash returning the SAME array (identity). Whether the writer can run twice safely (idempotence) and what it touches besides rig-wash entities.

### B2 — copy-version --adopt (writes to the owner's data)
- Ref: `origin/preview/rigbuilder-13-2026-09-30`
- Files: scripts/rigbuild/copy-version.mjs, scripts/rigbuild/copy-version.test.js
- Focus: It writes to live data through the ops route: is it ONLY components.rigVariant of the show entity? Can planAdoption produce a mark the server drops, or overwrite a title or summary it should keep? The gap between the re-read version and the write (a concurrent edit); idempotence; looksLikeCopyOf thresholds ("at most 11 apart" entities) — too lax, could it adopt the wrong project? Does --dry-run really write nothing on every path? This repo's scripts IGNORE unknown flags: could a mistyped flag turn a dry run into a write? The sibling-list cap arithmetic (RIG_VERSIONS_CAP 32) and the message when a mark would be dropped.

### B3 — Patch sheet reads the desk; desk serves refusal flags and overlap names
- Ref: `origin/feat/desk-serves-refusal-flags`
- Files: src/rigbuild/sheet.js, src/rigbuild/plotModel.js, src/rigbuild/rigProgress.js, src/rigbuild/PatchSheetSurface.jsx, serverXR/src/lighting/rigpatch.js, serverXR/src/lighting/desk.js (the rig route and where rigFlags are kept), serverXR/tests/test-rigpatch.js
- Focus: Correctness of address/overlap/conflict logic (universe boundaries, 512-channel wrap, footprints of multi-mode fixtures); the new optional `rigFlags` field in show.json: migration, older desk rewriting the file and dropping it, atomic save; `conflictsWith` on GET /light/api/rig?project=: does it leak another project's or the studio's data beyond fixture names (auth on that route, hosted tiers, visitors)? the sheet vs room count disagreement when the desk is absent; performance of the overlap scan with hundreds of fixtures; input validation of the project query parameter.

### B4 — Light footprint calculator (spot size and lux per lamp per look)
- Ref: `origin/feat/light-footprints`
- Files: scripts/rigbuild/footprints.mjs, scripts/rigbuild/footprints.test.js, docs/ai/sessions/feat-light-footprints.md
- Focus: Physics and units: spot diameter = 2 d tan(beam/2), the ellipse on a slanted surface, illuminance E = I/d^2 cos(incidence) with I from lux-at-distance (lux * at_m^2), candela vs lumens confusion, degrees vs radians, beam angle FWHM vs field angle; 'open air' semantics and silent zero/NaN; the surface-hit reuse of rig-lib (does it ignore columns as the report says, and do the flags say so); rows whose optics are borrowed being flagged every time; the CSV columns matching the Markdown; anything that could present a number as measured when it is not.

### B5 — Version row width, walk-mode versions control, view bar (layout and accessibility)
- Ref: `origin/preview/rigbuilder-13-2026-09-30`
- Files: src/rigbuild/RigVersionSwitch.jsx, src/rigbuild/rigVersionLayout.js, src/rigbuild/rigVariant.js, src/project/components/PublicProjectViewer.jsx (only the parts that place the version row, Walk / Fly, Sound and the walk-mode control), src/project/viewport/smartView/SmartViewBar.jsx
- Focus: Layout at 390, 1440 and 1920 px CSS width, with and without Sound and with Walk / Fly; overlap of the row with any top-right control; fold of labelled copies; keyboard order and focus; aria-expanded / aria-current; touch targets >= 44 px; rectangles only; the assumption that Walk / Fly is about 7.7 rem and Sound about 6.5 rem wide (hard-coded reserve values); scroll cue logic; anything that breaks when a version title is very long or the set has 30 versions.

### B6 — Preview pack and install scripts
- Ref: `origin/preview/rigbuilder-13-2026-09-30`
- Files: scripts/rigbuild/preview-install.sh, scripts/rigbuild/pack-preview.sh
- Focus: POSIX sh (dash) correctness: quoting, set -eu pitfalls, pipelines that hide a failure, the sed -i substitution of version strings, the SHA256SUMS generation against the generated rollback.sh sha256sum -c (relative paths), rollback --with-data correctness (order: di down, restore, di up; the SQLite WAL and SHM files; tar paths), pack-preview: setsid forking, the pgid file race, kill -STOP on a group that has already exited, the temperature parse. The assumption that di save writes into the working directory. Anything that could delete or overwrite owner data, or leave the install half-updated without saying so.
