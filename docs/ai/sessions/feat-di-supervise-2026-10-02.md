## 2026-10-02 — systemd supervises the installed di (`di service install`), so it is restarted if it dies

- Step H8 of the local-hosting decision (di-atlas `decisions/2026-10-02-local-hosting.md`). Measured on aylmo: the
  installed di ran under a hand-written `di-up.service` (`Type=oneshot`, `ExecStart=di up --no-open`); the node server
  was nobody's main process, so when it was killed (three times in September) systemd noticed nothing.
- New `scripts/di/service.mjs`: a user unit whose main process IS the server (`Type=exec`, `Restart=always`,
  `RestartSec=2` backing off to 60 s, start limit 10 in 300 s, journal). It names `<DI_HOME>/current`, so `di update`
  needs no unit rewrite. `--lan`/`--guests` live in `$XDG_RUNTIME_DIR/<unit>.start.env` (gone at reboot).
- `runner-node.mjs`: one `serverEnv()` for both paths; `start/stop/isRunning/readLog/followLog` drive the unit when
  `state.json` names one, its file exists and systemd is usable — otherwise the detached path, unchanged.
- `cli.mjs`: `di service install [--name N] | remove | status`; `di status` names the supervisor and says when systemd
  gave up; `di uninstall` removes the unit first.
- Proved on aylmo with a throwaway install (DI_HOME in the session scratchpad, unit `di-up-test`, port 4391, data in
  scratch, DI_SCRATCH=1): kill -9 → restarted in 2 s, health 200; SIGTERM → restarted; down → flip `current` → up
  served the new version with the unit file untouched; `di down` → inactive 10 s later; `di service remove` left no
  unit file and no process. The owner's `di-up.service` and pid were not touched.
- Tests: `scripts/di/service.test.js` (23; 6 fail on the old runner), `lan.test.js` call-site count 7 → 9.
- Pre-existing, not from this branch: `openFile.test.js` "di mcp from an install … release version" fails on
  origin/dev too.
- Owed: the owner's switch-over is his go (commands in the PR body); it needs a build with this code installed on
  aylmo first. launchd `KeepAlive` for macOS is not built (nothing to see it on here).
