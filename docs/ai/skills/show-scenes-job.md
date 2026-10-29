# Show scenes job — one documented method for a show's light scenes

Skill text, 2026-10-17. **The skill `.claude/skills/show-scenes-job/SKILL.md` (2026-10-26) is the entry point and holds the safe-flag defaults and the rules that must never be skipped; this file stays the long source for the steps and traps (one source for each text).** Drafted from the MOXIR v6 scenes job (session note `docs/ai/sessions/feat-moxir-scenes-v5-pr-2026-10-17.md`),
where several agents designed and wrote the scenes over hours. Owner: *"learn for future that we can work fast"* — *learn once, optimise forever.*
This is steps 4–6 of [venue-to-show.md](venue-to-show.md) as one job. **Read it before any scenes job; fix it in the same branch as the work that proves it wrong.**
Words (`docs/ai/vocabulary.md`): **space** = the owner's domain on the platform · **project** = the thing you make (a version of a show) · **scene** (a designed
light state: a scenes-file entry, becomes a rig **look** + a **cue**) · **place** = the real hall · **production** = a place, a client, a work, a run.
`<space>`, `<show>`, `<prev>`, `<new>`, `<tag>` below are yours. MOXIR (Charentsavan, 17 Oct 2026) appears only as the worked example.

**Start:** there is no launcher script yet (owed, §9). The start is two commands, then step 1:
```
python3 -I scripts/place/venue_to_show_check.py --api <api> --project <prev>      # where the newest version stands, names the next step
git switch -c docs-or-feat/<show>-scenes-<date> origin/dev                         # one branch, one worktree, one scratch stack for the job
```
`<api>` = `http://127.0.0.1:4337/serverXR` on a scratch stack. Every write to a project: **backup → dry run → `--apply` → read the count back.**

## Lanes — who runs what
- **Executors run headless on the Console API keys, not on a chat's plan meter.** A chat only *leads*: it states the goal and the numbers, reads
  the executors' files, judges, and talks to the owner. It does not write scenes by hand and does not run the long loops.
- Two **designers** (step 2) and one **judge** (step 3) are three separate runs with no shared context; the lead is the synthesis.
- One lead per show document. Another session holding the live desk (MOXIR: beam) keeps it; you read it, you never write it.
- Give each executor its inputs as FILES (paths), never a retyped summary; take its output as a FILE and diff it. A hand-over names the tools,
  the inputs and the traps below.

## 1. Inputs  (target: all four ready in ≤ 20 min)
| input | command / source | file |
|---|---|---|
| the owner's references, measured | `python3 -I scripts/place/picture_palette.py OUT.json --group posters <paths> --group place <paths> --group teaser <clips> [--crop TOP,BOTTOM]` (pictures, videos, folders; needs numpy + Pillow, ffmpeg for video) | `analysis-palette.json`: per group **dark share** (V ≤ 0.15), **white glow** (V > 0.6, S < 0.25), **coloured glow**, hue sectors |
| what each device can do | read `docs/<show>/devices/<kind>.md`, the **TESTED** rows only (walked on a real unit); APPROVED/ASSUMED rows are not capabilities. Take: colour slots *seen* on the wheel, full power, gobo open. Code twin: `src/rigbuild/fixtureTypes.js` (`B380F_SLOTS_SEEN`) | a table in the brief |
| the rig / hang | `python3 -I scripts/place/rig_generate.py hang --rig <last rig> --out <show>-hang-v<X>-<Y>-<date>.json` (once per venue) | the hang file |
| the owner's words as rules | one line each, with a number you can test: *"too much white"* → white glow ≤ N % of pixels; *"underground"* → dark share ≥ N %; *"red only as an accent"* → red in ≤ N scenes, never on the floor | `rules` in the spec |

Run `picture_palette.py` on the references **and** on the last version's renders with the same groups: the table is the "before". MOXIR 10-17 (the
numbers that decided it): posters dark 11 % · white glow 68 % (paper); teaser dark 52 % · white 9.7 % · coloured 1.5 %; the place dark 39 % · white 3.2 % ·
coloured 4.6 %; v6 renders dark 53 % · white 2.3 % · coloured 0.6 %. Ask for what is missing (MOXIR: the line-up exists only with the owner; two searches found nothing).

## 2. Two designs  (2 executors in parallel, ≤ 15 min each)
Each designer gets the same brief (inputs, rules, device table, this file) and a **different angle** — e.g. A = *the story of the night* (acts, energy curve),
B = *the pictures* (match the reference table scene by scene). Each writes a **compact spec** `scenes-<angle>.spec.json` in the format of
`scripts/place/scenes_build.py` (module doc; example `scripts/place/rigs/moxir-v2-10-lasers-centred-2026-10-15.spec.json`):
`{"config": {still, floor{parts, per_act}, desk_caps, cap_parts, parts[]}, "palette": [{hex,name}], "beam_wheel_seen": {…}, "rules": {…}, "scenes": [{id, title, act,
intent, parts{part: [hex, level]}, motion{mode,bpm,depth,spatial,kinds,still}, heads{pattern,period_s,pan_deg,tilt_deg,spatial,kinds}, laser_colour, fade_s, hold_s, notes}]}`.
Head patterns: `fan sweep cross circle figure8 nod wave` (`src/rigbuild/headMotion.js`). Then each designer runs, and attaches the output of:
```
python3 -I scripts/place/scenes_build.py --spec scenes-<angle>.spec.json --out scenes-<angle>.json    # builds and checks; exit 1 = refused
python3 -I scripts/place/scenes_build.py --check scenes-<angle>.json
```

## 3. Judging and the synthesis  (1 judge, ≤ 15 min; the lead writes the spec)
Score both files with the SAME script of numbers; no score is read off a picture by eye. Criteria:
| criterion | how | pass |
|---|---|---|
| dark share, white share, glow colour | `picture_palette.py` on the renders of each file (step 6 pictures) against step 1's table | within the owner's rule numbers |
| max simultaneous bright sources | count parts with level ≥ 0.8 per scene (`jq`/python on the file) | ≤ the rule (MOXIR: no more than the beams + one wash set) |
| device coverage | every device kind appears in the file; every beam colour is a seen wheel slot | all kinds used; 0 colours off the wheel |
| flashes | `node scripts/place/scenes_flash.cjs scenes.json [--max 3] [--json]` — `rules.flash`, default 3 per second (WCAG 2.3.1) | exit 0 |
| heads really turn | `node scripts/place/heads_check.mjs DOC.json [--min 3] [--json]` (needs a saved project document → runs on the copy, step 5) | exit 0: every moving look turns its beams ≥ 3° |
| energy | `python3 scripts/place/scenes_energy.py --scenes … --energy … --rig … --beams "<p>,<p>" --floor "<p>,<p>" --out …` · `python3 scripts/place/look_energy.py --doc DOC.json` | each cue's light in numbers matches the curve |
| physics | `python3 scripts/place/physics_check.py --api <api> --project <new> --hall <hall record>` | 0 leaks |
**Synthesis:** the lead merges into ONE spec, scene by scene (take A's story, B's colours — whichever scored), by a generator script
(`docs/moxir/scenes-v6-2026-10-17/scenes_v6.py` is the shape: base file + overrides → out, nothing typed by hand). A merge from another session's file re-reads THEIR current file first.

## 4. Build and guards  (≤ 5 min; every one must exit 0 before step 5)
```
python3 -I scripts/place/scenes_build.py --spec final.spec.json --out scenes-final.json      # the file's palette[] / beam_wheel_seen[] are the only colours allowed
node scripts/place/scenes_flash.cjs scenes-final.json
python3 -I scripts/place/rig_generate.py build --hang <hang> --scenes scenes-final.json --out <show>-<X>-<Y>-<date>.json --version X.Y --title "<t>"
python3 -I scripts/place/rig_generate.py check --rig <new rig> --against <prev rig>          # names what changed; units must be equal
```
`heads_check.mjs` runs on step 5's document (GET `<api>/api/projects/<new>/document` saved to a file) and any failure comes back here.

## 5. Write to a COPY project only  (≤ 5 min)
Never the show document before the owner's pick.
```
node scripts/place/copy_project.mjs --api <api> --space <space> --from <prev> --to <new> --title "<t>" --backup <dir> --apply   # dry run without --apply
node scripts/rigbuild/epic-build.mjs --api <api> --project <new> --rig <rig out> --token-file <env> --looks-only --apply
```
Read the looks and cue counts back (MOXIR: 50 looks, 50 cues, 67 units). `heads_check.mjs` and `physics_check.py` now on `<new>`.

## 6. Pictures and the review page  (≤ 20 min)
```
node scripts/rigbuild/show-loop.mjs --api <api> --project <new> --token-file <env> --no-start        # loads the DESK with the document's own cues, does not start the runner
DI_TEST_LANES=<n> DI_TEST_LANE=<n> di-test-browser run scripts/measure/env-pick-shots.cjs --plan plan.json --out <dir> --restore cues-before.json
python3 -I scripts/place/scenes_sheet.py scenes-final.json sheet.html --pictures <dir>/shots.json [--meta META.json] [--front FRONT.html]
```
Save the desk's cue list first (`GET /light/api/cues` → `cues-before.json`): `--restore` puts it back.
- **The desk hold trap:** the room page follows the DESK, not the document. `laser-scene-shots.cjs` holds a cue only in the browser copy, so all its
  pictures showed the SAME stored look. Use `env-pick-shots.cjs` with a desk loaded by `show-loop.mjs --no-start`. It needs an env from `lightEnvOf` (a rig env file
  crashes it) and, when killed, leaves its held cue on the desk: restore from `cues-before.json` by hand.
- **The agent screen:** shots run in the agent's own test lane (`DI_TEST_LANE=<own>`), never on the owner's screen; refuse a software renderer.
- **Open the pictures.** A sheet you did not look at is not verification. The review page = the sheet, plus the room page `/<space>/p/<new>` opened for the owner,
  plus the step-1 table beside the new renders. Say plainly what is picture-checked and what is only numbers.

## 7. The owner's pick
He picks by looking: sheet + room page, nothing else. His word is the only gate to step 8. Record it in the session note verbatim.

## 8. Apply to the show document — backup and the one-command undo
```
node scripts/place/copy_project.mjs --api <api> --space <space> --from <show> --to <show>-before-<tag> --backup <dir> --apply   # the backup, as a project and as JSON in <dir>
node scripts/place/copy_project.mjs --api <api> --space <space> --from <new> --to <show> --update --backup <dir> --apply        # the pick becomes the show document
node scripts/place/copy_project.mjs --api <api> --space <space> --from <show>-before-<tag> --to <show> --update --apply         # UNDO: the one command
```
The copy keeps the project's id and title: pass `--title`. Writes to localhost only unless `--remote`; carrying the version to another tier is the owner's separate word.
Then `show-loop.mjs … --project <show> --token-file <env>` (without `--no-start`) only if the owner says the desk runs it, and only if you hold the desk.

## 9. The review — fill in at the end, in the session note
Times per step against the budgets above · tokens per executor and lead · defects found (by which guard, or by the owner's eye) · what changes next time.
**Owed (changes for next time):** one launcher `scripts/place/scenes_job.*` that runs the start, §4 and §5 as one command; a `picture_palette` score step that exits 1 against the rule numbers; the desk-hold fix in `laser-scene-shots.cjs`; `env-pick-shots.cjs` restoring on kill. MOXIR v6 took ~hours across agents: record the new time here.

## Traps — written rules (verbatim from the session note, 2026-10-17)
1. **A written standing choice is a hard rule.** v5 went colourful (lime, magenta, amber, orange on the beams) and broke the skill's standing choice (*underground, rare colours, red only as an accent*) — the worst kind of failure. `scenes_build.py --check` refuses any part colour outside the file's own `palette[]` / `beam_wheel_seen`.
2. **Never read a flash claim off a table by eye** ("sparkle at 33 bpm = 3/s"; it is 4). `scenes_flash.cjs` measures every scene at its own tempo on fx.js and exits 1 over the limit.
3. **Pan-only moves on upright beams turn nothing** (24 scenes). `heads_check.mjs` plays every look through the room's headMotion.js; under 3° = STILL, exit 1.
4. **Pictures:** `laser-scene-shots.cjs` holds a cue only in the browser copy and the room page follows the DESK, so its pictures all showed the same stored look. Use `env-pick-shots.cjs` with a desk loaded by `show-loop.mjs --no-start`; it needs an env from `lightEnvOf`; when killed it leaves its held cue on the desk.
5. **"Lasers later" read as "lasers at 0".** A scope word ("later", "not now") leaves a thing as it is; it never removes it. Dropping them made the cubes vanish from the 3D.
6. **Taking a file from another session's branch at the moment you branch** gave v4 lasers while they already ran v5. Before landing anything that carries another session's part, re-read THEIR current file and compare.
7. Beam colours only from the seen wheel slots (a hex off the wheel makes the desk's nearest slot pick another colour); no beam at eye level; lasers untouched unless their owner signs off.
8. `epic-build.mjs` without a `--…-only` flag deletes and re-creates every unit (hand moves and `beam.laser.frames` lost): scenes work uses `--looks-only` only. Since 2026-10-21 the tool refuses that mode on a project that holds rig units (exit 1, before any write) unless `--rebuild-all` (with `--apply`, also `--out <dir>` for the backup), and `--lasers-only` is a dry run unless `--apply`.
9. A green run is not evidence the product works: look at the pictures, desktop AND phone (`npm run verify:surfaces`) for anything the owner will see.
