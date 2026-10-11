"""MOXIR v2.5 - the lights GATHERED round the DJ, mirrored about his axis, built for the dance floor's view (owner 2026-10-11:
"all there are no symmetry, lets update the places"; "dj is core and we need to build around that but keep symmetry ... we
need elite level epic show"; "balanced but not all spread"; "you know the dance floor so we need the best vision for them").

What the floor sees, looking at the DJ (z 5) from z 8..28:
  - plane 1: the 6-head fan row right behind him (unchanged, X0 +-0.5/1.5/2.5, z -5);
  - two mirrored pairs of 3-head islands behind him, a V opening backward: X0 +-5 at z -12, X0 +-12 at z -18, arching to the roof;
  - a FIELD of 38 PARs straight up behind all that, 5 rows (z -9 .. -33, 6 m apart), 8 / 8 / 8 / 8 / 6 at X0 +-3/9/15/21:
    columns of light rising behind the DJ (his example v4), 6 m grid (PAR_MIN_SPACING);
  - the 6 cubes centred on the axis on the back crane (X0 +-0.7/2.1/3.5), the hazer on the axis; nothing at the hall's sides.
Rules: moxir_v2_symmetry.py (reach, pit, walkway, columns, beams under 3 m over the public floor, crane boxes, PEAK_CAP, mirror
twins), with ONE new pen: the LIGHT FIELD behind the stage is fenced, crew only, x X0 +-22.5, z -34.5..-7.5 (1215 m2 of the
painted hot zone; the islands sit inside it). Fences are not drawn in the scene (as in v2.2). The near-crane truss ("the cut",
sloped) is NOT moved here: that is the rigging script's job (moxir_v2_cranes.py) - owed as v2.5 step 2. The cubes' aim is the
v2.4 fan, recomputed by moxir_v2_4_fan.py on this rig; the old cube-window check (a +z tube model) is off here, so the
laser-margin Scene run stays owed.
  python3 -I -B scripts/place/moxir_v2_5_gathered.py --repo . [--src rigs/moxir-v2-4...] [--out rigs/moxir-v2-5...] [--check-only]
"""
import argparse, json, math, sys, copy, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import moxir_v2_symmetry as sym
X0, ROOF_Y = sym.X0, sym.ROOF_Y
FIELD = ((X0 - 22.5, X0 + 22.5), (-16.5, -7.5))      # fenced light field behind the stage, crew only (v2.6: 2 rows, 405 m2)
SIDE_X, SIDE_Z = 14.0, (10.0, 16.0, 22.0, 28.0, 34.0, 40.0, 46.0)   # v2.6 (owner 2026-10-12: 'around dj and audience ... minimalism and lines'): two straight lines of 7 washes along the floor at X0 +-14, fenced strips 2.4 m wide
SIDE_PENS = tuple(((X0 + s * SIDE_X - 1.2, X0 + s * SIDE_X + 1.2), (SIDE_Z[0] - 2.0, SIDE_Z[-1] + 2.0)) for s in (-1, 1))
PAR_ROWS = ((-9.0, (3, 9, 15, 21)), (-15.0, (3, 9, 15)))     # 14 behind + 14 along the sides = 28 inside (owner 2026-10-11: 'inside we will use the 30 wash, 10 washes go out')
# the 10 OUTDOOR washes (owner 2026-10-11: '10 washes go the left wall out and entrance part out wall'): 2 m off the outer face, grazing up the wall
# at ~75 deg. No exterior model yet (the approach is only on the venue video) - UNVALIDATED, no checks run on them.
OUT_LEFT_X, OUT_FRONT_Z = -38.2, 55.8   # v2.6: 8 on the left wall, 2 at the door (owner 2026-10-12: 'for front door 2 is enough, move other to the wall')
OUTDOOR = [((OUT_LEFT_X, 0.31, z), (1.0, 3.7, 0.0), f'OUTDOOR, the left outer wall (x -36.2 face), 2 m out, z {z:+.0f}; grazing up the wall at ~75 deg') for z in (-36.0, -24.0, -12.0, 0.0, 12.0, 24.0, 36.0, 48.0)] + \
          [((x, 0.31, OUT_FRONT_Z), (0.0, 3.7, -1.0), f'OUTDOOR, the entrance outer wall (z 53.8 face), 2 m out, x {x:+.0f} ({"left" if x < 0 else "right"} of the door); grazing up the wall at ~75 deg') for x in (-12.0, 12.0)]
ISLANDS = (('plane 2 (the wings)', 5.0, -12.0, 'inner'), (None, 12.0, -12.0, 'outer'))   # v2.6: one line at z -12

_public_rects = sym.public_rects
def public_rects_with_field(zones):
    rects, cut = _public_rects(zones)
    out = []
    for pen in (FIELD,) + SIDE_PENS:
        nxt = []
        for (x0, x1, z0, z1) in rects:
            if z1 <= pen[1][0] or z0 >= pen[1][1] or x1 <= pen[0][0] or x0 >= pen[0][1]: nxt.append((x0, x1, z0, z1)); continue
            if x0 < pen[0][0]: nxt.append((x0, pen[0][0], z0, z1))
            if x1 > pen[0][1]: nxt.append((pen[0][1], x1, z0, z1))
            cut += 1
        rects = nxt
    return rects, cut
sym.public_rects = public_rects_with_field
sym.cube_window = lambda q, cube_x, t, half_deg: False      # the +z tube model does not describe the v2.4 fan; laser-margin run owed

def layout(rig):
    F = {f['id']: f for f in rig['fixtures']}
    heads = [f for f in rig['fixtures'] if f['type'] == 'up-b380f']
    pars = [f for f in rig['fixtures'] if f['type'] == 'up-pl5403' and f['part'] in ('hall steel', 'columns')]
    cubes = sorted([f for f in rig['fixtures'] if f['type'] == 'ext-lc-ultra-mk2'], key=lambda f: f['p'][0])
    haze = [f for f in rig['fixtures'] if f['part'] == 'haze']
    assert len(heads) == 18 and len(pars) == 38 and len(cubes) == 6, (len(heads), len(pars), len(cubes))
    plan = {}
    p1 = sorted([f for f in heads if f['part'].startswith('plane 1')], key=lambda f: f['p'][0]); e = math.radians(66.0)
    for f, u, phi in zip(p1, (-2.5, -1.5, -0.5, 0.5, 1.5, 2.5), (20, 12, 4, 4, 12, 20)):
        s = -1 if u < 0 else 1; ph = math.radians(phi)
        d = sym.unit((s * math.sin(ph) * math.cos(e), math.sin(e), -math.cos(ph) * math.cos(e)))
        plan[f['id']] = ([round(X0 + u, 2), 0.7, -5.0], sym.rot_for_dir(d), f'plane 1, the fan row behind the DJ at z -5.0, {abs(u):.1f} m {"left" if s < 0 else "right"} of the axis; up 66 deg, {phi} deg outward')
    white = sorted([f for f in heads if f['part'] == 'plane 2 (the wings)'], key=lambda f: f['p'][0])
    red = sorted([f for f in heads if f['part'] not in ('plane 1 (behind the DJ)', 'plane 2 (the wings)')], key=lambda f: f['p'][0])
    assert len(white) == 6 and len(red) == 6
    for group, (part, u, zc, nm) in zip((white, red), ISLANDS):
        for side, trio, s in (('left', group[:3], -1), ('right', group[3:], 1)):
            x = X0 + s * u
            for f, k in zip(trio, (-1, 0, 1)):
                p = [x, 0.7, zc + k]; T = (X0 + s * (u + 8.0), ROOF_Y, zc + 8.0 * k)
                d = sym.unit((T[0] - p[0], T[1] - p[1], T[2] - p[2]))
                plan[f['id']] = ([round(p[0], 2), 0.7, round(p[2], 2)], sym.rot_for_dir(d), f'{nm} island {side} (3 heads, fenced, inside the light field), {u:.0f} m {side} of the axis at z {zc:.0f}, head {k + 2} of 3; V-fan to the roof')
    plates = []
    for z, us in PAR_ROWS:
        for u in us:
            for s in (-1, 1): plates.append(((round(X0 + s * u, 2), 0.31, z), f'light field row z {z:.0f}, {u} m {"left" if s < 0 else "right"} of the axis; straight up (columns of light behind the DJ)'))
    for z in SIDE_Z:
        for sgn in (-1, 1): plates.append(((round(X0 + sgn * SIDE_X, 2), 0.31, z), f'side line {"left" if sgn < 0 else "right"} along the floor, {SIDE_X:.0f} m off the axis, z {z:+.0f} (fenced strip); straight up'))
    assert len(plates) + len(OUTDOOR) == 38, (len(plates), len(OUTDOOR))
    free = list(pars)
    for pl, prose in plates:
        f = min(free, key=lambda g: math.hypot(g['p'][0] - pl[0], g['p'][2] - pl[2])); free.remove(f)
        plan[f['id']] = (list(pl), [math.pi, 0.0, 0.0], prose)
    outdoor = {}
    for pl, d, prose in OUTDOOR:
        f = min(free, key=lambda g: math.hypot(g['p'][0] - pl[0], g['p'][2] - pl[2])); free.remove(f)
        outdoor[f['id']] = (list(pl), sym.rot_for_dir(sym.unit(d)), prose)
    plan['__outdoor__'] = outdoor
    for f, u in zip(cubes, (-3.5, -2.1, -0.7, 0.7, 2.1, 3.5)):
        plan[f['id']] = ([round(X0 + u, 2), f['p'][1], f['p'][2]], list(f['r']), f'back crane girder top, {abs(u):.1f} m {"left" if u < 0 else "right"} of the DJ axis; the v2.4 fan is recomputed on this rig')
    for f in haze: plan[f['id']] = ([X0, f['p'][1], f['p'][2]], list(f['r']), 'on the DJ axis, behind the booth')
    return plan

def main():
    ap = argparse.ArgumentParser(); ap.add_argument('--repo', default='.'); ap.add_argument('--src', default='scripts/place/rigs/moxir-v2-4-2026-10-11.json')
    ap.add_argument('--out', default='scripts/place/rigs/moxir-v2-5-2026-10-11.json'); ap.add_argument('--check-only', action='store_true'); ap.add_argument('--info-out'); ap.add_argument('--version', default='2.6')
    a = ap.parse_args()
    src = json.load(open(f'{a.repo}/{a.src}')); zones = json.load(open(f'{a.repo}/scripts/place/rigs/moxir-v2-zones-2026-10-09.json'))
    rig = copy.deepcopy(src); plan = layout(src); outdoor = plan.pop('__outdoor__')
    kit_before = sorted((f['type'], f['part'], f.get('dmx', {}).get('universe'), f.get('dmx', {}).get('address')) for f in src['fixtures'])
    for f in rig['fixtures']:
        if f['id'] in outdoor:
            p, r, prose = outdoor[f['id']]
            f['moved_from'] = {'rig': a.src, 'p': f['p'], 'r': f['r']}; f['p'], f['r'] = p, r; f['site'] = 'outdoor'; f['checks'] = 'UNVALIDATED - no exterior model (owed)'
            f['position'] = f'v2.5 (moxir_v2_5_gathered.py): {prose}. ' + (f.get('position') or '')[:120]
        if f['id'] in plan:
            p, r, prose = plan[f['id']]; f.pop('site', None)   # a unit that was outdoor in the source rig and is indoor now
            f['moved_from'] = {'rig': a.src, 'p': f['p'], 'r': f['r']}; f['p'], f['r'] = p, r
            f['position'] = f'v2.5 gathered layout (moxir_v2_5_gathered.py): {prose}. ' + (f.get('position') or '')[:120]
    kit_after = sorted((f['type'], f['part'], f.get('dmx', {}).get('universe'), f.get('dmx', {}).get('address')) for f in rig['fixtures'])
    assert kit_before == kit_after and len(rig['fixtures']) == len(src['fixtures'])
    fails, info = sym.checks(rig, plan, zones, a.repo)
    field_m2 = (FIELD[0][1] - FIELD[0][0]) * (FIELD[1][1] - FIELD[1][0]); info['outdoor'] = {'count': len(outdoor), 'checks': 'none - no exterior model, UNVALIDATED'}; info['light_field'] = {'x_m': FIELD[0], 'z_m': FIELD[1], 'm2': field_m2, 'fenced': 'crew only, not drawn'}
    print(json.dumps(info, default=str)[:500])
    if a.info_out: open(a.info_out, 'w').write(json.dumps(info, default=str, indent=1))
    for f in fails[:30]: print('FAIL', f)
    if fails: print(f'{len(fails)} fails'); sys.exit(1)
    if a.check_only: print('ok (check only)'); return
    rig['version'] = a.version; rig['date'] = '2026-10-12'; rig['title'] = f'MOXIR v{a.version} - lines round the DJ and the floor, mirrored; 10 washes outside; the outside drawn (guess)'
    rig['written_by'] = 'scripts/place/moxir_v2_5_gathered.py'
    rig['what'] = ('v2.4 with every ground unit, the 6 cubes and the haze re-placed: gathered behind and beside the DJ, mirrored about x -5.2 (owner 2026-10-11: '
                   '"balanced but not all spread", "best vision for the dance floor"): plane 1 fan row, 4 islands as a backward V, 28 PARs as a 4-row light field, 10 PARs OUTSIDE (left outer wall 6, entrance outer wall 4, unvalidated) '
                   'straight up, cubes centred. The light field (1215 m2 behind the stage) is fenced, crew only. Truss (the cut) untouched - rigging job owed. ' + json.dumps(info, default=str))
    # owner 2026-10-12 00:11 (screenshot of the entry view, the grey box in front of the camera): "delete this" -> the FOH riser box goes.
    # The lighting + laser desk and the laser E-stop still need a place (ASSUMED on that riser before) - owed, not drawn.
    rig['solids'] = [sd for sd in rig.get('solids', []) if sd.get('id') != 'rig-foh-riser']; rig.setdefault('removed', []).append({'id': 'rig-foh-riser', 'why': 'owner 2026-10-12 "delete this"', 'owed': 'a place for the desk and the laser E-stop'})
    # the OUTSIDE (owner 2026-10-12: 'i need to the out that are road and wall'): ground, the road along the left outer wall and the
    # forecourt at the door, as flat boxes. GUESS - no measurement, no exterior survey; the venue video is owed a read for the real road.
    rig['solids'] = [sd for sd in rig['solids'] if not sd['id'].startswith('rig-out-')] + [
        {'id': 'rig-out-ground', 'name': 'OUTSIDE ground (GUESS: flat, 60 m round the hall; no survey)', 'kind': 'box', 'p': [12.0, -0.15, 0.0], 'r': [0, 0, 0], 's': [220.0, 0.1, 230.0]},
        {'id': 'rig-out-road-left', 'name': 'OUTSIDE road along the left wall (GUESS: 8 m wide, 2 m off the wall, kerb 0.1 m; from memory of the venue video - owed a read)', 'kind': 'box', 'p': [-42.2, -0.05, -3.0], 'r': [0, 0, 0], 's': [8.0, 0.1, 150.0]},
        {'id': 'rig-out-forecourt', 'name': 'OUTSIDE forecourt at the entrance (GUESS: 16 m deep across the door front; owed a read of the video)', 'kind': 'box', 'p': [0.0, -0.05, 62.0], 'r': [0, 0, 0], 's': [100.0, 0.1, 16.0]}]
    # (2026-10-12 00:5x: a box 'ghost shell' as rig solids was tried and taken out the same night - the owner: 'you take ghost literally'.
    #  The envelope lives in hall.py now: --shell-alpha 0.3, hall v12.)
    rig['solids'] = [sd for sd in rig['solids'] if not sd['id'].startswith('rig-shell-')]
    rig['symmetry'] = {'axis_x_m': X0, 'plates_mirror': 'the DJ axis (plates AND aims, v2.5)', 'source': src.get('version')}
    json.dump(rig, open(f'{a.repo}/{a.out}', 'w'), indent=1); print('wrote', a.out, len(rig['fixtures']), 'fixtures,', info['moved'], 'moved')

if __name__ == '__main__': main()
