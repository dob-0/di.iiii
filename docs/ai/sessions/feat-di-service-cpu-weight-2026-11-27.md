# di service: CPUWeight=1000 for the local server (2026-11-27)

Owner N7318: the local di server (the live light desk) must win the CPU on a loaded machine.

## What
- `scripts/di/service.mjs` `unitText`: `CPUWeight=1000` in `[Service]` (default 100; systemd.resource-control(5)). Only matters under contention.
- Not added: `IOWeight` (io controller not delegated to user managers; on a test desktop `cgroup.subtree_control` = "cpu memory pids"), negative `Nice` (needs privilege).
- macOS: service.mjs has no launchd/plist builder (systemd only), so no `ProcessType` change.
- Test: `service.test.js` asserts the key, and no IOWeight/Nice.

## Pickup
`di up` (also run by `di update` when the server was running) goes `runner-node.mjs` `startSupervised` -> `writeUnit` -> unit text changed -> `daemon-reload`, then `startUnit` restarts. An update with the server stopped picks it up at the next `di up`.

## Live on a test desktop
The runtime drop-in in `~/.config/systemd/user.control` (set-property) stays; the unit now carries the same value, so the drop-in can be reverted with `systemctl --user revert di-server.service` once the new unit is installed.

## Rollback
Revert the PR.
