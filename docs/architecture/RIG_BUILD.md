# Building a lighting rig — the shared base

**One set of data under three ways of building: A (first person, inside the room),
B (the plot, a plan view beside the room) and C (the rental list dealt onto
positions, looks on a cue timeline). The base is the data, the rules that keep
it true, and the paperwork the light engineers plug by. The views are later
work, and every one of them reads and writes only what is described here.**

Owner, 2026-09-28, after the three sketches (`~/Downloads/moxir-build-sketches/`):
*"i want to a,b,c all"* — *"build scene and everything … easy connect to our
light system so we will easy give the light enginers the addresess and we just
need to plug and run it"*.

"Rig" alone already names the machine mesh (`RIG.md`). This document is about
the lighting rig: truss, decks, lamps, their patch and their power.

Status: **method written before the code (2026-09-28).** Everything below marked
*unvalidated* has not yet been checked against a console or a real venue.

---

## 1. The standards this follows

We invent no formats and no paperwork. Each part of the model maps onto a
published standard or onto the documented practice of the tools the crews use.

| standard | what it is | what we take from it |
|---|---|---|
| **GDTF 1.2** — DIN SPEC 15800:2022, text at `mvrdevelopment/spec` (`gdtf-spec.md`), schema `gdtf.xsd` at `mvrdevelopment/tools` | the fixture type: modes, channels, geometry, physical data, in a zip | a fixture TYPE is a GDTF FixtureType; a mode is a GDTF DMXMode; we author our own `.gdtf` per type |
| **MVR 1.6** — DIN SPEC 15801:2023, text `mvr-spec.md`, schema `mvr.xsd` (same repos) | the scene: layers, fixtures with their placement, patch and IDs, truss with geometry, all in a zip | our export is an MVR file; each field of a lamp maps onto an MVR `Fixture` child element |
| **USITT RP-2** (2006, graphics for lighting design) | plot symbols, the instrument key, the notation on a plot (unit number, channel, circuit near each symbol) | the plot data (section 5) carries what RP-2 writes next to each symbol; view B draws it |
| **Lightwright** (City Theatrical / John McKernon Software) — its "instrument schedule" and "channel hookup" reports | the de-facto paperwork of a rig: one row per instrument | the patch sheet's columns and its two sort orders |
| **ANSI E1.11** (DMX512-A) | 512 slots per universe, addresses 1-512 | the address space and footprints |
| **ANSI E1.31** (sACN) and **Art-Net 4** (Artistic Licence) | DMX over IP | how a patch universe goes out on the wire (section 4.5) |
| **Open Fixture Library** (MIT) | community fixture definitions with channel lists | a mode's channel list where OFL has the fixture |

Versions are pinned where they are fetched: the XSDs at
`mvrdevelopment/tools@e199c6ed635de23cb5ebf9654ee54a358775a065` (their files last
changed 2025-08-21: `mvr.xsd` "Add multipatch", `gdtf.xsd` "Improve RopeOffset
type"), the spec text at `mvrdevelopment/spec@098d3791`. The tools repository
declares no licence, so the XSDs are **not** copied into this repository; the
validator downloads them at that commit and checks their sha256
(`scripts/rigbuild/validate-mvr.mjs`).

GDTF Share files are not used: an account is needed to download, and its terms
(§9) forbid derivative and commercial use. Every `.gdtf` we export is authored
here from `scripts/place/fixtures/fixtures.json`, whose numbers each carry a
source and a basis.

---

## 2. The data model

Four kinds of thing. The first is a library record; the other three live in the
project document as entities and components, written as ops like everything
else (the op log is upstream of everything a person sees).

### 2.1 Fixture TYPE — library data, not an entity

A type is what a crew calls "the fixture": maker + model, with its modes.
It is data in `src/rigbuild/types/*.json`, generated from a sourced manifest by
`scripts/rigbuild/types.mjs` (so the two can never drift — a test regenerates it
and compares). The first library is MOXIR's, from
`scripts/place/fixtures/fixtures.json`.

```jsonc
{
  "id": "up-b380f",                  // the crew code, lowercased: stable when the real maker is found later
  "code": "UP-B380F",                // what the rental list and the crew call it
  "maker": "UPlight Stage Equipment (Guangzhou) Co., Ltd.",
  "model": "UP-B380F",
  "identified": "EXACT",             // EXACT | EQUIVALENT (modelled on a named fixture) — from the manifest
  "category": "moving-head",         // moving-head | par | laser | effect | ...
  "modes": [
    { "name": "16ch", "footprint": 16,
      "channels": null,              // the channel list, when a source gives it (OFL, a manual); null = OWED
      "source": "A", "basis": "EXACT" }
  ],
  "modesOwed": false,                // true when NO mode is known: such a lamp can never be patched
  "power_w":  { "value": 500, "src": "A", "basis": "EXACT" },
  "weight_kg":{ "value": 23,  "src": "A", "basis": "EXACT" },
  "size_mm":  { "value": [460, 310, 690], "order": "W x D x H", ... },
  "optics":   { "beam_deg": 1.8, "zoom_deg": null, "lux": 125500, "at_m": 20, "basis": "EQUIVALENT", ... },
  "model3d":  { "glb": "scripts/place/fixtures/glb/beam380.glb", "sidecar": "…/beam380.json", "licence": "AGPL-3.0-only (ours)" },
  "sources":  { "A": { "url": "…", "what": "…" } },   // every src key a number uses
  "manifest": { "file": "scripts/place/fixtures/fixtures.json", "kind": "beam380", "writtenAt": "2026-09-28" }
}
```

A mode with a footprint but no channel list is still patchable — addresses need
only the footprint — and is flagged `channel list owed` on the sheet. A type with
no mode at all (`modesOwed`) is patchable by nobody; its lamps are flagged
`mode unknown` and never get an address. Nothing is invented to fill the gap.

### 2.2 Lamp — an entity with `components.fixture`

Any light entity (in practice `spotLight`) becomes a lamp on the rig when it
carries a fixture component:

```jsonc
"fixture": {
  "index": 36,          // FIXTURE # — the console number; the desk's own index (the existing join, kept)
  "type": "up-b380f",
  "mode": "16ch",
  "universe": 1,        // 1-based, as MVR and every crew count; the desk stores universe - 1
  "address": 273,       // 1..512, the first slot
  "unit": 5,            // UNIT # — its number along its position (Lightwright/RP-2 practice)
  "circuit": "C4",      // the power circuit it is plugged into
  "position": "column base R", // the hanging position's name
  "hung": true          // stored only when true: hanging from a pipe/truss, base up
}
```

Every field is optional except that the component must hold either a valid
`index` or a `type` — otherwise it is dropped, as before. Both schema copies
(`src/shared/projectSchema.js`, `shared/projectSchema.cjs`) normalise it the same
way; `serverXR/src/schemaSync.test.js` holds them together.

**A change to an earlier decision.** `di-atlas/decisions/2026-09-20-one-project-one-stage.md`
said the document carries only `{ index }` and never universe/address, because
the rig belonged to the machine's `show.json`. A rig built in the room and
handed to a crew needs the patch to travel with the plot — this is exactly what
MVR does (a `Fixture` carries its `Addresses`). So the rule becomes:

- the **document** holds the **plot's patch** — what the paperwork says and what
  the engineers plug by. It travels with the space (and to a hosted tier, so the
  engineers' link works there).
- the **desk's `show.json`** holds the **running patch** — what this machine is
  sending. It still never syncs.
- **auto-patch** (section 4) keeps the two equal, the desk being the one that
  allocates. Where they differ, the difference is flagged, not overwritten.

This needs the owner's look before it lands on `dev`.

### 2.3 Piece — an entity with `components.piece`

Truss, towers and stage decks. `components.piece = { kind: "truss-2m" }` names a
record in the piece catalogue (`src/rigbuild/pieces.js`), which holds the
piece's dimensions and its **snap points** as data:

| kind | size (m) | snap points |
|---|---|---|
| `truss-1m`, `truss-2m`, `truss-3m` | L × 0.29 × 0.29 (a 290 mm box truss, the common rental size: Prolyte H30V / Global Truss F34 class) | `end` at each end (joins end to end, axis-aligned); `slot` every 0.5 m along the bottom chords (a clamp point for a lamp, hung) |
| `tower` | 0.29 × H × 0.29 on a 0.8 × 0.8 base plate (H default 6 m) | `base` (on the floor grid), `top` (a truss end lands here) |
| `deck-2x1` | 2 × 0.2 × 1 on legs to height h (default 1.0 m; a common stage-deck size, e.g. Litedeck / Prolyte StageDex 2 × 1 m) | `edge` at every edge midpoint and corner (deck to deck), `top` (a floor lamp stands on it) |

A piece entity is a `model` (its body is `scripts/rigbuild/pieces/<kind>.glb`,
generated from the same numbers by `scripts/rigbuild/pieces-glb.mjs`) or any
entity a view draws itself — what makes it a piece is the component. Frames:
a truss's origin is the centre of its section, length along local +X; a tower's
and a deck's origin is the centre of the footprint on the floor.

A lamp's entity position is its **lens** (where the room renders light from, and
where every rig so far put it). Its **mount** — the clamp, or the base on the
floor — is derived from the type's body heights (`panY`, `tiltY`, `lensY`):
`src/rigbuild/lampGeometry.js` converts both ways. Snap and MVR use the mount.

A **0.5 m floor grid** underlies all of them. `src/rigbuild/snap.js` is a pure
function: given a piece, a candidate pose and the pieces already placed, it
returns the snapped pose and what it snapped to. It changes no UI; the Studio's
move handles stay as they are and a view calls the function.

The truss dimensions are the class's published outer section, not a particular
product's load table. **No load or rigging calculation is made or implied** —
a structural sign-off is owed for any real hang.

### 2.4 Position — a name

A hanging position is a name shared by the lamps on it ("truss header",
"column base R", "stage front"). Lamps carry it (`fixture.position`); a piece may
carry it as its entity name. MVR has a matching concept (`AUXData/Position`,
referenced by a Fixture's `Position` uuid) and the export writes one per name.

### 2.5 Power

Power per lamp is the type's datasheet maximum (`power_w`). A circuit is a string
on the lamp. The power sheet sums watts per circuit and flags any circuit above
its planning limit: by default **16 A × 230 V × 0.8 = 2944 W** per circuit
(a single-phase 16 A circuit, the IEC 60309 blue connector common on European
stages, loaded to 80% of its rating as a planning margin). The voltage, amps and
margin are parameters, printed on the sheet. The power factor is taken as 1
(watts ≈ volt-amperes), which **understates** current for discharge lamps and
switch-mode supplies. This is a planning illustration, **not an electrical
design**: a qualified electrician's distribution plan is owed for any real show.

`assignCircuits()` fills circuits in position order, never mixing positions and
never above the limit — deterministic, and only when asked.

---

## 3. The patch sheet (what the crew plugs by)

Columns, after Lightwright's instrument schedule and channel hookup:

| column | from | notes |
|---|---|---|
| **#** (fixture #) | `fixture.index` | the console's fixture number |
| **type** | type `code` (and maker/model on hover/print foot) | |
| **mode** | `fixture.mode` + footprint | `?` and a flag when the mode is unknown |
| **position** | `fixture.position` | |
| **unit** | `fixture.unit` | |
| **univ** | `fixture.universe` | 1-based |
| **address** | `fixture.address`–(address + footprint − 1) | three digits, `001–016` |
| **ch** (footprint) | the mode's footprint | |
| **circuit** | `fixture.circuit` | |
| **W** | type `power_w` | datasheet maximum |
| **flags** | computed | `mode unknown`, `channel list owed`, `overlap with #n`, `not patched`, `desk differs` |

Two orders, as Lightwright prints them: **by universe and address** (the channel
hookup — what a patch is checked against) and **by position and unit** (the
instrument schedule — what a crew hangs by). The page groups by universe with a
"used" line per universe (`U1 1–468, 44 free`), then the power sheet (circuit,
lamps, watts, % of limit), then the flags. It prints to A4 portrait (landscape
for wide tables is not needed: 11 narrow columns fit), repeats the table header
on each page, and downloads each table as CSV (RFC 4180: comma, CRLF, quotes
doubled). House document style: mono values, no colour — a flag is a word and a
mark, never a colour, so it survives a black-and-white printer.

Route: `/{space}/patch/{projectId}`, reading the project document only, so the
link works on any tier. Opening it needs no desk.

---

## 4. Auto-patch — the rules

The desk allocates; the document records. One route on the desk does the work:
`POST /light/api/rig/patch` (in `serverXR/src/lighting/desk.js`), called by
whichever surface changed the lamps.

### 4.1 Keys

A desk fixture made by auto-patch carries `rigKey = "<projectId>:<entityId>"`.
The lamp↔desk join stays `fixture.index` (the desk's index), so the room mirror
(`src/rigMirror/liveLight.js`) and **Send positions to the desk** work unchanged.

### 4.2 What each change does

| in the room | on the desk | in the document |
|---|---|---|
| a lamp with a `type` + known `mode` appears (placed, duplicated, pasted) | a fixture is created with a profile for (type, mode), at the lamp's own universe/address if it has one **and it is free**, else at the desk's `nextFreeAddress` in the lamp's universe (or the lowest universe with room) | `index`, `universe`, `address` written back as one `updateComponent` op per lamp |
| a duplicated lamp arrives carrying its original's address | treated as unaddressed: next free address, new index (what consoles do on copy) | new values written back |
| a lamp's `mode` changes | the fixture's profile changes; if the new footprint collides, it is **flagged**, not moved | unchanged until the flag is resolved |
| a lamp's universe/address is typed by hand (sent with `move`) | moved there if free; if it collides, **refused and flagged** (`overlap`), the desk left as it was | the typed value stays, flagged |
| the room's address and the desk's differ and nobody typed it (the desk was re-patched by hand, or the room was edited elsewhere) | nothing | nothing — flagged `desk-differs` until someone chooses |
| a lamp is deleted | its fixture (by `rigKey`) is removed | — |
| a lamp's type has no known mode | nothing | flagged `mode unknown`; no address is ever invented |

"Patch this group" (the same route with `group: true, repatch: true` for the
chosen lamps) lays a group out again and keeps it
**contiguous in one universe**: the group goes to the lowest universe that has a
free run of `count × footprint`; if none has, a new universe is started. This is
the conventional rule (one data line per area, a group re-patchable as a block).

Profiles: for each (type, mode) the desk gets a custom profile named after the
type code and mode (`UP-B380F 16ch`), with the mode's channel list as roles when
known, else `ch1…chN` labelled as owed. The desk's own validation applies.

### 4.3 The API (for the views)

- desk: `POST /light/api/rig/patch {project, lamps:[{key, name, code, type, mode,
  footprint, channels?, universe?, address?, index?, group?, move?}], group?, prune?,
  repatch?}` → `{assignments:[{key, index, universe, address, footprint, profile, how}],
  flags:[{key, code, message}], removed:[key]}`; `GET /light/api/rig?project=` lists a
  room's rig fixtures. Code: `serverXR/src/lighting/rigpatch.js`.
- room: `src/rigbuild/autoPatch.js` — `patchRequest`, `writeBackOps`, `autoPatch`;
  in the Studio `useRigAutoPatch` (mounted in `StudioEditor` and the plot, cards,
  equipment and build pages) runs it 400 ms after a lamp change **made on that page** —
  `useOpHistory`'s `edits` count moves on the person's own edit, undo or redo — and
  returns `{flags, message, patchNow(), patchGroup(entityIds)}`.
- **A reader never writes** (2026-10-01): opening, refreshing or a second viewer never
  patches — no POST to the desk (its `prune` would take the project's other fixtures off)
  and no write-back into the document. A change that arrived from a collaborator does not
  patch either. The explicit whole-room patch is **patch the room on the desk** (the
  plot's title block) and the cards' **send looks to the desk** (and GO, when looks are
  missing), which patch first because a desk look is made over the patched fixtures.
  Until a person patches, `flags` and `message` are empty (the pages read the document).
- flag codes: `mode-unknown`, `overlap`, `desk-differs`, `off-the-end`, `no-room`,
  `profile-clash`, `profile-refused`, `group-split`; locally `unknown-type`,
  `channels-owed`.

### 4.4 Where it runs

The desk exists only on a local install. On a hosted tier auto-patch does
nothing (lamps keep type/mode, and the sheet says "not patched"); the patch is
made on the machine with the desk and travels in the document. A CLI,
`scripts/rigbuild/patch.mjs`, patches a whole project from the terminal
(MOXIR is patched this way).

### 4.5 On the wire

The desk numbers universes from 0 and shows them +1. So the sheet's **U1** is
the desk's universe 0, sent on Art-Net as port-address **0 (0:0:0)**. On sACN
the desk sends that universe number as-is — **universe 0, which ANSI E1.31
reserves** (valid 1–63999). Until the desk offsets sACN by one, an sACN node set
to universe 1 will not receive U1. This is flagged on the sheet and owed as a
desk fix.

---

## 5. Plot data (for view B and the MVR)

Per lamp: position in metres (room axes: Y up), rotation, type, `unit`, `index`,
`circuit`, `hung` — which is everything RP-2 writes beside a symbol (unit number
inside or beside, channel/fixture number in a circle, circuit near the plug).
Per piece: kind, pose, length. The plot's title block totals come from the same
functions as the sheet (channels per universe, kW, circuits).

## 6. Export — MVR + GDTF

`src/rigbuild/mvr.js` builds, and `scripts/rigbuild/export-mvr.mjs` writes:

- `GeneralSceneDescription.xml`, MVR 1.6 (`verMajor=1 verMinor=6`,
  `provider="di.iiii"`), one Layer "rig"; each lamp a `Fixture` with `Matrix`
  (millimetres, Z up: MVR `x = x`, `y = −z`, `z = y` from our Y-up metres),
  `GDTFSpec`, `GDTFMode`, `FixtureID` (= index), `UnitNumber`, `Addresses`
  (`<Address break="0">` absolute = (universe − 1) × 512 + address), `Position`,
  `Function` = circuit; each truss/tower/deck a `Truss` or `SceneObject` with its
  GLB geometry. Positions go in `AUXData`.
- one `.gdtf` per type used: `description.xml` (GDTF 1.2) with the modes that are
  known — a footprint with no channel list is written as channels whose attribute
  is the GDTF `NoFeature` (the type's channels are not invented); physical data
  (weight, power in `PhysicalDescriptions/Properties`); the model as
  `models/gltf/*.glb`. A type with `modesOwed` is still written (geometry and
  physical data) with no DMX mode, and its lamps carry no `Addresses`.
- the GLBs for pieces and bodies.

Validation (`scripts/rigbuild/validate-mvr.mjs`): the XML against the pinned XSDs
with `xmllint --schema`; zip structure (no absolute paths, case-unique names).
Import into an open tool is attempted where one runs headless (BlenderDMX, GPL,
<https://blenderdmx.eu>). Results are recorded in section 8.

---

## 7. How A, B and C use the same data

| | A — first person | B — plot | C — cards |
|---|---|---|---|
| **reads** | pieces (snap points), lamps' `index/universe/address` (the tag `#36 U2.025` in the air), flags | lamps + pieces from above; types (symbols, footprints); sheet totals for the title block | types (the cards and their counts), positions (the slots), lamps per position, patch bars, looks |
| **writes** | `createEntity` of a piece or lamp at a pose from `snap()`; `deleteEntity` | the same, from a plan pose; `fixture.circuit/unit/position` typed in the inspector; a typed universe/address | `createEntity` lamps at a position's slots (a card dealt = N lamps, §11.2), `fixture.position`; cues (`mappingState.cues`) naming the desk's looks (§11.4) |
| **then** | auto-patch runs on the change | auto-patch; "patch this group" | "patch this group" per dealt card |
| **hands over** | crew view: the sheet link + MVR | the sheet as sheets 2 and 3 of the plot + MVR | the sheet + MVR |

Nothing in a view keeps its own copy of the rig. Counts from the rental list
(the "you cannot hang a 19th B380F" rule of sketch A) are a view's check against
a list; the list is data in the rig JSON (`provenance.fixtureList`) and is not
part of this base.

## 8. What has and has not been validated

Recorded 2026-09-28 against the MOXIR rig (`scripts/rigbuild/moxir.mjs`, hall.json
v2 of 09-28 02:15, rig `moxir-2026-10-17.json`). Session record: `PROGRESS.md`.

| check | result |
|---|---|
| schema: `components.fixture` / `components.piece` survive both normalisers | `serverXR/src/schemaSync.test.js` (parity + one-field clear) |
| the same through a real server | the patched MOXIR document written as ops to a throwaway serverXR (port 4360, scratch data) and read back: all fields kept |
| auto-patch rules | desk suite `tests/test-rigpatch.js` 12/12; room → real desk → room `autoPatch.test.js` |
| MOXIR patch | **U1 001–468** (B380F ×18, HK1915 ×8, spark ×4, smoke ×4; 44 free), **U2 001–288** (250BSW ×12; 224 free). PAR ×50, CO2 ×6, laser ×2: **mode unknown, not patched** (owed). A third universe is needed for the PARs at any footprint ≥ 5 |
| lasers | in hall v2 the rig's own crane-clash rule **refuses both lasers** (beam into the crane at z −41 m) → 102 fixtures; hall v1 gives 104 and the same patch |
| power | 31.4 kW datasheet max (v1: 33.8) on 17 proposed circuits; load alone needs ≥ 11 at 2944 W. PAR watts ASSUMED |
| patch sheet page | seen in headless Chromium (no WebGL on this page) at 1440×900 DPR 2 and 390×844 DPR 3; sweep: no text cell under 120 px, no page overflow, no console error. A4 print: first printed 1 page of 4 (the app pins html/body/#root) — fixed, 3 pages, opened |
| MVR XML | `GeneralSceneDescription.xml` **validates** against `mvr.xsd` (MVR 1.6, tools@e199c6ed, sha256 85bc4201…) with xmllint |
| GDTF XML | all 7 `description.xml` **validate** against `gdtf.xsd` (GDTF 1.2, sha256 13a044d2…) |
| rules past the XSD | `validate-mvr.mjs`: relative, case-unique paths; every GDTFSpec/Geometry3D file present; every GDTFMode exists; no overlaps; none past 512. Proven to fail on a broken file (an overlap; a non-integer UnitNumber) |
| reproducible | two exports of the same document: identical sha256 |
| pymvr 1.0.7 / pygdtf 1.4.5 (the parsers BlenderDMX ships) | parse it: 102 fixtures, 46 addressed, universes 1 and 2, modes and weights read back, models found |
| **BlenderDMX 2.3.0, Blender 5.2.1, headless** | imports all **102 fixtures** with the right type, mode and U/address (34 in U1, 12 in U2, 56 unpatched); first fixture's root at (−7.0, 52.9, 1.2) m = its mount. **Not right: the beam at home points along +Y instead of up** — changing our GDTF body turn did not move it, so the GDTF/glTF axis convention is **unverified and owed** |
| a real console (grandMA3, Eos, Onyx…) | **not done** — owed; the file is 1.6, consoles on 1.5 may refuse |

Not validated at all: the channel functions (lists owed), pan/tilt axes, the
lamp heading (not in the document), truss geometry in a consumer (MOXIR has no
pieces yet — its goalpost is boxes, exported as scaled cubes).

## 9. Owed (known gaps, stated)

- The DMX mode of UP-PL5403, UP-LA40WF and UP-Q108S — from the rental house.
- Channel lists for every UPlight mode (only footprints are published on the
  pages we have) — from the maker's manuals via the rental house.
- A structural/rigging sign-off; an electrician's distribution plan; a laser
  safety assessment (IEC 60825-1) — none of these is in scope here.
- sACN universe offset in the desk (section 4.5).
- The owner's look at the change to the 2026-09-20 decision (section 2.2).

---

## 10. View B — the plot (`/{space}/plot/{project}`)

Sketch B: *"the plot, a plan view like CAD with the room beside it"*. The owner chose all
three views and said "start B now" (2026-09-28). Code: `src/rigbuild/Plot*.jsx`,
`plotGeometry.js`, `plotSymbols.js`, `plotModel.js`, `plotEdits.js`, `venuePlan.js`.

### 10.1 Where it lives

`/{space}/plot/{projectId}` — the same three-segment shape as the patch sheet, the word
`plot` reserved in both lists (`shared/reservedSegments.cjs`, `src/utils/spaceRouting.js`;
checked 2026-09-28: `/serverXR/api/spaces/plot` and `/projects/plot` answer 404 on prod, the
dev tier and the local install). Behind the same gate as Perform, because it writes. The
patch sheet links to it as sheet 1; the plot's title block links to sheets 2 and 3.

### 10.2 What it draws, and the practice it follows

| element | drawn as | from |
|---|---|---|
| walls, openings | heavy continuous line, gaps at doors | `components.venuePlan` (10.3) |
| structural grid | thin chain line, lettered rows / numbered lines in bubbles at the view's edge | the hall's column grid |
| columns | solid | the hall |
| zones (dance floor, DJ place, backstage) | thin chain outline, name and size in capitals | the owner's marks, as the hall JSON carries them |
| machinery on the floor | hatched, its height written on it | the hall's massing |
| overhead (crane runways and bridges, roof lanterns) | dashed, "… over · 8.15 m" | the hall |
| truss | outline with its lacing, one diagonal per 0.5 m bay; a run's length and chord height as a dimension line | pieces (§2.3) |
| tower / deck | base plate crossed / slab with "h 1.2" | pieces |
| lamp | one outline per TYPE at the hanging point (the MOUNT, §2.3), unit # inside, `#index` and `universe.address` beside | lamps (§2.2) + the sheet's rows |
| conflict | dashed box and "!" — overlap, past 512, fixture # twice, desk differs, circuit over, desk refused | `sheetModel` flags + auto-patch's desk flags |
| free truss end | dashed circle, "free end · point owed" | a run end with no tower top under it |

Symbols: **USITT RP-2 (2006)** practice — a symbol per instrument type at the hanging point,
the unit number with it, the channel/fixture number and address beside it, an instrument
key. RP-2 leaves automated fixtures and effects to the designer's key; ours are our own
drawings (no RP-2 artwork copied), after sketch B: circle = UP-B380F beam, square =
UP-250BSW spot, hexagon = UP-HK1915 bee-eye, small solid bar = UP-PL5403 PAR, diamond =
laser, triangle with a letter = effect (C CO₂, S spark, Z smoke). Line types after
**ISO 128-2** (continuous, dashed = hidden/above, chain = grid and zones).

Ink only. **Colour appears in one place**: a lamp whose own light colour is visibly a colour
(chroma ≥ 0.2; a near-white tint like #eef3ff is not) gets a swatch — the colour RP-2 notes
by the lens. A lamp whose type's mode is owed carries no label (it has nothing to say; the
key says "mode owed" once) until it is selected. Labels are placed greedily below / above /
right / left, the first place that overlaps nothing; a label that cannot be placed clear is
left out and the status line says how many ("zoom in, or sheet 2 lists every one").

### 10.3 The venue plan — data, never drawn by hand

`components.venuePlan` on the venue's model entity (normalised and bounded in both schema
copies, `serverXR/src/schemaSync.test.js` holds them together). It is DERIVED by
`venuePlanFromHall(hall.json)` from the hall description `scripts/place/hall.py` writes —
the same numbers the 3D hall is built from — so plan and model cannot disagree. North comes
from the site file (`…-site-*.json`: u/v bearings, x = −u, z = −v). A room with no plan is
drawn without a hall, and the plot says so; it never invents walls.

### 10.4 Editing — every write is an op

The rail: select · truss · tower · deck · fixture · fx · measure (keys V T W D F X M).
Tools are also dragged off the rail onto the plan.

- **snap** — the base's `snap()` with `metric: 'plan'` (x/z distance; a plan cannot say
  how high the hand is). On the plan a truss slot within reach wins over the deck under it
  (hang over stand). A tower dropped near a truss end stands **on the floor** and is built
  to the truss's height (`under` join → height = chord − half a section).
- **heights** — a tower's or deck's height other than the catalogue's is carried in
  `transform.scale[1]` against the catalogue body (`pieceHeightOf` = catalogue × scale.y):
  one number, the GLB body stretches with it. A truss's height is where it hangs (its y).
- **truss runs** — trusses joined end to end are one RUN (`trussRuns`); clicking one
  segment selects the run (Alt for one). Drawing a run lays stock 3/2/1 m segments, whole
  metres, heading snapped to 15°. Typing a length re-lays the run from its first end.
- **riders** — lamps hung at a piece's slots or standing on its top move, turn, rise and are
  deleted with it (`ridersOf`, 5 cm tolerance).
- **inspector** — type the exact x / z / height / turn / length, a lamp's mode, universe,
  address, unit, position, circuit. A typed address is a typed move (§4.2).
- **many** — box-select; "patch this group" calls `useRigAutoPatch().patchGroup`.
- **new lamps** — a spotLight with `components.fixture` (type, default mode, position = the
  truss's name, next unit), lens from mount (`lampTransform`), aimed straight down hung /
  up standing (focus is a look's, not the plot's). Light settings are borrowed from a lamp
  of the same type in the room; past **8 real lights** the new lamp is `beam.only` (§5 of
  the MOXIR note: 90 real = 1 fps). An effect is a `group` entity with the fixture record.
- **pieces** — `model` entities whose body is `scripts/rigbuild/pieces/<kind>.glb`, uploaded
  once per project (content-hashed, `rigbuild-<kind>.glb`).
- undo/redo through `useOpHistory`; auto-patch writes through the sync path, as in Studio.

### 10.5 The room beside it

`PlotRoom` is the Studio's own `StudioViewport` on the same document (no renderer of our
own), navigate mode, the plot's selection is its selection (its highlight boxes it), a
click in the room selects on the plan. It shows the drag's preview while the hand moves.
The camera opens just inside the audience end of the rig at 6 m (under MOXIR's crane
girders at 8.15 m), clamped 2 m inside the venue's walls. The room is WebGL and fails
alone: a browser with no WebGL context gets the plan and a sentence (seen: without the
boundary the Canvas error took the whole page). Phone: plan full screen, `plan | room`
one tap apart (the room mounts only when shown), tools and inspector in a bottom sheet.

### 10.6 Print — sheet 1

One SVG in millimetres the size of the sheet (**ISO 216** A3 or A4, landscape; `@page`
margin 0, so 1 mm in the SVG is 1 mm on paper): a 10 mm border, the drawing at the largest
**ISO 5455** scale that fits (1:10 … 1:1000, plus 1:25, the ABTT stage-plan scale), the
key and title block in a right-hand column, a scale bar and north. Frame: the whole rig
(an overall plot) or **the view on screen** (a detail sheet — the booth at 1:100). The
title block: show, venue, scale, sheet 1/3, channels by universe, kW and circuits, the
circuits load alone needs, the desk's output state, console input, revision date and
document version; the foot names the venue's source and what the sheet is not. Print at
100%, never "fit to page", or the scale is not 1:N (the print bar says so).

### 10.7 Validated (2026-09-28, on MOXIR, own dev stack :4371/:5371, scratch data)

| check | result |
|---|---|
| pure logic | `plotGeometry` 21, `plotEdits` 11, `plotSymbols` 7, `venuePlan` 8, `plotModel` 4, `plotRouting` 2 tests |
| the MOXIR rig as ops | `scripts/rigbuild/load-plot.mjs`: venue plan (100 columns, 3 zones) + goalpost and riser as 8 pieces + 104 typed lamps, written through `/ops` to a copy of the space |
| build flow in the UI | truss run 12 m at 6 m drawn, two towers stood under its ends (built to 5.856 m), two UP-250BSW hung at slots → the desk patched them **#47 U1.445, #48 U1.469–492**; a tower moved 2 m (grid snap), its end called "free end" |
| conflict | #48 typed to U1.450 over #47 → the desk refused, both drawn dashed with "!", the inspector quotes the desk. Found on the way: auto-patch wrote the desk's old address back over the typed one — fixed in `writeBackOps`, guard seen failing without the fix |
| room | on the RTX 3080 (ANGLE/Vulkan, renderer string checked before loading), desktop 60 fps; the new truss selected on the plan is boxed in the room; phone 390×844 DPR 3 room 60 fps |
| screens | desktop 1440×900 DPR 2; phone 390×844 DPR 3 portrait and 844×390 landscape; no page overflow; no console error but the no-WebGL one on purpose |
| print | A3 and A4 landscape, 1 page each; overall 1:500, booth detail 1:100; the scale bar measured on the 150 dpi render: 50 mm bar = 296 px = 50.1 mm |

Not validated: a click in the room selecting on the plan (wired to the Studio's own
select; not clicked in a test), a real phone, a crew reading the printed sheet, a truss
made of pieces imported into a console via MVR (§8's open item still stands).

### 10.8 Owed

- A **flown** truss has no rigging point on the plot (motors, bridles) — a free end is only
  called out. A load/rigging calculation is not made or implied.
- Fixture BODIES do not follow a moved lamp (MOXIR's bodies are one baked mesh from
  `rig.mjs`; `load-plot.mjs` removes it) — a body per lamp entity is owed, for A and C too.
- Label layout is greedy; dense positions (PAR pairs on a column) lose labels at 1:500.
  Position callouts ("PL5403 ×25 a side", sketch B) are owed.
- ~~The rental list's counts are not in the document~~ — closed by view C (§11.1): the key
  says "3 left of 12" when the project carries `components.rentalList`.
- Console input state reads "not on this build" until `feat/dmx-input` lands.

---

## 11. View C — the cards (`/{space}/cards/{project}`)

Sketch C: *"the cards — rental list dealt onto positions, looks on a timeline"*. The owner
chose all three views (2026-09-28); B was built first, then C. Code: `src/rigbuild/Cards*.jsx`,
`rental.js`, `positions.js`, `deal.js`, `patchBars.js`, `lookRules.js`, `looks.js`,
`useRigLook.js`; scripts `scripts/rigbuild/rental.mjs`, `xlsx.mjs`, `looks.mjs`.

Nothing is placed in space by hand. A card (a fixture type on the rental list) is dealt
onto a named position, and the lamps land on that position's slots. The patch bars fill in
beside the positions, and the rig's designed looks sit on the project's cue list below. GO
fires a look on the desk, and the room follows.

### 11.1 The rental list — data, with its source

`components.rentalList` sits on the show's entity (`rig-show`, a group). It holds a name, a
source, a currency, and one item per line: `{code, type, ordered, stock?, rate?, label?,
source?, note?}`. Both schema copies normalise it (whole counts from 0 to 100000, capped
lists) and `schemaSync.test.js` holds them together.

`scripts/rigbuild/rental.mjs` writes it from two inputs:

- **The rental house's spreadsheet** (`lights_rental_quote_calculator.xlsx`, sha256
  797fa436…). The visible "Price list" sheet gives each code's stock and its rate per day.
  The file is read by `scripts/rigbuild/xlsx.mjs`, a cell-value reader for OOXML (ECMA-376
  Part 1 §18.2–18.4). It reads cached values only and never evaluates a formula.
- **The show's order** (`scripts/rigbuild/rentals/moxir-order-2026-09-27.json`, taken from
  the rig file's `provenance.fixtureList`).

Each item carries its sheet cells (`Price list!A6:E6`) and the order's own words. The
importer refuses a code the sheet does not list. An order above the listed stock is written
with a note, not refused. The importer also says where the workbook disagrees with itself.
For MOXIR, the quote calculator's hidden "Price data" sheet has UP-B380F at 19000 AMD a
day, while the visible list says 20000. The quote sheet itself is blank, so no line of the
order is confirmed by the rental house.

A card shows `placed n / ordered m` for its type (`rentalCounts`), with its mode, footprint
and watts. A dashed card means the mode is owed. A card turns bold when more lamps are
placed than ordered, or when the type is not on the list at all. `plotModel().rental` feeds
the same counts to view B's key.

### 11.2 Positions — derived, never drawn

`positionsOf(entities)` names the places a card can be dealt onto and lists their slots.
Each slot is the MOUNT, with `hung`, `side` (left or right of the riser's axis) and `rank`
(its order from the stage, or along the line):

| position | from | slots |
|---|---|---|
| a truss run (`truss header`) | the pieces (`trussRuns`) | the catalogue's clamp points, every 0.5 m under the bottom chord |
| tower ladders, tower tops | tower pieces | side arms on the audience face, from 1.8 m every 0.6 m; the top plate |
| stage back line, stage flanks, pit | the riser's decks (its axis, edges, and the side the audience is on, which is the dance zone's side) | floor lines 0.25 m behind it, beside it, and 0.7 m in front |
| column bases, column faces, dance-floor columns | the venue plan's column rows either side of the axis, along the stage and dance zones, not in a doorway | 0.7 m off the inner face; an uplight 0.45 m off the inner and the back face; 1 m off and 1.2 m toward the audience |
| outer columns | the next rows out | an uplight 0.45 m off the face toward the nave |
| backdrop · (the first solid's name) | venue solids standing behind the riser | floor slots 0.35 m off whatever face is nearest |

The offsets are the MOXIR rig script's own placement rules (`rig-lib.mjs` `place`). They are
stated once, in `positions.js` `OFFSETS`. They are rules of placement, not measurements. A
room with no decks or plan gets only the positions its pieces give.

**Dealing** (`deal.js`): `pickSlots` spreads n evenly over the free slots and mirrors them
about the axis (`evenPick`, which puts a slot i and its mirror count-1-i together). On a
row of columns it can instead fill from the stage in pairs (`from-stage`, the default for
rows). A two-sided position splits the count between its sides; when the count is odd the
left side gets one more, and the page says so. Every lamp is the plot's own `lampEntity`,
with the lens taken from the mount (§2.3). It is named after its position and numbered
along it, and it is written as an op. A dealt card is then patched as **one group**
(`patchGroup`, §4.2). A type whose mode is owed is placed and not patched. A slot is
**filled** when a lamp's mount lies within 5 cm of it (`fillOf`).

### 11.3 Patch bars

`patchBars(plotModel)` draws one bar per universe from the plot's own rows and conflicts:

- **solid**: a lamp's channels;
- **hatched**: a lamp in `CONFLICT_CODES`, with **move to next free** (the desk patches it
  again as a group of one) and **keep**. These are offered on the lamp the desk flagged
  (typed over another, or held elsewhere), not on the lamp it overlaps;
- **dashed**: what the list still has to place at the type's known footprint, drawn after
  the channels that type already uses ("3 to place").

A type whose mode is owed is **not** given an assumed footprint (the sketch assumed 8ch for
the PAR). It is listed as a dashed row, with its count and "no address until it comes".
Under the bars go the power and the number of circuits the load alone needs, both from the
sheet.

### 11.4 Looks on the cue list, and the room follows

The **looks** are `components.rigLooks` on `rig-show`, written by `scripts/rigbuild/looks.mjs`
from the rig file. Each group's rule and colour is renamed to `position/type`
(`column-bases/up-b380f`) through `MOUNT_POSITION`, the rig script's mount rule mapped to
view C's position. A mount with no position, or two groups on one key, is refused.

The **rules** are the rig script's `AIM_RULES`, ported to `src/rigbuild/lookRules.js` from
feat/moxir-hall 70dbdd95. `lookRules.test.js` holds them numerically equal to
`scripts/place/rig-lib.mjs` on every rule both copies have. The frame the rules need is read
from the document: the riser, the solids behind it, the crane runway's and the roof's
heights from the venue plan's overhead items. `lookPoses` gives each lamp its pan, tilt,
rotation, lens and colour.

A look lands in three places, with one meaning each:

| where | what | how |
|---|---|---|
| **the desk** | a look in the desk's own model (`serverXR/src/lighting/looks.js`), id `rig-<look>`, over this room's patched fixtures (`deskLooks`, `POST /light/api/looks/add`) | its per-fixture DMX values need each type's channel list (which channel is pan, tilt, colour). For MOXIR every list is **owed**, so the desk look carries the fixtures and **no values**, and says so |
| **the cue list** | the project's own cues, `document.mappingState.cues`: the list the map desk, Perform and the Studio already fire through `fireCue`. One cue per look: `{name, fade, hold, lightLook: 'rig-<look>'}` | **GO** fires the next cue. `recallCueLighting` puts the look on the desk's `cue` layer. A cue with a hold moves on by itself; a cue with none waits for GO. The timeline is this list drawn against the holds: **a cue list, not a timeline editor** |
| **the room** | every lamp of the look posed by its rule and lit in its colour: a view, never written | `GET /light/api/dmx` now carries the looks that are on (`looks: [{lookId, level, priority, layer}]`). The mirror reads them at 10 Hz, and `useRigLookEntities` (in `StudioSceneContent`) poses the scene. So GO from the cards, from `/light`, or from anything else that fires the look moves the room. With no desk, the cards page's own GO poses its room pane |

**The list plays on the desk, and loops** (2026-09-28). Where a desk is here, GO on the cards
page hands the desk the document's cues and asks its cue runner to go
(`serverXR/src/lighting/cuerun.js`, `src/rigbuild/cueRun.js`); the desk keeps the one clock, so
the show keeps going with every page closed and two open pages never fire a cue twice. A
**loop** switch beside GO (`mappingState.loop`) takes the list from its last cue back to cue 1;
**stop** stops the clock and leaves the look up. /light's Control page has the same GO, back,
stop and loop. With no desk (a hosted page) the page plays the list itself as a per-tab
preview. Method and routes: `docs/architecture/LIGHTING_DESK.md` "The cue runner".

**Rest the room on a look** writes one look's aims and colours into the document as ops.
Undo takes it back. This is how a link with no desk (a hosted tier) shows a designed look.

Fixed on the way: a lamp whose desk profile has **unknown channels** (`ch1…chN`, a list
owed) was drawn white at full by the mirror, which assumed "no colour channel" meant white.
Such a fixture is now `known: false`, and the lamp keeps its authored light. See the
known-fixes row and `useLightingMirror.test.jsx`.

### 11.5 Validated (2026-09-28, MOXIR, own dev stack :4383/:5383, a copy of the centred space)

The data came from `space-bundle.mjs export moxir` on the local tier, taken after the
re-centring (70dbdd95) and imported into a scratch data root. `load-plot.mjs --pieces-only`
laid the plan and the 8 pieces, with no lamps.

| check | result |
|---|---|
| pure logic | `positions` 9, `patchBars` 4, `looks` 4, `lookRules` 13, `rental` 7, `cardsRouting` 2 tests; schema parity for `rentalList` and `rigLooks` |
| rental list | 8 lines from the spreadsheet and the order, **104 ordered**; stock matches for all but HK1915 (8 of 14) |
| positions | 11 derived: header 7 m / 14 slots, tower ladders 14, tops 2, back line 7, flanks 8, pit 19, column bases 16 (z 6–48), column faces 32, dance-floor columns 16, outer columns 16, backdrop 21 |
| deal, in the UI | the whole list in 13 deals → **104 placed / 104 ordered**. BSW 6 on the header and 6 on the first three column pairs, B380F on the back line, the flanks and the next five pairs, and so on, matching the rig file's design |
| patch | 46 patched by the desk, in groups; after a conflict test, **U1 1–428, U2 1–328**; PL5403 ×50, LA40WF ×2 and Q108S ×6 mode owed, not patched; 33.8 kW (datasheet maximum), ≥ 12 × 16 A |
| conflict | #3 typed to U1.010 → hatched, with the desk's words; **move to next free** → clean |
| cues | 5 looks on the cue list and on the desk (5/5); GO ×5 → after each GO the desk's `/api/dmx` reported exactly that look on the `cue` layer |
| room | RTX 3080 (ANGLE/Vulkan, renderer string checked first). All five looks at **60 fps** on the desktop, 2 on the phone (portrait and landscape): roof cathedral, fan out, crossfire, all to centre, curtain, posed and coloured as designed |
| screens | 1440×900 DPR 2, 390×844 DPR 3, 844×390 DPR 3; no page overflow, no console error, no text cell under 120 px (sweep) |

Not validated:

- DMX output of a look: no channel lists, so no values; nothing was sent to a real fixture.
- A real phone.
- Console input: `feat/dmx-input` (#599) is not merged, so their console cannot fire a look yet.
- Two projects sharing one desk: the desk ids `rig-<look>` are not per project.

### 11.6 Owed

- The channel list of every UPlight mode (§9). Until it comes, the desk's looks are empty.
- Per-project desk look ids, before two rigged rooms share one desk.
- Deal by drag (desktop); today it is a tap or a button.
- A position built in C: a new truss run is still drawn on the plot (view B), then dealt onto here.
- Fixture bodies per lamp (§10.8): the room draws the beams, not a body for each dealt lamp.
- The GDTF/MVR hand-off of the looks themselves: the cue list travels in the document and on the desk, not in the MVR.


---

## 12. View A — the room in first person (`/{space}/build/{project}`, `/{space}/crew/{project}`)

Sketch A: *"inside the room — build like minecraft"*. The owner asked for it first (*"mannual
instal thing there so mean like in minecraft but you can build scene and everything what we
need to and it easy connect to our light system"*) and chose all three views; B and C were
built first, A last. Code: `src/rigbuild/Build*.jsx`, `buildAim.js`, `hotbar.js`, `tags.js`,
`FixtureBodies.jsx`, `usePieceAssets.js`, `buildRouting.js`.

### 12.1 Where it lives

`/{space}/build/{projectId}` — behind the same gate as the plot and the cards, because it
writes. `/{space}/crew/{projectId}` — the same surface with `crew`: read only, no gate of its
own, like the patch sheet (the server decides who may read; a private space answers 401 and
the page says so, it never draws an empty hall). Both words reserved in both lists; checked
2026-09-28: `/serverXR/api/{spaces,projects}/{build,crew}` answer 404 on prod, the dev tier
and the local install.

The room is the walker every space already has (`LiveProjectScene`, WASD, mouse look, F fly,
Esc release), handed the synced document through its `document` seam and our scene through
`sceneExtras` — the jam surface's pattern. Three new seams, each defaulting to what walk mode
did before: `altitudeKeys` (fly keeps Space/C; Q/E go to the hand), `wheelDolly` (the wheel
scrolls the hotbar while building) and `walkHint` (the hint line says the build keys).
Nothing here is a second copy of the rig: the writes are the plot's ops (`plotEdits.js`),
counts the rental list's (`rental.js`), addresses the desk's (auto-patch, §4), tags the plot's
rows (`plotModel`), and the room follows the desk's look (`useRigLookEntities`).

### 12.2 The hand — aim, ghost, place

| step | method |
|---|---|
| aim | a ray from the eye through the crosshair (the cursor when the mouse is not locked) is cast against the RIG, not the venue mesh: the floor plane, each piece as its catalogue box (§2.3; a tower by its base plate), each lamp as a 0.35 m sphere at its lens — slab method (Kay & Kajiya 1986). Reach 40 m. Exact for what can be built on and a few hundred operations a frame; the price, stated: the ray passes through the hall's walls and columns |
| candidate | what the hand is on becomes the pose `snap()` is given (`placement()`): lamp → nearest truss slot / deck top / floor grid; truss → continue the aimed truss from its nearer end, sit end A on an aimed tower's top, or hang at the Q/E height over the floor; tower → stand under an aimed truss end, built up to it (the plot's `under` rule, plan metric); deck → join the aimed deck's nearest edge at its height. Anything else is refused in words, never guessed |
| ghost | a dashed outline (line segments, no light, no shadow) of the catalogue box or the type's `size_mm`, drawn at the snapped pose; grey with wide gaps when the list is used up. It costs nothing next to the room |
| place | left click (locked) or the phone's place button. Pieces as `pieceEntity` (body uploaded once per project, now shared with the plot through `usePieceAssets`), lamps as `lampEntity` (lens from mount; beam-only past 8 real lights, §10.4). A truss that continues a truss takes its name — same run, same position |
| remove | right click / del: the aimed lamp, or the aimed piece with its riders (`ridersOfIds`) |
| keys | 1–9, 0 and the wheel pick a slot; R a quarter turn, Shift+R 15° (the plot's heading step); Q/E raise and lower by 0.5 m (truss hanging height, tower) or 0.2 m (deck legs); I opens the aimed lamp's patch; Ctrl+Z / Ctrl+Shift+Z undo and redo through `useOpHistory` |
| exact values | typing 6.00 m in first person is awkward (sketch A). Esc after placing gives the mouse back and opens the plot's own inspector (`Inspector`, exported from `PlotSurface.jsx`) on what was just placed: x, z, height, turn, a run's length, a lamp's mode, universe, address, unit, position, circuit |

The hotbar is the rental list (§11.1): pieces first (counted, unlimited — the truss is not on
MOXIR's list), then one slot per line with `placed / ordered`. A used-up slot refuses the next
one ("all 12 UP-250BSW on the order are placed — remove one to hang it elsewhere"). A type not
on the list gets no slot; with no list at all every library type is offered, unlimited.

### 12.3 Addresses in the air

A DOM tag per lamp — `#36 U2.025`, `! #38 U2.049` dashed for a conflict (plotModel's
`CONFLICT_CODES`, the desk's flags included), `#— mode owed`. DOM, not 3D text, because a tag
must stay crisp, clickable and a thumb-sized target, and 3D text in a di.iiii room is an
unsolved problem (memory: walk-and-xr-entry). Cheap by construction: at most 24 tags (12 on a
phone), the nearest within 14 m in front of the eye, re-chosen every 150 ms, positioned every
frame through refs with no React render; plus the aimed and the chosen lamp at any distance,
and in crew view every conflict at any distance. A lamp whose mode is owed carries a tag only
when aimed or chosen (§10.2's rule). A tag opens the patch: the inspector while building, a
read-only sheet in crew view.

### 12.4 The lamps' bodies

`FixtureBodies.jsx` draws a body per lamp from the MOXIR fixture models (Base / Yoke / Head /
Lens nodes): one InstancedMesh per kind × part × material with a matrix per lamp, the part
matrices from `scripts/place/fixture-lib.mjs` `aimFixture` — the code the baked MOXIR bodies
came from — so a head turns where its beam goes and follows a look; a lens takes its lamp's
colour. About 40 draw calls however many lamps. A view only; the document keeps the lens and
the aim. This closed §10.8's "bodies per lamp" for view A. Since 2026-09-28 (owner on `/moxir`:
*"i can't see the models of the lights now"*) every room draws them: `RigBodies.jsx` (lazy,
mounted only when the document has a typed lamp) feeds the same `FixtureBodies` from the document
(`rigBodyLamps.js`: plotData's mount and beam, the light's colour) in the space view
(`LiveProjectScene`, prop `rigBodies`, off in view A which draws its own) and in `StudioViewport`
— the Studio and the plot's and cards' room panes. `load-plot.mjs` no longer deletes the baked
column wash (`rig-wash`): no live lamp replaces its light.

### 12.5 The phone

The walker's own floating stick (left half), swipe to look (right half), the crosshair is the
hand. place (112 × 72 px), del, turn, up, dn (52 px) on the right; the hotbar scrolls sideways
(scroll-snap); a tag has a 44 px target; the aimed lamp is a button for its patch; the
inspector is a bottom sheet (a side sheet sideways). Keyed on `(pointer: coarse)`, so a phone
turned sideways keeps the thumb layout (known-fixes: width-keyed "phone" breaks sideways).
The Fly button stands down while building on a phone (its place is the place button's).

### 12.6 Validated (2026-09-28, MOXIR, own dev stack :4391/:5391, a copy of the centred space)

Data: `space-bundle.mjs export moxir` from the local tier (the re-centred DJ hall, spawn
0, 1.6, 24.2), imported into a scratch data root; `load-plot.mjs --pieces-only` with
`/mnt/data/footage/place-moxir-hall-v3/hall.json`; `rental.mjs`; `looks.mjs` with the rig file
at 70dbdd95; the list dealt on the cards page as in §11.5 but for four UP-250BSW (100 of 104).

| check | result |
|---|---|
| pure logic | `buildAim` 16, `hotbar` 4, `tags` 6, `buildRouting` 2 tests; `entityAnimation` +1 |
| a second small truss, by hand | tower on the floor (−3, 0, 14) → truss 3 m aimed at its top: **snap: tower top** → a second 3 m aimed at the first: **snap: truss end** → tower aimed under the far end: **snap: under the truss end**, built to 6.00 m. The plot reads it as "truss · 6.00 m · h 6.15 m" |
| four lamps from the hotbar | UP-250BSW at truss slots 2, 5, 2, 5: the slot read 9, 10, 11, **12 / 12**; the fifth refused with the list's sentence. Auto-patch: **#43 U2.169, #44 U2.193, #45 U2.217, #46 U2.241**, tags in the air |
| conflict | #46 typed to U2.180 in the inspector → the desk refused and left it; `! #43`, `! #44`, `! #46` dashed on the lamps, "! 3 conflicts" in the totals, the desk's sentence in the sheet |
| one data set | the plot shows the new run, #43–#46 and the three dashed conflicts; the cards say UP-250BSW 12/12 |
| crew view | a second account: tags on, conflicts tagged, B does nothing, no hotbar, a click opens a read-only patch (no inputs), right-click changes nothing; a guest on the private space is told why it cannot open |
| real lights | 90 spot lights, **8 real**; the four new lamps are `beam.only` |
| fps (RTX 3080 Laptop, ANGLE/Vulkan under PRIME, renderer string checked first; vsync 60 Hz) | desktop 1440×900 DPR 2: walking 60, building (ghost + bodies + 24 tags) **60**; crew 60; phone 390×844 and 844×390 DPR 3: 60 |
| screens | `~/Downloads/rig-build3d/`, all opened; no page overflow on the phone; no console error |
| thermal | package 69–91 °C across the runs; each GPU run started below 80 °C |

Found and fixed on the way:

- **The whole rig floated in walk mode** — every piece and lamp idle-bobbed and turned (the
  `float` fallback), beams sweeping with them. A rig entity is now static (known-fixes row,
  guard seen failing).
- A browser with no WebGL got a blank page; the room now fails alone and points at the patch
  sheet. A document that could not be read drew an empty hall; it now says why.

### 12.7 Not validated, and owed

- **A harness workaround, named:** ANGLE/Vulkan under PRIME refuses a WebGL2 context asked for
  with `powerPreference: 'high-performance'` (probed: `'default'` gives one). LiveProjectScene's
  Canvas asks r3f's default, `'high-performance'`; StudioViewport asks `'default'`. The GPU
  runs rewrote the hint in the page. Whether the owner's own browser on aylmo hits this is
  **unverified** — if it does, walk mode is dark there for every space, and the fix is
  LiveProjectScene asking `'default'` (the Studio's choice).
- A real phone and a real mouse (pointer lock on his Wayland desktop; the drag-look fallback
  places at the cursor, untested by hand).
- The ray ignores the venue mesh (12.2); a floor spot behind a column can be aimed at.
- MVR and patch-sheet downloads from the crew view: the patch sheet is a link; the MVR is still
  `scripts/rigbuild/export-mvr.mjs` only.
- A console driving the room (the HUD's "console in") waits for `feat/dmx-input` (#599).
- A lamp's heading (body yaw) is not in the document. (Bodies in the plot's and cards' room panes: done 2026-09-28, §12.4.)
- The desk's allocation for a lamp placed at the end of a busy universe: seen only through
  auto-patch's own rules (§4); no crew has plugged by it.

---

## 13. The equipment list and the inventory (`/{space}/equipment/{project}`, E in build mode)

Owner, 2026-09-28: *"i think we will not use the all devices so . also wee need to place where
we can add and delete the devices"* — then, the same day: *"i want to see it all in ui like
minecraft where i can pick and create what i want to … i need to real alternatives … i never
seen co2 jets so it will goo to have fixtures like items and also descriptions of item … how
in games you have item and can check what is what"*. Code: `src/rigbuild/equipment.js`,
`inventory.js`, `useEquipment.js`, `Inventory.jsx`, `EffectPreview.jsx`, `EquipmentSurface.jsx`,
`equipmentRouting.js`, `items/`; scripts `scripts/rigbuild/rental.mjs`, `item-renders.py`.

### 13.1 One data set — the list grew, it did not move

The equipment list IS `components.rentalList` on `rig-show` (§11.1). The component keeps its
name so every view that already counts against it — A's hotbar, B's key, C's cards, the patch
bars — follows an edit with no copy of its own. The rental house's spreadsheet is where the
list STARTS (`rental.mjs`, unchanged in what it reads); from there a line is added, deleted or
given another quantity, and keeps its source. New fields, normalised in both schema copies
(`schemaSync.test.js` holds them together):

| field | meaning |
|---|---|
| line `from` | `own` · `other` (with `supplier`); omitted = the rental house |
| line `kind: 'item'` | a non-DMX item (node, splitter, cable, console, truss, tower, deck): counted and costed, never hung, never patched, no card in view C; `category`, `watts`, `piece` (a piece kind it counts) |
| list `days`, `dates {from,to}` | the billed rental days (dates count inclusively) |
| list `rule {extraDay, source}` | the quote's own day rule, from the spreadsheet |
| list `types[]` | fixture types added for this show: from the Open Fixture Library, or a rental code with no library type (its mode OWED) — each with its sources and licence |
| list `catalogue[]`, `terms[]` | the rental house's whole price list (25 codes with stock, rate and cells) and its printed terms |

A list someone emptied stays a list (the hand then takes nothing); a list with no line and no
name was never one. `libraryWithShow(library, entities)` (rental.js) merges the show's types
after the generated library, one stable object per list, and every surface and hook uses it
(cards, plot, build, patch sheet, auto-patch, the room's looks, the hotbar), so a hazer taken
from OFL is placed, drawn, patched and counted like a UPlight type.

### 13.2 Cost, power, universes — the quote's own rule

Cost of a line = rate × quantity × billed days, billed days = 1 + (days − 1) × 0.5. The rule is
the spreadsheet's (`"Price list"!A2` "Day 1 full rate; each additional day 50%.", `"Quote 2"!E7`,
`"Price data"!H2 = 0.5`); `equipment.test.js` holds `billedDays` to the sheet's own 2-day /
3-day / 1-week columns (20000 → 30000 / 40000 / 80000; 13500 → 20250 / 27000 / 54000).
Delivery, rigging and de-rig are "On request" (row 36) — the calculator's default 150000 AMD
(`"Quote 2"!G38`) is printed as a term, never added to the total. VAT excluded, as the sheet.
Power = Σ quantity × datasheet max (items with `watts`). Universes = the list's lamps packed in
list order, a lamp never split across two (ANSI E1.11) — a planning count; owed modes are
listed, never assumed.

### 13.3 What an edit does to what is placed — asked, never silent

Lowering a line below its placed lamps, or skipping a placed type, opens a question:
**remove the last N placed** (document order = placement order), **pick which N** (a list of
the lamps with position, unit, # and address), or **keep them, flagged over the order**. Kept
lamps carry `over-order` (the last placed past the count) or `not-on-list`
(`orderFlags`, `plotModel.ORDER_CODES`): drawn dashed with "!" on the plot and as tags in the
room, said on the cards; they are not a patch fault, so the patch bars neither hatch them nor
offer "move to next free". Removal is one batch with the list change (one undo); auto-patch
prunes the removed lamps' desk fixtures by `rigKey` (§4.2).

### 13.4 The inventory and the item card

Tiles (`inventoryTiles`): every list line, every other price-list code (not taken, with stock
and rate), the rig's pieces, library types, and the catalogue's suggestions no list carries (a
hazer, an Art-Net node). Groups: Lights · Lasers · Effects · Control & power · Structure ·
Nodes & cables. A card shows the picture, what it is, what it does in the show (with an
on-demand looping preview), needs, specs (the type's numbers with their sources, then the
item's), real alternatives, and the sources; TAKE / SKIP and a stepper; from / supplier / note.
A price-list code with no type is taken with `owedType` (mode owed — placed, never patched);
"Control & power" codes are taken as items. The hazer is taken through the OFL import.

**The item catalogue** (`src/rigbuild/items/{lights,effects,control}.json`, schema
`items/SCHEMA.txt`): 30 entries — all 25 price-list codes, hazer, Art-Net node, truss, tower,
deck — written from cited sources on 2026-09-28. Every sentence, need, spec and alternative
names source keys that resolve, or says it is owed (`items.test.js` enforces it). Where
UPlight lists no page for a code, the entry says so and describes the class on a named
equivalent. **Pictures**: first our own studio render of our own model
(`scripts/rigbuild/item-renders.py`, Blender 5.2.1 Workbench, AGPL; `items/renders.json` holds
model and image sha256), then a Wikimedia Commons photo with author, licence and page. No
maker's product photo is copied. 12 of 30 have no picture of either kind — owed. The makers' own photos and papers, and the code verification: §13.8.

**The preview** (`EffectPreview.jsx`): beam, spot, wash, matrix, laser fan and swing, CO₂,
sparks, smoke, haze (a beam through clear air beside one through haze), low fog, mist — an
illustration in its own small canvas, mounted only when asked for, never a simulation.

### 13.5 Adding a new type — the Open Fixture Library through the desk

`+ type from OFL` searches the desk's own import (`GET /light/api/library`, `/manufacturer`,
`/fixture`; library.js). `describe()` now also returns each mode's channel names, whether it
holds a matrix insert, the physical data and OFL's last-modified date. `oflType` makes a type:
id `ofl-<maker>-<key>`, each plain mode with its channels (desk roles + OFL names), a matrix
mode left out and said owed, power/weight/size marked `src: OFL`, source URL, MIT licence,
fetched date. The first mode is a planning default — which mode the unit runs is the crew's.
With no desk (a hosted tier) the sheet says so; an item can still be added by hand.

### 13.6 Where it lives

`/{space}/equipment/{project}` (reserved in both lists; checked 2026-09-28: 404 on diiii.xyz,
dev.diiii.xyz and the local install), behind the same gate as the plot: **inventory | order**.
Linked from the plot's title block, the cards' header and build mode's totals. In build mode
**E** opens the inventory over the room (as in Minecraft; lowering the hand moved from E to
**Z**), the phone has an **items** button; the room holds still while it is open. The hotbar
is filled from the inventory: drag a tile onto a slot (mouse) or **to hotbar** on its card
(one finger); the arrangement is this browser's (`localStorage`, a convenience), unarranged =
the default order. `public/rigbuild/` is reserved as a static directory.

**Export**: CSV (RFC 4180, the sheet's writer) and a printable A4 "equipment order": the lines
grouped rental / other supplier / own, quantities, dates, rates, line totals, the total, what
we need from the rental house (modes, channel lists, stock), and the sheet's terms.

### 13.7 Validated (2026-09-28, MOXIR, own stack :4395/:5395, a copy of the space)

Data: the rigbuild3d baseline bundle (a `space-bundle.mjs export moxir` of the local tier,
100 lamps placed, 42 patched) imported into a scratch data root; `rental.mjs --api` wrote the
new list fields as ops. Headless Chromium with 3D off for every 2D surface; the previews on the
RTX 3080 (ANGLE/Vulkan under PRIME, renderer string checked first).

| check | result |
|---|---|
| pure logic | `equipment` 17, `items` 4, `equipmentRouting` 2 tests; desk `describe` 1; schema parity +1 case; rigbuild suite 201 green |
| PARs 50 → 24 | asked; "pick which 26" lists all 50 with position/unit; **remove the last 26** → 24 placed, cards 24/24 |
| smoke machines skipped | asked; removed the 4 → desk **42 → 38** fixtures, the four `UP-YZ31P 1ch` gone |
| hazer from OFL | MDG ATMe, 3ch (Unit control, Haze output, Haze control), 1400 W (OFL), MIT; ×2 dealt on the stage flanks → desk **U1.489, U1.492**, profile `MDG ATMe 3ch` |
| Art-Net node | item line, other supplier, "4 universes"; no card, no slot, no patch; counted |
| one data set | A hotbar, B key, C cards: B380F 18/18 · 250BSW 8/12 · PL5403 24/24 · MDG ATMe 2/2; patch sheet 72 fixtures, 40 patched, U1 494 · U2 168 — all agree |
| order | 1 day (17.10) → 1,057,000 AMD excl. VAT; 77 units; 26.4 kW; 2 universes at known modes; A4: one page |
| previews | CO₂, sparks, laser fan, haze, beam at 60 fps; the second GPU run hit **97 °C** and the guard stopped it (started at 85 °C) |
| screens | desktop 1440×900 DPR 2, phone 390×844 DPR 3; no page overflow; no text cell under 120 px; `~/Downloads/rig-equipment/` |

Not validated / owed: the owner's own look and pick for MOXIR; a real phone; the room in build
mode with the inventory on the GPU (2D only); the rental house confirming the order; photos for
12 items; the UP-236 mist machine's maker; the MDG ATMe power (MDG's page 715 W vs OFL 1400 W —
both shown with their sources); `projectContracts` "fixture = { index }" fails on the stack
since #594 (the patch in the document, §2.2) — owed on the base, not this change.

### 13.8 Verified, and the makers' own photos and papers

Owner, 2026-09-28: *"we need to also real images of each device take it and also you check all
eq from list right ? and also find the documentation's and attach it"*; then, on copyright:
*"yes look to keep copyrights just links also ok if there hard with that"*. Code:
`src/rigbuild/items/media.json` (data), `media.js` / `mediaRules.js` (pure), the card in
`Inventory.jsx`; script `scripts/rigbuild/fetch-equipment-media.mjs`.

**Verification.** Every item carries a status, with evidence URL and date:
**confirmed** — the rental code is printed on the maker's own page (Model / Model NO. field,
title, JSON-LD); **probable** — the same product under another code; **equivalent** — not
traced, and the card shows a named stand-in (never presented as the rental unit); **unknown** —
not traced and no stand-in named. Method: UPlight's own site (pro-uplight.com: sitemap,
products.html — its site search is a dead API), its made-in-china store (listing pages and
product JSON-LD), Alibaba and web search for the exact code and variants; three research agents
in parallel, each photo opened and looked at before it was recorded.

**The law, as built.** The makers' photos and manuals are their copyright. A file is **kept**
(`offer: 'download'`) only where the maker's own page offers that very file for download (a
manual PDF on a product or support page); everything else — every product photo on a shop page,
a PDF in an uploads folder no page links, anything with unclear terms — is a **dated link**
(`offer: 'link'`), never copied. A kept file is internal reference on the studio's LOCAL install
only: `fetch-equipment-media.mjs --record` fetches it once and writes its sha256/size/date into
`media.json`; `--upload` re-fetches, checks the sha256 and stores it as an asset of the space
named in `media.json` (`store.space`, `moxir`) through the install's own
`POST /api/spaces/:space/assets`. The script refuses a cache inside the repository and any API
host that is not local (localhost, `*.localhost`, `local.thedi.studio`); a changed file
(sha256 mismatch) is not stored and the run exits 1 — a person decides. The repository holds
metadata only (`media.test.js` checks no kept file's bytes are under `public/rigbuild/`). A
space-level asset is not carried by `tier-sync` (it moves project documents); **`space-bundle.mjs
export moxir` WOULD carry them — never import that bundle into a hosted tier.**

**The card.** Under the header a badge (solid = confirmed, outlined = probable, dashed =
equivalent, faint = unknown — no colour, the house style) with what it means, the stand-in
named and linked, the evidence link and the date. The gallery puts a kept maker's photo first,
then our render labelled **3D model**, then a Commons photo, with thumbnails; a picture that fails
to load is dropped, not shown broken. "maker's photos" links the maker's page (linked, not copied,
checked date). **DOCUMENTS** lists user manual · DMX chart · datasheet · safety: a kept file opens
the install's copy (© maker — manufacturer's document, internal reference, source, fetched date,
sha256); a link opens the maker's file. On a tier without the copies (one HEAD probe per page) the
card says so and links the makers' files. A stand-in's file says "EQUIVALENT product, not the
rental unit".

**Channel lists.** No UPlight manual or DMX chart was found for any code — pro-uplight.com's
download page is a dead end and no UPlight PDF surfaced on the web. The stand-ins' manuals do carry
charts (pages recorded in each document's note), but a stand-in's chart is **not** applied to the
UPlight types: patching real UPlight units with another maker's channel order would drive them
wrong. The only chart for the product itself is MDG's ATMe (user guide p.17: unit on/off, haze
output, haze on/off) — it agrees channel for channel with the OFL profile the hazer is already
taken with. The UPlight charts stay owed from the rental house / UPlight (drafted requests, not
sent: `~/Downloads/rig-equipment/permission-request.md`).

| code / item | status | evidence (checked 2026-09-28) | kept on the install | linked only |
|---|---|---|---|---|
| UP-B380F | **confirmed** | https://up-light.en.made-in-china.com/product/qdrawUbcCMAf/China-IP65-380W-Waterproof-DJ-Light-Beam-Moving-Head-for-Outdoor-Events.html | — | photo, manual |
| UP-250BSW | **confirmed** | https://www.pro-uplight.com/250W-BSW-LED-MOVING-HEAD-pd576927868.html | manual | photo |
| UP-HK1915 | **confirmed** | https://www.pro-uplight.com/19Pcs-15W-Hawk-Eye-pd40799571.html | manual | photo, photo |
| UP-HK615 | **equivalent** → YUER Lights LED 6X15W RGBW Bee Eye Laser Moving Head Light (DMX512 10/15CH) | https://yuerlights.com/products/new-led-6x15w-rgbw-bee-eye-laser-moving-head-light-dmx512-10-15ch-strobe-dyeing-effect-lighting-dj-disco-stage-party-wedding-bar | manual | photo |
| UP-MH100S | **equivalent** → SHEHDS 6-Prism LED Spotlight 100W Gobo Light with LCD Display | https://shehds.com/products/shehds-6-prism-led-spotlight-100w-gobo-light-with-lcd-display-stage-effect-lighting-dj-disco-stage-moving-head-lights-stage-dj-lighting | manual | photo |
| UP-MH8060S | **equivalent** → SHEHDS LED Spot 80W with 3-Prism Gobo Moving Head Light | https://shehds.com/products/led-spot-80w-with-threer-prism-gobo-moving-head-light-party-dj-equipment-bar-light-ktv-bar-stage-lighting-effect | manual | photo |
| UP-PL5403 | **confirmed** | https://www.pro-uplight.com/Waterproof-Par-Light-UP-PL5403-pd42953371.html | — | photo, manual |
| UP-COB200 | **confirmed** | https://up-light.en.made-in-china.com/product/bwWGPaldZMfD/China-High-Performance-200W-COB-PAR-Light-for-TV-Studio-Events.html | — | photo, manual |
| UP-LA40WF | **equivalent** → Blue Sea (Shenzhen Blue Sea Lighting) BLLO-RGB40 | https://www.pro-uplight.com/sitemap.xml | — | photo, safety, safety, safety |
| UP-BY06 | **equivalent** → LIRO Lighting LR-R6 | https://www.pro-uplight.com/sitemap.xml | — | photo, safety, safety, safety |
| UP-JG400 | **equivalent** → X-Laser Mobile Beat Mirage | https://www.pro-uplight.com/sitemap.xml | — | photo, safety, safety, safety |
| UP-Q108S | **equivalent** → MagicFX CO2jet II | https://www.pro-uplight.com/sitemap.xml | manual | photo, safety |
| UP-YH600F | **equivalent** → Showven Sparkular | https://www.pro-uplight.com/sitemap.xml | manual | photo |
| UP-YZ31P | **equivalent** → Antari Z-1500 III | https://www.pro-uplight.com/sitemap.xml | manual | photo, safety, safety |
| UP-SW3000B | **equivalent** → SurgeFX Hydra | https://www.pro-uplight.com/sitemap.xml | — | photo, safety, safety |
| UP-236 | **equivalent** → Antari Z-800 II | https://www.pro-uplight.com/sitemap.xml | — | photo, safety, safety |
| UP-HD210 | **equivalent** → AVSL Butterfly Effect 3-in-1 (151.744UK) | https://www.pro-uplight.com/sitemap.xml | — | photo, safety |
| MDG ATMe | **confirmed** | https://www.mdgfog.com/en/atme | manual, datasheet, safety | photo, safety |
| UP-Q3L | **equivalent** → MA Lighting grandMA3 light | https://www.pro-uplight.com/sitemap.xml | — | photo, photo |
| UP-1024 | **equivalent** → Chauvet DJ Obey 70 | https://up-light.en.made-in-china.com | manual | photo, photo |
| UP-9800 | **unknown** | https://up-light.en.made-in-china.com | — | — |
| UP-B01 | **unknown** | https://up-light.en.made-in-china.com | — | — |
| UP-PDU60B | **equivalent** → ChamSys (GeNetix, formerly Chauvet Professional) GeNetix GD4IP | https://up-light.en.made-in-china.com | datasheet, manual | photo, photo |
| UP-PDU60A | **equivalent** → ENTTEC D-Split | https://up-light.en.made-in-china.com | datasheet | photo |
| UP-2303 | **equivalent** → LTECH (Shenzhen Robert Green Ltd.) D4 (DMX512 4-channel CV decoder) | https://up-light.en.made-in-china.com | datasheet | photo |
| UP-POWER12 | **equivalent** → ETC (Electronic Theatre Controls) Sensor3 dimming — SP3 Small Touring Rack | https://up-light.en.made-in-china.com | datasheet | photo |
| artnet-node | **equivalent** → Luminex LCE LumiNode 4 | https://www.luminex.be/products/luminode/luminode-4/ | datasheet, manual | photo |
| truss | **equivalent** → Global Truss / Prolyte F34 square truss (290mm) / H30V square truss | https://www.globaltruss.com/trussing/f34-square-truss | datasheet, datasheet, datasheet | photo, photo |
| tower | **equivalent** → Prolyte Group Tower Systems — DT Tower (photo) / Delay Tower S78-T-18M (manual, same product family) | https://www.prolyte.com/products/tower-systems | manual | photo |
| deck | **equivalent** → Prolyte Group LiteDeck (photo) / StageDex (manual) | https://www.prolyte.com/products/portable-stages/litedeck | manual | photo |


Counts (2026-09-28): 30 items; 6 confirmed (UP-B380F, UP-250BSW, UP-HK1915, UP-PL5403,
UP-COB200 — new — and the hazer as the MDG ATMe itself), 22 equivalent, 2 unknown (UP-9800,
UP-B01), 0 probable. 78 media entries: 24 files kept (14 manuals, 9 datasheets, 1 SDS) — all 24
re-fetched, sha256-checked and stored on the owner's install; 54 dated links (33 photos, 18
safety pages, 3 manuals with no offering page). No maker's photo is kept: every product photo is
on a shop page, so all are links. Items with no photo or document of any kind: UP-9800, UP-B01.

Owed: UPlight's own manuals/DMX charts (none published); the exact products behind the 22
untraced codes (the rental house's labels); the ETC Sensor3 full manual and the LumiNode user
manual (both offered, both truncated three times from here); UP-236's maker; the owner's look.

## 14. Moving between the tools — the steps row

Owner, 2026-09-28: *"look to UI/UX fix tha gaps that we can easy go from one place to other i mean
cards tools lights and so on"* and *"also make buttons in space that we can easy move in the
workflow"*. The UX audit found five navigation schemes across six pages and no door in from the
space, the Studio or the Kit (`~/Downloads/rig-ux/where-everything-is.md`); the UI audit (F04)
asked for the platform bar on every rig page and one shared row under it.

**One list** — `src/rigbuild/rigTools.js`, in the order a show is made:
room · 1 equipment · 2 build · 3 plot · 4 cards & looks · 5 patch sheet · 6 crew link · light desk.
"Plot" and "patch sheet" are the theatre's words (USITT RP-2 calls the drawing the light plot); the
address segment of each step equals its key. Every address comes from the routing helpers.

**One row** — `RigSteps.jsx` / `rigSteps.css`: a second `.sbar` row under the SurfaceBar, in its
tokens (the file is on the spine list). The current step is `aria-current` and cyan; beside each step
`rigProgress.js` says what the document holds (units on order, lamps placed of ordered, looks,
addressed of typed lamps and conflicts) — from the document only, never a claim it does not hold.
Back and next sit at the two ends; below 1180 px the row folds to `‹ · n/6 step ▾ · next ›`, the
list in the bar's own menu, every row ≥ 44 px under a coarse pointer.

**Where it is** — on the equipment, plot, cards and patch pages (a fixed row; the pages start below
it, and it never prints); floating over the room in build and crew, hidden while the pointer is locked
and back on Esc (it takes no key); under the bar on `/{space}` when the room has a rig (`hasRig`: a
typed lamp or a rental list) on a di.iiii on your own machine only — a published page a stranger
opens carries no tool chrome (owner's 2026-08-07 call). There its "next" is `rigProgress.suggested`,
the step the show waits on. The Studio's bar has **Rig** (the project's plot); the Kit has one
**Rig builder** card listing the steps; the desk, opened from a step (`&from=<step>`), leads back
to it (`serverXR/src/lighting/ui/from.js`, a closed list held to `rigTools` by
`lightingLink.test.js`).

**Build keys** — the first entry to build mode lists the keys as the handler reads them
(`buildKeys.js`; Q up, Z down — E is the inventory), once per browser; H brings it back.

Owed: the crew-only row the UX sketch proposed (a crew link opened by an engineer shows every step;
the editing ones ask for a sign-in on a hosted tier); the row on a hosted tier's room for signed-in
editors; the UI audit's token and type pass (F05–F10) — see the preview note.

---

## 15. Rig versions — one hall lit three ways (`scripts/place/rigs/moxir-versions-2026-10-17.json`)

Owner, 2026-09-28, on `/moxir`: *"make 3 version with the full, midle, and simple minimalistic and also
look to moxir mood, set, vibe and its the undegroudn rave thing lights like that not the commercial
shit"*. Same hall, same DJ booth, same zones; what changes is how much is hung and how it is used.

### 15.1 The data model — a version is a PROJECT (decision)

Each version is a project of the space beside the hall's own: `moxir-hall-minimal`, `-middle`,
`-full`; the hall's own project (`moxir-hall`, the rig as ordered) is the fourth member of the set.
Considered and not chosen: a `variant` field on every lamp inside one project. Every view (plot,
cards, equipment, patch sheet, auto-patch, build, the desk's looks) would have had to learn to filter
by it, and two versions would have shared one desk patch and one equipment list — the thing a
version is supposed to change. A project has its own of each already, so every view works on a
version unchanged. The cost: the hall's model is uploaded once per version (the same bytes; the
server addresses assets by sha256).

What ties the set together is `components.rigVariant` on the show's entity (`rig-show`), normalised
in both schema copies: `{ set, id, title, summary, source, siblings: [{ id, projectId, title,
summary }] }`, siblings in order. A version its own set does not list is dropped.

**The switch** (`src/rigbuild/RigVersionSwitch.jsx`): in the space view (the published viewer, view
mode), top left, a row of plain links — As ordered · Minimal · Middle · Full — to
`/{space}/p/{project}`; the current one lit. Shown only when the document carries a rigVariant with
two or more siblings, so every other room is unchanged. Links, not state: a new tab puts two side
by side; 44 px targets for a thumb.

**The switch reads the space, not a frozen list (2026-09-30).** A version's stored `siblings` is the
fallback only. The row is derived at view time from `GET /api/spaces/:id/contents`: every live row
whose document's mark names the same `set` (each row carries `rigVariant` { set, id, title, summary,
copyOf? }, lifted by the server from the cached document read). So archived, draft or private versions
never appear for a viewer who may not see them, a version made later is on every older version's row,
and the row is the same from each. Order: by project id; labelled copies (`copyOf`) after the live
versions, behind a divider. A mark with no `siblings` still works. Pure part: `src/rigbuild/rigVariant.js`.

**The switch reads the production's version list first (2026-10-04).** One list per production, kept in the
space as the project `<set>-versions` (private), one entity per version, each with a status — `for-the-show` ·
`candidate` · `kept-copy` · `archived`, at most one for the show. With a list, the row is the list: the version
for the show first and marked "for the show", then candidates, kept copies folded, archived versions not on the
row; linked only where the space holds the project for this viewer. Without one (a visitor, or an install that
has none) the row is as above. `siblings` is legacy: read only as the last fallback. Decision, method and
limits: `docs/architecture/decisions/2026-10-04-production-versions.md`. Tools: `scripts/production/`.

### 15.2 Made as data, generated, tested

- **The design** — `moxir-versions-2026-10-17.json`: the brief's rules with the sources that
  support them (opened 2026-09-28) and those marked *design hypothesis* where no source could be
  opened; the palette; the groups (some `from` the base rig); the effects; five looks; the
  other-supplier lines with named products; the rental house's complete systems.
- **The rigs** — `scripts/rigbuild/versions.mjs` writes `moxir-2026-10-17-{minimal,middle,full}.json`
  (complete rig files: every tool that reads a rig reads them) and
  `scripts/rigbuild/rentals/moxir-2026-10-17-*.json` (the equipment lists). Never edited by hand;
  `versions.test.js` regenerates and compares.
- **The report** — `versions.mjs --report <dir>` hangs each (rig-lib), types and patches it on a
  throwaway desk (moxir.mjs), and costs it: `report.json`, patch sheet, patch/power CSV.
- **Into a space** — `scripts/rigbuild/load-version.mjs` (create the project, copy the hall,
  load-plot, the equipment list, the looks, the rigVariant, the night, the wash; `--mark` writes only
  the rigVariant; `--look` shows a look).
- **The pictures** — `scripts/rigbuild/versions-render.sh` (per version and look: `load-version
  --look`, then `rig-look.mjs --gpu` from the opening and the crane cameras, under a browser lock,
  waiting under 85 °C, a view over 95 °C shot again), and `scripts/rigbuild/versions-page.mjs` (one
  plain HTML page with the images, the numbers and the sources; no WebGL).

### 15.3 What the rig code gained

| where | what |
|---|---|
| looks (`rig-lib.mjs`, `looks.js`, both schemas) | `levels` per group, 0..1 (absent = full): a look says where there is NO light. Scales the light, the cone's haze and the bake. A level-0 beam-only lamp keeps `visible` + `only` (a hidden beam-only beam would become a real light, `beamCastsLight`). Resting on a look writes aims and colours only: the document holds no nominal intensity to come back to. `solo` (an aim parameter): only the lamp of that rank keeps the level |
| mounts (`rig-lib.mjs`) | `truss: { kind: 'none' }` (no goalpost; the truss mounts refuse); `dx_m` on `booth-pit` and `truss-header`; `h_m` on `tower-ladder`; `z_at` on a column spec; `off_m` on `column-bases` (1.2 m where a PAR uplights the same face — at 0.7 m the two bodies stood in each other, which the bodies made visible) |
| fixtures (`fixtures.json`, `build_fixtures.py`) | strobe, blinder, hazer: `EXT-` planning types modelled on the Martin Atomic 3000 LED, the Chauvet STRIKE 4 and the Antari HZ-1000 (maker pages fetched 2026-09-28). A `panel` archetype; a panel is compared with its datasheet face-forward (`datasheet_tilt_deg`). The strobe's beam angle is not published: 60° ASSUMED |
| `rig.mjs --wash-only` | a look that bakes no wash takes the old one away (a dark look must not keep lit columns) |
| `rig-look.mjs` | `--path` (a project other than the space's published one), `--token-file` (a private scratch space), a pause over 95 °C |

### 15.4 The checks (`scripts/rigbuild/versions.test.js`)

For every version and every look: nothing refused, no beam into a crane, no narrow beam (≤ 6°)
through the DJ, no head past its travel; every laser ≥ 3 m and rising (never into the audience
plane — a picture of intent; a laser safety officer and IEC 60825-1 are owed before any laser is
on); at most 8 real lights; mirror-symmetric about the nave centre line (the press's lamps and a
solo aside). For every version: the palette only; no CO₂, spark or confetti code or class; haze in
every one; minimal < middle < full; the à-la-carte cost equals Σ rate × quantity, the outdoor
package undercuts it, two days are 1.5 day-rates.

### 15.5 Owed

The owner's look and choice. Rates for the other-supplier lines (none published). The package
readings ("laser" = one UP-LA40WF, "12x250W beams" = the UP-250BSW) and whether the day rule applies
to packages — to be confirmed by the rental house. The UP-PL5403's DMX mode (so the universes count
only the patched lamps). The strobe's beam angle. Versions on the owner's install (not done here: a
deploy is scheduled separately). Looks keyed by position/type are posed by the room only for lamps
on a derived slot (§11.2); the booth-line beams at x ±1 and the header lamps at ±0.75 m do sit on
slots, the column-base beams at 1.2 m off the face do not.

### 15.6 The show in the room — a looping cue list, fades, strobes as a flash (2026-09-28 night)

Owner, on the three versions: *"minimal, make the underground show loop"*. Shipped in the preview as
`0.4.16-rigbuilder.7` (+ `.8`, fixes found by looking).

**The loop runs in the desk (decision).** The cards page's cue list moved on by each cue's `hold` with a
`setTimeout` in the tab: two open pages fired twice, and closing the tab stopped the show. The timer is now
the desk's (`serverXR/src/lighting/cuerun.js`, LIGHTING_DESK.md "The cue runner"): one timer handle, the
list, the position and `loop` saved with the desk's show, resumed after a desk restart, stopped by
blackout. Pages only ask it to load / go / back / stop / loop. `mappingState.loop` keeps the switch in the
document. Considered and not chosen: a leader election between tabs (still needs a tab open).

**The room follows the look.** `/{space}` drew the document as saved; only view A and the Studio posed the
lamps by the desk's look. `RoomLookFollower` (lazy, rig rooms only) hands the space view the same drawing
(`useRigLookEntities`). A cue's fade is drawn: the desk reports `from`, `since`, `fadeMs` on
`GET /light/api/dmx`, the mirror turns them into a time on the page's clock (`lookFadeOf`), and the room
blends lens position, aim (short way round), colour, light and haze (`blendEntities`) on a ~30 Hz tick
that stops when the fade lands. The baked column wash is drawn at the look's PAR level (`washLevelOf`) —
one bake, in the baked look's colour (a look that washes in another colour needs its own bake: owed).

**Strobes and blinders are a flash, not a cone.** Drawn like the other lamps, a 60° strobe was a huge flat
grey cone and, as a real light at planning candela, a white floor. In the room they draw no cone and no
light (`flashEntities`: beam-only at haze 0; `SpotLightObject` mounts no cone at opacity 0), and
`RigFlashes` draws each lit one's face and a glare sprite, plus ONE shared real light per kind — strobes
pulsed at 10 Hz with a 22 ms decay, blinders steady warm — mounted at 0 when nothing is lit so the shader's
light count never changes mid-show. The phase is the wall clock: every screen flashes together. A strobe
is dark unless a look puts it on. Guard: `rigFlash.test.jsx` "mounts NO cone mesh" (seen red).

**Two data traps found by looking.** (1) Resting a document on a look with its levels
(`load-version --look`) writes a lamp at 0 as intensity 0, and a look's level only SCALES the document's
light — so that lamp never came back (the strobe hit showed nothing, the white cathedral lost its column
beams). Rest with `--nominal`. (2) The show hall: `hall-show.mjs` drops the planning floor tape
(`hall-zone-*`, the owner's blue dance-floor mark glowed through the set) and registers the asset in the
document (`upsertAsset`: an uploaded model the list does not name draws nothing — the room went hall-less
for a few minutes on the install).

**The scripts.** `show-loop.mjs` (the cue list + loop in the document, the looks on the desk, the runner
loaded and started; it never touches OUTPUT), `show-record.mjs` (watch the running show from the opening
view: frames named by cue, strobe bursts, fps per cue, renderer checked), `show-video.mjs` (one loop,
frame-exact: the room in the browser on the GPU with its clock taken over, the desk's answer computed for
each frame from the desk's own cue list, title card, slow push-in by crop, H.264). The owner's data steps:
`~/di-backups/preview-rig-builder-2026-09-28/moxir-minimal.sh`.

### 15.7 Hung from the crane — no stage, no towers (2026-09-28, 23:1x)

Owner: *"the yellow thing its move able we will arrange the crane top to the dj … with the metal chain
conected thr the yellow crane"* — only the DJ stand; the overhead crane parks over it and the truss hangs
from its bridge. Three shapes were sketched (`~/Downloads/moxir-crane-rig/sketch.html`); the minimal hang,
one line, was approved ("ok take complimentary").

**The geometry (metres, hall frame; estimates, not a survey).** The nave's entry-end crane is ROLLED along
its runway (dims overlay `moxir-hall-crane-dj-2026-09-28.json`: `cranes_from_door_m` 4 → 49.2), so its
bridge's centre line is at z 4.8 — over the DJ (the performer's box on the 3 × 2 m riser at 1.2 m is z
4.3–6.0). Moved, not duplicated: hall.json still lists two nave cranes. Rail 7.6 m (disputed 6.6–8.4),
girders 8.15–9.65 m, two 0.7 m box girders at ±1.1 m with a 1.5 m gap; the trolley parked at the right end
(x 7.6–10.2, `crane_trolley_x_m`) so no beam rises into it; the cab hangs at the left end (x −10.35…−8.35,
down to 5.95 m). The line: 8 m of 290 mm box truss (3 + 3 + 2 m), parallel to the bridge under its centre
line, bottom chord 6.0 m, x −4.25…+3.75 (a clamp point every 0.5 m, 0.25 m in from each end, then falls on
x = 0; every lamp is mirrored about x = 0). Two picks at x ±2.5: a spreader across both girders on beam
clamps, a chain hoist (500 kg–1 t, D8+) under it, the chain to the top chord, a safety steel beside it.
The stage deck is the DJ riser only; the goalpost towers are gone.

**What hangs (Minimal).** The line of 7 UP-B380F moved off the floor onto the line, STANDING on its top
chord at 1 m pitch (x −3…+3): hung under it a 270° tilt cannot reach the sky. The fan rises through the
gap between the girders. 2 strobes hung under the ends (±3.5); 4 PARs standing between the beams (±1.5,
±2.5) graze the audience-side girder's underside outward in deep red (rule `bridge-underside`: the bridge
is its target, so not a clash, and its beam stops there). Unchanged: 6 column-base beams, 8 red column
uplights, 3 press PARs, 4 pit strobes, 2 hazers. 7 real lights (1 beam, 4 column PARs, 2 bridge PARs); the
strobes flash through RigFlashes' one shared light (8 in the shader).

**The load (rig JSON `truss.rigging.load`).** Lamps on the line from the type library's weights: 7 × 23 kg
B380F + 2 × 7.8 kg strobe + 4 × 8 kg PAR = 208.6 kg; truss 48–56 kg (6–7 kg/m, ESTIMATE until the supplier's
datasheet); clamps, bonds and cable +10 % (21 kg, ESTIMATE) → 278–286 kg on 2 points, ≈ 139–143 kg a point,
static, before any dynamic factor; the hoists and spreaders (≈ 25–30 kg a point) load the bridge on top.
Middle 370–378 kg (185–189 a point), Full 409–417 kg (205–209). **Rigging sign-off owed (crane rated load,
lock-out, hoists + safety steels)** — a structural or rigging engineer approves; this file only draws it.

**Middle and Full.** The goalpost becomes the same hung line; their floor line of 7 moved up onto it too
(from the floor behind the DJ it now fired straight into the parked bridge); the header spots and strobes
hang under it; Middle's laser hangs under its centre, Full's two stand on its ends; Full's tower bee-eyes
and blinders hang on the bridge's audience-side girder (`crane-bridge` with `dx_m`).

**The checks (versions.test.js, every version and look):** symmetry about x = 0; no narrow beam through
the DJ; lasers ≥ 3 m and rising; no beam into the bridge, trolley or cab (the clash rule now knows the two
girders and the gap — guard in rig-lib.test.js); head travel; ≤ 8 real lights; the crane moved not copied,
over the DJ; no towers; the line 8 m at 6.0 m; 2 hoists; the load and the sign-off sentence written down.

**View C and the room.** A truss run lamps stand on lists its top chord ("… — on top", position key
`truss-top`); the room's look rules know the crane (the plan's overhead line). The opening shot: 14 m out,
eye height, looking up to 5.2 m, fov 55 — the bridge and the line frame the DJ, the press behind.
`load-version.mjs` copies the hall only (no build pieces from the source's plot: two hand-placed 3 m
truss pieces in moxir-hall had come across into the versions and were removed from them; moxir-hall keeps
its own).
### 15.8 The cut — one straight 12 m diagonal under the crane (2026-09-29)

Owner's pick: option 4 of `~/Downloads/moxir-crane-rig/ten-truss.html` — ONE straight 12 m truss in the crane
bridge's vertical plane, LOW house left, HIGH house right over the press. Design file
`scripts/place/rigs/moxir-crane-cut-2026-09-29.json` (every number with its source or marked ESTIMATE);
`versions.mjs craneCut` derives the rest — nothing below is typed by hand into the rig.

**Geometry (derived).** 4 × 3 m of 290 mm box truss (planned on the Prolyte H30V, 18.9 kg per 3 m), sloped
15° (the brief's floor for a deliberate slash; the steepest the two ends allow together). Ends x −6.04 (bottom
chord 3.44 m) and x +5.55 (6.55 m), rise 3.11 m, trim 5.06 m over the DJ's axis. The high end is capped by the
bridle, not the bridge: the high pick's two-leg V from both girders at its 120° limit puts the apex at 7.57 m,
and the hoist's shortest drop under it is 0.85 m (CHAINMASTER D8Plus 500 kg SK030/76U data sheet rev 1.1:
plate 97 + body 192 + chain exit 28 + hook 227 mm, + shackle, sling and margin, ESTIMATES). Lowest point
3.44 m = 0.94 m over raised hands (2.5 m); the line is in the bridge's plane (z 4.8), behind the crowd barrier.

**Picks and loads (static, ESTIMATE).** Picks at u −5.75, −0.5, +5.25 along the line (spans 5.25 / 5.75 m,
inside the H30V's 6 m table). Lamps 115.7 kg (7 UP-COB200 × 5.1, 10 UP-PL5403 × 8), truss 75.6 kg, +10 %
extras → 203 kg; split as a continuous beam on three supports (flexibility method, `threePointReactions`):
39 / 114 / 50 kg on the line; on the bridge with hoist (20 kg) and chain (12 m × 0.59 kg/m): 72 / 147 / 83 kg.
Bridle included angles 26° / 42° / 119°; the heaviest leg 76 kg. A safety steel per pick to its own girder
clamp; two opposed tie-offs to the nave columns hold the line along x. Pendulum periods 1.85 s (across) and
up to 4.08 s (along): no periodic effect within ±25 % of them, heads on the line move in ≥ 4 s
(`sway.mjs`, the show files). **Rigging sign-off owed (crane rated load, lock-out, hoists + safety steels);
a 3-point line is statically indeterminate — load cells at trim.**

**What hangs (Minimal = the cut, simple: no moving heads).** 7 UP-COB200 straight down along the line (the
curtain; white only, 3200–5600 K — its photometry ASSUMED), 6 UP-PL5403 in two threes from the ends aimed
to one point 1 m over the DJ's head (the X, in *White cathedral* and *The hit*), 4 red UP-PL5403 grazing the
bridge. The press PARs sit on the backdrop's clamp points and rise red in *Red room* and *The blade*.
`moxir-hall-minimal-cut-movers` is the same line with the 7 UP-B380F standing on it.

**Code.** A crane-hung run may slope (`rig-lib` linePoint/bottomChordAt; pieces carry their roll; the
client's `positions.js runFrame` makes a sloped run one run so its slots follow the 3D line — without it no
look reaches a lamp on the cut; the MVR truss matrices carry the roll). `rehang.mjs` puts a version's new rig
into a live project as ops, touching only the rig; `show-cues.mjs` writes a show's cue list into the
document only; `cue-frames.mjs` shoots every running cue from named cameras on the GPU.

**Seen.** Frames `~/Downloads/moxir-the-cut/` (3 cameras × 5 cues, RTX 3080 via PRIME, 60 fps): the line
reads as a slash from the floor and from the DJ; see the session note for what the installed preview does
and does not yet draw.
### 15.9 The halo — a comparison variant of Minimal (2026-09-29)

Option 6 of the ten truss versions (`~/Downloads/moxir-crane-rig/ten-truss.html`): *a triangle of 3 × 4 m
lying flat at 6 m, centred over the DJ; beams on the corners aim in to a point on the DJ — a cone of light
around them — then open outward to the crowd; 3 hoists*. Built to be compared with option 4 ("the cut",
built on Minimal itself), so it lives BESIDE the set, never in it. Owner, the same day: *the first version of
each design is simple — NO moving heads, only the rental house's fixed lights* (UP-PL5403, UP-COB200; the
rental house has no strobes). So there are two:

| project | what | lamps |
|---|---|---|
| `moxir-hall-minimal-halo` ("Minimal · halo") | simple: fixed lights, nothing moves | 30 × UP-PL5403, 8 × UP-COB200 (+ 2 hazers) |
| `moxir-hall-minimal-halo-heads` ("Minimal · halo · heads") | the second study: moving heads | 7 × UP-B380F on the halo, Minimal's floor rig |

**A comparison VARIANT (decision).** `variants` in the versions file, beside `versions`: generated by the
same `versions.mjs` (rig file + equipment list), loaded by the same `load-version.mjs`, tested by the same
safety tests — but a variant (1) has its own looks (`looks`), groups (`groupDefs`), classes and aim rules,
(2) lists itself after the set in its own switch while the set's projects are NOT rewritten to list it
(`variantOf`; `--mark` and the load skip the hall's project), (3) copies its room READ-ONLY from another
version (`--hall-from moxir-hall-minimal`: the hall as Minimal has it now, its night and render settings —
the version's night is then not written over them), and (4) loads UNPATCHED (no desk index, universe or
address — the desk holds the set's show; a desk fixture's DMX can never be joined to a variant's lamp).

**The geometry (hall frame; estimates, not a survey).** Equilateral, 4 m a side on the truss centre lines
(`haloGeometry`): circumradius 2.309 m, depth 3.464 m. Centroid on the crane bridge's centre line, x 0 z 4.8
(inside the DJ's box, z 4.3–6.0). Apex toward the crowd: (0, 7.109); base corners (±2, 3.645) under the back
girder. Why the apex to the crowd: the base edge then stands behind the DJ, 0.30 m clear of the press in plan
(its truss z 3.50–3.79, the press ends at z 3.2) — with the apex to the press, the point would sit 0.25 m off
the press's edge and a side would cross its corner; from the floor the apex points at the people and the two
long sides frame the DJ against the press. Either way ONE corner lies beyond the bridge: the triangle is
3.46 m deep and the two girders span 2.9 m face to face — the apex is one pick, the base would be two.

**The truss (the maker's published parts, opened 2026-09-29).** Global Truss F34 (290 mm): 3 × F34300 (3 m,
16 kg) + 3 × **F34C20 2-way corner 60°** (8.80 kg, outer 1000 × 1000 × 290 mm) — a 60° corner is a standard
catalogue part of the 290 mm class (the same series lists 45°, 90°, 120°, 135°). The C20's leg on the centre
line is not on the page: **0.5 m ASSUMED** (side = 0.5 + 3 + 0.5 = 4.0 m); read it from Global Truss's
F34 DWG before ordering. 74.4 kg of truss. In the plot the three straights are pieces (`rig-piece-halo-side-*`,
load-plot lays each side's box as its run); the corner blocks have no catalogue piece yet and are drawn as the
rig's boxes (`rig-halo-corner-*`).

**The hang.** Bottom chord 6.0 m. Each corner: a two-leg bridle (a V, legs ±0.75 m, 0.75 m deep: 90° between
the legs, each leg ≈ 0.71 × the pick) on beam clamps, a 500 kg D8+ chain hoist hook-suspended under its ring
(ChainMaster D8Plus 500 kg data sheet: body 20 kg, chain 0.59 kg/m; body 337 mm + hook tackle 227 mm from its
dimension sheet — a DERIVED headroom, no single figure is published), its chain and a round sling to the
corner, and a safety steel from the corner to the crane. The base corners' V's lie along the back girder
(they hold x); the apex hangs from an **outrigger** — an F34 400 cm (21 kg) laid across both girders' bottom
flanges, cantilevered 1.21 m past the audience-side one — with its V along the outrigger (it holds z). Three
V's in two directions hold the halo in x, z and turn. Stack: girder bottom 8.15 → ring 7.40 → hook ≈ 6.73
(apex ≈ 6.44) → top chord 6.29: 0.15–0.44 m of chain left. At the rail's LOW bound (6.6 m, girder bottom
≈ 7.15) a 6.0 m bottom chord is NOT reachable; the halo would trim at ≈ 5.3 m. Measure the rail.

**The loads (`truss.rigging.load`, static).** A rigid body on three vertical supports is statically
determinate: each point load splits onto the corners by its barycentric coordinates on the triangle (the
lamp's `halo_at`), the truss a third each, extras +10 % of the lamps (ESTIMATE). Simple: lamps 172.4 kg,
total 264 kg → apex 92 / left 86 / right 86 kg; on the crane with hoist, chain and bridle (+25 kg) 117 / 111 /
111 kg; the outrigger (a beam on the two girders with the pick on its overhang: front = P(s+a)/s, back uplift =
Pa/s, s 2.2 m, a 1.21 m) → front clamps 198 kg, back clamps pulled UP 70 kg. Heads: lamps 208.6 kg, total
304 kg → 113 / 95 / 95 kg; on the crane 138 / 120 / 120; outrigger front 230, uplift 82 kg. **Rigging
sign-off owed** — and the outrigger is a cantilever off an old crane: a structural engineer's check, or a
different pick (a bridle to the roof steel, or a 3 m halo, 2.60 m deep, that fits under the bridge).

**Sway (owner's concern: moving heads may swing a chain-hung truss).** A chain-hung load is a pendulum,
T = 2π√(L/g). Out of a bridle's plane the pivot is the girder: L = 8.15 − centre of mass (5.89 m heads,
6.01 m simple; lamps' heights from their datasheet sizes) = 2.26 / 2.14 m → **T ≈ 3.0 / 2.9 s**. In its plane
a V is triangulated. The rule written into the heads variant (`truss.rigging.sway.rule`) and tested: every cue
that moves a halo head fades ≥ 4 s (the strobe hit moves nothing; heads reposition in black), no periodic
movement with a period of 1.5–6 s (½T–2T) on the halo's heads. The simple variant has nothing that moves.
No tie-offs are drawn (the three V's suffice on paper); if the rigger wants more: horizontal straps from the
base corners back to the girders, never to the crowd floor.

**The looks.** Fixed lights are focused ONCE — every lamp's aim is the same in every look (tested); only
levels and colours change. Simple: the apex PAR straight down (the pillar), 8 PARs under the long sides
focused IN to a ring 1.3 m round the DJ at deck height (the **cone** — outside the performer's box, tested),
the base corners' PARs through one point 3.1 m over the deck above the DJ (the **X**, tested: the two beam
lines meet within 2 cm, over his head), 4 PARs under the base edge out to the crowd (20° down: the halo
opening outward), 4 red PARs grazing the girders (two groups: `girder` −1.1 the back one, +1.1 the front),
4 COBs on the halo + 4 in the pit for the hits. Heads: the same five with rules `ring`, `dj-point`, `radial`
(new in `AIM_RULES`, ported to `src/rigbuild/lookRules.js`, held equal). Minimal's five cues, holds and one
60 s pass; the heads' fades lengthened to ≥ 4 s where a head moves.

**The show plays by the document's clock, desk or no desk.** `mappingState.showSource: 'clock'` (both schema
twins, written only when set): `showDriver` returns `clock` for such a show even where a desk answers — the
desk here holds Minimal's show, the variant is not on it. `show-loop.mjs --rig <rig> --document-only` writes
the rig file's own `show` (cue list, loop, showSource) and asks the desk nothing; `show-clock.mjs --epoch now`
starts the clock. The room poses the halo's lamps by the NAMED position the rig writes on each
(`fixture.position` "halo <group>", `namedPositionKey`; looks.mjs keys the same group `halo-<group>`): a
corner is no derived slot. Measured: the room's aim equals the rig script's to 0.008° on every halo lamp in
every look (halo.test.js). `RigVersionSwitch`, FixtureBodies (`cob200`, our model to the page's
295 × 295 × 350 mm) unchanged otherwise.

**Checks** (`scripts/rigbuild/halo.test.js`; the safety tests of versions.test.js now run on the variants
too): the triangle's sides, centroid and apex; bottom chord, chain left at every corner, nothing over the
press in plan; 3 hoists, 6 bridle legs ending at the steel, 3 safety steels, the outrigger, the sign-off
sentence; the loads adding up (barycentric), each corner < 250 kg (2:1 on a 500 kg hoist before any dynamic
factor), the truss weight from the maker's numbers; fixed = PL5403 + COB200 within stock (50 / 8), one focus
per lamp; the cone, the X; the show (5 cues, 60 s, showSource clock); the sway rule; the switch lists the set
and itself; variants load unpatched; the room's poses equal the script's.

**Data** (the owner's install): `~/di-backups/preview-rig-builder-2026-09-28/moxir-halo.sh`
(report · version · look · rest · show · clock · frames · undo; a `di save moxir` before every write into
`steps/<time>-halo/`). Undo: `moxir-halo.sh undo [variant]` deletes that project; nothing else is written.

**Owed.** The C20's leg length (the DWG); the crane's rated load and a rigging/structural sign-off (the
outrigger above all); the rail height (6.0 m trim needs ≥ ≈ 7.0 m rail); the COB200's photometry (UPlight
publishes none: drawn with a hand-set intensity, labelled ASSUMED) and channel order; the installed build
(0.4.16-rigbuilder.9) predates `showSource`, the named halo positions and the COB body — until a preview with
this change is installed, the halo rooms there show the look written into the document (no clock) and the
COBs have no body.
### 15.10 Candidates — the X lying down, simple and with heads (2026-09-29)

Owner, on the sketches "ten truss versions" (`~/Downloads/moxir-crane-rig/ten-truss.html`), option 2:
two 5 m arms of truss crossing FLAT under the crane bridge over the DJ, one arm out over the crowd.
Then: *the first version of each design is simple — no moving heads, only the rental house's fixed
lights* (UP-PL5403 stock 50, UP-COB200 stock 8; the house has no strobes). Both are built beside
Minimal for him to compare, as **candidates**.

**A candidate is not a version (decision).** The versions file gains `candidates`: a variant of one
version (`candidateOf`), with its own groups, truss and look overrides (title, intent, per-group
aims/colours/levels on top of the set's looks). `versions.mjs` generates its rig file and equipment
list like a version's; `versions.test.js`'s safety tests run on it (nothing refused, no beam into the
crane or through the DJ, head travel, ≤ 8 real lights, mirror symmetry); the set's own tests (three
versions, minimal < middle < full, the palette, the cost) do not. Its project is `moxir-hall-<id>`;
`load-version.mjs --no-mark-from` leaves the hall's own project alone; its rigVariant lists the set
and the candidates of its version, so its switch reaches what it is compared with, while the three
versions' marks stay as they were. Considered and not chosen: a fourth version (the set's switch and
tests are about three, and every candidate would have touched every version's project).

| candidate | project | what hangs on the X |
|---|---|---|
| `minimal-xflat` "Minimal · X lying down" — the simple one | `moxir-hall-minimal-xflat` | 12 UP-PL5403 under the arms (3 a half-arm), focused down and 20° out along their arm: in haze, four blades; 4 UP-COB200 under the ends, 35° under the horizon out along their arm: the hits; Minimal's 4 red PARs grazing the bridge. Floor: Minimal's column and press PARs; its column-base beams and pit strobes are not in the simple one. |
| `minimal-xflat-heads` "… · heads" | `moxir-hall-minimal-xflat-heads` | 7 UP-B380F standing on the arms (the 4 ends, x ±1.25, z +1.75), 2 strobes under the bridge arm's ends, the 4 red PARs. Floor as Minimal. |

**The truss (`truss.kind: 'crane-x'`, rig-lib).** Two arms of `arm_m` crossing at a 4-way flat
junction under the bridge's centre line (z 4.8) on the axis: one along the bridge (x), one across it
(z), its crowd end 1.05 m past the audience girder's outer face. Each arm = 2 m + the junction's 1 m +
2 m (Global Truss F34: 4 × SQ-4112 2.0 m at 13.17 kg, 1 × SQ-4133 4-way cross junction at 10.44 kg —
maker's pages fetched 2026-09-29; the junction's leg length is not published, 0.5 m ESTIMATE). One
system for the whole X: H30V is the same class and does not couple to F34. Mounts `x-top`/`x-under`
put lamps at `at_m` [[dx, dz]] from the crossing, on the half-arms' clamp points, so view C's derived
slots find them (MOUNT_POSITION: truss-top / truss). load-plot lays the four half-arms as stock runs;
the junction stays the rig's box.

**How it hangs — nothing away from the bridge.** The crowd arm crosses under BOTH girders, so it is
picked right under each (a two-leg bridle along that girder, legs 1.5 m apart); its ends cantilever
1.4 m. The bridge arm runs in the 1.5 m gap between the girders and is picked at x ±1.5 by a bridle
whose legs reach one girder each (2.2 m apart); its ends cantilever 1.0 m. Every bridle has 90°
between its legs. Four climbing D8+ chain hoists (Chainmaster D8Plus 500 kg class: ≈ 20 kg with its
suspension plate and hook tackle, chain 0.59 kg/m — maker's datasheet) sit on the top chord, their
chains up to the bridles' apexes; a safety steel each. So the 45° rotation the brief allowed for was
not needed: the arm over the crowd is reachable from the bridge.

**The trim is the shortest drop the rigging allows.** Girder bottom 8.15 m (the model's; rail 7.6 m,
disputed 6.6–8.4) − the wide bridle's apex 1.1 m − the hoist's hook-to-plate minimum ≈ 0.50 m (read
from the Chainmaster dimension sheet) − 0.10 m of shackles = top chord 6.45 m → bottom chord
**6.15 m**. At the low rail estimate every height drops by 1.0 m: bottom chord ≈ 5.15 m, under the
press crown (5.6 m), 0.1 m clear of it in plan — the girder bottom must be measured before the trim
is set.

**Sway (the owner's concern: moving heads may swing a chain-hung truss).** Hung on plain chains the
X is a pendulum: L 1.5–1.9 m from the girder flange to the hung mass's centre, T = 2π√(L/g) =
**2.5–2.8 s**. The bridles make each pick a V: the bridge arm's Vs span z, the crowd arm's span x, so
the rigid X cannot translate either way without stretching a leg. Two restraint steels at every arm
end, up to the girders and spread in plan, stop it turning (to the crane, not the floor: the crowd end
hangs over people). What is left is the give of wire and slings. The rig file's `truss.motion` rules,
for the heads candidate: no full-range pan/tilt faster than 4 s; no periodic movement with a period
of 1.7–4 s (0.7× to 1.5× the pendulum's); cue fades that move heads ≥ 4 s (its show file); the crane
locked out. The simple candidate has no moving heads, so nothing on it pushes.

**Loads (static, before dynamic factors; the rig file's `truss.rigging.load`).** Simple: lamps
16 × 8 kg + 4 × 5.1 kg = 148.4 kg, truss 63.1 kg, +10 % of the lamps for clamps/bonds/cable (ESTIMATE)
→ 227 kg on the X; + 4 hoists 80 kg, chain 23.6 kg (10 m a hoist, ESTIMATE), hardware 6 kg a point
(ESTIMATE) → **355 kg on the crane**; 89 kg a point if even, **178 kg a point design case** (a stiff X
on 4 points is statically indeterminate until load cells level it: any point may take half), a bridle
leg 126 kg. Heads: lamps 208.6 kg → 293 kg on the X, 421 kg on the crane, 211 kg a point design case,
149 kg a leg. The cantilevers (1.0 / 1.4 m) are outside what the maker's span tables cover.
**Rigging sign-off owed (crane rated load, lock-out, hoists + safety steels).**

**Looks.** The same five cue ids as Minimal, so a desk that plays Minimal's loop names the same moment
in each room. Simple (fixed focus: a test holds every lamp's pose equal in all five looks; colour and
level only): One blade (only the crowd arm's blade) · The sign (blades 60 %, the bridge a red frame,
columns and press low red) · Red room · Four blades · Hit (the 4 COBs; their own 1–25 Hz strobe on
the desk). Heads: Blackout + the cross (the bridge arm's two end beams cross at 4.8 m, 1.6 m over the
DJ's head, landing in the pit — never through the DJ) · The sign (all seven lie along the arms: the
bridge arm's at −10°, under the crane's cab, the crowd arm's +8°) · Red room · Four rays (the 4 ends
at 40°) · Strobe hit. New aim rule `along-arm` (both copies, `lookRules.test.js` holds them equal)
and aim parameters `solo_mask` (bit r = rank r lit) and `rest_up` — numbers, because the document's
schema keeps only numeric aim parameters. The shows (`scripts/rigbuild/shows/moxir-xflat*.json`) go
into the document only (`show-loop.mjs --doc-only`) with a show clock (§16): the desk is never asked.

**The UP-COB200** joins the fixture manifest (kind `cob`, the PAR archetype drawn to the maker's
295 × 295 × 350 mm, 5.1 kg, 45° lens). UPlight publishes no photometry: 9,000 lm is a PLANNING figure
(≈ 50 lm/W of its 180 W), marked ASSUMED; a lux reading from the house's unit is owed.

**On the installed preview (0.4.16-rigbuilder.9).** The data loads and the room draws each look
written into the document (`moxir-xflat.sh look <L>`). The installed client does not know
`along-arm`, `solo_mask`, `rest_up` or the COB's body — they arrive with the next preview build
(this branch); until then, a room following a desk look poses only the lamps whose rules it knows.

**The scripts.** `scripts/rigbuild/moxir-xflat.sh <step> [fixed|heads]` — report, version, hallshow,
opening, show, clock, look, render, all, undo; a `di save moxir` before every write; `undo` DELETEs
only the candidate's project (a whole-space `di open` would also roll back other sessions' work).
`rig-look.mjs --cameras <file> --no-desk` shoots named cameras with the desk and the clock kept out
of that browser. Tests: `scripts/rigbuild/versions-xflat.test.js`.

### 15.11 Old versions kept as copies (`scripts/rigbuild/copy-version.mjs`, 2026-09-30)

Owner, 2026-09-30, before the measured hall (v4, the crane's underside 7.95 m, was 8.15) was
swapped into every version: "we will not have the old versions?" and then "keep the old ones as
copies". A backup and the op log are not enough; he opens old and new side by side.

- **A copy is a project.** It sits in the same space, with its own id (`<project>-oldhall-0929`).
  Ids are global: the script checks that the id is free, and the server refuses a taken one with 409.
  It holds the source's document as it is (every entity, the night, the opening, the cue list and
  clock, the lamps' desk patch) and every asset, re-uploaded as bytes. Content-addressed ids that
  come back different are remapped (`asset-remap-lib.mjs`). URLs naming the source project are
  pointed at the copy (`repointProjectUrls`).
- **Only the copy's version mark changes.** Its `rigVariant` gets id `<id>-oldhall-0929`, and its
  title carries the label before its dash (`labelled`), so the switch button reads
  "Minimal · old hall 09-29". It also gets `copyOf` and the version buttons it lists (`--siblings`).
  The source is only read.
- **It plays as the original did.** The patch is kept, so a copy of a desk-driven version is drawn
  from the same desk fixtures (the room joins DMX by fixture index, §18.3). A version that plays by
  its own clock (the halo, the X) keeps its clock. Consequence: the Studio's auto-patch sees the
  copy's lamps at addresses another project holds and flags them as overlaps. It moves nothing.
- **Undo**: `copy-version.mjs --undo --to <copy>`. It deletes only a project whose mark says `copyOf`,
  soft, into the trash.
- **Adopt**: `copy-version.mjs --adopt --from <source> --to <copy> --label "old hall 09-29"` gives an
  existing copy its mark back when a server lost it (`copyOf` normalised away, or the whole mark dropped
  because its own id fell past `RIG_VERSIONS_CAP` siblings). GET only, then ONE `updateComponent` on the
  show entity's `rigVariant` at the version re-read just before writing, read back afterwards. It refuses
  a project that does not look like the source's copy (`looksLikeCopyOf`: same set, entity count within
  15 % / at least 10, at least 90 % of the hall's ids and names the same; the thresholds are chosen, not
  measured, and the dry run prints the measured numbers). Idempotent; `--dry-run` writes nothing.
  Notes and the exact commands: `PROGRESS.md` (the note folded at land: "copy-version --adopt").
- Guard: `copy-version.test.js` (the label, the URLs, the mark alone changes; `--adopt`: the mark given
  back, refusals, idempotence, dry run, one op on the show entity only).
- **Listed in the same run (2026-10-04).** A new copy goes into the production's version list as `kept-copy`,
  made from its source version; a copy brought from another install under its own id (`--from-api`) as a
  `candidate`; `--adopt` registers the copy; `--undo` takes it out of the list; `--dry-run` writes no list.
  Guard: `copy-version-list.test.js`. The decision: `docs/architecture/decisions/2026-10-04-production-versions.md`.

### 15.12 Movers on the ground — Minimal and Full with nothing that moves in the air (2026-09-30)

Owner, 2026-09-30: "nothing moving on the air truss ... no moving heads for now. All moving heads on the
ground, some other reachable places — analyze once they are so; the basic is: statics go to the air
truss, moving heads all safe on the ground, and 2 lasers. So the basic one: all movings indoor/outdoor
once, and wash. The 2nd version: full with special effects but again mostly the same setup: movings on the
ground or super safe, no air truss; statics can go on the truss also; not-hard-moving things, not the
spots, can go on the truss again." Built as two CANDIDATES beside the versions (versions file
`candidates`, the same set, so the switch lists them): `minimal-ground` (of Minimal) and `full-ground`
(of Full). Every existing version, variant and candidate is untouched (their rig files are byte for
byte what they were; a test holds the ids and their order).

**Definitions used.** MOVING = anything that pans, tilts, rotates or zooms by motor: UP-B380F,
UP-250BSW, UP-HK1915 (the library types with `pan_tilt_deg`) and the list's UP-HK615, UP-MH100S,
UP-MH8060S and the BY06 swing laser — the last four have no type or 3D model in the library, so they are
NOT placed here (owed). STATIC = PARs, washes, COB, strobes, blinders, UP-PL5403, UP-COB200. The
UP-LA40WF is a scanning device on a FIXED mount: nothing on it pans or tilts (the scanner is two mirrors
inside), so it is not a "moving head" for the rule below; that is a reading, flagged for the owner.

**Method.** No published method for placing ground movers against an audience was found or used: the
method is written here first and its results are UNVALIDATED (never seen on a screen, never measured in
the hall). It is a geometric test on the committed hall model (`moxir-hall-2026-09-28-crane-dj.hall.json`;
the built model `/mnt/data/footage/place-moxir-hall-v4-0929-crane-dj/hall.json` was read, read only, and
agrees on the zones, the massing, the column grid and the crane over the DJ; it differs on the far crane
and the girder underside, neither near a chosen place): for each candidate place, its distance to the
booth, the floor cable route (Manhattan, round obstacles by hand), the distance to the dance zone (x -5.35
to 5.35, z 7.5 to 48), to the machinery boxes (press, crown, machine line, pipe) and whether it lies under
a crane girder; for each chosen mover, in EVERY look and at the rest aim, rays along the lower edge of its
beam cone (8 azimuths + the axis, the light's half angle: B380F 0.9 deg, 250BSW 7.5 deg, HK1915 2 deg) stepped
0.1 m out to its reach against the dance zone below 2.5 m (audience eye height, the owner's number). All in
`scripts/rigbuild/ground-movers.mjs`; the numbers below are its output in
`scripts/place/rigs/moxir-ground-movers-2026-09-30.json` (generated; `--check`).

**Every candidate place** (x, z as the hall: the nave centre x 0, the DJ at z ~5.2, the entry door at
z 54.5, +z toward the house):

| place | x, z (m) | lens above the floor (m) | floor cable route from the booth (m) | straight distance to the DJ (m) | distance to the dance zone (m) | machinery floor | decision | trip risk |
|---|---|---|---|---|---|---|---|---|
| floor behind the DJ riser (the old beam380-back / -flank line) | 0, 3.95 | 0.7 | 1.25 | 1.25 | 3.55 | no | under a crane girder: rejected | low |
| floor of the pit between the riser and the crowd barrier | 0, 6.95 | 0.7 | 1.75 | 1.75 | 0.55 | no | rejected | high |
| the DJ riser's deck | 0, 5.2 | 1.9 | 0 | 0 | 2.3 | no | rejected | the DJ stands there |
| floor at the press's foot (where the press PARs stand) | 1.5, 3.5 | 0.7 | 3.2 | 2.27 | 4 | YES | under a crane girder: rejected | low |
| the brick plinth and body of the machine line | 8, 1 | 1.6 | 12.2 | 9.04 | 7.02 | YES | rejected | low |
| floor of the backstage zone, 1.5 m behind the press | 0, -1.5 | 0.7 | 13.7 | 6.7 | 9 | no | CHOSEN | low |
| the floor at the base of nave columns z 12, 24, 36 (both rows) | 10.88, 24 | 0.7 | 29.68 | 21.72 | 5.53 | no | CHOSEN | medium |
| the same wall, columns z 18, 30, 42, 1.0 m off the face | 10.6, 30 | 0.54 | 35.4 | 26.97 | 5.25 | no | CHOSEN | medium |
| the wall at z -6 (behind the press) and z 48 (far end of the dance floor) | 10.6, 48 | 0.49 | 53.4 | 44.09 | 5.25 | no | CHOSEN | medium |
| the wall at z 6 (the first column pair, beside the stage) | 10.6, 6 | 0.7 | 11.4 | 10.63 | 5.46 | no | under a crane girder: rejected | low |
| on the dance floor | 0, 28 | 0.7 | 22.8 | 22.8 | 0 | no | rejected | high |
| the aisle between the dance zone and the wall | 8, 28 | 0.7 | 30.8 | 24.16 | 2.65 | no | rejected | high |
| the tops of the 3 m low walls (left row z 12.5-42.5; the right row is a GUESS) | 11.6, 27 | 3.7 | 33.4 | 24.69 | 6.25 | no | rejected | none |
| the floor by the entry door (z 54.5, 6 m wide) | 0, 52 | 0.7 | 46.8 | 46.8 | 4 | no | rejected | high |

Why each was taken or left:

- **floor behind the DJ riser (the old beam380-back / -flank line)** (rejected): REJECTED: the crane parked over the DJ stands in every beam from here (girders z 3.35-4.05 and 5.55-6.25, bottom 7.95 m) and so does the hung line at z 4.8; buildRig refuses all 7 ("beam runs into the crane"). Also 1 m behind the DJ: heat, fan noise, glare on the desk. Crowd: none (crew side of the barrier). Machinery: no: plain floor 0.75 m from the press face (z 3.2). Cable: a few metres to the booth.
- **floor of the pit between the riser and the crowd barrier** (rejected): REJECTED for movers: a beam leaned toward the house by more than about 15 degrees (hand calculation, lens 0.45 m) rakes the dance zone below 2.5 m (0.55 m to its edge); the pit is where the effects stand (RIG_BUILD §15.12, full-ground). Kept free of heads. Crowd: barrier at z 7.5, 0.55 m away; nothing between it and the crowd but a 1.1 m rail. Machinery: no. Cable: about 2-9 m to the booth.
- **the DJ riser's deck** (rejected): REJECTED: the mounting face is at 1.2 m, above the 0.6 m rule; heads a metre from the DJ. Crowd: none. Machinery: no. Cable: in the booth.
- **floor at the press's foot (where the press PARs stand)** (rejected): REJECTED: machinery floor; the press PARs already stand here; a lens 0.3 m from the face blows it out white. Crowd: none. Machinery: YES, 0.3 m from the press face: floor next to a forging press (oil, drip, hot dies), not confirmed as clean floor. Cable: a few metres.
- **the brick plinth and body of the machine line** (rejected): REJECTED: machinery, and above the 0.6 m rule; load-bearing not known. Crowd: none. Machinery: YES: the machine line itself (plinth 0.9 m, body to 2.4 m). Cable: about 10 m.
- **floor of the backstage zone, 1.5 m behind the press** (CHOSEN): CHOSEN for 7 UP-B380F: no crowd, no crane in the way (the girders are 3.35 m or more in front), beams rise behind the press so it stands in silhouette in front of the shafts (the underground brief: the building revealed in pieces). Lens 0.70 m. Crowd: none: behind the press and the machine line, in the owner's red backstage zone (z -10 .. -1). Machinery: no at z -1.5: the press ends at z 0.2 and the machine line at z -0.5 (1.0 m clear of the nearest fixture); loose machinery reported in the zone must be cleared (hall.json "clear"). Cable: about 11-15 m from the booth, round the press (it blocks the straight line: out along the side of the riser, down the backstage side).
- **the floor at the base of nave columns z 12, 24, 36 (both rows)** (CHOSEN): CHOSEN for 6 UP-B380F (the pillars of the "white cathedral"): the most protected floor the crowd shares the room with; the beams rise straight up the wall into the space frame; lean up to +-22 degrees toward the walls in the looks. Lens 0.70 m. Crowd: 5.5 m outside the dance zone (x 5.35); the inner face of the column row is x 11.6. Machinery: no. Cable: 10.9 m across + the run along the wall: 17-42 m from the booth.
- **the same wall, columns z 18, 30, 42, 1.0 m off the face** (CHOSEN): CHOSEN for 6 UP-250BSW: interleaved with the beams; 1.0 m off the face because the PAR uplight stands on the same face (x 11.15). Spot mode 15 degrees, up the wall and into the roof. Lens 0.54 m. Crowd: 5.25 m outside the dance zone. Machinery: no. Cable: 23-47 m along the wall.
- **the wall at z -6 (behind the press) and z 48 (far end of the dance floor)** (CHOSEN): CHOSEN for 4 UP-HK1915 (2 per side): the two ends of the room. Beam mode 4 degrees. Lens 0.49 m. Crowd: 5.25 m outside the dance zone; z 48 is its far edge. Machinery: no (z -6 is past the machine line, which ends at z -0.5). Cable: about 22 m (z -6) and 53 m (z 48).
- **the wall at z 6 (the first column pair, beside the stage)** (rejected): REJECTED: z 6 lies under the crane's second girder (z 5.55-6.25): a beam straight up hits it (buildRig refuses it). Crowd: none. Machinery: no. Cable: about 12 m.
- **on the dance floor** (rejected): REJECTED: a head inside the crowd is knocked, kicked and looked into. Crowd: IN the crowd. Machinery: no. Cable: long.
- **the aisle between the dance zone and the wall** (rejected): REJECTED: overflow floor; the wall line is 3 m further and safer. Crowd: 2.65 m from the dance zone: crowd overflow, people stand and sit here. Machinery: no. Cable: long.
- **the tops of the 3 m low walls (left row z 12.5-42.5; the right row is a GUESS)** (rejected): REJECTED for now: mounting face 3.0 m, above the 0.6 m rule; masonry not surveyed; the right row is a guess. A survey could make it the first "other reachable place" (OWED). Crowd: out of reach. Machinery: no. Cable: up a ladder, 40 m.
- **the floor by the entry door (z 54.5, 6 m wide)** (rejected): REJECTED: an escape route; nothing stands in it. Crowd: the way in and out. Machinery: no. Cable: 47 m.

**What the chosen places reach.** Aimed up they light the column face and the space frame (its underside
11.0 m): the cone's radius at the frame is 0.16 m for a B380F (0.9 deg half angle), 1.38 m for a 250BSW in
spot mode (7.5 deg) and 0.37 m for an HK1915 (2 deg). Leaned across, to the opposite wall, a ground beam
crosses the dance zone at 2.5 m or less (hand calculation, lens 0.7 m: from a column base, 18 deg above the horizontal or less), so no
look leans further than 22 deg from vertical, and only away from the floor's centre (`in_deg` negative)
or a few degrees in. The old key-the-DJ-from-the-side rule of `bsw250-booms` (a beam from a column base to
the DJ at 1.6 m) rakes the floor at 0.7-1.6 m and is NOT used; a test builds it and watches the guard fail.

**The versions.**

| | Basic — `minimal-ground` | Full — `full-ground` |
|---|---|---|
| on the air truss (the cut, as Minimal: 12 m, 15 deg, 3 bridled hoists) | 7 COB200 curtain, 6 PL5403 X, 4 PL5403 on the bridge — statics only | the same |
| on the floor, moving | 7 UP-B380F behind the press, 6 UP-B380F at the column bases (z 12, 24, 36), 6 UP-250BSW (z 18, 30, 42), 4 UP-HK1915 (z -6, 48) = 23 | the same 23 |
| statics on the floor | 8 PL5403 up the column faces, 3 at the press's foot (as Minimal; the 6 pillars are dropped: the column beams stand there) | the same |
| lasers | 2 UP-LA40WF fixed on the cut's top chord, into the roof | the same |
| effects, all on the floor | 2 hazers | 6 hazers, 6 CO2 jets and 4 cold-spark machines in the pit, 4 smoke machines by the nave columns |
| rental lines | B380F 13/18, 250BSW 6/12, HK1915 4/14, PL5403 21/50, COB200 7/8, LA40WF 2/2 | the same + Q108S 6/6, YH600F 4/4, YZ31P 4/4 (hazers: other supplier) |
| load on the cut | 280 kg static (ESTIMATE, lasers included), picks 65 / 134 / 80 kg | the same |

**Assumptions to say out loud.** (1) "Once" = one kit of each mover type, at the counts the Minimal
family already uses for beams (13 UP-B380F, the number of `minimal-cut-movers`, the pre-cut Minimal and
both X and halo variants) and, for the two types Minimal never carried, the number of SAFE places found
(6 and 4), each far under the stock (18, 12, 14). (2) The two lasers stand on the cut's top chord, not on
the floor: a laser on the floor cannot keep its beams 3 m above the crowd, and the rig code refuses any
laser under 3 m. That is a fixed device on the truss, which the owner's sentence ("nothing moving on the
air truss") does not name either way. If the owner wants them at the same time off the truss, they need a
purpose-built stand of 3 m or more; none is modelled. (3) Full is built on the cut like Basic (the rule
says "the same"); Full's old extras (blinders, strobes, 50 PARs) are not added: the owner asked for the
same plus effects. (4) The effects' distances to the crowd, CO2 and cold-spark exposure, the smoke's
detector cover are UNVALIDATED: to be settled with the effects operator and the venue. Butterfly effects:
no type in the library.

**The guard (`scripts/rigbuild/ground-movers.test.js`).** A rig file opts in with
`policy.movingFixtures.ground_only: true` (a version in the versions file carries `policy`; `versionRig`
copies it, only when present). The test runs over EVERY `moxir-2026-10-17-*.json` in `scripts/place/rigs`,
so a future version is held to it the day it opts in, and any version whose id names "ground" that
forgets the flag fails. It checks: no mover's mounting face above 0.6 m (floor, or a plinth that low; the
deck of the riser is 1.2 m and fails; everything on a truss, a bridge, a tower or a halo fails, and an
unknown mount counts as high); no cone in the dance zone under 2.5 m in any look or at rest; every laser
lens at 3 m or more, rising, its cone never under 3 m over any floor a person can stand on. The failure
message names the group, the fixture, the mount and the rule, and says how to opt out. Two tests build a
violation (a B380F hung on the cut; a 250BSW keyed across the floor) and watch the message. The rest: counts
against the rental stock, every fixture inside the nave and under its roof, none inside the machinery
boxes or the riser (0.5 m clear in plan for the floor movers), the effects on the floor.

**The lasers.** UP-LA40WF is a 40 W Class 4 laser. Using one where people stand needs a certified laser
safety officer's approval of the positions and the show; the applicable standard and the national rule
were NOT read in this session. OWNER SIGN-OFF, owed. The placement only keeps every beam above 3 m in
every look (a test). Nothing here claims compliance.

**Loading (not done here; the owner's install is loaded by the main session).**

```bash
HALL=/mnt/data/footage/place-moxir-hall-v4-0929-crane-dj/hall.json
node scripts/rigbuild/versions.mjs --report $REPORT --hall $HALL --only minimal-ground,full-ground
for V in minimal-ground full-ground; do
  node scripts/rigbuild/load-version.mjs --api $API --space moxir --from moxir-hall --version $V \
    --hall $HALL --token-file ~/.di/di.env --no-mark-from --report $REPORT      # --force to load over
done
# undo: delete only the project moxir-hall-<version> (nothing else is written)
```

**Owed.** No cue list / show file for the two (the set's looks play, the X candidates' `shows/` files
were not made); nothing seen on a screen or in the hall; a survey of the low-wall tops and the machinery
floor; HK615, MH100S, MH8060S, BY06 not typed; the laser sign-off and the effects operator's distances;
the crew's cable plan and cable covers along the nave wall; the far-crane and girder-underside difference
between the committed and the built hall (`spec.hall` still points at the 09-28 layering).

### 15.13 The bridle limit is checked on every built pick (`scripts/rigbuild/bridle-limit.test.js`, 2026-10-01)

Found by the PONYO audit (2026-10-01), checked here with `pickGeometry`: `bridle.max_included_deg` (120°, Donovan,
*Entertainment Rigging* 2002) was used ONCE, in `versions.mjs craneCut`, to derive the trim from the girder height of the hall
in use then — the 09-28 guess, 8.15 m, which the versions file and the rig files still point at. The high pick (u 5.25 m,
apex 7.56 m) sits at 119.1° there (legs 0.99 × the load). Against the measured 09-29 hall (girder underside 7.95 m) the clamps
are 0.24 m above that apex: **144.4°, legs about 1.63 × the load** (geometry only; no hardware rating, no sign-off). The two other
picks stay at 26–47°. Same for `minimal`, `minimal-cut-movers`, `minimal-ground` and `full-ground`.

The test builds every bridled rig against (1) the hall it points at — must be within the limit — and (2) the measured hall —
the violations must equal the recorded list, so a stale list fails in either direction — and (3) proves it can fail (a hall 0.2 m
lower). It does not fix the rigs. **Owed to the owner, a human's work:** tape the girder underside on site, repoint `hall` in the
versions file to the measured hall, re-derive the trims and bridles (`versions.mjs`), re-check the crane-clash rule for the lasers,
then empty the recorded list. Repointing without re-deriving now fails (1).

### 15.13 One baked wash per look (`rig.mjs --wash-per-look`, 2026-09-30)

**The defect (READ, the room-light audit §5).** The baked wash is ONE mesh, `rig-wash`, baked by
`rig.mjs --wash-only --look <id>` for one look — on the owner's install `gs-white-cathedral`. The room fades
that mesh's opacity with the look's PAR level (`washLevelOf`, `withWashLevel`) and can change nothing else:
`gs-red-room` lit its lamps red over a white column wash, and every scene whose PARs aim elsewhere kept the
cathedral's columns. The ground versions carry 14 and 16 looks.

**The fix: one mesh per look, the room picks.** `rig.mjs --wash-per-look` builds every look of the rig file
the way `--wash-only --look <id>` builds one (`buildRig` with that look: its aims, colours and levels — a
lamp at level 0 bakes none) and writes each into its own entity `rig-wash:<lookId>` (type `model`), written
HIDDEN (`runtime.visible false`, opacity 0). Assets are content-addressed (the id is the sha256 of the
bytes, serverXR `assetHash.js`): a bake the project already holds is not uploaded again, two looks with
the same bytes share one asset, and stale `rig-wash:<look>` entities (a look gone or re-baked) go with
their assets. The single `rig-wash` is NOT touched: it stays the fallback. `--wash-only --look <id>`
writes the single `rig-wash` exactly as before. Plan and ops are pure in `scripts/place/wash-plan.mjs`.

**The room (`withLookWash`, `src/rigbuild/looks.js`; wired in `useRigLook.js` after `blendEntities`).**
While a look plays, its wash is shown at full — the bake already holds the look's level and colour, so no
level multiplies it — and over a cue's fade the previous look's wash goes out at `1 − t` as the new one
comes in at `t`, on the same ~30 Hz tick as the lamps; every other per-look wash and the single one are
hidden. Fallbacks, in order: a playing look with no wash of its own (or whose asset the document does not
hold) leaves the single `rig-wash` as `withWashLevel` drew it; a project with no per-look wash at all is
returned as the same array — nothing changes for any existing project. No look playing: the document as
written (the per-look washes hidden; the single one, where it exists, as before).

**The size guard.** `washBudget` sums the distinct per-look bytes plus the single wash's asset, logs one
line (`wash bytes: N looks, M distinct meshes, … of the 2048 KB cap`) and refuses above `WASH_BYTES_CAP`
(2 MB) before anything is uploaded, with the message saying what to cut.

**Keep lists.** `load-plot.mjs` (`isBakedKept`) and `rehang.mjs` (`KEEP`) keep `rig-wash:<look>` as they
keep `rig-wash`; `--pieces-only` takes them all down.

**Measured (the committed rig files and the versions' hall, `wash-plan.test.js`):** minimal-ground bakes
5 of 14 looks, 491 KB together (red-room, slow-sweep, gs-red-room, gs-white-cathedral 117,580 B each;
gs-columns-below 32,724 B); full-ground 6 of 16, 575 KB (+ gs-haze-wall 85,876 B). The other looks have
their PARs out and bake none, so they show no wash — right for a scene that asked for darkness.

**Not seen.** Written and tested on a machine with no browser and no GPU: the cross-fade of two
alpha-blended decals (coverage `1 − (1 − t·α₁)(1 − (1 − t)·α₂)`, continuous but not constant where
they overlap), the hidden entities' cost while a room loads six models, and every frame-rate consequence
are UNVERIFIED until someone looks. Owed: the writer run against a real project (the data step is the
owner's: `rig.mjs --wash-per-look` per ground version), and the decision whether the default look's wash
should show at rest (today: none, the writer hides them all).

## 16. Hosted playback — the show with no desk (`src/rigbuild/showClock.js`)

The light desk (`/light`) runs on a local install only, by design (LIGHTING_DESK.md). On a hosted
tier nothing would fire the cues, so a show could not play there. Hosted playback makes the
**document** the show's score and the **wall clock** its conductor: every viewer computes the cue
that is on from the time alone, so viewers anywhere see the same moment, with no desk, no account
and no server-side timer.

**The data** (both schema twins, written only when set, so older documents stay byte-identical):

| field | meaning |
|---|---|
| `mappingState.cues` | the cue list, unchanged: `{name, lightLook: 'rig-<look>', fade, hold}` in seconds |
| `mappingState.loop` | from the last cue back to cue 1 (the desk's own flag) |
| `mappingState.showEpoch` | NEW: the moment the list started, ms since 1970 UTC |

**The timing** is the desk's cue runner's (`serverXR/src/lighting/cuerun.js`), so a hosted room
and a desk-driven room agree: a cue fires its look and fades in over `fade` from the moment it
fires; `hold` counts from the same moment; then the next cue fires. One pass = the sum of the
holds, and at time `now` the show is at

    t = (now − showEpoch) mod passLength

(a true modulo, so a clock set before the epoch lands on the same grid). A cue with `hold 0`
"waits for GO" on the desk; nobody presses GO on a hosted page, so the timeline ENDS there and
that look stays up. Without `loop` the last cue holds for good. `showStateAt` also returns the
look the fade comes FROM (the previous cue; at the wrap, the last cue), and the room draws the
fade through the same code as a desk fade (`clockFadeOf` gives the desk's fade shape).

**The clock** each viewer uses is the server's, not its own: `serverClock.js` measures the tab's
offset once with Cristian's method (F. Cristian, *Probabilistic clock synchronization*,
Distributed Computing 3(3), 1989) against `/serverXR/api/health`'s `timestamp` — four round trips,
keep the one with the shortest round trip (NTP's clock-filter idea): `offset = T + rtt/2 − t1`,
error ≤ rtt/2. A phone whose clock is 7 s off shows the same cue as a laptop that is right
(`showClock.test.js`). If the server does not answer, the local clock is used; nothing throws.
Two viewers on the same server therefore agree to within the sum of their two error bounds
(half a round trip each, typically tens of ms over the internet), plus a frame.

**Precedence** — who drives the room, highest first (`showDriver`):

1. **explicit** — a page's own GO (the cards page with no desk: a per-tab preview);
2. **desk** — a light desk answers here (a local install). The desk is the driver, even when it
   is dark or stopped: the clock never runs beside a desk, so the room never shows two shows;
3. **clock** — no desk, and the document carries a show (cues with rig looks AND a
   `showEpoch`);
4. **document** — none of those: the room as saved.

While the desk probe has not answered, the room waits (`pending`) instead of starting the clock
and snapping to the desk a moment later. On a local install with the desk running, set the
epoch or not — the desk drives; on the dev and prod tiers, the clock drives.

**The room** (`useRigLookEntities` → `RoomLookFollower` in `PublicProjectViewer`): re-computed
only at each cue's boundary (one timeout, no per-frame loop); a fade redraws at ~30 Hz for its
length and stops. The real-light count never changes mid-show (the ≤ 8 real SpotLights stay
the same eight; strobes and blinders are flashes, §15.6). Visitors walk and look while it keeps
time — navigation and the clock are independent.

**The show chip** — the one piece of chrome, top-left under the version row: a red dot, SHOW,
"3 / 5 · Red room · next in 10 s · loop". Tapped, it lists the looks of the loop with their holds
and says that everyone watching sees the same moment. Shown only while the clock drives (not on
a local install with a desk, not in a thumbnail or an embed). 44 px tall.

**Starting a show on a tier** — as an op, never a bare document write (the op log is what
viewers replay): `node scripts/rigbuild/show-clock.mjs --api https://dev.diiii.xyz/serverXR
--project <id> --epoch now` (`--check` reads where it is, `--off` clears it; production is
refused without `--allow-production`). Program the cue list first (`show-loop.mjs` or the cards
page).

**Tests:** `src/rigbuild/showClock.test.js` (timing math, the loop wrap, before the epoch, hold 0,
Cristian's offset, two skewed viewers agreeing), `src/rigbuild/useRigLook.clock.test.jsx`
(precedence through the real hook, the cue moving on by itself, the chip), schema round-trips
in `serverXR/src/schemaSync.test.js` and `src/map/mappingState.test.js`,
`scripts/rigbuild/show-clock.test.js`. Guards seen red: precedence swapped (desk below clock) and
the loop disabled.

**Limits, stated:** the clock is as good as the server's own time (the Mac, NTP-synced by macOS);
a viewer whose tab is in the background is throttled by the browser and catches up on return
(it recomputes from the clock, it never drifts); the desk's strobes' DMX pulse is not simulated
beyond the room's flash.

### Publishing an update to dev — one command

Work happens on the local install; the team sees it on dev. One command carries an update:

    npm run space:publish -- --space moxir [--dry-run] [--no-clock]

It runs, in order and stopping at the first failure (`scripts/space-publish.mjs`):
`tier-sync --changed` for that space (pushes only what differs, refuses a project edited on
both tiers, never widens a private project), `show-clock --epoch now` on the published project
(a pushed document replaces the op log that held the clock), then a visitor check with no
token — the published project answers 200, every private project 404 and is absent from the
list. Any leak exits 1.

Two things made `--changed` refuse every MOXIR project after its first push (2026-09-29),
both fixed in `tier-sync.mjs`: the show clock (`mappingState.showEpoch`) now counts as
volatile, like `showState.clockEpoch`; and after a write the baseline records the shape the
destination KEPT (read back), not the shape sent — a newer server fills defaults in on write.
A project whose baseline predates the fix needs one `tier-sync --space <id> --force` to
record a true baseline; `--changed` works from then on.

## 17. Visitors: the tools read only (and a hosted tier with no desk)

Owner, 2026-09-28: share MOXIR with colleagues online — the room, the show, and the tools read
only; editing stays with signed-in members.

**Who gets what** — `src/rigbuild/rigToolAccess.js` `rigToolAccess`, used by `RigToolRoute` in
`src/RootApp.jsx` for `/{space}/plot|cards|equipment|build/{project}`:

| who | public space | private space |
|---|---|---|
| a member in scope (sessionScope.js, the server's own rule), an admin, any local install | edit (through the gate, as before) | edit |
| anyone else — signed out, a guest, an account not in scope | **read only**; build → the crew view | the gate, as before |

The patch sheet and the crew link stay ungated. The server refuses a visitor's ops whatever the
page does; the page only decides what it offers.

**Read only** means: the op path is `NO_WRITE` (nothing reaches the document, the undo keys do
nothing), auto-patch is never started, no desk is asked anything, and the writing controls are
not drawn — the plot's rail is select + measure, the inspector is a disabled fieldset, the cards
have no deal/take back/hold/remove/loop, the equipment page uses `useEquipment({ readOnly })` and
the inventory's own read-only mode. One line says so (`ViewOnlyLine.jsx`, `VIEW_ONLY_SENTENCE`)
with a sign-in link. GO on the cards still plays the cue list — in that tab only.

**No desk** (every hosted tier): every desk-dependent line is one sentence, `NO_DESK_SENTENCE` —
"The light desk runs on a local di.iiii; this page shows the plan without it." — in the plot's
title block, view A's totals, the cards' patch and cue parts; "patch this group" is disabled with
the sentence; the printed sheet says `desk: a local di.iiii only`. The makers' kept manuals and
photos (§13.8) are never requested on a hosted tier (`useLocalInstall`): the card links the
maker's page with "The maker's file is kept on the studio's own machine; here is the maker's page."

Guards: `src/RootApp.rigTools.test.jsx` (route choice), `src/rigbuild/readOnlySurfaces.test.jsx`
(no op, no desk call from a visitor's GO/Delete/undo), `src/rigbuild/rigToolAccess.test.js` (the
rule; no bare no-desk fragment), `src/rigbuild/keptMediaHosted.test.jsx` (no kept-file request) —
each seen red without its fix. Not verified in a browser in this change (owed with the dev look).

## 18. The visualiser — the desk and the room side by side, the room drawn from DMX (2026-09-29)

Owner, 2026-09-29: *"our light and scene sync where i can with split screen or with 2 window see
the virutal version and test the lights"*. Operate the desk (`/light`: faders, fixtures, looks,
cues, FX — or a console over Art-Net/sACN into it) and watch the MOXIR room answer.

### 18.1 Channel lists to test with — ASSUMED, separate, said (`src/rigbuild/assumedProfiles.js`)

UPlight publishes no chart for any MOXIR code (§13.8), so a DMX value meant nothing to a lamp. Each
type now carries an extra mode, `<n>ch-assumed`, built from the published chart of the CLOSEST
DOCUMENTED EQUIVALENT (the stand-in manuals of §13.8), or an Open Fixture Library profile of the same
class where no stand-in chart exists. Never in place of the real mode: the real `16ch` keeps
`channels: null` (owed); `defaultMode` is still the maker's; `modesOwed` still means no real mode;
`assumedMode` names the test mode. When the rental house's chart arrives: fill the real mode, run
`scripts/rigbuild/assume-modes.mjs --back`, delete the entry. GDTF never carries an assumed mode and MVR
names the maker's mode of the same footprint (a crew's console must never take a stand-in's chart).

| type | assumed mode | source (the chart used) | what was filled in, and how |
|---|---|---|---|
| UP-B380F | 16ch-assumed | UPlus Lighting "380 IP BEAM" manual, PDF p.6–8 (sha256 31712c3a…) | wheel colours numbered, not named → Clay Paky Sharpy wheel order (OFL, MIT); strobe 51–240 = 1–25 Hz (spec p.4); lamp channel ignored |
| UP-250BSW | 17ch-assumed | Aolait "250W LED 3IN1 BSW" manual, PDF p.13–17 (the kept copy, sha256 251282d3…) | the equivalent's 17ch, NOT UP-250BSW's 24/30ch; wheel colours Sharpy order; strobe rates 1–20 Hz ASSUMED; zoom 10→30° direction ASSUMED |
| UP-HK1915 | 21ch-assumed | Aolait AL1019WR 19×15 W bee-eye manual, PDF p.8 (kept, sha256 7a0906f7…) | footprint matches the real 21ch, the ORDER is the equivalent's; strobe 1–20 Hz; CTO direction; zoom 4→60° direction ASSUMED |
| UP-PL5403 | 8ch-assumed, 4ch-assumed | UPlus Lighting "IP PAR-54X3" manual, PDF p.6 (sha256 66619bec…) | strobe rates 1–20 Hz ASSUMED; built-in programs not drawn |
| EXT-STROBE | 4ch-assumed | Martin Atomic 3000 "4-channel" (OFL) — the Atomic 3000 LED's compatible mode | rate 6–255 = 0.5–25 Hz as OFL gives it; effects drawn as plain strobe |
| EXT-BLINDER | 3ch-assumed, 1ch-assumed | Chauvet STRIKE 4 DMX chart p.1 | random strobe macros drawn at 8 Hz |
| EXT-HAZER | 2ch-assumed | Antari HZ-1000 manual, PDF p.7 | haze not drawn |
| UP-YZ31P | 1ch-assumed | Antari Z-1500 III manual p.8 (kept) | fog not drawn |
| UP-Q108S | 3ch-assumed | MagicFX PSYCO2JET "Raw" (OFL) — the CO2jet II manual has no DMX table | CO₂ not drawn |
| UP-LA40WF | 11ch-assumed | Laserworld CS-1000RGB "11-channel" (OFL) | laser not drawn; IEC 60825-1 sign-off separate |

Every mode carries `assumed: "ASSUMED from <equivalent> manual p.N — verify on the rental unit"`,
printed on the patch sheet (flag `channel list ASSUMED — verify on the rental unit` + the row note), in
the plot's mode list (the name ends `-assumed`), on the desk (the profile is `UP-B380F 16ch-assumed`,
each channel named from the chart) and on the visualiser (a line naming every list in use). The desk
patches a listed channel at its own `default` (a B380F shutter where 0 = CLOSED rests open at 255;
pan/tilt at 128 = home) — `rigpatch.js`.

**TESTED on the rental units (2026-10-01).** The same UPlight rental gear ran live at the Sevan
festival (Dilijan camp) on the studio's own Art-Net desk; the owner confirmed the units. Three real
modes now carry that desk's channel maps (`TESTED_CHANNEL_LISTS` in `fixtureTypes.js`, manifest
source `SEVAN`, basis `TESTED`, no url because the source is the unit): **UP-B380F 16ch** (pan, tilt,
pan fine, tilt fine, speed, frost, strobe 255 open/0–3 dark, dimmer, colour, gobo, prism 1, prism 1
rot, prism 2, prism 2 rot, focus, reset 0; the order differs from the assumed UPlus stand-in),
**UP-PL5403 8ch** (dimmer, R, G, B, W, strobe, two channels unused there), **UP-LA40WF 32ch** (the
mode it ran in; the maker publishes none; per-colour levels run 0 = brightest, so they are plain
channels; still held dark by the laser gate until the IEC 60825-1 sign-off). A meaning nobody wrote
down stays a plain channel. `resolveMode` now runs these real lists; the assumed modes stay after
them. Still owed from the rental house: UP-250BSW, UP-HK1915, UP-COB200 and the effects' charts.

### 18.2 What a lamp's DMX means (`src/rigbuild/dmxDecode.js`)

Through the running mode's channel list: dimmer (16-bit with its fine), colour (RGB(W) emitters, else
the wheel's slot — a half position mixes the two, a spinning wheel is drawn open and noted — and CTO
toward 3200 K), shutter/strobe (open / closed = dark / strobe at its Hz) or a strobe fixture's rate
channel, pan/tilt as degrees FROM HOME over the type's published range (DMX centre = home, e.g.
540°/270° → ±270°/±135°; 16-bit = coarse·256 + fine over 65535), zoom over the type's zoom range.
Gobo and prism are noted, not drawn yet. `encodeDmx` is the inverse (tests hold the round trip).

### 18.3 The room drawn from it (`src/rigbuild/dmxPose.js`)

The mode is the one the DESK runs (the desk fixture's profile name, rigpatch's rule), joined by the
lamp's fixture index. A head: the mount is fixed (from the document's lens and aim), the beam is the
fixture frame's (fixture-lib.mjs: `(sin t sin p, cos t, sin t cos p)`, hung = Rx(π)·Ry(π) with the
default face — the rig records no base yaw), the lens moves on the tilt arc, the body turns (the same
plotData the bodies read). Light: colour at full, the authored reach × level, zoom → angle, a beam-only
cone's haze × level, a strobing shutter → `beam.strobeHz` (SpotLightObject pulses light and cone on the
wall clock). Strobe and blinder TYPES stay flashes (RigFlashes) at the desk's rate or steady. Each drawn
lamp carries a view-only `rigDmx` note (never written). The Studio's `liveLight` leaves a lamp with
`rigDmx` alone — it reads only RGB emitters and called a wheel white (known-fixes).

### 18.4 Precedence (decision)

**While the desk is live and a lamp has a patched profile with a channel list, DMX wins** — attribute by
attribute, for what the list controls; what it does not (a PAR's aim, set by hand on its clamp) keeps the
look's pose. A lamp with no list, or not on the desk, is drawn as before. Overall: a page's own GO
(`explicit`) > DMX > the desk's look (by rule) > the show's clock (only where no desk answers, §16) > the
document. So a look must reach the room as DMX: `deskLookValues.js` writes each designed look as values
through each fixture's list (a lamp the look does not name is at 0), and `show-loop.mjs` puts those on the
desk — the looping show plays through DMX and the room shows exactly what the desk sends.

### 18.5 The stream (`serverXR/src/lighting/dmxstream.js`, LIGHTING_DESK.md "The pushed frame")

`GET /light/api/dmx/stream`: Server-Sent Events from the desk's own loop — a key frame, then only the
runs of slots that changed, at the desk's rate (40–44 Hz; a fader move is pushed at once, not at the next
tick), meta (master, blackout, looks, cues) only when it changes. The room's mirror listens where the
browser has EventSource, publishes once per screen frame, reconnects by itself, and falls back to the
10 Hz poll when a stream never opens. Through the install's own TLS and through the Caddy front door:
measured 159 frames in 4 s (≈40/s) from the LAN address, not buffered.

### 18.6 The page (`/{space}/visualise/{project}`, `VisualiserSurface.jsx`)

Both sides are the REAL pages, framed (same origin): the desk (`/light/?space&project&from=visualise`)
and the room (`/{space}/p/{project}?embed=1&probe=1`). A draggable divider (keyboard: arrows), swap,
desk only / room only, and "↗" pops either side into its own window — it stays in sync because each side
reads the desk, not the page. The two-window case needs nothing more: `/light` in one window, `/{space}`
in another, on this machine or another on the network (through the front door). The rig row's last item
is "visualiser"; the desk's top bar has "Visualiser" (hidden when the desk is itself framed). To test the
lights use the desk's own pages: Control (select a fixture — Dimmer, Color, Position, Beam; Looks; FX
strobe; the Cues strip GO/back/stop/loop), Fader (every channel by its chart name), Touch on a phone.

### 18.7 Measured (2026-09-29, the owner's install 0.4.16-rigbuilder.9, MOXIR Minimal, RTX 3080 via PRIME, ANGLE/Vulkan, 1600×900 DPR 1)

`scripts/rigbuild/vis-see.mjs`: a pan channel moved 60 times, alternating, on one UP-B380F; t1 = the first
DRAWN frame with the lamp's decoded pan at the target (`visProbe.js`, in useFrame). The head is picked by
`vis-head.mjs` (a B380F first); a rig with no moving head (the cut, simple) runs `--trials 0 --cues` only,
and asking it for trials, frames or Art-Net is refused with that reason.

| path | n | p50 | p95 | max |
|---|---|---|---|---|
| desk API (`POST /light/api/raw`, what a fader does) → drawn lamp, split page | 60 | 33.8 ms | 34.8 ms | 35.0 ms |
| Art-Net ArtDmx on loopback → desk input → drawn lamp, split page | 60 | 37.8 ms | 39.4 ms | 56 ms |
| desk page in one window → `/moxir` in another (two windows) | 20 | 30.8 ms | 36.3 ms | 36.7 ms |

Before, the poll alone added up to 100 ms. The room drew 60–61 fps throughout (the 60 Hz cap) with the
stream at 40 frames/s. Strobe: the desk at 13.57 Hz → 13.5 cone pulses/s counted over 2 s of drawn frames.
Limits: one machine (sender, desk and browser on aylmo, loopback/LAN address — no wifi between); the
NVIDIA GPU, not the owner's Flatpak Chromium on the Intel iGPU (14–19 fps in this room, §15/preview note),
where a frame is 50–70 ms and latency grows by about that. Frames: `~/Downloads/moxir-visualiser/`.

### 18.8 Owed

The real channel lists from the rental house / UPlight (then `assume-modes.mjs --back`); gobo, prism,
frost and haze drawn; a base yaw per lamp (pan 0's direction is the default face); a wheel's spin drawn;
the stream on a real console and a real wifi second machine (ponyo, the owner's run); the iGPU numbers.

## 19. The show patch — planned, not "next free" (MOXIR Minimal, 2026-09-29)

Owner, 2026-09-29: the rig "maximum close" to reality — *real fixture channel lists and a real,
final patch*, so the crew sets addresses from our sheet and a console on the night matches the
simulation. Auto-patch (§4) finds the next free address, right while a rig is built and wrong
for the night: MOXIR Minimal sat scattered over U1/U2/U3/U6 (U1.445…, U2.313…, U6.001…) because
four versions shared one desk. Code: `src/rigbuild/patchPlan.js` (pure), `scripts/rigbuild/
patch-plan.mjs`, `patch.mjs --exact | --unpatch`, `patch-sheet.mjs`; data: `scripts/place/rigs/
moxir-2026-10-17-minimal.patch.json`.

### 19.1 The plan is data; the document is the truth; the desk follows

An LD's patch plan (`*.patch.json`) says per universe which blocks it holds — a block SELECTS lamps
from the document (`select`: `type`, `position` name(s), and geometry `y` / `x` / `xAbs` as "<n" / ">n";
or `group`, entity ids `<group>-NN`), optionally one side of the hall (`sides`: `x < 0` …),
its first address, its first fixture number and the order a crew walks it — plus the mode per
type and the node. `patch-plan.mjs` writes it into the document as ONE batch of ops (index,
universe, address, mode, unit, position, hung; circuits re-proposed position by position,
§2.5) — or refuses the whole plan (overlap, past 512, a lamp in no block, a fixture number
twice), writing nothing. `patch.mjs --exact` then takes the room's fixtures off the desk and puts
them back at exactly the document's addresses and numbers; a clash is refused and flagged, never
moved to "next free", and the run exits 1. The desk is never hand-edited. `patch.mjs --unpatch`
takes another version's fixtures off the desk (the desk runs one patch per space) and leaves its
document alone. `patch-sheet.mjs` prints the crew's sheet from the document and exits 1 if the
document has drifted from its plan or from the desk. MOXIR's plan names no truss: its air universe
takes "every UP-B380F / strobe / PAR with its lens above 3 m", the wall universes "below 3 m, |x| > 8 m,
this side", so a re-hang of the crane rig (the owner's D2 art objects, 2026-09-29) re-runs to a correct
patch with the document's own position names. Positions and hung come from the document unless a block
names them (only the column rows add the side, HL/HR). One command re-runs everything after a re-hang:
`sh ~/di-backups/preview-rig-builder-2026-09-28/moxir-minimal.sh showpatch` (backup, plan, other versions
off the desk, `--exact`, show loop, MVR + validation, sheet; `PDF=1` for the PDF) — proven end to end
2026-09-29 19:08.

### 19.2 MOXIR Minimal — the patch (the columns of a Lightwright hookup and instrument schedule, as §2.5)

| port | universe | Art-Net (net.sub.uni) | run | blocks (fixture # · first address) | used / free |
|---|---|---|---|---|---|
| A | U1 | 0.0.0 | crane line, up the hoist, along the 8 m truss house left → right | 7 × UP-B380F 16ch #101–107 @001 · 2 strobes #111–112 @201 · 4 × UP-PL5403 8ch (bridge) #121–124 @301 | 152 / 360 |
| B | U2 | 0.0.1 | house-left wall (NE, x < 0), DJ end outwards | 3 × UP-B380F #201–203 @001 · 4 × UP-PL5403 #211–214 @101 | 80 / 432 |
| C | U3 | 0.0.2 | house-right wall (SW, x > 0) | 3 × UP-B380F #301–303 @001 · 4 × UP-PL5403 #311–314 @101 | 80 / 432 |
| D | U4 | 0.0.3 | booth: press → pit → behind | 3 × UP-PL5403 #401–403 @001 · 4 strobes #411–414 @101 · 2 hazers #421–422 @201 | 44 / 468 |

Rules, and why: one universe per data run, so no DMX cable crosses the dance floor and each run is
one node port; blocks start on 001/101/201/301; the fixture number's hundreds are its universe; a
16-bit head never straddles a universe; at least half of every universe spare, so a lamp added on
the night takes the next address of its own block. House left/right are the audience's, facing
the DJ (−z): house left = −x (NE wall). U1 = Art-Net port-address 0 = sACN universe 1.

Modes: the maker's own where the maker lists one — **UP-B380F 16ch and UP-PL5403 8ch are both
single-mode units** (uplight.com.cn, below); strobes 4ch and hazers 2ch are planning types (no
supplier yet). Where the maker's channel ORDER is not published the desk runs the ASSUMED list of
the same footprint (§18.1) and the crew sets the maker's mode on the unit; the sheet says both
("set mode" / "desk list"). The PARs were first planned at 4ch (colour and level are all the looks
use); the maker's page then showed the PAR has one mode, 8ch — the blocks had been spaced 8 apart
for exactly that, so nothing moved.

Outputs (`patch-sheet.mjs`, `export-mvr.mjs`): `patch-sheet.html|pdf` (node ports, patch by
universe with set-mode / desk-list / set-on-unit, instrument schedule by position, power by
circuit, the channel lists in use with their sources), `patch.csv`, `power.csv`, `node-plan.csv`,
`moxir-minimal.mvr` (36 fixtures, 36 addressed, XSD-valid). The in-app sheet
(`/{space}/patch/{project}`) reads the same document.

The other three versions (As ordered, Middle, Full) were taken off the moxir desk; their
documents keep their own planned addresses, which now overlap Minimal's on that desk (flagged
if they are patched again). This also retires the old conflict of 4 As-ordered B380F on U1.001–064
with the studio's own fixtures: MOXIR has had its own show file per space since show portability,
and the night's desk holds Minimal alone.

### 19.3 The real channel lists — searched again, 2026-09-29

Three research lanes (the UPlight heads, the bee-eye/BSW, the effects), each source opened and
looked at; downloads kept outside the repository (the makers' copyright — links only). New: the
maker has a Chinese site, **uplight.com.cn** (广州灯王舞台设备有限公司, brand UPLIGHT, same contact as
pro-uplight.com), 451 product pages, each with a model field — it gives each type's MODE LIST but,
like everything else UPlight publishes, no channel order. Checked also: both sites' download pages
(CE/RoHS certificates only), all UPlight made-in-china listings for the four heads and ~135
description images, the Open Fixture Library and QLC+ trees (no UPlight), GDTF Share (login
needed — not searched), Yerevan rental sites. The session's web-search budget ran out part-way;
the OEM photo-match hunt for the B380F body is unfinished (owed).

| type | grade | what is now known (source) |
|---|---|---|
| UP-B380F | STILL ASSUMED | one mode, 16ch; DMX + RDM; 8/16-bit pan/tilt 540°/270°; one fixed gobo wheel 13 + open (the English listings add a rotating wheel — the maker contradicts itself); strobe 1–12 Hz (CN) vs 1–25 (EN table) vs 0.5–14 (EN text); rated 450 W (CN) vs 500 W (EN); waterproof power and 3-pin DMX connectors. uplight.com.cn/pd45714311.html. The UPlus 380 IP BEAM stand-in is a different body |
| UP-PL5403 | STILL ASSUMED (mode count CONFIRMED) | one mode, 8ch; rated 162 W (supply 200 W, PFC > 0.99); IP65; 290 × 230 × 260 mm 5.9 kg (EN page: 310 × 310 × 330, 8 kg); DMX / master-slave / sound. uplight.com.cn/pd48298011.html. The UPlus IP PAR-54X3 stand-in is a different body |
| UP-HK1915 | EQUIVALENT | the Aolait AL1019WR manual (the current stand-in) is the same OEM body: identical 21/23/35/78/92/97/99 mode set (UPlight's own listings), named "HAWKEYE II", matching drawings (19 hex lenses, 4-key LCD, powerCON in/out). Differs: tilt 270° vs 230°, 450 vs 350 W |
| UP-250BSW | STILL ASSUMED | 24/30ch, DMX + RDM, powerCON, 3-pin (uplight.com.cn/pd152457438.html); no chart anywhere. The Aolait 250 W BSW stand-in is a DIFFERENT fixture (no LED ring, 17/20ch) — test use only |
| UP-LA40WF | identity CONFIRMED, DMX STILL ASSUMED | UPlight's own page names it (uplight.com.cn/pd48855201.html): R 10 W 638 nm, G 15 W 520 nm, B 16 W 445 nm, ILDA + DMX512 + SD; no mode published |
| UP-Q108S | STILL ASSUMED | on neither maker site; UPlight's DMX CO₂ column machines are UP-QZ150Y/QZ250Y/QZ12L/QZ18L |
| UP-YZ31P | STILL ASSUMED | on neither maker site; UPlight's multi-angle smoke machines UP-F1500D…F3000DL are 2ch (IP20, not waterproof) |
| EXT-STROBE / BLINDER / HAZER | STILL ASSUMED | no supplier chosen; no Yerevan rental lists a model |

Recorded where the code reads it: `fixtures.json` (sources A-CN … LA-CN, the mode lists, notes on
every contradiction), `assumedProfiles.js` (`grade` + `gradeWhy` on every stand-in; printed on
the sheet). No type is CONFIRMED to its channel ORDER, so nothing switched to a maker's list; the
real modes keep `channels: null`. Also found on uplight.com.cn (inventory cards not yet updated,
owed): UP-SW3000B, UP-236, UP-JG400, UP-BY06, UP-9800, UP-B01, UP-PDU60A, UP-2303, UP-POWER12,
UP-1024 are UPlight's own codes.

### 19.4 Validated, and owed

Validated on the owner's install (local.thedi.studio, 0.4.16-rigbuilder.9 program, scripts from
this branch): plan → document (36 lamps, one batch) → desk `--exact` (36 of 36 at the planned
addresses, 0 flags) → `show-loop.mjs` (5 looks, DMX for 34 lamps) → `patch-sheet.mjs` exit 0 (the
document agrees with its plan and the desk) → MVR XSD-valid, 36 of 36 addressed. Two bugs found on
the way, each with a guard (known-fixes 2026-09-29): a colour-only mode could not be put out by a
look, and the MVR dropped the address of any lamp whose maker's mode is owed.
Seen in the split visualiser on the install (2026-09-29, RTX 3080 via PRIME/ANGLE-Vulkan, 60 fps,
`vis-see.mjs --cues`, frames `~/Downloads/moxir-patch/visualiser/`): all 5 cues fired through the new
patch; the room drew 34 lamps from the desk's DMX (the 2 hazers have nothing drawn); Red room reads red
on the line and the bridge, Strobe hit flashes the 2 line strobes (U1.201/205) and 4 pit strobes (U4).
Two things found while looking, neither the patch's: a desk FX "pulse" (120 BPM, depth 255) had been
switched on over every dimmer between 18:22 and 19:01, so the frames are dimmer than the looks; and
opening the As-ordered room in the Studio re-patched 32 of its lamps into the free slots of the moxir
desk (`useRigAutoPatch` patches whatever room is open). `patch-sheet.mjs` now fails on any other
project's fixture in the show's universes; the desk was cleared again. A rule that only the space's
chosen version patches onto its desk is owed.
Owed: every channel ORDER from the rental house (`~/Downloads/moxir-patch/questions-for-rental.md`);
the press PARs (#401–403) are on no look position, so every look leaves them dark (a looks issue,
not the patch); the node and cable lengths from the rental house (it lists splitters, no node);
the electrician's distribution; GDTF Share with the owner's login.

## 20. The room as a camera sees it — beams in haze, exposure, the dark (2026-09-29)

Owner: MOXIR "maximum close" to how the real night will look. Measured problem (dev visitor,
2026-09-29): mean luma ≈ 10–12 on a 1440×900 desktop, ≈ 8 on a 390×844 DPR 3 phone; the beams
thin grey lines, the haze barely there, the DJ table pale blue, the room a dim blue-grey.

### 20.1 The target — written before anything was changed

**References (links, sources and licences only; nothing copied into the repo).** Eight photographs
from Wikimedia Commons, downloaded for measurement only to `~/Downloads/moxir-realism/refs/`
(`sources.json` carries page URL, author, licence, date accessed 2026-09-29):

| photo | author | licence | what it shows |
|---|---|---|---|
| Berlin Atonal 2015 Lighting / Setting / Hall | Mitch Altman | CC BY-SA 2.0 | Kraftwerk Berlin, a disused power-station hall — the nearest real room to MOXIR: white beams in heavy haze over a black crowd |
| Tresor Nightclub Berlin DJ 5, DJ 21 | Angie Linder | CC BY-SA 2.0 | an industrial techno club, the DJ in red beam light and haze |
| Elektro-Party im Potsdamer Nuthe-Park (2025) | Brataffe | CC BY 4.0 | an open-air techno night, a black crowd under hazed light |
| Laser show disco (2) | Chmee2 | CC BY-SA 3.0 | beams and lasers in haze, a smaller room |
| Smoke and light beams | Daniel Robert Dinu (Unsplash) | CC0 | a fan of beams filling the frame — kept as the bright outlier, not as a target |

Video, links only: Claypaky's Sharpy page (the beam class the B380F is modelled on, haze demos);
Boiler Room sets from Tresor and from Nowadays (industrial rooms).

**Their numbers** (the same measure as the renders: BT.709 luma of the 8-bit sRGB values, rows
20–90 % of the height, `scripts/rigbuild/luma.mjs`; the photos by the same formula in numpy). The
seven club and hall photographs (the Unsplash fan left out): mean luma 18–60, median **21**; p10
0–12, median **3.5**; p99 86–249, median **142**; share below 16 ("black between the beams")
0.14–0.72, median **0.56**; share above 200 small (≤ 0.04). A photographer's exposure is in these
numbers — a camera set for the beams — which is also what a screen should imitate.

**The target, per cue, for both viewports:**

| | mean luma | p10 | p99 | black share (< 16) |
|---|---|---|---|---|
| Blackout + one beam | ≥ 6 — one beam in a black room is mostly black | ≤ 4 | ≥ 120 (the beam reads bright) | ≥ 0.75 |
| Slow sweep, Red room, White cathedral | 18–45 (the photos' spread around 21) | ≤ 8 | ≥ 120 | ≥ 0.35 |
| Strobe hit (brightest of the shots) | ≥ 18 | — | ≥ 200 | — |

and: **the phone reads no darker than the desktop** (its mean ≥ 0.9 × the desktop's, per cue);
**60 fps** on the RTX 3080 at 1440×900 and at 390×844 DPR 3; the room between beams has **no
blue-grey cast** (a hall at night with no work light is black: what light it has comes back off
what the rig lights).

**Physically grounded choices** (no "looks better" knobs):

- *Beam in the air* — single scattering in a homogeneous medium (Hillaire, "Towards Unified and
  Physically-Based Volumetric Lighting in Frostbite", SIGGRAPH 2015 Advances course; Wronski,
  "Volumetric Fog", SIGGRAPH 2014; Sun, Ramamoorthi, Narasimhan & Nayar, "A Practical Analytic
  Single Scattering Model for Real Time Rendering", SIGGRAPH 2005), phase function Henyey &
  Greenstein (ApJ 93, 1941), extinction Beer–Lambert. Brightness from the lamp's own candela —
  the same number that lights the surfaces — so one exposure governs both.
- *Haze density* — a scattering coefficient σs in 1/m. Koschmieder: visual range V = 3.912/σ
  (Narasimhan & Nayar, "Vision and the Atmosphere", IJCV 48(3), 2002, p. 236). Outdoor haze is
  ≈ 0.005 /m (their Fig. 9, 0.2 km path); a hazed hall is denser by design. **No published
  mg/m³ → σ figure for glycol/oil stage haze was found: σs is chosen, stated, and checked
  against the photographs' numbers above.** g = 0.7 (forward-peaked, the range 0.7–0.9 used in
  production volumetrics for droplets larger than the wavelength; not re-derived from a Mie table).
- *Exposure* — the rig's `photometry.sceneScale` (0.02) × `toneMappingExposure` is the camera.
  With Lagarde & de Rousiers' physical camera ("Moving Frostbite to PBR", SIGGRAPH 2014 course
  notes §5.1: exposure = 1 / (1.2 · 2^EV100), saturation-based ISO speed), 0.02 is **EV100 ≈ 5.4** —
  inside the range a photographer uses in a dark club (ISO 3200, f/2.8, 1/100 s ≈ EV100 4.6).
- *Tone mapping* — ACES (three.js's fit) or AgX (T. Sobotka; three.js `AgXToneMapping`); chosen
  by measuring the red cue, not by eye alone.

### 20.2 What changed (code — every room; data — MOXIR only)

| where | what | why |
|---|---|---|
| `src/objectComponents/beamAir.js`, `beamAirMaterial.js`, `SpotLightObject.jsx` | With `renderSettings.atmosphere` present, every visible beam is drawn as **single scattering in haze** (formula and limits in beamAir.js's header): per fragment, the view ray's chord through the beam (a closed truncated cone, the lens `beam.aperture` wide at the lamp) is integrated in 12 jittered samples of σs · HG(θ) · E(s) · T. E(s) = I·tan²θ/(a + s·tanθ)² — the beam's flux kept in a cone from a lens of radius a (→ three.js's own I/d² far off; finite at the lens). Output through the renderer's tone mapping and exposure, like a lit surface. The **core** mesh is depth-tested on its own cone, so a beam ends on the girder, the roof, the floor it meets. | the beam's brightness is the lamp's own candela, so beam and wall answer to one exposure — no opacity knob |
| same, the **glare** mesh | A veil around each beam from the CIE disability-glare formula (CIE 146:2002, Stiles–Holladay L_v = 10·E/θ², 1°–30°) integrated along the beam's core as a line: L_v = 10·π²/180 · L·w/θ°. Drawn on a hull 1.2 m + 0.12 m per metre of throw around the beam, faded before its edge. | a screen cannot show a light brighter than white; an eye (and a lens) sees the veil. Without it the beams read as neon tubes |
| `src/rigbuild/rigBounce.js`, `RigBodies.jsx` | A room whose show carries `components.rigBounce` gets the rig's **own return** as its ambient: E = Φ·ρ/(A·(1−ρ)) (integrating-sphere relation; Labsphere's sphere-multiplier guide), Φ = Σ I·2π(1−cos θ)·rgb of the lamps as drawn (per channel: the red room returns red), strobes' flashes left out. The room's fog takes the in-scattered colour E/π (a haze of transmittance T in a uniform field L adds L·(1−T) — three.js's fog mix). | "black between beams": what light the hall has comes back off what the rig lights, cue by cue |
| `src/project/viewport/RenderSettingsEffect.jsx`, both schemas | `toneMapping` 'AgX' and 'Neutral' accepted (three.js AgXToneMapping, NeutralToneMapping); `renderSettings.atmosphere { scattering, anisotropy }` and `beam.aperture` normalised in both copies, stored only when set. | measured below: AgX was tried and not chosen |
| `src/project/viewport/worldLights.js`, `StudioViewport.jsx` | **Bug fixed:** the arrival view read `intensity || 0.85` / `|| 1.15`, so a room that switched its daylight OFF got a white 0.85 ambient and a 1.15 directional back (MOXIR's directional is blue — the grey-blue hall, the pale-blue DJ table). An authored 0 is now dark, as walk mode already had it. | root cause of the blue-grey cast once the night was set to black |
| `scripts/rigbuild/realism.mjs` (DATA) | MOXIR: atmosphere σs 0.05 /m, g 0.7; ACES × 3.5; ambient and directional 0; background black; fog linear 0…1.6/σ (32 m); rig-show `rigBounce` measured from the hall model (82,640 m², ρ 0.163); `beam.aperture` from the fixture manifest (B380F lens 160 mm → 0.08; PAR window 210 mm → 0.105); the hall's skylights' daylight emission off (a night copy of the GLB). Saves its own undo first; `--undo <file>` is the way back. Refuses any host but a local install. | |
| `scripts/rigbuild/look-probe.mjs`, `luma.mjs`, `look-compare.mjs` | the measurement: per cue, the show pinned in the browser's copy, the desk refused (the clock drives, as for a visitor), GPU-checked, luma + fps, a side-by-side page | "too dark" is a number |

**The chosen values, and why.** Tried on a scratch copy of the space, cues 1–4 each time
(`~/Downloads/moxir-realism/iter*`): σs 0.02 → 0.05 → 0.08 → 0.10 → 0.15; ACES and AgX; exposure 1, 1.74, 3.5.
- *AgX rejected*: its toe lifts near-black values (−5 EV from mid-grey is not black in AgX) — the hall turned
  milky grey, black share 0.26–0.40 against the photographs' 0.56. ACES keeps the dark.
- *σs 0.05 /m* (Koschmieder visual range ≈ 78 m): at 0.10–0.15 the fog (the haze's extinction, 1.6/σ =
  11–16 m) turns the whole frame a flat grey and the far beams go out; at 0.02 the beams are hard rods
  with no air around them.
- *Exposure 3.5* = the rig's sceneScale 0.02 × 3.5 = 0.07 → **EV100 ≈ 3.6** (Lagarde & de Rousiers'
  1/(1.2·2^EV100)) — inside the range club photographers shoot at (ISO 3200–6400, f/1.8–2.8, 1/100–1/125:
  EV100 2.7–4.6). 1 (EV100 5.4) left even the white cathedral at mean 6.

### 20.3 Measured — before (dev.diiii.xyz, 15:10Z) and after (this branch + realism.mjs on a copy of the local space)

Luma mean / p10 / p99 / black share, then fps; RTX 3080, headed Chromium on ANGLE/Vulkan, renderer string
checked (NVIDIA). Frames: `~/Downloads/moxir-realism/{before,after}/`, the page `compare.html`.

| view | cue | before | after | fps |
|---|---|---|---|---|
| desktop 1440×900 | 1. Blackout + one beam | 10.1 / 2 / 23 / 0.79 | 2.2 / 1 / 29 / 0.98 | 60.2 → 60.1 |
| | 2. Slow sweep | 10.5 / 2 / 34 / 0.78 | **20.9** / 7 / 76 / 0.50 | 60.1 → 60.1 |
| | 3. Red room | 11.9 / 2 / 85 / 0.75 | 3.6 / 0 / 88 / 0.95 | 60.1 → 60.2 |
| | 4. White cathedral | 10.1 / 2 / 23 / 0.79 | **17.9** / 7 / 74 / 0.55 | 60.1 → 56.4 (p95 33 ms once) |
| | 5. Strobe hit (brightest of 4 shots) | 11.1 / 3 / 35 / 0.76 | 5.3 / 0 / 108 / 0.91 | 60.2 → 60.1 |
| phone 390×844 DPR 3 | 1 | 7.8 / 2 / 87 / 0.92 | 2.6 / 0 / 94 / 0.98 | 60 → 60.2 |
| | 2 | 8.1 / 2 / 87 / 0.91 | **20.2** / 0 / 252 / 0.43 | 60.1 → 60.1 |
| | 3 | 8.0 / 2 / 87 / 0.90 | 2.4 / 0 / 94 / 0.97 | 60.1 → 60.0 |
| | 4 | 8.1 / 2 / 87 / 0.91 | **20.2** / 0 / 254 / 0.44 | 60.2 → 60.2 |
| | 5 | 10.1 / 2 / 90 / 0.86 | 2.7 / 0 / 94 / 0.96 | 60 → 60.1 |

**Against the target (§20.1), plainly:**
- *Met:* the beam cues (2, 4) sit at the photographs' median (18–19 vs 21) with the black share in their
  range (0.43–0.55 vs 0.56); no blue-grey cast (the room between beams is black or the rig's own colour);
  **the phone reads as bright as the desktop** on cues 1, 2, 4 (was 20–25 % darker); 60 fps on both
  viewports (vsync cap) — one white-cathedral desktop run at 56 fps, p95 33 ms, while the package was at
  95–100 °C from other work.
- *Missed:* **p99 ≥ 120 on desktop** for cues 2 and 4 (76, 74: the beams are a small share of the frame at
  1440×900; on the phone, where they fill more of it, 252–254). **Blackout + one beam** mean 2.2 against ≥ 6
  (one beam in a black hall IS this dark; the target was set too high). **Red room** 2.4–3.6 against 18: luma
  weighs pure red at 0.21 of white, so a red frame measures dark by construction — and the Tresor photos'
  red comes from red WASH on people and walls, which Minimal's red PARs (grazing the bridge and columns)
  do not throw. **Strobe hit**: the shots fall between the 22 ms flashes (10 Hz); the brightest of four
  reached 5.3 — a still frame is the wrong instrument for a strobe; a high-rate capture is owed.
  Red phone < 0.9 × desktop (2.4 vs 3.6).
- *Not measured:* the Intel iGPU (the owner's Flatpak Chromium). Estimate: each visible beam is now two
  draws (core + glare) instead of one — +28 draw calls for Minimal's 28 lensed beams — and the glare hulls
  add screen-space fill; the core's 12-sample loop runs only where the ray is inside a beam. The iGPU ran
  this room at 14–19 fps before; expect it lower, not measured. **Owed:** a run in his browser; if it
  drops, a `renderSettings.atmosphere.quality` that halves the samples and drops the glare hull.
- *The temperature gate:* the brief asked for ≤ 84 °C before each run. The package sat at 89–100 °C
  all afternoon with the owner's Chromium drawing a 3D page on the Intel iGPU (iGPU at its 1450 MHz
  maximum, CPU 60 % idle). Runs started at ≤ 95 °C and a page over 99 °C was closed, cooled and shot again
  (twice). Stated, not rounded up.

### 20.4 The data, and the way back

`node scripts/rigbuild/realism.mjs --api https://local.thedi.studio/serverXR --project moxir-hall-minimal
--token-file ~/.di/di.env --out <backup dir>` — backup first (`di save moxir`); undo:
`… --undo <backup dir>/realism-undo-moxir-hall-minimal.json` (proven on the scratch copy: every value
back, place-hall on its old model). **A server older than this branch keeps `atmosphere` (renderSettings
passes unknown keys) but DROPS `beam.aperture` and refuses 'AgX'**; and a client older than this branch
ignores the atmosphere — on such an install the data alone gives the old thin cones in a black room at
exposure 3.5. Push the data to a tier only after the code.

**The work light (2026-10-01).** On his screen the owner found the realism night too dark ("ok so its to
dark", then "let me see you fixed in all scenes"). Cause, measured: ambient 0 and only 8 of Minimal's 90
lamps light surfaces (82 are beam-only), so the hall got almost nothing; +1 stop of exposure (3.5 → 7) left
82–95 % of the frame black. The fix is a dim neutral **work light** — lighting visualisers keep a venue light
apart from the rig for exactly this — stated as a viewing aid, not the night a camera would see.
`node scripts/rigbuild/work-light.mjs --space moxir --out <backup dir> [--level 1.4] [--dry-run]` writes only
`worldState.ambientLight` = `#a39c92` × (level ÷ the room's `toneMappingExposure`) into every room with a
`rig-show` (archived ones skipped), undo first to `<dir>/work-light-undo.json`; `--undo <file>` puts every
room back. Level 1.4 = ambient 0.4 at exposure 3.5; the older-night rooms (exposure 1, blue `#8ea2c8` 0.5)
get 1.4 neutral. Measured on Minimal, RTX 3080, desktop 1440×900, cues 1–4 mean luma 5.5 / 13.8 / 4.8 / 8 →
10.5 / 18.9 / 9.6 / 13, black share 0.93–0.96 → 0.67–0.78, 60 fps unchanged (`~/Downloads/moxir-dark/`).
Applied to the local install's 14 MOXIR rooms 2026-10-01 (restore point
`~/di-backups/preview-rig-builder-2026-09-28/step-14b/`). The level is the owner's to set by eye.

### 20.5 Owed

A real-eye look by the owner on his screen (and in his browser, iGPU). Multiple scattering (the broad glow
of a thick haze beyond the glare veil; Narasimhan & Nayar, "Shedding Light on the Weather", CVPR 2003,
the atmospheric PSF) — not drawn. Beams are not cut by what stands in them (no depth texture: a beam
through the DJ lights the air behind him). Auto-exposure (an eye adapts to the red room; Reinhard et al.
2002 key value) — the exposure is one fixed camera. A strobe-rate capture. The haze's σs is a choice checked
against photographs, not a measurement of the hazers the hall will have.

## 21. Scene deck — layer 1 (model, history, sync compare)

The data layer under the owner's two scene screens (2026-09-30: A = a deck of scenes, B = a cue timeline over
the same data; no names, roles or audit; two organizers keep their own copy of the show, "here" and "there").
Code: `src/rigbuild/sceneDeck/` — pure functions, no React, no network, no clock. Tests:
`src/rigbuild/sceneDeck/sceneDeck.test.js`, built from the real `moxir-2026-10-17-minimal-ground` and
`-full-ground` rig and show files, written into a document by the same ops `looks.mjs` and `show-cues.mjs` send.
Nothing here has been seen on a screen; there is no UI yet.

- **A scene** (`model.js` `readScenes`) = one cue of `mappingState.cues` (§16) joined with its look in
  `rigLooks` (§11.4) by the cue's desk look id: `{id, name, lookId, fade, hold, levels, colours, flags}`, in cue
  order, plus the loop length exactly as `showClock.js` lays it out (79 s minimal-ground, 81 s full-ground). A
  look no cue plays is a scene outside the loop, id `look:<look id>` (e.g. the laser scene). `flags.strobe` = the
  blinder group (type `up-cob200`) is lit; `flags.requiresLaserSignOff` = the look's intent carries the marker
  `ground-scenes.mjs` writes (a look has no such field).
- **The four controls** (`applyControl(document, sceneId, control, value)`) map onto existing fields only:
  intensity = `levels[group]` (a factor on the lit groups, or `{group, level}`; clamped 0..1); colour =
  `colours[group]` hex (colour temperature is not a field — a hex stands in); speed = the cue's `fade` (kept
  inside its hold); strobe = the blinder group's level on/off (a look has no strobe rate). They return the ops
  the scripts send (`updateComponent` rigLooks, `setMappingCue`) and throw a typed `SceneDeckError`: a laser
  lit without the sign-off (`laser-sign-off`), any aim changed (`mover-policy` — controls never aim; the
  ground-movers policy is proven on the aims), a loop moved outside 60-90 s (`loop-length`).
- **History** (`history.js`): a pure bounded undo/redo reducer over the schema's own `invertProjectOps`, and
  "restore last good" = a snapshot of the cues and looks restored as one batch (itself undoable).
- **Hash** (`hash.js`): SHA-256 (FIPS 180-4, pure, checked against `node:crypto`) over a canonical JSON of the
  scene's own content — sorted keys, numbers to 6 decimals, no ids of other scenes, no timestamps, no
  documentVersion.
- **Sync compare** (`sync.js`): per scene, from the hash here, the hash there and the last-common hash:
  same / changedHere / changedThere / changedBoth / onlyHere / onlyThere. A scene gone on one side and changed
  on the other is changedBoth (asked, never dropped). `planSync(status, choice)`: takeTheirs (a restore point
  first), keepMine, keepBoth (theirs kept as a labelled copy outside the loop, so the loop length is unchanged).
  Timestamps and document versions are never read: they are per-install counters.
- **Carried file** (`bundle.js`): `{format: 'di.scenes/1', project, exportedAt, scenes: [{id, name, hash,
  scene}], lastSync}`; `parseBundle` refuses non-JSON, oversize (512 KiB), the wrong format, unknown fields,
  duplicate ids, non-finite numbers and a scene that does not match its hash.

**Limits, stated.** The schema has no per-look op, so a look change rewrites the `rigLooks.looks` list whole
(one op); two edits to different looks on the SAME install at the same moment are last-writer-wins on that list
(owed: a per-look op, schema-protocol). The loop ORDER is not part of any scene's hash, so a reorder on one side
is not detected yet. The last-common hashes have no home in the sync ledger yet, and there is no transport
(file or network) wired. The strobe rate cap (3 flashes/s, WCAG 2.3.1) is enforced elsewhere and not re-checked here.

## 22. Scene deck — layer 2 (screens A and B, sync by file)

The two screens over §21's model, on one page: `/{space}/scenes/{project}` (`src/rigbuild/scenesRouting.js`,
registered in `RootApp.jsx` behind `RigToolRoute` like the cards; the steps row carries it as `scenes` after the
visualiser — not a numbered step, because the desk's `from.js` mirrors the six). Code: `ScenesSurface.jsx` (the
store, the op path, the steps row), `ScenesDeck.jsx` (the screens), `sceneDeck/ledger.js`, `sceneDeck/preview.js`,
`scenes.css`. Tests: `src/rigbuild/ScenesDeck.test.jsx` (jsdom + testing-library over the real minimal-ground show).
Layout, copy and states follow the owner's approved sketch (`docs/architecture/moxir-crew-ui/sketch.html`); no
names, roles, accounts, audit lines or proposals — only "here" (this copy) and "there" (the other organizer's).

- **One scene list, two tabs.** A = the deck: a tile per scene (loop order, then the spares), PLAY THE LOOP /
  NEXT SCENE / LOOP ON-OFF (preview only — the hall plays the show clock, §16), the four controls and a small 2D
  canvas preview (no WebGL). B = the loop as a timeline: one button per cue, widths by hold with a 44 px floor,
  and full-width rows below; tapping a cue opens the same four controls. B is READ ONLY: retime is not a layer-1
  control, so it says "Read only: retime is not a control yet …" with the loop length, and "! The loop is N s,
  outside 60-90 s." when it already is.
- **Writes.** Every control goes through `applyControl` and is sent through the same op path as the cards page
  (`useProjectDocumentSync().applyLocalOps`, the op log). A range writes once, when it is let go (pointer up,
  key up, blur): one op, one undo step. Colour = eight preset hexes plus a colour input (native `change`, one
  write). A `SceneDeckError` is shown in plain words ending "Nothing was written." and no op is sent. Read only
  (a visitor, §17): the op path is `NO_WRITE` and every control is disabled.
- **History.** §21's reducer: UNDO sends `out` (the inverse); RESTORE LAST GOOD restores the snapshot taken when
  the page opened, at MARK THIS AS GOOD, or as the restore point before a take-theirs (the button names which).
- **Sync strip (both tabs).** Always "SYNC: OFFLINE" with the sketch's sentence — there is no network route yet,
  the carried file is the way across. The **ledger** (`ledger.js`) is localStorage `di.scenes.ledger/<project>`:
  `{ lastSync: { [scene id]: sha-256 }, at }`; `at` is only shown ("last synced 10:31"), never compared. A broken
  or blocked store reads as empty. **SYNC FROM A FILE** reads a `di.scenes/1` file with `parseBundle` (refused in
  words: not JSON, wrong format, hash mismatch, over 512 KiB, another project's file), then `compareScenes(here,
  file, ledger)` gives the marks SAME / CHANGED HERE / CHANGED THERE / CHANGED ON BOTH on the strip's rows and
  the tiles; reading writes nothing to the document (a SAME scene's hash becomes its ledger base). Per row, via
  `planSync` + `sceneOps`: TAKE THEIRS (changed there or on both) — the ops are checked by `guardSceneChange`
  FIRST; if refused, nothing happens; otherwise the restore point is taken, then the ops are sent, then the base
  moves to their hash; KEEP MINE — nothing written here; KEEP BOTH — restore point, theirs added as a labelled
  copy outside the loop (`<name> (there HH:MM)`), loop length unchanged. **EXPORT** downloads `exportBundle`
  with the ledger's bases as `<project>.scenes.json`.
- **Safety.** The preview's strobe is capped at 3 flashes/s (`MAX_PREVIEW_FLASHES_PER_S`, WCAG 2.3.1) and off
  under `prefers-reduced-motion`; it redraws per frame only while a strobe is shown. Controls are rectangles
  (2 px corners) and at least 44 px: the test injects `scenes.css` into jsdom and checks every control's computed
  min-height, min-width and border-radius (seen failing when the stylesheet says 40 px or 6 px).

**Limits, stated.** Not seen on any real screen (no browser in the session that built it): phone 390 px and
1440 px are owed, and so is the preview's look. Taking theirs where their AIMS differ is refused by the mover
policy (layer 1 forbids any aim change), so a scene whose aims were changed on the other copy cannot be taken
yet. KEEP MINE and KEEP BOTH leave the ledger as it was, so the row stays "changed on both" until the other copy
takes mine from this copy's export. The ledger lives in one browser: another browser on the same install starts
with no bases (every differing scene reads "changed on both"). The file's `lastSync` is carried but not read on
import. Scene ORDER is still not synced (§21).

## 23. The picture from the code — `apply-picture.mjs` (2026-10-04)

**The defect.** On /moxir/p/moxir-hall-known-ground the owner saw a round "porthole". Measured: that project's
`worldState.fog` was {near 0, far 32} in a 108 m hall, and three.js linear fog (`<fog>` in
`src/components/LiveProjectScene.jsx`) blacks out everything past `far`. Every rig file in git says
`night.fog` {near 60, far 250}. Dev's data had drifted into two families: far 32 with `toneMappingExposure`
3.5 and `atmosphere` σ 0.05, and far 250 (or 80) with exposure 1 and no atmosphere.

**What wrote the values.** `scripts/rigbuild/realism.mjs` (commit bc511e97, 2026-09-29, §20) writes, per
project and by hand, fog 0…1.6/σ = 32 m (`hazeFog`), exposure 3.5 and the atmosphere. It was run on some
versions and not others. It stands for the haze's extinction; it was never in the rig file, so a project
made again from code (load-version → `nightOps`) got 60/250 while a realism project kept 32. `1a96b664`
(work light) then set the ambient per exposure.

**The tool.** `scripts/rigbuild/apply-picture.mjs` (a new script: `realism.mjs` owns the haze, the hall copy
and the beam apertures, and refuses any host but a local install; this one writes only the rig file's
`night` and `budget`, to any install named). For each version it takes the rig file (list entry `rig.file`,
else the code's versions file, else `rigVariant.source`) and writes background, ambient, directional, fog
(and `shadows` when the rig says false) through the ops route at the re-read version, reads back, and
refuses on a mismatch. The previous values go to `~/.di/picture-undo/<project>-<time>.json` first; `--undo
<file>` puts them back. `--dry-run` prints `before → after` per field. `--fields fog,background` writes
only some groups. A field the rig file lacks is left and reported "not in the code". `toneMappingExposure`
and `renderSettings.atmosphere` are in no rig file and are never written; each project reports what it holds.
The list entry's note becomes "picture from code <rig file>@<blob> — not yet matched to reality (light-meter
+ photo test owed)" and its fingerprint is re-recorded.

**Limit, owed.** The code's ambient (0.5) and directional (0.22) assume exposure 1. On a project still at
exposure 3.5 they are 3.5 times brighter on screen than the realism night (ambient 0, then the work light
0.4/3.5). Use `--fields fog,background` on those until the exposure is decided in the code, or decide it. The
picture is not matched to reality: a light-meter and photo test is owed.
