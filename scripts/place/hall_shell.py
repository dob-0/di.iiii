#!/usr/bin/env python3
"""hall_shell.py: a hall's walls and roof as `dims.shell` slabs, taken from the model the room draws (2026-10-20).

WHY: laser_margin.py stops a beam at the first wall or roof only when the hall record carries
dims.shell = [{id, x_m, y_m, z_m}] boxes; without them the walls and roof are not checked (shell_modelled false).

METHOD (no second geometry rule): the slabs are the boxes hall.py build() itself draws for the building envelope,
recorded while build() runs on the record's own dims (the run that wrote the record also exported its GLB):
  * every Builder.shell_box call: the long walls' block bands, the end walls around their gates, the deck strips
    around the lantern openings (hall.py's own definition of the envelope, see Builder.shell_box);
  * in the lantern loop, the 'deck' kerbs, the 'skylight' glazing and the 'deck' lantern roof;
  * the long walls' 'glass' ribbon bands (a 'glass' box inside a long-wall slab; the crane cab's glass is not one).
build() is pure geometry (bpy is used only by the exporter), so it runs here with a stub bpy. The geometry block it
returns is compared with the one stored in the record when the GLB was built; if they differ the code has moved since
that GLB and the tool refuses (exit 2) rather than describe a different building.
Frame: Blender (x across, y along, z up) -> hall (x, y up, z = -y_blender), as hall.py build() states.
Each slab: id, surface, inner normal and inner plane (the face a beam from inside meets), extent, method, source
(hall.py + the commit that last changed it), date, validated false.

LIMITS: the model is a parametric estimate (the record's dimsOrigin), not a survey: validated false until the hall is
measured. Not slabs: the space frame under the deck (open lattice), columns, cranes, mullions. Glazing ends the hall
for a line (the beam leaves the room there) but transmits light: an outside-exposure check must treat it as an opening.

    python3 scripts/place/hall_shell.py --hall H            # print the slabs it would write
    python3 scripts/place/hall_shell.py --hall H --write    # write dims.shell into the record
    python3 scripts/place/hall_shell.py --hall H --check    # exit 1 if the record's dims.shell differs from the model
    python3 scripts/place/hall_shell.py --hall H --glb G    # every slab corner against the GLB's vertices (metres)
"""
import argparse, json, os, struct, subprocess, sys, types
from datetime import date

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, HERE)
sys.modules.setdefault('bpy', types.ModuleType('bpy'))   # build() never calls bpy; only the exporter does
import hall  # noqa: E402

METHOD = 'hall.py build() envelope box, recorded while build() runs on the record dims (hall_shell.py)'
ENVELOPE_BOXES = ('deck', 'skylight', 'glass')   # Builder.box materials of the envelope outside shell_box (see above)


class Recorder(hall.Builder):
    """hall.Builder that also keeps the envelope boxes, in the order build() draws them."""

    def __init__(self):
        super().__init__()
        self.envelope, self._in_shell = [], False

    def shell_box(self, lo, hi, inner, skin):
        self.envelope.append(('shell', skin, lo, hi, inner))
        self._in_shell = True
        try:
            super().shell_box(lo, hi, inner, skin)
        finally:
            self._in_shell = False

    def box(self, material, lo, hi):
        if not self._in_shell and material in ENVELOPE_BOXES:
            self.envelope.append(('box', material, lo, hi, None))
        super().box(material, lo, hi)


def to_hall(lo, hi):
    """Blender box corners -> hall-frame extents (x_m, y_m up, z_m = -y_blender)."""
    r = lambda a, b: [round(min(a, b), 4), round(max(a, b), 4)]
    return r(lo[0], hi[0]), r(lo[2], hi[2]), r(-lo[1], -hi[1])


def run_build(dims):
    saved = hall.Builder
    hall.Builder = Recorder
    try:
        b, geometry = hall.build(dims)
    finally:
        hall.Builder = saved
    return b, geometry


def source_commit():
    out = subprocess.run(['git', '-C', REPO, 'log', '-1', '--format=%h', '--', 'scripts/place/hall.py'],
                         capture_output=True, text=True)
    return out.stdout.strip() or 'uncommitted'


def slabs(record, today=None):
    """dims.shell for a hall record (a list of slab dicts), or raise SystemExit(2) if the code no longer builds it."""
    dims = {k: v for k, v in record['dims'].items() if k != 'shell'}
    b, geometry = run_build(dims)
    stored = record.get('geometry')
    if stored is not None and json.loads(json.dumps(geometry)) != stored:
        diff = sorted(k for k in set(geometry) | set(stored) if json.loads(json.dumps(geometry.get(k))) != stored.get(k))
        _refuse(diff)
    walls = [to_hall(lo, hi)[0] for kind, _, lo, hi, inner in b.envelope if kind == 'shell' and inner[0] != 0]
    lanterns = geometry['lanterns']
    src = {'file': 'scripts/place/hall.py', 'commit': source_commit(), 'record_geometry': 'identical' if stored else 'absent'}
    out, n = [], {}
    for kind, mat, lo, hi, inner in b.envelope:
        x, y, z = to_hall(lo, hi)
        if kind == 'shell':
            nrm = [inner[0], inner[2], -inner[1]]
            name = ('long wall' if inner[0] else 'deck' if inner[2] else 'end wall')
            surface = name + (' (%s)' % mat)
        elif mat == 'glass':
            if not any(w[0] - 1e-6 <= x[0] and x[1] <= w[1] + 1e-6 for w in walls):
                continue   # glass that is not set in a long wall (the crane cab)
            cx = (x[0] + x[1]) / 2
            nrm = [1, 0, 0] if cx < 0 else [-1, 0, 0]
            name, surface = 'long wall', 'long wall glazing (glass ribbon band)'
        else:
            if y[0] < geometry['deck_m'] - 1e-6:
                continue   # a massing item drawn in the same material under the roof (the lantern starts on the deck)
            c = [(x[0] + x[1]) / 2, (y[0] + y[1]) / 2, (z[0] + z[1]) / 2]
            lan = next(l for l in lanterns if l['x_m'][0] - 0.5 <= c[0] <= l['x_m'][1] + 0.5 and l['z_m'][0] - 0.5 <= c[2] <= l['z_m'][1] + 0.5)
            ext = [x[1] - x[0], y[1] - y[0], z[1] - z[0]]
            thin = int(np.argmin(ext))
            if thin == 1:
                nrm = [0, -1, 0]
            else:
                mid = (lan['x_m'][0] + lan['x_m'][1]) / 2 if thin == 0 else (lan['z_m'][0] + lan['z_m'][1]) / 2
                nrm = [0, 0, 0]; nrm[thin] = 1 if c[thin] < mid else -1
            name = 'lantern'
            surface = 'lantern roof' if thin == 1 else ('lantern glazing' if mat == 'skylight' else 'lantern kerb')
        side = {(1, 0, 0): 'west', (-1, 0, 0): 'east', (0, 0, -1): 'entry', (0, 0, 1): 'far', (0, -1, 0): 'up'}.get(tuple(nrm), 'in')
        key = '%s %s' % (name, side)
        n[key] = n.get(key, 0) + 1
        axis = [i for i in range(3) if nrm[i]][0]
        ext3 = (x, y, z)
        at = ext3[axis][1] if nrm[axis] > 0 else ext3[axis][0]
        out.append({'id': '%s-%s-%d' % (name.replace(' ', '-'), side, n[key]), 'surface': surface,
                    'plane': {'axis': 'xyz'[axis], 'at_m': at, 'inner_normal': nrm},
                    'x_m': x, 'y_m': y, 'z_m': z, 'method': METHOD, 'source': src,
                    'date': today or date.today().isoformat(), 'validated': False})
    return out


def _refuse(diff):
    print('hall_shell: build() today gives a different building than the record (keys %s); rebuild the record and its GLB '
          'with hall.py first, then run this again' % diff, file=sys.stderr)
    raise SystemExit(2)


def glb_positions(path):
    """{mesh name: (N,3) float array} from a binary glTF (node TRS applied; one level of nodes, as hall.py exports)."""
    with open(path, 'rb') as fh:
        data = fh.read()
    jlen = struct.unpack_from('<I', data, 12)[0]
    gl = json.loads(data[20:20 + jlen])
    blen = struct.unpack_from('<I', data, 20 + jlen)[0]
    binary = data[28 + jlen:28 + jlen + blen]
    out = {}
    for node in gl.get('nodes', []):
        if 'mesh' not in node:
            continue
        mesh = gl['meshes'][node['mesh']]
        pts = []
        for prim in mesh['primitives']:
            acc = gl['accessors'][prim['attributes']['POSITION']]
            view = gl['bufferViews'][acc['bufferView']]
            off = view.get('byteOffset', 0) + acc.get('byteOffset', 0)
            stride = view.get('byteStride', 12)   # gltf-transform may interleave (hall-show.mjs copies)
            arr = np.ndarray((acc['count'], 3), '<f4', binary, off, (stride, 4)).astype(float)
            pts.append(arr)
        P = np.concatenate(pts)
        if 'matrix' in node:
            M = np.array(node['matrix'], float).reshape(4, 4).T
            P = P @ M[:3, :3].T + M[:3, 3]
        else:
            q = node.get('rotation', [0, 0, 0, 1])
            x, y, z, w = q
            R = np.array([[1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
                          [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
                          [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)]])
            P = (P * np.array(node.get('scale', [1, 1, 1]))) @ R.T + np.array(node.get('translation', [0, 0, 0]))
        out[mesh.get('name') or node.get('name')] = P
    return out


def glb_check(shell, path):
    """Largest distance from any slab corner to the nearest vertex of the GLB mesh of its material, in metres."""
    meshes = glb_positions(path)
    mat = lambda s: 'skylight' if 'glazing' in s['surface'] and 'lantern' in s['surface'] else (
        'glass' if 'glass' in s['surface'] else 'block' if '(block)' in s['surface'] else 'deck')
    worst, per = 0.0, {}
    for s in shell:
        # the slab's own material mesh, or 'hall-shell' when the GLB was built with --shell-alpha (the ghost box)
        cands = [meshes[k] for k in ('hall-' + mat(s), 'hall-shell') if k in meshes]
        if not cands:
            return {'error': 'no mesh hall-%s in %s' % (mat(s), path)}
        corners = np.array([[cx, cy, cz] for cx in s['x_m'] for cy in s['y_m'] for cz in s['z_m']], float)
        d = min(max(float(np.min(np.linalg.norm(P - c, axis=1))) for c in corners) for P in cands)
        per[s['surface']] = max(per.get(s['surface'], 0.0), d)
        worst = max(worst, d)
    return {'glb': path, 'corners_checked': 8 * len(shell), 'max_corner_to_vertex_m': round(worst, 4),
            'by_surface_m': {k: round(v, 4) for k, v in sorted(per.items())}}


def strip(shell):
    return [{k: v for k, v in s.items() if k not in ('date', 'source')} for s in shell]


def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    ap.add_argument('--hall', required=True)
    ap.add_argument('--write', action='store_true')
    ap.add_argument('--check', action='store_true')
    ap.add_argument('--glb', action='append', default=[])
    a = ap.parse_args()
    record = json.load(open(a.hall))
    shell = slabs(record)
    kinds = {}
    for s in shell:
        kinds[s['surface']] = kinds.get(s['surface'], 0) + 1
    planes = sorted({(s['plane']['axis'], s['plane']['at_m'], s['surface'].split(' (')[0]) for s in shell})
    print(json.dumps({'hall': a.hall, 'slabs': len(shell), 'by_surface': kinds}))
    for p in planes:
        print('  plane %s = %8.3f  %s' % p)
    for g in a.glb:
        print(json.dumps(glb_check(shell, g)))
    if a.check:
        have = record['dims'].get('shell')
        if have is None or strip(have) != strip(shell):
            print('hall_shell: the record\'s dims.shell is missing or differs from the model (run --write)', file=sys.stderr)
            return 1
        print('dims.shell matches the model (%d slabs)' % len(shell))
    if a.write:
        record['dims']['shell'] = shell
        tmp = a.hall + '.tmp'
        with open(tmp, 'w') as fh:
            json.dump(record, fh, indent=2)   # hall.py's own format, so the diff is the shell only
        os.replace(tmp, a.hall)
        print('wrote dims.shell (%d slabs) into %s' % (len(shell), a.hall))
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
