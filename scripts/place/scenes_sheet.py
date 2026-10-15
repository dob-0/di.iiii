#!/usr/bin/env python3
"""scenes_sheet.py — the owner's picture per scene: an HTML sheet of a show's scenes file (venue-to-show skill, step "scenes sheet").

    python3 -I scenes_sheet.py SCENES.json OUT.html [--meta META.json] [--front FRONT.html]

SCENES.json: the scenes file (scenes[], palette[], beam_wheel{}, loop_s). Every scene row is read from it: title, intent, parts with
colour and level, motion, heads, cue timing. META.json (optional): {"title", "subtitle_html", "footer_html", "acts": {"1": {"name",
"colour"}}, "nav": [["#id", "label"]]}. FRONT.html (optional): the show's own essays (palette, sources, rules) inserted before the scenes.
Nothing here names a production: the title and the act names come from META.json or default to "Scenes" and "Act n". Writes only OUT."""
import argparse, html, json, os
e = html.escape
SPN = {'all': 'together', 'alternate': 'neighbours opposite', 'left-right': 'mirrored left/right', 'ripple': 'a ripple across'}
PAT = {'nod': 'lean toward the floor and back', 'wave': 'a lean wave', 'circle': 'a bow-tie turn', 'figure8': 'an X (four petals)'}
FX = {'breathe': 'breathes', 'pulse': 'pulses', 'sine': 'a wave', 'chase': 'a chase', 'comet': 'a comet', 'sparkle': 'sparkles', 'bars': 'bars flip',
      'blocks': 'blocks flip', 'pingpong': 'ping-pong', 'radar': 'a radar line', 'pump': 'pumps on the beat', 'strobe': 'strobe (under 3 a second)'}
KIND = {'up-pl5403': 'washes', 'up-b380f': 'beams', 'ext-lc-ultra-mk2': 'lasers', 'up-la40wf': 'lasers'}
BEAMS = {'plane 1 (behind the DJ)', 'side line left', 'side line right'}
def sw(c, small=False): return f'<i class="{"s" if small else ""}" style="background:{c}"></i>'
def moves(s):
    m, h = s['motion'], s['heads']; bits = []
    if m:
        k = sorted({KIND[x] for x in m['kinds']})
        dirn = {'x': ', left to right', 'x-': ', right to left', 'y': ', toward the entrance', 'y-': ', toward the DJ', 'radial': ', out from the DJ'}.get(m['spatial'], '')
        bits.append(f"{' + '.join(k)}: {FX[m['mode']]} at {m['bpm']} bpm{dirn}")
    if h: bits.append(f"beams: {PAT[h['pattern']]}, {SPN[h['spatial']]}, every {h['period_s']:g} s, up to {h['tilt_deg']}&deg; off vertical")
    return '<br>'.join(bits)


CSS = '''
:root{--bg:#f6f4ef;--ink:#1b1a18;--mute:#6b675f;--line:#d9d4ca;--card:#fff;--ember:#ff3a12}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif}
main{max-width:960px;margin:0 auto;padding:16px}h1{font-size:24px;margin:8px 0 4px}h2{font-size:19px;margin:28px 0 8px;border-top:2px solid var(--ink);padding-top:10px}
h3{font-size:16px;margin:24px 0 4px;color:var(--ink)}p{margin:6px 0}.m,.t,.pp,.note{color:var(--mute);font-size:13px}code{font-size:12px}
figure{margin:0 0 14px}.strip{display:flex;gap:4px;overflow:hidden}.strip img{flex:1 1 0;min-width:0;height:120px;object-fit:cover;border-radius:0;background:#000}
figcaption{font-size:14px;margin-top:4px}blockquote{margin:8px 0;padding:6px 12px;border-left:3px solid var(--ember);background:var(--card)}
ol li,ul li{margin:4px 0}article{background:var(--card);border:1px solid var(--line);padding:10px 12px;margin:0 0 8px}
.hd{display:flex;flex-wrap:wrap;gap:4px 10px;align-items:baseline}.n{font-variant-numeric:tabular-nums;color:var(--mute)}.mv{font-size:14px}
.sws{display:flex;flex-wrap:wrap;gap:6px 14px;margin:6px 0}.sw{display:inline-flex;flex-wrap:wrap;align-items:center;gap:4px 6px;font-size:13px}
i{display:inline-block;width:22px;height:16px;border:1px solid #0003;flex:none;vertical-align:middle}i.s{width:12px;height:12px}
.pal{display:flex;gap:10px;background:var(--card);border:1px solid var(--line);padding:8px 10px;margin:0 0 6px}.pal>i{width:44px;height:44px}
.pal>div{min-width:0;overflow-wrap:anywhere}td{padding:2px 10px 2px 0;vertical-align:top;font-size:14px}nav a{margin-right:10px;color:var(--ink)}
'''


def build(d, meta=None, front=''):
    meta = meta or {}
    PAL = d.get('palette', []); NAME = {p['hex']: p['name'] for p in PAL}; ORDER = [p['hex'] for p in PAL]; WH = d.get('beam_wheel', {})
    ACTS = meta.get('acts', {})
    rows = ''; cur = 0; t0 = 0
    for n, s in enumerate(d['scenes'], 1):
        if s['act'] != cur:
            cur = s['act']; a = ACTS.get(str(cur), {})
            rows += f'<h3 id="act{cur}">Act {cur}{" &middot; " + e(a["name"]) if a.get("name") else ""}</h3>'
            if a.get('colour'): rows += f'<p class="m">Colour: {e(a["colour"])}</p>'
        on_beam = {v[0] for k, v in s['parts'].items() if k in BEAMS}
        sws = ''
        for c in sorted({v[0] for v in s['parts'].values()}, key=lambda c: ORDER.index(c) if c in ORDER else 99):
            b = (f' <span class="m">&rarr; beams: {e(WH[c]["slot"])}</span> {sw(WH[c]["hex"], 1)}<code>{WH[c]["hex"]}</code>'
                 if c in on_beam and c in WH and WH[c]['hex'] != c else '')
            sws += f'<span class="sw">{sw(c)}{e(NAME.get(c, c))} <code>{c}</code>{b}</span>'
        parts = ', '.join(f"{e(k.replace(' (behind the DJ)', ''))} {e(NAME.get(v[0], v[0]))} {round(v[1] * 100)}%" for k, v in s['parts'].items())
        note = f'<p class="note">{e(s["notes"])}</p>' if s.get('notes') else ''
        mm, ss = divmod(t0, 60)
        rows += (f'<article><div class="hd"><span class="n">{n:02d}</span><b>{e(s["title"])}</b><span class="t">at {mm}:{ss:02d} &middot; fade {s["cue"]["fade_s"]} s &middot; hold {s["cue"]["hold_s"]} s</span></div>'
                 f'<p>{e(s["intent"])}</p><p class="mv">{moves(s)}</p><div class="sws">{sws}</div><p class="pp">{parts}</p>{note}</article>')
        t0 += s['cue']['fade_s'] + s['cue']['hold_s']
    title = e(meta.get('title', 'Scenes'))
    loop = f' &middot; the loop runs {d["loop_s"] // 60} min {d["loop_s"] % 60} s, then starts again' if d.get('loop_s') else ''
    acts = sorted({s['act'] for s in d['scenes']})
    nav = ''.join(f'<a href="{h}">{e(t)}</a>' for h, t in meta.get('nav', [])) + ''.join(f'<a href="#act{a}">Act {a}</a>' for a in acts)
    return f'''<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light"><title>{title}</title><style>{CSS}</style></head><body><main>
<h1>{title}</h1>
<p class="m">{meta.get('subtitle_html', '')}{loop}</p>
<nav>{nav}</nav>
{front}
<h2>The {len(d['scenes'])} scenes</h2>
{rows}
<p class="m">{meta.get('footer_html', '')}</p>
</main></body></html>'''


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    ap.add_argument('scenes'); ap.add_argument('out')
    ap.add_argument('--meta', help='JSON: title, subtitle_html, footer_html, acts, nav')
    ap.add_argument('--front', help='HTML fragment inserted before the scenes')
    a = ap.parse_args(argv)
    meta = json.load(open(a.meta)) if a.meta else {}
    front = open(a.front).read() if a.front else ''
    page = build(json.load(open(a.scenes)), meta, front)
    open(a.out, 'w').write(page); print(a.out, len(page), 'bytes')


if __name__ == '__main__':
    main()
