## 2026-10-01 — a sync light in the space bar and a four-word join code, so two installs link without a terminal

- Built sketches A + C of `~/Downloads/di-sync-ui/sketches.html` (owner-approved, words kept). Spec section:
  `docs/architecture/SPEC_follow.md` "The sync light and joining with four words". Wiki: article `link-a-machine`.
- **A, the light** (`src/sync/`, mounted in `SurfaceBar`): `SYNCED · PONYO · 0.1 S` / `PONYO NOT ANSWERING · 2 MIN`; a
  panel with the host, last edit, files still coming, clashes today (host's version kept), Invite a machine, Stop
  following. Text rules are one pure file (`syncLight.js`); "SYNCED" is said in one case only and the test walks all
  1,152 input combinations. Facts: `GET /api/spaces/:spaceId/sync` — owner/admin, or the person at the machine when
  auth is off; never the key. `follower.js` now reports `hostAnswering`, `hostRefused`, `lastAnswerAt`, `latencyMs`
  (round trip of the small project-list read; a parked read is never used) and `convergedAt`, and publishes before a
  parked read so a quiet room is not "connecting" for 20 s. The host hears followers through `POST /machines/sync`
  (`hub.noteFollower`, never for a guest).
- **C, join**: `joinCodeStore.js` (+ `joinCodeWords.js`, EFF Short Wordlist #1, CC BY, with our cuts listed). Only a
  hash is stored; the real sync key is minted at redeem by `mintSyncKey`. 10 minutes, one space, single use,
  revocable, one live code per space. Two anonymous routes sit BEFORE the blanket write gate; wrong guesses are
  counted by the store itself because `rateLimit.js` exempts local installs. The Join form (`JoinMachine.jsx`, on the
  local home) goes through this install's own server (`follow/join.js`), which refuses itself / already followed /
  same-named space (needs merge) BEFORE spending the code.
- Seen on the real surface: two real servers (host :4361, joiner :4362, DI_LOCAL=1) + vite :5191, Chromium at 1280x800
  and 390x844 DPR 3 under the browser lock: join form -> found -> joined; light "SYNCED · AYLMO · <0.1 S"; panel;
  invite code with addresses; host killed -> "AYLMO NOT ANSWERING · 22 S" with the sketch's sentence. 390 px: chip
  and buttons 44 px tall, no horizontal overflow (scrollWidth 390), `--sbar-h` follows the two-row bar.
- Tests: joinCodeStore (17), followRoutes (10), join (9), syncStatus (5), hubFollowers (4), followerLight (4),
  joinIntegration (12, two real servers incl. auth-on and DI_LOCAL), syncLight (20), SyncLight (11), JoinMachine (4),
  plus a guest case in machines/routes.test.js. Mutation-checked: removing each guard fails its test.
- Owed, plainly: no QR (needs a library); no "2.5 GB" in the found line; no host-side "stop sharing" button (use
  `di invite --revoke`); clashes-today and host's follower list are in memory (a restart resets them); real
  Tailscale numbers not measured (loopback: 2-3 ms); the sketch's "Nothing is lost" holds only while the host's op
  log holds the gap. The first invite has a door on the space's card (Manage row), because the light itself only
  appears once something is shared.
- Workaround named: `serverXR/node_modules` here is a symlink to `~/work/di.iiii/serverXR/node_modules` because
  `di.iiii-pack-asuz` has none; the real fix is `npm --prefix serverXR ci` in this worktree.
