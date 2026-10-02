## 2026-10-01 — The smart view's rig core is the densest lamp cluster

- Found on MOXIR Known · full (PONYO): the Crane and Rig cameras stood inside the hall's steel and no view framed the rig. 42 lamps on the nave columns outnumbered the 22 at the stage, the component-wise median of all lamps fell on the empty dance floor, the core came out empty (a ±Infinity box) and every preset aimed at the outline's centre.
- `smartViewGeometry.rigCore`: the centre is the lamp with most others within the radius, then that cluster's median.
- Guard: smartViewGeometry.test "is the stage cluster when the lamps down the hall outnumber it" (red on the old code). An empty box passes `< 8` / `> -8` checks, so the test asserts finite.
- `src/rigbuild/DmxProbe.jsx`: the `?probe=1` hooks also carry `camera` and `controls`, for view harnesses.
