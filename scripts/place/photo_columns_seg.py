#!/usr/bin/env python3
"""Columns as their own instances: Grounding DINO boxes per class, SAM 2.1 mask per box (GPU, under the browser lock).

Why: the first pass took 'column' from ADE20K's semantic classes, where precast columns, machines and walls all fell
into one 'wall' blob (photo 024, 024-masks.png). Here every class is its own open-vocabulary query, so each column is
one instance with its own mask.
Models (pinned as in photo_analyse.py): Grounding DINO tiny @ a2bb814d (Liu et al., ECCV 2024), SAM 2.1 hiera-small
@ ee5bba1d (Ravi et al., 2024). Both Apache-2.0.
Classes and prompts (one detector call per class, box threshold 0.25, text 0.20, per-class NMS IoU 0.5):
  column : "concrete column. pillar. crane runway column."
  machine: "machine. press. tank. transformer. cabinet. pipe."
  wall   : "wall. brick wall. window."
  person : "person."
Overlaps: column > person > machine > wall. Writes <out>/<stem>/inst2.npz and a picture with a colour per class,
columns outlined and numbered.
  flock ~/.local/state/di/locks/browser.lock ~/tools/photo-analysis/.venv/bin/python scripts/place/photo_columns_seg.py IMG --out DIR --png PNG
"""
import argparse, json, os
import numpy as np
import cv2

REV = {'gdino': ('IDEA-Research/grounding-dino-tiny', 'a2bb814dd30d776dcf7e30523b00659f4f141c71'),
       'sam2': ('facebook/sam2.1-hiera-small', 'ee5bba1d82bb8749febdf90f45e84b687142ba03')}
CLASSES = {'column': 'concrete column. pillar. crane runway column. tall concrete pillar.',
           'machine': 'machine. press. tank. transformer. cabinet. pipe.',
           'wall': 'wall. brick wall. window.',
           'person': 'person.'}
COL = {'column': (0, 215, 255), 'machine': (60, 60, 230), 'wall': (180, 120, 60), 'person': (230, 60, 230)}
ORDER = ['wall', 'machine', 'person', 'column']  # later paints over earlier


def nms(b, s, thr=0.5):
    idx, keep = np.argsort(-s), []
    for i in idx:
        ok = True
        for j in keep:
            xx1, yy1 = max(b[i, 0], b[j, 0]), max(b[i, 1], b[j, 1]); xx2, yy2 = min(b[i, 2], b[j, 2]), min(b[i, 3], b[j, 3])
            inter = max(0, xx2 - xx1) * max(0, yy2 - yy1)
            a = (b[i, 2] - b[i, 0]) * (b[i, 3] - b[i, 1]) + (b[j, 2] - b[j, 0]) * (b[j, 3] - b[j, 1]) - inter
            if inter / a > thr:
                ok = False; break
        if ok:
            keep.append(i)
    return keep


def main():
    ap = argparse.ArgumentParser(); ap.add_argument('img'); ap.add_argument('--out', required=True); ap.add_argument('--png', required=True)
    a = ap.parse_args()
    import torch
    from PIL import Image
    from transformers import AutoProcessor, AutoModelForZeroShotObjectDetection, Sam2Model, Sam2Processor
    im = Image.open(a.img).convert('RGB')
    proc = AutoProcessor.from_pretrained(REV['gdino'][0], revision=REV['gdino'][1])
    det = AutoModelForZeroShotObjectDetection.from_pretrained(REV['gdino'][0], revision=REV['gdino'][1]).cuda().eval()
    sproc = Sam2Processor.from_pretrained(REV['sam2'][0], revision=REV['sam2'][1])
    sam = Sam2Model.from_pretrained(REV['sam2'][0], revision=REV['sam2'][1]).cuda().eval()
    res = {}
    W, H = im.size
    # the detector resizes to ~800 px, where far columns are a few px wide: run it on the full frame AND on a 3x3 grid
    # of overlapping tiles (SAHI-style slicing, Akyon et al., ICIP 2022), boxes mapped back, then NMS
    tiles = [(0, 0, W, H)] + [(int(x), int(y), int(x + W / 2), int(y + H / 2)) for x in np.linspace(0, W / 2, 3) for y in np.linspace(0, H / 2, 3)]
    for cls, text in CLASSES.items():
        bs, ss = [], []
        for (x0, y0, x1, y1) in tiles:
            t = im.crop((x0, y0, x1, y1))
            inp = proc(images=t, text=text, return_tensors='pt').to('cuda')
            with torch.no_grad():
                o = det(**inp)
            r = proc.post_process_grounded_object_detection(o, inp.input_ids, threshold=0.25, text_threshold=0.20, target_sizes=[t.size[::-1]])[0]
            if len(r['boxes']):
                bs.append(r['boxes'].cpu().numpy() + [x0, y0, x0, y0]); ss.append(r['scores'].cpu().numpy())
        b = np.concatenate(bs) if bs else np.zeros((0, 4)); s = np.concatenate(ss) if ss else np.zeros(0)
        if cls == 'column' and len(b):
            # a column is tall and thin: height >= 2.5 x width and >= 6 % of the frame (drops cylinders, presses, boxes)
            hh, ww = b[:, 3] - b[:, 1], b[:, 2] - b[:, 0]
            ok = (hh >= 2.5 * ww) & (hh >= 0.06 * H)
            b, s = b[ok], s[ok]
        # drop boxes covering most of the frame (the detector's 'everything' answer)
        big = (b[:, 2] - b[:, 0]) * (b[:, 3] - b[:, 1]) > 0.5 * im.width * im.height
        b, s = b[~big], s[~big]
        k = nms(b, s); b, s = b[k], s[k]
        m = np.zeros((0, im.height, im.width), bool)
        if len(b):
            si = sproc(images=im, input_boxes=[b.tolist()], return_tensors='pt').to('cuda')
            with torch.no_grad():
                so = sam(**si, multimask_output=False)
            m = sproc.post_process_masks(so.pred_masks.cpu(), si['original_sizes'])[0][:, 0].numpy().astype(bool)
        res[cls] = (b, s, m)
        print(cls, len(b), 'instances')
    stem = os.path.basename(a.img).rsplit('.', 1)[0]
    d = os.path.join(a.out, stem); os.makedirs(d, exist_ok=True)
    np.savez_compressed(os.path.join(d, 'inst2.npz'), **{f'{c}_{k}': v for c, (b, s, m) in res.items() for k, v in (('boxes', b), ('scores', s), ('masks', m))})
    img = cv2.cvtColor(np.array(im), cv2.COLOR_RGB2BGR)
    over = img.copy()
    for c in ORDER:
        for mm in res[c][2]:
            over[mm] = COL[c]
    vis = cv2.addWeighted(img, 0.45, over, 0.55, 0)
    lw = max(2, im.width // 600)
    cols = sorted(range(len(res['column'][0])), key=lambda i: res['column'][0][i][0])
    info = []
    for n, i in enumerate(cols, 1):
        mm = res['column'][2][i].astype(np.uint8)
        cs, _ = cv2.findContours(mm, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        cv2.drawContours(vis, cs, -1, (255, 255, 255), lw)
        x0, y0, x1, y1 = res['column'][0][i].astype(int)
        cv2.putText(vis, str(n), (x0 + 4, y0 + 18 * lw), cv2.FONT_HERSHEY_SIMPLEX, 0.8 * lw, (255, 255, 255), lw + 1, cv2.LINE_AA)
        info.append({'n': n, 'box': [int(x0), int(y0), int(x1), int(y1)], 'score': float(res['column'][1][i]), 'area_px': int(mm.sum())})
    y = 30 * lw
    for c in ['column', 'machine', 'wall', 'person']:
        cv2.rectangle(vis, (10, y - 18 * lw), (10 + 22 * lw, y + 2), COL[c], -1)
        cv2.putText(vis, f'{c} ({len(res[c][0])})', (16 + 24 * lw, y), cv2.FONT_HERSHEY_SIMPLEX, 0.7 * lw, (255, 255, 255), lw, cv2.LINE_AA)
        y += 26 * lw
    cv2.imwrite(a.png, cv2.resize(vis, None, fx=min(1, 2000 / im.width), fy=min(1, 2000 / im.width), interpolation=cv2.INTER_AREA))
    json.dump({'img': a.img, 'models': REV, 'classes': CLASSES, 'columns': info}, open(os.path.join(d, 'inst2.json'), 'w'), indent=1)
    print(a.png)


if __name__ == '__main__':
    main()
