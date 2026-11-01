#!/usr/bin/env python3
"""Run 4, tool 2 (Colab A100): MASt3R-SfM (sparse global alignment) on keyframes of the walks.

Method: MASt3R (Leroy, Cabon, Revaud, ECCV 2024, arXiv 2406.09756) + MASt3R-SfM (arXiv 2409.19152), naver/mast3r,
sparse_global_alignment. Code AND weights CC BY-NC-SA 4.0 (non-commercial) -> internal twin only.
Pairs: 'logwin' graph along each walk plus an all-pairs graph on every 12th keyframe (links the two walks / loops).
Output: <out>/model.npz in the same format as vggt_run.py (depth from the dense points in camera z).
Usage: python mast3r_run.py --tar dense3.tar --out DIR --keystride 3 --logwin 4
"""
import argparse, io, json, os, subprocess, sys, tarfile, time, itertools
import numpy as np
ap = argparse.ArgumentParser()
ap.add_argument('--tar', required=True); ap.add_argument('--out', required=True)
ap.add_argument('--keystride', type=int, default=3); ap.add_argument('--logwin', type=int, default=4)
ap.add_argument('--loopstride', type=int, default=12); ap.add_argument('--repo', default='/content/mast3r')
a = ap.parse_args(); os.makedirs(a.out, exist_ok=True)
LOG = open(os.path.join(a.out, 'run.log'), 'a')
def log(*s):
    m = time.strftime('%H:%M:%S ') + ' '.join(str(x) for x in s); print(m, flush=True); LOG.write(m + '\n'); LOG.flush()
if not os.path.isdir(a.repo):
    subprocess.check_call(['git', 'clone', '--recursive', 'https://github.com/naver/mast3r', a.repo])
    subprocess.check_call([sys.executable, '-m', 'pip', 'install', '-q', '-r', a.repo + '/requirements.txt', '-r', a.repo + '/dust3r/requirements.txt'])
sys.path.insert(0, a.repo); sys.path.insert(0, a.repo + '/dust3r')
import torch
from PIL import Image
from mast3r.model import AsymmetricMASt3R
from mast3r.cloud_opt.sparse_ga import sparse_global_alignment
from dust3r.utils.image import load_images
from dust3r.image_pairs import make_pairs
dev = 'cuda'
model = AsymmetricMASt3R.from_pretrained('naver/MASt3R_ViTLarge_BaseDecoder_512_catmlpdpt_metric').to(dev)
log('model loaded', torch.cuda.get_device_name(0))
tf = tarfile.open(a.tar); allnames = sorted(m.name for m in tf.getmembers() if m.name.endswith('.jpg'))
keys = allnames[::a.keystride]; os.makedirs('/content/m3r_in', exist_ok=True); paths = []
for n in keys:
    p = '/content/m3r_in/' + n; open(p, 'wb').write(tf.extractfile(n).read()); paths.append(p)
imgs = load_images(paths, size=512, verbose=False); log('keyframes', len(imgs), 'shape', imgs[0]['true_shape'])
clip = [n.split('__')[0] for n in keys]; pairs = []
for cl in sorted(set(clip)):
    ids = [i for i in range(len(keys)) if clip[i] == cl]
    sub = [imgs[i] for i in ids]
    pairs += make_pairs(sub, scene_graph=f'logwin-{a.logwin}', prefilter=None, symmetrize=True)
loop = list(range(0, len(keys), a.loopstride))
pairs += [(imgs[i], imgs[j]) for i, j in itertools.permutations(loop, 2)]
log('pairs', len(pairs))
t0 = time.time()
scene = sparse_global_alignment(paths, pairs, '/content/m3r_cache', model, lr1=0.07, niter1=300, lr2=0.01, niter2=200, device=dev,
                                opt_depth=True, shared_intrinsics=False, matching_conf_thr=5.0)
log('sparse GA done', round(time.time() - t0), 's')
poses = scene.get_im_poses().detach().cpu().numpy(); Ks = scene.intrinsics.detach().cpu().numpy()
pts3d, depthmaps, confs = scene.get_dense_pts3d(clean_depth=True)
n = len(keys); hh, ww = [int(v) for v in imgs[0]['true_shape'][0]]
depth = np.zeros((n, hh, ww), np.float16); conf = np.zeros((n, hh, ww), np.float16)
for i in range(n):
    d = depthmaps[i].detach().cpu().numpy().reshape(-1); c = confs[i].detach().cpu().numpy().reshape(-1)
    if d.size == hh * ww: depth[i] = d.reshape(hh, ww); conf[i] = c.reshape(hh, ww)
    else:
        P = pts3d[i].detach().cpu().numpy().reshape(-1, 3)
        if P.shape[0] == hh * ww:
            w2c = np.linalg.inv(poses[i]); z = (P @ w2c[:3, :3].T + w2c[:3, 3])[:, 2]; depth[i] = z.reshape(hh, ww); conf[i] = 1
ok = (depth.reshape(n, -1).max(1) > 0)
np.savez_compressed(os.path.join(a.out, 'model.npz'), names=np.array(keys), c2w=poses, K=Ks, depth=depth, conf=conf, ok=ok, hw=np.array([hh, ww]), win=np.zeros(n), inl=np.ones(n))
cen = poses[ok][:, :3, 3]; lo, hi = np.percentile(cen, 2, 0), np.percentile(cen, 98, 0)
summ = dict(tool='MASt3R-SfM sparse_ga', weights_licence='CC BY-NC-SA 4.0 (non-commercial)', all_frames=len(allnames), keyframes=n, with_pose_and_depth=int(ok.sum()),
            share_of_keyframes=round(float(ok.mean()), 3), pairs=len(pairs), seconds_ga=round(time.time() - t0), camera_path_extent_2_98=(hi - lo).round(2).tolist())
json.dump(summ, open(os.path.join(a.out, 'summary.json'), 'w'), indent=1); log('DONE', json.dumps(summ)); open(os.path.join(a.out, 'DONE'), 'w').write('done\n')
