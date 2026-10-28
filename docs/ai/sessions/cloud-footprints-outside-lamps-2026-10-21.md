## 2026-10-21 — footprints: a lamp outside the hall takes its building hit from hall-reach (N525)

- `scripts/rigbuild/footprints.mjs` `castRay`: for an origin outside the hall's open volume (`makeBuilding().inside(from)`), the building hit is
  `hall-reach.mjs` `hallFirstSurface` on the record's dims.shell (ONE SOURCE, owner rule 2026-10-13): the floor, the ground outside, a shell slab
  (class roof / wall, the slab's face normal from `rayBox`), or nothing within maxReach (open air). Before: about 0.2 m against anything.
  The hall solids are still met; same return shape. A record without dims.shell is refused for an outside lamp, with hall-reach's reason.
- Tests: 6 new in `footprints.test.js` on `scripts/place/rigs/moxir-hall-2026-10-12-v13-skin.hall.json` (hall-reach `HALL_FILE`): ground outside 5 m,
  far end wall outer face 15.9 m, deck from above 16.5 m, open air, a nearer solid at 8 m, the refusal. Each throw `toBe` hall-reach's. All 6 red on dev's
  `footprints.mjs`. footprints 26/26, hall-reach 14/14, hall-shell 4/4 green.
- Inside origins: unchanged code path; the two ground versions (1590 lamp casts, none outside the hall) still pass their surfaceHit comparison.
- Not done: a ray from outside that enters the hall through an opening (the far gate: (0, 1, -70) aimed +z reads open air). physics_check.py not run
  (needs a running di and the show project). The default output dir `~/Downloads/moxir-devices` and the 'MOXIR' header in `toMarkdown` are a
  production name in code defaults: a separate row, not touched.
