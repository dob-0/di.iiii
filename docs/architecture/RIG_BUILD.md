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
  in the Studio `useRigAutoPatch` (mounted in `StudioEditor`) runs it 400 ms after any
  lamp change and returns `{flags, message, patchGroup(entityIds)}`.
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

