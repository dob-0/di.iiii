#!/usr/bin/env python3
"""Run 4, tool 1 (Colab A100): VGGT poses + depth for a whole walk, coarse-to-fine, one global frame.

Method: VGGT (Wang et al., CVPR 2025, arXiv 2503.11651), facebookresearch/vggt, weights facebook/VGGT-1B
(CC BY-NC 4.0, non-commercial; the commercial checkpoint VGGT-1B-Commercial is gated and was not available
to this login, so this is an INTERNAL twin only).
Coarse pass: every STRIDE-th frame of both walks in ONE VGGT call (loop closures, one frame).
Fine pass: consecutive windows of WINDOW frames inside one walk; each window is put into the coarse frame by a
similarity transform (Umeyama + RANSAC on per-pixel 3D points of the frames both passes share).
A window whose RANSAC inlier share is < 0.5 is flagged not-ok (not "registered").
Output: <out>/model.npz  names, c2w[N,4,4], K[N,3,3] (at proc size), depth[N,h,w] (global scale), conf, ok[N], win[N], inl[N]
Usage: python vggt_run.py --tar dense3.tar --out DIR --stride 6 --window 60
"""
import argparse, json, os, sys, tarfile, time, io, subprocess
import numpy as np

ap = argparse.ArgumentParser()
ap.add_argument('--tar', required=True); ap.add_argument('--out', required=True)
ap.add_argument('--stride', type=int, default=6); ap.add_argument('--window', type=int, default=60)
ap.add_argument('--H', type=int, default=700); ap.add_argument('--W', type=int, default=392)
ap.add_argument('--repo', default='/content/vggt')
a = ap.parse_args()
os.makedirs(a.out, exist_ok=True)
LOG = open(os.path.join(a.out, 'run.log'), 'a')
def log(*s):
    m = time.strftime('%H:%M:%S ') + ' '.join(str(x) for x in s); print(m, flush=True); LOG.write(m + '\n'); LOG.flush()

if not os.path.isdir(a.repo):
    subprocess.check_call(['git', 'clone', 'https://github.com/facebookresearch/vggt', a.repo])
    subprocess.check_call(['git', '-C', a.repo, 'checkout', 'a288dd0f'])
sys.path.insert(0, a.repo)
import torch
from PIL import Image
from vggt.models.vggt import VGGT
from vggt.utils.pose_enc import pose_encoding_to_extri_intri
dev = 'cuda'
model = VGGT.from_pretrained('facebook/VGGT-1B').to(dev).eval()
log('model loaded', torch.cuda.get_device_name(0))

tf = tarfile.open(a.tar)
names = sorted(m.name for m in tf.getmembers() if m.name.endswith('.jpg'))
N = len(names); log('frames', N)
H, W = a.H, a.W
imgs = np.zeros((N, H, W, 3), np.uint8)
for i, n in enumerate(names):
    imgs[i] = np.asarray(Image.open(io.BytesIO(tf.extractfile(n).read())).convert('RGB').resize((W, H), Image.LANCZOS))
clip = [n.split('__')[0] for n in names]

def infer(idx):
    x = torch.from_numpy(imgs[idx]).to(dev).permute(0, 3, 1, 2).float().div(255)[None]
    with torch.no_grad(), torch.autocast('cuda', dtype=torch.bfloat16):
        agg, ps = model.aggregator(x)
        pe = model.camera_head(agg)[-1]
        d, c = model.depth_head(agg, x, ps)
    ex, K = pose_encoding_to_extri_intri(pe.float(), (H, W))
    ex = ex[0].float().cpu().numpy(); K = K[0].float().cpu().numpy()
    w2c = np.tile(np.eye(4), (len(idx), 1, 1)); w2c[:, :3] = ex
    return np.linalg.inv(w2c), K, d[0, ..., 0].float().cpu().numpy(), c[0].float().cpu().numpy()

def pix_pts(c2w, K, depth, sel):
    ys, xs = sel
    z = depth[ys, xs]
    x = (xs - K[0, 2]) * z / K[0, 0]; y = (ys - K[1, 2]) * z / K[1, 1]
    p = np.stack([x, y, z, np.ones_like(z)], 0)
    return (c2w @ p)[:3].T

def umeyama(A, B, w=None):  # B ~ s R A + t
    ma, mb = A.mean(0), B.mean(0); A0, B0 = A - ma, B - mb
    C = B0.T @ A0 / len(A); U, S, Vt = np.linalg.svd(C)
    D = np.eye(3); D[2, 2] = np.sign(np.linalg.det(U) * np.linalg.det(Vt))
    R = U @ D @ Vt; s = (S * np.diag(D)).sum() / A0.var(0).sum()
    return s, R, mb - s * R @ ma

def ransac_sim3(A, B, scale, iters=800, rng=np.random.default_rng(0)):
    best, bi = None, np.zeros(len(A), bool)
    for _ in range(iters):
        k = rng.choice(len(A), 4, replace=False)
        try: s, R, t = umeyama(A[k], B[k])
        except Exception: continue
        if not np.isfinite(s) or s <= 0: continue
        e = np.linalg.norm((s * (R @ A.T)).T + t - B, axis=1); inl = e < 0.05 * scale
        if inl.sum() > bi.sum(): best, bi = (s, R, t), inl
    if bi.sum() < 20: return None, bi
    s, R, t = umeyama(A[bi], B[bi])
    e = np.linalg.norm((s * (R @ A.T)).T + t - B, axis=1); bi = e < 0.05 * scale
    return (s, R, t), bi

# ---- coarse pass
cidx = np.arange(0, N, a.stride)
t0 = time.time()
cw, cK, cd, cc = infer(cidx)
log('coarse', len(cidx), 'frames', round(time.time() - t0, 1), 's, gpu mem GB', round(torch.cuda.max_memory_allocated() / 1e9, 1))
cpos = {int(g): j for j, g in enumerate(cidx)}
rs = np.random.default_rng(1)
SEL = (rs.integers(0, H, 600), rs.integers(0, W, 600))

c2w = np.tile(np.eye(4), (N, 1, 1)); K = np.zeros((N, 3, 3)); depth = np.zeros((N, H, W), np.float16)
conf = np.zeros((N, H, W), np.float16); ok = np.zeros(N, bool); win = -np.ones(N, int); inl_share = np.zeros(N)
widx = 0; report = []
for cl in sorted(set(clip)):
    ids = [i for i in range(N) if clip[i] == cl]
    for s0 in range(0, len(ids), a.window):
        w_ids = np.array(ids[s0:s0 + a.window])
        if len(w_ids) < 8: w_ids = np.array(ids[max(0, len(ids) - a.window):])
        lw, lK, ld, lc = infer(w_ids)
        common = [(k, cpos[int(g)]) for k, g in enumerate(w_ids) if int(g) in cpos]
        A, B = [], []
        for k, j in common:
            m = (lc[k][SEL] > np.percentile(lc[k], 40)) & (cc[j][SEL] > np.percentile(cc[j], 40))
            sel = (SEL[0][m], SEL[1][m])
            A.append(pix_pts(lw[k], lK[k], ld[k], sel)); B.append(pix_pts(cw[j], cK[j], cd[j], sel))
        res, inl = (None, np.zeros(1, bool))
        if A:
            A = np.concatenate(A); B = np.concatenate(B)
            res, inl = ransac_sim3(A, B, scale=float(np.median(np.linalg.norm(B - B.mean(0), axis=1))) + 1e-6)
        share = float(inl.mean()) if len(inl) > 1 else 0.0
        report.append(dict(win=widx, clip=cl, frames=len(w_ids), common=len(common), inlier_share=round(share, 3)))
        if res is not None and share >= 0.5:
            s, R, t = res
            T = np.eye(4); T[:3, :3] = s * R; T[:3, 3] = t        # local -> global, with scale s
            for k, g in enumerate(w_ids):
                m = lw[k].copy(); cen = (T @ np.append(m[:3, 3], 1))[:3]
                m[:3, :3] = R @ m[:3, :3]; m[:3, 3] = cen
                c2w[g] = m; K[g] = lK[k]; depth[g] = (ld[k] * s).astype(np.float16); conf[g] = lc[k].astype(np.float16)
                ok[g] = True; win[g] = widx; inl_share[g] = share
        else:
            for k, g in enumerate(w_ids): win[g] = widx; K[g] = lK[k]
        log('window', widx, cl, len(w_ids), 'common', len(common), 'inlier', round(share, 3), 'ok' if (res is not None and share >= .5) else 'REJECT')
        widx += 1
np.savez_compressed(os.path.join(a.out, 'model.npz'), names=np.array(names), c2w=c2w, K=K, depth=depth, conf=conf, ok=ok, win=win, inl=inl_share, hw=np.array([H, W]))
cen = c2w[ok][:, :3, 3]
lo, hi = np.percentile(cen, 2, 0), np.percentile(cen, 98, 0)
summ = dict(tool='VGGT-1B', weights_licence='CC BY-NC 4.0 (non-commercial)', frames=N, ok=int(ok.sum()), share=round(float(ok.mean()), 3),
            windows=widx, windows_rejected=sum(r['inlier_share'] < .5 for r in report), camera_path_extent_2_98=(hi - lo).round(2).tolist(),
            stride=a.stride, window=a.window, windows_report=report)
json.dump(summ, open(os.path.join(a.out, 'summary.json'), 'w'), indent=1)
log('DONE', json.dumps({k: v for k, v in summ.items() if k != 'windows_report'}))
open(os.path.join(a.out, 'DONE'), 'w').write('done\n')
