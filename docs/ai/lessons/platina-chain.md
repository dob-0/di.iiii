# Platina chain lessons (owner N3921, 2026-11-12)

The owner kept finding by hand what a check could name at the start: "I open the light desk and there is no patch."
Each row below was found by him first, in the order it happened. `scripts/rigbuild/place-ready.mjs` now checks all of them in one read-only command.

| Found by the owner (ref) | Gap | Check in place-ready |
|---|---|---|
| N3898 | the desk held another space's show (MOXIR), no Platina patch | desk-show, desk-patch |
| N3905 | the room opened in the bird view | room-view |
| N3905 | pixel bars drew as dots (the installed di strips beam.emitter) | bar-shape |
| N3915 | the room wall showed "Surface 1", the deck was purple | wall |
| N3918 | lamps drew as stand-ins (the serving tree lacked the glb models) | models (--tree) |
| N3886/N3917 | deck columns pointing at no cue | deck-columns |
| K15 | maker DMX chart behind a login, lamps get no values | desk-looks |

Rule: at the START of a place or project job, run
`node scripts/rigbuild/place-ready.mjs --api <api> --project <id> --space <space> --tree <tree that serves the room>`
and fix every FAIL before building. Exit code 1 on any FAIL.
First live run (platina-screen, 11-12 04:45): 7 pass, 2 fail (bars: the lead's install; 2 hazers carry no look value).
Before this, the same gaps were found one by one by the owner over about 6 rounds.
