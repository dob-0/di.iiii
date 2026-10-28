#!/usr/bin/env python3
"""room-vs-studio-sheet.py — one HTML sheet: before | after | Studio per look and camera, numbers under each picture.
Reads BEFORE/shots.json and AFTER/shots.json (room-vs-studio-shots.cjs + picture-light.py); copies the pictures beside the sheet.
Usage: room-vs-studio-sheet.py BEFORE AFTER OUT.html [--title T]"""
import html, json, shutil, sys
from pathlib import Path

before, after, out = Path(sys.argv[1]), Path(sys.argv[2]), Path(sys.argv[3])
title = sys.argv[sys.argv.index('--title') + 1] if '--title' in sys.argv else 'Room vs Studio'
pics = out.parent / out.stem
pics.mkdir(parents=True, exist_ok=True)
shots = {k: json.loads((d / 'shots.json').read_text())['shots'] for k, d in (('before', before), ('after', after))}
def find(k, look, page, view):
    return next((s for s in shots[k] if s['lookId'] == look and s['page'] == page and s['view'] == view), None)
def cell(k, s, label):
    if not s or not s.get('file'): return f'<td><div class="none">{label}: no picture</div></td>'
    src = Path(before if k == 'before' else after) / s['file']
    name = f'{k}-{s["file"]}'
    shutil.copy(src, pics / name)
    l, v = s.get('light', {}), s.get('live') or {}
    live = 'renderer: node lane (no room pipeline)' if v.get('error') else f'exposure {v.get("toneMappingExposure")} · lamps {v.get("spotsOn")} · beams {v.get("beamsShown")}'
    return (f'<td><img src="{pics.name}/{name}"><div><b>{label}</b> · mean {l.get("mean")} /255 · bright {l.get("bright")} % · '
            f'lit {l.get("lit")} % · beam {l.get("beam")} %</div><div class="live">{html.escape(live)}</div></td>')
rows = []
for look in dict.fromkeys(s['lookId'] for s in shots['after']):
    for view in dict.fromkeys(s['view'] for s in shots['after']):
        rows.append(f'<tr><th colspan="3">{html.escape(look)} · camera {html.escape(view)}</th></tr><tr>'
                    + cell('before', find('before', look, 'show', view), 'Room Show, before')
                    + cell('after', find('after', look, 'show', view), 'Room Show, after')
                    + cell('after', find('after', look, 'studio', view), 'Studio') + '</tr>')
out.write_text(f'''<!doctype html><meta charset="utf-8"><title>{html.escape(title)}</title>
<style>body{{background:#0b0d10;color:#dde;font:14px system-ui;margin:16px}}table{{border-collapse:collapse}}td,th{{padding:6px;vertical-align:top}}
th{{text-align:left;color:#4df9ff;padding-top:18px}}img{{width:420px;display:block}}.live{{color:#99a}}.none{{color:#f88}}</style>
<h1>{html.escape(title)}</h1><p>Same look held, same camera, 1280x720, RTX 3080. mean = luma 0-255; bright = luma &gt; 128; lit = luma &gt; 25;
beam = bright streaks in the air band (scripts/measure/picture-light.py). Crop: 3-97 % across, 18-94 % down.</p><table>{''.join(rows)}</table>''')
print(out)
