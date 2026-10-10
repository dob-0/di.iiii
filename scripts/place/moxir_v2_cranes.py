#!/usr/bin/env python3
# moxir_v2_cranes.py — MOXIR v2, the two cranes as the owner decided them (2026-10-09, N463 / N464 / N464.4): the near crane parks
# at z 3.20, half behind the DJ, and its cut lights him (11 PL5403); the six LaserCubes SIT on the free crane's far-side girder at
# z -12 and fire -z over the crowd behind the stage to the far (SE) wall's block (design B-L).
#
#   python3 -I scripts/place/moxir_v2_cranes.py data  --repo .      # write the new labelled data files (no checks)
#   python3 -I scripts/place/moxir_v2_cranes.py build --repo .      # data + every check, the results written into the files (~3 min)
#   python3 -I scripts/place/moxir_v2_cranes.py check --repo .      # the checks only, JSON on stdout, exit 1 if a rule fails
#
# THE OWNER (2026-10-09, ledger N463, N464, verbatim): 20:51 "yes ther no crane one with the 6 lasers , go back one with trus dj 's
#   back but also light the dj not the full back half back, and 2 40w go the up where the audience entrences"; 21:1x "6 lasers will
#   go on the laser not like the trus"; asked how: "we dont need to hange laser put on the crane". 2026-10-10 16:14 (N464.4): "2 big
#   ones goes to the up where audience enter, 6 on the crane not like trus we can go and put on the crane" -> the lead's default B-L.
#
# WHAT THIS BUILDS (nothing here is designed anew: the designs are the cranes-lasers job's, chosen by the lead's match):
#   ~/work/agent-reports-2026-10-09/moxir-lead/cranes-lasers/crane-dj-light/design.md (the park z 3.20, the cut's 11 PARs, levels)
#   ~/work/agent-reports-2026-10-09/moxir-lead/cranes-lasers/laser-margin/design.md   (B-L: mounts, the one end point, the setup sheet)
#   ~/work/agent-reports-2026-10-09/moxir-lead/cranes-lasers/match/match.md            (the pair fits; no adjustment needed)
# into NEW labelled files (no old version is overwritten):
#   rigs/moxir-stage-v2-cranes-2026-10-09.json        the stage with the near crane's park z 3.20 (stage-line.mjs derives the cut there)
#   rigs/moxir-crane-cut-v2-cranes-2026-10-09.json    the cut at that park: the hl tie-off to grid z 6, its 11-PAR list
#   rigs/moxir-hall-crane-park-v2-cranes-2026-10-09.json + moxir-hall-2026-10-09-v10-show-park.hall.json (hall v10: both cranes moved)
#   rigs/moxir-lasers-on-crane-2026-10-09.json        B-L, its rule, its hold points and every margin computed here
#   rigs/moxir-v2-cranes-2026-10-09.json              the v2 rig (from v2 spread, #864): the cut, the DJ light, the cubes moved
#   rigs/moxir-aerial-far-crane-2026-10-09.json       the PREVIOUS laser table (the laser session's aerial-far-crane.json, byte copy)
#
# THE CHECKS (each one's method named; "passes these checks", never "safe"):
#   LASERS: MOXIR.md 4.0a's rule set (IEC 60825-1, IEC TR 60825-3, ILDA audience guidance, HSE HS(G)95), the form the job agreed:
#     - standing levels: a person = surface + 2.0 m; every point of the tube >= 3.0 m above the person or >= 2.5 m beside the
#       footprint; tube r = s tan(0.8 deg) + (4 mm + 1 mrad s)/2 (moxir_v1_1.tube_r). Levels: moxir_v1_1's 13, with both cranes' cabs
#       at their show park and their floors at the HIGH ends (near 6.7, free 6.15).
#     - bodies: a thing is its TRUE box + 0.25 m, the tube is r = 0.002 + s tan(1.008 deg), the gap between them >= 0.25 m (the
#       "laser margin" >= 0.25 m; reported as margin = gap - 0.25 >= 0). Every lamp (sphere max(0.25, BODY_R)), both cranes, the cut,
#       its picks and straps, the roof's bottom members at the LOW end of the truss-bottom range (10.6), the ASSUMED pendant-lamp rows
#       from 9.0, the glazed lanterns, the other cubes, #873's 40 W keep-out boxes (rigs/moxir-v2-entry-lasers-2026-10-09.json).
#     - ends: every ray of the axis + 60 rays (occlusion_lib.AREA_RINGS) at 0.8 deg AND at 1.008 deg first hits the far wall's matte
#       block (hall-block at z -53.8) on the hall v10 triangles (Moller & Trumbore 1997) + the rig's boxes; an opening in that wall
#       is a standing level for the end: the fan ends >= 2.5 m beside it or >= 3.0 m over its top. The openings: photo 007 (the
#       safe-end jambs, far_wall_openings.py) AND the hall model's centred gate: the design must pass both.
#     Every case: the free crane's top p05 / p50 / p95 (8.46 / 8.73 / 9.01, photo 007) with the apertures 0.08 m over it (ASSUMED);
#     the near crane's top 8.92 and 9.02.
#   THE 40 W BEAMS (#873) re-checked against the near crane at its new park, the cut there and its 11 PARs, in #873's own terms
#     (moxir_entry_lasers.margins) and under the cubes' body rule (reported for the lead, as the match found).
#   RIGGING: cut-count.mjs on THIS stage (line load <= 146 kg per pick, a DESIGN cap, not a rating; bridles <= 120 deg).
#   PEOPLE: raised hands 2.5 m (the cut json's clearance), the DJ on his 0.4 m step; the cut's truss, its lamp bodies, picks and
#     straps >= 0.5 m (the stage json's clear_gap_m, "the same 0.5 m the cut keeps over raised hands") from every place the public can
#     reach; the lowest lens >= 2.7 m (ISO 13857:2019 Table 2). The DJ's eyes: no lens he sees lit within 20 deg (moxir_v2_spread).
#   DJ LIGHT: E = I cos i / d^2, three.js's spot cone, the hall's shadow (moxir_v2_spread.e_on) at the room's 30 478 cd with the
#     room's level law since 28f4028d (linear), and at the EQUIVALENT spec 11 000 cd.
import argparse, copy, hashlib, json, math, os, subprocess, sys, time

for _k in ('OMP_NUM_THREADS', 'OPENBLAS_NUM_THREADS', 'MKL_NUM_THREADS'):
    os.environ.setdefault(_k, '1')          # heat rule (owner 10-09): one BLAS thread

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.dont_write_bytecode = True

DATE = '2026-10-09'                         # the decision's date (the file names)
BUILT = '2026-10-10'
R3 = lambda v: round(float(v), 3)
JD = lambda o: o.item() if hasattr(o, 'item') else (o.tolist() if hasattr(o, 'tolist') else str(o))
RIGS = 'scripts/place/rigs/'
STAGE_V11 = RIGS + 'moxir-stage-v1-1-2026-10-08.json'
CUT_V11 = RIGS + 'moxir-crane-cut-v1-1-2026-10-08.json'
RIG_SP = RIGS + 'moxir-v2-spread-2026-10-09.json'
ENTRY = RIGS + 'moxir-v2-entry-lasers-2026-10-09.json'
HALL_V9 = RIGS + 'moxir-hall-2026-10-08-v9-show-park.hall.json'
HALL_V10 = RIGS + 'moxir-hall-2026-10-09-v10-show-park.hall.json'
PARK_V2 = RIGS + 'moxir-hall-crane-park-v2-cranes-2026-10-09.json'
GLB_V10 = '/mnt/data/footage/place-moxir-hall-v10-show-park-2026-10-09/hall.glb'
GLB_V10_SHA = '1a1d47509200f81e9e281e966dd29269ccc64e82c9a0c014f55c1a996740ff2d'
STAGE_V2C = RIGS + 'moxir-stage-v2-cranes-2026-10-09.json'
CUT_V2C = RIGS + 'moxir-crane-cut-v2-cranes-2026-10-09.json'
LASERS = RIGS + 'moxir-lasers-on-crane-2026-10-09.json'
RIG_V2C = RIGS + 'moxir-v2-cranes-2026-10-09.json'
AERIAL_PREV = RIGS + 'moxir-aerial-far-crane-2026-10-09.json'
AERIAL_PREV_SHA = '56826b0dea8b8e03b9ea704434e4eb34a58052db62b6e819210dbd5d90c8fefa'
REPORTS = '~/work/agent-reports-2026-10-09/moxir-lead/cranes-lasers/'
OWNER = {'N463': '2026-10-09 20:51: "yes ther no crane one with the 6 lasers , go back one with trus dj \'s back but also light the dj not the full back half back, and 2 40w go the up where the audience entrences"',
         'N464': '2026-10-09 21:1x: "6 lasers will go on the laser not like the trus"; asked how: "we dont need to hange laser put on the crane"',
         'N464.4': '2026-10-10 16:14: "2 big ones goes to the up where audience enter, 6 on the crane not like trus we can go and put on the crane" (no direction picked: the lead\'s default is B-L, the option that passes today)'}
ASH, EMBER = '#e8e4dc', '#ff3a12'

# ====================================================================== the decided design (inputs, each with its source)
NEAR_Z = 3.20             # crane-dj-light design.md 1: the smallest move forward that keeps the cut >= 0.5 m from the press crown on the
                          # tool's line (from z 3.02) AND the 290 mm truss box (from 3.16): the first 0.05 m rail mark past both
FREE_Z = -12.0            # the owner, 2026-10-09 17:3x ("yes the crane can move"); v2 rig far_crane
NEAR_TOP = (8.92, 9.02)   # near girder top: underside 7.6 (p95 8.12) + 0.8 m depth (the brief's upper bound); 9.02 with a 0.9 m depth
NEAR_UNDER = 7.2          # its underside's safe (low) end, photo 170604 (7.2-8.12)
NEAR_TROLLEY = ((7.6, 10.2), 10.0)   # parked at the +x end (a PLAN, stage json travel), its top <= ~10.0 (8.12 + 0.9 + 1.0 ASSUMED)
NEAR_CAB_Y = (4.6, 8.12)  # cab bottom 4.6-6.7 (site layer 10-08), to the girder bottom's high end
GIRDER_DZ, GIRDER_W = 1.1, 0.7                                       # both cranes: PLACEHOLDER (hall json girders_dz_m / girder_w_m)
FREE_TOP = {'p05': 8.46, 'p50': 8.73, 'p95': 9.01}                    # free crane girder top, mid-span: photo 007 (crane_height.py), EQUIVALENT
FREE_UNDER = 7.69                                                    # its underside's low end (photo 007), EQUIVALENT
AP_UP = 0.08                                                         # the cube's aperture over its base: ASSUMED (not in our files)
FAR_GIRDER = (FREE_Z - GIRDER_DZ - GIRDER_W / 2, FREE_Z - GIRDER_DZ + GIRDER_W / 2)   # -13.45 .. -12.75 (the cubes' girder)
STAGE_GIRDER = (FREE_Z + GIRDER_DZ - GIRDER_W / 2, FREE_Z + GIRDER_DZ + GIRDER_W / 2)  # -11.25 .. -10.55
FREE_TROLLEY_X = (7.6, 10.2)                                         # H3: driven to the +x end and locked out (a SITE CHECK)
CUBE = (0.155, 0.150, 0.155)                                         # W x H x D (fixtures.json, the maker: EXACT)
# B-L (laser-margin design.md 2.1-2.2): the six cubes at 0.70 m centres on the far-side girder top, front faces flush with its outer
# edge (z -13.45), all six beams to ONE end point on the far wall's block, left of its gate. v1.1's ids and colours kept.
CUBES = [('rig-lasercube-cut-01', 'ash white', ASH, -4.50), ('rig-lasercube-cut-02', 'ash white', ASH, -3.80),
         ('rig-lasercube-cut-04', 'ember red', EMBER, -3.10), ('rig-lasercube-cut-05', 'ember red', EMBER, -2.40),
         ('rig-lasercube-cut-03', 'ash white', ASH, -1.70), ('rig-lasercube-cut-06', 'ash white', ASH, -1.00)]
LASER_END = (-4.031, 9.181, -53.8)
LASER_END_AFTER_H1 = (-4.162, 9.019, -53.8)                          # the re-aim once H1 confirms photo 007 (design 2.4), NOT used yet
# the cut's 11 PARs (crane-dj-light design.md 4): u along the line, how it is mounted, its part, where it is aimed
CUT_LAMPS = [
    ('rig-par-cut-01', -5.0, 'up', 'cut up', None, 'rig-par-cut-01'),
    ('rig-par-cut-02', -4.0, 'down', 'cut down', None, 'rig-par-cut-02'),
    ('rig-par-cut-03', -3.0, 'up', 'cut up', None, 'rig-par-cut-03'),
    ('rig-par-cut-04', -2.0, 'down', 'cut down', None, 'rig-par-cut-04'),
    ('rig-par-cut-05', -1.5, 'aim', 'dj back', (-5.2, 1.95, 4.25), 'rig-par-cut-05'),
    ('rig-par-cut-06', 0.0, 'up', 'cut up', None, 'rig-par-cut-06'),
    ('rig-par-cut-07', 1.0, 'aim', 'dj back', (-5.2, 1.95, 4.25), 'rig-par-cut-07'),
    ('rig-par-cut-08', 2.0, 'down', 'cut down', None, 'rig-par-cut-08'),
    ('rig-par-cut-09', 3.0, 'up', 'cut up', None, 'rig-par-cut-09'),
    ('rig-par-cut-10', 3.5, 'down', 'cut down', None, 'rig-par-cut-10'),
    ('rig-par-cut-11', 4.5, 'aim', 'dj kicker', (-5.2, 2.0, 4.3), 'rig-par-planes-25'),
]
CUT_PLACES = [l[1] for l in CUT_LAMPS]
HUNG_LENS, STANDING_LENS = 0.33, 0.39       # a hung lens 0.33 m under the bottom chord, a standing one 0.39 m over it (moxir_v2.cut_pars)
# the levels (crane-dj-light design.md 5; the room's level law since 28f4028d is linear): ash in peak, ember in dark
LEVELS = {'peak': {'stage key': 0.132, 'dj back': 0.026, 'dj kicker': 0.044},
          'dark': {'stage key': 0.423, 'dj back': 0.082, 'dj kicker': 0.141}}
LEVELS_WHY = ('crane-dj-light design.md 5: the DJ\'s face (eye-height plane facing the crowd) 20 lx, his head top 160 lx, his house-right cheek '
              '25 lx, in both looks, as the room draws them (30 478 cd, a look level drawn once since 28f4028d). At the EQUIVALENT spec 11 000 cd the '
              'same faders give 2.77x less; set them on site with a lux meter (owed).')
PEN_STRIP = {'x_m': [-11.6, -10.5], 'z_m': [1.75, 4.65],
             'why': 'the cut\'s LOW end (x -11.04, bottom chord 2.89 m) is 0.39 m over raised hands where it passes the stage pen\'s edge (x -10.5): under the 0.5 m '
                    'rule for 0.54 m of the line (u -6.25..-5.69). The transformer (x -11..-9.5, z -4..4, z LOW) and the column-foot cabinets stand there; the pen\'s '
                    'barrier (owed, MOXIR v2 eyes) takes in this bay, from the column face to the pen, for the bridge\'s width, so no one of the public stands under it'}
PEOPLE_RULE = {'raised_hands_m': 2.5, 'clear_m': 0.5, 'reach_m': 2.7}
PICK_CAP_KG = 146.0
LASER_GAP_MIN = 0.25
KO_GAP_MIN = 0.25


def sha256(p):
    h = hashlib.sha256()
    with open(p, 'rb') as fh:
        h.update(fh.read())
    return h.hexdigest()


def rd(repo, p):
    return json.load(open(os.path.join(repo, p)))


def wr(repo, p, d):
    with open(os.path.join(repo, p), 'w') as fh:
        json.dump(d, fh, indent=1, default=JD, ensure_ascii=False)
        fh.write('\n')


def node(repo, *args):
    r = subprocess.run(['node'] + list(args), capture_output=True, text=True, cwd=repo)
    if r.returncode:
        raise SystemExit('node %s failed: %s' % (' '.join(args), r.stderr.strip()[-2000:]))
    return json.loads(r.stdout)


# ====================================================================== 1. the stage at the new park
def stage_doc(repo):
    S = copy.deepcopy(rd(repo, STAGE_V11))
    S['title'] = 'MOXIR v2 cranes - the stage of v1.1 with the near crane parked at z 3.20, the cut half behind the DJ, lighting him (owner N463, 2026-10-09)'
    S['writtenAt'] = BUILT
    S['status'] = ('PLAN for the owner\'s look, built on a scratch stack only. Not on dev, not on the installed di. Every crane height is from PHOTOS; nothing is '
                   'taped. Passes the checks written in rigs/moxir-v2-cranes-2026-10-09.json review (not "safe"): the rigger, the crane\'s owner and the site checks decide.')
    S['owner_2026_10_09'] = OWNER['N463']
    S['basedOn'] = STAGE_V11 + ' (v1.1, 2026-10-08): everything kept except the crane park, its hall record and the cut file'
    S['source_design'] = REPORTS + 'crane-dj-light/design.md (the park, the half-back reading, the 11 PARs); ' + REPORTS + 'match/match.md (the pair with B-L fits)'
    c = S['crane']
    c['z_m'] = NEAR_Z
    c['z_m_v1_1'] = 0.15
    c['candidates_m'] = [0.15, 2.65, 2.9, 3.15, 3.2, 3.4, 3.65, 4.25]
    c['hall_overlay'] = PARK_V2
    c['hall_record'] = HALL_V10
    c['decision_v1_1'] = c.pop('decision')
    c['decision'] = {
        'date': DATE, 'by': 'the owner (N463), the design chosen by the MOXIR lead\'s match (crane-dj-light + B-L, 2026-10-10); owner to look',
        'rule': 'the owner\'s: "go back one with trus dj \'s back but also light the dj not the full back half back". Read (crane-dj-light 3): the cut stays behind his '
                'eye, not flipped, LOW house left (10-07), but no longer a backdrop 4.15 m behind it: 1.10 m behind, the bridge straddling the step\'s back edge, nothing '
                'hung over the step, and three of its lamps light him from behind and above. The literal "half the bridge over the step" (z 3.65) is the alternative: '
                'its hung lamps would hang over the step.',
        'chose': 'near crane z 3.20 (from 0.15, +3.05 m); the cut axis x -5.0 unchanged; tie-offs hl -> column x -11.6 grid z 6 at 3.04 m (79 deg off the plane), '
                 'hr -> column x +11.6 grid z -6 at 6.15 m (40 deg) as committed',
        'why': 'the smallest move forward that keeps the cut >= 0.5 m from the press crown on BOTH measures: the tool\'s bottom-chord line passes from z 3.02, the '
               '290 mm truss box from 3.16; 3.20 is the first 0.05 m rail mark past both (crown EQUIVALENT +-20 %: tape it). Past z 3.49 the hung lamps hang over the '
               'step; past 4.25 the front girder runs under the z 6 pendant-lamp row; past 5.0 the cab meets gallery 1.',
        'table': [
            {'z_m': 0.15, 'riser_gap_m': 2.68, 'crown_line_box_m': [0.70, 0.58], 'hung_front_z_m': 0.31, 'over_step': False, 'eye_in_front_m': 4.15},
            {'z_m': 2.65, 'riser_gap_m': 0.18, 'crown_line_box_m': [0.27, 0.27], 'hung_front_z_m': 2.81, 'over_step': False, 'eye_in_front_m': 1.65},
            {'z_m': 2.90, 'riser_gap_m': -0.07, 'crown_line_box_m': [0.40, 0.31], 'hung_front_z_m': 3.06, 'over_step': False, 'eye_in_front_m': 1.40},
            {'z_m': 3.15, 'riser_gap_m': -0.32, 'crown_line_box_m': [0.61, 0.49], 'hung_front_z_m': 3.31, 'over_step': False, 'eye_in_front_m': 1.15},
            {'z_m': 3.20, 'riser_gap_m': -0.37, 'crown_line_box_m': [0.66, 0.53], 'hung_front_z_m': 3.36, 'over_step': False, 'eye_in_front_m': 1.10},
            {'z_m': 3.40, 'riser_gap_m': -0.57, 'crown_line_box_m': [0.84, 0.71], 'hung_front_z_m': 3.56, 'over_step': False, 'eye_in_front_m': 0.90},
            {'z_m': 3.65, 'riser_gap_m': -0.82, 'crown_line_box_m': [1.08, 0.94], 'hung_front_z_m': 3.81, 'over_step': True, 'eye_in_front_m': 0.65},
            {'z_m': 4.25, 'riser_gap_m': -1.42, 'crown_line_box_m': [1.67, 1.53], 'hung_front_z_m': 4.41, 'over_step': True, 'eye_in_front_m': 0.05}],
        'table_source': REPORTS + 'crane-dj-light/design.md 1 (stage-line.mjs --evaluate + crown.mjs, segmentBoxGap)',
        'travel': 'from z 42.5 (as found) to 3.20: 39.3 m along the runway under the pendant lamps (lowest 9.0-10.0 m over z -5..25): park the trolley at the +x end '
                  '(x 7.6-10.2) and look at the lamps along the path before it moves. It parks between the z 0 and z 6 lamp rows (front girder 1.05 m short of z 6).',
        'joint': 'the bridge stops 0.60 m short of the expansion joint at z 0 (end trucks z 0.60..5.80, ASSUMED +-2.6 m): it neither crosses the rail break nor parks on it.',
        'riser_rule': 'the old "behind the riser" rule (truss.behind_m 1.32) is retired by N463 on purpose: the bridle clamps (z 4.02, 7.45 m up) now sit 0.37 m over the '
                      'step\'s back edge; nothing HANGS over the step (the hung lamps\' front z 3.36 < the step\'s back edge 3.65)',
    }
    t = S['truss']
    t['cut'] = CUT_V2C
    t['crane_z_m'] = NEAR_Z
    t['crane_z_why'] = ('the park is the design\'s own z (N463 "half back"), not "behind_m behind the riser" (the backdrop rule of v1.1) and not "over the DJ within 1 m": '
                        'rig-lib stageFrame truss_crane_z_m. The hall record must hold a bridge there (hall v10, cranes_from_door_m 50.8)')
    t['behind_m_v1_1'] = t.pop('behind_m')
    t['behind_why_v1_1'] = t.pop('behind_why')
    t['half_back'] = 'the cut\'s plane z 3.20 is 1.10 m behind the DJ\'s eye (z 4.30, the step 0.4 + 1.63 m, Pheasant & Haslegrave, Bodyspace 3rd ed.); 4.15 m before'
    t['pen_condition'] = PEN_STRIP
    return S


def cut_doc(repo, lamps=None):
    C = copy.deepcopy(rd(repo, CUT_V11))
    C['cut'] = 'moxir-crane-cut-v2-cranes-2026-10-09'
    C['title'] = 'The cut for MOXIR v2 cranes - the same 12 m line (LOW house left, HIGH house right, not flipped) at the near crane\'s park z 3.20, half behind the DJ, 11 PL5403 that light him'
    C['writtenAt'] = BUILT
    C['owner_2026_10_09'] = OWNER['N463']
    C['basedOn'] = CUT_V11 + ' - truss, picks, hoist, drop stack, bridle, safety, clearance and motion copied unchanged (the owner\'s shape). What differs: the crane z (3.20), the hl tie-off (grid z 6) and the lamp list (11, three of them on the DJ).'
    C['status'] = C['status'].replace('Scratch-only plan for the owner\'s look (2026-10-07)', 'Scratch-only plan for the owner\'s look (2026-10-10, v2 cranes)')
    r = C['rigging']
    hl = next(x for x in r['tieoffs'] if x['id'] == 'hl')
    hl['grid_z_m'] = 6
    hl['what'] = ('house-left (LOW) end, level at its own height (3.04 m), to the nave column at x -11.6 (inner face) on grid line z 6 - 79 deg off the bridge\'s plane, '
                  '2.86 m long, 0.54 m over the transformer (its z LOW), 0.97 m from the nearest lamp (rig-par-planes-19); a 2 t LC ratchet strap (EN 12195-2) or a 6 mm '
                  'steel with a turnbuckle')
    hl['y_why'] = ('crane-dj-light design.md 8 (ties.mjs over stage-line.mjs anchorWindows, 4 grid lines, at z 3.20): every house-left option toward -z (z -6, -0.5, '
                   '0.5) crosses the v2 wing head rig-beam-planes-14 (its bracket on column x -12 z 0.5 at 3.0-3.7 m: gap -0.06 m). The cost: the strap now pulls toward '
                   '+z, the audience side; the rigger decides.')
    hr = next(x for x in r['tieoffs'] if x['id'] == 'hr')
    hr['what'] = ('house-right (HIGH) end, level at its own height (6.15 m), to the nave column at x +11.6 on grid line z -6 - 40 deg off the bridge\'s plane, 14.38 m '
                  'long, 0.55 m from the press crown, >= 1.0 m from the crane cab (z 2.2-4.2; the strap passes it at z <= -2.9); same strap or steel')
    r['tieoffs_why'] = 'v2 cranes park z 3.20 (crane-dj-light design.md 8, tieoff_check.py against the rig\'s units): hl moved to grid z 6 (the -z anchors cross a v2 wing head), hr as committed'
    C['crane_z_m'] = NEAR_Z
    if lamps is not None:
        C['pars'] = lamps
        C['pars_why'] = ('crane-dj-light design.md 4: #864\'s 10 plus #864\'s pit-stand key PAR (the kit stays at 50 PL5403). Three light the DJ: a crossed back pair '
                         '(u -1.5 / +1.0, hung, aimed at his head and shoulders, 47 / 57 deg up) and a kicker (u +4.5, hung, from house right, 35 deg up). The other '
                         'eight keep the cut\'s look: 4 hung straight down, 4 standing straight up (through the 1.5 m gap between the girders, PLACEHOLDER). Every u '
                         'is a clamp point (cut-count.mjs). Nothing hangs over the transformer (u <= -4.66) or over the step (front z 3.36 < 3.65).')
    return C


def cut_lamps(truss, slope_deg, axis_x):
    """the 11 PARs at the cut as stage-line.mjs derives it at z 3.20: x(u) = axis + u cos(slope), the bottom chord = trim + u sin(slope)"""
    import numpy as np
    th = math.radians(slope_deg)
    axis = axis_x                                                       # the stage json's truss.axis_x_m (-5.0): u 0 sits there
    out = []
    for fid, u, mount, part, aim, was in CUT_LAMPS:
        x = axis + u * math.cos(th)
        bot = truss['trim_m'] + u * math.sin(th)
        y = bot + STANDING_LENS if mount == 'up' else bot - HUNG_LENS
        p = [R3(x), R3(y), NEAR_Z]
        if mount == 'up':
            d = [0.0, 1.0, 0.0]
        elif mount == 'down':
            d = [0.0, -1.0, 0.0]
        else:
            v = np.asarray(aim, float) - np.asarray(p, float)
            d = [R3(q) for q in v / np.linalg.norm(v)]
        how = {'up': 'standing on the top chords, half coupler + safety, straight up between the bridge\'s girders',
               'down': 'hung under the bottom chords, half coupler + safety, a shaft straight down',
               'aim': 'hung under the bottom chords, half coupler + safety, aimed at the DJ (%s)' % ('his head and shoulders, from behind' if part == 'dj back' else 'his head, from house right and behind')}[mount]
        out.append({'id': fid, 'u_m': u, 'mount': mount, 'part': part, 'p': p, 'dir': d, 'aim_at': list(aim) if aim else None, 'lens_deg': 15,
                    'position': 'the cut at z %.2f, u %+.1f m: %s' % (NEAR_Z, u, how), 'was': was})
    return out


def derive(repo):
    """the cut at z 3.20 as the repo's own tools derive it (stage-line.mjs on the new stage json; cut-count.mjs with the 11 places)"""
    ev = node(repo, 'scripts/rigbuild/stage-line.mjs', '--evaluate', '--design', STAGE_V2C)
    cc = node(repo, 'scripts/place/cut-count.mjs', '--n', str(len(CUT_PLACES)), '--places', ','.join('%g' % u for u in CUT_PLACES), '--design', STAGE_V2C)
    return ev, cc


# ====================================================================== 2. the lasers (B-L)
def cube_aperture(x, top='p50'):
    return [x, R3(FREE_TOP[top] + AP_UP), FAR_GIRDER[0]]


def pan_tilt(p, T):
    v = [T[i] - p[i] for i in range(3)]
    ln = math.sqrt(sum(c * c for c in v))
    return math.degrees(math.atan2(v[0], -v[2])), math.degrees(math.asin(v[1] / ln)), ln


def laser_units():
    out = []
    for cid, colour, hexc, x in CUBES:
        p = cube_aperture(x)
        pan, tilt, ln = pan_tilt(p, LASER_END)
        out.append({'id': cid, 'colour': colour, 'hex': hexc, 'x_m': x, 'aperture_m': {k: cube_aperture(x, k) for k in FREE_TOP}, 'p': p, 'to': list(LASER_END),
                    'pan_deg_from_minus_z_plus_toward_plus_x': round(pan, 3), 'tilt_deg_above_level': round(tilt, 3), 'range_m': round(ln, 3)})
    return out


def rot_for_dir(d):
    import lights_beta_options as L
    return L.rot_for_dir(d)


# ====================================================================== 3. the v2 rig (from v2 spread, #864)
def rig_doc(repo, lamps, units, cc, ev):
    import numpy as np
    SP = rd(repo, RIG_SP)
    T = copy.deepcopy(SP)
    by = {f['id']: f for f in T['fixtures']}
    moves = []
    pit = by.pop('rig-par-planes-25')
    T['fixtures'] = [f for f in T['fixtures'] if f['id'] != 'rig-par-planes-25']
    for q in lamps:
        if q['id'] in by:
            f = by[q['id']]
        else:                                                          # cut-11: the pit-stand key PAR, its DMX slot and its record
            f = copy.deepcopy(pit)
            f['id'] = q['id']
            f.pop('aim_at', None)
            T['fixtures'].append(f)
            by[f['id']] = f
        rec = {'id': q['id'], 'was': q['was'], 'from': {'p': (pit if q['was'] == 'rig-par-planes-25' else f)['p'], 'part': (pit if q['was'] == 'rig-par-planes-25' else f)['part']}}
        f.update({'p': q['p'], 'r': [R3(v) for v in rot_for_dir(np.asarray(q['dir'], float))], 'part': q['part'], 'position': q['position'], 'layer': 'the cut',
                  'colour': ASH, 'angle_rad': 0.1309, 'lit_column_m': None, 'lux_on_steel_median': None})
        f.pop('moved_from', None)
        if q['aim_at']:
            f['aim_at'] = q['aim_at']
        else:
            f.pop('aim_at', None)
        f['moved_from'] = rec['from']
        if q['was'] != q['id']:
            f['was'] = q['was']
        rec['to'] = {'p': f['p'], 'part': f['part']}
        moves.append(rec)
    # the six cubes: sitting on the far-side girder, one static beam each to the one end point (B-L)
    cubes = {f['id']: f for f in T['fixtures'] if f['type'] == 'ext-lc-ultra-mk2'}
    for u in units:
        f = cubes[u['id']]
        old = {'p': f['p'], 'to': f['laser']['beams'][0]['to']}
        d = np.asarray(u['to'], float) - np.asarray(u['p'], float)
        d /= np.linalg.norm(d)
        f['p'] = u['p']
        f['r'] = [R3(v) for v in rot_for_dir(d)]
        f['colour'] = u['hex']
        f['position'] = ('SITS on the free crane\'s far-side girder top at z -12 (owner N464: "put on the crane"), x %.2f, front face flush with the girder\'s outer edge '
                         '(z -13.45), aperture %.2f m (top p50 8.73 + 0.08 ASSUMED; checked over 8.54-9.09); one static beam -z over the crowd behind the stage to the far '
                         '(SE) wall\'s block at (%.3f, %.3f): B-L, rigs/moxir-lasers-on-crane-2026-10-09.json' % (u['x_m'], u['p'][1], LASER_END[0], LASER_END[1]))
        b = f['laser']['beams'][0]
        keep = {k: b[k] for k in ('id', 'off', 'duty')}
        f['laser']['beams'] = [dict(keep, to=list(LASER_END), length_m=R3(u['range_m']), r=[R3(v) for v in rot_for_dir(d)],
                                    pan_deg=u['pan_deg_from_minus_z_plus_toward_plus_x'], tilt_deg=u['tilt_deg_above_level'], ends_on='far (SE) end wall (block)',
                                    end_height_m=LASER_END[1], checks='rigs/moxir-lasers-on-crane-2026-10-09.json beams[%s]' % u['id'])]
        f['laser']['moved_from'] = old
        f['laser'].pop('note_v1_1', None)
        f['laser']['signed_off'] = False
        f['laser']['note_v2_cranes'] = 'B-L (laser-margin design, 2026-10-10). Dark until the IEC 60825-1 sign-off: the desk writes 0 to every laser channel (deskLookValues.js laserHeld).'
        f['source'] = LASERS + ' (B-L: laser-margin design.md, checked by scripts/place/moxir_v2_cranes.py)'
    # solids: the laser bar goes (nothing hangs, N464); the two far-crane boxes go (hall v10 draws the free crane at z -12 itself)
    T['solids'] = [s for s in T['solids'] if s['id'] not in ('rig-crane-bar', 'rig-far-crane-z-12-girder-a', 'rig-far-crane-z-12-girder-b')]
    T['far_crane'] = {'show_z_m': FREE_Z, 'was_z_m': -41.0, 'top_m': FREE_TOP, 'underside_used_m': FREE_UNDER, 'drawn_by': HALL_V10 + ' (hall v10: cranes_from_door_m 66.0)',
                      'decision': SP['far_crane']['decision'], 'carries': 'the six LaserCubes SITTING on its far-side girder top (N464), no bar, no hang',
                      'trolley': 'driven to the +x end (x 7.6-10.2) and locked out, the hook wound up and locked (hold point H3)',
                      'owed': ['the crane seen moving to z -12, its end trucks clear (H3)', 'its inspection and lock-out in the show position (MOXIR.md 5.2)',
                               'its top over x -5..-0.5 seen: the girder\'s top plate, the trolley rail and clips, the festoon track on posts (photo 007), a strap point for each cube (H2)']}
    T['near_crane'] = {'show_z_m': NEAR_Z, 'was_z_m': 0.15, 'drawn_by': HALL_V10 + ' (cranes_from_door_m 50.8)', 'stage': STAGE_V2C,
                       'decision': 'N463: the cut half behind the DJ, lighting him (crane-dj-light design)'}
    T['lasers'] = {'source': LASERS, 'design': 'B-L (laser-margin design.md, 2026-10-10; the lead\'s default, N464.4)', 'previous': AERIAL_PREV + ' (v1.1 aerial, #844: the cubes on a bar 2.49 m under the bridge, aimed +z to the entry wall; superseded by N464)',
                   'tubes': [{'beam': cubes[u['id']]['laser']['beams'][0]['id'], 'cube': u['id'], 'from': u['p'], 'to': list(LASER_END), 'half_fan_deg': 1.008} for u in units],
                   'signed_off': False, 'desk': 'the desk writes 0 to every laser channel until the IEC 60825-1 sign-off (deskLookValues.js laserHeld)'}
    # looks: the new parts and the stage key's new level (the room draws a look level once since 28f4028d)
    for lk in T['looks']:
        p = lk['parts']
        col = ASH if lk['id'] == 'peak' else EMBER
        for part, lev in LEVELS[lk['id']].items():
            p[part] = [col, lev]
    T['cut'] = {'pars': len(lamps), 'places_u_m': [l['u_m'] for l in lamps], 'crane_z_m': NEAR_Z, 'file': CUT_V2C, 'stage': STAGE_V2C,
                'picks_kg': [p['line_kg'] for p in cc['picks']], 'on_bridge_kg': [p['on_bridge_kg'] for p in cc['picks']], 'worst_pick_kg': cc['worst_pick_kg'], 'headroom_kg': cc['headroom_kg'],
                'source': 'node scripts/place/cut-count.mjs --n %d --places %s --design %s' % (len(CUT_PLACES), ','.join('%g' % u for u in CUT_PLACES), STAGE_V2C),
                'why': 'crane-dj-light design.md 4: #864\'s 10 + the pit-stand key PAR; three light the DJ (dj back x 2, dj kicker)'}
    T['stage'] = dict(T['stage'], design=STAGE_V2C)
    T['requires'] = dict(T['requires'], stage_front=('a column bracket (3 PARs, 5.1-6.0 m) on the nave column x -12 z 12 (the venue\'s OK, the rigger\'s check owed); the pit '
                                                     'stand is gone (its PAR is the cut\'s kicker). Levels are set for the room\'s PAR (30 478 cd, drawn linear since 28f4028d): '
                                                     'with the spec 11 000 cd the same lx needs the fader x 2.77; the back pair runs at 2.6-8.2 %: fade-test the PL5403 low on the '
                                                     'fixture test day (crane-dj-light 5)'))
    for c in T['cues']:
        c['name'] = c['name'].replace('B tuned + stage + lasers', 'v2 cranes: the cut on the DJ + lasers on the crane')
    T.update({'snapshot': 'moxir-v2-cranes-%s' % DATE, 'version': 'MOXIR v2 cranes', 'title': 'MOXIR v2 cranes - the cut half behind the DJ and lighting him, the six cubes on the free crane',
              'what': ('v2 spread (#864) with the owner\'s cranes (N463, N464): the near crane parked at z 3.20 so the cut hangs 1.10 m behind the DJ\'s eye and three of its 11 '
                       'PARs light him (back pair + kicker; the pit stand gone, its PAR is the kicker); the six LaserCubes SIT on the free crane\'s far-side girder at z -12 '
                       'and fire one static beam each -z over the crowd behind the stage to one point on the far (SE) wall\'s block (B-L). Everything else of v2 spread kept.'),
              'written_by': 'scripts/place/moxir_v2_cranes.py build (from %s)' % RIG_SP, 'date': DATE, 'built': BUILT, 'from_rig': RIG_SP, 'owner': OWNER,
              'hall': {'json': HALL_V10, 'glb': GLB_V10, 'glb_sha256': GLB_V10_SHA, 'show_glb': GLB_V10.replace('hall.glb', 'hall-show.glb'),
                       'why': 'the room must draw hall v10 (both cranes moved); a project still on v9 draws the free crane at z -41 and the near crane at 0.15'}})
    T['review'] = {'from': RIG_SP, 'moves': moves}
    return T


def data(repo):
    """write the new labelled data files (the checks come in `build`)"""
    if sha256(os.path.join(repo, AERIAL_PREV)) != AERIAL_PREV_SHA:
        raise SystemExit('%s is not the laser session\'s aerial-far-crane.json (sha256 differs)' % AERIAL_PREV)
    if sha256(GLB_V10) != GLB_V10_SHA:
        raise SystemExit('%s is not the pinned hall v10 GLB' % GLB_V10)
    wr(repo, STAGE_V2C, stage_doc(repo))
    wr(repo, CUT_V2C, cut_doc(repo))                       # first without lamps: stage-line derives the truss from it
    ev, cc = derive(repo)
    lamps = cut_lamps(ev['truss'], rd(repo, CUT_V2C)['truss']['slope_deg'], rd(repo, STAGE_V2C)['truss']['axis_x_m'])
    wr(repo, CUT_V2C, cut_doc(repo, lamps))
    units = laser_units()
    wr(repo, LASERS, lasers_doc(repo, units))
    wr(repo, RIG_V2C, rig_doc(repo, lamps, units, cc, ev))
    return ev, cc, lamps, units


def lasers_doc(repo, units, checks=None):
    D = {'what': 'MOXIR v2 cranes: the six LaserCube Ultra Mk2 (7.5 W) SIT on the free crane\'s far-side girder at z -12 and fire one static beam each -z over the crowd '
                 'behind the stage to ONE point on the far (SE) wall\'s block (design B-L)',
         'owner': OWNER, 'date': DATE, 'built': BUILT, 'written_by': 'scripts/place/moxir_v2_cranes.py',
         'design': {'source': REPORTS + 'laser-margin/design.md (B-L), judged 7/10 (judge-laser-safety/verdict.md: the only design consistent with the record), matched with the near '
                              'crane at z 3.20 (match/match.md: fits, margin to that system +13.4 m)', 'name': 'B-L'},
         'previous': {'file': AERIAL_PREV, 'sha256': AERIAL_PREV_SHA,
                      'what': 'v1.1 aerial (#844, the laser session\'s aerial-far-crane.json, byte copy): the cubes on a bar 2.49 m under the free crane (y 5.2), aimed +z over the '
                              'audience to the entry wall. Superseded by N464 ("put on the crane", no hang): kept as the previous version.'},
         'units': [{k: v for k, v in u.items() if k != 'hex'} for u in units],
         'mount': {'on': 'the free crane\'s FAR-side girder top (z -13.45..-12.75, PLACEHOLDER), outboard of the trolley rail, front faces flush with the girder\'s outer (far-wall) edge, facing -z',
                   'spacing_m': 0.70, 'spacing_why': 'each beam\'s tube passes the next cube\'s body >= 0.25 m (laser margin)',
                   'aperture_over_base_m': AP_UP, 'aperture_basis': 'ASSUMED (not in our files; the maker\'s output window is 30 x 18 mm on the front face)',
                   'free_crane_top_m': FREE_TOP, 'top_basis': 'photo 007, crane_height.py (Criminisi, Reid & Zisserman 2000), EQUIVALENT; the design is checked at p05, p50 and p95',
                   'fix': 'the maker\'s tilt-lock screws + the safety eye bolt to a steel strap round the girder\'s top flange (the rigger\'s detail, owed)'},
         'aim': {'end_m': list(LASER_END), 'why': 'the one far-wall point with the largest worst margin over the six beams, the three top heights and both readings of the far gate (compass search, Hooke & Jeeves 1961; laser-margin design.md 10)',
                 'on_site': 'set on a target mark on the far wall at (x -4.03, y 9.18), measured from the x -12 column line and the floor; the six-beam worst stays within 0.05 m of the design for an end in x -4.43..-3.99, y 9.14..9.24',
                 'after_h1': {'end_m': list(LASER_END_AFTER_H1), 'when': 'only once H1 confirms photo 007 (the model\'s centred gate ruled out): worst +0.325 m (laser-margin design 2.4); not used now'}},
         'rule': {'text': 'MOXIR.md 4.0a: a person = surface + 2.0 m; the beam >= 3.0 m above every place a person can stand OR >= 2.5 m beside it (the 0.8 deg fan + 4 mm + 1 mrad); '
                          'every body is its true box + 0.25 m and the 1.008 deg tube keeps >= 0.25 m from it (the laser margin); every ray of the 0.8 and 1.008 deg fans first hits '
                          'the far wall\'s matte block; an opening in that wall is a standing level for the end (2.5 m beside or 3.0 m over its top)',
                  'standards': ['IEC 60825-1:2014 (MPE, NOHD)', 'IEC TR 60825-3 (laser shows: 3.0 m over, 2.5 m beside audience places)', 'ILDA audience-safety guidance', 'HSE HS(G)95'],
                  'person_m': 2.0, 'vertical_m': 3.0, 'lateral_m': 2.5, 'fan_deg': 0.8, 'body_fan_deg': 1.008, 'body_pad_m': 0.25, 'laser_gap_min_m': LASER_GAP_MIN,
                  'free_crane_bridge_top': 'NOT a standing level: closed and locked out whenever a cube can emit (lead\'s addendum 3); the cubes are focused before doors by the operator only, beam block engaged, alignment power'},
         'hold_points': [
             {'id': 'H1', 'what': 'the far (SE) wall: the big gate\'s jambs and top, the steel door\'s jambs and top, the wall surface over x -5.5..-2.5, y 8.0..10.5 (photo 007 never saw that strip; a line at y ~10.0 above it)',
              'stop_if': 'the gate\'s left jamb is further left than x -1.1 (the judge\'s readings G3 / G4 / G7 fail by 0.57-1.88 m): use the fallback B-R or re-aim; something mounted in the end zone: move the end'},
             {'id': 'H2', 'what': 'the free crane\'s top over x -5..-0.5: the far girder\'s top plate and outer edge, the trolley rail and clips, the festoon track on posts (photo 007), any walkway or conductor rail; the real top height; a strap point per cube',
              'stop_if': 'anything on the plate in front of a cube (the beam fires nearly level 0.08 m over it): a riser <= 0.28 m or a bracket off the outer face, then re-run'},
             {'id': 'H3', 'what': 'the free crane seen at z -12; its trolley driven to the +x end (x 7.6-10.2) and locked; its hook wound up; the lock-out (MOXIR.md 5.2)',
              'stop_if': 'the trolley cannot move: its August place (x -2.3..+0.1) is where cubes 03, 05, 06 sit'},
             {'id': 'H4', 'what': 'the pendant lamps over the far half (z -42..-5 never seen) along the strip x -6..0, z -13..-54',
              'stop_if': 'anything hanging below 9.43 m at z -18, 9.76 at z -30, 10.24 at z -48 within 0.58-1.11 m of a beam axis (the judge: off-node lamps from 9.5 m would take B-L to -0.18..-0.43)'},
             {'id': 'H5', 'what': 'the space frame\'s bottom chord at z -48 (10.6-11.2; one reading straight up)', 'stop_if': 'below 10.6 m'},
             {'id': 'H6', 'what': '#873\'s final far-wall ends (its steel-door fix raises them 0.40 m)', 'stop_if': 'their keep-out moves: re-run this check'},
             {'id': 'H7', 'what': 'the far half\'s floor under the beams\' strip (the horizontal tank, the gas cylinders, the stair at a column)', 'stop_if': 'anything higher than 3.71 m (z -31..-13) / 3.59 m (z -54..-31) in the strip x -7.1..1.5: fence or move it'}],
         'controls': ['one static beam per cube (the owner, 2026-10-09); no effect leaves the +-0.3 deg zone',
                      'each cube\'s LaserOS Safety Zone keep-in = its aim +-0.3 deg; the lockable mechanical beam block set at the setup sheet\'s tilt (the judge\'s graft: a passive aperture mask, an 8 mm hole 0.25 m in front, aim +-0.4 deg, covers the unknown scan-fail behaviour: owed)',
                      'the free crane parked at z -12, locked out, its trolley at the +x end, its hook wound up (H3)',
                      'E-stop 1 at FOH, E-stop 2 (spotter): recommended at x -2.0, z -7.0 (the judge\'s graft: 97.6 % of each beam seen at either park, match.md)',
                      'dark until the IEC 60825-1 sign-off: the desk writes 0 to every laser channel (deskLookValues.js laserHeld); `laserSignedOff` is never written by this tool'],
         'nohd_m': {'7.5 W, 4 mm, 1 mrad, 0.25 s': 608, 'basis': 'moxir_v1_1.nohd (IEC 60825-1:2014 Table A.1); every beam is hazardous wherever it is: separation and the hard stop are the control'},
         'setup_sheet': None}
    if checks is not None:
        D.update(checks)
    return D


# ====================================================================== main
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('cmd', choices=['data', 'build', 'check'])
    ap.add_argument('--repo', default='.')
    A, _ = ap.parse_known_args()
    repo = os.path.abspath(os.path.expanduser(A.repo))
    os.chdir(repo)
    if A.cmd == 'data':
        ev, cc, lamps, units = data(repo)
        print(json.dumps({'truss': {k: ev['truss'][k] for k in ('ends', 'trim_m', 'clearance')}, 'picks': cc['picks'], 'worst_pick_kg': cc['worst_pick_kg'],
                          'lamps': [(l['id'], l['p'], l['part']) for l in lamps], 'units': [(u['id'], u['p'], u['pan_deg_from_minus_z_plus_toward_plus_x'], u['tilt_deg_above_level']) for u in units]}, indent=1, default=JD))
    else:
        raise SystemExit('the checks are not written yet')


if __name__ == '__main__':
    main()
