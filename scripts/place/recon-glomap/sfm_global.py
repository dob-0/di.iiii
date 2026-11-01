"""Lane 2: COLMAP global mapper (pycolmap.global_mapping, ex-GLOMAP, BSD-3-Clause).
usage: sfm_global.py IMAGE_DIR TAG MATCHER(seq|exh) [OVERLAP]
Features: SIFT (same settings as colmap/sfm_dense_seq.py). Only the solver differs."""
import sys, time, json
import pycolmap
from pathlib import Path
IM=Path(sys.argv[1]); tag=sys.argv[2]; matcher=sys.argv[3]; overlap=int(sys.argv[4]) if len(sys.argv)>4 else 20
d=Path('/content/place')/tag; d.mkdir(parents=True, exist_ok=True); db=d/'db.db'
if db.exists(): db.unlink()
n=len(list(IM.rglob('*.jpg'))); print('images',n,flush=True)
ro=pycolmap.ImageReaderOptions(); ro.camera_model='SIMPLE_RADIAL'
eo=pycolmap.FeatureExtractionOptions(); eo.max_image_size=3840; eo.sift.peak_threshold=0.002
t=time.time()
pycolmap.extract_features(str(db), str(IM), camera_mode=pycolmap.CameraMode.SINGLE, reader_options=ro, extraction_options=eo)
print(tag,'features',round(time.time()-t),'s',flush=True)
if matcher=='exh': pycolmap.match_exhaustive(str(db))
else: pycolmap.match_sequential(str(db), pairing_options=pycolmap.SequentialPairingOptions(overlap=overlap, loop_detection=False))
print(tag,'matched',round(time.time()-t),'s',flush=True)
(d/'sparse').mkdir(exist_ok=True)
recs=pycolmap.global_mapping(str(db), str(IM), str(d/'sparse'))
out=[(k, r.num_reg_images(), r.num_points3D()) for k,r in sorted(recs.items())]
print(tag,'total',n,'models (id, registered, points):', out, 'time',round(time.time()-t),flush=True)
json.dump({'total':n,'models':out}, open(d/'result.json','w'))
print('SFM_GLOBAL_DONE',flush=True)
