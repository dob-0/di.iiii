"""Dense + mesh on the box from the best COLMAP model.
usage: python dense_mesh.py <run_dir e.g. /content/place/dseq> <images_dir> [model_id]
Needs pycolmap-cuda12 (patch match needs CUDA build), numpy, scipy, matplotlib. Faces stay on the box.
Writes <run_dir>/dense/{fused.ply,mesh.ply,counts.json,preview_*.png}. Vertex colours from nearest fused point (no UV texture)."""
import sys, json, time
from pathlib import Path
import numpy as np, pycolmap
run=Path(sys.argv[1]); IM=sys.argv[2]; mid=sys.argv[3] if len(sys.argv)>3 else None
sp=run/'sparse'
if mid is None:
    best=max(sp.iterdir(), key=lambda p: pycolmap.Reconstruction(str(p)).num_reg_images()); mid=best.name
rec=pycolmap.Reconstruction(str(sp/mid)); D=run/'dense'; D.mkdir(exist_ok=True)
counts={'model':mid,'cameras_registered':rec.num_reg_images(),'points3D':rec.num_points3D()}
t=time.time()
pycolmap.undistort_images(str(D), str(sp/mid), IM)
pycolmap.patch_match_stereo(str(D)); print('patch_match', round(time.time()-t), flush=True)
pycolmap.stereo_fusion(str(D/'fused.ply'), str(D))
pycolmap.poisson_meshing(str(D/'fused.ply'), str(D/'mesh.ply'))
import plyfile  # noqa  (pip install plyfile if missing)
from scipy.spatial import cKDTree
fp=plyfile.PlyData.read(str(D/'fused.ply'))['vertex']; mp=plyfile.PlyData.read(str(D/'mesh.ply'))
fv=np.c_[fp['x'],fp['y'],fp['z']]; fc=np.c_[fp['red'],fp['green'],fp['blue']]/255.0
mv=np.c_[mp['vertex']['x'],mp['vertex']['y'],mp['vertex']['z']]; faces=np.stack(mp['face']['vertex_indices'])
col=fc[cKDTree(fv).query(mv)[1]]
lo,hi=np.percentile(fv,[1,99],axis=0)
counts.update(fused_points=len(fv), verts=len(mv), faces=len(faces), extent_p1_p99=(hi-lo).tolist())
json.dump(counts, open(D/'counts.json','w')); print(counts, flush=True)
import matplotlib; matplotlib.use('Agg'); import matplotlib.pyplot as plt
c=np.median(fv,axis=0); sel=np.all((fv>lo-1)&(fv<hi+1),axis=1)
# gravity guess: smallest-variance axis of the camera centres is up
cc=np.array([i.projection_center() for i in rec.images.values() if i.has_pose]) if hasattr(rec,'images') else fv[::50]
up=int(np.argmin(cc.var(axis=0))); ax=[a for a in range(3) if a!=up]
s=np.random.default_rng(0).choice(np.where(sel)[0], min(400000,sel.sum()), replace=False)
fig,a=plt.subplots(figsize=(10,10)); a.scatter(fv[s,ax[0]],fv[s,ax[1]],c=fc[s],s=0.3); a.set_aspect('equal'); a.set_title('top-down (fused points)'); fig.savefig(D/'preview_top.png',dpi=110)
fig,a=plt.subplots(figsize=(10,6)); a.scatter(fv[s,ax[0]],fv[s,up],c=fc[s],s=0.3); a.set_aspect('equal'); a.set_title('side section'); fig.savefig(D/'preview_side.png',dpi=110)
# inside view: perspective splat from the median camera centre looking along +ax0 (simple pinhole)
o=np.median(cc,axis=0); d=fv[s]-o; fwd=np.zeros(3); fwd[ax[0]]=1; r=np.zeros(3); r[ax[1]]=1; u=np.zeros(3); u[up]=1
z=d@fwd; m=z>0.3; x=(d[m]@r)/z[m]; y=(d[m]@u)/z[m]; o_=np.argsort(-z[m])
fig,a=plt.subplots(figsize=(10,6)); a.scatter(x[o_],y[o_],c=fc[s][m][o_],s=1.0); a.set_xlim(-1.5,1.5); a.set_ylim(-1,1); a.set_title('inside view'); fig.savefig(D/'preview_inside.png',dpi=110)
print('DENSE_DONE', round(time.time()-t), flush=True)
