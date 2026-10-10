## 2026-10-09 — the 30-day space sweep never deletes a space this machine follows

- Cause: a follow does not carry a space's `permanent` mark, and `pruneSpaces` hard-deletes every non-permanent,
  non-global space untouched for `SPACE_TTL_MS` (30 days). A follower whose hub was quiet for a month lost the space.
- Measured on the owner's install (aylmo) the same morning, read-only from `di.db` + `follows.json`: 12 of 30 followed
  spaces were not permanent; br-id-ge (74 projects) was within hours of deletion (marked permanent by hand at 07:50);
  cascade, di-laser and the-light-put-back were 9.3 days away, support 11.6.
- Fix: `createSpaceStore({ keptSpaceIds })`; `pruneSpaces` skips those ids and returns the ids it removed. `index.js`
  passes the keys of `follows.json`, read on every sweep so `di follow` / `di unfollow` count without a restart. The
  sweep now logs `[spaces] removed N space(s) …` — it used to delete without a word.
- Test: `spaceStore.test.js` "never reaps a space this machine follows…" fails on the old store (no return value, no
  keep list), passes with the fix; spaceStore + trash + archive contracts + follow suites 160/160.
- Still owed, not in this branch: a follow could also carry `permanent` from the hub; on dev itself `support` is
  `permanent: false` and idle 18 days, so dev's own sweep would take it — an admin decision, not code.
