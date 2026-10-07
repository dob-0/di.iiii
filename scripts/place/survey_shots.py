#!/usr/bin/env python3
"""Add the lights audit's shot list to a COPY of the 10-08 site survey page (2026-10-08).

design_paint.py writes shot-list.json: every beam path no photo sees yet, as a place to stand, a way to point and what
to look for. The owner walks the hall with the survey page on his phone; this puts those shots into it as one more
section, in the page's own style, before "the list". The source page is never changed: the result is a new file.

  python3 -I scripts/place/survey_shots.py --survey ~/di-backups/moxir-pages-2026-10-07/moxir-survey.html \
      --shots ~/Downloads/moxir/stage/occlusion/shot-list.json --out ~/Downloads/moxir/stage/occlusion/moxir-survey.html
"""
import argparse, html, json, os

MARK = '<h2>the list</h2>'


def section(shots):
    li = []
    for i, s in enumerate(shots, 1):
        sx, _, sz = s['stand_m']
        li.append('<li><b>L%d · %s</b>: stand at x %+.0f, z %+.0f (%s), face %s, tilt %s. Look for: %s. <i>%s</i></li>' % (
            i, html.escape(s['for']), sx, sz, where(sx, sz), facing(s['point_yaw_deg']), tilt(s['point_pitch_deg']), html.escape(s['look_for']), html.escape(s['how'])))
    return ('<h2>lights &amp; lasers: paths no photo shows yet, and things to check</h2>\n'
            '<p class="sub">From the 10-08 light audit (design_paint.py): every beam of the painted design whose path no photo sees, and every path where the point cloud or a photo shows something the model lacks (marked check). '
            'x = metres across (0 = the middle of the nave, + = house right, facing the DJ), z = metres along (0 = the joint, '
            '+ toward the entry, the DJ at +23). Shoot each one wide and level, then once straight up.</p>\n'
            '<ul class="tools">\n' + '\n'.join(li) + '\n</ul>\n')


def where(x, z):
    span = 'left span' if x < -12 else ('right span' if 12 < x < 36 else ('span 4' if x >= 36 else 'nave'))
    zone = 'far half, behind the press' if z < -3 else ('by the joint' if z < 3 else ('between the press and the DJ' if z < 21 else 'beside or behind the dance floor'))
    return '%s, %s' % (span, zone)


def facing(yaw):
    names = [(0, 'the far gate'), (90, 'house right'), (180, 'the entry'), (-90, 'house left')]
    best = min(names, key=lambda n: abs(((yaw - n[0]) + 180) % 360 - 180))
    off = ((yaw - best[0]) + 180) % 360 - 180
    return best[1] if abs(off) < 10 else '%s, turned %d° %s' % (best[1], abs(off), 'right' if off > 0 else 'left')


def tilt(p):
    return 'straight up' if p >= 80 else ('level' if abs(p) < 8 else '%d° up' % p if p > 0 else '%d° down' % -p)


def main():
    a = argparse.ArgumentParser()
    a.add_argument('--survey', required=True)
    a.add_argument('--shots', required=True)
    a.add_argument('--out', required=True)
    o = a.parse_args()
    src = open(os.path.expanduser(o.survey)).read()
    if MARK not in src:
        raise SystemExit('the survey page has no "%s" heading to insert before' % MARK)
    shots = json.load(open(os.path.expanduser(o.shots)))
    out = os.path.expanduser(o.out)
    if os.path.abspath(out) == os.path.abspath(os.path.expanduser(o.survey)):
        raise SystemExit('refusing to overwrite the source page: write a copy')
    open(out, 'w').write(src.replace(MARK, section(shots) + MARK, 1))
    print('%s: %d shots added before "the list"' % (out, len(shots)))


if __name__ == '__main__':
    main()
