"""Runs on the VM: Poisson mesh (vertex colours) from dense.ply, normals oriented towards the cameras. Method: Kazhdan & Hoppe 2013 (Screened Poisson), Open3D.
env: OUT=<dir with dense.ply + poses.npz>"""
import os, numpy as np, open3d as o3d, trimesh, json
d = '/content/' + os.environ['OUT']
pc = o3d.io.read_point_cloud(d + '/dense.ply'); z = np.load(d + '/poses.npz'); cam = z['c2w'][:, :3, 3]
P = np.asarray(pc.points)
pc, _ = pc.remove_statistical_outlier(20, 2.0)
pc.estimate_normals(o3d.geometry.KDTreeSearchParamHybrid(radius=float(np.ptp(P, 0).max()) / 150, max_nn=30))
pc.orient_normals_consistent_tangent_plane(15) if False else None
# orient each normal towards the nearest camera
from scipy.spatial import cKDTree
Q = np.asarray(pc.points); N = np.asarray(pc.normals); _, ix = cKDTree(cam).query(Q); v = cam[ix] - Q
flip = (N * v).sum(1) < 0; N[flip] *= -1; pc.normals = o3d.utility.Vector3dVector(N)
m, dens = o3d.geometry.TriangleMesh.create_from_point_cloud_poisson(pc, depth=9)
dens = np.asarray(dens); m.remove_vertices_by_mask(dens < np.quantile(dens, 0.08))
m.remove_degenerate_triangles(); m.remove_unreferenced_vertices()
o3d.io.write_triangle_mesh(d + '/mesh.ply', m)
tm = trimesh.Trimesh(np.asarray(m.vertices), np.asarray(m.triangles), vertex_colors=(np.asarray(m.vertex_colors) * 255).astype('uint8'), process=False)
tm.export(d + '/mesh.glb')
r = {'vertices': len(tm.vertices), 'faces': len(tm.faces), 'extent': np.ptp(tm.vertices, 0).tolist()}
json.dump(r, open(d + '/mesh.json', 'w')); print(r, 'MESH_DONE')
