## 2026-11-19 — `di monitor report` works from an installed di

- `scripts/di/monitorReport.mjs` found `serverXR/` two folders up. In an installed di the file lives in `cli/`, one folder under the root, so the sender failed with "Cannot find module .../versions/serverXR/src/monitorStore.js" on 0.4.4-dev.201dc681.
- The root is now the nearest parent holding `serverXR/src/monitorStore.js`; the timer's cli path is the sibling `cli.mjs`; the release manifest is read from `serverXR/release.json` or the install root.
- Tests: two new layout cases (repo, installed) in `monitorReport.test.js`; the file passes.
- Not done: a live send to the dev tier, and the sender timer on each machine, both need this fix released first.
