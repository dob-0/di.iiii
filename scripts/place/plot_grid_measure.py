#!/usr/bin/env python3
"""Measure a rectangle on a light plot (an LED wall, a riser, a truss) against the plot's OWN regular grid.

    python3 -I scripts/place/plot_grid_measure.py plot.pdf --near 1830,1313,3041,2071 \\
        --grid-m 1 --cabinet-m 0.5 --cabinet-px 128 --cue truss=1000,420,3900,480 --picture out.png

The drawing is a raster (PNG/JPG) or a PDF (rasterised with pdftoppm). --near is the rough outline in raster
pixels, found by eye in an image viewer; the tool finds the real dark edges within --tolerance of it. The grid
is the light-grey lines that cross the page; the pitch is the median gap between them. It prints the outline
in grid squares and metres, how far each edge sits from a grid line, and, for an LED wall, whole cabinets and
pixels. --cue measures the extent of a coloured mark (for example a truss section of a known length) in grid
squares, as a check of the scale. One grid square = --grid-m metres is the user's claim, not a measurement:
a size read from a drawing is a reading, not a confirmed size.
Method: clusters of 1-px lines, the pitch as the median gap, edges as rows and columns that are mostly dark
(single-view measurement against a regular grid; no calibration beyond the grid itself).
Needs python3 with numpy and Pillow; poppler's pdftoppm only for PDF input.
Written 2026-11-19 from the one-off measuring script of 2026-11-10 (ledger N3470, N3481).
Exit 0 with a full result; exit 1 and one `FAIL: <what> — <the cheapest fix>` line on stderr otherwise.
"""
import argparse
import json
import os
import shutil
import subprocess
import sys
import tempfile

try:
    import numpy as np
    from PIL import Image, ImageDraw, ImageFont
except ImportError as exc:  # a missing library is the user's machine, not a traceback
    sys.stderr.write(f"FAIL: {exc.name} is not installed — pip install numpy pillow\n")
    sys.exit(1)

EXAMPLE = """example (made-up numbers):
  python3 -I scripts/place/plot_grid_measure.py plan.png --near 150,150,550,400 \\
      --grid-m 1 --cabinet-m 0.5 --cabinet-px 128 --cue bar=100,590,420,610,magenta --picture out.png
  A PDF works the same: plan.pdf --dpi 300 --page 1 --near ... (needs pdftoppm from poppler)."""


class Fail(Exception):
    pass


class Parser(argparse.ArgumentParser):
    def error(self, message):
        sys.stderr.write(f"FAIL: {message} — see --help for one worked example\n")
        sys.exit(1)


def ints(text, n):
    try:
        v = [int(float(p)) for p in text.split(",")]
    except ValueError:
        raise argparse.ArgumentTypeError(f"'{text}' is not {n} numbers separated by commas")
    if len(v) != n:
        raise argparse.ArgumentTypeError(f"'{text}' needs {n} numbers separated by commas")
    return v


def box(text):
    v = ints(text, 4)
    if v[2] <= v[0] or v[3] <= v[1]:
        raise argparse.ArgumentTypeError("a box is L,T,R,B with R > L and B > T")
    return v


def cue(text):
    if "=" not in text:
        raise argparse.ArgumentTypeError("a cue is NAME=L,T,R,B[,COLOUR]")
    name, rest = text.split("=", 1)
    parts = rest.split(",")
    colour = parts[4] if len(parts) > 4 else "dark"
    if len(parts) not in (4, 5) or not name:
        raise argparse.ArgumentTypeError("a cue is NAME=L,T,R,B[,COLOUR]")
    return name, box(",".join(parts[:4])), colour


def build_parser():
    p = Parser(description=__doc__.split("\n\n")[0], epilog=EXAMPLE, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("drawing", help="a raster (PNG/JPG) or a PDF")
    p.add_argument("--near", type=box, required=True, metavar="L,T,R,B", help="rough outline in raster pixels")
    p.add_argument("--tolerance", type=float, default=40, metavar="PX", help="how far an edge may sit from --near (40)")
    p.add_argument("--grid-m", type=float, default=1.0, metavar="M", help="metres per grid square (1.0); your claim")
    p.add_argument("--grid-grey", type=lambda t: ints(t, 2), default=[215, 250], metavar="LO,HI", help="grey range of a grid line (215,250)")
    p.add_argument("--grid-cover", type=float, default=0.35, metavar="F", help="share of the page a grid line crosses (0.35)")
    p.add_argument("--dark", type=int, default=70, metavar="N", help="r, g and b below N is dark (70)")
    p.add_argument("--line-cover", type=float, default=0.8, metavar="F", help="share of the box side an outline edge covers (0.8)")
    p.add_argument("--cabinet-m", type=float, metavar="M", help="LED cabinet size in metres (square cabinet)")
    p.add_argument("--cabinet-px", type=int, metavar="N", help="LED cabinet size in pixels")
    p.add_argument("--cue", type=cue, action="append", default=[], metavar="NAME=L,T,R,B[,COLOUR]", help="extent of a colour in a window; COLOUR dark|magenta|orange|#rrggbb")
    p.add_argument("--cue-min", type=int, default=3, metavar="N", help="pixels a row or column needs to count (3)")
    p.add_argument("--dpi", type=int, default=300, help="PDF input: raster resolution (300)")
    p.add_argument("--page", type=int, default=1, help="PDF input: page (1)")
    p.add_argument("--picture", metavar="OUT.png", help="a crop with the measured outline drawn over it")
    p.add_argument("--json", action="store_true", help="one JSON object on stdout instead of text")
    return p


def clusters(idx, gap=2):
    out, start, prev = [], None, None
    for i in idx:
        i = int(i)
        if start is None:
            start = prev = i
        elif i - prev <= gap:
            prev = i
        else:
            out.append((start + prev) / 2)
            start = prev = i
    if start is not None:
        out.append((start + prev) / 2)
    return out


def near(values, want, what, tol):
    if not values:
        raise Fail(f"no dark line found for the {what} edge — widen --tolerance or check --near and --dark")
    best = min(values, key=lambda a: abs(a - want))
    if abs(best - want) > tol:
        raise Fail(f"{what} edge not within {tol:g} px of {want:g} (closest {best:g}) — fix --near or raise --tolerance")
    return best


def load(args, tmp):
    src = args.drawing
    if not os.path.isfile(src):
        raise Fail(f"file '{src}' not found — give the path of a PNG, JPG or PDF")
    with open(src, "rb") as f:
        is_pdf = f.read(5) == b"%PDF-"
    if is_pdf:
        if not shutil.which("pdftoppm"):
            raise Fail("pdftoppm is missing — install poppler, or give a PNG")
        base = os.path.join(tmp, "page")
        run = subprocess.run(["pdftoppm", "-r", str(args.dpi), "-png", "-singlefile", "-f", str(args.page), "-l", str(args.page), src, base],
                             capture_output=True, text=True)
        if run.returncode != 0 or not os.path.isfile(base + ".png"):
            raise Fail(f"pdftoppm could not read page {args.page} ({run.stderr.strip()[:80]}) — check --page and the file")
        src = base + ".png"
    try:
        return Image.open(src).convert("RGB")
    except Exception as exc:
        raise Fail(f"cannot read the drawing ({type(exc).__name__}) — give a PNG, JPG or PDF")


def colour_mask(im, name):
    r, g, b = im[..., 0], im[..., 1], im[..., 2]
    if name == "dark":
        return None  # filled in by the caller with --dark
    if name == "magenta":
        return (r > 200) & (g < 80) & (b > 200)
    if name == "orange":
        return (r > 220) & (g > 100) & (g < 170) & (b < 60)
    if len(name) == 7 and name[0] == "#":
        try:
            want = [int(name[i:i + 2], 16) for i in (1, 3, 5)]
        except ValueError:
            raise Fail(f"colour '{name}' is not #rrggbb — use dark, magenta, orange or #rrggbb")
        return (abs(r - want[0]) <= 40) & (abs(g - want[1]) <= 40) & (abs(b - want[2]) <= 40)
    raise Fail(f"colour '{name}' unknown — use dark, magenta, orange or #rrggbb")


def font_factory():
    try:
        fpath = subprocess.run(["fc-match", "-f", "%{file}", "sans:bold"], capture_output=True, text=True, timeout=5).stdout.strip()
        ImageFont.truetype(fpath, 10)
        return lambda s: ImageFont.truetype(fpath, int(s))
    except Exception:
        return lambda s: ImageFont.load_default()


def draw_picture(img, res, args):
    """A crop around the box plus a caption band on top; returns (path, (w, h))."""
    W, H = img.size
    L, T, R, B = res["edges"]
    w, h = R - L, B - T
    m = int(max(w, h) * 0.2) + 20
    x0, y0, x1, y1 = max(0, int(L) - m), max(0, int(T) - m), min(W, int(R) + m), min(H, int(B) + m)
    crop = img.crop((x0, y0, x1, y1))
    font = font_factory()
    px, py = res["pitch"]
    led = res["led"]
    lines = [
        "grid measure: %.2f x %.2f m (%.2f x %.2f grid squares of %g m)" % (res["metres"][0], res["metres"][1], res["squares"][0], res["squares"][1], args.grid_m),
        ("%d x %d cabinets of %g m, %d px each = %d x %d px" % (led["cabinets"][0], led["cabinets"][1], args.cabinet_m, args.cabinet_px, led["px"][0], led["px"][1])) if led else "no cabinet size given: the grid squares are drawn",
        "read from the drawing, not a confirmed size; one grid square = %g m is given, not measured" % args.grid_m,
    ]
    cw = crop.size[0]
    u = max(14, int(max(w, h) / 28))
    d0 = ImageDraw.Draw(Image.new("RGB", (1, 1)))
    while u > 9 and max(d0.textlength(t, font=font(u * (1 - 0.15 * (k == 2)))) for k, t in enumerate(lines)) > cw - 2 * u:
        u -= 1
    band = int(u * 4.6)
    canvas = Image.new("RGB", (cw, crop.size[1] + band), (255, 255, 255))
    canvas.paste(crop, (0, band))
    d = ImageDraw.Draw(canvas)
    blue, ink = (0, 90, 255), (0, 0, 0)
    for k, t in enumerate(lines):
        d.text((u, int(u * 0.4) + k * int(u * 1.4)), t, fill=(ink, blue, (90, 90, 90))[k], font=font(u * (1 - 0.15 * (k == 2))))
    lw = max(2, int(u / 8))
    ox, oy = L - x0, T - y0 + band
    if led:
        xs = [ox + i * w / led["cabinets"][0] for i in range(led["cabinets"][0] + 1)]
        ys = [oy + j * h / led["cabinets"][1] for j in range(led["cabinets"][1] + 1)]
    else:
        xs = [ox + i * px for i in range(int(w / px + 1e-6) + 1)] + [ox + w]
        ys = [oy + j * py for j in range(int(h / py + 1e-6) + 1)] + [oy + h]
    for i, x in enumerate(xs):
        d.line([(x, oy), (x, oy + h)], fill=blue, width=lw * 3 if i in (0, len(xs) - 1) else lw)
    for j, y in enumerate(ys):
        d.line([(ox, y), (ox + w, y)], fill=blue, width=lw * 3 if j in (0, len(ys) - 1) else lw)
    f = font(u)
    for text, xy, anchor in ((f"{res['metres'][0]:.2f} m", (ox + w / 2, oy + u * 1.3), "mm"), (f"{res['metres'][1]:.2f} m", (ox + u * 0.8, oy + h / 2), "lm")):
        bb = d.textbbox(xy, text, font=f, anchor=anchor)
        d.rectangle((bb[0] - 6, bb[1] - 4, bb[2] + 6, bb[3] + 4), fill=(255, 255, 255))
        d.text(xy, text, fill=blue, font=f, anchor=anchor)
    canvas.save(args.picture, optimize=True)
    return args.picture, canvas.size


def measure(args, img):
    im = np.asarray(img).astype(np.int16)
    H, W, _ = im.shape
    r, g, b = im[..., 0], im[..., 1], im[..., 2]
    lo, hi = args.grid_grey
    light = (abs(r - g) < 6) & (abs(g - b) < 6) & (r >= lo) & (r <= hi)
    dark = (r < args.dark) & (g < args.dark) & (b < args.dark)

    gx = clusters(np.where(light.sum(axis=0) > args.grid_cover * H)[0])
    gy = clusters(np.where(light.sum(axis=1) > args.grid_cover * W)[0])
    if len(gx) < 3 or len(gy) < 3:
        raise Fail(f"found {len(gx)} vertical and {len(gy)} horizontal grid lines, need 3 of each — "
                   f"check --grid-grey {lo},{hi} and --grid-cover {args.grid_cover:g}, or raise --dpi")
    px, py = float(np.median(np.diff(gx))), float(np.median(np.diff(gy)))

    nL, nT, nR, nB = args.near
    tol = args.tolerance
    x0, x1, y0, y1 = int(nL + tol), int(nR - tol), int(nT + tol), int(nB - tol)
    if x1 - x0 < 10 or y1 - y0 < 10:
        raise Fail("--tolerance is too large for the --near box — lower --tolerance or give a bigger box")
    rows = clusters(np.where(dark[:, x0:x1].sum(axis=1) >= args.line_cover * (x1 - x0))[0])
    cols = clusters(np.where(dark[y0:y1, :].sum(axis=0) >= args.line_cover * (y1 - y0))[0])
    top, bottom = near(rows, nT, "top", tol), near(rows, nB, "bottom", tol)
    left, right = near(cols, nL, "left", tol), near(cols, nR, "right", tol)
    w, h = right - left, bottom - top
    sw, sh = w / px, h / py
    res = {
        "edges": (left, top, right, bottom), "pitch": (px, py), "squares": (sw, sh),
        "metres": (sw * args.grid_m, sh * args.grid_m), "px": (w, h),
        "off": {"left": min(abs(left - a) for a in gx), "right": min(abs(right - a) for a in gx),
                "top": min(abs(top - a) for a in gy), "bottom": min(abs(bottom - a) for a in gy)},
        "grid": (len(gx), len(gy)), "cues": [], "led": None,
    }
    for name, (cl, ct, cr, cb), colour in args.cue:
        cl, ct, cr, cb = max(cl, 0), max(ct, 0), min(cr, W), min(cb, H)
        mask = dark if colour == "dark" else colour_mask(im, colour)
        win = mask[ct:cb, cl:cr]
        cc = np.where(win.sum(axis=0) >= args.cue_min)[0]
        rr = np.where(win.sum(axis=1) >= args.cue_min)[0]
        if len(cc) == 0 or len(rr) == 0:
            raise Fail(f"cue '{name}': no {colour} pixels in its window — fix the window or the colour")
        cwid, chei = int(cc.max() - cc.min() + 1), int(rr.max() - rr.min() + 1)
        res["cues"].append({"name": name, "px": [cwid, chei], "squares": [cwid / px, chei / py]})
    if args.cabinet_m:
        cw, ch = res["metres"][0] / args.cabinet_m, res["metres"][1] / args.cabinet_m
        nw, nh = round(cw), round(ch)
        if nw < 1 or nh < 1 or abs(cw - nw) > 0.1 or abs(ch - nh) > 0.1:
            raise Fail(f"{cw:.2f} x {ch:.2f} is not a whole number of {args.cabinet_m:g} m cabinets — check --cabinet-m, --grid-m and --near")
        res["led"] = {"cabinets_raw": [cw, ch], "cabinets": [nw, nh], "count": nw * nh,
                      "px": [nw * args.cabinet_px, nh * args.cabinet_px], "metres": [nw * args.cabinet_m, nh * args.cabinet_m]}
    return res


def main():
    args = build_parser().parse_args()
    if bool(args.cabinet_m) != bool(args.cabinet_px):
        Parser.error(None, "--cabinet-m and --cabinet-px go together")
    if args.cabinet_m is not None and args.cabinet_m <= 0 or args.grid_m <= 0 or args.dpi <= 0 or args.page < 1:
        Parser.error(None, "--grid-m, --cabinet-m, --dpi and --page must be positive")
    try:
        with tempfile.TemporaryDirectory() as tmp:
            img = load(args, tmp)
            res = measure(args, img)
            pic = draw_picture(img, res, args) if args.picture else None
    except Fail as exc:
        sys.stderr.write(f"FAIL: {exc}\n")
        sys.exit(1)
    except OSError as exc:
        sys.stderr.write(f"FAIL: {exc.strerror or exc} — check the paths\n")
        sys.exit(1)
    px, py = res["pitch"]
    left, top, right, bottom = res["edges"]
    led = res["led"]
    if args.json:
        out = {
            "grid": {"vertical": res["grid"][0], "horizontal": res["grid"][1], "pitch_px": [px, py], "metres_per_square": args.grid_m},
            "outline": {"left": left, "top": top, "right": right, "bottom": bottom, "px": list(res["px"]),
                        "squares": list(res["squares"]), "metres": list(res["metres"]), "ratio": res["px"][0] / res["px"][1],
                        "off_grid_px": res["off"]},
            "cues": res["cues"], "led": led,
            "picture": {"path": pic[0], "px": list(pic[1])} if pic else None,
        }
        print(json.dumps(out))
        return
    print(f"grid: {res['grid'][0]} vertical + {res['grid'][1]} horizontal lines, pitch {px:.1f} x {py:.1f} px")
    print(f"outline: {res['px'][0]:.1f} x {res['px'][1]:.1f} px, ratio {res['px'][0] / res['px'][1]:.3f} = {res['squares'][0]:.3f} x {res['squares'][1]:.3f} grid squares = {res['metres'][0]:.2f} x {res['metres'][1]:.2f} m")
    o = res["off"]
    print(f"edges on grid lines: left {o['left']:.1f} px off, right {o['right']:.1f} px off, top {o['top']:.1f} px off, bottom {o['bottom']:.1f} px off")
    for c in res["cues"]:
        print(f"cue {c['name']}: {c['px'][0]} x {c['px'][1]} px = {c['squares'][0]:.2f} x {c['squares'][1]:.2f} squares")
    if led:
        nw, nh = led["cabinets"]
        shape = "16:10" if abs(nw / nh - 1.6) < 1e-9 else f"{nw / nh:.2f}:1"
        print(f"LED: {led['cabinets_raw'][0]:.2f} x {led['cabinets_raw'][1]:.2f} cabinets -> {nw} x {nh} = {led['count']} cabinets = {led['px'][0]} x {led['px'][1]} px, {led['metres'][0]:.1f} x {led['metres'][1]:.1f} m, {shape}")
    if pic:
        print(f"picture: {pic[0]} {pic[1][0]}x{pic[1][1]}")
    print(f"scale: one grid square = {args.grid_m:g} m (given, not measured)")


if __name__ == "__main__":
    main()
