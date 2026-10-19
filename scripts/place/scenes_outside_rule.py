#!/usr/bin/env python3
"""scenes_outside_rule.py — one outside look for every scene: the outside parts of a scenes file are merged into a road part and an
entrance part with set colours, and the rig's fixtures are re-parted to match. Step 6 of the venue-to-show skill (docs/ai/skills/venue-to-show.md).

    python3 -I scripts/place/scenes_outside_rule.py --scenes S.json --rig R.json --old-parts "a,b" \\
        --road-hex #rrggbb --entrance-hex #rrggbb [--road-level 0.5] [--entrance-level 0.6] [--road-part road] [--entrance-part entrance]
        [--split-axis z --split-at 50] [--apply]

Every fixture whose `part` is in --old-parts becomes the entrance part when its position p[axis] > --split-at, else the road part
(axes x/y/z = p[0]/p[1]/p[2]; defaults z, 50 — the entrance side of the hall's local frame). In every scene the old parts are removed;
the road part gets the highest old level (or --road-level when none), the entrance part max(that, --entrance-level). Colours are
arguments: the scenes file keeps them as data (and a `palette` entry for each when the file has a palette list).
Dry run prints the counts; --apply rewrites both files in place with a .bak copy beside each. Undo: copy the .bak files back."""
import argparse, json, shutil, sys


def apply_rule(sc, rig, old, road_hex, entrance_hex, road_level=0.5, entrance_level=0.6, road_part='road', entrance_part='entrance',
               axis=2, split_at=50.0):
    """Edit sc and rig in place; returns (road_fixtures, entrance_fixtures, scenes_changed)."""
    road = entrance = changed = 0
    for f in rig['fixtures']:
        if f.get('part') in old:
            if f['p'][axis] > split_at:
                f['part'] = entrance_part; entrance += 1
            else:
                f['part'] = road_part; road += 1
    for s in sc['scenes']:
        parts = s['parts']
        lvl = max([parts[k][1] for k in old if k in parts] or [road_level])
        for k in old:
            parts.pop(k, None)
        parts[road_part] = [road_hex, round(lvl, 2)]
        parts[entrance_part] = [entrance_hex, round(max(lvl, entrance_level), 2)]
        changed += 1
    pal = sc.get('palette')
    if isinstance(pal, list):
        for name, hx in ((road_part, road_hex), (entrance_part, entrance_hex)):
            if hx not in {p.get('hex') for p in pal}:
                pal.append({'name': name, 'hex': hx, 'role': f'the outside: {name} part of every scene (scenes_outside_rule.py)'})
    return road, entrance, changed


def main(argv=None):
    ap = argparse.ArgumentParser(description='One outside look for every scene (see the module doc).')
    ap.add_argument('--scenes', required=True); ap.add_argument('--rig', required=True)
    ap.add_argument('--old-parts', required=True, help='comma list of the parts to merge')
    ap.add_argument('--road-hex', required=True); ap.add_argument('--entrance-hex', required=True)
    ap.add_argument('--road-level', type=float, default=0.5); ap.add_argument('--entrance-level', type=float, default=0.6)
    ap.add_argument('--road-part', default='road'); ap.add_argument('--entrance-part', default='entrance')
    ap.add_argument('--split-axis', choices=['x', 'y', 'z'], default='z'); ap.add_argument('--split-at', type=float, default=50.0)
    ap.add_argument('--apply', action='store_true')
    a = ap.parse_args(argv)
    old = [s.strip() for s in a.old_parts.split(',') if s.strip()]
    rig = json.load(open(a.rig, encoding='utf-8')); sc = json.load(open(a.scenes, encoding='utf-8'))
    r, e, c = apply_rule(sc, rig, old, a.road_hex, a.entrance_hex, a.road_level, a.entrance_level, a.road_part, a.entrance_part,
                         'xyz'.index(a.split_axis), a.split_at)
    print(f'rig: {r} {a.road_part} + {e} {a.entrance_part} fixtures re-parted from {old}; scenes: {c} of {len(sc["scenes"])} get '
          f'{a.road_part} {a.road_hex} / {a.entrance_part} {a.entrance_hex}')
    if not a.apply:
        print('dry run, nothing written'); return
    for p in (a.scenes, a.rig):
        shutil.copy(p, p + '.bak')
    json.dump(sc, open(a.scenes, 'w', encoding='utf-8'), indent=1, ensure_ascii=False)
    json.dump(rig, open(a.rig, 'w', encoding='utf-8'), indent=1, ensure_ascii=False)
    print('written (+ .bak)')


if __name__ == '__main__':
    main()
