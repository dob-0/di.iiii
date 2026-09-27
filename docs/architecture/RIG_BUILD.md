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
| **writes** | `createEntity` of a piece or lamp at a pose from `snap()`; `deleteEntity` | the same, from a plan pose; `fixture.circuit/unit/position` typed in the inspector; a typed universe/address | `createEntity` lamps along a position line (a card dealt = N lamps), `fixture.position` |
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
