#!/usr/bin/env python3
"""scenes_to_rig.py - turn a scenes file (designed looks with cue timing) into a rig version file, keeping the old looks.

    python3 scripts/place/scenes_to_rig.py --scenes <scenes.json> --rig <rig in.json> --out <rig out.json> \
        --version 2.11 --title "<title>" [--date YYYY-MM-DD] [--what "<text>"]

OUT = IN with version/title/date/what updated, `looks` = the scenes in the rig look schema (id, title, act, intent, parts, motion,
heads, laser_colour, desk_caps, notes; kebab ids; nulls dropped), `cues` = one {look, name, fade, hold} per scene, `loop` true;
`rest_aims` of the scenes file is copied as is (epic-build gives it to the shared groups of those parts);
the old looks/cues are kept as looks_v<old>/cues_v<old> (underscored version), never lost.
Validates: every parts key is a fixtures[].part of the rig, ids unique, hex lower-case #rrggbb, levels 0..1, heads only with
kinds ['up-b380f']. Exits 1 and writes nothing when a check fails.
"""
import argparse, datetime, json, re, sys

def kebab(s): return re.sub(r'-+', '-', re.sub(r'[^a-z0-9]+', '-', s.lower())).strip('-')

def main():
    a = argparse.ArgumentParser()
    for k in ('scenes', 'rig', 'out', 'version', 'title'): a.add_argument('--' + k, required=True)
    a.add_argument('--date', default=datetime.date.today().isoformat()); a.add_argument('--what')
    a = a.parse_args()
    sc = json.load(open(a.scenes)); scenes = sc['scenes'] if isinstance(sc, dict) else sc
    rig = json.load(open(a.rig))
    parts = sorted({f['part'] for f in rig['fixtures'] if f.get('part')})
    errs, looks, cues, ids = [], [], [], set()
    for s in scenes:
        i = kebab(s['id'])
        if i in ids: errs.append(f'duplicate id {i}')
        ids.add(i)
        for p, v in s['parts'].items():
            if p not in parts: errs.append(f'{i}: part {p!r} not in rig')
            if not (re.fullmatch(r'#[0-9a-f]{6}', v[0]) and 0 <= v[1] <= 1): errs.append(f'{i}: bad value {p!r} {v}')
        h = s.get('heads')
        if h and h.get('kinds') != ['up-b380f']: errs.append(f'{i}: heads kinds {h.get("kinds")}')
        look = {k: s.get(k) for k in ('title', 'act', 'intent', 'parts', 'motion', 'heads', 'laser_colour', 'desk_caps', 'notes')}
        looks.append({'id': i, **{k: v for k, v in look.items() if v is not None}})
        c = s.get('cue') or {}
        cues.append({'look': i, 'name': s['title'], 'fade': c.get('fade_s'), 'hold': c.get('hold_s')})
    # rest_aims: {part: {in_deg, lean_deg}} - where a floor part's lamps rest in every look (the scenes' `heads` move around it)
    rest = sc.get('rest_aims') if isinstance(sc, dict) else None
    for p, v in (rest or {}).items():
        if p not in parts: errs.append(f'rest_aims: part {p!r} not in rig')
        if not isinstance(v, dict) or not set(v) <= {'in_deg', 'lean_deg'} or any(abs(x) > 60 for x in v.values()): errs.append(f'rest_aims {p!r}: {v}')
    if errs:
        print('\n'.join(errs[:40])); sys.exit(1)
    old = str(rig.get('version', 'old')).replace('.', '_')
    out = dict(rig)
    if old != a.version.replace('.', '_'):   # the same version again (a re-run) keeps the archive it already has
        out[f'looks_v{old}'], out[f'cues_v{old}'] = rig['looks'], rig['cues']
    out.update(version=a.version, title=a.title, date=a.date, looks=looks, cues=cues, loop=True,
               **({'rest_aims': rest} if rest else {}), what=a.what or f'v{a.version}: {len(looks)} scenes ({sc.get("what", "") if isinstance(sc, dict) else ""})'[:600])
    json.dump(out, open(a.out, 'w'), indent=1, ensure_ascii=False)
    print(f'{a.out}: {len(looks)} looks, {len(cues)} cues, {len(parts)} rig parts: {parts}')
    print(f'heads on {sum(1 for l in looks if "heads" in l)} looks; kept looks_v{old} ({len(rig["looks"])}) cues_v{old} ({len(rig["cues"])})')

main()
