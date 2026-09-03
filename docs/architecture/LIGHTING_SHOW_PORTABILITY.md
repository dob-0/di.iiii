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
- **The sync engine — answered, by experiment, and the answer is a warning.** A new
  top-level document key does **not** survive today. A document written with a key the
  schema does not name comes back without it: the write returns 200, the version
  increments, and the data is gone. Silently, which is the exact failure this document
  exists to end.

  The cause is not the sync engine. `normalizeProjectDocument`
  (`src/shared/projectSchema.js:1122`, mirrored in `shared/projectSchema.cjs`) rebuilds
  the document as a literal naming exactly fifteen keys and never spreads the source, so
  anything else falls on the floor. `normalizeMappingState` does the same field-by-field
  rebuild, so nesting inside the mapping does not help either. It is stripped twice — once
  on write (`serverXR/src/routes/projectRoutes.js`) and again on read
  (`serverXR/src/projectStore.js`), which also rewrites the file on disk when it differs.
  `scripts/space-sync.mjs` would have carried the key — it spreads the whole fetched
  document — but the server removed it long before the sync saw it. Note for anyone
  verifying this later: `--dry-run` exits before the document step, so a dry run can never
  show this failure.

  There is one key that *does* survive an unknown field — `presentationState`, because its
  normaliser spreads the source before applying the fields it knows. **That is a hiding
  place, not a contract.** The next person to tighten that normaliser would take someone's
  show with them, and the same spread-then-filter shape is already the cause of a known
  trap elsewhere (a code file entry using `path` instead of `name` is dropped in silence).

  So: the show must be an **explicitly normalised field**, named in both schema copies in
  lockstep, guarded by `serverXR/src/schemaSync.test.js`, with a round-trip test that
  writes, normalises, reads and normalises again and asserts every field survives. Once
  the field is named, the sync push carries it.

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

## 8. The shape recommended, and where it can be overturned

Stated rather than asked, because a menu is not an answer. Each of these is a
recommendation with its reason; any of them can be overturned in a sentence.

**A show carries its own copy of everything it uses.** No shared house library across
spaces. Two copies of anything drift, and a library shared between machines would drift
while looking synced — which is the failure mode this whole note exists to end. If the
same look is wanted in two shows, it is copied in, and the copy is the truth for that
show.

**One show per space, and it lives with the space** — a space is the thing that gets an
address, gets handed to someone, and gets kept as a file when the night is over. A room
inside a space uses that space's show. If a room ever needs its own, that is a sign it
wanted to be its own space.

> One consequence to accept deliberately, because it is not obvious: **the mapping does
> not live where the show would.** Mapping cues live on a PROJECT document
> (`/{space}/map/{projectId}`), one per project; a show per space sits beside them, not
> inside them. So a cue in one project fires a look held at the space level. That is a
> reference across containers — allowed here, and only here, because a space syncs and
> travels as one unit, so the reference can never be half-present. The alternative — a
> show per project document — keeps the cue and the look in one file, at the price of two
> pieces in the same room owning two unrelated light libraries. The space is the better
> unit; the crossing is the cost, and it should be named in the schema rather than
> discovered later.

**The MIDI map splits by nature, like everything else.** What a control DOES — button 3
fires "Ember wave" — is content and travels. Which port, device and channel that control
is on is the rig and stays. A show that lands on another desk offers the same verbs,
bound to whatever controller is plugged in there.

**The show gets its own key, and reads the clock rather than keeping one.** `showState`
holds a clock stamped once so every window of a show derives the same elapsed time; that
is a property of the running performance, not of the material, and a four-byte number
should not share a home with a megabyte of looks.

> Two clocks, and they are not rivals: the desk's **tempo** (beats per minute, tapped by
> the operator, what a look's `measure` is counted in) and the show's **epoch** (a
> wall-clock stamp every window derives elapsed time from). Today a look knows only
> tempo, so two windows agree on speed but not on where in the bar they are. Anchoring the
> beat grid to `showState.clockEpoch` is what would make them agree on the downbeat too —
> and that is the same missing piece the AI-director notes call a beat anchor. Worth
> doing when the show moves, not before.

**Two tests are part of the change, not after it.** The field is named in both schema
copies in lockstep, covered by `serverXR/src/schemaSync.test.js`; and a round trip —
write a show, normalise, read, normalise again, assert nothing was lost. The failure this
note exists to prevent is silent, and only a test that goes looking for silence will
catch it coming back.

## 9. Still open

- **Is the club's existing scene library worth carrying at all?** Its 588 scenes were
  programmed against that room's 21 fixtures and mean little anywhere else. Migrating them
  may be work spent on noise, and leaving them on that machine may be the kinder answer.
- **What does a visitor to a published space see** when the document carries a show they
  cannot run? The answer should be *nothing at all* — not an empty desk, not a dead
  button. A show is for whoever is running the room. Worth confirming, because it is the
  one place this could leak into a stranger's screen.
