## 2026-09-21 — `di stage`: displays as data — which screen shows which mapping

Step D of `~/work/di-atlas/decisions/2026-09-20-di-stage-plan.md`, on top of #513. A
two-display stage box no longer needs a hand-made kiosk script: the document says
which machine and screen a mapping goes on, the supervisor reads the displays off the
OS and keeps one kiosk per assigned display.

- **`output.show` in the mapping document.** `{ machine: <machine.json id>, name?,
  screen: { label, index, size } | 'all' }`, plus `slate: 'off'` when authored. The
  trap the plan named was real: `normalizeMappingState` rebuilt `output` from width
  and height alone and stripped it on the first write from any machine. Both twins
  (`src/shared/projectSchema.js`, `shared/projectSchema.cjs`) keep it now, absent
  means absent (older documents come out byte-identical), and a write→read round trip
  is held on each side (`src/map/mappingState.test.js`, `serverXR/src/schemaSync.test.js`).
- **The desk picker.** One `Show on` select in the map bar beside Output: any screen ·
  each machine's all screens · each of its screens by label and size, from what the
  machines hub already reports (#495). It writes label, index AND size so the stage box
  can match by whichever survived a reboot; a document naming a machine not on the
  desk right now keeps its choice visible, marked, rather than snapping to "any".
  Helpers and tests in `src/map/mapMachines.js`.
- **OS probes as data.** `scripts/di/stageDisplays.mjs` (pure) holds the exact command
  per OS and the parser; `displayProbe.mjs` runs it. Linux: `xrandr --query`, tested
  on the REAL capture from this machine (`scripts/di/fixtures/`), Wayland says so and
  assumes one screen. Windows: PowerShell `AllScreens` + `WmiMonitorID`, no elevation.
  macOS: NSScreen through `osascript -l JavaScript` for positions (system_profiler has
  none) + `system_profiler` for mirrors. Windows and macOS were NOT run on their OS —
  plausible samples of the documented shapes, said in the PR. Screen match order is the
  rig's one rule — exact label, contains, size, index — through a third twin of
  `nameMatch` (`scripts/di/nameMatch.mjs`, because the packed CLI sits beside
  `shared/` and the repo's does not), held equal in `src/shared/nameMatch.test.js`.
- **One kiosk per display, verified.** `planDisplays` gives each assigned display its
  own profile, debugging port (9334+) and hold page; no mapping naming this machine =
  #513's single kiosk, unchanged. The supervisor asks each window over CDP where it
  is, corrects ONCE, then reports. **Measured, not assumed:** Chromium's
  `--window-position/--window-size` and its CDP bounds are CSS pixels — this panel at
  150% (`Xft.dpi 144`) reported the fullscreen kiosk as 1707×960 — while xrandr is
  device pixels. The kiosk's own `devicePixelRatio` is the conversion; a placement is
  accepted in either unit and the status names which. Mixed DPI (Windows, a laptop at
  150% with a projector at 100%) is where one ratio stops being true — NOT run there.
- **Hotplug and clones.** Re-probed on the existing tick: a display that goes away
  closes its kiosk with one log line, one that appears gets its kiosk; a mapping naming
  a screen this machine does not have is one dim status row, exit 1, never a crash.
  Cloned displays (same geometry; more monitors than screens; a mirrored display) are
  told and never flipped. Hotplug itself could not be exercised on this one-screen box.
- **Seen end to end on aylmo** against two throwaway installs under the session
  scratchpad (4520/4521, real config home untouched — `~/.config/systemd/user` and
  `~/.config/autostart` byte-identical, zero `di-stage` units). The probe read the real
  xrandr; the document's `show` travelled as ordinary ops over the follow (closing
  #513's open doubt); the kiosk sat on `eDP-1` and CDP confirmed `0,0 1707×960` = the
  panel at ×1.5; `di stage status` exit 0; then a screen called "Optoma" that does not
  exist gave `not showing — no display "Optoma" 1280×800 #4 on this machine — it has
  eDP-1 2560×1440`, exit 1, supervisor alive, kiosk closed; `leave` left only `data/`.
- **Two bugs paid for once** (rows in known-fixes): the normaliser above, and
  `.claude/skills/run-di-iiii/driver.mjs stop`, whose pattern matched EVERY
  `serverXR/src/index.js` on the machine and SIGKILLed the artist's live install on
  443 mid-request while an agent stopped its stack. It now stops only the process
  groups of this checkout's own vite.

**Needs the real two-display box:** the Windows probe on `win` (names joined to
bounds only when WMI and AllScreens agree in count), a second kiosk actually landing
on the projector, mixed-DPI units, and hotplug with a real cable.
