## 2026-10-05 — release channels: installs follow the build the hub serves, by themselves

- **Why.** Owner: *"it would be better to have all places the same way, synced"*, *"main is always older than dev,
  people start with the old version — fix that gap"*. aylmo was updated by hand; Releases' latest is v0.4.3.
- **What.** Decision with the cited practice (Chrome channels, VS Code Insiders, Debian suites, unattended-upgrades,
  systemd.timer): `docs/architecture/decisions/2026-10-05-release-channels.md`.
  - CI: job `publish-dev-channel` in `deploy-vps-dev.yml` publishes a `dev-<sha8>` prerelease (tarball + sha256),
    keeps 20, never "latest".
  - `di update --channel dev|stable`, `di channel`: dev = the prerelease of the commit dev.diiii.xyz serves
    (`/serverXR/api/health`), checksum verified, same backup and rollback path.
  - `di autoupdate on|off|status|run`: systemd user timer every 15 min, heat guard at 85 C, one log line per run in
    `~/.di/logs/autoupdate.log`, `di status` shows last check / update / error.
  - `pack-runtime.mjs` records `gitCommit` in release.json.
- **Tests.** `channels.test.js`, `autoupdate.test.js`, `devChannelWorkflow.test.js` (new; fail on origin/dev because
  the modules and job do not exist); `updateSafety`, `updateCheck`, `releaseWorkflow`, `cliRouting` unchanged and green.
- **Owed.** The CI job has not run on GitHub (runs after merge); Windows/macOS timers; a hold for installs running a
  show; the promotion-PR workflow and promote-the-exact-tarball for stable (design in the decision note); `di update`
  on aylmo to enter the channel, then `di channel dev && di autoupdate on` (not run here, by rule).
