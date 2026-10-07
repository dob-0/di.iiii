#!/usr/bin/env python3
# occlusion_lib.py — the obstacle model of MOXIR's permanent things, and a ray caster against it (2026-10-08).
#
# WHY TRIANGLES (and not boxes): the owner, 2026-10-08: "the place has permanent things and blocking areas, take them
# into account". The plot's own checks (lights_beta_options.py) test rays against ~70 boxes: columns only up to the
# head (7.06 m), no upper columns, no space frame member by member, the runways as two slabs. The hall's GLB is the SAME
# parametric model (scripts/place/hall.py, Blender, from the committed dims files) drawn in full: 3656 space-frame
# members, the flared heads and the upper columns to the roof, both runway girders per row, the crane's girders,
# trolley and cab, the walls with their glazing, and the machines as hall.py details them. Casting against those
# 55 000 triangles tests what the room in di actually holds; the box model is then a cross-check, not the source.
#   - The rig's own solids (truss, hoists, chains, bridles, steels, tie-offs, PA stacks, the DJ deck and table, the
#     barrier) are NOT in the hall GLB: they come from the beta's committed snapshot as oriented boxes (slab method).
#   - Every triangle is NAMED from hall.json (the record the GLB was built from): its massing item, its column
#     (shaft, head or upper column, by height), its crane part, its runway, the space frame, the deck, the lanterns'
#     glass, the walls. A hit then says what blocks a beam, not only that something does.
#   - Ray/triangle: Moller & Trumbore, "Fast, minimum storage ray-triangle intersection", J. Graphics Tools 2(1), 1997.
#     Ray/box: the slab method (Kay & Kajiya 1986), as lights_beta_options.Box.ray.
#   - Speed: per fixture, triangles outside the beam's cone (plus each triangle's own angular radius) are culled
#     first; the test is exact on what is left.
import hashlib, json, math, os, struct

import numpy as np

GLB_DEFAULT = '/mnt/data/footage/place-moxir-hall-v8-show-back21-2026-10-07/hall.glb'
# The GLB this pass was measured on (built by hall.py from moxir-hall-2026-10-07-v8-show-back21, same geometry block,
# checked 2026-10-08). A different file is refused unless --any-glb: the numbers would not be these numbers.
GLB_SHA256 = '18a1774e09588d1143d9d671c4a121966bb37ffb9333dd3492dd762372b77206'

# classes: what a hit IS (the report's words)
SHELL = {'floor', 'roof deck', 'space frame', 'lantern glass', 'lantern frame', 'end wall', 'side wall', 'wall glass'}
ROOF = {'roof deck', 'space frame'}                       # where an upward beam is meant to end: the roof structure
GLASS = {'lantern glass', 'wall glass', 'lantern frame'}  # lantern frame = the mullions IN the glazed opening
STEEL = {'crane', 'runway', 'space frame', 'roof deck', 'truss', 'rigging', 'steel', 'lantern frame'}


def sha256(path):
    h = hashlib.sha256()
    with open(path, 'rb') as fh:
        for b in iter(lambda: fh.read(1 << 20), b''):
            h.update(b)
    return h.hexdigest()


def read_glb(path):
    """{mesh name: (N,3,3) triangles}. glTF 2.0 binary, no node transforms (hall.py writes none: checked)."""
    b = open(path, 'rb').read()
    magic, ver, length = struct.unpack('<III', b[:12])
    if magic != 0x46546C67:
        raise SystemExit('%s is not a GLB' % path)
    o, chunks = 12, []
    while o < length:
        cl, ct = struct.unpack('<II', b[o:o + 8])
        chunks.append(b[o + 8:o + 8 + cl])
        o += 8 + cl
    J, BIN = json.loads(chunks[0]), chunks[1]
    CT = {5126: np.float32, 5123: np.uint16, 5125: np.uint32, 5121: np.uint8}
    NC = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4}

    def acc(i):
        a = J['accessors'][i]
        bv = J['bufferViews'][a['bufferView']]
        off = bv.get('byteOffset', 0) + a.get('byteOffset', 0)
        n = NC[a['type']]
        arr = np.frombuffer(BIN, dtype=CT[a['componentType']], count=a['count'] * n, offset=off)
        return arr.reshape(a['count'], n) if n > 1 else arr
    out = {}
    for node in J['nodes']:
        if 'mesh' not in node:
            continue
        if any(k in node for k in ('translation', 'rotation', 'scale', 'matrix')):
            raise SystemExit('node %s has a transform; this reader assumes none' % node.get('name'))
        m = J['meshes'][node['mesh']]
        tris = []
        for pr in m['primitives']:
            P = acc(pr['attributes']['POSITION']).astype(float)
            I = acc(pr['indices']).astype(np.int64) if 'indices' in pr else np.arange(len(P))
            tris.append(P[I.reshape(-1, 3)])
        out[m.get('name') or node.get('name')] = np.concatenate(tris)
    return out


class Obstacles:
    """The permanent things: the hall's triangles (named) + the rig's boxes."""

    def __init__(self, glb_path, G, rig_boxes, truss, crane_boxes):
        self.G = G
        meshes = read_glb(glb_path)
        T, lab = [], []
        self.labels, self.lcls = [], []
        index = {}

        def L_(name, cls):
            k = (name, cls)
            if k not in index:
                index[k] = len(self.labels)
                self.labels.append(name)
                self.lcls.append(cls)
            return index[k]
        crane = [(b, b.id) for b in crane_boxes]
        for mname, tris in meshes.items():
            if mname.startswith('hall-zone'):
                continue          # floor tape: drawn, not solid
            c, lo, hi = tris.mean(1), tris.min(1), tris.max(1)
            for i in range(len(tris)):
                name, cls = self.classify(mname, c[i], lo[i], hi[i], crane)
                lab.append(L_(name, cls))
            T.append(tris)
        T = np.concatenate(T)
        self.V0 = T[:, 0]
        self.E1 = T[:, 1] - T[:, 0]
        self.E2 = T[:, 2] - T[:, 0]
        self.C = T.mean(1)
        self.R = np.linalg.norm(T - self.C[:, None, :], axis=2).max(1)
        n = np.cross(self.E1, self.E2)
        self.N = n / np.maximum(np.linalg.norm(n, axis=1, keepdims=True), 1e-12)
        self.lab = np.array(lab)
        self.cls = np.array(self.lcls)[self.lab]
        self.boxes = []
        for b in rig_boxes + [truss]:
            cls = {'riser': 'booth', 'rigging': 'rigging', 'truss': 'truss'}.get(b.cls, 'stage')
            if b.id.startswith('rig-pa-'):
                cls = 'pa'
            elif 'table' in b.id:
                cls = 'booth'
            elif 'barrier' in b.id:
                cls = 'barrier'
            elif 'steel' in b.id or 'clamp' in b.id or 'bridle' in b.id or 'chain' in b.id or 'tieoff' in b.id or 'hoist' in b.id:
                cls = 'rigging'
            self.boxes.append((b, b.id.replace('rig-', ''), cls))
        self.n_tris = len(T)

    # ---------------------------------------------------------------- naming each triangle from hall.json
    def classify(self, mname, c, lo, hi, crane):
        G = self.G
        x, y, z = c
        if mname == 'hall-floor':
            return 'floor', 'floor'
        if mname == 'hall-skylight':
            return 'lantern glass', 'lantern glass'
        if mname == 'hall-glass':
            return 'wall glass (window band)', 'wall glass'
        for m in G['massing']:
            if mname in ('hall-machine', 'hall-press', 'hall-rust', 'hall-brick', 'hall-deck') and \
                    m['x_m'][0] - 0.3 <= x <= m['x_m'][1] + 0.3 and m['y_m'][0] - 0.3 <= y <= m['y_m'][1] + 0.3 and m['z_m'][0] - 0.3 <= z <= m['z_m'][1] + 0.3:
                return m['id'], 'machine'
        if mname == 'hall-crane':
            for b, bid in crane:
                lo, hi = b.corners().min(0) - 0.3, b.corners().max(0) + 0.3
                if np.all(c >= lo) and np.all(c <= hi):
                    return bid, 'crane'
            zc = min((cr['z_m'] for cr in G['cranes']), key=lambda v: abs(v - z))
            return 'crane z %g (bridge)' % zc, 'crane'
        if mname == 'hall-girder':
            return 'runway girder x %+.2f' % (min(G['rows_x_m'], key=lambda r: abs(r - x)) + (G['column_head']['girder_offset_m'] * (1 if x > min(G['rows_x_m'], key=lambda r: abs(r - x)) else -1))), 'runway'
        if mname == 'hall-deck':
            return ('roof deck', 'roof deck') if y >= G['deck_m'] - 0.4 else ('lantern deck', 'roof deck')
        if mname == 'hall-frame':
            inl = any(l['x_m'][0] <= x <= l['x_m'][1] and l['z_m'][0] <= z <= l['z_m'][1] for l in G['lanterns'])
            if y > G['deck_m'] + 0.05 and inl:
                return 'lantern frame (in the glazed opening)', 'lantern frame'
            part = 'bottom chord' if y < G['truss_bottom_m'] + 0.35 else 'diagonals / top chord'
            return 'space frame %s' % part, 'space frame'
        if abs(z) > G['end_wall_inner_y_m'] - 0.6 and mname in ('hall-block', 'hall-concrete', 'hall-steel'):
            return 'end wall z %+.0f' % (G['end_wall_inner_y_m'] * np.sign(z)), 'end wall'
        if mname in ('hall-block', 'hall-concrete', 'hall-steel') and (x < G['walls_x_m'][0] + 0.6 or x > G['walls_x_m'][1] - 0.6):
            return 'side wall', 'side wall'
        if mname in ('hall-concrete', 'hall-steel', 'hall-block') and hi[2] - lo[2] > 2.0:
            # a member running ALONG the hall (its centroid says nothing about which column it is near)
            if mname == 'hall-block':
                return 'block wall x %.0f z %.0f..%.0f (low, between columns)' % (x, lo[2], hi[2]), 'block wall'
            if G['runway_bottom_m'] - 0.2 <= y <= G['runway_top_m'] + 1.4:
                return 'runway handrail x %+.1f' % x, 'runway'
            return 'steel along the hall x %+.1f y %.1f' % (x, y), 'steel'
        if mname in ('hall-concrete', 'hall-steel', 'hall-block'):
            rx = min(G['rows_x_m'], key=lambda r: abs(r - x))
            gz = min(G['column_grid_z_m'], key=lambda g: abs(g - z))
            if abs(x - rx) <= 1.3 and abs(z - gz) <= 0.8:
                h = G['column_head']
                part = 'shaft' if y < h['flare_start_m'] else ('head' if y <= h['head_top_m'] + 0.05 else 'upper column')
                return 'column x %g z %g (%s)' % (rx, gz, part), 'column' if part == 'shaft' else ('column head' if part == 'head' else 'upper column')
            if mname == 'hall-steel':
                if G['runway_bottom_m'] - 0.2 <= y <= G['runway_top_m'] + 1.4 and abs(abs(x - rx) - G['column_head']['girder_offset_m']) < 0.8:
                    return 'runway handrail x %+.1f' % x, 'runway'
                return 'steel (bracing, mullions)', 'steel'
            return 'concrete (%s)' % mname, 'column'
        if mname == 'hall-press':
            return 'press (detail)', 'machine'      # hall.py's crank press body outside the press envelope boxes
        if mname == 'hall-rust':
            rx = min(G['rows_x_m'], key=lambda r: abs(r - x))
            if abs(x - rx) < 0.4 and y < G['column_head']['flare_start_m']:
                b0 = math.floor(z / 6.0) * 6.0
                return 'X bracing between columns x %g z %g..%g' % (rx, b0, b0 + 6), 'steel'
            return 'rust steel (rails, guards, the far gate)', 'steel'
        return mname, 'other'

    # ---------------------------------------------------------------- casting
    def subset(self, o, axis, half_rad, tmax):
        """Triangles that could meet a ray from o within half_rad of axis and tmax (cone cull, exact test after)."""
        v = self.C - o
        dist = np.linalg.norm(v, axis=1)
        near = dist <= self.R + 1e-6
        cosang = (v @ axis) / np.maximum(dist, 1e-9)
        ang = np.arccos(np.clip(cosang, -1, 1))
        slack = np.arcsin(np.clip(self.R / np.maximum(dist, 1e-9), 0, 1))
        keep = near | ((ang <= half_rad + slack + 1e-3) & (dist - self.R <= tmax))
        return np.nonzero(keep)[0]

    def cast(self, o, d, tmin=0.35, tmax=1e9, sub=None, skip_cls=(), skip_box=(), mount=None):
        """First hit: (t, name, cls, normal) or (None, ...) if nothing within tmax.
        mount: (box id, t) — the fixture's own carrier is ignored up to t."""
        o, d = np.asarray(o, float), np.asarray(d, float)
        idx = sub if sub is not None else slice(None)
        V0, E1, E2 = self.V0[idx], self.E1[idx], self.E2[idx]
        p = np.cross(d, E2)
        det = np.einsum('ij,ij->i', E1, p)
        ok = np.abs(det) > 1e-12
        inv = np.where(ok, 1.0 / np.where(ok, det, 1.0), 0.0)
        s = o - V0
        u = np.einsum('ij,ij->i', s, p) * inv
        q = np.cross(s, E1)
        v = (q @ d) * inv
        t = np.einsum('ij,ij->i', E2, q) * inv
        hit = ok & (u >= -1e-9) & (v >= -1e-9) & (u + v <= 1 + 1e-9) & (t > tmin) & (t < tmax)
        best = (None, None, None, None)
        if hit.any():
            cand = np.nonzero(hit)[0]
            if skip_cls:
                cls = self.cls[idx][cand] if sub is not None else self.cls[cand]
                cand = cand[~np.isin(cls, list(skip_cls))]
            if len(cand):
                k = cand[np.argmin(t[cand])]
                gi = sub[k] if sub is not None else k
                n = self.N[gi]
                best = (float(t[k]), self.labels[self.lab[gi]], self.lcls[self.lab[gi]], n if n @ d < 0 else -n)
        for b, name, cls in self.boxes:
            if name in skip_box or cls in skip_cls:
                continue
            h = b.ray(o, d, tmin)
            if h is None or h >= tmax:
                continue
            if mount and b.id == mount[0] and h < mount[1]:
                continue          # the fixture's own carrier, within its clamp distance
            if best[0] is None or h < best[0]:
                best = (float(h), name, cls, None)
        return best


def cone_rays(axis, half_deg, rings):
    """The axis plus rings at fractions of the half angle. rings: [(fraction, n)]. Returns (dirs, ring index)."""
    a = np.asarray(axis, float)
    a = a / np.linalg.norm(a)
    u = np.cross(a, [0.0, 1.0, 0.0] if abs(a[1]) < 0.9 else [1.0, 0.0, 0.0])
    u /= np.linalg.norm(u)
    w = np.cross(a, u)
    out, ring = [a], [0]
    for k, (fr, n) in enumerate(rings, 1):
        th = math.radians(half_deg * fr)
        for j in range(n):
            ph = 2 * math.pi * j / n
            out.append(math.cos(th) * a + math.sin(th) * (math.cos(ph) * u + math.sin(ph) * w))
            ring.append(k)
    return np.array(out), np.array(ring)


SPEC_RINGS = [(1.0, 8)]                                    # the owner's ask: axis + one ring at half the beam angle
AREA_RINGS = [(0.25, 6), (0.5, 12), (0.75, 18), (1.0, 24)]  # rays in proportion to ring circumference: equal area
