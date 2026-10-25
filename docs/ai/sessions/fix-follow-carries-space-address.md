# fix/follow-carries-space-address

## A follow carries the space's address from the host

- 2026-10-25 (N1279): after Dilijan moved to /dilijan-camp on dev, the own di still had /dilijan; a follow carried the
  space's label, visibility and front door (followSettings.js, 10-05) but not its slug. The own di was set by its API.
- Fix: `planSettings` returns the host's chosen slug (slug equal to the id = none chosen) as `slug`, apart from the patch;
  a host with none never clears this copy's. `follower.js` sends it in its own PATCH, so a slug taken here (409) is said
  once and does not hold back the label or the door. Host -> follower only, as for every space setting.
- Tests: followSettings.test.js (4 new), followIntegration.test.js "the host's space address reaches this install too"
  (two real servers; fails on dev's code after 15 s, passes here). src/follow: 18 files, 229 tests passed.
