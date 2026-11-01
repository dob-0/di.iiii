#!/usr/bin/env python3
"""door_corridor_quilt.py - sharp door-corridor textures by direct rectify + detail transfer (image quilting kept as quilt_row, not used: seams) (ledger N1756, fix4).

  ~/tools/photo-analysis/.venv/bin/python -I door_corridor_quilt.py <room_dir> [seed]

Why: the median over 2-3 frames blurs (registration error), and the old tile stretched/mirrored a 2.5 m piece. Measured (fix4 ROOMS.md):
direct Lanczos warp of the solved-camera homography is 2x sharper (Laplacian variance 65 vs 35 at local 1.5 m). Detail exists only where the
frame samples >= ~60 px/m (about 1.5-3.5 m from the camera), so the sharp patch is the source and the rest of the wall is SYNTHESISED from it.
Method: Efros & Freeman, "Image quilting for texture synthesis and transfer", SIGGRAPH 2001 (min-error boundary cut), here row-constrained
(blocks keep their image row, only the along-corridor position varies) so ceiling trim, skirting and the course lines stay at the right height.
The result is synthetic detail with real statistics, NOT a measurement of the stone farther away; provenance says so.
No person: patches are chosen clear of the ladder, easels, people and prints (checked by eye on the strip; frame 11025 has no face in them).
Output keeps the run-time contract of door_corridor_finish.py: file = [tile, mirrored tile], plan textures_world {x_start,tile_w_m,mirrored_x,height_m}.
"""
import json, os, sys
import numpy as np, cv2

PPM = 200
SIG, GAIN = 8, 1.6
# name -> (patch px range in the rectified strip, strip start local m (from plan_H world_x_start), albedo, tile width px)
JOBS = {'wall_right': ((60, 380), 0.46, 1200), 'wall_left': ((340, 640), 0.46, 1200), 'floor': ((560, 860), 0.40, 1200)}


def quilt_row(P, W, bw=150, ov=40, rng=None):
    h, pw = P.shape[:2]; P = P.astype(np.float32)
    offs = np.arange(0, pw - bw + 1)
    out = np.zeros((h, W + bw, 3), np.float32)
    o = int(rng.integers(0, len(offs))); out[:, :bw] = P[:, o:o + bw]; x = bw; hist = [o]
    while x < W:
        tgt = out[:, x - ov:x]
        errs = np.array([np.sum((P[:, c:c + ov] - tgt) ** 2) for c in offs])
        for hh in hist[-3:]: errs[max(0, hh - 25):hh + 26] = np.inf  # never reuse a recent source place (avoids visible periodic banding)
        ok = np.flatnonzero(errs <= np.sort(errs[np.isfinite(errs)])[:max(8, len(offs) // 5)][-1]); c = int(rng.choice(ok)); hist.append(c)
        cand = P[:, c:c + bw]
        e = ((cand[:, :ov] - tgt) ** 2).sum(2)  # min-error vertical cut through the overlap (DP, Efros-Freeman 2001)
        cost = e.copy()
        for r in range(1, h):
            prev = cost[r - 1]; cost[r] += np.minimum(prev, np.minimum(np.r_[np.inf, prev[:-1]], np.r_[prev[1:], np.inf]))
        cut = np.zeros(h, int); cut[-1] = int(np.argmin(cost[-1]))
        for r in range(h - 2, -1, -1):
            lo, hi = max(0, cut[r + 1] - 1), min(ov, cut[r + 1] + 2); cut[r] = lo + int(np.argmin(cost[r, lo:hi]))
        mask = (np.arange(ov)[None, :] >= cut[:, None]).astype(np.float32)  # 1 = take candidate
        mask = cv2.GaussianBlur(mask, (5, 1), 0)[..., None]
        out[:, x - ov:x] = tgt * (1 - mask) + cand[:, :ov] * mask
        out[:, x:x + bw - ov] = cand[:, ov:]; x += bw - ov
    return out[:, :W]


def main(room, seed=7):
    S = '/mnt/data/footage/place-cinema-house-2026-10-30/modelled/survey/rooms/door_corridor/155205_t11025.jpg'
    T = os.path.join(room, 'textures'); H = json.load(open(os.path.join(room, 'cam3', 'plan_H.json')))['textures']
    cam = json.load(open(os.path.join(room, 'cam3', 'camera.json'))); CX = cam['cam_world_x_assumed']; Hh = cam['ceiling_height_solved_m']
    plan = json.load(open(os.path.join(room, 'plan.json'))); ref = cv2.imread(S); rng = np.random.default_rng(seed)
    XS = {n: v['x_start'] for n, v in plan['textures_world'].items()}  # keep the fix3 tile positions
    world, prov = {}, []
    for t in H:
        n = t['name']
        if n not in JOBS: continue
        (a, b), alb, W = JOBS[n]
        d = cv2.warpPerspective(ref, np.array(t['H_rect_to_ref']), (int(t['w_m'] * PPM), int(t['h_m'] * PPM)), flags=cv2.INTER_LANCZOS4 | cv2.WARP_INVERSE_MAP)
        patch = d[:, a:b].astype(np.float32)
        out = {'wall_right': 'wall_stone_right.png', 'wall_left': 'wall_stone_left.png', 'floor': 'floor_corridor.png'}[n]
        bk = os.path.join(T, out.replace('.png', '.before-fix4.png'))
        if not os.path.exists(bk): cv2.imwrite(bk, cv2.imread(os.path.join(T, out)))
        old = cv2.imread(bk).astype(np.float32); W = old.shape[1] // 2; old = old[:, :W]  # fix3 tile: obstacles + prints already painted out, tone = real layout
        reps = int(np.ceil(W / patch.shape[1])) + 1  # detail = high-pass of the SHARP patch, mirror-repeated (real texture, sharp)
        det = np.concatenate([patch if k % 2 == 0 else patch[:, ::-1] for k in range(reps)], 1)[:, :W]
        if det.shape[0] != old.shape[0]: det = cv2.resize(det, (W, old.shape[0]), interpolation=cv2.INTER_AREA)
        if n == 'floor': old = det.copy()  # the fix3 floor tile carries ladder/easel shadow at its ends: low band from the clean patch itself
        lp = lambda im: cv2.GaussianBlur(im, (0, 0), SIG)
        q = lp(old) + (det - lp(det)) * GAIN  # detail transfer: low band from the layout tile, high band from the sharp patch
        mean = q.reshape(-1, 3).mean()
        q = np.clip(q * (alb * 255.0 / mean), 0, 255).astype(np.uint8)
        W = q.shape[1]
        cv2.imwrite(os.path.join(T, out), np.concatenate([q, q[:, ::-1]], 1))
        world[n] = {'file': out, 'x_start': round(XS[n], 3), 'tile_w_m': round(W / PPM, 3), 'mirrored_x': True, 'height_m': Hh if n != 'floor' else 1.8}
        prov.append({'texture': out, 'source_patch_px': [a, b], 'method': 'direct Lanczos warp of solved-camera H (cam3/plan_H.json), high band mirror-tiled over the fix3 layout tile low band (detail transfer, cf. Efros-Freeman 2001 texture transfer); quilting was tried first and rejected (visible seams), seed %d' % seed,
                     'honest': 'detail beyond the patch is synthetic from the patch statistics, not measured'})
    plan['textures_world'].update(world)
    json.dump(plan, open(os.path.join(room, 'plan.json'), 'w'), indent=1)
    pv = json.load(open(os.path.join(T, 'provenance.json'))); pv['fix4_textures'] = prov
    json.dump(pv, open(os.path.join(T, 'provenance.json'), 'w'), indent=1); print(json.dumps(world))


if __name__ == '__main__':
    main(sys.argv[1], int(sys.argv[2]) if len(sys.argv) > 2 else 7)
