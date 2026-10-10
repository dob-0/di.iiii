#!/usr/bin/env python3
# moxir_v2_ground.py — MOXIR v2 GROUND (2026-10-09): every wash and beam that is not on the truss stands ON THE GROUND, spread
# over the owner's painted hot zone and both wings, placed from where the audience stands.
#
#   python3 -I scripts/place/moxir_v2_ground.py candidates --repo . --out <dir>   # score every ground place from 9 eyes (~15 min, one core)
#   python3 -I scripts/place/moxir_v2_ground.py build      --repo . --out <dir>   # pick, write the ground layer + the full rig, check
#   python3 -I scripts/place/moxir_v2_ground.py plan       --repo . --out <dir>   # the frame plan (moxir-v2-true-frames.cjs)
#   python3 -I scripts/place/moxir_v2_ground.py tune       --repo . --out <dir> --sets '{"a": {"plane 2 (the wings)": 0.8}}'  # level frames
#   python3 -I scripts/place/moxir_v2_ground.py measured   --repo . --out <dir>   # the measured white-out into both rig files
#   python3 -I scripts/place/moxir_v2_ground.py page       --repo . --out <dir>   # the comparison page (old spread | new ground)
# Run from the repo root (lights_beta_options reads its rig files relative to it).
#
# THE OWNER (2026-10-09 21:05, ledger N465): "and also other washes and beams what we dont use make on the ground, not on the
#   arcs, and also washs are so close on the ground for now you can use the left places of the area so we need epic thing you
#   know use space right". The lead's reading: (1) every UP-PL5403 and UP-B380F not on the truss stands on the floor (<= 1.0 m),
#   never on the steel (columns, arches, roof, brackets); (2) the ground washes are too close together: spread them; (3) use the
#   whole painted area (hot zone + both wings), no beam ending in the bar or the chill + food zone; (4) EPIC seen from where the
#   audience stands. 2026-10-10, after two reviews of the first build: the rules in the FIX block below (B's fan kept, beams in the
#   entry half, the glare budget used, pens for each head's whole desk window, no standing eye in a PAR's beam, the stage front
#   lit from the pit, the crew clear of the fan, the dense 30 deg check) supersede the older lines of this METHOD where they differ.
# OUT OF SCOPE (another workflow owns them): the near crane and the cut truss (moving "half behind the DJ", up to z 4.25), the
#   truss lamps (the lead: the truss keeps 10 PARs, so the ground has 40), the 6 cubes (on the free crane at z -12). Nothing of
#   this layer stands in the crane park zone (x -12..12, z -2..7) above 2.5 m; no island beam crosses it (B's fan crosses its
#   air as the owner saw it and never meets the cut at any park).
#
# METHOD (each number computed here or named; ASSUMED where it is a choice)
#   EYES: 9 standing eyes (1.7 m; FOH 0.6 m riser + 1.7 m), the brief's list: the floor centre, both wings, behind the stage,
#     mid-hall, near the entry (the door, as the entry frame), FOH, and one in each far corner of the painted area.
#   A PAR (UP-PL5403, 15 deg lens, 11 000 cd EQUIVALENT, fixtures-exact.md) is scored by the light its lit surfaces send to each
#     eye: its cone as 61 near-equal-area rays (occlusion_lib.AREA_RINGS), each ray's flux Phi = I x Omega / 61 landing on the
#     first surface within the maker's 30 m throw; a Lambertian surface sends E = rho Phi cos(theta_v) / (pi d^2) to an eye at d
#     that sees the lit side of it (the illuminance from a small diffuse patch: E = L cos(theta) dA / d^2 with L = rho E_s / pi,
#     e.g. Ryer, Light Measurement Handbook, 1997, ch. 6; one bounce; theta_v from the hit triangle's normal). rho: the hall's
#     column albedo 0.2867 for steel, machine 0.1583, press 0.0407 (hall json); the roof deck, space frame, runways and walls
#     carry the column's 0.2867 (ASSUMED: the same grey steel). The truss lamps and the lasers are not counted (not this layer).
#   A B380F is scored per eye by G, first-order single scattering per unit beam flux (moxir_v2_true.glow: the one machine's
#     two-zone haze at 40 min, Henyey-Greenstein g 0.74, the beam's own extinction, the eye's line of sight cast against the hall).
#   DEPTH LAYERS: every lit point and every beam sample is binned by its distance from the eye: 0-12, 12-25, 25-40, >= 40 m. The
#     objective is the sum over eyes and bins of sqrt(light in that bin): diminishing returns per eye AND per depth layer, so one
#     bright cluster loses to the same light spread into the steel at several depths (a stated design metric, not a luminance).
#   GROUND: every lamp of this layer stands on the floor: a PAR body at 0.31 m (v1.1's floor bracket), a B380F base on the floor
#     (its tilt axis 0.5 m up: occlusion_sky.HEAD_Y). Nothing on a column, an arch, the roof or a machine top.
#   PAR SPACING (the owner: "washs are so close"): no two ground PARs closer than PAR_MIN_SPACING_M = 6.0 m. The structure: the
#     columns stand 6 m apart along a row, so at most one PAR per column foot (the joint pair z +-0.5 is one foot); a 15 deg cone
#     lights a 2.85 m disc on the space frame at 10.8 m, so pools 6 m apart keep a dark gap >= 3.1 m: steel lit in pieces. The
#     scores: build() runs the whole pick at 0 / 3 / 5 / 6 / 7 / 8 m and writes the curve; 6 m is its knee.
#   COVERAGE (the owner: "use the left places of the area"): the PAR pick is two-phase. First the maximal covering location greedy
#     (Church & ReVelle 1974): every painted place gets a lit PAR within one roof height (PAR_COVER_R_M = 10.8 m, at most ~45 deg up
#     from a standing eye), each pick the lamp that covers the most still-uncovered cells (ties: the eye objective), among lamps
#     that light something an eye sees; then the remaining picks by the eye objective. Its cost against the eye objective alone is
#     written into the rig (par_coverage.plain_greedy_6m).
#   PAR PLACES: every face of every column foot in the painted area (nave, span, entry and stage faces; 0.44 m off the face,
#     leaned 4 deg onto it, v1.1's vista bracket), a 3 m floor grid aimed straight up into the roof steel (not in the dance floor,
#     the entry corridor, the FOH riser, a machine, the bar / chill zones or the entry-laser tower's pen), the same floor places
#     3-9 m off a column row aimed instead at the crane runway girder (7.5 m) or the nearest column's flared head (6.6 m), and
#     the three v1.1 embers that stand inside the machines at <= 0.3 m. ONE DJ key on the floor of the pit, in the only gap that sees him past the two PA boxes (a ground
#     OPTION: "combine with the truss DJ light").
#   BEAM PENS: a ground beam is below a raised hand (2.8 m, the brief) for its first metres; outside its pen it must stay >= 3.0 m
#     over every standing level (the v2 rule, moxir_v2.low_over_standing: the floor 0, the DJ step 0.4, the FOH riser 0.6; the
#     lower edge = the axis less 0.9 deg half beam + 0.5 deg aim tolerance). So the pen is where the lower edge is under 3.0 m
#     (it contains the 2.8 m one, both reported), kept BARRIER_REACH_M = 0.6 m (ASSUMED: a hand over a 1.1 m barrier; the Purple
#     Guide is owed) inside a fenced ISLAND. Islands: the stage pen (crew only, the six plane-1 heads around the smoke machine, as
#     B tuned) + three fenced islands of four heads, chosen from candidate islands on the column lines (each side of a row,
#     between two columns: the columns anchor the barrier), the stage edge (pens that share one side with the stage pen's own
#     barrier) and free 5 x 5 m squares in the painted area; fenced islands >= 15 m apart. No island in the dance floor, the
#     entry corridor, the FOH riser, the crane park or the entry-laser tower's pen. The hall's walls lie 6-36 m outside the
#     painted area, so no pen uses a wall line (the spread's rule kept: no unit outside the paint).
#   BEAM AIMS: per head, every direction az 0..345 / el 35..80 (15 x 5 deg), the best refined (3 x 1.5 deg); refused when: the
#     pen leaves its island; it ends in glass, a lantern frame, people, a crane (the free crane at z -12 and its laser hang) or the
#     crane park volume (x -12..12, z -2..7, 2.5..10.8 m); it ends in the bar or the chill + food zone or on the entry wall (the
#     LA40WF builder's area and the door); it comes within 1 m of a laser unit (the entry lasers' KO-1 box, #873, or the cubes'
#     box on the free crane) or ends within 3 m of a far-wall laser termination block (both margins ASSUMED); its throw is under
#     8 m; an eye (the 9 + the DJ) looks down it within 30 deg (eyes.py GLARE_DEG: forward scatter at g 0.74). The ring of 8 rays
#     at the 0.9 deg half beam is checked the same way.
#   SKY (occlusion_sky.sky, 1200 equal-area rays from the head): per head slot, the share of its sky that is clear >= 30 m, ends
#     on the roof steel, or is blocked (crane, runway, columns, walls, the keep-outs). Under a 10.8 m roof every steep direction
#     ends on the roof within 30 m, so "clear" is ~16-24 % at every floor place and barely separates them; the island choice uses
#     the OPEN share (clear + roof: where a moving head's beam runs free until the roof steel).
#   SELECTION: greedy on the objective (above). Beams: the stage pen's six first, then, three times, the island whose best four
#     heads score most: their objective gain x their mean open sky share (a moving head with more open sky keeps more of its
#     movement usable; a stated design weight). PARs: the DJ key first, then 37 by the two-phase pick (COVERAGE) under the
#     spacing rule (38 ground PARs).
#   POWER / DMX: 16 A radials <= 2 944 W from the nearest v1.1 distro, split also where the chain's volt drop would pass 5 % with
#     4 mm2 (BS 7671 Table 4D2B; Appendix 4, 6.4); DMX lines <= 32 devices (ANSI E1.11 / EIA-485) and <= 512 channels, from the
#     nearest v1.1 node and its ports. The cut's 10 PARs, the smoke machine and the cubes keep theirs in the plan.
import argparse, copy, json, math, os, subprocess, sys

for _k in ('OMP_NUM_THREADS', 'OPENBLAS_NUM_THREADS', 'MKL_NUM_THREADS'):
    os.environ.setdefault(_k, '1')          # heat rule (owner 10-09): one BLAS thread

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.dont_write_bytecode = True

DATE = '2026-10-09'
RIG_SP = 'scripts/place/rigs/moxir-v2-spread-%s.json' % DATE
LAYER = 'scripts/place/rigs/moxir-v2-ground-layer-%s.json' % DATE
RIG_GR = 'scripts/place/rigs/moxir-v2-ground-%s.json' % DATE
ZONES = 'scripts/place/rigs/moxir-v2-zones-%s.json' % DATE
OWNER_WORDS = ('and also other washes and beams what we dont use make on the ground, not on the arcs, and also washs are so close on the '
               'ground for now you can use the left places of the area so we need epic thing you know use space right')
EMBER, ASH = '#ff3a12', '#e8e4dc'
R3 = lambda v: round(float(v), 3)
JD = lambda o: o.item() if hasattr(o, 'item') else (o.tolist() if hasattr(o, 'tolist') else str(o))

EYES = {
    'floor centre': (-3.75, 1.7, 18.1),          # the floor frame's camera
    'wing L': (-20.0, 1.7, 8.0),                 # the wingL frame's camera
    'wing R': (18.0, 1.7, 8.0),                  # the wingR frame's camera
    'behind the stage': (-4.0, 1.7, -22.0),      # the behind frame's camera
    'mid-hall': (-2.0, 1.7, 36.0),
    'near the entry': (0.0, 1.7, 51.5),          # the entry frame's camera (the door)
    'FOH': (-5.2, 2.3, 29.0),                    # on the 0.6 m riser
    'far corner L': (-24.0, 1.7, -24.0),
    'far corner R': (18.0, 1.7, -22.0),
}
DJ_EYE = (-5.2, 2.03, 4.3)
DEPTH_EDGES = (12.0, 25.0, 40.0)
DEPTH_NAMES = ('0-12 m', '12-25 m', '25-40 m', '>= 40 m')

GROUND_MAX_Y = 1.0
PAR_Y = 0.31
HEAD_Y = 0.5
# PAR SPACING (2026-10-10, continuation): 6.0 m = the column pitch along a row (at most one PAR per column foot; the joint pair
# at z +-0.5 is one foot) AND the knee of the score curve: the greedy's objective, against no rule, is -9 % at 5 m, -12 % at 6 m,
# -24 % at 7 m, and at 8 m only 34 of the 37 places fit (build() recomputes this curve and writes it into the rig).
PAR_MIN_SPACING_M = 6.0
# COVERAGE (the owner: "use the left places of the area"): every place of the painted area has a lit PAR within one roof height
# (10.8 m, the space frame's bottom chord, hall json truss_bottom_m): from a standing eye that lit steel is at most ~45 deg up.
PAR_COVER_R_M = 10.8
SPACING_CURVE_M = (0.0, 3.0, 5.0, 6.0, 7.0, 8.0)
# THE ENTRY LASERS (#873, scripts/place/rigs/moxir-v2-entry-lasers-2026-10-09.json on feat/moxir-entry-lasers-2026-10-09, a30b4757):
# two UP-LA40WF on a ground-supported truss tower, house left at the column line z 48; their beams end on the far end wall's
# matte block. Their own keep-out boxes, as written there: KO-1 the units + T-bar, KO-2 the tower + its pen on the floor.
ENTRY_LASERS = {
    'source': 'scripts/place/rigs/moxir-v2-entry-lasers-2026-10-09.json @ a30b4757 (PR #873), keep_out.boxes + fixtures',
    'ko1': {'x_m': (-8.654, -6.834), 'y_m': (5.776, 6.471), 'z_m': (47.95, 48.605)},
    'ko2': {'x_m': (-10.244, -5.244), 'y_m': (0.0, 6.471), 'z_m': (45.778, 50.778)},
    'apertures': [[-8.094, 5.944, 48.0], [-7.394, 5.944, 48.0]],
    'far_wall_blocks': [[-6.794, 6.669, -53.8], [-6.619, 6.669, -53.8]],
}
APERTURE_PAD_M = 1.0          # ASSUMED: no B380F ray within 1 m of a laser unit's box (KO-1, the cubes' box): never into an aperture
BLOCK_FREE_M = 3.0            # ASSUMED: no B380F beam ends within 3 m of a far-wall laser termination block (no pool on it)
# THE CUBES (N464, #873's world): moving to sit ON the free crane at z -12, a keep-out box on its bridge top (x +-11.35, y 8.3-9.4),
# over its girders (z -12 +- 1.1, 0.7 m wide). Another workflow owns them: here they are only a place no beam may end or pass near.
CUBES_TOP = {'x_m': (-11.35, 11.35), 'y_m': (8.3, 9.4), 'z_m': (-13.45, -10.55)}
KEEP_OUT_CLS = ('laser tower', 'laser aperture')
BEAM_WORLD = ('v2 night world (free crane z -12 + its laser hang) + the crane park as a solid (B\'s fan: its air open, fan_world) + the entry-laser '
              'tower and its units padded 1 m (#873) + the cubes on the free crane padded 1 m (N464) + no end within 3 m of a far-wall laser block (2026-10-10, fix 2)')   # refused for a beam; not an obstacle to an eye (a mast + a low pen, not a wall)
ROOM_LEVEL_EXP = 1            # the room draws a look's level ONCE since the #868 fix (cherry-picked here): E x level, not level^2
TRUSS_RESERVED = 10                         # the lead (2026-10-10): the truss keeps 10 PARs, so the ground has 40 (none held back)
GROUND_PARS = 40
STAGE_PEN_HEADS = 6
ISLANDS = 4                                 # 2026-10-10 fix: 4 fenced pens of 3 heads (a3_islands.py: +20 % beam glow at the crowd over 3 x 4, one more corner of the area used)
HEADS_PER_ISLAND = 3
ISLAND_MIN_GAP_M = 15.0
BARRIER_REACH_M = 0.6
CLEAR_OVER_M = 3.0
HAND_M = 2.8
LOW_EDGE_DEG = 0.9 + 2.0                   # half beam + AIM_TOL_DEG (2026-10-10 fix; was + 0.5): see the FIX block below
GLARE_DEG = 30.0
DJ_RULE_DEG = 20.0
MIN_THROW_M = 8.0
PAR_I = 11000.0
PAR_LENS_DEG = 15.0
PAR_THROW_M = 30.0
CRANE_PARK = {'x_m': (-12.0, 12.0), 'z_m': (-2.0, 7.0), 'y_m': (2.5, 10.8),
              'why': 'the near crane + the cut truss move inside it (another workflow, "half behind the DJ"): no unit above 2.5 m there and no beam through it'}
CRANE_PARK_NAME = 'the crane park zone (x -12..12, z -2..7, 2.5-10.8 m)'
ALBEDO = {'column': 0.2867, 'column head': 0.2867, 'upper column': 0.2867, 'machine': 0.1583, 'press': 0.0407}
ALBEDO_STEEL_ASSUMED = 0.2867
LIT = {'column', 'column head', 'upper column', 'space frame', 'roof deck', 'runway', 'crane', 'steel', 'end wall', 'side wall', 'block wall', 'machine'}
BAD_END = {'lantern glass', 'wall glass', 'lantern frame', 'audience', 'dj', 'crane', 'crane park', 'pa', 'barrier', 'foh', 'booth', 'floor'} | set(KEEP_OUT_CLS)
EYE_SKIP = ('crane park',) + KEEP_OUT_CLS   # what an eye's line of sight (and a PAR's light) passes through
DANCE = {'x_m': (-11.0, 3.5), 'z_m': (8.2, 28.0)}                      # the v1.1 dance floor (stage json floor): the crowd's core
ENTRY_CORRIDOR = {'x_m': (-5.0, 5.0), 'z_m': (28.0, 54.0)}            # from the door to the floor, between the chill and the bar
FOH_RISER = {'x_m': (-6.7, -3.7), 'z_m': (28.0, 30.0)}
PIT_GAP = {'x_m': (-6.5, -2.9), 'z_m': (5.65, 8.2)}                   # between the PA boxes, the booth front and the barrier
POWER_W = {'up-b380f': 500, 'up-pl5403': 200, 'up-yz31p': 1500, 'ext-lc-ultra-mk2': 120}
CIRCUIT_W = 2944
DMX_FOOT = {'up-b380f': 16, 'up-pl5403': 8, 'up-yz31p': 1}

# ====================================================================== 2026-10-10 FIX: what the two reviews of #875 asked for
# The rules now in force, each with its source or marked ASSUMED (a choice). The reviews: owner fidelity (N465: epic from where
# the audience stands) and safety (the floor units). A first fix run (wf_69d9a387-e39) wrote rules 1-7 below and was cut off
# before it built; this run (2026-10-10 afternoon) re-checked them and changed 2, 3, 4, 5 and 7 (marked "now").
# 1. EPIC FROM WHERE THE AUDIENCE STANDS. The nine eyes are WEIGHTED by the people each stands for: the painted cells (hot,
#    wings, bar, chill; not the stage pen) nearest to that eye (a Voronoi share), each cell at a planning density: the dance
#    floor 2 persons/m2 (the Green / Purple Guide planning figure MOXIR.md 5.3 names), every other painted cell 0.5 persons/m2
#    (ASSUMED: a quarter of it; the crowd plan, owed to the promoter's safety lead, replaces both). Weights average 1. The
#    objective is then sum_e w_e sum_bins sqrt(light). Now also: (a) THE EMBER FAN behind the DJ is B's, as the owner saw and kept
#    it on 10-09 (the spread's six plane-1 heads, the same place and aim, FAN_FROM_SPREAD): not re-aimed; (b) at least one fenced
#    pen stands in the ENTRY HALF (centre z >= ENTRY_HALF_Z: the far side of the floor centre, toward FOH and the door); (c) the
#    peak look's levels are raised to the floor glare budget (0.65 % white-out), measured.
DENSITY_DANCE = 2.0
DENSITY_REST = 0.5
FAN_FROM_SPREAD = True
ENTRY_HALF_Z = 24.0
# 2. THE PENS HOLD A MOVING HEAD'S WHOLE DESK WINDOW (MOXIR.md 5.3: "movers' pan/tilt limited in the desk"). Each head's desk
#    limits: pan +-PAN_WIN_DEG around its aim, tilt from its aim (the lowest it may go) up to +TILT_UP_DEG (ASSUMED: room for a
#    slow sweep). They are written per head as data the desk enforces (desk_limits: fixture-frame degrees from home, as
#    fixture-lib.mjs defines them, and the 16-bit DMX range dmxDecode.js maps them to: centre 32768 = home, 540 / 270 deg, the
#    maker's EXACT range; the B380F's channel walk is owed, so the DMX numbers are EQUIVALENT until it is done). Every rule (pen,
#    ends, keep-outs, glare, crew) is checked over the whole window: pans every WINDOW_STEP_DEG, tilts WINDOW_TILTS. The pen's
#    lower edge leaves the lens's lowest point (APERTURE_R_M: the B380F's 160 mm lens, fixtures-exact.md) at the half beam
#    (0.9 deg) + AIM_TOL_DEG (ASSUMED: the base levelled to +-1 deg on its fixed plate + the head's repeat after a reset +-1 deg),
#    sampled every 0.01 m. A higher tilt only shortens a low run, so the pen is checked at the tilt limit for every pan.
#    Now also: every head stands >= HEAD_REACH_M from its pen's barrier (ISO 13857:2019 Table 2, high risk, reaching over a
#    1.0-1.2 m structure to a 0.6-0.8 m high hazard: c = 1.3-1.5 m, as reproduced in the Troax Safety Guide: EQUIVALENT until read
#    in the standard itself; a moving head is high risk: a moving yoke and a hot lamp housing).
#    THE BASE: each B380F base (460 x 310 mm, 23 kg, 690 mm high: the maker's page, fixtures-exact.md) bolted through its two
#    clamp points to a 600 x 600 x 18 mm plywood floor plate, the plate ballasted with 2 x 15 kg sandbags on its corners (or, with
#    the venue's written OK, 4 concrete anchors instead), levelled to +-1 deg with shims and an inclinometer at the focus call.
#    The method is MOXIR.md 5.2's for ground support (base plates, ballast, a stability check: ANSI E1.21's practice, a factor of
#    1.5 against overturning); the check (statics, BASE_* below) is written into each head. The clamp points are ASSUMED until
#    the B380F's manual is found (fixtures-exact.md: not on disk; ask Poligraf).
AIM_TOL_DEG = 2.0
APERTURE_R_M = 0.08
PEN_STEP_M = 0.01
PAN_WIN_DEG = 10.0
TILT_UP_DEG = 15.0
WINDOW_STEP_DEG = 2.5
WINDOW_PANS = tuple(float(v) for v in (-10.0, -7.5, -5.0, -2.5, 0.0, 2.5, 5.0, 7.5, 10.0))
WINDOW_TILTS = (0.0, 5.0, 10.0, 15.0)
HEAD_REACH_M = 1.5
BASE = {'plate_m': [0.6, 0.6, 0.018], 'plate_kg': 4.5, 'sandbags_kg': [15.0, 15.0], 'head_kg': 23.0, 'head_h_m': 0.69, 'base_m': [0.46, 0.31],
        'factor': 1.5, 'anchors_alternative': '4 x M10 concrete anchors through the plate, with the venue\'s written OK',
        'source': 'MOXIR.md 5.2 (base plates, ballast, a stability check; ANSI E1.21 practice, factor 1.5 against overturning); the B380F body: the maker\'s page (fixtures-exact.md, EXACT); the plate and bags ASSUMED'}
# 3. NOBODY LOOKS DOWN A BEAM WITHIN 30 deg, OVER THE WHOLE PUBLIC FLOOR (eyes.py GLARE_DEG: forward scatter at g 0.74). Now:
#    a DENSE grid of standing eyes: every public place (painted hot, wings, bar, chill; not the stage pen, a fenced pen or a
#    machine) at FIELD_STEP_M (0.5 m in the build's check and the test, 1 m while scoring candidates), at EYE_YS (1.5, 1.7 and
#    1.9 m: a short adult to a tall adult's standing eye, ISO 7250-1 / Pheasant's Bodyspace range; + 0.6 m on the FOH riser),
#    every beam over its whole desk window. The angle is taken at the beam's start (along a straight beam the angle to a fixed
#    eye only grows, so the head is the worst point). The build writes the % of the public floor area that fails; target 0.
EYE_YS = (1.5, 1.7, 1.9)
FIELD_EYE_Y = 1.7
FIELD_STEP_M = 0.5
# 4. CREW IN THE STAGE PEN (now): B's fan sends its low runs (under 3.0 m) forward into a strip in front of the six heads. Every
#    low run of every stage-pen head, over its whole window, stays inside FAN_STRIP (marked on the stage floor: crew never walk
#    in it), >= SMOKE_SERVICE_R_M from the smoke machine's refill point (its back, the rig note "refills from behind the stage"),
#    and the crew route from the stage pen's back to the booth (CREW_LANES: the back lane behind the machine and the house-right
#    side, ASSUMED: the stage manager's plan replaces them) stays >= CREW_GAP_M clear of the strip. The B380F's IEC 62471 hazard
#    distance is not published (fixtures-exact.md): owed; until it is, the 3.0 m line, the strip and the lanes are the controls.
SMOKE_SERVICE_R_M = 1.0
SMOKE_SERVICE = (-4.75, -6.7)     # where the crew stand to refill: the machine (-4.75, 1.0, -6.2) from behind (ASSUMED 0.5 m behind it)
FAN_STRIP = {'x_m': (-9.0, -0.4), 'z_m': (-5.4, -2.5)}
CREW_LANES = {'back lane (to the smoke machine\'s refill side)': {'x_m': (-10.5, 1.5), 'z_m': (-7.5, -6.6)},
              'house-right lane (back to the booth)': {'x_m': (0.0, 1.5), 'z_m': (-7.5, -2.0)}}
CREW_GAP_M = 0.3
# 5. NO STANDING EYE IN A FLOOR PAR'S BEAM (now): a cage stops a hand, not a look. Every floor PAR stands where no public eye
#    can be inside its beam, at any distance (no limit is relied on): its cone (15 deg + PAR_AIM_TOL_DEG, from its lens disc
#    PAR_LENS_R_M) never holds a point at EYE_YS heights within LEAN_M of a public place (a head leaning 0.5 m over a 1.1 m
#    barrier, ASSUMED). So a PAR stands (a) in the stage pen (crew), (b) inside a machine's footprint (the embers), (c) inside a
#    fenced beam pen, or (d) in its own PAR PEN: a fenced rectangle (crowd barrier, 1.1 m) round the floor its beam crosses under
#    1.9 m plus LEAN_M, never smaller than 2 x PAR_PEN_HALF_MIN_M square (ASSUMED: the lamp >= 1 m from the barrier; a PAR is
#    low risk: no moving part, no hot surface). MOXIR.md 5.3: floor fixtures within 2 m of the crowd stand in a pen with a
#    steward: each PAR pen is on the stewards' round. No PAR pool on the bar or chill; no pen on the dance floor, the entry
#    corridor, the FOH riser, the entry-laser tower's pen, or within PEN_GAP_M of another pen's barrier.
PAR_AIM_TOL_DEG = 1.0
PAR_LENS_R_M = 0.105               # the PAR's array about 210 mm (fixtures-exact.md, its far-field note)
PAR_EYE_TOP_M = 1.9
LEAN_M = 0.5
PEN_LEAN_M = LEAN_M
PAR_PEN_HALF_MIN_M = 1.0
PEN_GAP_M = 1.0
BARRIER_FOOT_M = 0.75
# 6. THE CROWD IS NOT SEE-THROUGH. The PARs' scores: a lit point under CROWD_TOP_M (the brief's people: 1.9 m heads + 0.5 m
#    arms) over a public cell is not seen from an eye more than CROWD_SEE_M away (the crowd stands between).
CROWD_TOP_M = 2.4
CROWD_SEE_M = 3.0
# 7. THE STAGE FRONT FROM THE GROUND (the lead: the truss keeps 10 PARs, the speaker-face and key lamps come down to the floor;
#    now the levels and places are set for lux FLOORS: the stage front as the owner saw it in the spread on 10-09, as the room
#    drew it then: DJ face 44 lx, booth front 31 lx, PA L face 35 lx, PA R face 35 lx at the peak and 19 lx in the dark look
#    (moxir-v2-spread review.stage_light_after.room_30478cd). OUT OF REACH (ISO 13857:2019 Table 2, high risk, a 0.4-0.6 m high
#    lamp behind a 1.0 m barrier: c = 1.4 m, the same reproduction): the DJ key and the booth-front lamp stand in the gap between
#    the PA boxes, 1.71 and 1.46 m behind the barrier line (z 8.16); one 15 deg PAR cannot hold both (they are 14.7 deg apart
#    from the floor), so each has its own. The PA faces are 0.96 m (PA R) and 1.46 m (PA L) from the barrier, and a PAR must stand in
#    front of a face to light it, so their lamps cannot be out of reach from the floor with this barrier line: they stand at the
#    pit's ENDS, beside (not in front of) their box (MOXIR.md 5.3: "nothing on the floor between the PA and the barrier"), as far
#    back as still lights the face, under a mesh guard, the pit's security as the steward. Flagged (owed): the barrier 1 m
#    further out (the crowd-safety lead), or these two faces from the truss.
STAGE_FRONT = {
    'key': {'p': [-4.5, 0.31, 6.45], 'targets': ('DJ face',), 'aim': [-5.2, 1.9, 4.6],
            'why': 'the gap between the PA boxes (x -6.5..-2.9), 1.71 m behind the barrier line (z 8.16: out of reach, ISO 13857 1.4 m), behind their front line: the only floor place that sees the DJ past both boxes'},
    'booth': {'p': [-3.15, 0.31, 6.7], 'targets': ('booth front',), 'aim': [-5.2, 1.0, 5.3],
              'why': 'the far corner of the same gap (beside the PA R box, 1.46 m behind the barrier: out of reach), the longest throw the gap gives to the booth front (2.6 m); its own lamp: from the floor the DJ face and the booth front are 14.7 deg apart, more than one 15 deg PAR holds'},
    'PA L': {'p': [-10.25, 0.31, 7.0], 'targets': ('PA L face',), 'aim': [-8.25, 1.0, 6.75],
             'why': 'the house-left end of the pit, beside the PA L box (x < -10.0), 1.16 m behind the barrier (inside the 1.4 m reach: mesh guard + the pit\'s security), raking across its face'},
    'PA R': {'p': [0.2, 0.31, 7.6], 'targets': ('PA R face',), 'aim': [-0.9, 0.7, 7.25],
             'why': 'the house-right end of the pit, beside the PA R box (x > -0.1), 0.56 m behind the barrier (inside the 1.4 m reach: mesh guard + the pit\'s security); aimed into the face so the whole beam ends on the box before it rises to a leaning eye (searched: a5_par.py, the only pit-end aims that keep every eye out)'},
}
STAGE_FRONT_FLOORS_LX = {'peak': {'DJ face': 44.0, 'booth front': 31.0, 'PA L face': 35.0, 'PA R face': 35.0},
                         'dark': {'DJ face': 44.0, 'booth front': 31.0, 'PA L face': 35.0, 'PA R face': 19.0}}
STAGE_FRONT_SOURCE = 'moxir-v2-spread-2026-10-09.json review.stage_light_after.room_30478cd (the stage front the owner saw on 10-09, rounded down)'
BARRIER_Z = 8.16
OUT_OF_REACH_M = 1.4
STAGE_FRONT_PART = 'stage front (ground)'
# 8. POWER AND DMX HEADROOM (now): every circuit <= CIRCUIT_W (80 % of a 16 A radial), every DMX line <= DMX_MAX_DEVICES (ASSUMED:
#    4 of the 32 unit loads EIA-485 / ANSI E1.11 allow kept spare for a swap or the truss's lamps changing) and <= 512 channels.
DMX_MAX_DEVICES = 28
TRUSS_SPARE_DEVICES = 2            # a line that carries the truss's lamps keeps 2 more spare (the truss may grow to 11-12 PARs: the crane-dj-light design asks 11); its PARs on their own power circuit


def unit(v):
    import numpy as np
    v = np.asarray(v, float)
    return v / np.linalg.norm(v)


def dir_of(az, el):
    import numpy as np
    a, e = math.radians(az), math.radians(el)
    return np.array([math.cos(e) * math.sin(a), math.sin(e), math.cos(e) * math.cos(a)])


def az_el(d):
    return R3(math.degrees(math.atan2(d[0], d[2])) % 360), R3(math.degrees(math.asin(max(-1.0, min(1.0, d[1])))))


def rot_for_dir(d):
    import lights_beta_options as L
    return L.rot_for_dir(d)


def aim_dir(r):
    import lights_beta_options as L
    return L.aim_dir(r)


def inside_rect(x, z, R, margin=0.0):
    return R['x_m'][0] + margin <= x <= R['x_m'][1] - margin and R['z_m'][0] + margin <= z <= R['z_m'][1] - margin


# ====================================================================== 2026-10-10 FIX: the rules' geometry (the FIX block above)
_W_EYE = None                  # the eye weights (FIX 1), set by set_eye_weights(); None = every eye 1 (the old objective)


def set_eye_weights(w):
    global _W_EYE
    import numpy as np
    _W_EYE = None if w is None else np.asarray(w, float)


def eye_weights(A, G):
    """FIX 1: the people each of the nine eyes stands for. Every painted 1 m cell people may stand on (hot, wings, bar, chill;
    not the stage pen, not inside a machine) goes to its nearest eye; a dance-floor cell counts DENSITY_DANCE persons, any
    other DENSITY_REST. Returns (weights averaging 1, a table per eye)."""
    import numpy as np
    cells = people_cells(A, G)
    names = list(EYES)
    P = np.asarray([[EYES[e][0], EYES[e][2]] for e in names], float)
    near = np.argmin(np.hypot(cells[:, None, 0] - P[None, :, 0], cells[:, None, 1] - P[None, :, 1]), axis=1)
    dance = np.array([inside_rect(x, z, DANCE) for x, z in cells])
    dens = np.where(dance, DENSITY_DANCE, DENSITY_REST)
    people = np.array([float(dens[near == k].sum()) for k in range(len(names))])
    w = people / people.mean()
    table = {e: {'cells': int((near == k).sum()), 'dance_floor_cells': int(((near == k) & dance).sum()), 'people': R3(people[k]), 'weight': R3(w[k])}
             for k, e in enumerate(names)}
    return w, table


_PEOPLE = {}


def people_cells(A, G):
    """Every painted 1 m cell people may stand on: hot, wings, bar, chill; not the stage pen (crew), not inside a machine.
    A cell is the row's z (a cell centre) and an integer x of its runs (the zones file's 1 m grid)."""
    import numpy as np
    key = id(A)
    if key in _PEOPLE:
        return _PEOPLE[key]
    seen, out = set(), []
    for zid in ('hot', 'use', 'bar', 'chill'):
        for row in A.Z.areas[zid]:
            for x0, x1 in row['x_runs']:
                for x in range(int(round(x0)), int(round(x1)) + 1):
                    k = (x, row['z'])
                    if k in seen:
                        continue
                    seen.add(k)
                    if inside_rect(x, row['z'], A.stage_pen) or massing_hits(G, x, row['z'], 0.0, 1.0, 0.0):
                        continue
                    out.append(k)
    _PEOPLE[key] = np.asarray(out, float)
    return _PEOPLE[key]


def public_points(A, G, exclude=(), step=1.0):
    """FIX 3 + 5: the plan points where a standing person's feet may be: every public 1 m cell (people_cells) split into
    (1 / step)^2 sub-cells at `step` spacing, less the rects in `exclude` (the fenced pens). Returns an (n, 2) array (x, z)."""
    import numpy as np
    C = people_cells(A, G)
    n = max(1, int(round(1.0 / step)))
    offs = (np.arange(n) + 0.5) / n - 0.5
    ox, oz = np.meshgrid(offs, offs)
    P = (C[:, None, :] + np.stack([ox.ravel(), oz.ravel()], axis=1)[None, :, :]).reshape(-1, 2)
    keep = np.ones(len(P), bool)
    for R in exclude:
        keep &= ~((P[:, 0] >= R['x_m'][0]) & (P[:, 0] <= R['x_m'][1]) & (P[:, 1] >= R['z_m'][0]) & (P[:, 1] <= R['z_m'][1]))
    return P[keep]


def public_eyes(A, G, exclude=(), ys=EYE_YS, step=1.0):
    """FIX 3: one standing eye per public plan point (public_points) at each height of `ys` (+ 0.6 m on the FOH riser).
    Returns an (n, 3) array."""
    import numpy as np
    P = public_points(A, G, exclude, step)
    riser = (P[:, 0] >= FOH_RISER['x_m'][0]) & (P[:, 0] <= FOH_RISER['x_m'][1]) & (P[:, 1] >= FOH_RISER['z_m'][0]) & (P[:, 1] <= FOH_RISER['z_m'][1])
    out = [np.column_stack([P[:, 0], y + np.where(riser, 0.6, 0.0), P[:, 1]]) for y in ys]
    return np.vstack(out)


def field_glare(p, D, E):
    """FIX 3: per direction of D, the smallest angle (deg) between it and the line from the head p to any eye of E."""
    import numpy as np
    D = np.atleast_2d(np.asarray(D, float))
    V = np.asarray(E, float) - np.asarray(p, float)
    V = V / np.maximum(np.linalg.norm(V, axis=1, keepdims=True), 1e-9)
    c = D @ V.T
    return np.degrees(np.arccos(np.clip(c.max(axis=1), -1.0, 1.0)))


def field_glare_cells(p, D, E):
    """FIX 3: per eye of E, the smallest angle (deg) between any direction of D and the line from the head p to that eye."""
    import numpy as np
    D = np.atleast_2d(np.asarray(D, float))
    V = np.asarray(E, float) - np.asarray(p, float)
    V = V / np.maximum(np.linalg.norm(V, axis=1, keepdims=True), 1e-9)
    return np.degrees(np.arccos(np.clip((D @ V.T).max(axis=0), -1.0, 1.0)))


def window_glare(head, d, WD, E):
    """field_glare over a whole window, the same minimum, faster: an eye whose angle to the aim is at least GLARE_DEG + the window's
    largest angle from the aim + 5 deg cannot come within GLARE_DEG of any window direction, so only the others are measured
    (exact by the triangle inequality on the sphere; the min is reported only below that bound)."""
    import numpy as np
    E = np.asarray(E, float)
    V = E - np.asarray(head, float)
    V = V / np.maximum(np.linalg.norm(V, axis=1, keepdims=True), 1e-9)
    a0 = np.degrees(np.arccos(np.clip(V @ np.asarray(d, float), -1.0, 1.0)))
    dev = float(np.degrees(np.arccos(np.clip(np.asarray(WD) @ np.asarray(d, float), -1.0, 1.0))).max())
    near = a0 < GLARE_DEG + dev + 5.0
    if not near.any():
        return float(max(0.0, a0.min() - dev))
    return float(field_glare(head, WD, E[near]).min())


def window_dirs(d, pans=None, tilts=(0.0,)):
    """FIX 2: the desk window of an aim: each pan of `pans` (default WINDOW_PANS) around it, at its elevation (the tilt limit)
    + each of `tilts`."""
    import numpy as np
    az, el = az_el(d)
    pans = WINDOW_PANS if pans is None else pans
    return np.array([dir_of(az + pa, min(el + ti, 89.5)) for ti in tilts for pa in pans])


def levels_at(qx, qz):
    """level_at, vectorised: the standing level under each plan point (the DJ step 0.4, the FOH riser 0.6, else the floor)."""
    import numpy as np
    qx, qz = np.asarray(qx, float), np.asarray(qz, float)
    lv = np.zeros(qx.shape)
    lv = np.where((-6.7 <= qx) & (qx <= -3.7) & (3.65 <= qz) & (qz <= 5.65), 0.4, lv)
    lv = np.where((FOH_RISER['x_m'][0] <= qx) & (qx <= FOH_RISER['x_m'][1]) & (27.0 <= qz) & (qz <= 31.0), 0.6, lv)
    return lv


def _rect_gap(px, pz, R):
    """Plan distance from points to a rect (0 inside)."""
    import numpy as np
    dx = np.maximum(np.maximum(R['x_m'][0] - px, px - R['x_m'][1]), 0.0)
    dz = np.maximum(np.maximum(R['z_m'][0] - pz, pz - R['z_m'][1]), 0.0)
    return np.hypot(dx, dz)


def low_run(p, d, t, rect, crew=False):
    """FIX 2: one beam direction's run under 3.0 m (and 2.8 m) over the standing level, its lower edge leaving the lens's
    lowest point (APERTURE_R_M under the axis) at LOW_EDGE_DEG under it, sampled every PEN_STEP_M to its first hit. ok = every
    sample under 3.0 m stands inside `rect` less BARRIER_REACH_M; crew (the stage pen, FIX 4) = also inside FAN_STRIP, >=
    SMOKE_SERVICE_R_M from the smoke machine's refill point and >= CREW_GAP_M from every crew lane. Returns a dict (r30, r28 =
    plan reach of each)."""
    import numpy as np
    p, d = np.asarray(p, float), np.asarray(d, float)
    k = float(d[1]) - math.tan(math.radians(LOW_EDGE_DEG))
    if k <= 1e-3:
        return {'ok': False, 'r30': 99.0, 'r28': 99.0, 'seg': None, 'crew_ok': False, 'barrier_gap_m': -9.9, 'why': 'never climbs'}
    smax = min(max(t, 0.5), (CLEAR_OVER_M + 0.6 + APERTURE_R_M - p[1]) / k + 0.05)
    s = np.arange(0.0, smax + 1e-9, PEN_STEP_M)
    q = p + d * s[:, None]
    lo = q[:, 1] - s * math.tan(math.radians(LOW_EDGE_DEG)) - APERTURE_R_M
    lv = levels_at(q[:, 0], q[:, 2])
    u30 = lo - lv < CLEAR_OVER_M
    u28 = lo - lv < HAND_M
    hor = np.hypot(q[:, 0] - p[0], q[:, 2] - p[2])
    r30 = float(hor[u30].max()) if u30.any() else 0.0
    r28 = float(hor[u28].max()) if u28.any() else 0.0
    (x0, x1), (z0, z1) = rect['x_m'], rect['z_m']
    m = BARRIER_REACH_M
    qx, qz = q[u30, 0], q[u30, 2]
    ok = bool(np.all((qx >= x0 + m) & (qx <= x1 - m) & (qz >= z0 + m) & (qz <= z1 - m)))
    edge = float(np.min(np.minimum(np.minimum(qx - x0, x1 - qx), np.minimum(qz - z0, z1 - qz)))) if u30.any() else 9.9
    crew_ok, smoke_gap, lane_gap = True, None, None
    if crew and u30.any():
        sx, sz = SMOKE_SERVICE
        smoke_gap = float(np.min(np.hypot(qx - sx, qz - sz)))
        lane_gap = min(float(np.min(_rect_gap(qx, qz, R))) for R in CREW_LANES.values())
        in_strip = bool(np.all((qx >= FAN_STRIP['x_m'][0]) & (qx <= FAN_STRIP['x_m'][1]) & (qz >= FAN_STRIP['z_m'][0]) & (qz <= FAN_STRIP['z_m'][1])))
        crew_ok = in_strip and smoke_gap >= SMOKE_SERVICE_R_M and lane_gap >= CREW_GAP_M
    seg = [[R3(q[0][0]), R3(q[0][2])], [R3(qx[-1]), R3(qz[-1])]] if u30.any() else None
    return {'ok': ok, 'r30': R3(r30), 'r28': R3(r28), 'seg': seg, 'crew_ok': crew_ok, 'barrier_gap_m': R3(edge - m),
            'smoke_gap_m': None if smoke_gap is None else R3(smoke_gap), 'lane_gap_m': None if lane_gap is None else R3(lane_gap)}


def pen_window(p, d, t, rect, crew=False):
    """FIX 2: the low run over the head's whole desk window (every pan of WINDOW_PANS at the tilt limit: a higher tilt only
    shortens it). ok = every direction ok (and crew-ok in the stage pen); r30 / r28 = the largest reach; seg = the aim's own."""
    rows = [low_run(p, wd, t, rect, crew) for wd in window_dirs(d)]
    aim = low_run(p, d, t, rect, crew)
    gaps = [r['smoke_gap_m'] for r in rows if r.get('smoke_gap_m') is not None]
    lanes = [r['lane_gap_m'] for r in rows if r.get('lane_gap_m') is not None]
    return {'ok': all(r['ok'] for r in rows) and (not crew or all(r['crew_ok'] for r in rows)), 'r30': max(r['r30'] for r in rows),
            'r28': max(r['r28'] for r in rows), 'seg': aim['seg'], 'r30_aim': aim['r30'], 'r28_aim': aim['r28'],
            'barrier_gap_m': min(r['barrier_gap_m'] for r in rows), 'crew_ok': all(r['crew_ok'] for r in rows),
            'smoke_gap_m': min(gaps) if gaps else None, 'lane_gap_m': min(lanes) if lanes else None}


PAR_CONE_RINGS = [(1.0 / 3, 8), (2.0 / 3, 16), (1.0, 24)]


def par_cone_rays(p, d):
    """FIX 5: a PAR's beam as a standing eye must fear it: the axis and rings at 1/3, 2/3 and all of its half beam +
    PAR_AIM_TOL_DEG (8 + 16 + 24 rays), each starting on the lens disc (radius PAR_LENS_R_M) at the same fraction on its own
    side, so the bundle fills the beam. Returns (starts, dirs)."""
    import numpy as np
    import occlusion_lib as O
    half = PAR_LENS_DEG / 2 + PAR_AIM_TOL_DEG
    dirs, ring = O.cone_rays(d, half, PAR_CONE_RINGS)
    a = unit(d)
    frac = [0.0] + [fr for fr, n in PAR_CONE_RINGS for _ in range(n)]
    starts = []
    for u, fr in zip(dirs, frac):
        side = u - a * float(u @ a)
        nrm = float(np.linalg.norm(side))
        starts.append(np.asarray(p, float) + (side / nrm * PAR_LENS_R_M * fr if nrm > 1e-9 else 0.0))
    return np.asarray(starts), dirs


def par_eye_footprint(W, p, d):
    """FIX 5: the plan points where a standing eye (the EYE_YS band, 1.5-1.9 m) would be inside a PAR's beam: every ray of
    par_cone_rays between the heights 1.5 and 1.9 m, up to its first hit in the room's world (a PA box, a column, the roof),
    6 samples each. Returns (an (m, 2) array, empty when the beam never crosses the band; the axis's throw)."""
    import numpy as np
    S, D = par_cone_rays(p, d)
    lo, hi = min(EYE_YS), max(EYE_YS)
    t, _, _, _ = cast_full(W, S[0], D, reach=PAR_THROW_M, tmin=0.05, skip=EYE_SKIP)
    pts = []
    for k, (s0, u) in enumerate(zip(S, D)):
        if u[1] <= 1e-6:
            continue                                   # a ray that does not rise stays under a floor lamp's 1.5 m band
        th = float(t[k]) if np.isfinite(t[k]) else PAR_THROW_M
        a_, b_ = max((lo - s0[1]) / u[1], 0.0), min((hi - s0[1]) / u[1], th)
        if b_ < a_:
            continue
        for s in np.linspace(a_, b_, 6):
            q = s0 + u * s
            pts.append((q[0], q[2]))
    t0 = float(t[0]) if np.isfinite(t[0]) else PAR_THROW_M
    return np.asarray(pts, float).reshape(-1, 2), t0


def par_pen_rect(p, fp):
    """FIX 5 (d): the fenced rectangle a PAR among people needs: its eye footprint (par_eye_footprint) and the lamp itself,
    dilated by LEAN_M, never smaller than PAR_PEN_HALF_MIN_M each side of the lamp. Returns a rect (x_m, z_m)."""
    xs = [p[0] - PAR_PEN_HALF_MIN_M, p[0] + PAR_PEN_HALF_MIN_M]
    zs = [p[2] - PAR_PEN_HALF_MIN_M, p[2] + PAR_PEN_HALF_MIN_M]
    if len(fp):
        xs += [float(fp[:, 0].min()) - LEAN_M, float(fp[:, 0].max()) + LEAN_M]
        zs += [float(fp[:, 1].min()) - LEAN_M, float(fp[:, 1].max()) + LEAN_M]
    return {'x_m': (R3(min(xs)), R3(max(xs))), 'z_m': (R3(min(zs)), R3(max(zs)))}


def footprint_gap(fp, P, within=2.0):
    """FIX 5: the smallest plan distance from a PAR's eye footprint to any public feet point of P (inf when empty or when none
    lies within `within` m of the footprint's box: only the points near it are measured)."""
    import numpy as np
    fp = np.asarray(fp, float).reshape(-1, 2)
    if not len(fp) or not len(P):
        return float('inf')
    x0, x1 = fp[:, 0].min() - within, fp[:, 0].max() + within
    z0, z1 = fp[:, 1].min() - within, fp[:, 1].max() + within
    Q = P[(P[:, 0] >= x0) & (P[:, 0] <= x1) & (P[:, 1] >= z0) & (P[:, 1] <= z1)]
    if not len(Q):
        return float('inf')
    return float(np.min(np.hypot(Q[:, None, 0] - fp[None, :, 0], Q[:, None, 1] - fp[None, :, 1])))


def desk_limits(head, d):
    """FIX 2: one floor head's desk window as data a desk enforces. The base's front faces the aim's azimuth (fixture-lib.mjs
    mountMatrix face), so at the aim pan is 0; tilt is measured from home (straight up, fixture-lib.mjs beamLocal). DMX: 16-bit,
    centre 32768 = home, the maker's 540 / 270 deg range (dmxDecode.js toSixteen), EQUIVALENT until the B380F channel walk."""
    az, el = az_el(d)
    t_aim = 90.0 - el
    t_lo = max(0.0, t_aim - TILT_UP_DEG)
    to16 = lambda deg, rng: int(round(min(1.0, max(0.0, deg / rng + 0.5)) * 65535))
    pan_dmx = [to16(-PAN_WIN_DEG, 540.0), to16(PAN_WIN_DEG, 540.0)]
    tilt_dmx = sorted([to16(t_lo, 270.0), to16(t_aim, 270.0)])
    return {'base_front_faces_az_deg': R3(az), 'pan_deg_from_home': [-PAN_WIN_DEG, PAN_WIN_DEG], 'tilt_deg_from_home': [R3(t_lo), R3(t_aim)],
            'world_az_deg': [R3((az - PAN_WIN_DEG) % 360), R3((az + PAN_WIN_DEG) % 360)], 'world_el_deg': [R3(el), R3(min(el + TILT_UP_DEG, 89.5))],
            'tilt_never_below_el_deg': R3(el),
            'dmx16': {'pan': pan_dmx, 'tilt': tilt_dmx, 'pan_coarse_fine': [[v >> 8, v & 255] for v in pan_dmx], 'tilt_coarse_fine': [[v >> 8, v & 255] for v in tilt_dmx],
                      'basis': 'dmxDecode.js: centre 32768 = home, symmetric over the maker\'s 540 / 270 deg (EXACT range); the B380F\'s own home and direction are EQUIVALENT until the channel walk (fixtures-exact.md)'},
            'pens_sized_for': 'this whole window: every pan at the tilt limit for the low run, every pan x tilt for the ends and the glare',
            'on_reset_or_dmx_loss': 'owed: the head set to close its shutter on DMX loss and during its pan/tilt reset (the B380F manual is not found)'}


def base_check(d):
    """FIX 2: the floor plate's stability (statics): the largest horizontal push at the head's top the plate + bags resist with
    BASE['factor'] against tipping over the plate's edge, and the head alone on its own base (for the record)."""
    g = 9.81
    m_all = BASE['head_kg'] + BASE['plate_kg'] + sum(BASE['sandbags_kg'])
    arm = BASE['plate_m'][0] / 2
    push = m_all * g * arm / (BASE['factor'] * BASE['head_h_m'])
    alone = BASE['head_kg'] * g * (min(BASE['base_m']) / 2) / (BASE['factor'] * BASE['head_h_m'])
    return {'plate_m': BASE['plate_m'], 'sandbags_kg': BASE['sandbags_kg'], 'alternative': BASE['anchors_alternative'],
            'push_at_top_n_with_factor': R3(push), 'head_alone_push_n': R3(alone), 'factor': BASE['factor'], 'levelled_deg': 1.0,
            'source': BASE['source']}


# ====================================================================== the zones (the owner's paint)
class Area:
    """The owner's painted areas (moxir_v2_eyes.Zones) as the area this layer may use: hot zone OR a wing, never the bar or the
    chill + food zone."""

    def __init__(self, repo):
        import moxir_v2_eyes as EY
        import occlusion_sky as S
        self.Z = EY.Zones(repo)
        self.stage_pen = {'x_m': EY.STAGE_PEN['x_m'], 'z_m': EY.STAGE_PEN['z_m']}
        self.G = json.load(open(os.path.join(repo, S.HALL)))['geometry']
        self.pens = []             # the fenced pens once chosen (build): not public

    def public(self, x, z):
        """A place people may stand (FIX 6): painted (hot, wings, bar, chill), not the stage pen, not a fenced pen, not a machine."""
        if inside_rect(x, z, self.stage_pen) or any(inside_rect(x, z, R) for R in self.pens):
            return False
        if not any(self.Z.inside(k, x, z, 0.0) for k in ('hot', 'use', 'bar', 'chill')):
            return False
        return not massing_hits(self.G, x, z, 0.0, 1.0, 0.0)

    def allowed(self, x, z, margin=0.0):
        Z = self.Z
        if Z.inside('bar', x, z, 0.5) or Z.inside('chill', x, z, 0.5):
            return False
        return Z.inside('hot', x, z, margin) or Z.inside('use', x, z, margin)

    def rect_allowed(self, R, margin=0.0):
        (x0, x1), (z0, z1) = R['x_m'], R['z_m']
        pts = [(x, z) for x in (x0, (x0 + x1) / 2, x1) for z in (z0, (z0 + z1) / 2, z1)]
        return all(self.allowed(x, z, margin) for x, z in pts)

    def ends_bad(self, x, z):
        return self.Z.inside('bar', x, z, 0.5) or self.Z.inside('chill', x, z, 0.5)


def massing_hits(G, x, z, y0=0.0, y1=0.7, pad=0.2):
    return [m['id'] for m in G['massing'] if not m['id'].startswith('pendant') and m['x_m'][0] - pad <= x <= m['x_m'][1] + pad
            and m['z_m'][0] - pad <= z <= m['z_m'][1] + pad and m['y_m'][0] < y1 and m['y_m'][1] > y0]


def near_column(G, x, z, r):
    for cx in G['rows_x_m']:
        for cz in G['column_grid_z_m']:
            if abs(x - cx) <= r and abs(z - cz) <= r:
                return True
    return False


# ====================================================================== the world of the night, for ground units
def world(repo):
    """moxir_v2_spread.night_world (the free crane at z -12 + its laser hang) without the people as solids (a ground beam's people
    rule is its pen, checked below), with the crane park volume as a solid no beam may enter, and triangle normals."""
    import numpy as np
    import occlusion_sky as S
    import moxir_v2_spread as SP
    W = SP.night_world(repo)
    W.boxes = [b for b in W.boxes if b.cls != 'audience']
    W.boxes.append(S.OBox.aabb(CRANE_PARK_NAME, 'crane park', CRANE_PARK['x_m'], CRANE_PARK['y_m'], CRANE_PARK['z_m']))
    # the entry lasers (#873) and the cubes on the free crane: places no beam may end on or pass within APERTURE_PAD_M of
    pad = lambda R, m: tuple((R[0] - m, R[1] + m))
    E = ENTRY_LASERS
    W.boxes.append(S.OBox.aabb('entry-laser tower + pen (KO-2, #873)', 'laser tower', E['ko2']['x_m'], E['ko2']['y_m'], E['ko2']['z_m']))
    W.boxes.append(S.OBox.aabb('entry lasers + T-bar, padded %.1f m (KO-1, #873)' % APERTURE_PAD_M, 'laser aperture',
                               pad(E['ko1']['x_m'], APERTURE_PAD_M), pad(E['ko1']['y_m'], APERTURE_PAD_M), pad(E['ko1']['z_m'], APERTURE_PAD_M)))
    W.boxes.append(S.OBox.aabb('the 6 cubes on the free crane z -12, padded %.1f m (N464)' % APERTURE_PAD_M, 'laser aperture',
                               pad(CUBES_TOP['x_m'], APERTURE_PAD_M), pad(CUBES_TOP['y_m'], APERTURE_PAD_M), pad(CUBES_TOP['z_m'], APERTURE_PAD_M)))
    n = np.cross(W.E1, W.E2)
    W.N = n / np.maximum(np.linalg.norm(n, axis=1, keepdims=True), 1e-12)
    return W


def cast_full(W, o, D, reach, tmin=0.3, skip=()):
    """occlusion_sky.World.cast, also returning each hit's surface normal (the triangle's, or the entered box face's)."""
    import numpy as np
    o = np.asarray(o, float)
    D = np.atleast_2d(np.asarray(D, float))
    n = len(D)
    near = np.nonzero(np.linalg.norm(W.C - o, axis=1) - W.Rr <= reach)[0]
    best = np.full(n, np.inf)
    who = np.full(n, -1, dtype=np.int64)
    for k in range(0, len(near), 3000):
        idx = near[k:k + 3000]
        s = o - W.V0[idx]
        A, B, Q = W.A[idx], np.cross(W.E2[idx], s), np.cross(s, W.E1[idx])
        tn = np.einsum('ij,ij->i', W.E2[idx], Q)
        det = D @ A.T
        ok = np.abs(det) > 1e-12
        inv = np.where(ok, 1.0 / np.where(ok, det, 1.0), 0.0)
        u = (D @ B.T) * inv
        v = (D @ Q.T) * inv
        t = tn[None, :] * inv
        hit = ok & (u >= -1e-9) & (v >= -1e-9) & (u + v <= 1 + 1e-9) & (t > tmin) & (t < reach)
        t = np.where(hit, t, np.inf)
        j = np.argmin(t, axis=1)
        tj = t[np.arange(n), j]
        better = tj < best
        best[better] = tj[better]
        who[better] = idx[j[better]]
    names, clss = [None] * n, [None] * n
    normal = np.zeros((n, 3))
    for i in np.nonzero(who >= 0)[0]:
        names[i] = W.labels[W.lab[who[i]]]
        clss[i] = W.lcls[W.lab[who[i]]]
        normal[i] = W.N[who[i]]
    for b in W.boxes:
        if b.name in skip or b.cls in skip:
            continue
        tb = b.hits(o, D, tmin)
        better = (tb < best) & (tb < reach)
        for i in np.nonzero(better)[0]:
            best[i], names[i], clss[i] = tb[i], b.name, b.cls
            lq = (o + D[i] * tb[i] - b.c) @ b.R
            k = int(np.argmax(np.abs(lq) / np.maximum(b.h, 1e-9)))
            nl = np.zeros(3)
            nl[k] = 1.0 if lq[k] >= 0 else -1.0
            normal[i] = b.R @ nl
    return best, names, clss, normal


def bin_of(L):
    import numpy as np
    return np.searchsorted(np.asarray(DEPTH_EDGES), L, side='right')


def objective(M, w=None):
    """sum over eyes and depth bins of sqrt(light), each eye times its weight (FIX 1: the people it stands for; None = the set
    weights, or 1 each when none are set)."""
    import numpy as np
    M = np.asarray(M, float)
    w = _W_EYE if w is None else np.asarray(w, float)
    rows = np.sqrt(np.maximum(M, 0.0)).sum(axis=1)
    return float(rows.sum() if w is None else (rows * w).sum())


# ====================================================================== PAR: the light its lit surfaces send to the eyes
def par_eye_light(W, p, d, cd=PAR_I, skip=EYE_SKIP, A=None):
    """E (lx) at each eye and depth bin from one PAR's lit surfaces (method above). Returns (E[eye][bin], info).
    With the Area A (2026-10-10 FIX 6 + loose ends): a lit point under CROWD_TOP_M over a public cell is not seen from an eye
    more than CROWD_SEE_M away (the crowd stands between); info also holds whether any lit point lies over the bar or the chill
    + food zone (pool_in_bar_or_chill: refused) and the share of the beam's rays that cross the crane park volume (spill)."""
    import numpy as np
    import occlusion_lib as O
    names_e = list(EYES)
    E = np.zeros((len(names_e), len(DEPTH_NAMES)))
    dirs, _ = O.cone_rays(d, PAR_LENS_DEG / 2, O.AREA_RINGS)
    o = np.asarray(p, float)
    t, names, cls, nrm = cast_full(W, o, dirs, reach=PAR_THROW_M, skip=skip)
    lit = np.array([c in LIT for c in cls]) & np.isfinite(t)
    omega = 2 * math.pi * (1 - math.cos(math.radians(PAR_LENS_DEG / 2)))
    phi = cd * omega / len(dirs)
    info = {'lit_pct': round(100.0 * float(lit.mean()), 1), 'lit': {}}
    for i in np.nonzero(lit)[0]:
        info['lit'][cls[i]] = info['lit'].get(cls[i], 0) + 1
    # the crane park: the share of rays that pass through its volume before they end (spill on the truss / crane there)
    tt = np.where(np.isfinite(t), t, PAR_THROW_M)
    cp = CRANE_PARK
    spill = 0
    for i in range(len(dirs)):
        q = o + dirs[i] * np.linspace(0.3, tt[i], 40)[:, None]
        spill += bool(np.any((q[:, 0] >= cp['x_m'][0]) & (q[:, 0] <= cp['x_m'][1]) & (q[:, 2] >= cp['z_m'][0]) & (q[:, 2] <= cp['z_m'][1])
                             & (q[:, 1] >= cp['y_m'][0]) & (q[:, 1] <= cp['y_m'][1])))
    info['crane_park_spill_pct'] = round(100.0 * spill / len(dirs), 1)
    info['pool_in_bar_or_chill'] = False
    if not lit.any():
        return E, info
    idx = np.nonzero(lit)[0]
    pts = o + dirs[idx] * t[idx][:, None]
    if A is not None:
        info['pool_in_bar_or_chill'] = any(A.ends_bad(q[0], q[2]) for q in pts)
        low_public = np.array([q[1] < CROWD_TOP_M and A.public(q[0], q[2]) for q in pts])
    else:
        low_public = np.zeros(len(pts), bool)
    info['lit_low_in_crowd_pct'] = round(100.0 * float(low_public.mean()), 1)
    nn = nrm[idx]
    side_l = np.sign(np.einsum('ij,ij->i', nn, o - pts))
    rho = np.array([ALBEDO.get(cls[i], ALBEDO_STEEL_ASSUMED) for i in idx])
    for k, name in enumerate(names_e):
        e = np.asarray(EYES[name], float)
        v = e - pts
        L = np.linalg.norm(v, axis=1)
        u = v / L[:, None]
        cv = np.einsum('ij,ij->i', nn, u)
        same = np.sign(cv) == side_l
        te, _, _, _ = cast_full(W, e, -u, reach=float(L.max()) + 1.0, tmin=0.3, skip=skip)
        seen = (te >= L - 0.35) & same & ~(low_public & (L > CROWD_SEE_M))
        val = np.where(seen, rho * phi * np.abs(cv) / (math.pi * L ** 2), 0.0)
        np.add.at(E[k], bin_of(L), val)
    return E, info


# ====================================================================== B380F: G per eye and depth
def hg_vec(c, g=0.74):
    import numpy as np
    return (1 - g * g) / (4 * math.pi * (1 + g * g - 2 * g * c) ** 1.5)


def beam_samples(F, p, d, t, step):
    import numpy as np
    import moxir_v2_true as V
    n = max(2, int(min(t, 60.0) / step))
    xs = np.asarray(p, float) + np.asarray(d, float) * ((np.arange(n) + 0.5) * step)[:, None]
    sg = np.array([V.sigma_at(F, x) for x in xs])
    return xs, sg, np.cumsum(sg * step)


def beam_G(W, F, p, d, t, step=2.0, occlude=True):
    """G (moxir_v2_true.glow, per unit flux) per eye and depth bin; occlude=False is the cheap proxy for ranking aims."""
    import numpy as np
    names_e = list(EYES)
    d = np.asarray(d, float)
    xs, sg, tau = beam_samples(F, p, d, t, step)
    G = np.zeros((len(names_e), len(DEPTH_NAMES)))
    for k, name in enumerate(names_e):
        e = np.asarray(EYES[name], float)
        v = e - xs
        L = np.linalg.norm(v, axis=1)
        u = v / L[:, None]
        c = u @ d
        g = sg * hg_vec(c) * np.exp(-tau) * np.exp(-F['fill'] * L) * step
        if occlude:
            te, _, _, _ = cast_full(W, e, -u, reach=float(L.max()) + 1.0, tmin=0.3, skip=EYE_SKIP)
            g = np.where(te >= L - 0.4, g, 0.0)
        np.add.at(G[k], bin_of(L), g)
    return G


def glare_min_deg(p, d, t, eyes):
    """The smallest angle between the beam and the line from any of its points (0.5 m steps to its end) to each eye."""
    import numpy as np
    d = np.asarray(d, float)
    s = np.arange(0.5, max(t, 1.0), 0.5)
    xs = np.asarray(p, float) + d * s[:, None]
    out = {}
    for name, e in eyes.items():
        v = np.asarray(e, float) - xs
        c = (v @ d) / np.linalg.norm(v, axis=1)
        out[name] = R3(math.degrees(math.acos(max(-1.0, min(1.0, float(c.max()))))))
    return out


def level_at(x, z):
    if -6.7 <= x <= -3.7 and 3.65 <= z <= 5.65:
        return 0.4
    if FOH_RISER['x_m'][0] <= x <= FOH_RISER['x_m'][1] and 27.0 <= z <= 31.0:
        return 0.6
    return 0.0


def pen_of_beam(p, d, t, island):
    """The beam's pen: the samples whose lower edge is under 3.0 m over the standing level. Returns (ok, r30, r28, segment):
    ok = every such sample stands inside the island less BARRIER_REACH_M; r30 / r28 = the horizontal reach of the part under
    3.0 / 2.8 m (the pen radius each rule needs)."""
    import numpy as np
    d = np.asarray(d, float)
    p = np.asarray(p, float)
    s = np.arange(0.0, max(t, 0.5) + 1e-9, 0.25)
    q = p + d * s[:, None]
    lo = q[:, 1] - s * math.tan(math.radians(LOW_EDGE_DEG))
    lv = np.array([level_at(x, z) for x, z in zip(q[:, 0], q[:, 2])])
    under30 = lo - lv < CLEAR_OVER_M
    under28 = lo - lv < HAND_M
    hor = np.hypot(q[:, 0] - p[0], q[:, 2] - p[2])
    r30 = float(hor[under30].max()) if under30.any() else 0.0
    r28 = float(hor[under28].max()) if under28.any() else 0.0
    ok = all(inside_rect(x, z, island, BARRIER_REACH_M) for x, z in zip(q[under30, 0], q[under30, 2]))
    seg = [[R3(q[0][0]), R3(q[0][2])], [R3(q[under30][-1][0]), R3(q[under30][-1][2])]] if under30.any() else None
    return ok, R3(r30), R3(r28), seg


def block_gap(end):
    """Distance (m) from a beam's end to the nearest far-wall laser termination block (#873)."""
    return min(math.dist(end, b) for b in ENTRY_LASERS['far_wall_blocks'])


def aperture_gap(head, d, t):
    """The closest a beam's axis (to its first hit) comes to an entry-laser aperture or the cubes' box centre line (m)."""
    import numpy as np
    head, d = np.asarray(head, float), np.asarray(d, float)
    out = []
    for a in ENTRY_LASERS['apertures']:
        s = min(max(float((np.asarray(a) - head) @ d), 0.0), t)
        out.append(float(np.linalg.norm(head + d * s - np.asarray(a))))
    # the cubes' box: sample the axis, distance to the box (0 inside)
    lo = np.array([CUBES_TOP['x_m'][0], CUBES_TOP['y_m'][0], CUBES_TOP['z_m'][0]])
    hi = np.array([CUBES_TOP['x_m'][1], CUBES_TOP['y_m'][1], CUBES_TOP['z_m'][1]])
    q = head + d * np.arange(0.0, t + 0.25, 0.25)[:, None]
    out.append(float(np.min(np.linalg.norm(np.maximum(np.maximum(lo - q, q - hi), 0.0), axis=1))))
    return round(min(out[:2]), 3), round(out[2], 3)


def ring_check(W, A, head, d, allow=()):
    """The beam as the room draws it: axis + a ring of 8 at the 0.9 deg half beam (occlusion_lib.SPEC_RINGS), each to its first
    hit. Refused if any ends in a refused class (but a name starting with one of `allow`), the bar / chill zone or on the entry
    wall, or within BLOCK_FREE_M of a far-wall laser block."""
    import numpy as np
    import occlusion_lib as O
    dirs, _ = O.cone_rays(d, 0.9, O.SPEC_RINGS)
    t, names, cls, _ = cast_full(W, head, dirs, reach=120.0)
    ends = []
    for k in range(len(dirs)):
        tk = float(t[k]) if np.isfinite(t[k]) else 120.0
        end = np.asarray(head, float) + dirs[k] * tk
        ends.append(names[k])
        if cls[k] in BAD_END and not (names[k] and any(names[k].startswith(a_) for a_ in allow)):
            return False, 'a ring ray ends on %s' % names[k], sorted(set(e for e in ends if e))
        if A.ends_bad(end[0], end[2]) or end[2] > 53.0:
            return False, 'a ring ray ends in the bar / chill zone or on the entry wall', sorted(set(e for e in ends if e))
        if block_gap(end) < BLOCK_FREE_M:
            return False, 'a ring ray ends within %.0f m of a far-wall laser block' % BLOCK_FREE_M, sorted(set(e for e in ends if e))
    return True, None, sorted(set(e for e in ends if e))


# ====================================================================== B's ember fan (FIX 1a): its own world and its crane check
NEAR_CRANE_ALLOW = ('crane z 0.15',)            # the near crane's steel where the hall model has it today (the spread's world)
NEAR_CRANE_PARKS = (0.15, 1.2, 2.2, 3.2, 4.25)  # the near crane may park anywhere up to z 4.25 (the lead; another workflow)


def fan_world(repo):
    """The world for B's fan: world() without the crane park as a solid. The fan crosses the park's air as the owner saw it;
    where a fan beam meets the near crane (z 0.15 in the hall model) it ends on its steel, as in the spread. Other parks:
    fan_park_meets."""
    W = world(repo)
    W.boxes = [b for b in W.boxes if b.cls != 'crane park']
    return W


def fan_park_meets(head, d):
    """For every park z_c of NEAR_CRANE_PARKS and every direction of the head's desk window (pans x WINDOW_TILTS): what the beam
    meets first under the roof (10.8 m): the crane's girders (z_c +-1.1, 0.7 wide, 7.6-8.92 m, x +-11.35: the cranes-lasers
    fact sheet's upper bound), the cut (its H30V from (-11.04, 2.89) to (0.55, 6.0) at z_c, 0.29 m, + 0.3 m), or nothing.
    Returns {'girder': [...], 'cut': [...]} lists of (park, pan, tilt)."""
    import numpy as np
    out = {'girder': [], 'cut': []}
    az, el = az_el(d)
    s = np.arange(0.3, 30.0, 0.02)
    for ti in WINDOW_TILTS:
        for pa in WINDOW_PANS:
            wd = dir_of(az + pa, min(el + ti, 89.5))
            q = np.asarray(head, float) + wd * s[:, None]
            roof = q[:, 1] >= 10.8
            q = q[: int(np.argmax(roof)) if roof.any() else len(q)]
            for zc in NEAR_CRANE_PARKS:
                gird = np.zeros(len(q), bool)
                for dz in (-1.1, 1.1):
                    gird |= (np.abs(q[:, 2] - (zc + dz)) <= 0.35) & (q[:, 1] >= 7.6) & (q[:, 1] <= 8.92) & (np.abs(q[:, 0]) <= 11.35)
                A_ = np.array([-11.04, 2.89 + 0.145, zc])
                B_ = np.array([0.55, 6.0 + 0.145, zc])
                ab = B_ - A_
                tt = np.clip(((q - A_) @ ab) / (ab @ ab), 0, 1)
                cut = np.linalg.norm(q - (A_ + tt[:, None] * ab), axis=1) <= 0.145 + 0.3
                ig = int(np.argmax(gird)) if gird.any() else 10 ** 9
                ic = int(np.argmax(cut)) if cut.any() else 10 ** 9
                if ic < ig:
                    out['cut'].append((zc, pa, ti))
                elif ig < 10 ** 9:
                    out['girder'].append((zc, pa, ti))
    return out


# ====================================================================== candidates: islands + slots for the beams, places for the PARs
def rects_overlap(a, b, pad=0.0):
    return not (a['x_m'][1] + pad <= b['x_m'][0] or b['x_m'][1] + pad <= a['x_m'][0] or a['z_m'][1] + pad <= b['z_m'][0] or b['z_m'][1] + pad <= a['z_m'][0])


def rect_massing(G, R, y1=1.0):
    return [m['id'] for m in G['massing'] if not m['id'].startswith('pendant') and m['y_m'][0] < y1
            and rects_overlap(R, {'x_m': tuple(m['x_m']), 'z_m': tuple(m['z_m'])})]


def island_candidates(G, A, spread):
    """The stage pen (B's ember fan: plane 1's six heads as B tuned them and the spread kept them, FIX 1a: fixed, not re-aimed)
    and the fenced island candidates: the stage edge, the column lines, free 5 x 5 m squares, and (FIX 1b) squares in the entry
    half. Every fenced island's head slots stand >= HEAD_REACH_M from its barrier (FIX 2)."""
    plane1 = sorted([f for f in spread['fixtures'] if f['part'].startswith('plane 1')], key=lambda f: f['p'][0])
    out = [{'id': 'the stage pen', 'kind': 'stage pen', 'rect': {'x_m': tuple(A.stage_pen['x_m']), 'z_m': tuple(A.stage_pen['z_m'])},
            'slots': [[f['p'][0], f['p'][1] - 0.7 + HEAD_Y, f['p'][2]] for f in plane1], 'slot_ids': [f['id'] for f in plane1],
            'fixed': [{'id': f['id'], 'p': list(f['p']), 'r': list(f['r'])} for f in plane1],
            'crew_only': True, 'why': 'crew only (the DJ, the pit, backstage): B\'s ember fan, the six plane-1 heads where B tuned them (1 m apart around the smoke machine) and with B\'s aims, as the owner saw and kept them on 10-09'}]
    stage = {'x_m': tuple(A.stage_pen['x_m']), 'z_m': tuple(A.stage_pen['z_m'])}
    ko2 = {'x_m': ENTRY_LASERS['ko2']['x_m'], 'z_m': ENTRY_LASERS['ko2']['z_m']}
    keep_out = [('the dance floor', DANCE), ('the entry corridor', ENTRY_CORRIDOR), ('the FOH riser', FOH_RISER), ('the stage pen', stage),
                ('the entry-laser tower pen (KO-2)', ko2), ('the crane park', {'x_m': CRANE_PARK['x_m'], 'z_m': CRANE_PARK['z_m']})]
    hr = HEAD_REACH_M

    def slots_in(R, nx=2, nz=2):
        (x0, x1), (z0, z1) = R['x_m'], R['z_m']
        xs = [x0 + hr, x1 - hr] if nx == 2 else [(x0 + x1) / 2]
        zs = [z0 + hr, z1 - hr] if nz == 2 else [(z0 + z1) / 2]
        return [[R3(x), HEAD_Y, R3(z)] for x in xs for z in zs]

    def clear_of_columns(slots, r=0.8):
        return all(not any(abs(sx - cx) < r and abs(sz - cz) < r for cx in G['rows_x_m'] for cz in G['column_grid_z_m']) for sx, _, sz in slots)
    # THE STAGE EDGE: pens that share one side with the stage pen's own barrier (3 new sides, not 4)
    (sx0, sx1), (sz0, sz1) = stage['x_m'], stage['z_m']
    for name, R, shared in (('stage edge, behind, house left', {'x_m': (sx0, sx0 + 6.0), 'z_m': (sz0 - 5.0, sz0)}, 6.0),
                            ('stage edge, behind, house right', {'x_m': (sx1 - 6.0, sx1), 'z_m': (sz0 - 5.0, sz0)}, 6.0),
                            ('stage edge, house right side', {'x_m': (sx1, sx1 + 5.0), 'z_m': (sz0, CRANE_PARK['z_m'][0])}, CRANE_PARK['z_m'][0] - sz0)):
        if not A.rect_allowed(R, 0.0) or any(rects_overlap(R, K) for n, K in keep_out if n != 'the stage pen') or rect_massing(G, R):
            continue
        out.append({'id': name, 'kind': 'stage edge', 'rect': R, 'shared_side_m': R3(shared), 'slots': slots_in(R),
                    'why': 'against the stage pen: its barrier is one side of this pen (crew side), so the pen adds three sides'})
    zs = sorted(G['column_grid_z_m'])
    for s in (-1, 1):
        for za, zb in zip(zs, zs[1:]):
            if zb - za < 3.0:
                continue                                                 # the expansion joint's column pair (1 m)
            for side in ('span', 'nave'):
                x0, x1 = sorted((s * 11.4, s * 16.4)) if side == 'span' else sorted((s * 7.6, s * 12.6))
                R = {'x_m': (x0, x1), 'z_m': (za, zb)}
                if not A.rect_allowed(R, 0.0) or any(rects_overlap(R, K) for _, K in keep_out) or rect_massing(G, R):
                    continue
                out.append({'id': 'col %+d, %s side, z %g..%g' % (12 * s, side, za, zb), 'kind': 'column line', 'rect': R, 'slots': slots_in(R),
                            'why': 'between two columns of the x %+d row (the columns anchor its barrier), on the %s side' % (12 * s, side)})
    for cx in (-24.0, -18.0, -6.0, 0.0, 6.0, 18.0, 24.0):
        for cz in range(-27, 46, 6):
            R = {'x_m': (cx - 2.5, cx + 2.5), 'z_m': (cz - 2.5, cz + 2.5)}
            if not A.rect_allowed(R, 0.0) or any(rects_overlap(R, K) for _, K in keep_out) or rect_massing(G, R):
                continue
            if any(abs(cx - x) < 3.0 and abs(cz - z) < 3.0 for x in G['rows_x_m'] for z in G['column_grid_z_m']):
                continue
            out.append({'id': 'square x %g z %g' % (cx, cz), 'kind': 'free square', 'rect': R, 'slots': slots_in(R),
                        'why': 'a fenced 5 x 5 m square in the painted area, off the dance floor and the entry corridor'})
    # FIX 1b: THE ENTRY HALF (centre z >= ENTRY_HALF_Z): 5 x 5 m squares on a 3 m grid between the dance floor's end and the
    # bar / chill zones, a column allowed inside the fence (its foot then lit from inside the pen), its head slots clear of it
    have = {I['id'] for I in out}
    for cx in (-17.0, -14.0, -11.0, -8.0, 8.0, 11.0, 14.0, 17.0, 20.0, 23.0):
        for cz in (25.5, 28.5, 31.5, 33.5):
            R = {'x_m': (cx - 2.5, cx + 2.5), 'z_m': (cz - 2.5, cz + 2.5)}
            iid = 'entry square x %g z %g' % (cx, cz)
            if iid in have or not A.rect_allowed(R, 0.0) or any(rects_overlap(R, K) for _, K in keep_out) or rect_massing(G, R):
                continue
            sl = slots_in(R)
            if not clear_of_columns(sl):
                continue
            out.append({'id': iid, 'kind': 'entry square', 'rect': R, 'slots': sl,
                        'why': 'a fenced 5 x 5 m square in the entry half (FIX 1b: beams where the crowd comes in and around FOH), off the dance floor, the corridor and the FOH riser'})
    return out


def par_candidates(G, A, spread):
    a = math.radians(4.05)
    out = []
    for s in (-1, 1):
        for zc in G['column_grid_z_m']:
            foot = 'col %+d z %s' % (12 * s, 'joint pair' if abs(zc) < 1 else '%g' % zc)      # the joint pair (z +-0.5) is one column foot
            faces = {'nave': ([s * 11.157, PAR_Y, zc], [math.sin(a) * s, math.cos(a), 0.0]),
                     'span': ([s * 12.843, PAR_Y, zc], [-math.sin(a) * s, math.cos(a), 0.0]),
                     'entry': ([s * 12.0, PAR_Y, zc + 0.84], [0.0, math.cos(a), -math.sin(a)]),
                     'stage': ([s * 12.0, PAR_Y, zc - 0.84], [0.0, math.cos(a), math.sin(a)])}
            for face, (p, d) in faces.items():
                if not A.allowed(p[0], p[2], 1.0) or massing_hits(G, p[0], p[2], 0.0, 0.5, 0.2):
                    continue
                out.append({'id': 'col %+d z %g, %s face' % (12 * s, zc, face), 'kind': 'column foot', 'foot': foot, 'face': face, 'p': [R3(v) for v in p],
                            'dir': [R3(v) for v in d], 'part': 'columns', 'colour': EMBER,
                            'position': 'floor plate at the %s face of the column x %+d z %g, 0.44 m off it, leaned 4 deg onto it (v1.1 vista bracket)' % (face, 12 * s, zc)})
    import numpy as np
    stage_front = {'x_m': (-10.5, 1.5), 'z_m': (3.0, 8.2)}
    for x in range(-30, 28, 3):
        for z in range(-30, 46, 3):
            if not A.allowed(x, z, 0.0) or inside_rect(x, z, DANCE, -0.5) or inside_rect(x, z, ENTRY_CORRIDOR) or inside_rect(x, z, FOH_RISER, -1.0):
                continue
            if inside_rect(x, z, stage_front) or near_column(G, x, z, 2.0) or massing_hits(G, x, z, 0.0, 0.5, 0.4):
                continue
            if inside_rect(x, z, {'x_m': ENTRY_LASERS['ko2']['x_m'], 'z_m': ENTRY_LASERS['ko2']['z_m']}, -0.5):
                continue
            out.append({'id': 'floor x %d z %d' % (x, z), 'kind': 'floor uplight', 'p': [float(x), PAR_Y, float(z)], 'dir': [0.0, 1.0, 0.0],
                        'part': 'roof', 'colour': ASH, 'position': 'floor plate at x %d z %d, straight up into the roof steel' % (x, z)})
            # 2026-10-10: the same floor place may instead light the steel lines near it, from 3-9 m off a column row: the crane
            # runway girder (x +-11.35, 7.06-7.96 m, the long lines down the hall) or the nearest column's flared head (6.2-7.1 m)
            rx = 11.35 if x > 0 else -11.35
            off = abs(x - rx)
            if 3.0 <= off <= 9.0:
                face = rx + (0.35 if x > rx else -0.35)
                tgt = [face, 7.5, float(z)]
                d = unit(np.asarray(tgt) - np.asarray([x, PAR_Y, z]))
                out.append({'id': 'floor x %d z %d, to the runway' % (x, z), 'kind': 'floor to runway', 'p': [float(x), PAR_Y, float(z)], 'dir': [R3(v) for v in d],
                            'part': 'runway', 'colour': ASH, 'position': 'floor plate at x %d z %d, aimed at the crane runway girder x %+.2f (7.5 m) beside it' % (x, z, rx)})
                zc = min(G['column_grid_z_m'], key=lambda c: abs(c - z))
                cx = 12.0 if x > 0 else -12.0
                if abs(zc - z) <= 4.0:
                    hx = cx + (0.95 if x > cx else -0.95)
                    d = unit(np.asarray([hx, 6.6, zc]) - np.asarray([x, PAR_Y, z]))
                    out.append({'id': 'floor x %d z %d, to the column head' % (x, z), 'kind': 'floor to column head', 'p': [float(x), PAR_Y, float(z)],
                                'dir': [R3(v) for v in d], 'part': 'columns', 'colour': EMBER,
                                'position': 'floor plate at x %d z %d, aimed at the flared head of the column x %+d z %g (6.6 m)' % (x, z, cx, zc)})
    # FIX 5 (a): the stage pen's own floor (crew only): its back half, clear of the fan strip, the smoke machine, the transformer
    # and the press, straight up into the roof steel over the stage
    for x, z in ((-10.0, -7.0), (-7.0, -7.0), (-1.0, -7.0), (1.0, -7.0), (-10.0, -1.0), (1.0, -1.0), (-7.5, -0.5), (-2.0, -0.5)):
        if inside_rect(x, z, FAN_STRIP, -0.6) or math.hypot(x - SMOKE_SERVICE[0], z - SMOKE_SERVICE[1]) < 1.5 or massing_hits(G, x, z, 0.0, 0.5, 0.3):
            continue
        out.append({'id': 'stage pen x %g z %g' % (x, z), 'kind': 'stage pen uplight', 'p': [x, PAR_Y, z], 'dir': [0.0, 1.0, 0.0], 'part': 'roof', 'colour': ASH,
                    'position': 'the stage pen\'s floor (crew only) at x %g z %g, straight up into the roof steel over the stage' % (x, z)})
    for f in spread['fixtures']:
        if f['part'] == 'embers' and f['p'][1] <= GROUND_MAX_Y:
            out.append({'id': 'ember %s' % f['id'], 'kind': 'ember', 'p': list(f['p']), 'dir': [R3(v) for v in aim_dir(f['r'])], 'part': 'embers',
                        'colour': EMBER, 'from': f['id'], 'position': f['position']})
    return out


def coarse_dirs():
    import numpy as np
    return np.array([dir_of(az, el) for az in range(0, 360, 15) for el in range(35, 81, 5)])


END_PANS = WINDOW_PANS                    # every direction of the desk window (the build's recheck uses the same: a coarser sample let two
END_TILTS = WINDOW_TILTS                  # heads through whose in-between directions end on a lantern frame, 2026-10-10)


def window_ends_ok(W, A, head, d, pans=END_PANS, tilts=END_TILTS):
    """FIX 2: every direction of the head's desk window (pans x tilts) ends where a beam may end: not a refused class, not the
    bar / chill zone, not the entry wall, >= BLOCK_FREE_M from a far-wall laser block. Returns (ok, the refused ones)."""
    import numpy as np
    WD = window_dirs(d, pans=pans, tilts=tilts)
    t, names, cls, _ = cast_full(W, head, WD, reach=120.0)
    bad = []
    for k in range(len(WD)):
        tk = float(t[k]) if np.isfinite(t[k]) else 120.0
        end = np.asarray(head, float) + WD[k] * tk
        if cls[k] in BAD_END or A.ends_bad(end[0], end[2]) or end[2] > 53.0 or block_gap(end) < BLOCK_FREE_M:
            bad.append({'az_el': list(az_el(WD[k])), 'ends_on': names[k]})
    return not bad, bad


def legal(W, A, head, island, D, EF):
    """Every direction of D that passes the beam rules (method above + the 2026-10-10 FIX), with its throw, end and pen. EF:
    the public eyes for this head (FIX 3: every public place at the EYE_YS heights, less this head's own pen). The window
    (FIX 2): its pen at the tilt limit for every pan of WINDOW_PANS; its glare (the public, the nine eyes, the DJ) for every
    pan x WINDOW_TILTS; the aim's own end here (the window's ends: window_ends_ok, on the short list in slot_options; every
    pan x tilt again in the build)."""
    import numpy as np
    head = np.asarray(head, float)
    crew = island['kind'] == 'stage pen'
    named = np.asarray([e for e in list(EYES.values()) + [DJ_EYE] if not inside_rect(e[0], e[2], island['rect'])], float)
    pre = []
    for d in D:
        d = np.asarray(d, float)
        if len(EF) and float(field_glare(head, d[None, :], EF)[0]) < GLARE_DEG:
            continue
        pw = pen_window(head, d, 120.0, island['rect'], crew)
        if not pw['ok']:
            continue
        WD = window_dirs(d, tilts=WINDOW_TILTS)
        fg = window_glare(head, d, WD, EF) if len(EF) else 180.0
        ng = float(field_glare(head, WD, named).min())
        if min(fg, ng) < GLARE_DEG:
            continue
        pre.append((d, pw, fg, ng))
    if not pre:
        return []
    allD = np.vstack([d for d, _, _, _ in pre])
    t, names, cls, _ = cast_full(W, head, allD, reach=120.0)
    rows = []
    for j, (d, pw, fg, ng) in enumerate(pre):
        if cls[j] in BAD_END:
            continue
        ta = float(t[j]) if np.isfinite(t[j]) else 120.0
        end = head + d * ta
        if A.ends_bad(end[0], end[2]) or end[2] > 53.0 or block_gap(end) < BLOCK_FREE_M or ta < MIN_THROW_M:
            continue
        az, el = az_el(d)
        rows.append({'d': d, 't': ta, 'ends_on': names[j], 'end_cls': cls[j], 'end': [R3(v) for v in end],
                     'pen_m': pw['r30'], 'pen_hand_m': pw['r28'], 'pen_aim_m': pw['r30_aim'], 'pen_segment': pw['seg'], 'barrier_gap_m': pw['barrier_gap_m'],
                     'field_glare_min_deg': R3(fg), 'named_glare_min_deg': R3(ng),
                     'window': {'pan_az_deg': [R3((az + WINDOW_PANS[0]) % 360), R3((az + WINDOW_PANS[-1]) % 360)], 'tilt_el_deg': [R3(el), R3(min(el + TILT_UP_DEG, 89.5))]},
                     'crew_ok': pw['crew_ok'] if crew else None})
    return rows


def distinct(rows, n, min_deg, key):
    out = []
    for r in sorted(rows, key=key, reverse=True):
        if all(math.degrees(math.acos(max(-1.0, min(1.0, float(r['d'] @ o['d']))))) >= min_deg for o in out):
            out.append(r)
        if len(out) == n:
            break
    return out


def slot_options(W, A, F, head, island, EF, n_keep=3):
    import numpy as np
    rows = legal(W, A, head, island, coarse_dirs(), EF)
    for r in rows:
        r['proxy'] = objective(beam_G(W, F, head, r['d'], r['t'], step=3.0, occlude=False))
    top = distinct(rows, 4, 10.0, lambda r: r['proxy'])
    D1 = []
    for r in top:
        az, el = az_el(r['d'])
        D1 += [dir_of(az + da, el + de) for da in (-6, -3, 0, 3, 6) for de in (-3, -1.5, 0, 1.5, 3) if (da or de) and 30 <= el + de <= 85]
    if D1:
        more = legal(W, A, head, island, np.array(D1), EF)
        for r in more:
            r['proxy'] = objective(beam_G(W, F, head, r['d'], r['t'], step=3.0, occlude=False))
        rows += more
    short = distinct(rows, 14, 5.0, lambda r: r['proxy'])
    cand = []
    for r in short:
        ok, _ = window_ends_ok(W, A, head, r['d'])
        if ok:
            cand.append(r)
        if len(cand) == 5:
            break
    for r in cand:
        r['G'] = beam_G(W, F, head, r['d'], r['t'], step=2.0, occlude=True)
        r['score'] = objective(r['G'])
        r['ring_ok'], r['ring_why'], r['ring_ends'] = ring_check(W, A, head, r['d'])
    opts = distinct([r for r in cand if r['ring_ok']], n_keep, 10.0, lambda r: r['score'])
    keys = ('throw_m', 'ends_on', 'end', 'pen_m', 'pen_hand_m', 'pen_aim_m', 'pen_segment', 'barrier_gap_m', 'field_glare_min_deg', 'named_glare_min_deg', 'window', 'crew_ok')
    return [dict({'dir': [R3(v) for v in r['d']], 'az_el': list(az_el(r['d'])), 'throw_m': R3(r['t']), 'ring_ends': r['ring_ends'], 'G': r['G'].tolist(),
                  'score': R3(r['score'])}, **{k: r[k] for k in keys if k != 'throw_m'}) for r in opts], len(rows)


RULES = ('fix2b-2026-10-10: window pan +-%g (every %g) / tilt +%g, aim tol %g deg, lens %.2f m, 0.01 m pens, heads %.1f m from the barrier, '
         'dense glare at %s m on a %.1f m grid, fan strip + crew lanes, entry squares') % (
    PAN_WIN_DEG, WINDOW_STEP_DEG, TILT_UP_DEG, AIM_TOL_DEG, APERTURE_R_M, HEAD_REACH_M, '/'.join('%g' % y for y in EYE_YS), FIELD_STEP_M)
PAR_RULES = 'fix2-2026-10-10: PAR eye footprints (lean %.1f m, rings 8/16/24, lens %.3f m, aim tol %g deg), crowd-aware scores' % (LEAN_M, PAR_LENS_R_M, PAR_AIM_TOL_DEG)
CANDIDATES = 'candidates-fix2.json'         # 2026-10-10 (second fix run): the rules above; the first build's candidates.json and the cut-off run's candidates-fix.json are kept beside it


def candidates(repo, out):
    """Score every candidate (heavy): the PAR places (their eye light, FIX 5's eye footprint and the pen it would need) and every
    head slot of every island (B's fan: its six fixed heads' G). Resumes from <out>/CANDIDATES (a record made under other rules
    is scored again)."""
    import numpy as np
    import occlusion_sky as S
    import moxir_v2_true as V
    S.wait_cool()
    W = world(repo)
    WF = fan_world(repo)
    A = Area(repo)
    G = W.G
    spread = json.load(open(os.path.join(repo, RIG_SP)))
    sm = next(f for f in spread['fixtures'] if f['type'] == 'up-yz31p')
    F = V.field_numbers(repo, [sm['p'][0], sm['p'][1] + 0.1, sm['p'][2]], [0, 0, 1], states=('t40',))['t40']
    os.makedirs(out, exist_ok=True)
    path = os.path.join(out, CANDIDATES)
    C = json.load(open(path)) if os.path.exists(path) else {}
    if C.get('par_rules') != PAR_RULES:
        C['pars'] = {}                                   # the PAR places were scored under other rules: again
    if C.get('rules') != RULES:
        C['islands'] = {}                                # the islands too
    C['par_rules'] = PAR_RULES
    w, wt = eye_weights(A, G)
    set_eye_weights(w)
    C.update({'what': 'MOXIR v2 ground: every candidate ground place, scored from the audience\'s eyes (moxir_v2_ground.py candidates)', 'date': DATE,
              'eyes': EYES, 'eye_weights': wt, 'depth_bins': DEPTH_NAMES, 'haze': {'state': 't40', 'fill_per_m': F['fill']}, 'rules': RULES})
    C.setdefault('pars', {})
    C.setdefault('islands', {})

    def save():
        tmp = path + '.tmp'
        json.dump(C, open(tmp, 'w'), indent=1, default=JD)
        os.replace(tmp, path)
    pc = par_candidates(G, A, spread)
    todo = [c for c in pc if c['id'] not in C['pars']]
    print('PAR places: %d (%d to score)' % (len(pc), len(todo)), file=sys.stderr, flush=True)
    for i, c in enumerate(todo):
        if i % 25 == 0:
            S.wait_cool()
            save()
        d = unit(c['dir'])
        E, info = par_eye_light(W, c['p'], d, A=A)
        fp, throw = par_eye_footprint(W, c['p'], d)
        pen = par_pen_rect(c['p'], fp)
        C['pars'][c['id']] = dict(c, E=E.tolist(), score=R3(objective(E)), eye_fp=[[round(float(x), 2), round(float(z), 2)] for x, z in fp], throw_m=R3(throw),
                                  pen_rect=pen, pen_barrier_m=R3(2 * ((pen['x_m'][1] - pen['x_m'][0]) + (pen['z_m'][1] - pen['z_m'][0]))), **info)
    save()
    isl = island_candidates(G, A, spread)
    print('islands: %d, head slots %d' % (len(isl), sum(len(i['slots']) for i in isl)), file=sys.stderr, flush=True)
    for i, I in enumerate(isl):
        rec = C['islands'].get(I['id'])
        n_rows = len(I['slots'])
        if rec and len(rec.get('slot_options', [])) == n_rows and len(rec.get('sky', [])) == n_rows and rec.get('world') == BEAM_WORLD:
            continue
        rec = dict(I, slot_options=[], legal_dirs=[], sky=[], world=BEAM_WORLD)
        if I['kind'] == 'stage pen':
            # B's fan: fixed (FIX 1a). Each head's own G, from the fan's world (the park's air open, the near crane's steel kept)
            for fx in I['fixed']:
                S.wait_cool()
                head = np.array([fx['p'][0], fx['p'][1] - 0.7 + HEAD_Y, fx['p'][2]])
                d = aim_dir(fx['r'])
                t, nm, cl, _ = cast_full(WF, head, d[None, :], reach=120.0)
                tk = float(t[0]) if np.isfinite(t[0]) else 120.0
                Gm = beam_G(WF, F, head, d, tk, step=2.0, occlude=True)
                rec['slot_options'].append([{'dir': [R3(v) for v in d], 'az_el': list(az_el(d)), 'throw_m': R3(tk), 'ends_on': nm[0], 'end_cls': cl[0],
                                             'G': Gm.tolist(), 'score': R3(objective(Gm)), 'fixed_from': fx['id']}])
                rec['legal_dirs'].append(1)
                sk = S.sky(W, [head[0], 0.0, head[2]])
                rec['sky'].append({'clear_pct': sk['clear_pct'], 'roof_pct': sk['roof_pct'], 'blocked_pct': sk['blocked_pct'], 'glass_pct': sk['glass_pct'],
                                   'open_pct': round(sk['clear_pct'] + sk['roof_pct'], 1), 'top_blockers': sk['top_blockers'][:3]})
        else:
            EF = public_eyes(A, G, exclude=(I['rect'],), step=FIELD_STEP_M)
            for s_ in I['slots']:
                S.wait_cool()
                opts, n_legal = slot_options(W, A, F, np.asarray(s_, float), I, EF)
                rec['slot_options'].append(opts)
                rec['legal_dirs'].append(n_legal)
                sk = S.sky(W, [s_[0], s_[1] - HEAD_Y, s_[2]])          # occlusion_sky.py: the head's whole sky, 1200 equal-area rays
                rec['sky'].append({'clear_pct': sk['clear_pct'], 'roof_pct': sk['roof_pct'], 'blocked_pct': sk['blocked_pct'], 'glass_pct': sk['glass_pct'],
                                   'open_pct': round(sk['clear_pct'] + sk['roof_pct'], 1), 'top_blockers': sk['top_blockers'][:3]})
        C['islands'][I['id']] = rec
        save()
        best = [o[0]['score'] if o else 0 for o in rec['slot_options']]
        print('%-36s slots %d  legal %s  best %s' % (I['id'], len(I['slots']), rec['legal_dirs'], best), file=sys.stderr, flush=True)
    save()
    print('candidates -> %s' % path)


# ====================================================================== selection
def pick_beams(C):
    """B's fan in the stage pen (FIX 1a: its six heads as B tuned them, fixed), then the island whose best four heads add the
    most (objective gain x open sky), three times; islands >= ISLAND_MIN_GAP_M apart (centre to centre); and (FIX 1b) at least
    one in the entry half: if the first rounds took none, the last round chooses among the entry half's islands only. One aim
    per head slot."""
    import numpy as np
    nE, nB = len(EYES), len(DEPTH_NAMES)
    tot = np.zeros((nE, nB))
    isl = C['islands']
    centre = lambda I: ((I['rect']['x_m'][0] + I['rect']['x_m'][1]) / 2, (I['rect']['z_m'][0] + I['rect']['z_m'][1]) / 2)

    def best_heads(I, n, tot):
        tot = tot.copy()
        chosen, used, gain = [], set(), 0.0
        for _ in range(n):
            bi, bo, bg = None, None, None
            base = objective(tot)
            for si, opts in enumerate(I['slot_options']):
                if si in used:
                    continue
                for oi, o in enumerate(opts):
                    g = objective(tot + np.asarray(o['G'])) - base
                    if bg is None or g > bg:
                        bi, bo, bg = si, oi, g
            if bi is None:
                break
            used.add(bi)
            o = I['slot_options'][bi][bo]
            tot += np.asarray(o['G'])
            gain += bg
            chosen.append({'island': I['id'], 'slot': bi, 'option': bo, 'head': I['slots'][bi], 'gain': R3(bg), **o})
        return chosen, gain, tot
    sp = isl['the stage pen']
    heads = []
    for si, opts in enumerate(sp['slot_options']):                 # the fan: every head, its one fixed option
        o = opts[0]
        g = objective(tot + np.asarray(o['G'])) - objective(tot)
        tot = tot + np.asarray(o['G'])
        heads.append({'island': sp['id'], 'slot': si, 'option': 0, 'head': sp['slots'][si], 'gain': R3(g), 'slot_id': sp['slot_ids'][si], **o})
    if len(heads) != STAGE_PEN_HEADS:
        raise SystemExit('the stage pen holds %d of B\'s %d fan heads' % (len(heads), STAGE_PEN_HEADS))
    picked = [sp['id']]
    trail = []

    def open_share(I, ch):
        sk = I.get('sky') or []
        vals = [sk[h['slot']]['open_pct'] for h in ch if h['slot'] < len(sk)]
        return sum(vals) / len(vals) / 100.0 if vals else 1.0
    for k in range(ISLANDS):
        need_entry = k == ISLANDS - 1 and not any(centre(isl[p_])[1] >= ENTRY_HALF_Z for p_ in picked if isl[p_]['kind'] != 'stage pen')
        best = None
        for iid, I in isl.items():
            if iid in picked or I['kind'] == 'stage pen':
                continue
            if need_entry and centre(I)[1] < ENTRY_HALF_Z:
                continue
            if any(math.dist(centre(I), centre(isl[p_])) < ISLAND_MIN_GAP_M for p_ in picked if isl[p_]['kind'] != 'stage pen'):
                continue
            ch, gain, t2 = best_heads(I, HEADS_PER_ISLAND, tot)
            if len(ch) < HEADS_PER_ISLAND:
                continue
            sky = open_share(I, ch)
            score = gain * sky
            trail.append({'round': k + 1, 'island': iid, 'gain': R3(gain), 'open_sky': R3(sky), 'score': R3(score), 'entry_half_only': need_entry})
            if best is None or score > best[1]:
                best = (iid, score, ch, t2)
        if best is None:
            raise SystemExit('no island left for round %d%s' % (k + 1, ' (the entry half)' if need_entry else ''))
        picked.append(best[0])
        heads += best[2]
        tot = best[3]
    ranking = {}
    for r in trail:
        ranking.setdefault(r['round'], []).append(r)
    ranking = {k: sorted(v, key=lambda r: -r['score'])[:6] for k, v in ranking.items()}
    return heads, picked, tot, ranking


def par_place(c, fenced, A, P_pub):
    """FIX 5: may this PAR place be used once the fenced beam pens are known, and what keeps every standing eye out of its
    beam? Returns (ok, where, pen rect or None, why). where: 'stage pen' (crew only), 'machine' (an ember inside a machine),
    'beam pen <id>' (inside a fenced beam pen), or 'own pen' (a PAR pen: par_pen_rect, fenced). P_pub: the public feet points
    (the stage pen, the machines and the fenced beam pens out); for the first three, no public point may lie within LEAN_M of
    the lamp's eye footprint; an own pen is built to keep them out (its box is the footprint + LEAN_M)."""
    import numpy as np
    if c.get('pool_in_bar_or_chill'):
        return False, None, None, 'its pool lands on the bar or the chill zone'
    x, z = c['p'][0], c['p'][2]
    for R in list(fenced.values()) + [A.stage_pen]:
        foot = {'x_m': (R['x_m'][0] - BARRIER_FOOT_M, R['x_m'][1] + BARRIER_FOOT_M), 'z_m': (R['z_m'][0] - BARRIER_FOOT_M, R['z_m'][1] + BARRIER_FOOT_M)}
        if inside_rect(x, z, foot) and not inside_rect(x, z, R, 0.3):
            return False, None, None, 'on a pen barrier\'s feet'
    fp = np.asarray(c.get('eye_fp') or [], float).reshape(-1, 2)
    gap = footprint_gap(fp, P_pub)
    if inside_rect(x, z, A.stage_pen) and (inside_rect(x, z, FAN_STRIP, -0.6) or math.hypot(x - SMOKE_SERVICE[0], z - SMOKE_SERVICE[1]) < 1.5
                                           or any(float(_rect_gap(np.asarray([x]), np.asarray([z]), R)[0]) < CREW_GAP_M + 0.6 for R in CREW_LANES.values())):
        return False, None, None, 'on the crew\'s way in the stage pen (the fan strip, the smoke machine\'s refill side or a crew lane)'
    if inside_rect(x, z, A.stage_pen):
        return (gap >= LEAN_M), 'stage pen', None, 'the stage pen (crew only)' if gap >= LEAN_M else 'its beam reaches a public eye over the stage pen\'s barrier'
    if c['kind'] == 'ember':
        return (gap >= LEAN_M), 'machine', None, 'inside a machine' if gap >= LEAN_M else 'an eye beside the machine can be in its beam'
    inside = next((iid for iid, R in fenced.items() if inside_rect(x, z, R)), None)
    if inside:
        return (gap >= LEAN_M), 'beam pen ' + inside, None, 'inside a fenced beam pen' if gap >= LEAN_M else 'its beam leaves the pen under an eye'
    pen = c.get('pen_rect')
    if not pen:
        return False, None, None, 'no pen computed'
    ko2 = {'x_m': ENTRY_LASERS['ko2']['x_m'], 'z_m': ENTRY_LASERS['ko2']['z_m']}
    for name, K, pad in (('the dance floor', DANCE, 0.0), ('the entry corridor', ENTRY_CORRIDOR, 0.0), ('the FOH riser', FOH_RISER, 1.0),
                         ('the entry-laser tower pen', ko2, 0.5), ('the stage pen', {'x_m': A.stage_pen['x_m'], 'z_m': A.stage_pen['z_m']}, 0.0)):
        if rects_overlap(pen, K, pad):
            return False, None, None, 'its pen would stand on %s' % name
    for R in fenced.values():
        if rects_overlap(pen, R, PEN_GAP_M):
            return False, None, None, 'its pen would stand within %.0f m of a beam pen' % PEN_GAP_M
    (x0, x1), (z0, z1) = pen['x_m'], pen['z_m']
    if any(A.Z.inside('bar', px, pz, 0.5) or A.Z.inside('chill', px, pz, 0.5) for px in (x0, x1) for pz in (z0, z1)):
        return False, None, None, 'its pen would stand in the bar or the chill zone'
    return True, 'own pen', pen, 'its own fenced PAR pen (%.1f x %.1f m)' % (x1 - x0, z1 - z0)


def pick_pars(C, n, spacing, fixed=(), cover=None, allowed=None):
    """n PARs under the spacing rule (fixed units first). With cover=(cells, R), two phases (2026-10-10, the owner: "you can use
    the left places of the area"): first the maximal covering location greedy (Church & ReVelle 1974, Papers of the Regional
    Science Association 32: 101-118): each pick is the lamp that brings the most still-uncovered painted cells within R of a lamp
    (ties: the eye objective), among lamps that light something an eye sees (score > 0), until no lamp adds coverage; then the
    rest by the eye objective. Without cover: the eye objective alone. Returns the picks (each with its phase) and the totals."""
    import numpy as np
    nE, nB = len(EYES), len(DEPTH_NAMES)
    tot = np.zeros((nE, nB))
    for f in fixed:
        if f.get('E') is not None:
            tot += np.asarray(f['E'])
    chosen = [dict(f) for f in fixed]
    cands = [c for c in C['pars'].values() if allowed is None or allowed(c)]
    if cover:
        cells, R = cover
        CP = np.asarray([[c['p'][0], c['p'][2]] for c in cands], float)
        reach = np.hypot(cells[:, None, 0] - CP[None, :, 0], cells[:, None, 1] - CP[None, :, 1]) <= R
        covered = np.zeros(len(cells), bool)
        for f in fixed:
            covered |= np.hypot(cells[:, 0] - f['p'][0], cells[:, 1] - f['p'][2]) <= R
    phase = 'cover' if cover else 'eyes'
    while len(chosen) < n + len(fixed):
        base = objective(tot)
        bi, bk = None, None
        have = {o.get('id') for o in chosen}
        for i, c in enumerate(cands):
            if c['id'] in have or any(math.hypot(c['p'][0] - o['p'][0], c['p'][2] - o['p'][2]) < spacing - 1e-9 for o in chosen):
                continue
            g = objective(tot + np.asarray(c['E'])) - base
            if phase == 'cover':
                if c['score'] <= 0:
                    continue
                newc = int(np.sum(reach[:, i] & ~covered))
                if newc == 0:
                    continue
                k = (newc, g)
            else:
                k = (g,)
            if bk is None or k > bk:
                bi, bk = i, k
        if bi is None:
            if phase == 'cover':
                phase = 'eyes'
                continue
            break
        c = cands[bi]
        chosen.append(dict(c, gain=R3(objective(tot + np.asarray(c['E'])) - base), phase=phase))
        tot += np.asarray(c['E'])
        if cover:
            covered |= reach[:, bi]
    return chosen[len(fixed):], tot


def painted_cells(A):
    """Every 1 m cell of the owner's hot zone and wings, less the bar and the chill + food zone (x, z), as an array."""
    import numpy as np
    seen, out = set(), []
    for zid in ('hot', 'use'):
        for row in A.Z.areas[zid]:
            for x0, x1 in row['x_runs']:
                for x in range(int(round(x0)), int(round(x1)) + 1):
                    k = (x, row['z'])
                    if k in seen or A.Z.inside('bar', x, row['z'], 0.0) or A.Z.inside('chill', x, row['z'], 0.0):
                        continue
                    seen.add(k)
                    out.append(k)
    return np.asarray(out, float)


def coverage(units, cells):
    """How much of the painted area a set of lamps reaches: for every cell, the plan distance to the nearest lamp. The median, the
    90th percentile and the largest gap (the radius of the largest lamp-free circle centred on a cell), and the share within 6 m."""
    import numpy as np
    P = np.asarray([[u['p'][0], u['p'][2]] for u in units], float)
    d = np.min(np.hypot(cells[:, None, 0] - P[None, :, 0], cells[:, None, 1] - P[None, :, 1]), axis=1)
    return {'gap_median_m': R3(np.median(d)), 'gap_p90_m': R3(np.percentile(d, 90)), 'gap_max_m': R3(d.max()), 'within_6m_pct': R3(100.0 * np.mean(d <= 6.0))}


def pairs_closer(units, d):
    out = []
    for i in range(len(units)):
        for j in range(i + 1, len(units)):
            a, b = units[i]['p'], units[j]['p']
            if math.hypot(a[0] - b[0], a[2] - b[2]) < d:
                out.append((units[i].get('id'), units[j].get('id'), R3(math.hypot(a[0] - b[0], a[2] - b[2]))))
    return out


def match_ids(new, old):
    """Each new unit takes the id of the nearest old unit of its type still free (plan distance), so a unit that only moves keeps
    its id; greedy over all pairs, shortest first."""
    pairs = sorted(((math.hypot(n['p'][0] - o['p'][0], n['p'][2] - o['p'][2]), i, j) for i, n in enumerate(new) for j, o in enumerate(old)))
    used_n, used_o, out = set(), set(), {}
    for dd, i, j in pairs:
        if i in used_n or j in used_o:
            continue
        used_n.add(i)
        used_o.add(j)
        out[i] = (old[j], dd)
    return out


# ====================================================================== power and DMX for the whole rig
def circuits(units, sites, extra=()):
    """16 A radials from the nearest distro, one kind and side per circuit, <= 2 944 W and <= 5 % volt drop (4 mm2 where 2.5 mm2
    passes 5 %; BS 7671 Table 4D2B: 18 / 11 mV/A/m), the chain distro -> nearest unit -> next (floor Manhattan + rises + 0.5 m,
    +10 %, moxir_v2.circuits' cable model). A unit that would push the chain past either limit starts the next circuit.
    `extra`: circuits planned elsewhere (the lasers' C-LASER) that still take a phase (2026-10-10: it had none)."""
    import numpy as np
    by = {}
    for u in units:
        dist = min(sites, key=lambda k: abs(sites[k][0] - u['p'][0]) + abs(sites[k][2] - u['p'][2]))
        kind = 'smoke' if u['type'] == 'up-yz31p' else ('beams' if u['type'] == 'up-b380f' else ('truss' if u['part'].startswith('cut') else 'pars'))
        side = 'L' if u['p'][0] < (sites[dist][0] if dist in ('D-LEFT', 'D-RIGHT') else 0.0) else 'R'
        by.setdefault((dist, kind, side), []).append(u)

    def chain_of(g, s):
        pts, at, chain = list(g), (s[0], s[2]), []
        while pts:
            k = min(range(len(pts)), key=lambda j: abs(pts[j]['p'][0] - at[0]) + abs(pts[j]['p'][2] - at[1]))
            q = pts.pop(k)
            chain.append(((abs(q['p'][0] - at[0]) + abs(q['p'][2] - at[1]) + q['p'][1] + 0.5) * 1.1, q))
            at = (q['p'][0], q['p'][2])
        return chain

    def vd(chain, mv):
        left, v = sum(POWER_W[q['type']] for _, q in chain), 0.0
        for seg, q in chain:
            v += mv / 1000.0 * (left / 230.0) * seg
            left -= POWER_W[q['type']]
        return 100.0 * v / 230.0

    def rate(g, s):
        ch = chain_of(g, s)
        w = sum(POWER_W[q['type']] for q in g)
        p25 = vd(ch, 18)
        mm2, pct = (2.5, p25) if p25 <= 5.0 else (4.0, vd(ch, 11))
        return ch, w, mm2, pct
    out, n = [], 0
    for (dist, kind, side), us in sorted(by.items()):
        s = sites[dist]
        groups, cur = [], []
        for u in sorted(us, key=lambda u: abs(u['p'][0] - s[0]) + abs(u['p'][2] - s[2])):
            trial = cur + [u]
            _, w, _, pct = rate(trial, s)
            if cur and (w > CIRCUIT_W or pct > 5.0):
                groups.append(cur)
                cur = [u]
            else:
                cur = trial
        if cur:
            groups.append(cur)
        for g in groups:
            n += 1
            ch, w, mm2, pct = rate(g, s)
            out.append({'circuit': 'C%02d' % n, 'distro': dist, 'kind': kind, 'side': side, 'units': [u['id'] for _, u in ch], 'load_w': w,
                        'amps_230v': round(w / 230.0, 1), 'cable_m': round(sum(c for c, _ in ch), 1), 'first_run_m': round(ch[0][0], 1),
                        'cable_mm2': mm2, 'vdrop_pct': round(pct, 1), 'ok': w <= CIRCUIT_W and pct <= 5.0,
                        'route': [[R3(s[0]), R3(s[2])]] + [[R3(q['p'][0]), R3(q['p'][2])] for _, q in ch]})
    allc = out + [dict(c) for c in extra]
    ph = {'L1': 0, 'L2': 0, 'L3': 0}
    for c in sorted(allc, key=lambda c: -c['load_w']):
        k = min(ph, key=ph.get)
        c['phase'] = k
        ph[k] += c['load_w']
    return allc, ph


NODES = {'NODE-STAGE': 2, 'NODE-FAR': 1, 'NODE-LEFT': 2, 'NODE-RIGHT': 2}    # v1.1's Art-Net nodes and their DMX ports
# 2026-10-10: a node's two ports split by SIDE (NODE-STAGE: house left / right of the dance floor's centre line x -3.75; NODE-LEFT /
# NODE-RIGHT: the far / near half, z < 0 / >= 0), so no line has to cross the dance floor to reach its far side.
PORT_SPLIT = {'NODE-STAGE': ('x', -3.75), 'NODE-LEFT': ('z', 0.0), 'NODE-RIGHT': ('z', 0.0)}


def patch(units, sites):
    """Each unit on the nearest node's DMX line (v1.1's nodes and ports), a line <= DMX_MAX_DEVICES devices (FIX 8: 4 of the 32 ANSI E1.11 / EIA-485 unit loads spare) and
    <= 512 channels; a full line hands the unit to the next nearest node. A two-port node takes a unit on the port of its side
    (PORT_SPLIT), the other port only when that one is full. One universe per line. Each line's daisy chain runs node -> nearest
    unit -> next (its route, for the crossings)."""
    lines = {}
    order = {k: i for i, k in enumerate(NODES)}
    truss_lines = set()
    for u in sorted(units, key=lambda u: (not u['part'].startswith('cut'), u['type'], u['p'][2], u['p'][0])):
        fp = DMX_FOOT[u['type']]
        placed = False
        for node in sorted(NODES, key=lambda k: (abs(sites[k][0] - u['p'][0]) + abs(sites[k][2] - u['p'][2]), order[k])):
            ports = list(range(1, NODES[node] + 1))
            if node in PORT_SPLIT and len(ports) == 2:
                ax, cut = PORT_SPLIT[node]
                side = 1 if (u['p'][0] if ax == 'x' else u['p'][2]) < cut else 2
                ports = [side, 3 - side]
            for port in ports:
                L = lines.setdefault((node, port), {'devices': 0, 'next': 1, 'units': []})
                cap = DMX_MAX_DEVICES - (TRUSS_SPARE_DEVICES if (node, port) in truss_lines else 0)
                if L['devices'] < cap and L['next'] + fp - 1 <= 512:
                    if u['part'].startswith('cut'):
                        truss_lines.add((node, port))
                    u['dmx'] = {'node': node, 'line': '%s-%d' % (node, port), 'address': L['next'], 'footprint': fp}
                    L['devices'] += 1
                    L['next'] += fp
                    L['units'].append(u)
                    placed = True
                    break
            if placed:
                break
        if not placed:
            raise SystemExit('no DMX line has room for %s' % u['id'])
    uni = {k: i + 1 for i, k in enumerate(sorted(lines, key=lambda k: (order[k[0]], k[1])))}
    for u in units:
        u['dmx']['universe'] = uni[(u['dmx']['node'], int(u['dmx']['line'].rsplit('-', 1)[1]))]
        u['dmx']['branch'] = u['dmx']['line']
    out = []
    for k, v in sorted(lines.items(), key=lambda kv: uni[kv[0]]):
        s = sites[k[0]]
        pts, at, route = list(v['units']), (s[0], s[2]), [[R3(s[0]), R3(s[2])]]
        while pts:
            j = min(range(len(pts)), key=lambda i: abs(pts[i]['p'][0] - at[0]) + abs(pts[i]['p'][2] - at[1]))
            q = pts.pop(j)
            at = (q['p'][0], q['p'][2])
            route.append([R3(at[0]), R3(at[1])])
        out.append({'line': '%s-%d' % k, 'universe': uni[k], 'devices': v['devices'], 'channels': v['next'] - 1, 'spare_devices': DMX_MAX_DEVICES - v['devices'],
                    'ok': v['devices'] <= DMX_MAX_DEVICES and v['next'] - 1 <= 512, 'route': route})
    return out


WALKWAYS = (('the dance floor', DANCE), ('the entry corridor', ENTRY_CORRIDOR))


def crossings(route):
    """Where a floor cable route (a list of plan points, each leg run as an L: along x then z, or z then x, whichever crosses
    less) crosses a walkway (WALKWAYS: the dance floor, the entry corridor): each crossing needs a cable ramp. Returns a list of
    {walkway, at}."""
    def leg_hits(a, b):
        hits = []
        for name, R in WALKWAYS:
            (x0, x1), (z0, z1) = R['x_m'], R['z_m']
            if a[1] == b[1]:                       # along x at z
                if z0 < a[1] < z1 and max(min(a[0], b[0]), x0) < min(max(a[0], b[0]), x1):
                    hits.append((name, [R3((max(min(a[0], b[0]), x0) + min(max(a[0], b[0]), x1)) / 2), R3(a[1])]))
            else:                                  # along z at x
                if x0 < a[0] < x1 and max(min(a[1], b[1]), z0) < min(max(a[1], b[1]), z1):
                    hits.append((name, [R3(a[0]), R3((max(min(a[1], b[1]), z0) + min(max(a[1], b[1]), z1)) / 2)]))
        return hits
    out = []
    for a, b in zip(route, route[1:]):
        xz = leg_hits(a, (b[0], a[1])) + leg_hits((b[0], a[1]), b)
        zx = leg_hits(a, (a[0], b[1])) + leg_hits((a[0], b[1]), b)
        best = xz if len(xz) <= len(zx) else zx
        out += [{'walkway': n, 'at': at} for n, at in best]
    return out



# ====================================================================== build: the ground layer + the full rig + the checks
RIG11 = 'scripts/place/rigs/moxir-epic-v1-1-2026-10-08.json'
GONE_PARTS = ('halo', 'stage columns', 'speaker face L', 'speaker face R', 'stage key', 'roof', 'embers', 'columns', 'runway',
              'plane 2 (the wings)', 'plane 3 (behind the stage)', 'plane 4 (the entry side)', 'DJ key (ground option)',
              'stage front booth (ground)', 'stage front PA L (ground)', 'stage front PA R (ground)')
FAN_PART = 'plane 1 (behind the DJ)'
KEY_PART = 'DJ key (ground option)'
FRONT_PARTS = {'key': KEY_PART, 'booth': 'stage front booth (ground)', 'PA L': 'stage front PA L (ground)', 'PA R': 'stage front PA R (ground)'}
FRONT_IDS = {'key': 'rig-par-planes-25', 'booth': 'rig-par-planes-23', 'PA L': 'rig-par-planes-24', 'PA R': 'rig-par-planes-28'}   # the spread's two keys and speaker-face PARs: same jobs, now on the floor
# THE LOOKS' LEVELS for the ground layer, under the room's LINEAR level law (#868: a fader at L draws L). The fan, plane 3 and
# the PAR parts keep the spread's design faders (the owner saw them on 10-09; the spread's dark wings 0.64 = its 0.8 drawn under
# the level-squared bug, a9d4b0d1). The peak's hall beams (planes 2 and 4) and PARs are set from this rig's own frames to use
# the floor glare budget (FIX 1c, LEVEL_TUNING: every frame drawn for it). The lasers: the spread's desk cap (fader 0.16 =
# the drawn fraction measured under budget, a9d4b0d1), carried by the spread's own peak look.
LEVEL_TUNING = {
    'budget_white_pct': 0.65,
    'method': 'moxir-v2-true-frames.cjs setKeys on a part\'s units (the browser\'s copy only), EV100 2.84, Full, haze t40, real GPU; frame_luma.py white-out of the floor view at the peak',
    'measured': [],
    'superseded': {'what': 'the first build (4d76fc1c): plane 1 fanned sideways at 32 deg, its X whited out the behind-the-stage view, held at 0.5; B\'s fan is back (FIX 1a)',
                   'measured': [{'view': 'behind', 'look': 'peak', 'level': 1.0, 'white_pct': 0.92}, {'view': 'behind', 'look': 'peak', 'level': 0.6, 'white_pct': 0.67},
                                {'view': 'behind', 'look': 'peak', 'level': 0.4, 'white_pct': 0.47}, {'view': 'floor', 'look': 'peak', 'level': 1.0, 'white_pct': 0.58}]},
}
LOOK_LEVELS = {
    # the dark look: the spread's design faders for the beams and the columns (ember), and (2026-10-10) the hall's other floor
    # washes in ember at the columns' 0.5 too: off, half of the floor PARs left the steel dark (the dark frames read half as bright
    # as the spread's from every audience view); one colour, so the look stays dark-first
    'dark': {FAN_PART: [EMBER, 0.8], 'plane 2 (the wings)': [EMBER, 0.64], 'plane 3 (behind the stage)': [EMBER, 0.35],
             'plane 4 (the entry side)': [EMBER, 0.64], 'columns': [EMBER, 0.5], 'roof': [EMBER, 0.5], 'runway': [EMBER, 0.5]},
    # the peak (FIX 1c): every hall beam and PAR at full. Measured (LEVEL_TUNING, the floor view): the build's first levels (planes
    # 2 / 4 at 0.6, plane 3 at 0.7, PARs 0.6-0.8) white out 0.31 %, everything at full 0.32 % of the 0.65 % budget: the ground's
    # beams stand >= 30 deg off every eye, so they glare far less per unit than the spread's (0.58 % at its 0.20 wings)
    'peak': {FAN_PART: [EMBER, 1.0], 'plane 2 (the wings)': [ASH, 1.0], 'plane 3 (behind the stage)': [EMBER, 1.0],
             'plane 4 (the entry side)': [ASH, 1.0], 'columns': [EMBER, 1.0], 'roof': [ASH, 1.0], 'runway': [ASH, 1.0], 'embers': [EMBER, 1.0]},
}
OWED = [
    'The crowd plan (the promoter\'s safety lead): the fenced pens (beam pens and PAR pens: crowd barrier 1.1 m, ASSUMED; a 0.6 m hand reach and a 0.5 m lean over it, ASSUMED; the Purple Guide figures are not read), stewards on the pens\' round (MOXIR.md 5.3), the stage pen\'s barrier (owed since the spread).',
    'The stage front: the two PA-face PARs stand at the pit\'s ends, beside their boxes, 1.16 m (PA L) and 0.61 m (PA R) behind the barrier: inside the 1.4 m reach of ISO 13857 Table 2, so under a mesh guard with the pit\'s security as the steward. The proper fix: the barrier 1 m further out (z 9.2: the pit in front of PA R is 0.96 m today) or these two faces from the truss. The crowd-safety lead decides.',
    'The B380F: its IEC 62471 risk group and hazard distance (not published; fixtures-exact.md). The pens, the 3.0 m line, the fan strip and the crew lanes are the controls until it is known; its manual (clamp points, reset behaviour, DMX-loss mode) from Poligraf.',
    'The desk: each floor B380F\'s pan/tilt window (desk_limits in each fixture: degrees from home and 16-bit DMX) set as position limits in the desk that runs the show; the DMX numbers assume centre = home (dmxDecode.js) until the B380F channel walk; the shutter closed on DMX loss and during a reset.',
    'The base plates: 600 x 600 x 18 mm ply + 2 x 15 kg sandbags per B380F (or anchors with the venue\'s written OK); the venue\'s OK for floor plates; the cable runs: the ramps at the crossings listed in the rig (power and DMX), every other run along a column line or a pen\'s barrier.',
    'The PAR\'s candela: the scene draws 30 478 cd, the spec figure is 11 000 cd (EQUIVALENT): every lux and the white-out here are at the scene\'s figure. The stage front runs at low faders: the PL5403\'s dimmer curve and resolution (8-bit, TESTED map) decide on site; set with a lux meter.',
    'The haze on site: the frames use the one machine\'s 40-minute estimate (UNVALIDATED).',
    'The DJ key from the floor is an OPTION: its level is set on site with a lux meter at his face, combined with the truss DJ light (another workflow).',
    'The truss, the near crane and the cubes are being moved by other workflows: the island beams treat the crane park (x -12..12, z -2..7, 2.5-10.8 m) as solid; B\'s fan crosses its air (as the owner saw it) and meets only the crane\'s girders at some parks z 0.15-3.2, never the cut (checked at 0.15, 1.2, 2.2, 3.2, 4.25). Re-check against their final places.',
    'The entry lasers (#873): the 1 m (apertures) and 3 m (far-wall blocks) margins are ASSUMED; the laser session should look at these beams\' paths. The floor glare here is measured without the 2 x 40 W entry lasers (another builder; held dark until the IEC 60825-1 sign-off): measure again with them once they are in the scene.',
    'The owner\'s look at the page and at the project in the scene.',
]


def island_part(I):
    zc = (I['rect']['z_m'][0] + I['rect']['z_m'][1]) / 2
    if I['kind'] == 'stage pen':
        return FAN_PART, EMBER
    if zc < -7.5:
        return 'plane 3 (behind the stage)', EMBER
    if zc >= ENTRY_HALF_Z:
        return 'plane 4 (the entry side)', ASH
    return 'plane 2 (the wings)', ASH


def beam_recheck(W, WF, A, F, f, rect, EF):
    """A placed beam, checked again from the rig file's own numbers (head, rotation) as the room will draw it, over its whole
    desk window (FIX 2: every pan of WINDOW_PANS x every tilt of WINDOW_TILTS): the pen (0.01 m, the lens, the aim tolerance),
    the crew rule in the stage pen (FIX 4), the dense glare over the whole public floor (EF, FIX 3), every window direction's
    end, the ring at the aim, the laser keep-outs, the head's reach from its barrier (islands) and, for B's fan, the near crane
    at every park (FIX 1a)."""
    import numpy as np
    head = np.array([f['p'][0], f['p'][1] - 0.7 + HEAD_Y, f['p'][2]])
    d = aim_dir(f['r'])
    fan = f['island'] == 'the stage pen'
    Wb = WF if fan else W
    allow = NEAR_CRANE_ALLOW if fan else ()
    WD = window_dirs(d, tilts=WINDOW_TILTS)
    t, names, cls, _ = cast_full(Wb, head, WD, reach=120.0)
    i0 = list(WINDOW_PANS).index(0.0)
    tk = float(t[i0]) if np.isfinite(t[i0]) else 120.0
    end = head + d * tk
    win_bad = []
    for k in range(len(WD)):
        tw = float(t[k]) if np.isfinite(t[k]) else 120.0
        e = head + WD[k] * tw
        bad_cls = cls[k] in BAD_END and not (names[k] and any(names[k].startswith(a_) for a_ in allow))
        if bad_cls or A.ends_bad(e[0], e[2]) or e[2] > 53.0 or block_gap(e) < BLOCK_FREE_M:
            win_bad.append({'az_el': list(az_el(WD[k])), 'ends_on': names[k]})
    ring_ok, ring_why, ring_ends = ring_check(Wb, A, head, d, allow)
    pw = pen_window(head, d, tk, rect, fan)
    fg = float(field_glare(head, WD, EF).min()) if len(EF) else 180.0
    named = np.asarray([e for e in list(EYES.values()) + [DJ_EYE] if not inside_rect(e[0], e[2], rect)], float)
    ng = float(field_glare(head, WD, named).min())
    gl = glare_min_deg(head, d, tk, dict(EYES, **{'the DJ': DJ_EYE}))
    bad_end = A.ends_bad(end[0], end[2])
    bg = block_gap(end)
    ap, cubes = aperture_gap(head, d, tk)
    (x0, x1), (z0, z1) = rect['x_m'], rect['z_m']
    reach = None if fan else R3(min(head[0] - x0, x1 - head[0], head[2] - z0, z1 - head[2]))
    parks = fan_park_meets(head, d) if fan else None
    aim_bad = cls[i0] in BAD_END and not (names[i0] and any(names[i0].startswith(a_) for a_ in allow))
    ok = (not aim_bad and ring_ok and pw['ok'] and not bad_end and end[2] <= 53.0 and min(fg, ng) >= GLARE_DEG and tk >= MIN_THROW_M
          and bg >= BLOCK_FREE_M and ap >= APERTURE_PAD_M and cubes >= APERTURE_PAD_M and not win_bad and (pw['crew_ok'] or not fan)
          and (reach is None or reach >= HEAD_REACH_M - 1e-6) and (parks is None or not parks['cut']))
    return {'id': f['id'], 'part': f['part'], 'island': f.get('island'), 'throw_m': R3(tk), 'ends_on': names[i0], 'end_cls': cls[i0], 'end': [R3(v) for v in end],
            'ring_ok': ring_ok, 'ring_why': ring_why, 'ring_ends': ring_ends, 'pen_inside_island': pw['ok'], 'pen_m': pw['r30'], 'pen_hand_m': pw['r28'],
            'pen_aim_m': pw['r30_aim'], 'pen_barrier_gap_m': pw['barrier_gap_m'], 'crew_ok': pw['crew_ok'] if fan else None,
            'smoke_service_gap_m': pw.get('smoke_gap_m') if fan else None, 'crew_lane_gap_m': pw.get('lane_gap_m') if fan else None,
            'head_from_barrier_m': reach, 'window': {'pan_az_deg': [R3(az_el(WD[0])[0]), R3(az_el(WD[len(WINDOW_PANS) - 1])[0])],
                                                       'tilt_el_deg': [R3(az_el(d)[1]), R3(min(az_el(d)[1] + TILT_UP_DEG, 89.5))], 'directions': len(WD), 'directions_refused': win_bad},
            'field_glare_min_deg': R3(fg), 'named_glare_min_deg': R3(ng), 'ends_in_bar_or_chill': bad_end, 'ends_on_entry_wall': end[2] > 53.0, 'glare_min_deg': gl,
            'glare_min_deg_any': R3(min(min(gl.values()), ng)),
            'into_crane_or_park': (cls[i0] in ('crane', 'crane park')) and not fan, 'near_crane_parks': parks,
            'far_wall_block_gap_m': R3(bg), 'entry_aperture_gap_m': ap, 'cubes_box_gap_m': cubes, 'into_laser_keep_out': cls[i0] in KEEP_OUT_CLS, 'ok': ok}


def eye_totals(W, F, fixtures, A=None, look=None):
    """Every non-truss PAR and B380F of a rig, seen from the 9 eyes (the selection's own metric): PAR lx from the lit surfaces
    (the crowd not see-through when A is given), beam G; at full, or (look given) each part at its level x its colour's
    luminance share. W should be the fan's world (the crane park's air open) so two rigs are compared in the same hall."""
    import numpy as np
    import moxir_v2_spread as SP
    P = np.zeros((len(EYES), len(DEPTH_NAMES)))
    B = np.zeros((len(EYES), len(DEPTH_NAMES)))
    for f in fixtures:
        if f['part'].startswith('cut') or f['type'] not in ('up-pl5403', 'up-b380f'):
            continue
        k = 1.0
        if look is not None:
            if f['part'] not in look['parts']:
                continue
            col, lev = look['parts'][f['part']]
            k = lev * SP.lum_factor(col or f.get('colour') or ASH)
        if f['type'] == 'up-pl5403':
            E, _ = par_eye_light(W, f['p'], aim_dir(f['r']), A=A)
            P += E * k
        else:
            head = np.array([f['p'][0], f['p'][1] - 0.7 + HEAD_Y, f['p'][2]])
            d = aim_dir(f['r'])
            t, _, _, _ = cast_full(W, head, d[None, :], reach=120.0, skip=EYE_SKIP)
            B += beam_G(W, F, head, d, float(t[0]) if np.isfinite(t[0]) else 120.0, step=2.0, occlude=True) * k
    layers = lambda M: {e: int(sum(1 for v in M[k] if v >= 0.05 * max(M[k].sum(), 1e-12))) for k, e in enumerate(EYES)}
    ones = np.ones(len(EYES))
    return {'par_lux_at_eye': {e: R3(P[k].sum()) for k, e in enumerate(EYES)}, 'beam_G': {e: round(float(B[k].sum()), 5) for k, e in enumerate(EYES)},
            'par_layers': layers(P), 'beam_layers': layers(B), 'objective_pars': R3(objective(P)), 'objective_beams': R3(objective(B)),
            'objective_pars_unweighted': R3(objective(P, ones)), 'objective_beams_unweighted': R3(objective(B, ones)),
            'par_by_depth': {e: [R3(v) for v in P[k]] for k, e in enumerate(EYES)}, 'beam_by_depth': {e: [round(float(v), 5) for v in B[k]] for k, e in enumerate(EYES)}}


CROWD_EYES = ('floor centre', 'FOH', 'mid-hall', 'near the entry', 'wing L', 'wing R')     # where most people stand (the review's set)


def epic_table(eb, ea, wt):
    """Before / after per eye: beam G and PAR lx, with each eye's weight; the people-weighted totals and the review's crowd
    set, and the RATIO ground / spread of each."""
    rows = {}
    for e in EYES:
        rows[e] = {'weight': wt[e]['weight'], 'beam_G': [eb['beam_G'][e], ea['beam_G'][e]], 'par_lx': [eb['par_lux_at_eye'][e], ea['par_lux_at_eye'][e]],
                   'beam_ratio': R3(ea['beam_G'][e] / max(eb['beam_G'][e], 1e-12)), 'par_ratio': R3(ea['par_lux_at_eye'][e] / max(eb['par_lux_at_eye'][e], 1e-12))}
    wsum = lambda key, i, eyes: sum(wt[e]['weight'] * rows[e][key][i] for e in eyes)
    out = {'per_eye': rows}
    for name, eyes in (('people_weighted', list(EYES)), ('crowd_eyes', list(CROWD_EYES))):
        bg = [round(wsum('beam_G', i, eyes), 5) for i in (0, 1)]
        pl = [R3(wsum('par_lx', i, eyes)) for i in (0, 1)]
        out[name] = {'eyes': eyes, 'beam_G': bg, 'par_lx': pl, 'beam_ratio': R3(bg[1] / max(bg[0], 1e-12)), 'par_ratio': R3(pl[1] / max(pl[0], 1e-12))}
    out['what'] = '[the spread, the ground] from the same nine eyes in the same hall (the fan\'s world: the crane park\'s air open, the near crane at z 0.15 as the model has it); weights = the people each eye stands for (FIX 1); ratio = ground / spread'
    return out


def field_check(beams, EF, aim_only=False):
    """FIX 3 on the placed rig: per public eye (EF: plan points x EYE_YS), the smallest angle to any beam over its whole window;
    returns the failing share of the public floor AREA (a plan point fails when any of its heights does) and the exceptions."""
    import numpy as np
    n_y = len(EYE_YS)
    ang = np.full(len(EF), 180.0)
    who = np.full(len(EF), -1)
    for i, f in enumerate(beams):
        head = np.array([f['p'][0], f['p'][1] - 0.7 + HEAD_Y, f['p'][2]])
        D = aim_dir(f['r'])[None, :] if aim_only else window_dirs(aim_dir(f['r']), tilts=WINDOW_TILTS)
        a = field_glare_cells(head, D, EF)
        better = a < ang
        ang[better] = a[better]
        who[better] = i
    m = len(EF) // n_y
    per_pt = ang.reshape(n_y, m).min(axis=0)
    fail = per_pt < GLARE_DEG
    by_y = {('%g' % y): R3(100.0 * float(np.mean(ang[k * m:(k + 1) * m] < GLARE_DEG))) for k, y in enumerate(EYE_YS)}
    ex = []
    for j in np.nonzero(fail)[0][:40]:
        k = int(np.argmin([ang[kk * m + j] for kk in range(n_y)]))
        ex.append({'x': R3(EF[j, 0]), 'z': R3(EF[j, 2]), 'deg': R3(per_pt[j]), 'beam': beams[int(who[k * m + j])]['id']})
    return {'points': int(m), 'step_m': FIELD_STEP_M, 'heights_m': list(EYE_YS), 'area_m2': R3(m * FIELD_STEP_M ** 2), 'fail_points': int(fail.sum()),
            'fail_area_m2': R3(float(fail.sum()) * FIELD_STEP_M ** 2), 'fail_pct': R3(100.0 * float(fail.mean())), 'fail_pct_by_height': by_y,
            'min_deg': R3(float(per_pt.min())), 'exceptions': ex,
            'what': 'every public plan point (painted hot, wings, bar, chill; not the stage pen, a fenced pen or a machine) every %.1f m, eyes at %s m (+0.6 on the FOH riser), every beam over its whole desk window (%d pans x %d tilts), the angle at the head' % (
                FIELD_STEP_M, '/'.join('%g' % y for y in EYE_YS), len(WINDOW_PANS), len(WINDOW_TILTS))}


def par_eye_check(W, pars, P):
    """FIX 5 on the placed rig: for every floor PAR, its eye footprint (par_eye_footprint) against the public feet points P
    (0.25 m; the stage pen, the machines and every fenced pen out): a PAR fails when a public point lies within LEAN_M of it."""
    import numpy as np
    rows, bad = [], []
    for f in pars:
        fp, th = par_eye_footprint(W, f['p'], aim_dir(f['r']))
        gap = footprint_gap(fp, P)
        near = 0
        if len(fp) and np.isfinite(gap) and gap < LEAN_M:
            x0, x1 = fp[:, 0].min() - LEAN_M, fp[:, 0].max() + LEAN_M
            z0, z1 = fp[:, 1].min() - LEAN_M, fp[:, 1].max() + LEAN_M
            Q = P[(P[:, 0] >= x0) & (P[:, 0] <= x1) & (P[:, 1] >= z0) & (P[:, 1] <= z1)]
            near = int(np.sum(np.min(np.hypot(Q[:, None, 0] - fp[None, :, 0], Q[:, None, 1] - fp[None, :, 1]), axis=1) < LEAN_M))
            bad.append(f['id'])
        rows.append({'id': f['id'], 'where': f.get('stands_in'), 'footprint_points': int(len(fp)), 'throw_m': R3(th),
                     'nearest_public_m': None if not np.isfinite(gap) else R3(gap), 'public_points_within_lean': near, 'ok': f['id'] not in bad})
    return {'pars': len(pars), 'fail': bad, 'fail_count': len(bad), 'rows': rows, 'lean_m': LEAN_M, 'heights_m': [min(EYE_YS), max(EYE_YS)],
            'what': 'every floor PAR: its beam (15 deg + %.0f deg aim tolerance, from its %.2f m lens) between 1.5 and 1.9 m up to its first hit, against every public feet point 0.25 m apart (the stage pen, the machines and every fenced pen out); a person leaning %.1f m' % (
                PAR_AIM_TOL_DEG, PAR_LENS_R_M, LEAN_M)}


def build(repo, out):
    import numpy as np
    import occlusion_sky as S
    import moxir_v2_spread as SP
    import moxir_v2_true as V
    S.wait_cool()
    cpath = os.path.join(out, CANDIDATES)
    C = json.load(open(cpath))
    if C.get('rules') != RULES or C.get('par_rules') != PAR_RULES:
        raise SystemExit('%s was scored under other rules (%s / %s): run candidates' % (cpath, C.get('rules'), C.get('par_rules')))
    SPR = json.load(open(os.path.join(repo, RIG_SP)))
    W = world(repo)
    WF = fan_world(repo)
    A = Area(repo)
    Z = A.Z
    w, wtable = eye_weights(A, W.G)
    set_eye_weights(w)
    want = {c['id'] for c in par_candidates(W.G, A, SPR)}
    missing = sorted(want - set(C['pars']))
    if missing:
        raise SystemExit('%s lacks %d PAR places (%s ...): run candidates again (it resumes)' % (CANDIDATES, len(missing), missing[:3]))
    C['pars'] = {k: v for k, v in C['pars'].items() if k in want}
    wanti = {I['id'] for I in island_candidates(W.G, A, SPR)}
    if wanti - set(C['islands']):
        raise SystemExit('%s lacks islands %s: run candidates again' % (CANDIDATES, sorted(wanti - set(C['islands']))[:3]))
    sm = next(f for f in SPR['fixtures'] if f['type'] == 'up-yz31p')
    F = V.field_numbers(repo, [sm['p'][0], sm['p'][1] + 0.1, sm['p'][2]], [0, 0, 1], states=('t40',))['t40']

    # ---- 1. the beams: B's fan (fixed), then four fenced islands of three, one in the entry half. Every scored option is first
    # checked over its WHOLE window's ends (every pan x tilt): the candidates of 10-10 were scored on a coarser sample
    dropped = 0
    for iid, I in C['islands'].items():
        if I['kind'] == 'stage pen':
            continue
        for si, opts in enumerate(I['slot_options']):
            keep_o = []
            for o in opts:
                ok_w, _ = window_ends_ok(W, A, np.asarray(I['slots'][si], float), np.asarray(o['dir'], float), WINDOW_PANS, WINDOW_TILTS)
                if ok_w:
                    keep_o.append(o)
                else:
                    dropped += 1
            I['slot_options'][si] = keep_o
    print('options dropped by the whole window\'s ends: %d' % dropped, file=sys.stderr, flush=True)
    heads, picked, Gtot, ranking = pick_beams(C)
    isl = {iid: C['islands'][iid] for iid in picked}
    fenced = {iid: I['rect'] for iid, I in isl.items() if I['kind'] != 'stage pen'}
    A.pens = list(fenced.values())
    old_beams = sorted([f for f in SPR['fixtures'] if f['type'] == 'up-b380f'], key=lambda f: f['id'])
    old_by = {f['id']: f for f in old_beams}
    free_old = [f for f in old_beams if not f['part'].startswith('plane 1')]
    island_heads = [h for h in heads if not h.get('slot_id')]
    m = match_ids([{'p': h['head']} for h in island_heads], free_old)
    beams = []
    for h in heads:
        I = isl[h['island']]
        part, colour = island_part(I)
        if h.get('slot_id'):
            was, dd = old_by[h['slot_id']], 0.0
            fid, p_, r_ = was['id'], list(was['p']), list(was['r'])           # B's fan: the spread's own numbers, untouched
            d = aim_dir(r_)
        else:
            was, dd = m[island_heads.index(h)]
            fid = was['id']
            d = np.asarray(h['dir'], float)
            p_ = [R3(h['head'][0]), R3(h['head'][1] - HEAD_Y + 0.7), R3(h['head'][2])]
            r_ = rot_for_dir(d)
        az, el = az_el(d)
        sky_rows = I.get('sky') or []
        sk = sky_rows[h['slot']] if h['slot'] < len(sky_rows) else S.sky(W, [h['head'][0], 0.0, h['head'][2]])
        head = np.array([p_[0], p_[1] - 0.7 + HEAD_Y, p_[2]])
        beams.append({'id': fid, 'type': 'up-b380f', 'part': part, 'layer': 'beams', 'status': 'used', 'moments': [],
                      'position': ('%s: base on the floor, bolted to a ballasted floor plate, levelled; aim %.0f/%.0f deg (az/el), throw %.1f m to %s'
                                   % (I['id'], az, el, h['throw_m'], h['ends_on'])) + (' (B\'s fan as the owner saw it on 10-09, not re-aimed)' if h.get('slot_id') else ''),
                      'p': p_, 'r': r_, 'colour': colour, 'angle_rad': 0.0157,
                      'throw_m': h['throw_m'], 'ends_on': h['ends_on'], 'island': I['id'], 'desk_limits': desk_limits(head, d), 'base': base_check(d),
                      'sky_clear_pct': sk['clear_pct'], 'sky_open_pct': sk.get('open_pct', round(sk['clear_pct'] + sk['roof_pct'], 1)), 'sky_blocked_pct': sk['blocked_pct'],
                      'eye_G': {e: round(float(sum(h['G'][k])), 5) for k, e in enumerate(EYES)}, 'gain': h['gain'],
                      'moved_from': {'p': was['p'], 'part': was['part'], 'plan_m': R3(dd)}, 'power_w': POWER_W['up-b380f'],
                      **({'kept_from_spread': True} if h.get('slot_id') else {})})

    # ---- 2. the PARs: the stage front (4, fixed: the DJ key, the booth front, the PA faces), then the hall's 36 under FIX 5
    front = []
    for k, sf in STAGE_FRONT.items():
        d = unit(np.asarray(sf['aim']) - np.asarray(sf['p']))
        front.append({'id': 'stage front %s' % k, 'front': k, 'kind': 'DJ key' if k == 'key' else 'stage front', 'p': sf['p'], 'dir': [R3(v) for v in d],
                      'part': FRONT_PARTS[k], 'colour': ASH, 'targets': list(sf['targets']),
                      'position': ('DJ key, a GROUND OPTION (combine with the truss DJ light): %s' if k == 'key' else 'the %s face from the floor: %%s' % k) % sf['why']})
    rects_fenced = tuple(fenced.values())
    P_pub = public_points(A, W.G, exclude=rects_fenced, step=0.5)
    place_of = {cid: par_place(c, fenced, A, P_pub) for cid, c in C['pars'].items()}
    refused = {}
    for ok, where, pen, why in place_of.values():
        if not ok:
            refused[why] = refused.get(why, 0) + 1
    allowed = lambda c: place_of[c['id']][0]
    cells = painted_cells(A)
    cover = (cells, PAR_COVER_R_M)
    n_hall = GROUND_PARS - len(front)
    pars, Ptot = pick_pars(C, n_hall, PAR_MIN_SPACING_M, fixed=front, cover=cover, allowed=allowed)
    if len(pars) != n_hall:
        raise SystemExit('the spacing rule left room for %d PARs, needs %d' % (len(pars), n_hall))
    free_pick, _ = pick_pars(C, n_hall, 0.0, fixed=front, cover=cover, allowed=allowed)
    plain, plain_tot = pick_pars(C, n_hall, PAR_MIN_SPACING_M, fixed=front, allowed=allowed)
    plain_cmp = {'objective': R3(objective(plain_tot)), 'objective_cover': R3(objective(Ptot)), 'cost_pct': R3(100.0 * (objective(Ptot) / objective(plain_tot) - 1.0)),
                 'coverage_plain': coverage(front + plain, cells), 'cover_picks': sum(1 for q in pars if q.get('phase') == 'cover'),
                 'what': 'the same 6 m rule with the eye objective alone (no coverage phase): what the coverage phase costs and gives'}
    without_rule = {'pairs_closer_than_rule': len(pairs_closer(front + free_pick, PAR_MIN_SPACING_M)),
                    'pairs_under_2m': len(pairs_closer(front + free_pick, 2.0)),
                    'same_column_foot': sum(1 for a, b in __import__('itertools').combinations([q for q in free_pick if q.get('foot')], 2) if a['foot'] == b['foot'])}
    curve = []
    for sp in SPACING_CURVE_M:
        pk, tt = pick_pars(C, n_hall, sp, fixed=front, cover=cover, allowed=allowed)
        allp = front + pk
        nnc = sorted(min(math.hypot(a['p'][0] - b['p'][0], a['p'][2] - b['p'][2]) for b in allp if b is not a) for a in pk)   # each hall PAR's nearest (the stage front's own pairs light the stage, not the hall)
        curve.append({'spacing_m': sp, 'placed': len(pk), 'objective': R3(objective(tt)), 'nn_min_m': R3(nnc[0]), 'nn_median_m': R3(nnc[len(nnc) // 2]),
                      'kinds': {k: sum(1 for q in pk if q['kind'] == k) for k in sorted(set(q['kind'] for q in pk))}, **coverage(allp, cells)})
    for c in curve:
        c['objective_vs_no_rule_pct'] = R3(100.0 * (c['objective'] / curve[0]['objective'] - 1.0))
    old_pars = [f for f in SPR['fixtures'] if f['type'] == 'up-pl5403' and not f['part'].startswith('cut')]
    old_by.update({f['id']: f for f in old_pars})
    pool = [f for f in old_pars if f['id'] not in FRONT_IDS.values()]
    m = match_ids(pars, pool)
    held_back = sorted(set(f['id'] for f in pool) - set(m[i][0]['id'] for i in m))
    par_pens = {}
    gpars = []
    for i, q in enumerate(front + pars):
        if q.get('front'):
            was = old_by[FRONT_IDS[q['front']]]
            dd = math.hypot(q['p'][0] - was['p'][0], q['p'][2] - was['p'][2])
            where, pen, why = 'stage pen', None, 'the pit / the booth recess (crew side of the barrier)'
        else:
            was, dd = m[i - len(front)]
            _, where, pen, why = place_of[q['id']]
        if pen:
            par_pens[was['id']] = pen
        guard = ('a mesh guard (the pit: security works there), cable dressed along the PA box' if q.get('front') else
                 'its own fenced PAR pen (crowd barrier, %.1f x %.1f m), on the stewards\' round' % (pen['x_m'][1] - pen['x_m'][0], pen['z_m'][1] - pen['z_m'][0]) if pen else None)
        gpars.append({'id': was['id'], 'type': 'up-pl5403', 'part': q['part'], 'layer': 'pars', 'status': 'used', 'moments': [],
                      'position': '%s; %s' % (q['position'], why), 'p': [R3(v) for v in q['p']], 'r': rot_for_dir(q['dir']), 'colour': q['colour'],
                      'angle_rad': 0.1309, 'stands_in': where, 'guard': guard, 'pen': pen, 'place': q.get('id'),
                      'throw_m': q.get('throw_m') if not q.get('front') else R3(par_eye_footprint(W, q['p'], unit(q['dir']))[1]),
                      'eye_lux': {e: R3(sum(q['E'][k])) for k, e in enumerate(EYES)} if q.get('E') else None, 'lit_pct': q.get('lit_pct'),
                      'crane_park_spill_pct': q.get('crane_park_spill_pct'), 'gain': q.get('gain'), 'moved_from': {'p': was['p'], 'part': was['part'], 'plan_m': R3(dd)},
                      'power_w': POWER_W['up-pl5403'], **({'targets': q['targets']} if q.get('front') else {}),
                      **({'combine_with': 'the truss DJ light (another workflow): this key is a ground OPTION, one fader'} if q['kind'] == 'DJ key' else {})})
    layer = gpars + beams

    # ---- 3. the full rig: the spread with its non-truss, non-laser, non-smoke units replaced by the layer
    T = copy.deepcopy(SPR)
    keep = [f for f in T['fixtures'] if f['part'].startswith('cut') or f['type'] in ('ext-lc-ultra-mk2', 'up-yz31p')]
    T['fixtures'] = keep + copy.deepcopy(layer)
    present = set(f['part'] for f in T['fixtures'])
    W_sp = SP.night_world(repo)
    full = {}
    for k, sf in STAGE_FRONT.items():
        f = next(x for x in T['fixtures'] if x['part'] == FRONT_PARTS[k])
        full[k] = {t: SP.e_on(W_sp, f, SP.TARGETS[t][0], SP.TARGETS[t][1], SP.PAR_CD_ROOM) for t in SP.TARGETS}
    front_lv = {}
    for lk in T['looks']:
        p = lk['parts']
        for g in GONE_PARTS:
            p.pop(g, None)
        if lk['id'] in LOOK_LEVELS:
            p.update(copy.deepcopy(LOOK_LEVELS[lk['id']]))
            col = EMBER if lk['id'] == 'dark' else ASH
            for k, sf in STAGE_FRONT.items():
                # LINEAR (#868): E on a target = E at full x level x the colour's luminance share; the level meets every floor
                need = [STAGE_FRONT_FLOORS_LX[lk['id']][t] / max(full[k][t] * SP.lum_factor(col), 1e-9) for t in sf['targets']]
                lv = min(1.0, math.ceil(max(need) * 1000.0) / 1000.0)
                front_lv.setdefault(k, {})[lk['id']] = lv
                p[FRONT_PARTS[k]] = [col, lv]
        lk['parts'] = {k: v for k, v in p.items() if k in present or k == 'laser'}
    for c in T['cues']:
        c['name'] = c['name'].replace('B tuned + stage + lasers', 'v2 ground')

    # ---- 4. power + DMX for every lamp (the truss's 10 PARs included: all 50 hung), C-LASER phased with the rest
    v11 = json.load(open(os.path.join(repo, RIG11)))
    sites = v11['power']['sites']
    dist = {k: v for k, v in sites.items() if k.startswith('D-')}
    units = [f for f in T['fixtures'] if f['type'] in ('up-pl5403', 'up-b380f', 'up-yz31p')]
    laser_c = next(c for c in SPR['power']['circuits'] if c['circuit'] == 'C-LASER')
    circ, ph = circuits(units, dist, extra=[laser_c])
    lines = patch(units, sites)
    cid = {u: c['circuit'] for c in circ for u in c['units']}
    for f in units:
        f['circuit'] = cid[f['id']]
    power_x = [dict(x, circuit=c['circuit']) for c in circ if c['circuit'] != 'C-LASER' for x in crossings(c['route'])]
    dmx_x = [dict(x, line=l['line']) for l in lines for x in crossings(l['route'])]
    truss_ids = {f['id'] for f in T['fixtures'] if f['part'].startswith('cut')}
    truss_circ = sorted({cid[i] for i in truss_ids})
    truss_lines = sorted({f['dmx']['line'] for f in units if f['id'] in truss_ids})
    headroom = {'circuits_with_truss_lamps': [{'circuit': c['circuit'], 'load_w': c['load_w'], 'spare_w': CIRCUIT_W - c['load_w'], 'spare_pars': (CIRCUIT_W - c['load_w']) // POWER_W['up-pl5403']}
                                              for c in circ if c['circuit'] in truss_circ],
                'dmx_lines_with_truss_lamps': [{'line': l['line'], 'devices': l['devices'], 'spare_devices': l['spare_devices'], 'channels': l['channels']} for l in lines if l['line'] in truss_lines],
                'rule': 'every circuit <= %d W (80 %% of 16 A), every line <= %d devices (4 of the 32 unit loads spare) and 512 channels' % (CIRCUIT_W, DMX_MAX_DEVICES)}
    T['power'] = {'circuits': circ, 'phases_w': ph, 'headroom_for_the_truss': headroom,
                  'method': 'moxir_v2_ground.circuits: nearest v1.1 distro, one kind and side per circuit, <= 2 944 W and <= 5 % volt drop (BS 7671 4D2B); C-LASER phased with the rest (2026-10-10); the truss\'s 10 PARs on their own circuit(s)',
                  'crossings': power_x}
    T['patch'] = {'branches': [{'branch': l['line'], 'universe': l['universe'], 'devices': l['devices'], 'channels': l['channels'], 'ok': l['ok']} for l in lines],
                  'slots': {str(l['universe']): l['channels'] for l in lines}, 'lines': lines, 'headroom_for_the_truss': headroom, 'crossings': dmx_x,
                  'method': 'moxir_v2_ground.patch: nearest v1.1 node, its port by side (PORT_SPLIT), one universe per line, <= %d devices (EIA-485 unit loads, 4 spare) and <= 512 channels (ANSI E1.11)' % DMX_MAX_DEVICES}
    lay_by = {f['id']: f for f in layer}
    for f in T['fixtures']:
        if f['id'] in lay_by:
            lay_by[f['id']]['dmx'], lay_by[f['id']]['circuit'] = f['dmx'], f['circuit']

    # ---- 5. checks
    nontruss = [f for f in T['fixtures'] if f['type'] in ('up-pl5403', 'up-b380f') and not f['part'].startswith('cut')]
    gp = [f for f in nontruss if f['type'] == 'up-pl5403']
    hall_p = [f for f in gp if f['part'] not in FRONT_PARTS.values()]
    nn = sorted(min(math.hypot(a['p'][0] - b['p'][0], a['p'][2] - b['p'][2]) for b in hall_p if b is not a) for a in hall_p)
    rects = {iid: I['rect'] for iid, I in isl.items()}
    all_pens = tuple(fenced.values()) + tuple(par_pens.values())
    EF_all = public_eyes(A, W.G, exclude=all_pens, step=FIELD_STEP_M)
    S.wait_cool()
    bfx = [f for f in T['fixtures'] if f['type'] == 'up-b380f']
    brows = [beam_recheck(W, WF, A, F, f, rects[f['island']], EF_all) for f in bfx]
    field = field_check(bfx, EF_all)
    P_q = public_points(A, W.G, exclude=all_pens, step=0.25)
    S.wait_cool()
    par_eye = par_eye_check(W, gp, P_q)
    # the spread by the same two rules, for the record (its beams have no desk window: their aims alone; no pens)
    spread_field = field_check([f for f in SPR['fixtures'] if f['type'] == 'up-b380f'], public_eyes(A, W.G, step=FIELD_STEP_M), aim_only=True)
    spread_par_eye = par_eye_check(W, [f for f in SPR['fixtures'] if f['type'] == 'up-pl5403' and not f['part'].startswith('cut')], public_points(A, W.G, step=0.25))
    in_park = [f['id'] for f in T['fixtures'] if f['type'] in ('up-pl5403', 'up-b380f', 'up-yz31p') and not f['part'].startswith('cut')
               and inside_rect(f['p'][0], f['p'][2], CRANE_PARK) and f['p'][1] > CRANE_PARK['y_m'][0]]
    tubes = T['lasers']['tubes']
    clear = sorted(({'id': f['id'], 'margin_m': R3(SP.tube_clearance(tubes, f['p'], SP.BODY_R[f['type']])[0])} for f in nontruss), key=lambda c: c['margin_m'])
    glare = {lk: SP.dj_glare(T, lk) for lk in ('dark', 'peak')}
    glare_full = SP.dj_glare(dict(T, looks=[{'id': 'full', 'parts': {p: [ASH, 1.0] for p in present}}]), 'full')
    stage = {lk: {'room_30478cd': SP.stage_light(W_sp, T, lk, SP.PAR_CD_ROOM, ROOM_LEVEL_EXP), 'spec_11000cd': SP.stage_light(W_sp, T, lk, SP.PAR_CD_SPEC, ROOM_LEVEL_EXP)}
             for lk in ('dark', 'peak')}
    stage_spread = {lk: SP.stage_light(W_sp, SPR, lk, SP.PAR_CD_ROOM, ROOM_LEVEL_EXP) for lk in ('dark', 'peak')}
    floors = {lk: {t: {'lx': stage[lk]['room_30478cd'][t]['lx'], 'floor': STAGE_FRONT_FLOORS_LX[lk][t], 'ok': stage[lk]['room_30478cd'][t]['lx'] >= STAGE_FRONT_FLOORS_LX[lk][t] - 1e-6}
                  for t in SP.TARGETS} for lk in stage}
    reach_front = {k: {'id': FRONT_IDS[k], 'behind_barrier_m': R3(BARRIER_Z - sf['p'][2]), 'out_of_reach': BARRIER_Z - sf['p'][2] >= OUT_OF_REACH_M,
                       'rule_m': OUT_OF_REACH_M} for k, sf in STAGE_FRONT.items()}
    pens = []
    for iid, I in isl.items():
        hs = [f for f in T['fixtures'] if f.get('island') == iid]
        hb = {b['id']: b for b in brows}
        (x0, x1), (z0, z1) = I['rect']['x_m'], I['rect']['z_m']
        pens.append({'island': iid, 'kind': I['kind'], 'rect': I['rect'], 'size_m': [R3(x1 - x0), R3(z1 - z0)], 'area_m2': R3((x1 - x0) * (z1 - z0)),
                     'centre_z': R3((z0 + z1) / 2), 'entry_half': (z0 + z1) / 2 >= ENTRY_HALF_Z,
                     'barrier_m': 0.0 if I['kind'] == 'stage pen' else R3(2 * ((x1 - x0) + (z1 - z0)) - I.get('shared_side_m', 0.0)),
                     'barrier': ('the stage pen\'s own barrier (crew only; owed since the spread); B\'s fan strip marked on its floor' if I['kind'] == 'stage pen' else
                                 'crowd barrier (1.1 m) on three sides; the fourth is the stage pen\'s own barrier' if I['kind'] == 'stage edge' else
                                 'crowd barrier (1.1 m) round the island, tied to its two columns' if I['kind'] == 'column line' else 'crowd barrier (1.1 m) round the island'),
                     'steward': 'none inside (closed); its barrier on the stewards\' round (MOXIR.md 5.3)' if I['kind'] != 'stage pen' else 'crew only (the stage manager)',
                     'heads': [f['id'] for f in hs], 'pen_m_max': max(hb[f['id']]['pen_m'] for f in hs), 'pen_hand_m_max': max(hb[f['id']]['pen_hand_m'] for f in hs),
                     'barrier_gap_m_min': min(hb[f['id']]['pen_barrier_gap_m'] for f in hs),
                     'head_from_barrier_m_min': None if I['kind'] == 'stage pen' else min(hb[f['id']]['head_from_barrier_m'] for f in hs),
                     'pars_inside': [f['id'] for f in gp if f.get('stands_in') == 'beam pen ' + iid], 'why': I['why']})
    pens_par = [{'id': fid, 'rect': R, 'size_m': [R3(R['x_m'][1] - R['x_m'][0]), R3(R['z_m'][1] - R['z_m'][0])], 'barrier_m': R3(2 * ((R['x_m'][1] - R['x_m'][0]) + (R['z_m'][1] - R['z_m'][0])))}
                for fid, R in sorted(par_pens.items())]
    zb, za = SP.zone_counts(SPR, Z), SP.zone_counts(T, Z)
    ko2 = {'x_m': ENTRY_LASERS['ko2']['x_m'], 'z_m': ENTRY_LASERS['ko2']['z_m']}
    entry = {'source': ENTRY_LASERS['source'],
             'units_in_tower_pen': [f['id'] for f in T['fixtures'] if f['type'] in ('up-pl5403', 'up-b380f', 'up-yz31p') and inside_rect(f['p'][0], f['p'][2], ko2)],
             'pens_overlapping_tower_pen': [p_['island'] for p_ in pens if rects_overlap(p_['rect'], ko2)] + [p_['id'] for p_ in pens_par if rects_overlap(p_['rect'], ko2)],
             'beam_aperture_gap_min_m': min(b['entry_aperture_gap_m'] for b in brows), 'beam_cubes_box_gap_min_m': min(b['cubes_box_gap_m'] for b in brows),
             'beam_far_wall_block_gap_min_m': min(b['far_wall_block_gap_m'] for b in brows), 'beams_into_laser_keep_out': [b['id'] for b in brows if b['into_laser_keep_out']],
             'rules': {'aperture_pad_m': APERTURE_PAD_M, 'block_free_m': BLOCK_FREE_M, 'why': 'ASSUMED margins: no B380F ray within 1 m of a laser unit, no B380F end within 3 m of a block'},
             'par_pools_on_the_far_wall': 'none can reach it: every PAR stands at z >= -31 and its throw is 30 m (the far wall is z -53.8)'}
    cov_new = coverage(hall_p, cells)
    cov_old = coverage([f for f in SPR['fixtures'] if f['type'] == 'up-pl5403' and not f['part'].startswith('cut')], cells)
    beam_cov = {}
    for key, rig in (('spread', SPR), ('ground', T)):
        bs = [f for f in rig['fixtures'] if f['type'] == 'up-b380f']
        bases = np.asarray([[f['p'][0], f['p'][2]] for f in bs], float)
        dmin = np.min(np.hypot(cells[:, None, 0] - bases[None, :, 0], cells[:, None, 1] - bases[None, :, 1]), axis=1)
        bands = {'z < -18': 0, '-18..-6': 0, '-6..6': 0, '6..18': 0, '18..30': 0, '>= 30': 0}
        for f in bs:
            z = f['p'][2]
            bands['z < -18' if z < -18 else '-18..-6' if z < -6 else '-6..6' if z < 6 else '6..18' if z < 18 else '18..30' if z < 30 else '>= 30'] += 1
        beam_cov[key] = {'base_gap_median_m': R3(np.median(dmin)), 'base_gap_max_m': R3(dmin.max()), 'bases_by_z_band': bands,
                         'bases_in_entry_half': sum(1 for f in bs if f['p'][2] >= ENTRY_HALF_Z)}
    onn = sorted(min(math.hypot(a['p'][0] - b['p'][0], a['p'][2] - b['p'][2]) for b in old_pars if b is not a) for a in old_pars)
    spill = sorted(({'id': f['id'], 'pct': f['crane_park_spill_pct']} for f in gp if f.get('crane_park_spill_pct')), key=lambda r: -r['pct'])
    S.wait_cool()
    eyes_b = eye_totals(WF, F, SPR['fixtures'], A)
    eyes_a = eye_totals(WF, F, T['fixtures'], A)
    epic = epic_table(eyes_b, eyes_a, wtable)
    pk_b = next(l for l in SPR['looks'] if l['id'] == 'peak')
    pk_a = next(l for l in T['looks'] if l['id'] == 'peak')
    epic_peak = epic_table(eye_totals(WF, F, SPR['fixtures'], A, pk_b), eye_totals(WF, F, T['fixtures'], A, pk_a), wtable)
    fan_rows = [b for b in brows if b['island'] == 'the stage pen']
    fan_kept = all(next(f for f in T['fixtures'] if f['id'] == s_['id'])['r'] == s_['r'] and next(f for f in T['fixtures'] if f['id'] == s_['id'])['p'] == s_['p']
                   for s_ in SPR['fixtures'] if s_['part'].startswith('plane 1'))
    checks = {
        'kit': {'UP-PL5403': {'hung': sum(f['type'] == 'up-pl5403' for f in T['fixtures']), 'on_the_truss': sum(f['part'].startswith('cut') for f in T['fixtures']),
                              'on_the_ground': len(gp), 'held_back': len(held_back), 'ordered': 50},
                'UP-B380F': sum(f['type'] == 'up-b380f' for f in T['fixtures']), 'UP-YZ31P': sum(f['type'] == 'up-yz31p' for f in T['fixtures']),
                'EXT-LC-ULTRA-MK2': sum(f['type'] == 'ext-lc-ultra-mk2' for f in T['fixtures'])},
        'ground_units': len(nontruss), 'units_on_ground': sum(f['p'][1] <= GROUND_MAX_Y for f in nontruss),
        'units_above_ground': [f['id'] for f in nontruss if f['p'][1] > GROUND_MAX_Y],
        'units_above_3m_not_truss': [f['id'] for f in T['fixtures'] if f['type'] in ('up-pl5403', 'up-b380f', 'up-yz31p') and not f['part'].startswith('cut') and f['p'][1] > 3.0],
        'in_the_crane_park_above_2_5m': in_park,
        'eye_weights': wtable,
        'par_spacing': {'rule_m': PAR_MIN_SPACING_M, 'applies_to': 'the hall\'s %d washes (the 3 stage-front lamps light the stage, not the hall)' % len(hall_p),
                        'min_m': R3(nn[0]), 'median_m': R3(nn[len(nn) // 2]), 'pairs_closer': pairs_closer(hall_p, PAR_MIN_SPACING_M),
                        'without_the_rule': without_rule, 'curve': curve, 'spread_min_m': R3(onn[0]), 'spread_median_m': R3(onn[len(onn) // 2])},
        'par_coverage': {'ground': cov_new, 'spread': cov_old, 'cells': len(cells), 'cover_r_m': PAR_COVER_R_M, 'plain_greedy_6m': plain_cmp,
                         'what': 'plan distance from every 1 m cell of the hot zone + wings (not the bar or chill zone) to the nearest hall PAR'},
        'beam_coverage': beam_cov,
        'par_places': {'refused_places': refused, 'stands_in': {k: sum(1 for f in gp if (f.get('stands_in') or '').startswith(k)) for k in ('stage pen', 'machine', 'beam pen', 'own pen')},
                       'par_pens': pens_par, 'par_pen_barrier_m': R3(sum(p_['barrier_m'] for p_ in pens_par)),
                       'what': 'FIX 5: each floor PAR in the stage pen, a machine, a fenced beam pen or its own fenced PAR pen'},
        'par_eye_rule': {k: v for k, v in par_eye.items() if k != 'rows'},
        'stage_front': {'lamps': {k: {'id': FRONT_IDS[k], 'part': FRONT_PARTS[k], 'p': STAGE_FRONT[k]['p'], 'targets': list(STAGE_FRONT[k]['targets']),
                                      'lx_at_full_room': {t: R3(full[k][t]) for t in STAGE_FRONT[k]['targets']}, 'levels': front_lv.get(k), 'why': STAGE_FRONT[k]['why'],
                                      'reach': reach_front[k]} for k in STAGE_FRONT},
                        'floors': floors, 'all_floors_met': all(v['ok'] for lk in floors.values() for v in lk.values()), 'floors_source': STAGE_FRONT_SOURCE,
                        'out_of_reach_rule': 'ISO 13857:2019 Table 2 (high risk): a 0.4-0.6 m high hazard behind a 1.0 m barrier, c = 1.4 m (as reproduced in the Troax Safety Guide; EQUIVALENT)'},
        'entry_lasers': entry,
        'pens': {'count': len(pens), 'fenced_islands': sum(1 for p in pens if p['kind'] != 'stage pen'), 'entry_half_islands': [p['island'] for p in pens if p['entry_half']],
                 'radius_m_max': max(p['pen_m_max'] for p in pens), 'radius_hand_m_max': max(p['pen_hand_m_max'] for p in pens), 'barrier_m': R3(sum(p['barrier_m'] for p in pens)),
                 'barrier_gap_m_min': min(p['barrier_gap_m_min'] for p in pens), 'head_from_barrier_m_min': min(p['head_from_barrier_m_min'] for p in pens if p['head_from_barrier_m_min'] is not None),
                 'islands': pens,
                 'method': 'FIX 2: 0.01 m steps, the lower edge from the lens\'s lowest point (0.08 m), half beam 0.9 + aim tolerance %.1f deg, over the whole desk window (pan +-%g deg every %g at the tilt limit); heads >= %.1f m from their barrier' % (
                     AIM_TOL_DEG, PAN_WIN_DEG, WINDOW_STEP_DEG, HEAD_REACH_M)},
        'fan': {'kept_from_spread': fan_kept, 'heads': [b['id'] for b in fan_rows], 'all_ok': all(b['ok'] for b in fan_rows), 'strip': FAN_STRIP, 'crew_lanes': CREW_LANES,
                'smoke_service': list(SMOKE_SERVICE), 'smoke_service_gap_m_min': min(b['smoke_service_gap_m'] for b in fan_rows),
                'crew_lane_gap_m_min': min(b['crew_lane_gap_m'] for b in fan_rows), 'near_crane': {b['id']: b['near_crane_parks'] for b in fan_rows},
                'what': 'FIX 1a + 4: B\'s six plane-1 heads exactly as the spread has them (place and aim); every low run over its window inside the fan strip, clear of the smoke machine\'s refill point and the crew lanes; never into the cut at any park z 0.15-4.25'},
        'beams': len(brows), 'beams_ok': sum(b['ok'] for b in brows), 'beams_ending_in_bar_or_chill': [b['id'] for b in brows if b['ends_in_bar_or_chill']],
        'beams_into_crane_or_park': [b['id'] for b in brows if b['into_crane_or_park']], 'beam_glare_min_deg': min(b['glare_min_deg_any'] for b in brows),
        'beam_field_glare': field, 'beam_crew_ok': all(b['crew_ok'] for b in brows if b['crew_ok'] is not None),
        'spread_by_the_same_rules': {'field_glare_fail_pct_aims_only': spread_field['fail_pct'], 'field_glare_fail_area_m2': spread_field['fail_area_m2'],
                                     'par_eye_fail_count': spread_par_eye['fail_count'], 'par_eye_fail': spread_par_eye['fail'],
                                     'what': 'the spread (#864, as a9d4b0d1 leaves it) checked by the same dense 30 deg rule (its aims alone: it has no desk windows) and the same PAR eye rule'},
        'beam_windows_ok': all(not b['window']['directions_refused'] for b in brows),
        'dj_glare_ok': {k: v['ok'] for k, v in glare.items()}, 'dj_glare_all_at_full_ok': glare_full['ok'],
        'dj_key': {'deg_from_eye_line': next((r['deg_from_eye_line'] for r in glare_full['lenses_seen'] if r['part'] == KEY_PART), None),
                   'lx_at_eye_full_room': next((r['lx_at_eye_room'] for r in glare_full['lenses_seen'] if r['part'] == KEY_PART), None),
                   'levels': front_lv.get('key'), 'face_lx_full_room': R3(full['key']['DJ face']), 'combine_with': 'the truss DJ light (another workflow)'},
        'level_law': 'linear: a fader at L draws L (the #868 fix, cherry-picked 5716104d); stage light computed with exponent %d' % ROOM_LEVEL_EXP,
        'level_tuning': LEVEL_TUNING,
        'laser_cap': {'peak_fader': next(l for l in T['looks'] if l['id'] == 'peak')['parts'].get('laser'), 'desk_caps': next(l for l in T['looks'] if l['id'] == 'peak').get('desk_caps'),
                      'source': 'the spread\'s cap after a9d4b0d1 (merged): fader 0.16 = the drawn fraction measured under the 0.65 % budget'},
        'dj_face_lx_room': {lk: stage[lk]['room_30478cd']['DJ face']['lx'] for lk in stage},
        'stage_light_lx_room': {lk: {t: stage[lk]['room_30478cd'][t]['lx'] for t in SP.TARGETS} for lk in stage},
        'stage_light_lx_room_spread': {lk: {t: stage_spread[lk][t]['lx'] for t in SP.TARGETS} for lk in stage_spread},
        'laser_body_min_margin_m': clear[0]['margin_m'], 'laser_tubes_entered': [c['id'] for c in clear if c['margin_m'] < 0],
        'circuits': len(circ), 'circuits_ok': all(c.get('ok', True) for c in circ), 'phases_w': ph, 'dmx_lines_ok': all(l['ok'] for l in lines),
        'dmx_devices_max': max(l['devices'] for l in lines), 'headroom_for_the_truss': headroom,
        'connected_w': sum(c['load_w'] for c in circ), 'cable_crossings': {'power': len(power_x), 'dmx': len(dmx_x), 'ramps': len({(round(x['at'][0]), round(x['at'][1])) for x in power_x + dmx_x})},
        'zones_after': za, 'zone_counts_text': {k: v for k, v in za.items() if isinstance(v, dict)},
        'objective': {'pars': R3(objective(Ptot)), 'beams': R3(objective(Gtot))},
        'epic': epic, 'epic_peak_look': epic_peak,
        'floor_glare_peak_measured': None,
    }
    reserved = {'pars': TRUSS_RESERVED, 'hung_on_the_cut_now': sum(f['part'].startswith('cut') for f in T['fixtures']), 'held_back': len(held_back),
                'held_back_ids': held_back, 'owner': 'the truss workflow (the cut and the near crane, "half behind the DJ"): the lead fixed it at 10 (2026-10-10)',
                'why_these_ids': 'each ground unit takes the id of the nearest spread unit; the stage front keeps the spread\'s pit key and speaker-face ids',
                'power_and_patch': 'the truss\'s 10 PARs are in both; headroom_for_the_truss in power and patch'}
    c6 = next(c for c in curve if c['spacing_m'] == PAR_MIN_SPACING_M)
    c7 = next((c for c in curve if c['spacing_m'] == PAR_MIN_SPACING_M + 1.0), None)
    c5 = next((c for c in curve if c['spacing_m'] == PAR_MIN_SPACING_M - 1.0), None)
    rules = {'ground_max_y_m': GROUND_MAX_Y, 'par_min_spacing_m': PAR_MIN_SPACING_M,
             'par_spacing_why': ('the structure: the column pitch along a row is 6 m, so at most one PAR per column foot (the joint pair z +-0.5 is one foot), and a 15 deg '
                                 'pool on the space frame at 10.8 m is 2.85 m across, so pools keep a dark gap >= 3.1 m (steel lit in pieces). The scores (this build): the greedy '
                                 'keeps %.1f %% of its objective at %.0f m against no rule%s%s (par_spacing.curve).') % (
                                 100 + c6['objective_vs_no_rule_pct'], PAR_MIN_SPACING_M,
                                 ', %.1f %% at %.0f m' % (100 + c5['objective_vs_no_rule_pct'], c5['spacing_m']) if c5 else '',
                                 ', %.1f %% at %.0f m' % (100 + c7['objective_vs_no_rule_pct'], c7['spacing_m']) if c7 else ''),
             'crane_park': CRANE_PARK, 'pen_clear_over_m': CLEAR_OVER_M, 'hand_m': HAND_M, 'barrier_reach_m': BARRIER_REACH_M, 'glare_deg': GLARE_DEG,
             'dj_rule_deg': DJ_RULE_DEG, 'min_throw_m': MIN_THROW_M, 'islands': 'B\'s fan (6 heads) in the stage pen + %d fenced islands x %d heads, >= %.0f m apart, >= 1 in the entry half (z >= %g)' % (
                 ISLANDS, HEADS_PER_ISLAND, ISLAND_MIN_GAP_M, ENTRY_HALF_Z),
             'eyes': EYES, 'eye_weights': {e: wtable[e]['weight'] for e in EYES}, 'density_persons_m2': {'dance floor': DENSITY_DANCE, 'elsewhere (ASSUMED)': DENSITY_REST},
             'depth_bins': DEPTH_NAMES, 'objective': 'sum over eyes (weighted by the people each stands for) and depth bins of sqrt(light): PAR lx from lit surfaces (Lambertian, one bounce, the crowd not see-through), beam G (single scattering, haze t40)',
             'fix_2026_10_10': {'aim_tol_deg': AIM_TOL_DEG, 'aperture_r_m': APERTURE_R_M, 'pen_step_m': PEN_STEP_M, 'pan_window_deg': PAN_WIN_DEG, 'window_step_deg': WINDOW_STEP_DEG,
                                'tilt_up_deg': TILT_UP_DEG, 'window_tilts': list(WINDOW_TILTS), 'head_reach_m': HEAD_REACH_M, 'eye_ys_m': list(EYE_YS), 'field_step_m': FIELD_STEP_M,
                                'fan_strip': FAN_STRIP, 'crew_lanes': CREW_LANES, 'smoke_service': list(SMOKE_SERVICE), 'smoke_service_r_m': SMOKE_SERVICE_R_M,
                                'par_lens_r_m': PAR_LENS_R_M, 'par_aim_tol_deg': PAR_AIM_TOL_DEG, 'lean_m': LEAN_M, 'par_pen_half_min_m': PAR_PEN_HALF_MIN_M,
                                'barrier_foot_m': BARRIER_FOOT_M, 'crowd_top_m': CROWD_TOP_M, 'crowd_see_m': CROWD_SEE_M, 'out_of_reach_m': OUT_OF_REACH_M,
                                'dmx_max_devices': DMX_MAX_DEVICES, 'base': BASE, 'rules': RULES}}
    review = {'from': RIG_SP, 'owner': OWNER_WORDS, 'ledger': 'N465', 'zones_before': zb, 'zones_after': za, 'eyes_before': eyes_b, 'eyes_after': eyes_a, 'epic': epic,
              'epic_peak_look': epic_peak, 'beam_checks': brows, 'island_rounds': ranking, 'dj_glare': glare, 'dj_glare_all_at_full': glare_full, 'stage_light': stage,
              'stage_light_spread': stage_spread, 'front_levels': front_lv, 'laser_clearance_tightest': clear[:5], 'pens': pens, 'par_eye_rows': par_eye['rows']}
    n_pen = len(pens_par)
    T.update({'snapshot': 'moxir-v2-ground-%s' % DATE, 'version': 'MOXIR v2 ground · every wash and beam on the floor', 'title': 'MOXIR v2 ground · the whole painted area, from the floor',
              'what': ('The spread, with every wash and beam that is not on the truss brought down to the floor (owner 10-09 21:05): %d PARs on the floor (the truss keeps 10), '
                       'the hall\'s %d no two closer than %.0f m, three lighting the stage front (the DJ key and the two PA faces) from the pit; every floor PAR in the stage pen, '
                       'a machine, a beam pen or its own fenced pen (%d), so no standing eye is in its beam; B\'s ember fan behind the DJ as the owner saw it, and 12 beams in '
                       '%d fenced pens (%s), each head with a desk window the pens hold; the truss, its lamps and the cubes as the spread had them (other workflows).') % (
                          len(gp), len(hall_p), PAR_MIN_SPACING_M, n_pen, len(pens) - 1, '; '.join(p_['island'] for p_ in pens if p_['kind'] != 'stage pen')),
              'written_by': 'scripts/place/moxir_v2_ground.py build (from %s; the layer %s)' % (RIG_SP, LAYER), 'date': DATE, 'from_rig': RIG_SP, 'ground_layer': LAYER,
              'reserved_for_truss': reserved, 'ground_rules': rules, 'checks': checks, 'review': review, 'owed': OWED})
    T['not_hung'] = [dict(r, hung=checks['kit']['UP-PL5403']['hung'], not_hung=50 - checks['kit']['UP-PL5403']['hung'], reserved_for_truss=0) if r['code'] == 'UP-PL5403' else r
                     for r in T['not_hung']]
    T['requires'] = dict(T['requires'], ground=('%d fenced beam pens (%.0f m of crowd barrier) + %d fenced PAR pens (%.0f m) + the stage pen\'s barrier, all on the stewards\' round; '
                                                'every floor B380F bolted to a ballasted floor plate (600 x 600 mm + 2 x 15 kg), levelled to +-1 deg, its desk window set (pan +-%g deg, tilt never below its aim) and its shutter closed on DMX loss and in a reset; '
                                                'B\'s fan strip marked on the stage floor; mesh guards on the two pit-end PARs; cable ramps at %d power and %d DMX crossings of the dance floor and the entry corridor; the venue\'s OK for floor plates' % (
                                                    checks['pens']['fenced_islands'], checks['pens']['barrier_m'], n_pen, checks['par_places']['par_pen_barrier_m'], PAN_WIN_DEG, len(power_x), len(dmx_x))),
                     safety_in_desk='B380F pan/tilt limits per head (desk_limits in each fixture: pan +-%g deg around its aim, tilt never below its aim; degrees from home and 16-bit DMX); shutter closed on DMX loss and during a reset' % PAN_WIN_DEG)
    T['requires'].pop('stage_front', None)
    L_ = {'what': 'MOXIR v2 GROUND LAYER: ONLY the lamps on the floor (%d UP-PL5403 + %d UP-B380F); ids kept from %s where a unit just moves' % (
              len(gpars), len(beams), RIG_SP),
          'date': DATE, 'owner': OWNER_WORDS, 'ledger': 'N465', 'written_by': 'scripts/place/moxir_v2_ground.py build', 'from_rig': RIG_SP, 'full_rig': RIG_GR,
          'frame': SPR['frame'], 'rules': rules, 'islands': pens, 'par_pens': pens_par, 'reserved_for_truss': reserved, 'fixtures': layer,
          'checks': {k: checks[k] for k in ('units_on_ground', 'units_above_ground', 'units_above_3m_not_truss', 'in_the_crane_park_above_2_5m', 'par_spacing', 'par_coverage',
                                             'beam_coverage', 'par_places', 'par_eye_rule', 'stage_front', 'pens', 'fan', 'beams', 'beams_ok', 'beams_ending_in_bar_or_chill',
                                             'beams_into_crane_or_park', 'beam_glare_min_deg', 'beam_field_glare', 'beam_crew_ok', 'beam_windows_ok', 'entry_lasers',
                                             'dj_glare_ok', 'dj_glare_all_at_full_ok', 'dj_key', 'level_law', 'eye_weights', 'epic', 'epic_peak_look', 'floor_glare_peak_measured')}}
    json.dump(L_, open(os.path.join(repo, LAYER), 'w'), indent=1, default=JD)
    json.dump(T, open(os.path.join(repo, RIG_GR), 'w'), indent=1, default=JD)
    os.makedirs(out, exist_ok=True)
    json.dump({'checks': checks, 'review': review}, open(os.path.join(out, 'checks.json'), 'w'), indent=1, default=JD)
    plan_picture(SPR, None, os.path.join(out, 'plan-spread.png'), 'v2 spread (old): brackets on the columns, beams at 3.7 m')
    plan_picture(T, pens, os.path.join(out, 'plan-ground.png'), 'v2 ground (new): every wash and beam on the floor', par_pens=pens_par)
    cable_picture(T, pens, pens_par, os.path.join(out, 'plan-cables.png'))
    print(json.dumps({'beams_ok': '%d/%d' % (checks['beams_ok'], checks['beams']), 'islands': picked, 'pars': len(gp), 'held_back': held_back,
                      'stands_in': checks['par_places']['stands_in'], 'par_pens': n_pen, 'par_pen_barrier_m': checks['par_places']['par_pen_barrier_m'],
                      'spacing': {k: v for k, v in checks['par_spacing'].items() if k != 'curve'},
                      'pens': {k: v for k, v in checks['pens'].items() if k != 'islands'}, 'field_glare': {k: v for k, v in field.items() if k != 'exceptions'},
                      'field_exceptions': field['exceptions'][:8], 'par_eye': {k: v for k, v in par_eye.items() if k != 'rows'}, 'refused': refused, 'fan': checks['fan'],
                      'stage_floors': floors, 'front_levels': front_lv, 'front_reach': reach_front, 'dj_glare_ok': checks['dj_glare_ok'], 'dj_full_ok': glare_full['ok'],
                      'circuits_ok': checks['circuits_ok'], 'dmx_ok': checks['dmx_lines_ok'], 'dmx_max': checks['dmx_devices_max'], 'phases': ph,
                      'headroom': headroom, 'crossings': checks['cable_crossings'], 'epic': {k: v for k, v in epic.items() if k != 'per_eye'},
                      'epic_peak': {k: v for k, v in epic_peak.items() if k != 'per_eye'},
                      'per_eye_beam': {e: epic['per_eye'][e]['beam_G'] + [epic['per_eye'][e]['beam_ratio']] for e in EYES},
                      'beam_coverage': beam_cov, 'bad_beams': [{k: b[k] for k in ('id', 'ring_why', 'pen_inside_island', 'crew_ok', 'field_glare_min_deg', 'named_glare_min_deg', 'head_from_barrier_m')} | {'win_bad': b['window']['directions_refused'][:2]} for b in brows if not b['ok']]},
                     indent=1, default=JD))


# ====================================================================== the plan picture (top view)
def plan_picture(rig, pens, path, title, par_pens=None):
    import numpy as np
    import matplotlib
    matplotlib.use('Agg')
    import matplotlib.pyplot as plt
    from matplotlib.patches import Rectangle
    repo = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..'))
    H = json.load(open(os.path.join(repo, 'scripts/place/rigs/moxir-hall-2026-10-08-v9-show-park.hall.json')))['geometry']
    Zd = json.load(open(os.path.join(repo, ZONES)))
    fig, ax = plt.subplots(figsize=(11, 14), dpi=110)
    fig.patch.set_facecolor('#0b0c0e')
    ax.set_facecolor('#111214')
    zc = {'hot': '#e04000', 'use': '#00e040', 'bar': '#c0c020', 'chill': '#e08060'}
    for z in Zd['zones']:
        for a in z['areas']:
            for row in a['cells_1m']:
                for x0, x1 in row['x_runs']:
                    ax.add_patch(Rectangle((x0 - 0.5, row['z'] - 0.5), x1 - x0 + 1, 1, color=zc[z['id']], alpha=0.07 if z['id'] == 'hot' else 0.10, lw=0))
    for L in H['lanterns']:
        ax.add_patch(Rectangle((L['x_m'][0], L['z_m'][0]), L['x_m'][1] - L['x_m'][0], L['z_m'][1] - L['z_m'][0], fill=False, ec='#4a6a98', lw=0.6, ls='--'))
    for x in H['rows_x_m']:
        for z in sorted(set(H['column_grid_z_m'])):
            ax.add_patch(Rectangle((x - 0.4, z - 0.4), 0.8, 0.8, color='#8a9098', zorder=2))
    for mm in H['massing']:
        if mm['id'].startswith('pendant'):
            continue
        (x0, x1), (z0, z1) = mm['x_m'], mm['z_m']
        ax.add_patch(Rectangle((x0, z0), x1 - x0, z1 - z0, fc='#3b342c', ec='#7a6a58', lw=0.5, zorder=2))
    cp = CRANE_PARK
    ax.add_patch(Rectangle((cp['x_m'][0], cp['z_m'][0]), cp['x_m'][1] - cp['x_m'][0], cp['z_m'][1] - cp['z_m'][0], fill=False, ec='#ffe066', lw=1.0, ls=':', zorder=3))
    ax.text(cp['x_m'][0] + 0.3, cp['z_m'][0] - 1.4, 'crane park: nothing above 2.5 m', color='#ffe066', fontsize=7)
    ax.add_patch(Rectangle((-11.35, -13.45), 22.7, 2.9, fc='#d8b400', alpha=0.15, zorder=2))
    ax.text(-11.2, -15.0, 'free crane z -12 (lasers)', color='#c8a800', fontsize=7)
    ax.add_patch(Rectangle((-6.7, 3.65), 3.0, 2.0, fc='#2fbf5a', alpha=0.6, zorder=3))
    k2 = ENTRY_LASERS['ko2']
    ax.add_patch(Rectangle((k2['x_m'][0], k2['z_m'][0]), k2['x_m'][1] - k2['x_m'][0], k2['z_m'][1] - k2['z_m'][0], fill=False, ec='#e070ff', lw=1.0, zorder=3))
    for a_ in ENTRY_LASERS['apertures']:
        ax.plot(a_[0], a_[2], 'D', color='#e070ff', ms=3, zorder=7)
    ax.text(k2['x_m'][0] - 0.6, (k2['z_m'][0] + k2['z_m'][1]) / 2, 'entry-laser tower + pen (#873)', color='#e070ff', fontsize=7, ha='right', va='center')
    for b_ in ENTRY_LASERS['far_wall_blocks'][:1]:
        ax.add_patch(plt.Circle((b_[0], b_[2]), BLOCK_FREE_M, fill=False, ec='#e070ff', lw=0.8, ls='--', zorder=3))
        ax.text(b_[0] + 3.6, b_[2] + 1.5, 'far-wall laser blocks: no beam ends within %.0f m' % BLOCK_FREE_M, color='#e070ff', fontsize=7)
    if pens:
        for p in pens:
            R = p['rect']
            ax.add_patch(Rectangle((R['x_m'][0], R['z_m'][0]), R['x_m'][1] - R['x_m'][0], R['z_m'][1] - R['z_m'][0], fill=False,
                                   ec='#6fe08f' if p['kind'] == 'stage pen' else '#9fd0ff', lw=1.4, zorder=4))
        fs = FAN_STRIP
        ax.add_patch(Rectangle((fs['x_m'][0], fs['z_m'][0]), fs['x_m'][1] - fs['x_m'][0], fs['z_m'][1] - fs['z_m'][0], fc='#ff7a52', alpha=0.18, ec='#ff7a52', lw=0.6, zorder=3))
        ax.text(fs['x_m'][1] + 0.4, (fs['z_m'][0] + fs['z_m'][1]) / 2, 'fan strip (crew keep out)', color='#ff9a7a', fontsize=6, va='center', zorder=8)
        for name, R in CREW_LANES.items():
            ax.add_patch(Rectangle((R['x_m'][0], R['z_m'][0]), R['x_m'][1] - R['x_m'][0], R['z_m'][1] - R['z_m'][0], fill=False, ec='#6fe08f', lw=0.6, ls=':', zorder=3))
    for R in (par_pens or []):
        r_ = R['rect']
        ax.add_patch(Rectangle((r_['x_m'][0], r_['z_m'][0]), r_['x_m'][1] - r_['x_m'][0], r_['z_m'][1] - r_['z_m'][0], fill=False, ec='#c8c8c8', lw=0.7, ls='--', zorder=4))
    for f in rig['fixtures']:
        x, z = f['p'][0], f['p'][2]
        if f['type'] == 'up-b380f':
            d = aim_dir(f['r'])
            t = f.get('throw_m') or 30.0
            col = '#ff7a52' if f['colour'] == EMBER else '#cfe6ff'
            ax.plot([x, x + d[0] * t], [z, z + d[2] * t], color=col, lw=0.8, alpha=0.85, zorder=5)
            ax.plot(x, z, 's', color=col, ms=5.5 if f['p'][1] < 1.5 else 7, mec='#000', mew=0.4, zorder=6)
            if f['p'][1] > 1.5:
                ax.plot(x, z, 's', fillstyle='none', color='#ffffff', ms=9, mew=0.8, zorder=6)
        elif f['type'] == 'up-pl5403':
            cut = f['part'].startswith('cut')
            col = '#ffb08a' if cut else ('#ff3a12' if f['colour'] == EMBER else '#e8e4dc')
            ax.plot(x, z, 'o', color=col, ms=3 if cut else 4.5, mec='#000', mew=0.3, zorder=6)
            if not cut and f['p'][1] > 1.5:
                ax.plot(x, z, 'o', fillstyle='none', color='#ffffff', ms=8, mew=0.8, zorder=6)

        elif f['type'] == 'up-yz31p':
            ax.plot(x, z, '*', color='#cfd8ff', ms=11, zorder=7)
        elif f['type'] == 'ext-lc-ultra-mk2':
            ax.plot(x, z, '^', color='#7cff6a', ms=5, zorder=7)
    for name, e in EYES.items():
        ax.plot(e[0], e[2], 'x', color='#ffd84a', ms=7, mew=1.5, zorder=8)
        ax.text(e[0] + 0.8, e[2] + 0.6, name, color='#ffd84a', fontsize=7, zorder=8)
    hand = [plt.Line2D([], [], marker='o', ls='', color='#ff3a12', label='PAR, ember (column foot)'), plt.Line2D([], [], marker='o', ls='', color='#e8e4dc', label='PAR, ash (floor plate up into the roof)'),
            plt.Line2D([], [], marker='o', ls='', color='#ffb08a', label='PAR on the cut (truss: not this layer)'), plt.Line2D([], [], marker='s', ls='', color='#cfe6ff', label='B380F + its beam to its first hit'),
            plt.Line2D([], [], marker='o', ls='', fillstyle='none', color='#ffffff', label='white ring: up on the steel (over 1.5 m)'),
            plt.Line2D([], [], color='#c8c8c8', lw=0.7, ls='--', label='PAR pen (fenced: no eye in its beam)'),
            plt.Line2D([], [], color='#9fd0ff', lw=1.4, label='fenced pen (the beams\' low runs)'), plt.Line2D([], [], marker='x', ls='', color='#ffd84a', label='an audience eye (1.7 m)')]
    ax.legend(handles=hand, loc='lower right', fontsize=7, facecolor='#1a1b1e', labelcolor='#e8e4dc', framealpha=0.92)
    ax.set_xlim(-37, 37)
    ax.set_ylim(56, -56)                      # as the owner's own plan: the stage end at the top, the entry at the bottom
    ax.set_aspect('equal')
    ax.tick_params(colors='#9aa0a8', labelsize=7)
    ax.set_xlabel('x (m): house left - / + house right', color='#9aa0a8', fontsize=8)
    ax.set_ylabel('z (m): the stage end (top, -) to the entry (bottom, +)', color='#9aa0a8', fontsize=8)
    ax.set_title(title, color='#e8e4dc', fontsize=10)
    fig.savefig(path, facecolor=fig.get_facecolor(), bbox_inches='tight')
    plt.close(fig)


def cable_picture(rig, pens, par_pens, path):
    """The cable plan (minor of the review: "no cable or DMX route plan"): every power circuit's daisy chain from its distro and
    every DMX line's from its node (circuits() / patch() routes, each leg run as an L), the walkway crossings that need a ramp,
    over the pens."""
    import matplotlib
    matplotlib.use('Agg')
    import matplotlib.pyplot as plt
    from matplotlib.patches import Rectangle
    fig, axs = plt.subplots(1, 2, figsize=(18, 13), dpi=100)
    fig.patch.set_facecolor('#0b0c0e')
    for ax, (key, routes, col, title) in zip(axs, (('power', [(c['circuit'], c['route']) for c in rig['power']['circuits'] if c.get('route')], '#ffcf5a', 'power: every circuit from its distro (16 A radials)'),
                                                 ('dmx', [(l['line'], l['route']) for l in rig['patch']['lines']], '#6fd0ff', 'DMX: every line from its node (<= %d devices)' % DMX_MAX_DEVICES))):
        ax.set_facecolor('#111214')
        for name, R in WALKWAYS:
            ax.add_patch(Rectangle((R['x_m'][0], R['z_m'][0]), R['x_m'][1] - R['x_m'][0], R['z_m'][1] - R['z_m'][0], fc='#3a2a20', alpha=0.5, lw=0))
            ax.text(R['x_m'][0] + 0.3, R['z_m'][0] + 1.0, name, color='#c09070', fontsize=7)
        for p in pens:
            R = p['rect']
            ax.add_patch(Rectangle((R['x_m'][0], R['z_m'][0]), R['x_m'][1] - R['x_m'][0], R['z_m'][1] - R['z_m'][0], fill=False, ec='#9fd0ff', lw=1.0))
        for R in par_pens:
            r_ = R['rect']
            ax.add_patch(Rectangle((r_['x_m'][0], r_['z_m'][0]), r_['x_m'][1] - r_['x_m'][0], r_['z_m'][1] - r_['z_m'][0], fill=False, ec='#c8c8c8', lw=0.6, ls='--'))
        for name, rt in routes:
            for a_, b_ in zip(rt, rt[1:]):
                ax.plot([a_[0], b_[0], b_[0]], [a_[1], a_[1], b_[1]], color=col, lw=0.8, alpha=0.8)
            ax.plot(rt[0][0], rt[0][1], 's', color=col, ms=6, mec='#000')
            ax.text(rt[0][0] + 0.6, rt[0][1] - 0.6, name, color=col, fontsize=6)
        xs = rig['power']['crossings'] if key == 'power' else rig['patch']['crossings']
        for x in xs:
            ax.plot(x['at'][0], x['at'][1], 'x', color='#ff5050', ms=7, mew=1.6)
        for f in rig['fixtures']:
            if f['type'] in ('up-pl5403', 'up-b380f', 'up-yz31p'):
                ax.plot(f['p'][0], f['p'][2], 'o' if f['type'] == 'up-pl5403' else 's', color='#e8e4dc', ms=2.5)
        ax.set_xlim(-37, 37)
        ax.set_ylim(56, -56)
        ax.set_aspect('equal')
        ax.tick_params(colors='#9aa0a8', labelsize=7)
        ax.set_title('%s · red x: a ramp (%d crossings)' % (title, len(xs)), color='#e8e4dc', fontsize=10)
    fig.savefig(path, facecolor=fig.get_facecolor(), bbox_inches='tight')
    plt.close(fig)


# ====================================================================== frames (moxir-v2-true-frames.cjs), the measured glare, the page
VIEWS = {
    'floor': {'position': [-3.75, 1.7, 18.1], 'target': [-3.75, 5.0, -20.0], 'fov': 70, 'label': 'the floor centre, 1.7 m (z 18)'},
    'wingL': {'position': [-20.0, 1.7, 8.0], 'target': [-4.0, 4.0, -2.0], 'fov': 70, 'label': 'the left wing, 1.7 m (x -20 z 8)'},
    'wingR': {'position': [18.0, 1.7, 8.0], 'target': [-5.0, 4.0, -2.0], 'fov': 70, 'label': 'the right wing, 1.7 m (x 18 z 8)'},
    'behind': {'position': [-4.0, 1.7, -22.0], 'target': [-4.0, 4.5, 10.0], 'fov': 70, 'label': 'behind the stage, 1.7 m (z -22)'},
    'entry': {'position': [0.0, 1.7, 51.5], 'target': [-3.0, 5.0, -10.0], 'fov': 60, 'label': 'the entry, 1.7 m (the door, z 51.5)'},
    'dj': {'position': [-5.2, 2.03, 4.3], 'target': [-4.0, 3.0, 30.0], 'fov': 70, 'label': 'the DJ\'s eye, 2.03 m on the step, toward the crowd'},
}
VORDER = ('floor', 'wingL', 'wingR', 'behind', 'entry', 'dj')
AUDIENCE_VIEWS = ('floor', 'wingL', 'wingR', 'behind', 'entry')
LOOKS = ('peak', 'dark')
FRAME_LAYOUTS = {'sl': ('v2 spread (old, PR #864, levels as a9d4b0d1)', 'moxir-v2-stage-lasers', '/moxir/p/moxir-v2-stage-lasers'),
                 'gr': ('v2 ground (new)', 'moxir-v2-ground', '/moxir/p/moxir-v2-ground')}
# 2026-10-10 (fix 2): the six views x two looks of the new room, then the SAME twelve of the old spread drawn again now with its
# levels as a9d4b0d1 left them (the level fix in), at most 4 frames per call (the heat rule), each call under `timeout 1200`.
BATCHES = [['gr-t40-peak-floor', 'gr-t40-dark-floor', 'gr-t40-peak-entry', 'gr-t40-dark-entry'],
           ['gr-t40-peak-wingL', 'gr-t40-dark-wingL', 'gr-t40-peak-wingR', 'gr-t40-dark-wingR'],
           ['gr-t40-peak-behind', 'gr-t40-dark-behind', 'gr-t40-peak-dj', 'gr-t40-dark-dj'],
           ['sl-t40-peak-floor', 'sl-t40-dark-floor', 'sl-t40-peak-entry', 'sl-t40-dark-entry'],
           ['sl-t40-peak-wingL', 'sl-t40-dark-wingL', 'sl-t40-peak-wingR', 'sl-t40-dark-wingR'],
           ['sl-t40-peak-behind', 'sl-t40-dark-behind', 'sl-t40-peak-dj', 'sl-t40-dark-dj']]
GLARE_BUDGET_PCT = 0.65


def group_word(f):
    """The word that finds a unit's group in the room's look (epic-build.mjs v1Looks / positionOf): a floor lamp standing
    straight up (verticalLean) shares '<part>-in<deg>/', every other unit has its own '<id>/'."""
    d = aim_dir(f['r'])
    if abs(d[2]) > 0.002 or d[1] < 0.9:
        return '%s/' % f['id']
    side = 0 if abs(f['p'][0] - 0.13) < 0.05 else (1 if f['p'][0] > 0.13 else -1)
    if side == 0 and abs(d[0]) > 0.002:
        return '%s/' % f['id']
    deg = 0 if side == 0 else math.floor(math.degrees(math.asin(max(-1.0, min(1.0, -d[0] * side)))) * 10 + 0.5) / 10   # JS Math.round, as epic-build
    return '%s-in%s/' % (f['part'].replace(' ', '-'), ('%g' % deg) if deg != int(deg) else '%d' % deg)


def _job(V, key, look, view, name=None, set_keys=None):
    title, project, path = FRAME_LAYOUTS[key]
    v = VIEWS[view]
    job = {'name': name or '%s-t40-%s-%s' % (key, look, view), 'layout': key, 'state': 't40', 'look': look, 'view': view, 'project': project, 'path': path,
           'atmosphere': V.STATES['t40'][2], 'camera': {'position': v['position'], 'target': v['target'], 'fov': v['fov']}, 'recordLamps': 0.5}
    if set_keys:
        job['setKeys'] = set_keys
    return job


def plan(repo, out):
    import moxir_v2_true as V
    jobs = [_job(V, key, look, view) for key in FRAME_LAYOUTS for look in LOOKS for view in VORDER
            if any('%s-t40-%s-%s' % (key, look, view) in b for b in BATCHES)]
    p = {'base': 'http://moxir-ground.diiii.localhost', 'query': V.QUERY, 'size': [1440, 900], 'settle_s': 15, 'jobs': jobs, 'batches': BATCHES}
    os.makedirs(out, exist_ok=True)
    json.dump(p, open(os.path.join(out, 'plan.json'), 'w'), indent=1)
    print('%d jobs in %d batches -> %s' % (len(jobs), len(BATCHES), os.path.join(out, 'plan.json')))


def tune_plan(repo, out, sets, views=('floor',)):
    """FIX 1c: frames of the new room's peak look with the hall's parts held at other levels (setKeys, the browser's copy only):
    sets = {name: {part: level}}. Writes <out>/plan-tune.json (its batches of <= 4)."""
    import moxir_v2_true as V
    T = json.load(open(os.path.join(repo, RIG_GR)))
    jobs = []
    for sname, lv in sets.items():
        keys = {}
        for f in T['fixtures']:
            if f['part'] in lv:
                keys[group_word(f)] = lv[f['part']]
        for view in views:
            jobs.append(_job(V, 'gr', 'peak', view, name='tune-%s-%s' % (sname, view), set_keys=keys))
    names = [j['name'] for j in jobs]
    p = {'base': 'http://moxir-ground.diiii.localhost', 'query': V.QUERY, 'size': [1440, 900], 'settle_s': 15, 'jobs': jobs,
         'batches': [names[i:i + 4] for i in range(0, len(names), 4)], 'sets': sets}
    json.dump(p, open(os.path.join(out, 'plan-tune.json'), 'w'), indent=1)
    print('%d tune jobs -> %s' % (len(jobs), os.path.join(out, 'plan-tune.json')))


def measured(repo, out, luma_path):
    """Write the measured white-out into both rig files' checks (the test reads it): the floor's peak frame against the budget,
    every other audience view held to the same budget (the DJ's own view is recorded, not held: he is not the audience), the
    level-tuning frames (FIX 1c), and the old spread's frames drawn the same way, for the record."""
    luma = json.load(open(luma_path or os.path.join(out, 'frame-luma.json')))
    fr = luma.get('gr-t40-peak-floor')
    if not fr:
        raise SystemExit('no gr-t40-peak-floor in %s' % (luma_path or 'frame-luma.json'))
    views = {k: v for k, v in sorted(luma.items()) if k.startswith('gr-')}
    held = {k: v for k, v in views.items() if k.split('-')[-1] in AUDIENCE_VIEWS}
    over = sorted(k for k, v in held.items() if v['white_pct'] > GLARE_BUDGET_PCT)
    frames = json.load(open(os.path.join(out, 'frames', 'frames.json')))
    gf = frames.get('gr-t40-peak-floor', {})
    lam = [round(l['intensity_scene'], 1) for l in gf.get('lamps') or []]
    T0 = json.load(open(os.path.join(repo, RIG_GR)))
    laser = next(l for l in T0['looks'] if l['id'] == 'peak')['parts'].get('laser')
    tune_path = os.path.join(out, 'tune-luma.json')
    tune = json.load(open(tune_path)) if os.path.exists(tune_path) else {}
    tplan = json.load(open(os.path.join(out, 'plan-tune.json'))) if os.path.exists(os.path.join(out, 'plan-tune.json')) else {}
    tune_rows = [{'frame': k, 'set': (tplan.get('sets') or {}).get(k.split('-')[1]), 'mean_Y': v['mean_Y'], 'white_pct': v['white_pct']} for k, v in sorted(tune.items())]
    rec = {'frame': 'gr-t40-peak-floor', 'white_pct': fr['white_pct'], 'mean_Y': fr['mean_Y'], 'budget_pct': GLARE_BUDGET_PCT, 'ok': fr['white_pct'] <= GLARE_BUDGET_PCT,
           'laser_fader': laser[1] if laser else None, 'laser_lines_drawn_scene_intensity': sorted(set(lam)),
           'every_view_ok': not over, 'views_held': sorted(held), 'views_over_budget': over, 'all_frames': views,
           'spread_drawn_now': {k: v for k, v in sorted(luma.items()) if k.startswith('sl-')}, 'level_tuning_frames': tune_rows,
           'drawn_by': {'commit': gf.get('commit'), 'gpu': (gf.get('gpu') or '')[:80], 'ev100': gf.get('ev100'), 'at': gf.get('at')},
           'method': 'moxir-v2-true-frames.cjs, measurement mode EV100 2.84, Full quality, haze t40 (one machine, closed hall), the floor eye 1.7 m z 18.1; frame_luma.py: the share of pixels with every channel >= 240 (the toolbars cut off)'}
    for f in (RIG_GR, LAYER):
        T = json.load(open(os.path.join(repo, f)))
        T['checks']['floor_glare_peak_measured'] = rec
        if 'level_tuning' in T['checks']:
            T['checks']['level_tuning']['measured'] = tune_rows
        json.dump(T, open(os.path.join(repo, f), 'w'), indent=1, default=JD)
    T = json.load(open(os.path.join(repo, RIG_GR)))
    json.dump({'checks': T['checks'], 'review': T['review']}, open(os.path.join(out, 'checks.json'), 'w'), indent=1, default=JD)
    print(json.dumps({k: v for k, v in rec.items() if k not in ('all_frames', 'spread_drawn_now')}, indent=1))


def page(repo, out):
    """The comparison page: the old spread and the new ground layout, the numbers first (each with the rule it answers), then
    every frame pair with its own numbers above it (mean luminance and white-out, frame_luma.py), the plans, the pens and desk
    limits, the stage front, what each eye sees, the tests that guard it and what is owed."""
    import html
    E = html.escape
    T = json.load(open(os.path.join(repo, RIG_GR)))
    SPR = json.load(open(os.path.join(repo, RIG_SP)))
    ck, rv = T['checks'], T['review']
    lp = os.path.join(out, 'frame-luma.json')
    luma = json.load(open(lp)) if os.path.exists(lp) else {}
    cap = json.load(open(os.path.join(out, 'captions.json'))) if os.path.exists(os.path.join(out, 'captions.json')) else {}
    fmt_l = lambda L: ('mean luminance %.4f · white-out %.2f %%' % (L['mean_Y'], L['white_pct'])) if L else 'not drawn'
    fl = lambda v, n=2: ('%%.%df' % n) % (math.floor(float(v) * 10 ** n + 1e-9) / 10 ** n)      # never round a claim up (the owner's rule)

    def fig(name):
        k, _, lk, v = name.split('-')
        src = 'frames/%s.png' % name
        if not os.path.exists(os.path.join(out, src)):
            return '<figure class="missing"><figcaption><b>%s · %s look</b><span>not drawn</span></figcaption></figure>' % (E(FRAME_LAYOUTS[k][0]), lk)
        return ('<figure><a href="%s"><img src="%s" alt="%s, %s look, %s" loading="lazy"></a><figcaption><b>%s · %s look</b>%s</figcaption></figure>') % (
            src, src, E(FRAME_LAYOUTS[k][0]), lk, E(VIEWS[v]['label']), E(FRAME_LAYOUTS[k][0]), lk,
            ('<span>%s</span>' % E(cap[name])) if cap.get(name) else '')

    def pair(v, lk):
        a, b = 'sl-t40-%s-%s' % (lk, v), 'gr-t40-%s-%s' % (lk, v)
        return ('<h3>%s · %s look</h3><p class="nums"><span>old: %s</span><span>new: %s</span></p><div class="pair">%s%s</div>' % (
            E(VIEWS[v]['label']), lk, fmt_l(luma.get(a)), fmt_l(luma.get(b)), fig(a), fig(b)))
    pairs = ''.join(pair(v, lk) for v in VORDER for lk in LOOKS)
    darker = [v + ' ' + lk for v in VORDER for lk in LOOKS if luma.get('sl-t40-%s-%s' % (lk, v)) and luma.get('gr-t40-%s-%s' % (lk, v))
              and luma['gr-t40-%s-%s' % (lk, v)]['mean_Y'] < luma['sl-t40-%s-%s' % (lk, v)]['mean_Y']]
    n_pairs = sum(1 for v in VORDER for lk in LOOKS if luma.get('sl-t40-%s-%s' % (lk, v)) and luma.get('gr-t40-%s-%s' % (lk, v)))
    pk_views = [v for v in AUDIENCE_VIEWS if luma.get('sl-t40-peak-%s' % v) and luma.get('gr-t40-peak-%s' % v)]
    pk_bright = [v for v in pk_views if luma['gr-t40-peak-%s' % v]['mean_Y'] > luma['sl-t40-peak-%s' % v]['mean_Y']]
    names_v = {'floor': 'the floor centre', 'wingL': 'the left wing', 'wingR': 'the right wing', 'behind': 'behind the stage', 'entry': 'the entry'}
    peak_cmp = ('brighter than the old one in %d of the %d audience views (darker from %s)' % (len(pk_bright), len(pk_views), ', '.join(names_v[v] for v in pk_views if v not in pk_bright) or 'none')
                if pk_views else 'not drawn yet')
    zb, za = rv['zones_before'], rv['zones_after']
    zk = [k for k in za if isinstance(za[k], dict)] + [k for k in zb if isinstance(zb[k], dict) and k not in za]
    fz = lambda d: ', '.join('%d %s' % (v, t) for t, v in d.items()) if d else '0'
    zones = ''.join('<tr><td>%s</td><td>%s</td><td>%s</td></tr>' % (E(k), fz(zb.get(k, {})), fz(za.get(k, {}))) for k in zk)
    old_n = [f for f in SPR['fixtures'] if f['type'] in ('up-pl5403', 'up-b380f') and not f['part'].startswith('cut')]
    old_ground = [f for f in old_n if f['p'][1] <= GROUND_MAX_Y]
    gm = ck.get('floor_glare_peak_measured') or {}
    old_w = (luma.get('sl-t40-peak-floor') or {}).get('white_pct')
    sp_, cv, pens, el, fld, pe = ck['par_spacing'], ck['par_coverage'], ck['pens'], ck['entry_lasers'], ck['beam_field_glare'], ck['par_eye_rule']
    sbr = ck['spread_by_the_same_rules']
    ep, epk = ck['epic'], ck['epic_peak_look']
    stf = ck['stage_front']
    lx = lambda lk, t: stf['floors'][lk][t]['lx']
    lxs = lambda lk, t: ck['stage_light_lx_room_spread'][lk][t]
    places = ck['par_places']['stands_in']
    nums = [
        ('on the floor (body at most 1.0 m up)', '%d of %d' % (ck['units_on_ground'], ck['ground_units']), '%d of %d' % (len(old_ground), len(old_n)),
         'every PAR and beam that is not on the truss (the truss keeps 10 PARs)'),
        ('beam strength from where the crowd stands', 'x %s of the spread' % fl(ep['crowd_eyes']['beam_ratio']), 'x 1.00',
         'the beams\' glow in the haze toward the six crowd eyes, weighted by the people each stands for, every beam at full (x %s with the peak look\'s levels)' % fl(epk['crowd_eyes']['beam_ratio'])),
        ('B\'s ember fan behind the DJ', 'as the owner saw it' if ck['fan']['kept_from_spread'] else 'CHANGED', 'B tuned', 'the six heads in the same place with the same aims'),
        ('beam pens', '%d fenced + the stage pen (%.0f m of barrier), %d in the entry half' % (pens['fenced_islands'], pens['barrier_m'], len(pens['entry_half_islands'])), 'none (heads up at 3.7 m)',
         'each head\'s low run held for its whole pan/tilt window; heads >= %.1f m from the barrier' % HEAD_REACH_M),
        ('the public floor looking down a beam within 30°', '%.2f %% (%.1f m²)' % (fld['fail_pct'], fld['fail_area_m2']), '%.2f %% (aims only)' % sbr['field_glare_fail_pct_aims_only'],
         '%d points 0.5 m apart, eyes at 1.5 / 1.7 / 1.9 m, every head\'s whole window' % fld['points']),
        ('floor PARs with a standing eye in their beam', '%d of %d' % (pe['fail_count'], pe['pars']), '%d' % sbr['par_eye_fail_count'],
         'a person leaning %.1f m over a fence; PARs in the stage pen %d, machines %d, beam pens %d, their own fenced pen %d (%.0f m of barrier)' % (
             LEAN_M, places.get('stage pen', 0), places.get('machine', 0), places.get('beam pen', 0), places.get('own pen', 0), ck['par_places']['par_pen_barrier_m'])),
        ('stage front at the peak (lx): DJ face / booth / PA L / PA R', ' / '.join(fl(lx('peak', t), 1) for t in ('DJ face', 'booth front', 'PA L face', 'PA R face')),
         ' / '.join(fl(lxs('peak', t), 1) for t in ('DJ face', 'booth front', 'PA L face', 'PA R face')),
         'from the floor of the pit; floors %s (the spread as the owner saw it on 10-09)' % ' / '.join('%.0f' % v for v in STAGE_FRONT_FLOORS_LX['peak'].values())),
        ('PAR spacing (the hall\'s %d)' % (len([f for f in T['fixtures'] if f['type'] == 'up-pl5403' and not f['part'].startswith('cut')]) - len(STAGE_FRONT)), 'min %.1f m · median %.1f m' % (sp_['min_m'], sp_['median_m']),
         'min %.1f m · median %.1f m' % (sp_['spread_min_m'], sp_['spread_median_m']), 'rule: no two closer than %.1f m' % sp_['rule_m']),
        ('how far the painted area is from a PAR', 'median %.1f m · largest gap %.1f m' % (cv['ground']['gap_median_m'], cv['ground']['gap_max_m']),
         'median %.1f m · largest gap %.1f m' % (cv['spread']['gap_median_m'], cv['spread']['gap_max_m']), 'over %d one-metre cells of the hot zone and wings' % cv['cells']),
        ('floor glare at the peak (white-out)', ('%.2f %%' % gm['white_pct']) if gm else 'not measured', ('%.2f %%' % old_w) if old_w is not None else 'not drawn',
         'from the floor centre, budget %.2f %%, lasers at their cap (fader %.2f)' % (GLARE_BUDGET_PCT, gm.get('laser_fader') or 0.16)),
        ('beams that pass every rule', '%d of %d' % (ck['beams_ok'], ck['beams']), '–', 'no end in the bar or chill zone, none into a laser, the crane park held (B\'s fan: its air, as before), crew lanes clear'),
        ('entry lasers (#873)', 'nearest beam %.1f m from an aperture · nearest end %.1f m from a far-wall block' % (el['beam_aperture_gap_min_m'], el['beam_far_wall_block_gap_min_m']), '–', 'rules 1 m / 3 m (ASSUMED margins)'),
        ('DMX lines / power', 'at most %d devices a line · %d circuits ok: %s' % (ck['dmx_devices_max'], ck['circuits'], ck['circuits_ok']), '–', 'lines <= %d (4 of 32 spare), circuits <= 2 944 W; the laser circuit on a phase' % DMX_MAX_DEVICES),
    ]
    numrows = ''.join('<tr><td>%s</td><td><b>%s</b></td><td>%s</td><td class="dim">%s</td></tr>' % (E(a), E(b), E(c), E(d)) for a, b, c, d in nums)
    curve = ''.join('<tr%s><td>%.0f m</td><td>%d</td><td>%+.1f %%</td><td>%.1f / %.1f m</td><td>%.1f m</td><td>%.1f m</td><td>%.0f %%</td></tr>' % (
        ' class="chosen"' if c['spacing_m'] == sp_['rule_m'] else '', c['spacing_m'], c['placed'] + len(STAGE_FRONT), c['objective_vs_no_rule_pct'], c['nn_min_m'], c['nn_median_m'],
        c['gap_p90_m'], c['gap_max_m'], c['within_6m_pct']) for c in sp_['curve'])
    isl = ''.join('<tr><td>%s</td><td>%s × %s m</td><td>%d</td><td>%.1f m (%.1f m)</td><td>%s</td><td>%s</td></tr>' % (
        E(p['island']), p['size_m'][0], p['size_m'][1], len(p['heads']), p['pen_m_max'], p['pen_hand_m_max'], ('%.0f m' % p['barrier_m']) if p['barrier_m'] else 'its own (crew only)',
        E(p['barrier'])) for p in pens['islands'])
    lim_rows = ''.join('<tr><td>%s</td><td>%s</td><td>%.0f–%.0f°</td><td>%.0f–%.0f°</td><td>pan %d–%d · tilt %d–%d</td><td>%d N</td></tr>' % (
        E(f['id']), E(f['island']), f['desk_limits']['world_az_deg'][0], f['desk_limits']['world_az_deg'][1], f['desk_limits']['world_el_deg'][0], f['desk_limits']['world_el_deg'][1],
        f['desk_limits']['dmx16']['pan'][0], f['desk_limits']['dmx16']['pan'][1], f['desk_limits']['dmx16']['tilt'][0], f['desk_limits']['dmx16']['tilt'][1], math.floor(f['base']['push_at_top_n_with_factor']))
        for f in T['fixtures'] if f['type'] == 'up-b380f')
    eb, ea = rv['eyes_before'], rv['eyes_after']
    eyes = ''.join('<tr><td>%s</td><td>%.2f</td><td>%.2f → %.2f</td><td>%.4f → %.4f</td><td>x %s</td></tr>' % (
        E(e), ep['per_eye'][e]['weight'], eb['par_lux_at_eye'][e], ea['par_lux_at_eye'][e], eb['beam_G'][e], ea['beam_G'][e], fl(ep['per_eye'][e]['beam_ratio'])) for e in EYES)
    front = ''.join('<tr><td>%s</td><td>%s</td><td>%.2f m</td><td>%s</td><td>%s</td></tr>' % (
        E(k), ', '.join('%.2f' % v for v in r['p']), r['reach']['behind_barrier_m'], 'yes' if r['reach']['out_of_reach'] else 'no: mesh guard + the pit\'s security',
        ', '.join('%s %.3f' % (lk, v) for lk, v in (r['levels'] or {}).items())) for k, r in stf['lamps'].items())
    owed = ''.join('<li>%s</li>' % E(o) for o in T.get('owed', []))
    doc = PAGE.format(numrows=numrows, zones=zones, eyes=eyes, isl=isl, pairs=pairs, curve=curve, owed=owed, owner=E(OWNER_WORDS), rule=sp_['rule_m'],
                      lim_rows=lim_rows, front=front, darker=('%d of %d pairs' % (len(darker), n_pairs)) if n_pairs else 'not drawn yet',
                      ratio=fl(ep['crowd_eyes']['beam_ratio']), ratio_pk=fl(epk['crowd_eyes']['beam_ratio']), fail=('%.2f' % fld['fail_pct']), pe=pe['fail_count'],
                      n_pens={1: 'one', 2: 'two', 3: 'three', 4: 'four', 5: 'five'}.get(pens['fenced_islands'], str(pens['fenced_islands'])),
                      entry_pens={0: 'none', 1: 'one', 2: 'two'}.get(len(pens['entry_half_islands']), str(len(pens['entry_half_islands']))),
                      spread_fail='%.0f' % sbr['field_glare_fail_pct_aims_only'], peak_cmp=peak_cmp)
    open(os.path.join(out, 'index.html'), 'w').write(doc)
    print('page -> %s' % os.path.join(out, 'index.html'))


PAGE = """<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>MOXIR v2 ground</title>
<style>
:root {{ --bg:#0b0c0e; --panel:#141518; --ink:#e8e4dc; --dim:#9aa0a8; --ember:#ff3a12; --line:#2a2c31; --hi:#ffb08a; }}
* {{ box-sizing:border-box; border-radius:0; }}
body {{ margin:0; background:var(--bg); color:var(--ink); font:15px/1.5 system-ui, sans-serif; }}
main {{ max-width:1500px; margin:0 auto; padding:24px 16px 64px; }}
h1 {{ font-size:26px; margin:0 0 6px; }} h2 {{ font-size:20px; margin:42px 0 8px; border-top:1px solid var(--line); padding-top:18px; }}
h3 {{ font-size:15px; margin:22px 0 2px; color:var(--hi); }}
.lead {{ font-size:17px; max-width:1000px; }} .lead b {{ color:var(--hi); }} q {{ color:var(--hi); }}
.note, .dim {{ color:var(--dim); }} .note {{ max-width:1000px; margin:4px 0 10px; }}
.nums {{ display:grid; grid-template-columns:1fr 1fr; gap:10px; margin:2px 0 6px; font-size:13.5px; color:var(--dim); font-variant-numeric:tabular-nums; }}
.pair {{ display:grid; grid-template-columns:1fr 1fr; gap:10px; margin:0 0 14px; }}
figure {{ margin:0; background:var(--panel); border:1px solid var(--line); }}
figure img {{ width:100%; display:block; }} figure.missing {{ min-height:120px; }}
figcaption {{ padding:8px 10px 10px; font-size:13.5px; }} figcaption b {{ display:block; color:var(--dim); font-weight:600; font-size:12px; }}
figcaption span {{ display:block; margin:3px 0; }}
table {{ border-collapse:collapse; width:100%; margin:10px 0; font-size:13.5px; font-variant-numeric:tabular-nums; }}
td, th {{ border:1px solid var(--line); padding:6px 8px; vertical-align:top; text-align:left; }} th {{ color:var(--dim); font-weight:600; }}
tr.chosen td {{ background:#1d1410; }}
.wrap {{ overflow-x:auto; }}
ul {{ max-width:1000px; }}
@media (max-width: 800px) {{ .pair, .nums {{ grid-template-columns:1fr; }} }}
</style></head><body><main>
<h1>MOXIR v2 — every wash and beam on the floor</h1>
<p class="lead">You said: <q>{owner}</q>. Left: <b>the spread</b> (PARs and beams up on column brackets). Right: <b>the ground
layout</b>. Every PAR and beam that is not on the truss now stands on the floor. The truss keeps 10 PARs; the other 40 and all 18
beams are on the ground. <b>B's ember fan behind the DJ is back exactly as you saw it.</b> Twelve more beams stand in {n_pens} fenced
pens ({entry_pens} in the entry half). Seen from where the crowd stands, the beams glow <b>x {ratio}</b> as strongly as the spread's
with every beam at full, and <b>x {ratio_pk}</b> with each look's own levels: most of the spread's glow came from beams that let
{spread_fail} % of the floor look down a beam within 30°, which the rule now forbids. At the peak the new scene is {peak_cmp};
the dark look is darker than the spread's from every view.</p>
<p class="note">Safety, checked on the whole public floor: {fail} % of it looks down a beam within 30°; {pe} floor PARs have a
standing eye in their beam. Every floor PAR stands in the stage pen, in a machine, in a fenced beam pen or in its own fenced pen.</p>
<h2>The numbers</h2>
<div class="wrap"><table><tr><th></th><th>ground (new)</th><th>spread (old, as drawn now)</th><th>what it means</th></tr>{numrows}</table></div>
<h2>The plan, from above</h2>
<div class="pair"><figure><a href="plan-spread.png"><img src="plan-spread.png" alt="the spread from above" loading="lazy"></a><figcaption><b>v2 spread (old)</b><span>White rings mark units up on the steel.</span></figcaption></figure>
<figure><a href="plan-ground.png"><img src="plan-ground.png" alt="the ground layout from above" loading="lazy"></a><figcaption><b>v2 ground (new)</b><span>Blue boxes are the fenced beam pens, dashed grey boxes the PAR pens, the orange strip in the stage pen is where B's fan runs low (crew keep out). Each beam is drawn to the first thing it hits.</span></figcaption></figure></div>
<figure><a href="plan-cables.png"><img src="plan-cables.png" alt="the cable plan" loading="lazy"></a><figcaption><b>The cable plan</b><span>Every power circuit from its distro and every DMX line from its node. A red cross is a cable ramp where a run crosses the dance floor or the entry corridor.</span></figcaption></figure>
<h2>The frames — old left, new right</h2>
<p class="note">Both projects drawn now, on the real GPU, with the same viewer (the level fix #868 in; the spread with its levels as a9d4b0d1 left them): measurement mode at EV100 2.84, Full quality,
haze after 40 minutes of one machine in the closed hall (an estimate until measured on site). Above each pair: the frame's mean
luminance and its white-out (the share of pixels white in every channel).</p>
{pairs}
<h2>The stage front, from the ground</h2>
<p class="note">The DJ key and the booth lamp stand in the gap between the PA boxes, out of the crowd's reach. Each PA face is lit by a PAR at the end of the pit, beside its box. Those two stand closer than 1.4 m to the barrier, so each has a mesh guard and the pit's security watches them. The levels light every face at least as brightly as the spread did on 10-09.</p>
<div class="wrap"><table><tr><th>lamp</th><th>place (x, y, z)</th><th>behind the barrier</th><th>out of reach (1.4 m)</th><th>levels</th></tr>{front}</table></div>
<h2>The pens and each head's desk window</h2>
<p class="note">A beam that starts on the floor stays low for its first metres. Inside its pen nobody can reach it; outside, its lower edge stays at least 3.0 m above every standing level, for every pan and tilt the desk allows the head. The low run is given under 3.0 m, with the raised-hand value (2.8 m) in brackets.</p>
<div class="wrap"><table><tr><th>pen</th><th>size</th><th>beam heads</th><th>longest low run</th><th>barrier</th><th>how</th></tr>{isl}</table></div>
<div class="wrap"><table><tr><th>head</th><th>pen</th><th>pan (world)</th><th>tilt (elevation)</th><th>desk limits (16-bit DMX)</th><th>push its base takes</th></tr>{lim_rows}</table></div>
<h2>Why {rule:.0f} m between PARs</h2>
<p class="note">The same pick at each spacing: first every place of your painted area gets a lit PAR within one roof height (10.8 m), then the rest go where the nine audience eyes see the most lit steel.</p>
<div class="wrap"><table><tr><th>spacing</th><th>PARs placed</th><th>objective vs no rule</th><th>nearest neighbour min / median</th><th>90 % of the area within</th><th>largest gap</th><th>area within 6 m</th></tr>{curve}</table></div>
<h2>Where the lamps are — your zones, old and new</h2>
<div class="wrap"><table><tr><th>zone</th><th>spread</th><th>ground</th></tr>{zones}</table></div>
<h2>What each place sees</h2>
<p class="note">Every lamp at full. PAR: the light its lit steel sends to that eye (lx, one bounce). Beam: its glow in the haze toward that eye (G, a design metric). The weight is the share of people that eye stands for.</p>
<div class="wrap"><table><tr><th>eye (1.7 m)</th><th>weight</th><th>PAR lx</th><th>beam G</th><th>beam ratio</th></tr>{eyes}</table></div>
<h2>Not checked yet, owed</h2>
<ul>{owed}</ul>
<p class="note">Every number: <a href="checks.json">checks.json</a>, <a href="candidates-fix2.json">candidates-fix2.json</a>, <a href="frame-luma.json">frame-luma.json</a>, <a href="frames/frames.json">frames/frames.json</a>.</p>
</main></body></html>
"""


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('cmd', choices=['candidates', 'build', 'plan', 'tune', 'page', 'measured'])
    ap.add_argument('--repo', default='.')
    ap.add_argument('--out', default=os.path.expanduser('~/Downloads/moxir/v2-ground'))
    ap.add_argument('--luma', default=None, help='measured: the frames\' frame-luma.json')
    ap.add_argument('--sets', default=None, help='tune: {name: {part: level}} as JSON')
    ap.add_argument('--views', default='floor', help='tune: the views, comma separated')
    A_, _ = ap.parse_known_args()
    repo = os.path.abspath(os.path.expanduser(A_.repo))
    out = os.path.abspath(os.path.expanduser(A_.out))
    if A_.cmd == 'candidates':
        candidates(repo, out)
    elif A_.cmd == 'build':
        build(repo, out)
    elif A_.cmd == 'plan':
        plan(repo, out)
    elif A_.cmd == 'tune':
        tune_plan(repo, out, json.loads(A_.sets), tuple(A_.views.split(',')))
    elif A_.cmd == 'measured':
        measured(repo, out, A_.luma)
    else:
        page(repo, out)


if __name__ == '__main__':
    main()
