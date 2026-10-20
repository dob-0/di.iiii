#!/usr/bin/env python3
"""Physics check: does any drawn beam leave the building? (owner 2026-10-13: "lights go out of the space … fix the physics").

For every spot-light entity of a project document whose beam is drawn, the beam's REST axis (the entity's local −Y, three.js
Euler XYZ) is cast against the building as the hall record gives it, and the drawn length (beam.length, else light.distance)
is compared with the distance to the first surface. A beam drawn longer than that by more than --tol metres passes through a
wall or the roof: a LEAK. The overshoot allowed is never more than the thickness of the slab hit (deck 0.15 m, glazing 0.04 m ...,
--tol is 0.5 m): a beam that ends past the slab's far face is outside the building, whatever --tol says.

THE SURFACES COME FROM ONE SOURCE (2026-10-20, owner rule "Physics first" 2: a stored number that only fits an old state is a
bug): the hall record's `dims.shell`, the wall, deck, lantern and glazing slabs scripts/place/hall_shell.py takes from the
model the room draws (every corner a vertex of that GLB). Each slab is a box; the beam is cast against its faces (slab method,
from inside or outside). The floor is the one surface the shell does not carry: the plane y = 0 of the hall frame, BOUNDED to the hall's
footprint (the shell's x, z extent): a ray that would meet y = 0 beyond it meets nothing and ends in 'open sky (through <opening>)'. A hall
record WITHOUT dims.shell is refused (exit 2), never checked against copied planes: run hall_shell.py --write first.
Before this the walls (x -36.4 / 60.4, z 53.8 / -53.6), the deck (truss_top_h_m) and a lantern roof (ridge_h_m over |x| <= 6,
the whole length) were copied by hand into this file; they differed from the model (back wall 0.2 m, deck 0.05 m, lantern roof
0.1 m and no gap between the lantern segments).

Limits, stated: the rest axis only (a look may aim a unit elsewhere at show time — the room clips at runtime for that); slab
boxes, not the hall's triangles; no space frame lattice, columns or cranes; glazing ends a beam here although light would
transmit it (an outside-exposure check must treat it as an opening); the cone's spread is not cast (the axis only). A lamp
whose origin lies inside a slab is at distance 0 from it (reported with inside_slab, not skipped, never fixed: move the lamp); one
standing ON a face and aimed away from the slab does not meet it. A lamp AT floor level (y = 0) aiming below the horizontal meets the
floor at 0 m: reported (on_floor), never fixed, never read as open sky. A lamp whose origin lies outside the hall (outside the box
that holds every slab, floor to the highest top: a box, not the hall's outline) is reported as a leak row with outside_hall true:
counted in `leaks` (exit 1, the CLI contract keeps one count), never fixed, first_hit null when its ray meets nothing. A lamp
meant to stand outside needs the owner's word first; the check does not know one. `--fix` writes beam.length = the first-hit
distance for each fixable leak, lasers too (ops on the project; back it up first); nothing fixable = nothing posted. Exit 1 while any
row remains, with --fix too: the rows only a moved lamp can mend (outside_hall, inside_slab, on_floor).

    python3 scripts/place/physics_check.py --api http://127.0.0.1:4337/serverXR --project moxir-v2-9 \
        --hall scripts/place/rigs/moxir-hall-2026-10-11-v11-show-park-far41.hall.json [--fix]
"""
import argparse, json, math, re, sys, time, urllib.request

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


FACE_EPS = 1e-6   # m: an origin this close to a face is ON it (a lamp mounted flush); coordinates are stored as plain decimals


def ray_span(p, d, lo, hi):
    """(t_in, t_out): where the unit ray p + t d is inside the box, t >= 0; None if it misses, the box is behind, or the ray only
    leaves / grazes a face it starts on (a lamp mounted flush on a slab and aimed away from it is not inside that slab)."""
    t0, t1 = 0.0, math.inf
    for i in range(3):
        if abs(d[i]) < 1e-12:
            if p[i] < lo[i] or p[i] > hi[i]: return None
            continue
        a, b = (lo[i] - p[i]) / d[i], (hi[i] - p[i]) / d[i]
        if a > b: a, b = b, a
        t0, t1 = max(t0, a), min(t1, b)
        if t0 > t1: return None
    if t0 <= 0.0:                                   # the origin is in the box or on its surface
        margin = lambda q: min(min(q[i] - lo[i], hi[i] - q[i]) for i in range(3))
        if margin(p) <= FACE_EPS:                   # on a face: a hit only if the ray goes INTO the slab, not along or away from it
            if margin([p[i] + 1e-3 * d[i] for i in range(3)]) <= FACE_EPS: return None
    return t0, t1


def ray_box(p, d, lo, hi):
    """Distance along the unit ray p + t d to where it enters the box (0.0 if p is inside it), or None (misses / box behind / leaves a face)."""
    s = ray_span(p, d, lo, hi)
    return None if s is None else s[0]


def hall_extent(shell):
    """(lo, hi): the box that holds every slab of the shell in x and z, floor (y = 0) to the highest slab top in y. A lamp outside it
    is not in the hall. A box, not the hall's outline: stated in the module doc."""
    lo = [min(b[1][i] for b in shell) for i in range(3)]; hi = [max(b[2][i] for b in shell) for i in range(3)]
    lo[1] = FLOOR_Y
    return lo, hi


def outside_hall(p, shell):
    """True when the lamp's origin lies outside hall_extent(shell). A lamp inside a slab is inside this box (it has its own flag)."""
    lo, hi = hall_extent(shell)
    return any(p[i] < lo[i] - FACE_EPS or p[i] > hi[i] + FACE_EPS for i in range(3))


def on_footprint(q, lo, hi):
    """True when the point q (x, z) lies on or inside the hall's footprint: the shell's x, z extent (lo, hi = hall_extent(shell))."""
    return all(lo[i] - FACE_EPS <= q[i] <= hi[i] + FACE_EPS for i in (0, 2))


def opening_of(p, d, shell):
    """Name the opening a ray that meets nothing left the hall through, or None (the origin is outside the hall: no 'through').
    The ray leaves the box that holds the shell (hall_extent) at one face; the slab group that touches that face nearest the exit
    point names the wall ('end-wall-entry': a slab id without its trailing -number); the top face is 'the roof'; a face no slab touches is the
    hall's edge on that side. A ray only gets here when nothing stopped it, so the exit point lies in a gap of the shell."""
    lo, hi = hall_extent(shell)
    if outside_hall(p, shell): return None
    t, face = math.inf, None
    for i in range(3):
        if abs(d[i]) < 1e-12: continue
        if d[i] > 0: ti, side = (hi[i] - p[i]) / d[i], 1
        elif i == 1: continue                                  # downward: the floor is the bottom, never a way out
        else: ti, side = (lo[i] - p[i]) / d[i], 0
        if ti < t: t, face = ti, (i, side)
    if face is None: return None
    i, side = face
    if i == 1: return 'the roof'
    q = [p[k] + t * d[k] for k in range(3)]
    edge = (hi if side else lo)[i]
    def gap(b):                                                # how far the exit point is from the slab box
        return math.sqrt(sum(max(b[1][k] - q[k], q[k] - b[2][k], 0.0) ** 2 for k in range(3)))
    touching = [b for b in shell if abs((b[2] if side else b[1])[i] - edge) <= FACE_EPS]
    if not touching: return 'the %s edge of the hall' % ('xyz'[i] + ('+' if side else '-'))
    near = min(touching, key=gap)[0]                           # '<surface> [<id>]'
    sid = near[near.index('[') + 1:-1] if '[' in near else near
    return re.sub(r'-\d+$', '', sid) + ' opening'


def first_surface_through(p, d, shell):
    """(distance, surface, depth) of the first thing the ray meets: the floor, or a dims.shell slab; depth is the length of the ray
    inside that slab, entry face to far face (shell = shell_of(dims)). THE FLOOR IS THE HALL'S FOOTPRINT, not the infinite plane y = 0
    (2026-10-20 review, owner rule "Physics first" 1: light leaves a hall only through an opening, and outside it there is no hall floor):
    a ray that meets the floor beyond the footprint meets nothing, and ends in 'open sky (through <opening>)' when it left through a
    gap of the shell, plain 'none (open sky)' when it started outside the hall."""
    hits = []
    lo, hi = hall_extent(shell)
    if d[1] < -1e-9 and p[1] > FLOOR_Y - FACE_EPS:   # a lamp AT floor level aiming down meets the floor at 0 m: never open sky
        tf = max(0.0, (FLOOR_Y - p[1]) / d[1])
        if on_footprint([p[k] + tf * d[k] for k in range(3)], lo, hi): hits.append((tf, 'floor', math.inf))
    for name, lo_b, hi_b in shell:
        s = ray_span(p, d, lo_b, hi_b)
        if s is not None: hits.append((s[0], name, s[1] - s[0]))
    if hits: return min(hits)
    through = opening_of(p, d, shell)
    return (math.inf, 'none (open sky)' if through is None else 'open sky (through %s)' % through, math.inf)


def first_surface(p, d, shell):
    """(distance, surface) of the first thing the ray p + t d meets: the floor, or a dims.shell slab (shell = shell_of(dims))."""
    return first_surface_through(p, d, shell)[:2]


def fixable(l):
    """A leak row the beam length can mend: not outside the hall, and a first surface in front of the lamp (first_hit > 0)."""
    return not l.get('outside_hall') and l['first_hit'] is not None and l['first_hit'] > 0


def fix_ops(leaks, stamp):
    """One updateComponent op per leak, lasers included: a laser line is a beam too, and 'stops at the first surface' has no exception.
    A project with no leak gets no ops (the route answers 400 'No operations provided.' to an empty batch).
    A lamp INSIDE a slab, ON the floor aiming down (first hit 0) or OUTSIDE the hall gets none: length 0 would hide the beam, and the
    fault is the lamp's place, not the beam's length: the lamp has to be moved."""
    leaks = [l for l in leaks if fixable(l)]
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
        L, name, depth = first_surface_through(p, d, shell); checked += 1
        if outside_hall(p, shell):
            # the lamp stands outside the building (2026-10-20 review): what its ray meets from there says nothing about the hall, and 'open
            # sky' must not read as 'no leak'. Reported as a leak row (counted, exit 1, never fixed); first_hit is what it meets, None = nothing.
            fin = math.isfinite(L)
            leaks.append({'id': e['id'], 'drawn': round(drawn, 2), 'first_hit': round(L, 2) if fin else None, 'surface': name,
                          'over_m': round(drawn - L, 2) if fin else None, 'laser': bool(beam.get('laser')), 'outside_hall': True})
            continue
        # the overshoot allowed is --tol, but never more than the slab is thick: past its far face the beam is outside the building
        if drawn > L + min(a.tol, depth):
            leaks.append({'id': e['id'], 'drawn': round(drawn, 2), 'first_hit': round(L, 2), 'surface': name, 'over_m': round(drawn - L, 2), 'laser': bool(beam.get('laser'))})
            if L <= 0: leaks[-1]['on_floor' if name == 'floor' else 'inside_slab'] = True
    print(json.dumps({'project': a.project, 'version': raw.get('version'), 'beams_checked': checked, 'leaks': len(leaks)}))
    for l in sorted(leaks, key=lambda l: -(math.inf if l['over_m'] is None else l['over_m']))[:40]: print(' ', json.dumps(l))
    ops = fix_ops(leaks, int(time.time() * 1000)) if a.fix else []
    if ops:   # an empty batch is answered 400 'No operations provided.': nothing fixable = nothing posted
        req = urllib.request.Request(f'{a.api}/api/projects/{a.project}/ops', data=json.dumps({'baseVersion': raw['version'], 'ops': ops}).encode(),
                                     headers={'Content-Type': 'application/json', 'Authorization': 'Bearer dummy'})
        out = json.load(urllib.request.urlopen(req, timeout=60)); print('fixed', len(ops), 'beams:', out.get('ok'), out.get('newVersion'))
    # exit 1 while any row stays: with --fix only the rows the beam length cannot mend (outside_hall, inside_slab, on_floor) remain
    remaining = [l for l in leaks if not (a.fix and fixable(l))]
    if a.fix and remaining: print('not fixed (move the lamp):', len(remaining), 'rows', file=sys.stderr)
    return 1 if remaining else 0


if __name__ == '__main__':
    raise SystemExit(main())
