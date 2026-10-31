# Stage watch, USB cut mode, link lines, show-status route, Show-desk line (plan S11), 2026-11-01

## What it does

- `scripts/stage/watch/` — a recorder service for the stage machine (G04, G11, G12): per-USB-device kernel error rate from
  `/dev/kmsg`, heat with the sensor's own crit, throttle counts, cpufreq, top 3, journald's share, MIDI Rx, laser NIC
  counters; link lines once a minute. CSV into the show record, `latest.json` for readers. USB policy warn | cut
  (default warn), protected devices never cut, one-command undo; udev asks systemd for a 30 s re-check after a hot-plug.
  README.md there carries the method, sources and limits.
- `GET /show-status` (serverXR `stage/showStatus.js`, `routes/showStatusRoutes.js`; G25): one JSON of the running show,
  schema `di.show-status/1` — light scene, laser armed or stopped and why, controller heard, link, heat, the watch, last
  change; two clocks (`changed_at`, `sent_at`, period 30 s + grace 60 s). Pushed to the di.bo door only when
  `DI_SHOW_STATUS_PUSH_URL` is set. S12 and S14 plug in with `setProvider('laserSafety' | 'controller', fn)`.
  `stage/fixtures/show-status.example.json` is the example S06's card is built against.
- The Show desk: ONE line in the status corner (`showDesk/ui/stageLine.js`), hidden on a server without the route.

## Tests

`npx vitest run scripts/stage/watch serverXR/src/stage` — Test Files 2 passed, Tests 24 passed.
`npx vitest run serverXR/src/catalogueContracts serverXR/src/stage serverXR/src/showDesk` — Test Files 3 passed, Tests 74 passed.

## Not tested

The stage machine itself (live in a show): its hwmon names, `/proc/asound` text, `/dev/kmsg` as root, the real cut on a
real controller, the install. The line's warn and alert colours were not pictured (the harness showed only "ok").

## Owed

The usbmon and interface-cut bench (hub and controller at aylmo); the tailscaled CPUWeight bench (his word: heat);
the read-only journal read of both link drops; the owner's warn-or-cut word; the install window after the show; the Wiki line.
