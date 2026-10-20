#!/usr/bin/env python3
"""Move lamps of a project to the places a moves file names, as ops (2026-10-14).

    python3 scripts/place/move_lamps.py --api http://127.0.0.1:4337/serverXR --project <id> --moves <file.json> \
        [--token-file <env with API_TOKEN=...>] [--backup <dir>] [--apply]

The moves file is data with its own provenance: {"what", "source", "moves": [{"id", "position": [x, y, z],
"rotation": [rx, ry, rz]?, "fixture": {...}?}]} — "fixture" is merged into the lamp's fixture component in the same batch
(e.g. {"hung": true} for a lamp that now hangs under a truss: the looks' rules then point it from below, lookRules.js upOf). Dry run unless --apply: prints every lamp from -> to. With --apply it first saves the
document it read to --backup (required), sends ONE batch of updateComponent transform ops at the version it read
(the server refuses a stale base), then reads back and checks every lamp landed (1 mm). Refuses an id that is not in
the project. After a move: re-aim the scenes and run physics_check.py (docs: the hard rule 'Physics first').
"""
import argparse, json, os, sys, time, urllib.request

def call(url, token=None, body=None):
    req = urllib.request.Request(url, data=None if body is None else json.dumps(body).encode(), method='GET' if body is None else 'POST')
    req.add_header('Content-Type', 'application/json')
    # dev.diiii.xyz sits behind Cloudflare, which answers 403 to Python's default agent (2026-10-16)
    req.add_header('User-Agent', 'di-move-lamps/1 (+https://github.com/dob-0/di.iiii)')
    if token: req.add_header('Authorization', f'Bearer {token}')
    with urllib.request.urlopen(req, timeout=60) as r: return json.loads(r.read())

def token_of(path):
    # the same order as scripts/place/api.mjs readToken: DI_API_TOKEN, then --token-file, then ~/.di/di.env; the same keys
    if os.environ.get('DI_API_TOKEN'): return os.environ['DI_API_TOKEN'].strip()
    for f in [path, os.path.expanduser('~/.di/di.env')]:
        if not f or not os.path.exists(f): continue
        lines = open(f).read().split('\n')
        for key in ('ADMIN_API_TOKEN', 'API_TOKEN', 'DI_API_TOKEN'):
            v = next((l[len(key) + 1:].strip() for l in lines if l.startswith(key + '=')), '')
            if v: return v
    return None

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--api', required=True); ap.add_argument('--project', required=True); ap.add_argument('--moves', required=True)
    ap.add_argument('--token-file'); ap.add_argument('--backup'); ap.add_argument('--apply', action='store_true')
    a = ap.parse_args()
    moves = json.load(open(a.moves))['moves']
    got = call(f'{a.api}/api/projects/{a.project}/document'); doc = got.get('document', got); version = got['version']
    by = {e['id']: e for e in doc['entities']}
    missing = [m['id'] for m in moves if m['id'] not in by]
    if missing: sys.exit(f'refusing: not in {a.project}: {missing}')
    ops = []
    for m in moves:
        t = by[m['id']]['components'].get('transform') or {}
        patch = {'position': [round(v, 3) for v in m['position']]}
        if 'rotation' in m: patch['rotation'] = [round(v, 4) for v in m['rotation']]
        print(f"{m['id']:<22} {[round(v, 2) for v in t.get('position', [0, 0, 0])]} -> {patch['position']}" + (f" rot {patch['rotation']}" if 'rotation' in patch else ''))
        ops.append({'type': 'updateComponent', 'opId': f"move-lamps-{int(time.time())}-{len(ops)}", 'clientId': 'move-lamps',
                    'payload': {'entityId': m['id'], 'component': 'transform', 'patch': patch}})
        if m.get('fixture'):
            print(f"{'':<22} fixture + {m['fixture']}")
            ops.append({'type': 'updateComponent', 'opId': f"move-lamps-{int(time.time())}-{len(ops)}", 'clientId': 'move-lamps',
                        'payload': {'entityId': m['id'], 'component': 'fixture', 'patch': m['fixture']}})
    print(f'{a.project} @ v{version}: {len(moves)} lamps, {len(ops)} ops' + ('' if a.apply else ' (dry run; --apply to write)'))
    if not a.apply: return
    if not a.backup: sys.exit('refusing: --apply needs --backup <dir>')
    os.makedirs(a.backup, exist_ok=True); json.dump(got, open(os.path.join(a.backup, 'document.json'), 'w'))
    out = call(f'{a.api}/api/projects/{a.project}/ops', token_of(a.token_file), {'baseVersion': version, 'ops': ops})
    after = call(f'{a.api}/api/projects/{a.project}/document'); adoc = after.get('document', after)
    aby = {e['id']: e for e in adoc['entities']}
    bad = [m['id'] for m in moves if max(abs(p - q) for p, q in zip(aby[m['id']]['components']['transform']['position'], m['position'])) > 0.001]
    bad += [m['id'] + ' fixture' for m in moves if any(aby[m['id']]['components'].get('fixture', {}).get(k) != v for k, v in (m.get('fixture') or {}).items())]
    print(f"written: v{out.get('newVersion')}; entities {len(doc['entities'])} -> {len(adoc['entities'])}; off by > 1 mm: {bad or 'none'}")
    if bad or len(doc['entities']) != len(adoc['entities']): sys.exit(1)

if __name__ == '__main__':
    main()
