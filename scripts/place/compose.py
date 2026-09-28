"""Lay a render beside the photograph it was taken to match, and over it.

    python3 scripts/place/compose.py --photo <photo.jpg> --render <shot.png> --out <composite.png>
        [--label-photo "photo 032"] [--label-render "model"] [--side-only]

--side-only: the two side by side, no blend — for a render from a camera near,
not on, the photograph's (a close-up to compare the look, not the position).

Writes one PNG: the photo and the render side by side at the photo's size,
and under them the two blended 50/50 — where the model's columns, girders
and roof lines fall on the photo's is where the model is right. Nothing is
warped or aligned by hand: the render must come from the photo's own camera
(rig-look.mjs's `crane` view is photo 032's, fitted in the features file).
Needs Pillow.
"""
import argparse

from PIL import Image, ImageDraw


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--photo', required=True)
    ap.add_argument('--render', required=True)
    ap.add_argument('--out', required=True)
    ap.add_argument('--label-photo', default='photo')
    ap.add_argument('--label-render', default='model')
    ap.add_argument('--side-only', action='store_true')
    a = ap.parse_args()
    photo = Image.open(a.photo).convert('RGB')
    render = Image.open(a.render).convert('RGB')
    if render.size != photo.size:
        render = render.resize(photo.size, Image.LANCZOS)
    w, h = photo.size
    out = Image.new('RGB', (2 * w, h if a.side_only else 2 * h), (0, 0, 0))
    out.paste(photo, (0, 0))
    out.paste(render, (w, 0))
    labels = [(8, 8, a.label_photo), (w + 8, 8, a.label_render)]
    if not a.side_only:
        out.paste(Image.blend(photo, render, 0.5), (w // 2, h))
        labels.append((w // 2 + 8, h + 8, f'{a.label_photo} + {a.label_render}, 50/50'))
    draw = ImageDraw.Draw(out)
    for x, y, text in labels:
        draw.rectangle((x - 4, y - 4, x + 8 * len(text) + 4, y + 16), fill=(0, 0, 0))
        draw.text((x, y), text, fill=(255, 255, 255))
    out.save(a.out)
    print(f'[compose] {a.out} ({out.size[0]}x{out.size[1]})')


if __name__ == '__main__':
    main()
