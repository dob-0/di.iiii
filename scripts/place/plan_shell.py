#!/usr/bin/env python3
"""plan_shell.py: a wall plan (JSON) + heights -> the plain shell of a room as a GLB (layer 1 of a room built layer by layer).

WHY: a room whose plan is traced from an official drawing needs a first 3D that is ONLY the plan stood up: floor, walls, columns,
stair blocks, ceiling. Nothing else (no doors, glazing, furniture, lamps): those are later layers. Every wall end is the plan's
own number, so the GLB can be checked against the JSON to the centimetre (plan-shell.test.js).

INPUT (JSON, all lengths in metres, plan frame: x across, y along, the plan's origin as drawn):
  walls_solid   [[[x0,y0],[x1,y1]], ...]   thick walls (default 0.30 m)
  walls_light   [[[x0,y0],[x1,y1]], ...]   thin walls (default 0.12 m)
  new_walls     [[[x0,y0],[x1,y1]], ...]   optional extra walls (also key new_walls_m, or --new-walls FILE); kind --new-kind
  columns       [[cx,cy,w,d], ...]          boxes centred on (cx,cy), w along x, d along y, full height
  stairs        [{"x":[x0,x1],"y":[y0,y1]}, ...]   solid blocks, height --stair-h
  floor_rects_m [[x0,y0,x1,y1], ...]        optional floor slabs; default = the bounding box of every wall, column and stair
  walls_glass   [[[x0,y0],[x1,y1]], ...]   glazed walls (layer 2): a thin translucent pane from the floor to --glass-h (default 2.6 m),
                                           a solid header band from there to the wall height
  openings      [{"wall":[[x0,y0],[x1,y1]], "x":[a,b], "head":h, "sill":0, "fill":"open"|"glass"}, ...]
                                           (layer 2) a gap in the wall whose two end points are exactly "wall": from a to b metres along it
                                           (measured from the first end point), from sill to head; a lintel closes it up to the wall height.
                                           fill "glass" puts a thin translucent leaf node opening_<wall>_<i> in the gap. A bad opening
                                           (off the wall, head above the wall, no such wall) stops the build with an error.
  props         [{"id","kind","x","y","z":0,"size":[w,d,h],"rotation":deg,"colour":[r,g,b],"alpha":1}, ...]
                                           (layer 3) simple fixed furniture as boxes: centre (x,y) on the plan, base height z, w along the
                                           prop's own x, d along its y, h up; rotation counter-clockwise on the plan in degrees. Node
                                           prop_<id> (extras kind, centre, size, rotation), material prop_<kind> (colour = linear base
                                           colour, default pale wood). Checked at build: a prop overlapping a wall, column, stair block or
                                           another prop (footprints cross AND heights overlap) or the corridor of a walk line, a duplicate id,
                                           a bad size or a prop above the wall height stops the build with an error.
  walk_lines    [{"from":[x,y],"to":[x,y],"width":w}, ...]   (layer 3) a line people must be able to walk: no prop below 1.8 m may touch
                                           the strip of that width around it.
  rooms         [{"id","outline":[[x,y],...],"height":h,"wall":"solid"|"light","shared_edges":[i,...],
                  "openings":[{"edge":i,"x":[a,b],"head":h,"sill":0,"fill":"open"|"glass"}],"stairs":[{"x":[a,b],"y":[a,b],"h":h}]}, ...]
                                           (layer 4) extra rooms beside the main floor: a CONVEX outline (counter-clockwise or not), its own height,
                                           floor + ceiling (node room_<id>_floor / room_<id>_ceiling, hideable) and a wall per edge
                                           (room_<id>_wall_<i>; edge i runs outline[i] -> outline[i+1]) except the shared_edges, where the main plan's
                                           (or a neighbour's) wall already stands. An opening cuts edge i from a to b metres along it. A room that
                                           overlaps the main floor or another room, a concave outline, a bad opening or a duplicate id stops the build.
Every wall is a box on its centre line: its two end faces sit exactly on the plan's end points (no extension, no mitre).

OUTPUT: <out>/place.glb and <out>/place.json (the record scripts/place/import.mjs reads: size, bounds, walkableAreas, spawn).
GLB frame = the platform's room frame: x = plan x, y = up, z = -plan y (the same frame the other place models use).
Nodes (name, extras): floor_i, wall_solid_i / wall_light_i / wall_new_i (extras.p0, p1, thickness_m), column_i, stair_i, ceiling
(extras.hideable true; --no-ceiling leaves it out). Materials are plain (white paint 0.82, ceiling 0.80, concrete 0.38 reflectance).

    python3 scripts/place/plan_shell.py --plan PLAN.json --out DIR --height 3.07 [--new-walls FILE] [--no-ceiling]
        [--prop-clear 1.8] [--solid-t 0.30] [--light-t 0.12] [--stair-h 1.96] [--glass-h 2.6] [--glass-t 0.04] [--ceiling-t 0.15] [--spawn x,y --look x,y]
    ... --reach     # after the build: a walk check from --spawn through every opening into every room; prints REACH_OK / REACH_FAIL (exit 1)
    python3 scripts/place/plan_shell.py --glb DIR/place.glb --plan PLAN.json [--new-walls FILE]   # wall-end error, metres
"""
import argparse, json, math, os, struct, sys

import numpy as np

# reflectance-based plain colours (linear base colour factor); no textures, no names of any production
MATERIALS = {
    'floor': (0.38, 0.38, 0.38), 'wall_solid': (0.82, 0.82, 0.82), 'wall_light': (0.86, 0.86, 0.86),
    'wall_new': (0.86, 0.80, 0.70), 'wall_header': (0.86, 0.86, 0.86), 'column': (0.72, 0.72, 0.72), 'stair': (0.60, 0.60, 0.62), 'ceiling': (0.80, 0.80, 0.80),
}
MATERIALS['glass'] = (0.80, 0.88, 0.92)          # frosted glazing seen in the walk frames: pale, translucent
MATERIALS['glass_leaf'] = (0.72, 0.84, 0.90)
PROP_DEFAULT = (0.62, 0.50, 0.34)               # pale pine, used when a prop gives no colour
TRANSLUCENT = {'glass': 0.35, 'glass_leaf': 0.45}   # alpha of the translucent materials
# faces of a box by corner index (bit 0 = x, bit 1 = y, bit 2 = z), counter-clockwise seen from outside
FACES = [((0, 2, 6, 4), (-1, 0, 0)), ((1, 5, 7, 3), (1, 0, 0)), ((0, 4, 5, 1), (0, -1, 0)),
         ((2, 3, 7, 6), (0, 1, 0)), ((0, 1, 3, 2), (0, 0, -1)), ((4, 6, 7, 5), (0, 0, 1))]


def read_walls(d, key):
    return [[[float(p[0]), float(p[1])] for p in w] for w in d.get(key, [])]


def load_plan(plan_path, new_walls_path=None):
    d = json.load(open(plan_path))
    new = read_walls(d, 'new_walls') + read_walls(d, 'new_walls_m')
    if new_walls_path:
        n = json.load(open(new_walls_path))
        new += read_walls(n, 'new_walls_m') + read_walls(n, 'new_walls')
    return {'solid': read_walls(d, 'walls_solid'), 'light': read_walls(d, 'walls_light'), 'new': new,
            'columns': [[float(v) for v in c] for c in d.get('columns', [])],
            'stairs': [{'x': [float(v) for v in s['x']], 'y': [float(v) for v in s['y']]} for s in d.get('stairs', [])],
            'floor_rects': [[float(v) for v in r] for r in d.get('floor_rects_m', [])],
            'glass': read_walls(d, 'walls_glass'),
            'props': d.get('props', []),
            'walk_lines': d.get('walk_lines', []),
            'rooms': d.get('rooms', []),
            'openings': [{'wall': [[float(q) for q in pt] for pt in o['wall']], 'x': [float(v) for v in o['x']], 'head': float(o['head']),
                          'sill': float(o.get('sill', 0.0)), 'fill': o.get('fill', 'open')} for o in d.get('openings', [])]}


def to_room(x, y, z):
    """plan (x, y) and height z -> room frame (x, up, -y)."""
    return (x, z, -y)


def box_corners(x0, y0, x1, y1, z0, z1):
    return [to_room(x, y, z) for z in (z0, z1) for y in (y0, y1) for x in (x0, x1)]   # bit0 x, bit1 y(plan), bit2 z


def oriented_box(p0, p1, t, z0, z1):
    """a wall box on the centre line p0-p1, thickness t; ends exactly at p0 and p1."""
    dx, dy = p1[0] - p0[0], p1[1] - p0[1]
    ln = math.hypot(dx, dy)
    if ln == 0:
        raise ValueError(f'zero-length wall at {p0}')
    nx, ny = -dy / ln * t / 2, dx / ln * t / 2
    pts = []
    for z in (z0, z1):
        for (px, py) in ((p0[0] - nx, p0[1] - ny), (p1[0] - nx, p1[1] - ny), (p0[0] + nx, p0[1] + ny), (p1[0] + nx, p1[1] + ny)):
            pts.append(to_room(px, py, z))
    # reorder to the bit layout: bit0 along the wall, bit1 across, bit2 up
    return pts


def mesh_of(corners):
    """24 vertices + 36 indices for a box given 8 corners in bit order (bit0 x/along, bit1 y/across, bit2 z/up).
    The plan->room mirror (z = -y) flips handedness, so the winding is chosen from the box's own centre."""
    c = np.array(corners, dtype=np.float64)
    centre = c.mean(axis=0)
    pos, nor, idx = [], [], []
    for quad, _ in FACES:
        q = c[list(quad)]
        n = np.cross(q[1] - q[0], q[2] - q[0])
        if np.dot(n, q.mean(axis=0) - centre) < 0:
            q = q[::-1]
            n = -n
        n = n / np.linalg.norm(n)
        base = len(pos)
        pos.extend(q.tolist())
        nor.extend([n.tolist()] * 4)
        idx.extend([base, base + 1, base + 2, base, base + 2, base + 3])
    return np.array(pos, np.float32), np.array(nor, np.float32), np.array(idx, np.uint16)


class Glb:
    def __init__(self):
        self.bin, self.views, self.accessors, self.meshes, self.nodes, self.materials, self.mat_index = bytearray(), [], [], [], [], [], {}

    def _blob(self, arr, target):
        while len(self.bin) % 4:
            self.bin.append(0)
        self.views.append({'buffer': 0, 'byteOffset': len(self.bin), 'byteLength': arr.nbytes, 'target': target})
        self.bin.extend(arr.tobytes())
        return len(self.views) - 1

    def material(self, name):
        if name not in self.mat_index:
            r, g, b = MATERIALS[name]
            m = {'name': name, 'pbrMetallicRoughness': {'baseColorFactor': [r, g, b, 1.0], 'metallicFactor': 0.0, 'roughnessFactor': 0.9}}
            if name in TRANSLUCENT:
                m['pbrMetallicRoughness'].update({'baseColorFactor': [r, g, b, TRANSLUCENT[name]], 'roughnessFactor': 0.35})
                m['alphaMode'] = 'BLEND'
                m['doubleSided'] = True
            self.materials.append(m)
            self.mat_index[name] = len(self.materials) - 1
        return self.mat_index[name]

    def add(self, node_name, corners, material, extras=None):
        pos, nor, idx = mesh_of(corners)
        self._mesh(node_name, pos, nor, idx, material, extras)

    def _mesh(self, node_name, pos, nor, idx, material, extras):
        pv, nv, iv = self._blob(pos, 34962), self._blob(nor, 34962), self._blob(idx, 34963)
        a = len(self.accessors)
        self.accessors += [
            {'bufferView': pv, 'componentType': 5126, 'count': len(pos), 'type': 'VEC3', 'min': pos.min(axis=0).tolist(), 'max': pos.max(axis=0).tolist()},
            {'bufferView': nv, 'componentType': 5126, 'count': len(nor), 'type': 'VEC3'},
            {'bufferView': iv, 'componentType': 5123, 'count': len(idx), 'type': 'SCALAR'}]
        self.meshes.append({'name': node_name, 'primitives': [{'attributes': {'POSITION': a, 'NORMAL': a + 1}, 'indices': a + 2, 'material': self.material(material)}]})
        node = {'name': node_name, 'mesh': len(self.meshes) - 1}
        if extras:
            node['extras'] = extras
        self.nodes.append(node)

    def add_multi(self, node_name, corner_sets, material, extras=None):
        """one node, one mesh, several boxes (a wall with openings is a row of boxes that stay one wall)."""
        pos, nor, idx = [], [], []
        for corners in corner_sets:
            p, n, i = mesh_of(corners)
            idx.append(i + len(pos)); pos.extend(p.tolist()); nor.extend(n.tolist())
        self._mesh(node_name, np.array(pos, np.float32), np.array(nor, np.float32), np.concatenate(idx).astype(np.uint16), material, extras)

    def write(self, path):
        while len(self.bin) % 4:
            self.bin.append(0)
        j = {'asset': {'version': '2.0', 'generator': 'scripts/place/plan_shell.py'}, 'scene': 0, 'scenes': [{'nodes': list(range(len(self.nodes)))}],
             'nodes': self.nodes, 'meshes': self.meshes, 'materials': self.materials, 'accessors': self.accessors,
             'bufferViews': self.views, 'buffers': [{'byteLength': len(self.bin)}]}
        js = json.dumps(j, separators=(',', ':')).encode()
        js += b' ' * (-len(js) % 4)
        total = 12 + 8 + len(js) + 8 + len(self.bin)
        with open(path, 'wb') as f:
            f.write(struct.pack('<4sII', b'glTF', 2, total))
            f.write(struct.pack('<I4s', len(js), b'JSON') + js)
            f.write(struct.pack('<I4s', len(self.bin), b'BIN\0') + bytes(self.bin))


def extent(plan):
    xs, ys = [], []
    for w in plan['solid'] + plan['light'] + plan['new'] + plan['glass']:
        for p in w:
            xs.append(p[0]); ys.append(p[1])
    for c in plan['columns']:
        xs += [c[0] - c[2] / 2, c[0] + c[2] / 2]; ys += [c[1] - c[3] / 2, c[1] + c[3] / 2]
    for s in plan['stairs']:
        xs += s['x']; ys += s['y']
    return min(xs), min(ys), max(xs), max(ys)


def wall_parts(length, openings, z_top):
    """the boxes (s0, s1, z0, z1) of a wall of this length from the floor to z_top, with its openings cut out; s along the wall."""
    parts, s = [], 0.0
    for o in sorted(openings, key=lambda o: o['x'][0]):
        a, b = o['x']
        if a > s:
            parts.append((s, a, 0.0, z_top))
        if o['sill'] > 0:
            parts.append((a, b, 0.0, o['sill']))
        if o['head'] < z_top:
            parts.append((a, b, o['head'], z_top))
        s = b
    if s < length:
        parts.append((s, length, 0.0, z_top))
    return parts


def at(p0, p1, s):
    ln = math.hypot(p1[0] - p0[0], p1[1] - p0[1])
    return [p0[0] + (p1[0] - p0[0]) * s / ln, p0[1] + (p1[1] - p0[1]) * s / ln]


def check_openings(plan, height):
    walls = [tuple(map(tuple, w)) for w in plan['solid'] + plan['light'] + plan['new'] + plan['glass']]
    by_wall = {}
    for k, o in enumerate(plan['openings']):
        key = tuple(map(tuple, o['wall']))
        if key not in walls:
            raise SystemExit(f'plan_shell: opening {k}: no wall with end points {o["wall"]}')
        length = math.dist(*key)
        a, b = o['x']
        if not (0 <= a < b <= length + 1e-9):
            raise SystemExit(f'plan_shell: opening {k}: x {o["x"]} is not inside the wall (0..{length:.3f} m)')
        if not (0 <= o['sill'] < o['head'] <= height):
            raise SystemExit(f'plan_shell: opening {k}: sill {o["sill"]} / head {o["head"]} must satisfy 0 <= sill < head <= wall height {height}')
        if o['fill'] not in ('open', 'glass'):
            raise SystemExit(f'plan_shell: opening {k}: fill must be "open" or "glass"')
        by_wall.setdefault(key, []).append(o)
    for key, os_ in by_wall.items():
        os_.sort(key=lambda o: o['x'][0])
        for u, v in zip(os_, os_[1:]):
            if v['x'][0] < u['x'][1]:
                raise SystemExit(f'plan_shell: openings overlap on wall {key}')
    return by_wall


def wall_boxes(p0, p1, t, z_top, openings):
    return [oriented_box(at(p0, p1, s0), at(p0, p1, s1), t, z0, z1) for s0, s1, z0, z1 in wall_parts(math.dist(p0, p1), openings, z_top)]


def prop_footprint(p):
    """the 4 plan corners of a prop's footprint (counter-clockwise), rotation about its centre."""
    w, d = p['size'][0], p['size'][1]
    c, s = math.cos(math.radians(p.get('rotation', 0.0))), math.sin(math.radians(p.get('rotation', 0.0)))
    return [(p['x'] + lx * c - ly * s, p['y'] + lx * s + ly * c) for lx, ly in ((-w / 2, -d / 2), (w / 2, -d / 2), (w / 2, d / 2), (-w / 2, d / 2))]


def seg_rect(p0, p1, t):
    dx, dy = p1[0] - p0[0], p1[1] - p0[1]
    ln = math.hypot(dx, dy)
    nx, ny = -dy / ln * t / 2, dx / ln * t / 2
    return [(p0[0] - nx, p0[1] - ny), (p1[0] - nx, p1[1] - ny), (p1[0] + nx, p1[1] + ny), (p0[0] + nx, p0[1] + ny)]


def polys_overlap(a, b, eps=1e-6):
    """separating-axis test for two convex polygons; touching (gap <= eps) does not count as overlap."""
    for poly in (a, b):
        for i in range(len(poly)):
            ex, ey = poly[(i + 1) % len(poly)][0] - poly[i][0], poly[(i + 1) % len(poly)][1] - poly[i][1]
            ax, ay = -ey, ex
            n = math.hypot(ax, ay)
            if n == 0:
                continue
            ax, ay = ax / n, ay / n
            pa = [ax * x + ay * y for x, y in a]
            pb = [ax * x + ay * y for x, y in b]
            if max(pa) <= min(pb) + eps or max(pb) <= min(pa) + eps:
                return False
    return True


def check_props(plan, a):
    """validate props, return the number of overlaps found (0 or the build is stopped). Prints the check line."""
    props = plan['props']
    ids = set()
    for p in props:
        for k in ('id', 'kind', 'x', 'y', 'size'):
            if k not in p:
                raise SystemExit(f'plan_shell: prop {p.get("id", "?")}: missing "{k}"')
        if p['id'] in ids:
            raise SystemExit(f'plan_shell: prop {p["id"]}: duplicate id')
        ids.add(p['id'])
        if len(p['size']) != 3 or min(p['size']) <= 0:
            raise SystemExit(f'plan_shell: prop {p["id"]}: size must be [w, d, h] with all three > 0, got {p["size"]}')
        if p.get('z', 0.0) < 0 or p.get('z', 0.0) + p['size'][2] > a.height + 1e-9:
            raise SystemExit(f'plan_shell: prop {p["id"]}: z {p.get("z", 0.0)} + height {p["size"][2]} is outside 0..{a.height} (wall height)')
    solids = []   # (name, polygon)
    for kind, walls, t in (('wall_solid', plan['solid'], a.solid_t), ('wall_light', plan['light'], a.light_t),
                           ('wall_new', plan['new'], a.light_t if a.new_kind == 'light' else a.solid_t), ('wall_glass', plan['glass'], a.glass_t)):
        for i, (p0, p1) in enumerate(walls):
            solids.append((f'{kind}_{i}', seg_rect(p0, p1, t)))
    for r in plan['rooms']:                      # layer 4: a prop may not stand in a room's own wall either
        t = a.solid_t if r.get('wall', 'light') == 'solid' else a.light_t
        for e, (p0, p1) in enumerate(room_edges({'outline': [tuple(float(v) for v in q) for q in r['outline']]})):
            if e not in r.get('shared_edges', []):
                solids.append((f'room_{r["id"]}_wall_{e}', seg_rect(p0, p1, t)))
        for k, st in enumerate(r.get('stairs', [])):
            solids.append((f'room_{r["id"]}_stair_{k}', [(st['x'][0], st['y'][0]), (st['x'][1], st['y'][0]), (st['x'][1], st['y'][1]), (st['x'][0], st['y'][1])]))
    for i, (cx, cy, w, d) in enumerate(plan['columns']):
        solids.append((f'column_{i}', [(cx - w / 2, cy - d / 2), (cx + w / 2, cy - d / 2), (cx + w / 2, cy + d / 2), (cx - w / 2, cy + d / 2)]))
    for i, s in enumerate(plan['stairs']):
        solids.append((f'stair_{i}', [(s['x'][0], s['y'][0]), (s['x'][1], s['y'][0]), (s['x'][1], s['y'][1]), (s['x'][0], s['y'][1])]))
    found = []
    for n, p in enumerate(props):
        fp = prop_footprint(p)
        for name, poly in solids:
            if polys_overlap(fp, poly):
                found.append(f'prop {p["id"]} overlaps {name}')
        for q in props[n + 1:]:
            z0, z1, w0, w1 = p.get('z', 0.0), p.get('z', 0.0) + p['size'][2], q.get('z', 0.0), q.get('z', 0.0) + q['size'][2]
            if z0 < w1 - 1e-9 and w0 < z1 - 1e-9 and polys_overlap(fp, prop_footprint(q)):
                found.append(f'prop {p["id"]} overlaps prop {q["id"]}')
        if p.get('z', 0.0) < a.prop_clear:
            for k, wl in enumerate(plan['walk_lines']):
                if polys_overlap(fp, seg_rect(wl['from'], wl['to'], float(wl['width']))):
                    found.append(f'prop {p["id"]} blocks walk line {k} ({wl["from"]} -> {wl["to"]}, width {wl["width"]})')
    if found:
        raise SystemExit('plan_shell: ' + '; '.join(found) + ' (overlap)')
    print(f'props check: {len(props)} props, 0 overlaps with {len(solids)} walls/columns/stairs, 0 blocking {len(plan["walk_lines"])} walk line(s)')
    return 0


def prop_corners(p):
    """8 corners in bit order (bit0 along the prop's x, bit1 its y, bit2 up) -> room frame."""
    fp = prop_footprint(p)           # (-,-), (+,-), (+,+), (-,+)
    z0, z1 = p.get('z', 0.0), p.get('z', 0.0) + p['size'][2]
    pts = []
    for z in (z0, z1):
        for i in (0, 1, 3, 2):       # bit0 x, bit1 y
            pts.append(to_room(fp[i][0], fp[i][1], z))
    return pts


# ---------------------------------------------------------------- layer 4: rooms
def room_edges(room):
    o = room['outline']
    return [(o[i], o[(i + 1) % len(o)]) for i in range(len(o))]


def is_convex(poly):
    sign = 0
    for i in range(len(poly)):
        a, b, c = poly[i], poly[(i + 1) % len(poly)], poly[(i + 2) % len(poly)]
        cr = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0])
        if abs(cr) < 1e-9:
            continue
        if sign and (cr > 0) != (sign > 0):
            return False
        sign = 1 if cr > 0 else -1
    return sign != 0


def point_in_convex(poly, x, y):
    sign = 0
    for i in range(len(poly)):
        a, b = poly[i], poly[(i + 1) % len(poly)]
        cr = (b[0] - a[0]) * (y - a[1]) - (b[1] - a[1]) * (x - a[0])
        if abs(cr) < 1e-12:
            continue
        if sign and (cr > 0) != (sign > 0):
            return False
        sign = 1 if cr > 0 else -1
    return True


def check_rooms(plan, a):
    """validate rooms; returns {room id: {edge: [openings]}}. Stops loudly on any fault."""
    seen, polys, by_room = set(), [], {}
    for r in plan['rooms']:
        for k in ('id', 'outline', 'height'):
            if k not in r:
                raise SystemExit(f'plan_shell: room {r.get("id", "?")}: missing "{k}"')
        if r['id'] in seen:
            raise SystemExit(f'plan_shell: room {r["id"]}: duplicate room id')
        seen.add(r['id'])
        poly = [tuple(float(v) for v in p) for p in r['outline']]
        if len(poly) < 3 or not is_convex(poly):
            raise SystemExit(f'plan_shell: room {r["id"]}: the outline must be a convex polygon of 3 or more points')
        if float(r['height']) <= 0:
            raise SystemExit(f'plan_shell: room {r["id"]}: height must be > 0')
        edges = room_edges({'outline': poly})
        ops = {}
        for k, o in enumerate(r.get('openings', [])):
            e = o.get('edge')
            if not isinstance(e, int) or not (0 <= e < len(edges)):
                raise SystemExit(f'plan_shell: room {r["id"]} opening {k}: edge {e} is not one of the {len(edges)} edges')
            ln = math.dist(*edges[e])
            x0, x1 = o['x']
            if not (0 <= x0 < x1 <= ln + 1e-9):
                raise SystemExit(f'plan_shell: room {r["id"]} opening {k}: x {o["x"]} is not inside the edge (0..{ln:.3f} m)')
            sill, head = float(o.get('sill', 0.0)), float(o['head'])
            if not (0 <= sill < head <= float(r['height'])):
                raise SystemExit(f'plan_shell: room {r["id"]} opening {k}: sill/head must satisfy 0 <= sill < head <= room height {r["height"]}')
            ops.setdefault(e, []).append({'x': [float(x0), float(x1)], 'sill': sill, 'head': head, 'fill': o.get('fill', 'open')})
        for lst in ops.values():
            lst.sort(key=lambda o: o['x'][0])
            for u, v in zip(lst, lst[1:]):
                if v['x'][0] < u['x'][1]:
                    raise SystemExit(f'plan_shell: room {r["id"]}: openings overlap')
        for e in r.get('shared_edges', []):
            if not (0 <= e < len(edges)):
                raise SystemExit(f'plan_shell: room {r["id"]}: shared edge {e} does not exist')
        by_room[r['id']] = ops
        polys.append((r['id'], poly))
    rects = plan['floor_rects'] or [list(extent(plan))]
    for rid, poly in polys:
        for rc in rects:
            if polys_overlap(poly, [(rc[0], rc[1]), (rc[2], rc[1]), (rc[2], rc[3]), (rc[0], rc[3])]):
                raise SystemExit(f'plan_shell: room {rid} overlaps the main floor slab {rc}')
    for i, (ida, pa) in enumerate(polys):
        for idb, pb in polys[i + 1:]:
            if polys_overlap(pa, pb):
                raise SystemExit(f'plan_shell: room {ida} overlaps room {idb}')
    return by_room


def fan_mesh(poly, y_up, up):
    """a flat convex polygon at height y_up facing up (+1) or down (-1), in the room frame."""
    pos = [list(to_room(x, y, y_up)) for x, y in poly]
    idx = []
    for i in range(1, len(poly) - 1):
        idx += [0, i, i + 1]
    pos = np.array(pos, np.float32)
    tri = np.array(idx, np.uint16).reshape(-1, 3)
    n = np.cross(pos[tri[0][1]] - pos[tri[0][0]], pos[tri[0][2]] - pos[tri[0][0]])
    if (n[1] > 0) != (up > 0):
        tri = tri[:, ::-1]
    nor = np.tile(np.array([0.0, float(up), 0.0], np.float32), (len(pos), 1))
    return pos, nor, tri.reshape(-1).astype(np.uint16)


def build_rooms(g, plan, a, by_room):
    for r in plan['rooms']:
        rid, h = r['id'], float(r['height'])
        poly = [tuple(float(v) for v in p) for p in r['outline']]
        t = a.solid_t if r.get('wall', 'light') == 'solid' else a.light_t
        pos, nor, idx = fan_mesh(poly, 0.0, +1)
        g._mesh(f'room_{rid}_floor', pos, nor, idx, 'floor', {'room': rid, 'outline_m': r['outline']})
        for e, (p0, p1) in enumerate(room_edges({'outline': poly})):
            if e in r.get('shared_edges', []):
                continue
            ops = by_room[rid].get(e, [])
            extras = {'room': rid, 'p0': list(p0), 'p1': list(p1), 'thickness_m': t, 'height_m': h}
            if ops:
                extras['openings'] = [{'x': o['x'], 'sill': o['sill'], 'head': o['head'], 'fill': o['fill']} for o in ops]
            g.add_multi(f'room_{rid}_wall_{e}', wall_boxes(list(p0), list(p1), t, h, ops), 'wall_solid' if t == a.solid_t else 'wall_light', extras)
            for k, o in enumerate(ops):
                if o['fill'] == 'glass':
                    g.add(f'room_{rid}_glass_{e}_{k}', oriented_box(at(list(p0), list(p1), o['x'][0]), at(list(p0), list(p1), o['x'][1]), a.glass_t, o['sill'], o['head']), 'glass_leaf', {'room': rid})
        for k, s in enumerate(r.get('stairs', [])):
            sh = float(s.get('h', a.stair_h))
            g.add(f'room_{rid}_stair_{k}', box_corners(s['x'][0], s['y'][0], s['x'][1], s['y'][1], 0.0, sh), 'stair', {'room': rid, 'x': s['x'], 'y': s['y'], 'height_m': sh})
        if not a.no_ceiling:
            pos, nor, idx = fan_mesh(poly, h, -1)
            g._mesh(f'room_{rid}_ceiling', pos, nor, idx, 'ceiling', {'room': rid, 'hideable': True})


def reach_check(plan, a, by_room, step=0.1, radius=0.25):
    """walk check: grid of the walkable floor (main slabs + rooms), blocked by walls (the parts that reach below 1.0 m), columns, stair blocks,
    low props; the agent has a radius. Flood from the spawn. Prints REACH_OK / REACH_FAIL naming rooms not reached. -> exit code."""
    if not a.spawn:
        raise SystemExit('plan_shell: --reach needs --spawn x,y')
    sx, sy = [float(v) for v in a.spawn.split(',')]
    rects = plan['floor_rects'] or [list(extent(plan))]
    polys = {r['id']: [tuple(float(v) for v in p) for p in r['outline']] for r in plan['rooms']}
    allx = [r[0] for r in rects] + [r[2] for r in rects] + [p[0] for pl in polys.values() for p in pl]
    ally = [r[1] for r in rects] + [r[3] for r in rects] + [p[1] for pl in polys.values() for p in pl]
    x0, y0, x1, y1 = min(allx), min(ally), max(allx), max(ally)
    nx, ny = int((x1 - x0) / step) + 1, int((y1 - y0) / step) + 1
    gx = x0 + (np.arange(nx) + 0.5) * step
    gy = y0 + (np.arange(ny) + 0.5) * step
    X, Y = np.meshgrid(gx, gy, indexing='ij')
    inside = np.zeros((nx, ny), bool)
    for r in rects:
        inside |= (X >= r[0]) & (X <= r[2]) & (Y >= r[1]) & (Y <= r[3])
    room_mask = {}
    for rid, pl in polys.items():
        m = np.zeros((nx, ny), bool)
        for i in range(nx):
            for j in range(ny):
                m[i, j] = point_in_convex(pl, gx[i], gy[j])
        room_mask[rid] = m
        inside |= m
    blocked = np.zeros((nx, ny), bool)

    def block_poly(poly):
        xs, ys = [p[0] for p in poly], [p[1] for p in poly]
        for i in range(max(0, int((min(xs) - x0) / step) - 1), min(nx, int((max(xs) - x0) / step) + 2)):
            for j in range(max(0, int((min(ys) - y0) / step) - 1), min(ny, int((max(ys) - y0) / step) + 2)):
                if point_in_convex(poly, gx[i], gy[j]):
                    blocked[i, j] = True

    def block_wall(p0, p1, t, height, ops):
        for s0, s1, z0, z1 in wall_parts(math.dist(p0, p1), ops, height):
            if z0 < 1.0 and z1 > 0.4:
                block_poly(seg_rect(at(p0, p1, s0), at(p0, p1, s1), max(t, step)))
    by_main = check_openings(plan, a.height)
    for kind, walls, t in (('solid', plan['solid'], a.solid_t), ('light', plan['light'], a.light_t), ('new', plan['new'], a.light_t if a.new_kind == 'light' else a.solid_t)):
        for p0, p1 in walls:
            block_wall(p0, p1, t, a.height, by_main.get((tuple(p0), tuple(p1)), []))
    for p0, p1 in plan['glass']:
        block_wall(p0, p1, a.glass_t, min(a.glass_h, a.height), by_main.get((tuple(p0), tuple(p1)), []))
    for cx, cy, w, d in plan['columns']:
        block_poly([(cx - w / 2, cy - d / 2), (cx + w / 2, cy - d / 2), (cx + w / 2, cy + d / 2), (cx - w / 2, cy + d / 2)])
    for s in plan['stairs']:
        block_poly([(s['x'][0], s['y'][0]), (s['x'][1], s['y'][0]), (s['x'][1], s['y'][1]), (s['x'][0], s['y'][1])])
    for p in plan['props']:
        if p.get('z', 0.0) < a.prop_clear and p.get('z', 0.0) + p['size'][2] > 0.4:
            block_poly(prop_footprint(p))
    for r in plan['rooms']:
        t = a.solid_t if r.get('wall', 'light') == 'solid' else a.light_t
        for e, (p0, p1) in enumerate(room_edges({'outline': polys[r['id']]})):
            if e not in r.get('shared_edges', []):
                block_wall(list(p0), list(p1), t, float(r['height']), by_room[r['id']].get(e, []))
        for s in r.get('stairs', []):
            block_poly([(s['x'][0], s['y'][0]), (s['x'][1], s['y'][0]), (s['x'][1], s['y'][1]), (s['x'][0], s['y'][1])])
    k = int(math.ceil(radius / step))
    dil = blocked.copy()
    for di in range(-k, k + 1):
        for dj in range(-k, k + 1):
            if di * di + dj * dj <= k * k:
                dil |= np.roll(np.roll(blocked, di, 0), dj, 1)
    free = inside & ~dil
    si, sj = int((sx - x0) / step), int((sy - y0) / step)
    if not free[si, sj]:
        raise SystemExit(f'plan_shell: --reach: the spawn {a.spawn} is not on free floor')
    seen = np.zeros((nx, ny), bool)
    stack = [(si, sj)]
    seen[si, sj] = True
    while stack:
        i, j = stack.pop()
        for di, dj in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            ii, jj = i + di, j + dj
            if 0 <= ii < nx and 0 <= jj < ny and free[ii, jj] and not seen[ii, jj]:
                seen[ii, jj] = True
                stack.append((ii, jj))
    missed = [rid for rid, m in room_mask.items() if not (seen & m).any()]
    detail = ', '.join(f'{rid}: {int((seen & m).sum() * step * step)} m2 of {int(m.sum() * step * step)} m2 walkable' for rid, m in room_mask.items())
    if missed:
        print(f'REACH_FAIL room(s) not reachable from the spawn {a.spawn}: {", ".join(missed)} ({detail})')
        return 1
    print(f'REACH_OK {len(room_mask)} room(s) reachable from the spawn {a.spawn} ({detail}); agent radius {radius} m, grid {step} m')
    return 0


def build(plan, a):
    g = Glb()
    rects = plan['floor_rects'] or [list(extent(plan))]
    for i, r in enumerate(rects):
        g.add(f'floor_{i}', box_corners(r[0], r[1], r[2], r[3], -a.floor_t, 0.0), 'floor', {'rect_m': r})
    by_wall = check_openings(plan, a.height)
    leaf = 0
    for kind, walls, t in (('solid', plan['solid'], a.solid_t), ('light', plan['light'], a.light_t), ('new', plan['new'], a.light_t if a.new_kind == 'light' else a.solid_t)):
        for i, (p0, p1) in enumerate(walls):
            ops = by_wall.get((tuple(p0), tuple(p1)), [])
            mat = f'wall_{"solid" if kind == "solid" else ("light" if kind == "light" else "new")}'
            extras = {'p0': p0, 'p1': p1, 'thickness_m': t, 'height_m': a.height}
            if ops:
                extras['openings'] = [{'x': o['x'], 'sill': o['sill'], 'head': o['head'], 'fill': o['fill']} for o in ops]
                g.add_multi(f'wall_{kind}_{i}', wall_boxes(p0, p1, t, a.height, ops), mat, extras)
            else:
                g.add(f'wall_{kind}_{i}', oriented_box(p0, p1, t, 0.0, a.height), mat, extras)
            for o in ops:
                if o['fill'] == 'glass':
                    g.add(f'opening_glass_{leaf}', oriented_box(at(p0, p1, o['x'][0]), at(p0, p1, o['x'][1]), a.glass_t, o['sill'], o['head']), 'glass_leaf', {'wall': f'wall_{kind}_{i}', 'x': o['x']})
                    leaf += 1
    for i, (p0, p1) in enumerate(plan['glass']):
        ops = by_wall.get((tuple(p0), tuple(p1)), [])
        gh = min(a.glass_h, a.height)
        extras = {'p0': p0, 'p1': p1, 'thickness_m': a.glass_t, 'height_m': gh, 'glass_head_m': gh}
        if ops:
            extras['openings'] = [{'x': o['x'], 'sill': o['sill'], 'head': o['head'], 'fill': o['fill']} for o in ops]
        g.add_multi(f'wall_glass_{i}', wall_boxes(p0, p1, a.glass_t, gh, ops), 'glass', extras)
        if gh < a.height:
            g.add(f'wall_glassheader_{i}', oriented_box(p0, p1, a.light_t, gh, a.height), 'wall_header', {'p0': p0, 'p1': p1, 'thickness_m': a.light_t})
        for o in ops:
            if o['fill'] == 'glass':
                g.add(f'opening_glass_{leaf}', oriented_box(at(p0, p1, o['x'][0]), at(p0, p1, o['x'][1]), a.glass_t, o['sill'], o['head']), 'glass_leaf', {'wall': f'wall_glass_{i}', 'x': o['x']})
                leaf += 1
    for i, (cx, cy, w, d) in enumerate(plan['columns']):
        g.add(f'column_{i}', box_corners(cx - w / 2, cy - d / 2, cx + w / 2, cy + d / 2, 0.0, a.height), 'column', {'centre_m': [cx, cy], 'size_m': [w, d]})
    for i, s in enumerate(plan['stairs']):
        g.add(f'stair_{i}', box_corners(s['x'][0], s['y'][0], s['x'][1], s['y'][1], 0.0, a.stair_h), 'stair', {'x': s['x'], 'y': s['y'], 'height_m': a.stair_h})
    for p in plan['props']:
        col = tuple(float(v) for v in p.get('colour', PROP_DEFAULT))
        mat = f'prop_{p["kind"]}'
        while MATERIALS.get(mat, col) != col:          # same kind, another colour: its own material
            mat += '_'
        MATERIALS[mat] = col
        if p.get('alpha', 1.0) < 1.0:
            TRANSLUCENT[mat] = float(p['alpha'])
        g.add(f'prop_{p["id"]}', prop_corners(p), mat, {'kind': p['kind'], 'centre_m': [p['x'], p['y']], 'size_m': p['size'], 'z_m': p.get('z', 0.0), 'rotation_deg': p.get('rotation', 0.0)})
    build_rooms(g, plan, a, a.by_room)
    if not a.no_ceiling:
        for i, r in enumerate(rects):
            g.add('ceiling' if len(rects) == 1 else f'ceiling_{i}', box_corners(r[0], r[1], r[2], r[3], a.height, a.height + a.ceiling_t), 'ceiling', {'hideable': True, 'rect_m': r})
    return g, rects


def place_record(plan, rects, a):
    x0, y0, x1, y1 = extent(plan)
    fx0, fy0 = min([x0] + [r[0] for r in rects]), min([y0] + [r[1] for r in rects])
    fx1, fy1 = max([x1] + [r[2] for r in rects]), max([y1] + [r[3] for r in rects])
    for r in plan['rooms']:
        for px, py in r['outline']:
            fx0, fy0, fx1, fy1 = min(fx0, px), min(fy0, py), max(fx1, px), max(fy1, py)
    top = max([a.height] + [float(r['height']) for r in plan['rooms']]) + (0 if a.no_ceiling else a.ceiling_t)
    rec = {'version': 1, 'size': [round(fx1 - fx0, 2), round(top + a.floor_t, 2), round(fy1 - fy0, 2)], 'scaleSource': 'plan',
           'scaleNote': 'standing-up of a traced wall plan (plan_shell.py): plan lengths P, heights and thicknesses as the build command states',
           'bakedIn': False, 'transform': {'position': [0, 0, 0], 'rotation': [0, 0, 0], 'scale': [1, 1, 1]},
           'bounds': {'min': [fx0, -a.floor_t, -fy1], 'max': [fx1, top, -fy0]},
           'walkableAreas': [{'minX': r[0], 'maxX': r[2], 'minZ': -r[3], 'maxZ': -r[1], 'maxY': a.height} for r in rects]}
    for r in plan['rooms']:
        xs, ys = [p[0] for p in r['outline']], [p[1] for p in r['outline']]
        rec['walkableAreas'].append({'minX': min(xs), 'maxX': max(xs), 'minZ': -max(ys), 'maxZ': -min(ys), 'maxY': float(r['height']), 'room': r['id']})
    if a.spawn:
        sx, sy = [float(v) for v in a.spawn.split(',')]
        lx, ly = [float(v) for v in (a.look or f'{sx},{sy + 10}').split(',')]
        rec['spawn'] = {'x': sx, 'z': -sy, 'altY': 1.6, 'look': {'x': lx, 'z': -ly}, 'yaw': round(math.atan2(lx - sx, -ly + sy), 3)}
    return rec


def read_glb(path):
    b = open(path, 'rb').read()
    magic, ver, total = struct.unpack('<4sII', b[:12])
    if magic != b'glTF' or ver != 2 or total != len(b):
        raise ValueError('not a GLB 2.0 of the stated length')
    jl, _ = struct.unpack('<I4s', b[12:20])
    j = json.loads(b[20:20 + jl])
    off = 20 + jl
    bl, _ = struct.unpack('<I4s', b[off:off + 8])
    return j, b[off + 8:off + 8 + bl]


def node_vertices(j, binary, node):
    prim = j['meshes'][node['mesh']]['primitives'][0]
    acc = j['accessors'][prim['attributes']['POSITION']]
    bv = j['bufferViews'][acc['bufferView']]
    return np.frombuffer(binary, np.float32, acc['count'] * 3, bv['byteOffset']).reshape(-1, 3)


def wall_end_errors(glb_path, plan):
    """for each wall: the GLB's own end points (mid-line of the end faces, from the vertices alone) against the JSON's. -> list of (name, err_m)"""
    j, binary = read_glb(glb_path)
    walls = {f'wall_solid_{i}': w for i, w in enumerate(plan['solid'])}
    walls.update({f'wall_light_{i}': w for i, w in enumerate(plan['light'])})
    walls.update({f'wall_new_{i}': w for i, w in enumerate(plan['new'])})
    walls.update({f'wall_glass_{i}': w for i, w in enumerate(plan['glass'])})
    for r in plan['rooms']:
        for e, (p0, p1) in enumerate(room_edges({'outline': [tuple(float(v) for v in p) for p in r['outline']]})):
            if e not in r.get('shared_edges', []):
                walls[f'room_{r["id"]}_wall_{e}'] = [list(p0), list(p1)]
    out = {n['name']: n for n in j['nodes']}
    res = []
    for name, (p0, p1) in walls.items():
        if name not in out:
            res.append((name, float('inf')))
            continue
        v = node_vertices(j, binary, out[name])
        v = np.unique(np.round(v, 5), axis=0)
        plan_xy = np.stack([v[:, 0], -v[:, 2]], axis=1)             # back to plan (x, y)
        u = np.array(p1) - np.array(p0)
        u = u / np.linalg.norm(u)
        s = (plan_xy - np.array(p0)) @ u
        lo = plan_xy[np.isclose(s, s.min(), atol=1e-4)].mean(axis=0)   # centre of the end face at p0's side
        hi = plan_xy[np.isclose(s, s.max(), atol=1e-4)].mean(axis=0)
        res.append((name, float(max(np.linalg.norm(lo - np.array(p0)), np.linalg.norm(hi - np.array(p1))))))
    return res


def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    ap.add_argument('--plan', required=True)
    ap.add_argument('--new-walls', help='JSON with new_walls_m (or new_walls), added to the plan')
    ap.add_argument('--new-kind', choices=('light', 'solid'), default='light')
    ap.add_argument('--out', help='folder for place.glb + place.json')
    ap.add_argument('--glb', help='check mode: report wall-end error of this GLB against --plan')
    ap.add_argument('--height', type=float, default=3.0)
    ap.add_argument('--solid-t', type=float, default=0.30)
    ap.add_argument('--light-t', type=float, default=0.12)
    ap.add_argument('--glass-h', type=float, default=2.6, help='glass wall: pane height; a solid header band closes it up to --height')
    ap.add_argument('--glass-t', type=float, default=0.04)
    ap.add_argument('--stair-h', type=float, default=1.96)
    ap.add_argument('--floor-t', type=float, default=0.10)
    ap.add_argument('--ceiling-t', type=float, default=0.15)
    ap.add_argument('--prop-clear', type=float, default=1.8, help='props whose base is below this height must stay off a walk line')
    ap.add_argument('--no-ceiling', action='store_true')
    ap.add_argument('--reach', action='store_true', help='walk check from --spawn into every room (REACH_OK / REACH_FAIL)')
    ap.add_argument('--spawn'); ap.add_argument('--look')
    a = ap.parse_args()
    plan = load_plan(a.plan, a.new_walls)
    if a.glb:
        errs = wall_end_errors(a.glb, plan)
        worst = max(errs, key=lambda e: e[1])
        print(f'walls {len(errs)}  max end error {worst[1]:.4f} m ({worst[0]})')
        return 0 if worst[1] <= 0.01 else 1
    if not a.out:
        ap.error('--out is required to build')
    os.makedirs(a.out, exist_ok=True)
    check_props(plan, a)
    a.by_room = check_rooms(plan, a)
    g, rects = build(plan, a)
    g.write(os.path.join(a.out, 'place.glb'))
    rec = place_record(plan, rects, a)
    json.dump(rec, open(os.path.join(a.out, 'place.json'), 'w'), indent=1)
    if a.reach and reach_check(plan, a, a.by_room):
        return 1
    n_walls = len(plan['solid']) + len(plan['light']) + len(plan['new']) + len(plan['glass'])
    print(f'plan_shell: {n_walls} walls, {len(plan["columns"])} columns, {len(plan["stairs"])} stair blocks, {len(rects)} floor slabs, '
          f'{len(plan["props"])} props, {len(plan["rooms"])} rooms, height {a.height} m -> {os.path.join(a.out, "place.glb")}')
    return 0


if __name__ == '__main__':
    sys.exit(main())
