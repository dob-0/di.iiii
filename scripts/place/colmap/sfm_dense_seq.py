import os, sys, time, json, traceback
import pycolmap
from pathlib import Path
IM=Path(sys.argv[1]); tag=sys.argv[2]; overlap=int(sys.argv[3])
R=Path('/content/place'); d=R/tag; d.mkdir(exist_ok=True); db=d/'db.db'
if db.exists(): db.unlink()
print('images', len(list(IM.glob('*.jpg'))), flush=True)
ro=pycolmap.ImageReaderOptions(); ro.camera_model='SIMPLE_RADIAL'
eo=pycolmap.FeatureExtractionOptions(); eo.max_image_size=3840; eo.sift.peak_threshold=0.002
t=time.time()
pycolmap.extract_features(str(db), str(IM), camera_mode=pycolmap.CameraMode.SINGLE, reader_options=ro, extraction_options=eo)
print(tag,'features',round(time.time()-t),'s',flush=True)
pycolmap.match_sequential(str(db), pairing_options=pycolmap.SequentialPairingOptions(overlap=overlap, loop_detection=True, vocab_tree_path='/content/vt2.bin'))
print(tag,'matched',round(time.time()-t),'s',flush=True)
(d/'sparse').mkdir(exist_ok=True)
recs=pycolmap.incremental_mapping(str(db), str(IM), str(d/'sparse'))
out=[(k, r.num_reg_images(), r.num_points3D()) for k,r in sorted(recs.items())]
print(tag,'models (id, registered, points):', out, flush=True)
json.dump(out, open(d/'result.json','w'))
print('SFM2_DONE', flush=True)
