## 2026-09-20 — the flake that cried wolf

`SpaceHub.test.jsx`'s thirteen-card tests went red on three unrelated branches in one
day (#499, #506, and a local full-suite run) and passed alone every time, so each was
written off as noise. The cause was arithmetic, not timing luck: two of its waits are
allowed 8s by `waitFor`, inside a test vitest gives 5s. The inner budget could never be
reached, so under load the test died and reported the behaviour as broken.

- `vi.setConfig({ testTimeout: 20000 })` once at the top of the file — the cost is the
  thirteen preview iframes the file mounts, which is a property of the file, not of the
  one test that lost the race.
- Watched: four consecutive `npx vitest run src/studio` runs, 262/262 each.
- The general rule, now in known-fixes: a `waitFor` timeout longer than the test timeout
  containing it is always a bug.
