"""sfm_seq_track.py - the matchmove step: solve the camera through EVERY frame of a walk, in order (sequential matching).
Frames neighbour each other (30 fps), so each frame is matched with the next OVERLAP frames: the camera is tracked step by step
like a matchmover's track, not guessed from far-apart samples. COLMAP incremental mapping (BSD), pycolmap 4.2.1.
Writes /content/place/sfm_results.json: per model registered images, points, mean reprojection error (px), and the camera path:
centres in frame order, the median step, the largest step and its ratio to the median (a jump = a broken track)."""
import json, time, traceback, numpy as np, pycolmap
from pathlib import Path
R = Path('/content/place'); IM = R / 'images'; OVERLAP = 30
names = sorted(p.name for p in IM.glob('*.jpg')); print('images', len(names), flush=True)
CAMERA = 'OPENCV'   # run 1 (2026-11-02) SIMPLE_RADIAL gave 1.103 px; OPENCV fits k1 k2 p1 p2 of the phone lens
ro = pycolmap.ImageReaderOptions(); ro.camera_model = CAMERA
eo = pycolmap.FeatureExtractionOptions(); eo.max_image_size = 1920; eo.sift.peak_threshold = 0.002
res = {'frames': len(names), 'overlap': OVERLAP, 'camera': CAMERA, 'models': []}
try:
    t = time.time(); d = R / 'seq'; d.mkdir(exist_ok=True); db = d / 'db.db'
    pycolmap.extract_features(str(db), str(IM), camera_mode=pycolmap.CameraMode.SINGLE, reader_options=ro, extraction_options=eo)
    pycolmap.match_sequential(str(db), pairing_options=pycolmap.SequentialPairingOptions(overlap=OVERLAP, loop_detection=False))
    (d / 'sparse').mkdir(exist_ok=True)
    recs = pycolmap.incremental_mapping(str(db), str(IM), str(d / 'sparse'))
    for k, r in sorted(recs.items(), key=lambda kv: -kv[1].num_reg_images()):
        cams = sorted((im.name, im.projection_center().tolist()) for im in r.images.values())
        c = np.array([x[1] for x in cams]); st = np.linalg.norm(np.diff(c, axis=0), axis=1) if len(c) > 1 else np.zeros(1)
        med = float(np.median(st)) or 1e-9
        res['models'].append({'id': int(k), 'registered': r.num_reg_images(), 'points': r.num_points3D(),
            'mean_reproj_px': round(float(r.compute_mean_reprojection_error()), 3),
            'step_median': round(med, 5), 'step_max': round(float(st.max()), 5), 'max_over_median': round(float(st.max() / med), 1),
            'first': cams[0][0], 'last': cams[-1][0], 'centres': [[n] + [round(v, 4) for v in p] for n, p in cams]})
        print('model', k, res['models'][-1]['registered'], res['models'][-1]['mean_reproj_px'], res['models'][-1]['max_over_median'], flush=True)
    res['seconds'] = round(time.time() - t)
except Exception:
    res['error'] = traceback.format_exc()[-1500:]
json.dump(res, open(R / 'sfm_results.json', 'w'))
print('SFM_DONE', flush=True)
