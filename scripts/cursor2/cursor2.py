#!/usr/bin/env python3
"""cursor2 — PROTOTYPE: the touchpad becomes a second cursor on Hyprland (owner N3051/N3083).

How it works (spec: docs/design/multi-cursor-and-controllers.md, "Form 4"):
  1. grabs the touchpad exclusively (EVIOCGRAB), so Hyprland no longer sees it;
  2. turns finger motion into a second cursor position, drawn by overlay/shell.qml
     (a click-through layer-shell window; quickshell);
  3. a click from cursor 2 moves the REAL pointer to cursor 2, clicks (ydotool), and
     moves it back. Hyprland has one pointer, so the two cursors take turns.
Safety: always ungrabs on exit (signal, error, or the CURSOR2_MAX seconds timer, default 120).
Undo: `scripts/cursor2/cursor2 off`. Nothing in the live Hyprland config is touched.
"""
import json, os, re, select, signal, subprocess, sys, time
from pathlib import Path

import evdev
from evdev import ecodes as e

RUN = Path(os.environ.get("XDG_RUNTIME_DIR", "/tmp")) / "cursor2"
POS = RUN / "pos.json"
MAXS = float(os.environ.get("CURSOR2_MAX", "120"))
PX_PER_MM = float(os.environ.get("CURSOR2_PX_PER_MM", "14"))
LOG = lambda *a: print(time.strftime("%H:%M:%S"), *a, flush=True)


def find_touchpad():
    forced = os.environ.get("CURSOR2_DEV")
    if forced:
        return evdev.InputDevice(forced)
    for p in evdev.list_devices():
        d = evdev.InputDevice(p)
        if re.search(r"touchpad", d.name, re.I) and not re.search(r"dualsense|wireless controller", d.name, re.I):
            if e.EV_ABS in d.capabilities():
                return d
    return None


def monitors():
    out = json.loads(subprocess.check_output(["hyprctl", "-j", "monitors"], text=True))
    rects = []
    for m in out:
        w, h, s = m["width"], m["height"], m["scale"] or 1.0
        lw, lh = w / s, h / s
        if m.get("transform", 0) % 2 == 1:
            lw, lh = lh, lw
        rects.append((m["x"], m["y"], m["x"] + lw, m["y"] + lh, m["name"]))
    return rects


def real_pos():
    x, y = subprocess.check_output(["hyprctl", "cursorpos"], text=True).strip().split(",")
    return float(x), float(y)


def move_real(x, y):
    subprocess.run(["hyprctl", "eval", f"hl.dispatch(hl.dsp.cursor.move({{ x = {int(x)}, y = {int(y)} }}))"],
                   stdout=subprocess.DEVNULL, check=False)


def click(code):  # ydotool: 0x40 left down, 0x80 left up, 0x41 right down, 0x81 right up
    subprocess.run(["ydotool", "click", hex(code)], stdout=subprocess.DEVNULL, check=False)


def inside(rects, x, y):
    return any(a <= x < c and b <= y < d for a, b, c, d, _ in rects)


def write_pos(x, y, down):
    RUN.mkdir(parents=True, exist_ok=True)
    # in place, not rename: the overlay's file watcher loses a replaced file
    with open(POS, "w") as f:
        f.write(json.dumps({"x": x, "y": y, "down": down}))


def main():
    dev = find_touchpad()
    if not dev:
        LOG("no touchpad found"); return 2
    rects = monitors()
    caps = dict(dev.capabilities().get(e.EV_ABS, []))
    ax = e.ABS_MT_POSITION_X if e.ABS_MT_POSITION_X in caps else e.ABS_X
    ay = e.ABS_MT_POSITION_Y if e.ABS_MT_POSITION_Y in caps else e.ABS_Y
    infox = dev.absinfo(ax)
    res = infox.resolution or 0
    px_per_unit = (PX_PER_MM / res) if res else 1920 / max(1, infox.max - infox.min) * 0.7
    LOG("touchpad:", dev.name, "monitors:", [r[4] for r in rects], f"px/unit={px_per_unit:.3f}")
    if "--dry-run" in sys.argv:
        LOG("dry run: no grab"); return 0

    cx, cy = real_pos()
    cx, cy = cx + 80, cy + 80
    if not inside(rects, cx, cy):
        cx, cy = real_pos()
    saved = None
    last = {"x": None, "y": None}
    t_down = None; moved = 0.0
    btn = {e.BTN_LEFT: (0x40, 0x80), e.BTN_RIGHT: (0x41, 0x81)}
    held = None
    nmove = 0

    overlay = subprocess.Popen(["quickshell", "-p", str(Path(__file__).parent / "overlay")],
                               stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    stop = {"v": False}
    for s in (signal.SIGTERM, signal.SIGINT, signal.SIGHUP):
        signal.signal(s, lambda *_: stop.__setitem__("v", True))
    dev.grab()
    LOG("grabbed; cursor 2 at", int(cx), int(cy), "auto-off in", MAXS, "s")
    end = time.time() + MAXS
    write_pos(cx, cy, False)
    try:
        while not stop["v"] and time.time() < end:
            r, _, _ = select.select([dev.fd], [], [], 0.25)
            if not r:
                continue
            for ev in dev.read():
                if ev.type == e.EV_ABS and ev.code in (ax, ay):
                    k = "x" if ev.code == ax else "y"
                    if last[k] is not None:
                        d = (ev.value - last[k]) * px_per_unit
                        if k == "x": nx, ny = cx + d, cy
                        else: nx, ny = cx, cy + d
                        moved += abs(d)
                        if inside(rects, nx, ny):
                            cx, cy = nx, ny; nmove += 1
                    last[k] = ev.value
                elif ev.type == e.EV_KEY and ev.code == e.BTN_TOUCH:
                    if ev.value == 1:
                        t_down, moved = time.time(), 0.0
                    else:
                        last["x"] = last["y"] = None
                        if t_down and time.time() - t_down < 0.2 and moved < 12 and held is None:
                            saved = real_pos(); move_real(cx, cy); time.sleep(0.03)
                            click(0x40); click(0x80); move_real(*saved)  # tap = click
                            LOG('tap click at', int(cx), int(cy), 'real pointer back to', saved)
                        t_down = None
                elif ev.type == e.EV_KEY and ev.code in btn:
                    if ev.value == 1 and held is None:
                        saved = real_pos(); move_real(cx, cy); time.sleep(0.03)
                        click(btn[ev.code][0]); held = ev.code
                        LOG('press at', int(cx), int(cy), 'btn', ev.code)
                    elif ev.value == 0 and held == ev.code:
                        click(btn[ev.code][1]); held = None
                        LOG('release')
                        if saved: move_real(*saved)
                write_pos(cx, cy, held is not None)
                if held is not None:
                    move_real(cx, cy)
    finally:
        try: dev.ungrab()
        except Exception: pass
        if held is not None:
            click(btn[held][1])
        overlay.terminate()
        POS.unlink(missing_ok=True)
        LOG("ungrabbed, overlay closed; cursor-2 moves:", nmove, "last pos", int(cx), int(cy))
    return 0


if __name__ == "__main__":
    sys.exit(main())
