import os, sys, time, json, traceback
import pycolmap
from pathlib import Path
R=Path('/content/place'); IM=R/'images'
if not IM.exists():
    IM.mkdir(); os.system(f"mv {R}/frame-*.jpg {IM}/")
print('images', len(list(IM.glob('*.jpg'))), flush=True)
def stats(rec_dict, tag):
    out=[]
    for k,r in sorted(rec_dict.items()):
        out.append((k, r.num_reg_images(), r.num_points3D()))
    print(tag,'models (id, registered, points):', out, flush=True)
    return out
ro=pycolmap.ImageReaderOptions(); ro.camera_model='SIMPLE_RADIAL'
eo=pycolmap.FeatureExtractionOptions(); eo.max_image_size=3840; eo.sift.peak_threshold=0.002
print('sift opts',eo.sift.max_num_features, eo.sift.peak_threshold, flush=True)
def run(tag, matcher):
    t=time.time(); d=R/tag; d.mkdir(exist_ok=True); db=d/'db.db'
    if db.exists(): db.unlink()
    pycolmap.extract_features(str(db), str(IM), camera_mode=pycolmap.CameraMode.SINGLE, reader_options=ro, extraction_options=eo)
    print(tag,'features',round(time.time()-t),'s',flush=True)
    matcher(str(db)); print(tag,'matched',round(time.time()-t),'s',flush=True)
    (d/'sparse').mkdir(exist_ok=True)
    recs=pycolmap.incremental_mapping(str(db), str(IM), str(d/'sparse'))
    res=stats(recs, tag); print(tag,'mapped',round(time.time()-t),'s',flush=True)
    return res
results={}
for tag, m in [
  ('seq', lambda db: pycolmap.match_sequential(db, pairing_options=pycolmap.SequentialPairingOptions(overlap=15, loop_detection=True, vocab_tree_path='/content/vt2.bin'))),
  ('exh', lambda db: pycolmap.match_exhaustive(db)),
]:
    try: results[tag]=run(tag,m)
    except Exception: traceback.print_exc(); results[tag]='ERR'
    sys.stdout.flush()
json.dump(results, open(R/'sfm_results.json','w'))
print('SFM_DONE', flush=True)
