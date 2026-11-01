"""build_hall.py - build a modelled hall in Blender from a plan JSON (image-based modelling).

Run:  blender -b --factory-startup --python build_hall.py -- <plan.json> <textures_dir> <out_dir>
Writes <out_dir>/hall.blend and <out_dir>/hall.glb. Every size comes from the plan
(the place's DIMENSIONS.md says which are measured and which assumed); nothing here
names a production. Coordinates: x across, y along (0 = front), z up, metres.
"""
import bpy, bmesh, json, math, os, sys

argv = sys.argv[sys.argv.index('--') + 1:]
plan = json.load(open(argv[0])); TEX = argv[1]; OUT = argv[2]
os.makedirs(OUT, exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
COLS = {}


def col(name):
    if name not in COLS:
        c = bpy.data.collections.new(name); scene.collection.children.link(c); COLS[name] = c
    return COLS[name]


MATS = {}


def mat(name, color=(0.8, 0.8, 0.8), tex=None, rough=0.8, metal=0.0, emit=0.0):
    if name in MATS:
        return MATS[name]
    m = bpy.data.materials.new(name); m.use_nodes = True
    b = m.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = (*color, 1)
    b.inputs['Roughness'].default_value = rough
    b.inputs['Metallic'].default_value = metal
    if tex:
        t = m.node_tree.nodes.new('ShaderNodeTexImage')
        t.image = bpy.data.images.load(os.path.join(TEX, tex))
        m.node_tree.links.new(t.outputs['Color'], b.inputs['Base Color'])
        if emit:
            m.node_tree.links.new(t.outputs['Color'], b.inputs['Emission Color'])
    if emit:
        if not tex:
            b.inputs['Emission Color'].default_value = (*color, 1)
        b.inputs['Emission Strength'].default_value = emit
    MATS[name] = m
    return m


def box(name, x0, x1, y0, y1, z0, z1, m, tile=1.0, c='structure'):
    """Axis box, UVs in metres / tile on every face (textures keep their real scale)."""
    me = bpy.data.meshes.new(name); bm = bmesh.new()
    v = [bm.verts.new((x, y, z)) for x in (x0, x1) for y in (y0, y1) for z in (z0, z1)]
    idx = lambda i, j, k: v[i * 4 + j * 2 + k]
    faces = [((0, 0, 0), (0, 1, 0), (0, 1, 1), (0, 0, 1)), ((1, 0, 0), (1, 0, 1), (1, 1, 1), (1, 1, 0)),
             ((0, 0, 0), (0, 0, 1), (1, 0, 1), (1, 0, 0)), ((0, 1, 0), (1, 1, 0), (1, 1, 1), (0, 1, 1)),
             ((0, 0, 0), (1, 0, 0), (1, 1, 0), (0, 1, 0)), ((0, 0, 1), (0, 1, 1), (1, 1, 1), (1, 0, 1))]
    uv = bm.loops.layers.uv.new()
    for f in faces:
        face = bm.faces.new([idx(*q) for q in f])
        n = face.normal
        ax = max(range(3), key=lambda i: abs(n[i]))
        a, b = [(1, 2), (0, 2), (0, 1)][ax]
        for l in face.loops:
            co = l.vert.co
            l[uv].uv = (co[a] / tile, co[b] / tile)
    bm.normal_update(); bm.to_mesh(me); bm.free()
    o = bpy.data.objects.new(name, me); col(c).objects.link(o); o.data.materials.append(m)
    return o


def cyl(name, x, y, z0, z1, r, m, c='equipment', axis='Z', verts=16):
    bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=r, depth=abs(z1 - z0))
    o = bpy.context.active_object; o.name = name
    for cc in o.users_collection: cc.objects.unlink(o)
    col(c).objects.link(o); o.data.materials.append(m)
    if axis == 'Z':
        o.location = (x, y, (z0 + z1) / 2)
    else:  # disc standing in the x-z plane (reel) or y-z plane
        o.location = (x, y, z0); o.rotation_euler = (math.pi / 2, 0, 0) if axis == 'Y' else (0, math.pi / 2, 0)
    return o


h = plan['hall']; W, L, Hc, T = h['width'], h['length'], h['height'], h['wall_t']
M_wall = mat('wall_paint', tex='wall_white.png', rough=0.9)
M_ceil = mat('ceiling_paint', tex='ceiling.png', rough=0.95)
M_floor = mat('floor_polished_concrete', tex='floor_concrete.png', rough=0.32)
M_glass = mat('glass_front_frosted', tex='glass_front.png', rough=0.1, emit=1.2)
M_steel = mat('steel', (0.6, 0.6, 0.62), rough=0.35, metal=1.0)
M_galv = mat('galvanised_tray', (0.55, 0.56, 0.58), rough=0.5, metal=0.8)
M_black = mat('black_metal', (0.03, 0.03, 0.03), rough=0.5)
M_dark = mat('equipment_dark', (0.12, 0.12, 0.12), rough=0.45, metal=0.5)
M_wood = mat('plinth_pine', tex='wood.png', rough=0.7)
_wp = json.load(open(os.path.join(TEX, 'props_provenance.json')))['wood.png']
_wl = [((c * 0.55 * 3 / sum(_wp['mean_rgb_raw'])) ** 2.2) for c in _wp['mean_rgb_raw']]  # sRGB -> linear, albedo 0.55
M_timber = mat('timber_frame', tuple(_wl), rough=0.7)
M_frieze = mat('frieze_band', tex='frieze.png', rough=0.6)
M_white = mat('white_furniture', (0.85, 0.85, 0.83), rough=0.5)
M_leather = mat('brown_leather', (0.18, 0.08, 0.05), rough=0.5)

# --- shell: floor, ceiling, walls (closed) ---------------------------------
box('floor', 0, W, -T, L + T, -0.1, 0, M_floor, tile=2.4)
box('ceiling', 0, W, -T, L + T, Hc, Hc + 0.2, M_ceil, tile=2.0, c='ceiling')
box('wall_left', -T, 0, -T, L + T, -0.1, Hc + 0.2, M_wall, tile=1.48)
box('wall_right', W, W + T, -T, L + T, -0.1, Hc + 0.2, M_wall, tile=1.48)
f = plan['front']; gh = f['glass_h']
box('front_head', 0, W, -T, 0, gh, Hc, M_wall, tile=1.48)
g = box('glass_front', 0, W, -0.03, 0, 0, gh, M_glass, c='structure')
for l in g.data.uv_layers.active.data: pass
# glass: UV the inner face 0..1 so the frame crop covers the whole front
me = g.data
for poly in me.polygons:
    for li in poly.loop_indices:
        co = me.vertices[me.loops[li].vertex_index].co
        me.uv_layers.active.data[li].uv = (1 - co.x / W, co.z / gh) if poly.normal.y > 0.5 else (co.x / W, co.z / gh)
dc, lw = f['door_centre_x'], f['door_leaf_w']
for i, x in enumerate((dc - lw, dc, dc + lw)):          # leaf joints and patch fittings
    box(f'glass_joint_{i}', x - 0.006, x + 0.006, 0.0, 0.012, 0, gh, M_black)
    box(f'patch_fitting_{i}', x - 0.09, x + 0.09, 0.0, 0.04, 0, 0.1, M_steel)
for s in (-1, 1):                                       # pull handles (removed from the texture)
    x = dc + s * 0.07
    box(f'pull_handle_{s}', x - 0.012, x + 0.012, 0.06, 0.084, 0.85, 1.25, M_steel)
    for zz in (0.88, 1.22):
        box(f'pull_stand_{s}_{zz}', x - 0.008, x + 0.008, 0.0, 0.07, zz - 0.008, zz + 0.008, M_steel)
box('front_mullion_top', 0, W, -0.02, 0.03, gh - 0.04, gh, M_black)
ac = f['ac']
box('ac_front_wall', W / 2 - ac['w'] / 2, W / 2 + ac['w'] / 2, 0, ac['d'], ac['z'], ac['z'] + ac['h'], M_white, c='equipment')
# far end wall with an opening into the next room, and that room closed
fe = plan['far_end']; ow, oh = fe['opening_w'], fe['opening_h']
box('far_wall_l', 0, W / 2 - ow / 2, L, L + T, 0, Hc, M_wall, tile=1.48)
box('far_wall_r', W / 2 + ow / 2, W, L, L + T, 0, Hc, M_wall, tile=1.48)
box('far_wall_head', W / 2 - ow / 2, W / 2 + ow / 2, L, L + T, oh, Hc, M_wall, tile=1.48)
r = fe['room']; Y1 = L + T + r['depth']
box('next_room_floor', r['x0'], r['x1'], L, Y1, -0.1, 0, M_floor, tile=2.4)
box('next_room_ceiling', r['x0'], r['x1'], L, Y1, Hc, Hc + 0.2, M_ceil, tile=2.0, c='ceiling')
box('next_room_wall_l', r['x0'] - T, r['x0'], L, Y1 + T, -0.1, Hc + 0.2, M_wall, tile=1.48)
box('next_room_wall_r', r['x1'], r['x1'] + T, L, Y1 + T, -0.1, Hc + 0.2, M_wall, tile=1.48)
box('next_room_wall_back', r['x0'], r['x1'], Y1, Y1 + T, -0.1, Hc + 0.2, M_wall, tile=1.48)
box('next_room_wall_front_l', r['x0'], -T, L, L + T, -0.1, Hc + 0.2, M_wall, tile=1.48)
box('next_room_wall_front_r', W + T, r['x1'], L, L + T, -0.1, Hc + 0.2, M_wall, tile=1.48)
# downstand beams
b = h['beams']; y = b['every']
while y < L - 0.5:
    box(f'beam_{y:.0f}', 0, W, y - b['width'] / 2, y + b['width'] / 2, Hc - b['depth'], Hc, M_wall, tile=1.48)
    y += b['every']
# --- services: cable trays with spots and speakers, cassette units ------------
tr = plan['trays']
for i, x in enumerate(tr['x']):
    box(f'tray_{i}', x - tr['w'] / 2, x + tr['w'] / 2, tr['y0'], tr['y1'], tr['z'], tr['z'] + 0.06, M_galv, c='equipment')
    y = tr['y0'] + 0.5
    while y < tr['y1']:
        cyl(f'tray_rod_{i}_{y:.1f}', x, y, tr['z'] + 0.06, Hc, 0.005, M_galv, verts=6)
        y += 1.5
    y = tr['y0'] + 0.75
    while y < tr['y1']:
        cyl(f'spot_{i}_{y:.1f}', x + (0.1 if x < W / 2 else -0.1), y, tr['z'] - 0.22, tr['z'], 0.04, M_black, verts=12)
        y += tr['spot_every']
    y = tr['y0'] + 3.0
    while y < tr['y1']:
        sx = x + (0.12 if x < W / 2 else -0.12)
        box(f'speaker_{i}_{y:.0f}', sx - 0.1, sx + 0.1, y - 0.1, y + 0.1, tr['z'] - 0.3, tr['z'] - 0.02, M_black, c='equipment')
        y += tr['speaker_every']
cs = plan['cassettes']; s2 = cs['size'] / 2
for y in cs['y']:
    box(f'cassette_ac_{y:.0f}', W / 2 - s2, W / 2 + s2, y - s2, y + s2, Hc - cs['h'], Hc, M_white, c='equipment')
# --- exhibition: frieze bands, plinths with projectors and cameras ------------
fr = plan['frieze']
for s in fr['sides']:
    x0, x1 = (0.0, 0.025) if s == 0 else (W - 0.025, W)
    o = box(f'frieze_{s}', x0, x1, fr['y0'], fr['y1'], fr['z0'], fr['z1'], M_frieze, tile=1.0, c='exhibition')
    me = o.data  # band UV: u along the wall in 3 m repeats, v 0..1 over the band height
    for poly in me.polygons:
        for li in poly.loop_indices:
            co = me.vertices[me.loops[li].vertex_index].co
            me.uv_layers.active.data[li].uv = (co.y / 3.0, (co.z - fr['z0']) / (fr['z1'] - fr['z0']))
pl = plan['plinths']
import random
rnd = random.Random(3)
for s in pl['sides']:
    y = pl['y0']
    while y + 1.0 < pl['y1']:
        y1 = min(y + pl['seg'], pl['y1'])
        x0, x1 = (0.05, 0.05 + pl['depth']) if s == 0 else (W - 0.05 - pl['depth'], W - 0.05)
        hit = [ga for ga in plan['gantry'] if ga['x0'] < x1 and ga['x1'] > x0 and ga['y'] - 0.6 < y1 and ga['y'] + 0.6 > y]
        if hit:
            y = hit[0]['y'] + 0.6; continue
        box(f'plinth_{s}_{y:.1f}', x0, x1, y, y1, 0, pl['h'], M_wood, tile=0.32, c='exhibition')
        yy = y + 0.4
        while yy < y1 - 0.3:            # projector proxies: body, two reels, lens
            cx = (x0 + x1) / 2; z = pl['h']; k = rnd.random()
            bw, bd, bh = 0.22 + 0.1 * k, 0.3 + 0.1 * k, 0.25 + 0.1 * k
            box(f'projector_{s}_{yy:.1f}', cx - bw / 2, cx + bw / 2, yy - bd / 2, yy + bd / 2, z, z + bh, M_dark, c='equipment')
            rr = 0.11 + 0.06 * k
            for d in (-1, 1):
                cyl(f'reel_{s}_{yy:.1f}_{d}', cx, yy + d * bd * 0.45, z + bh + rr, z + bh + rr + 0.03, rr, M_dark, axis='X')
            yy += 0.75 + 0.3 * rnd.random()
        y = y1 + pl['gap']
# timber gantries with cameras hanging, a camera on a tripod inside each
for gi, ga in enumerate(plan['gantry']):
    gy = ga['y']; P = f'gantry{gi}_'
    box(P + 'base', ga['x0'] - 0.1, ga['x1'] + 0.1, gy - 0.4, gy + 0.4, 0, 0.12, M_timber, c='equipment')
    for x in (ga['x0'], ga['x1'] - 0.12):
        box(P + f'post_{x:.1f}', x, x + 0.12, gy - 0.06, gy + 0.06, 0.12, ga['h'], M_timber, c='equipment')
    box(P + 'beam', ga['x0'] - 0.1, ga['x1'] + 0.1, gy - 0.07, gy + 0.07, ga['h'], ga['h'] + 0.14, M_timber, c='equipment')
    for i, x in enumerate((ga['x0'] + 0.4, (ga['x0'] + ga['x1']) / 2, ga['x1'] - 0.4)):
        cyl(P + f'cord_{i}', x, gy, 1.5 + 0.2 * i, ga['h'], 0.004, M_black, verts=6)
        box(P + f'camera_{i}', x - 0.1, x + 0.1, gy - 0.12, gy + 0.12, 1.32 + 0.2 * i, 1.5 + 0.2 * i, M_dark, c='equipment')
    tx = (ga['x0'] + ga['x1']) / 2
    for a in range(3):
        ang = a * 2 * math.pi / 3
        o = cyl(P + f'tripod_leg_{a}', tx + 0.18 * math.cos(ang), gy + 0.18 * math.sin(ang), 0.12, 1.25, 0.012, M_dark, verts=6)
        o.rotation_euler = (0.14 * math.sin(ang), -0.14 * math.cos(ang), 0)
    box(P + 'tripod_camera', tx - 0.12, tx + 0.12, gy - 0.2, gy + 0.2, 1.25, 1.5, M_dark, c='equipment')
# front zone: desk, nook table and chairs, easel with a reel
d = plan['desk']
box('reception_desk', d['x0'], d['x1'], d['y0'], d['y1'], 0, d['h'], M_white, c='furniture')
tx, ty = plan['nook']['table']
cyl('nook_table_top', tx, ty, 0.72, 0.75, 0.45, M_white, c='furniture', verts=32)
cyl('nook_table_stem', tx, ty, 0, 0.72, 0.05, M_white, c='furniture')
cx, cy = plan['nook']['chair']
box('chair_seat', cx - 0.23, cx + 0.23, cy - 0.22, cy + 0.22, 0.43, 0.46, M_white, c='furniture')
box('chair_back', cx - 0.23, cx - 0.2, cy - 0.22, cy + 0.22, 0.46, 0.81, M_white, c='furniture')
for dx in (-0.18, 0.18):
    for dy in (-0.18, 0.18):
        cyl(f'chair_leg_{dx}_{dy}', cx + dx, cy + dy, 0, 0.43, 0.012, M_wood, c='furniture', verts=6)
ex, ey = plan['easel']
for dx in (-0.25, 0.25):
    box(f'easel_leg_{dx}', ex + dx - 0.02, ex + dx + 0.02, ey - 0.02, ey + 0.02, 0, 1.6, M_timber, c='furniture')
cyl('easel_reel', ex, ey - 0.03, 1.05, 1.08, 0.3, M_dark, c='furniture', axis='Y')
# --- light for renders only (not exported) ----------------------------------
world = bpy.data.worlds.new('world'); scene.world = world; world.use_nodes = True
world.node_tree.nodes['Background'].inputs['Color'].default_value = (0.6, 0.6, 0.62, 1)
world.node_tree.nodes['Background'].inputs['Strength'].default_value = plan.get('render', {}).get('world', 0.15)
R = plan.get('render', {})
for i, x in enumerate(tr['x']):          # track spots on the trays, aimed down at the near wall
    y = tr['y0'] + 0.75; wall_x = 0.0 if x < W / 2 else W
    while y < tr['y1']:
        ld = bpy.data.lights.new(f'track_spot_{i}_{y:.1f}', 'SPOT'); ld.energy = R.get('spot_w', 45)
        ld.spot_size = math.radians(60); ld.spot_blend = 0.6; ld.shadow_soft_size = 0.05
        lo = bpy.data.objects.new(ld.name, ld); lo.location = (x, y, tr['z'] - 0.22)
        aim = math.atan2(abs(wall_x - x), 1.4)          # spot axis towards the frieze / plinth
        lo.rotation_euler = (0, aim if wall_x < x else -aim, 0)  # Ry(+a) tips -Z towards -x; col('render_lights').objects.link(lo)
        y += tr['spot_every']
y = 1.5
while y < L + 4:                          # soft fill (daylight through the front, bounce)
    ld = bpy.data.lights.new(f'fill_{y:.0f}', 'AREA'); ld.size = 3.0; ld.energy = R.get('fill_w', 40)
    lo = bpy.data.objects.new(ld.name, ld); lo.location = (W / 2, y, Hc - 0.9); lo.rotation_euler = (math.pi, 0, 0); lo.visible_camera = False;  # faces up: lights the ceiling, bounce does the rest
    col('render_lights').objects.link(lo)
    y += 4.5
bpy.ops.file.pack_all()
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT, 'hall.blend'))
bpy.ops.export_scene.gltf(filepath=os.path.join(OUT, 'hall.glb'), export_format='GLB', export_lights=False,
                          export_cameras=False, export_apply=True)
n = sum(len(o.data.polygons) for o in scene.objects if o.type == 'MESH')
print('BUILT', len([o for o in scene.objects if o.type == 'MESH']), 'meshes', n, 'faces')
