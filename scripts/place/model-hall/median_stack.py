#!/usr/bin/env python3
"""median_stack.py - textures the artist way: register many frames to one rectified surface, mask people, take the per-pixel MEDIAN.

Method (established): a planar surface seen from several viewpoints is related by homographies (Hartley & Zisserman, Multiple View
Geometry, 2nd ed., ch. 4 and 13; SIFT, Lowe IJCV 2004; RANSAC/MAGSAC, Barath et al. CVPR 2019 via OpenCV USAC_MAGSAC). The reference
frame fixes the metric rectification (4 corners, or a solved camera); every other frame is registered to it by SIFT matches taken
only inside the surface's region; each warped sample is masked where OneFormer (ADE20K, Jain et al. CVPR 2023) says 'person'
(dilated), then the per-pixel median across the samples removes whatever moved (people, shadows). Exposure of each sample is matched
to the reference by the median ratio on the shared valid pixels. Pixels with fewer than MIN_N valid samples are inpainted (Telea) and
counted in provenance. No person survives: masked pixels are never used; a fully masked pixel is inpainted from its surround.

    ~/tools/photo-analysis/.venv/bin/python -I median_stack.py <plan.json> <frames_dir> <out_dir> [--only name,name] [--max-frames 12]

Entries are the `textures` of the room plan.json (kinds quad / floor, as rectify.py), or `kind: 'H'` with `H_rect_to_ref` (3x3,
rect pixels -> reference pixels, full resolution) and `w_m`, `h_m`, `px_per_m` (from a solved camera: door_corridor_camera.py).
Extra keys: `frames` (explicit candidate list, else every frame within `window_s` seconds of the reference in the same video).
"""
import json, os, sys, re, argparse, time
import numpy as np, cv2
cv2.setNumThreads(4)
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from rectify import dlt, floor_points  # noqa: E402

MIN_N = 3
MIN_IN = 30
_seg = {}


def person_mask(path, cache_dir):
    """OneFormer semantic mask of 'person' for a frame, cached as .npy (half resolution), dilated."""
    os.makedirs(cache_dir, exist_ok=True)
    c = os.path.join(cache_dir, os.path.basename(path) + '.person.npy')
    if os.path.exists(c):
        return np.load(c)
    import torch
    from transformers import OneFormerProcessor, OneFormerForUniversalSegmentation
    if 'm' not in _seg:
        name, rev = 'shi-labs/oneformer_ade20k_swin_large', '4a5bac8e64f82681a12db2e151a4c2f4ce6092b2'
        _seg['p'] = OneFormerProcessor.from_pretrained(name, revision=rev)
        _seg['m'] = OneFormerForUniversalSegmentation.from_pretrained(name, revision=rev).to('cuda').eval()
        _seg['ids'] = [int(k) for k, v in _seg['m'].config.id2label.items() if v.startswith('person')]
    im = Image.open(path).convert('RGB'); im = im.resize((im.width // 2, im.height // 2), Image.LANCZOS)
    with torch.no_grad():
        inp = _seg['p'](images=im, task_inputs=['semantic'], return_tensors='pt').to('cuda')
        o = _seg['m'](**inp)
        sem = _seg['p'].post_process_semantic_segmentation(o, target_sizes=[im.size[::-1]])[0].cpu().numpy()
    m = np.isin(sem, _seg['ids']).astype(np.uint8)
    m = cv2.dilate(m, np.ones((31, 31), np.uint8))  # whole person plus a margin (faces, hands, shadows' edge)
    np.save(c, m)
    torch.cuda.empty_cache()
    return m


def t_of(name):
    m = re.match(r'(\d+)_t(\d+)', name)
    return (m.group(1), int(m.group(2)) / 100.0) if m else (name, 0)


def register(ref_g, cand_g, region):
    """H mapping reference half-res px -> candidate half-res px, from SIFT inside `region`; returns (H, n_inliers, n_matches)."""
    sift = cv2.SIFT_create(6000)
    k1, d1 = sift.detectAndCompute(ref_g, region)
    k2, d2 = sift.detectAndCompute(cand_g, None)
    if d1 is None or d2 is None or len(k1) < 8 or len(k2) < 20:
        return None, 0, 0
    mt = cv2.BFMatcher().knnMatch(d1, d2, k=2)
    good = [a for a, b in (m for m in mt if len(m) == 2) if a.distance < 0.75 * b.distance]
    if len(good) < 10:
        return None, 0, len(good)
    p1 = np.float32([k1[g.queryIdx].pt for g in good]); p2 = np.float32([k2[g.trainIdx].pt for g in good])
    H, inl = cv2.findHomography(p1, p2, cv2.USAC_MAGSAC, 3.0, maxIters=5000, confidence=0.999)
    return (H, int(inl.sum()), len(good)) if H is not None else (None, 0, len(good))


def register_ecc(ref_g, cand_g, region):
    """Fallback for featureless surfaces (painted wall, plain floor): direct intensity alignment, ECC (Evangelidis & Psarakis, PAMI 2008),
    homography model, started at identity, so only for frames a fraction of a second away. Returns (H ref->cand, corr*100, 100)."""
    a = cv2.GaussianBlur(ref_g, (0, 0), 2).astype(np.float32); b = cv2.GaussianBlur(cand_g, (0, 0), 2).astype(np.float32)
    H = np.eye(3, dtype=np.float32)
    try:
        cc, H = cv2.findTransformECC(b, a, H, cv2.MOTION_HOMOGRAPHY, (cv2.TERM_CRITERIA_EPS | cv2.TERM_CRITERIA_COUNT, 150, 1e-5), region, 5)
    except cv2.error:
        return None, 0, 0
    # findTransformECC(template=b, input=a): warp maps template coords -> input; we need ref->cand, i.e. the inverse, used with WARP_INVERSE_MAP below
    return np.linalg.inv(H).astype(np.float64), int(round(cc * 100)) if cc >= 0.88 else 0, 100


def run_entry(e, frames_dir, out_dir, cache, max_frames, window_s, ecc_s=2.5):
    ref_name = e['frame']
    ref = cv2.imread(os.path.join(frames_dir, ref_name)); Hf, Wf = ref.shape[:2]
    if e['kind'] == 'quad':
        pts, w_m, h_m = e['quad'], e['w_m'], e['h_m']
    elif e['kind'] == 'floor':
        pts, w_m, h_m = floor_points(e)
    else:
        pts, w_m, h_m = None, e['w_m'], e['h_m']
    ppm = e['px_per_m']; W, H = int(round(w_m * ppm)), int(round(h_m * ppm))
    if pts is not None:
        Hm = dlt([(0, 0), (W, 0), (W, H), (0, H)], pts)  # rect px -> ref px (full res)
    else:
        Hm = np.array(e['H_rect_to_ref'], float)
    corners = cv2.perspectiveTransform(np.float32([[[0, 0], [W, 0], [W, H], [0, H]]]), Hm)[0]
    S = np.diag([0.5, 0.5, 1.0]); Si = np.diag([2.0, 2.0, 1.0])
    region = np.zeros((Hf // 2, Wf // 2), np.uint8)
    cv2.fillConvexPoly(region, np.int32(corners / 2), 255)
    region = cv2.dilate(region, np.ones((15, 15), np.uint8))
    rg = cv2.cvtColor(cv2.resize(ref, (Wf // 2, Hf // 2)), cv2.COLOR_BGR2GRAY)
    rg = cv2.createCLAHE(2.0, (8, 8)).apply(rg)
    vid, t0 = t_of(ref_name)
    cands = e.get('frames') or sorted(
        [f for f in os.listdir(frames_dir) if f.endswith('.jpg') and f != ref_name and t_of(f)[0] == vid and abs(t_of(f)[1] - t0) <= window_s],
        key=lambda f: abs(t_of(f)[1] - t0))
    stack, masks, used = [], [], []

    def sample(name, Hrc):
        img = cv2.imread(os.path.join(frames_dir, name)).astype(np.float32)
        pm = person_mask(os.path.join(frames_dir, name), cache)
        pmf = cv2.resize(pm, (img.shape[1], img.shape[0]), interpolation=cv2.INTER_NEAREST)
        valid = np.ones(img.shape[:2], np.float32); valid[pmf > 0] = 0
        # edge margin: the warp must stay inside the frame; borders are excluded
        valid[:6] = 0; valid[-6:] = 0; valid[:, :6] = 0; valid[:, -6:] = 0
        M = Hrc
        w = cv2.warpPerspective(img, M, (W, H), flags=cv2.INTER_AREA | cv2.WARP_INVERSE_MAP)
        v = cv2.warpPerspective(valid, M, (W, H), flags=cv2.INTER_NEAREST | cv2.WARP_INVERSE_MAP)
        return w, v > 0.5

    w, v = sample(ref_name, Hm)  # ref: rect -> ref direct
    stack.append(w); masks.append(v); used.append({'frame': ref_name, 'role': 'reference', 'inliers': None})
    tried = 0
    for c in cands:
        if len(stack) >= max_frames or tried >= 3 * max_frames:
            break
        tried += 1
        cg = cv2.createCLAHE(2.0, (8, 8)).apply(cv2.cvtColor(cv2.resize(cv2.imread(os.path.join(frames_dir, c)), (Wf // 2, Hf // 2)), cv2.COLOR_BGR2GRAY))
        Hrc, n_in, n_m = register(rg, cg, region)
        if Hrc is None or n_in < MIN_IN or n_in < 0.25 * n_m:
            if abs(t_of(c)[1] - t0) > ecc_s:
                continue
            Hrc, n_in, n_m = register_ecc(rg, cg, region)  # corr x100 in n_in
            if Hrc is None or n_in < 88:
                continue
        # rect -> ref(full) -> ref(half) -> cand(half) -> cand(full)
        M = Si @ Hrc @ S @ Hm
        # sanity: the surface must land in the frame and keep its area within 0.25..4x
        q = cv2.perspectiveTransform(np.float32([[[W / 2, H / 2]]]), M)[0, 0]
        if not (0 < q[0] < Wf and 0 < q[1] < Hf):
            continue
        w, v = sample(c, M)
        if v.mean() < 0.15:
            continue
        stack.append(w); masks.append(v); used.append({'frame': c, 'inliers': n_in, 'matches': n_m, 'valid_frac': round(float(v.mean()), 3)})
    # exposure match to the reference on shared valid pixels (median ratio of luma)
    luma = lambda a: a.mean(axis=2)
    ref_l = luma(stack[0])
    for i in range(1, len(stack)):
        sh = masks[0] & masks[i]
        if sh.sum() > 500:
            r = np.median(ref_l[sh]) / max(np.median(luma(stack[i])[sh]), 1e-3)
            stack[i] = stack[i] * float(np.clip(r, 0.6, 1.6))
    arr = np.stack(stack).astype(np.float32); mk = np.stack(masks)
    arr[~mk] = np.nan
    n = mk.sum(0)
    with np.errstate(all='ignore'):
        med = np.nanmedian(arr, axis=0)
    ok = n >= MIN_N
    # where fewer than MIN_N: use the mean of what exists, else inpaint
    with np.errstate(all='ignore'):
        mean = np.nanmean(arr, axis=0)
    out = np.where(ok[..., None], med, mean)
    hole = (n == 0)
    out = np.nan_to_num(out, nan=0.0)
    o8 = np.clip(out, 0, 255).astype(np.uint8)
    if hole.any():
        o8 = cv2.inpaint(o8, hole.astype(np.uint8) * 255, 5, cv2.INPAINT_TELEA)
    stats = {'frames_used': len(stack), 'min_n': MIN_N, 'px_with_ge_min_n': round(float(ok.mean()), 3),
             'px_inpainted_no_sample': round(float(hole.mean()), 4), 'median_samples_per_px': float(np.median(n))}
    return cv2.cvtColor(o8, cv2.COLOR_BGR2RGB), (w_m, h_m, W, H), used, stats


def post(a, e):
    """Same finishing as rectify.py: flat field, pad, albedo, mirror_tile."""
    from PIL import ImageFilter
    a = a.astype(np.float64)
    if e.get('flatten'):
        low = np.asarray(Image.fromarray(a.clip(0, 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(e['flatten'])), float) + 1
        a = a / low * low.reshape(-1, 3).mean(0)
    if e.get('pad_m'):
        l, r = (int(round(v * e['px_per_m'])) for v in e['pad_m'])
        prof = Image.fromarray(a.mean(axis=1, keepdims=True).clip(0, 255).astype(np.uint8)).resize((1, a.shape[0])).filter(ImageFilter.BoxBlur(25))
        rm = np.asarray(prof, float); rng = np.random.default_rng(0)
        nz = lambda k: rng.normal(0, 1.5, (a.shape[0], k, 3))
        a = np.concatenate([np.repeat(rm, l, 1) + nz(l), a, np.repeat(rm, r, 1) + nz(r)], 1)
    if e.get('albedo'):
        a = a * (e['albedo'] * 255.0 / a.reshape(-1, 3).mean())
    if e.get('mirror_tile'):
        a = np.concatenate([a, a[:, ::-1]], 1); a = np.concatenate([a, a[::-1]], 0)
    return Image.fromarray(a.clip(0, 255).astype(np.uint8))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('plan'); ap.add_argument('frames'); ap.add_argument('out')
    ap.add_argument('--only'); ap.add_argument('--min-n', type=int, default=3); ap.add_argument('--min-inliers', type=int, default=30); ap.add_argument('--max-frames', type=int, default=8); ap.add_argument('--window-s', type=float, default=12.0)
    a = ap.parse_args()
    global MIN_N, MIN_IN
    MIN_N, MIN_IN = a.min_n, a.min_inliers
    plan = json.load(open(a.plan)); os.makedirs(a.out, exist_ok=True)
    cache = os.path.join(a.out, '_personmask'); only = set(a.only.split(',')) if a.only else None
    prov = []
    for e in plan['textures']:
        if e.get('kind') not in ('quad', 'floor', 'H') or (only and e['name'] not in only):
            continue
        t0 = time.time()
        img, (w_m, h_m, W, H), used, stats = run_entry(e, a.frames, a.out, cache, a.max_frames, a.window_s)
        out = post(img, e); out.save(os.path.join(a.out, e['name'] + '.png'))
        prov.append({'texture': e['name'] + '.png', 'kind': e['kind'], 'reference': e['frame'], 'samples': used, 'stats': stats,
                     'metres': [w_m, h_m], 'px_per_m': e['px_per_m'], 'flatten': e.get('flatten'), 'albedo': e.get('albedo'),
                     'mirror_tile': e.get('mirror_tile'), 'size_px': list(out.size), 'note': e.get('note', ''),
                     'people': 'OneFormer person mask (dilated 31 px at half res) excluded before the median; no face used'})
        print(e['name'], out.size, stats, f'{time.time() - t0:.0f}s', flush=True)
    json.dump({'tool': 'scripts/place/model-hall/median_stack.py', 'plan': a.plan, 'textures': prov}, open(os.path.join(a.out, 'provenance.json'), 'w'), indent=1)


if __name__ == '__main__':
    main()
