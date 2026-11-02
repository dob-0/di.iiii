#!/usr/bin/env python3
"""find_frames.py - rank video frames by a text query with a small image-text model (CLIP ViT-B/32), then a contact sheet.
usage: find_frames.py <frames_dir> <out_dir> "<query>" ["<negative>" ...] [--top 24]
Use: find a thing in thousands of frames cheaply (an evacuation plan on a wall, a sign, an exhibit) before anyone looks by eye.
The score is CLIP's softmax of the query against the negatives (Radford et al. 2021); a ranking aid, never a finding by itself."""
import sys, os, json, torch
from PIL import Image
from transformers import CLIPModel, CLIPProcessor
a = sys.argv[1:]; top = 24
if '--top' in a: i = a.index('--top'); top = int(a[i + 1]); del a[i:i + 2]
src, out, q, neg = a[0], a[1], a[2], a[3:] or ['a plain white wall', 'a corridor', 'people standing', 'a poster with a photo']
os.makedirs(out, exist_ok=True); dev = 'cuda' if torch.cuda.is_available() else 'cpu'
m = CLIPModel.from_pretrained('openai/clip-vit-base-patch32', use_safetensors=True).to(dev).eval(); p = CLIPProcessor.from_pretrained('openai/clip-vit-base-patch32')
texts = [q] + neg; names = sorted(n for n in os.listdir(src) if n.endswith('.jpg')); sc = []
with torch.no_grad():
    emb = lambda o: o if torch.is_tensor(o) else o.pooler_output   # transformers 5 returns an output object
    t = emb(m.get_text_features(**p(text=texts, return_tensors='pt', padding=True).to(dev))); t = t / t.norm(dim=-1, keepdim=True)
    for i in range(0, len(names), 64):
        ims = [Image.open(os.path.join(src, n)).convert('RGB') for n in names[i:i + 64]]
        f = emb(m.get_image_features(**p(images=ims, return_tensors='pt').to(dev))); f = f / f.norm(dim=-1, keepdim=True)
        pr = (100 * f @ t.T).softmax(-1)[:, 0].tolist(); sc += list(zip(names[i:i + 64], pr))
sc.sort(key=lambda x: -x[1]); json.dump(sc[:200], open(os.path.join(out, 'ranked.json'), 'w'), indent=0)
W = 6; th = [Image.open(os.path.join(src, n)).convert('RGB').resize((180, 320)) for n, _ in sc[:top]]
sheet = Image.new('RGB', (180 * W, 320 * ((len(th) + W - 1) // W)), 'white')
for k, im in enumerate(th): sheet.paste(im, ((k % W) * 180, (k // W) * 320))
sheet.save(os.path.join(out, 'sheet.jpg'), quality=88); print('frames', len(names), 'top', [(n, round(s, 3)) for n, s in sc[:8]])
