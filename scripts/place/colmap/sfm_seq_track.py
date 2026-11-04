"""sfm_seq_track.py - the matchmove step: solve the camera through EVERY frame of a walk, in order (sequential matching).
Frames neighbour each other (30 fps), so each frame is matched with the next OVERLAP frames: the camera is tracked step by step
like a matchmover's track, not guessed from far-apart samples. COLMAP incremental mapping (BSD), pycolmap 4.2.1.
Usage: python sfm_seq_track.py [--overlap N]   (default 30)
Writes /content/place/sfm_results.json: per model registered images, points, mean reprojection error (px), and the camera path:
centres in frame order, the median step, the largest step and its ratio to the median (a jump = a broken track)."""
import argparse, json, re, sys, time, traceback
from pathlib import Path
from pathlib import Path


def time_order_warning(names):
    """Frames are matched in sorted-name order. Return a warning if that is not time order (names lack a numeric tail,
    or the numeric tails do not sort the same as the names: frame_9 vs frame_10), else None."""
    tails = [re.search(r'(\d+)\D*$', n.rsplit('.', 1)[0]) for n in names]
    if names and not all(tails):
        return 'frame names have no numeric tail; sorted-name order may not be time order'
    nums = [int(t.group(1)) for t in tails]
    if nums != sorted(nums) or len(set(nums)) != len(nums):
        return 'frame names do not sort in time order (numeric tails differ from name order or repeat); zero-pad them'
    return None


def main():
    ap = argparse.ArgumentParser(); ap.add_argument('--overlap', type=int, default=30, help='sequential matching window (default 30)')
    OVERLAP = ap.parse_args().overlap
    import numpy as np, pycolmap
    R = Path('/content/place'); IM = R / 'images'
    names = sorted(p.name for p in IM.glob('*.jpg')); print('images', len(names), flush=True)
    warn = time_order_warning(names)
    if warn: print('WARNING:', warn, file=sys.stderr, flush=True)
    CAMERA = 'OPENCV'   # run 1 (2026-11-02) SIMPLE_RADIAL gave 1.103 px; OPENCV fits k1 k2 p1 p2 of the phone lens
    ro = pycolmap.ImageReaderOptions(); ro.camera_model = CAMERA
    eo = pycolmap.FeatureExtractionOptions(); eo.max_image_size = 1920; eo.sift.peak_threshold = 0.002
    res = {'frames': len(names), 'overlap': OVERLAP, 'order_warning': warn, 'camera': CAMERA, 'models': []}
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


if __name__ == '__main__':
    main()
