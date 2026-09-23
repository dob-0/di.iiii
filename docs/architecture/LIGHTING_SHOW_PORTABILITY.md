# Making a light show travel

Written 2026-09-03 as a plan; trimmed on 2026-09-23 to what is built, when the owner
answered decisions 2 and 3 of `di-atlas/decisions/2026-09-23-connect-everything.md`:
**one show per space, carried in the space's `.diiii` file.** His sentence that day:
*"what we need can easy work offline and then share the project from one device to
other."* What the plan argued and nobody has built yet is under "Still owed".

## What is true now

**A space owns its own light show.** It lives beside the space's scene:

```
<spacesDir>/<id>/scene.json            what a visitor gets
<spacesDir>/<id>/lighting/show.json    the space's light show  ← new
<dataDir>/lighting/show.json           this machine's own show (unchanged)
```

The show holds the patch (fixtures, groups, the fixture types it made or imported),
scenes, looks, layers, sets, effects, LFOs, audio settings and the MIDI map. It is
written the way the machine's show always was: whole, to a temp file, renamed, with
`show.prev.json` kept. Deleting the space deletes its show with it.

**The desk runs one show at a time.** That is how a lighting console works: it has one
show file loaded, and loading another replaces it (grandMA3 *Load Show*, ETC Eos *File →
Open*). Opening Light from a space (`/light/?space=<id>`, which the bar and Projection's
Light link already send) goes to that space's page, `/light/space/<id>/`; the first open
loads the space's show. A bare `/light/` is the desk as it is and runs whatever is loaded,
which is what a phone scanning the Phone box's QR wants from a remote. If nobody ever
opens a space's show, the desk is exactly the one-show desk it was before. A restart comes
back to the show it left (`<dataDir>/lighting/desk.json`).

**Output stays off, and the rig stays with the machine.** `output` — which wire the light
leaves on (Art-Net, sACN, a USB widget and its port), where it is sent, whether it is on —
is a fact about the machine and its cables. It is never written into a space's show,
never carried in a file, and never changed by loading a show. While a space's show is
loaded, a change under OUTPUT goes into the machine's own file. With output on, loading
another show is refused unless the operator presses the button that says the lights will
change; a page never swaps a live show by itself, and the bare desk (a phone) does not
offer the swap while output is on.

**The patch travels; the wiring does not.** The plan (2026-09-03, §2) kept the patch on
the machine. That waits on fixture indexes becoming identities (owed, below): until then
looks and scenes name fixtures by id, and a show without its patch is a show of dead
references. So the patch goes with the show, and the one thing a venue must redo is say
where the light leaves the machine.

**The `.diiii` file carries it.** `scripts/space-bundle.mjs` (behind Save to file / Open a
file, `di save` / `di open`, and every space inside `di backup`) stages the show as
`space/lighting/show.json`, without `output`, and names it in `bundle.json` (`lightShow:
{fixtures, scenes, looks}`) and in its log line. Import writes it where the desk keeps a
space's show, keeping any replaced show as `show.prev.json`. A file that carries a show is
bundle version 2, so an older di.iiii refuses it by name instead of opening the space with
the show silently left behind; a file without one stays version 1 and opens anywhere.
`--force` with a file that carries no show keeps the space's own show, as it keeps the
projects the file does not carry; `--prune` removes the space's directory, show included.

**A visitor never downloads it.** The show is not in the scene, not in any project
document, and is served only by the desk at `/light`, which exists on a local install
only. That is where it is stored, not a filter applied later.

## The one migration, and how to undo it

Nothing moves by itself. When a space's show has never been saved and this machine's own
show has something in it, the desk opened for that space says so in one sentence, with
one button: **Use this machine's show for <space>**. It **copies** the machine's show
(without the rig) into the space's file and says so; the machine's show is not changed.

**Undo:** delete the space's show.

```
rm -r ~/.di/data/spaces/<id>/lighting        # a `di` install (`di where` shows the data dir)
rm -r <DATA_ROOT>/spaces/<id>/lighting       # a dev stack
```

Do it while the desk runs another show (the bare desk offers *Load this machine's own
show* while output is off) or with di.iiii stopped: a desk still running that space's show
holds it in memory and would write it back at its next save. Opened again, the space is
empty and the offer is back.

## Still owed

1. **The fixture index as the identity** (plan §3): unique per rig, refused on a
   duplicate, looks keyed by index instead of id, one migration that keeps the old file
   beside the new one. Until then a travelling show carries its own patch.
2. **Rebinding a travelling show to a venue's rig**: the patch travels today; a venue
   should be able to keep its own patch and bind the show's indexes to it.
3. **A cue fires on the loaded show.** A mapping cue on a project names a look or scene;
   it fires on whatever show the desk has loaded, so a cue of space A pressed while B's
   show is loaded finds no such look and fires only the wall. The named resolver of the
   plan (§4: one function, one failure path, said in words) is not built.
4. **Tier sync does not carry the show.** `space-sync` (local → dev → prod) never
   mentions it; hosted tiers run no desk, so nothing is lost there today, but between
   machines the show travels by `.diiii`, `di backup`, or not at all.
5. **One show at a time means two pages for two spaces take turns.** The second one says
   which show is loaded and offers its own; it never writes into the other's show
   (`409 other-show`).
6. **Per-browser things are not per show**: scene hotkeys (bound by scene name), pane
   splits and folds still live in the browser.
7. **The show's clock** (`showState.clockEpoch`, plan §8) is not started.

## The warning that still stands

A mapping cue's reference to the show (`lightLook`, `lightScene`) lives on a **project
document**, and a key the schema does not name does not survive there:
`normalizeProjectDocument` (`src/shared/projectSchema.js`, mirrored in
`shared/projectSchema.cjs`) rebuilds the document from the keys it knows, on write and
again on read, and the write still answers 200. Anything added to the document for the
show must be an explicitly normalised field, named in both schema copies in lockstep,
guarded by `serverXR/src/schemaSync.test.js`, with a round-trip test that writes,
normalises, reads and normalises again. The show itself is a space file and does not pass
through that normaliser; its round trip is guarded by `scripts/space-bundle.test.js`
("space-bundle carries the space's light show").
