## 2026-09-28 — the standby build cannot hang on a dead link any more

- The first deploy the standby host pulled by itself hung: the release build's `git fetch` stalled at 38 MB on a
  dropped link, and neither git nor curl has a timeout of its own, so the build held the deploy lock with nothing said.
- `scripts/standby/build-runtime.sh`: the source fetch gives up under 1 KB/s for 60 s and is retried three times;
  the node download is bounded (`--connect-timeout 20 --max-time 900 --retry 3`).
- Measured against a silent server: bare fetch still hanging at 25 s; bounded fetch ended itself at 10 s.
- Guard `scripts/standby/build-runtime.test.js`: 3 of 3 red on the old script, green on the new; standby tests 16/16.
- The host-side half (the deployer retries a failed BUILD up to three times instead of holding the commit) is in the
  private ops repo.
