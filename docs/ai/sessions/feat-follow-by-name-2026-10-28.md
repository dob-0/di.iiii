## 2026-10-28 — feat/follow-by-name-2026-10-28: follow by name (plan PR 4)

- `di follow <space> --from <label>` finds the install by beacon, DNS or last address and keeps the name for Host, SNI and the certificate check; `di follows` shows the name and route.
- One resolver (`serverXR/src/follow/nameResolve.js`) serves the CLI, the running follower (re-resolves when the host stops answering) and join-by-words; the share beacon is `beacon.js` (PR 3 had not pushed its own).
- 36 new tests, incl. a real TLS pin on loopback; wiki "Follow by name"; design doc §8 BUILT, SPEC_follow resolver paragraph.
- Owed: two-machine offline proof (r-di + aylmo); zone still the default `di-studio.xyz` pending the owner; PR 3 should call `beacon.announce`.
