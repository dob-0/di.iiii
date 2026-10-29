# MOXIR — versions of the show model

One number per state of the model we built, so everyone means the same thing. The owner set the scheme on
2026-10-07 ("diiii.localhost/moxir/beta v0.9 — what version is what we did"). A version is a model state the
owner looked at; anything rejected keeps its number and is marked so. Sources: the ledger
(~/work/OWNER_REQUESTS_2026-09-30.md, rows N205–N291), PRs #816 / #822 / #823.

| Version | What it is | Where it lives | Made from |
|---|---|---|---|
| v0.5 | **Known · full**, the version live on dev today: the hall as of 10-02, the crane over the DJ at the press end (z 4.8), the cut LOW house left / HIGH house right (the 09-29 cut) | dev + local: `moxir-hall-known-full` | 09-29 rig, PONYO 10-04 |
| v0.6 | **The space fixed**: hall v5 — lanterns ±6.0…±46.9, end walls in (108.2 m long), crane girder 7.95 m (assumed for the near crane) | scratch `moxir-known-full-flip` (archived) | PR #822 |
| v0.7 | **The metal around the bags**: hall v6 → v8 — blower moved 3 m, two ducts, elbow + hopper, roller conveyor (owner's mark); show hall without the prefab cabin (v8-show) | hall GLBs in /mnt/data/footage/place-moxir-hall-v6…v8-show-2026-10-07 | PR #822: 804cf20d, 6ba77270, bea825f8 |
| v0.8 | **The stage on his line**: stage line z 24.5 (his marks on video 954), DJ centred on a 0.4 m step, PA ±5.4 m, crane z 24 with the cut over the DJ | scratch `moxir-known-full-stage24` (archived) | PR #823: 15e5804a |
| v0.8-x | rejected: the cut FLIPPED as a backdrop behind the DJ (crane z 21) | scratch `moxir-known-full-stage-back-flip` (archived) | PR #823: 0ffbf18b |
| **v0.9** | **MOXIR beta**: the cut as today (not flipped) hung BEHIND the DJ, crane z 21, moved toward house left (owner: "a bit left") | scratch `moxir-known-full-stage-back`, address `/moxir/beta-v0-9` (slugs are a-z 0-9 -; `beta` is reserved) | PR #823: ab9fad91 |
| **v1.0** | **MOXIR v1.0, the epic lights (elite + minimal)**: v0.9 + the owner's placement picks (all advised options, 10-08) + the independent review's fixes (one matte beam-stop panel behind the DJ for all 12 laser lines, the cubes' cold and E-stop plan, the haze we can get, the blinders capped, the PA re-placed) + 6 signature moments over 4 acts, ash white and ember red only, 2 layers (3 at the peak), ≤ 30 kW running. Plan A1 = both cranes moved (near z 21, far z −41) if seen moving and inspected; Plan B1 = ground support. The tape numbers are still ASSUMED (girder 7.95 m, cab, pipe racks, conveyor, press crown, cube wattage, hall temperature) | scratch copy `moxir-v1-0` (title "MOXIR v1.0", slug `v1-0`), built only on the owner's go; design in `scripts/place/rigs/moxir-epic-2026-10-08.json`, page `~/Downloads/moxir/stage/epic/epic.html` | PR #823: `scripts/place/moxir_v1.py` |
| v1.1 | v1.0 after the 10-08 tape: every ASSUMED value replaced by its measured number and the plan (A1 or B1) decided by what the cranes did on the visit; then built into dev in place, backup first | dev `moxir` | owed |

## Addresses

- On this machine (aylmo), the test server: http://diiii.localhost/moxir/beta-v0-9 once di-atlas PR #57 is live and `di-dev front moxir-flip` is set (today: http://moxir-flip.dii.localhost/moxir/beta-v0-9).
  `*.dii.localhost` names come from `di-dev` (one per working tree); the host is the tree's name.
- For everyone else: nothing on localhost reaches them. v0.9 reaches the team when it is built into dev
  (https://dev.diiii.xyz/moxir) — after the owner's OK, by ops, with a backup first.
