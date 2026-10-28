# The fixture library — di.iiii's one shared set of lamps, lasers and effects

One library for every project on the platform (owner's decision 4, 2026-10-13:
`docs/ai/decisions/2026-10-13-views-library-words-workflow.md`). Its first 13 types — the
UPlight rental units, the three planning types and the LaserCube — are the **starter set**.

> *"In time we will add devices; our task is to collect real, close data so it is right in
> real life."* — the owner, 2026-10-13

## What is here

| File | What it holds |
|---|---|
| `index.json` | the order, and each type's `id`, `code`, `category`: what a reader needs before it loads a type |
| `all.json` | every type in one file, for the Studio's work tools (one request, not one per type) |
| `<id>.json` | one type: identity, modes and channel lists, power, weight, size, optics, the 3D body, its `sources`, and its `provenance` |

All of it is **generated** by `node scripts/rigbuild/types.mjs` from
`scripts/place/fixtures/fixtures.json` (the manifest) — never edit a file here by hand;
`src/rigbuild/fixtureTypes.test.js` regenerates and compares. The old one-file copy `types/moxir.json` is retired (split of PR #914, part 3); a test fails if anything reads it.

Who reads what: the Studio's work tools (hotbar, plot, cards, patch sheet) read the whole
library (`../index.js`, from `all.json`); the room and the viewer load **only the types their project uses**
(`../projectTypes.js`); node scripts read it through `scripts/rigbuild/library.mjs`. A
project's own extra types travel in its document (`components.rentalList.types`, joined by
`rental.js` `libraryWithShow`) and never enter this folder.

## Provenance — every type says how it is known

```json
"provenance": {
  "identified": "exact",          // exact: the maker's own model · equivalent: modelled on a named other fixture
  "date": "2026-09-28",           // the newest date anything in it was read
  "sources": ["D", "D-CN", "…"],  // keys into the type's `sources` (each a URL and what it is)
  "values": { "measured": 0, "tested": 1, "datasheet": 6, "equivalent": 1, "assumed": 4, "unknown": 0 }
}
```

`values` counts the type's sourced numbers by how each was got, from the manifest's own
`basis` on every value:

| word | manifest `basis` | means |
|---|---|---|
| **measured** | `MEASURED` | measured by us on a real unit, with a stated method (none yet) |
| **tested** | `TESTED` | run on the rental units themselves (a channel map patched and played) |
| **datasheet** | `EXACT`, `COMPONENT` | the maker's own published number for this model (or for the part inside it) |
| **equivalent** | `EQUIVALENT` | a named fixture of the same class, because this maker publishes nothing for it |
| **assumed** | `ASSUMED` | a stated guess, no source — a test mode, a linear curve |
| **unknown** | `UNKNOWN` | looked for and not found (the value itself is not carried) |

## The rule for adding a type

A type enters the library only with data close enough to be right in a real room. In order:

1. **Identity first.** The maker and the model code as printed on the unit or the maker's own
   page. A rental label nobody can trace is an `equivalent`: name the fixture it is modelled
   on, and say the real maker is owed.
2. **Every number carries `{ value, src, basis }`.** `src` names an entry in the manifest's
   `sources` with a URL (or "the unit itself") and what it is; `basis` is one of the words above.
   A number with no source is `ASSUMED` and says why; a number looked for and not found is
   `UNKNOWN` with `value: null` — never a plausible guess written as fact.
3. **Sources, best first:**
   1. *measured* by us on the unit — photometry (lux at a stated distance and beam/field angle),
      power at the plug, weight, size — with the date, the instrument and the method;
   2. *tested* on the unit — the channel map as patched and played on a desk;
   3. the *maker's* datasheet or manual for this exact model code (`EXACT`);
   4. the Open Fixture Library (MIT) for channel lists and dimensions, by fixture key;
   5. a *named equivalent's* datasheet (`EQUIVALENT`) — same class, power and optics;
   6. GDTF Share only with a licence that allows it (its terms forbid derivative use; see
      the manifest's `search.gdtf`).
4. **What a type needs before it is useful:** `category` (a laser MUST say `laser` — the show
   page refuses lasers by this word, `shared/laserMoments.cjs`; a new laser type is also added
   to `LASER_TYPE_IDS` there, and `shared/laserMoments.test.js` fails until it is); at least one
   DMX mode with its footprint (channel list, or marked owed); `power_w` (and `supply_w` when
   the maker states a mains draw); `weight_kg` and `size_mm` (rigging and the body); optics
   (`beam_deg`, and lux at a stated distance) for anything that lights; the date the sources
   were read (`accessed`).
5. **Then** add the kind to the manifest, run `node scripts/rigbuild/types.mjs`, and commit the
   manifest and the generated files together. A body (`model3d`) is built by
   `scripts/place/fixtures/build_fixtures.py` to the datasheet's outer size.
6. **Replace, don't stack.** When a measured or tested number arrives, it replaces the
   equivalent's or the assumed one in the manifest, with its new `basis` and date — the old
   source stays in `sources` if anything still cites it.

A one-off lamp for one project does not need all this: add it to that project's rental list
(`rentalList.types`, e.g. from the Open Fixture Library). It joins the library
here only once its data meets the rule above.
