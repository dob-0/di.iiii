## 2026-11-17 — Monitor: the Pull requests panel names the repo, so it works on the installed server

- Cause: `gh pr list` ran in the server's working directory; the installed di runs from `~/.di/current/serverXR`, which is no git checkout, so the panel failed with "not a git repository" and the page showed "Open PRs —".
- Fix: `monitorStore.js` passes `--repo` (default `dob-0/di.iiii`; `DI_MONITOR_REPO` overrides for a fork).
- Guard: `monitorStore.test.js` "the PRs panel names the repo ..." (15 store tests pass). `known-fixes.md` entry added.
- Owed: the running server shows the panel only after the next install of dev's commit; a live look on the owner's screen after that.
