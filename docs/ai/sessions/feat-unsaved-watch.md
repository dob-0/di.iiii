## 2026-09-29 — a daily watch for work that lives only on one machine

- `npm run unsaved` only helps when someone runs it; Emilya's laptop showed work can sit 25 days
  unseen. New `scripts/unsaved-watch/install.sh` (Linux, systemd user timer) and `install.ps1`
  (Windows, Task Scheduler, daily 18:00 + at logon, runs on battery, catches up after being off).
  Each copies `unsaved.mjs` + `unsaved-lib.mjs` into a per-user app dir (so the watch never depends
  on a checkout's branch or a removed worktree) with a SOURCE.txt naming the commit.
- `unsaved.mjs` gained `--older-than <hours>` (today's work is not news; uncommitted files are aged by
  their mtime since git keeps no time for them; unknown age and stashes are never hidden), `--notify`
  (notify-send / WinRT toast / osascript; a failed notification never hides the finding) and
  `--log <file>` (the one place to look). Exit 1 = something only here (the unit treats it as
  success via SuccessExitStatus=1), 2 = a repo could not be read (marks the unit failed).
- Tests: 54/54 (`unsaved-lib.test.js` + `start-check.test.js`), including the age filter, the mtime
  reader (quoted, renamed, deleted paths) and the flags.
- Seen on aylmo: installed over ~/work, run by `systemctl --user start di-unsaved` — 23 repos in 2.7 s,
  16 hold work older than 24 h only here (log written, unit Result=success, timer next 18:00).
- NOT yet run on Windows: install.ps1 is untested until it runs on ponyo — owed, via Emilya's agent.
