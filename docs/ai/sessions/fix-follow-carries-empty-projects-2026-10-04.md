## 2026-10-04 — follow carries projects that were made empty

Seen on aylmo following dev.diiii.xyz (space `hayfilm`): six follower-only projects at documentVersion 0 never reached the host.

**Cause.** `refreshStreams` (follow/follower.js) made a project only when the host had it and the follower did not. The other direction relied on ops arriving, but a project that does not exist on the host answers 404 on its ops stream and is skipped, and an empty project has no ops. The follower also titled a made project with its id, not its title. Separately, creating a project woke no one, so a host-made empty project waited out the 20 s park.

**Fix.** `refreshStreams` makes missing projects in both directions (title as made, private stays private, a refusal warned once per project and side). `POST /api/spaces/:id/projects` nudges the follower and the space's waiters. Deletions are not carried (still owed).

**Test.** `followIntegration.test.js` "a project made empty on either side appears on both": 2 tests, both red on the base branch (fix/follow-wake-after-carry-2026-10-04), green after. `vitest run serverXR/src/follow` 73/73; `test:server-contracts` 193/193; eslint clean on the three changed files.

**Owed.** Not seen on aylmo against dev.diiii.xyz yet; the six existing projects will be made on the host on its next tick once this is installed on aylmo.

**Review fix.** Making projects in both directions would have resurrected a project deleted on one side (deletes are not carried, and the create route restores a trashed id). `refreshStreams` reads each side's trash and skips trashed ids, warning once per id. Tests: 2 more integration cases (trashed on host, trashed on follower), red on 639d8684 (2 failed), now follow 75/75, server-contracts 193/193, eslint clean.
