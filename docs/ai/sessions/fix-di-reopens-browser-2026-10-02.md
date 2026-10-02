## 2026-10-02 — `di` opens the browser again when di.iiii is already running

Owner: "we need one command everyone will remember, if by mistake they close the browser".
`di` (bare) and `di up` printed "already running — URL" and opened nothing when the server was up — the
usual case after closing the tab. `cmdUp` now opens the public URL there too, unless `--no-open`
(all internal restarts pass it). `di open` already did this; now the remembered word does too.

- Guard: `scripts/di/reopen.test.js` — 2 tests, fail on the old code, pass now.
- `lan.test.js` source-order check updated to the new layout (same order rule).
- Wiki `di-cli-local`: "Type di again" line. known-fixes row.
- Tests: `vitest run scripts/di/` 326 passed, 1 failed — `openFile.test.js` "di mcp … release version", which
  fails the same on dev 170340f5 in this worktree (not this change).
- Not done: seen on Windows/macOS (the opener is `start` / `open`, unchanged); after a reboot di does not
  start by itself — `di` starts it (no autostart for the main server; owed if wanted).

### Same day, second step — the install itself opens it

Owner: "you install the di., it opens in browser and everything you do from there". `bootstrap.mjs` printed
"di up — start it, and open it" and stopped. Now it runs `up` from the installed version when a person is at a
terminal (`shouldStartAfterInstall` in install.mjs: not with DI_NO_START=1, not under CI, not without a TTY). A failed
start warns and prints the old line — the install itself already succeeded.

- Guard: `scripts/di/startAfterInstall.test.js` (decision + order in bootstrap).
- Measured: real `install.sh` of a packed release (`di:pack --no-build`) into a throwaway DI_HOME + HOME, fake opener:
  6 s to running, opener got `http://di.localhost:4391`, health 200; `down` → 000; real ~/.bashrc untouched.
- Not done: after a reboot nothing starts it (autostart owed); not run on Windows/macOS.

### Third step — it comes back by itself (`di autostart`)

Owner: "yes go fix" (after a restart nothing started di.iiii; aylmo carried a hand-made `di-up.service` whose own
comment said "di has no supervisor of its own yet"). The install now writes ONE autostart entry, the stage machine's
four OS shapes (`autostartSpec`: systemd user unit, LaunchAgent, logon scheduled task; xdg/Startup fallbacks) under
di.iiii's own names (`DI_ENTRY`: `di-iiii.service`, `studio.thedi.di-iiii`, task `di.iiii`). It runs
`di autostart run` (autostart.mjs): every 5 s, start the server if it is down. `di down` leaves `run/stopped` and the
loop obeys it; `di up` lifts it; a login clears it. On a stage machine the loop does nothing (the stage supervisor owns
the server). The service manager restarts the loop; `KillMode=process` / `AbandonProcessGroup` keep the detached
server alive across that (stage entry unchanged). `di autostart on|off|status`; uninstall removes it first;
`DI_NO_AUTOSTART=1` skips it at install.

- Guards: `scripts/di/autostart.test.js` (9: decision, kill→back, di down obeyed mid-loop, login clears, stage idle,
  the three OS entries, on/off leave nothing).
- Measured on aylmo's real systemd user manager, throwaway DI_HOME: `autostart on` → unit active; server SIGKILLed 3×
  → back in 5.4 / 5.4 / 5.4 s; `di down` → still down after 15 s; `di up` → 200; `systemctl --user restart` of the
  loop → same server pid alive; `autostart off` → unit file gone, 0 unit files, health 000.
- Not done: a real reboot + login (the unit is WantedBy=default.target, the stage path is the same shape); Windows
  and macOS entries covered by spec tests only. aylmo's own hand-made `di-up.service` stays until its di is a release
  with this — then `di autostart on` and remove `di-up.service` (owner's look).
