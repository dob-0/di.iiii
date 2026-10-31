## Laser: On stays On until Off; the 5 s dark rule stays as a mode (2026-10-31)
- The owner (N1591, 16:1x): "fix and delete all that safety things there when i work on other softs there are nothing
  hard to much". The 5 s dark rule (R2) switched his cube Off twice that day: On came before a look was live. The lead's
  split: the friction goes now as a mode (rule: nothing we have is ever lost); the eye-safety guards stay until he answers.
- `laserEngine.js`: option `darkOff: 'auto' | 'never'` (library default `'auto'`, unchanged for every caller and test; an
  unknown value throws at creation, as `signOff`). `'never'` skips only the dark rule: an armed cube with nothing lit
  stays armed and draws blank points until Off, Disarm all or Blackout, or another guard stops it. `state()` says
  `darkOff`; each cube says `nothingToDraw`; `darkOffInMs` is null in `'never'`.
- `laserRoutes.js`: the lane reads `DI_LASER_DARK_OFF` once at start; `auto` keeps the 5 s rule, anything else is
  `'never'`, the product's default from now on. Undo: start the server with `DI_LASER_DARK_OFF=auto`.
- `desk.js`: the countdown and "Off: it had nothing to draw" only in `'auto'`; in `'never'` the cube's card says
  "On, nothing to draw. Pick a look." The page's Safety list and the wiki say both modes.
- Unchanged: FRAME_TIMEOUT_MS, the still-beam guard, disarmed at every start, over-temperature and link-lost stops, the
  token guard, requireSameMachine, the sign-off mode, zones, the Out-let-go rule (review E2).
- OPEN, measured: a cube's own On on the desk is held by the desk's Out (`'desk'`); with nothing live the desk does not
  tick, its claim lapses after CLAIM_TTL_MS (10 s) and "its Out let go" switches the cube off. All on (no Out holds the
  cubes) stays on. Recorded by the test "a cube's own On from the desk with nothing live" in `laserOnDark.test.js`.
- Tests: laser + routes + shutdown contracts + wiki 372 passed (22 files); 9 of the 11 new tests fail on the code
  before (the other 2 check that the signal-loss and still-beam stops still fire in `'never'`). Not tested: the real
  cube, the Mac's page, the page on the agent screen.
