# Stage watch — a recorder for the machine that runs a show

Gaps G04 (nothing watched the stage machine; no sanctioned way to cut a flooding device), G11 (the link dropped twice, the
second time without a known cause) and G12 (no USB port plan) of the show-day audit, 2026-11-01; plan slice S11.
On the night of 2026-10-31 a USB controller behind a hub logged 79 649 `urb status -32` lines in 30 s; journald took 82 % of a
core, the machine sat at 103-105 °C for 19 min, the laser link was lost three times, and nothing on any screen said so.

## What it does

`watch.mjs run` is a systemd service that needs no network. Every 5 s it records one CSV row; every 60 s one link line:

| every | what | read from | source of the method |
|---|---|---|---|
| 5 s | kernel error lines per USB device (an early ALERT the moment one device passes its tick's limit) | `/dev/kmsg` (not journald: journald caps and drops) | Documentation/ABI/testing/dev-kmsg; custom, **unvalidated** |
| 5 s | hottest sensor with its own crit/max; thermal_throttle counts; cpufreq | hwmon, `cpu*/thermal_throttle`, `cpufreq` | the counters node_exporter's hwmon/cpu collectors read |
| 5 s | top 3 processes and journald's share of a core | `/proc/<pid>/stat` | proc(5) |
| 5 s | MIDI Rx bytes | `/proc/asound/card*/midi*` | sound/core/rawmidi.c; format not read on the stage machine: **unvalidated** |
| 5 s | laser stops (when serverXR writes `DI_SHOW_STATUS_FILE` and the watch reads it with `--show-status`) | the show-status JSON | ours |
| 5 s | the laser NIC's carrier, carrier_changes, rx_errors | `/sys/class/net/<nic>` | sysfs-class-net ABI |
| 60 s | gateway ping, DNS, tailscale (direct or DERP, handshake age), cube pings | `/proc/net/route`, `ping`, `tailscale status --json` | PeerStatus fields, read from aylmo's tailscale 2026-11-01 |

Files: `<record>/<date>/watch.csv`, `link.csv`, `events.log` (START, ALERT, WARN, CLEAR, USB actions, LINK, STOP), and
`/run/di-stage-watch/latest.json` (rewritten whole each tick). serverXR's `GET /show-status` and the Show desk's one status
line read latest.json; the line says `watch off` when the service is not running.

## Thresholds — unvalidated

No stock default exists for any of them (node_exporter, its node-mixin alerts, sysstat and collectd were checked:
RESEARCH-show-safety §1). `lib.mjs` `DEFAULT_THRESHOLDS` says `validated: false`; the venue profile's `watch` block
(S13) overrides each value, and only a venue profile can say `validated: true`. Heat is judged against the sensor's own
crit (ALERT within 10 °C, WARN within 20 °C), the way sysstat's %temp is relative to temp_max.

## USB policy: warn | cut (the default is warn until the owner's word)

- **warn**: a flood is an ALERT line with the exact cut it would make and its undo. Nothing is written.
- **cut** (kernel primitives, Documentation/usb/authorization.rst): the device's audio-streaming interfaces first
  (class 01 subclass 02; MIDI streaming and audio control are kept), then the whole device if it still floods;
  re-authorized once after 30 s; after the third flood it stays cut and says so. The ledger survives a restart.
- **never cut**: root hubs, hubs (they would drop the devices behind them), network adapters, storage, the venue
  profile's protected list (`{name, port, vidpid}`), and any device with a protected device behind it.
- **undo, one command**: `sudo node scripts/stage/watch/watch.mjs undo`. A dry run prints every write: `cut <port> --dry-run`.
- **unvalidated until the bench** (owed, G12): what an interface cut does to a stalling MIDI endpoint, and whether the card
  keeps its MIDI when only its streaming interfaces go. USBGuard has no rate trigger, so the trigger is ours.

A udev rule asks systemd for a timer when a USB device is plugged (`SYSTEMD_WANTS`, systemd.device(5)); 30 s later
`watch.mjs recheck <port>` writes the device's error lines since the plug and whether it sits on its planned port.

## Commands

```bash
node scripts/stage/watch/watch.mjs once                      # one sample of this machine, as JSON
node scripts/stage/watch/watch.mjs link                      # one link line, as JSON
node scripts/stage/watch/watch.mjs status                    # what latest.json says, one line
node scripts/stage/watch/watch.mjs cut 1-2.1 --dry-run       # the cut and its undo, nothing written
sudo node scripts/stage/watch/watch.mjs undo                 # re-authorize everything the watch cut
sudo env PATH="$PATH" scripts/stage/watch/install.sh --dry-run --usb-mode warn   # what the install would write
sudo env PATH="$PATH" scripts/stage/watch/install.sh --uninstall                 # undo the install (record and ledger kept)
```

Install is the owner's window, in daylight, after the show (the stage machine is never changed during one).

## Measured (aylmo, 2026-11-01; not the stage machine)

- A replay at the night's rate (2 655 lines/s) raised ALERT 1-2 ms after the first flood line (target: 10 s).
- The watch's own CPU over 61 s, steady ticks: idle mean 0.85 % of one core (max 1.20 %), at the night's rate mean 1.19 %
  (max 1.90 %); `--no-link`. The 2015 MacBook's cost is not measured.

## Limits and owed

- The MacBook's own numbers (CPU cost, hwmon names, the rawmidi text, `dmesg_restrict`) are read in daylight, read-only.
- The usbmon bench with the real hub and controller (status -32 per device:endpoint, then the interface cut).
- The CPUWeight bench for tailscaled (his word: it heats aylmo). N1710 is corrected only from that evidence.
- The per-port `disable` and uhubctl are not used: they need a hub with per-port power switching (not checked).
