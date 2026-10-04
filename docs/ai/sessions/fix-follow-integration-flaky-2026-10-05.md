## Follow integration tests: flaky on CI (2026-10-05)

**Symptom.** `serverXR/src/follow/followIntegration.test.js` failed a different test on each of three CI runs
(#760 twice: "carries an edit made on the host" and "never applies the same op twice" with `expected 3 to be 4`;
#763: "agrees on the host's value when both sides change the same field"). Dev and aylmo runs passed.

**Root cause (one, in the tests).** Since #757 a follow with no saved cursors starts from now. "Now" is taken by the
follow's first tick (`runStream`, `fromNowPending`), a moment after `startFollowing()` returns. The tests wrote
their first edit straight after starting the follow. On a slow runner the edit landed before the baseline, counted as
history, and was never carried:
- "carries an edit made on the host": the lamp never arrives, `settle` times out.
- "never applies the same op twice": the lamp is missing on the follower, so 3 edits instead of 4.
- "agrees on the host's value": `op-box` never arrives (`settle` at the first wait).

**Fix.** A `started(follower)` helper waits on the real state (`follower.state.status` leaves `starting`, which the
follower only does after the first tick has taken its cursors) before any write. Applied to every first-start follow
in the file that writes right after starting. No timeouts shortened, no assertion weakened. No change to follower.js:
start-from-now is the designed behaviour; a user's edit in the instant between `di follow` and its baseline being
history is a limit, not a bug in the rule (owed if the owner wants the baseline taken at the call, not the first tick).

**Measured.** No before/after pass rate under artificial load: the coordinator stopped the load runs because aylmo has a
fan fault (package hit 100 C). The first local run on aylmo before the fix passed 35/35 as already reported; proof is by
reasoning (above) and by GitHub CI on the pushed branch (re-runs listed in the PR). Owed: a before/after rate on a
machine that can take load.
