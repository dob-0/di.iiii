#!/usr/bin/env python3
"""Physics check: does any drawn beam leave the building? (owner 2026-10-13: "lights go out of the space … fix the physics").

For every spot-light entity of a project document whose beam is drawn, the beam's REST axis (the entity's local −Y, three.js
Euler XYZ) is cast against the building as the hall record gives it, and the drawn length (beam.length, else light.distance)
is compared with the distance to the first surface. A beam drawn longer than that by more than --tol metres passes through a
wall or the roof: a LEAK. The surfaces, from the hall record's dims (sources inside the record) and the rig scripts' building
planes: the two side walls and the two end walls, the floor, the roof deck underside (truss_top_h_m: the space frame is open
lattice, the deck is the first solid surface), and the lantern glazing top (ridge) over the bay's centre band (lantern_w_m).

Limits, stated: the rest axis only (a look may aim a unit elsewhere at show time — the room clips at runtime for that); planes
and boxes, not the hall's triangles; the cone's spread is not cast (the axis only). `--fix` writes beam.length = the first-hit
distance for each leak (ops on the project; back it up first).

    python3 scripts/place/physics_check.py --api http://127.0.0.1:4337/serverXR --project moxir-v2-9 \
        --hall scripts/place/rigs/moxir-hall-2026-10-11-v11-show-park-far41.hall.json [--fix]
"""
import argparse, json, math, time, urllib.request

WEST_X, EAST_X, WALL_Z, BACK_Z = -36.4, 60.4, 53.8, -53.6   # the building's walls (moxir_v2_8_floor.py, the hall frame)


def axis_of(r):
    """three.js Euler XYZ applied to (0, -1, 0)."""
    x, y, z = 0.0, -1.0, 0.0
    cz, sz = math.cos(r[2]), math.sin(r[2]); x, y = x * cz - y * sz, x * sz + y * cz
    cy, sy = math.cos(r[1]), math.sin(r[1]); x, z = x * cy + z * sy, -x * sy + z * cy
    cx, sx = math.cos(r[0]), math.sin(r[0]); y, z = y * cx - z * sx, y * sx + z * cx
    return [x, y, z]


def first_surface(p, d, dims):
    deck = float(dims['truss_top_h_m']); ridge = float(dims['ridge_h_m']); half_lantern = float(dims['lantern_w_m']) / 2
    hits = []
    for name, axis, val in (('east wall', 0, EAST_X), ('west wall', 0, WEST_X), ('entry wall', 2, WALL_Z), ('back wall', 2, BACK_Z), ('floor', 1, 0.0)):
        if abs(d[axis]) > 1e-9:
            t = (val - p[axis]) / d[axis]
            if t > 1e-6: hits.append((t, name))
    if d[1] > 1e-9:  # upward: the deck, or the lantern glazing where the beam meets the deck inside the lantern band
        t = (deck - p[1]) / d[1]; x_at = p[0] + d[0] * t
        if abs(x_at) <= half_lantern:
            hits.append(((ridge - p[1]) / d[1], 'lantern glazing (ridge)'))
        else:
            hits.append((t, 'roof deck'))
    return min(hits)


def main():
    ap = argparse.ArgumentParser(); ap.add_argument('--api', required=True); ap.add_argument('--project', required=True)
    ap.add_argument('--hall', required=True); ap.add_argument('--tol', type=float, default=0.5); ap.add_argument('--fix', action='store_true')
    a = ap.parse_args()
    dims = json.load(open(a.hall))['dims']
    raw = json.load(urllib.request.urlopen(f'{a.api}/api/projects/{a.project}/document', timeout=30)); doc = raw['document']
    ents = doc['entities']; ents = list(ents.values()) if isinstance(ents, dict) else ents
    leaks, checked = [], 0
    for e in ents:
        if e.get('type') != 'spotLight': continue
        c = e.get('components') or {}; beam = c.get('beam') or {}; light = c.get('light') or {}
        if beam.get('visible') is False: continue
        drawn = float(beam.get('length') or 0) or float(light.get('distance') or 0)
        if drawn <= 0: continue
        t = c.get('transform') or {}; p = t.get('position') or [0, 0, 0]; d = axis_of(t.get('rotation') or [0, 0, 0])
        L, name = first_surface(p, d, dims); checked += 1
        if drawn > L + a.tol:
            leaks.append({'id': e['id'], 'drawn': round(drawn, 2), 'first_hit': round(L, 2), 'surface': name, 'over_m': round(drawn - L, 2), 'laser': bool(beam.get('laser'))})
    print(json.dumps({'project': a.project, 'version': raw.get('version'), 'beams_checked': checked, 'leaks': len(leaks)}))
    for l in sorted(leaks, key=lambda l: -l['over_m'])[:40]: print(' ', json.dumps(l))
    if a.fix and leaks:
        ops = [{'type': 'updateComponent', 'payload': {'entityId': l['id'], 'component': 'beam', 'patch': {'length': round(l['first_hit'], 2)}},
                'opId': f'physics-fix-{int(time.time() * 1000)}-{i}', 'clientId': 'physics-check'} for i, l in enumerate(leaks) if not l['laser']]
        req = urllib.request.Request(f'{a.api}/api/projects/{a.project}/ops', data=json.dumps({'baseVersion': raw['version'], 'ops': ops}).encode(),
                                     headers={'Content-Type': 'application/json', 'Authorization': 'Bearer dummy'})
        out = json.load(urllib.request.urlopen(req, timeout=60)); print('fixed', len(ops), 'beams (lasers left for the room\'s clip):', out.get('ok'), out.get('newVersion'))
    return 1 if leaks and not a.fix else 0


if __name__ == '__main__':
    raise SystemExit(main())
