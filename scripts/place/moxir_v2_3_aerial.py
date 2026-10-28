#!/usr/bin/env python3
"""MOXIR v2.3 - the free crane runs to the BACK of the hall with the six LaserCubes on it; six parallel beams over the
crowd to the entry wall above the door. The truss crane stays half behind the DJ (v2.2, N463).

Owner 2026-10-11 (~17:3x-18:0x): "there 2 cranes: one with the truss go back the DJ, other go till back and beam till the
entrance" / "almost far wall, look to photos max how much can crane go". Photos: the runway end stops were never
photographed (rigs/moxir-hall-measured-2026-10-08.json, owed); the farthest the far crane was SEEN is where it stood on
10-08, z -41 (12.8 m before the far wall). That is used; --far-z changes it when the venue says more.

Mount: sitting on the far crane's far-side girder top, the N464 way (no bar, no hang), the same offsets as B-L at z -12
(front face flush with the outer edge: z = far_z - 1.45, aperture 8.81). x: B-L's six, between the two pendant-lamp rows
(x -6 and x 0; laser-margin design.md 2.2) - a beam rising to the entry wall cannot pass UNDER the lamps, so it passes
BESIDE them. Aim: +z, parallel (the owner's v4 video), end on the entry wall's block at y END_Y: over the near crane's
girder top (8.75 + 0.25 at z 3.2) and under the roof's bottom chords (10.3 - 0.25); END_Y 9.63 sits mid-window and is
3.6 m above the door top (6.0; IEC TR 60825-3 / HSE HS(G)95 want >= 3.0).
UNVALIDATED: these margins are this script's arithmetic, not yet the laser-margin tool's run (Scene(z_c=3.2) with the far
crane at --far-z); that run is owed before any sign-off. Dark at the desk until the IEC 60825-1 sign-off, as before.

  python3 -I -B scripts/place/moxir_v2_3_aerial.py --repo . [--far-z -41] [--end-y 9.63] [--out scripts/place/rigs/moxir-v2-3-2026-10-11.json]
"""
import argparse, json, math
ap = argparse.ArgumentParser(); ap.add_argument('--repo', required=True); ap.add_argument('--far-z', type=float, default=-41.0)
ap.add_argument('--end-y', type=float, default=9.63); ap.add_argument('--point-x', type=float, default=0.0, help='x where all beams meet on the entry wall (door centre 0; hall.py centres the door at x 0); pass nan for parallel beams'); ap.add_argument('--out', default='scripts/place/rigs/moxir-v2-3-2026-10-11.json')
a = ap.parse_args()
SRC = 'scripts/place/rigs/moxir-v2-2-2026-10-11.json'; HALL = 'scripts/place/rigs/moxir-hall-2026-10-11-v11-show-park-far41.hall.json'
rig = json.load(open(f'{a.repo}/{SRC}'))
GIRDER_OUT = 1.45; AP_Y = 8.81; WALL_Z = 53.8; XS = [-4.5, -3.8, -3.1, -2.4, -1.7, -1.0]; NEAR_Z, NEAR_TOP, ROOF_CHORD, PAD = 3.2, 8.75, 10.3, 0.25
cube_z = round(a.far_z - GIRDER_OUT, 2)

def euler_for(d):
    """three.js Euler XYZ for a spot whose unrotated beam is -Y: d = Rx(a) Rz(c) (0,-1,0) -> c = asin(dx), a = atan2(-dz, -dy)."""
    c = math.asin(max(-1.0, min(1.0, d[0]))); return [round(math.atan2(-d[2], -d[1]), 4), 0.0, round(c, 4)]

cubes = sorted([f for f in rig['fixtures'] if f['type'] == 'ext-lc-ultra-mk2'], key=lambda f: f['p'][0]); assert len(cubes) == 6
tubes = []; arith = {}
for f, x in zip(cubes, XS):
    p = [x, AP_Y, cube_z]; T = [x if math.isnan(a.point_x) else a.point_x, a.end_y, WALL_Z]; v = [T[i] - p[i] for i in range(3)]; L = math.sqrt(sum(q * q for q in v)); d = [q / L for q in v]
    r = euler_for(d); b = f['laser']['beams'][0]
    f['moved_from'] = {'rig': SRC, 'p': f['p'], 'r': f['r']}; f['p'] = p; f['r'] = r
    f['position'] = (f'v2.3 (moxir_v2_3_aerial.py): SITS on the free crane\'s far-side girder top with the crane at the back of the hall (z {a.far_z}, '
                     f'the 10-08 as-found spot), x {x:.2f}, front face flush with the outer edge (z {cube_z}), aperture {AP_Y} m; aimed +z, parallel, '
                     f'to the entry wall above the door at y {a.end_y} (owner 2026-10-11: "beam till the entrance")')
    b.update({'to': T, 'length_m': round(L, 3), 'r': r, 'pan_deg': round(math.degrees(math.atan2(d[0], d[2])), 3), 'tilt_deg': round(math.degrees(math.asin(d[1])), 3),
              'ends_on': 'entry (NW) end wall (block) above the door' + ('' if math.isnan(a.point_x) else f', all six at ONE point x {a.point_x} (owner 2026-10-11: "one point above the door")'), 'end_height_m': a.end_y, 'checks': 'UNVALIDATED - laser-margin Scene run owed (v2.3)'})
    f['laser']['note_v2_3'] = 'from the back of the hall to the entry wall; dark until the IEC 60825-1 sign-off (desk laserHeld), as before.'
    f['source'] = 'scripts/place/moxir_v2_3_aerial.py (owner 2026-10-11); x from the laser-margin design (between the lamp rows)'
    tubes.append({'beam': b['id'], 'cube': f['id'], 'from': p, 'to': T, 'half_fan_deg': 1.008})
k = (a.end_y - AP_Y) / (WALL_Z - cube_z); y_near = AP_Y + k * (NEAR_Z - cube_z)
arith = {'slope': round(k, 5), 'y_at_near_crane_m': round(y_near, 2), 'over_near_girder_top_m': round(y_near - NEAR_TOP - PAD, 2), 'under_roof_chord_at_end_m': round(ROOF_CHORD - PAD - a.end_y, 2),
         'over_door_top_m': round(a.end_y - 6.0, 2), 'length_m': round(WALL_Z - cube_z, 1), 'spot_at_wall_mm': round(4 + (WALL_Z - cube_z) * 1.0, 0), 'basis': 'this script, UNVALIDATED', 'meet_x': None if math.isnan(a.point_x) else a.point_x}
rig['lasers'] = {'source': 'scripts/place/moxir_v2_3_aerial.py', 'design': 'v2.3: cubes on the free crane at the back of the hall, six parallel beams +z to the entry wall above the door',
                 'previous': rig['lasers'], 'tubes': tubes, 'signed_off': False, 'desk': rig['lasers']['desk'], 'arithmetic': arith}
rig['solids'] = [s for s in rig['solids'] if s['id'] != 'rig-crane-bar']
rig['far_crane'] = dict(rig['far_crane'], show_z_m=a.far_z, was_z_m=-12.0, drawn_by=HALL + ' (cranes_from_door_m 94.8)',
                        decision='owner 2026-10-11: the free crane runs to the back of the hall with the six cubes; z -41 = the 10-08 as-found spot, the farthest SEEN; the end stops are owed from the venue',
                        carries='the six LaserCubes SITTING on its far-side girder top (N464), aimed +z to the entry wall')
rig['hall'] = dict(rig['hall'], json=HALL, glb='/mnt/data/footage/place-moxir-hall-v11-show-park-far41-2026-10-11/hall.glb', show_glb='/mnt/data/footage/place-moxir-hall-v11-show-park-far41-2026-10-11/hall-show.glb',
                   why='hall v11: the near crane at z 3.2, the free crane at z -41 (the back); a project on v10 draws the free crane at z -12')
rig['version'] = '2.3'; rig['title'] = 'MOXIR v2.3 - the laser crane at the back of the hall, six beams to the entry wall'
rig['what'] = 'v2.2 with the free crane run to the back of the hall (z -41) carrying the six LaserCubes on its girder top, aimed +z in six parallel beams to the entry wall above the door (owner 2026-10-11). The truss crane and everything else as v2.2.'
rig['from_rig'] = SRC
json.dump(rig, open(f'{a.repo}/{a.out}', 'w'), indent=1)
print(f'wrote {a.out}: cubes z {cube_z} y {AP_Y} x {XS}; end y {a.end_y} at z {WALL_Z}; {json.dumps(arith)}')
