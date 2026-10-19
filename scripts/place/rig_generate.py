#!/usr/bin/env python3
"""rig_generate.py - one generator for every rig version: a hang file (where each unit hangs or stands, its aim and
patch, the room's solids, stage, haze and camera) + a scenes file (the looks and the cue list) -> the rig file.
It replaces a builder script per version (scripts/place/moxir_v*.py). Venue-to-show skill steps 3 (rig) and 5 (scenes ->
rig looks); decision docs/ai/decisions/2026-10-15-one-rig-generator.md.

    python3 -I scripts/place/rig_generate.py hang  --rig <rig.json> --out <hang.json>
    python3 -I scripts/place/rig_generate.py build --hang <hang.json> --scenes <scenes.json> --out <rig.json> \
        --version X.Y --title "<t>" [--date YYYY-MM-DD] [--what "<text>"]
    python3 -I scripts/place/rig_generate.py check --rig <rig.json> --against <rig.json>

hang   takes the hang out of an existing rig file: every key except the looks (looks, cues, looks_v*, cues_v*) and the
       version header (version, title, what, date, written_by), kept verbatim, plus `hang` = where it came from.
build  writes header + the hang's keys + `fixtures` with `groups` expanded + looks/cues from the scenes file (the same
       code as scenes_to_rig.py) + `generated_by`. Groups (optional, appended after the listed fixtures):
         {"kind": "line", "prefix": "rig-x", "n": 3, "from": [x,y,z], "to": [x,y,z], "type", "part", "r", ...,
          "dmx": {"universe": 2, "address": 177, "footprint": 8}}   n units evenly from..to, ids <prefix>-01..,
                                                                      addresses one footprint apart
         {"kind": "mirror", "of": "<prefix>", "axis_x": -5.2, "prefix": "rig-y", "part"?, "dmx"?}
                                                                      the units of group <of>, mirrored about x = axis_x
                                                                      (p.x -> 2a - x; Euler XYZ r -> (rx, -ry, -rz))
       Checks (exit 1, nothing written): unique unit ids; every unit has id, type, p[3], r[3]; no two units share a
       DMX channel in one universe; every scene part is a unit part; the scenes checks of scenes_to_rig.py.
check  compares the keys the project build reads (scripts/rigbuild/epic-build.mjs) between two rig files; exit 1 on a
       difference. The proof that a generated version equals the one a builder script made.
"""
import argparse, datetime, json, os, sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from scenes_to_rig import looks_from_scenes  # noqa: E402

HEADER = ('version', 'title', 'what', 'date', 'written_by')
# what epic-build.mjs reads from a rig file (grep "rig\." scripts/rigbuild/epic-build.mjs, 2026-10-15)
BUILD_KEYS = ('fixtures', 'solids', 'stage', 'atmosphere', 'views', 'showSource', 'loop', 'not_hung', 'looks', 'cues')


def is_look_key(k): return k in ('looks', 'cues') or k.startswith(('looks_v', 'cues_v'))


def hang_of(rig, src):
    out = {'hang': {'from': src, **{k: rig[k] for k in ('version', 'date', 'written_by') if k in rig}}}
    out.update({k: v for k, v in rig.items() if not is_look_key(k) and k not in HEADER})
    return out


def _dmx(d, i):
    if not d: return None
    return {**d, 'address': d['address'] + i * d.get('footprint', 1)}


def expand(groups):
    units, by = [], {}
    for g in groups or []:
        keep = {k: v for k, v in g.items() if k not in ('kind', 'prefix', 'n', 'from', 'to', 'of', 'axis_x', 'dmx')}
        if g['kind'] == 'line':
            n, a, b = g['n'], g['from'], g['to']
            made = [{'id': f"{g['prefix']}-{i + 1:02d}", **keep,
                     'p': [round(a[j] + (b[j] - a[j]) * (i / (n - 1) if n > 1 else 0), 4) for j in range(3)],
                     **({'dmx': _dmx(g['dmx'], i)} if g.get('dmx') else {})} for i in range(n)]
        elif g['kind'] == 'mirror':
            ax = g['axis_x']
            made = []
            for i, u in enumerate(by[g['of']]):
                m = {**u, **keep, 'id': f"{g['prefix']}-{i + 1:02d}",
                     'p': [round(2 * ax - u['p'][0], 4), u['p'][1], u['p'][2]],
                     'r': [u['r'][0], -u['r'][1] + 0.0, -u['r'][2] + 0.0]}
                if g.get('dmx'): m['dmx'] = _dmx(g['dmx'], i)
                made.append(m)
        else:
            raise SystemExit(f"group {g.get('prefix')}: unknown kind {g['kind']!r}")
        by[g['prefix']] = made
        units += made
    return units


def unit_errors(units):
    errs, ids, chans = [], set(), {}
    for u in units:
        i = u.get('id')
        if i in ids: errs.append(f'duplicate unit id {i}')
        ids.add(i)
        for k in ('type', 'p', 'r'):
            if k not in u: errs.append(f'{i}: no {k}')
        for k in ('p', 'r'):
            if k in u and not (isinstance(u[k], list) and len(u[k]) == 3): errs.append(f'{i}: {k} is not [x, y, z]')
        d = u.get('dmx')
        if d and d.get('universe') is not None and d.get('address') is not None:
            for c in range(d['address'], d['address'] + (d.get('footprint') or 1)):
                was = chans.setdefault((d['universe'], c), i)
                if was != i: errs.append(f'{i}: DMX {d["universe"]}.{c} already used by {was}'); break
    return errs


def build(hang, scenes_doc, version, title, date, what=None, hang_path=None, scenes_path=None):
    scenes = scenes_doc['scenes'] if isinstance(scenes_doc, dict) else scenes_doc
    units = list(hang.get('fixtures', [])) + expand(hang.get('groups'))
    errs = unit_errors(units)
    parts = sorted({u['part'] for u in units if u.get('part')})
    looks, cues, e2 = looks_from_scenes(scenes, parts)
    errs += e2
    if errs: return None, errs
    body = {k: v for k, v in hang.items() if k not in ('hang', 'groups', 'fixtures')}
    rig = {'version': version, 'title': title, 'date': date,
           'what': what or f'v{version}: {len(looks)} scenes ({scenes_doc.get("what", "") if isinstance(scenes_doc, dict) else ""})'[:600],
           'written_by': 'scripts/place/rig_generate.py',
           'generated_by': {'tool': 'scripts/place/rig_generate.py', 'hang': hang_path, 'scenes': scenes_path},
           **body, 'fixtures': units, 'looks': looks, 'cues': cues, 'loop': hang.get('loop', True)}
    return rig, []


def differences(a, b):
    return [k for k in BUILD_KEYS if a.get(k) != b.get(k)]


def main(argv=None):
    p = argparse.ArgumentParser(description='One generator: hang file + scenes file -> rig file (see the docstring).')
    sub = p.add_subparsers(dest='cmd', required=True)
    h = sub.add_parser('hang', help='take the hang file out of a rig file'); h.add_argument('--rig', required=True); h.add_argument('--out', required=True)
    b = sub.add_parser('build', help='hang + scenes -> rig file')
    for k in ('hang', 'scenes', 'out', 'version', 'title'): b.add_argument('--' + k, required=True)
    b.add_argument('--date', default=datetime.date.today().isoformat()); b.add_argument('--what')
    c = sub.add_parser('check', help='compare the keys the project build reads'); c.add_argument('--rig', required=True); c.add_argument('--against', required=True)
    a = p.parse_args(argv)
    if a.cmd == 'hang':
        out = hang_of(json.load(open(a.rig)), a.rig)
        json.dump(out, open(a.out, 'w'), indent=1, ensure_ascii=False)
        print(f'{a.out}: {len(out.get("fixtures", []))} units, {len(out.get("solids", []))} solids, {len(out) - 1} keys kept')
    elif a.cmd == 'build':
        rig, errs = build(json.load(open(a.hang)), json.load(open(a.scenes)), a.version, a.title, a.date, a.what, a.hang, a.scenes)
        if errs:
            print('\n'.join(errs[:40])); return 1
        json.dump(rig, open(a.out, 'w'), indent=1, ensure_ascii=False)
        print(f'{a.out}: {len(rig["fixtures"])} units, {len(rig["looks"])} looks, {len(rig["cues"])} cues')
    else:
        d = differences(json.load(open(a.rig)), json.load(open(a.against)))
        print('same: ' + ', '.join(BUILD_KEYS) if not d else 'DIFFER: ' + ', '.join(d))
        return 1 if d else 0
    return 0


if __name__ == '__main__':
    sys.exit(main())
