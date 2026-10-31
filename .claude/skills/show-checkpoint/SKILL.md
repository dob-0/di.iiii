---
name: show-checkpoint
description: Snapshot the exact running state of a live or approved show with `di show checkpoint` (desk and light data, live states, version and overlays, RESTORE.md, a hashed manifest) before ANY change, then say the change with its undo and wait for the owner's yes, then change, then measure with `di show go`. Use before every show-time change.
---

# show-checkpoint

**Needs:** an installed di or the di.iiii checkout with `di show` (`scripts/show/`), the venue profile of the place (`di show profile --list`), ssh to the show machine as its own user, and `bash`, `tar`, `curl` there. Rule source: owner 2026-10-17 ("keep the exact scene that is going on now, so before every change we keep the current state"), memory `feedback_checkpoint_before_every_show_change`. Method: a tested rollback point before each change (Google SRE book, ch. 8 "Release Engineering"; ch. 15 blameless postmortem for the review). Words: `docs/ai/vocabulary.md`. A place or production named anywhere is an example, never a default.

**Status, stated (2026-11-01):** the command exists: `di show checkpoint` (`scripts/show/checkpoint.mjs`, from di-atlas a0ffd48 `checkpoint.sh`; tests `scripts/show/checkpoint.test.mjs`). It has run here against a temporary di home, not yet against a stage machine. It does not copy the project documents of a space (step 1b stays by hand, owed). `npm run checkpoint` (`scripts/create-checkpoint.mjs`) is a different thing: a code/branch checkpoint, not the show.

## 1. Snapshot (before any change)
`di show checkpoint --venue <id> "<why>"` (`DI_SESSION` names the session). Exit 0 = whole · 3 = partial (data and version kept, a live state unreadable, named) · 1 = failed (`FAILED.txt` says why) · 2 = refused (the machine is marked for another venue). Anything but 0: stop and say it; no change on a partial checkpoint without the owner's word.
Folder `<backupsDir>/<venue>-checkpoint-<yyyy-mm-dd-hhmmss>/`: `data.tgz` (desk and light data; lock files never copied), the live states (`*.json`), `version.txt`, `release.json` and `PATCHES` when the pack has them, `server.txt`, `network.txt`, `ip.txt`, `RESTORE.md`, `manifest.json` (every file with its sha256). The same copy stays on the machine in `~/.cache/di-show/checkpoints/<ts>/`.
1b. When the change touches a space: `curl -s <api>/api/projects/<id>/document > <folder>/<id>-document.json` (+ the version list), the token NAMED not written (`ADMIN_API_TOKEN` from your token env file).
Read RESTORE.md once as a stranger would; a step that needs memory is not done.

## 2. Say it, wait
One line to the owner: what changes, the undo (RESTORE.md's one command), and wait for his yes. Nothing moves before it. Quiet hours and "send only with him present" still apply to anything that reaches people.

## 3. Change, then measure
Make the one change (narrow mode only; see `show-scenes-job`). Then `di show go --venue <id>`: a fresh checkpoint, the soak, every line; say the verdict with its numbers. A NO-GO after a change: restore first, diagnose after.

## 4. Restore
RESTORE.md top to bottom: the one-command undo (`di update --from <pack>` when the profile names `packsDir`), the data only if it went wrong, then its CHECK (`di show go --venue <id> --look` against the saved states). Stop at any CHECK that fails and say which. Owed (S10): one restore command that applies the pack plus its overlays from `manifest.json`.

## 5. End
`job-end-gate`. The checkpoint folder is kept and named in the job's end line (it is the way back); remove nothing.
