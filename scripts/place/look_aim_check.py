#!/usr/bin/env python3
"""look_aim_check.py - where do the rest aims of a rig file's `rest_aims` parts end? (physics first: nothing passes a surface)

    python3 scripts/place/look_aim_check.py --rig <rig.json> --hall <hall.json> [--doc <project document.json>] [--json out.json]

For every fixture whose part is in the rig's `rest_aims`, the direction of the `vertical` rule (in_deg toward the stage axis, lean_deg along
the stage, into = +1 as in positions.js for a dance floor on the +z side) is cast with physics_check.first_surface against the building.
Per lamp: tilt from vertical, first surface, distance, the height there; with --doc, the beam length the document stores
(beam.length) - longer than the distance = the room re-casts it at run time (looks.js), listed as 'stored longer'.
Exit 1 when a ray never meets a surface or ends outside the building (a leak). Method: physics_check.py (same surfaces, same limits:
planes only, the axis only, steel and cranes are not cast - the room clips against those).
"""
import argparse, importlib.util, json, math, os, sys

here = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location('physics_check', os.path.join(here, 'physics_check.py'))
pc = importlib.util.module_from_spec(spec); spec.loader.exec_module(pc)
AXIS = 0.13  # the stage axis of the hall frame (epic-build.mjs AXIS)


def direction(f, rest):
    side = 0 if abs(f['p'][0] - AXIS) < 0.05 else (1 if f['p'][0] > AXIS else -1)
    s = math.radians(-side * rest.get('in_deg', 0)); l = math.radians(rest.get('lean_deg', 0))
    return [math.sin(s), math.cos(s) * math.cos(l), math.cos(s) * math.sin(l)]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--rig', required=True); ap.add_argument('--hall', required=True); ap.add_argument('--doc'); ap.add_argument('--json')
    a = ap.parse_args()
    rig = json.load(open(a.rig)); dims = json.load(open(a.hall))['dims']
    stored = {}
    if a.doc:
        d = json.load(open(a.doc)); d = d.get('document', d); ents = d['entities']
        for e in (ents.values() if isinstance(ents, dict) else ents):
            L = (e.get('components', {}).get('beam') or {}).get('length')
            if L: stored[e['id']] = L
    rows, bad = [], 0
    for f in rig['fixtures']:
        rest = (rig.get('rest_aims') or {}).get(f.get('part'))
        if not rest or f.get('angle_rad') is None: continue
        d = direction(f, rest)
        L, name = pc.first_surface(f['p'], d, dims)
        end = [f['p'][i] + d[i] * L for i in range(3)]
        inside = pc.WEST_X <= end[0] <= pc.EAST_X and pc.BACK_Z <= end[2] <= pc.WALL_Z and end[1] >= 0
        bad += not inside
        rows.append({'id': f['id'], 'part': f['part'], 'tilt_deg': round(math.degrees(math.acos(d[1])), 1), 'dir': [round(x, 3) for x in d],
                     'hits': name, 'dist_m': round(L, 2), 'end': [round(x, 2) for x in end], 'stored_m': stored.get(f['id']), 'inside': inside})
    for r in rows:
        print(f"{r['id']:20} {r['part']:15} tilt {r['tilt_deg']:5} -> {r['hits']:12} {r['dist_m']:6} m  end {r['end']}  stored {r['stored_m']}{'' if r['inside'] else '  LEAK'}")
    print(f'{len(rows)} lamps, {bad} leaks, {sum(1 for r in rows if r["stored_m"] and r["stored_m"] > r["dist_m"] + 0.5)} stored longer than the first surface (re-cast at run time)')
    if a.json: json.dump(rows, open(a.json, 'w'), indent=1)
    sys.exit(1 if bad else 0)

main()
