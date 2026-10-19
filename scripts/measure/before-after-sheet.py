#!/usr/bin/env python3
"""before-after-sheet.py — one light-mode HTML sheet: before | after per row, each picture with its numbers (2026-10-15).

    python3 -I scripts/measure/before-after-sheet.py --spec spec.json --out <dir>/sheet.html

spec.json: { "title": str, "lead": [str, ...], "quote": str | null, "refs": [{ "label", "href" }],
             "rows": [{ "name": str, "note": str, "before": { "img": path, "caption": str }, "after": { ... } }],
             "foot": [str, ...] }
Pictures are copied next to the sheet (<out dir>/<sheet name>-img/) so the sheet is one folder that opens anywhere.
Read-only for its inputs. Layout: the house sheet style (light, 16 px gutters, captions under each picture).
"""
import argparse
import html
import json
import os
import shutil

CSS = """body{margin:0;padding:16px;background:#fafafa;color:#111;font:15px/1.45 system-ui,sans-serif}
h1{font-size:22px;margin:0 0 8px}h2{font-size:17px;margin:24px 0 8px}p{margin:4px 0;max-width:120ch}
blockquote{margin:8px 0;padding:8px 16px;border-left:3px solid #111;background:#fff}
.row{display:grid;grid-template-columns:1fr 1fr;gap:16px}figure{margin:0;background:#fff;border:1px solid #ddd;padding:8px}
figure img{width:100%;display:block}figcaption{font-size:13px;margin-top:8px;white-space:pre-wrap}
.k{font-size:12px;text-transform:uppercase;letter-spacing:.06em;color:#555}a{color:#0645ad}"""


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--spec', required=True)
    ap.add_argument('--out', required=True)
    a = ap.parse_args()
    spec = json.load(open(a.spec))
    out_dir = os.path.dirname(os.path.abspath(a.out))
    img_dir = os.path.splitext(os.path.basename(a.out))[0] + '-img'
    os.makedirs(os.path.join(out_dir, img_dir), exist_ok=True)
    e = html.escape

    def pic(side, label):
        if not side or not side.get('img') or not os.path.exists(side['img']):
            return f'<figure><div class="k">{label}</div><p>(no picture){" — " + e(side.get("caption", "")) if side else ""}</p></figure>'
        name = os.path.basename(side['img'])
        shutil.copyfile(side['img'], os.path.join(out_dir, img_dir, name))
        return (f'<figure><div class="k">{label}</div><a href="{img_dir}/{e(name)}"><img src="{img_dir}/{e(name)}" alt="{e(label)}"></a>'
                f'<figcaption>{e(side.get("caption", ""))}</figcaption></figure>')

    parts = [f'<!doctype html><meta charset="utf-8"><title>{e(spec["title"])}</title><style>{CSS}</style><h1>{e(spec["title"])}</h1>']
    parts += [f'<p>{e(t)}</p>' for t in spec.get('lead', [])]
    if spec.get('quote'):
        parts.append(f'<blockquote>{e(spec["quote"])}</blockquote>')
    if spec.get('refs'):
        parts.append('<p>' + ' · '.join(f'<a href="{e(r["href"])}">{e(r["label"])}</a>' for r in spec['refs']) + '</p>')
    for r in spec['rows']:
        parts.append(f'<h2>{e(r["name"])}</h2>' + (f'<p>{e(r["note"])}</p>' if r.get('note') else ''))
        parts.append(f'<div class="row">{pic(r.get("before"), "before")}{pic(r.get("after"), "after")}</div>')
    parts += [f'<p>{e(t)}</p>' for t in spec.get('foot', [])]
    with open(a.out, 'w') as f:
        f.write('\n'.join(parts) + '\n')
    print(a.out)


if __name__ == '__main__':
    main()
