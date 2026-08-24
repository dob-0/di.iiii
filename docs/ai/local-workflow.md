# Working locally, and what "synced" actually means

Nothing on a dev box pulls anything by itself. Four separate things can be behind,
they go behind independently, and until 2026-08-22 only one of them ever said so.
This is the order to put them in, and what each step does *not* cover.

## The four channels

| Channel | What goes stale | Does anything tell you? |
|---|---|---|
| **Code** | the git tree, `node_modules` vs the lockfile | tree: yes, at `npm run dev`. **deps: nothing, ever** |
| **Data** | `serverXR/data/di.db` — spaces, projects, assets | missing spaces: yes, at `npm run dev`. **stale content: nothing** |
| **Config** | `serverXR/.env.local` vs `.env.example` | no |
| **Identity** | which account you are, its role and scope | no |

## The sequence

```bash
git fetch                        # 1
npm run state                    # 2
git checkout --detach origin/dev # 3  (or stay on your task branch, deliberately)
npm ci && npm --prefix serverXR ci   # 4
npm run local:mirror:check       # 5
npm run local:mirror             # 6
npm run test:schema-sync         # 7
npm run dev                      # 8
```

1. **`git fetch`** — every "behind" count in every tool is measured against the
   *local* `origin/dev` ref. Without a fetch they are measured against an old
   ref and report current. dev-stack now prints how long ago you last fetched;
   that note is the only thing standing between you and a confident wrong number.
2. **`npm run state`** — branch position, worktree sprawl, unmerged branches.
   Advisory, exits 0. Says nothing about data, deps or config.
3. **Park the tree.** The STALE TREE banner exists because this checkout once
   served code 115 commits old for two days with nothing saying so.
4. **`npm ci`** — *nothing anywhere compares `node_modules` to
   `package-lock.json`.* A minor version drift here is exactly what makes
   "it builds on my machine" untrue of CI. Note that worktrees under
   `.claude/worktrees/` with no `node_modules` of their own silently borrow
   this checkout's, so a branch that adds a dependency runs here and fails in CI.
5. **`local:mirror:check`** — read-only: which spaces the live tiers have that
   this box does not. Reads production first, then staging for what production
   lacks (a space can be built on staging and never promoted — `dilijan` was).
6. **`local:mirror`** — creates them and pulls their projects.
7. **`test:schema-sync`** — the ESM↔CJS mirror is the one drift that 503s the
   server on deploy. Also runs on `git push` via the pre-push gate.
8. **`npm run dev`** — and read the first ten lines. Use this rather than
   `npm run dev:server`: dev-stack force-overrides `CORS_ORIGINS` for the child
   process, and without that override the placeholder still sitting in
   `serverXR/.env.local` rejects `localhost:5173`.

## What no step covers

- **Content already on the box is never refreshed.** Every pull path tests
  *existence*, not a version: `local-mirror` and `project-pull` skip a project
  that already exists unless `--force`, and skip each asset by id even under
  `--force`. A space whose content is six months old produces zero signal from
  any tool, and `local:mirror` will report success over it.
- **Spaces with no declaration are audited by nothing.** `spaces:audit` covers
  only the five with a `di-space.space.json`, and the local tier is
  `governed: false` so it exits 0 on local drift by design.
- **`dist/` is not rebuilt by `npm run dev`.** `npm run preview` can serve a
  build from days ago.

## Identity — where local misleads you most

Sign-in is GitHub/Google OAuth against `http://localhost:4000/serverXR`. There is
no token bypass. What matters is not your role but two other fields:

- **`is_unrestricted`** short-circuits every scope check
  (`serverXR/src/authAccess.js`). An account with it set sees **every space
  locally regardless of role**, so your own signed-in view is not a test of what
  anyone else can reach.
- **`role: admin`** is separate, and gates only the admin *routes* —
  `/api/users`, `/api/stats`, `/api/estate/map`, open-call applications.

So: **check with a cleared/private window first.** An unauthenticated visitor is
auto-issued a guest session by the same code path production uses, which makes
the weakest session the honest one to test with. Sign in afterwards, for the
authenticated view only.

## Two live footguns

- **`npm run space:push` can write to production.** `space-push.mjs` reads the
  *root* env pair only, where `.env` sets `LIVE_API_URL` to **production** and
  `.env.local` overrides it to staging. Delete or lose that one override line and
  a routine push goes live. Always `--dry-run` first and read the host it prints.
- **The root `.env` carries empty placeholders that mask real values.**
  `LIVE_API_TOKEN=` with nothing after it sits there and is merged last;
  `local-mirror` and `project-pull` ignore empty assignments for this reason,
  but `space-pull`/`space-push` do not and will run unauthenticated.

Related: [CHEATSHEET.md](../../CHEATSHEET.md), [spaces/README.md](../../spaces/README.md),
[known-fixes.md](known-fixes.md).
