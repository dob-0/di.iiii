# Making a light show travel — a plan, not a change

Written 2026-09-03, in answer to the direction *"mapping and lighting can be connected …
in one line … or they can be separate and together … so we can use the softs in any
condition and state, like online, offline, synced."* Nothing here is built. It is written
to be argued with before anything moves.

## 1. Where the seam actually is

Today a show lives in two places, split by accident rather than by nature:

| | Lives in | Travels with a space? |
|---|---|---|
| Mapping surfaces, cues, and a cue's `lightLook`/`lightScene` | the project document (`document.mappingState`) | **yes** — syncs local → staging → prod, backed up, openable anywhere |
| Looks, layers, palettes, scenes, patch, output, MIDI map | `<dataDir>/lighting/show.json` on the machine | **no** — never leaves it |

So a space carries the mapping **and the intent** to fire a light cue, but not the light
itself. Move to another machine and the cue's id points at nothing. That is the whole of
the problem, and it is a real one: the projection half of a show is portable and the
lighting half is not.

## 2. The rule to split by

Not "what is convenient to sync" — **what is a property of the artwork, and what is a
property of the room**.

**CONTENT — travels in the project document.** Looks (which is also palettes and chases),
layers, scenes, cue lists, and the authored half of the MIDI map. This is the show: what
it looks like, in what order, on what beat. It should open on another machine, sync
between tiers, and be backed up like every other thing di.iiii holds.

**THE RIG — stays on the machine.** The patch (which fixture sits on which channel of
which universe), the output transport (Art-Net, sACN, ENTTEC and its serial port), the
priority, the refresh rate, display and interface choices. A rig is a fact about the room
and the metal in it. Syncing it would push one venue's wiring onto another's, and the
first time that happened during a get-in it would cost an evening.

Fixture **types** (`customProfiles`) sit awkwardly between the two and belong with the
rig: a type describes gear. Content survives a missing type the same way it survives a
missing fixture — see §5. Anything imported from the fixture library can be re-imported
by name on the other machine.

## 3. The hard part nobody can wave through

A look's values are keyed by **fixture id** — `fxmtld5puv1`, generated from a clock and a
counter on the machine that patched it. It means nothing anywhere else. Ship the looks to
another machine and every value addresses a fixture that does not exist.

This is not a detail; it is the reason the split has not happened already. And the field
answered it forty years ago: **a console separates the channel number from the address.**
Eos is explicit that a channel is "a single numerical name" the show is written against,
while the patch says which dimmer or fixture that name currently drives. grandMA does the
same with fixture ids over a patch. The show is written in channel numbers; the patch is
the venue's answer to what a channel number is tonight.

So the join is: **content addresses fixtures by a stable number the operator controls,
and the rig binds that number to a universe, an address and a profile.**

We are most of the way there without noticing — every fixture already carries an `index`,
shown as `3.Back left` throughout the interface. What it lacks is a guarantee: nothing
enforces that an index is unique, and looks were built against ids rather than indexes.
Three things follow, and they are the actual work:

1. **The index becomes the identity.** Unique per universe-independent rig, assignable,
   and the thing the interface has always shown. Patching asks for it and refuses a
   duplicate rather than silently allowing two.
2. **Looks are keyed by index, not id.** `steps[].values` moves from `{fixtureId: {...}}`
   to `{index: {...}}`. `'*'` (every fixture in the selection) is unaffected, and a look
   written entirely in `'*'` — every starter, every chase — is already portable today.
3. **A one-time migration** rewrites existing looks and scenes through the current patch:
   id → index. Deterministic, and it must keep the old file beside the new one, because a
   migration that cannot be undone during a get-in is not a migration, it is a gamble.

## 4. Where content sits in the document

Alongside the mapping, not inside it — the two are separate crafts joined by a cue:

```
document.mappingState   surfaces, cues (a cue may name a look or a scene)
document.lightingState  looks, layers, scenes, cuelists, midi
```

`normalizeLightingState` in `src/shared/projectSchema.js` and its twin in
`shared/projectSchema.cjs`, in lockstep, guarded by the existing `schemaSync` test. The
sanitisers already exist and are already conservative — `looks.js` exports
`sanitizeLooks`/`sanitizeLayers` — so this is mostly moving a boundary, not writing new
validation.

The desk keeps `show.json` as its own store, because **the desk must still run standalone**
— the club machine has no project document and never will. So:

- standalone: content and rig both in `show.json`, exactly as now;
- inside di.iiii: the rig stays in `show.json`, and content is read from and written to
  the bound project document.

The desk gains one idea: *where my content comes from*. Everything else it already does.

## 5. What happens when it does not fit

The honest answer, in the interface, every time — this is the failure the whole audit
says everyone else gets wrong by going quietly dead.

- **A look wants channels the rig does not have.** Fire what exists, and say what did not:
  "Ember wave — 12 of 15 channels here". Scenes already carry exactly this as `live` and
  `missing`, and the bank already strikes through a scene that can do nothing. Same rule,
  same words.
- **A look wants a profile this rig has never heard of.** The channels that exist by role
  still land; the ones that do not are named. Offer the library import by name.
- **A cue names a look that is not in this document.** The cue says so and fires the
  mapping half anyway. Half a cue is better than a stopped show.
- **No desk at all** (a hosted tab, a laptop with no rig): unchanged from today — the
  mapper says the desk is local-only and fires the wall.

## 6. What this must not break

- **Offline stays exactly as it is.** Everything works on a switch with no internet
  already, and nothing here adds a network dependency to firing. The only outbound call in
  the desk is a fixture-library import, which caches. Content in the document is served by
  the local serverXR; syncing is something you choose, later, when there is a network.
- **The club's desk.** 588 scenes on a live rig. It runs standalone and must keep running
  standalone, on the same file, through this whole change. The migration is opt-in there.
- **The sync engine.** A new top-level document key has to survive `space-sync`, the tier
  push and the backup repo. This is the one place I cannot promise from reading alone: it
  needs checking against `scripts/space-sync.mjs` and the sync routes before any schema
  lands, because a key that is silently dropped on push would lose a show quietly, which
  is the exact failure this document is trying to end.

## 7. Order of work, once someone says yes

1. Make the fixture index a real identity: unique, assignable, refused on collision.
2. Key looks and scenes by index; migrate existing files, keeping the old one beside.
3. `document.lightingState` + normalisers in lockstep; prove the sync engine carries it.
4. Bind the desk to a document when di.iiii mounts it; leave standalone alone.
5. The resolution report — what a look found and did not find — in words, everywhere it
   can be seen.

Steps 1 and 2 are worth doing whatever is decided about the document: an index that is a
real identity makes the patch legible, and a look keyed by index survives a repatch on the
same machine, which today it does not.

## 8. Open questions for the owner

- **Is a scene library content or rig?** The club's 588 scenes were programmed against
  that room's 21 fixtures and mean little elsewhere. Travelling by default may be noise.
- **One document or one per room?** A touring piece might want its show in the space; a
  venue might want the room's own looks kept locally and only the piece's travelling.
- **Does the MIDI map travel?** The mapping is authored, but the controller is a fact
  about the desk in the room, like the rig.
