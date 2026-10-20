#!/usr/bin/env python3
"""MOXIR v2.10 - forty washes (owner 2026-10-15 00:1x: "there are 40 washes", "we pick from the poligraf 40 washes",
"make it wild and as a lines and use the area not hard that we can connect dmx"). Poligraf's stock of UP-PL5403 is 40, not 50.

From the v2.9 rig (rigs/moxir-v2-8-matrix-2026-10-13.json = the v2.9 project's rig file, plus the v2.9 moves files in order
owner-edits, heads-u, heads-u-clear, heads-u-to-entrance, and then the positions the v2-9 PROJECT holds: --live <its document
json>, because hand moves in the Studio are not all in a moves file; the script prints how many units differ) only these change:
  * the 10 outside, 11 cut + 1 stage-key UP-PL5403 stay exactly (positions, aims, DMX);
  * the 14 back-row washes and the 14 red-tent side washes (28) become 18 "wild lines" of 3 washes (A B C D behind the DJ in the
    fenced crew zone; L and R across the floor), each line one DMX chain on universe 2 (8ch, footprint 8, 24 channels in a row).
    Positions are DATA: --lines <lines.json> (default below). Units are reused by nearest place, ids stable; 10 are removed.
    Every wash stands straight up (rotation [pi,0,0], the 'vertical' part rule), colour as the floor PARs (#ff3a12), y 0.31.
  * looks: each new part ("line A".."line R") takes the level the units had (back row: its part; L/R: the red tent part).
  * kit UP-PL5403 50 -> 40, rental ordered 40 / stock 40 (note: Poligraf stock 40, owner 2026-10-15), patch counts.
Not done here (named in the report): cable runs of the new lines, the fence check of every point beyond what is printed.
    python3 -I -B scripts/place/moxir_v2_10_forty.py --repo . --lines <lines.json> [--live <v2-9 document.json>]
  Project step (optional, a SCRATCH stack): --api http://127.0.0.1:4337/serverXR --project moxir-v2-10 --backup <dir> [--apply]
    needs the project to exist (scripts/place/copy_project.mjs); sends ONE ops batch at the version it read, then reads back.
    After it: scripts/place/physics_check.py --project <id> --hall <hall> --fix (the stored beam.length of a unit that now points up is
    stale: 6 leaks measured on first load), then node scripts/rigbuild/epic-build.mjs --api ... --project moxir-v2-10 --rig <the out file> --looks-only --apply
"""
import argparse, json, math, os, sys, time, copy, urllib.request

ap = argparse.ArgumentParser(); ap.add_argument('--repo', required=True)
ap.add_argument('--src', default='scripts/place/rigs/moxir-v2-8-matrix-2026-10-13.json')
ap.add_argument('--moves', default='owner-edits,heads-u,heads-u-clear,heads-u-to-entrance')
ap.add_argument('--lines', required=True); ap.add_argument('--live', default=None)
ap.add_argument('--out', default='scripts/place/rigs/moxir-v2-10-2026-10-15.json')
ap.add_argument('--fix-d', default='16.9,-15.7;17.0,-29.5', help='line D: the last point moved inside the fence (owner brief 2026-10-15)')
ap.add_argument('--fix-a', default='-27.0,-31.5', help='line A: the last point moved inside the fence, 1 m in from x -27.7 (lead decision 2026-10-15, keeps the ray direction)')
ap.add_argument('--fence', default='-27.7,17.3,-34.5,-7.5', help='x0,x1,z0,z1 of the fenced crew zone')
ap.add_argument('--api'); ap.add_argument('--project'); ap.add_argument('--token-file'); ap.add_argument('--backup'); ap.add_argument('--apply', action='store_true')
a = ap.parse_args()
R = lambda p: f'{a.repo}/{p}'
rig = json.load(open(R(a.src))); fx = {f['id']: f for f in rig['fixtures']}
PI = 3.141592653589793
# The project holds every unit at hall position + the show entity's transform (rig-show); moves files and --live are in project
# coordinates, the rig file and lines.json in the hall frame. OFF is read from --live (rig-show), else the v2.9 value.
OFF = [-0.0734789468, 0.0116035922, 0.1117513088]
if a.live:
    _d = json.load(open(a.live)); OFF = [e for e in _d.get('document', _d)['entities'] if e['id'] == 'rig-show'][0]['components']['transform']['position']
sub = lambda v: [x - o for x, o in zip(v, OFF)]

# 1. v2.9 moves (data files with their own provenance), then the live project's positions
for name in a.moves.split(','):
    m = json.load(open(R(f'scripts/place/rigs/moxir-v2-9-{name}-' + ('2026-10-13' if name == 'owner-edits' else '2026-10-14') + '.json')))
    if 'rows' in m:
        for row in m['rows']:
            if row['right'] in fx: fx[row['right']]['p'] = sub(row['right_new']['p']); fx[row['right']]['r'] = row['right_new']['r']
    for mv in m.get('moves', []):
        if mv['id'] in fx:
            fx[mv['id']]['p'] = sub(mv['position'])
            if 'rotation' in mv: fx[mv['id']]['r'] = mv['rotation']
differ = 0
if a.live:
    d = json.load(open(a.live)); doc = d.get('document', d)
    for e in doc['entities']:
        f = fx.get(e['id']); t = e.get('components', {}).get('transform')
        if f and t and e['type'] == 'spotLight':
            if max(abs(x - y) for x, y in zip(f['p'], sub(t['position']))) > 0.001: differ += 1
            f['p'] = [round(v, 4) for v in sub(t['position'])]; f['r'] = [round(v, 4) for v in t['rotation']]
print(f'moves applied: {a.moves}; units whose project position differs from rig+moves (project wins): {differ}')

# 2. which PL5403 go
pl = [f for f in rig['fixtures'] if f['type'] == 'up-pl5403']
tent = [f for f in pl if f['part'].startswith('red tent')]
back = [f for f in pl if f['part'] in ('hall steel', 'columns') and f['p'][2] < -15 and f['p'][0] > -30]
assert len(tent) == 14 and len(back) == 14, (len(tent), len(back))
L = json.load(open(a.lines))['lines']
x0, x1, z0, z1 = map(float, a.fence.split(','))
dpts = [tuple(map(float, s.split(','))) for s in a.fix_d.split(';')]
for ln in L:
    if ln['name'] == 'A': ln['points'][2] = [float(v) for v in a.fix_a.split(',')]
    if ln['name'] == 'D': ln['points'][1] = list(dpts[0]); ln['points'][2] = list(dpts[1])
out_of_fence = []
for ln in L:
    if ln['name'] in 'ABCD':
        for p in ln['points']:
            if not (x0 <= p[0] <= x1 and z0 <= p[1] <= z1): out_of_fence.append((ln['name'], p))
print('points outside the fenced zone:', out_of_fence or 'none')
def assign(points, pool):
    pairs = sorted(((math.hypot(p[0] - f['p'][0], p[1] - f['p'][2]), i, f['id']) for i, p in enumerate(points) for f in pool))
    got, used = {}, set()
    for dist, i, fid in pairs:
        if i in got or fid in used: continue
        got[i] = fid; used.add(fid)
    return got, [f['id'] for f in pool if f['id'] not in used]
abcd = [(ln['name'], p) for ln in L if ln['name'] in 'ABCD' for p in ln['points']]
lr = [(ln['name'], p) for ln in L if ln['name'] in ('L', 'R') for p in ln['points']]
g1, drop1 = assign([p for _, p in abcd], back); g2, drop2 = assign([p for _, p in lr], tent)
removed = drop1 + drop2; assert len(removed) == 10
plan = [(n, p, g1[i]) for i, (n, p) in enumerate(abcd)] + [(n, p, g2[i]) for i, (n, p) in enumerate(lr)]
newpart = {f['id']: f['part'] for f in pl}

# 3. DMX: each line 24 channels in a row on universe 2, in the order A B C D L R, in the space the 10 removed + 18 reused leave
kept = [f for f in pl if f['id'] not in {fid for _, _, fid in plan} and f['id'] not in removed]
busy = set()
for f in kept: busy |= set(range(f['dmx']['address'], f['dmx']['address'] + f['dmx']['footprint']))
lines_out, nxt = [], 1
def run(start, n):
    s = start
    while s + n - 1 <= 512:
        if not any(c in busy for c in range(s, s + n)): return s
        s += 8
    sys.exit('no free run in universe 2')
for ln in L:
    ids = [fid for n, p, fid in plan if n == ln['name']]
    s = run(88 + 1 if False else 89, 8 * len(ids))
    busy |= set(range(s, s + 8 * len(ids)))
    for k, fid in enumerate(ids): fx[fid]['dmx'] = {'universe': 2, 'address': s + 8 * k, 'footprint': 8, 'mode': '8ch', 'fixture': fx[fid]['dmx'].get('fixture'), 'line': f"WILD-{ln['name']}", 'from': 'MOXIR v2.10 wild lines: one DMX chain per line (owner 2026-10-15)'}
    lines_out.append({'line': f"WILD-{ln['name']}", 'name': ln['name'], 'universe': 2, 'first': s, 'last': s + 8 * len(ids) - 1, 'units': ids, 'points': ln['points'], 'where': ln.get('where')})
for fid in removed: fx.pop(fid)
for n, p, fid in plan:
    f = fx[fid]; f['p'] = [p[0], 0.31, p[1]]; f['r'] = [round(PI, 4), 0.0, 0.0]; f['colour'] = '#ff3a12'
    f['part'] = f'line {n}'; f['layer'] = 'lines'; f['throw_m'] = None; f['moved_from_v2_9'] = True
    f['position'] = f"MOXIR v2.10 wild line {n} (moxir_v2_10_forty.py, lines.json 2026-10-15): straight up, 3 washes on one DMX chain; was {newpart[fid]} at v2.9"
rig['fixtures'] = [f for f in rig['fixtures'] if f['id'] not in removed]

# 4. looks, kit, patch, provenance
for lk in rig['looks']:
    pt = lk.get('parts') or {}
    for n, _, fid in plan:
        if f'line {n}' in pt: continue
        src = 'red tent ' + ('left' if n == 'L' else 'right') if n in ('L', 'R') else None
        cands = [src] if src else [newpart[x] for _, _, x in plan if _ == n]
        for c in cands + ['hall steel', 'columns']:
            if c in pt: pt[f'line {n}'] = list(pt[c]); break
rig['kit']['UP-PL5403'] = 40
n40 = sum(1 for f in rig['fixtures'] if f['type'] == 'up-pl5403'); assert n40 == 40, n40
rem = set(removed)
for u in rig['patch']['universes']:
    if u['universe'] == 2: u['devices'] = sum(1 for f in rig['fixtures'] if f.get('dmx', {}).get('universe') == 2); u['used'] = max(f['dmx']['address'] + f['dmx']['footprint'] - 1 for f in rig['fixtures'] if f.get('dmx', {}).get('universe') == 2)
for ln in rig['patch']['lines']:
    ln['units'] = [x for x in ln.get('units', []) if x not in rem]; ln['legs'] = [l for l in ln.get('legs', []) if l.get('to') not in rem]
    ln['cable_m_stale'] = 'v2.10: units removed or moved; cable runs of the moved units are owed'
rig['patch']['wild_lines'] = lines_out
rig['lines'] = lines_out
rig['version'] = '2.10'; rig['date'] = '2026-10-15'
rig['title'] = 'MOXIR v2.10 - forty washes: the floor washes as 6 wild lines of 3, each one DMX chain'
rig['what'] = ('v2.9 with the UP-PL5403 cut from 50 to 40 (Poligraf stock 40): the 14 back-row and 14 red-tent washes become 18 floor washes in 6 lines '
               '(A B C D behind the DJ in the crew zone; L and R across the floor), each wash straight up, each line one chain. Owner 2026-10-15: "there are 40 washes", '
               '"we pick from the poligraf 40 washes", "make it wild and as a lines and use the area not hard that we can connect dmx". Source: '
               f'{a.src} + v2.9 moves files + the v2-9 project positions; lines from agent-reports-2026-10-15/moxir-40/lines.json; line D last point (29.9,-20.6) moved to (17.0,-29.5) and line A last point (-32.7,-32.7) moved to (-27.0,-31.5) to stay in the fence (lead decision 2026-10-15; 1 m inside x -27.7).')
rig['removed_v2_10'] = [{'id': i, 'why': 'owner 2026-10-15: 40 washes, not 50 (Poligraf stock)'} for i in removed]
json.dump(rig, open(R(a.out), 'w'), indent=1, ensure_ascii=False)
print(f'wrote {a.out}: UP-PL5403 {n40}; removed {len(removed)}: {removed}')
for l in lines_out: print(f"  {l['line']:<7} U2 {l['first']:>3}..{l['last']:<3} {l['units']}")

# 5. the project (scratch stack): ops
if a.api:
    def call(path, body=None, tok=None, method=None):
        rq = urllib.request.Request(a.api + path, data=None if body is None else json.dumps(body).encode(), method=method or ('GET' if body is None else 'POST'))
        rq.add_header('Content-Type', 'application/json')
        if tok: rq.add_header('Authorization', f'Bearer {tok}')
        with urllib.request.urlopen(rq, timeout=60) as r: return json.loads(r.read())
    tok = None
    if a.token_file:
        for line in open(a.token_file):
            if line.startswith(('API_TOKEN=', 'ADMIN_API_TOKEN=')): tok = line.split('=', 1)[1].strip()
    got = call(f'/api/projects/{a.project}/document', tok=tok); doc = got.get('document', got); ver = got['version']
    by = {e['id']: e for e in doc['entities']}
    miss = [i for i in removed + [f for _, _, f in plan] if i not in by]
    if miss: sys.exit(f'refusing: not in {a.project}: {miss}')
    ops, t0 = [], int(time.time())
    def op(t, p): ops.append({'type': t, 'opId': f'v2-10-{t0}-{len(ops)}', 'clientId': 'v2-10-forty', 'payload': p})
    for i in removed: op('deleteEntity', {'entityId': i})
    for n, p, fid in plan:
        f = fx[fid]
        op('updateComponent', {'entityId': fid, 'component': 'transform', 'patch': {'position': [round(x + o, 3) for x, o in zip(f['p'], OFF)], 'rotation': f['r']}})
        op('updateComponent', {'entityId': fid, 'component': 'fixture', 'patch': {'address': f['dmx']['address'], 'position': f"named v1 line-{n}-in0"}})
        op('updateEntity', {'entityId': fid, 'patch': {'name': f'UP-PL5403 line {n} (used)'}})
    show = by['rig-show']['components']['rentalList']
    items = [dict(i, ordered=40, stock=40, note='Poligraf stock 40, owner 2026-10-15') if i['code'] == 'UP-PL5403' else i for i in show['items']]
    op('updateComponent', {'entityId': 'rig-show', 'component': 'rentalList', 'patch': dict(show, items=items)})
    op('updateComponent', {'entityId': 'rig-show', 'component': 'rigVariant', 'patch': {'title': rig['title'][:120], 'summary': rig['what'][:300]}})
    print(f'{a.project} @ v{ver}: {len(ops)} ops (delete {len(removed)}, retarget {len(plan)})' + ('' if a.apply else ' (dry run; --apply to write)'))
    if a.apply:
        if not a.backup: sys.exit('refusing: --apply needs --backup <dir>')
        os.makedirs(a.backup, exist_ok=True); json.dump(got, open(f'{a.backup}/{a.project}-before.json', 'w'))
        res = call(f'/api/projects/{a.project}/ops', {'baseVersion': ver, 'ops': ops}, tok)
        back_ = call(f'/api/projects/{a.project}/document', tok=tok); bd = back_.get('document', back_); bb = {e['id']: e for e in bd['entities']}
        off = [fid for _, _, fid in plan if max(abs(x - y) for x, y in zip(bb[fid]['components']['transform']['position'], [x + o for x, o in zip(fx[fid]['p'], OFF)])) > 0.0011]
        npl = sum(1 for e in bd['entities'] if e.get('components', {}).get('fixture', {}).get('type') == 'up-pl5403')
        print(f"written v{res.get('newVersion')}; UP-PL5403 in project {npl}; lamps off by > 1 mm: {off or 'none'}")
        if off or npl != 40: sys.exit(1)
