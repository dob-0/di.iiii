---
name: release
description: Get a change live on di.iiii — dev tier deploy, dev to main promotion, hotfix straight to main, the Mac prod path, the land-job check after every landing, rollback, and a show machine's install, hot swap and restore through the release gate (record, show-live freeze, drill). Use when a PR is merged and must be live, when promoting dev to main, or when a deploy is red or silent.
---

# release

**Needs:** the di.iiii checkout, `gh` signed in with rights on dob-0/di.iiii, git, node >= 22. Steps 1-3 and 5 need only that; step 4 (the Mac) needs the di-atlas repo, ssh to the Mac and the keeper's word.

Sources (repo files; memory notes are dated background, not needed to run): `docs/ai/deploy.md`, `docs/deploy/LIVE_DEPLOY.md`, `.github/workflows/{deploy-vps-dev,deploy-vps,tag-on-promotion,release}.yml`, memory `feedback_dev_staging_main_flow`, `feedback_dii_prod_deploy_gate`, `reference_dii_main_deploy_mac_path`, `reference_dii_land_job_blocked` (each dated; re-check the live state, a note is a claim). Method: trunk-style staged promotion with a verified rollback (Google SRE book, ch. 8). Words: `docs/ai/vocabulary.md` (tiers: local, dev, prod). Marks: **V** = command or file verified on 2026-10-26 (exists, `--help`/head read); **UNVERIFIED** = not run here, a claim from memory.

## 0. Rules
- Work stays on the dev tier (`dev.diiii.xyz`) during a session; promote to main only at the session end or on the owner's ask, never per fix. Data writes follow the same order: dev first, LOOK at it, then prod, never both in one command.
- Never push straight to `dev`. A PR merges; a BEHIND PR gets `origin/dev` merged INTO the branch (not a rebase).
- A merge is a window, not a word (owner 2026-10-27). On a di-atlas machine queue with `di-merge add owner/repo#N "note" --try URL --see FILE` (V: `di-merge --help`), then open ONE window with `di-ask "merge …" -- di-merge`; his Enter merges, never a pasted command; elsewhere plain `gh -R dob-0/di.iiii pr merge <n>` after review. Merge needs proof (a link to try or pictures).

## 1. Dev deploy (a merge to `dev`)
- The push to `dev` runs `.github/workflows/deploy-vps-dev.yml` (V) and publishes the release; the Mac pulls it a minute or more later. A tab opened before the pull shows old code: reload and compare the bundle name in `https://dev.diiii.xyz/` (`assets/index-<hash>.js`). UNVERIFIED this run (needs a live deploy).
- Local twin: the installed di runs the same commit as dev (rule "Dev and local stay one"): pack that commit and `di update --from` it. UNVERIFIED (owed as no-hands job).

## 2. The land-job check (after EVERY landing on dev)
The dev workflow's `land` job folds `docs/ai/sessions/*.md` into `PROGRESS.md` and `CURRENT.md` but is refused by dev's branch protection (GH006), prints a `::warning::` and exits 0: the run reads green and notes pile up.
- Look: `gh -R dob-0/di.iiii run list --workflow deploy-vps-dev.yml --limit 3` and read the `land` job's log for `GH006` (UNVERIFIED this run).
- Fix by hand from a named branch (not detached): `npm run land` (V: `scripts/session-land.mjs`; `--dry-run` shows what it would do, touching nothing), in a PR. It refuses off dev and sweeps worktrees, so run it from a clean checkout of dev, never another job's checkout.
- `docs/ai/sessions/` must be EMPTY on main and every PR branch carries one note: a note left on a branch that reaches main makes "Check AI docs" fire and SKIPS build and deploy while the run looks green.

## 3. dev to main (production)
1. Ask the owner (word). Confirm dev is green and the land check (2) is clean.
2. PR `dev` -> `main`: `gh -R dob-0/di.iiii pr create --base main --head dev` (V: gh). Merge as in 0.
3. `.github/workflows/tag-on-promotion.yml` tags the promotion after the production deploy and calls `release.yml` for the bundle (V: files read). The production environment waits for the owner's approval: `gh api -X POST repos/dob-0/di.iiii/actions/runs/<id>/pending_deployments -F 'environment_ids[]=<env id>' -f state=approved` (UNVERIFIED; environment id was 13904835261 on 2026-09-30, re-read it from the run).

## 4. Prod = the Mac
`tools/standby-deploy.sh status|logs|restart|upgrade prod` of the di-atlas repo (V: header read; only on a machine with di-atlas and access to the Mac; a teammate without it asks the keeper to run this step), health check and automatic rollback in the script. `upgrade prod SHA=<full main sha>` deploys a chosen commit; `FORCE=1` redoes the same sha. Check the pull-deployer runs: `standby-deploy.sh deployer status` (V in header; its live output UNVERIFIED). A green workflow run alone does not mean live.
Rehearse first on r-di where it can run; for a Mac service change use `mac-safe-change` (rule "Rehearse on r-di, then the Mac").

## 5. Hotfix straight to main
Measured trap (2026-09-30, three red deploys): the docs gate fails on a note in `docs/ai/sessions/` (must be empty on main) and on a stale `CURRENT.md` (copy dev's). Fold the note with `foldNotesIntoProgress` from `scripts/session-land-lib.mjs` (V: file exists) in the hotfix PR. Reproduce on a NAMED branch, never a detached checkout (detached HEAD hides the empty-on-main rule). Check that main's `deploy-vps.yml` has the `DEPLOY_TARGET` switch (V: present on dev's copy; main's copy UNVERIFIED, it was missing on 2026-09-30). Then step 4 with the hotfix sha. Owed: exempt hotfix branches from the note rule (named, not done here).

## 6. Rollback
- Prod: `standby-deploy.sh upgrade prod SHA=<previous full sha>` (V header; the previous sha = the last tag, `git tag --sort=-creatordate | head -3`).
- Dev tier: revert PR on dev, same path as 1.
- Data: the backup copy and its one-command undo (`copy_project.mjs`, see `show-checkpoint`).
- A show machine:
  - the last hot swap: `node scripts/show/hot-swap.mjs --undo --production <name> --host <user@host>`;
  - a whole release: `node scripts/release/restore.mjs --manifest <release-manifest.json> …` (section 8).
- Say the rollback command BEFORE promoting, in the PR.

## 8. A show machine (stage): record, gate, freeze, hot swap, restore, drill
Method, schema and limits: `scripts/release/README.md` (V: written 2026-11-01, tests `scripts/release/release.test.js`). It replaces di-atlas `install-look.sh` and `ui-hot-swap.sh`. A stage install stays the owner's window.
1. **Tests on the exact commit:** `node scripts/release/record.mjs tests -- npx vitest run <paths>`. It needs a clean tree and keeps "Tests N passed".
2. **The record:** `node scripts/release/record.mjs pack <di-runtime-…tar.gz> [--commit <sha>] --review <review.md>`.
   It writes `<pack>.release.json`, an in-toto Statement bound to the pack's sha256 and marked self-attested.
3. **Install or hot swap:**
   - `node scripts/show/install.mjs <pack> --production <name> --host <user@host>`;
   - or `node scripts/show/hot-swap.mjs <pack> …` for the desk ui only, with no restart.
   - The record's 3 lines come first. BLOCK, untested or not on a remote is refused unless `--accept '<reason>'`, which is logged in `~/di-health/show/<name>/installs.log`.
   - `--when-up` re-checks the gate when it fires.
4. **Show live** (`node scripts/release/show-live.mjs on --production <name> --why …` at doors, `off` at get-out):
   - no full install;
   - an overlay needs green tests on the exact commit, no BLOCK, `--checkpoint-cmd` first and a GO soak after (`--go-cmd`, default 60 s, unvalidated);
   - `--accept` does not lift the freeze.
5. **The label:** `di version` prints `<base>+ui.<sha8>` per overlay, derived from PATCHES.
6. **Restore:** `node scripts/release/restore.mjs --manifest <the checkpoint's release-manifest.json> …`.
7. **Before each show:** `node scripts/release/drill.mjs --home <replica> --production <name> --base <pack N-1> --overlay <pack N>`. It times N → N-1 → N and the restore on a replica, never the installed di.

## 7. End
Seen on the real surface: open the live URL, phone and desktop (`npm run verify:surfaces`, V in package.json), then `job-end-gate`.
