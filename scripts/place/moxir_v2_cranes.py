#!/usr/bin/env python3
# moxir_v2_cranes.py — MOXIR v2, the two cranes as the owner decided them (2026-10-09, N463 / N464 / N464.4): the near crane parks
# at z 3.20, half behind the DJ, and its cut lights him (11 PL5403); the six LaserCubes SIT on the free crane's far-side girder at
# z -12 and fire -z over the crowd behind the stage to the far (SE) wall's block (design B-L).
#
#   python3 -I scripts/place/moxir_v2_cranes.py data  --repo .      # write the new labelled data files (no checks)
#   python3 -I scripts/place/moxir_v2_cranes.py build --repo .      # data + every check, the results written into the files (~3 min)
#   python3 -I scripts/place/moxir_v2_cranes.py check --repo .      # the checks only, JSON on stdout, exit 1 if a rule fails
#   python3 -I scripts/place/moxir_v2_cranes.py plan  --repo . [--out ~/Downloads/moxir/v2-cranes]   # the frame + probe plans (the scene)
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
PEN_STRIP = {'x_m': [-12.0, -10.5], 'z_m': [1.75, 6.5],
             'why': 'the cut\'s LOW end (x -11.04, bottom chord 2.89 m) passes the stage pen\'s edge (x -10.5) 0.39-0.54 m over raised hands, and its hl strap runs at '
                    '3.04 m to the column x -12 at grid z 6 (0.49 m over raised hands): under the 0.5 m rule. Unchanged in kind from v2 spread (the low end was over the '
                    'painted hot zone at z 0.15 too; v1.1 had no public there). The transformer (x -11..-9.5, z -4..4, z LOW) and the column-foot cabinets stand in this '
                    'bay. CONDITION: the pen\'s barrier (owed, moxir_v2_eyes STAGE_PEN) takes in the bay from the pen\'s edge to the nave column row x -12, from the '
                    'bridge\'s back girder (z 1.75) to past the hl strap\'s column (z 6.5), so no one of the public stands under the low end or the strap'}
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
    for fid, ov in B380F_AIM.items():                                    # round 2 item 2: the B380F re-aims (none into the cut's picks)
        if ov['az_el_deg'] and fid in by:
            f = by[fid]
            f['r'] = [R3(v) for v in rot_for_dir(b380f_dir(*ov['az_el_deg']))]
            f['re_aimed'] = {'from_az_el_deg': ov['was_az_el_deg'], 'to_az_el_deg': ov['az_el_deg'], 'why': 'v2 spread aim put 3 of 9 rays on the cut pick 1 (round 2, 10-10)'}
            f['position'] = f['position'].replace('aim 0/24 deg (az/el)', 'aim %g/%g deg (az/el; was 0/24, re-aimed off the cut pick 1)' % tuple(ov['az_el_deg']))
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
    # power: moxir_v2.circuits re-run on the moved units (16 A radials <= 2 944 W, BS 7671 4D2B volt drop); the cubes keep their own radial.
    # DMX: every unit keeps its address (the owner's v2 patch layer, rigs/moxir-v2-patch-2026-10-09.json, is laid on top); cut-11 takes the pit key's.
    import moxir_v2 as M
    units_p = [dict(f) for f in T['fixtures'] if f['type'] in ('up-b380f', 'up-pl5403', 'up-yz31p')]
    circ, ph = M.circuits(units_p)
    cid = {u: c['circuit'] for c in circ for u in c['units']}
    for f in T['fixtures']:
        if f['id'] in cid:
            f['circuit'] = cid[f['id']]
    las = next((c for c in SP['power']['circuits'] if c['circuit'] == 'C-LASER'), None)
    if las:
        las = dict(las, note='6 x 120 W (the adapters), one 16 A radial up the free crane\'s festoon to the six cubes on its far-side girder; the run along the crane is the rigger\'s')
    T['power'] = {'circuits': circ + ([las] if las else []), 'phases_w': ph, 'method': 'moxir_v2.circuits on the v2 cranes units (re-run: the cut moved, the pit stand gone)'}
    T['patch_note'] = 'DMX addresses kept from v2 spread (#864); rig-par-cut-11 holds rig-par-planes-25\'s address (the pit key\'s slot). The owner\'s v2 patch layer (N460.2) is laid on top by its own builder.'
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


# ====================================================================== 4. the checks
# ---------------------------------------------------------------- the rule's numbers (moxir_v1_1 / MOXIR.md 4.0a, unchanged)
PERSON, VERT, LAT = 2.0, 3.0, 2.5
FAN, FAN_BODY = 0.8, 1.008
PAD = 0.25                                  # a body is its true box + 0.25 m
APERTURE_M, DIVERGENCE = 0.004, 0.001       # the cube: 4 mm, 1 mrad (lasers-exact.json specs; 1/e or 1/e2 unknown)
# Round 2 (10-10, the lead's item 2): rig-beam-planes-14 (col x -12 z 0.5, v2 spread aim az 0 / el 24) put 3 of its 9 rays (axis + ring of 8 at 0.9 deg)
# on the cut's pick 1. Re-aimed to the smallest change (max |d az|, |d el| on a 1 deg grid, `check --search-b380f rig-beam-planes-14`) with 0 rays on the cut,
# people or cubes. az from +z toward +x, el over level.
SEARCH_B380F = ''
B380F_AIM = {'rig-beam-planes-14': {'was_az_el_deg': [0.0, 24.0], 'az_el_deg': [-2.0, 24.0]}}   # robust: every aim within +-1 deg also 0 (round2/b380f-search.json)


def b380f_dir(az, el):
    import numpy as np
    a, e = math.radians(az), math.radians(el)
    return np.array([math.sin(a) * math.cos(e), math.sin(e), math.cos(a) * math.cos(e)])


BODY_R = {'up-pl5403': 0.25, 'up-b380f': 0.45, 'up-yz31p': 0.5}      # moxir_v2_spread.BODY_R (ASSUMED from maker sizes)
LAMP_LOW, LAMP_TOP, LAMP_HALF = 9.0, 10.6, 0.3                      # pendant lamps: lowest 9.0 (9.0-10.0, safe end), 0.6 m boxes
LAMP_X = [-11.2, -6.0, 0.0, 6.0, 11.2]
LAMP_Z_MODEL = [0.0, 6.0, 12.0, 18.0, 24.0]                          # modelled (hall json, SUSPECTED at every node)
LAMP_Z_ASSUMED = [-48.0, -42.0, -36.0, -30.0, -24.0, -18.0, -12.0, -6.0, 30.0, 36.0, 42.0, 48.0]   # NOT SEEN / no record: ASSUMED rows
TRUSS_BOTTOM_LOW = 10.6                     # the space frame's bottom chord: 10.8 nominal, 10.6-11.2 (never taped): the LOW end
CHORD_T, GUSSET_DROP, GUSSET_HALF = 0.24, 0.25, 0.45                 # hall.py: chord 0.24 (GUESS), node gussets 0.9 m hanging 0.25 under it
WALL_TOP_LOW = 10.79                        # the far wall's plaster ends 11.26 (10.79-11.73), photo 007 (crane_height.py)
TOPS = ('p05', 'p50', 'p95')


def r_place(s, half=FAN):
    return s * math.tan(math.radians(half)) + (APERTURE_M + DIVERGENCE * s) / 2


def r_body(s, half=FAN_BODY):
    return 0.002 + s * math.tan(math.radians(half))


def box(name, x, y, z, group, pad=PAD, gap=LASER_GAP_MIN):
    import numpy as np
    return {'name': name, 'lo': np.array([x[0], y[0], z[0]], float), 'hi': np.array([x[1], y[1], z[1]], float), 'pad': pad, 'gap': gap, 'group': group}


def roof_members(z54=False):
    """the space frame's bottom layer over the nave (hall.py: chords on the 6 m grid, node gussets), at the LOW end of the truss-bottom range;
    the z +-54 chord rows stand IN the end walls (faces at +-53.8): only their gussets reach out, unless z54 (the laser judge's count)"""
    c = TRUSS_BOTTOM_LOW
    out = []
    for k in range(-9, 10):
        z = 6.0 * k
        if abs(k) < 9 or z54:
            out.append(box('roof bottom chord along x at z %g' % z, (-12.0, 12.0), (c - CHORD_T / 2, c + CHORD_T / 2), (z - CHORD_T / 2, z + CHORD_T / 2), 'roof'))
        for x in (-12.0, -6.0, 0.0, 6.0, 12.0):
            out.append(box('roof node gusset x %g z %g' % (x, z), (x - GUSSET_HALF, x + GUSSET_HALF), (c - GUSSET_DROP, c + CHORD_T / 2), (z - GUSSET_HALF, z + GUSSET_HALF), 'roof'))
    for x in (-12.0, -6.0, 0.0, 6.0, 12.0):
        out.append(box('roof bottom chord along z at x %g' % x, (x - CHORD_T / 2, x + CHORD_T / 2), (c - CHORD_T / 2, c + CHORD_T / 2), (-54.0, 54.0), 'roof'))
    for sx in (-1, 1):
        out.append(box('roof strut along the column row x %+g' % (sx * 12), sorted((sx * 11.92, sx * 12.08)), (10.30 - 0.2, 10.45 - 0.2), (-54.0, 54.0), 'roof'))
    return out


def pendant_lamps():
    return ([box('pendant lamp x %g z %g (modelled, from 9.0)' % (x, z), (x - LAMP_HALF, x + LAMP_HALF), (LAMP_LOW, LAMP_TOP), (z - LAMP_HALF, z + LAMP_HALF), 'pendant lamps, modelled rows')
             for x in LAMP_X for z in LAMP_Z_MODEL] +
            [box('pendant lamp x %g z %g (ASSUMED row, never seen)' % (x, z), (x - LAMP_HALF, x + LAMP_HALF), (LAMP_LOW, LAMP_TOP), (z - LAMP_HALF, z + LAMP_HALF), 'pendant lamps, ASSUMED rows')
             for x in LAMP_X for z in LAMP_Z_ASSUMED])


def free_crane_bodies(top):
    """the free crane at z -12, its tops at the case: the stage-side girder (the cubes' own far-side girder is their mount: the cast checks it),
    the parked trolley, end trucks, cab, and the hook if it were NOT wound up (H3 asks it wound up; checked anyway)"""
    hx = sum(FREE_TROLLEY_X) / 2
    return [box('free crane stage-side girder', (-11.35, 11.35), (FREE_UNDER, top), STAGE_GIRDER, 'free crane'),
            box('free crane trolley (parked x 7.6..10.2, locked out)', FREE_TROLLEY_X, (top, top + 1.0), (FREE_Z - 1.6, FREE_Z + 1.6), 'free crane'),
            box('free crane end truck x -11.35', (-11.75, -10.95), (8.1, max(8.9, top)), (FREE_Z - 2.6, FREE_Z + 2.6), 'free crane'),
            box('free crane end truck x +11.35', (10.95, 11.75), (8.1, max(8.9, top)), (FREE_Z - 2.6, FREE_Z + 2.6), 'free crane'),
            box('free crane cab', (8.35, 10.35), (5.56, 8.24), (FREE_Z - 1.0, FREE_Z + 1.0), 'free crane'),
            box('free crane hook + chain if NOT wound up (hung to 3.45 in August)', (hx - 0.2, hx + 0.2), (3.45, top), (FREE_Z - 0.2, FREE_Z + 0.2), 'free crane')]


def near_crane_bodies(top):
    out = [box('near crane girder z %+.2f' % (NEAR_Z + s * GIRDER_DZ), (-11.35, 11.35), (NEAR_UNDER, top), (NEAR_Z + s * GIRDER_DZ - GIRDER_W / 2, NEAR_Z + s * GIRDER_DZ + GIRDER_W / 2), 'near crane (z 3.20)')
           for s in (-1, 1)]
    out.append(box('near crane trolley', NEAR_TROLLEY[0], (top, NEAR_TROLLEY[1]), (NEAR_Z - 1.6, NEAR_Z + 1.6), 'near crane (z 3.20)'))
    for sx in (-1, 1):
        out.append(box('near crane end truck x %+g' % (sx * 11.35), sorted((sx * 10.95, sx * 11.75)), (8.1, top), (NEAR_Z - 2.6, NEAR_Z + 2.6), 'near crane (z 3.20)'))
    out.append(box('near crane cab', (8.35, 10.35), NEAR_CAB_Y, (NEAR_Z - 1.0, NEAR_Z + 1.0), 'near crane (z 3.20)'))
    return out


def cut_parts(truss, cutj):
    """the cut at z 3.20 (stage-line.mjs's own derivation): the truss as a segment (its 0.29 m box's half diagonal), the picks (bridle + hoist +
    safety steel, a box from 0.85 m under the apex to the girder's safe underside, +-0.8 m), the two straps (r 0.05)"""
    import numpy as np
    e0, e1 = truss['ends']
    s = cutj['truss']['section_m']
    segs = [{'name': 'the cut (H30V truss)', 'a': np.array([e0['x_m'], e0['bottom_chord_m'] + s / 2, NEAR_Z]), 'b': np.array([e1['x_m'], e1['bottom_chord_m'] + s / 2, NEAR_Z]),
             'r': s / 2 * math.sqrt(2), 'group': 'the cut (z 3.20)'}]
    for t in truss['tieoffs']:
        segs.append({'name': 'cut tie-off %s (strap)' % t['id'], 'a': np.array(t['from_m'], float), 'b': np.array(t['to_m'], float), 'r': 0.05, 'group': 'the cut (z 3.20)'})
    picks = [box('cut pick %d (bridle + hoist + safety steel)' % (i + 1), (p['x_m'] - 0.25, p['x_m'] + 0.25), (p['apex_m'] - 0.85, NEAR_UNDER), (NEAR_Z - 0.8, NEAR_Z + 0.8), 'the cut (z 3.20)')
             for i, p in enumerate(truss['picks'])]
    return segs, picks


def ko_boxes(entry):
    return [box(b['id'], b['x_m'], b['y_m'], b['z_m'], 'the 40 W lasers (#873 keep-out)', pad=0.0, gap=KO_GAP_MIN) for b in entry['keep_out']['boxes']]


def cube_box(p, name):
    """a cube's body behind its aperture p (its front face; it runs +z, away from its beam)"""
    return box(name, (p[0] - CUBE[0] / 2, p[0] + CUBE[0] / 2), (p[1] - AP_UP, p[1] - AP_UP + CUBE[1]), (p[2], p[2] + CUBE[2]), 'the other cubes', pad=0.0, gap=LASER_GAP_MIN)


def openings_of(op):
    """the far wall's openings, each reading (EQUIVALENT, photo 007 far_wall_openings.py; GUESS, the hall model)"""
    g, d = op['photo_007']['far_gate'], op['photo_007']['steel_door']
    return {'photo 007, safe-end jambs (G2)': [{'name': 'far gate (photo 007, jambs at the safe ends)', 'x': (g['x_left_m']['p05'], g['x_right_m']['p95']), 'top': max(g['top_m']['p95'], 7.47)},
                                                {'name': 'steel double door (photo 007, jambs at the safe ends)', 'x': (d['x_left_m']['p05'], d['x_right_m']['p95']), 'top': max(d['top_m']['p95'], 2.48)}],
            'the hall model\'s centred gate (G0)': [{'name': 'far gate as the hall model draws it (x -2.4..2.4, 5.4 m)', 'x': tuple(op['model_gate']['x_m']), 'top': op['model_gate']['top_m']}],
            'photo 007, median jambs (G1)': [{'name': 'far gate (photo 007, median jambs)', 'x': (g['x_left_m']['median'], g['x_right_m']['median']), 'top': max(g['top_m']['p95'], 7.47)},
                                            {'name': 'steel double door (photo 007, median jambs)', 'x': (d['x_left_m']['median'], d['x_right_m']['median']), 'top': max(d['top_m']['p95'], 2.48)}]}


FAR_WALL_OPENINGS = {
    'source': REPORTS + 'laser-margin/far_wall_openings.json (far_wall_openings.py: photo 007, single-view metrology as crane_height.py - Criminisi, Reid & Zisserman, IJCV 40(2) 2000; Monte Carlo n 20 000, seed 1; the camera x uniform -2.7..1.0)',
    'photo_007': {'far_gate': {'x_left_m': {'p05': -0.75, 'median': 0.06, 'p95': 0.89}, 'x_right_m': {'p05': 4.83, 'median': 5.65, 'p95': 6.55}, 'top_m': {'p05': 6.75, 'median': 7.06, 'p95': 7.38},
                               'top_rule_m': 7.47, 'top_rule_why': 'crane_height.py\'s own p95 gate height (6.90-7.47)'},
                  'steel_door': {'x_left_m': {'p05': -4.31, 'median': -3.46, 'p95': -2.65}, 'x_right_m': {'p05': -2.28, 'median': -1.45, 'p95': -0.64}, 'top_m': {'p05': 2.25, 'median': 2.41, 'p95': 2.58}}},
    'model_gate': {'x_m': [-2.4, 2.4], 'top_m': 5.4, 'basis': 'GUESS: hall json far_gate, "far_gate_w_m: low (photo 004)"'},
    'rule_set': ['photo 007, safe-end jambs (G2)', 'the hall model\'s centred gate (G0)'],
    'judge_readings_not_passed': {'G3 (photo 007 centred)': -1.876, 'G4 (photo-032 read, centre +1.4)': -0.566, 'G7 (camera in the cab what-if)': -1.876,
                                  'source': REPORTS + 'judge-laser-safety/verdict.md + match/match.md: B-L fails these; the stop is hold point H1 (tape the gate\'s jambs)'}}


def standing_places(G, stage):
    """moxir_v1_1.standing_places on hall v10 (both cranes at their show park), with BOTH cabs as standing levels at their HIGH floors"""
    E = G['end_wall_inner_y_m']
    b = stage['booth']
    bz = b['front_z_m'] - b['depth_m'] / 2
    f = stage['foh']
    rail = G['crane_rail_x_m']
    mass = {m['id']: m for m in G['massing']}
    DW = G['door']['w_m']
    out = [('hall floor (dance floor, backstage, everywhere)', G['walls_x_m'][0], G['walls_x_m'][1], -E, E, 0.0),
           ('DJ step', b['centre_x_m'] - b['width_m'] / 2, b['centre_x_m'] + b['width_m'] / 2, bz - b['depth_m'] / 2, bz + b['depth_m'] / 2, b['deck_h_m']),
           ('FOH riser', f['p'][0] - f['size_m'][0] / 2, f['p'][0] + f['size_m'][0] / 2, f['p'][2] - f['size_m'][1] / 2, f['p'][2] + f['size_m'][1] / 2, f['riser_m']),
           ('entry platform', DW / 2 + 0.6, DW / 2 + 7.6, E - 3.0, E, 2.4),
           ('entry stairs', DW / 2 + 7.6, DW / 2 + 7.6 + 3.6, E - 1.2, E, 2.4)]
    for k in (1, 2, 3, 4):
        m = mass['pipe-rack-gallery-%d' % k]
        out.append(('gallery %d' % k, m['x_m'][0], m['x_m'][1], m['z_m'][0], m['z_m'][1], m['y_m'][1]))
    m = mass['roller-conveyor']
    out.append(('conveyor gallery (roller conveyor)', m['x_m'][0], m['x_m'][1], m['z_m'][0], m['z_m'][1], m['y_m'][1]))
    for sgn, row in ((-1, 'left'), (1, 'right')):
        xa, xb = sorted((sgn * (rail - 0.35), sgn * (rail + 1.3)))
        out.append(('runway walkway %s row' % row, xa, xb, -E, E, G['runway_top_m']))
    out.append(('near crane cab (z %.2f, floor 6.7: the high end of 4.6-6.7)' % NEAR_Z, 8.35, 10.35, NEAR_Z - 1.0, NEAR_Z + 1.0, 6.7))
    out.append(('free crane cab (z -12, floor 6.15: photo 007 p95)', 8.35, 10.35, FREE_Z - 1.0, FREE_Z + 1.0, 6.15))
    return out


class Scene:
    """everything a cube's tube is checked against (one free-crane top case, one near-crane top)"""

    def __init__(self, repo, G, stage, rig, truss, cutj, entry, top='p50', near_top=NEAR_TOP[0], openings=None, z54=False):
        import numpy as np
        self.top = FREE_TOP[top]
        self.places = standing_places(G, stage)
        self.parr = np.array([p[1:6] for p in self.places], float)
        segs, picks = cut_parts(truss, cutj)
        self.segs = segs
        self.boxes = pendant_lamps() + near_crane_bodies(near_top) + picks + ko_boxes(entry) + roof_members(z54) + free_crane_bodies(self.top)
        self.spheres = [(f['id'], np.array(f['p'], float), max(0.25, BODY_R[f['type']])) for f in rig['fixtures'] if f['type'] in BODY_R]
        self.lanterns = [(l['x_m'], l['z_m']) for l in G['lanterns']]
        self.lantern_low = G['deck_m']
        self.openings = openings
        zf = [6.0 * k + dz for k in range(-9, 10) for dz in (-GUSSET_HALF, -LAMP_HALF, -CHORD_T / 2, 0.0, CHORD_T / 2, LAMP_HALF, GUSSET_HALF)]
        zf += [v for b in entry['keep_out']['boxes'] for v in b['z_m']] + list(FAR_GIRDER) + list(STAGE_GIRDER) + [FREE_Z - 2.6, FREE_Z + 2.6, FREE_Z - 1.6, FREE_Z + 1.6]
        self.zfaces = np.unique(np.array(zf, float))

    def margins(self, p, T, others=(), step=0.25, alone=False, optics=None, skip_groups=(), extra_boxes=()):
        """every margin of the tube p -> T (m; >= 0 passes): name -> (margin, at, group). A body's gap to the tube = margin + its gap rule (0.25).
        alone: the beam alone (no fan: 4 mm + 1 mrad for the levels and the openings, 2 mm for the bodies), the v1.1 setup-sheet window's test"""
        import numpy as np
        p, T = np.asarray(p, float), np.asarray(T, float)
        Lb = float(np.linalg.norm(T - p))
        d = (T - p) / Lb
        s = np.arange(0.05, Lb, step)
        sz = (self.zfaces - p[2]) / d[2]
        s = np.unique(np.concatenate([s, sz[(sz > 0.05) & (sz < Lb)], [Lb]]))   # exact samples on every member's face: a thin member is never stepped over
        Q = p + s[:, None] * d
        # optics (aperture m, divergence rad): another unit's tube (the 40 W: 10 mm + 1.3 mrad, #873); its body tube then also carries the
        # divergence (aperture/2 + div s/2 + s tan 1.008), the safe side of the cubes' 2 mm + s tan 1.008
        ap, dv = optics if optics else (APERTURE_M, DIVERGENCE)
        rpf = lambda v, h: v * math.tan(math.radians(h)) + (ap + dv * v) / 2
        rbo = (lambda v, h: ap / 2 + dv * v / 2 + v * math.tan(math.radians(h))) if optics else r_body
        rp = rpf(s, 0.0 if alone else FAN)
        rb = rbo(s, 0.0 if alone else FAN_BODY)
        rbf = (lambda v: rbo(v, 0.0)) if alone else (lambda v: rbo(v, FAN_BODY))
        m = {}
        for k, (x0, x1, z0, z1, h) in enumerate(self.parr):
            hg = np.hypot(np.maximum(np.maximum(x0 - Q[:, 0], Q[:, 0] - x1), 0), np.maximum(np.maximum(z0 - Q[:, 2], Q[:, 2] - z1), 0)) - rp
            topp = h + PERSON
            vg = np.where(Q[:, 1] > topp, Q[:, 1] - topp, np.where(Q[:, 1] < h, h - Q[:, 1], 0.0)) - rp
            c = np.maximum(hg - LAT, vg - VERT)
            j = int(c.argmin())
            m['level: ' + self.places[k][0]] = (float(c[j]), Q[j], 'standing levels (3.0 m over / 2.5 m beside)')
        for b in [b for b in self.boxes if b['group'] not in skip_groups] + list(extra_boxes) + [cube_box(o, 'cube at x %.2f' % o[0]) for o in others]:
            g = np.linalg.norm(np.maximum(np.maximum(b['lo'] - Q, Q - b['hi']), 0), axis=1) - rb - b['pad'] - b['gap']
            j = int(g.argmin())
            key = 'body: ' + b['name']
            if key not in m or g[j] < m[key][0]:
                m[key] = (float(g[j]), Q[j], b['group'])
        for sg in self.segs:
            ab = sg['b'] - sg['a']
            t = np.clip(((Q - sg['a']) @ ab) / (ab @ ab), 0, 1)
            g = np.linalg.norm(Q - (sg['a'] + t[:, None] * ab), axis=1) - sg['r'] - rb - PAD - LASER_GAP_MIN
            j = int(g.argmin())
            m['body: ' + sg['name']] = (float(g[j]), Q[j], sg['group'])
        for fid, c, rr in self.spheres:
            t = float(np.clip((c - p) @ d, 0.0, Lb))
            g = float(np.linalg.norm(c - (p + t * d)) - rbf(t) - rr - LASER_GAP_MIN)
            m['body: lamp ' + fid] = (g, p + t * d, 'lamp bodies (v2 cranes rig, spheres)')
        best = (99.0, None)
        for (xr, zr) in self.lanterns:
            sel = (Q[:, 0] >= xr[0] - rb) & (Q[:, 0] <= xr[1] + rb) & (Q[:, 2] >= zr[0] - rb) & (Q[:, 2] <= zr[1] + rb)
            if sel.any():
                gg = self.lantern_low - (Q[sel, 1] + rb[sel]) - PAD - LASER_GAP_MIN
                jj = int(gg.argmin())
                if gg[jj] < best[0]:
                    best = (float(gg[jj]), Q[sel][jj])
        m['body: lantern glazing (from the deck %.2f)' % self.lantern_low] = (best[0], best[1], 'lanterns')
        rpe, rbe = rpf(Lb, 0.0 if alone else FAN), rbf(Lb)
        m['end: under the far wall\'s plaster top (%.2f, body rule)' % WALL_TOP_LOW] = (WALL_TOP_LOW - PAD - LASER_GAP_MIN - (T[1] + rbe), T, 'end: far wall')
        for op in self.openings:
            lat = max(op['x'][0] - T[0], T[0] - op['x'][1], 0.0) - rpe
            m['end: %s (2.5 m beside or 3.0 m over its %.2f top)' % (op['name'], op['top'])] = (max(lat - LAT, (T[1] - rpe) - (op['top'] + VERT)), T, 'end: far wall openings')
        return m


def worst(m):
    k = min(m, key=lambda k: m[k][0])
    return m[k][0], k


def by_group(m):
    out = {}
    for k, (v, at, g) in m.items():
        if g not in out or v < out[g]['margin_m']:
            out[g] = {'margin_m': R3(v), 'item': k, 'at': None if at is None else [R3(q) for q in at]}
    return dict(sorted(out.items(), key=lambda kv: kv[1]['margin_m']))


# ---------------------------------------------------------------- the cast (hall v10 triangles + boxes)
class Cast:
    """Moller & Trumbore (1997) over the hall v10 GLB's triangles, each keeping its mesh name, + occlusion_sky.OBox boxes (slab method)"""

    def __init__(self, glb, boxes=()):
        import numpy as np
        import occlusion_lib as O
        tris, names = [], []
        for k, t in O.read_glb(glb).items():
            if k.startswith('hall-zone'):
                continue                                               # floor tape: drawn, not solid
            tris.append(t)
            names += [k] * len(t)
        Tt = np.concatenate(tris).astype(float)
        self.V0, self.E1, self.E2 = Tt[:, 0], Tt[:, 1] - Tt[:, 0], Tt[:, 2] - Tt[:, 0]
        self.C = Tt.mean(1)
        self.R = np.linalg.norm(Tt - self.C[:, None, :], axis=2).max(1)
        self.mesh = np.array(names)
        self.n = len(Tt)
        self.boxes = list(boxes)

    def cast(self, o, D, reach=140.0, tmin=0.3, skip=(), extra=()):
        """first hit of every ray: (t array, names, cls, mesh) - a box hit has mesh None, a triangle hit has name/cls = its mesh"""
        import numpy as np
        o = np.asarray(o, float)
        D = np.atleast_2d(np.asarray(D, float))
        n = len(D)
        best = np.full(n, np.inf)
        who = np.full(n, -1, dtype=np.int64)
        near = np.nonzero(np.linalg.norm(self.C - o, axis=1) - self.R <= reach)[0]
        for k in range(0, len(near), 4000):
            idx = near[k:k + 4000]
            sv = o - self.V0[idx]
            Bm, Qm = np.cross(self.E2[idx], sv), np.cross(sv, self.E1[idx])
            tn = np.einsum('ij,ij->i', self.E2[idx], Qm)
            det = D @ np.cross(self.E2[idx], self.E1[idx]).T
            ok = np.abs(det) > 1e-12
            inv = np.where(ok, 1.0 / np.where(ok, det, 1.0), 0.0)
            u = (D @ Bm.T) * inv
            v = (D @ Qm.T) * inv
            t = tn[None, :] * inv
            hit = ok & (u >= -1e-9) & (v >= -1e-9) & (u + v <= 1 + 1e-9) & (t > tmin) & (t < reach)
            t = np.where(hit, t, np.inf)
            j = np.argmin(t, axis=1)
            tj = t[np.arange(n), j]
            better = tj < best
            best[better] = tj[better]
            who[better] = idx[j[better]]
        names = [str(self.mesh[w]) if w >= 0 else None for w in who]
        cls = list(names)
        mesh = list(names)
        for b in list(self.boxes) + list(extra):
            if b.name in skip or b.cls in skip:
                continue
            tb = b.hits(o, D, tmin)
            for i in np.nonzero((tb < best) & (tb < reach))[0]:
                best[i], names[i], cls[i], mesh[i] = tb[i], b.name, b.cls, None
        return best, names, cls, mesh


def obox(name, cls, x, y, z):
    import occlusion_sky as S
    return S.OBox.aabb(name, cls, tuple(x), tuple(y), tuple(z))


def far_wall_hit(at, mesh, G):
    return mesh == 'hall-block' and at is not None and abs(at[2] + G['end_wall_inner_y_m']) < 0.06


def fan_cast(C, G, p, T, half, openings, extra=()):
    """the axis + 60 rays (occlusion_lib.AREA_RINGS) over the fan: each must first hit the far wall's matte block, its hit point clear of every opening"""
    import numpy as np
    import occlusion_lib as O
    p, T = np.asarray(p, float), np.asarray(T, float)
    d = (T - p) / np.linalg.norm(T - p)
    dirs, _ = O.cone_rays(d, half, O.AREA_RINGS)
    t, names, cls, mesh = C.cast(p, dirs, reach=140.0, tmin=0.05, extra=extra)
    rows, on_block, clear = [], [], []
    for q, tt, nm, me in zip(dirs, t, names, mesh):
        at = (p + tt * q) if np.isfinite(tt) else None
        ok = far_wall_hit(at, me, G)
        cl = ok and all(max(op['x'][0] - at[0], at[0] - op['x'][1], 0.0) >= LAT or at[1] >= op['top'] + VERT for op in openings)
        rows.append({'name': nm, 'at': None if at is None else [R3(v) for v in at]})
        on_block.append(ok)
        clear.append(cl)
    ys = [r['at'][1] for r in rows if r['at']]
    xs = [r['at'][0] for r in rows if r['at']]
    return {'rays': len(rows), 'half_fan_deg': half, 'all_first_hit_far_wall_block': bool(all(on_block)), 'all_clear_of_openings': bool(all(clear)),
            'first_hits': sorted(set('%s' % r['name'] for r in rows)), 'end_x_m': [R3(min(xs)), R3(max(xs))] if xs else None, 'end_y_m': [R3(min(ys)), R3(max(ys))] if ys else None,
            'bad': [r for r, g in zip(rows, on_block) if not g][:5]}


def mount_cast(C, p, T, top, extra=()):
    """the mount: no ray of the 1.008 deg fan meets anything (its own girder at this top, a neighbour, the trolley) in the first 2 m"""
    import numpy as np
    import occlusion_lib as O
    p, T = np.asarray(p, float), np.asarray(T, float)
    d = (T - p) / np.linalg.norm(T - p)
    dirs, _ = O.cone_rays(d, FAN_BODY, O.AREA_RINGS)
    own = obox('the cubes\' own far-side girder (top %.2f)' % top, 'crane', (-11.35, 11.35), (FREE_UNDER, top), (FAR_GIRDER[0] + 1e-4, FAR_GIRDER[1]))
    t, names, cls, mesh = C.cast(p, dirs, reach=2.0, tmin=0.001, extra=list(extra) + [own])
    hits = sorted(set(n for n, tt in zip(names, t) if np.isfinite(tt)))
    return {'rays': len(dirs), 'clear_first_2_m': not hits, 'hits': hits}


def single_ok(SC, C, G, p, T, others, cube_boxes):
    """one ray p -> T: the rule with no fan, its first hit the far wall's block, clear of the openings (the v1.1 setup-sheet test)"""
    import numpy as np
    m = SC.margins(p, T, others=others, step=0.5, alone=True)
    if worst(m)[0] < -1e-9:
        return False
    d = np.asarray(T, float) - np.asarray(p, float)
    d /= np.linalg.norm(d)
    t, names, cls, mesh = C.cast(p, d[None, :], reach=140.0, tmin=0.05, extra=cube_boxes)
    at = np.asarray(p, float) + t[0] * d if np.isfinite(t[0]) else None
    return far_wall_hit(at, mesh[0], G)


def setup_row(SC, C, G, u, others, cube_boxes):
    """the v1.1 setup sheet: the window where the rule still holds for the beam alone (stepped 0.02 deg, the fan's full rule kept on the beam
    itself: the conservative form), the LaserOS Safety Zone keep-in = aim +-0.3 deg, which must sit inside the window shrunk by the 0.5 deg mount tolerance"""
    import numpy as np
    p = np.asarray(u['p'], float)
    pan, tilt = u['pan_deg_from_minus_z_plus_toward_plus_x'], u['tilt_deg_above_level']

    def at(dp, dt):
        pa, ti = math.radians(pan + dp), math.radians(tilt + dt)
        dd = np.array([math.cos(ti) * math.sin(pa), math.sin(ti), -math.cos(ti) * math.cos(pa)])
        return p + dd * (-G['end_wall_inner_y_m'] - p[2]) / dd[2]

    def edge(axis, sign):
        last = 0.0
        for k in range(1, 151):
            dv = sign * 0.02 * k
            q = at(dv, 0.0) if axis == 'pan' else at(0.0, dv)
            if not single_ok(SC, C, G, p, q, others, cube_boxes):
                return round(last, 2)
            last = dv
        return round(last, 2)
    lp, hp, lt, ht = edge('pan', -1), edge('pan', 1), edge('tilt', -1), edge('tilt', 1)
    zone = 0.3
    inside = min(-lp, hp, -lt, ht) >= zone + 0.5
    return {'cube': u['id'], 'colour': u['colour'], 'aim': {'end_m': u['to'], 'pan_deg_from_minus_z_plus_toward_plus_x': round(pan, 3), 'tilt_deg_above_level': round(tilt, 3), 'range_m': round(u['range_m'], 2)},
            'window_rule_holds_deg': {'pan': [round(pan + lp, 2), round(pan + hp, 2)], 'tilt': [round(tilt + lt, 2), round(tilt + ht, 2)], 'half_widths_pan_tilt': [lp, hp, lt, ht],
                                      'method': 'the rule for the beam alone (4 mm + 1 mrad, no fan) at each 0.02 deg step, its first hit on the far wall\'s block (moxir_v1_1 / moxir_entry_lasers setup_row)'},
            'laseros_safety_zone_keep_in_deg': {'pan': [round(pan - zone, 2), round(pan + zone, 2)], 'tilt': [round(tilt - zone, 2), round(tilt + zone, 2)], 'inside_window_less_0_5_mount': bool(inside)},
            'beam_block': {'below_tilt_deg': round(tilt + lt, 2), 'setting': 'block everything below %.2f deg above level (the window floor); set with the cube off, a spirit level on the block edge (the maker prints no angle scale)' % (tilt + lt)}}


# ---------------------------------------------------------------- the 40 W beams (#873) against the near crane at its new park
def forty_watt(entry, truss, rig, near_top=NEAR_TOP[0]):
    """#873's own terms (moxir_entry_lasers.margins: their tube s tan 0.8 + (10 mm + 1.3 mrad s)/2; the near crane's safe underside 7.2 with no pad;
    the cut and its picks with no pad; the straps r 0.05 + 0.25; lamp bodies + 0.25) at z 3.20, and - for the lead - the cubes' body rule on the girders"""
    import numpy as np
    out = {}
    segs, picks = cut_parts(truss, {'truss': {'section_m': 0.29}})
    lamps = [(f['id'], np.array(f['p'], float), max(0.25, BODY_R[f['type']])) for f in rig['fixtures'] if f['type'] in BODY_R]
    for f in entry['fixtures']:
        p = np.array(f['p'], float)
        T = np.array(f['laser']['beams'][0]['to'], float)
        L = float(np.linalg.norm(T - p))
        d = (T - p) / L
        s = np.arange(0.3, L, 0.05)
        Q = p + s[:, None] * d
        R = s * math.tan(math.radians(0.8)) + (0.010 + 0.0013 * s) / 2
        m = {}
        zc = np.zeros(len(Q), bool)
        for sgn in (-1, 1):
            zc |= (Q[:, 2] >= NEAR_Z + sgn * GIRDER_DZ - 0.35 - R) & (Q[:, 2] <= NEAR_Z + sgn * GIRDER_DZ + 0.35 + R)
        zc &= np.abs(Q[:, 0]) <= 11.35 + R
        m['near crane bridge at z 3.20 (#873\'s term: safe underside 7.2, no pad)'] = float(np.min(NEAR_UNDER - (Q[zc, 1] + R[zc]))) if zc.any() else 99.0
        cut = segs[0]
        ab = cut['b'] - cut['a']
        t = np.clip(((Q - cut['a']) @ ab) / (ab @ ab), 0, 1)
        m['the cut at z 3.20 (#873\'s term)'] = float(np.min(np.linalg.norm(Q - (cut['a'] + t[:, None] * ab), axis=1) - cut['r'] - R))
        for b in picks:
            m[b['name'] + ' (#873\'s term)'] = float(np.min(np.linalg.norm(np.maximum(np.maximum(b['lo'] - Q, Q - b['hi']), 0), axis=1) - R))
        for sg in segs[1:]:
            ab = sg['b'] - sg['a']
            t = np.clip(((Q - sg['a']) @ ab) / (ab @ ab), 0, 1)
            m[sg['name'] + ' (r 0.05, margin 0.25)'] = float(np.min(np.linalg.norm(Q - (sg['a'] + t[:, None] * ab), axis=1) - 0.05 - R - 0.25))
        best = (99.0, None)
        for fid, c, rr in lamps:
            v = c - p
            tt = float(v @ d)
            if 0 <= tt <= L:
                g = float(np.linalg.norm(v - tt * d) - (tt * math.tan(math.radians(0.8)) + (0.010 + 0.0013 * tt) / 2) - rr - 0.25)
                if g < best[0]:
                    best = (g, fid)
        m['lamp bodies of the v2 cranes rig (sphere, margin 0.25)'] = best[0]
        # the cubes' body rule on the near crane's girders (true box + 0.25, 1.008 deg + 2 mm, gap 0.25): reported for the lead (match.md)
        rb = 0.002 + s * math.tan(math.radians(FAN_BODY))
        gb = 99.0
        for b in near_crane_bodies(near_top)[:2]:
            g = np.linalg.norm(np.maximum(np.maximum(b['lo'] - Q, Q - b['hi']), 0), axis=1) - rb - PAD - LASER_GAP_MIN
            gb = min(gb, float(g.min()))
        out[f['id']] = {'their_terms': {k: R3(v) for k, v in m.items()}, 'their_worst_m': R3(min(m.values())), 'nearest_lamp': best[1],
                        'cubes_body_rule_on_the_near_girders_m': R3(gb)}
    return out


# ---------------------------------------------------------------- people under the cut, the DJ's eyes and light
def seg_box_gap(a, b, lo, hi, n=400):
    import numpy as np
    t = np.linspace(0, 1, n)[:, None]
    Q = a + t * (b - a)
    return float(np.min(np.linalg.norm(np.maximum(np.maximum(lo - Q, Q - hi), 0), axis=1)))


def people_clearances(stage, truss, cutj, rig, pen, strip):
    """the cut's parts (truss box, lamp bodies 0.25 spheres, picks, straps) against raised hands: the DJ on his step (0.4 + 2.5), the public
    (2.5 m) everywhere outside the stage pen, and the same with the pen's owed barrier taking in the column bay under the low end (PEN_STRIP)"""
    import numpy as np
    segs, picks = cut_parts(truss, cutj)
    lamps = [(f['id'], np.array(f['p'], float)) for f in rig['fixtures'] if f.get('layer') == 'the cut']
    H, CL = PEOPLE_RULE['raised_hands_m'], PEOPLE_RULE['clear_m']
    b = stage['booth']
    bz0, bz1 = b['front_z_m'] - b['depth_m'], b['front_z_m']
    step = (np.array([b['centre_x_m'] - b['width_m'] / 2, 0.0, bz0]), np.array([b['centre_x_m'] + b['width_m'] / 2, b['deck_h_m'] + H, bz1]))

    def gap_to(lo, hi):
        rows = []
        for sg in segs:
            rows.append((seg_box_gap(sg['a'], sg['b'], lo, hi) - sg['r'], sg['name']))
        for bx in picks:
            q = np.maximum(np.maximum(lo - bx['hi'], bx['lo'] - hi), 0)
            rows.append((float(np.linalg.norm(q)), bx['name']))
        for fid, c in lamps:
            rows.append((float(np.linalg.norm(np.maximum(np.maximum(lo - c, c - hi), 0))) - 0.25, 'lamp body ' + fid))
        return min(rows)

    def public(pen_x0):
        """the public's hands volume outside the pen: four slabs round it (the hall floor everywhere else, up to 2.5 m)"""
        (x0, x1), (z0, z1) = pen['x_m'], pen['z_m']
        slabs = [(np.array([-36.4, 0, -53.8]), np.array([pen_x0, H, 53.8])), (np.array([x1, 0, -53.8]), np.array([60.4, H, 53.8])),
                 (np.array([-36.4, 0, -53.8]), np.array([60.4, H, z0])), (np.array([-36.4, 0, z1]), np.array([60.4, H, 53.8]))]
        return min(gap_to(lo, hi) for lo, hi in slabs)

    dj = gap_to(*step)
    pub_today = public(pen['x_m'][0])
    # with the owed barrier taking in the bay (x -11.6..-10.5) for the bridge's width: the public's slab stops at the column face there
    (x0, x1), (z0, z1) = pen['x_m'], pen['z_m']
    sx, sz = strip['x_m'], strip['z_m']
    slabs = [(np.array([-36.4, 0, -53.8]), np.array([sx[0], H, 53.8])), (np.array([sx[0], 0, -53.8]), np.array([x0, H, sz[0]])), (np.array([sx[0], 0, sz[1]]), np.array([x0, H, 53.8])),
             (np.array([x1, 0, -53.8]), np.array([60.4, H, 53.8])), (np.array([-36.4, 0, -53.8]), np.array([60.4, H, z0])), (np.array([-36.4, 0, z1]), np.array([60.4, H, 53.8]))]
    pub_strip = min(gap_to(lo, hi) for lo, hi in slabs)
    lowest_lens = min(c[1] for _, c in lamps)
    return {'rule': 'raised hands %.1f m over the standing surface; every part of the cut >= %.1f m from them (stage json truss.clear_gap_m: "the same 0.5 m the cut keeps over raised hands"); '
                    'the lowest lens >= %.1f m (ISO 13857:2019 Table 2)' % (H, CL, PEOPLE_RULE['reach_m']),
            'dj_on_his_step': {'gap_m': R3(dj[0]), 'nearest': dj[1], 'passes': dj[0] >= CL},
            'public_outside_the_pen_today': {'gap_m': R3(pub_today[0]), 'nearest': pub_today[1], 'passes': pub_today[0] >= CL,
                                             'why': 'the cut\'s LOW end passes the pen\'s edge x -10.5 at 0.39-0.54 m over raised hands (unchanged by the park; v1.1 had no public there)'},
            'public_with_the_pen_condition': {'gap_m': R3(pub_strip[0]), 'nearest': pub_strip[1], 'passes': pub_strip[0] >= CL, 'condition': strip},
            'lowest_lens_m': R3(lowest_lens), 'lowest_lens_passes': lowest_lens >= PEOPLE_RULE['reach_m'],
            'low_end_over_raised_hands_m': truss['clearance']['low_end']['over_raised_hands_m'], 'over_dj_raised_hands_m': truss['clearance']['over_dj_raised_hands_m']}


class LuxWorld:
    """the adapter moxir_v2_spread.e_on needs (W.cast(o, D, reach, tmin, skip) -> t, names, cls) over hall v10 + the rig's solids, the step,
    the DJ, the cut and its picks at z 3.20"""

    def __init__(self, C):
        self.C = C

    def cast(self, o, D, reach=30.0, tmin=0.3, skip=()):
        t, names, cls, _ = self.C.cast(o, D, reach=reach, tmin=tmin, skip=skip)
        return t, names, cls


DJ_TARGETS = {'face, eye height (+z)': ([-5.2, 2.03, 4.30], [0, 0, 1]), 'face, #864 target (+z)': ([-5.2, 1.9, 4.6], [0, 0, 1]),
              'head top (up)': ([-5.2, 2.2, 4.1], [0, 1, 0]), 'back of head (-z)': ([-5.2, 2.06, 4.12], [0, 0, -1]),
              'booth front (+z)': ([-5.2, 1.0, 5.3], [0, 0, 1]), 'PA L face (+z)': ([-8.25, 1.0, 6.75], [0, 0, 1]), 'PA R face (+z)': ([-1.5, 1.0, 7.25], [0, 0, 1])}


def dj_light(W, rig, cd, exp=1):
    """lx on each DJ target per look, per part (E = I cos i / d^2, the spot cone, the hall's shadow), the room's level law since 28f4028d (linear)"""
    import moxir_v2_spread as V
    out = {}
    for lk in rig['looks']:
        res = {}
        for tn, (tp, n) in DJ_TARGETS.items():
            tot, byp = 0.0, {}
            for f in rig['fixtures']:
                if f['type'] not in ('up-pl5403', 'up-b380f') or f['part'] not in lk['parts']:
                    continue
                col, lev = lk['parts'][f['part']]
                c = cd if f['type'] == 'up-pl5403' else V.B380_CD_ROOM
                e = V.e_on(W, f, tp, n, c) * lev ** exp * V.lum_factor(col or f.get('colour') or ASH)
                if e > 0.05:
                    byp[f['part']] = byp.get(f['part'], 0.0) + e
                    tot += e
            res[tn] = {'lx': round(tot, 1), 'by_part': {k: round(v, 1) for k, v in sorted(byp.items(), key=lambda kv: -kv[1])}}
        out[lk['id']] = res
    return out


def lens_rays(C, p, d, people):
    """where a lamp's light goes: the axis + 24 rays at the cone's edge (7.5 deg); none may meet the public (the hot zone's people outside the pen)"""
    import numpy as np
    import occlusion_lib as O
    dirs, _ = O.cone_rays(d, 7.5, [(1.0, 24)])
    t, names, cls, _ = C.cast(p, dirs, reach=60.0, tmin=0.3, extra=people)
    return {'into_people': int(sum(c == 'people' for c in cls)), 'ends': sorted(set(n for n in names if n))}


def checks(repo):
    """every check of the pair, the results as dicts (written into the files by build)"""
    import numpy as np
    import occlusion_sky as S
    import moxir_v2_spread as V
    import moxir_v2_eyes as EY
    t0 = time.time()
    log = lambda *a: print('[%4.0f s]' % (time.time() - t0), *a, file=sys.stderr, flush=True)
    G = rd(repo, HALL_V10)['geometry']
    stage, cutj, rig, entry = rd(repo, STAGE_V2C), rd(repo, CUT_V2C), rd(repo, RIG_V2C), rd(repo, ENTRY)
    L = rd(repo, LASERS)
    ev, cc = derive(repo)
    truss = ev['truss']
    units = L['units']
    ops = openings_of(FAR_WALL_OPENINGS)
    rule_ops = [o for k in FAR_WALL_OPENINGS['rule_set'] for o in ops[k]]
    if sha256(GLB_V10) != GLB_V10_SHA:
        raise SystemExit('%s is not the pinned hall v10 GLB' % GLB_V10)
    S.wait_cool()
    # ---- lasers: the analytic margins, every beam x every top x both near tops, the rule's openings (photo 007 safe ends AND the model gate)
    beams = []
    worst_all = (99.0, None, None)
    for u in units:
        others = [o['aperture_m'] for o in units if o['id'] != u['id']]
        per = {}
        for top in TOPS:
            p = u['aperture_m'][top]
            oth = [o[top] for o in others]
            mm = {}
            for nt in NEAR_TOP:
                m = Scene(repo, G, stage, rig, truss, cutj, entry, top=top, near_top=nt, openings=rule_ops).margins(p, u['to'], others=oth)
                for k, v in m.items():
                    if k not in mm or v[0] < mm[k][0]:
                        mm[k] = v
            w = worst(mm)
            per[top] = {'aperture_m': p, 'worst_margin_m': R3(w[0]), 'binding': w[1], 'by_group': by_group(mm)}
            if w[0] < worst_all[0]:
                worst_all = (w[0], u['id'], w[1])
        # variants: photo 007's MEDIAN jambs; the z -54 roof row counted (the judge)
        p50 = u['aperture_m']['p50']
        oth50 = [o['p50'] for o in others]
        med = worst(Scene(repo, G, stage, rig, truss, cutj, entry, top='p50', openings=ops['photo 007, median jambs (G1)']).margins(p50, u['to'], others=oth50))
        z54 = min(worst(Scene(repo, G, stage, rig, truss, cutj, entry, top=tp, openings=rule_ops, z54=True).margins(u['aperture_m'][tp], u['to'], others=[o[tp] for o in others])) for tp in TOPS)
        beams.append({'cube': u['id'], 'colour': u['colour'], 'to': u['to'], 'tops': per,
                      'worst_margin_m': min(per[t]['worst_margin_m'] for t in TOPS),
                      'variants': {'photo 007 median jambs (G1), top p50': {'margin_m': R3(med[0]), 'binding': med[1]},
                                   'the z -54 roof row counted (the laser judge)': {'margin_m': R3(z54[0]), 'binding': z54[1]}}})
        log('beam', u['id'], 'worst', beams[-1]['worst_margin_m'])
    # ---- the cast on hall v10 (+ the lamps, the other cubes, the 40 W units and tower, people over the whole floor, the cut)
    seg0 = cut_parts(truss, cutj)
    cast_boxes = [obox(b['name'], 'lamp', (b['lo'][0], b['hi'][0]), (b['lo'][1], b['hi'][1]), (b['lo'][2], b['hi'][2])) for b in pendant_lamps()]
    cast_boxes += [obox('40 W ' + b['id'][:4], 'laser', b['x_m'], b['y_m'], b['z_m']) for b in entry['keep_out']['boxes'][:2]]
    cast_boxes += [obox('people (the whole floor, 2.4 m)', 'people', G['walls_x_m'], (0.0, 2.4), (-53.8, 53.8))]
    cast_boxes += [obox(b['name'], 'rigging', (b['lo'][0], b['hi'][0]), (b['lo'][1], b['hi'][1]), (b['lo'][2], b['hi'][2])) for b in seg0[1]]
    cast_boxes += [obox(f['id'], 'lamp', (f['p'][0] - 0.25, f['p'][0] + 0.25), (f['p'][1] - 0.25, f['p'][1] + 0.25), (f['p'][2] - 0.25, f['p'][2] + 0.25))
                   for f in rig['fixtures'] if f['type'] in BODY_R]
    C = Cast(GLB_V10, cast_boxes)
    log('cast world: %d triangles + %d boxes' % (C.n, len(cast_boxes)))
    casts = []
    for u in units:
        row = {'cube': u['id']}
        for top in TOPS:
            cb = [obox('cube ' + o['id'], 'laser', (o['aperture_m'][top][0] - CUBE[0] / 2, o['aperture_m'][top][0] + CUBE[0] / 2), (o['aperture_m'][top][1] - AP_UP, o['aperture_m'][top][1] - AP_UP + CUBE[1]),
                       (FAR_GIRDER[0], FAR_GIRDER[0] + CUBE[2])) for o in units if o['id'] != u['id']]
            row[top] = {'fan_0_8': fan_cast(C, G, u['aperture_m'][top], u['to'], FAN, rule_ops, extra=cb),
                        'fan_1_008': fan_cast(C, G, u['aperture_m'][top], u['to'], FAN_BODY, rule_ops, extra=cb),
                        'mount': mount_cast(C, u['aperture_m'][top], u['to'], FREE_TOP[top], extra=cb)}
        casts.append(row)
    log('casts done')
    # ---- the setup sheet (top p50, the rule's openings), the window method of v1.1
    S.wait_cool()
    SC = Scene(repo, G, stage, rig, truss, cutj, entry, top='p50', openings=rule_ops)
    sheet = []
    for u in units:
        cb = [obox('cube ' + o['id'], 'laser', (o['p'][0] - CUBE[0] / 2, o['p'][0] + CUBE[0] / 2), (o['p'][1] - AP_UP, o['p'][1] - AP_UP + CUBE[1]), (FAR_GIRDER[0], FAR_GIRDER[0] + CUBE[2]))
              for o in units if o['id'] != u['id']]
        sheet.append(setup_row(SC, C, G, u, [o['p'] for o in units if o['id'] != u['id']], cb))
    log('setup sheet done')
    # ---- lamp bodies vs the cube tubes (the v2 convention: moxir_v2_spread.tube_clearance, rule >= 0.25 m)
    tubes = [{'beam': u['id'], 'cube': u['id'], 'from': u['p'], 'to': u['to'], 'half_fan_deg': FAN_BODY} for u in units]
    lampclear = sorted(({'id': f['id'], 'part': f['part'], 'gap_m': R3(V.tube_clearance(tubes, f['p'], BODY_R[f['type']])[0]), 'nearest_cube': V.tube_clearance(tubes, f['p'], BODY_R[f['type']])[1]}
                        for f in rig['fixtures'] if f['type'] in BODY_R), key=lambda r: r['gap_m'])
    # ---- the 40 W beams at the new park
    fw = forty_watt(entry, truss, rig)
    # ---- rigging (cut-count.mjs on this stage)
    rigging = {'source': 'node scripts/place/cut-count.mjs --n %d --places %s --design %s' % (len(CUT_PLACES), ','.join('%g' % u for u in CUT_PLACES), STAGE_V2C),
               'picks': cc['picks'], 'worst_line_kg': cc['worst_pick_kg'], 'worst_on_bridge_kg': max(p['on_bridge_kg'] for p in cc['picks']), 'headroom_kg': cc['headroom_kg'],
               'cap_kg': PICK_CAP_KG, 'cap_basis': 'a DESIGN cap (v1.0\'s middle pick, MOXIR.md 5.2), not a rating: the crane\'s SWL, the runway and the hoists\' WLL are unknown',
               'bridles_deg': [p['bridle_included_deg'] for p in cc['picks']], 'weight': cc['weight'], 'power': cc['power'], 'dmx': cc['dmx'],
               'tieoffs': [{k: t[k] for k in ('id', 'grid_z_m', 'from_m', 'to_m', 'length_m')} for t in truss['tieoffs']],
               'passes': all(p['line_kg'] <= PICK_CAP_KG and p['on_bridge_kg'] <= PICK_CAP_KG and p['bridle_included_deg'] <= 120 for p in cc['picks'])}
    # ---- people, the DJ's eyes and light; where the cut's lamps' light goes
    people = people_clearances(stage, truss, cutj, rig, EY.STAGE_PEN, PEN_STRIP)
    S.wait_cool()
    b = stage['booth']
    lux_boxes = [obox(s['id'].replace('rig-', ''), 'pa' if s['id'].startswith('rig-pa-') else 'stage', (s['p'][0] - s['s'][0] / 2, s['p'][0] + s['s'][0] / 2), (s['p'][1], s['p'][1] + s['s'][1]),
                      (s['p'][2] - s['s'][2] / 2, s['p'][2] + s['s'][2] / 2)) for s in rig['solids']]
    lux_boxes += [obox('the DJ step', 'booth', (b['centre_x_m'] - b['width_m'] / 2, b['centre_x_m'] + b['width_m'] / 2), (0, b['deck_h_m']), (b['front_z_m'] - b['depth_m'], b['front_z_m'])),
                  obox('the DJ', 'dj', (b['centre_x_m'] - 0.9, b['centre_x_m'] + 0.9), (b['deck_h_m'], b['deck_h_m'] + 2.0), (b['front_z_m'] - b['depth_m'] + 0.1, b['front_z_m'] - 0.2))]
    a, bb = seg0[0][0]['a'], seg0[0][0]['b']
    uu = (bb - a) / np.linalg.norm(bb - a)
    lux_boxes += [S.OBox('the cut (H30V truss)', 'truss', (a + bb) / 2, [np.linalg.norm(bb - a) / 2, 0.145, 0.145], np.column_stack([uu, np.cross([0, 0, 1.0], uu), [0, 0, 1.0]]))]
    lux_boxes += [obox(x['name'], 'rigging', (x['lo'][0], x['hi'][0]), (x['lo'][1], x['hi'][1]), (x['lo'][2], x['hi'][2])) for x in seg0[1]]
    W = LuxWorld(Cast(GLB_V10, lux_boxes))
    light = {'room 30 478 cd, linear (the room since 28f4028d)': dj_light(W, rig, V.PAR_CD_ROOM), 'spec 11 000 cd (EQUIVALENT), linear': dj_light(W, rig, V.PAR_CD_SPEC)}
    glare = {lk: V.dj_glare(rig, lk) for lk in ('dark', 'peak')}
    glare_full = V.dj_glare(dict(rig, looks=[{'id': 'full', 'parts': {p: [ASH, 1.0] for p in set(f['part'] for f in rig['fixtures'])}}]), 'full')
    log('DJ light done')
    pen = EY.STAGE_PEN
    ppl = [obox('people (outside the stage pen, 2.4 m)', 'people', *xyz) for xyz in (
        ((-36.4, pen['x_m'][0]), (0, 2.4), (-53.8, 53.8)), ((pen['x_m'][1], 60.4), (0, 2.4), (-53.8, 53.8)),
        ((-36.4, 60.4), (0, 2.4), (-53.8, pen['z_m'][0])), ((-36.4, 60.4), (0, 2.4), (pen['z_m'][1], 53.8)))]
    Cl = Cast(GLB_V10, lux_boxes)
    cut_light = {}
    for f in rig['fixtures']:
        if f.get('layer') != 'the cut' or f['type'] != 'up-pl5403':
            continue
        import lights_beta_options as LB
        cut_light[f['id']] = dict(lens_rays(Cl, f['p'], LB.aim_dir(f['r']), ppl), part=f['part'])
    log('cut light done')
    # ---- the B380F beams: none into the cubes, the free crane, the near crane at 3.20, the cut, or people (axis + ring of 8 at 0.9 deg)
    import lights_beta_options as LB
    b380 = []
    Cb = Cast(GLB_V10, lux_boxes + [obox('cube ' + u['id'], 'laser', (u['p'][0] - 0.1, u['p'][0] + 0.1), (u['p'][1] - AP_UP, u['p'][1] + 0.1), (FAR_GIRDER[0], FAR_GIRDER[0] + 0.16)) for u in units])
    for f in rig['fixtures']:
        if f['type'] != 'up-b380f':
            continue
        head = np.array([f['p'][0], f['p'][1] - 0.7 + S.HEAD_Y, f['p'][2]])
        import occlusion_lib as O
        dirs, _ = O.cone_rays(LB.aim_dir(f['r']), 0.9, O.SPEC_RINGS)
        t, names, cls, mesh = Cb.cast(head, dirs, reach=140.0, tmin=0.3, extra=ppl)
        b380.append({'id': f['id'], 'part': f['part'], 'into_people': int(sum(c == 'people' for c in cls)), 'into_cubes': int(sum(c == 'laser' for c in cls)),
                     'into_the_cut': int(sum(c in ('truss', 'rigging') for c in cls)), 'ends': sorted(set(n for n in names if n))})
    log('B380F done')
    if SEARCH_B380F:                                                     # the item-2 search: smallest re-aim with 0 rays on the cut / people / cubes
        f = next(x for x in rig['fixtures'] if x['id'] == SEARCH_B380F)
        head = np.array([f['p'][0], f['p'][1] - 0.7 + S.HEAD_Y, f['p'][2]])
        az0, el0 = B380F_AIM[SEARCH_B380F]['was_az_el_deg']
        found = []
        for daz in range(-12, 13):
            for de in range(-8, 13):
                dirs, _ = O.cone_rays(b380f_dir(az0 + daz, el0 + de), 0.9, O.SPEC_RINGS)
                t, names, cls, mesh = Cb.cast(head, dirs, reach=140.0, tmin=0.3, extra=ppl)
                bad = sum(c in ('truss', 'rigging', 'people', 'laser') for c in cls)
                if bad == 0:
                    found.append((max(abs(daz), abs(de)), abs(daz) + abs(de), az0 + daz, el0 + de, sorted(set(n for n in names if n))))
        found.sort(key=lambda r: (r[0], r[1]))
        zero = {(r[2], r[3]) for r in found}                             # robust: every aim within +-1 deg (the mount tolerance, rounded up) is also 0
        robust = [r for r in found if all((r[2] + i, r[3] + j) in zero for i in (-1, 0, 1) for j in (-1, 0, 1))]
        print(json.dumps({'id': SEARCH_B380F, 'zero_aims': len(found), 'best': found[:3], 'robust_pm1deg': robust[:4]}, default=JD))
        sys.exit(0)
    summary = {
        'lasers_worst_margin_m': R3(worst_all[0]), 'lasers_worst_at': [worst_all[1], worst_all[2]],
        'lasers_min_body_gap_m': R3(min(g['margin_m'] for bm in beams for t in TOPS for k, g in bm['tops'][t]['by_group'].items()
                                        if not k.startswith('end') and not k.startswith('standing')) + LASER_GAP_MIN),
        'lasers_min_level_margin_m': R3(min(bm['tops'][t]['by_group']['standing levels (3.0 m over / 2.5 m beside)']['margin_m'] for bm in beams for t in TOPS)),
        'lasers_min_opening_margin_m': R3(min(bm['tops'][t]['by_group']['end: far wall openings']['margin_m'] for bm in beams for t in TOPS)),
        'casts_all_on_far_wall_block': all(c[t][k]['all_first_hit_far_wall_block'] for c in casts for t in TOPS for k in ('fan_0_8', 'fan_1_008')),
        'casts_all_clear_of_openings': all(c[t][k]['all_clear_of_openings'] for c in casts for t in TOPS for k in ('fan_0_8', 'fan_1_008')),
        'mounts_clear_first_2_m': all(c[t]['mount']['clear_first_2_m'] for c in casts for t in TOPS),
        'setup_sheet_zone_inside_window': all(s['laseros_safety_zone_keep_in_deg']['inside_window_less_0_5_mount'] for s in sheet),
        'lamp_bodies_min_gap_to_a_cube_tube_m': lampclear[0]['gap_m'],
        'forty_watt_their_worst_m': min(v['their_worst_m'] for v in fw.values()),
        'forty_watt_body_rule_on_near_girders_m': min(v['cubes_body_rule_on_the_near_girders_m'] for v in fw.values()),
        'picks_worst_line_kg': rigging['worst_line_kg'], 'picks_worst_on_bridge_kg': rigging['worst_on_bridge_kg'], 'picks_pass': rigging['passes'],
        'people_dj_gap_m': people['dj_on_his_step']['gap_m'], 'people_public_gap_today_m': people['public_outside_the_pen_today']['gap_m'],
        'people_public_gap_with_pen_condition_m': people['public_with_the_pen_condition']['gap_m'], 'lowest_lens_m': people['lowest_lens_m'],
        'dj_glare_ok': all(g['ok'] for g in glare.values()) and glare_full['ok'],
        'cut_light_into_people': sum(v['into_people'] for v in cut_light.values()),
        'b380f_into_people_or_cubes': sum(v['into_people'] + v['into_cubes'] for v in b380),
        'b380f_rays_on_the_cut (a look finding, not a rule)': {v['id']: v['into_the_cut'] for v in b380 if v['into_the_cut']},
        'dj_face_eye_height_lx': {lk: light['room 30 478 cd, linear (the room since 28f4028d)'][lk]['face, eye height (+z)']['lx'] for lk in ('dark', 'peak')},
        'dj_head_top_lx': {lk: light['room 30 478 cd, linear (the room since 28f4028d)'][lk]['head top (up)']['lx'] for lk in ('dark', 'peak')},
        'runtime_s': round(time.time() - t0)}
    return {'summary': summary, 'beams': beams, 'casts': casts, 'setup_sheet': sheet, 'lamp_clearance': lampclear[:12], 'forty_watt': fw, 'rigging': rigging,
            'people': people, 'dj_light': light, 'dj_glare': glare, 'dj_glare_all_at_full': glare_full, 'cut_light': cut_light, 'b380f': b380,
            'truss': {k: truss[k] for k in ('ends', 'trim_m', 'clearance')}, 'far_wall_openings': FAR_WALL_OPENINGS}


def passes(R):
    s = R['summary']
    fails = []
    if s['lasers_worst_margin_m'] < 0:
        fails.append('a laser margin is under the rule: %s' % s['lasers_worst_at'])
    if not (s['casts_all_on_far_wall_block'] and s['casts_all_clear_of_openings'] and s['mounts_clear_first_2_m']):
        fails.append('a cast ray does not end on the far wall\'s block clear of the openings, or a mount is not clear')
    if not s['setup_sheet_zone_inside_window']:
        fails.append('a Safety Zone does not fit the window less the mount tolerance')
    if s['lamp_bodies_min_gap_to_a_cube_tube_m'] < LASER_GAP_MIN:
        fails.append('a lamp body is under 0.25 m from a cube tube')
    if not s['picks_pass']:
        fails.append('a pick over 146 kg or a bridle over 120 deg')
    if s['people_dj_gap_m'] < PEOPLE_RULE['clear_m'] or s['people_public_gap_with_pen_condition_m'] < PEOPLE_RULE['clear_m'] or s['lowest_lens_m'] < PEOPLE_RULE['reach_m']:
        fails.append('a person clearance under the rule')
    if not s['dj_glare_ok']:
        fails.append('a lens the DJ sees lit within 20 deg')
    if s['cut_light_into_people'] or s['b380f_into_people_or_cubes']:
        fails.append('a beam into people or the cubes')
    if s['b380f_rays_on_the_cut (a look finding, not a rule)']:      # round 2 (the lead, 10-10): 0 B380F rays on the cut is now a rule
        fails.append('a B380F ray on the cut: %s' % s['b380f_rays_on_the_cut (a look finding, not a rule)'])
    if s['forty_watt_their_worst_m'] < 0:
        fails.append('the 40 W beams fail their own terms at the new park')
    return fails


def build(repo):
    ev, cc, lamps, units = data(repo)
    R = checks(repo)
    L = rd(repo, LASERS)
    L['setup_sheet'] = R['setup_sheet']
    L['far_wall_openings'] = R['far_wall_openings']
    L['checks'] = {k: R[k] for k in ('summary', 'beams', 'casts', 'lamp_clearance', 'forty_watt')}
    L['checks']['world'] = {'glb': GLB_V10, 'glb_sha256': GLB_V10_SHA, 'hall': HALL_V10, 'near_crane_z_m': NEAR_Z, 'free_crane_z_m': FREE_Z, 'near_top_m': list(NEAR_TOP),
                            'roof_truss_bottom_m': TRUSS_BOTTOM_LOW, 'pendant_lamps': 'modelled rows z 0..24 + ASSUMED rows z -48..-6, 30..48, from 9.0 m'}
    L['checks']['passes'] = not passes(R)
    wr(repo, LASERS, L)
    T = rd(repo, RIG_V2C)
    T['review'].update({k: R[k] for k in ('summary', 'rigging', 'people', 'dj_light', 'dj_glare', 'dj_glare_all_at_full', 'cut_light', 'b380f', 'truss')})
    T['review']['laser_clearance'] = R['lamp_clearance']
    T['review']['lasers'] = LASERS + ' checks'
    T['review']['fails'] = passes(R)
    T['checks'] = dict(T['checks'], v2_cranes=R['summary'])
    wr(repo, RIG_V2C, T)
    C = rd(repo, CUT_V2C)
    C['derived_at_z_3_20'] = {'truss': R['truss'], 'rigging': R['rigging'], 'people': R['people']}
    wr(repo, CUT_V2C, C)
    return R


# ====================================================================== 5. the frames and the lux probe (the scene, on a scratch stack)
FRAME_VIEWS = ('floor', 'dj', 'behind', 'wingR')                       # the floor at 1.7 m, the DJ's eye, behind the stage, one wing (the kicker's side)
PROJECT = 'moxir-v2-cranes'


def plans(repo, out, base):
    """the frame plan (moxir-v2-true-frames.cjs) and the probe plan (moxir-v2-probe.cjs): 4 views x peak + dark, one smoke machine at 40 min,
    measurement mode at EV100 2.84 (moxir_v2_true.QUERY), the same cameras as v2 spread (moxir_v2_spread.VIEWS)"""
    import moxir_v2_true as VT
    import moxir_v2_spread as V
    jobs = []
    for look in ('peak', 'dark'):
        for view in FRAME_VIEWS:
            v = V.VIEWS[view]
            jobs.append({'name': 'vc-t40-%s-%s' % (look, view), 'layout': 'vc', 'state': 't40', 'look': look, 'view': view, 'project': PROJECT, 'path': '/moxir/p/%s' % PROJECT,
                         'atmosphere': VT.STATES['t40'][2], 'camera': {'position': v['position'], 'target': v['target'], 'fov': v['fov']}})
    os.makedirs(out, exist_ok=True)
    frames = {'base': base, 'query': VT.QUERY, 'size': [1440, 900], 'settle_s': 15, 'jobs': jobs}
    json.dump(frames, open(os.path.join(out, 'plan.json'), 'w'), indent=1)
    probe = {'base': base, 'query': VT.QUERY, 'settle_s': 15,
             'points': [{'name': k, 'position': p, 'normal': n} for k, (p, n) in DJ_TARGETS.items()],
             'jobs': [dict(j, name='vc-probe-%s' % j['look']) for j in jobs if j['view'] == 'floor']}
    json.dump(probe, open(os.path.join(out, 'probe-plan.json'), 'w'), indent=1)
    print('%d frame jobs, %d probe jobs -> %s' % (len(jobs), len(probe['jobs']), out))


# ====================================================================== main
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('cmd', choices=['data', 'build', 'check', 'plan'])
    ap.add_argument('--repo', default='.')
    ap.add_argument('--out', default=os.path.expanduser('~/Downloads/moxir/v2-cranes'))
    ap.add_argument('--base', default='http://moxir-cranes-lasers.diiii.localhost')
    ap.add_argument('--search-b380f', default='', help='check only: search the smallest re-aim of this B380F with 0 rays on the cut, people or cubes')
    A, _ = ap.parse_known_args()
    global SEARCH_B380F
    SEARCH_B380F = A.search_b380f
    repo = os.path.abspath(os.path.expanduser(A.repo))
    os.chdir(repo)
    if A.cmd == 'data':
        ev, cc, lamps, units = data(repo)
        print(json.dumps({'truss': {k: ev['truss'][k] for k in ('ends', 'trim_m', 'clearance')}, 'picks': cc['picks'], 'worst_pick_kg': cc['worst_pick_kg'],
                          'lamps': [(l['id'], l['p'], l['part']) for l in lamps], 'units': [(u['id'], u['p'], u['pan_deg_from_minus_z_plus_toward_plus_x'], u['tilt_deg_above_level']) for u in units]}, indent=1, default=JD))
    elif A.cmd == 'plan':
        plans(repo, os.path.abspath(os.path.expanduser(A.out)), A.base)
    elif A.cmd == 'build':
        R = build(repo)
        f = passes(R)
        print(json.dumps({'summary': R['summary'], 'fails': f}, indent=1, default=JD))
        sys.exit(1 if f else 0)
    else:
        R = checks(repo)
        f = passes(R)
        print(json.dumps({'summary': R['summary'], 'fails': f, 'beams': [(b['cube'], b['worst_margin_m'], b['variants']) for b in R['beams']]}, indent=1, default=JD))
        sys.exit(1 if f else 0)


if __name__ == '__main__':
    main()
