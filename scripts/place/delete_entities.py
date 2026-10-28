#!/usr/bin/env python3
"""Delete objects of a project by id, as ops (2026-10-15; the twin of move_lamps.py).

    python3 scripts/place/delete_entities.py --api http://127.0.0.1:4337/serverXR --project <id> --list <file.json> \
        [--token-file <env with API_TOKEN=...>] [--backup <dir>] [--apply]

The list file is data with its own provenance: {"what", "source", "ids": [...]}. Dry run unless --apply: prints every object
it would delete (id, type, name, position). With --apply it first saves the document it read to --backup (required), sends ONE
batch of deleteEntity ops at the version it read (the server refuses a stale base), then reads back and checks every id is
gone. Refuses an id that is not in the project, and refuses to delete a light or anything with children (say so, then split).
Undo: the backup's entities, re-created from it. After a delete that changes the rig: physics_check.py (hard rule 'Physics first').
"""
import argparse, json, os, sys, urllib.request

def call(url, token=None, body=None):
    req = urllib.request.Request(url, data=None if body is None else json.dumps(body).encode(), method='GET' if body is None else 'POST')
    req.add_header('Content-Type', 'application/json')
    if token: req.add_header('Authorization', f'Bearer {token}')
    with urllib.request.urlopen(req, timeout=60) as r: return json.loads(r.read())

def token_of(path):
    if not path: return None
    for line in open(path):
        if line.startswith('API_TOKEN='): return line.split('=', 1)[1].strip().strip('"\'')
    return None

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--api', required=True); ap.add_argument('--project', required=True); ap.add_argument('--list', required=True)
    ap.add_argument('--token-file'); ap.add_argument('--backup'); ap.add_argument('--apply', action='store_true')
    a = ap.parse_args()
    ids = json.load(open(a.list))['ids']
    got = call(f'{a.api}/api/projects/{a.project}/document'); doc = got.get('document', got); version = got['version']
    ents = doc['entities']; by = ents if isinstance(ents, dict) else {e['id']: e for e in ents}
    missing = [i for i in ids if i not in by]
    if missing: sys.exit(f'refusing: not in the project: {missing}')
    children = [c['id'] for c in by.values() if c.get('parentId') in ids and c['id'] not in ids]
    lights = [i for i in ids if 'light' in str(by[i].get('type', '')).lower()]
    if children or lights: sys.exit(f'refusing: children left behind {children}; lights {lights} (delete lights with the rig tools, not here)')
    for i in ids:
        e = by[i]; t = (e.get('components') or {}).get('transform', {})
        print(f"{i:38} {e.get('type'):6} {str(e.get('name', ''))[:40]:40} {[round(v, 2) for v in t.get('position', [])]}")
    print(f"{a.project} @ v{version}: {len(ids)} objects" + ('' if a.apply else ' (dry run; --apply to write)'))
    if not a.apply: return
    if not a.backup: sys.exit('refusing: --apply needs --backup <dir>')
    os.makedirs(a.backup, exist_ok=True); json.dump(got, open(os.path.join(a.backup, 'document.json'), 'w'))
    ops = [{'type': 'deleteEntity', 'payload': {'entityId': i}} for i in ids]
    out = call(f'{a.api}/api/projects/{a.project}/ops', token_of(a.token_file), {'baseVersion': version, 'ops': ops})
    after = call(f'{a.api}/api/projects/{a.project}/document'); adoc = after.get('document', after)
    aents = adoc['entities']; aby = aents if isinstance(aents, dict) else {e['id']: e for e in aents}
    left = [i for i in ids if i in aby]
    print(f"written: v{out.get('version', after.get('version'))}; entities {len(by)} -> {len(aby)}; still there: {left or 'none'}")
    if left: sys.exit(1)

if __name__ == '__main__': main()
