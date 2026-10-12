# What the owner's Blender does with the wheel (reference for the EDIT tool, 2026-10-13): 20 notches in/out with the pointer at the
# centre and at a corner, then far out and far in; view distance + view location after each, from inside a real Blender window.
# di-agent-screen exec blender --python scripts/nav/blender-wheel-probe.py -- /path/out.json
import bpy, json, sys
OUT = sys.argv[sys.argv.index('--') + 1] if '--' in sys.argv else '/tmp/bl.json'
res = []
def run():
    try:
        win = bpy.context.window_manager.windows[0]
        area = next(a for a in win.screen.areas if a.type == 'VIEW_3D')
        region = next(r for r in area.regions if r.type == 'WINDOW')
        rv = area.spaces.active.region_3d
        p = bpy.context.preferences.inputs
        res.append({'blender': bpy.app.version_string, 'prefs': {'zoom_to_mouse': p.use_zoom_to_mouse, 'auto_depth': p.use_mouse_depth_navigate, 'auto_persp': p.use_auto_perspective, 'orbit_selection': p.use_rotate_around_active, 'zoom_style': p.view_zoom_method}, 'clip_end': area.spaces.active.clip_end, 'clip_start': area.spaces.active.clip_start})
        def st(): return {'dist': round(rv.view_distance, 4), 'loc': [round(v, 3) for v in rv.view_location]}
        for name, (fx, fy) in {'centre': (0.5, 0.5), 'corner': (0.05, 0.05)}.items():
            mx, my = int(region.width * fx), int(region.height * fy)
            s0 = st()
            with bpy.context.temp_override(window=win, area=area, region=region):
                for _ in range(20): bpy.ops.view3d.zoom(delta=1, mx=mx, my=my, use_cursor_init=True)
            s1 = st()
            with bpy.context.temp_override(window=win, area=area, region=region):
                for _ in range(20): bpy.ops.view3d.zoom(delta=-1, mx=mx, my=my, use_cursor_init=True)
            s2 = st()
            res.append({'pointer': name, 'before': s0, 'in20': s1, 'out20': s2, 'ratio_in20': round(s0['dist'] / s1['dist'], 3), 'ratio_1.2^20': round(1.2 ** 20, 3)})
        with bpy.context.temp_override(window=win, area=area, region=region):
            for _ in range(120): bpy.ops.view3d.zoom(delta=-1)
        res.append({'out_120_more': st()})
        with bpy.context.temp_override(window=win, area=area, region=region):
            for _ in range(300): bpy.ops.view3d.zoom(delta=1)
        res.append({'in_300': st()})
    except Exception as e:
        res.append({'error': repr(e)})
    open(OUT, 'w').write(json.dumps(res))
    bpy.ops.wm.quit_blender()
    return None
bpy.app.timers.register(run, first_interval=3.0)
