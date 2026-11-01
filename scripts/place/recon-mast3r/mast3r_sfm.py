"""MASt3R-SfM on a frame set -> sparse global alignment -> COLMAP text + point cloud.
Runs on the Colab VM:  python mast3r_sfm.py <img_dir> <out_dir> [--n N] [--win W] [--loops K]
Pairs: sequential window W (+ log-spaced skips) + K nearest non-adjacent frames by DINOv2 CLS cosine (loop retrieval).
Method: Mast3r-SfM, Duisterhof et al. 2024 (arXiv 2409.19152); sparse_global_alignment from naver/mast3r.
Licence: naver/mast3r code CC BY-NC-SA 4.0, weights non-commercial (CHECKPOINTS_NOTICE). Private research use only.
"""
import sys, os, json, time, argparse, glob
sys.path.insert(0, '/content/mast3r'); sys.path.insert(0, '/content/mast3r/dust3r')
import numpy as np, torch
ap = argparse.ArgumentParser()
ap.add_argument('imgs'); ap.add_argument('out')
ap.add_argument('--n', type=int, default=0); ap.add_argument('--step', type=int, default=1)
ap.add_argument('--win', type=int, default=6); ap.add_argument('--loops', type=int, default=4)
ap.add_argument('--niter1', type=int, default=300); ap.add_argument('--niter2', type=int, default=200)
ap.add_argument('--subsample', type=int, default=8)
a = ap.parse_args()
os.makedirs(a.out, exist_ok=True)
log = open(os.path.join(a.out, 'run.log'), 'a')
def say(*m):
    s = ' '.join(str(x) for x in m); print(s, flush=True); log.write(s + '\n'); log.flush()
from mast3r.model import AsymmetricMASt3R
from mast3r.cloud_opt.sparse_ga import sparse_global_alignment
from dust3r.utils.image import load_images
files = sorted(glob.glob(os.path.join(a.imgs, '*.jpg')))[::a.step]
if a.n: files = files[:a.n]
say('frames', len(files), 'win', a.win, 'loops', a.loops)
t0 = time.time()
model = AsymmetricMASt3R.from_pretrained('naver/MASt3R_ViTLarge_BaseDecoder_512_catmlpdpt_metric').cuda().eval()
imgs = load_images(files, size=512, verbose=False)
say('loaded', round(time.time() - t0), 's')
N = len(files)
# pairs: sequential window + doubling skips
P = set()
for i in range(N):
    for d in list(range(1, a.win + 1)) + [8, 12, 16]:
        if i + d < N: P.add((i, i + d))
# loop retrieval with DINOv2 CLS
if a.loops:
    dm = torch.hub.load('facebookresearch/dinov2', 'dinov2_vits14').cuda().eval()
    from PIL import Image
    import torchvision.transforms as T
    tf = T.Compose([T.Resize((224, 154)), T.ToTensor(), T.Normalize([0.485, 0.456, 0.406], [0.229, 0.224, 0.225])])
    F = []
    with torch.no_grad():
        for f in files:
            F.append(torch.nn.functional.normalize(dm(tf(Image.open(f).convert('RGB'))[None].cuda()), dim=-1)[0].cpu())
    F = torch.stack(F); S = F @ F.T
    for i in range(N):
        s = S[i].clone()
        lo, hi = max(0, i - 20), min(N, i + 21); s[lo:hi] = -1
        for j in s.topk(a.loops).indices.tolist():
            if s[j] > 0.5: P.add((min(i, j), max(i, j)))
    del dm
pairs = [(imgs[i], imgs[j]) for i, j in sorted(P)] + [(imgs[j], imgs[i]) for i, j in sorted(P)]  # symmetrised: sparse_ga indexes both directions
say('pairs', len(pairs), 'of all', N * (N - 1) // 2)
cache = os.path.join(a.out, 'cache'); os.makedirs(cache, exist_ok=True)
t1 = time.time()
scene = sparse_global_alignment(files, pairs, cache, model, subsample=a.subsample,
                                lr1=0.07, niter1=a.niter1, lr2=0.014, niter2=a.niter2, device='cuda',
                                matching_conf_thr=5.0, shared_intrinsics=True)
say('GA done', round(time.time() - t1), 's, peak GPU GB', round(torch.cuda.max_memory_allocated() / 1e9, 1))
c2w = scene.get_im_poses().detach().cpu().numpy()
foc = scene.get_focals().detach().cpu().numpy().reshape(-1)
pp = scene.get_principal_points().detach().cpu().numpy()
ts = [im['true_shape'][0] for im in imgs]
# dense points
pts3d, depths, confs = scene.get_dense_pts3d(clean_depth=True)
cols = scene.imgs
allp, allc = [], []
for k in range(N):
    h, w = [int(x) for x in ts[k]]
    p = pts3d[k].detach().cpu().numpy().reshape(-1, 3)
    cf = confs[k].detach().cpu().numpy().reshape(-1)
    cl = np.asarray(cols[k]).reshape(-1, 3) if False else None
    allp.append(p)
np.savez_compressed(os.path.join(a.out, 'poses.npz'), c2w=c2w, focals=foc, pp=pp, shapes=np.array(ts), files=np.array([os.path.basename(f) for f in files]))
# COLMAP text export (PINHOLE per image, sizes are the 512 working size)
os.makedirs(os.path.join(a.out, 'colmap_txt'), exist_ok=True)
with open(os.path.join(a.out, 'colmap_txt', 'cameras.txt'), 'w') as f:
    for k in range(N):
        h, w = [int(x) for x in ts[k]]
        f.write(f'{k+1} PINHOLE {w} {h} {foc[k]} {foc[k]} {pp[k][0]} {pp[k][1]}\n')
from scipy.spatial.transform import Rotation as R
with open(os.path.join(a.out, 'colmap_txt', 'images.txt'), 'w') as f:
    for k in range(N):
        w2c = np.linalg.inv(c2w[k]); q = R.from_matrix(w2c[:3, :3]).as_quat()  # x y z w
        f.write(f'{k+1} {q[3]} {q[0]} {q[1]} {q[2]} {w2c[0,3]} {w2c[1,3]} {w2c[2,3]} {k+1} {os.path.basename(files[k])}\n\n')
sp = scene.get_sparse_pts3d()
spc = scene.get_pts3d_colors() if hasattr(scene, 'get_pts3d_colors') else None
with open(os.path.join(a.out, 'colmap_txt', 'points3D.txt'), 'w') as f:
    n = 0
    for k, p in enumerate(sp):
        p = p.detach().cpu().numpy()
        for x in p[::1]:
            n += 1; f.write(f'{n} {x[0]} {x[1]} {x[2]} 128 128 128 0\n')
say('sparse points', n)
# dense cloud ply with colours
import open3d as o3d
P3, C3 = [], []
for k in range(N):
    h, w = [int(x) for x in ts[k]]
    m = (confs[k].detach().cpu().numpy().reshape(-1) > 1.5)
    p = pts3d[k].detach().cpu().numpy().reshape(-1, 3)
    c = np.asarray(cols[k]).reshape(-1, 3)
    if len(c) != len(p):  # dense pts may be subsampled; skip colour mismatch
        c = np.full((len(p), 3), 0.5)
    P3.append(p[m]); C3.append(c[m])
P3 = np.concatenate(P3); C3 = np.concatenate(C3)
pc = o3d.geometry.PointCloud(); pc.points = o3d.utility.Vector3dVector(P3); pc.colors = o3d.utility.Vector3dVector(np.clip(C3, 0, 1))
pc = pc.voxel_down_sample(voxel_size=float(np.ptp(P3, axis=0).max()) / 600)
o3d.io.write_point_cloud(os.path.join(a.out, 'dense.ply'), pc)
bb = np.ptp(np.asarray(pc.points), axis=0)
say('dense points', len(pc.points), 'extent (scene units)', bb.round(2).tolist())
json.dump({'frames': N, 'pairs': len(pairs), 'dense_points': len(pc.points), 'extent': bb.tolist(), 'seconds': round(time.time() - t0)}, open(os.path.join(a.out, 'result.json'), 'w'))
say('MAST3R_DONE')
