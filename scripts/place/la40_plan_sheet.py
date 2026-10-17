"""la40_plan_sheet.py — a picture sheet of a 40 W laser plan: per scene, the walked shapes it plays (2026-10-17, MOXIR v4).
Crops each graphic from the walked photo chart (docs/moxir/devices/photos/la40wf-shapes-by-value-1..3-2026-10-17.jpg, 10x9 cells
of 108x120 px; CELL maps a graphic to its first clear frame). A graphic not in CELL is drawn as text only, never guessed.
  python3 -I scripts/place/la40_plan_sheet.py <plan.json> <desk-cues.json> <out.png> [--photos <dir>]
"""
import json, sys
from PIL import Image, ImageDraw
CELL = {1: (1, 2), 2: (1, 7), 5: (1, 14), 8: (1, 18), 10: (1, 22), 14: (1, 27), 16: (1, 30), 17: (1, 32), 18: (1, 34), 27: (1, 45), 29: (1, 47),
        31: (1, 49), 33: (1, 51), 35: (1, 53), 37: (1, 55), 48: (1, 65), 56: (1, 74), 61: (1, 78), 86: (2, 13), 93: (2, 20), 98: (2, 25),
        108: (2, 34), 124: (2, 49), 138: (2, 61)}
plan_f, cues_f, out_f = sys.argv[1:4]
pdir = sys.argv[sys.argv.index('--photos') + 1] if '--photos' in sys.argv else 'docs/moxir/devices/photos'
img = {k: Image.open(f'{pdir}/la40wf-shapes-by-value-{k}-2026-10-17.jpg') for k in (1, 2)}
plan = json.load(open(plan_f))['cues']; names = json.load(open(cues_f))['cues']['list']
W, H = 108, 104; rows = sorted(plan, key=int)
out = Image.new('RGB', (330 + 4 * (W + 6), len(rows) * (H + 8) + 10), (12, 12, 14)); d = ImageDraw.Draw(out)
for r, n in enumerate(rows):
    y = 8 + r * (H + 8); p = plan[n]
    d.text((8, y + 30), f"{n}. {names[int(n) - 1]['name']}"[:44], fill=(230, 228, 220))
    d.text((8, y + 50), f"every {p['every']} s - colour {p['colour']}", fill=(140, 135, 125))
    for j, g in enumerate(p['graphics']):
        x = 330 + j * (W + 6)
        if g in CELL:
            c, i = CELL[g]; x0, y0 = (i % 10) * 108, (i // 10) * 120
            out.paste(img[c].crop((x0, y0, x0 + W, y0 + H)), (x, y))
        d.text((x + 4, y + H - 14), f'g{g}', fill=(255, 255, 0))
out.save(out_f); print(out_f, out.size)
