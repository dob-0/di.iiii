## 2026-11-26 — the auto-updater never steps back a commit; `di update --from` warns when autoupdate would undo it

- The Reika desk went back a version: a file install ran ahead of the hub, then the 5-minute tick followed the hub (older commit).
- The timer now runs `di update --channel <c> --auto`. On the dev channel it holds (log outcome `held`) when the hub's commit is older than, not a descendant of, or cannot be ordered against the running one (GitHub compare, one GET, only when the commits differ). `--allow-downgrade` steps back on purpose and writes a `downgrade-allowed` line to `~/.di/logs/autoupdate.log`. `di update --rollback` is a separate door and unchanged.
- `di update --from <file>` prints a `!!` warning when automatic updates are on and the hub serves another commit than the file (or cannot be read); say `di autoupdate off` first.
- Code: `scripts/di/updateGuard.mjs`, wiring in `scripts/di/cli.mjs` and `scripts/di/autoupdate.mjs`; tests `scripts/di/updateGuard.test.js`.
