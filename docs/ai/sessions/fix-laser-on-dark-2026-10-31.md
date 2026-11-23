## Laser: an On with nothing to draw says why it goes off; the desk re-posts a picture the engine lost (2026-10-31)
- The owner asked (N1585, 15:1x) "check why laser not works". The Mac's log: cube-1 ON 15:08:56, off by the 5 s dark rule
  15:09:01, while the desk had nothing live ("Nothing on the laser"). Read at 15:25: blackouts 0, every stop counter 0,
  23 °C, power scale 1; a look (muth-05-catacomb) live since, the desk's frame 0.1 s old, the cube Off.
- `laserOnDark.test.js` replays 13 sequences on the real desk + engine against a fake cube: On with nothing live, after
  a Release, or after a restart (the live look is not kept) goes off at 5 s, by design (R2); a lit look live plays in
  every other sequence (still look, Off/On, 12 s off, Disarm all, Blackout lifted, engine rebuilt).
- Bug found and fixed: a dark desk picture (all off the field) cleared by a Blackout from another page was never posted
  again (`alive()` answered `kept: false`, the desk counted it as sent), so the cube went off 5 s after the next On.
  `laserDesk.js` now posts the picture again on `kept: false`.
- Said on the page: the engine keeps `offBy` (dark-idle, out-let-go) until the next On and reports `darkOffInMs` and
  `guard.darkIdleMs`; the desk shows the countdown and the reason in the Looks head, on the cube's card and in Setup.
  No guard value changed. Wiki (the laser desk) and known-fixes updated.
- Tests: laser + routes 298 passed (15 files); 6 new tests fail on the code before. Page seen on the agent screen with a
  stubbed server, desktop and 390 px phone (no horizontal scroll). Not tested: the real cube, the Mac's page.
