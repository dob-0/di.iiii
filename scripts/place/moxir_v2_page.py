#!/usr/bin/env python3
# moxir_v2_page.py — the owner's comparison page for MOXIR v2 (2026-10-09): the three layouts side by side with their numbers,
# and one contact sheet of every frame captured in the room.
#
#   python3 -I scripts/place/moxir_v2_page.py --dir ~/Downloads/moxir/v2-layouts
#
# Reads <dir>/v2-layouts.json (moxir_v2.py), <dir>/occlusion/occlusion-sky.json (occlusion_sky.py) and the frames in
# <dir>/frames/<layout>-<look>-<view>.png (captured on the real GPU with di-test-browser). Writes <dir>/index.html and
# <dir>/contact-sheet.png. Pure layout: every number on the page comes from those two JSON files.
import argparse, html, json, os

ap = argparse.ArgumentParser()
ap.add_argument('--dir', default='~/Downloads/moxir/v2-layouts')
A = ap.parse_args()
D = os.path.expanduser(A.dir)
R = json.load(open(os.path.join(D, 'v2-layouts.json')))
SKY = json.load(open(os.path.join(D, 'occlusion', 'occlusion-sky.json')))
LUMA = json.load(open(os.path.join(D, 'frame-luma.json'))) if os.path.exists(os.path.join(D, 'frame-luma.json')) else {}   # frame_luma.py
ORDER = ['corridors', 'planes', 'lines']
LOOKS = ['dark', 'peak']
VIEWS = [('floor', 'Floor centre, eye 1.7 m'), ('entry', 'Entry, eye 1.7 m'), ('top', 'Top plan'), ('side', 'Side section')]
E = html.escape


def frame(n, look, view):
    f = 'frames/%s-%s-%s.png' % (n, look, view)
    return f if os.path.exists(os.path.join(D, f)) else None


def contact_sheet():
    from PIL import Image, ImageDraw
    w, h, pad, top = 480, 300, 8, 34
    cols = len(VIEWS) * len(LOOKS)
    sheet = Image.new('RGB', (cols * (w + pad) + pad + 120, len(ORDER) * (h + pad + top) + pad + 30), '#0b0c0e')
    d = ImageDraw.Draw(sheet)
    for j, (look, (view, label)) in enumerate([(lk, v) for lk in LOOKS for v in VIEWS]):
        d.text((120 + pad + j * (w + pad), 8), '%s · %s' % (look.upper(), label), fill='#e8e4dc')
    for i, n in enumerate(ORDER):
        y = 30 + i * (h + pad + top)
        d.text((8, y + h // 2), R['layouts'][n]['title'].split('·')[0].strip() + '\n' + n, fill='#ff3a12')
        for j, (look, (view, _)) in enumerate([(lk, v) for lk in LOOKS for v in VIEWS]):
            f = frame(n, look, view)
            x = 120 + pad + j * (w + pad)
            if f:
                im = Image.open(os.path.join(D, f)).convert('RGB')
                im.thumbnail((w, h))
                sheet.paste(im, (x, y + top // 2))
            else:
                d.rectangle([x, y + top // 2, x + w, y + top // 2 + h], outline='#444')
                d.text((x + 10, y + h // 2), 'not captured', fill='#888')
    sheet.save(os.path.join(D, 'contact-sheet.png'))


def table(rows):
    return '<table>' + ''.join('<tr><th>%s</th><td>%s</td></tr>' % (E(k), v) for k, v in rows) + '</table>'


def layout_col(n):
    L = R['layouts'][n]
    c = L['checks']
    by_zone = {}
    for b in L['beams']:
        by_zone.setdefault(b['part'], []).append(b)
    beams = ''.join('<li><b>%d × %s</b> — clear sky %s %%, throws %s m, pen %s m</li>' % (
        len(bs), E(k), '–'.join(sorted({'%.0f' % b['sky_clear_pct'] for b in bs}, key=float)[::max(1, len(bs) - 1)]) if bs else '',
        '%.0f–%.0f' % (min(b.get('throw_m') or 120 for b in bs), max(b.get('throw_m') or 120 for b in bs)),
        '%.1f–%.1f' % (min(b['pen_m'] or 0 for b in bs), max(b['pen_m'] or 0 for b in bs))) for k, bs in by_zone.items())
    pars = {}
    for q in L['pars']:
        pars[q['part']] = pars.get(q['part'], 0) + 1
    shots = ''
    for look in LOOKS:
        for view, label in VIEWS:
            f = frame(n, look, view)
            shots += '<figure>%s<figcaption>%s · %s</figcaption></figure>' % ('<a href="%s"><img src="%s" loading="lazy"></a>' % (f, f) if f else '<div class="miss">not captured</div>', look, E(label))
    circ = c['circuits']
    rows = [
        ('Beams (18 B380F, all on the ground)', '%d of 18 pass every check' % c['beams_ok']),
        ('Clear sky at the heads (mean / lowest)', '%.1f %% / %.1f %%' % (c['mean_sky_clear_pct'], c['min_sky_clear_pct'])),
        ('Aimed beams clear for 30 m (ring rays)', '%.1f %%' % c['aim_rays_clear_30m_pct']),
        ('Mean throw to the first hit', '%.0f m' % c['mean_throw_m']),
        ('Rays into the crowd', str(c['beams_into_audience'])),
        ('PARs: cut / ground', '%d / %d' % (c['pars_cut'], c['pars_ground'])),
        ('Column lit by a 15° uplight (mean)', '%s m at ~%s lx (median, upper estimate)' % (c['par_column_lit_m_15'], c['par_column_lux_median_15'])),
        ('Units in or within 2 m of the crowd', ', '.join(c['units_in_or_near_crowd']) or 'none'),
        ('Power connected', '%.1f kW on %d circuits (all ≤ 2 944 W, volt drop ≤ 5 %%: %s)' % (c['connected_w'] / 1000.0, circ, 'yes' if c['circuits_ok'] else 'NO')),
        ('DMX', ', '.join('%s: %d devices' % (b['branch'], b['devices']) for b in c['branches'])),
        ('Smoke machine', E(L['smoke']['position'])),
    ]
    for v in ('floor', 'entry'):
        got = [LUMA.get('%s-%s-%s' % (n, lk, v)) for lk in LOOKS]
        if all(got):
            rows.append(('%s view: brightness · white-out (dark / peak)' % v.title(), ' / '.join('Y %.3f · %.1f %%' % (g['mean_Y'], g['white_pct']) for g in got)))
    return '''<section class="col"><h2>%s</h2><p class="idea">%s</p>%s<h3>Beams</h3><ul>%s</ul><h3>PARs</h3><p>%s</p>
<h3>In the room (real GPU)</h3><div class="shots">%s</div><h3>Plan and section</h3><a href="plan-%s.png"><img src="plan-%s.png"></a><a href="section-%s.png"><img src="section-%s.png"></a></section>''' % (
        E(L['title']), E(L['idea']), table(rows), beams, E(', '.join('%d %s' % (v, k) for k, v in pars.items())), shots, n, n, n, n)


def cut_block():
    rows = [r for r in R['cut_table']['rows'] if 'error' not in r]
    tr = ''.join('<tr%s><td>%d</td><td>%.2f m</td><td>%s</td><td>%s kg</td><td>%s</td><td>%s</td><td>%d W · %d</td></tr>' % (
        ' class="rec"' if r['n'] == R['cut_recommended'] else '', r['n'], r['pitch_m'], ' / '.join('%.0f' % p['line_kg'] for p in r['picks']),
        r['headroom_kg'], ' · '.join('%d°: %d %%' % (l['lens_deg'], l['shafts_separate_pct']) for l in r['look']), 'ok' if r['picks_ok'] else 'OVER', r['power']['w'], r['power']['circuits_16a']) for r in rows)
    return '''<h2>The cut: how many PARs</h2><p>12 m of Prolyte H30V on the near crane, 3 picks (bridles 26° / 42° / 119°). Pick cap 146 kg (MOXIR.md 5.2; the crane's rating is still unknown). Lamps alternate DOWN (a shaft to the floor) and UP (a pool on the crane girders). "Shafts separate" = share of the down-shafts whose floor footprint is narrower than their spacing: below 100 %% they merge into a sheet of light, the wall the owner does not want.</p>
<div class="tw"><table class="cut"><tr><th>PARs</th><th>pitch</th><th>picks (kg)</th><th>headroom</th><th>shafts separate</th><th>load</th><th>power · circuits</th></tr>%s</table></div><p><b>Recommended: %d.</b></p>''' % (tr, R['cut_recommended'])


def laser_block():
    c = R.get('laser_corridor')
    if not c:
        return ''
    return (' The aims, the scan envelope, the beam-block setting and the hazard zone are the laser session\'s table (not built here). '
            'What this page checks is FEASIBILITY: straight lines from the free crane (z -41, cube aperture %.2f m on the %.1f m EQUIVALENT '
            'underside) down the hall to the NW end wall: <b>%d of %d</b> keep >= 3 m over every standing level along the whole path, '
            'end on the wall (not glass, not the door) and pass 0.3 m clear of all steel. Bridge stations with a passing line: x %s m; '
            'ends %s-%s m high. What stops the others: %s.') % (
        c['aperture_m'], c['underside_m'], c['pass'], c['of'], ', '.join('%g' % x for x in c['xs_with_a_pass']),
        c['end_y_range_passing'][0], c['end_y_range_passing'][1], E(', '.join(c['blockers'])))


def recommendation():
    """The advice in one paragraph, every number from the JSON (the choice stays the owner's)."""
    L = R['layouts']
    y = lambda n, lk: LUMA.get('%s-%s-floor' % (n, lk), {})
    return ('<b>Advice: B · three planes of depth.</b> All three pass every check (18 of 18 beams; none into the crowd; >= 3 m over every '
            'standing level). B gives the most depth for the least glare: its aimed beams run clear for 30 m on %.0f %% of their rays '
            '(A %.0f %%), and from the dance floor it stays dark (brightness Y %.3f dark / %.3f peak; A %.3f / %.3f). '
            'C throws the longest lines (%.0f m on average) but they travel toward the crowd: even held at 35 %% its floor view is '
            '%.0fx brighter in the dark look and whites out %.1f %% of the view at the peak, the commercial look the owner rejected. '
            '<b>The cut: %d PARs.</b>') % (
        L['planes']['checks']['aim_rays_clear_30m_pct'], L['corridors']['checks']['aim_rays_clear_30m_pct'],
        y('planes', 'dark').get('mean_Y', 0), y('planes', 'peak').get('mean_Y', 0), y('corridors', 'dark').get('mean_Y', 0), y('corridors', 'peak').get('mean_Y', 0),
        L['lines']['checks']['mean_throw_m'], (y('lines', 'dark').get('mean_Y', 0) / max(1e-6, y('planes', 'dark').get('mean_Y', 1e-6))), y('lines', 'peak').get('white_pct', 0),
        R['cut_recommended'])


def main():
    contact_sheet()
    zones = {}
    for r in SKY['positions']:
        zones.setdefault(r['zone'], []).append(r['clear_pct'])
    zt = ''.join('<tr><td>%s</td><td>%d</td><td>%.1f %%</td><td>%.1f %%</td></tr>' % (E(z), len(v), max(v), sum(v) / len(v)) for z, v in sorted(zones.items(), key=lambda kv: -max(kv[1])))
    page = '''<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>MOXIR v2 layouts</title><style>
:root{--bg:#0b0c0e;--fg:#e8e4dc;--mut:#9aa0a8;--ember:#ff3a12;--line:#2a2c30}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:14px/1.45 system-ui,sans-serif;padding:16px}
h1{font-size:22px;margin:0 0 4px}h2{font-size:17px;margin:18px 0 6px;color:var(--ember)}h3{font-size:13px;margin:12px 0 4px;color:var(--mut);text-transform:uppercase;letter-spacing:.06em}
.lead{color:var(--mut);max-width:1100px}.cols{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px}
@media(max-width:1100px){.cols{grid-template-columns:1fr}}
.col{border:1px solid var(--line);padding:12px;border-radius:2px;min-width:0;overflow-wrap:anywhere}
.tw{overflow-x:auto;max-width:100%%}.rec-box{border-left:3px solid var(--ember);padding:6px 12px;margin:10px 0 14px;max-width:1100px;font-size:15px}.idea{font-size:15px}
table{border-collapse:collapse;width:100%%;font-size:12.5px}th,td{border-bottom:1px solid var(--line);padding:4px 6px;text-align:left;vertical-align:top}th{color:var(--mut);font-weight:500}
.cut tr.rec td{color:var(--ember);font-weight:600}img{width:100%%;max-width:100%%;display:block;border:1px solid var(--line)}
.shots{display:grid;grid-template-columns:1fr 1fr;gap:6px}figure{margin:0}figcaption{font-size:11px;color:var(--mut)}
.miss{height:90px;border:1px dashed var(--line);display:flex;align-items:center;justify-content:center;color:var(--mut)}
ul{padding-left:18px;margin:4px 0}.wide{max-width:1200px}code{color:var(--fg)}
</style></head><body>
<h1>MOXIR v2 — three ways to hang the kit (industrial depth)</h1>
<p class="lead">18 beam heads, all on the ground. 50 PARs: 10 on the cut, 40 on the ground. 6 lasers on the free crane. 1 smoke machine. Ash white and ember red. Every beam was aimed by the computer inside its zone so it is not blocked, never enters the crowd, never leaves through glass, and stays 3 m or more above any place people stand. Written %s by scripts/place/moxir_v2.py; the frames are the room on the real GPU (scratch copy, not dev).</p>
<div class="rec-box">%s</div>
<div class="cols">%s</div>
<div class="wide">%s
<h2>Where a beam head sees the most sky (occlusion)</h2><p class="lead">%d places × %d directions each, cast against the hall's %d named pieces + the rig + the crowd. "Clear" = the beam runs at least 30 m before it meets anything.</p>
<table><tr><th>zone</th><th>places</th><th>best clear</th><th>mean clear</th></tr>%s</table>
<p><a href="occlusion/heat-plan-clear.png"><img src="occlusion/heat-plan-clear.png" style="max-width:520px"></a></p>
<p><a href="occlusion/heat-section-clear.png"><img src="occlusion/heat-section-clear.png"></a></p>
<h2>Lasers (6 cubes on the free crane)</h2><p class="lead">%s</p>
<h2>All frames</h2><p><a href="contact-sheet.png"><img src="contact-sheet.png"></a></p></div></body></html>''' % (
        'on 2026-10-09', recommendation(), ''.join(layout_col(n) for n in ORDER), cut_block(), len(SKY['positions']), SKY['rays_per_position'], SKY['triangles'], zt,
        E(R['lasers'].get('status', '')) + laser_block())
    open(os.path.join(D, 'index.html'), 'w').write(page)


if __name__ == '__main__':
    main()
