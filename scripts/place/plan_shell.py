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
Every wall is a box on its centre line: its two end faces sit exactly on the plan's end points (no extension, no mitre).

OUTPUT: <out>/place.glb and <out>/place.json (the record scripts/place/import.mjs reads: size, bounds, walkableAreas, spawn).
GLB frame = the platform's room frame: x = plan x, y = up, z = -plan y (the same frame the other place models use).
Nodes (name, extras): floor_i, wall_solid_i / wall_light_i / wall_new_i (extras.p0, p1, thickness_m), column_i, stair_i, ceiling
(extras.hideable true; --no-ceiling leaves it out). Materials are plain (white paint 0.82, ceiling 0.80, concrete 0.38 reflectance).

    python3 scripts/place/plan_shell.py --plan PLAN.json --out DIR --height 3.07 [--new-walls FILE] [--no-ceiling]
        [--solid-t 0.30] [--light-t 0.12] [--stair-h 1.96] [--ceiling-t 0.15] [--spawn x,y --look x,y]
    python3 scripts/place/plan_shell.py --glb DIR/place.glb --plan PLAN.json [--new-walls FILE]   # wall-end error, metres
"""
import argparse, json, math, os, struct, sys

import numpy as np

# reflectance-based plain colours (linear base colour factor); no textures, no names of any production
MATERIALS = {
    'floor': (0.38, 0.38, 0.38), 'wall_solid': (0.82, 0.82, 0.82), 'wall_light': (0.86, 0.86, 0.86),
    'wall_new': (0.86, 0.80, 0.70), 'column': (0.72, 0.72, 0.72), 'stair': (0.60, 0.60, 0.62), 'ceiling': (0.80, 0.80, 0.80),
}
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
            'floor_rects': [[float(v) for v in r] for r in d.get('floor_rects_m', [])]}


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
            self.materials.append({'name': name, 'pbrMetallicRoughness': {'baseColorFactor': [r, g, b, 1.0], 'metallicFactor': 0.0, 'roughnessFactor': 0.9}})
            self.mat_index[name] = len(self.materials) - 1
        return self.mat_index[name]

    def add(self, node_name, corners, material, extras=None):
        pos, nor, idx = mesh_of(corners)
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
    for w in plan['solid'] + plan['light'] + plan['new']:
        for p in w:
            xs.append(p[0]); ys.append(p[1])
    for c in plan['columns']:
        xs += [c[0] - c[2] / 2, c[0] + c[2] / 2]; ys += [c[1] - c[3] / 2, c[1] + c[3] / 2]
    for s in plan['stairs']:
        xs += s['x']; ys += s['y']
    return min(xs), min(ys), max(xs), max(ys)


def build(plan, a):
    g = Glb()
    rects = plan['floor_rects'] or [list(extent(plan))]
    for i, r in enumerate(rects):
        g.add(f'floor_{i}', box_corners(r[0], r[1], r[2], r[3], -a.floor_t, 0.0), 'floor', {'rect_m': r})
    for kind, walls, t in (('solid', plan['solid'], a.solid_t), ('light', plan['light'], a.light_t), ('new', plan['new'], a.light_t if a.new_kind == 'light' else a.solid_t)):
        for i, (p0, p1) in enumerate(walls):
            g.add(f'wall_{kind}_{i}', oriented_box(p0, p1, t, 0.0, a.height), f'wall_{"solid" if kind == "solid" else ("light" if kind == "light" else "new")}',
                  {'p0': p0, 'p1': p1, 'thickness_m': t, 'height_m': a.height})
    for i, (cx, cy, w, d) in enumerate(plan['columns']):
        g.add(f'column_{i}', box_corners(cx - w / 2, cy - d / 2, cx + w / 2, cy + d / 2, 0.0, a.height), 'column', {'centre_m': [cx, cy], 'size_m': [w, d]})
    for i, s in enumerate(plan['stairs']):
        g.add(f'stair_{i}', box_corners(s['x'][0], s['y'][0], s['x'][1], s['y'][1], 0.0, a.stair_h), 'stair', {'x': s['x'], 'y': s['y'], 'height_m': a.stair_h})
    if not a.no_ceiling:
        for i, r in enumerate(rects):
            g.add('ceiling' if len(rects) == 1 else f'ceiling_{i}', box_corners(r[0], r[1], r[2], r[3], a.height, a.height + a.ceiling_t), 'ceiling', {'hideable': True, 'rect_m': r})
    return g, rects


def place_record(plan, rects, a):
    x0, y0, x1, y1 = extent(plan)
    fx0, fy0 = min([x0] + [r[0] for r in rects]), min([y0] + [r[1] for r in rects])
    fx1, fy1 = max([x1] + [r[2] for r in rects]), max([y1] + [r[3] for r in rects])
    top = a.height + (0 if a.no_ceiling else a.ceiling_t)
    rec = {'version': 1, 'size': [round(fx1 - fx0, 2), round(top + a.floor_t, 2), round(fy1 - fy0, 2)], 'scaleSource': 'plan',
           'scaleNote': 'standing-up of a traced wall plan (plan_shell.py): plan lengths P, heights and thicknesses as the build command states',
           'bakedIn': False, 'transform': {'position': [0, 0, 0], 'rotation': [0, 0, 0], 'scale': [1, 1, 1]},
           'bounds': {'min': [fx0, -a.floor_t, -fy1], 'max': [fx1, top, -fy0]},
           'walkableAreas': [{'minX': r[0], 'maxX': r[2], 'minZ': -r[3], 'maxZ': -r[1], 'maxY': a.height} for r in rects]}
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
    ap.add_argument('--stair-h', type=float, default=1.96)
    ap.add_argument('--floor-t', type=float, default=0.10)
    ap.add_argument('--ceiling-t', type=float, default=0.15)
    ap.add_argument('--no-ceiling', action='store_true')
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
    g, rects = build(plan, a)
    g.write(os.path.join(a.out, 'place.glb'))
    rec = place_record(plan, rects, a)
    json.dump(rec, open(os.path.join(a.out, 'place.json'), 'w'), indent=1)
    n_walls = len(plan['solid']) + len(plan['light']) + len(plan['new'])
    print(f'plan_shell: {n_walls} walls, {len(plan["columns"])} columns, {len(plan["stairs"])} stair blocks, {len(rects)} floor slabs, '
          f'height {a.height} m -> {os.path.join(a.out, "place.glb")}')
    return 0


if __name__ == '__main__':
    sys.exit(main())
