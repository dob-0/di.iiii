#!/usr/bin/env python3
"""laser_sheet.py — the laser design sheet (light mode, 16 px gutters) from the scenes file and laser_frames.py's plan (--plan-out).
venue-to-show skill, step "laser content": the sheet the owner reads before a cube is lit.

    python3 -I laser_sheet.py <scenes.json> <laser-plan.json> <out.html> [--site SITE.json] [--meta META.json]
SITE.json (optional, the place's top plan): {"window": {"z0","z1","x0","x1","scale"}, "bay": [z0,x0,z1,x1], "bands": [[z0,z1,x0,x1]],
"cranes": [z], "crane_half_x": 12}; without it the window is the plan's own rays and cubes. META.json (optional): {"title", "intro_html",
"notes_html" (the legend and limits), "refs": [[image, caption]]}. Nothing here names a production. Per scene: a top plan (SVG: the bay, the lantern band, the cranes, the six cubes, every ray to its first surface), colour,
tempo, cube group, level, hits and the safety line, all read from the plan (computed by the same geometry as the frames).
"""
import argparse, html, json, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))  # python -I does not add the script's folder
from laser_rules import HAND_RULE_M

Z0, Z1, X0, X1, S = -10.0, 10.0, -10.0, 10.0, 3.0      # plan window (m) and px per m: z → right (entry), x → up (east); set by set_window()
SITE = {}


def set_window(site, plan):
    global Z0, Z1, X0, X1, S, SITE
    SITE = site
    w = site.get('window')
    if w:
        Z0, Z1, X0, X1, S = w['z0'], w['z1'], w['x0'], w['x1'], w.get('scale', 3.0)
        return
    pts = [c['p'] for c in plan.get('cubes', [])] + [r[k] for p in plan.get('scenes', []) for r in p.get('rays', []) for k in ('from', 'to')]
    zs, xs = [q[2] for q in pts] or [0], [q[0] for q in pts] or [0]
    Z0, Z1, X0, X1 = min(zs) - 2, max(zs) + 2, min(xs) - 2, max(xs) + 2
    S = max(0.5, min(6.0, 330.0 / max(Z1 - Z0, 1)))


def px(z, x):
    return round((z - Z0) * S, 1), round((X1 - x) * S, 1)


def shade(hexc, k=0.72):
    r, g, b = (int(hexc[i:i + 2], 16) for i in (1, 3, 5))
    if min(r, g, b) > 200:                    # whites drawn as a cool grey on the white page
        return '#7a8494'
    return '#%02x%02x%02x' % (int(r * k), int(g * k), int(b * k))


def plan_svg(p, cubes, colour):
    w, h = round((Z1 - Z0) * S), round((X1 - X0) * S)
    o = [f'<svg viewBox="0 0 {w} {h}" width="{w}" height="{h}" role="img" aria-label="top plan">']
    if SITE.get('bay'):
        z0, x0, z1, x1 = SITE['bay']
        a, b = px(z0, x1), px(z1, x0)
        o.append(f'<rect x="{a[0]}" y="{a[1]}" width="{b[0]-a[0]}" height="{b[1]-a[1]}" fill="#fafafa" stroke="#9aa0a6"/>')
    for z0, z1, x0, x1 in SITE.get('bands', []):
        a, b = px(z0, x1), px(z1, x0)
        o.append(f'<rect x="{a[0]}" y="{a[1]}" width="{b[0]-a[0]}" height="{b[1]-a[1]}" fill="#e8f0fb" stroke="none"/>')
    hx = SITE.get('crane_half_x', 12)
    for z in SITE.get('cranes', []):
        a, b = px(z, hx), px(z, -hx)
        o.append(f'<line x1="{a[0]}" y1="{a[1]}" x2="{b[0]}" y2="{b[1]}" stroke="#c0c4c8" stroke-width="3"/>')
    col = shade(colour)
    for r in p.get('rays', []):
        a, b = px(r['from'][2], r['from'][0]), px(r['to'][2], r['to'][0])
        o.append(f'<line x1="{a[0]}" y1="{a[1]}" x2="{b[0]}" y2="{b[1]}" stroke="{col}" stroke-width="0.8" stroke-opacity="0.35"/>')
        o.append(f'<circle cx="{b[0]}" cy="{b[1]}" r="1.4" fill="{col}"/>')
    for c in cubes:
        a = px(c['p'][2], c['p'][0])
        on = c['n'] in p.get('group', [])
        o.append(f'<circle cx="{a[0]}" cy="{a[1]}" r="2.6" fill="{"#111" if on else "#fff"}" stroke="#111" stroke-width="0.8"/>')
    o.append(f'<text x="4" y="11" font-size="9" fill="#5f6368">east (+x)</text><text x="4" y="{h-4}" font-size="9" fill="#5f6368">west</text>')
    o.append(f'<text x="{w-4}" y="11" font-size="9" fill="#5f6368" text-anchor="end">entry →</text></svg>')
    return ''.join(o)


def safety_line(p):
    if not p.get('laser'):
        return 'dark'
    ends = '; '.join(f"{k} at {v['height_m'][0]}–{v['height_m'][1]} m ({v['rays']} ray samples)" for k, v in p['ends'].items())
    fl = f", {p['flash_hz']} hits/s (≤ 3)" if p['flash_hz'] else ''
    return (f"ends on: {ends}. Every ray rises from the cubes at {p['lowest_m']} m (never below; hand rule {HAND_RULE_M:g} m){fl}; "
            f"field {p['max_field_deg']}° of ±18.5°; {p['points_per_cube_frame']} of {p['points_cap']} points a cube frame; "
            f"check: {'PASS' if not p['fail_count'] else 'FAIL ' + str(p['fail_count'])}")


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    ap.add_argument('scenes'); ap.add_argument('plan'); ap.add_argument('out')
    ap.add_argument('--site', help='JSON: the place top plan (window, bay, bands, cranes)')
    ap.add_argument('--meta', help='JSON: title, intro_html, notes_html, refs')
    a = ap.parse_args(argv)
    scenes = json.load(open(a.scenes))['scenes']
    plan = json.load(open(a.plan))
    meta = json.load(open(a.meta)) if a.meta else {}
    set_window(json.load(open(a.site)) if a.site else {}, plan)
    by = {p['id']: p for p in plan['scenes']}
    cubes, sm = plan['cubes'], plan['summary']
    cap = sm.get('level_cap', 0.16)
    cards = []
    for i, s in enumerate(scenes, 1):
        p, L = by[s['id']], s.get('laser')
        head = f"<h3>{i}. {html.escape(s['title'])} <small>act {s['act']} · {html.escape(s['id'])}</small></h3>"
        if not L:
            cards.append(f'<section class="card dark">{head}<p class="muted">cubes dark — the lamps carry this scene</p></section>')
            continue
        hits = f"hits {L['hits']['per_beat']}/beat, duty {L['hits']['duty']}" if L.get('hits') else 'no hits'
        br = f", breathe ≥ {L['breathe']['min']}" if L.get('breathe') else ''
        geo = (f"pitch {L['pitch_deg']}° · yaw out {L['yaw_deg']}° · spread ±{L['spread_deg']}° · amplitude ±{L['amplitude_deg']}°"
               if L['pattern'] not in ('comb', 'net') else f"rigged comb aims{', cross yaw ±' + str(L['amplitude_deg']) + '°' if L['amplitude_deg'] else ''}")
        cards.append(
            f'<section class="card">{head}{plan_svg(p, cubes, L["colour"])}'
            f'<p><b>{L["pattern"]}</b> · cubes <b>{L["cubes"]}</b> ({", ".join(map(str, p["group"]))}) · phase {L["phase"]}</p>'
            f'<p><span class="sw" style="background:{L["colour"]}"></span>{L["colour"]} ({L.get("colour_key","")}) · level {L["level"]} '
            f'(cap {cap}) · {hits}{br}</p>'
            f'<p>tempo: master clock {L["tempo"]["bpm"]} bpm × {L["tempo"]["beats"]} beats = {p["cycle_s"]} s a cycle · {geo}</p>'
            f'<p class="why">{html.escape(L.get("why",""))} <span class="muted">refs: {html.escape(", ".join(L.get("refs", [])))}</span></p>'
            f'<p class="safe">{html.escape(safety_line(p))}</p></section>')
    refs = ''.join(f'<figure><img src="{n}" alt="{html.escape(c)}"><figcaption>{html.escape(c)}</figcaption></figure>' for n, c in meta.get('refs', []))
    loop = (f"<li>Loop: {sm['loop_s']} s by the show clock, {sm['frames']} room frames of {sm['step_s']} s; {sm['scenes_lit']} of "
            f"{sm['scenes']} scenes carry a design; check {'PASS' if sm['ok'] else 'FAIL'}.</li>")
    title = html.escape(meta.get('title', 'Laser content'))
    doc = f'''<!doctype html><html lang="en"><head><meta charset="utf-8"><title>{title}</title>
<style>
:root{{color-scheme:light}} body{{margin:0;padding:16px;font:14px/1.45 system-ui,sans-serif;background:#fff;color:#202124}}
h1{{font-size:20px;margin:0 0 16px}} h2{{font-size:16px;margin:16px 0}} h3{{font-size:14px;margin:0 0 8px}} small,.muted{{color:#5f6368;font-weight:400}}
.refs{{display:flex;gap:16px;flex-wrap:wrap}} figure{{margin:0}} figure img{{height:160px;border:1px solid #dadce0}}
figcaption{{font-size:12px;color:#5f6368}} .grid{{display:grid;grid-template-columns:repeat(auto-fill,minmax(340px,1fr));gap:16px}}
.card{{border:1px solid #dadce0;border-radius:8px;padding:16px}} .card p{{margin:8px 0 0}} .card.dark{{background:#f8f9fa}}
.sw{{display:inline-block;width:12px;height:12px;border:1px solid #9aa0a6;vertical-align:-2px;margin-right:4px}}
.safe{{font-size:12px;color:#137333}} .why{{font-size:13px}} ul{{margin:8px 0;padding-left:20px}} svg{{display:block;max-width:100%;height:auto}}
</style></head><body>
<h1>{title}</h1>
{meta.get('intro_html', '')}
{('<h2>References</h2><div class="refs">' + refs + '</div>') if refs else ''}
<ul>{meta.get('notes_html', '')}{loop}</ul>
<h2>Scenes</h2><div class="grid">{''.join(cards)}</div></body></html>'''
    open(a.out, 'w').write(doc)
    print(f'{a.out}: {len(doc)} bytes, {sum(1 for c in cards if "dark" not in c[:40])} drawn')


if __name__ == '__main__':
    main()
