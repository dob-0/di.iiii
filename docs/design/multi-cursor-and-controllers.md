# Multi-cursor and controllers — spec (draft)

Status: **draft, 2026-11-09**. Written from one measured session on the desktop `aylmo`.
Every line is tagged **[measured]** (a command ran, this session), **[source]** (read in a
cited page, not run) or **[open]** (not known). Nothing here is built yet.

## 1. Goal

One machine, several hands at once:

- your mouse and your touchpad each drive **their own cursor**;
- a controller (DualSense) plays a game while you type and click elsewhere;
- a remote guest joins as one more pointer, with rights by **level**;
- an **AI agent** gets its own cursor and click, drawn in its own colour, never your cursor.

Owner asks: N2951 (separate cursors, remote guest, levels), N2982 (AI seat), N2994 (many
controllers, managed inputs).

## 2. What is measured today (aylmo, Hyprland 0.57.0, Wayland)

| Fact | Evidence |
| --- | --- |
| The desktop is Wayland with one pointer; mouse and touchpad share it | `hyprctl devices` lists both under one seat **[measured]** |
| Hyprland exposes one seat by design | Hyprland discussion #10336 **[source]** |
| DualSense appears as 4 input devices: gamepad, motion sensors, touchpad, headset jack | `/proc/bus/input/devices` **[measured]** |
| The DualSense touchpad is already a mouse-like device on the one shared cursor | `hyprctl devices` **[measured]** |
| Bluetooth link to the DualSense dropped on its own; over USB it held | `bluetoothctl info` → `Connected: no`; USB `054c:0ce6` present **[measured]** |
| One gamepad's X (Cross) button sent no kernel event while Circle, Square, Triangle did | raw `EV_KEY` read of `/dev/input/event25` **[measured]** |
| `python-evdev` is installed; `/dev/uinput` is `root:input`, user is in `input` | `pacman -Q`, `ls -l`, `id` **[measured]** |
| X11 `xinput create-master` exited 0 but made **no** second pointer, in Xvfb and in Xephyr | `xinput list` before and after **[measured]**, cause **[open]** |
| On a **real Xorg session on VT5** (`scripts/mpx-vt-test.sh`), `create-master Second` made "Second pointer"; the touchpad was reattached to it; mouse and touchpad drove separate cursors. Run 2 (120 s): 11079 events on the Second pointer (touchpad source) and 37429 on the mouse side; the owner saw two cursors | `/tmp/mpx-vt-test.log*` 2026-11-10 01:32–01:34 **[measured]** |
| **Form 4 prototype on Hyprland** (`scripts/cursor2/`): the touchpad is grabbed, a second cursor (blue dot, pink while pressed) is drawn by a click-through quickshell overlay, taps and presses click where it points by moving the real pointer there and back. Run 3 (60 s): `press at 3183 5253 btn 272`, three `tap click at …` lines, pointer returned to `(3360.0, 4937.0)` each time, 3241 moves; the owner saw the dot and said it worked | `/run/user/1000/cursor2/log` 2026-11-10 02:22 **[measured]**, owner's words N3115 |
| In that run the xterm window did not show (`cannot load font`, still after installing `xorg-fonts-misc`); cause **[open]** | same log **[measured]** |

## 3. Model

- **Seat**: one cursor + one focus. Each physical or virtual pointer device is attached to one seat.
- **Slot**: the player number of a controller (1..N). A controller can also drive a seat (its touchpad).
- **Level** (a Linux group per level; one table of rights, one service reads it):

| Level | May do |
| --- | --- |
| `view` | move its cursor, see; no clicks |
| `point` | click inside windows the owner allows |
| `play` | gamepad input to one named app |
| `full` | keyboard too |
| `admin` | change levels, freeze everyone |

- **Agent seat**: a virtual device made with uinput, its cursor drawn in its own colour, a level
  like any guest. It replaces `xdotool`/`ydotool` on the owner's display (forbidden by the owner's rule).
- **Freeze key**: one key, owned by the owner, that stops every non-owner device at once.

## 4. Routes to a second cursor

| Route | How | State |
| --- | --- | --- |
| A. X11 MPX | `xinput create-master`, `reattach` a device to it (X.Org MPX, `xinput` man page) | docs **[source]**; nested servers failed **[measured]**; **real Xorg on a VT works: two cursors, mouse and touchpad separate [measured]**; inside Hyprland **[open]**, it has one pointer |
| B. Wayland multi-seat (e.g. sway) | one seat per device group | sway supports it per the Hyprland discussion **[source]**; not read or tested **[open]** |
| C. Overlay on Hyprland | extra cursor drawn by us, clicks sent through uinput | not a true second pointer; fits the agent seat **[open]** |

Order of work: A on a free VT (fast, answers "does it work here"), then B if A glitches, C for
the agent seat on Hyprland either way.

## 5. Test plan (pass numbers written first)

1. **VT test (A).** Real Xorg on a free VT; `xinput create-master Second`; `xinput list --short`
   must show a new master pointer; `xinput reattach <touchpad id> "Second pointer"`.
   PASS = two cursors, mouse and touchpad move them separately for 60 s; return to Hyprland by one command.
2. **Controller list.** Script lists every controller with slot and level using `python-evdev`.
   PASS = the DualSense shows with its 4 devices and a slot.
3. **Button check.** 25 s raw read per controller; every face button down and up counts match.
4. **Agent seat.** A virtual pointer moves and clicks inside one allowed window only.
   PASS = the owner's cursor never moves while the agent acts.

## 6. Safety and undo

- No change touches the live Hyprland config. Every test has a one-command undo and a timed return.
- A VT switch pauses the owner's session input; the game keeps running but gets no input until back. **[open]** exact behaviour untested.
- No remote guest is exposed until levels exist; the default level is `view`.

## 7. Open

- Why `create-master` made nothing in Xvfb and Xephyr (server type, or `xinput` 1.6.4).
- Bluetooth adapter limit for many controllers (1 adapter here).
- Whether Cyberpunk reads the DualSense while another window has focus: the owner said it worked; not seen by the agent.
- Which route the owner wants as default.

## 8. Sources

- X.Org MPX: https://www.x.org/Development/Documentation/MPX/
- `xinput` man page: https://xorg.freedesktop.org/archive/X11R7.7/doc/man/man1/xinput.1.xhtml
- Ubuntu MPX wiki (2010, old): https://wiki.ubuntu.com/X/MPX
- Hyprland multi-seat discussion #10336: https://github-users.yhajoo.workers.dev/hyprwm/Hyprland/discussions/10336
