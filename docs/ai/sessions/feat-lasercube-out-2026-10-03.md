## 2026-10-03 — a LaserCube in Raw: Laser + LaserCube Out nodes, drawn by the local server

- Asked by the owner on NOPA day (Hayfilm, 3 Oct): drive the hosq LaserCube from di.iiii over the
  network, "like the TouchDesigner project" (a Laser CHOP + a custom LaserCube component), not LaserOS.
- Server: `serverXR/src/lighting/laser/` — `protocol.js` (UDP 45457 commands / 45458 points, ported
  from the MIT TouchDesigner script NairoDorian/Laser-Cube-TouchDesigner, notice kept; libLaserdockCore,
  GPL-3.0, was not read), `shapes.js` (look → evenly resampled frame, blank return on open shapes, a dot
  drawn blank, points past the edge blanked), `lane.js` (60 frames/s, sends only while the cube answers).
  Mounted at `/laser` by `routes/laserRoutes.js`: local runtime only, built on first use, OFF at start.
- Safety the TouchDesigner script lacked: OFF disables the cube's output and clears its buffer (sent
  twice); a 3 s dead-man when the page goes quiet; SIGTERM/SIGINT (di down) switches the cube off before
  exit, registered only once a lane exists; every value clamped. A kill -9 or a pulled cable cannot send OFF.
- Raw: `laser.shape` ("Laser") makes a look; `device.laser.out` ("LaserCube Out") is a panel with one big
  switch, cube IP + rate, the cube's status, and a picture of the exact frame (`POST /laser/api/preview`).
  ON only by a click or a wire's edge — opening a project never fires a laser. vite proxies `/laser`.
- Proven: 15 tests against a fake cube on 127.0.0.1 (sabotaging OFF fails 3); in Firefox on a scratch
  di-dev tree against a fake cube: ~29,000 points/s at 30,000 pps, OFF seen at the cube, 0 console errors.
- NOT done: no real cube yet (test plan: Ethernet to aylmo, cube at 192.168.1.1, low intensity, nobody in
  front — ON/OFF, close the tab, di-dev down, pull the cable); no wiki entry; no phone look; no PR.
