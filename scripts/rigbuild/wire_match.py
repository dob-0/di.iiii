#!/usr/bin/env python3
"""wire_match.py — match photos and videos of a lamp to the value on the wire at that moment. READ-ONLY (files in, files out).

Moved from the agent's shape-chart.py, video_align.py and video_at_graphic.py (owner row N1001, 2026-10-17). What changed: no date,
channel index or graphic width is built in; every one is an argument. The wire log is the output of wire-log.mjs: lines of
"<ISO time> v1,v2,…" (one per change).

  wire_match.py chart  --log LOG --photos DIR --manifest MANIFEST.jsonl --out DIR --value-index N [--per-graphic 2] [--first-id 0] [--lead-s 1.5]
      a photo's `sent` time (manifest line: {"kind":"photo","message_id":…,"sent":ISO,"name":file}) minus --lead-s, looked up in
      the log; photos older than the log are matched by ORDER (marked). Writes chart.jpg and chart.md.
  wire_match.py align  --log LOG --video FILE --value-index N --search-from ISO [--search-s 90] [--per-graphic 2] [--out start.npy]
      finds the video's start on the wire clock: moments the lamp's drawn shape changes in the video vs moments the logged value
      crosses a graphic boundary. Prints the best start and how many moments matched.
  wire_match.py frames --log LOG --video FILE --start start.npy --value-index N --out sheet.jpg G1 G2 …
      the video frame in the middle of each graphic's time on the wire.

Needs python3 with numpy and Pillow, and ffmpeg for align / frames. The pure functions (parse_log, value_at, graphic_of, ...)
need none of them: `python3 -m unittest scripts/rigbuild/wire_match_test.py`.
"""
import argparse, bisect, datetime as dt, io, json, os, subprocess, sys


def iso(s):
    return dt.datetime.fromisoformat(s.replace('Z', '+00:00')).timestamp()


def parse_log(lines):
    """Lines "<ISO> v1,v2,…" → [(epoch_s, [ints])] in file order. Other lines (e.g. 'read failed') are skipped."""
    out = []
    for l in lines:
        p = l.split()
        if len(p) == 2 and ',' in p[1]:
            try:
                out.append((iso(p[0]), [int(x) for x in p[1].split(',')]))
            except ValueError:
                pass
    return out


def graphic_of(value, per_graphic=2):
    """Graphic number (1-based) of a wire value: one graphic per `per_graphic` values."""
    return value // per_graphic + 1


def value_at(log, t, value_index):
    """The logged value at time t: the last change at or before t. None when t is before the log's first line."""
    times = [x[0] for x in log]
    k = bisect.bisect_right(times, t) - 1
    return None if k < 0 else log[k][1][value_index]


def graphic_changes(log, value_index, per_graphic=2):
    """Times at which the logged value moves into another graphic."""
    return [t for (t, v), (_, v0) in zip([(a, b[value_index]) for a, b in log[1:]], [(a, b[value_index]) for a, b in log[:-1]])
            if graphic_of(v, per_graphic) != graphic_of(v0, per_graphic)]


def match_photos(photos, log, value_index, per_graphic=2, lead_s=1.5):
    """photos: [{'sent': ISO, ...}] sorted by sent → [(graphic, value|None, 'by time'|'by order', photo)]. A photo sent before
    the log began is numbered by ORDER from graphic 1 (the lamp's chart ran from graphic 1)."""
    log0 = log[0][0] if log else float('inf')
    cells, n_order = [], 0
    for r in photos:
        t = iso(r['sent']) - lead_s
        if t < log0:
            n_order += 1
            cells.append((n_order, None, 'by order', r))
        else:
            v = value_at(log, t, value_index)
            cells.append((graphic_of(v, per_graphic), v, 'by time', r))
    return cells


def best_offset(video_changes, log_changes, start_epoch, search_s, step=0.02, tol=0.2):
    """The video start (epoch s) in [start_epoch, start_epoch+search_s] where most video shape changes land within `tol` s of a logged
    graphic change. Returns (hits, start)."""
    if not log_changes:
        return (0, None)
    scored, o = [], 0.0
    while o < search_s:
        s = start_epoch + o
        scored.append((sum(1 for v in video_changes if min(abs(t - (s + v)) for t in log_changes) < tol), s))
        o += step
    top = max(h for h, _ in scored) if scored else 0
    if top == 0:
        return (0, None)
    plateau = sorted(s for h, s in scored if h == top)   # every offset that scores best: the middle of them, not the first edge
    return (top, plateau[len(plateau) // 2])


def cmd_chart(a):
    from PIL import Image, ImageDraw, ImageFont
    log = parse_log(open(a.log))
    rows = [json.loads(l) for l in open(a.manifest) if l.strip()]
    photos = sorted([r for r in rows if r.get('kind') == 'photo' and r.get('message_id', 0) >= a.first_id], key=lambda r: r['message_id'])
    cells = [c + (os.path.join(a.photos, c[3]['name']),) for c in match_photos(photos, log, a.value_index, a.per_graphic, a.lead_s)]
    cells = [c for c in cells if os.path.exists(c[4])]
    os.makedirs(a.out, exist_ok=True)
    W, H, cols = 240, 300, 8
    sheet = Image.new('RGB', (cols * W, max(1, (len(cells) + cols - 1) // cols) * (H + 34)), (18, 18, 18))
    d = ImageDraw.Draw(sheet)
    try:
        font = ImageFont.truetype('/usr/share/fonts/TTF/DejaVuSansMono.ttf', 18)
    except Exception:
        font = ImageFont.load_default()
    for i, (g, v, how, r, path) in enumerate(cells):
        im = Image.open(path).convert('RGB')
        im.thumbnail((W - 6, H - 6))
        x, y = (i % cols) * W, (i // cols) * (H + 34)
        sheet.paste(im, (x + 3, y + 3))
        d.text((x + 6, y + H + 4), f"g{g}" + (f" v{v}" if v is not None else " (order)"), fill=(255, 220, 0), font=font)
    sheet.save(os.path.join(a.out, 'chart.jpg'), quality=82)
    with open(os.path.join(a.out, 'chart.md'), 'w') as f:
        f.write('| graphic | value on the wire | matched | photo |\n|---|---|---|---|\n')
        for g, v, how, r, _ in cells:
            lo = a.per_graphic * (g - 1)
            f.write(f'| {g} | {v if v is not None else f"{lo}–{lo + a.per_graphic - 1} (assumed)"} | {how} | {r["name"]} |\n')
    print(len(cells), 'photos;', sum(1 for c in cells if c[2] == 'by order'), 'by order;', sum(1 for c in cells if c[2] == 'by time'), 'by time')


def _video_changes(video, fps=30, w=180, h=320):
    import numpy as np
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', video, '-vf', f'fps={fps},scale={w}:{h}', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], capture_output=True, check=True).stdout
    fr = np.frombuffer(raw, np.uint8).reshape(-1, h, w, 3).astype(np.int16)
    core = (fr[..., 0] > 230) & (fr[..., 1] > 140) & (fr[..., 2] > 140)   # the bright white-pink cores of laser lines

    def desc(m):
        ys, xs = np.nonzero(m)
        if len(xs) < 4:
            return np.zeros(256)
        c = m[ys.min():ys.max() + 1, xs.min():xs.max() + 1].astype(np.float32)
        iy = np.linspace(0, c.shape[0] - 1, 16).astype(int)
        ix = np.linspace(0, c.shape[1] - 1, 16).astype(int)
        d = c[np.ix_(iy, ix)].ravel()
        return d / (np.linalg.norm(d) + 1e-6)

    D = np.array([desc(m) for m in core])
    n = len(D)
    change = np.array([0] + [1 - float(D[i] @ D[i - 1]) for i in range(1, n)])
    return n, [i / fps for i in range(1, n) if change[i] > 0.35 and change[i] >= change[max(0, i - 2):i + 3].max()]


def cmd_align(a):
    import numpy as np
    log = parse_log(open(a.log))
    n, vt = _video_changes(a.video)
    lt = graphic_changes(log, a.value_index, a.per_graphic)
    hits, start = best_offset(vt, lt, iso(a.search_from), a.search_s)
    if start is None:
        print('no match: the log has no graphic change'); return 1
    print(f'frames {n}, video changes {len(vt)}, log graphic changes {len(lt)}; best start {dt.datetime.fromtimestamp(start, dt.timezone.utc).isoformat()} with {hits} matches')
    if a.out:
        np.save(a.out, np.array([start]))


def cmd_frames(a):
    import numpy as np
    from PIL import Image, ImageDraw
    log = parse_log(open(a.log))
    start = float(np.load(a.start)[0])
    dur = float(subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', a.video], capture_output=True, text=True, check=True).stdout)
    cells = []
    for g in a.graphics:
        spans = [(t0, t1) for (t0, b), (t1, _) in zip(log, log[1:]) if graphic_of(b[a.value_index], a.per_graphic) == g and start <= t0 <= start + dur]
        if not spans:
            cells.append((g, None)); continue
        t0, t1 = max(spans, key=lambda s: s[1] - s[0])
        t = (t0 + t1) / 2 - start
        png = subprocess.run(['ffmpeg', '-v', 'error', '-ss', f'{t:.3f}', '-i', a.video, '-frames:v', '1', '-vf', 'scale=-2:320', '-f', 'image2pipe', '-vcodec', 'png', '-'], capture_output=True, check=True).stdout
        cells.append((g, (Image.open(io.BytesIO(png)).convert('RGB'), t, t1 - t0)))
    w = 180
    sheet = Image.new('RGB', (len(cells) * (w + 6), 350), (15, 15, 15))
    d = ImageDraw.Draw(sheet)
    for i, (g, c) in enumerate(cells):
        if c:
            sheet.paste(c[0], (i * (w + 6), 0)); d.text((i * (w + 6) + 4, 324), f'g{g} t{c[1]:.1f}s {c[2]:.1f}s', fill=(255, 220, 0))
        else:
            d.text((i * (w + 6) + 4, 324), f'g{g} not in video', fill=(255, 80, 80))
    sheet.save(a.out, quality=80)
    print('ok', [(g, round(c[1], 1) if c else None) for g, c in cells])


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    sub = ap.add_subparsers(dest='cmd', required=True)
    for name in ('chart', 'align', 'frames'):
        p = sub.add_parser(name)
        p.add_argument('--log', required=True); p.add_argument('--value-index', type=int, required=True); p.add_argument('--per-graphic', type=int, default=2)
        if name == 'chart':
            p.add_argument('--photos', required=True); p.add_argument('--manifest', required=True); p.add_argument('--out', required=True)
            p.add_argument('--first-id', type=int, default=0); p.add_argument('--lead-s', type=float, default=1.5)
        else:
            p.add_argument('--video', required=True)
        if name == 'align':
            p.add_argument('--search-from', required=True, help='ISO time the video cannot have started before'); p.add_argument('--search-s', type=float, default=90); p.add_argument('--out')
        if name == 'frames':
            p.add_argument('--start', required=True); p.add_argument('--out', required=True); p.add_argument('graphics', nargs='+', type=int)
    a = ap.parse_args(argv)
    return {'chart': cmd_chart, 'align': cmd_align, 'frames': cmd_frames}[a.cmd](a) or 0


if __name__ == '__main__':
    sys.exit(main())
