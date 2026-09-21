# A space IS a place

A room somebody stood in becomes a room anybody can stand in. That is the
whole idea. This document says what "the place pipeline" is for, what it is
made of, and the two rules that keep it honest.

The tools live in `scripts/place/`. Nothing in `src/` or `serverXR/` changed
to make this work — the platform already had everything a room needs.

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

## Next

- A phone scan instead of a rented GPU, same five steps minus one.
- More than one rectangle of walkable floor, for a hall with side rooms.
- The lighting layer in the same space, so a rig is designed in the room it
  will hang in.
