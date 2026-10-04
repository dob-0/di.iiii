# Movement rig

Measures how di.iiii's first-person walker **feels**: look, walk, stop, fly, frame
pacing and the phone joystick. It runs a real headed Chromium on the real GPU and
writes numbers plus evidence frames. It measures any worktree **without changing
it**, so the same command produces a BEFORE on `dev` and an AFTER on a feature
branch.

```bash
# from this checkout (test/movement-rig), against any di.iiii worktree:
node scripts/movement-rig/run.mjs --worktree ~/work/di.iiii-movefeel --label "feat/elite-move" \
    --moxir-bundle ~/work/di.iiii-movetest/.movement-rig/moxir-2026-09-28.space-bundle.tar.gz

# compare two runs (every headline number side by side):
node scripts/movement-rig/report.mjs .movement-rig/before-dev/results.json .movement-rig/<after>/results.json
```

The target worktree needs `npm ci` and `npm --prefix serverXR ci`. One run takes
about 10 minutes for two rooms. The output goes to
`.movement-rig/<date>-<branch>/`, which is gitignored:

| file | what |
|---|---|
| `results.json` | every number |
| `report.md` | the headline table |
| `eye/<room>/<clip>/` | screencast frames (`f0000.jpg`…), `camera.json` (the camera of every frame), `sheet.jpg` (12 frames, 4×3), `clip.mp4` (real frame timing) |
| `run.log`, `serverXR.log`, `vite.log`, `kwin.log` | what happened |

Unit tests for the maths: `npx vitest run ../scripts/movement-rig/metrics.test.js`.

## What it builds, and why

1. **A private display.** The rig starts `dbus-run-session -- kwin_wayland --virtual --xwayland`
   with its own session bus AND its own `XDG_RUNTIME_DIR` (on the desktop bus, a nested KWin
   exiting strips the owner's real KWin of its global keys; on the desktop runtime dir, the
   private bus's document portal takes the owner's flatpak portal mount with it, and Zen and
   Chromium stop starting — 2026-10-05),
   which gives a nested KWin with its own Xwayland (default 2560×1440, the
   owner's panel). It then re-runs itself inside that display with
   `--exit-with-session`, so the display goes away when the run ends.
   Two reasons for this:
   - A browser window on the owner's hidden "agents" desktop is never granted
     pointer lock. Measured: `pointerlockerror`, because X refuses a grab on an
     unmapped window.
   - `xdotool` on `:0` would move the owner's own pointer.

   Inside the nested display Chromium runs on the NVIDIA RTX 3080. The renderer
   string is recorded on every run. Pointer lock is granted there, and nothing
   reaches the owner's screen, pointer or keyboard. Chromium is forced to
   `--ozone-platform=x11` (an Xwayland client), which is how it runs in the
   owner's X11 session. Left to choose, it picks Wayland and crashes (SEGV)
   on pointer lock.
2. **A throwaway stack from the target's own code.**
   - `serverXR` runs on a free port with `DATA_ROOT` under the run folder.
     Every key in the target's `serverXR/.env*` is blanked, so it never touches
     the shared local tier.
   - Vite runs in dev mode on another free port.
   - Ports 4000, 5173, 443 and 80 are never used.
3. **Two rooms.**
   - `movrig` is a synthetic calibration room built in `rooms.mjs`. It has:
     - a floor and a Gate
     - pillar rows every 4 m
     - a back wall striped every 5°
     - compass towers
   - `moxir` is the MOXIR hall, the owner's venue. It is exported read-only from
     `~/.local/share/di.iiii/data` with `scripts/space-bundle.mjs` and imported
     with the **target's** importer. Pass `--moxir-bundle` so a BEFORE and an
     AFTER walk the same bytes; the sha256 is in `results.json`.
4. **A probe with no app hook.** `probe.mjs` defines `window.__THREE_DEVTOOLS__`,
   which three.js announces every `WebGLRenderer` to. The probe wraps
   `render()` and logs the camera of each on-screen frame. That is what the
   visitor saw, whatever a branch calls its internal state.
   The only app contract the rig uses:
   - `window.__diiWalkerRef` (dev builds only; already guarded by
     `npm run check:input`), used to reset the pose between trials.
   - the `Walk / Fly` button.
   - `.live-scene-fly-btn` / the F key.
   - the `Ascend` button.

## Heat and the shared machine

aylmo runs at 98–100 °C under load. On 09-27 it froze during a
software-rendered browser run. So every browser session the rig opens
(room × desktop/phone, a few minutes each) follows these rules
(`machine.mjs`):

- It **waits** until `sensors` reports the CPU package at or below `--max-temp`
  (default 85 °C). It gives up after 30 minutes and says so.
- It **holds the machine-wide browser lock** (`--lock`, default the shared
  `…/11e8ee0c-…/scratchpad/locks/browser.lock`, env `DI_BROWSER_LOCK`), so only
  one browser runs on the machine at a time.
- It **closes** the browser before it releases the lock.
- It **refuses a software renderer**. Playwright's
  `--enable-unsafe-swiftshader` is removed, and a SwiftShader/llvmpipe renderer
  string aborts the run.

Load average and package temperature before and after every session are
written into `results.json` and `report.md`. A session marked **BUSY** has
frame times that are not an idle machine's. Movement physics (speeds, stop
distances, gains) does not depend on load. Frame pacing does.

## What each trial does

| suite | input | reads |
|---|---|---|
| look | DOM `mousemove` with exact `movementX` (the app's transfer function), and CDP mouse moves (trusted, through Chromium's input pipeline) | deg/count, cm/360 @ 800 DPI, CS2/Apex sens (0.022°/count × sens), linearity of 200 counts sent fast vs slow, slow sweep, look dead-time after the click that locks, settle frames (smoothing), input→frame latency, pitch limits, wheel turn/dolly, drag-look |
| move | CDP key events: W, D, S, W+D, ArrowLeft, 12 taps, walk at a solid | top speed, t10/t50/t90, ramp shape (t50/t90: linear 0.56, eased 0.30), stop time and distance, drift after rest, head bob (cm, Hz), per-frame step CV (judder at a fixed refresh), diagonal/straight, key→frame latency, pass-through of a solid, a 90° turn while walking |
| fly | Space / C / W in fly mode; up to the truss height and back; leave fly mode in the air; hold C for 3 s | climb/descend rate and ramp, vertical stop, lowest camera (below 0 = under the floor), return to eye height |
| pacing | idle 4 s; walk+strafe 4.5 s; the same W run at ~37 fps (25 ms of work burnt in every frame) and at CPU ×4 (`Emulation.setCPUThrottlingRate`) | fps, frame time p50/p95/p99/max, hitches (>1.5× p50), whether speed, stop distance and travel stay the same when the frame rate changes |
| phone | 390×844 @ DPR 3, touch, `Input.dispatchTouchEvent` | joystick top speed / t90 / stop, touch-look degrees per screen width, joystick sideways turn rate, Ascend climb |
| eye | CDP screencast | slow look sweep, walk start/stop, strafe past columns, fly to the truss and back, phone joystick walk. **Open the sheets.** |

## Limits (stated, not rounded up)

- **OS → browser counts are not measured.** Look numbers are in `movementX`
  units. A real mouse count reaches `movementX` through the OS (libinput flat
  profile: the owner's `kcminputrc` sets `X11LibInputXAccelProfileFlat=true`)
  and through Chromium's DPR scaling at 1.5. OS-level injection was tried
  inside the nested display: `xdotool mousemove_relative` under pointer lock
  delivered 0 movement and dropped the lock, because Xwayland routes XTest
  through libei.
  **Owed:** a uinput mouse on a dedicated seat, or a 1-minute hand calibration
  by the owner (move exactly 10 cm with `?inputdebug=1` open and sum the
  deltas).
- **Latency stops at the frame.** "input → frame" ends at the first rendered
  frame that shows the change. Compositor and display scan-out are not
  included.
- **One refresh rate.** The nested output runs at 60 Hz. The owner's panel
  also does 240 Hz; frame-rate independence is covered by slowing frames down,
  not by speeding them up.
- **GPU.** The nested display renders on the NVIDIA card. The owner's own
  browser on `:0` came up on the Intel iGPU when this was checked (a plain
  headed Chromium there reported `Mesa Intel UHD`). Frame times are this GPU's.
- **XR is listed, not measured.** There is no headset here.
- **The screencast is not vsync-exact.** Frame counts come from the camera
  log. The frames are for the eye.
