## Laser: Arm is one click; the sign-off phrase kept as a mode (2026-10-31)
- The owner asked (2026-10-30 to the Mac agent, repeated 2026-10-31) to remove the typed laser sign-off phrase; his
  no-limits rule keeps one tap of approval, and On is that tap.
- `laserEngine` takes `signOff: 'click' | 'phrase'` (library default phrase, so every caller is unchanged); `state()`
  says the mode; in click mode `arm` and `armOne` no longer ask the phrase; an unknown mode throws at creation.
- The lane (`laserRoutes`) reads `DI_LASER_SIGN_OFF` once at start: `phrase` keeps the older way, anything else is
  click, the product's default from now on by the owner's word. Nothing is lost: one env var brings the phrase back.
- The desk's All on posts at once in click mode; page copy and the wiki (Laser Out, the laser desk) say both modes.
- Not in scope: the show player's still-beam approval (`POST /laser/api/show/still`) keeps its phrase.
- Tests: engine click mode (all + one cube with no phrase, state says the mode, library default phrase, bad mode
  refused); routes click default and phrase via the env; `laserOps` and `laserOut` suites, which test the phrase
  itself, run in phrase mode. Laser + routes + wiki: 307 passed. Not tested: the desk page in a browser, a real cube.
- Built for the Projector Room Mac as a test copy on top of the archive branch it runs (0.4.4-look.9e2028c7).
