## 2026-10-04 — follow carries projects that were made empty

Seen on aylmo following dev.diiii.xyz (space `hayfilm`): six follower-only projects at documentVersion 0 never reached the host.

**Cause.** `refreshStreams` (follow/follower.js) made a project only when the host had it and the follower did not. The other direction relied on ops arriving, but a project that does not exist on the host answers 404 on its ops stream and is skipped, and an empty project has no ops. The follower also titled a made project with its id, not its title. Separately, creating a project woke no one, so a host-made empty project waited out the 20 s park.

**Fix.** `refreshStreams` makes missing projects in both directions (title as made, private stays private, a refusal warned once per project and side). `POST /api/spaces/:id/projects` nudges the follower and the space's waiters. Deletions are not carried (still owed).

**Test.** `followIntegration.test.js` "a project made empty on either side appears on both": 2 tests, both red on the base branch (fix/follow-wake-after-carry-2026-10-04), green after. `vitest run serverXR/src/follow` 73/73; `test:server-contracts` 193/193; eslint clean on the three changed files.

**Owed.** Not seen on aylmo against dev.diiii.xyz yet; the six existing projects will be made on the host on its next tick once this is installed on aylmo.

**Review fix.** Making projects in both directions would have resurrected a project deleted on one side (deletes are not carried, and the create route restores a trashed id). `refreshStreams` reads each side's trash and skips trashed ids, warning once per id. Tests: 2 more integration cases (trashed on host, trashed on follower), red on 639d8684 (2 failed), now follow 75/75, server-contracts 193/193, eslint clean.

**Sync-key check.** Reported: `GET /api/trash?space=hayfilm` with a hayfilm sync key answers 403 on dev.diiii.xyz. On a real auth-on server here the same call answers 200 for the key's own space, 403 for another, and the unscoped list excludes other spaces (new contract test); the empty-project integration tests now use that key on an auth-on host. The 403 on dev is not reproduced and not explained: owed, needs the body of the answer and dev's build (dev.diiii.xyz not touched from here). When the trash cannot be read the follower makes nothing there and says so once.
