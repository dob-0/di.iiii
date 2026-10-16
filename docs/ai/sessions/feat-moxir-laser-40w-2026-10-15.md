# feat/moxir-laser-40w-2026-10-15 — the two 40 W lasers: addresses and per-scene parts (2026-10-15, N852)

Owner (17:5x): "look we dont need any dmx charts you fouund right" — the U-Plus chart (PR #978) is in, so the two UP-LA40WF lines get
their real content. Brief: ~/work/agent-reports-2026-10-15/moxir-50/briefs/laser-40w.md; report: …/moxir-50/laser-40w-report.md.

## What changed

- Addresses: `epic-build.mjs` `dmxOf` + `--patch-only`; v2.11 rig: LA40WF U1.401 / U1.433 (32 ch), smoke U1.501 (1 ch ASSUMED).
  Proven on a scratch copy (stack laser40): 61/61 DMX units on the desk at the document's addresses. moxir-one's v2-11 is NOT
  patched (the brief allowed only the frames write there): `epic-build.mjs --patch-only --apply` + `patch.mjs --exact` is owed.
- Parts: `laser_frames.py` `laser_lines` (still / sweep / lift, 7 diode colours, base lift / yaw-in), the cubes' physics per ray.
  Base 0.6° up and 3° toward the centre line: the owner's hand aims (02:18) cross the near crane at 8.84 m (< 9.2) and line 42
  crosses the column line at 9.36 m (< 10.8 truss bottom). Written to moxir-one v2-11 v1624 → v1662, 38/38 lines with frames.
- Open: physics_check.py finds 1 leak on v2-11 that predates this branch (rig-laser-42 drawn 69.72 m, first hit 60.02 m roof deck);
  `--fix` answers HTTP 400 on the scratch copy.
