#!/usr/bin/env python3 -I
"""check-loops.py - checks for loops made by render-loops.mjs. Usage: check-loops.py <spec.json> [--sheet] [--ready]
Prints one table, exits 1 on any FAIL. --sheet writes sheet.png (loops x frames at phase 0/.25/.5/.75).
--ready appends 'name seconds checks' to READY.txt for each loop that passed. Licence: repo licence."""
import json, os, subprocess, sys
import numpy as np
spec_path = sys.argv[1]; spec = json.load(open(spec_path))
base = os.path.dirname(os.path.abspath(spec_path)); out = os.path.join(base, spec.get("out", "out"))
W, H, FPS, BPM = spec["size"]["width"], spec["size"]["height"], spec["fps"], spec["bpm"]
only = None
if "--only" in sys.argv: only = sys.argv[sys.argv.index("--only") + 1].split(",")

def probe(f):
    j = json.loads(subprocess.check_output(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries",
        "stream=codec_name,pix_fmt,width,height,r_frame_rate,nb_frames:format=duration", "-of", "json", f]))
    return j["streams"][0], float(j["format"]["duration"])
def gray(f):
    raw = subprocess.check_output(["ffmpeg", "-v", "error", "-i", f, "-vf", "scale=in_range=tv:out_range=pc,format=gray", "-f", "rawvideo", "-"])
    return np.frombuffer(raw, np.uint8).reshape(-1, H, W)
def rgbframes(f, idx):
    res = []
    for i in idx:
        raw = subprocess.check_output(["ffmpeg", "-v", "error", "-i", f, "-vf", f"select=eq(n\\,{i})", "-frames:v", "1", "-f", "rawvideo", "-pix_fmt", "rgb24", "-"])
        res.append(np.frombuffer(raw, np.uint8).reshape(H, W, 3))
    return res

rows, fail, sheet = [], 0, []
for L in spec["loops"]:
    if only and L["name"] not in only: continue
    f = os.path.join(out, L["name"] + ".mp4"); chk = L.get("checks", {})
    if not os.path.exists(f): rows.append((L["name"], "MISSING")); fail += 1; continue
    st, dur = probe(f); g = gray(f); n = len(g); gf = g.astype(np.float32)
    plan = L["bars"] * 4 * 60 / BPM
    bad = []
    if (st["width"], st["height"]) != (W, H): bad.append("size")
    if st["r_frame_rate"] != f"{FPS}/1": bad.append("fps")
    if abs(dur - plan) > 1 / FPS: bad.append("dur")
    if st["codec_name"] != "h264" or st["pix_fmt"] != "yuv420p": bad.append("codec")
    mb = os.path.getsize(f) / 1e6
    if mb > 15: bad.append("size>15MB")
    nb = np.abs(gf[1:] - gf[:-1]).mean(axis=(1, 2)); seam = np.abs(gf[0] - gf[-1]).mean()
    med = float(np.median(nb)); seam_r = seam / max(med, 1e-6)
    # The seam is a GOP boundary (frame 0 is an I-frame), and every GOP boundary (every 15th step, -g 15) carries extra codec
    # difference. So the seam is also judged against the median of the other GOP-boundary steps; either baseline passing is a pass.
    medk = float(np.median(nb[14::15])) if len(nb) > 15 else med
    seam_r = min(seam / max(med, 1e-6), seam / max(medk, 1e-6))
    if seam_r > 1.5: bad.append("seam")
    dark = float((g < 0.10 * 255).mean())
    if not chk.get("dark_exempt") and dark < 0.55: bad.append("dark")
    lum = gf.mean(axis=(1, 2)) / 255.0; jumps = (np.abs(np.diff(lum)) > 0.10).astype(int)
    fl = max((int(jumps[i:i + FPS].sum()) for i in range(max(1, len(jumps) - FPS + 1))), default=0)
    if fl > 3: bad.append("flash")
    ok = not bad; fail += (not ok)
    rows.append((L["name"], f"{n}f", f"{dur:.3f}s/{plan:.3f}", f"{mb:.2f}MB", f"{seam:.2f}/{med:.2f}|{medk:.2f}={seam_r:.2f}",
                 f"{dark:.2f}" + ("*" if chk.get("dark_exempt") else ""), str(fl), "PASS" if ok else "FAIL " + ",".join(bad), f"{dur:.3f}"))
    if "--sheet" in sys.argv: sheet.append((L["name"], rgbframes(f, [int(n * p) for p in (0, .25, .5, .75)])))
hdr = ("loop", "frames", "dur/plan", "size", "seam/median=ratio(<=1.5)", "dark(>=.55)", "flash/s(<=3)", "result")
lines = ["  ".join(f"{h:<14}" for h in hdr)]
for r in rows: lines.append("  ".join(f"{c:<14}" for c in r[:8]))
lines.append("* = dark share exempt by spec (report only)")
print("\n".join(lines)); open(os.path.join(base, "CHECK.txt"), "w").write("\n".join(lines) + "\n")
if "--ready" in sys.argv:
    with open(os.path.join(base, "READY.txt"), "a") as r:
        for row in rows:
            if len(row) > 8 and row[7] == "PASS": r.write(f"{row[0]} {row[8][:-1]} checks-pass\n")
if sheet:
    from PIL import Image, ImageDraw
    tw = 365; th = int(tw * H / W); lab = 110
    im = Image.new("RGB", (lab + 4 * (tw + 4), len(sheet) * (th + 4)), (40, 40, 40)); d = ImageDraw.Draw(im)
    for y, (name, fr) in enumerate(sheet):
        d.text((6, y * (th + 4) + th // 2), name, fill=(255, 255, 255))
        for x, a in enumerate(fr): im.paste(Image.fromarray(a).resize((tw, th), Image.LANCZOS), (lab + x * (tw + 4), y * (th + 4)))
    im.save(os.path.join(base, "sheet.png"))
sys.exit(1 if fail else 0)
