#!/usr/bin/env python3
"""Physics check: does any drawn beam leave the building? (owner 2026-10-13: "lights go out of the space … fix the physics").

For every spot-light entity of a project document whose beam is drawn, the beam's REST axis (the entity's local −Y, three.js
Euler XYZ) is cast against the building as the hall record gives it, and the drawn length (beam.length, else light.distance)
is compared with the distance to the first surface. A beam drawn longer than that by more than --tol metres passes through a
wall or the roof: a LEAK.

THE SURFACES COME FROM ONE SOURCE (2026-10-20, owner rule "Physics first" 2: a stored number that only fits an old state is a
bug): the hall record's `dims.shell`, the wall, deck, lantern and glazing slabs scripts/place/hall_shell.py takes from the
model the room draws (every corner a vertex of that GLB). Each slab is a box; the beam is cast against its faces (slab method,
from inside or outside). The floor is the one surface the shell does not carry: the plane y = 0 of the hall frame. A hall
record WITHOUT dims.shell is refused (exit 2), never checked against copied planes: run hall_shell.py --write first.
Before this the walls (x -36.4 / 60.4, z 53.8 / -53.6), the deck (truss_top_h_m) and a lantern roof (ridge_h_m over |x| <= 6,
the whole length) were copied by hand into this file; they differed from the model (back wall 0.2 m, deck 0.05 m, lantern roof
0.1 m and no gap between the lantern segments).

Limits, stated: the rest axis only (a look may aim a unit elsewhere at show time — the room clips at runtime for that); slab
boxes, not the hall's triangles; no space frame lattice, columns or cranes; glazing ends a beam here although light would
transmit it (an outside-exposure check must treat it as an opening); the cone's spread is not cast (the axis only). A lamp
whose origin lies inside a slab is at distance 0 from it (reported, not skipped). `--fix` writes beam.length = the first-hit
distance for each leak, lasers too (ops on the project; back it up first).

    python3 scripts/place/physics_check.py --api http://127.0.0.1:4337/serverXR --project moxir-v2-9 \
        --hall scripts/place/rigs/moxir-hall-2026-10-11-v11-show-park-far41.hall.json [--fix]
"""
import argparse, json, math, sys, time, urllib.request

FLOOR_Y = 0.0   # the hall frame's floor; dims.shell carries walls, deck, lanterns and glazing, not the floor


def axis_of(r):
    """three.js Euler XYZ applied to (0, -1, 0)."""
    x, y, z = 0.0, -1.0, 0.0
    cz, sz = math.cos(r[2]), math.sin(r[2]); x, y = x * cz - y * sz, x * sz + y * cz
    cy, sy = math.cos(r[1]), math.sin(r[1]); x, z = x * cy + z * sy, -x * sy + z * cy
    cx, sx = math.cos(r[0]), math.sin(r[0]); y, z = y * cx - z * sx, y * sx + z * cx
    return [x, y, z]


def refuse(msg):
    print('physics_check: ' + msg, file=sys.stderr); raise SystemExit(2)


def shell_of(dims):
    """dims.shell as a list of (label, lo[3], hi[3]) boxes in the hall frame. Refuses (SystemExit 2) a record with none."""
    shell = dims.get('shell')
    if not isinstance(shell, list) or not shell:
        refuse('the hall record has no dims.shell (the wall and roof slabs of hall_shell.py); refusing to check beams against '
               'copied planes. Run: python3 scripts/place/hall_shell.py --hall <record> --write')
    boxes = []
    for m in shell:
        try:
            lo = [float(m[k][0]) for k in ('x_m', 'y_m', 'z_m')]; hi = [float(m[k][1]) for k in ('x_m', 'y_m', 'z_m')]
        except (KeyError, TypeError, ValueError, IndexError):
            refuse('dims.shell slab %r has no x_m/y_m/z_m [min, max]' % (m.get('id') if isinstance(m, dict) else m))
        boxes.append((f"{m.get('surface', 'shell')} [{m.get('id', '?')}]", lo, hi))
    return boxes


def ray_box(p, d, lo, hi):
    """Distance along the unit ray p + t d to where it enters the box (0.0 if p is inside it), or None (misses / box behind)."""
    t0, t1 = 0.0, math.inf
    for i in range(3):
        if abs(d[i]) < 1e-12:
            if p[i] < lo[i] or p[i] > hi[i]: return None
            continue
        a, b = (lo[i] - p[i]) / d[i], (hi[i] - p[i]) / d[i]
        if a > b: a, b = b, a
        t0, t1 = max(t0, a), min(t1, b)
        if t0 > t1: return None
    return t0


def first_surface(p, d, shell):
    """(distance, surface) of the first thing the ray p + t d meets: the floor, or a dims.shell slab (shell = shell_of(dims))."""
    hits = []
    if d[1] < -1e-9 and p[1] > FLOOR_Y: hits.append(((FLOOR_Y - p[1]) / d[1], 'floor'))
    for name, lo, hi in shell:
        t = ray_box(p, d, lo, hi)
        if t is not None: hits.append((t, name))
    return min(hits) if hits else (math.inf, 'none (open sky)')


def fix_ops(leaks, stamp):
    """One updateComponent op per leak, lasers included: a laser line is a beam too, and 'stops at the first surface' has no exception.
    A project with no leak gets no ops (the route answers 400 'No operations provided.' to an empty batch)."""
    return [{'type': 'updateComponent', 'payload': {'entityId': l['id'], 'component': 'beam', 'patch': {'length': round(l['first_hit'], 2)}},
             'opId': f'physics-fix-{stamp}-{i}', 'clientId': 'physics-check'} for i, l in enumerate(leaks)]


def main(argv=None):
    ap = argparse.ArgumentParser(); ap.add_argument('--api', required=True); ap.add_argument('--project', required=True)
    ap.add_argument('--hall', required=True); ap.add_argument('--tol', type=float, default=0.5); ap.add_argument('--fix', action='store_true')
    a = ap.parse_args(argv)
    with open(a.hall) as f: shell = shell_of(json.load(f)['dims'])
    with urllib.request.urlopen(f'{a.api}/api/projects/{a.project}/document', timeout=30) as r: raw = json.load(r)
    doc = raw['document']
    ents = doc['entities']; ents = list(ents.values()) if isinstance(ents, dict) else ents
    leaks, checked = [], 0
    for e in ents:
        if e.get('type') != 'spotLight': continue
        c = e.get('components') or {}; beam = c.get('beam') or {}; light = c.get('light') or {}
        if beam.get('visible') is False: continue
        drawn = float(beam.get('length') or 0) or float(light.get('distance') or 0)
        if drawn <= 0: continue
        t = c.get('transform') or {}; p = t.get('position') or [0, 0, 0]; d = axis_of(t.get('rotation') or [0, 0, 0])
        L, name = first_surface(p, d, shell); checked += 1
        if drawn > L + a.tol:
            leaks.append({'id': e['id'], 'drawn': round(drawn, 2), 'first_hit': round(L, 2), 'surface': name, 'over_m': round(drawn - L, 2), 'laser': bool(beam.get('laser'))})
    print(json.dumps({'project': a.project, 'version': raw.get('version'), 'beams_checked': checked, 'leaks': len(leaks)}))
    for l in sorted(leaks, key=lambda l: -l['over_m'])[:40]: print(' ', json.dumps(l))
    if a.fix and leaks:
        ops = fix_ops(leaks, int(time.time() * 1000))
        req = urllib.request.Request(f'{a.api}/api/projects/{a.project}/ops', data=json.dumps({'baseVersion': raw['version'], 'ops': ops}).encode(),
                                     headers={'Content-Type': 'application/json', 'Authorization': 'Bearer dummy'})
        out = json.load(urllib.request.urlopen(req, timeout=60)); print('fixed', len(ops), 'beams:', out.get('ok'), out.get('newVersion'))
    return 1 if leaks and not a.fix else 0


if __name__ == '__main__':
    raise SystemExit(main())
