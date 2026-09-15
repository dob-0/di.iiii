## 2026-09-16 — Land facade-page-faults (#464) as a follow-up batch, resolving the SpaceHub overlap with #465

#464 (`fix/facade-page-faults`) was approved after the four-PR batch (#466, land onto
`dev` via `land/facade-wave3-2026-09-16`) had already merged and gone green
(#461 #462 #463 #465). #464 was BEHIND that new `dev` and overlapped #465 on
`src/studio/components/SpaceHub.jsx` and its test.

Rebuilt on the fresh `origin/dev` in a fresh sibling worktree, `git merge --no-ff
origin/fix/facade-page-faults`: the auto-merge (git `ort` strategy) resolved
`SpaceHub.jsx`/`SpaceHub.test.jsx` cleanly with no conflict markers, keeping both
intents — #465's `useAuthSession` session-scope refresh (`sessionScopes`,
`openSpaceId`, `sandboxSpaceId`) and #464's visitor-filter hide (`isVisitor` /
`sandboxCard`) built on the new `arrangeable` derived list. Verified both sets of
identifiers are present post-merge; `npm run lint` and `npm run test` both green
on the merged tree.

This branch does not touch `CURRENT.md`/`PROGRESS.md` — the fold happens at merge
time via `npm run land` on `dev`, per the standing session-notes protocol.
