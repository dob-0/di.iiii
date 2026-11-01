"""Previews from a dense.ply + poses.npz: top, side, and two camera-view splats (point-splat render, no GPU).
usage: python3 -I preview_cloud.py <dir> <out_prefix>"""
import sys, numpy as np, matplotlib; matplotlib.use('Agg'); import matplotlib.pyplot as plt
d, pre = sys.argv[1], sys.argv[2]
def read_ply(path):  # Open3D binary_little_endian: double xyz + uchar rgb
    b = open(path, 'rb').read(); h = b.index(b'end_header\n') + 11; n = int(b.split(b'element vertex ')[1].split(b'\n')[0])
    a = np.frombuffer(b[h:], dtype=[('p', '<f8', 3), ('c', 'u1', 3)], count=n); return a['p'].copy(), a['c'] / 255.0
P, C = read_ply(f'{d}/dense.ply')
z = np.load(f'{d}/poses.npz'); c2w = z['c2w']; cam = c2w[:, :3, 3]
print('points', len(P), 'cams', len(cam), 'colour mean', C.mean(0).round(2), 'bbox', np.ptp(P, 0).round(1))
lo, hi = np.percentile(P, 1, 0), np.percentile(P, 99, 0)
m = np.all((P > lo) & (P < hi), 1); P, C = P[m], C[m]
def shot(ax1, ax2, name, up=None):
    fig = plt.figure(figsize=(12.8, 9.6), dpi=100); ax = fig.add_axes([0, 0, 1, 1]); ax.axis('off'); ax.set_facecolor('black')
    ax.scatter(P[:, ax1], P[:, ax2], c=C, s=0.3, marker='.', linewidths=0)
    ax.plot(cam[:, ax1], cam[:, ax2], 'r-', lw=1); ax.axis('equal'); fig.savefig(name, facecolor='black'); plt.close(fig)
shot(0, 2, pre + '_top.png'); shot(0, 1, pre + '_side.png')
def view(k, name):
    w2c = np.linalg.inv(c2w[k]); X = (w2c[:3, :3] @ P.T).T + w2c[:3, 3]; f = float(z['focals'][k]); h, w = z['shapes'][k]
    ok = X[:, 2] > 0.3; X, c = X[ok], C[ok]; u = f * X[:, 0] / X[:, 2] + w / 2; v = f * X[:, 1] / X[:, 2] + h / 2
    ok = (u >= 0) & (u < w) & (v >= 0) & (v < h); u, v, zz, c = u[ok], v[ok], X[ok, 2], c[ok]
    o = np.argsort(-zz); fig = plt.figure(figsize=(w / 100 * 1.6, h / 100 * 1.6), dpi=100); ax = fig.add_axes([0, 0, 1, 1]); ax.axis('off')
    ax.scatter(u[o], v[o], c=c[o], s=2, marker='s', linewidths=0); ax.set_xlim(0, w); ax.set_ylim(h, 0); fig.savefig(name, facecolor='black'); plt.close(fig)
for k in sorted(set([len(cam) // 4, 3 * len(cam) // 4])): view(k, f'{pre}_cam{k}.png')
