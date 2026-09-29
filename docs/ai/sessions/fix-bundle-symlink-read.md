## 2026-09-29 — a crafted bundle can no longer read files outside the data root

- Security audit C1: bundle import refuses links (archive listing + lstat walk); asset serving refuses non-regular files. Guards: `scripts/space-bundle.test.js` "refuses links", `serverXR/src/spaceStore.symlink.test.js` (4/4 red on the old code). Hotfixed to `main` the same day.
