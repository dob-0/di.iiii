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
