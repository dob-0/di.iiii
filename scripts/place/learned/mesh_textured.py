#!/usr/bin/env python3
"""Run 4 (Colab): dense cloud -> Poisson mesh -> xatlas UVs -> texture baked from the frames -> OBJ/MTL/JPG + GLB + previews.

Input: model.npz from vggt_run.py or mast3r_run.py (names, c2w, K, depth, conf, ok, hw) and the frame tar (1080 wide).
Method: depth maps unprojected with the frame poses, confidence top 50 %, voxel-merged, statistical outlier removal;
Screened Poisson (Kazhdan & Hoppe 2013, Open3D) depth 10, low-density trim; quadric decimation; xatlas charts;
every face takes the best camera (facing, distance, depth-tested for occlusion) and each texel is sampled from it.
Orientation: up = opposite the mean camera 'down'; floor = 2nd percentile of height. Scale: UNIT-LESS from the net, then
set so the median camera height is 1.5 m (a GUESS, labelled); no door/scale fit yet.
"""
import argparse, io, json, os, subprocess, sys, tarfile, time
import numpy as np, cv2
from PIL import Image
ap = argparse.ArgumentParser()
ap.add_argument('--model', required=True); ap.add_argument('--tar', required=True); ap.add_argument('--out', required=True)
ap.add_argument('--faces', type=int, default=250000); ap.add_argument('--tex', type=int, default=6144)
ap.add_argument('--poisson-depth', type=int, default=10)
a = ap.parse_args(); os.makedirs(a.out, exist_ok=True)
def log(*s): print(time.strftime('%H:%M:%S'), *s, flush=True)
import open3d as o3d, trimesh, xatlas
from scipy.spatial import cKDTree

m = np.load(a.model); names = list(m['names']); c2w = m['c2w'].astype(np.float64); K = m['K'].astype(np.float64)
depth = m['depth']; conf = m['conf']; ok = m['ok']; H, W = [int(v) for v in m['hw']]; N = len(names)
tf = tarfile.open(a.tar); rd = lambda n: np.asarray(Image.open(io.BytesIO(tf.extractfile(n).read())).convert('RGB'))
# orientation
down = np.mean([c2w[i, :3, 1] for i in range(N) if ok[i]], 0); down /= np.linalg.norm(down)
yv = -down; xv = np.cross(yv, [0, 0, 1.0]); xv /= np.linalg.norm(xv); zv = np.cross(xv, yv)
Rw = np.stack([xv, yv, zv])                     # world -> y-up frame
cams = np.array([c2w[i, :3, 3] for i in range(N)]); camsU = cams @ Rw.T
oks = np.where(ok)[0]
# points
P, C, CI = [], [], []
gy, gx = np.mgrid[0:H:2, 0:W:2]
for n, i in enumerate(oks):
    d = depth[i].astype(np.float32)[gy, gx]; c = conf[i].astype(np.float32)[gy, gx]
    keep = (c >= np.percentile(c, 50)) & (d > 0) & np.isfinite(d)
    z = d[keep]; x = (gx[keep] - K[i, 0, 2]) * z / K[i, 0, 0]; y = (gy[keep] - K[i, 1, 2]) * z / K[i, 1, 1]
    pc = np.stack([x, y, z, np.ones_like(z)], 0); pw = (c2w[i] @ pc)[:3].T
    img = cv2.resize(rd(names[i]), (W, H), interpolation=cv2.INTER_AREA)
    P.append((pw @ Rw.T).astype(np.float32)); C.append(img[gy, gx][keep]); CI.append(np.full(len(z), i, np.int16))
    if n % 200 == 0: log('unproject', n, '/', len(oks))
P = np.concatenate(P); C = np.concatenate(C); CI = np.concatenate(CI)
floor = np.percentile(P[:, 1], 2); P[:, 1] -= floor; camsU[:, 1] -= floor
sc = 1.5 / max(1e-6, np.median(camsU[oks, 1])); P *= sc; camsU *= sc
log('raw points', len(P), 'scale to guess-metres', round(sc, 4))
lo, hi = np.percentile(P, 2, 0), np.percentile(P, 98, 0)
diag = float(np.linalg.norm(hi - lo)); vox = diag / 900
pc = o3d.geometry.PointCloud(); pc.points = o3d.utility.Vector3dVector(P.astype(np.float64)); pc.colors = o3d.utility.Vector3dVector(C / 255.0)
pc = pc.voxel_down_sample(vox); pc, _ = pc.remove_statistical_outlier(20, 2.0)
npts = len(pc.points); log('cloud points after voxel', npts)
o3d.io.write_point_cloud(os.path.join(a.out, 'cloud.ply'), pc)
pc.estimate_normals(o3d.geometry.KDTreeSearchParamKNN(30))
pts = np.asarray(pc.points); nrm = np.asarray(pc.normals)
near = cKDTree(camsU[oks]).query(pts)[1]; flip = np.einsum('ij,ij->i', nrm, camsU[oks][near] - pts) < 0
nrm[flip] *= -1; pc.normals = o3d.utility.Vector3dVector(nrm)
mesh, dens = o3d.geometry.TriangleMesh.create_from_point_cloud_poisson(pc, depth=a.poisson_depth)
dens = np.asarray(dens); mesh.remove_vertices_by_mask(dens < np.quantile(dens, 0.07))
cl, nt, _ = mesh.cluster_connected_triangles(); cl = np.asarray(cl); nt = np.asarray(nt)
mesh.remove_triangles_by_mask(nt[cl] < 0.01 * len(cl)); mesh.remove_unreferenced_vertices()
raw_faces = len(mesh.triangles)
if raw_faces > a.faces: mesh = mesh.simplify_quadric_decimation(a.faces)
mesh.remove_degenerate_triangles(); mesh.remove_unreferenced_vertices()
V = np.asarray(mesh.vertices, np.float32); F = np.asarray(mesh.triangles, np.uint32)
log('mesh verts', len(V), 'faces', len(F), '(poisson faces', raw_faces, ')')
# UVs
try:
    atlas = xatlas.Atlas(); atlas.add_mesh(V, F)
    po = xatlas.PackOptions(); po.resolution = a.tex; po.padding = 4; po.bruteForce = False
    atlas.generate(pack_options=po)
    vmap, idx, uv = atlas.get_mesh(0); aw, ah = atlas.width, atlas.height
except Exception as e:
    log('xatlas Atlas API failed, parametrize fallback', repr(e)[:120])
    vmap, idx, uv = xatlas.parametrize(V, F); aw = ah = a.tex
log('xatlas', aw, ah)
TW, TH = int(aw), int(ah)
V2 = V[vmap]; F2 = idx.astype(np.int64)
# face -> best camera
cent = V2[F2].mean(1); fn = np.cross(V2[F2[:, 1]] - V2[F2[:, 0]], V2[F2[:, 2]] - V2[F2[:, 0]]); fn /= (np.linalg.norm(fn, axis=1, keepdims=True) + 1e-12)
w2cU = []
for i in range(N):
    T = np.eye(4); T[:3, :3] = Rw @ c2w[i, :3, :3]; T[:3, 3] = (Rw @ c2w[i, :3, 3]); T[1, 3] -= floor; T[:3, 3] *= sc; T[:3, :3] = T[:3, :3]  # cam->world(UP, metres) (rotation unscaled)
    w2cU.append(np.linalg.inv(T))
best = np.full(len(F2), -1e9); bcam = -np.ones(len(F2), np.int32)
for i in oks:
    Tw = w2cU[i]; pc3 = cent @ Tw[:3, :3].T + Tw[:3, 3]; z = pc3[:, 2]
    u = K[i, 0, 0] * pc3[:, 0] / np.maximum(z, 1e-6) + K[i, 0, 2]; v = K[i, 1, 1] * pc3[:, 1] / np.maximum(z, 1e-6) + K[i, 1, 2]
    inside = (z > 0.1) & (u > 6) & (u < W - 7) & (v > 6) & (v < H - 7)
    ci = camsU[i]; vec = ci - cent; dist = np.linalg.norm(vec, axis=1) + 1e-9; cos = np.einsum('ij,ij->i', fn, vec) / dist
    cand = inside & (cos > 0.25)
    if not cand.any(): continue
    dm = depth[i].astype(np.float32) * sc
    dd = dm[np.clip(v.astype(int), 0, H - 1), np.clip(u.astype(int), 0, W - 1)]
    vis = np.abs(dd - z) < 0.12 * z
    sc_i = cos - 0.03 * dist / diag * 10
    sel = cand & vis & (sc_i > best); best[sel] = sc_i[sel]; bcam[sel] = i
log('faces with a camera', int((bcam >= 0).sum()), '/', len(F2))
# rasterise UV
uvp = uv.copy(); uvp[:, 0] *= TW; uvp[:, 1] *= TH
idm = np.zeros((TH, TW), np.int32)
for f in range(len(F2)):
    cv2.fillConvexPoly(idm, np.round(uvp[F2[f]]).astype(np.int32), f + 1)
ys, xs = np.nonzero(idm); fid = idm[ys, xs] - 1
tri = uvp[F2[fid]]; px = np.stack([xs + 0.5, ys + 0.5], 1)
e0 = tri[:, 1] - tri[:, 0]; e1 = tri[:, 2] - tri[:, 0]; e2 = px - tri[:, 0]
den = e0[:, 0] * e1[:, 1] - e1[:, 0] * e0[:, 1]; den[np.abs(den) < 1e-9] = 1e-9
b1 = (e2[:, 0] * e1[:, 1] - e1[:, 0] * e2[:, 1]) / den; b2 = (e0[:, 0] * e2[:, 1] - e2[:, 0] * e0[:, 1]) / den
b1 = np.clip(b1, 0, 1); b2 = np.clip(b2, 0, 1 - b1); b0 = 1 - b1 - b2
X = V2[F2[fid, 0]] * b0[:, None] + V2[F2[fid, 1]] * b1[:, None] + V2[F2[fid, 2]] * b2[:, None]
tex = np.zeros((TH, TW, 3), np.uint8); filled = np.zeros((TH, TW), bool)
tc = bcam[fid]
for i in np.unique(tc[tc >= 0]):
    s = tc == i; Tw = w2cU[i]; p3 = X[s] @ Tw[:3, :3].T + Tw[:3, 3]
    img = rd(names[i]); sx = img.shape[1] / W; sy = img.shape[0] / H
    u = (K[i, 0, 0] * p3[:, 0] / p3[:, 2] + K[i, 0, 2]) * sx; v = (K[i, 1, 1] * p3[:, 1] / p3[:, 2] + K[i, 1, 2]) * sy
    col = cv2.remap(img, u.astype(np.float32)[:, None], v.astype(np.float32)[:, None], cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE)[:, 0]
    tex[ys[s], xs[s]] = col; filled[ys[s], xs[s]] = True
log('texels filled', int(filled.sum()), 'of', len(ys))
mean_col = tex[filled].mean(0).astype(np.uint8) if filled.any() else np.array([128] * 3, np.uint8)
tex[~filled & (idm > 0)] = mean_col
cov = filled.copy()
for _ in range(6):                                    # padding against seams
    dil = cv2.dilate(tex, np.ones((3, 3), np.uint8)); mk = cv2.dilate(cov.astype(np.uint8), np.ones((3, 3), np.uint8)).astype(bool)
    tex[mk & ~cov] = dil[mk & ~cov]; cov = mk
Image.fromarray(tex).save(os.path.join(a.out, 'texture.jpg'), quality=90)
# OBJ/MTL
with open(os.path.join(a.out, 'hall.mtl'), 'w') as f: f.write('newmtl hall\nKa 1 1 1\nKd 1 1 1\nmap_Kd texture.jpg\n')
vt = uv.copy(); vt[:, 1] = 1 - vt[:, 1]
with open(os.path.join(a.out, 'hall.obj'), 'w') as f:
    f.write('mtllib hall.mtl\nusemtl hall\n')
    np.savetxt(f, V2, fmt='v %.5f %.5f %.5f'); np.savetxt(f, vt, fmt='vt %.6f %.6f')
    np.savetxt(f, np.concatenate([F2[:, [0]] + 1, F2[:, [0]] + 1, F2[:, [1]] + 1, F2[:, [1]] + 1, F2[:, [2]] + 1, F2[:, [2]] + 1], 1), fmt='f %d/%d %d/%d %d/%d')
tm = trimesh.Trimesh(V2, F2, process=False)
tm.visual = trimesh.visual.TextureVisuals(uv=uv, material=trimesh.visual.material.PBRMaterial(baseColorTexture=Image.fromarray(tex), metallicFactor=0.0, roughnessFactor=1.0))
tm.export(os.path.join(a.out, 'hall.glb'))
# previews (painter's algorithm, face colour = texture at face centre)
fc = tex[np.clip((uv[F2].mean(1)[:, 1] * TH).astype(int), 0, TH - 1), np.clip((uv[F2].mean(1)[:, 0] * TW).astype(int), 0, TW - 1)]
def render(name, Rcw, pos, Kc, w, h):
    pcam = (V2 - pos) @ Rcw; z = pcam[:, 2]
    uvv = np.stack([Kc[0, 0] * pcam[:, 0] / np.maximum(z, 1e-3) + Kc[0, 2], Kc[1, 1] * pcam[:, 1] / np.maximum(z, 1e-3) + Kc[1, 2]], 1)
    zf = z[F2].mean(1); order = np.argsort(-zf); img = np.full((h, w, 3), 24, np.uint8)
    ok_f = (z[F2] > 0.05).all(1)
    for f in order:
        if not ok_f[f]: continue
        p = uvv[F2[f]]
        if p[:, 0].max() < 0 or p[:, 0].min() > w or p[:, 1].max() < 0 or p[:, 1].min() > h: continue
        cv2.fillConvexPoly(img, np.round(p).astype(np.int32), tuple(int(c) for c in fc[f][::-1]))
    cv2.imwrite(os.path.join(a.out, name), img); log('preview', name)
def look(pos, target, up=np.array([0, 1.0, 0])):  # camera looks along +z, y down in image -> use OpenCV frame
    zc = target - pos; zc /= np.linalg.norm(zc); xc = np.cross(zc, up); xc /= np.linalg.norm(xc); yc = np.cross(zc, xc)
    return np.stack([xc, yc, zc], 1)
ctr = (np.percentile(V2, 2, 0) + np.percentile(V2, 98, 0)) / 2; ext = np.percentile(V2, 98, 0) - np.percentile(V2, 2, 0)
w, h = 1280, 960; Kc = np.array([[1000, 0, w / 2], [0, 1000, h / 2], [0, 0, 1.0]])
render('preview-outside-top.png', look(ctr + np.array([0, ext.max() * 1.25, 1e-3]), ctr, np.array([0, 0, -1.0])), ctr + np.array([0, ext.max() * 1.25, 1e-3]), Kc, w, h)
for tag, q in (('inside-a', 0.25), ('inside-b', 0.7)):
    i = oks[int(q * (len(oks) - 1))]; R = np.eye(3); Tc = np.linalg.inv(w2cU[i])
    Kp = K[i].copy(); f = 720 / W; Kp[:2] *= f
    render(f'preview-{tag}.png', Tc[:3, :3], Tc[:3, 3], Kp, 720, 1280)
hx = V2[:, [0, 2]] - V2[:, [0, 2]].mean(0); ev, evec = np.linalg.eigh(np.cov(hx.T)); dirh = evec[:, -1]
d3 = np.array([dirh[0], 0, dirh[1]]); pos = np.array([ctr[0], 1.5, ctr[2]]) - d3 * ext.max() * 0.15
render('preview-wall.png', look(pos, pos + d3), pos, Kc, w, h)
st = dict(tool=os.path.basename(a.model), frames=N, frames_ok=int(ok.sum()), cloud_points_voxel=npts, raw_points=len(P), mesh_verts_poisson=int(len(V)),
          mesh_faces=int(len(F2)), mesh_verts_uv=int(len(V2)), extent_2_98_xyz_m_guess=(np.percentile(V2, 98, 0) - np.percentile(V2, 2, 0)).round(2).tolist(),
          texture=[TW, TH], faces_with_camera=int((bcam >= 0).sum()), cameras_used=int(len(np.unique(bcam[bcam >= 0]))), scale_note='median camera height set to 1.5 m (GUESS)')
json.dump(st, open(os.path.join(a.out, 'mesh_stats.json'), 'w'), indent=1); log('MESHDONE', json.dumps(st))
open(os.path.join(a.out, 'MESHDONE'), 'w').write('done\n')
