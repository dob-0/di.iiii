"""Offline previs render of a MOXIR scene: the hall GLB + every spotlight of the live document as a Blender light, haze as a
scattering volume, a fixed camera; Cycles on the GPU (owner 2026-10-12: "visually it's too bad ... camera and rendering ...
let me see"). The live viewer stays the placing tool; this is the picture to judge the show by.

Method: the document's three.js spotLight (intensity = candela x 0.02, angle = half angle, colour) becomes a Cycles spot of the
same cone; its power P = I_cd x 4 pi / 683 W, because Blender's spot "Power" is the flux a point light of that power would
radiate into the whole sphere (Blender manual, Light > Power) - so the cone's luminous flux I_cd x Omega lands at 683 lm/W.
Haze = Principled Volume (density per metre, anisotropy from the plan's atmosphere: 0.74). Looks: the chosen look's level per
unit (rigLooks.levels, keyed 'named-v1-<place>/<type>') multiplies the power; units without a level stay at 1.
Frame: three.js Y-up (x, y, z) -> Blender Z-up (x, -z, y).

  blender -b -P scripts/place/moxir_render.py -- --hall <hall-show.glb> --doc <document.json> --out <png> \\
      [--look peak] [--view floor|entrance|dj|outside] [--samples 128] [--size 1600x900] [--haze 0.015] [--exposure 0]
Limits: no lamp bodies, no people, the lasers as 0.1 deg cones (their scatter is the haze model's, unvalidated); the colour
pipeline is AgX, not a camera; render time is minutes per still on the RTX 3080 (measured per run, printed).
"""
import sys, json, math, time, argparse
import bpy
from mathutils import Vector

def dir_of(r):
    a, b, c = r
    v = (math.sin(c), -math.cos(c), 0.0)
    v = (v[0] * math.cos(b) + v[2] * math.sin(b), v[1], -v[0] * math.sin(b) + v[2] * math.cos(b))
    return (v[0], v[1] * math.cos(a) - v[2] * math.sin(a), v[1] * math.sin(a) + v[2] * math.cos(a))

def to_bl(p): return Vector((p[0], -p[2], p[1]))
def hex_rgb(h): h = h.lstrip('#'); return tuple(int(h[i:i + 2], 16) / 255.0 for i in (0, 2, 4))

VIEWS = {   # three.js Y-up: position, target, vertical fov deg
    'floor': ((-5.2, 1.7, 24.0), (-5.2, 4.0, 4.0), 50.0),
    'entrance': ((-5.2, 1.7, 50.0), (-5.2, 5.0, 4.0), 50.0),
    'dj': ((-5.2, 1.9, 2.5), (-5.2, 2.5, 30.0), 60.0),
    'outside': ((-95.0, 40.0, 120.0), (12.0, 6.0, 0.0), 45.0),
    'above': ((-5.2, 60.0, 80.0), (-5.2, 2.0, -10.0), 50.0),
}

def main():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    ap = argparse.ArgumentParser(); ap.add_argument('--hall', required=True); ap.add_argument('--doc', required=True); ap.add_argument('--out', required=True)
    ap.add_argument('--look', default='peak'); ap.add_argument('--view', default='floor'); ap.add_argument('--samples', type=int, default=128)
    ap.add_argument('--size', default='1600x900'); ap.add_argument('--haze', type=float, default=0.015); ap.add_argument('--anisotropy', type=float, default=0.74)
    ap.add_argument('--exposure', type=float, default=3.0); ap.add_argument('--no-lasers', action='store_true')
    a = ap.parse_args(argv)
    t0 = time.time()
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=a.hall)
    d = json.load(open(a.doc)); doc = d['document'] if 'document' in d else d; ents = doc['entities']
    show = next((e for e in ents if 'rigLooks' in e.get('components', {})), None)
    levels = {}
    if show:
        lk = next((l for l in show['components']['rigLooks']['looks'] if l['id'] == a.look), None)
        if lk: levels = lk.get('levels', {})
    n_lights = 0; n_off = 0
    for e in ents:
        if e.get('type') != 'spotLight': continue
        c = e['components']; L = c['light']; T = c['transform']; fx = c.get('fixture', {})
        key = (fx.get('position', '') or '').replace(' ', '-') + '/' + str(fx.get('type', ''))
        level = levels.get(key, 1.0)
        is_laser = fx.get('type') == 'ext-lc-ultra-mk2'
        if is_laser and a.no_lasers: continue
        if level <= 0: n_off += 1; continue
        cd = float(L['intensity']) / 0.02
        half = float(L['angle']); half = max(half, 0.00087)       # 0.05 deg floor for the laser lines
        data = bpy.data.lights.new(e['id'], 'SPOT')
        data.color = hex_rgb(L.get('color', '#ffffff'))
        data.energy = cd * 4 * math.pi / 683.0 * level
        data.spot_size = 2 * half; data.spot_blend = float(L.get('penumbra', 0.5)) if not is_laser else 0.0
        data.shadow_soft_size = 0.01 if is_laser else 0.08
        ob = bpy.data.objects.new(e['id'], data); bpy.context.scene.collection.objects.link(ob)
        ob.location = to_bl(T['position'])
        dv = to_bl(dir_of(T['rotation'])) - Vector((0, 0, 0))
        ob.rotation_euler = Vector((0, 0, -1)).rotation_difference(dv.normalized()).to_euler()
        n_lights += 1
    # night: the hall's lantern glazing is emissive for the day look (hall.py 'skylight'); at night it is dark glass
    for m in bpy.data.materials:
        if m.name.startswith('skylight') and m.node_tree:
            for n in m.node_tree.nodes:
                if n.type == 'BSDF_PRINCIPLED': n.inputs['Emission Strength'].default_value = 0.0
    # haze: one scattering volume over the whole building
    bpy.ops.mesh.primitive_cube_add(size=1); vol = bpy.context.active_object; vol.name = 'haze'
    vol.location = to_bl((12.0, 8.5, 0.0)); vol.scale = (97.0 / 1, 108.0 / 1, 17.0 / 1)
    m = bpy.data.materials.new('haze'); m.use_nodes = True; nt = m.node_tree
    for n in list(nt.nodes): nt.nodes.remove(n)
    out = nt.nodes.new('ShaderNodeOutputMaterial'); pv = nt.nodes.new('ShaderNodeVolumePrincipled')
    pv.inputs['Density'].default_value = a.haze; pv.inputs['Anisotropy'].default_value = a.anisotropy
    pv.inputs['Color'].default_value = (0.9, 0.9, 0.9, 1.0); nt.links.new(pv.outputs['Volume'], out.inputs['Volume'])
    vol.data.materials.append(m); vol.display_type = 'WIRE'; vol.visible_shadow = False
    # world: night
    w = bpy.data.worlds.new('night'); w.use_nodes = True; bpy.context.scene.world = w
    w.node_tree.nodes['Background'].inputs['Color'].default_value = (0, 0, 0, 1)
    # camera
    pos, tgt, fov = VIEWS[a.view]
    cam = bpy.data.cameras.new('cam'); cam.sensor_fit = 'VERTICAL'; cam.lens_unit = 'FOV'; cam.angle = math.radians(fov); cam.clip_end = 1000
    co = bpy.data.objects.new('cam', cam); bpy.context.scene.collection.objects.link(co); co.location = to_bl(pos)
    co.rotation_euler = (to_bl(tgt) - to_bl(pos)).to_track_quat('-Z', 'Y').to_euler(); bpy.context.scene.camera = co
    # render
    sc = bpy.context.scene; sc.render.engine = 'CYCLES'
    prefs = bpy.context.preferences.addons['cycles'].preferences
    for dev_type in ('OPTIX', 'CUDA'):
        try:
            prefs.compute_device_type = dev_type; prefs.get_devices()
            for dev in prefs.devices: dev.use = dev.type != 'CPU'
            sc.cycles.device = 'GPU'; break
        except Exception: continue
    sc.cycles.samples = a.samples; sc.cycles.use_denoising = True; sc.cycles.volume_step_rate = 1.0; sc.cycles.volume_max_steps = 256
    sc.cycles.volume_bounces = 1; sc.cycles.max_bounces = 6
    W, H = (int(v) for v in a.size.lower().split('x')); sc.render.resolution_x = W; sc.render.resolution_y = H; sc.render.resolution_percentage = 100
    sc.view_settings.view_transform = 'AgX'; sc.view_settings.look = 'AgX - Medium High Contrast'; sc.view_settings.exposure = a.exposure
    sc.render.image_settings.file_format = 'PNG'; sc.render.filepath = a.out
    print(f'moxir_render: {n_lights} lights ({n_off} at 0 in look {a.look!r}), view {a.view}, haze {a.haze}/m, {W}x{H} @ {a.samples} spp, device {sc.cycles.device}')
    bpy.ops.render.render(write_still=True)
    print(f'moxir_render: wrote {a.out} in {time.time() - t0:.0f} s')

if __name__ == '__main__': main()
