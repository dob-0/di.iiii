## 2026-10-15 — land batch: 14 finished PRs on dev as one branch

- What landed: #937 #926 #917 #916 (docs and features), then the root bumps #955 #953 #949 #947 #945 and the action bump #950, then the serverXR bumps #954 #952 #951 #948. Each merged `--no-ff` from its head branch onto `origin/dev` (6f614281), so GitHub marks each original PR merged.
- Left out: #934 (conflicts with #936, merged 10-15; owed), #946 (a failing check), #910 (conflicting), every draft.
- Conflicts: only `serverXR/package.json` / lockfile at #951 and #948 (adjacent dependency lines). `package.json` merged to the newer versions (dotenv ^18.0.7, express ^5.3.0), the lockfile regenerated with `npm install --package-lock-only --ignore-scripts` in `serverXR/`, never by hand.
- Measured (after `npm ci` in root and serverXR): `npx vitest run` 933 files, 10656 passed, 7 skipped, 0 failed; `npm run lint` 0 errors (103 warnings, as on dev); `npm run docs:ai:check` run after this note.
- Note for the next lander: the shared `~/work/di.iiii/node_modules` was older than dev and lacked `proper-lockfile`, `uqr`, `jsqr`; with it 201 tests failed on missing modules. A landing worktree needs its own `npm ci` in both directories.
