#!/usr/bin/env python3
"""platina_hang.py - the Platina HANG file, made from the rig plan by script (no hand-made state).

    python3 -I scripts/place/platina_hang.py [--rig rigs/platina-rig-2026-11-11.json] [--out rigs/platina-hang-2026-11-11.json]

The hang = rig_generate.hang_of(rig) (every key except looks/cues/header, units verbatim, so every unit keeps its `part`, its
`dmx` and its ASSUMED stand-in `profile`) plus two data fields the generic tools read:
  head_kinds   the type ids a scene's `heads` pattern may name. Only the XP-16R: pan/tilt of K10/K15 is unproven (rig `owed`).
  defaultLook  the look the project build starts on (epic-build.mjs v1Looks reads rig.defaultLook).
Refuses (exit 1, nothing written) when a unit has no part, a head kind is not a unit type, or the unit count is not the rig's kit count.
Library types for the stand-ins stay ASSUMED: they are named in each unit's profile.stand_in / basis, nothing here upgrades them.
"""
import argparse, json, os, sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from rig_generate import hang_of  # noqa: E402

RIG = 'scripts/place/rigs/platina-rig-2026-11-11.json'
OUT = 'scripts/place/rigs/platina-hang-2026-11-11.json'
HEAD_KINDS = ['acme-xp16r-bsw']
DEFAULT_LOOK = 'work-light'


def views_of(rig):
    """The room's camera and view buttons, from the rig's own geometry (epic-build viewsOf: rig `views`, else MOXIR's).
    Audience = at the front of the deck + 9 m, eye 1.7 m, on the screen's centre line looking at the screen centre; FOH
    + 14 m, 2.5 m; Side = 18 m out beside the stage; Top = above the deck. Returns None when the rig has no screen or deck."""
    sol = {s['id']: s for s in rig.get('solids', []) if 'p' in s and 's' in s}
    scr = next((s for s in sol.values() if s['id'].endswith('-screen')), None)
    decks = [s for s in sol.values() if s['id'].endswith('-deck')]
    if not scr or not decks: return None
    d = decks[0]
    cx, front = scr['p'][0], d['p'][2] + d['s'][2] / 2
    target = [cx, round(scr['p'][1] + 2.2, 2), scr['p'][2]]            # above the screen's centre: the trusses and the stage both in frame
    def view(id, label, pos, tgt, fov): return {'id': id, 'label': label, 'position': [round(v, 2) for v in pos], 'target': tgt, 'fov': fov, 'live': True}
    presets = [view('audience', 'Audience', [cx, 1.7, front + 9], target, 62),
               view('foh', 'FOH', [cx, 2.5, front + 14], target, 58),
               # the rental's own renders: far, flat, from the front (owner 2026-11-11: compare our picture with theirs)
               view('render', 'Like the render', [cx, 3.0, front + 24], [cx, 3.0, scr['p'][2]], 32),
               view('side', 'Side', [cx - 18, 3.0, d['p'][2]], [cx, 3.0, d['p'][2]], 50),
               view('top', 'Top', [cx, 26.0, d['p'][2] + 0.5], [cx, 0, d['p'][2]], 55)]
    a = presets[0]
    return {'fixedCamera': {'projection': 'perspective', 'position': a['position'], 'target': a['target'], 'fov': a['fov'], 'zoom': 1, 'near': 0.05, 'far': 400, 'locked': False},
            'viewPresets': presets}  # every view live: visitors see all four (viewData.js: a view is data once one entry says live)


def make(rig, src, head_kinds=None, default_look=DEFAULT_LOOK):
    head_kinds = HEAD_KINDS if head_kinds is None else head_kinds
    units = rig.get('fixtures', [])
    types = {u['type'] for u in units}
    errs = [f"{u.get('id')}: no part" for u in units if not u.get('part')]
    errs += [f'head kind {k} is not a unit type of the rig' for k in head_kinds if k not in types]
    kit = rig.get('kit') or {}
    for t, n in kit.items():
        got = sum(1 for u in units if u['type'] == t)
        if got != n: errs.append(f'kit says {n} x {t}, rig has {got}')
    if errs: return None, errs
    out = hang_of(rig, src)
    out['head_kinds'] = list(head_kinds)
    out['defaultLook'] = default_look
    v = views_of(rig)
    if v: out['views'] = v
    if rig.get('camera'): out['camera'] = rig['camera']   # the room's one camera level, measured (platina_rig.py)
    return out, []


def main(argv=None):
    ap = argparse.ArgumentParser(description='Make the Platina hang file from the rig plan (see the module doc).')
    ap.add_argument('--rig', default=RIG); ap.add_argument('--out', default=OUT)
    a = ap.parse_args(argv)
    out, errs = make(json.load(open(a.rig, encoding='utf-8')), a.rig)
    if errs:
        print('\n'.join(errs)); return 1
    json.dump(out, open(a.out, 'w', encoding='utf-8'), indent=1, ensure_ascii=False)
    print(f'{a.out}: {len(out["fixtures"])} units, {len({u["part"] for u in out["fixtures"]})} parts, head_kinds {out["head_kinds"]}')
    return 0


if __name__ == '__main__':
    sys.exit(main())
