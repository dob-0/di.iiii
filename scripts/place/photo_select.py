#!/usr/bin/env python3
"""photo_select.py — pick the distinct views of a place from photos + videos, dropping near-duplicates.

Usage (venv ~/tools/photo-analysis/.venv):
  python scripts/place/photo_select.py --out DIR [--fps 1.0] FILE_OR_DIR...
Writes DIR/frames/*.jpg (video frames), DIR/select.json (every candidate: hash, sharpness, group, kept or why
dropped) and DIR/kept-sheet-*.jpg (contact sheets of the kept views).

Method (published, no learned weights):
  - candidates: every still, plus video frames at --fps (OpenCV decode);
  - sharpness: variance of the Laplacian (Pech-Pacheco et al., ICPR 2000);
  - near-duplicate test, two stages: perceptual hash (DCT pHash, 64 bit; Zauner 2010) Hamming distance <= 12
    proposes a pair; ORB features (Rublee et al., ICCV 2011) + RANSAC homography confirm it when >= 35 % of
    the smaller image's matched keypoints are inliers (same place, same direction);
  - groups = connected components of confirmed pairs; keep the sharpest member (stills win ties over frames).
"""
import argparse, json, sys
from pathlib import Path
import numpy as np
import cv2

IMG = {'.jpg', '.jpeg', '.png', '.webp'}
VID = {'.mp4', '.mov', '.m4v'}


def phash(gray):
    g = cv2.resize(gray, (32, 32), interpolation=cv2.INTER_AREA).astype(np.float32)
    d = cv2.dct(g)[:8, :8].ravel()
    return d > np.median(d[1:])


def orb_overlap(a, b, orb, bf):
    ka, da = orb.detectAndCompute(a, None); kb, db = orb.detectAndCompute(b, None)
    if da is None or db is None or len(ka) < 30 or len(kb) < 30:
        return 0.0
    ms = [m for m, n in (p for p in bf.knnMatch(da, db, k=2) if len(p) == 2) if m.distance < 0.75 * n.distance]
    if len(ms) < 20:
        return 0.0
    A = np.float32([ka[m.queryIdx].pt for m in ms]); B = np.float32([kb[m.trainIdx].pt for m in ms])
    H, inl = cv2.findHomography(A, B, cv2.RANSAC, 6.0)
    return 0.0 if inl is None else float(inl.sum()) / min(len(ka), len(kb))


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--out', required=True); ap.add_argument('--fps', type=float, default=1.0)
    ap.add_argument('--hash-max', type=int, default=12); ap.add_argument('--overlap-min', type=float, default=0.35)
    ap.add_argument('inputs', nargs='+')
    a = ap.parse_args()
    out = Path(a.out); (out / 'frames').mkdir(parents=True, exist_ok=True)
    files = []
    for p in map(Path, a.inputs):
        files += sorted(q for q in p.iterdir() if q.suffix.lower() in IMG | VID) if p.is_dir() else [p]
    cands = []
    for f in files:
        if f.suffix.lower() in IMG:
            im = cv2.imread(str(f))
            if im is not None:
                cands.append({'path': str(f), 'kind': 'still', 'img': im})
        elif f.suffix.lower() in VID:
            cap = cv2.VideoCapture(str(f)); fps = cap.get(cv2.CAP_PROP_FPS) or 30; n = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
            stepf = max(1, int(round(fps / a.fps)))
            for i in range(0, n, stepf):
                cap.set(cv2.CAP_PROP_POS_FRAMES, i); ok, im = cap.read()
                if not ok:
                    break
                fp = out / 'frames' / f'{f.stem[:24]}-t{i / fps:05.1f}.jpg'; cv2.imwrite(str(fp), im, [cv2.IMWRITE_JPEG_QUALITY, 95])
                cands.append({'path': str(fp), 'kind': 'frame', 'video': str(f), 't_s': round(i / fps, 1), 'img': im})
    for c in cands:
        g = cv2.cvtColor(c['img'], cv2.COLOR_BGR2GRAY)
        s = 640 / max(g.shape); c['small'] = cv2.resize(g, None, fx=s, fy=s, interpolation=cv2.INTER_AREA) if s < 1 else g
        c['sharp'] = float(cv2.Laplacian(c['small'], cv2.CV_64F).var()); c['hash'] = phash(c['small'])
    orb = cv2.ORB_create(1500); bf = cv2.BFMatcher(cv2.NORM_HAMMING)
    n = len(cands); parent = list(range(n))

    def find(i):
        while parent[i] != i:
            parent[i] = parent[parent[i]]; i = parent[i]
        return i
    pairs = 0
    for i in range(n):
        for j in range(i + 1, n):
            hd = int((cands[i]['hash'] != cands[j]['hash']).sum())
            if hd <= a.hash_max:
                ov = orb_overlap(cands[i]['small'], cands[j]['small'], orb, bf); pairs += 1
                if ov >= a.overlap_min:
                    parent[find(i)] = find(j)
    groups = {}
    for i in range(n):
        groups.setdefault(find(i), []).append(i)
    rows = []
    for gid, mem in groups.items():
        best = max(mem, key=lambda k: (cands[k]['kind'] == 'still', cands[k]['sharp']))
        for k in mem:
            c = cands[k]
            rows.append({k2: c[k2] for k2 in ('path', 'kind', 'video', 't_s') if k2 in c} | {
                'sharpness': round(c['sharp'], 1), 'group': int(gid), 'group_size': len(mem), 'kept': k == best,
                'why': 'sharpest of its group' if k == best else f'near-duplicate of {Path(cands[best]["path"]).name}'})
    kept = [r for r in rows if r['kept']]
    (out / 'select.json').write_text(json.dumps({'candidates': len(rows), 'kept': len(kept), 'dropped': len(rows) - len(kept),
                                                 'pairs_checked_orb': pairs, 'params': vars(a), 'rows': rows}, indent=1))
    W, H = 320, 200
    for s0 in range(0, len(kept), 40):
        sheet = np.zeros((H * 5, W * 8, 3), np.uint8)
        for i, r in enumerate(kept[s0:s0 + 40]):
            im = cv2.imread(r['path']); sc = min(W / im.shape[1], H / im.shape[0]); im = cv2.resize(im, None, fx=sc, fy=sc)
            y, x = (i // 8) * H, (i % 8) * W; sheet[y:y + im.shape[0], x:x + im.shape[1]] = im
            cv2.putText(sheet, f'{s0 + i}:{Path(r["path"]).name[:26]}', (x + 2, y + 12), 0, 0.35, (0, 255, 255), 1)
        cv2.imwrite(str(out / f'kept-sheet-{s0 // 40}.jpg'), sheet, [cv2.IMWRITE_JPEG_QUALITY, 85])
    print(f'{len(rows)} candidates, kept {len(kept)}, dropped {len(rows) - len(kept)}, orb pairs {pairs}')


if __name__ == '__main__':
    main()
