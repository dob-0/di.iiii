## 2026-09-29 — the client image copies the git-hook installer before npm ci

- Every dev deploy since #612 failed building `dii-client`: `npm ci` runs `prepare`
  (`node scripts/install-git-hooks.mjs`), and the Dockerfile had copied only
  `package.json` and the lock file at that point → `Cannot find module
  '/app/scripts/install-git-hooks.mjs'`.
- Fix: `COPY scripts/install-git-hooks.mjs scripts/` before `RUN npm ci`. The script exits 0
  outside a git checkout (run alone in an empty directory: exit 0). The server image is not
  affected: it installs `serverXR/package.json`, which has no `prepare`.
- Not built locally (no Docker on aylmo when written); the deploy run on merge is the check.
