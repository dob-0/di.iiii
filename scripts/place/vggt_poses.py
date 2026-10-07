#!/usr/bin/env python3
"""VGGT camera poses + depth for the MOXIR hall views (initial cameras for the multi-view column count).

Method: VGGT (Wang et al., CVPR 2025), facebookresearch/vggt @ a288dd0f, weights facebook/VGGT-1B @ 860abec7
(CC BY-NC 4.0: research use, outputs kept in-house). 8 GB fit as in ~/tools/vggt/INSTALL_NOTES.txt:
bf16 aggregator, fp32 camera + depth heads, point/track heads off, depth frames_chunk_size 2.

Each image is EXIF-transposed and fed with VGGT's own "pad" preprocessing (longest side 518 px, centred
white padding). The mapping back to original pixels is stored per image, so poses/intrinsics can be used at
the image's own resolution. Output: <out>/predictions.npz (extrinsic [S,3,4] OpenCV world->cam,
intrinsic [S,3,3] at 518 px, depth [S,518,518], depth_conf, names, orig_wh, pad_map) — kept beside the footage.

Run (GPU, under the browser lock):
  flock ~/.local/state/di/locks/browser.lock ~/tools/vggt/.venv/bin/python scripts/place/vggt_poses.py \
     --list views.txt --out /mnt/data/footage/place-moxir-photo-analysis-2026-10-07/vggt-2026-10-07
"""
import argparse, json, os, sys, time
import numpy as np


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--list', required=True, help='text file: one image path per line')
    ap.add_argument('--out', required=True)
    ap.add_argument('--vggt', default=os.path.expanduser('~/tools/vggt'))
    a = ap.parse_args()
    sys.path.insert(0, a.vggt)
    import torch
    from PIL import Image, ImageOps
    from safetensors.torch import load_file
    from vggt.models.vggt import VGGT
    from vggt.utils.load_fn import load_and_preprocess_images
    from vggt.utils.pose_enc import pose_encoding_to_extri_intri

    paths = [l.strip() for l in open(a.list) if l.strip() and not l.startswith('#')]
    os.makedirs(a.out, exist_ok=True)
    prep = os.path.join(a.out, 'prep'); os.makedirs(prep, exist_ok=True)
    names, wh, pads, prepped = [], [], [], []
    for p in paths:
        im = ImageOps.exif_transpose(Image.open(p)).convert('RGB')
        W, H = im.size
        if W >= H:
            nw, nh = 518, round(H * (518 / W) / 14) * 14
        else:
            nh, nw = 518, round(W * (518 / H) / 14) * 14
        pl, pt = (518 - nw) // 2, (518 - nh) // 2
        q = os.path.join(prep, os.path.basename(p).rsplit('.', 1)[0] + '.png')
        im.save(q)
        names.append(os.path.basename(p)); wh.append((W, H)); pads.append((pl, pt, nw / W, nh / H)); prepped.append(q)
    imgs = load_and_preprocess_images(prepped, mode='pad').cuda()
    model = VGGT(enable_point=False, enable_track=False)
    sd = load_file(os.path.join(a.vggt, 'weights/model.safetensors'))
    model.load_state_dict({k: v for k, v in sd.items() if not k.startswith(('point_head', 'track_head'))}, strict=True)
    model.eval()
    model.aggregator.to('cuda', dtype=torch.bfloat16)
    t0 = time.time()
    with torch.no_grad():
        with torch.autocast('cuda', dtype=torch.bfloat16):
            toks, psi = model.aggregator(imgs[None])
        toks = [t.float() if t is not None else None for t in toks]
        model.aggregator.cpu(); torch.cuda.empty_cache()
        model.camera_head.cuda(); model.depth_head.cuda()
        pose_enc = model.camera_head(toks)[-1]
        depth, dconf = model.depth_head(toks, images=imgs[None], patch_start_idx=psi, frames_chunk_size=2)
    ext, intr = pose_encoding_to_extri_intri(pose_enc, imgs.shape[-2:])
    peak = torch.cuda.max_memory_allocated() / 2**30
    np.savez_compressed(os.path.join(a.out, 'predictions.npz'), extrinsic=ext[0].cpu().numpy(), intrinsic=intr[0].cpu().numpy(),
                        depth=depth[0, ..., 0].cpu().numpy().astype(np.float32), depth_conf=dconf[0].cpu().numpy().astype(np.float32),
                        names=np.array(names), orig_wh=np.array(wh), pad_map=np.array(pads))
    json.dump({'images': paths, 'seconds': round(time.time() - t0, 1), 'peak_gb': round(peak, 2),
               'vggt': 'facebookresearch/vggt@a288dd0f, VGGT-1B@860abec7 (CC BY-NC 4.0)'},
              open(os.path.join(a.out, 'run.json'), 'w'), indent=1)
    print(f'{len(paths)} frames, {time.time() - t0:.1f} s, peak {peak:.2f} GB')


if __name__ == '__main__':
    main()
