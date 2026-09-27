"""Build a clean, parametric model of a Soviet multi-span crane hall with a flat
space-frame roof.

A photogrammetry scan is the right tool when the footage covers the room. When
it does not (MOXIR, 2026-09: 67 frames gave a smeared roof fragment, and the
venue cannot be revisited before the show), the professional fallback is the
one every lighting designer and set builder uses: a CAD-style box model of the
room from its structural grid, good enough to hang and aim a rig in, with every
number that was not measured labelled as such.

The building this makes (version 2, 2026-09-28 — the architecture corrected
against the photographs and a 2020 satellite image; version 1 built pitched
Warren trusses and a ridge lantern, which the owner saw as wrong "arcs"):

  * several parallel spans of the same width under ONE flat roof — the nave
    (the span the rig hangs in) centred on x = 0, neighbour spans either side,
    open to it at full height (no nave wall, no clerestory, no aisles)
  * precast columns on the grid: a solid lower shaft, a head that flares
    SYMMETRICALLY across the hall with 45-degree chamfers (a Y / goblet
    console) carrying a steel crane girder on each side, and a centred upper
    column up to the roof; paired columns at the expansion joint
  * grey steel plate crane girders with web stiffeners, rails, a handrail
    along the nave-side girders; yellow bridge cranes
  * a flat double-layer steel space frame (square-on-square offset grid:
    bottom chords, top chords, four diagonals per pyramid), a corrugated deck
    on the top chords, full detail over the nave and its neighbours and
    bottom chords only further out
  * raised flat-top box lanterns (glazed sides and ends) over the spans the
    dims file names, split in segments
  * outer long walls only at the building edge, with ribbon window bands; end
    walls with the gates; low block walls in some bays; X bracing
  * massing boxes for machines named in the features file (MOXIR: the forging
    press that stands behind the stage) and floor-tape outlines of the zones
    the owner marked

Everything is in real metres, low-poly, and merged into ONE mesh per material,
so the browser draws a dozen meshes, however many members the roof has. The
space frame's members are open triangular prisms (6 triangles each), drawn
double-sided.

Usage:
    blender -b -P scripts/place/hall.py -- --out <dir> [--dims dims.json ...]
        [--span 24] [--pitch 6] [--bays 18] [--crane-rail 7.6]
        [--truss-bottom 11] [--ridge 17] [--lantern 12]
        [--column-w 0.5] [--column-d 0.8] [--preview] [--preview-camera x,y,z,yaw,pitch,vfov]

Writes into <dir>:
    hall.glb     the room, Y-up, floor at y = 0, the nave centred on x = 0,
                 the entry end at +Z and the far end at -Z
    hall.json    every dimension used and where it came from, and the geometry
                 the rig is hung against (grid, heights, lanterns, walls, zones)
    place.json   the record import.mjs reads (same shape fit.mjs writes)
    preview.png  (with --preview) a quick Workbench render

`--dims` takes JSON (several files merge in order; later files win). The grid
and heights: "span_m", "pitch_m", "bays", "length_m", "crane_rail_h_m",
"truss_bottom_h_m" (the space frame's bottom chord), "truss_top_h_m" (its top
chord = the deck), "ridge_h_m" (a lantern's top), "lantern_w_m", "column_w_m",
"column_d_m", "upper_column_d_m". The roof and the building (new in v2):
"roof_type" ("space_frame_flat"), "space_frame_module_m",
"space_frame_depth_m", "lantern_h_m", "lantern_segments_m" (pairs, metres
along the hall from its centre, + toward the far end), "lantern_spans" (0 =
the nave, +1 the next span to the right looking from the entry, -1 to the
left), "neighbour_spans" {"left": n, "right": n}, "column_head"
("two_sided_console"), "column_head_width_m", "crane_girders_each_row",
"crane_girder_depth_m", "expansion_joint_m" (along the hall from its centre),
"paired_columns_at_joint". Features: "door_w_m"/"door_h_m", "entry_platform",
"far_gate_w_m"/"far_gate_h_m", "cranes_from_door_m", "neighbour_cranes_from_door_m",
"low_walls", "bracing_bays_from_door_m", "massing", "zones", "track_x_m"
(massing and zones in the HALL frame: x across, z along with + toward the
entry). Any key left out keeps the placeholder. A value is only ever reported
as MEASURED when the file says its source is a tape; anything read off a
picture is an ESTIMATE, and a placeholder is a GUESS.

Written for Blender 5.x (bpy.ops.export_scene.gltf).
"""
import json
import math
import os
import sys
from datetime import datetime, timezone

import bpy

# ── the numbers ─────────────────────────────────────────────────────────────────
# PLACEHOLDERS: the standard Soviet grid, nothing measured. The real values
# arrive as --dims.
PLACEHOLDER = {
    'span_m': 24.0,           # column axis to column axis, across a span
    'pitch_m': 6.0,           # column axis to column axis, along a row
    'bays': 18,               # pitches along the hall
    'length_m': None,         # None = bays * pitch
    'crane_rail_h_m': 7.6,    # floor to the top of the crane rail
    'truss_bottom_h_m': 11.0, # floor to the space frame's bottom chord
    'truss_top_h_m': 13.5,    # floor to its top chord (the deck sits on it)
    'ridge_h_m': 17.0,        # floor to a lantern's top
    'lantern_w_m': 12.0,      # lantern, outside to outside
    'lantern_h_m': 3.5,       # lantern, deck to top
    'column_w_m': 0.5,        # lower shaft, along the row
    'column_d_m': 0.8,        # lower shaft, across the hall
    'upper_column_d_m': 0.45, # upper column, square
    'column_head': 'two_sided_console',
    'column_head_width_m': 1.9,
    'crane_girders_each_row': 2,
    'crane_girder_depth_m': 0.9,
    'roof_type': 'space_frame_flat',
    'space_frame_module_m': 3.0,
    'space_frame_depth_m': 2.5,
    'lantern_segments_m': [[-45.75, -7.25], [7.25, 45.75]],
    'lantern_spans': [0],
    'neighbour_spans': {'left': 0, 'right': 0},
    'expansion_joint_m': None,
    'paired_columns_at_joint': False,
    'door_w_m': 6.0,          # the big gate in the entry end wall
    'door_h_m': 6.0,
    'entry_platform': True,   # a raised platform with stairs beside the entry gate
    'far_gate_w_m': 0.0,      # a gate in the far end wall (0 = none)
    'far_gate_h_m': 0.0,
    'aisle_w_m': 0.0,         # v1 key; v2 models full neighbour spans instead
    'track_x_m': [-4.0, 4.0], # centres of the rail tracks in the nave floor
    'track_gauge_m': 1.52,    # Russian broad gauge, 1520 mm — a standard
    'cranes_from_door_m': [4.0],
    'neighbour_cranes_from_door_m': {},
    'low_walls': [],
    'bracing_bays_from_door_m': [],
    'massing': [],
    'zones': {},
    'cameras': {},     # named viewpoints (hall frame) a photo was taken from
}

KEYS_FROM_DIMS = [
    'span_m', 'pitch_m', 'bays', 'length_m', 'crane_rail_h_m', 'truss_bottom_h_m',
    'ridge_h_m', 'lantern_w_m', 'column_w_m', 'column_d_m', 'upper_column_d_m', 'truss_top_h_m',
    'lantern_h_m', 'column_head', 'column_head_width_m', 'crane_girders_each_row', 'crane_girder_depth_m',
    'roof_type', 'space_frame_module_m', 'space_frame_depth_m', 'lantern_segments_m', 'lantern_spans',
    'neighbour_spans', 'expansion_joint_m', 'paired_columns_at_joint',
    'door_w_m', 'door_h_m', 'entry_platform', 'far_gate_w_m', 'far_gate_h_m', 'aisle_w_m',
    'track_x_m', 'cranes_from_door_m', 'neighbour_cranes_from_door_m', 'low_walls',
    'bracing_bays_from_door_m', 'massing', 'zones', 'cameras',
]
# The grid and heights: a placeholder among these makes the whole room a GUESS.
CORE_KEYS = ['span_m', 'pitch_m', 'bays', 'crane_rail_h_m', 'truss_bottom_h_m', 'truss_top_h_m', 'ridge_h_m']

CLI_TO_KEY = {
    '--span': 'span_m', '--pitch': 'pitch_m', '--bays': 'bays', '--length': 'length_m',
    '--crane-rail': 'crane_rail_h_m', '--truss-bottom': 'truss_bottom_h_m',
    '--ridge': 'ridge_h_m', '--lantern': 'lantern_w_m', '--column-w': 'column_w_m',
    '--column-d': 'column_d_m', '--door-w': 'door_w_m', '--door-h': 'door_h_m',
}

# Colours (linear sRGB as Blender takes them), roughness, metallic, emissive.
# Read off the daylight photographs: pale precast concrete, light grey steel,
# a dark brown-grey corrugated deck, grey-blue crane girders.
MATERIALS = {
    'concrete':  ((0.40, 0.37, 0.32), 0.92, 0.0, None),
    'floor':     ((0.15, 0.14, 0.13), 0.95, 0.0, None),
    'block':     ((0.36, 0.34, 0.30), 0.95, 0.0, None),
    'glass':     ((0.05, 0.075, 0.09), 0.25, 0.0, None),
    'frame':     ((0.34, 0.34, 0.33), 0.6, 0.0, None),   # the space frame
    'steel':     ((0.30, 0.30, 0.29), 0.6, 0.0, None),   # mullions, handrails, lantern frame
    'girder':    ((0.22, 0.25, 0.27), 0.6, 0.0, None),   # crane girders, grey plate
    'rust':      ((0.20, 0.085, 0.035), 0.85, 0.0, None),
    'crane':     ((0.72, 0.46, 0.02), 0.6, 0.0, None),
    'deck':      ((0.09, 0.08, 0.07), 0.9, 0.0, None),
    'machine':   ((0.16, 0.18, 0.17), 0.7, 0.0, None),   # old dark-grey machine steel
    'zone-dance':     ((0.02, 0.08, 1.0), 0.9, 0.0, (0.02, 0.08, 1.0)),
    'zone-stage':     ((0.02, 0.8, 0.08), 0.9, 0.0, (0.02, 0.8, 0.08)),
    'zone-backstage': ((1.0, 0.06, 0.03), 0.9, 0.0, (1.0, 0.06, 0.03)),
}
# Open surfaces (the frame's prisms, glass planes): drawn from both sides and
# never run through the "make normals consistent" pass meant for closed boxes.
DOUBLE_SIDED = {'frame', 'glass'}


def parse_cli():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    opts = {'out': None, 'dims': [], 'preview': False, 'preview_camera': None, 'overrides': {}}
    i = 0
    while i < len(argv):
        flag = argv[i]
        if flag.startswith('--') and '=' in flag:
            # --flag=value, so a value that starts with '-' is not taken for a flag
            flag, value = flag.split('=', 1)
            argv[i + 1:i + 1] = [value]
        if flag == '--out':
            opts['out'] = argv[i + 1]; i += 2
        elif flag == '--dims':
            opts['dims'].append(argv[i + 1]); i += 2
        elif flag == '--preview':
            opts['preview'] = True; i += 1
        elif flag == '--preview-camera':
            opts['preview'] = True
            opts['preview_camera'] = [float(v) for v in argv[i + 1].split(',')]; i += 2
        elif flag in CLI_TO_KEY:
            opts['overrides'][CLI_TO_KEY[flag]] = float(argv[i + 1]); i += 2
        else:
            raise SystemExit(f'hall.py: unknown argument {flag}')
    if not opts['out']:
        raise SystemExit('usage: blender -b -P hall.py -- --out <dir> [--dims dims.json] [--span 24 ...]')
    return opts


def resolve_dims(opts):
    """Merge placeholder <- dims files <- CLI, and remember where each came from."""
    dims = json.loads(json.dumps(PLACEHOLDER))
    origin = {key: 'placeholder' for key in dims}
    dims_source = None
    dims_notes = []
    for dims_path in opts['dims']:
        with open(dims_path) as handle:
            given = json.load(handle)
        this_source = str(given.get('source') or ('photographs: ' + str((given.get('sources') or {}).get('model', 'see file'))
                                                   if given.get('sources') else 'unstated'))
        dims_source = this_source if dims_source is None else f'{dims_source}; {this_source}'
        dims_notes.append({'file': os.path.basename(dims_path), 'notes': given.get('notes')})
        confidence = given.get('confidence') or {}
        base_tag = 'measured' if this_source.lower() in ('tape', 'measured', 'laser') else 'estimate'
        for key in KEYS_FROM_DIMS:
            if key not in given or given[key] is None:
                continue
            value = given[key]
            if isinstance(value, dict) and 'value' in value:
                value = value['value']
            dims[key] = value
            conf = confidence.get(key)
            origin[key] = base_tag if base_tag == 'measured' else \
                f"{base_tag} ({os.path.basename(dims_path)}{'; confidence ' + str(conf) if conf else ''})"
            if base_tag != 'measured' and isinstance(given.get('ranges'), dict) and key in given['ranges']:
                origin[key] += f" range {given['ranges'][key]}"
    for key, value in opts['overrides'].items():
        dims[key] = value
        origin[key] = 'command line (unmeasured)'
    if dims['roof_type'] != 'space_frame_flat':
        raise SystemExit(f"hall.py: roof_type {dims['roof_type']!r} — this version builds 'space_frame_flat' only "
                         '(the pitched-truss builder of v1 is in git history, commit e3b843fa)')
    dims['bays'] = int(round(float(dims['bays'])))
    if dims.get('length_m'):
        stated = float(dims['length_m'])
        if abs(stated - dims['bays'] * dims['pitch_m']) > 0.5 * dims['pitch_m']:
            dims['bays'] = max(1, int(round(stated / dims['pitch_m'])))
            origin['bays'] = f"derived from length_m ({origin['length_m']})"
    dims['length_m'] = dims['bays'] * float(dims['pitch_m'])
    if origin['length_m'] == 'placeholder':
        origin['length_m'] = f"bays x pitch ({origin['bays']}, {origin['pitch_m']})"
    for key in ('span_m', 'pitch_m', 'crane_rail_h_m', 'truss_bottom_h_m', 'truss_top_h_m', 'ridge_h_m',
                'lantern_w_m', 'lantern_h_m', 'column_w_m', 'column_d_m', 'upper_column_d_m', 'column_head_width_m',
                'crane_girder_depth_m', 'space_frame_module_m', 'door_w_m', 'door_h_m', 'far_gate_w_m', 'far_gate_h_m'):
        dims[key] = float(dims[key])
    L = dims['length_m']
    dims['cranes_from_door_m'] = [min(L - 3, max(3.0, float(v))) for v in dims['cranes_from_door_m']]
    if not dims['crane_rail_h_m'] + 1.5 <= dims['truss_bottom_h_m'] < dims['truss_top_h_m']:
        raise SystemExit(
            'hall.py: heights do not stack — need crane rail + 1.5 m <= bottom chord < top chord '
            f"(got {dims['crane_rail_h_m']}, {dims['truss_bottom_h_m']}, {dims['truss_top_h_m']})")
    if dims['lantern_spans'] and dims['truss_top_h_m'] + dims['lantern_h_m'] > dims['ridge_h_m'] + 0.6:
        origin['lantern_h_m'] += f" (lantern top {dims['truss_top_h_m'] + dims['lantern_h_m']:.2f} m vs ridge {dims['ridge_h_m']:.2f} m)"
    # The frame's depth is the two chord planes' difference; a stated depth is a check.
    depth = dims['truss_top_h_m'] - dims['truss_bottom_h_m']
    stated_depth = dims.get('space_frame_depth_m')
    if stated_depth and abs(float(stated_depth) - depth) > 0.3:
        raise SystemExit(f'hall.py: space_frame_depth_m {stated_depth} disagrees with top - bottom chord {depth:.2f}')
    dims['space_frame_depth_m'] = depth
    return dims, origin, dims_source, dims_notes


# ── a mesh builder that keeps one mesh per material ─────────────────────────────
class Builder:
    def __init__(self):
        self.parts = {name: ([], []) for name in MATERIALS}

    def quad_box(self, material, corners):
        """Eight corners, ordered bottom (0-3) then top (4-7), same winding."""
        verts, faces = self.parts[material]
        base = len(verts)
        verts.extend(corners)
        for face in ((0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4),
                     (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)):
            faces.append(tuple(base + index for index in face))

    def box(self, material, lo, hi):
        """Axis-aligned box from its two corners (Blender frame: x across, y along, z up)."""
        (x0, y0, z0), (x1, y1, z1) = lo, hi
        x0, x1 = min(x0, x1), max(x0, x1)
        y0, y1 = min(y0, y1), max(y0, y1)
        z0, z1 = min(z0, z1), max(z0, z1)
        if x1 - x0 < 1e-6 or y1 - y0 < 1e-6 or z1 - z0 < 1e-6:
            return
        self.quad_box(material, [
            (x0, y0, z0), (x1, y0, z0), (x1, y1, z0), (x0, y1, z0),
            (x0, y0, z1), (x1, y0, z1), (x1, y1, z1), (x0, y1, z1),
        ])

    def member(self, material, p0, p1, width, depth):
        """A straight bar from p0 to p1 with a width x depth section (a closed box)."""
        d = [p1[i] - p0[i] for i in range(3)]
        length = math.sqrt(sum(c * c for c in d)) or 1.0
        d = [c / length for c in d]
        helper = (0.0, 0.0, 1.0) if abs(d[2]) < 0.9 else (1.0, 0.0, 0.0)
        a = cross(d, helper)
        a = scale(a, 1.0 / (norm(a) or 1.0))
        b = cross(d, a)
        hw, hd = width / 2, depth / 2
        ring = [add(scale(a, sa * hw), scale(b, sb * hd)) for sa, sb in ((-1, -1), (1, -1), (1, 1), (-1, 1))]
        self.quad_box(material, [add(p0, r) for r in ring] + [add(p1, r) for r in ring])

    def bar(self, material, p0, p1, radius):
        """An open triangular prism from p0 to p1: 3 quads, 6 triangles, outward winding.

        The space frame has thousands of members; a triangle section reads as a
        bar from any side at a third of a box's cost, and nobody sees the ends.
        """
        d = [p1[i] - p0[i] for i in range(3)]
        length = norm(d) or 1.0
        d = [c / length for c in d]
        helper = (0.0, 0.0, 1.0) if abs(d[2]) < 0.9 else (1.0, 0.0, 0.0)
        u = cross(d, helper)
        u = scale(u, 1.0 / (norm(u) or 1.0))
        v = cross(d, u)
        ring = []
        for k in range(3):
            t = 2 * math.pi * k / 3 + math.pi / 2
            ring.append(add(scale(u, radius * math.cos(t)), scale(v, radius * math.sin(t))))
        verts, faces = self.parts[material]
        base = len(verts)
        verts.extend(add(p0, r) for r in ring)
        verts.extend(add(p1, r) for r in ring)
        for k in range(3):
            j = (k + 1) % 3
            faces.append((base + k, base + j, base + 3 + j, base + 3 + k))

    def prism_xz(self, material, polygon, y0, y1):
        """A convex polygon in the x-z plane, extruded along y from y0 to y1."""
        verts, faces = self.parts[material]
        base = len(verts)
        count = len(polygon)
        verts.extend((x, y0, z) for x, z in polygon)
        verts.extend((x, y1, z) for x, z in polygon)
        faces.append(tuple(base + i for i in range(count)))
        faces.append(tuple(base + count + i for i in reversed(range(count))))
        for i in range(count):
            j = (i + 1) % count
            faces.append((base + i, base + j, base + count + j, base + count + i))

    def to_objects(self):
        objects = []
        for name, (verts, faces) in self.parts.items():
            if not faces:
                continue
            mesh = bpy.data.meshes.new(f'hall-{name}')
            mesh.from_pydata(verts, [], faces)
            mesh.validate()
            obj = bpy.data.objects.new(f'hall-{name}', mesh)
            bpy.context.collection.objects.link(obj)
            if name not in DOUBLE_SIDED:
                # Closed convex solids: a consistent recalculation is safe.
                bpy.context.view_layer.objects.active = obj
                obj.select_set(True)
                bpy.ops.object.mode_set(mode='EDIT')
                bpy.ops.mesh.select_all(action='SELECT')
                bpy.ops.mesh.normals_make_consistent(inside=False)
                bpy.ops.object.mode_set(mode='OBJECT')
                obj.select_set(False)
            obj.data.materials.append(material(name))
            objects.append(obj)
        return objects


def cross(a, b):
    return (a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0])


def norm(a):
    return math.sqrt(sum(c * c for c in a))


def scale(a, s):
    return tuple(c * s for c in a)


def add(a, b):
    return tuple(a[i] + b[i] for i in range(3))


def material(name):
    colour, roughness, metallic, emissive = MATERIALS[name]
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value = (*colour, 1.0)
    bsdf.inputs['Roughness'].default_value = roughness
    bsdf.inputs['Metallic'].default_value = metallic
    if emissive:
        bsdf.inputs['Emission Color'].default_value = (*emissive, 1.0)
        bsdf.inputs['Emission Strength'].default_value = 0.6
    mat.use_backface_culling = name not in DOUBLE_SIDED
    return mat


# ── the hall ────────────────────────────────────────────────────────────────────
def build(dims):
    """Blender frame: x across the spans, y along the hall, z up.

    The entry end is at y = -L/2 and the far end at y = +L/2; glTF export turns
    Blender's +Y into -Z, so in di.iiii the entry is at +Z and the far end at
    -Z. HALL-frame inputs (massing, zones: x, z) come in as Blender (x, -z).
    """
    b = Builder()
    S = dims['span_m']
    P = dims['pitch_m']
    L = dims['length_m']
    N = dims['bays']
    rail_h = dims['crane_rail_h_m']
    bottom = dims['truss_bottom_h_m']
    top = dims['truss_top_h_m']
    module = dims['space_frame_module_m']
    cw = dims['column_w_m']
    cd = dims['column_d_m']
    ud = min(cd, dims['upper_column_d_m'])
    hw = max(cd / 2 + 0.2, dims['column_head_width_m'] / 2)
    girder_depth = dims['crane_girder_depth_m']
    rail_size = 0.14
    head_top = rail_h - rail_size - girder_depth       # the girders sit on the head
    flare = hw - cd / 2                                # 45-degree chamfer: rise = reach
    flare_start = head_top - 0.3 - flare
    girder_off = hw - 0.3                              # girder centre from the column axis
    left = int(dims['neighbour_spans'].get('left', 0))
    right = int(dims['neighbour_spans'].get('right', 0))

    rows = [S / 2 + S * i for i in range(-left - 1, right + 1)]    # column axes, left to right
    x_left, x_right = rows[0], rows[-1]
    wall_t = 0.3
    wall_in = (x_left - cd / 2, x_right + cd / 2)                   # the outer walls' inside faces
    wall_out = (wall_in[0] - wall_t, wall_in[1] + wall_t)
    end_in = L / 2 + 0.5
    end_out = end_in + wall_t
    deck_t = 0.15
    parapet = top + deck_t + 0.55

    grid_y = [-L / 2 + i * P for i in range(N + 1)]
    joint = dims['expansion_joint_m']
    joint_y = None
    if joint is not None:
        # The joint rides the nearest grid line (Soviet practice: the paired
        # columns stand 500 mm either side of it).
        joint_y = min(grid_y, key=lambda y: abs(y - float(joint)))
    column_y = []
    for y in grid_y:
        if joint_y is not None and dims['paired_columns_at_joint'] and abs(y - joint_y) < 1e-6:
            column_y += [y - 0.5, y + 0.5]
        else:
            column_y.append(y)

    def span_of(x):
        return int(math.floor((x + S / 2) / S)) if x_left <= x <= x_right else None

    detail_spans = {-1, 0, 1}

    # Floor: the slab under every span, rail tracks in the nave.
    b.box('floor', (wall_out[0], -end_out, -0.3), (wall_out[1], end_out, 0.0))
    for centre in dims['track_x_m']:
        for side in (-1, 1):
            x = centre + side * dims['track_gauge_m'] / 2
            b.box('rust', (x - 0.035, -end_out, 0.0), (x + 0.035, end_out, 0.025))

    # Columns. Inner rows: the Y head, a girder each side, the centred upper
    # column. Outer rows: in the wall, a one-sided console toward the span.
    rails = []                                   # (x of rail, row axis) for the cranes
    for ax in rows:
        outer = ax in (x_left, x_right)
        inward = 1 if ax == x_left else -1
        for y in column_y:
            y0, y1 = y - cw / 2, y + cw / 2
            b.box('concrete', (ax - cd / 2, y0, 0.0), (ax + cd / 2, y1, flare_start))
            if outer:
                x_face = ax + inward * cd / 2
                tip = ax + inward * hw
                poly = [(x_face, flare_start), (tip, flare_start + flare), (tip, head_top), (x_face, head_top)]
                if inward < 0:
                    poly = list(reversed(poly))
                b.prism_xz('concrete', poly, y0, y1)
                b.box('concrete', (ax - cd / 2, y0, flare_start), (ax + cd / 2, y1, bottom))
            else:
                b.prism_xz('concrete', [(ax - cd / 2, flare_start), (ax + cd / 2, flare_start),
                                        (ax + hw, flare_start + flare), (ax + hw, head_top),
                                        (ax - hw, head_top), (ax - hw, flare_start + flare)], y0, y1)
                b.box('concrete', (ax - ud / 2, y - ud / 2, head_top), (ax + ud / 2, y + ud / 2, bottom))
            # A steel cap plate where the frame bears on the column.
            b.box('frame', (ax - 0.35, y - 0.35, bottom - 0.12), (ax + 0.35, y + 0.35, bottom))
        sides = [inward] if outer else [-1, 1]
        for side in sides:
            gx = ax + side * girder_off
            nave_face = (not outer) and abs(ax) < S and ((ax < 0 and side > 0) or (ax > 0 and side < 0))
            y_lo, y_hi = -L / 2 - cw / 2, L / 2 + cw / 2
            # A plate girder: top flange, web, bottom flange.
            b.box('girder', (gx - 0.22, y_lo, head_top), (gx + 0.22, y_hi, head_top + 0.04))
            b.box('girder', (gx - 0.02, y_lo, head_top + 0.04), (gx + 0.02, y_hi, head_top + girder_depth - 0.04))
            b.box('girder', (gx - 0.25, y_lo, head_top + girder_depth - 0.04), (gx + 0.25, y_hi, head_top + girder_depth))
            b.box('rust', (gx - 0.04, y_lo, head_top + girder_depth), (gx + 0.04, y_hi, rail_h))
            rails.append((gx, ax))
            if nave_face:
                # Web stiffeners every 1.5 m, and the walkway handrail (photo 004).
                face = gx + (0.02 if ax < 0 else -0.02)
                n_st = int(L / 1.5)
                for k in range(n_st + 1):
                    sy = -L / 2 + k * 1.5
                    x0, x1 = sorted((face, face + (0.1 if ax < 0 else -0.1)))
                    b.box('girder', (x0, sy - 0.02, head_top + 0.04), (x1, sy + 0.02, head_top + girder_depth - 0.04))
                hx = gx + (0.3 if ax < 0 else -0.3)
                for h in (0.5, 1.0):
                    b.box('steel', (hx - 0.025, y_lo, head_top + girder_depth + h), (hx + 0.025, y_hi, head_top + girder_depth + h + 0.05))
                for k in range(int(L / 3) + 1):
                    sy = -L / 2 + k * 3
                    b.box('steel', (hx - 0.025, sy - 0.025, head_top + girder_depth), (hx + 0.025, sy + 0.025, head_top + girder_depth + 1.05))
        # Light steel struts along the row at the column tops.
        b.box('frame', (ax - 0.08, -L / 2, bottom - 0.5), (ax + 0.08, L / 2, bottom - 0.35))

    # X bracing below the girders in the bracing bays (every inner row).
    for from_door0, from_door1 in dims['bracing_bays_from_door_m']:
        y0, y1 = -L / 2 + from_door0, -L / 2 + from_door1
        for ax in rows[1:-1]:
            b.member('rust', (ax, y0 + cw / 2, 0.4), (ax, y1 - cw / 2, flare_start - 0.2), 0.1, 0.1)
            b.member('rust', (ax, y1 - cw / 2, 0.4), (ax, y0 + cw / 2, flare_start - 0.2), 0.1, 0.1)

    # Low block walls between columns.
    for wall in dims['low_walls']:
        row = wall.get('row', 'left')
        ax = -S / 2 if row == 'left' else S / 2 if row == 'right' else float(row)
        y0, y1 = (-L / 2 + float(v) for v in wall['from_door_m'])
        b.box('block', (ax - 0.15, y0, 0.0), (ax + 0.15, y1, float(wall.get('h_m', 3.0))))

    # Cranes: in the nave from cranes_from_door_m, in neighbour spans from
    # neighbour_cranes_from_door_m. Two box girders rail to rail, end trucks,
    # a trolley and a cab.
    girder_bottom = rail_h + 0.55
    crane_depth = 1.5
    cranes = []

    def crane(span_index, from_door, record):
        cx = S * span_index
        xa, xb = cx - S / 2 + girder_off, cx + S / 2 - girder_off
        cy = -L / 2 + from_door
        for offset in (-1.1, 1.1):
            b.box('crane', (xa, cy + offset - 0.35, girder_bottom), (xb, cy + offset + 0.35, girder_bottom + crane_depth))
        for x in (xa, xb):
            b.box('crane', (x - 0.4, cy - 2.6, rail_h), (x + 0.4, cy + 2.6, girder_bottom + 0.4))
        b.box('crane', (cx + 2.0, cy - 1.6, girder_bottom + crane_depth), (cx + 4.6, cy + 1.6, girder_bottom + crane_depth + 1.0))
        cab_x = xa + 1.0
        b.box('crane', (cab_x, cy - 1.0, girder_bottom - 2.2), (cab_x + 2.0, cy + 1.0, girder_bottom))
        b.box('glass', (cab_x + 1.95, cy - 0.8, girder_bottom - 1.9), (cab_x + 2.02, cy + 0.8, girder_bottom - 0.9))
        if record:
            cranes.append({'z_m': round(-cy, 3), 'from_entry_m': round(from_door, 3),
                           'girder_bottom_m': round(girder_bottom, 3), 'girder_top_m': round(girder_bottom + crane_depth, 3)})

    for from_door in dims['cranes_from_door_m']:
        crane(0, from_door, True)
    for side, from_door in (dims['neighbour_cranes_from_door_m'] or {}).items():
        k = -1 if side == 'left' else 1
        if (k < 0 and left) or (k > 0 and right):
            crane(k, float(from_door), False)

    # The space frame. Bottom nodes on the module grid from the left row,
    # top nodes over the centre of each module; four diagonals per top node.
    nx = int(round((x_right - x_left) / module))
    ny = int(round(L / module))
    mx = (x_right - x_left) / nx
    my = L / ny
    rb, rt, rd = 0.07, 0.06, 0.045

    def full(x):
        s = span_of(min(x_right - 1e-6, x))
        return s in detail_spans

    members = 0
    for j in range(ny + 1):
        y = -L / 2 + j * my
        for i in range(nx):
            x0, x1 = x_left + i * mx, x_left + (i + 1) * mx
            b.bar('frame', (x0, y, bottom), (x1, y, bottom), rb); members += 1
    for i in range(nx + 1):
        x = x_left + i * mx
        for j in range(ny):
            b.bar('frame', (x, -L / 2 + j * my, bottom), (x, -L / 2 + (j + 1) * my, bottom), rb); members += 1
    for i in range(nx):
        xc = x_left + (i + 0.5) * mx
        if not full(xc):
            continue
        for j in range(ny):
            yc = -L / 2 + (j + 0.5) * my
            for dx, dy in ((-0.5, -0.5), (0.5, -0.5), (0.5, 0.5), (-0.5, 0.5)):
                b.bar('frame', (xc, yc, top), (xc + dx * mx, yc + dy * my, bottom), rd); members += 1
            if i + 1 < nx and full(xc + mx):
                b.bar('frame', (xc, yc, top), (xc + mx, yc, top), rt); members += 1
            if j + 1 < ny:
                b.bar('frame', (xc, yc, top), (xc, yc + my, top), rt); members += 1

    # Lanterns (hall frame x across, Blender y along).
    lh = dims['lantern_h_m']
    lw = min(dims['lantern_w_m'], S * 0.7)
    lanterns = []
    for k in dims['lantern_spans']:
        k = int(k)
        if not (-left <= k <= right):
            continue
        cx = S * k
        for seg in dims['lantern_segments_m']:
            y0, y1 = max(-L / 2, float(seg[0])), min(L / 2, float(seg[1]))
            lanterns.append((cx - lw / 2, cx + lw / 2, y0, y1))
    deck_z = top + 0.05
    lantern_top = deck_z + deck_t + lh
    for x0, x1, y0, y1 in lanterns:
        z0 = deck_z + deck_t
        for x in (x0, x1):
            b.box('deck', (x - 0.1, y0, z0), (x + 0.1, y1, z0 + 0.5))
            b.box('glass', (x - 0.02, y0, z0 + 0.5), (x + 0.02, y1, lantern_top - 0.3))
            n = max(1, int(round((y1 - y0) / module)))
            for m in range(n + 1):
                my_ = y0 + m * (y1 - y0) / n
                b.box('steel', (x - 0.06, my_ - 0.05, z0 + 0.5), (x + 0.06, my_ + 0.05, lantern_top - 0.3))
        for y in (y0, y1):
            b.box('deck', (x0, y - 0.1, z0), (x1, y + 0.1, z0 + 0.5))
            b.box('glass', (x0, y - 0.02, z0 + 0.5), (x1, y + 0.02, lantern_top - 0.3))
            for m in range(5):
                mx_ = x0 + m * (x1 - x0) / 4
                b.box('steel', (mx_ - 0.05, y - 0.06, z0 + 0.5), (mx_ + 0.05, y + 0.06, lantern_top - 0.3))
        b.box('deck', (x0 - 0.3, y0 - 0.3, lantern_top - 0.3), (x1 + 0.3, y1 + 0.3, lantern_top))

    # The deck: the whole roof minus the lantern openings (strips along x).
    xs = sorted({wall_out[0], wall_out[1], *[v for l in lanterns for v in (l[0], l[1])]})
    for a, c in zip(xs, xs[1:]):
        mid = (a + c) / 2
        holes = sorted((l[2], l[3]) for l in lanterns if l[0] <= mid <= l[1])
        y = -end_out
        for h0, h1 in holes + [(end_out, end_out)]:
            b.box('deck', (a, y, deck_z), (c, h0, deck_z + deck_t))
            y = h1

    # Outer long walls with three ribbon window bands, mullions every half pitch.
    bands = [(1.8, 3.6), (4.8, 6.6), (8.4, 10.6)]
    for x_in, x_out in ((wall_in[0], wall_out[0]), (wall_in[1], wall_out[1])):
        x0, x1 = sorted((x_in, x_out))
        edges = [0.0]
        for lo, hi in bands:
            edges += [lo, hi]
        edges.append(parapet)
        for k in range(0, len(edges), 2):
            b.box('block', (x0, -end_out, edges[k]), (x1, end_out, edges[k + 1]))
        xm = (x0 + x1) / 2
        for lo, hi in bands:
            b.box('glass', (xm - 0.03, -end_in, lo), (xm + 0.03, end_in, hi))
            b.box('steel', (x0 - 0.02, -end_in, (lo + hi) / 2 - 0.05), (x1 + 0.02, end_in, (lo + hi) / 2 + 0.05))
            for m in range(int(round(L / (P / 2))) + 1):
                my_ = -L / 2 + m * (P / 2)
                b.box('steel', (x0 - 0.02, my_ - 0.06, lo), (x1 + 0.02, my_ + 0.06, hi))

    # End walls across every span, gates in the nave.
    door_w = min(dims['door_w_m'], S - 2)
    door_h = min(dims['door_h_m'], head_top - 0.3)
    far_w = min(dims['far_gate_w_m'], S - 2)
    far_h = min(dims['far_gate_h_m'], head_top - 0.3)
    for sign in (-1, 1):
        y0, y1 = sorted((sign * end_in, sign * end_out))
        gate_w, gate_h = (door_w, door_h) if sign < 0 else (far_w, far_h)
        if gate_w > 0 and gate_h > 0:
            b.box('block', (wall_out[0], y0, 0.0), (-gate_w / 2, y1, gate_h))
            b.box('block', (gate_w / 2, y0, 0.0), (wall_out[1], y1, gate_h))
            b.box('block', (wall_out[0], y0, gate_h), (wall_out[1], y1, parapet))
        else:
            b.box('block', (wall_out[0], y0, 0.0), (wall_out[1], y1, parapet))
        if sign < 0:
            for side in (-1, 1):
                x = side * door_w / 2
                b.box('rust', (x - side * 0.08, y1, 0.02), (x, y1 + door_w / 2, door_h - 0.05))
        elif far_w > 0:
            b.box('rust', (-far_w / 2, y0 - 0.2, 0.0), (far_w / 2, y0 - 0.1, far_h))
    if dims['entry_platform']:
        # A raised platform with stairs beside the entry gate (video 026; size GUESS).
        py0 = -end_in
        px0 = door_w / 2 + 0.6
        plat_h = 2.4
        b.box('concrete', (px0, py0, 0.0), (px0 + 7.0, py0 + 3.0, plat_h))
        b.box('steel', (px0, py0 + 3.0 - 0.04, plat_h), (px0 + 7.0, py0 + 3.0, plat_h + 1.05))
        for k in range(12):
            rise = plat_h * (k + 1) / 12
            sx = px0 + 7.0 + 0.3 * (12 - k - 1)
            b.box('concrete', (sx, py0, 0.0), (sx + 0.3, py0 + 1.2, rise))

    # Machines: massing boxes in the hall frame (x, z) -> Blender (x, -z).
    massing = []
    for item in dims['massing']:
        (x0, x1), (z0, z1), (h0, h1) = item['x_m'], item['z_m'], item.get('y_m', [0.0, 2.0])
        mat = item.get('material', 'machine')
        b.box(mat if mat in MATERIALS else 'machine', (x0, -z1, h0), (x1, -z0, h1))
        massing.append(item)

    # Zones: floor tape along the outline of each used rectangle.
    zones = {}
    for name, zone in (dims['zones'] or {}).items():
        if name.startswith('_') or not isinstance(zone, dict):
            continue
        used = zone.get('used') or zone.get('marked')
        mat = f'zone-{name}'
        if used and mat in MATERIALS:
            (x0, x1), (z0, z1) = used['x_m'], used['z_m']
            t = 0.15
            y0, y1 = -z1, -z0
            for lo, hi in (((x0, y0), (x1, y0 + t)), ((x0, y1 - t), (x1, y1)),
                           ((x0, y0), (x0 + t, y1)), ((x1 - t, y0), (x1, y1))):
                b.box(mat, (lo[0], lo[1], 0.0), (hi[0], hi[1], 0.012))
        zones[name] = zone
    if dims['zones'] and '_label' in dims['zones']:
        zones['_label'] = dims['zones']['_label']

    nave_rail = S / 2 - girder_off
    geometry = {
        'roof': 'space_frame_flat',
        'roof_flat': True,
        'wall_inner_x_m': round(min(abs(wall_in[0]), abs(wall_in[1])), 3),
        'walls_x_m': [round(wall_in[0], 3), round(wall_in[1], 3)],
        'rows_x_m': [round(v, 3) for v in rows],
        'spans': {'left': left, 'right': right, 'span_m': S},
        'end_wall_inner_y_m': round(end_in, 3),
        'runway_top_m': round(head_top + girder_depth, 3),
        'runway_bottom_m': round(head_top, 3),
        'crane_rail_x_m': round(nave_rail, 3),
        'cranes': cranes,
        'column_head': {'flare_start_m': round(flare_start, 3), 'head_top_m': round(head_top, 3),
                        'head_w_m': round(2 * hw, 3), 'girder_offset_m': round(girder_off, 3), 'upper_d_m': round(ud, 3)},
        'truss_bottom_m': round(bottom, 3),
        'truss_top_centre_m': round(top, 3),
        'eave_top_m': round(top, 3),
        'deck_m': round(deck_z, 3),
        'space_frame': {'module_m': [round(mx, 3), round(my, 3)], 'members': members,
                        'detail_spans': sorted(detail_spans)},
        'lantern_h_m': round(lantern_top - deck_z, 3),
        'lantern_w_m': round(lw, 3),
        'lantern_top_m': round(lantern_top, 3),
        # Each lantern in the hall frame: x across, z along (+ toward the entry).
        'lanterns': [{'x_m': [round(l[0], 3), round(l[1], 3)], 'z_m': [round(-l[3], 3), round(-l[2], 3)]} for l in lanterns],
        'expansion_joint_z_m': None if joint_y is None else round(-joint_y, 3),
        'column_grid_z_m': [round(-y, 3) for y in column_y],
        'column_row_x_m': [round(-S / 2, 3), round(S / 2, 3)],
        'column_inner_face_x_m': round(S / 2 - cd / 2, 3),
        'window_bands_m': [[lo, hi] for lo, hi in bands],
        'door': {'z_m': round(end_in, 3), 'w_m': round(door_w, 3), 'h_m': round(door_h, 3)},
        'far_gate': {'z_m': round(-end_in, 3), 'w_m': round(far_w, 3), 'h_m': round(far_h, 3)},
        'far_wall_z_m': round(-end_in, 3),
        'massing': massing,
        'zones': zones,
        'cameras': dims['cameras'] or {},
    }
    return b, geometry


def export(objects, glb_path):
    bpy.ops.object.select_all(action='DESELECT')
    for obj in objects:
        obj.select_set(True)
    bpy.ops.export_scene.gltf(
        filepath=glb_path, export_format='GLB', use_selection=True,
        export_yup=True, export_apply=True, export_normals=True,
        export_texcoords=False, export_materials='EXPORT')


def preview(path, dims, camera=None):
    """A quick Workbench render. `camera` is hall-frame x, y, z, yaw (deg, 0 = down -Z), pitch (deg, + up), vfov."""
    scene = bpy.context.scene
    scene.render.engine = 'BLENDER_WORKBENCH'
    scene.display.shading.light = 'STUDIO'
    scene.display.shading.color_type = 'MATERIAL'
    scene.display.shading.show_cavity = True
    scene.render.resolution_x = 1280
    scene.render.resolution_y = 720
    cam_data = bpy.data.cameras.new('preview')
    cam_data.lens_unit = 'FOV'
    cam_data.sensor_fit = 'VERTICAL'
    cam_data.clip_end = 400
    cam = bpy.data.objects.new('preview', cam_data)
    bpy.context.collection.objects.link(cam)
    L = dims['length_m']
    x, y, z, yaw, pitch, vfov = camera or (0.0, 1.7, L / 2 - 2.0, 0.0, 5.0, 60.0)
    cam_data.angle = math.radians(vfov)
    # Hall (x, y up, z) -> Blender (x, -z, y). Blender camera looks down -Z
    # local; rotation X 90 deg looks along +Y (toward the far end).
    cam.location = (x, -z, y)
    cam.rotation_euler = (math.radians(90 + pitch), 0.0, math.radians(-yaw))
    scene.camera = cam
    scene.render.filepath = path
    bpy.ops.render.render(write_still=True)


def main():
    opts = parse_cli()
    out = os.path.abspath(opts['out'])
    os.makedirs(out, exist_ok=True)
    dims, origin, dims_source, dims_notes = resolve_dims(opts)

    bpy.ops.wm.read_factory_settings(use_empty=True)
    builder, geometry = build(dims)
    objects = builder.to_objects()
    glb = os.path.join(out, 'hall.glb')
    export(objects, glb)
    triangles = sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in objects)

    S, L = dims['span_m'], dims['length_m']
    wx0, wx1 = geometry['walls_x_m']
    half_l = geometry['end_wall_inner_y_m']
    size = [round(wx1 - wx0 + 0.6, 3), round(geometry['lantern_top_m'], 3), round(2 * (half_l + 0.3), 3)]
    measured = all(origin[key] == 'measured' for key in ('span_m', 'pitch_m', 'bays'))
    any_placeholder = any(origin[key] == 'placeholder' for key in CORE_KEYS)
    scale_source = 'measured' if measured else 'guess'
    scale_note = (
        'Built from a structural grid. '
        + ('PLACEHOLDER dimensions — nobody has measured this hall; ' if any_placeholder else '')
        + ('dims from ' + str(dims_source) + '; ' if dims_source else '')
        + 'every number and where it came from is in hall.json.'
    )
    now = datetime.now(timezone.utc).isoformat()
    nave = S / 2 - dims['column_d_m'] / 2
    record = {
        'tool': 'scripts/place/hall.py',
        'version': 1,          # the place-record schema import.mjs reads (fit-lib.mjs readPlaceRecord)
        'hallVersion': 2,      # v2: flat space frame, several spans
        'createdAt': now,
        'glb': glb,
        'fittedGlb': glb,
        'bakedIn': True,
        'units': 'metres',
        'scaleSource': scale_source,
        'scaleNote': scale_note,
        'transform': {'position': [0, 0, 0], 'rotation': [0, 0, 0], 'scale': [1, 1, 1]},
        'size': size,
        'bounds': {'min': [wx0 - 0.3, 0, -size[2] / 2], 'max': [wx1 + 0.3, size[1], size[2] / 2]},
        'floor': {'y': 0},
        'door': {'x': 0, 'z': geometry['door']['z_m']},
        'spawn': {'x': 0, 'z': round(half_l - 3.0, 3), 'yaw': 3.142, 'pitch': 0, 'altY': 1.6},
        # The whole floor is walkable: the spans are open to each other.
        'walkableAreas': [{'minX': round(wx0 + 0.4, 3), 'maxX': round(wx1 - 0.4, 3),
                           'minZ': -half_l + 0.4, 'maxZ': half_l + 1.0}],
        'nave': {'minX': -nave, 'maxX': nave},
        'confidence': {'verdict': 'modelled', 'note': 'a clean model, not a reconstruction'},
    }
    with open(os.path.join(out, 'place.json'), 'w') as handle:
        json.dump(record, handle, indent=2)
    hall = {
        'tool': 'scripts/place/hall.py',
        'version': 2,
        'createdAt': now,
        'what': 'A clean parametric model of a Soviet multi-span crane hall with a flat space-frame roof '
                '(MOXIR, Charentsavan). Not a scan. Frame: Y up, metres, the entry end at +Z, the far end at -Z, '
                'the nave centred on x = 0, +x to the right looking from the entry.',
        'dims': dims,
        'dimsOrigin': origin,
        'dimsFiles': [os.path.relpath(os.path.abspath(p)) for p in opts['dims']],
        'dimsSource': dims_source,
        'dimsNotes': dims_notes,
        'warning': ('PLACEHOLDER dimensions. Re-run with --dims <file> once the hall is measured.') if any_placeholder else
                   (None if scale_source == 'measured' else
                    'ESTIMATED from photographs, not taped: see dimsOrigin for each value, its range and confidence.'),
        'geometry': geometry,
        'triangles': triangles,
        'meshes': {o.name: sum(len(p.vertices) - 2 for p in o.data.polygons) for o in objects},
    }
    with open(os.path.join(out, 'hall.json'), 'w') as handle:
        json.dump(hall, handle, indent=2)
    print(f'[hall] wrote {glb} — {len(objects)} meshes, {triangles} triangles '
          f'({geometry["space_frame"]["members"]} frame members), {size[0]:.1f} x {size[2]:.1f} m, '
          f'lantern top {geometry["lantern_top_m"]:.1f} m ({scale_source.upper()})')
    if any_placeholder:
        print('[hall] PLACEHOLDER dimensions — see hall.json. Re-run with --dims when measured.')
    if opts['preview']:
        preview(os.path.join(out, 'preview.png'), dims, opts['preview_camera'])
        print(f'[hall] preview {os.path.join(out, "preview.png")}')


if __name__ == '__main__':
    main()
