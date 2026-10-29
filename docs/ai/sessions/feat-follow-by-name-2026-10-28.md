## 2026-10-28 — feat/follow-by-name-2026-10-28: follow by network name (PR 4 of team-sync-by-network-name.md)

- `di follow <space> --from <label>` finds the install by beacon, DNS or last address, pins the address and keeps the name for Host, SNI and the certificate check; `di follows` shows the name and the route.
- The running follower re-resolves when a read gets no answer; join by words takes a label through the same resolver. Code: `serverXR/src/follow/{beacon,nameResolver}.js`, CLI twin `scripts/di/nameResolve.mjs`.
- Tests: `serverXR/src/follow/nameResolver.test.js`, `scripts/di/followByName.test.js`. Not done: the two-machine, internet-cut proof (r-di + aylmo); `di share` must call `beacon.announce`.
- Docs: wiki "Follow by name", SPEC_follow.md "Resolving a name", design doc §8 marked BUILT.
