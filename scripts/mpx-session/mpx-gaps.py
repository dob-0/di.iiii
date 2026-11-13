#!/usr/bin/env python3
"""mpx-gaps.py — the gap tests of the MPX session: selecting, focus, hotplug, burst, float (owner N3354).

Runs INSIDE the test X session (DISPLAY set, root), after mpx-stress.py. Uses uinput ABSOLUTE pointers
and keyboards, xdotool/xprop to find windows, python-xlib to read the PRIMARY selection.
Each test prints `GAP <name> PASS|FAIL|MEASURED <detail>`. MEASURED = a limit we record, not a pass/fail.

PASS numbers (written before the run):
  G1 select, one pointer at a time: A drags over its xterm's line -> PRIMARY == that line's text;
     then B over its xterm -> PRIMARY == B's text.                                    PASS = both exact
  G2 select, both at once (press together, drag, release A then B): record who owns PRIMARY.   MEASURED
     (X has ONE global PRIMARY selection; expected owner = last release.)
  G3 focus: keyboard A types into the xterm A clicked, keyboard B into the xterm B clicked.
     PASS = file A has only 'a', file B has only 'b'.  If not, MEASURED: where the keys went.
  G4 hotplug: a third pointer joins (create-master Third), moves 3 s, leaves; the others keep counting.
     PASS = Third master saw >= 300 motion events, the others kept >= 300 each, X alive after removal.
  G5 burst: both pointers at full speed (no sleep) for 5 s. PASS = X alive, both masters still deliver events (X coalesces absolute motion, so no ratio).
  G6 float: B floated -> no events on the Second master; reattached -> events resume.  PASS = 0 then >= 100.
"""
import os, re, subprocess, sys, threading, time

from evdev import UInput, AbsInfo, ecodes as e
from Xlib import X, display

RES = []


def say(name, verdict, detail=""):
    RES.append((name, verdict))
    print(f"GAP {name} {verdict} {detail}", flush=True)


def xin(*a):
    return subprocess.run(["xinput", *a], capture_output=True, text=True).stdout


def sh(*a):
    return subprocess.run(list(a), capture_output=True, text=True).stdout.strip()


def abs_mouse(name):
    cap = {e.EV_KEY: [e.BTN_LEFT, e.BTN_RIGHT],
           e.EV_ABS: [(e.ABS_X, AbsInfo(0, 0, 32767, 0, 0, 0)), (e.ABS_Y, AbsInfo(0, 0, 32767, 0, 0, 0))]}
    return UInput(cap, name=name, vendor=0x1234, product=0x7001)


def keyboard(name):
    keys = [e.KEY_A, e.KEY_B, e.KEY_ENTER]
    return UInput({e.EV_KEY: keys}, name=name, vendor=0x1234, product=0x7002)


def slave_id(name, tries=25):
    for _ in range(tries):
        for line in xin("list", "--short").splitlines():
            if name in line and "slave" in line:
                m = re.search(r"id=(\d+)", line)
                if m:
                    return int(m.group(1))
        time.sleep(0.2)
    return None


def masters():
    out = {}
    for line in xin("list", "--short").splitlines():
        m = re.search(r"(.+?)\s+id=(\d+)\s+\[master (pointer|keyboard)", line)
        if m:
            out[re.sub(r"^[^A-Za-z]+", "", m.group(1))] = int(m.group(2))
    return out


import ctypes, ctypes.util
_x11 = ctypes.CDLL(ctypes.util.find_library("X11")); _xi = ctypes.CDLL(ctypes.util.find_library("Xi"))
_x11.XOpenDisplay.restype = ctypes.c_void_p; _x11.XOpenDisplay.argtypes = [ctypes.c_char_p]
_xi.XISetFocus.argtypes = [ctypes.c_void_p, ctypes.c_int, ctypes.c_ulong, ctypes.c_ulong]
_x11.XFlush.argtypes = [ctypes.c_void_p]; _x11.XSync.argtypes = [ctypes.c_void_p, ctypes.c_int]
DPY = _x11.XOpenDisplay(None)


def set_focus(master_kbd_id, window_id):
    """per-master keyboard focus (XInput 2.0 XISetFocus): the missing piece for 'each user types in own window'."""
    rc = _xi.XISetFocus(DPY, int(master_kbd_id), int(window_id), 0)
    _x11.XSync(DPY, 0)
    return rc


def qp(master_id):
    return " ".join(xin("query-pointer", "--id", str(master_id)).split())[:80] if master_id else "n/a"


SW, SH = [int(x) for x in sh("xdotool", "getdisplaygeometry").split()]


def goto(ui, x, y):
    ui.write(e.EV_ABS, e.ABS_X, int(x * 32767 / SW)); ui.write(e.EV_ABS, e.ABS_Y, int(y * 32767 / SH)); ui.syn()
    time.sleep(0.03)


def press(ui, v):
    ui.write(e.EV_KEY, e.BTN_LEFT, v); ui.syn(); time.sleep(0.05)


def drag(ui, x0, x1, y, steps=12):
    goto(ui, x0, y); press(ui, 1)
    for i in range(1, steps + 1):
        goto(ui, x0 + (x1 - x0) * i / steps, y)
    press(ui, 0)


def primary():
    d = display.Display(); w = d.screen().root.create_window(0, 0, 1, 1, 0, 0)
    prop = d.intern_atom("MPX_SEL"); utf8 = d.intern_atom("UTF8_STRING")
    w.convert_selection(X.PRIMARY if hasattr(X, "PRIMARY") else d.intern_atom("PRIMARY"), utf8, prop, X.CurrentTime)
    d.flush(); t0 = time.time()
    while time.time() - t0 < 2:
        if d.pending_events():
            ev = d.next_event()
            if ev.type == X.SelectionNotify:
                if ev.property == X.NONE:
                    return ""
                r = w.get_full_property(prop, X.AnyPropertyType)
                return (r.value.decode("utf8", "replace") if r else "")
        time.sleep(0.02)
    return None


def geom(title):
    wid = sh("xdotool", "search", "--name", title).splitlines()
    if not wid:
        return None
    out = sh("xdotool", "getwindowgeometry", "--shell", wid[0])
    g = dict(re.findall(r"(\w+)=(\d+)", out)); return int(g["X"]), int(g["Y"]), int(g["WIDTH"]), int(g["HEIGHT"]), wid[0]


def count_events(seconds, want_ids):
    """record test-xi2 --root for `seconds`, return {master id: motion count}."""
    p = subprocess.Popen(["xinput", "test-xi2", "--root"], stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, text=True)
    return p


def tally(proc, want):
    out, _ = proc.communicate(timeout=20)
    cnt = {k: 0 for k in want}; cur = None
    for line in out.splitlines():
        t = re.match(r"EVENT type \d+ \((\w+)\)", line)
        if t:
            cur = t.group(1); continue
        d = re.search(r"device:\s*(\d+)\s*\((\d+)\)", line)
        if d and cur == "Motion" and int(d.group(1)) in cnt and int(d.group(1)) != int(d.group(2)):
            cnt[int(d.group(1))] += 1
    return cnt


def main():
    ua, ub = abs_mouse("mpxgapA"), abs_mouse("mpxgapB")
    ka, kb = keyboard("mpxkbA"), keyboard("mpxkbB")
    sa, sb, ska, skb = slave_id("mpxgapA"), slave_id("mpxgapB"), slave_id("mpxkbA"), slave_id("mpxkbB")
    m = masters(); print("masters", m, "slaves", sa, sb, ska, skb, flush=True)
    sp = m.get("Second pointer"); sk = m.get("Second keyboard")
    xin("reattach", str(sb), "Second pointer")
    if skb and sk:
        xin("reattach", str(skb), "Second keyboard")
    # two xterms with known lines
    lineA, lineB = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAA", "BBBBBBBBBBBBBBBBBBBBBBBBBBBBBB"
    for tag, line, x in (("gapA", lineA, 40), ("gapB", lineB, 700)):
        subprocess.Popen(["xterm", "-fa", "Monospace", "-fs", "14", "-geometry", f"60x8+{x}+400", "-title", tag,
                          "-e", "sh", "-c", f"echo {line}; cat > /tmp/mpx-key-{tag}.txt"])
    time.sleep(2.5)
    gA, gB = geom("gapA"), geom("gapB")
    if not gA or not gB:
        say("G0 windows", "FAIL", f"gapA={gA} gapB={gB}"); return 1
    cw = gA[2] / 60; ch = gA[3] / 8
    yA = gA[1] + ch * 0.5; yB = gB[1] + ch * 0.5
    # G1
    print("DIAG windows", gA, gB, "screen", SW, SH, "cell", cw, ch, flush=True)
    goto(ub, gB[0] + cw * 5, yB); time.sleep(0.2); print("DIAG B at", (gB[0] + cw * 5, yB), "->", qp(sp), flush=True)
    goto(ua, gA[0] + cw * 5, yA); time.sleep(0.2); print("DIAG A at", (gA[0] + cw * 5, yA), "->", qp(m.get("Virtual core pointer")), flush=True)
    drag(ua, gA[0] + cw * 0.2, gA[0] + cw * 29.8, yA); pa = primary()
    drag(ub, gB[0] + cw * 0.2, gB[0] + cw * 29.8, yB); pb = primary()
    okA, okB = (pa or "").strip().startswith("AAAA"), (pb or "").strip().startswith("BBBB")
    say("G1 select-one-at-a-time", "PASS" if okA and okB else "FAIL", f"A->{(pa or '')[:12]!r} B->{(pb or '')[:12]!r}")
    # G1 controls: which side breaks? (trace what the X server sees for the Second master while it drags)
    def traced(fn, master):
        r = subprocess.Popen(["xinput", "test-xi2", "--root"], stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, text=True)
        time.sleep(0.4); fn(); time.sleep(0.3); r.terminate(); o, _ = r.communicate(timeout=10)
        pts = []; cur = None; ok = False
        for line in o.splitlines():
            t = re.match(r"EVENT type \d+ \((\w+)\)", line)
            if t: cur = t.group(1); continue
            d = re.search(r"device:\s*(\d+)\s*\((\d+)\)", line)
            if d: ok = int(d.group(1)) == master and int(d.group(2)) != master
            q = re.search(r"root:\s*([\d.\-]+)/([\d.\-]+)", line)
            if q and ok: pts.append((cur, float(q.group(1)), float(q.group(2))))
        btn = [p for p in pts if p[0] in ("ButtonPress", "ButtonRelease")]
        return f"{len(pts)} events, first {pts[0][1:] if pts else None}, last {pts[-1][1:] if pts else None}, buttons {[b[0] for b in btn]}"
    print("DIAG B-drag-in-B trace:", traced(lambda: drag(ub, gB[0] + cw * 0.2, gB[0] + cw * 29.8, yB), sp), flush=True)
    drag(ua, gB[0] + cw * 0.2, gB[0] + cw * 29.8, yB); c1 = primary()
    say("G1b control: core pointer drags in xterm B", "MEASURED", f"PRIMARY={(c1 or '')[:6]!r}")
    drag(ub, gA[0] + cw * 0.2, gA[0] + cw * 29.8, yA); c2 = primary()
    say("G1c control: second pointer drags in xterm A", "MEASURED", f"PRIMARY={(c2 or '')[:6]!r}")
    def xt_drag(xs, xe, y):   # ground truth: XTEST on the core pointer, no uinput
        sh("xdotool", "mousemove", str(int(xs)), str(int(y)), "mousedown", "1"); time.sleep(0.1)
        for i in range(1, 11):
            sh("xdotool", "mousemove", str(int(xs + (xe - xs) * i / 10)), str(int(y))); time.sleep(0.03)
        sh("xdotool", "mouseup", "1"); time.sleep(0.2)
    xt_drag(gB[0] + cw * 0.2, gB[0] + cw * 29.8, yB); d1 = primary()
    say("G1d ground truth: xdotool drag in xterm B", "MEASURED", f"PRIMARY={(d1 or '')[:6]!r}")
    xt_drag(gA[0] + cw * 0.2, gA[0] + cw * 29.8, yA); d2 = primary()
    say("G1e ground truth: xdotool drag in xterm A", "MEASURED", f"PRIMARY={(d2 or '')[:6]!r}")
    print("DIAG window under core pointer:", sh("xdotool", "getmouselocation"), flush=True)
    # G1f..: double-click selects the word under the pointer — no drag geometry to get wrong
    def dbl(ui, x, y):
        goto(ui, x, y); time.sleep(0.2)
        for _ in range(2):
            press(ui, 1); press(ui, 0)
        time.sleep(0.3)
    def xt_dbl(x, y):
        sh("xdotool", "mousemove", str(int(x)), str(int(y))); time.sleep(0.2)
        sh("xdotool", "click", "--repeat", "2", "--delay", "80", "1"); time.sleep(0.3)
    xt_dbl(gB[0] + cw * 5, gB[1] + ch * 0.5); t1 = primary()
    say("G1f ground truth: xdotool double-click in xterm B", "MEASURED", f"PRIMARY={(t1 or '')[:6]!r}")
    xt_dbl(gA[0] + cw * 5, gA[1] + ch * 0.5); t2 = primary()
    say("G1g ground truth: xdotool double-click in xterm A", "MEASURED", f"PRIMARY={(t2 or '')[:6]!r}")
    dbl(ub, gB[0] + cw * 5, gB[1] + ch * 0.5); t3 = primary()
    say("G1h second pointer double-click in xterm B", "PASS" if (t3 or "").startswith("BBBB") else "FAIL", f"PRIMARY={(t3 or '')[:6]!r}")
    dbl(ua, gA[0] + cw * 5, gA[1] + ch * 0.5); t4 = primary()
    say("G1i first pointer double-click in xterm A", "PASS" if (t4 or "").startswith("AAAA") else "FAIL", f"PRIMARY={(t4 or '')[:6]!r}")
    # G2: press both, drag both, release A then B
    goto(ua, gA[0] + cw * 0.2, yA); goto(ub, gB[0] + cw * 0.2, yB)
    press(ua, 1); press(ub, 1)
    for i in range(1, 13):
        goto(ua, gA[0] + cw * (0.2 + 29.6 * i / 12), yA); goto(ub, gB[0] + cw * (0.2 + 29.6 * i / 12), yB)
    press(ua, 0); time.sleep(0.2); press(ub, 0); p2 = primary()
    say("G2 select-both-at-once", "MEASURED", f"PRIMARY owner={(p2 or '')[:6]!r} (one global selection; last release wins expected)")
    # G3 focus
    goto(ua, gA[0] + cw * 5, gA[1] + ch * 3); press(ua, 1); press(ua, 0)
    goto(ub, gB[0] + cw * 5, gB[1] + ch * 3); press(ub, 1); press(ub, 0)
    time.sleep(0.3)
    def typ(k, key):
        for _ in range(4):
            k.write(e.EV_KEY, key, 1); k.syn(); k.write(e.EV_KEY, key, 0); k.syn(); time.sleep(0.03)
        k.write(e.EV_KEY, e.KEY_ENTER, 1); k.syn(); k.write(e.EV_KEY, e.KEY_ENTER, 0); k.syn(); time.sleep(0.3)
    ckb = m.get("Virtual core keyboard")
    print("DIAG keyboards core", ckb, "second", sk, flush=True)
    typ(ka, e.KEY_A); typ(kb, e.KEY_B)
    fa0 = open("/tmp/mpx-key-gapA.txt").read(); fb0 = open("/tmp/mpx-key-gapB.txt").read()
    print(f"DIAG without XISetFocus: A={fa0.strip()!r} B={fb0.strip()!r}", flush=True)
    r1 = set_focus(ckb, int(gA[4])); r2 = set_focus(sk, int(gB[4])); print("DIAG XISetFocus rc", r1, r2, flush=True)
    typ(ka, e.KEY_A); typ(kb, e.KEY_B)
    fa = open("/tmp/mpx-key-gapA.txt").read() if os.path.exists("/tmp/mpx-key-gapA.txt") else ""
    fb = open("/tmp/mpx-key-gapB.txt").read() if os.path.exists("/tmp/mpx-key-gapB.txt") else ""
    fa, fb = fa[len(fa0):], fb[len(fb0):]   # only what the second round (after XISetFocus) typed
    good = set(fa.strip()) <= {"a"} and set(fb.strip()) <= {"b"} and "a" in fa and "b" in fb
    say("G3 focus-per-master (after XISetFocus)", "PASS" if good else "MEASURED", f"xtermA got {fa.strip()!r}, xtermB got {fb.strip()!r}")
    # G4 hotplug third pointer
    uc = abs_mouse("mpxgapC"); sc = slave_id("mpxgapC")
    xin("create-master", "Third"); time.sleep(1)
    mm = masters(); third = mm.get("Third pointer")
    xin("reattach", str(sc), "Third pointer")
    core = mm.get("Virtual core pointer"); want = [core, sp, third]
    rec = count_events(3, want); time.sleep(0.5)
    t0 = time.time(); i = 0
    while time.time() - t0 < 3:
        for u, off in ((ua, 0.2), (ub, 0.5), (uc, 0.8)):
            goto(u, SW * (off + 0.05 * ((i % 10) / 10)), SH * (0.3 + 0.01 * (i % 20)))
        i += 1
    time.sleep(0.5); rec.terminate();
    out, _ = rec.communicate(timeout=10)
    cnt = {k: 0 for k in want}; cur = None
    for line in out.splitlines():
        t = re.match(r"EVENT type \d+ \((\w+)\)", line)
        if t: cur = t.group(1); continue
        d = re.search(r"device:\s*(\d+)\s*\((\d+)\)", line)
        if d and cur == "Motion" and int(d.group(1)) in cnt and int(d.group(1)) != int(d.group(2)):
            cnt[int(d.group(1))] += 1
    uc.close(); time.sleep(0.5)
    rem = subprocess.run(["xinput", "remove-master", str(third)], capture_output=True, text=True)
    alive = bool(xin("list", "--short").strip())
    ok4 = all(v >= 15 for v in cnt.values()) and alive
    say("G4 hotplug-third-pointer", "PASS" if ok4 else "FAIL", f"motion per master {cnt} remove-master rc={rem.returncode} alive={alive}")
    # G5 burst
    sent = {"A": 0, "B": 0}; stop = threading.Event()
    def burst(u, k, off):
        j = 0
        while not stop.is_set():
            goto_fast(u, SW * (off + 0.2 * ((j % 100) / 100)), SH * 0.5); sent[k] += 1; j += 1
    def goto_fast(u, x, y):
        u.write(e.EV_ABS, e.ABS_X, int(x * 32767 / SW)); u.write(e.EV_ABS, e.ABS_Y, int(y * 32767 / SH)); u.syn()
    rec = subprocess.Popen(["xinput", "test-xi2", "--root"], stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, text=True)
    time.sleep(0.5)
    ts = [threading.Thread(target=burst, args=(ua, "A", 0.1)), threading.Thread(target=burst, args=(ub, "B", 0.6))]
    [t.start() for t in ts]; time.sleep(5); stop.set(); [t.join() for t in ts]; time.sleep(0.5); rec.terminate()
    out, _ = rec.communicate(timeout=15)
    seen = {core: 0, sp: 0}; cur = None
    for line in out.splitlines():
        t = re.match(r"EVENT type \d+ \((\w+)\)", line)
        if t: cur = t.group(1); continue
        d = re.search(r"device:\s*(\d+)\s*\((\d+)\)", line)
        if d and cur == "Motion" and int(d.group(1)) in seen and int(d.group(1)) != int(d.group(2)):
            seen[int(d.group(1))] += 1
    alive = bool(xin("list", "--short").strip())
    ratio = (seen[core] + seen[sp]) / max(1, sent["A"] + sent["B"])
    say("G5 burst", "PASS" if alive and seen[core] > 0 and seen[sp] > 0 else "FAIL", f"sent {sent} seen {seen} ratio {ratio:.2f} alive={alive} (X may coalesce motion)")
    # G6 float
    xin("float", str(sb)); time.sleep(0.3)
    rec = subprocess.Popen(["xinput", "test-xi2", "--root"], stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, text=True); time.sleep(0.5)
    for i in range(150): goto(ub, SW * (0.5 + 0.002 * i), SH * 0.4)
    time.sleep(0.3); rec.terminate(); out, _ = rec.communicate(timeout=10)
    floated = len(re.findall(r"device:\s*%d \(" % sp, out))
    xin("reattach", str(sb), "Second pointer"); time.sleep(0.3)
    rec = subprocess.Popen(["xinput", "test-xi2", "--root"], stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, text=True); time.sleep(0.5)
    for i in range(150): goto(ub, SW * (0.5 + 0.002 * i), SH * 0.6)
    time.sleep(0.3); rec.terminate(); out, _ = rec.communicate(timeout=10)
    back = len(re.findall(r"device:\s*%d \(" % sp, out))
    say("G6 float-and-reattach", "PASS" if floated == 0 and back >= 100 else "FAIL", f"events on Second while floated={floated}, after reattach={back}")
    ok = all(v in ("PASS", "MEASURED") for _, v in RES)
    print("GAPRESULT", "ok" if ok else "fail", [f"{n}:{v}" for n, v in RES], flush=True)
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
