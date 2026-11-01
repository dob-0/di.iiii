#!/usr/bin/env python3
"""stills_crop.py - cut real, sharp, people-free stills (film strips, prints, posters) out of video frames.

  stills_crop.py <spec.json> <frames_dir> <out_dir> [--min-sharp 60]

spec.json = [{"id": "strip_03", "size": [w, h],
              "candidates": [{"frame": "155205_t27850.jpg", "quad": [[x,y] x4, clockwise from top-left]},
                             {"frame": "...", "pose": "<pose json>", "corners3d": [[x,y,z] x4]}  ...]}]
A candidate gives the still's four corners in the frame, either marked in pixels or projected from the still's 3D corners
through the frame's solved pose (T_wc, f, w, h; OpenCV camera: x right, y down, z forward).

For each still: every candidate is rectified (homography, Hartley & Zisserman ch. 4) to the target size; sharpness is
the variance of the Laplacian (Pech-Pacheco et al. 2000) on the rectified crop; a crop is REFUSED if a person detector fires on it: torchvision
Faster R-CNN ResNet50-FPN v2, COCO 'person' >= 0.5 (Ren et al. 2015; the same model as dense/ingest.py), or without torch
OpenCV HOG + linear SVM (Dalal & Triggs 2005) and a Haar face cascade (Viola & Jones 2001), or if it falls
below --min-sharp. The sharpest accepted crop is written as <out_dir>/<id>.png, and <out_dir>/stills_provenance.json
keeps every candidate's frame, corners, sharpness and refusal reason.
Limit: the detectors miss small, turned or partial people; a refused still is never blurred and used anyway - it is
reported, and the room keeps the frame of the print with blank paper until a clean candidate is found.
"""
import json, sys, argparse
from pathlib import Path
import cv2, numpy as np


def project(pose, pts):
    T = np.array(pose['T_wc'], float); Tcw = np.linalg.inv(T)
    P = (Tcw[:3, :3] @ np.array(pts, float).T + Tcw[:3, 3:4])
    if (P[2] <= 0.05).any(): return None   # behind the camera
    f, w, h = pose['f'], pose['w'], pose['h']
    return np.stack([f * P[0] / P[2] + w / 2, f * P[1] / P[2] + h / 2], 1)


DET = None   # 'frcnn' (same person detector as dense/ingest.py) when torch is present, else OpenCV HOG + Haar


def load_detector(kind):
    global DET, _m, _hog, _face
    if kind in ('auto', 'frcnn'):
        try:
            import torch, torchvision
            _m = torchvision.models.detection.fasterrcnn_resnet50_fpn_v2(weights='DEFAULT').eval()
            if torch.cuda.is_available(): _m = _m.cuda()
            DET = 'frcnn'; return
        except Exception as e:
            if kind == 'frcnn': sys.exit(f'frcnn detector unavailable: {e}')
    if not (hasattr(cv2, 'HOGDescriptor') and hasattr(cv2, 'CascadeClassifier')):   # fail closed: no people check, no stills
        sys.exit('this OpenCV build has no HOG/Haar detectors; use the pinned one (compare/requirements.lock: opencv-python-headless 4.10)')
    _hog = cv2.HOGDescriptor(); _hog.setSVMDetector(cv2.HOGDescriptor_getDefaultPeopleDetector())
    _face = cv2.CascadeClassifier(cv2.data.haarcascades + 'haarcascade_frontalface_default.xml')
    if _face.empty(): sys.exit('face cascade not found in this OpenCV build; use the pinned one (compare/requirements.lock)')
    DET = 'hog'


def people(img):
    """(faces, persons) found in a crop. frcnn: COCO 'person' score >= 0.5 (faces counted as persons)."""
    if DET == 'frcnn':
        import torch
        t = torch.from_numpy(cv2.cvtColor(img, cv2.COLOR_BGR2RGB)).permute(2, 0, 1).float().div(255)
        dev = next(_m.parameters()).device
        with torch.no_grad(): r = _m([t.to(dev)])[0]
        return 0, int(((r['labels'] == 1) & (r['scores'] >= 0.5)).sum())
    g = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    faces = _face.detectMultiScale(g, 1.1, 5, minSize=(20, 20))
    big = img if min(img.shape[:2]) >= 128 else cv2.resize(img, None, fx=2, fy=2)
    rects, wts = _hog.detectMultiScale(big, winStride=(8, 8), padding=(8, 8), scale=1.05)
    persons = [w for w in np.ravel(wts) if w > 0.5] if len(rects) else []
    return len(faces), len(persons)


def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    ap.add_argument('spec'); ap.add_argument('frames'); ap.add_argument('out'); ap.add_argument('--min-sharp', type=float, default=60)
    ap.add_argument('--detector', choices=['auto', 'frcnn', 'hog'], default='auto')
    a = ap.parse_args(); load_detector(a.detector); out = Path(a.out); out.mkdir(parents=True, exist_ok=True)
    spec = json.load(open(a.spec)); prov = []
    for s in spec:
        W, H = s['size']; dst = np.float32([[0, 0], [W, 0], [W, H], [0, H]]); cands = []
        for c in s['candidates']:
            row = {'frame': c['frame']}
            img = cv2.imread(str(Path(a.frames) / c['frame']))
            if img is None: row['refused'] = 'frame missing'; cands.append(row); continue
            if 'quad' in c: q = np.float32(c['quad'])
            else:
                pose = json.load(open(c['pose'])); pose = pose[0] if isinstance(pose, list) else pose
                sx, sy = img.shape[1] / pose['w'], img.shape[0] / pose['h']
                q = project(pose, c['corners3d'])
                if q is None: row['refused'] = 'behind camera'; cands.append(row); continue
                q = np.float32(q * [sx, sy])
            row['quad'] = q.round(1).tolist()
            if (q < -2).any() or (q[:, 0] > img.shape[1] + 2).any() or (q[:, 1] > img.shape[0] + 2).any():
                row['refused'] = 'still not fully in frame'; cands.append(row); continue
            crop = cv2.warpPerspective(img, cv2.getPerspectiveTransform(q, dst), (W, H), flags=cv2.INTER_CUBIC)
            row['sharp'] = round(float(cv2.Laplacian(cv2.cvtColor(crop, cv2.COLOR_BGR2GRAY), cv2.CV_64F).var()), 1)
            nf, npers = people(crop); row['faces'], row['persons'] = nf, npers
            if nf or npers: row['refused'] = f'people ({nf} face, {npers} person)'
            elif row['sharp'] < a.min_sharp: row['refused'] = 'too blurred'
            row['_crop'] = crop; cands.append(row)
        ok = [c for c in cands if 'refused' not in c]
        best = max(ok, key=lambda c: c['sharp']) if ok else None
        if best: cv2.imwrite(str(out / f"{s['id']}.png"), best['_crop'])
        for c in cands: c.pop('_crop', None)
        prov.append({'id': s['id'], 'detector': DET, 'size': [W, H], 'chosen': best['frame'] if best else None,
                     'result': 'written' if best else 'REFUSED - no clean sharp candidate', 'candidates': cands})
        print(f"{s['id']:14s} {'-> ' + best['frame'] + ' sharp ' + str(best['sharp']) if best else 'REFUSED'} ({len(ok)}/{len(cands)} ok)")
    json.dump(prov, open(out / 'stills_provenance.json', 'w'), indent=1)


if __name__ == '__main__':
    main()
