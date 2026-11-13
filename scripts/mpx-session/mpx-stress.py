#!/usr/bin/env python3
"""mpx-stress.py — drive two virtual pointers at once inside the MPX X session, no hands (owner N3353).

Runs INSIDE the test X session (DISPLAY set, root). Creates two uinput mice ("mpxstressA", "mpxstressB"),
finds them with xinput, reattaches B to "Second pointer", then moves and clicks both at the same time
for STRESS_SECONDS (default 30), while `xinput test-xi2 --root` records every event.

PASS numbers (written before the run):
  1. both slaves appear in `xinput list` within 5 s of creation;
  2. every event from slave A sits under master "Virtual core pointer" and every one from B under
     "Second pointer": 0 crossed events;
  3. each master gets >= 5000 motion events and >= 50 button presses (about 400 steps/s each);
  4. the X server is still alive at the end (xinput list answers).
Prints one JSON summary line starting `RESULT `; exit 0 = all pass.
"""
import json, math, os, re, subprocess, sys, threading, time

import evdev
from evdev import UInput, ecodes as e

SECONDS = float(os.environ.get("STRESS_SECONDS", "30"))
LOGP = os.environ.get("STRESS_EVENTS", "/tmp/mpx-stress.events")


def mouse(name):
    cap = {e.EV_KEY: [e.BTN_LEFT, e.BTN_RIGHT], e.EV_REL: [e.REL_X, e.REL_Y, e.REL_WHEEL]}
    return UInput(cap, name=name, vendor=0x1234, product=0x5678)


def xin(*a):
    return subprocess.run(["xinput", *a], capture_output=True, text=True).stdout


def slave_id(name, tries=25):
    for _ in range(tries):
        for line in xin("list", "--short").splitlines():
            if name in line and "slave" in line:
                m = re.search(r"id=(\d+)", line)
                if m:
                    return int(m.group(1))
        time.sleep(0.2)
    return None


def master_ids():
    ids = {}
    for line in xin("list", "--short").splitlines():
        m = re.search(r"(Virtual core pointer|Second pointer)\s+id=(\d+)\s+\[master", line)
        if m:
            ids[m.group(1)] = int(m.group(2))
    return ids


def drive(ui, pattern, stop, counters, key):
    """pattern(i) -> (dx, dy); every 100 steps press, drag 50 steps, release."""
    i = 0
    while not stop.is_set():
        dx, dy = pattern(i)
        ui.write(e.EV_REL, e.REL_X, dx); ui.write(e.EV_REL, e.REL_Y, dy); ui.syn()
        counters[key] += 1
        if i % 100 == 0:
            ui.write(e.EV_KEY, e.BTN_LEFT, 1); ui.syn()
        if i % 100 == 50:
            ui.write(e.EV_KEY, e.BTN_LEFT, 0); ui.syn()
        if i % 100 == 75:
            ui.write(e.EV_REL, e.REL_WHEEL, 1); ui.syn()
        i += 1
        time.sleep(0.002)


def main():
    ua, ub = mouse("mpxstressA"), mouse("mpxstressB")
    a, b = slave_id("mpxstressA"), slave_id("mpxstressB")
    res = {"slave_A": a, "slave_B": b}
    if not a or not b:
        print("RESULT", json.dumps({**res, "pass": False, "why": "slave not seen"})); return 1
    xin("reattach", str(b), "Second pointer")
    m = master_ids(); res["masters"] = m
    core, second = m.get("Virtual core pointer"), m.get("Second pointer")
    # start both near their own half of the screen
    ev = open(LOGP, "w")
    rec = subprocess.Popen(["xinput", "test-xi2", "--root"], stdout=ev, stderr=subprocess.DEVNULL)
    time.sleep(1)
    stop = threading.Event(); cnt = {"A": 0, "B": 0}
    # A: small circle (relative steps), B: ping-pong along x
    ta = threading.Thread(target=drive, args=(ua, lambda i: (round(3 * math.cos(i / 20)), round(3 * math.sin(i / 20))), stop, cnt, "A"))
    tb = threading.Thread(target=drive, args=(ub, lambda i: (4 if (i // 150) % 2 == 0 else -4, 0), stop, cnt, "B"))
    ta.start(); tb.start()
    time.sleep(SECONDS)
    stop.set(); ta.join(); tb.join(); time.sleep(1)
    rec.terminate(); ev.close(); os.chmod(LOGP, 0o644)
    res["steps_sent"] = cnt

    # parse: blocks "EVENT type N (Name)" / "device: M (S)" / "root: x/y"
    per = {}; cross = 0; cur = None
    for line in open(LOGP, errors="replace"):
        t = re.match(r"EVENT type \d+ \((\w+)\)", line)
        if t:
            cur = {"type": t.group(1)}; continue
        d = re.search(r"device:\s*(\d+)\s*\((\d+)\)", line)
        if d and cur is not None:
            cur["master"], cur["slave"] = int(d.group(1)), int(d.group(2))
            cur["is_slave_copy"] = cur["master"] == cur["slave"]; continue
        r = re.search(r"root:\s*([\d.\-]+)/([\d.\-]+)", line)
        if r and cur is not None and "master" in cur and cur.get("is_slave_copy"):
            cur = None; continue   # the slave-level copy of the same event
        if r and cur is not None and "master" in cur:
            mm = per.setdefault(cur["master"], {"motion": 0, "button": 0, "xs": []})
            if cur["type"] == "Motion":
                mm["motion"] += 1; mm["xs"].append(float(r.group(1)))
            elif cur["type"] == "ButtonPress":
                mm["button"] += 1
            if cur["slave"] == a and cur["master"] != core: cross += 1
            if cur["slave"] == b and cur["master"] != second: cross += 1
            cur = None
    res["crossed_events"] = cross
    res["per_master"] = {str(k): {"motion": v["motion"], "button": v["button"],
                                  "x_min": min(v["xs"], default=None), "x_max": max(v["xs"], default=None)} for k, v in per.items()}
    alive = bool(xin("list", "--short").strip())
    ok = (cross == 0 and alive and core in per and second in per
          and all(per[k]["motion"] >= 5000 and per[k]["button"] >= 50 for k in (core, second)))
    res.update({"alive": alive, "pass": ok})
    print("RESULT", json.dumps(res), flush=True)
    ua.close(); ub.close()
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
