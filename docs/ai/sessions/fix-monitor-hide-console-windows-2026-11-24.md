## Monitor commands no longer flash a console window on Windows
- monitorHub.js (git), monitorLedger.js (ledger tools) and monitorStore.js (gh, tailscale, the feeds) ran commands without windowsHide: true. On a Windows machine with Windows Terminal as the default terminal, every monitor refresh (every few seconds) opened a console window for a moment: a ghost window outline over the screen.
- All three now set windowsHide: true.
- Tests: monitorWindowsHide.test.js reads every serverXR/src/monitor*.js and fails if an execFile/spawn call lacks windowsHide.
- Found by watching new processes on the laptop: git.exe, then OpenConsole.exe a moment later, started by the di server. After the fix no OpenConsole.exe appears.
- Not changed: the Services panel's systemctl and the PR panel's gh outside a repo still report "unavailable" on Windows.
