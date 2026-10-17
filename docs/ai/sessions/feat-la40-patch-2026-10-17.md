# feat/la40-patch-2026-10-17 — the two 40 W lasers (UP-LA40WF): the 3D follows their X/Y, and their shapes

## 2026-10-17 — the room moves a DMX laser's picture with its X/Y; no shape chart is published, so the owner photographs one
- The owner, at the MOXIR hall: "lets togheter patch the laser 40w", then "and can you add movement in 3d that i can sync that".
- Found: the room never read a 40 W's X/Y back (dmxDecode said "never read back"), so the 3D line stood still while the real
  laser moved. An earlier chat's report that "the 3D moved too" was wrong.
- Built: dmxDecode reads cap.aim back as degrees on the unit's own scan axes (the exact inverse of encodeDmx; bytes above
  the by-hand range = the unit's auto motion, drawn at centre and noted); dmxPose shifts the picture in its field
  (laserAimShift); the room's reach probe measures each ray to its first surface again. Per-lamp switches fixture.aimSwap,
  aimInvertX, aimInvertY in both schema twins, set only from a measurement with the owner.
- Measured: dmxDecode + dmxPose tests 42 green; src/rigbuild, src/shared, src/objectComponents 2034 green; eslint clean.
  Real browser on the agent screen with the live desk: the green 40 W's drawn rays at X 64 / 125 / 0 had local x of about
  −0.13…0.13 / 0.19…0.32 / −0.32…−0.19, the real laser kept dark (its wire dimmer read 0 before and after).
- Shapes: no chart exists online (maker page, its 1 822 downloads over 67 pages, the IP-LL30 PDF's pictures, six web
  searches, GitHub code search). The maker page gives "TTL Scanning angle: Max 60°" (unmeasured). The owner photographs each
  graphic to di.bo while moving the desk's Fader page (U2 ch 139); a wire log matches each photo to its value by time,
  because di.bo still drops texts (ledger N650).
- Owed: the sync test with the owner on the real units (which switch, if any); the scan half-angle measured (18.5° ASSUMED);
  the graphics chart sheet into docs/moxir/devices/; encodeDmx does not yet apply the per-lamp switches (a look's pan/tilt
  for a swapped unit would move the real beam on the other axis — fine while the show keeps the 40 W static at centre).
