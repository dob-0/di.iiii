## 2026-09-28 — view B, the plot: `/{space}/plot/{project}`, the room beside it, sheet 1

- Owner chose all three build views; "start B now". Sketch B at
  `~/Downloads/moxir-build-sketches/sketches.html`. Method and what was checked:
  `docs/architecture/RIG_BUILD.md` §10. Stacked on #602 (`feat/rig-mvr`) as three PRs:
  `feat/rig-plot` (the plot editor), `feat/rig-plot-room` (the room pane, phone toggle),
  `feat/rig-plot-print` (sheet 1).
- New data: `components.venuePlan` (both schema copies, parity test) — derived from the hall
  JSON by `venuePlanFromHall`, never drawn. `snap()` gained `metric: 'plan'` and piece
  heights (`pieceWithHeight`, height = catalogue × scale.y).
- MOXIR test on an own stack (server :4371, vite :5371, data = a COPY of the space exported
  from the local tier into the session scratchpad): `scripts/rigbuild/load-plot.mjs` wrote
  the v2 + DJ hall's plan, the goalpost and riser as 8 pieces, and 104 typed lamps as ops.
  In the UI: a 12 m run drawn, two towers under it, two BSW hung → the desk patched them
  #47 U1.445 and #48 U1.469; a tower moved; an overlapping address drawn dashed with "!".
- Fixed on the way (base, #596): a refused typed address was overwritten by the desk's old
  one (`writeBackOps`); known-fixes row + guard seen failing.
- Found on the way: the room's Canvas threw without WebGL and took the page with it — the
  room now fails alone behind a boundary. The first room camera sat outside the end wall
  on a phone — now clamped inside the walls at 6 m.
- Thermal: plan shots headless with `--disable-3d-apis` (no software GL at all); the room
  only in a headed Chromium on the RTX 3080 via PRIME, renderer string checked on a blank
  page first. One browser at a time; waited below 85 °C (it touched 100 °C once, idle load
  1.6 — a spike). Shots: `~/Downloads/rig-plot/`.
- Trap: a server started with `nohup … &` from a tool call died silently within minutes (no
  error in its log) — run it under the tool's own background runner.
- Owed: a click in the room → plan selection not driven in a test; bodies per lamp;
  position callouts; rental-list counts in the document; flown-truss rigging points.
