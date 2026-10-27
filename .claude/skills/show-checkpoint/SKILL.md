---
name: show-checkpoint
description: Snapshot the exact running state of a live or approved show (project documents, desk, nodes, network, versions) with a RESTORE.md before ANY change, then say the change with its undo and wait for the owner's yes, then change, then measure. Use before every show-time change.
---

# show-checkpoint

**Needs:** the di.iiii checkout, `curl`, `jq`, write access to a backups folder, the admin token env file, network access to the project API and the desk. The worked example folder exists only on the aylmo machine; the method does not need it.

Rule source: owner 2026-10-17 ("keep the exact scene that is going on now, so before every change we keep the current state"), memory `feedback_checkpoint_before_every_show_change`. Method: change management with a tested rollback point (Google SRE book, ch. 8 "Release Engineering", and ch. 15 blameless postmortem for the review). Worked example: `moxir-checkpoint-2026-10-17-2326` (a production's show, an example, not a default). Words: `docs/ai/vocabulary.md`.

**Status, stated:** no checkpoint script exists yet. The steps below are the method used by hand on 2026-10-17; it is UNVALIDATED as a script. Owed: one `scripts/` command that writes the folder and RESTORE.md (ledger row to be added by the lead). `npm run checkpoint` (`scripts/create-checkpoint.mjs`) is a different thing: a code/branch checkpoint, not the show.

## 1. Snapshot (before any change)
Folder: `<backups>/<show>-checkpoint-<yyyy-mm-dd>-<hhmm>/` (any backups root you own; on a di-atlas machine `/mnt/data/backups/di-backups/`). Put in it, each as a file:
- every project document of the show: `curl -s <api>/api/projects/<id>/document > <id>-document.json` (+ the version list, `versions.txt`)
- the desk: cues, looks, layers, dmx, state (`<desk>/api/...` as the desk exposes them: `desk-cues.json`, `desk-looks.json`, `desk-layers.json`, `desk-dmx.json`, `desk-state.json`)
- laser state; every node's `/status`; the active network (`nmcli con show --active > network-active.txt`); player logs; versions of what runs
- `RESTORE.md`: the show's state in one line (documents + versions, desk cue index, node modes), then the restore steps in order, one command each, with the token NAMED not written (`ADMIN_API_TOKEN` from your token env file), and a CHECK line at the end with the measure that proves it is back.
Read RESTORE.md once as a stranger would; a step that needs memory is not done.

## 2. Say it, wait
One line to the owner: what changes, the undo (the RESTORE.md step), and wait for his yes. Nothing moves before it. A quiet-hours or "send only with him present" rule still applies to anything that reaches people.

## 3. Change, then measure
Make the one change (narrow mode only; see `show-scenes-job`). Measure after against the CHECK line of RESTORE.md, with numbers (for light: the node-lag measure; for a document: version and count read back). Say the result with its numbers.

## 4. Restore
Run RESTORE.md top to bottom; stop at any CHECK that fails and say which. The one-command target is a restore script that reads RESTORE.md's steps (owed); until then the command is "RESTORE.md, step N".

## 5. End
`job-end-gate`. The checkpoint folder is kept and named in the job's end line (it is the way back); remove nothing.
