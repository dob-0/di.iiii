"""ingest.py - dense frame extraction (round 5 walls, ledger N1834).
ffmpeg NVDEC decode (hevc, autorotate -> portrait) -> scale 1080x1920 -> rawvideo pipe -> person detection (torchvision Faster R-CNN
ResNet50-FPN v2, COCO 'person', Ren et al. 2015 / Li et al. 2021) -> every person box (+20 %) gaussian-blurred BEFORE anything is written
(no unblurred frame touches the disk) -> JPEG q90 + 720x1280 copy for depth -> sharpness (Laplacian variance at 540x960, same as survey
index.json) -> LSD (von Gioi et al. 2010) line statistics for the pre-filter. Index line per frame in index_<v>.jsonl.
usage: ingest.py <v1|v2> [--seg A:B:STEP ...] [--out DIR]   (selection = SEG below: step 1 = every frame 30 fps, step 3 = 10 fps;
       --seg replaces it, seconds; --out writes frames/, small/, index there instead of modelled/dense — a pilot never overwrites the dense set)"""
import sys, os, json, subprocess, numpy as np, cv2, torch, torchvision, math
D = '/mnt/data/footage/place-cinema-house-2026-10-30'; O = D + '/modelled/dense'
VID = {'v1': ('20261030_154922.mp4', 2618, [(0, 3, 1), (3, 56, 3), (56, 88, 1)]),
       'v2': ('20261030_155205.mp4', 8749, [(0, 27, 1), (27, 31, 3), (31, 36, 1), (36, 68, 3), (68, 293, 1)])}
v = sys.argv[1]; fn, NF, SEG = VID[v]; FPS = 30.0
_a = sys.argv[2:]
if '--seg' in _a:
    SEG = [tuple(float(x) if i < 2 else int(x) for i, x in enumerate(s_.split(':'))) for s_ in _a[_a.index('--seg') + 1].split(',')]
if '--out' in _a:
    O = _a[_a.index('--out') + 1]
for _d in ('frames', 'small', '_work'): os.makedirs(f'{O}/{_d}', exist_ok=True)
sel = []
for a, b, st in SEG:
    sel += [n for n in range(int(a * FPS), min(NF, int(b * FPS))) if n % st == 0]
sel = sorted(set(sel)); S = set(sel)
expr = '+'.join(f"(between(n,{int(a*30)},{int(min(NF,b*30))-1})*eq(mod(n,{st}),0))" for a, b, st in SEG)
open(f'{O}/_work/sel_{v}.txt', 'w').write(f"select='gt({expr},0)',scale=1080:1920")
W0, H0 = 1080, 1920
cmd = ['ffmpeg', '-v', 'error', '-hwaccel', 'cuda', '-i', f'{D}/../cinema-house-2026-10-30/{fn}', '-vf', open(f'{O}/_work/sel_{v}.txt').read(),
       '-fps_mode', 'passthrough', '-f', 'rawvideo', '-pix_fmt', 'bgr24', '-']
det = torchvision.models.detection.fasterrcnn_resnet50_fpn_v2(weights='DEFAULT', min_size=540, max_size=960).cuda().eval()
lsd = cv2.createLineSegmentDetector(cv2.LSD_REFINE_STD)
pr = subprocess.Popen(cmd, stdout=subprocess.PIPE, bufsize=W0 * H0 * 3 * 4)
out = open(f'{O}/index_{v}.jsonl', 'w'); i = 0; B = 2

def stats(g):
    segs = lsd.detect(g)[0]
    if segs is None: return dict(Lh=0, Lc=0, nv=0, corner=False, opening=False, F=0)
    s = segs.reshape(-1, 4); dx = s[:, 2] - s[:, 0]; dy = s[:, 3] - s[:, 1]; L = np.hypot(dx, dy)
    th = np.degrees(np.arctan2(dy, dx)); th = (th + 90) % 180 - 90          # -90..90, 0 = horizontal
    ok = L >= 35; Lh = float(L[ok & (np.abs(th) <= 8)].sum()); Lc = float(L[ok & (np.abs(th) > 8) & (np.abs(th) < 60)].sum())
    vert = ok & (np.abs(th) >= 84) & (L >= 300)
    xv = np.sort(((s[vert, 0] + s[vert, 2]) / 2)) if vert.any() else np.array([])
    F = Lh / (Lh + Lc + 1e-6)
    corner = False
    for x in xv[:6]:
        lo = ok & (np.abs(th) > 8) & (np.abs(th) < 60) & (L >= 80) & (np.minimum(s[:, 1], s[:, 3]) > 400)
        left = lo & (np.maximum(s[:, 0], s[:, 2]) < x + 15); right = lo & (np.minimum(s[:, 0], s[:, 2]) > x - 15)
        if left.sum() and right.sum() and L[left].sum() > 150 and L[right].sum() > 150:
            ml = np.sign(np.average(np.tan(np.radians(th[left])), weights=L[left])); mr = np.sign(np.average(np.tan(np.radians(th[right])), weights=L[right]))
            if ml * mr < 0: corner = True; break
    opening = False
    if len(xv) >= 2:
        gaps = np.diff(xv); jj = np.where((gaps > 60) & (gaps < 700))[0]
        for j in jj:
            a, b = xv[j], xv[j + 1]
            top = ok & (np.abs(th) <= 8) & (np.maximum(s[:, 0], s[:, 2]) <= b + 30) & (np.minimum(s[:, 0], s[:, 2]) >= a - 30) & (L >= 0.5 * (b - a))
            if top.any(): opening = True; break
    return dict(Lh=round(Lh), Lc=round(Lc), nv=int(len(xv)), corner=bool(corner), opening=bool(opening), F=round(float(F), 3))

def flush(buf, ns):
    global i
    small = [cv2.resize(f, (540, 960), interpolation=cv2.INTER_AREA) for f in buf]
    t = torch.from_numpy(np.stack([s[:, :, ::-1] for s in small])).permute(0, 3, 1, 2).float().div(255).cuda()
    with torch.no_grad(), torch.autocast('cuda', dtype=torch.float16): res = det(list(t))
    for f, n, r in zip(buf, ns, res):
        keep = (r['labels'] == 1) & (r['scores'] >= 0.3); bx = r['boxes'][keep].cpu().numpy() * 2.0   # to 1080x1920
        for x0, y0, x1, y1 in bx:
            w, h = x1 - x0, y1 - y0; x0 = int(max(0, x0 - .2 * w)); x1 = int(min(W0, x1 + .2 * w)); y0 = int(max(0, y0 - .2 * h)); y1 = int(min(H0, y1 + .2 * h))
            k = max(15, (min(x1 - x0, y1 - y0) // 3) | 1)
            f[y0:y1, x0:x1] = cv2.GaussianBlur(f[y0:y1, x0:x1], (k, k), 0); f[y0:y1, x0:x1] = cv2.GaussianBlur(f[y0:y1, x0:x1], (k, k), 0)
        g = cv2.cvtColor(cv2.resize(f, (540, 960), interpolation=cv2.INTER_AREA), cv2.COLOR_BGR2GRAY)
        sh = float(cv2.Laplacian(g, cv2.CV_64F).var()); st = stats(g)
        name = f'{v}_f{n:05d}'
        cv2.imwrite(f'{O}/frames/{name}.jpg', f, [cv2.IMWRITE_JPEG_QUALITY, 90])
        cv2.imwrite(f'{O}/small/{name}.jpg', cv2.resize(f, (720, 1280), interpolation=cv2.INTER_AREA), [cv2.IMWRITE_JPEG_QUALITY, 92])
        out.write(json.dumps(dict(name=name, video=fn, n=n, t_s=round(n / FPS, 3), sharp=round(sh, 1), persons=int(len(bx)), **st)) + '\n')
buf, ns = [], []
while True:
    raw = pr.stdout.read(W0 * H0 * 3)
    if len(raw) < W0 * H0 * 3: break
    buf.append(np.frombuffer(raw, np.uint8).reshape(H0, W0, 3).copy()); ns.append(sel[i]); i += 1
    if len(buf) == B: flush(buf, ns); buf, ns = [], []
if buf: flush(buf, ns)
out.close(); print('DONE', v, 'selected', len(sel), 'written', i, flush=True)
