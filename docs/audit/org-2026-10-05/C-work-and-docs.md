# Slice C — work in flight and the written record

Audit of 2026-10-05, read-only. Nothing was moved, deleted or closed. Mark: **CONFIRMED** = read from git/gh/ls today; **SUSPECTED** = inferred, needs the owner or the author to say.
Method: `git worktree list --porcelain`, per tree `git log -1`, `git status --porcelain`, `git rev-list --count HEAD --not --remotes` (commits that exist on no remote branch), `git merge-base --is-ancestor HEAD origin/dev`; PRs from `gh pr list` (open 62, merged 650, closed 500 read). Base: origin/dev 07b6b30b. Words follow docs/ai/vocabulary.md.

## 1. The short version

| Thing | Count | Mark |
|---|---|---|
| Worktrees (incl. the main checkout) | 275 (261 siblings `~/work/di.iiii-*`, 15 inside `di.iiii/.claude/worktrees/agent-*`, rest detached packs) | CONFIRMED |
| Disk used by the sibling trees | about 119 GB (each one carries its own node_modules) | CONFIRMED |
| Worktrees touched in the last 3 days | 58 | CONFIRMED |
| Worktrees whose work is already in dev (or its PR merged), nothing unsaved | 185 | CONFIRMED |
| Worktrees holding commits that exist on NO remote | 3 | CONFIRMED |
| Worktrees holding uncommitted edits (real work, not a report) | 3 (nocpanel 75 files, movement 9, followgaps 5) | CONFIRMED |
| Worktrees holding only an untracked REPORT-*.md or .verify/ | 27 | CONFIRMED |
| Open PRs | 62 (30 draft); 19 in one stack; 10 dependabot | CONFIRMED |
| Open PRs that conflict with dev | 21 | CONFIRMED |
| Branches on origin | 470 (296 merged PR, 58 open PR, 12 closed unmerged, 104 with no PR, of which 32 are already inside dev) | CONFIRMED |
| Stale `pr/*` and fork remote-tracking refs in the local repo | 413 `pr/*` and about 40 others (emily*, n22, tmpwcc, probe) | CONFIRMED |
| Local branches | 625 (433 already merged into origin/dev) | CONFIRMED |
| main vs dev | dev is 700 commits ahead of main; main has 11 commits dev lacks | CONFIRMED |
| Files under docs/ | 142 tracked (21 MB), plus 14 session notes and 3 audits still only on unmerged branches | CONFIRMED |

## 2. Worktrees

### 2a. Hold work that exists nowhere else — LIST (do not touch)

| Tree | Branch | What exists only here | Risk |
|---|---|---|---|
| `di.iiii-followgaps` | fix/follow-gaps-2026-10-05 | **5 commits** (follow gaps 1–5) on no remote, plus 5 uncommitted files (known-fixes.md, SPEC_follow.md, ui.mjs, wikiContent.js, a session note). Its upstream is the already-merged flaky-test branch, so a plain `git push` would go to the wrong place. | High — recent, owner-visible follow work |
| `di.iiii-moxir-deskplan` | feat/moxir-known-full-desk-plan-2026-10-05 (PR #766) | 1 commit not pushed (the PR shows an older head) + untracked REPORT-B1B2.md | MOXIR show |
| `di.iiii-reid` | feat/assets-reid-2026-10-05 (PR #768) | 1 commit (download an imported asset from the project its url names) not pushed | Medium |
| `di.iiii-nocpanel` | chore/remove-cpanel | **75 uncommitted file changes**, branch last committed 2026-09-16 | High, 19 days old, never committed |
| `di.iiii-movement` | feat/movement | 9 uncommitted files (walk-mode code, docs/architecture/MOVEMENT.md, scripts/movement/), no upstream | Medium |

So **3 worktrees hold unpushed commits** and **2 more hold only uncommitted work**. Together: **5 trees to save before anything else.**

### 2b. Groups

| Group | Count | Rule | Mark |
|---|---|---|---|
| Active (last commit 2026-10-02 or later) | 58 | leave alone; many are the same day's agents | CONFIRMED |
| Merged and safe to remove | 185 | branch or PR already in dev, no unpushed commit, no uncommitted edit except a REPORT file (24 of them) | CONFIRMED |
| Stale but not merged, work is pushed | 45 | worktree removable without loss (the branch is on origin), but the branch/PR needs an owner decision, see section 3 | CONFIRMED |
| Detached packs and checkouts (`pack-*`, `pr754`, `rawaudit`, `moxir-todev`) | 15 | `pack-*` are the commits packed for `di update --from`; keep the latest, rest are safe | SUSPECTED |
| `.claude/worktrees/agent-*` inside the main checkout | 15 | 11 are clean and merged or pushed; 4 are 5 days old, clean, pushed | CONFIRMED |
| Main checkout `~/work/di.iiii` | 1 | on dev, 6 days old; holds 3 untracked files (`.claude/settings.local.json`, `.env.bak-2026-09-21`, `serverXR/.env.local.before-shared-tier`). **Two of them are env backups that may hold secrets** — never commit; consider moving to a private place | SUSPECTED |

Odd cases: `moxir-versions` tracks the preview branch of another tree; `the-cut-run` and `signoff-pack` are local-only branches whose commits do exist on some remote. `di.iiii-movetest/.movement-rig/trees/507dcbba` is a worktree nested inside another worktree (tool-made, a hand-made state that no script owns).

### 2c. Reports left inside trees (27)
Agents were told to write their report to a file; 27 trees hold an untracked REPORT-*.md or .verify/ folder. These files are the only copy. Examples: REPORT-B1B2.md (deskplan), REPORT-D2.md (moxir-audit-names), REPORT-add-sources.md, REPORT-follow-from-now.md. They must be copied somewhere (docs/ai/sessions/ or the ledger) before any tree is removed — the removal command below refuses a tree with untracked files, which protects them.

## 3. Branches and PRs

### 3a. Open PRs by shape

| Shape | PRs | Mark |
|---|---|---|
| **The rig-builder stack, 19 PRs, all drafts, stacked 1 on top of the other**, root #587 (feat/moxir-hall) which is CONFLICTING with dev: #587 → #594 → #595 → #596 → #600 → #602 → #607 → #608 → #609 → #613 → #614 → #615 → #616 → #619 → #620 → #621 → #622 → #624 → #630. Each child is "MERGEABLE" only against its parent, so GitHub's green hides that the whole stack is 7 days old and cannot land until #587 is rebased. | 19 | CONFIRMED |
| MOXIR light chain: #644 (visualiser, conflicting) ← #659 (MOXIR Minimal patch, "stacked on #644") ← #665 (the cut's patch, "stacked on #659"); all base dev, all conflicting | 3 | CONFIRMED |
| Nodes chain: #731 → #736 → #742 (stacked on #730, which is MERGED, so #731's base branch `feat/nodes-pure-ports` may be gone — retarget to dev) | 3 | SUSPECTED for the base branch |
| Dependabot, 3 days old, all behind dev: #687–#696 | 10 | CONFIRMED |
| **Superseded**: #745 (room output mode) — landed as #759 "land: #745 — Lite by default" (merged 2026-10-04). #745 is still open and conflicting. | 1 | CONFIRMED |
| **Duplicates by a land PR**: #763 "land: concepts (#760), picture settings (#761), release channels (#762)" re-carries three open PRs. When #763 merges, #760, #761, #762 must be closed as done; until then they are the same code twice. | 4 | CONFIRMED |
| #755 "MOXIR lighting rig: hall model…" from `cloud/review-a2-2026-09-30`, **base main** (prod), conflicting. Same subject as #587 and the rig stack (hall model, fixtures, rig builder) — likely an older cloud-session copy of the same work. A merge into main would skip dev. | 1 | SUSPECTED duplicate |
| Conflicting with dev, drafts or ready, single: #599, #625, #627, #718, #724, #725, #726, #728, #732, #737, #741, #746, #748 | 13 | CONFIRMED |
| Fresh (today, 2026-10-05), behind dev only: #753, #760–#762, #765–#769 (#763 BLOCKED) | 10 | CONFIRMED |

Age: oldest open PRs are 7 days (the rig stack); nothing is older than 7 days, but there are 62 of them, which is the same size as the whole last week of work. 21 conflict with dev (CONFIRMED by `mergeable=CONFLICTING`).

### 3b. Branches on origin (470)
- 296 belong to merged PRs and are still on origin — safe to delete on the remote after the PR page confirms (the PR page keeps the diff). CONFIRMED.
- 104 have no PR. 32 of these are already inside dev. 72 are not: feat 25, fix 16, docs 7, preview 3, rescue 3, chore 2, cloud 2, night 2, wip 2, backup/claude/fork-cleanup/keep/local/main 1 each. The `rescue/*`, `backup/*`, `keep/*`, `night/*`, `wip/*` names look like deliberate saves; **do not delete them without the owner reading the list** (SUSPECTED purpose).
- 12 branches have closed-but-unmerged PRs.

### 3c. Local clutter
413 `pr/*` refs, 11–16 each of `emily`, `emily-https`, `emilyhttps` remote-tracking refs, and 4 odd remotes names (n22, tmpwcc, probe, emilypr) were created by earlier work; they carry no information that is not on GitHub. 625 local branches, 433 merged. 2 stashes, 12 tags — look at the stashes before anything.

## 4. docs/ and the written record

### 4a. The tree (on origin/dev)

| Place | Files | Note |
|---|---|---|
| docs/ai | 31 + roles 14 + audits 5 + sessions 15 + owner-notes 1 | the deep reference |
| docs/architecture | 26 + rig 3 + decisions + moxir-crew-ui | specs; 12 named SPEC_* files |
| docs/deploy | 10 + legacy 4 | 6 of them mention cPanel |
| docs/research | 5 + mirrors 11 | |
| docs/raw | 7 | 4 of 7 are 2026-10-02 audit/plan files |
| docs/ops, roadmaps, testing, templates, deck, team, checkpoints | 5, 4, 2, 2, 2, 1, 1 | |
| Root of repo | CURRENT.md (47 lines), PROGRESS.md (**19,708 lines**), CHEATSHEET.md, ONBOARDING.md, AGENTS.md, CLAUDE.md and GEMINI.md (12 lines each, 2026-04-24), public-README.md (2026-09-02), MANIFESTO.md | |

### 4b. Audits are spread over 6 places (CONFIRMED)
| Place | Audits |
|---|---|
| docs/ai/ (root) | audit-2026-06-22, 06-24-as-built, 06-24-as-documented, 07-07, 07-17, wcc-landing-audit (6) |
| docs/ai/audits/ | 4 Raw audits of 2026-09-14, follow-audit-2026-10-04 (5) |
| docs/architecture/ | PROJECT_AUDIT_2026-04-17 (1) |
| docs/raw/ | nodes-audit, nodes-broken-audit (2026-10-02) (2) |
| docs/research/ | raw-ux-audit, spaces-audit (+ 2 HTML mirrors of full audits) (4) |
| Only on unmerged branches | docs/moxir-audit-2026-10-05, room-light-and-reflections-audit, moxir tools map, signoff pack, follow-measured (#746) |

That is about 18 audits on dev under 5 naming styles (`audit-DATE`, `DATE-name`, `name-audit-DATE`, `PROJECT_AUDIT_DATE`, `name-audit`). There is no `docs/audit/` until this one. Slice C is the first file in it.

### 4c. No index (CONFIRMED by searching every md/js/yml for the filename)
27 of 142 doc files are named nowhere else: all 14 session notes (docs/ai/sessions/README.md lists the pattern but not these), `wcc-landing-audit`, `2026-09-14-raw-fix-plan`, ECOSYSTEM, PROJECTION_MAPPING, SPEC_github_sync_multifile, PUBLIC_DI_I_TRANSITION, LAYOUT_CANVAS_FIRST, market-landscape, use-without-an-account, STUDIO_CONTENT_MODEL_UX, V1_STUDIO_PARITY, REALTIME_COLLAB_TESTING, viewport-extraction-plan. Also docs/ai/index.md was last touched 2026-08-06 and does not list the audits folder or any of the October docs (SUSPECTED from the first 30 lines read; check the rest).

### 4d. Stale or contradicting (mark in each)
| Item | Claim | Mark |
|---|---|---|
| docs/deploy/VPS_DOCKER_DEPLOY.md calls the VPS "the new production deploy path"; the owner's own memory says the VPS is OFFLINE and unpaid and Main deploy goes the Mac path | contradicts reality | SUSPECTED — confirm with owner |
| docs/deploy/SSH_STAGING_DEPLOY.md and a "staging" branch (chore/no-staging-host, never landed, 19 days) | staging was removed; doc still describes it | SUSPECTED |
| 2 cPanel deploy docs, `chore/remove-cpanel` worktree (75 edits uncommitted) | cPanel path both documented and half-removed | CONFIRMED the branch is not landed |
| CLAUDE.md and GEMINI.md, 12 lines, 2026-04-24, while AGENTS.md is 2026-09-28 | generated bridge files, 5 months old | SUSPECTED stale |
| PROGRESS.md 19,708 lines, last edited 2026-10-04 | a changelog read by nobody can read it; the page-is-not-the-changelog rule | CONFIRMED size |
| CURRENT.md vs OPEN_THREADS.md vs the owner ledger vs docs/ai/INBOX.md (60 lines, 2026-09-29) | four places answer "what is open" | CONFIRMED four places |
| docs/ai/audit-2026-06-24-as-built vs -as-documented | a pair, old; superseded by later audits | SUSPECTED |
| WCC_MERGE_PLAN, viewport-extraction-plan (2026-09-09), studio-beta-fork-map (08-06) at docs/ root | plans for done work | SUSPECTED |

### 4e. Records outside the repo (read only)
| File | Size | State |
|---|---|---|
| ~/work/OPEN_THREADS.md | 1,109 lines, 106 KB, sections from 09-07 to 10-04; the newest checkpoints are at the top, the oldest at the bottom (it is two files joined: a 10-04 head and a "carried out of chat transcripts" body) | CONFIRMED |
| ~/work/OWNER_REQUESTS_2026-09-30.md | 594 lines, 234 KB, about 241 table rows; last write 2026-10-05 02:31. Rule 3 says scan OPEN/PARTIAL rows before every reply; 197 lines mention OPEN or PARTIAL (it is too long to scan by eye) | CONFIRMED |

Both are bigger than a person or a cheaper model will read. Neither has a closed/archived split.

## 5. Findings, worst first

1. **Five trees hold work that exists nowhere else**: followgaps (5 commits plus 5 files), moxir-deskplan, reid (1 commit each), nocpanel (75 uncommitted files, 19 days), movement (9 files). CONFIRMED.
2. **A 19-PR draft stack, root conflicting**, plus #755 aimed at main — the biggest body of MOXIR work cannot land as it stands. CONFIRMED stack; #755 duplicate SUSPECTED.
3. **275 worktrees, 119 GB, 185 of them dead weight**, and 27 agent reports stored only inside trees; 625 local branches and 413 stale `pr/*` refs. CONFIRMED.
4. Docs: audits in 6 places, 27 docs unindexed, 4 "what is open" files, 19,708-line PROGRESS.md, deploy docs describing a VPS and staging that are gone. CONFIRMED / SUSPECTED as marked.

## 6. The one cleanup plan (owner approves each step; ranked)

**Do not touch before the MOXIR show, 17 Oct 2026** (applies to every step): the trees `moxir-*`, `the-cut-*`, `rig-*`, `preview-rigbuilder*`, `lasercube`, `pack-*`, `moxir-todev`; the branches and PRs of the rig stack (#587–#630), #644, #659, #665, #755, #765, #766, #767; any dev merge or branch delete on origin touching them; origin/main and prod; PROGRESS/CURRENT. The show version is Known · full on dev, built from git (#767). Everything below is chosen to stay clear of that. Run steps only on a cool machine; one at a time.

| # | Step | Command shape | Undo | Before the show? |
|---|---|---|---|---|
| 1 | **Save the 5 trees' work.** In each of followgaps, moxir-deskplan, reid commit if needed and `git push origin HEAD:<their own PR branch>` (followgaps: a new branch `fix/follow-gaps-2026-10-05`; its upstream is wrong); nocpanel and movement: commit on their branch and push. | `git -C <tree> add -- <files>; git commit; git push -u origin HEAD` | delete the pushed branch (a push cannot destroy anything) | Yes — safest thing to do first; the push gate runs lint, so do it on a cool machine |
| 2 | **Copy the 27 reports** to `docs/ai/sessions/` (or the ledger) and commit them. | cp REPORT-*.md | delete the copy | Yes |
| 3 | **Remove the 185 safe worktrees**, one by one with a plain (no `--force`) remove, so git refuses any tree with an unsaved file. List in Appendix A. Frees about 100 GB and ends the heat and disk pressure. | `git worktree remove <tree>` per name | `git worktree add <path> <branch>` — the branch stays on origin, nothing is lost | Yes; none is in the do-not-touch set |
| 4 | **Retire the superseded and duplicate PRs**: close #745 (landed as #759); after #763 merges, close #760/#761/#762 ("landed in #763"). Dependabot: merge or close the 10 in one batch after the show. Retarget #731 to dev. | `gh pr close <n> -c "superseded by #…"` | `gh pr reopen <n>` | #745 yes; the rest after #763 |
| 5 | **Move audits into docs/audit/** by git mv, one dated name per file (`docs/audit/YYYY-MM-DD-topic.md`), leave a one-line pointer note in each old place, and add `docs/audit/README.md` as the index. Index the 27 unlisted files in docs/ai/index.md. | `git mv` | `git revert` | Yes: docs only, but inside a PR through the proper route |
| 6 | **Fix the written record**: add a "status: superseded" header to the VPS, SSH staging and cPanel deploy docs (owner says which is true); regenerate CLAUDE.md/GEMINI.md from AGENTS.md; split PROGRESS.md into a short CURRENT and an `archive/` year file; split the ledger and OPEN_THREADS into OPEN (live) and closed files. | | revert | After the show |
| 7 | **Branches**: delete the 296 merged-PR branches on origin and the 433 merged local ones; list the 72 un-PR'd, unmerged ones for the owner to sort into keep / PR / drop (`rescue/*`, `backup/*`, `keep/*`, `night/*` stay). Delete the `pr/*` and fork remote-tracking refs. | `git push origin --delete <b>` from a list | a deleted branch comes back from its PR page ("Restore branch") for merged PRs; keep a text file of every name and tip sha first | After the show |
| 8 | **The 45 stale unmerged trees**: after step 1, remove the trees too (their branches stay); decide per PR to rebase or close. The rig stack gets rebased in ONE decision after the show. | as step 3 | as step 3 | After the show |
| 9 | **Stop it growing again**: a rule that an agent tree is removed in the same turn its PR merges; a weekly read-only listing (worktrees without a PR, branches without a PR). Needs an owner word before any automation. | | | After the show |

## Appendix A — the 185 worktrees safe to remove (step 3)
Merged into dev or PR merged, no commit missing from the remotes, nothing uncommitted except a REPORT file. Names drop the prefix `di.iiii-` (agent trees: `di.iiii/.claude/worktrees/`). Excluded: the three audit-org trees, MOXIR trees (`moxir-map`, `moxir-todev`, `moxirlook`, `moxirswitch`), and the newest three `pack-*`.

a11y, assetcache, audit-0930, authhub, batch-0924, batch-afe, batch-bg, batch-nav, bom, bridle, bugs-0930, bundlefix, changes, contracts-0930, copyleaks, copyrule, crlf, cue-ltp, deskback, director-dmx, envorder, everyhand, fe-bugs, fetchtimeout, flake, flaky, flaky-0930, fold, fold-0929, fold-b-0928, fold651, fold702, foldnotes, follow-cli, follow-empty, follow-gaps, follow-wake, follow-wholedoc, followat, followfiles, follows-fix, frontframe-0930, frozen-bindings, funding, gate-0930, gatefix, geostudio, hall-0929, halo, hooksall, hotfix, installer, kit, kit-grid, land-1004, land-2026-09-23, land-2026-09-27, land-2026-09-28, land-2026-09-28b, land-2026-09-28c, land-2026-09-28d, land-2026-09-29, land-2026-09-30, land-2026-10-04, land-739, land-745, land-batch, land-cap, land-layers, land-rigbuilder, land2, landnotes, lightsim, local-badge, mac-standby, machines, mapentry, mapfile, mapphone, mapwake, mcp, move, nav-blender, nav-views, ndi, ndi2, ndiout, netlink, noblank, node-names, nodes-ports, nodes-ui, pack-asuz, phoneview, place, power-fallback, pr754, preview-rigbuilder-10, preview-rigbuilder-13, projname, proposals, proxyip, publishdev, push-light, range, raw-nopa-bugs, rawaudit, rigbuild, rigmirror, sacn-fix, scan, sec-audit, send, shelf-scope, show-dot, skillport, smallui, smartview, spacedesk, spaces-audit, spot, square-0930, square2-0930, stage, steward, stream, support-nav, the-cut, tierskip, topgen, trashscope, truewords, twolines, uptime, versions, visproxy, vitest5, watch, win-guards, wininstall, work-light, xflat, agent-a026f2a5db8d4dead, agent-a043a872e32c27588, agent-a1c5289397bf9b14b, agent-a303bb0273170d702, agent-a33dbb5c328452434, agent-a35889e61e8fcf4e0, agent-a3e70e8c727b81fe1, agent-a7f3e10fa16170366, agent-a8d6edab7478659dd, agent-a949852b4a228b791, agent-a953994bddfbfb61c, agent-aa68e80d4d33279c8, agent-aa98d152e8d020923, agent-aac83a0c3ead3def4, agent-abdf39c37b8b16faa, agent-ac10fd0d4ff8ac6bc, agent-ae0f2cdd0e6a9df76, agent-ae621aff7b52b6fea, agent-ae778c4035458d9d1, acct, aiuse, desktitle, fan, follownow, jamfloor, layers, mapundo, moreov, newproj, oldhost, onelist, onename, phdr, phonebar, place2, rawhelp, revoke, showbar, showfile, stats, things, touch, traps

The 24 of these that hold a REPORT/verify file (step 2 first): acct, aiuse, desktitle, fan, follownow, jamfloor, layers, mapundo, moreov, newproj, oldhost, onelist, onename, phdr, phonebar, place2, rawhelp, revoke, showbar, showfile, stats, things, touch, traps
