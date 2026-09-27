"""Build a clean, parametric model of a Soviet single-span industrial hall.

A photogrammetry scan is the right tool when the footage covers the room. When
it does not (MOXIR, 2026-09: 67 frames gave a smeared roof fragment, and the
venue cannot be revisited before the show), the professional fallback is the
one every lighting designer and set builder uses: a CAD-style box model of the
room from its structural grid, good enough to hang and aim a rig in, with every
number that was not measured labelled as such.

The hall this builds is the standard Soviet one-storey crane hall (the type the
unified industrial-building catalogues of the 1960s-80s standardised: a 6 or
12 m column pitch, 18/24/30 m spans, stepped reinforced-concrete columns
carrying a crane runway, steel roof trusses with a skylight lantern on top):

  * floor, with rail tracks set into it
  * two rows of stepped columns (a wide lower shaft, a haunch that carries the
    crane runway beam, a narrower upper shaft up to the truss)
  * crane runway beams + rails, walkways and handrails along both rows, and
    yellow overhead crane bridges parked where the dims file says
  * optional low side aisles behind both column rows
  * one simplified steel truss per grid line, purlins along the length
  * a skylight lantern along the ridge
  * end walls with gates (and a raised platform with stairs at the entry),
    long walls with clerestory window bands

Everything is in real metres, low-poly, grouped by material so the browser draws
a handful of meshes, not thousands.

Usage:
    blender -b -P scripts/place/hall.py -- --out <dir> [--dims dims.json]
        [--span 24] [--pitch 6] [--bays 16] [--crane-rail 10]
        [--truss-bottom 13] [--ridge 16] [--lantern 6]
        [--column-w 0.6] [--column-d 1.0] [--preview]

Writes into <dir>:
    hall.glb     the room, Y-up, floor at y=0, centred on the origin,
                 the door end at +Z and the far (stage) end at -Z
    hall.json    every dimension used, and for each one where it came from
    place.json   the record import.mjs reads (same shape fit.mjs writes)
    preview.png  (with --preview) a quick Workbench render from the door

`--dims` takes the JSON another step measures from photographs:
    { "span_m", "pitch_m", "bays", "length_m", "crane_rail_h_m",
      "truss_bottom_h_m", "ridge_h_m", "lantern_w_m", "column_w_m",
      "source": "photos" | "tape" | ..., "ranges": {...}, "confidence": {...}, "notes": ... }
and may be given more than once; later files win. A second file can carry the
features the grid does not: "truss_top_h_m", "column_d_m", "upper_column_d_m",
"door_w_m"/"door_h_m" (entry gate), "entry_platform", "far_gate_w_m"/"far_gate_h_m",
"aisle_w_m"/"aisle_h_m" (low side aisles behind the column rows),
"cranes_from_door_m" (one entry per crane bridge), "track_x_m".
Any key left out keeps the placeholder. A range with no value
(`ranges.column_lower_depth_m_GUESS`, `ranges.truss_top_h_m`) is used at its midpoint. A value is only ever reported as
MEASURED when the file says its source is a tape (`"source": "tape"` or
`"measured"`); anything read off a picture is an ESTIMATE, and a placeholder
is a GUESS.

Written for Blender 5.x (bpy.ops.export_scene.gltf).
"""
import json
import math
import os
import sys
from datetime import datetime, timezone

import bpy

# ── the numbers ─────────────────────────────────────────────────────────────────
# PLACEHOLDERS, chosen from the photographs by eye on 2026-09-27 and from the
# standard Soviet grid. None of them was measured. They exist so the room can be
# built and the rig hung tonight; the real values arrive as --dims.
PLACEHOLDER = {
    'span_m': 24.0,           # column axis to column axis, across the hall
    'pitch_m': 6.0,           # column axis to column axis, along a row
    'bays': 16,               # pitches along the hall
    'length_m': None,         # None = bays * pitch
    'crane_rail_h_m': 10.0,   # floor to the top of the crane rail
    'truss_bottom_h_m': 13.0, # floor to the underside of the truss (bottom chord)
    'ridge_h_m': 16.0,        # floor to the highest point: the lantern's roof
    'lantern_w_m': 6.0,       # skylight lantern, outside to outside
    'column_w_m': 0.6,        # lower shaft, along the row
    'column_d_m': 1.0,        # lower shaft, across the hall
    'upper_column_d_m': 0.6,  # upper shaft, across the hall
    'truss_top_h_m': None,    # floor to the truss top chord at mid-span; None = derived
    'door_w_m': 6.0,          # the big gate in the entry (door-end) wall
    'door_h_m': 6.0,
    'entry_platform': True,   # a raised platform with stairs beside the entry gate
    'far_gate_w_m': 0.0,      # a gate in the far end wall (0 = none)
    'far_gate_h_m': 0.0,
    'aisle_w_m': 0.0,         # a low side aisle behind each column row (0 = none)
    'aisle_h_m': 0.0,         # floor to the aisle's roof
    'track_x_m': [-4.0, 4.0], # centres of the rail tracks in the floor
    'track_gauge_m': 1.52,    # Russian broad gauge, 1520 mm — the one number here
                              # that is a standard rather than a guess
    'cranes_from_door_m': [21.0],  # where each overhead crane bridge is parked,
                              # metres from the entry wall
}

KEYS_FROM_DIMS = [
    'span_m', 'pitch_m', 'bays', 'length_m', 'crane_rail_h_m', 'truss_bottom_h_m',
    'ridge_h_m', 'lantern_w_m', 'column_w_m', 'column_d_m', 'upper_column_d_m', 'truss_top_h_m',
    'door_w_m', 'door_h_m', 'entry_platform', 'far_gate_w_m', 'far_gate_h_m', 'aisle_w_m', 'aisle_h_m',
    'track_x_m', 'cranes_from_door_m',
]

CLI_TO_KEY = {
    '--span': 'span_m', '--pitch': 'pitch_m', '--bays': 'bays', '--length': 'length_m',
    '--crane-rail': 'crane_rail_h_m', '--truss-bottom': 'truss_bottom_h_m',
    '--ridge': 'ridge_h_m', '--lantern': 'lantern_w_m', '--column-w': 'column_w_m',
    '--column-d': 'column_d_m', '--door-w': 'door_w_m', '--door-h': 'door_h_m',
}

# Colours (linear sRGB as Blender takes them), roughness, metallic.
MATERIALS = {
    'concrete':  ((0.30, 0.29, 0.27), 0.92, 0.0),   # columns, plinth
    'floor':     ((0.16, 0.155, 0.145), 0.95, 0.0), # worn slab
    'block':     ((0.34, 0.33, 0.31), 0.95, 0.0),   # the wall infill
    'glass':     ((0.05, 0.075, 0.09), 0.25, 0.0),  # clerestory and lantern glazing, at night
    'steel':     ((0.28, 0.28, 0.27), 0.65, 0.6),   # trusses, purlins, mullions
    'rust':      ((0.20, 0.085, 0.035), 0.85, 0.3), # runway beams, rails
    'crane':     ((0.72, 0.46, 0.02), 0.6, 0.2),    # the yellow bridge
    'deck':      ((0.07, 0.07, 0.075), 0.9, 0.3),   # roof deck, seen from below
}


def parse_cli():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    opts = {'out': None, 'dims': [], 'preview': False, 'overrides': {}}
    i = 0
    while i < len(argv):
        flag = argv[i]
        if flag == '--out':
            opts['out'] = argv[i + 1]; i += 2
        elif flag == '--dims':
            opts['dims'].append(argv[i + 1]); i += 2
        elif flag == '--preview':
            opts['preview'] = True; i += 1
        elif flag in CLI_TO_KEY:
            opts['overrides'][CLI_TO_KEY[flag]] = float(argv[i + 1]); i += 2
        else:
            raise SystemExit(f'hall.py: unknown argument {flag}')
    if not opts['out']:
        raise SystemExit('usage: blender -b -P hall.py -- --out <dir> [--dims dims.json] [--span 24 ...]')
    return opts


def resolve_dims(opts):
    """Merge placeholder <- dims.json <- CLI, and remember where each came from."""
    dims = dict(PLACEHOLDER)
    origin = {key: 'placeholder' for key in dims}
    dims_source = None
    dims_notes = None
    # Several --dims files merge in order: the measured grid first, then (say)
    # a file of features read off the photographs. Each value remembers the
    # file it came from.
    for dims_path in opts['dims']:
        with open(dims_path) as handle:
            given = json.load(handle)
        this_source = str(given.get('source') or ('photographs: ' + str((given.get('sources') or {}).get('model', 'see file'))
                                                   if given.get('sources') else 'unstated'))
        dims_source = this_source if dims_source is None else f'{dims_source}; {this_source}'
        dims_notes = (dims_notes or []) + [{'file': os.path.basename(dims_path), 'notes': given.get('notes')}]
        confidence = given.get('confidence') or {}
        base_tag = 'measured' if this_source.lower() in ('tape', 'measured', 'laser') else 'estimate'
        for key in KEYS_FROM_DIMS:
            value = given.get(key)
            if value is None:
                continue
            # A dims file may carry {value, confidence}; take the value.
            if isinstance(value, dict) and 'value' in value:
                value = value['value']
            dims[key] = value
            conf = confidence.get(key)
            origin[key] = base_tag if base_tag == 'measured' else \
                f"{base_tag} ({os.path.basename(dims_path)}{'; confidence ' + str(conf) if conf else ''})"
            if base_tag != "measured" and isinstance(given.get("ranges"), dict) and key in given["ranges"]:
                origin[key] += f" range {given['ranges'][key]}"
        # A range given without a value (the lower column's depth, say) is used
        # at its midpoint, and says so.
        ranges = given.get('ranges') or {}
        for key, range_key in (('column_d_m', 'column_lower_depth_m_GUESS'), ('truss_top_h_m', 'truss_top_h_m')):
            span = ranges.get(range_key)
            if given.get(key) is None and isinstance(span, list) and len(span) == 2:
                dims[key] = (float(span[0]) + float(span[1])) / 2
                origin[key] = f'midpoint of range {span} ({dims_source}; GUESS)'
    for key, value in opts['overrides'].items():
        dims[key] = value
        origin[key] = 'command line (unmeasured)'
    dims['bays'] = int(round(float(dims['bays'])))
    if dims.get('length_m'):
        # A stated length wins; the pitch count follows it so the grid closes.
        stated = float(dims['length_m'])
        if abs(stated - dims['bays'] * dims['pitch_m']) > 0.5 * dims['pitch_m']:
            dims['bays'] = max(1, int(round(stated / dims['pitch_m'])))
            origin['bays'] = f"derived from length_m ({origin['length_m']})"
    dims['length_m'] = dims['bays'] * float(dims['pitch_m'])
    if origin['length_m'] == 'placeholder':
        origin['length_m'] = f"bays x pitch ({origin['bays']}, {origin['pitch_m']})"
    dims['cranes_from_door_m'] = [min(dims['length_m'] - 3, max(3.0, float(v))) for v in dims['cranes_from_door_m']]
    for key in ('span_m', 'pitch_m', 'crane_rail_h_m', 'truss_bottom_h_m', 'ridge_h_m',
                'lantern_w_m', 'column_w_m', 'column_d_m', 'upper_column_d_m', 'door_w_m', 'door_h_m',
                'far_gate_w_m', 'far_gate_h_m', 'aisle_w_m', 'aisle_h_m'):
        dims[key] = float(dims[key])
    if dims['truss_top_h_m'] is not None:
        dims['truss_top_h_m'] = float(dims['truss_top_h_m'])
        if not dims['truss_bottom_h_m'] < dims['truss_top_h_m'] < dims['ridge_h_m']:
            raise SystemExit('hall.py: truss top must sit between the truss bottom and the ridge')
    if dims['aisle_w_m'] > 0 and not dims['crane_rail_h_m'] <= dims['aisle_h_m'] < dims['truss_bottom_h_m']:
        # An aisle roof under the crane rail would cut the columns' crane zone;
        # above the truss it is not an aisle.
        dims['aisle_h_m'] = min(dims['truss_bottom_h_m'] - 1.0, max(dims['crane_rail_h_m'] + 0.9, dims['aisle_h_m']))
        origin['aisle_h_m'] += ' (clamped between the crane rail and the truss)'
    if not dims['crane_rail_h_m'] + 1.5 <= dims['truss_bottom_h_m'] < dims['ridge_h_m']:
        raise SystemExit(
            'hall.py: heights do not stack — need crane rail + 1.5 m <= truss bottom < ridge '
            f"(got {dims['crane_rail_h_m']}, {dims['truss_bottom_h_m']}, {dims['ridge_h_m']})")
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
        self.quad_box(material, [
            (x0, y0, z0), (x1, y0, z0), (x1, y1, z0), (x0, y1, z0),
            (x0, y0, z1), (x1, y0, z1), (x1, y1, z1), (x0, y1, z1),
        ])

    def member(self, material, p0, p1, width, depth):
        """A straight bar from p0 to p1 with a width x depth section."""
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

    def prism_yz(self, material, polygon, x0, x1):
        """A convex polygon in the y-z plane, extruded along x."""
        verts, faces = self.parts[material]
        base = len(verts)
        count = len(polygon)
        verts.extend((x0, y, z) for y, z in polygon)
        verts.extend((x1, y, z) for y, z in polygon)
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
            # Outward normals: every face we wrote is a closed convex solid, so
            # a consistent recalculation is safe and cheaper than hand-winding.
            obj = bpy.data.objects.new(f'hall-{name}', mesh)
            bpy.context.collection.objects.link(obj)
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
    colour, roughness, metallic = MATERIALS[name]
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value = (*colour, 1.0)
    bsdf.inputs['Roughness'].default_value = roughness
    bsdf.inputs['Metallic'].default_value = metallic
    return mat


# ── the hall ────────────────────────────────────────────────────────────────────
def build(dims):
    """Blender frame: x across the span, y along the hall, z up.

    The entry end is at y = -L/2 and the far end at y = +L/2; glTF export turns
    Blender's +Y into -Z, so in di.iiii the entry is at +Z and the far end at
    -Z, and a visitor spawning at the entry looks down -Z — the default
    camera's way.
    """
    b = Builder()
    S = dims['span_m']
    P = dims['pitch_m']
    L = dims['length_m']
    N = dims['bays']
    rail_h = dims['crane_rail_h_m']
    truss_bottom = dims['truss_bottom_h_m']
    ridge = dims['ridge_h_m']
    lantern_w = min(dims['lantern_w_m'], S * 0.6)
    cw = dims['column_w_m']
    cd = dims['column_d_m']
    aisle_w = dims['aisle_w_m']
    aisle_h = dims['aisle_h_m']

    half = S / 2
    wall_t = 0.3
    nave_wall = half + cd / 2                # the nave's long wall: outer face of the columns
    outer_in = nave_wall + aisle_w           # the building's outer long wall, inside face
    outer_out = outer_in + wall_t
    end_in = L / 2 + 0.5                     # end walls stand 0.5 m past the end grid line
    end_out = end_in + wall_t

    # Truss geometry: bottom chord flat, top chord rising to mid-span, the
    # lantern on top of that up to the ridge.
    if dims['truss_top_h_m']:
        top_centre = dims['truss_top_h_m']
    else:
        top_centre = ridge - min(2.5, max(0.8, 0.35 * (ridge - truss_bottom))) - 0.25
    lantern_h = ridge - top_centre
    eave_depth = max(0.6, 0.45 * (top_centre - truss_bottom))
    eave_top = truss_bottom + eave_depth
    roof_t = 0.2

    def top_chord_z(x):
        t = min(1.0, abs(x) / half)
        return top_centre + (eave_top - top_centre) * t

    grid_y = [-L / 2 + i * P for i in range(N + 1)]

    # Floor: the slab under nave and aisles, then rail tracks set into it.
    b.box('floor', (-outer_out, -end_out, -0.3), (outer_out, end_out, 0.0))
    for centre in dims['track_x_m']:
        for side in (-1, 1):
            x = centre + side * dims['track_gauge_m'] / 2
            b.box('rust', (x - 0.035, -end_out, 0.0), (x + 0.035, end_out, 0.025))

    # Columns: lower shaft to the console, the console carrying the runway,
    # upper shaft to the truss.
    runway_depth = min(1.2, max(0.8, rail_h * 0.12))
    runway_w = 0.5
    rail_size = 0.15
    runway_top = rail_h - rail_size
    runway_bottom = runway_top - runway_depth
    haunch_reach = 0.55
    upper_d = min(cd, dims['upper_column_d_m'])
    for side in (-1, 1):
        axis = side * half
        inner = axis - side * cd / 2      # the face toward the middle of the hall
        outer = axis + side * cd / 2
        for y in grid_y:
            y0, y1 = y - cw / 2, y + cw / 2
            b.box('concrete', (inner, y0, 0.0), (outer, y1, runway_bottom))
            tip = inner - side * haunch_reach
            wedge = [(inner, runway_bottom - 1.3), (inner, runway_bottom), (tip, runway_bottom), (tip, runway_bottom - 0.25)]
            if side < 0:
                wedge = list(reversed(wedge))
            b.prism_xz('concrete', wedge, y0, y1)
            b.box('concrete', (outer - side * upper_d, y0 + 0.02, runway_bottom), (outer, y1 - 0.02, truss_bottom))
        # Runway beam and rail, the full length; a walkway and handrail on it.
        rail_x = inner - side * (haunch_reach - runway_w / 2)
        b.box('rust', (rail_x - runway_w / 2, -L / 2 - cw / 2, runway_bottom), (rail_x + runway_w / 2, L / 2 + cw / 2, runway_top))
        b.box('rust', (rail_x - 0.06, -L / 2 - cw / 2, runway_top), (rail_x + 0.06, L / 2 + cw / 2, rail_h))
        walk_x0, walk_x1 = sorted((rail_x + side * runway_w / 2, outer))
        b.box('steel', (walk_x0, -L / 2, runway_top - 0.06), (walk_x1, L / 2, runway_top))
        hx = rail_x - side * 0.5
        b.box('steel', (hx - 0.03, -L / 2, rail_h + 1.0), (hx + 0.03, L / 2, rail_h + 1.06))
        b.box('steel', (hx - 0.02, -L / 2, rail_h + 0.5), (hx + 0.02, L / 2, rail_h + 0.54))
        for y in grid_y:
            b.box('steel', (hx - 0.03, y - 0.03, runway_top), (hx + 0.03, y + 0.03, rail_h + 1.06))

    rail_x_abs = abs(half - cd / 2 - (haunch_reach - runway_w / 2))

    # Overhead cranes: two box girders across the span, end trucks on the rails,
    # a trolley on top and a cab hanging under one end.
    girder_bottom = rail_h + 0.55
    girder_depth = 1.5
    cranes = []
    for from_door in dims['cranes_from_door_m']:
        crane_y = -L / 2 + from_door
        for offset in (-1.1, 1.1):
            b.box('crane', (-rail_x_abs, crane_y + offset - 0.35, girder_bottom), (rail_x_abs, crane_y + offset + 0.35, girder_bottom + girder_depth))
        for side in (-1, 1):
            x = side * rail_x_abs
            b.box('crane', (x - 0.4, crane_y - 2.6, rail_h), (x + 0.4, crane_y + 2.6, girder_bottom + 0.4))
        b.box('crane', (2.0, crane_y - 1.6, girder_bottom + girder_depth), (4.6, crane_y + 1.6, girder_bottom + girder_depth + 1.0))
        cab_x = -rail_x_abs + 1.0
        b.box('crane', (cab_x, crane_y - 1.0, girder_bottom - 2.2), (cab_x + 2.0, crane_y + 1.0, girder_bottom))
        b.box('glass', (cab_x + 1.95, crane_y - 0.8, girder_bottom - 1.9), (cab_x + 2.02, crane_y + 0.8, girder_bottom - 0.9))
        cranes.append({'z_m': round(-crane_y, 3), 'from_entry_m': round(from_door, 3),
                       'girder_bottom_m': round(girder_bottom, 3), 'girder_top_m': round(girder_bottom + girder_depth, 3)})

    # Trusses: one per grid line, Warren web.
    panels = max(4, int(round(S / 3.0)))
    if panels % 2:
        panels += 1
    xs = [-half + S * k / panels for k in range(panels + 1)]
    for y in grid_y:
        b.member('steel', (-half - cd / 2, y, truss_bottom + 0.12), (half + cd / 2, y, truss_bottom + 0.12), 0.25, 0.25)
        b.member('steel', (-half - cd / 2, y, eave_top), (0.0, y, top_centre), 0.25, 0.25)
        b.member('steel', (0.0, y, top_centre), (half + cd / 2, y, eave_top), 0.25, 0.25)
        for k, x in enumerate(xs):
            b.member('steel', (x, y, truss_bottom + 0.12), (x, y, top_chord_z(x)), 0.14, 0.14)
            if k < panels:
                nxt = xs[k + 1]
                if x < 0:
                    b.member('steel', (x, y, top_chord_z(x)), (nxt, y, truss_bottom + 0.12), 0.12, 0.12)
                else:
                    b.member('steel', (x, y, truss_bottom + 0.12), (nxt, y, top_chord_z(nxt)), 0.12, 0.12)
    for x in xs:
        z = top_chord_z(x)
        b.box('steel', (x - 0.08, -L / 2, z), (x + 0.08, L / 2, z + 0.18))
    for x in (-half / 2, 0.0, half / 2):
        b.box('steel', (x - 0.05, -L / 2, truss_bottom + 0.05), (x + 0.05, L / 2, truss_bottom + 0.19))

    # Roof: two sloping decks from the eaves to the lantern, the lantern on top.
    lx = lantern_w / 2
    lantern_y0 = -L / 2 + P                 # lanterns stop a bay short of each end
    lantern_y1 = L / 2 - P
    for side in (-1, 1):
        poly = [(side * (nave_wall + wall_t), eave_top + 0.18), (side * lx, top_chord_z(lx) + 0.18),
                (side * lx, top_chord_z(lx) + 0.18 + roof_t), (side * (nave_wall + wall_t), eave_top + 0.18 + roof_t)]
        if side < 0:
            poly = list(reversed(poly))
        b.prism_xz('deck', poly, -end_out, end_out)
    base_z = top_chord_z(lx) + 0.18
    b.box('deck', (-lx, -end_out, base_z), (lx, lantern_y0, base_z + roof_t))
    b.box('deck', (-lx, lantern_y1, base_z), (lx, end_out, base_z + roof_t))
    glass_top = ridge - 0.25
    for side in (-1, 1):
        x = side * lx
        b.box('deck', (x - 0.1, lantern_y0, base_z), (x + 0.1, lantern_y1, base_z + 0.45))
        if glass_top - (base_z + 0.45) > 0.3:
            b.box('glass', (x - 0.03, lantern_y0, base_z + 0.45), (x + 0.03, lantern_y1, glass_top))
            n_mullions = int((lantern_y1 - lantern_y0) / 3.0)
            for m in range(n_mullions + 1):
                my = lantern_y0 + m * (lantern_y1 - lantern_y0) / max(1, n_mullions)
                b.box('steel', (x - 0.06, my - 0.05, base_z + 0.45), (x + 0.06, my + 0.05, glass_top))
    b.box('deck', (-lx - 0.4, lantern_y0 - 0.2, glass_top), (lx + 0.4, lantern_y1 + 0.2, ridge))
    for y in (lantern_y0, lantern_y1):
        b.box('deck', (-lx, y - 0.1, base_z), (lx, y + 0.1, glass_top))

    def window_wall(x_in, x_out, z_lo, z_hi, bands, y_in, y_out):
        """A long wall from z_lo to z_hi with glazed bands, mullions every half pitch."""
        edges = [z_lo]
        for lo, hi in bands:
            edges += [lo, hi]
        edges.append(z_hi)
        for k in range(0, len(edges), 2):
            if edges[k + 1] > edges[k]:
                b.box('block', (x_in, -y_out, edges[k]), (x_out, y_out, edges[k + 1]))
        xm = (x_in + x_out) / 2
        for lo, hi in bands:
            b.box('glass', (xm - 0.04, -y_in, lo), (xm + 0.04, y_in, hi))
            mid = (lo + hi) / 2
            b.box('steel', (x_in - 0.02, -y_in, mid - 0.05), (x_out + 0.02, y_in, mid + 0.05))
            steps = int(round(L / (P / 2)))
            for m in range(steps + 1):
                my = -L / 2 + m * (P / 2)
                b.box('steel', (x_in - 0.02, my - 0.06, lo), (x_out + 0.02, my + 0.06, hi))

    def fit_bands(candidates, top):
        return [(lo, min(hi, top - 0.4)) for lo, hi in candidates if min(hi, top - 0.4) - lo >= 1.0]

    wall_top = eave_top + 0.18 + roof_t
    if aisle_w > 0:
        # The side aisles: open to the nave between the columns under a low
        # roof, three window bands in the outer wall (as the photographs show),
        # and a clerestory band in the nave wall above the aisle roof.
        outer_bands = fit_bands([(1.2, 2.8), (3.4, 5.2), (5.8, 7.4)], aisle_h)
        clerestory = fit_bands([(aisle_h + roof_t + 0.5, eave_top - 0.3)], eave_top)
        for side in (-1, 1):
            x0, x1 = sorted((side * outer_in, side * outer_out))
            window_wall(x0, x1, 0.0, aisle_h + roof_t, outer_bands, end_in, end_out)
            r0, r1 = sorted((side * nave_wall, side * outer_out))
            b.box('deck', (r0, -end_out, aisle_h), (r1, end_out, aisle_h + roof_t))
            n0, n1 = sorted((side * nave_wall, side * (nave_wall + wall_t)))
            window_wall(n0, n1, aisle_h + roof_t, wall_top, clerestory, end_in, end_out)
            # The aisle's own roof beams, one per grid line.
            for y in grid_y:
                b.box('steel', (r0, y - 0.1, aisle_h - 0.45), (r1, y + 0.1, aisle_h))
        bands = outer_bands + clerestory
    else:
        band_a = (3.0, min(7.2, runway_bottom - 0.6))
        band_b = (rail_h + 0.8, eave_top - 0.5)
        bands = [(lo, hi) for lo, hi in (band_a, band_b) if hi - lo >= 1.0]
        for side in (-1, 1):
            x0, x1 = sorted((side * nave_wall, side * outer_out))
            window_wall(x0, x1, 0.0, wall_top, bands, end_in, end_out)

    # End walls, up to the roof line, across nave and aisles.
    door_w = min(dims['door_w_m'], S - 2)
    door_h = min(dims['door_h_m'], runway_bottom)
    far_w = min(dims['far_gate_w_m'], S - 2)
    far_h = min(dims['far_gate_h_m'], runway_bottom)
    low_top = aisle_h + roof_t if aisle_w > 0 else eave_top + 0.18
    for sign in (-1, 1):
        y0, y1 = sorted((sign * end_in, sign * end_out))
        gate_w, gate_h = (door_w, door_h) if sign < 0 else (far_w, far_h)
        if gate_w > 0 and gate_h > 0:
            b.box('block', (-outer_out, y0, 0.0), (-gate_w / 2, y1, gate_h))
            b.box('block', (gate_w / 2, y0, 0.0), (outer_out, y1, gate_h))
            b.box('block', (-outer_out, y0, gate_h), (outer_out, y1, low_top))
        else:
            b.box('block', (-outer_out, y0, 0.0), (outer_out, y1, low_top))
        if aisle_w > 0:
            b.box('block', (-nave_wall - wall_t, y0, low_top), (nave_wall + wall_t, y1, eave_top + 0.18))
        gable = [(-nave_wall - wall_t, eave_top + 0.18), (nave_wall + wall_t, eave_top + 0.18),
                 (lx, top_chord_z(lx) + 0.18 + roof_t), (0.0, ridge), (-lx, top_chord_z(lx) + 0.18 + roof_t)]
        b.prism_xz('block', gable, y0, y1)
        if sign < 0:
            # Entry gate: the leaves standing open against the wall inside.
            for side in (-1, 1):
                x = side * door_w / 2
                b.box('rust', (x - side * 0.08, y1, 0.02), (x, y1 + door_w / 2, door_h - 0.05))
        elif far_w > 0:
            # Far gate: closed, a dark steel leaf set in the opening.
            b.box('rust', (-far_w / 2, y0 + 0.1, 0.0), (far_w / 2, y0 + 0.2, far_h))
    if dims['entry_platform']:
        # A raised platform with stairs beside the entry gate (seen in the
        # entry video; size and height are GUESSES).
        py0 = -end_in
        px0 = door_w / 2 + 0.6
        plat_h = 2.4
        b.box('concrete', (px0, py0, 0.0), (px0 + 7.0, py0 + 3.0, plat_h))
        b.box('steel', (px0, py0 + 3.0 - 0.04, plat_h), (px0 + 7.0, py0 + 3.0, plat_h + 1.05))
        steps = 12
        for k in range(steps):
            rise = plat_h * (k + 1) / steps
            sx = px0 + 7.0 + 0.3 * (steps - k - 1)
            b.box('concrete', (sx, py0, 0.0), (sx + 0.3, py0 + 1.2, rise))

    geometry = {
        'wall_inner_x_m': round(outer_in, 3),
        'nave_wall_x_m': round(nave_wall, 3),
        'aisle_w_m': round(aisle_w, 3),
        'aisle_roof_m': round(aisle_h, 3) if aisle_w > 0 else None,
        'end_wall_inner_y_m': round(end_in, 3),
        'runway_top_m': round(runway_top, 3),
        'runway_bottom_m': round(runway_bottom, 3),
        'crane_rail_x_m': round(rail_x_abs, 3),
        'cranes': cranes,
        'truss_bottom_m': round(truss_bottom, 3),
        'truss_top_centre_m': round(top_centre, 3),
        'eave_top_m': round(eave_top, 3),
        'lantern_h_m': round(lantern_h, 3),
        'lantern_w_m': round(lantern_w, 3),
        'column_grid_z_m': [round(-y, 3) for y in grid_y],
        'column_row_x_m': [round(-half, 3), round(half, 3)],
        'column_inner_face_x_m': round(half - cd / 2, 3),
        'window_bands_m': [[round(lo, 3), round(hi, 3)] for lo, hi in bands],
        'door': {'z_m': round(end_in, 3), 'w_m': round(door_w, 3), 'h_m': round(door_h, 3)},
        'far_gate': {'z_m': round(-end_in, 3), 'w_m': round(far_w, 3), 'h_m': round(far_h, 3)},
        'far_wall_z_m': round(-end_in, 3),
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


def preview(path, dims, geometry):
    """A quick Workbench render from inside the door, to look at before importing."""
    scene = bpy.context.scene
    scene.render.engine = 'BLENDER_WORKBENCH'
    scene.display.shading.light = 'STUDIO'
    scene.display.shading.color_type = 'MATERIAL'
    scene.display.shading.show_cavity = True
    scene.render.resolution_x = 1600
    scene.render.resolution_y = 900
    cam_data = bpy.data.cameras.new('preview')
    cam_data.lens_unit = 'FOV'
    cam_data.angle = math.radians(75)
    cam = bpy.data.objects.new('preview', cam_data)
    bpy.context.collection.objects.link(cam)
    L = dims['length_m']
    cam.location = (0.0, -L / 2 + 2.0, 1.7)
    cam.rotation_euler = (math.radians(95), 0.0, 0.0)
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
    half_w = geometry['wall_inner_x_m']
    half_l = geometry['end_wall_inner_y_m']
    size = [round(2 * (half_w + 0.3), 3), round(dims['ridge_h_m'], 3), round(2 * (half_l + 0.3), 3)]
    measured = all(value == 'measured' for key, value in origin.items() if key in ('span_m', 'pitch_m', 'bays'))
    any_placeholder = any(value == 'placeholder' for key, value in origin.items() if key in KEYS_FROM_DIMS[:9])
    scale_source = 'measured' if measured else 'guess'
    scale_note = (
        'Built from a structural grid. '
        + ('PLACEHOLDER dimensions — nobody has measured this hall; ' if any_placeholder else '')
        + ('dims from ' + str(dims_source) + '; ' if dims_source else '')
        + 'every number and where it came from is in hall.json.'
    )
    now = datetime.now(timezone.utc).isoformat()
    record = {
        'tool': 'scripts/place/hall.py',
        'version': 1,
        'createdAt': now,
        'glb': glb,
        'fittedGlb': glb,
        'bakedIn': True,
        'units': 'metres',
        'scaleSource': scale_source,
        'scaleNote': scale_note,
        'transform': {'position': [0, 0, 0], 'rotation': [0, 0, 0], 'scale': [1, 1, 1]},
        'size': size,
        'bounds': {'min': [-size[0] / 2, 0, -size[2] / 2], 'max': [size[0] / 2, size[1], size[2] / 2]},
        'floor': {'y': 0},
        'door': {'x': 0, 'z': geometry['door']['z_m']},
        # Just inside the big door, looking down the nave (yaw pi faces -Z).
        'spawn': {'x': 0, 'z': round(half_l - 3.0, 3), 'yaw': 3.142, 'pitch': 0, 'altY': 1.6},
        'walkableAreas': [{'minX': -half_w + 0.4, 'maxX': half_w - 0.4,
                           'minZ': -half_l + 0.4, 'maxZ': half_l + 1.0}],
        'confidence': {'verdict': 'modelled', 'note': 'a clean model, not a reconstruction'},
    }
    with open(os.path.join(out, 'place.json'), 'w') as handle:
        json.dump(record, handle, indent=2)
    hall = {
        'tool': 'scripts/place/hall.py',
        'createdAt': now,
        'what': 'A clean parametric model of a Soviet single-span crane hall (MOXIR, Charentsavan). '
                'Not a scan. Frame: Y up, metres, door end at +Z, far end at -Z, centred on x = 0.',
        'dims': dims,
        'dimsOrigin': origin,
        'dimsFiles': [os.path.abspath(p) for p in opts['dims']],
        'dimsSource': dims_source,
        'dimsNotes': dims_notes,
        'warning': ('PLACEHOLDER dimensions (guesses by eye from photographs, 2026-09-27). '
                    'Re-run with --dims <file> once the hall is measured.') if any_placeholder else
                   (None if scale_source == 'measured' else
                    'ESTIMATED from photographs, not taped: see dimsOrigin for each value, its range and confidence.'),
        'geometry': geometry,
        'triangles': triangles,
        'meshes': [o.name for o in objects],
    }
    with open(os.path.join(out, 'hall.json'), 'w') as handle:
        json.dump(hall, handle, indent=2)
    print(f'[hall] wrote {glb} — {len(objects)} meshes, {triangles} triangles, '
          f'{S:.1f} x {L:.1f} m, ridge {dims["ridge_h_m"]:.1f} m ({scale_source.upper()})')
    if any_placeholder:
        print('[hall] PLACEHOLDER dimensions — see hall.json. Re-run with --dims when measured.')
    if opts['preview']:
        preview(os.path.join(out, 'preview.png'), dims, geometry)
        print(f'[hall] preview {os.path.join(out, "preview.png")}')


if __name__ == '__main__':
    main()
