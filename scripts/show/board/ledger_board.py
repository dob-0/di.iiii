#!/usr/bin/env python3
"""ledger_board.py — a show's work board: one HTML page from the owner ledger, the chats' lane and handover files, git and GitHub.

Usage: ledger_board.py --config FILE [--out FILE]
  --config  the show's board.json (see board.example.json); lanes/, facts.md sit next to it
  --out     the page to write (default: stdout)

Everything that names a show lives in the config, never here. Born 2026-11-12 for a concert board written by its
lead chat as ~/work/<show>/board/build.py; board.py (same folder) stays the lane-only board of a show night.
Lanes: <config dir>/lanes/<chat>.md with lines NOW: / NEXT: / NEEDS OWNER: / RISK: (each chat writes its own).
Facts: <config dir>/facts.md, "## card title" then "- line" (optional) -> the first section.
"""
import argparse, html, json, os, re, subprocess, datetime, glob, sys

HOME = os.path.expanduser('~')
TPL = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'ledger_page.html')
CFG, HERE, LEDGER, REPORTS, FIRST_ROW, CHATS, BY_SESSION, AREAS, PRS = {}, '', '', '', 0, [], {}, [], []


def load(path):
    """Read the show's config into the module's names (paths may start with ~)."""
    global CFG, HERE, LEDGER, REPORTS, FIRST_ROW, CHATS, BY_SESSION, AREAS, PRS
    CFG = json.load(open(path, encoding='utf-8')); HERE = os.path.dirname(os.path.abspath(path))
    ex = os.path.expanduser
    LEDGER = ex(CFG['ledger']); REPORTS = ex(CFG.get('reports', '')).rstrip('/') + '/'
    FIRST_ROW = int(CFG.get('firstRow', 0))
    CHATS = [(c['name'], c['session'], c['what'], c.get('handover', ''), c.get('trees', [])) for c in CFG['chats']]
    BY_SESSION = {c[1]: c[0] for c in CHATS}
    AREAS = [(a['name'], a['what'], a.get('match', '')) for a in CFG['areas']]
    PRS = [(q['repo'], q['number'], q['note']) for q in CFG.get('prs', [])]


KINDS = {'bad': 'Problem', 'you': 'Try it', 'run': 'Working', 'open': 'Not started', 'done': 'Done'}

def esc(x): return html.escape(x or '')
def sh(*a, t=30):
    try: return subprocess.run(a, capture_output=True, text=True, timeout=t).stdout.strip()
    except Exception: return ''

def rows():
    out = {}
    for line in open(LEDGER, encoding='utf-8'):
        m = re.match(r'^\| ?N(\d+)(\.[\d.]+)? \|([^|]*)\|([^|]*)\|([^|]*)\|([^|]*)\|', line)
        if not m or int(m.group(1)) < FIRST_ROW: continue
        n = int(m.group(1)); f = [x.strip() for x in m.groups()[2:]]
        r = out.setdefault(n, {'id': n})
        if m.group(2) is None:
            r['when'] = f[0]
            words = line.rstrip('\n').rstrip('|').split('|')[-1].strip()
            r['words'] = words or f[1].replace('verbatim, not restated:', '').strip()
            s = re.search(r'session ([0-9a-f]{8})', f[3]); r['session'] = s.group(1) if s else ''
        else:
            r['ask'], r['state'] = f[1], f[2]
    return {n: r for n, r in out.items() if r.get('session') in BY_SESSION}

def kind(state):
    s = (state or 'NEW').upper()
    if re.search(r'\bFAILED|REFUSED|BROKEN|\bRED\b', s): return 'bad'
    if re.match(r'(DONE|CLOSED|ANSWERED|SENT|NOTED|SAME AS|CHECKED|RECEIVED|STATUS REPORTED|FOUND|EXPLAINED)', s): return 'done'
    if re.match(r'(INSTALLED|BUILT|PLACED|FIXED|PARTIAL|PART DONE|SHOWN|SHEET|ASKED|ADVISED|DESIGN BACK|PDFS|SWITCH|FILES SAVED|PHONE AT|PUSHED)', s) \
       or re.search(r'YOUR (LOOK|HANDS|YES|WORD)|WAITS FOR YOU', s): return 'you'
    if re.match(r'(IN PROGRESS|BUILDING|ROUND|RUNNING)', s): return 'run'
    return 'open'

def area(r):
    t = ((r.get('ask') or '') + ' ' + (r.get('words') or '')).lower()
    for name, _, rx in AREAS:
        if rx and re.search(rx, t): return name
    return 'Other'

def tree_line(t):
    p = os.path.join(os.path.expanduser(CFG.get('treesRoot', '~/work')), t)
    b = sh('git', '-C', p, 'branch', '--show-current')
    last = sh('git', '-C', p, 'log', '-1', '--format=%cd', '--date=format:%d %b %H:%M')
    up = sh('git', '-C', p, 'rev-parse', '--abbrev-ref', '@{u}')
    ahead = sh('git', '-C', p, 'rev-list', '--count', '@{u}..HEAD') if up else ''
    dirty = len([l for l in sh('git', '-C', p, 'status', '--porcelain').splitlines() if l])
    safe = bool(up) and ahead == '0' and dirty == 0
    why = 'on GitHub' if safe else ('not on GitHub' if not up else f'{ahead} commits not pushed') + (f', {dirty} files not committed' if dirty else '')
    return safe, f'<li><span class="{"ok" if safe else "no"}">{esc(why)}</span> · {esc(b)} · last commit {esc(last)}</li>'

def lane(name, handover):
    f = f'{HERE}/lanes/{name}.md'
    if os.path.exists(f):
        when = datetime.datetime.fromtimestamp(os.path.getmtime(f)).strftime('%d %b %H:%M')
        out = []
        for l in open(f, encoding='utf-8'):
            m = re.match(r'^(NOW|NEXT|NEEDS OWNER|RISK|BUILDER[^:]*):\s*(.*)', l.strip())
            if m: out.append(f'<p class="lane"><b>{esc(m.group(1))}</b>{esc(m.group(2)[:200])}</p>')
        return ''.join(out), f'its own lane file, {when}'
    h = REPORTS + handover
    if handover and os.path.exists(h):
        when = datetime.datetime.fromtimestamp(os.path.getmtime(h)).strftime('%d %b %H:%M')
        txt = open(h, encoding='utf-8').read()
        m = re.search(r'^## (Update[^\n]*)\n((?:- [^\n]*\n(?:  [^\n]*\n)*){1,2})', txt, re.M)
        if m:
            body = re.sub(r'\s+', ' ', m.group(2))[:330]
            return f'<p class="lane"><b>LAST NOTE</b>{esc(m.group(1)[:70])}</p><p class="state">{esc(body)} …</p>', f'its handover file, {when} (no lane file yet)'
        return '', f'its handover file, {when} (no lane file yet)'
    return '', 'no file'

def checks(repo, n):
    t = sh('gh', 'pr', 'checks', str(n), '-R', repo)
    try: v = json.loads(sh('gh', 'pr', 'view', str(n), '-R', repo, '--json', 'state,url,isDraft'))
    except Exception: v = {'state': 'unknown', 'url': ''}
    return [l.split('\t')[:2] for l in t.splitlines() if '\t' in l], v

def card(r):
    k = r['kind']; state = esc(r.get('state', 'NEW'))
    return f'''<article class="row k-{k}">
  <div class="top"><span class="chip">{KINDS[k]}</span><span class="nid">N{r['id']}</span><span class="who">{esc(BY_SESSION.get(r.get('session'), '?'))}</span></div>
  <p class="ask">{esc((r.get('ask') or r.get('words') or '')[:260])}</p>
  <p class="state">{state[:260]}</p>
  <details><summary>Your words, {esc(r.get('when',''))}</summary><p class="words">“{esc(r.get('words'))}”</p></details>
</article>'''

def facts():
    f = HERE + '/facts.md'
    if not os.path.exists(f): return ''
    when = datetime.datetime.fromtimestamp(os.path.getmtime(f)).strftime('%d %b %H:%M')
    cards, title, items = [], None, []
    def flush():
        if title: cards.append(f'<article class="row agent"><div class="top"><span class="chip">{esc(title)}</span></div>' + ''.join(f'<p class="lane">{esc(i)}</p>' for i in items) + '</article>')
    for l in open(f, encoding='utf-8'):
        l = l.strip()
        if l.startswith('## '): flush(); title, items = l[3:], []
        elif l.startswith('- '): items.append(l[2:])
    flush()
    return f'<section><header><h2>The show</h2><p>The facts and what is still owed, each with its source (facts.md, {when}).</p></header><div class="grid">{"".join(cards)}</div></section>'

def render():
    R = rows(); now = datetime.datetime.now().strftime('%a %d %b, %H:%M')
    tally = dict.fromkeys(KINDS, 0)
    for r in R.values():
        r['kind'] = kind(r.get('state')); r['area'] = area(r); tally[r['kind']] += 1
    order = ['bad', 'you', 'open', 'run']
    # agents
    cards = []
    for name, sess, what, handover, trees in CHATS:
        mine = [r for r in R.values() if r.get('session') == sess]
        c = {k: len([r for r in mine if r['kind'] == k]) for k in KINDS}
        body, src = lane(name, handover)
        tl = ''.join(tree_line(t)[1] for t in trees)
        cards.append(f'''<article class="row agent"><div class="top"><span class="chip">{esc(name)}</span><span class="who">{c['bad']} problem · {c['you']} try it · {c['run']} working · {c['open']} not started</span></div>
  <p class="ask">{esc(what)}</p>{body}<ul class="brs">{tl}</ul><p class="state">Source: {esc(src)}</p></article>''')
    agents = f'<section><header><h2>Who does what</h2><p>One card per chat working on {esc(CFG.get("name", CFG["title"]))}, from its own files.</p></header><div class="grid">{"".join(cards)}</div></section>'
    sections = []
    for name, what, _ in AREAS:
        rs = [r for r in R.values() if r['area'] == name and r['kind'] != 'done']
        rs.sort(key=lambda r: (order.index(r['kind']), -r['id']))
        nd = len([r for r in R.values() if r['area'] == name and r['kind'] == 'done'])
        if not rs and not nd: continue
        sections.append(f'<section><header><h2>{esc(name)}</h2><p>{esc(what)} {len(rs)} open, {nd} done.</p></header><div class="grid">{"".join(card(r) for r in rs)}</div></section>')
    # branches
    lines = []; unsafe = 0
    for p in sorted(glob.glob(os.path.expanduser(CFG['treeGlob']))) if CFG.get('treeGlob') else []:
        b = sh('git', '-C', p, 'branch', '--show-current')
        if not re.search(CFG.get('branchMatch', ''), b): continue
        ok, li = tree_line(os.path.basename(p)); unsafe += (not ok); lines.append((ok, li))
    lines.sort(key=lambda x: x[0])
    branches = f'<section><header><h2>Is the work safe</h2><p>{unsafe} of {len(lines)} {esc(CFG.get('branchLabel', 'show'))} branches live only on this computer.</p></header><article class="row k-{"bad" if unsafe else "done"}"><ul class="brs">{"".join(l for _, l in lines)}</ul></article></section>'
    prs = []
    for repo, n, note in PRS:
        cs, v = checks(repo, n)
        items = ''.join(f'<li class="c-{esc(s.strip())}"><span>{esc(s.strip())}</span>{esc(c)}</li>' for c, s in cs)
        st = v.get('state', '').lower() + (' draft' if v.get('isDraft') else '')
        prs.append(f'<article class="pr"><div class="top"><a href="{esc(v.get("url"))}">#{n}</a><span class="chip">{esc(st)}</span></div><p class="ask">{esc(note)}</p><ul>{items}</ul></article>')
    tpl = open(TPL, encoding='utf-8').read()
    for k, v in (('NAME', esc(CFG.get('name', CFG['title']))), ('TITLE', esc(CFG['title'])), ('SUB', esc(CFG.get('sub', ''))), ('SHOWAT', esc(CFG.get('showAt', ''))), ('SOURCE', esc(CFG.get('source', 'scripts/show/board/ledger_board.py'))),
                 ('NOW', now), ('FACTS', facts()), ('AGENTS', agents), ('SECTIONS', ''.join(sections)), ('BRANCHES', branches), ('PRS', ''.join(prs)),
                 ('BAD', tally['bad']), ('YOU', tally['you']), ('RUN', tally['run']), ('OPEN', tally['open']), ('DONE', tally['done'])):
        tpl = tpl.replace('{{' + k + '}}', str(v))
    return tpl, f'rows {len(R)} tally {tally} unsafe {unsafe}/{len(lines)}'


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--config', required=True); ap.add_argument('--out', default=None)
    a = ap.parse_args(); load(a.config)
    page, note = render()
    if a.out:
        tmp = a.out + '.new'; open(tmp, 'w', encoding='utf-8').write(page + '\n'); os.replace(tmp, a.out)
    else:
        print(page)
    print(note, file=sys.stderr)


if __name__ == '__main__':
    main()
