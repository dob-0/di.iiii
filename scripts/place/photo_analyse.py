#!/usr/bin/env python3
"""photo_analyse.py — segmentation + monocular depth on the MOXIR hall photographs,
projected onto the hall floor (y = 0) with the photo cameras fitted in the hall json.

Usage (venv ~/tools/photo-analysis/.venv, see docs/moxir/PHOTO_ANALYSIS_2026-10-07.md):
  # 1. GPU inference (masks, depth) — run under the browser lock, one job at a time:
  flock ~/.local/state/di/locks/browser.lock \
    ~/tools/photo-analysis/.venv/bin/python scripts/place/photo_analyse.py infer --out DIR PHOTO...
  # 2. CPU projection: occupancy grid, overlays, plan, column table, features layer:
  ~/tools/photo-analysis/.venv/bin/python scripts/place/photo_analyse.py project \
    --hall HALL.json --masks DIR --overlays OUTDIR --features OUT.json

Methods and sources (all published, weights pinned by revision below):
  - semantic segmentation: OneFormer (Jain et al., CVPR 2023), shi-labs/oneformer_ade20k_swin_large,
    ADE20K 150 classes, licence MIT.
  - open-vocabulary detection: Grounding DINO (Liu et al., ECCV 2024), IDEA-Research/grounding-dino-tiny,
    licence Apache-2.0; boxes prompted with the text list PROMPTS.
  - instance masks from those boxes: SAM 2.1 (Ravi et al., 2024), facebook/sam2.1-hiera-small, Apache-2.0.
  - relative depth: Depth Anything V2 Small (Yang et al., NeurIPS 2024), depth-anything/Depth-Anything-V2-Small-hf,
    Apache-2.0 (Base/Large are CC BY-NC and are NOT used). Its affine-invariant inverse depth is aligned to
    metric with a least-squares scale + shift on the floor pixels, against the floor-plane depth of the fitted
    camera (the MiDaS alignment, Ranftl et al., TPAMI 2020).
  - floor occupancy: an occupancy grid (Elfes, IEEE Computer 1989) on y = 0, 0.5 m cells: floor-class pixels
    vote FREE, points of non-floor pixels between 0.15 and 4.0 m above the floor vote OCCUPIED, the rest is
    UNSEEN. Ground contact of each object column = the stixel idea (Badino et al., DAGM 2009).
  - cameras: only the two fitted in the hall json (geometry.cameras): photo 032 (level-camera perspective
    fit, rms 3 px) and photo 024 (solvePnP, ~1 m / ~2 deg). VGGT poses were not kept (see the doc).
"""
import argparse, json, os, subprocess, sys, time
from pathlib import Path
import numpy as np

REV = {  # Hugging Face revisions, resolved 2026-10-07
    'oneformer': ('shi-labs/oneformer_ade20k_swin_large', '4a5bac8e64f82681a12db2e151a4c2f4ce6092b2', 'MIT'),
    'gdino': ('IDEA-Research/grounding-dino-tiny', 'a2bb814dd30d776dcf7e30523b00659f4f141c71', 'Apache-2.0'),
    'sam2': ('facebook/sam2.1-hiera-small', 'ee5bba1d82bb8749febdf90f45e84b687142ba03', 'Apache-2.0'),
    'depth': ('depth-anything/Depth-Anything-V2-Small-hf', '5426e4f0f36572d16453bbda7a8389317b1bef99', 'Apache-2.0'),
    'sam1': ('facebook/sam-vit-base', None, 'Apache-2.0'),  # automatic masks ("everything" mode), Kirillov et al. ICCV 2023
}
PROMPTS = ['industrial machine', 'metal tank', 'electrical cabinet', 'pipe', 'concrete column', 'brick wall',
           'white sack', 'scrap metal pile', 'wooden pallet', 'person', 'transformer', 'forklift', 'workbench']
FIXED = {'industrial machine', 'metal tank', 'electrical cabinet', 'pipe', 'concrete column', 'brick wall',
         'transformer', 'workbench'}
MOVABLE = {'white sack', 'scrap metal pile', 'wooden pallet', 'person', 'forklift'}
MAX_SIDE = 1600


def cpu_temp():
    try:
        out = subprocess.run(['sensors'], capture_output=True, text=True).stdout
        for line in out.splitlines():
            if line.startswith('Package id 0:'):
                return float(line.split('+')[1].split('°')[0])
    except Exception:
        return None


def wait_cool(limit=85.0):
    while True:
        t = cpu_temp()
        if t is None or t <= limit:
            return t
        print(f'  CPU {t} C > {limit}: waiting 30 s', flush=True)
        time.sleep(30)


def load_image(path):
    from PIL import Image, ImageOps
    im = ImageOps.exif_transpose(Image.open(path)).convert('RGB')
    s = min(1.0, MAX_SIDE / max(im.size))
    if s < 1.0:
        im = im.resize((round(im.width * s), round(im.height * s)), Image.LANCZOS)
    return im, s


def infer(args):
    import torch
    from transformers import (OneFormerProcessor, OneFormerForUniversalSegmentation, AutoProcessor,
                              AutoModelForZeroShotObjectDetection, Sam2Model, Sam2Processor,
                              AutoImageProcessor, AutoModelForDepthEstimation)
    from huggingface_hub import HfApi
    dev = 'cuda'
    out = Path(args.out); out.mkdir(parents=True, exist_ok=True)
    rev = dict(REV)
    rev['sam1'] = (rev['sam1'][0], rev['sam1'][1] or HfApi().model_info(rev['sam1'][0]).sha, rev['sam1'][2])
    jobs = [(Path(p), *load_image(p)) for p in args.photos]
    manifest = {'models': {k: {'id': v[0], 'revision': v[1], 'licence': v[2]} for k, v in rev.items()},
                'prompts': PROMPTS, 'max_side_px': MAX_SIDE, 'torch': torch.__version__, 'photos': {}}

    def stage(name, fn):
        t0 = time.time(); wait_cool(); fn(); torch.cuda.empty_cache()
        print(f'{name}: {time.time() - t0:.1f} s, peak {torch.cuda.max_memory_allocated() / 1e9:.2f} GB', flush=True)

    def run_oneformer():
        proc = OneFormerProcessor.from_pretrained(rev['oneformer'][0], revision=rev['oneformer'][1])
        model = OneFormerForUniversalSegmentation.from_pretrained(rev['oneformer'][0], revision=rev['oneformer'][1]).to(dev).eval()
        manifest['ade20k_labels'] = model.config.id2label
        for p, im, s in jobs:
            wait_cool()
            inp = proc(images=im, task_inputs=['semantic'], return_tensors='pt').to(dev)
            with torch.no_grad():
                o = model(**inp)
            sem = proc.post_process_semantic_segmentation(o, target_sizes=[im.size[::-1]])[0].cpu().numpy().astype(np.uint8)
            d = out / p.stem; d.mkdir(exist_ok=True)
            np.save(d / 'sem.npy', sem)
        del model

    def run_gdino_sam():
        proc = AutoProcessor.from_pretrained(rev['gdino'][0], revision=rev['gdino'][1])
        det = AutoModelForZeroShotObjectDetection.from_pretrained(rev['gdino'][0], revision=rev['gdino'][1]).to(dev).eval()
        sproc = Sam2Processor.from_pretrained(rev['sam2'][0], revision=rev['sam2'][1])
        sam = Sam2Model.from_pretrained(rev['sam2'][0], revision=rev['sam2'][1]).to(dev).eval()
        text = '. '.join(PROMPTS) + '.'
        for p, im, s in jobs:
            wait_cool()
            inp = proc(images=im, text=text, return_tensors='pt').to(dev)
            with torch.no_grad():
                o = det(**inp)
            r = proc.post_process_grounded_object_detection(o, inp.input_ids, threshold=0.30, text_threshold=0.25,
                                                            target_sizes=[im.size[::-1]])[0]
            labels = r.get('text_labels', r.get('labels'))
            boxes = r['boxes'].cpu().numpy(); scores = r['scores'].cpu().numpy()
            masks = np.zeros((0, im.height, im.width), bool)
            if len(boxes):
                si = sproc(images=im, input_boxes=[boxes.tolist()], return_tensors='pt').to(dev)
                with torch.no_grad():
                    so = sam(**si, multimask_output=False)
                masks = sproc.post_process_masks(so.pred_masks.cpu(), si['original_sizes'])[0][:, 0].numpy().astype(bool)
            d = out / p.stem; d.mkdir(exist_ok=True)
            np.savez_compressed(d / 'inst.npz', masks=masks, boxes=boxes, scores=scores, labels=np.array(list(labels)))
        del det, sam

    def run_depth():
        proc = AutoImageProcessor.from_pretrained(rev['depth'][0], revision=rev['depth'][1])
        model = AutoModelForDepthEstimation.from_pretrained(rev['depth'][0], revision=rev['depth'][1]).to(dev).eval()
        for p, im, s in jobs:
            wait_cool()
            inp = proc(images=im, return_tensors='pt').to(dev)
            with torch.no_grad():
                o = model(**inp)
            disp = proc.post_process_depth_estimation(o, target_sizes=[im.size[::-1]])[0]['predicted_depth'].cpu().numpy()
            d = out / p.stem; d.mkdir(exist_ok=True)
            np.save(d / 'disp.npy', disp.astype(np.float32))
            manifest['photos'][p.stem] = {'source': str(p), 'size_px': list(im.size), 'scale_from_original': s}
        del model

    def run_auto():
        from transformers import pipeline
        gen = pipeline('mask-generation', model=rev['sam1'][0], revision=rev['sam1'][1], device=0, points_per_batch=64)
        for p, im, s in jobs:
            if p.stem not in args.auto:
                continue
            wait_cool()
            r = gen(im, points_per_crop=32, pred_iou_thresh=0.86, stability_score_thresh=0.90)
            m = np.stack([np.asarray(x, bool) for x in r['masks']]) if len(r['masks']) else np.zeros((0, im.height, im.width), bool)
            d = out / p.stem; d.mkdir(exist_ok=True)
            np.savez_compressed(d / 'auto.npz', masks=np.packbits(m, axis=-1), shape=np.array(m.shape), scores=np.asarray([float(x) for x in r['scores']]))
            print(p.stem, 'auto masks', len(m), flush=True)

    if args.only_auto:
        stage('sam auto', run_auto)
        mp = out / 'manifest.json'
        old = json.loads(mp.read_text()) if mp.exists() else {}
        old.setdefault('models', {})['sam1'] = {'id': rev['sam1'][0], 'revision': rev['sam1'][1], 'licence': rev['sam1'][2]}
        mp.write_text(json.dumps(old, indent=1)); return
    stage('oneformer', run_oneformer)
    stage('gdino+sam2', run_gdino_sam)
    stage('depth', run_depth)
    manifest['cpu_c_end'] = cpu_temp()
    (out / 'manifest.json').write_text(json.dumps(manifest, indent=1))
    print('wrote', out)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest='cmd', required=True)
    a = sub.add_parser('infer'); a.add_argument('--out', required=True); a.add_argument('photos', nargs='+')
    a.add_argument('--auto', nargs='*', default=[], help='photo stems that also get SAM automatic masks')
    a.add_argument('--only-auto', action='store_true', help='run only the SAM automatic-mask stage')
    b = sub.add_parser('project')
    for k in ('--hall', '--masks', '--overlays', '--features'):
        b.add_argument(k, required=True)
    b.add_argument('--more-masks', nargs='*', default=[], help='more infer output dirs (column counts only)')
    b.add_argument('--roll024', type=float, default=0.0)
    b.add_argument('--masks-only', nargs='*', default=[], help='photo stems with no fitted camera: masks overlay only')
    args = ap.parse_args()
    if args.cmd == 'infer':
        infer(args)
    else:
        sys.path.insert(0, str(Path(__file__).parent))
        from photo_project import run  # CPU stage, beside this file
        run(args)


if __name__ == '__main__':
    main()
