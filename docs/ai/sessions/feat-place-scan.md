## Scanning a place from the phone, into the space itself

Owner, 2026-09-22: *"create new space and start to scan."* A space IS a place, so
di.iiii now takes the walk itself — no Polycam, no second application, nothing to
export and carry across. `/{space}/scan` opens the rear camera, cuts the walk into
thirty-second pieces and puts each one on the space's own `sources` wall as it
closes. The 3D copy is built from that by the existing place pipeline
(`scripts/place/`) and arrives as `hall` in the same space. All three sketches he
chose are in: the door on New space (A), footage landing on the wall from any
phone with access (B), and the guided walk (C).

Stacked on `feat/place-pipeline` (PR #531) — the build step calls
`scripts/place/place.mjs`, which is unmerged.

Done here:

- **`/{space}/scan`** (`src/scan/`), one lazy route beside Map and Make, behind
  the same gate: the page WRITES, so a camera reachable on terms the document
  would refuse is a camera pointed into somebody else's space. `scan` reserved on
  all four claimants; checked on prod, dev and local first — nothing held the word.
- **The walk, cut so it can be lost cheaply.** `recorder.start(30000)` looks like
  it cuts a walk into pieces and does not: only the first chunk carries the
  container's headers. Each piece gets its own recorder. Found before it shipped;
  it would have hung dead frames on the wall and contributed nothing to
  `frames.mjs`.
- **A coach that does not flatter.** Sharpness is the same Laplacian variance
  `frame-stats.py` runs, and "slower" fires on a drop against this walk's own
  median, never an absolute number — a dim hall must not be nagged for five
  minutes. The ring says **directions covered** and the vocabulary now forbids
  calling it anything else: a person can turn on the spot in a doorway and fill
  all 36 having seen nothing of the hall.
- **The lens, not the phone's top edge.** Reading the ring off `alpha` would have
  swung it a quarter turn when somebody turned the phone sideways and left it
  still when they walked round a pillar. `deviceAim.js` pushes device −Z through
  the spec's rotation instead; elevation comes out of gravity alone, so "keep the
  floor in frame" survives a refused compass.
- **The measured wall** as a text object in the room (`wall · 8.30 m`) plus the
  photograph of that wall, so the number can be checked against the thing later —
  and because `normalizeProjectDocument` returns a fixed set of keys and would
  have silently dropped an invented field.
- **`POST/GET /api/spaces/:id/place/build`**, local-install only behind
  `requireLocalRuntime`: a hosted tier answers 404 and the phone says the copy is
  built on the studio machine. Status is derived every time off the status file,
  the pid, the log's own step lines and whether the `hall` project arrived — so a
  restart mid-build answers correctly, and "exited 0 having built nothing" reads
  as failed with the real tail of its log.
- **`--from-space`** in `frames.mjs`/`place.mjs`: the studio machine may not be
  the machine the space is on. It implies `--no-sources`, which is the one that
  would have hung every picture twice.
- One wall layout, not two: the geometry moved out of `import.mjs` into
  `src/scan/sourceWall.js` and both import it. Given a total it centres (the
  importer's shape, byte-identical); without one it grows from a fixed corner, so
  a picture already hung never slides when the next arrives.

Two phones are a supported case, not an edge: the slot a picture hangs in is read
from the document at that moment and a 409 is the normal outcome, re-read and
re-slot.

**Not run, and it should be said plainly: the real reconstruction.** Meshroom was
busy on a Moxir run and llama-server held 5.7 GB of the 8 GB card. The build route
was driven with `--dry-run` and against a stubbed `place.mjs`; what is proven is
the route's own behaviour — the guard, what it copies out of the blob store, what
it spawns, what it writes down, and how it reads a build's state back off disk.
The first real end-to-end build from a phone walk is still owed.
