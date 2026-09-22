# A space IS a place

A room somebody stood in becomes a room anybody can stand in. That is the
whole idea. This document says what "the place pipeline" is for, what it is
made of, and the two rules that keep it honest.

The tools live in `scripts/place/`. Nothing in `src/` or `serverXR/` changed
to make this work — the platform already had everything a room needs.

## Two ways in

Footage can arrive two ways, and they end in the same place.

**A drop folder.** Somebody walked the hall with whatever camera they had and
handed over a folder. `place.mjs --from <dir>` is that, and it is step 1.

**The phone, through di.iiii itself.** `/{space}/scan` opens the camera, takes
the walk in thirty-second pieces and the stills one at a time, and puts each one
on the `sources` wall AS IT IS TAKEN. Nothing is exported, nothing is carried
across on a cable, and a connection that dies loses the piece in the air rather
than the walk. `place.mjs --from-space <space>` then pulls that footage back down
and runs the same five steps over it.

Written down here because it changes a sentence that used to be true of this
whole lane: *"Nothing in `src/` or `serverXR/` changed to make this work."* It
did, on 2026-09-22, and only for the collecting — see **Scanning from the
platform** below.

## The idea

A di.iiii space is not a folder of files with a 3D preview attached. It is a
place, and a visitor walks into it. A venue — a factory hall, a theatre, a
foyer — is also a place. Photographs of it are not.

So: footage in, place out. One command, and the hall is on di.iiii at an
address, upright, the right size, with a floor you can walk and a door you
arrive at.

## Layers stack

The hall is not the whole story, so it is not the whole space.

- `hall` — the room itself, one model, standing still on its floor.
- `sources` — the photographs and clips it was built from, hung on a wall.

Both are projects in the same space, because both are rooms. A visitor can
walk the hall and then walk into what the hall is made of. Later layers —
where the lights go, where the seats go, a rehearsal set standing in the real
room — are more projects in the same space, not another tool.

This is what makes the pipeline worth building rather than scripting once: the
space is the thing that lasts, and the scan is only its first layer.

## Scanning is bought, not built

Turning photographs into a mesh is a solved, expensive, moving problem. We do
not solve it. We buy it, and we keep the seam narrow enough that the shop can
change.

Today the shop is **Google Colab running Meshroom** on a rented GPU. The whole
of that arrangement is `scripts/place/colab-job.mjs` and
`scripts/place/reconstruct.py`; every step before and after speaks only in
files. Tomorrow a phone with a lidar will hand us the same OBJ, or a service
will, and the pipeline loses a step instead of being rewritten.

What the seam has to survive, and does:

- A rented runtime can vanish mid-job, so the reconstruction runs detached on
  the box and the mesh is pulled the moment it exists.
- The frames go up in pieces: the upload API carries a file inside one JSON
  body, and a hall's worth of photographs is too big for that.
- A failure must release the machine. An idle GPU bills until somebody
  notices.

## The guess/measured rule

**A reconstruction from photographs has no size in it.** A hall and a model of
a hall are the same pile of numbers. Somebody has to say how big the room is,
and the pipeline never pretends otherwise:

| in `place.json` | what it means |
| --- | --- |
| `measured` | a person put a tape on something and typed the number |
| `guess` | we read the tallest doorway off the mesh and called it 2.1 m |
| `none` | nobody said, so the room is in the reconstruction's own units |

A guessed room walks the wrong size and everything built to fit it will be the
wrong size too, so the guess is printed in capitals, written into
`place.json`, and repeated by the importer. On the test room the doorway guess
landed at 8.11 m against a true 8.3 m — close, and still a guess.

The same honesty covers which way is up. Nothing in a bare mesh distinguishes
a floor from a ceiling: both are big, flat, and have the whole room on one
side. The fitter chooses by where the clutter is — rooms keep theirs low — and
then says how sure it is. `--flip` is one word to overrule it.

## The five steps

Each writes its work into one folder and can be run again on its own.

1. **frames** — photos copied, videos pulled apart at 2 fps, the blurry and
   the repeated thrown out. Says in words when the footage is too thin to
   build a room from, and stops rather than renting a GPU to fail on it.
2. **build** — the frames go to the shop and a mesh comes back.
3. **crush** — a reconstruction is not a model. Millions of triangles become a
   few hundred thousand, the textures become WebP, and a before/after picture
   is left beside the file so a person can see what the crushing cost.
   (Golden rule: never ship a raw scan mesh.)
4. **fit** — the floor goes flat and to `y = 0`, the room is squared to the
   world axes, a metre is made a metre, and `place.json` records all of it,
   including how the size was arrived at.
5. **import** — a space on di.iiii, the hall in it as one static model, a
   walkable floor, a spawn inside the door, the footage beside it.

## Two things that will bite

**A model entity must say it is static.** Without
`components.animation.mode = 'static'` an entity falls back to "models float"
(`src/project/viewport/entityAnimation.js`) and the whole building turns
slowly in the air.

**A room's arrival is framed from where its entities are.** An entity carrying
a large offset to cancel out the reconstruction's own position aims the
opening shot at empty space. So the fit is baked into the model file and the
entity sits at the origin, unturned, unscaled.

## Scanning from the platform

Owner, 2026-09-22: *"create new space and start to scan."* One sentence, so one
press: the new-space form has a second button that makes the space and opens the
camera on it.

### Where it lives

| what | where |
| --- | --- |
| the camera | `src/scan/ScanSurface.jsx` at `/{space}/scan` |
| the measures behind the coaching | `src/scan/sharpness.js` · `deviceAim.js` · `sectorRing.js` |
| the walk, cut into pieces | `src/scan/walkRecorder.js` · `uploadQueue.js` |
| the wall both the phone and the importer hang on | `src/scan/sourceWall.js` |
| writing into the room | `src/scan/scanSources.js` |
| making the hall | `serverXR/src/routes/placeRoutes.js` |

### The walk goes up as it happens

A walk round a factory hall is six or eight minutes. As one file it reaches the
server at the end, and a connection that dies at minute seven loses seven minutes
of walking somebody did once, in a building they had to arrange access to. So it
is cut into thirty-second pieces, and each piece is uploaded the moment it closes.

`recorder.start(30000)` looks like it does this and does not: a timeslice hands
over a chunk every thirty seconds, but only the FIRST chunk carries the
container's headers, so the rest are byte ranges of one file and worth nothing to
ffmpeg on their own. A piece that stands alone needs its OWN recorder — start,
stop, start again. The cost is a seam of about 40 ms between pieces, against
frames pulled at 2 fps, which is a twelfth of one frame.

Each capture is an ordinary asset upload plus an ordinary op, so the wall grows
while the walk is happening: open `/{space}/p/{space}-sources` on a laptop and
watch. From ANY phone with write access to the space — the slot a picture hangs
in is read from the document at that moment, and a 409 is the normal outcome of
two people walking one hall from both ends, not a fault.

### The coaching, and what it will not claim

The footage cannot be re-taken, so everything the page can measure, it measures
while there is still time to act on it.

| on the screen | what it actually is |
| --- | --- |
| sharp frames | how many 160-px samples beat a floor read off this walk's own median. The same Laplacian variance `frame-stats.py` runs, so a frame the phone called sharp is one the pipeline will too. |
| "slower" | sharpness falling against what this walk has already managed — never an absolute number, or a dim hall would be nagged for five minutes. |
| "keep the floor in frame" | the rear lens above the horizon for two seconds, from gravity. Survives a refused compass. |
| directions covered | 36 sectors, filled from the compass while recording. |

**"Directions covered" is not room covered, and must never be relabelled.** A
person can turn on the spot in a doorway and fill all 36 having seen almost
nothing of the hall. What it does catch is the common failure: a walk that never
looked back gives every wall exactly one viewing angle, and one opinion is a hole.

The ring is filled from the REAR LENS's own bearing, not from `alpha`. `alpha` is
where the phone's top edge points, so a ring filled from it swings a quarter turn
when somebody turns the phone sideways for a wider shot and does not move when
they walk round a pillar — exactly backwards. `src/scan/deviceAim.js` pushes the
lens axis through the spec's rotation instead; its test pins three poses to one
bearing.

### The measured wall

The guess/measured rule reaches the phone unchanged. A step asks for one wall in
metres and a photograph of that wall, and both go into the room: the number as a
text object reading `wall · 8.30 m`, the picture beside it, so the number can be
checked against the thing afterwards. Until somebody types it the page says, in
capitals, that the size will be a GUESS.

It is an object and not a document field because `normalizeProjectDocument`
returns a fixed set of keys and silently drops everything else — an invented
field would be saved and then forgotten.

### Making the hall

`POST /api/spaces/:spaceId/place/build`, with `GET` for how it is going. **LOCAL
INSTALL ONLY**, behind the same guard as `/light` and `/ndi`
(`serverXR/src/localRuntimeGuard.js`): a hosted tier answers **404, not 403**,
and the phone says the copy is built on the studio machine. The footage still
collects everywhere, which is the whole argument for collecting it in the space.

The route copies the footage room's assets into `<data>/place/<space>/footage`,
then spawns `scripts/place/place.mjs` **detached** — it must outlive the request,
the phone's screen locking and a restart of the server. Which GPU is said out
loud in the answer: `local` when Meshroom is unpacked at `~/tools/meshroom/current`
(or `PLACE_MESHROOM`), the rented `L4` otherwise.

Its status is DERIVED every time it is asked for, never remembered:

| read from | what it settles |
| --- | --- |
| `build-status.json` | when it started, and which pid |
| `kill(pid, 0)` | still running or not |
| `build.log` | which step, off the `— 2/5 crush` lines `place.mjs` already prints |
| the `hall` project | whether the room actually arrived |

That last one is why a process that exited 0 having built nothing reads as
failed — with the tail of its own log as the reason, never a made-up sentence —
and why a restart mid-build answers correctly instead of losing the job.

### `--from-space`

The studio machine may not be the machine the space is on: a factory walked in
Yerevan against the dev tier, the copy built at home. `place.mjs --from-space
<space>` pulls that space's `sources` room back down over the API the importer
already speaks, and **implies `--no-sources`** — the phone hung those pictures on
that wall as it walked, and carrying them in again would leave two of every
photograph in one room.

## Next

- More than one rectangle of walkable floor, for a hall with side rooms.
- The lighting layer in the same space, so a rig is designed in the room it
  will hang in.
- A hall built without a rented GPU at all, when a phone with a lidar can hand
  over the mesh — the seam is already narrow enough to lose the step.
