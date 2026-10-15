## 2026-10-14 — The standard move's agent probes, migrated into scripts/nav ("nothing is left behind")

The probes that agents wrote for the standard move (PR #919) on 2026-10-13 lived only in an agent-reports folder. They now live in
`scripts/nav/`, with no production name in any default: every URL comes from an env var, and MOXIR's 12 camera places and poses are
the fixture `scripts/nav/fixtures/moxir-v1-1-places.json` (which project it fits, its source and date inside).

- `probe-constant-speed.cjs` (a wheel notch and a 200 px slide in four directions at each place, both Studio tools)
  + `compare-speed.cjs` (two of its outputs into a before/after table)
- `discover-places.cjs` (what is around the opening view, to write a fixture for another project)
- `probe-review1.cjs` (the first review's cases: slide pressed mid-glide, turn after a notch, fly after Walk, the viewer's pinch)
- `probe-dead-pan.cjs` (a Navigate pan right after an orbit must move, and the orbit release must not select)
- `break-move.cjs`, `break-fuzz.cjs` + `lib/break-kit.cjs` (skeptic and random-input checks that a notch, slide or turn stays even)
- `lib/common.cjs` (fixture loader; reads freeMove.js and mappings.js of this checkout, so the expected numbers come from the code)

First browser run, 2026-10-14, RTX 3080 agent screen, MOXIR v1-1 on the #919 build (reduced sizes):

| probe | result |
|---|---|
| discover-places | opening camera, limits 0.0005 m to Infinity |
| probe-constant-speed (P01, P07) | tools ok; notch 2.724 m; slide 6.819 m in all four directions |
| compare-speed | reads both runs; places match |
| probe-review1 | turn after a Shift notch: 13.619 m; fly 2.68 m before and after Walk; viewer pinch 2.72 m ×10 |
| probe-dead-pan (NAV_SPOT=0.5,0.62, 5 runs per arm) | orbit release then pan: 0 selected, pan 14.84 m (alive), with or without Esc; a plain click still selects (control 5/5) |
| break-move (base, glide, slide) | 149 rows, 0 flagged |
| break-fuzz (10 steps) | 80 rows, 0 flagged |

`probe-review1`'s R1 still shows the known ~40 ms frame at a mouse press mid-glide: the largest frame step is 1.1 m against
0.65 m before the press. The speed per ms is unchanged; this is a separate owed item. Not migrated, with reasons, are listed in the
owner's ledger (N619.2).
