# Organisation audit 2026-10-05, slice B: the tools

Read-only audit, nothing moved, nothing run. Branch `docs/audit-org-b-tools-2026-10-05`, cut from `origin/dev` at 07b6b30b.
Words follow `docs/ai/vocabulary.md`. Claims are marked CONFIRMED (read in a file, a command listing or a journal) or SUSPECTED (inferred; a person must check).
"Callers" were found by grep over package.json, docs, .github, other scripts, `.claude`, and `~/.config/systemd/user`. A script with callers only in PROGRESS.md counts as no caller. A grep cannot see a person typing a command from memory, so every "dead" below is SUSPECTED until the owner or a session says otherwise.

## 0. The short version

- There is no single list of tools. `scripts/` holds 86 top-level scripts (plus 14 sub-folders), has no README (`scripts/AGENTS.md` names areas, not tools), and `deploy/` has no README. CONFIRMED.
- Tools for di.iiii live in four places: this repo, `~/work/di-atlas` (and its branch worktrees), `~/work/di-desk/tools`, and `~/.local/bin` plus hand-copied files under `~/.local/share`.
- Fifteen or more tools do one job, "move a space's work between tiers", while the owner's rule says `di follow` is the one route.
- One enabled timer fails every night (secrets backup, VPS is offline).

Counts (this slice, tools = a script, command, hook, skill, unit or wrapper that acts on di.iiii):

| | count |
|---|---|
| tools found | about 215 (86 top-level scripts, 11 `scripts/di` CLI files + `di`/`dii` shims, 37 in the sub-folders place/rig/rigbuild/production/standby/liveai/lights-harness/git-hooks/lib, 10 in deploy/, 2 skills, 7 commands, 11 agents, 6 hook groups in `.claude/settings.json`, 13 di-desk tools, 22 di-atlas tools, 14 wrappers in `~/.local/bin`, 25 systemd units) |
| used | about 140 |
| dead or one-off kept as permanent (SUSPECTED) | 24 |
| duplicate (two or more tools, one job) | 32 tools in 6 groups |
| wrong place | 29 |

The counts of tests (`*.test.js`) are left out: 62 test files sit beside their scripts in `scripts/`.

## 1. Inventory

Last-touched is the last commit date (repo) or file date (outside). State: used / one-off / dead / duplicate. "Callers" abbreviates: pkg = package.json, wf = .github workflow, hook = `.claude/settings.json`, unit = systemd user unit, doc = docs/ or CLAUDE.md.

### 1a. di.iiii `scripts/` top level, by job

**Repo hygiene and flow (the one flow dev to main)**

| tool | does | callers | touched | state |
|---|---|---|---|---|
| `repo-state.mjs` | live branch/PR facts instead of hand-written CURRENT.md | pkg state*, hook SessionStart, start-check | 10-02 | used |
| `session-land.mjs` (+`-lib`) | `npm run land`, the only writer of CURRENT.md | pkg land, wf ci.yml:60, deploy-vps-dev.yml:87 | 09-16 | used |
| `start-check.mjs` | "is this box on the latest, both lines" | pkg, hook SessionStart | 10-02 | used |
| `install-git-hooks.mjs` | copies `scripts/git-hooks/*` to `.git/di-hooks`, sets hooksPath | pkg prepare | 09-29 | used |
| `pre-push-gate.sh` | Claude PreToolUse hook before `git push` | hook | 09-29 | used |
| `push-checks.sh` | lint + schema-sync + wiki + AI docs (30-60 s) | pre-push-gate.sh, git-hooks/pre-push | 09-28 | used |
| `golden-rules-check.sh`, `capture-rule.sh` | end-of-session rule check; capture a rule | hook Stop, doc | 05-03 / 07-07 | used (old) |
| `claude-statusline.sh` | statusline for di.iiii | none found (statusline-sync runs from `~/.claude`) | 06-19 | dead (SUSPECTED) |
| `unsaved.mjs` (+`-lib`), `unsaved-watch/install.*` | work that exists only on this machine | pkg unsaved, unit di-unsaved (runs a COPY, see 2) | 09-29 | used |
| `check-agent-docs.mjs`, `sync-agent-docs.mjs`, `check-doc-paths.mjs`, `check-wiki-sync.mjs`(+`-lib`), `works-boundary.mjs`, `check-fallback-patterns.mjs`, `check-three-vendor.mjs` | doc and code-rule gates | pkg, hooks, push-checks | 08-05 to 10-01 | used |

**Tier / space / project movement (the crowded job)**

| tool | does | callers | touched | state |
|---|---|---|---|---|
| `space-sync.mjs` (+ `-vendor`, `-selfcheck`, `-github`) | idempotent "linked space" sync from a GitHub repo | pkg, docs (20 refs) | 06-30 to 10-01 | used (a different job: code from GitHub) |
| `space-code-push.mjs` | `spaces/{id}/code/` into the live space's project codeFiles | pkg, wf deploy-space-code.yml:69 | 09-16 | used |
| `space-pull.mjs`, `space-push.mjs`, `space-new.mjs` | pull/push one space scene to a live server, create a space | pkg | 09-02 to 09-24 | duplicate (see 2.2) |
| `space-publish.mjs`, `send.mjs`, `space-proposal.mjs` | put this machine's edits of one space on dev; "one command for the content line"; send a .diiii as a PROPOSAL | pkg space:publish, send | 09-24 to 09-29 | duplicate |
| `project-pull.mjs`, `project-move.mjs` | pull a published project; move a project between spaces | pkg, docs | 09-18 / 09-29 | duplicate (pull) / used (move) |
| `tier-sync.mjs` | reconcile projects of one tier against another | pkg, 14 refs | 10-04 | duplicate |
| `local-mirror.mjs` | make local hold every space production has | pkg | 09-30 | duplicate |
| `promote-space-projects.mjs`, `push-space-projects.mjs` | copy a space's project documents + assets to a tier | pkg space:promote; push-space-projects has 1 doc ref | 09-30 | duplicate |
| `sync-space-assets.mjs` | pull space assets | pkg, space-pull.mjs, kitCatalogue.js | 04-08 | duplicate, oldest |
| `sync-space-to-dev.sh` | copy spaces from production to dev, via `ssh dii-vps` | 2 refs | 09-24 | dead (VPS offline, SUSPECTED) |
| `space-bundle.mjs`, `install-bundle.mjs` | export/import a space or a whole install | pkg, `di` pack, 27 refs | 09-17/09-29 | used |
| `self-host.mjs` | one command from a clone to a running install | pkg selfhost | 07-10 | used |
| `data-inventory.mjs`, `data-cleanup.mjs` + `cleanup-plans/{dev,local,prod}.json` | read-only cross-tier inventory; plan-driven cleanup | 2-3 refs | 09-16 / 09-30 | one-off (the plans are dated) |
| `gc-space-blobs.mjs`, `asset-refs-audit.mjs`, `document-asset-refs.mjs`, `asset-remap-lib.mjs` | unreferenced blobs; which project points at missing bytes | pkg assets:audit; 3-6 refs | 09-10 to 10-01 | used |
| `normalise-page-asset-urls.mjs`, `page-vendor-cdn.mjs` | rewrite a space's published pages (one migration) | 1 ref each | 09-16 | one-off |
| `restore-entities.mjs` | put back entities a project lost from a saved copy | PROGRESS.md only | 10-01 | one-off (rescue) |
| `wcc-page-snapshot.mjs` | stand two coded WCC pages up as projects | pkg | 09-16 | one-off |
| `spaces-audit.mjs` | audit every space this repo declares | pkg | 08-06 | used |

**Deploy, release, hosting**

| tool | does | callers | touched | state |
|---|---|---|---|---|
| `deploy.mjs` (+`deploy-lib.mjs`) | `npm run deploy*` (host dev/production, remote) | pkg x8, 7 refs | 09-16 | used (VPS or cPanel target, see 2.4) |
| `stage-cpanel-nodeapp-release.mjs`, `cpanel-apply-prebuilt-release.sh`, `cpanel-poll-deploy.sh`, `cpanel-prune-deploy-backups.sh`, `check-cpanel-compat.mjs` | cPanel route | wf publish-cpanel-prebuilt-v2.yml:60,75; pkg deploy:cpanel | 06-22 to 09-16 | SUSPECTED retired (worktree `di.iiii-nocpanel` exists) |
| `create-checkpoint.mjs` | pkg `checkpoint`; backs the cPanel git-deploy | pkg:44, legacy/cpanel-git-pull | 04-08 | dead (SUSPECTED) |
| `write-server-env.mjs` | pkg env:serverxr | pkg | 07-10 | used |
| `smoke-check.mjs` | HTTP smoke check after a deploy | wf x3, pkg | 09-16 | used |
| `pack-runtime.mjs` | builds the artifact the local `di` runs | pkg di:pack, `di update` | 09-10 | used |
| `backup-pull.sh` | pull production backups off the VPS | unit di-backup-pull (timer disabled) | 09-13 | dead until VPS is back |
| `build-chat-apk.mjs` | studio chat Android app | none (PROGRESS.md) | 09-11 | dead (SUSPECTED) |
| `dev-stack.mjs`, `dev-stack-lib.mjs`, `dev-stack-owned.mjs`, `dev-xr.mjs`, `dev-xr-cert.mjs` | `npm run dev` / `dev:xr` | pkg; unit di-stack (disabled) | 08-01 to 09-30 | duplicate of `di-dev` (see 2.3) |

**Check, verify and measure (browser tools; not run here)**

`verify-surfaces`, `verify-capture`, `verify-algovrithm`, `verify-algovrithm-remote`, `verify-vj-deck`, `responsive-check`, `check-toolbar-overlap`, `count-controls`, `input-check`, `seed-input-check`, `kit-first-load`, `kit-weights`, `kit-walk`, `look-map`, `map-tools-check`, `ndi-autoscan-measure`, `compress-reels`, `build-reel-atlas`, `optimize-wcc-assets`, `backup-open-call-applications`, `lights-harness/`.
Used (pkg or wf): verify-surfaces, verify-capture, verify-algovrithm(+remote), responsive-check (wf browser-checks.yml:100), check-toolbar-overlap, count-controls, input-check, seed-input-check (wf :94). One-off or feature-bound (1 ref): verify-vj-deck, look-map, map-tools-check, ndi-autoscan-measure, kit-first-load, kit-weights, build-reel-atlas, compress-reels. No caller at all: `kit-walk.mjs`, `optimize-wcc-assets.mjs` (06-20), `backup-open-call-applications.mjs` (07-10; only a golden_rules line). A family of 21 playwright tools with no shared entry.

### 1b. `scripts/` sub-folders, deploy, `.claude`

| path | does | state |
|---|---|---|
| `scripts/di/` (22 source files + 40 tests) | the `di` CLI: install, update, follow, follows, sync, share, keeper, stage, ndi, rig status; `COMMANDS` table at `cli.mjs:1350` | used (the real entry point) |
| `scripts/place/` (README present) | place capture: photos to scene, Python reconstruct/fit; needs `PLACE_PYTHON` | used; MOXIR/production, one line |
| `scripts/rigbuild/`, `scripts/rig/`, `scripts/production/` | rig builder, rig compat (wf rig-compat.yml:80), MOXIR versions | MOXIR slice D, skipped |
| `scripts/standby/` (6 files) | Mac standby: runtime build, data backup/restore, nginx, server-env | used; also copied pinned into `~/.local/share/di/tier-backup` |
| `scripts/liveai/`, `scripts/lights-harness/` (README each) | live-AI engine, light-sim harness | used, 1 ref each |
| `scripts/git-hooks/` | pre-commit (refuses commit on dev/main), pre-push | used (copied to `.git/di-hooks`) |
| `scripts/lib/isMainModule.mjs` | shared helper | used |
| `deploy/` | `vps-backup.sh`, `vps-restore.sh`, `secrets-backup.sh`, `prune-images.sh`, `di-housekeeping.{service,timer}`, `cpanel/*` | VPS and cPanel era; see 2.4 |
| `.claude/skills/` | `open-call`, `run-di-iiii` (the dev stack skill; still tells sessions to use `npm run dev`, SUSPECTED) | used |
| `.claude/commands/` | branch, check, land, live, recap, ship, stack | used |
| `.claude/agents/` | 11 role agents (backend, infra, qa, release-verifier, ...) | used |
| `.claude/settings.json` | 6 hook groups wired to the scripts above | used; stale paths, see 2.5 |
| git hooks | one set, three layers: git-hooks/pre-push, `pre-push-gate.sh` (Claude), CI | used |

### 1c. Outside the repo

| tool | path | does | callers | touched | state |
|---|---|---|---|---|---|
| `di` | `~/.local/bin/di` to `~/.di/bin/di` (shim of `scripts/di`) | the installed CLI | unit di-up | 09-08 | used |
| `dii` | `~/.local/bin/dii` to `~/.di-b/bin/dii` | a second install, same shim text | none found | 09-09 | dead (SUSPECTED) |
| `di-dev` | `~/.local/bin/di-dev` to `~/work/di-atlas-router/tools/di-dev/di-dev.mjs` | owns every dev server; `up/down/ls/doctor` | units di-web@, di-api@, di-dev-doctor | 10-02 | used; lives on a BRANCH worktree |
| `dev-router.mjs` | `di-atlas/tools/` and `di-atlas-router/tools/` | maps names to ports | unit dev-router | 10-02 | duplicate, the two copies differ (CONFIRMED, cmp) |
| `di-work` | `~/.local/bin/di-work` | tmux session: editor + docs + dev server; hard-codes `/home/dob/work/di.iiii` | none | 09-13 | dead (SUSPECTED, rule: only `di-dev up`) |
| `session-sync`, `switch-session`, `touchpad-settings`, `refresh-rate` | `~/.local/bin` | KDE session tools | not di.iiii | 09-28 to 09-30 | not our slice |
| `di-memory-sync.sh`, `doc-portal-heal`, `chats` | `~/.local/bin` | estate, not platform | units | 09-29 to 10-05 | estate tools, used |
| `unsaved.mjs` copy | `~/.local/share/di/unsaved/` | copy of the repo script, runs from unit di-unsaved | unit | differs from repo (CONFIRMED, cmp) | wrong place |
| `run.sh`, `backup-data.sh` | `~/.local/share/di/tier-backup/` | pinned copy of `scripts/standby/backup-data.sh`, nightly local backup | unit di-tier-backup | 10-02 | used; by design pinned, VERSION file |
| `page-push.mjs` | `~/work/di-desk/tools/` (`~/di-desk` bridge) | put an HTML page into a space and prove it landed | desk, memory notes | 09-20 | used; platform tool in another repo |
| `copy-room`, `copy-space-assets`, `gaps`, `loose-files`, `name-spaces`, `what-we-have` | `di-desk/tools/` | tier compare/copy/name pages | none found | 09-09 / 09-10 | duplicate of scripts (see 2.2) |
| `tidy-local-spaces`, `tidy-local-versions` | `di-desk/tools/` | one pass on 2026-09-11 | none | 09-11 | one-off kept |
| `polar.mjs` | `di-desk/tools/` | drive the Polar account; reads a token file | none | 09-21 | used by hand; token path `~/.config/polar/token` |
| `decisions.mjs`, `decisions.json` | `di-desk/tools/` | the owner's one-question queue | desk | 09-09 | desk tool, fine |
| standby, dibo-mac, mac-harden, `standby-deploy.sh`, `standby-failover.sh` | `di-atlas/tools/` | Mac standby deploy and failover of di.iiii | unit di-standby-pull, memory notes | to 09-26 | used; platform deploy in atlas |
| s24-*, aylmo-*, arch-*, dns-blocklist*, lint-words.sh, memory-sync | `di-atlas/tools/` | machines and estate | various | | not di.iiii tools, correct place |
| `~/work/di-atlas/production/tools` | named in the brief | does not exist (CONFIRMED); `di-atlas-production` is a worktree with the same `tools/` set | | | |
| units acting on di.iiii | `~/.config/systemd/user` | di-up, di-web@, di-api@, di-dev-doctor, di-unsaved, di-tier-backup, di-secrets-backup, di-backup-pull, di-standby-pull, di-inbox-pull, di-spaces-sync, dev-router, di-gate, di-gateway*, di-stack | | | see 2.4 and 2.6 |

## 2. Wrong place and other mess

### 2.1 The entry point is missing (no README, no usage)
- `scripts/` has no README; 86 scripts, 62 of them with a header comment, 24 with none (create-checkpoint, sync-space-assets, check-cpanel-compat, stage-cpanel-nodeapp-release, ...). CONFIRMED (ls, header grep).
- `deploy/` has no README; `scripts/di/` has none (`docs/deploy/DI_CLI.md` covers the CLI). CONFIRMED.
- Only `place`, `liveai`, `lights-harness`, `rigbuild` have a README. CONFIRMED.
- `package.json` has 75 scripts in one flat block, no grouping (`package.json` "scripts"). Many names say nothing to a non-coder (`state:sweep`, `tier:sync`, `space:promote`).

### 2.2 Two or more tools, one job
1. **Move work between tiers** (15 in this repo, 6 more in di-desk, plus `di follow` / `di sync`): space-pull, space-push, space-publish, send, space-proposal, project-pull, tier-sync, local-mirror, promote-space-projects, push-space-projects, sync-space-assets, sync-space-to-dev.sh, space-code-push (a different, narrower job), di-desk copy-room, copy-space-assets, gaps, loose-files. The owner's rule (2026-10-04) names `di follow` as the route and lists limits ("deletes, renames, visibility not carried"). CONFIRMED for the overlap by headers; SUSPECTED that most can be retired once `di follow` carries those limits.
2. **Dev server**: `dev-stack.mjs`/`dev-xr.mjs` (`package.json:` "dev", "dev:xr"), `di-stack.service` (disabled, still on disk and still `npm run dev`), `docker-compose.dev.yml`, `di-work`, and `di-dev` (the only one the home rule allows). CLAUDE.md says never `npm run dev`; package.json still offers it. CONFIRMED.
3. **Backup of the live database**: `deploy/vps-backup.sh`, `scripts/standby/backup-data.sh`, its pinned copy under `~/.local/share/di/tier-backup`, `di-atlas/tools/standby-backup/pull-from-mac.sh`, `scripts/backup-pull.sh`, `deploy/secrets-backup.sh`. Three of the six aim at the offline VPS.
4. **Host deploy**: `deploy.mjs` + `deploy/cpanel/*` + `scripts/cpanel-*` + 3 deploy workflows versus `di-atlas/tools/standby-deploy.sh`. SUSPECTED: the current route is the Mac standby (memory: "Main deploy = Mac path"); slice C should say which workflows still run.
5. **dev-router.mjs** exists twice and differs (di-atlas main versus the router branch, first diff at line 27 where the branch imports `./di-dev/lib.mjs`). The service runs the main-branch copy: `~/.config/systemd/user/dev-router.service` runs `/home/dob/work/di-atlas/tools/dev-router.mjs`. CONFIRMED.
6. **Browser verification**: 21 playwright scripts, several per feature (algovrithm x2, kit x3, map x2, vj, capture, surfaces). SUSPECTED overlap, not measured.

### 2.3 Platform tools living in another repo or in ~
- `di-dev` (acts only on di.iiii dev servers) lives in the atlas repo, on branch `feat/router-owners-2026-10-02`, and the command on PATH points into that branch's worktree `~/work/di-atlas-router` (CONFIRMED, `ls -l ~/.local/bin/di-dev`, `git branch -a --contains`: only that branch). It is not on di-atlas's checked-out branch (`feat/aylmo-android`) and `tools/di-dev` does not exist there. If that worktree is cleaned, every `di-web@`/`di-api@` unit and the daily doctor stop. This is the highest-risk placement.
- `page-push.mjs` and the tier tools in `~/work/di-desk/tools` act on di.iiii spaces and still carry the old tier name: `page-push.mjs:25-26` has a `staging` alias to dev.diiii.xyz. Hosts hard-coded there: `local.thedi.studio`, `dev.diiii.xyz` (`page-push.mjs:22-26`).
- Platform deploy and standby (`standby-deploy.sh`, `standby/`, `standby-failover.sh`) sit in `di-atlas/tools`; the data scripts they call sit in `di.iiii/scripts/standby`. One thing in two repos.
- `unsaved.mjs` runs from a hand-copied file in `~/.local/share/di/unsaved/` that differs from the repo's (CONFIRMED, `cmp`). Repo fixes never reach the timer. (Rule 5, no hand-made state.)
- Unit files for di.iiii jobs exist only in `~/.config/systemd/user` (di-secrets-backup, di-backup-pull, di-unsaved, di-standby-pull, di-tier-backup). Only `deploy/di-housekeeping.{service,timer}` is versioned in this repo. SUSPECTED that the others are installed by atlas scripts (`standby-backup/root-install.sh`); not all traced.
- `~/work/di-atlas/.claude/worktrees/agent-*` hold copies of the whole atlas tree (found by grep), so the same tool shows up several times.

### 2.4 One-off and VPS-era tools kept as if permanent
- `deploy/secrets-backup.sh` is run by the ENABLED timer `di-secrets-backup.timer` and fails every night: journal "Main process exited, code=exited, status=1/FAILURE" (2026-10-04 15:40). The script's host is `VPS="${VPS_HOST:-dii-vps}"` (`deploy/secrets-backup.sh:24`) and the VPS is offline (memory). It fails silently apart from the journal (rule 4). CONFIRMED (journal); cause SUSPECTED. The unit also calls it through the bridge path `%h/di.iiii/deploy/...`.
- `backup-pull.sh` (timer disabled, CONFIRMED), `deploy/vps-backup.sh`, `vps-restore.sh`, `prune-images.sh`, `di-housekeeping.*`, `sync-space-to-dev.sh`, `deploy-vps.yml`, `deploy-vps-dev.yml`, `uptime.yml`: all VPS. SUSPECTED dead until a host is paid for.
- cPanel group (5 scripts, `deploy/cpanel/`, `publish-cpanel-prebuilt-v2.yml`, `legacy/cpanel-git-pull/`, `create-checkpoint.mjs`): SUSPECTED retired.
- Migrations kept: `normalise-page-asset-urls`, `page-vendor-cdn`, `cleanup-plans/*.json`, `restore-entities`, `wcc-page-snapshot`, di-desk `tidy-local-*`, `name-spaces`.

### 2.5 Hard-coded hosts, paths, tokens
No literal secret found in `scripts/` or `deploy/` (regex for `token|secret|password = "..."`, CONFIRMED none). Env names are used instead. Hard-coded things:
- `.claude/settings.json:46-47`: allow rules for `git -C /home/nooo/di.iiii ...`. The account was renamed to `dob`, so these rules match nothing. CONFIRMED.
- `scripts/verify-algovrithm.mjs:129`: screenshot written to `/home/nooo/.claude/jobs/ae45aa9d/tmp/qa-phone2.png`. Breaks on any other machine. CONFIRMED.
- `scripts/place/frame-stats.py:17` and `scripts/place/README.md:62`: `/home/dob/tools/ComfyUI/.venv/bin/python` in usage text (the code itself probes `PLACE_PYTHON`, `place/common.mjs:53-56`, fine).
- `deploy/secrets-backup.sh:24`, `scripts/backup-pull.sh` (`DII_VPS_HOST` default `dii-vps`), `sync-space-to-dev.sh:5`: VPS ssh alias.
- Live hostnames (`dev.diiii.xyz`, `local.thedi.studio` or the prod host) appear in 22 scripts as defaults (e.g. `space-push.mjs:180`, `space-sync.mjs:712`, `tier-sync.mjs:85`, `wcc-page-snapshot.mjs:389`, `cli.mjs:838`). The tier names are in each script instead of one `tiers` table. SUSPECTED but widespread.
- `di-work` hard-codes `/home/dob/work/di.iiii`. `.claude/skills/run-di-iiii` starts with `npm run dev` (SUSPECTED, read its first lines only).

### 2.6 Rule check (global CLAUDE.md)
- Rule 4 (never fails silently): di-secrets-backup fails with no alert, see 2.4.
- Rule 5 (no hand-made state): unsaved copy, `~/.local/bin` wrappers, unit files only on this machine.
- Words: `scripts/space-new.mjs`, `space-pull.mjs` and `package.json` use "space:" correctly; di-desk `copy-room.mjs`, `gaps.mjs` and `loose-files.mjs` say "room" for a space's scene (their own headers: "REPLACE one space's ROOM"). Wrong word per vocabulary.md. CONFIRMED by header read.

## 3. The one target organisation

Principle: one home per kind of tool. A tool that acts on the platform lives in `di.iiii`; machines and estate stay in `di-atlas`; `di-desk` keeps only desk tools. Every tool is reached from one list, `scripts/README.md`.

### 3.1 Target folders in this repo (after the show)

```
scripts/
  README.md        the one list (see 3.3)
  di/              the CLI (unchanged)
  dev/             dev-stack*, dev-xr*, di-dev (moved in from atlas), dev-router.mjs
  flow/            repo-state, session-land, start-check, install-git-hooks, pre-push-gate.sh, push-checks.sh, golden-rules-check, capture-rule, git-hooks/
  check/           check-*, verify-*, responsive-check, count-controls, input-check, kit-*, works-boundary, docs checks
  content/         space-*, project-*, tier-sync, local-mirror, bundles, gc, audits (shrinks once `di follow` is complete)
  ops/             deploy.mjs, standby/ (with atlas's standby scripts), backups, units/ (every systemd unit file, versioned), smoke-check, pack-runtime
  place/ rig/ rigbuild/ production/   unchanged (MOXIR)
  retired/  (or deleted; history keeps them)
```

### 3.2 Move list (from, to, rank)

Rank 1 is first. Ranks 1-3 change no path any running thing uses and are safe before 17 Oct; the rest wait.

| rank | from | to | why | before the show? |
|---|---|---|---|---|
| 1 | (new) | `scripts/README.md` + `deploy/README.md`: one list, one line per tool, state and who calls it | fixes 2.1 | safe, docs only |
| 2 | `~/.config/systemd/user/di-secrets-backup.timer` | switch to the Mac standby as source, or disable until a host exists; add a failure line in `~/di-health` | stops a nightly silent failure | small change, owner's say; do not touch the standby units |
| 3 | `.claude/settings.json:46-47`, `verify-algovrithm.mjs:129` | delete the `/home/nooo` rules; write the screenshot to a temp dir | stale paths | safe |
| 4 | `di-atlas-router/tools/di-dev` (+ `dev-router.mjs`) | land the branch into di-atlas main, then pick one place (`scripts/dev/` here) and re-point the `~/.local/bin/di-dev` link and units | worst placement, 2.3 | NO: do after the show |
| 5 | `~/.local/share/di/unsaved/unsaved.mjs` | run the repo copy (unit calls `scripts/unsaved.mjs` of the installed di) | rule 5 | after the show |
| 6 | VPS/cPanel group (2.4) | `scripts/retired/` or delete; remove 3 workflows after slice C confirms | dead weight | after |
| 7 | the 15 tier-moving scripts | keep `space-code-push`, `space-bundle`, `install-bundle`, `space-sync*`, `data-inventory`; retire the rest as `di follow` closes its limits | one route | after, one script at a time |
| 8 | di-desk `copy-room`, `copy-space-assets`, `gaps`, `loose-files`, `name-spaces`, `what-we-have`, `tidy-local-*` | retire; `page-push.mjs` moves to `scripts/content/` | platform tools out of the desk repo | after |
| 9 | `scripts/*.mjs` flat | the folders in 3.1 | order | after; all of package.json, `.claude/settings.json`, workflows, `pack-runtime.mjs`, units must change together, one PR |
| 10 | unit files of di.iiii jobs | `scripts/ops/units/`, installed by one script | rule 5 | after |
| 11 | `di-work`, `dii`, `claude-statusline.sh`, `kit-walk`, `optimize-wcc-assets`, `build-chat-apk`, `create-checkpoint`, `di-stack.service` | delete after the owner agrees (SUSPECTED dead) | tidy | after |
| 12 | `package.json` scripts | group by prefix: `dev:`, `flow:`, `check:`, `content:`, `ops:`; keep old names as aliases for one release | readable | after |

### 3.3 Retire list
`dev-stack.mjs`/`dev-xr*` (replaced by di-dev), `di-stack.service`, `di-work`, `dii`, VPS group, cPanel group, `sync-space-to-dev.sh`, `claude-statusline.sh`, `kit-walk`, `optimize-wcc-assets`, `build-chat-apk`, `create-checkpoint`, `sync-space-assets` (once space-pull no longer calls it), the di-desk tier tools, one-off migrations (2.4) after a last look.

### 3.4 What must NOT change before the MOXIR show, 17 Oct 2026
- Paths of everything `di-web@`, `di-api@`, `di-dev-doctor`, `di-up` run: `~/.local/bin/di-dev`, the atlas router worktree, `di-dev` units, `dev-router.mjs` (CONFIRMED in use).
- `scripts/di/`, `pack-runtime.mjs`, `space-bundle.mjs`, `install-bundle.mjs`: the installed di updates from a packed commit; a path move breaks `di update`.
- `scripts/standby/*`, `~/.local/share/di/tier-backup/*` and the Mac standby deploy/failover tools: the show's safety net.
- `scripts/place`, `scripts/rig`, `scripts/rigbuild`, `scripts/production` and the "Known · full" show version tools (slice D).
- `.claude/settings.json` hook targets (`start-check`, `repo-state`, `works-boundary`, `pre-push-gate`, `golden-rules-check`) and `package.json` script names.
- `deploy.mjs` and the deploy workflows, until slice C confirms which host the show uses.
- The `follows` and `di follow` tooling (dev is the hub).
Reading, adding a README and the two stale-path fixes (ranks 1 and 3) are the only moves that touch nothing the show depends on.

## 4. Limits of this audit
Nothing was run (no tests, no scripts, no browser). "Used" means a caller was found by grep; hand-typed use is invisible. "Last touched" is the git commit date, which a squash or bulk rename (for example the 09-16 "retire staging" sweep) can reset; the file date is used outside git. The count of about 215 is a count by file, not by command. The caller scan did not include `~/.claude` memory notes except where named, and the other three slices cover product code, branches/worktrees/docs and MOXIR tools.
