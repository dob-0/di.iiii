## 2026-10-01 — show-clock sends each server its own key

Found while restarting moxir-hall-minimal's show clock on dev after `tier-sync` pushed the project: `--token-file
serverXR/.env.local` gave dev the LOCAL key (401). `tokenKeysFor(api)` now picks by host (dev LIVE_API_TOKEN, prod
PROD_API_TOKEN, local ADMIN/API), the same mapping as tier-sync's TIERS; a file without the right key stops with its
name. Guard `show-clock.test.js` (4). Seen: `--check` against dev with that same file reads the running show.

## 2026-10-07 — brought current with dev (bug sweep, lane M2)

- The branch was 338 commits behind `dev` and GitHub showed it conflicting. `git merge origin/dev` into the branch gave
  one conflict, `docs/ai/known-fixes.md`: dev and this branch each added rows at the top of the same table. Both kept,
  dev's seven rows first and the show-clock row after them. No source file conflicted: `show-clock.mjs` and its test are
  this branch's change on top of dev, unchanged. `scripts/tier-sync.mjs` on dev still maps local `API_TOKEN`, dev
  `LIVE_API_TOKEN` and prod `PROD_API_TOKEN`, the mapping `tokenKeysFor` copies.
- The branch's last CI run was green. Nothing is undone.
