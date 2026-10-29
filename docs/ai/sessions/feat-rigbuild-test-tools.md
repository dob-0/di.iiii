## 2026-10-19 — Agent laser test tools and wire checks, moved into `scripts/rigbuild/` ("nothing is left behind")

Owner rows N1001 and N1023. The tools an agent wrote on 2026-10-17 for the 40 W lasers and the beam work lived only in
`agent-reports-2026-10-17/`. They are now generic di.iiii scripts: no production name, no address, universe or channel in any default.

| now | was | what it does |
|---|---|---|
| `scripts/rigbuild/wire-channels.mjs` + `cue-wire-check.mjs --channels --node-follow` | `chancheck.mjs`, `nodelag2.mjs` | every lamp's static channels vs the cue's look; whether each node follows the desk. Read-only |
| `scripts/rigbuild/wire-log.mjs` | `shape-log.mjs`, `shape-log-at.mjs` | read-only logger: one line per change of a channel window, with time |
| `scripts/rigbuild/laser-axis-loop.mjs` | `la40-sweep.mjs` | X then Y sweep of one two-axis laser, found bytes restored. Dry run unless `--send` |
| `scripts/rigbuild/wire_match.py` | `shape-chart.py`, `video_align.py`, `video_at_graphic.py` | photo/video to wire value (chart, align, frames) |
| `scripts/rigbuild/browser-lamp-lit.cjs` | `green-lit-in-browser.cjs` | a lamp reads lit only inside an agent test browser; the real wire is never written |

Not moved (and why): `cdp.mjs`, `probe-pose.mjs`, `green-shots.cjs` (hard-coded paths of one worktree and one project),
`checkpoint.mjs`, `u2wash.mjs`, `wire-motion.mjs` (already covered by `cue-wire-check`), `md2html.py`, the logs.

Tests: `scripts/rigbuild/wire-channels.test.js`, `rigtools.test.js` (fake desk, restore on failure and abort, dry run uses no network),
`wire_match_test.py`, and a new case in `cue-wire-check.test.js`. Not tested: any run against real lights; the browser part of
`browser-lamp-lit.cjs` (needs a test browser); `wire_match.py` chart/align/frames on real photos and video (only its pure parts).
