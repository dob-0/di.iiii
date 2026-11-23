#!/usr/bin/env python3
"""board.py — the show board: board.md + lanes/*.md -> one HTML page in the di.iiii frame.

Usage: board.py [--src DIR] [--out FILE] [--watch]
  --src   folder with board.md and lanes/*.md       (default ~/di-health/rea)
  --out   the page to write                         (default <src>/global-view.html)
  --watch re-render when a source changes, and every 30 s (ages, clock); Ctrl-C / systemctl stop ends it

No dependencies. The owner's colour legend draws the marks at the start of a line:
  !! needs you · ?? question · ++ done · .. running · -> idea · == summary · -- limit
A lane file has fixed keys (see README.md next to this script).
"""
import argparse, datetime, glob, html, os, re, sys, time

MARKS = {'!!': 'needs', '??': 'ask', '++': 'done', '..': 'run', '->': 'idea', '==': 'sum', '--': 'limit'}
MARK_PREFIX = tuple(k + ' ' for k in MARKS)
STATE_CLASS = {'running': 'run', 'blocked': 'needs', 'waiting-owner': 'ask', 'done': 'done', 'idle': 'limit', 'capped': 'needs'}
LANE_KEYS = ['job', 'state', 'now', 'last', 'next', 'needs-owner', 'claim', 'windows', 'risks', 'cost']
STALE_MIN = 20


def esc(s):
    return html.escape(s, quote=False)


def inline(s):
    s = esc(s)
    s = re.sub(r'`([^`]+)`', r'<code>\1</code>', s)
    s = re.sub(r'\*\*([^*]+)\*\*', r'<b>\1</b>', s)
    s = re.sub(r'\[([^\]]+)\]\((https?://[^)\s]+)\)', r'<a href="\2">\1</a>', s)
    s = re.sub(r'(?<!["=>])(https?://[^\s<]+)', r'<a href="\1">\1</a>', s)
    return s


def md(text):
    out, inul, intab, incode = [], False, False, False

    def close():
        nonlocal inul, intab
        if inul:
            out.append('</ul>'); inul = False
        if intab:
            out.append('</table>'); intab = False

    for ln in text.splitlines():
        if ln.startswith('```'):
            close()
            out.append('</pre>' if incode else '<pre>'); incode = not incode
            continue
        if incode:
            out.append(esc(ln)); continue
        s = ln.rstrip()
        if not s:
            close(); continue
        m = re.match(r'^(#{1,3})\s+(.*)', s)
        if m:
            close(); n = len(m.group(1)) + 1
            out.append(f'<h{n}>{inline(m.group(2))}</h{n}>'); continue
        if s.startswith(MARK_PREFIX):
            close(); k = s[:2]
            out.append(f'<div class="mark {MARKS[k]}"><span class="badge">{esc(k)}</span><span>{inline(s[3:])}</span></div>')
            continue
        if s.startswith('- '):
            if intab:
                out.append('</table>'); intab = False
            if not inul:
                out.append('<ul>'); inul = True
            out.append(f'<li>{inline(s[2:])}</li>'); continue
        if s.startswith('|'):
            cells = [c.strip() for c in s.strip().strip('|').split('|')]
            if all(re.fullmatch(r':?-{2,}:?', c) for c in cells):
                continue
            if inul:
                out.append('</ul>'); inul = False
            tag = 'td' if intab else 'th'
            if not intab:
                out.append('<table>'); intab = True
            out.append('<tr>' + ''.join(f'<{tag}>{inline(c)}</{tag}>' for c in cells) + '</tr>'); continue
        close(); out.append(f'<p>{inline(s)}</p>')
    close()
    if incode:
        out.append('</pre>')
    return '\n'.join(out)


def read_lane(path, now):
    name, d = os.path.basename(path)[:-3], {}
    with open(path, encoding='utf-8', errors='replace') as f:
        for ln in f:
            ln = ln.rstrip('\n')
            m = re.match(r'^#\s*lane:\s*(.+)', ln)
            if m:
                name = m.group(1).strip(); continue
            m = re.match(r'^([a-z-]+):\s*(.*)', ln)
            if m:
                d[m.group(1)] = m.group(2).strip()
    age = (now - datetime.datetime.fromtimestamp(os.path.getmtime(path))).total_seconds() / 60
    return name, d, age


def lane_card(name, d, age):
    state = d.get('state', 'idle').lower()
    cls = STATE_CLASS.get(state, 'limit')
    stale = age > STALE_MIN
    rows = ''.join(
        f'<div class="k">{esc(k)}</div><div class="v {"needs" if k == "needs-owner" and d.get(k, "-") not in ("", "-") else ""}">{inline(d.get(k, "-") or "-")}</div>'
        for k in LANE_KEYS if k != 'state')
    agetxt = f'{int(age)} min' if age < 90 else f'{age / 60:.1f} h'
    return (f'<section class="lane {cls}{" stale" if stale else ""}"><header><h3>{esc(name)}</h3>'
            f'<span class="pill {cls}">{esc(state)}</span><span class="age">{"stale · " if stale else ""}{agetxt} ago'
            f'{" · " + esc(d["session"]) if d.get("session") else ""}</span></header><div class="grid">{rows}</div></section>')


def render(src, out, show_at):
    now = datetime.datetime.now()
    board_path = os.path.join(src, 'board.md')
    board = open(board_path, encoding='utf-8', errors='replace').read() if os.path.exists(board_path) else '# board.md missing'
    lanes = [read_lane(p, now) for p in sorted(glob.glob(os.path.join(src, 'lanes', '*.md')))]
    needs = [(n, d['needs-owner']) for n, d, _ in lanes if d.get('needs-owner', '-') not in ('', '-')]
    needs += [('board', ln[3:]) for ln in board.splitlines() if ln.startswith('!! ')]
    claims = [(n, d['claim']) for n, d, _ in lanes if d.get('claim', '-') not in ('', '-')]
    left = show_at - now
    if left.total_seconds() > 0:
        h, m = divmod(int(left.total_seconds() // 60), 60)
        countdown = f'{h} h {m:02d} min to 18:00'
    else:
        countdown = 'show time'
    title = next((ln[2:].strip() for ln in board.splitlines() if ln.startswith('# ')), 'ReA global view')
    needs_html = ''.join(f'<div class="mark needs"><span class="badge">!!</span><span><b>{esc(n)}</b> · {inline(t)}</span></div>' for n, t in needs) or '<div class="mark done"><span class="badge">++</span><span>nothing waits on you right now</span></div>'
    claims_html = ''.join(f'<div class="mark run"><span class="badge">..</span><span><b>{esc(n)}</b> changes {inline(t)}</span></div>' for n, t in claims)
    doc = f'''<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="refresh" content="20"><title>{esc(title)}</title>
<style>
:root{{--bg:#000;--fg:#e8e8e8;--mute:#8b8b8b;--line:#262626;--card:#0b0b0b;
--needs:#ff3b30;--ask:#f5b400;--done:#2ecc71;--run:#3b9cff;--idea:#b388ff;--sum:#e8e8e8;--limit:#8b8b8b}}
*{{box-sizing:border-box;border-radius:0}}
body{{margin:0;background:var(--bg);color:var(--fg);font:15px/1.45 ui-sans-serif,system-ui,-apple-system,"Inter",sans-serif}}
a{{color:var(--run);text-decoration:none}}a:hover{{text-decoration:underline}}
code,pre,.age,.k,.badge{{font-family:ui-monospace,"JetBrains Mono",Menlo,monospace}}
.bar{{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:10px 16px;border-bottom:1px solid var(--line);position:sticky;top:0;background:var(--bg);z-index:2}}
.bar .brand{{font-weight:700;letter-spacing:.04em}}.bar .meta{{color:var(--mute);font-size:13px;text-align:right}}
main{{padding:12px 16px 48px;max-width:1400px;margin:0 auto}}
h1{{font-size:22px;margin:14px 0 6px}}h2{{font-size:17px;margin:26px 0 8px;padding-top:8px;border-top:1px solid var(--line)}}h3{{font-size:15px;margin:0}}
h4{{font-size:14px;margin:14px 0 4px;color:var(--mute)}}
p{{margin:6px 0}}ul{{margin:4px 0 8px;padding-left:20px}}li{{margin:2px 0}}
table{{border-collapse:collapse;width:100%;margin:6px 0 10px;font-size:14px;display:block;overflow-x:auto}}
th,td{{border:1px solid var(--line);padding:4px 8px;text-align:left;vertical-align:top}}th{{color:var(--mute);font-weight:600}}
pre{{background:var(--card);border:1px solid var(--line);padding:8px 10px;overflow-x:auto;font-size:13px}}
code{{background:#161616;padding:0 4px;font-size:13px}}
.mark{{display:flex;gap:10px;align-items:flex-start;padding:4px 0}}.mark .badge{{flex:0 0 auto;min-width:30px;text-align:center;font-weight:700;padding:0 4px;color:#000;background:var(--mute)}}
.mark.needs .badge{{background:var(--needs)}}.mark.ask .badge{{background:var(--ask)}}.mark.done .badge{{background:var(--done)}}.mark.run .badge{{background:var(--run)}}
.mark.idea .badge{{background:var(--idea)}}.mark.sum .badge{{background:var(--sum)}}.mark.limit .badge{{background:var(--limit)}}
.strip{{margin:10px 0 4px;padding:8px 12px;background:var(--card);border:1px solid var(--line)}}
.lanes{{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:12px;margin:8px 0}}
.lane{{background:var(--card);border:1px solid var(--line);border-left:4px solid var(--limit);padding:10px 12px}}
.lane.run{{border-left-color:var(--run)}}.lane.needs{{border-left-color:var(--needs)}}.lane.ask{{border-left-color:var(--ask)}}.lane.done{{border-left-color:var(--done)}}
.lane.stale{{opacity:.75}}.lane.stale .age{{color:var(--needs)}}
.lane header{{display:flex;flex-wrap:wrap;gap:8px;align-items:baseline;margin-bottom:8px}}.age{{color:var(--mute);font-size:12px;margin-left:auto}}
.pill{{font-size:12px;padding:0 6px;color:#000;background:var(--limit);font-weight:700}}.pill.run{{background:var(--run)}}.pill.needs{{background:var(--needs)}}.pill.ask{{background:var(--ask)}}.pill.done{{background:var(--done)}}
.lane .grid{{display:grid;grid-template-columns:max-content 1fr;gap:3px 10px;font-size:14px}}.k{{color:var(--mute);font-size:12px;padding-top:2px}}.v.needs{{color:var(--needs);font-weight:600}}
.foot{{color:var(--mute);font-size:12px;margin-top:30px;border-top:1px solid var(--line);padding-top:8px}}
</style></head><body>
<div class="bar"><span class="brand">di.iiii · ReA global view</span><span class="meta">{esc(countdown)} · rendered {now:%H:%M:%S} · refreshes every 20 s</span></div>
<main>
<div class="strip"><h4>needs you</h4>{needs_html}{claims_html}</div>
<h2 id="lanes">Lanes ({len(lanes)} chats)</h2>
<div class="lanes">{''.join(lane_card(*l) for l in lanes)}</div>
{md(board)}
<div class="foot">Source: {esc(board_path)} + {esc(os.path.join(src, "lanes"))}/*.md · rendered by scripts/show/board/board.py (di.iiii) · a lane older than {STALE_MIN} min is marked stale.</div>
</main></body></html>'''
    tmp = out + '.tmp'
    with open(tmp, 'w', encoding='utf-8') as f:
        f.write(doc)
    os.replace(tmp, out)
    return len(lanes), len(needs)


def snapshot(src):
    files = [os.path.join(src, 'board.md')] + sorted(glob.glob(os.path.join(src, 'lanes', '*.md')))
    return tuple((f, os.path.getmtime(f)) for f in files if os.path.exists(f))


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--src', default=os.path.expanduser('~/di-health/rea'))
    ap.add_argument('--out', default=None)
    ap.add_argument('--watch', action='store_true')
    ap.add_argument('--show-at', default='2026-11-07T18:00', help='local time of the show (ISO)')
    a = ap.parse_args()
    out = a.out or os.path.join(a.src, 'global-view.html')
    show_at = datetime.datetime.fromisoformat(a.show_at)
    prev, last = None, 0
    while True:
        cur = snapshot(a.src)
        if cur != prev or time.time() - last > 30:
            n, k = render(a.src, out, show_at)
            print(f'{datetime.datetime.now():%H:%M:%S} rendered {out}: {n} lanes, {k} needs-you', flush=True)
            prev, last = cur, time.time()
        if not a.watch:
            return 0
        time.sleep(5)


if __name__ == '__main__':
    sys.exit(main())
