## 2026-09-30 — Strobe rate is a capped field, not a constant

Branch `fix/strobe-rate-cap`, from `preview/rigbuilder-11-2026-09-30`.
Finding (ground-scenes agent): the desk hard-coded 10 Hz for every strobe-category fixture
(`LOOK_STROBE_HZ`), and the room drew 10 Hz too (`STROBE_HZ`). The owner's rule for these
shows is at most 3 flashes per second in any look; a future strobe group would have breached it silently.

- **One number** — `src/rigbuild/strobeCap.js`: `MAX_STROBE_HZ = 3`, `capStrobeHz()` (clamp to
  [0, 3], junk = 0), `lookStrobeHz(look)` (a look's optional `strobeHz` clamped; "strobe on"
  with none stated = the cap; was 10).
- **Desk** — `deskLookValues.js` writes `lookStrobeHz(look)`; the constant is gone.
- **DMX** — `encodeDmx` maps the CAPPED Hz through the fixture's own strobe/rate table, so the
  value written can never decode above 3 Hz. A profile with no table for that rate writes
  nothing (fail safe: the shutter stays as it was). The task allowed a proportional fallback for
  profiles without a table; none was built, because without a real table the top of the range is
  unknown and "proportional" could not be shown to stay under 3 Hz. OWED: real per-fixture strobe tables.
- **Room** — `strobeEnvelope` clamps (default = the cap; the old 60 Hz ceiling is gone), and
  `dmxPose.js` clamps `rigFlash.hz` and `beam.strobeHz`, so a console sending 25 Hz is still drawn at 3.
- **Tests** — `strobeCap.test.js` (new, 5) plus three existing tests that asserted 10/25 Hz now
  assert the cap. `src/rigbuild`: 662 pass with the change; 7 fail with only the four source
  files reverted (655 pass). ESLint on touched files: 0 problems.
- **Guideline** — the 3 flashes per second figure follows the widely used photosensitive-epilepsy
  limit (WCAG 2.x SC 2.3.1, ITU-R BT.1702). UNVERIFIED: recalled, not read from the documents;
  neither is in the repo. Check the text before quoting it anywhere.
- **Not done / owed** — NOT seen on a real screen or fixture (no browser, no rendering this run).
  Scenes and looks data untouched: `strobe-hit` and the other looks carry no `strobeHz`, so they
  now play at 3 Hz. Strobe scenes must be marked (the owner's rule): no marking was added here.
  TODO (not built): an explicit override for a venue with a signed waiver.
