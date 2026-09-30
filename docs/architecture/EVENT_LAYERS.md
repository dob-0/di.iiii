# Event layers — how a venue job runs layer by layer, who repeats it, and how an agent reaches it

Status: DESIGN + DRAFT, 2026-09-30. Nothing here is built except what a row says exists. No code changed.
Draft agent files: `docs/architecture/event-agents/` (move into `.claude/agents/` only with the owner's word).

Owner, 2026-09-30: *"what we do now we will do next with other places and events, so we need agents who
will do these things in future again, and also MCP … we need a smart system where we can work layer by
layer."* The evidence is the MOXIR run (2026-09-27 to 09-30): `docs/architecture/RIG_BUILD.md` (§13 to §20),
`docs/architecture/PLACE.md`, `scripts/place/README.md`, `scripts/rigbuild/README.md`.

Method (house rules, `~/.claude/CLAUDE.md`): established practice with its source named; measured, not claimed;
seen on the real surface; every step a script or config in a repo; provenance and licence for every datum;
documented. Any claim below that was not confirmed by reading the named file says **UNVERIFIED**.

Sources the layers follow: MVR 1.6 and GDTF 1.2 (DIN SPEC 15801; validated in RIG_BUILD §8), Open Fixture
Library, GOST 23838-89 (Soviet hall spans, per the venue-to-rig memory), ESTA/ANSI E1.17-style patch sheets
(Lightwright columns, RIG_BUILD §19.2), IEC 60825-1 (laser), the MCP spec 2026-07-28 and OpenAPI 3.1
(`docs/architecture/SPEC_agent_door.md` §3).

---

## 0. The one rule that governs everything else

**A machine can prove a layer is consistent. Only a person on the real surface can say it is right, and only a
qualified human can say it is safe.** Every layer below therefore carries three separate marks:

| mark | meaning | who may set it |
|---|---|---|
| CHECK | a test, measurement or policy guard passed, with a number | machine (CI or script exit code) |
| LOOK | the owner (or the named person) saw it on his screen, wall, phone, ears | a person, never an agent |
| SIGN | a qualified human accepted responsibility | rigging or structural engineer, laser safety officer, electrician: humans only |

An agent may write CHECK results. An agent may never write LOOK or SIGN. "Done" for a layer = CHECK + LOOK,
and for L10 also SIGN.

---

## 1. The layers

`Lk` reads what `Lk-1` wrote. A layer opens only when the one before holds something (the project rule in
`src/project/layers.js`, "a project opens bare, the bar grows": the same idea applied to the job, not the
screen). Machine-verifiable = M, person-only = P.

| L | name | inputs | outputs (kind) | exists TODAY (paths) | checker | M/P | MISSING | sign-off |
|---|---|---|---|---|---|---|---|---|
| L0 | **Brief and consent** | client's ask, date, venue address, a **map pin**, the rental house's equipment list (xlsx), who owns the footage | job record; source list with licence and consent per file | nothing scripted. Concept only: `docs/architecture/PLACE.md`; Drive listing helper `scripts/place/scan-drive.mjs` | owner accepts the job; consent recorded per person and file | P | a job record (one JSON per venue: id, date, pin, sources, licences, phases done). Today it lives in chat and memory | owner (take the job, copyright and consent) |
| L1 | **Capture** | photos and video (phone at `/{space}/scan`, di.bo, Drive, a drop folder) | `sources` wall of the space; frames; EXIF table | `scripts/place/place.mjs` (`--from`, `--from-space`), `scripts/place/prepare.py`, `scripts/place/frames.mjs`, `scripts/place/frame-stats.py`, `scripts/place/photo_meta.py`; scan page per PLACE.md | frame counts and blur stats (`frames-lib.test.js`, `frame-stats.py`); EXIF present (a Telegram "photo" strips it, ask for files, per memory) | M for counts, P for "is the hall covered" | a coverage check (which walls have no frame) is not scripted, UNVERIFIED | owner (consent) |
| L2 | **Hall model** | frames, pin footprint (OSM, ODbL), one tape-measured edge | `hall.json` (not in the repo), `scripts/place/rigs/<venue>-hall-dims-*.json`, `-features-*.json`, a hall space | `scripts/place/reconstruct.py` (VGGT), `scripts/place/hall.py` (Blender parametric), `scripts/place/fit.mjs` + `fit-lib.mjs` + `fit_plane.py`, `scripts/place/import.mjs`, `scripts/place/crane_height.py`, `scripts/place/hall-show.mjs` | `fit-lib.test.js`, `hall-crane.test.js`, `hall-show.test.js` (consistency only). Three independent measures reconciled (VGGT, perspective ratios snapped to the standard, OSM footprint) each with value, range, method, confidence | M for consistency; **P for "the architecture matches the photos"** (the owner caught wrong arcs on MOXIR) and for the tape number | reconcile step is a procedure in memory, not a script. `hall.json` provenance (which frames, which VGGT build) is not written into the file, UNVERIFIED. **VGGT weights are CC BY-NC (per memory): a paid job needs the owner's word on licence** | owner (LOOK); engineer for any load figure |
| L3 | **Equipment and verified types** | rental list (xlsx), the house's quote, makers' pages | `src/rigbuild/types/moxir.json` (generated), `components.rentalList`, `src/rigbuild/items/media.json` (confirmed / probable / equivalent / unknown, each with URL and date) | `scripts/rigbuild/rental.mjs`, `scripts/rigbuild/types.mjs`, `scripts/rigbuild/fetch-equipment-media.mjs`, `scripts/rigbuild/library.mjs`; RIG_BUILD §13 | `node scripts/rigbuild/types.mjs --check`; `src/rigbuild/fixtureTypes.test.js`; `scripts/rigbuild/rental.test.js`; `fetch-equipment-media.test.js`; item cards sourced (`items.test.js` is cited in §13.7, path UNVERIFIED) | M for generation and sourcing; **P: the rental house confirms what a code IS and its DMX mode** (owed for UP-PL5403, UP-LA40WF, UP-Q108S) | the house's channel lists; a venue-independent types file (`moxir.json` is named after the job) | rental house (confirms types); owner (copyright of makers' files) |
| L4 | **Rig versions** | hall, types, a versions file | `scripts/place/rigs/<venue>-<date>-<id>.json`, rentals per version, projects `<venue>-hall-<id>` with lamps and truss as ops | `scripts/rigbuild/versions.mjs` (`--check`, `--report`), `scripts/rigbuild/load-version.mjs`, `scripts/rigbuild/rehang.mjs`, `scripts/rigbuild/copy-version.mjs` (restore copy), `scripts/place/rig.mjs`, `rig-lib.mjs` (refusals: laser must rise, crane clash), `scripts/rigbuild/moxir.mjs` | `scripts/rigbuild/versions.test.js`, `versions-xflat.test.js`, `copy-version.test.js`, `cut.test.js`, `halo.test.js`; RIG_BUILD §15.4 (no beam into a crane, none through the DJ, no head past travel, ≤ 8 real lights, symmetric, cost = Σ rate × qty) | M for geometry rules; **P: the owner's choice by looking** | the checks are named for MOXIR; no venue-neutral check list; no mass-per-point figure from a machine (§15.7 states loads, sign-off owed) | **rigging/structural engineer** (crane rated load, roof points); electrician (see L9) |
| L5 | **Policy** (NEW, owner) | a venue's policy file, a version | pass/fail report per rule; explicit waivers | nothing. Grep of `scripts/rigbuild scripts/place src/rigbuild` found no policy code (2026-09-30) | see section 1.1: the policy IS a test | M | everything: file format, runner, waiver format, sheet header line | the owner signs a waiver (never an agent); the engineer signs the numbers behind a rule |
| L6 | **Plot, patch, sheet, MVR** | a version's document | patch plan, `patch.csv`, `power.csv`, `node-plan.csv`, PDF, `.mvr` + GDTF | `scripts/rigbuild/patch.mjs`, `patch-plan.mjs` (`scripts/place/rigs/<show>.patch.json`), `patch-sheet.mjs`, `export-mvr.mjs`, `validate-mvr.mjs`, `src/rigbuild/sheet.js`, `patchPlan.js`, `mvr.js`; views `/{space}/plot/{project}`, `/cards/`, `/equipment/` | `patch-sheet.mjs` exits 1 on drift from plan or desk; `validate-mvr.mjs` (XSD sha256-pinned + extra rules); `sheet.test.js`, `patchPlan.test.js`, `mvr.test.js`, `autoPatch.test.js`; two exports byte-identical (RIG_BUILD §8) | M | **a real console has never imported the MVR** (§8, owed); the GDTF beam axis is wrong in BlenderDMX (§8); PAR modes unknown (owed) | electrician signs power and distribution; the console operator accepts the patch on the desk |
| L7 | **Looks, cues, show loop** | rig, designed looks (fan, cathedral, crossfire, curtain), a show file | `components.rigLooks`, project cue list, show clock, `scripts/rigbuild/shows/*.show.json` | `scripts/rigbuild/looks.mjs`, `show-cues.mjs`, `show-loop.mjs`, `show-clock.mjs`, `look-probe.mjs`, `look-compare.mjs`, `cue-frames.mjs`, `show-record.mjs`; `src/rigbuild/showClock.js`, `cueRun.js` | `show-clock.test.js`, `cue-frames.test.js`, `src/rigbuild/looks.test.js`, `lookRules.test.js`, `cueRun.test.js`; `show-clock.mjs --check` reads where the show is | M for timing and rules; **P: a look is good only when seen** | luminance and beam-in-haze numbers exist for MOXIR (§20, `realism.mjs`, `luma.mjs`) but no pass threshold is committed as a rule, UNVERIFIED | laser safety officer for any laser look; owner (LOOK) |
| L8 | **Room, visualiser, desk** (the app) | the document, DMX from the desk | `/{space}/build/`, `/visualise/`, `/light` desk | `src/rigbuild/BuildSurface.jsx`, `VisualiserSurface.jsx`, `dmxDecode.js`, `dmxPose.js`; RIG_BUILD §12, §18 | `visualiser.test.jsx`, `dmxPose.test.js`, `readOnlySurfaces.test.jsx`; RIG_BUILD §18.7 gives 60 fps on RTX 3080 (measured, one machine) | M for logic; **P: seen on his screen, real phone (DPR 3), real GPU** | a real phone and a real console pass (owed in §12.7, §18.8) | owner (LOOK) |
| L9 | **Crew link, paper, rental order** | version + sheet | crew page `/{space}/crew/{project}`, print sheets, rental order | `src/rigbuild/PatchSheetSurface.jsx`, `PlotPrint.jsx`, `scripts/rigbuild/rig-links.mjs`, `scripts/rigbuild/patch-sheet.mjs --pdf`, `rental.mjs`, `src/rigbuild/rental.js` | `PatchSheetSurface.test.jsx`; sheet opened as PDF at A4 (§8 records a 1-of-4 page bug fixed); rental sum = Σ rate × qty (`versions.test.js`) | M for sums; P for "the crew can plug by it" (an engineer reads it) | the order is not sent by any script (a person sends it); no "issued" stamp with date and version on the sheet, UNVERIFIED | electrician; rental house confirms the order |
| L10 | **On site** | everything above | the built rig, the rehearsal | nothing in repo | walk-through by people | P | site checklist as a document (the rigging-safety-checklist agent drafts it, a human runs it) | **rigging engineer, laser safety officer, electrician, venue's safety authority (jurisdiction, UNVERIFIED)** |

Machine-verifiable layers: L1 (counts), L3, L4 (geometry), L5, L6, L7 (timing). Person-only surfaces: the
hall matching the photos (L2), the owner's choice of version (L4), a look being good (L7), the app on his
screen and phone (L8), and all of L10.

### 1.1 The POLICY layer (L5): rig policy as tests

Owner's idea, 2026-09-30: a venue's basic version carries rules like *no moving head above 0.6 m*. The rule
is data plus a test; the test fails the build when a version breaks it.

**Method.** Policy-as-code: rules are declarative data in a repo, evaluated by a fixed set of predicates, each
result recorded. Follows the pattern of Open Policy Agent style separation (data vs evaluator) without
adopting a new dependency. This is a method written down first; **results are unvalidated until a run on a
real version is measured** (house rule 1).

| item | design |
|---|---|
| file | `scripts/place/policy/<venue>.policy.json` (NEW, one per venue; `default.policy.json` is the studio's baseline) |
| rule | `{ "id", "applies": ["minimal", "minimal-*"], "predicate", "args", "severity": "fail" \| "warn", "source": "who wrote it and why", "date" }` |
| predicates (closed set, each a small pure function over the version document) | `max-height {category, m}` (e.g. moving-head 0.6 m, from `components.fixture` mount height), `min-height`, `max-real-lights {n}` (8 today), `no-beam-into {zone}` (crane, DJ; reuses `rig-lib.mjs` checks), `laser-rising {min_m}`, `max-kw {kw}`, `max-mass-per-point {kg}` (needs a load figure a human supplies), `forbid-class {codes}`, `require-haze` |
| runner | `node scripts/rigbuild/policy-check.mjs --version <id> [--json]` (NEW) and `scripts/place/policy.test.js` (NEW) that runs every version file in `scripts/place/rigs/` against its venue's policy |
| result | machine-readable list of `{rule, status: PASS\|FAIL\|WAIVED, evidence}`; the patch sheet header prints `policy: n pass, m waived` and each waiver line, so paper never hides an opt-out |
| unknown rule or predicate | **FAIL** (a typo cannot silently pass) |

**How a venue opts out, explicitly.** Never by deleting the rule. A `waivers` array in the same policy file:

```json
{ "rule": "moving-head-max-0.6m", "version": "full", "reason": "heads hang on the crane for the reveal",
  "by": "owner", "date": "2026-10-01", "expires": "2026-10-18", "evidence": "docs/... or a link" }
```

The test fails when a waiver has no `reason`, `by`, `date` or `expires`, when it is past `expires`, when it
names no existing rule or version, or when `by` is not a listed human. Only a human commits a waiver; the
agent files forbid it. A waiver moves a result from FAIL to WAIVED, never to PASS, and WAIVED is printed on
every sheet and on the crew page. A waiver does not stand in for a SIGN: a waived structural rule still needs
the engineer.

**Owed before it counts:** a run of the 4 policy kinds on the real MOXIR versions, with the count of rules
passing and the time taken. Whether today's MOXIR Minimal obeys 0.6 m is **UNVERIFIED** (not measured).

---

## 2. The agent roles

### 2.0 Contract every role shares (referenced by each draft file)

| rule | text |
|---|---|
| branch | work on a `feat/<venue>-<layer>` branch from the venue's integration branch; never push to `dev` or `main`; never bypass a hook |
| tier | say which tier you write to (local, dev, prod) in the first line of the report; writes to dev or prod need the owner's word; local is the default. Say "local" when it ran locally, "cloud" only when it ran in a cloud sandbox and you can name it |
| facts | every number carries value, method and source; an assumption is written `ASSUMED:` and never enters a document as a fact (`assumedProfiles.js` is the model: separate, labelled, reversible) |
| data | state written only through scripts that emit ops (author = person, via = the agent's key label); before a replacing write, `copy-version.mjs` keeps a labelled copy |
| stop | no LOOK, no SIGN, no waiver. If a step needs one, stop and name it |
| report | one report at the end, 10 lines, files and numbers; no repeated reports; no narration of the request back |
| budget | the caps below are tool-call caps; at 80 percent, write what is done and what is owed and stop |

### 2.1 Roles

Model routing follows `reference_model_routing.md` (owner's rule 2026-09-03 and the 09-29 measurement: five
parallel agents on Opus hit the usage limit at once): routine on `sonnet` or `haiku`, physical-safety and
cross-system reasoning on `opus`, `fable` only for a stuck investigation. Which model is BETTER per role is
**not measured** (no bake-off yet; the method is in that memory note).

| role (file) | layer | purpose | allowed tools | may WRITE | needs the owner's word | model | budget (tool calls) |
|---|---|---|---|---|---|---|---|
| `venue-capture` | L0, L1 | take the brief, sort footage, record consent and licence, run `place.mjs` frames step, EXIF table | Read, Bash(node scripts/place:*), Bash(python3 scripts/place/photo_meta.py:*) | job record, `docs/`-side notes; the local `sources` wall | consent, any upload off the machine, any paid tool | haiku for sorting, sonnet for the run | 30 |
| `hall-modeller` | L2 | run reconstruction and fit, reconcile the three measures, write dims and features JSON, import the hall | Read, Edit, Write, Bash(node scripts/place:*), Bash(python3 scripts/place:*) | `scripts/place/rigs/<venue>-hall-*.json`, a local hall space (after `~/di-backups` copy) | VGGT licence use, the tape number, "matches the photos" (LOOK) | sonnet; opus only for a disputed reconcile | 40 |
| `equipment-verifier` | L3 | identify the real maker behind rental codes, fetch maker pages, mark confirmed / probable / equivalent / unknown with URL and date | Read, Edit, WebFetch, Bash(node scripts/rigbuild/types.mjs:*), Bash(node scripts/rigbuild/fetch-equipment-media.mjs:*) | `src/rigbuild/items/media.json`, rental JSON | keeping any maker file (copyright: links only unless the maker offers a download) | sonnet | 40 |
| `rig-planner` | L4, L5 | turn hall + rental list into versions as data, run refusals and policy, propose | Read, Edit, Write, Bash(node scripts/rigbuild/versions.mjs:*), Bash(node scripts/rigbuild/policy-check*), Bash(npx vitest run:*) | `scripts/place/rigs/*`, `scripts/rigbuild/rentals/*`, policy file drafts (never waivers) | choice among versions, any waiver, any hang load | opus (safety-adjacent maths), sonnet for regeneration | 45 |
| `patch-planner` | L6 | write the show patch plan (universes, blocks by type and position), sheet, MVR, validate | Read, Edit, Write, Bash(node scripts/rigbuild/patch-plan.mjs:*), Bash(node scripts/rigbuild/patch-sheet.mjs:*), Bash(node scripts/rigbuild/export-mvr.mjs:*), Bash(node scripts/rigbuild/validate-mvr.mjs:*) | `scripts/place/rigs/<show>.patch.json`, output dir, ops on the local desk only | any write to a shared tier; a mode the rental house has not confirmed (never assumed) | sonnet | 35 |
| `scene-writer` | L7 | design looks and the show file from the rig, load cues, start the loop | Read, Edit, Write, Bash(node scripts/rigbuild/looks.mjs:*), Bash(node scripts/rigbuild/show-cues.mjs:*), Bash(node scripts/rigbuild/show-loop.mjs:*), Bash(node scripts/rigbuild/show-clock.mjs:*) | `scripts/rigbuild/shows/*`, project cue list (local) | every look's release (LOOK), any laser look, any dev or prod clock start | sonnet | 35 |
| `show-check` | L7, L8, L9 | drive the real surface (desktop and phone), GPU-proven, and report what a careful person would notice; extends `human-verifier` | Read, Bash(node scripts/verify-surfaces.mjs:*), Bash(npx playwright:*), Bash(curl:*) | screenshots and a report under the session scratchpad, nothing else | judging "good" (a LOOK is the owner's); running on a machine near its heat limit | sonnet | 30 |
| `rental-and-paper` | L9 | produce the print sheets, crew link, rental list totals and order draft | Read, Edit, Bash(node scripts/rigbuild/rental.mjs:*), Bash(node scripts/rigbuild/patch-sheet.mjs:*) | rental order JSON, PDFs in an output dir | sending the order to anyone | haiku for totals, sonnet for layout | 25 |
| `rigging-safety-checklist` | L5, L10 | draft the site checklist and the sign-off packet (loads per point, laser list, power per circuit) for HUMANS to review; states every figure's source | Read, Write | `docs/` draft only | everything: it signs nothing; a person delivers the packet to the engineer | opus | 25 |

### 2.2 Failure modes seen in this project (each has a guard in the draft files)

Sources: the owner's list on 2026-09-30 (reported to this task, not re-checked) and the memory notes named.

| seen | guard in the role files |
|---|---|
| agents repeated their reports (owner, 09-30) | one report, 10 lines, at the end; no interim restatement |
| agents ran out of context, and five Opus agents hit the usage limit together 2026-09-29 (`reference_model_routing.md`) | tool-call caps; cheaper model for routine; stop at 80 percent and write what is owed |
| an agent wrote to the wrong tier (owner, 09-30; `reference_dii_prod_data_writes.md` exists for the prod case) | first line of every report names the tier; default local; `--api` explicit, never inferred |
| an agent said "cloud" when it ran locally (owner, 09-30) | say "local" or name the cloud sandbox; a claim of where it ran needs the command line that shows it |
| assumptions written as facts (PAR watts ASSUMED, RIG_BUILD §8; modes "owed, never assumed", `assumedProfiles.js`) | `ASSUMED:` prefix; assumed values live in a separate, reversible file |
| ad-hoc aims called "randome" by the owner (venue-to-rig memory) | looks are designed (fan, cathedral, crossfire, curtain), each named with a rule |
| the architecture was drawn wrong (arcs vs a flat space frame, per memory) | hall-modeller stops for the owner's element-by-element LOOK |
| a software-GL render froze the workstation (load 23, 100 C, per memory) | show-check proves the renderer string is the GPU and stops on heat |
| Telegram "photo" strips EXIF (memory) | venue-capture asks for files, records whether EXIF survived |
| probing the prod tier was blocked by the permission classifier (agent-door memory) | agents never probe prod; owner runs prod reads |

---

## 3. The MCP surface

### 3.1 What exists (read from the repo) and what is new

| item | status | source |
|---|---|---|
| four tools `di_find`, `di_describe`, `di_call`, `di_run` | designed in `docs/architecture/SPEC_agent_door.md` §5; `sdk/mcp.mjs` in this branch registers them (grep hit, `di_find` at line 174); merge status of PR #567 into `dev`: **UNVERIFIED** (memory says not merged 09-24) | `sdk/mcp.mjs` |
| catalogue entries with `x-di-reach` (read/private/public), `x-di-role`, `x-di-agent` (yes/never); served at `GET /api/catalogue` | SPEC §4; whether `serverXR/src/catalogue/` is on this branch: **UNVERIFIED** | SPEC |
| per-person agent keys (acts as the person, never public, never root, author + via on every op, expiring, revocable) | **phase 2 of the door, not built** (memory 09-24; SPEC §6) | SPEC §6 |
| ops with author and History restore, `contentProposals` for untrusted people | exists in serverXR (SPEC §6 says so; not re-read here) | SPEC §6 |
| read-only hosted tiers, the server refuses a visitor's ops | built: RIG_BUILD §17, `src/rigbuild/rigToolAccess.js` | RIG_BUILD §17 |
| labelled restore copy of a version | built: `scripts/rigbuild/copy-version.mjs` | RIG_BUILD §15.11 |
| rig operations as catalogue entries; computed views (sheet, policy, versions summary) callable by an agent | **NEW** | this doc |
| tiers named visitor / crew / steward / owner | **NEW vocabulary**; maps onto existing roles below | this doc |

Decision: **no new MCP tools.** The four tools stay (SPEC §3: search, describe, call, instead of loading every
schema). The layer operations are **catalogue entries** named `rig.*`, `hall.*`, `job.*`, reached through
`di_find` / `di_describe` / `di_call` / `di_run`. `di_run` already gives "several steps in order, stop at the
first failure", which is exactly the runbook's shape. An SDK-style named shortcut (like `sdk/moves.js`) may be
added for the two or three most used calls after they are measured (SPEC §8: context cost, coverage, evals).

### 3.2 Tiers and how they map

| tier | who | maps to (existing) | reach |
|---|---|---|---|
| visitor | anyone, signed out, hosted | anonymous / viewer, RIG_BUILD §17 read-only | `read`, public spaces only |
| crew | an engineer with the crew link or a key scoped read | viewer token / key ceiling `read` on a private space | `read` |
| steward | a signed-in member in the space's scope (editing needs sign-in) | editor / member, key ceiling `private` | `private`: propose, and apply on local or scoped spaces |
| owner | the person, in a session | admin session; `public` moves and waivers | `public` never via a key |

Hosted tiers (dev, prod) are read-only by default for agent keys: `apply` calls return 403 with the ceiling
named, until the owner mints a key with `private` for that space (SPEC §6).

### 3.3 The operations

Reach column: R read, P propose-only (writes a proposal, not the document), A apply (writes ops). `dry_run`
defaults to `true` on every P and A call. `idempotent` = the same input leaves the same state.

| entry | reach | tier | input (JSON) | output (JSON) | idempotent |
|---|---|---|---|---|---|
| `rig.versions.list` | R | visitor | `{space}` | `{versions:[{project,id,title,copyOf,fixtures,real,kw,policy:{pass,fail,waived}}]}` | yes |
| `rig.version.get` | R | visitor | `{space,project,pick?:[path]}` | `{document,rig,hash}` (`pick` filters before the model sees it: the 2.8x cost lesson in SPEC memory) | yes |
| `rig.sheet.get` | R | visitor (crew for private) | `{space,project,format:"json"\|"csv"\|"html"}` | `{header:{version,issued,policy},patch,power,nodes}` | yes |
| `rig.looks.get` | R | visitor | `{space,project}` | `{looks:[{id,rule,groups}],cues,showClock}` | yes |
| `rig.policy.check` | R (computes) | visitor | `{space,project}` | `{rules:[{id,status,evidence}],waivers:[...]}` | yes |
| `hall.get` | R | visitor | `{space}` | `{dims,features,provenance:[{datum,method,range,confidence}]}` | yes |
| `equipment.get` | R | visitor | `{space,project}` | `{items:[{code,status,url,date}],order}` | yes |
| `job.get` | R | crew | `{job}` | `{layers:[{id,check,look,sign}]}` | yes |
| `rig.version.propose` | P | steward | `{space,from,change:{versionSpec\|ops[]},dry_run}` | `{proposalId,diff:{added,removed,moved},policy,refused,hash}` | yes, keyed by input hash |
| `rig.patch.propose` | P | steward | `{space,project,plan,dry_run}` | `{proposalId,patch,clashes,universes}` | yes |
| `rig.looks.propose` | P | steward | `{space,project,looks[],show}` | `{proposalId,checks}` | yes |
| `rig.proposal.apply` | A | steward, owner if `hosted` | `{proposalId,expectedHash,restorePoint:true,dry_run}` | `{applied:[opIds],restore:{project,label},policy}` | yes (refuses if `expectedHash` differs) |
| `rig.restore` | A | steward | `{space,restore}` | `{restored:true}` | yes |

Never exposed to an agent key: creating a waiver, marking a SIGN or LOOK, sending a rental order, any
`public` move, minting keys, prod writes (SPEC §6 "never public, never root").

**Audit trail.** Every op carries author = the person and via = the key label (SPEC §6). New: each `di_call`
of a P or A entry also writes one record `{ts, key label, entry, input hash, dry_run, result hash}`; whether
serverXR already logs requests this way is **UNVERIFIED**. Owner-visible in one place (house rule 4): the op
log, which is upstream (memory: "write ops or it never happened").

**Enforcement.** Policy runs server-side inside `rig.proposal.apply`: FAIL blocks the apply, WAIVED passes and
prints. The MCP's own checks are courtesy only (SPEC §2: the server is the only line).

### 3.4 Phases

| phase | contents | done when (measured) |
|---|---|---|
| 0 (prerequisite) | the door's phase 1 on `dev`; catalogue contract test green | route coverage and `tools/list` token count recorded (SPEC §8) |
| 1 | read-only: `rig.versions.list`, `rig.version.get`, `rig.sheet.get`, `rig.looks.get`, `rig.policy.check`, `hall.get`, `equipment.get`. Needs the sheet and policy logic callable server-side (today `src/rigbuild/sheet.js` is client code and `patch-sheet.mjs` a script): move to `shared/` with parity test as `layers.cjs` does | a 10-question eval (SPEC §8 method) on a copy of MOXIR: score, calls, tokens vs reading the repo by hand |
| 2 | propose-only writes + per-person keys (door phase 2). `dry_run` true by default; proposals stored, diff shown to a person in the app | a test per refusal driven through a real key on a booted server (SPEC §8.4) |
| 3 | apply with restore point: `copy-version` semantics inside the server, `expectedHash`, policy gate, `rig.restore` | apply then restore returns a byte-identical document (hash equal), on local and a dev copy |

---

## 4. Runbook: the next venue in 12 steps

Agents named are the drafts in `docs/architecture/event-agents/`. A step is finished only with its CHECK; LOOK
and SIGN marks are the person's.

| # | step | command or agent | CHECK | person |
|---|---|---|---|---|
| 1 | Open the job: pin, date, client's ask, rental list, sources with licence and consent | `venue-capture` writes the job record (file format NEW) | consent per file listed | owner accepts, LOOK |
| 2 | Take the footage in | `node scripts/place/place.mjs --from <dir> --name <venue> --scale-edge <m>` (or `--from-space`) | frame stats (`frame-stats.py`) | asks for files not "photos"; types the tape number |
| 3 | Measure three ways and reconcile | `hall-modeller`: `reconstruct.py`, `fit.mjs`, `photo_meta.py`, OSM footprint | each datum: value, range, method, confidence | owner LOOK: hall vs photos |
| 4 | Build and import the hall | `hall-modeller`: `hall.py`, then `import.mjs --replace` after a backup to `~/di-backups/` | `hall-crane.test.js`, `hall-show.test.js` | owner LOOK |
| 5 | Verify the equipment list | `equipment-verifier`: `rental.mjs`, `types.mjs --check`, `fetch-equipment-media.mjs` | every code has status + URL + date | rental house confirms types and modes |
| 6 | Write the venue's policy | `rig-planner` drafts `scripts/place/policy/<venue>.policy.json` from `default.policy.json` (NEW) | `policy-check.mjs` runs (NEW) | owner adds or waives rules |
| 7 | Make the versions | `rig-planner`: `versions.mjs`, `load-version.mjs`; keep old ones with `copy-version.mjs` | `versions.test.js`, `policy-check.mjs` | owner picks by looking |
| 8 | Plan the patch and print it | `patch-planner`: `patch-plan.mjs`, `patch-sheet.mjs --pdf`, `export-mvr.mjs`, `validate-mvr.mjs` | exit codes 0; MVR validates | console operator imports to a real console (owed) |
| 9 | Write looks and the show | `scene-writer`: `looks.mjs`, `show-cues.mjs`, `show-loop.mjs` or `show-clock.mjs` | `show-clock.test.js`, `cue-frames.test.js` | owner LOOK at each look |
| 10 | Verify on the real surface | `show-check`: `node scripts/verify-surfaces.mjs`, GPU-proven, desktop and phone | screenshots opened; renderer string; console clean | owner LOOK on his screen and phone |
| 11 | Paper and order | `rental-and-paper`: `rental.mjs`, `patch-sheet.mjs`, `rig-links.mjs` | totals = Σ rate × qty | owner sends the order |
| 12 | Safety packet, then site | `rigging-safety-checklist` drafts; humans sign | packet lists every load, laser and circuit with its source | **SIGN: rigging engineer, laser safety officer, electrician** |

## 5. What is owed to make this real (named, not rounded up)

| owed | why |
|---|---|
| job record format (L0) and `job.get` | nothing holds the job today |
| policy file, `policy-check.mjs`, `policy.test.js`, waiver rules; a measured first run on MOXIR | L5 does not exist |
| move sheet and policy logic to `shared/` so the server can compute them | MCP phase 1 read tools |
| door phases 1 to 2 merged (`feat/mcp-catalogue`, PR #567, UNVERIFIED) | the MCP surface rests on them |
| agent files moved into `.claude/agents/` after the owner's look | drafts only here |
| a bake-off of routing (sonnet vs opus per role) | routing is a rule, not a measurement |
| VGGT licence (CC BY-NC) decision for paid jobs | legal, the owner's |
| a real console import of the MVR; a real phone; the owner's LOOK on all of L4 to L8 | owed since RIG_BUILD §8, §12.7, §18.8 |
