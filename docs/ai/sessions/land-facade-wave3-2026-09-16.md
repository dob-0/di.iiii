## 2026-09-16 — Facade wave 3 batch: names, front room, sign-in carries guest work, no-account audit

Batch-landed four reviewed, CI-green PRs onto `dev` as one motion (per
`feedback-batch-land-behind-prs`, "Proven again 2026-09-14" recipe), avoiding a
sequential-BEHIND-invalidation race: #461 `docs/use-without-an-account`,
#462 `fix/space-names-open-wcc`, #463 `fix/front-room-faults`,
#465 `fix/signin-carries-guest-work`. #464 was left alone — still being reworked.

`git fetch origin`, then `gh pr diff <n> --name-only` for all four: no two touch
the same file, so all four merged with `git merge --no-ff` into this branch with
zero conflicts. `npm ci` run in both `/` and `serverXR/` (both were missing here).

This branch does **not** touch `CURRENT.md`/`PROGRESS.md` itself — the four
originals' own session notes are left in place; the fold into `PROGRESS.md` and
`CURRENT.md`'s "Last session" happens at merge time via `npm run land` /
the `deploy-vps-staging.yml` `land` job on `dev`, never on a feature branch
(the docs gate refuses a feature branch whose `CURRENT.md` differs from
`origin/dev`).
