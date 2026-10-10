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
#   2026-10-10 evening, ROUND 2 (the lead's brief ground-round2-brief.md, acceptance A1-A12): every unit OUT OF THE CROWD (walls,
#   window bands, column rows, the stage edge behind the barrier, the far end, the entry wall), no unit and no barrier on the public
#   floor, the official v2 patch, peak <= 0.85, PARs safe at 15 and 25 deg, lean eyes, #873's strip clear. The R2 block below (line
#   ~302) wins over FIX and the older METHOD wherever they differ.
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

# ====================================================================== ROUND 2 (2026-10-10 evening): ON THE GROUND, OUT OF THE CROWD
# The MOXIR lead's brief (ground-round2-brief.md) after three skeptic passes on fac5c43d (ground-verify-di.md): the islands of
# beam pens and PAR pens inside the crowd cost ~420 m of barrier, stewards, cable crossings and climbable barriers under the 40 W
# beams, and nobody asked for them. Round 2 puts every ground unit WHERE THE CROWD IS NOT: along the hall walls (the window bands
# are on them), the wall column rows (x -36, +36), the stage pen's edge behind the existing barrier, the far end behind the stage,
# the far corners and the entry wall house right of the bar. These rules supersede the FIX block where they differ:
# R2.1 THE PUBLIC FLOOR = the owner's paint (hot, wings, bar, chill) + the door walkway (DOOR_WALK: the unpainted strip between
#      the chill and the bar from the hot zone to the door, where everyone walks in), less the stage pen (crew) and the machines.
#      No unit and no barrier of this layer stands on it (A2). Its edge, where a unit stands behind it, is a LINE the crowd plan
#      draws (barrier or fence): measured here (perimeter_lines), never assumed away.
# R2.2 REACH: a B380F head >= HEAD_REACH_M (1.5 m, ISO 13857 Table 2, as in FIX 2) from the public floor; a PAR >= PAR_REACH_M
#      (1.0 m, ASSUMED: the old PAR pen's half size; a PAR is low risk). A beam's low run (lower edge under 3.0 m) stays >=
#      BARRIER_REACH_M (0.6 m) from the public floor over the head's whole desk window: the pen is the line itself.
# R2.3 THE 30 deg LOOK-DOWN RULE IS ASSUMED: a design heuristic (forward scatter at HG g 0.74: HG(30 deg) ~ 1/5 of HG(15 deg),
#      eyes.py), NOT a published standard. The eye-safety limit of the B380F is its IEC 62471 hazard distance, UNKNOWN until the
#      rental gives its risk group. The rule is checked over the public floor AND a LEAN band: every place within LEAN_M (0.5 m)
#      outside the public floor's edge (a person leaning over any barrier or line), eyes at 1.5 / 1.7 / 1.9 m (A7).
# R2.4 PAR LENS: the rental's PL5403 lens is not stated (fixtures.json: 8, 15 or 25 deg sold). No standing or leaning eye in any
#      PAR beam at 15 deg AND at 25 deg (+1 deg aim tolerance); places are chosen at 25 deg (the worse), A6.
# R2.5 THE 40 W CORRIDOR (#873 under_the_beams, read from its rig): no unit and no line of this layer inside its x-strip at any
#      z (every unit and a 1.1 m line are higher than its 0.17-0.80 m limits). The stage pen's own barrier and B's fan are the
#      spread's (flagged, not this layer's), A8.
# R2.6 THE PATCH is the official v2 patch (#872, owner N460.2): addresses by unit id from scripts/place/rigs/moxir-v2-patch-
#      2026-10-09.json; this rig only routes the lines (one per area and universe, <= 28 devices), A1.
# R2.7 NOTHING IN THE PIT: no PAR between the PA boxes' front line and the barrier (MOXIR.md 5.3); the PA faces' two floor
#      lamps leave the pit (an OWNER DECISION: the truss, or the barrier 1 m out), A9.
# R2.8 HEADROOM: no look runs a beam or a PAR above PEAK_CAP (0.85) (A4); the peak keeps the spread's ember split (A3).
ROUND = 'r2-2026-10-10'
PATCH_PLAN = 'scripts/place/rigs/moxir-v2-patch-2026-10-09.json'
ENTRY_LASER_RIG = 'scripts/place/rigs/moxir-v2-entry-lasers-2026-10-09.json'
DOOR_WALK = {'x_m': (-8.0, 7.0), 'z_m': (43.5, 53.7),
             'why': 'the unpainted strip between the chill (x <= -8) and the bar (x >= 7) from the hot zone\'s end (z 43.5) to the door (z 53.8): everyone walks in here, so it is public'}
HALL_IN = {'x_m': (-36.2, 60.2), 'z_m': (-53.6, 53.6)}           # inside the walls (inner faces x -36.4 / 60.4, end walls z +-53.8)
PAR_REACH_M = 1.0
PAR_SAFETY_LENSES_DEG = (15.0, 25.0)
PAR_DESIGN_LENS_DEG = 25.0
PEAK_CAP = 0.85
BEAM_MIN_SPACING_M = 4.0          # ASSUMED: two floor plates, a crew walk between and no two windows on one spot
# The cover phase's radius (ASSUMED, chosen by a measured scan, 2026-10-10, scratch picksim on candidates-r2.json): at 18 m all 12
# heads went to cover and the entry eyes fell to x0.04-0.06 of the spread; 21.9 (A5's own number) 9 cover / 3 entry, entry eyes
# x1.12 / 0.93 / 0.95; 22.5 x1.28 / 0.995 / 1.06; 23 x1.27 / 1.07 / 1.13; 24 x1.26 / 1.05 / 1.17, gap 24.64 m in each (this slot
# set's floor); 25 gap 24.97; 26 gap 25.85. 24 keeps the gap at its floor and every entry eye >= x1.0; with the A5 option's island
# the same radius gives 21.88 m.
BEAM_COVER_R_M = 24.0
SPREAD_BEAM_GAP_M = 21.9          # the spread's largest gap between beam bases (checks.json beam_coverage.spread, fac5c43d)
BEAM_BANDS = (('z < -18', -99.0, -18.0), ('-18..-6', -18.0, -6.0), ('-6..6', -6.0, 6.0), ('6..18', 6.0, 18.0), ('18..30', 18.0, 30.0), ('>= 30', 30.0, 99.0))
ENTRY_EYES = ('mid-hall', 'near the entry', 'FOH')
ARTISTS_ROUTE = {'x_m': (-4.0, 4.0), 'z_m': (-53.8, -31.0),
                 'why': 'ASSUMED: the artists\' gate (x -2.4..2.4, MOXIR.md 4.0a) + 1.6 m each side, to the paint\'s far edge: kept clear of units and low beams'}
PIT = {'x_m': (-11.6, 2.0), 'z_m': (6.7, 8.2), 'why': 'MOXIR.md 5.3 "nothing on the floor between the PA and the barrier": from the PA boxes\' front line (PA L 6.7) to the barrier (z 8.2), the barrier\'s width'}
# #878 (Part A: the near crane at z 3.20 with the cut, the 6 cubes on the free crane), the lead's A13-A15 (2026-10-10 evening).
# Read with `git show` from origin/feat/moxir-cranes-lasers-2026-10-09 at 9c732712 (NOT merged here; the lead combines both into
# v2.1): rigs/moxir-crane-cut-v2-cranes-2026-10-09.json (sha256 84e64c1c...3f25) and rigs/moxir-lasers-on-crane-2026-10-09.json
# (sha256 7003d8c0...fa7c). The numbers below are copied from those files, each with its key.
SRC_878 = {'branch': 'origin/feat/moxir-cranes-lasers-2026-10-09', 'commit': '9c7327128ef3b0fd00a6242d609b36aafaba79b2',
           'cut': {'file': 'scripts/place/rigs/moxir-crane-cut-v2-cranes-2026-10-09.json', 'sha256': '84e64c1c72a2ae0d9e98fb0b5166219d68190bbb8c8e3636d2726fe3113c3f25'},
           'cubes': {'file': 'scripts/place/rigs/moxir-lasers-on-crane-2026-10-09.json', 'sha256': '7003d8c0c220977c5933cb091fc397fa8e8c00dce7543dda588ee2ace566fa7c'}}
# A13: the stage pen's barrier takes in this bay (#878 derived_at_z_3_20.people.public_with_the_pen_condition.condition)
STAGE_BAY = {'x_m': (-12.0, -10.5), 'z_m': (1.75, 6.5),
             'why': '#878: the cut\'s low end (x -11.04, bottom chord 2.89 m) and its hl strap pass the pen\'s edge x -10.5 at 0.33 m over raised hands; with the bay fenced, 0.622 m (rule 0.5 m)'}
# A5 OPTION (OWNER DECISION, 2026-10-10): the one island A2 allows. No out-of-crowd place stands within 21.9 m of the hall's
# middle (the nearest slot is 24.6 m from the painted cell x 3 z 19.5), and the stage edge in front of the near crane lies under
# the crane park (x -12..12, z -2..7, 2.5-10.8 m): the engine finds 0 legal aims from x 0.75..1.25, z 5..6 (scratch edge_probe).
# The island stands beside the FOH riser (x -6.7..-3.7, z 28..30), east of #873's strip (x -10.5..-4.5, + 0.5 m), with a head
# 2.4 m from each side (1.5 m reach + 0.18 + room for the lean eyes on its beam's side). Built only with
# MOXIR_GROUND_VARIANT=foh-island (its rig, layer and checks go to <out>/foh-island, never to the repo's rig).
ISLAND_FOH = {'x_m': (-3.6, 1.2), 'z_m': (26.6, 31.4), 'name': 'the FOH island (A5 option)',
              'why': 'A5: the one island A2 allows, beside the FOH riser and outside #873\'s strip; the hall\'s middle has no out-of-crowd place within 21.9 m'}
VARIANT = os.environ.get('MOXIR_GROUND_VARIANT', '')
RAISED_HANDS_M = 2.5            # #878 clearance.raised_hands_m (a tall adult's raised hands plus a jump)
HANDS_GAP_M = 0.5               # #878 people.rule: every part of the cut >= 0.5 m from raised hands
CUT_878 = {'crane_z_m': 3.2, 'section_m': 0.29,
           'bottom_chord': ((-11.04, 2.89), (0.55, 6.0)),            # derived_at_z_3_20.truss.ends (x, bottom chord y)
           'u_ends': (-6.25, 5.75), 'picks_u_m': (-5.75, -0.5, 5.25),  # rigging.picks_u_m: chains up to the girder (7.6 m)
           'strap_hl': ((-11.04, 3.04, 3.2), (-11.6, 3.04, 6.0)),     # rigging.tieoffs hl
           'lamps': ((-9.83, 3.606), (-8.864, 3.145), (-7.898, 4.124), (-6.932, 3.662), (-6.449, 3.792), (-5.0, 4.9),
                     (-4.034, 4.439), (-3.068, 4.698), (-2.102, 5.676), (-1.619, 5.086), (-0.653, 5.345)),   # pars[].p (x, y) at z 3.2
           'lamp_r_m': 0.2,             # ASSUMED: a PL5403 body's half size (about 0.4 m across with its yoke)
           'girder': {'dz_m': 1.1, 'half_w_m': 0.35, 'y_m': (7.6, 8.92), 'x_abs_m': 11.35}}   # as fan_park_meets (the cranes-lasers fact sheet's upper bound)
CUBES_878 = {'z0_m': -13.45, 'x_m': (-4.5, -1.0), 'y_m': (8.54, 9.09), 'end_m': (-4.031, 9.181, -53.8),   # units[].aperture_m p05..p95, aim.end_m
             'fan_deg': 1.008, 'waist_m': 0.004, 'margin_m': 0.25}  # rule: the 1.008 deg tube (+4 mm) keeps >= 0.25 m from every body
B380F_HALF_DEG = math.degrees(0.0157) / 2.0   # the rig's angle_rad (full beam angle) for an up-b380f
SLOT_STEP_M = 3.0                 # the candidate grid for out-of-crowd places (beams and PARs)
SLOT_MAX_FROM_PUBLIC_M = 12.0     # farther from the crowd, a unit lights nobody's view much: not scored
RAMP_SECTION_M = 1.0              # ASSUMED: cable-protector sections 1 m long (the rental's model owed)
PUBLIC_COST = 25.0                # the cable router's cost of 1 m over public floor (vs 1 m elsewhere): a crossing must save 25 m
STOCK_POWER_M = (50, 25, 20, 10, 5)       # ASSUMED stock lengths, 16 A H07RN-F 3G2.5 (the rental's list owed)
STOCK_DMX_M = (50, 30, 20, 10, 5, 3)      # ASSUMED stock lengths, DMX 5-pin
CABLE_SLACK_M = 2.0               # per leg: rise to the unit, dressing, a loop at the connector (ASSUMED)
DISTROS_R2 = {'D-STAGE': [-8.8, 0.0, 2.0, 'the main lighting distro in the stage pen (v1.1\'s place, crew side)'],
              'D-LEFT': [-34.6, 0.0, -3.0, 'house-left sub-distro against the wall (out of the crowd)'],
              'D-RIGHT': [32.0, 0.0, -3.0, 'house-right sub-distro by the wall column row x 36 (out of the crowd)'],
              'D-FAR': [-20.0, 0.0, -40.0, 'far-end sub-distro behind the paint\'s edge, house left of the 40 W corridor'],
              'D-ENTRY': [22.0, 0.0, 50.0, 'entry-end sub-distro by the entry wall, house right of the bar']}
NODES_R2 = {'NODE-STAGE': [-7.5, 0.0, 1.2, 'stage pen (v1.1 place): port A = U1, port B = U2'],
            'NODE-LEFT': [-34.6, 0.0, -1.5, 'house-left wall: port A = U1, port B = U2'],
            'NODE-RIGHT': [32.0, 0.0, -1.5, 'house right: port A = U1, port B = U2 (also the entry corner, by splitter)'],
            'NODE-FAR': [-20.0, 0.0, -38.5, 'far end: port A = U1, port B = U2']}
CONTROL_SITE = [-5.2, 0.0, 29.0, 'the FOH riser: the desk and the Art-Net switch (MOXIR.md: E-stop 1 at FOH)']


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
    key = (id(A), A.island is not None)
    if key in _PEOPLE:
        return _PEOPLE[key]
    seen, out = set(), []
    rows = [(row['z'], row['x_runs']) for zid in ('hot', 'use', 'bar', 'chill') for row in A.Z.areas[zid]]
    # R2.1: the door walkway (unpainted, everyone walks in there) is public too
    rows += [(z + 0.5, [[DOOR_WALK['x_m'][0], DOOR_WALK['x_m'][1]]]) for z in range(int(DOOR_WALK['z_m'][0] - 0.5), int(DOOR_WALK['z_m'][1]))]
    for rz, runs in rows:
        for x0, x1 in runs:
            for x in range(int(round(x0)), int(round(x1)) + 1):
                k = (x, rz)
                if k in seen:
                    continue
                seen.add(k)
                if A.fenced(x, rz) or massing_hits(G, x, rz, 0.0, 1.0, 0.0):
                    continue
                if not inside_rect(x, rz, HALL_IN, -0.5):
                    continue                                  # the paint runs past the house-left wall at the chill: the wall is the edge
                out.append(k)
    _PEOPLE[key] = np.asarray(out, float)
    return _PEOPLE[key]


class PtIndex:
    """Plan points bucketed in CELL x CELL m squares: the nearest-point distance for many queries without an n x m matrix."""
    CELL = 2.0

    def __init__(self, P):
        import numpy as np
        self.P = np.asarray(P, float).reshape(-1, 2)
        self.b = {}
        for i, (x, z) in enumerate(self.P):
            self.b.setdefault((int(math.floor(x / self.CELL)), int(math.floor(z / self.CELL))), []).append(i)
        self.b = {k: np.asarray(v) for k, v in self.b.items()}

    def dmin(self, Q, rmax=6.0):
        """The plan distance from each point of Q to the nearest point, capped at rmax (exact below rmax)."""
        import numpy as np
        Q = np.asarray(Q, float).reshape(-1, 2)
        out = np.full(len(Q), rmax)
        n = int(math.ceil(rmax / self.CELL))
        keys = {}
        for j, (x, z) in enumerate(Q):
            keys.setdefault((int(math.floor(x / self.CELL)), int(math.floor(z / self.CELL))), []).append(j)
        for (cx, cz), js in keys.items():
            idx = [self.b[(cx + i, cz + k)] for i in range(-n, n + 1) for k in range(-n, n + 1) if (cx + i, cz + k) in self.b]
            if not idx:
                continue
            S = self.P[np.concatenate(idx)]
            q = Q[js]
            d = np.min(np.hypot(q[:, None, 0] - S[None, :, 0], q[:, None, 1] - S[None, :, 1]), axis=1)
            out[js] = np.minimum(out[js], d)
        return out


_PUB = {}


def public_index(A, G):
    """R2.1: the public floor as 0.25 m feet points (public_points) and their index (PtIndex): dist_public() reads it."""
    key = id(A)
    if key not in _PUB:
        P = public_points(A, G, step=0.25)
        _PUB[key] = (P, PtIndex(P))
    return _PUB[key]


def dist_public(A, G, Q, rmax=6.0):
    """The plan distance from each point of Q to the public floor (0 inside it, within the 0.25 m grid's 0.18 m)."""
    return public_index(A, G)[1].dmin(Q, rmax)


def lean_points(A, G, step=0.25):
    """R2.3 / A7: the LEAN band: every place within LEAN_M outside the public floor's edge (over any barrier, line or machine edge),
    on the 0.25 m lattice of public_points. Returns an (n, 2) array."""
    import numpy as np
    P, I = public_index(A, G)
    x0, z0 = float(P[:, 0].min()) - 1.0, float(P[:, 1].min()) - 1.0
    ix = np.round((P[:, 0] - x0) / step).astype(int)
    iz = np.round((P[:, 1] - z0) / step).astype(int)
    nx, nz = int(ix.max()) + 6, int(iz.max()) + 6
    pub = np.zeros((nx, nz), bool)
    pub[ix, iz] = True
    r = int(round(LEAN_M / step))
    grown = pub.copy()
    for i in range(-r, r + 1):
        for k in range(-r, r + 1):
            if i * i + k * k <= r * r:
                grown |= np.roll(np.roll(pub, i, axis=0), k, axis=1)
    band = grown & ~pub
    bx, bz = np.nonzero(band)
    Q = np.column_stack([x0 + bx * step, z0 + bz * step])
    return Q[(Q[:, 0] >= HALL_IN['x_m'][0]) & (Q[:, 0] <= HALL_IN['x_m'][1]) & (Q[:, 1] >= HALL_IN['z_m'][0]) & (Q[:, 1] <= HALL_IN['z_m'][1])]


def public_points(A, G, exclude=(), step=1.0):
    """FIX 3 + 5: the plan points where a standing person's feet may be: every public 1 m cell (people_cells) split into
    (1 / step)^2 sub-cells at `step` spacing, less the rects in `exclude` (the fenced pens). Returns an (n, 2) array (x, z)."""
    import numpy as np
    C = people_cells(A, G)
    n = max(1, int(round(1.0 / step)))
    offs = (np.arange(n) + 0.5) / n - 0.5
    ox, oz = np.meshgrid(offs, offs)
    P = (C[:, None, :] + np.stack([ox.ravel(), oz.ravel()], axis=1)[None, :, :]).reshape(-1, 2)
    keep = (P[:, 0] >= HALL_IN['x_m'][0]) & (P[:, 0] <= HALL_IN['x_m'][1]) & (P[:, 1] >= HALL_IN['z_m'][0]) & (P[:, 1] <= HALL_IN['z_m'][1])
    for R in exclude:
        keep &= ~((P[:, 0] >= R['x_m'][0]) & (P[:, 0] <= R['x_m'][1]) & (P[:, 1] >= R['z_m'][0]) & (P[:, 1] <= R['z_m'][1]))
    return P[keep]


def public_eyes(A, G, exclude=(), ys=EYE_YS, step=1.0, lean=True):
    """FIX 3 + R2.3: one standing eye per public plan point (public_points) at each height of `ys` (+ 0.6 m on the FOH riser),
    and (lean) one per point of the LEAN band (0.5 m over every edge, lean_points). Returns an (n, 3) array, the heights in
    blocks of equal size (field_check reads it so)."""
    import numpy as np
    P = public_points(A, G, exclude, step)
    if lean:
        P = np.vstack([P, lean_points(A, G)])
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


_CORR = {}


def corridor(repo='.'):
    """R2.5: #873's 'nothing to stand on' strip under the two 40 W beams, as its rig writes it (under_the_beams): a list of
    {z_m, x_strip_m, highest_standing_surface_m, what}."""
    if repo not in _CORR:
        R = json.load(open(os.path.join(repo, ENTRY_LASER_RIG)))
        _CORR[repo] = R['under_the_beams']
    return _CORR[repo]


def in_corridor(x, z, pad=0.0, repo='.'):
    """The band of #873's strip that holds the plan point (with `pad` m around the x-strip), or None."""
    for b in corridor(repo):
        if b['z_m'][0] <= z <= b['z_m'][1] and b['x_strip_m'][0] - pad <= x <= b['x_strip_m'][1] + pad:
            return b
    return None


def low_run_r2(A, G, p, d, t, crew=False):
    """R2.2: one beam direction's run under 3.0 m (2.8 m) over the standing level, its lower edge from the lens's lowest point
    (APERTURE_R_M) at LOW_EDGE_DEG under the axis, every PEN_STEP_M to its first hit. ok = every sample under 3.0 m stays >=
    BARRIER_REACH_M from the public floor (the line at its edge is the pen) and out of the artists' route; crew (a head in the
    stage pen) = also >= CREW_GAP_M from every crew lane, >= SMOKE_SERVICE_R_M from the smoke machine's refill point and off the
    DJ step. Returns a dict (r30, r28 = plan reach)."""
    import numpy as np
    p, d = np.asarray(p, float), np.asarray(d, float)
    k = float(d[1]) - math.tan(math.radians(LOW_EDGE_DEG))
    if k <= 1e-3:
        return {'ok': False, 'r30': 99.0, 'r28': 99.0, 'public_gap_m': -9.9, 'crew_ok': False, 'why': 'never climbs'}
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
    qx, qz = q[u30, 0], q[u30, 2]
    if not len(qx):
        return {'ok': True, 'r30': 0.0, 'r28': 0.0, 'public_gap_m': 9.9, 'crew_ok': True}
    sub = np.column_stack([qx, qz])[::5]                       # every 0.05 m: the public grid is 0.25 m
    gap = float(dist_public(A, G, sub, rmax=6.0).min()) - 0.177  # the 0.25 m grid's half diagonal: the edge may be that much nearer
    route = bool(np.any(_rect_gap(qx, qz, ARTISTS_ROUTE) <= 0.0))
    crew_ok = True
    if crew:
        sx, sz = SMOKE_SERVICE
        dj = {'x_m': (-6.7, -3.7), 'z_m': (3.65, 5.65)}
        crew_ok = (float(np.min(np.hypot(qx - sx, qz - sz))) >= SMOKE_SERVICE_R_M and
                   min(float(np.min(_rect_gap(qx, qz, R))) for R in CREW_LANES.values()) >= CREW_GAP_M and
                   float(np.min(_rect_gap(qx, qz, dj))) >= BARRIER_REACH_M)
    return {'ok': gap >= BARRIER_REACH_M and not route and crew_ok, 'r30': R3(r30), 'r28': R3(r28), 'public_gap_m': R3(gap), 'crew_ok': crew_ok,
            'in_artists_route': route}


def run_window_r2(A, G, p, d, t, crew=False):
    """R2.2 over the head's whole desk window (every pan of WINDOW_PANS at the tilt limit: a higher tilt only shortens a low run).
    ok = every direction ok; r30 / r28 = the largest reach; public_gap_m = the smallest gap to the public floor."""
    rows = [low_run_r2(A, G, p, wd, t, crew) for wd in window_dirs(d)]
    return {'ok': all(r['ok'] for r in rows), 'r30': max(r['r30'] for r in rows), 'r28': max(r['r28'] for r in rows),
            'public_gap_m': min(r['public_gap_m'] for r in rows), 'crew_ok': all(r['crew_ok'] for r in rows)}


def out_of_crowd_places(A, G, step=SLOT_STEP_M, reach=HEAD_REACH_M, repo='.'):
    """R2: every floor place on a `step` grid inside the walls that is out of the crowd: >= `reach` from the public floor (the
    0.25 m grid's 0.18 m added), <= SLOT_MAX_FROM_PUBLIC_M from it, not in a machine (0.4 m pad) or on a column foot (0.8 m), not
    in #873's strip (0.5 m pad, R2.5), the tower's pen (KO-2 + 0.5 m), the artists' route, the pit, the crane park's footprint
    (a beam from there rises into it) or the door walkway. The stage pen's own floor is crew only: places there must also keep
    off B's fan strip, the crew lanes, the smoke machine's refill side, the DJ step and the fan's six heads. Returns a list of
    {x, z, region, from_public_m}."""
    import numpy as np
    ko2 = {'x_m': (ENTRY_LASERS['ko2']['x_m'][0] - 0.5, ENTRY_LASERS['ko2']['x_m'][1] + 0.5), 'z_m': (ENTRY_LASERS['ko2']['z_m'][0] - 0.5, ENTRY_LASERS['ko2']['z_m'][1] + 0.5)}
    xs = np.arange(HALL_IN['x_m'][0] + 0.7, 36.01, step)
    zs = np.arange(HALL_IN['z_m'][0] + 0.7, HALL_IN['z_m'][1] - 0.69, step)
    cand = [(float(x), float(z)) for x in xs for z in zs]
    # the stage pen's floor, on a finer grid (crew only)
    sp = A.stage_pen
    cand += [(float(x), float(z)) for x in np.arange(sp['x_m'][0] + 0.75, sp['x_m'][1] - 0.7, 1.5) for z in np.arange(sp['z_m'][0] + 0.75, sp['z_m'][1] - 0.7, 1.5)]
    dist = dist_public(A, G, np.asarray(cand), rmax=SLOT_MAX_FROM_PUBLIC_M + 1.0)
    out = []
    for (x, z), dp in zip(cand, dist):
        stage = inside_rect(x, z, sp)
        if dp < reach + 0.18 or dp > SLOT_MAX_FROM_PUBLIC_M:
            continue
        if massing_hits(G, x, z, 0.0, 1.0, 0.4) or near_column(G, x, z, 0.8) or in_corridor(x, z, 0.5, repo):
            continue
        if any(inside_rect(x, z, R) for R in (ko2, ARTISTS_ROUTE, PIT, DOOR_WALK)) or inside_rect(x, z, {'x_m': CRANE_PARK['x_m'], 'z_m': CRANE_PARK['z_m']}):
            continue
        if stage and (inside_rect(x, z, FAN_STRIP, -0.5) or any(float(_rect_gap(np.asarray([x]), np.asarray([z]), R)[0]) < 0.5 for R in CREW_LANES.values())
                      or math.hypot(x - SMOKE_SERVICE[0], z - SMOKE_SERVICE[1]) < 1.5 or inside_rect(x, z, {'x_m': (-6.7, -3.7), 'z_m': (3.65, 5.65)}, -0.6)):
            continue
        region = region_of(x, z, A)
        out.append({'x': R3(x), 'z': R3(z), 'region': region, 'from_public_m': R3(dp)})
    return out


def region_of(x, z, A):
    """The area a ground unit stands in (its DMX line and its distro): the stage pen, the far end (behind the paint, z < -31),
    the entry (z > 36), house left (x < -12), house right (x > 12)."""
    if A.in_pen(x, z):
        return 'stage pen'
    if z < -30.0:
        return 'far end'
    if z > 36.0:
        return 'entry'
    return 'house left' if x < -3.75 else 'house right'


PAR_CONE_RINGS = [(1.0 / 3, 8), (2.0 / 3, 16), (1.0, 24)]


def par_cone_rays(p, d, lens=PAR_DESIGN_LENS_DEG):
    """FIX 5 + R2.4: a PAR's beam as a standing eye must fear it: the axis and rings at 1/3, 2/3 and all of its half beam
    (`lens` / 2, 25 deg by default: the worse of the lenses the rental may carry) + PAR_AIM_TOL_DEG (8 + 16 + 24 rays), each
    starting on the lens disc (radius PAR_LENS_R_M) at the same fraction on its own side, so the bundle fills the beam.
    Returns (starts, dirs)."""
    import numpy as np
    import occlusion_lib as O
    half = lens / 2 + PAR_AIM_TOL_DEG
    dirs, ring = O.cone_rays(d, half, PAR_CONE_RINGS)
    a = unit(d)
    frac = [0.0] + [fr for fr, n in PAR_CONE_RINGS for _ in range(n)]
    starts = []
    for u, fr in zip(dirs, frac):
        side = u - a * float(u @ a)
        nrm = float(np.linalg.norm(side))
        starts.append(np.asarray(p, float) + (side / nrm * PAR_LENS_R_M * fr if nrm > 1e-9 else 0.0))
    return np.asarray(starts), dirs


def par_eye_footprint(W, p, d, lens=PAR_DESIGN_LENS_DEG):
    """FIX 5: the plan points where a standing eye (the EYE_YS band, 1.5-1.9 m) would be inside a PAR's beam: every ray of
    par_cone_rays (at `lens`) between the heights 1.5 and 1.9 m, up to its first hit in the room's world (a PA box, a column,
    the roof), 6 samples each. Returns (an (m, 2) array, empty when the beam never crosses the band; the axis's throw)."""
    import numpy as np
    S, D = par_cone_rays(p, d, lens)
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


def desk_limits(head, d, pan=None):
    """FIX 2: one floor head's desk window as data a desk enforces. The base's front faces the aim's azimuth (fixture-lib.mjs
    mountMatrix face), so at the aim pan is 0; tilt is measured from home (straight up, fixture-lib.mjs beamLocal). DMX: 16-bit,
    centre 32768 = home, the maker's 540 / 270 deg range (dmxDecode.js toSixteen), EQUIVALENT until the B380F channel walk."""
    az, el = az_el(d)
    p0, p1 = pan if pan else (-PAN_WIN_DEG, PAN_WIN_DEG)
    t_aim = 90.0 - el
    t_lo = max(0.0, t_aim - TILT_UP_DEG)
    to16 = lambda deg, rng: int(round(min(1.0, max(0.0, deg / rng + 0.5)) * 65535))
    pan_dmx = [to16(p0, 540.0), to16(p1, 540.0)]
    tilt_dmx = sorted([to16(t_lo, 270.0), to16(t_aim, 270.0)])
    return {'base_front_faces_az_deg': R3(az), 'pan_deg_from_home': [R3(p0), R3(p1)], 'tilt_deg_from_home': [R3(t_lo), R3(t_aim)],
            'world_az_deg': [R3((az + p0) % 360), R3((az + p1) % 360)], 'world_el_deg': [R3(el), R3(min(el + TILT_UP_DEG, 89.5))],
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
        self.bay = STAGE_BAY       # A13: the stage pen's barrier takes in the bay (#878); None = the bay left public (the check's 'before')
        self.island = ISLAND_FOH if VARIANT == 'foh-island' else None

    def in_pen(self, x, z):
        """Inside the stage pen's barrier: the pen's rect or its A13 bay."""
        return inside_rect(x, z, self.stage_pen) or (self.bay is not None and inside_rect(x, z, self.bay))

    def fenced(self, x, z):
        """Not public: inside the stage pen's barrier, or (the A5 option only) inside the FOH island."""
        return self.in_pen(x, z) or (self.island is not None and inside_rect(x, z, self.island))

    def public(self, x, z):
        """A place people may stand (FIX 6): painted (hot, wings, bar, chill), not the stage pen (+ its bay), not a fenced pen, not a machine."""
        if self.fenced(x, z) or any(inside_rect(x, z, R) for R in self.pens):
            return False
        if not inside_rect(x, z, HALL_IN):
            return False
        if not (any(self.Z.inside(k, x, z, 0.0) for k in ('hot', 'use', 'bar', 'chill')) or inside_rect(x, z, DOOR_WALK)):
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


def fan_island(A, spread):
    """B's ember fan (FIX 1a): the stage pen's six plane-1 heads as B tuned them and the spread kept them, fixed, not re-aimed."""
    plane1 = sorted([f for f in spread['fixtures'] if f['part'].startswith('plane 1')], key=lambda f: f['p'][0])
    return {'id': 'the stage pen', 'kind': 'stage pen', 'rect': {'x_m': tuple(A.stage_pen['x_m']), 'z_m': tuple(A.stage_pen['z_m'])},
            'slots': [[f['p'][0], f['p'][1] - 0.7 + HEAD_Y, f['p'][2]] for f in plane1], 'slot_ids': [f['id'] for f in plane1],
            'fixed': [{'id': f['id'], 'p': list(f['p']), 'r': list(f['r'])} for f in plane1],
            'crew_only': True, 'why': 'crew only (the DJ, the pit, backstage): B\'s ember fan, the six plane-1 heads where B tuned them (1 m apart around the smoke machine) and with B\'s aims, as the owner saw and kept them on 10-09'}


def beam_slots(A, G, repo='.'):
    """R2: every out-of-crowd floor place a B380F may stand on (out_of_crowd_places at HEAD_REACH_M), each a slot of its own,
    its head HEAD_Y over the floor."""
    out = [{'id': 'slot x %g z %g' % (p['x'], p['z']), 'head': [p['x'], HEAD_Y, p['z']], 'region': p['region'], 'from_public_m': p['from_public_m'],
            'crew': p['region'] == 'stage pen'} for p in out_of_crowd_places(A, G, reach=HEAD_REACH_M, repo=repo)]
    if A.island is not None:                      # the A5 option: the island's own places (0.6 m grid), >= the reach from its sides
        import numpy as np
        I = A.island
        P = [(float(x), float(z)) for x in np.arange(I['x_m'][0] + 0.6, I['x_m'][1] - 0.59, 0.6) for z in np.arange(I['z_m'][0] + 0.6, I['z_m'][1] - 0.59, 0.6)]
        dp = dist_public(A, G, np.asarray(P), rmax=6.0)
        out += [{'id': 'slot x %g z %g (FOH island)' % (R3(x), R3(z)), 'head': [R3(x), HEAD_Y, R3(z)], 'region': region_of(x, z, A), 'from_public_m': R3(d),
                 'crew': False, 'island': I['name']} for (x, z), d in zip(P, dp) if d >= HEAD_REACH_M + 0.18 and not in_corridor(x, z, 0.5, repo)]
    return out


def _toward_public(A, G, x, z):
    """The plan unit vector from (x, z) toward the nearest public feet point (1 m cells), and its distance."""
    import numpy as np
    C = people_cells(A, G)
    d = np.hypot(C[:, 0] - x, C[:, 1] - z)
    k = int(np.argmin(d))
    v = np.array([C[k, 0] - x, C[k, 1] - z])
    n = float(np.linalg.norm(v))
    return (v / n if n > 1e-9 else np.array([0.0, 1.0])), n


def par_candidates_r2(A, G, spread, repo='.'):
    """R2: the PAR places out of the crowd, each with its aims. (a) the column feet whose face stands out of the crowd (every row:
    the wall rows x -36 / +36 and the nave rows x +-12 behind the paint), 0.44 m off the face, leaned 4 deg onto it (v1.1's vista
    bracket); (b) every out-of-crowd floor place (3 m grid, >= PAR_REACH_M from the public floor) aimed straight up into the roof,
    at the nearest column's flared head (6.6 m) when one stands within 9 m, and toward the hall over the crowd's edge (at the roof
    steel 6 m and 10 m in from the place, toward the nearest public floor); near the entry wall also up its face; (c) the stage
    pen's floor (crew only) straight up; (d) the v1.1 embers that stand inside the machines. Whether a place keeps every eye out
    of its beam (at 25 deg) is scored in candidates(), not here."""
    import numpy as np
    a = math.radians(4.05)
    out = []

    def place_ok(x, z):
        dp = float(dist_public(A, G, np.asarray([[x, z]]), rmax=SLOT_MAX_FROM_PUBLIC_M + 1.0)[0])
        ko2 = {'x_m': (ENTRY_LASERS['ko2']['x_m'][0] - 0.5, ENTRY_LASERS['ko2']['x_m'][1] + 0.5), 'z_m': (ENTRY_LASERS['ko2']['z_m'][0] - 0.5, ENTRY_LASERS['ko2']['z_m'][1] + 0.5)}
        return (PAR_REACH_M + 0.18 <= dp <= SLOT_MAX_FROM_PUBLIC_M and inside_rect(x, z, HALL_IN) and not in_corridor(x, z, 0.5, repo)
                and not any(inside_rect(x, z, R) for R in (ko2, ARTISTS_ROUTE, PIT, DOOR_WALK)) and not massing_hits(G, x, z, 0.0, 0.5, 0.2)), dp
    for cx in G['rows_x_m']:
        if cx > 40:
            continue
        for zc in G['column_grid_z_m']:
            faces = {'nave': ([cx - 0.843 * (1 if cx > 0 else -1), PAR_Y, zc], [math.sin(a) * (1 if cx > 0 else -1), math.cos(a), 0.0]),
                     'span': ([cx + 0.843 * (1 if cx > 0 else -1), PAR_Y, zc], [-math.sin(a) * (1 if cx > 0 else -1), math.cos(a), 0.0]),
                     'entry': ([cx, PAR_Y, zc + 0.84], [0.0, math.cos(a), -math.sin(a)]),
                     'stage': ([cx, PAR_Y, zc - 0.84], [0.0, math.cos(a), math.sin(a)])}
            for face, (p, d) in faces.items():
                okp, dp = place_ok(p[0], p[2])
                if not okp:
                    continue
                out.append({'id': 'col %+d z %g, %s face' % (cx, zc, face), 'kind': 'column foot', 'foot': 'col %+d z %s' % (cx, 'joint pair' if abs(zc) < 1 else '%g' % zc),
                            'face': face, 'p': [R3(v) for v in p], 'dir': [R3(v) for v in d], 'part': 'columns', 'colour': EMBER, 'from_public_m': R3(dp),
                            'position': 'floor plate at the %s face of the column x %+d z %g, 0.44 m off it, leaned 4 deg onto it (v1.1 vista bracket), out of the crowd' % (face, cx, zc)})
    for pl in out_of_crowd_places(A, G, step=SLOT_STEP_M, reach=PAR_REACH_M, repo=repo):
        x, z = pl['x'], pl['z']
        if pl['region'] == 'stage pen':
            continue
        if massing_hits(G, x, z, 0.0, 0.5, 0.4):
            continue
        base = {'p': [x, PAR_Y, z], 'region': pl['region'], 'from_public_m': pl['from_public_m']}
        out.append(dict(base, id='floor x %g z %g, up' % (x, z), kind='floor uplight', dir=[0.0, 1.0, 0.0], part='roof', colour=EMBER,
                        position='floor plate at x %g z %g, straight up into the roof steel (out of the crowd, %s)' % (x, z, pl['region'])))
        cs = [(cx_, cz_) for cx_ in G['rows_x_m'] for cz_ in G['column_grid_z_m'] if math.hypot(cx_ - x, cz_ - z) <= 9.0 and cx_ <= 40]
        if cs:
            cx_, cz_ = min(cs, key=lambda c: math.hypot(c[0] - x, c[1] - z))
            hx = cx_ + (0.95 if x > cx_ else -0.95)
            d = unit(np.asarray([hx, 6.6, cz_]) - np.asarray([x, PAR_Y, z]))
            out.append(dict(base, id='floor x %g z %g, to the column head x %g z %g' % (x, z, cx_, cz_), kind='floor to column head', dir=[R3(v) for v in d],
                            part='columns', colour=EMBER, position='floor plate at x %g z %g, aimed at the flared head of the column x %+d z %g (6.6 m)' % (x, z, cx_, cz_)))
        v, dn = _toward_public(A, G, x, z)
        for inward in (6.0, 10.0):
            tgt = [x + v[0] * inward, 10.8, z + v[1] * inward]
            d = unit(np.asarray(tgt) - np.asarray([x, PAR_Y, z]))
            out.append(dict(base, id='floor x %g z %g, to the hall %g m' % (x, z, inward), kind='floor to the hall', dir=[R3(v_) for v_ in d], part='roof', colour=EMBER,
                            position='floor plate at x %g z %g, aimed at the roof steel %g m in toward the crowd (%s)' % (x, z, inward, pl['region'])))
        if z > HALL_IN['z_m'][1] - 4.0:
            d = unit(np.asarray([x, 8.0, 53.8]) - np.asarray([x, PAR_Y, z]))
            out.append(dict(base, id='floor x %g z %g, up the entry wall' % (x, z), kind='entry wall', dir=[R3(v_) for v_ in d], part='entry wall', colour=EMBER,
                            position='floor plate at x %g z %g, washing up the entry wall (house right of the bar, out of the crowd)' % (x, z)))
    sp = A.stage_pen
    for x, z in ((-10.0, -7.0), (-7.0, -7.0), (-1.0, -7.0), (1.0, -7.0), (-10.0, -1.0), (1.0, -1.0), (-7.5, -0.5), (-2.0, -0.5)):
        if inside_rect(x, z, FAN_STRIP, -0.6) or math.hypot(x - SMOKE_SERVICE[0], z - SMOKE_SERVICE[1]) < 1.5 or massing_hits(G, x, z, 0.0, 0.5, 0.3):
            continue
        if any(float(_rect_gap(np.asarray([x]), np.asarray([z]), R)[0]) < CREW_GAP_M + 0.6 for R in CREW_LANES.values()):
            continue
        out.append({'id': 'stage pen x %g z %g' % (x, z), 'kind': 'stage pen uplight', 'p': [x, PAR_Y, z], 'dir': [0.0, 1.0, 0.0], 'part': 'roof', 'colour': EMBER, 'region': 'stage pen',
                    'position': 'the stage pen\'s floor (crew only) at x %g z %g, straight up into the roof steel over the stage' % (x, z)})
    for f in spread['fixtures']:
        if f['part'] == 'embers' and f['p'][1] <= GROUND_MAX_Y:
            out.append({'id': 'ember %s' % f['id'], 'kind': 'ember', 'p': list(f['p']), 'dir': [R3(v) for v in aim_dir(f['r'])], 'part': 'embers', 'region': 'machine',
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


def legal(W, A, head, slot, D, EF):
    """R2: every direction of D that passes the beam rules, with its throw, end and low run. EF: the public eyes (R2.3: every
    public place and the lean band at the EYE_YS heights). The window (FIX 2): its low run (R2.2) at the tilt limit for every
    pan of WINDOW_PANS; its glare (the public, the nine eyes, the DJ) for every pan x WINDOW_TILTS; the aim's own end here (the
    window's ends: window_ends_ok, on the short list in slot_options; every pan x tilt again in the build)."""
    import numpy as np
    head = np.asarray(head, float)
    crew = bool(slot.get('crew'))
    named = np.asarray(list(EYES.values()) + [DJ_EYE], float)
    pre = []
    for d in D:
        d = np.asarray(d, float)
        if len(EF) and float(field_glare(head, d[None, :], EF)[0]) < GLARE_DEG:
            continue
        if not low_run_r2(A, A.G, head, d, 120.0, crew)['ok']:
            continue                                         # the aim alone first: the window only for an aim that passes
        pw = run_window_r2(A, A.G, head, d, 120.0, crew)
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
                     'low_run_m': pw['r30'], 'low_run_hand_m': pw['r28'], 'public_gap_m': pw['public_gap_m'],
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


def slot_options(W, A, F, head, slot, EF, n_keep=3, deep=False):
    import numpy as np
    rows = legal(W, A, head, slot, coarse_dirs(), EF)
    for r in rows:
        r['proxy'] = objective(beam_G(W, F, head, r['d'], r['t'], step=3.0, occlude=False))
    top = distinct(rows, 4, 10.0, lambda r: r['proxy'])
    D1 = []
    for r in top:
        az, el = az_el(r['d'])
        D1 += [dir_of(az + da, el + de) for da in (-6, -3, 0, 3, 6) for de in (-3, -1.5, 0, 1.5, 3) if (da or de) and 30 <= el + de <= 85]
    if D1:
        more = legal(W, A, head, slot, np.array(D1), EF)
        for r in more:
            r['proxy'] = objective(beam_G(W, F, head, r['d'], r['t'], step=3.0, occlude=False))
        rows += more
    # The short list: the best aims by the proxy, 5 deg apart, each checked over its window's ends, the first 5 that pass scored and
    # ring-checked. FALLBACK (2026-10-10 evening, deep=True, used only for slots the first pass left with no option): the list goes
    # on to 40 aims and up to 12 scored, until one passes the ring check. The rules are the same; only the search goes deeper.
    short = distinct(rows, 40 if deep else 14, 5.0, lambda r: r['proxy'])
    cand = []
    for r in short:
        ok, _ = window_ends_ok(W, A, head, r['d'])
        if not ok:
            continue
        r['G'] = beam_G(W, F, head, r['d'], r['t'], step=2.0, occlude=True)
        r['score'] = objective(r['G'])
        r['ring_ok'], r['ring_why'], r['ring_ends'] = ring_check(W, A, head, r['d'])
        cand.append(r)
        if len(cand) >= 5 and (not deep or any(c['ring_ok'] for c in cand)):
            break
        if len(cand) >= 12:
            break
    opts = distinct([r for r in cand if r['ring_ok']], n_keep, 10.0, lambda r: r['score'])
    keys = ('ends_on', 'end', 'low_run_m', 'low_run_hand_m', 'public_gap_m', 'field_glare_min_deg', 'named_glare_min_deg', 'window', 'crew_ok')
    return [dict({'dir': [R3(v) for v in r['d']], 'az_el': list(az_el(r['d'])), 'throw_m': R3(r['t']), 'ring_ends': r['ring_ends'], 'G': r['G'].tolist(),
                  'score': R3(r['score'])}, **{k: r[k] for k in keys}) for r in opts], len(rows)


RULES = ('%s: out of the crowd (heads %.1f m from the public floor, low runs %.1f m from it), window pan +-%g (every %g) / tilt +%g, aim tol %g deg, '
         'lens %.2f m, dense glare at %s m on a %.1f m grid + the %.1f m lean band, #873 strip, artists\' route') % (
    ROUND, HEAD_REACH_M, BARRIER_REACH_M, PAN_WIN_DEG, WINDOW_STEP_DEG, TILT_UP_DEG, AIM_TOL_DEG, APERTURE_R_M, '/'.join('%g' % y for y in EYE_YS), FIELD_STEP_M, LEAN_M)
PAR_RULES = '%s: out of the crowd (%.1f m), eye footprints at %g deg (lean %.1f m, rings 8/16/24, lens %.3f m, aim tol %g deg), crowd-aware scores, the door walkway public' % (
    ROUND, PAR_REACH_M, PAR_DESIGN_LENS_DEG, LEAN_M, PAR_LENS_R_M, PAR_AIM_TOL_DEG)
CANDIDATES = 'candidates-r2.json'           # round 2 (2026-10-10 evening); round 1's candidates*.json are kept beside it


def candidates(repo, out, only=None):
    """Score every candidate (heavy): the PAR places (their eye light, R2.4's eye footprint at 25 deg and its gap to the public
    floor, the pool) and every beam slot (its legal aims and their G; B's fan: its six fixed heads' G). Resumes from
    <out>/CANDIDATES (a record made under other rules is scored again). only = 'pars' or 'beams' scores one half."""
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
        C['pars'] = {}
    if C.get('rules') != RULES:
        C['slots'] = {}
        C['fan'] = None
    C['par_rules'] = PAR_RULES
    w, wt = eye_weights(A, G)
    set_eye_weights(w)
    C.update({'what': 'MOXIR v2 ground, round 2: every out-of-crowd candidate, scored from the audience\'s eyes (moxir_v2_ground.py candidates)', 'date': DATE,
              'eyes': EYES, 'eye_weights': wt, 'depth_bins': DEPTH_NAMES, 'haze': {'state': 't40', 'fill_per_m': F['fill']}, 'rules': RULES})
    C.setdefault('pars', {})
    C.setdefault('slots', {})

    def save():
        tmp = path + '.tmp'
        json.dump(C, open(tmp, 'w'), indent=1, default=JD)
        os.replace(tmp, path)
    P_pub, _ = public_index(A, G)
    if only in (None, 'pars'):
        pc = par_candidates_r2(A, G, spread, repo)
        todo = [c for c in pc if c['id'] not in C['pars']]
        print('PAR places: %d (%d to score)' % (len(pc), len(todo)), file=sys.stderr, flush=True)
        for i, c in enumerate(todo):
            if i % 25 == 0:
                S.wait_cool()
                save()
            d = unit(c['dir'])
            fp, throw = par_eye_footprint(W, c['p'], d, PAR_DESIGN_LENS_DEG)
            gap = footprint_gap(fp, P_pub)
            rec = dict(c, eye_fp_gap_m=R3(gap) if np.isfinite(gap) else None, throw_m=R3(throw), pool=[R3(v) for v in (np.asarray(c['p']) + d * throw)])
            if np.isfinite(gap) and gap < LEAN_M and c['kind'] != 'ember':
                rec.update(E=None, score=0.0, refused='an eye at 1.5-1.9 m within %.1f m of its %g deg beam (gap %.2f m)' % (LEAN_M, PAR_DESIGN_LENS_DEG, gap))
            else:
                E, info = par_eye_light(W, c['p'], d, A=A)
                rec.update(E=E.tolist(), score=R3(objective(E)), **info)
                if np.isfinite(gap) and gap < LEAN_M:
                    rec['refused'] = 'an eye at 1.5-1.9 m within %.1f m of its %g deg beam (gap %.2f m)' % (LEAN_M, PAR_DESIGN_LENS_DEG, gap)
            C['pars'][c['id']] = rec
        save()
    if only in (None, 'beams', 'empty'):
        if not C.get('fan'):
            I = fan_island(A, spread)
            rec = dict(I, slot_options=[])
            for fx in I['fixed']:
                head = np.array([fx['p'][0], fx['p'][1] - 0.7 + HEAD_Y, fx['p'][2]])
                d = aim_dir(fx['r'])
                t, nm, cl, _ = cast_full(WF, head, d[None, :], reach=120.0)
                tk = float(t[0]) if np.isfinite(t[0]) else 120.0
                Gm = beam_G(WF, F, head, d, tk, step=2.0, occlude=True)
                rec['slot_options'].append([{'dir': [R3(v) for v in d], 'az_el': list(az_el(d)), 'throw_m': R3(tk), 'ends_on': nm[0], 'end_cls': cl[0],
                                             'G': Gm.tolist(), 'score': R3(objective(Gm)), 'fixed_from': fx['id']}])
            C['fan'] = rec
            save()
        slots = beam_slots(A, G, repo)
        EF = public_eyes(A, G, step=FIELD_STEP_M)
        if only == 'empty':
            for sid in [k for k, v in C['slots'].items() if not v['options']]:
                del C['slots'][sid]
        todo = [s_ for s_ in slots if s_['id'] not in C['slots'] and (A.island is None or s_.get('island'))]   # the A5 option scores its island only
        print('beam slots: %d (%d to score), public eyes %d' % (len(slots), len(todo), len(EF)), file=sys.stderr, flush=True)
        for i, s_ in enumerate(todo):
            if i % 5 == 0:
                S.wait_cool()
            opts, n_legal = slot_options(W, A, F, np.asarray(s_['head'], float), s_, EF, deep=(only == 'empty'))
            C['slots'][s_['id']] = dict(s_, options=opts, legal_dirs=n_legal, **({'search': 'deep'} if only == 'empty' else {}))
            if i % 5 == 4:
                save()
            print('%-22s %-12s legal %4d  best %s' % (s_['id'], s_['region'], n_legal, opts[0]['score'] if opts else '-'), file=sys.stderr, flush=True)
        save()
    print('candidates -> %s' % path)


# ====================================================================== selection (R2)
def band_of(z):
    return next(n for n, a, b in BEAM_BANDS if a <= z < b)


def pick_beams_r2(C, cells, target, n=12):
    """R2: B's fan (fixed), then n heads, one aim per slot, heads >= BEAM_MIN_SPACING_M apart. Three phases: (1) COVER: until every
    painted cell (hot + wings, not the bar or chill) has a beam base within BEAM_COVER_R_M and every 12 m z band holds a base: the
    option that covers the most still-uncovered cells (an empty band counts as 1000 cells; ties: the eye objective); (2) THE ENTRY
    END: while an entry-side eye (ENTRY_EYES) sees less beam glow than `target` (the spread's peak at equal colours, divided by
    the peak cap), the option that fills most of the eyes' shortfalls (each eye's share capped at its shortfall); (3) the eye
    objective. Returns (heads, totals, phases)."""
    import numpy as np
    names = list(EYES)
    ei = [names.index(e) for e in ENTRY_EYES]
    tot = np.zeros((len(EYES), len(DEPTH_NAMES)))
    heads = []
    fan = C['fan']
    for si, opts in enumerate(fan['slot_options']):
        o = opts[0]
        g = objective(tot + np.asarray(o['G'])) - objective(tot)
        tot = tot + np.asarray(o['G'])
        heads.append(dict(o, island='the stage pen', slot_id=fan['slot_ids'][si], head=fan['slots'][si], gain=R3(g), phase='fixed', region='stage pen'))
    opts = [dict(o, slot=sid, head=s_['head'], region=s_['region'], crew=s_.get('crew')) for sid, s_ in C['slots'].items() for o in s_['options']]
    covered = np.zeros(len(cells), bool)
    bands = {b[0]: 0 for b in BEAM_BANDS}
    for h in heads:
        covered |= np.hypot(cells[:, 0] - h['head'][0], cells[:, 1] - h['head'][2]) <= BEAM_COVER_R_M
        bands[band_of(h['head'][2])] += 1
    reach = {i: np.hypot(cells[:, 0] - o['head'][0], cells[:, 1] - o['head'][2]) <= BEAM_COVER_R_M for i, o in enumerate(opts)}
    phase, phases = 'cover', []
    while len(heads) < STAGE_PEN_HEADS + n:
        base = objective(tot)
        used = {h.get('slot') for h in heads}
        best, bk = None, None
        for i, o in enumerate(opts):
            if o['slot'] in used or any(math.hypot(o['head'][0] - h['head'][0], o['head'][2] - h['head'][2]) < BEAM_MIN_SPACING_M for h in heads):
                continue
            Gm = np.asarray(o['G'])
            g = objective(tot + Gm) - base
            if phase == 'cover':
                newc = int(np.sum(reach[i] & ~covered)) + (1000 if bands[band_of(o['head'][2])] == 0 else 0)
                if newc == 0:
                    continue
                k = (newc, g)
            elif phase == 'entry':
                have = tot.sum(axis=1)
                short = np.maximum(np.asarray(target) - have[ei], 0.0)
                if not short.any():
                    break
                fill = float(np.sum(np.minimum(Gm.sum(axis=1)[ei], short) / np.maximum(np.asarray(target), 1e-12)))
                if fill <= 0:
                    continue
                k = (fill, g)
            else:
                k = (g,)
            if bk is None or k > bk:
                best, bk = i, k
        if best is None or (phase == 'entry' and not np.any(np.maximum(np.asarray(target) - tot.sum(axis=1)[ei], 0.0))):
            if phase == 'cover':
                phase = 'entry'
                continue
            if phase == 'entry':
                phase = 'eyes'
                continue
            break
        o = opts[best]
        g = objective(tot + np.asarray(o['G'])) - objective(tot)
        tot = tot + np.asarray(o['G'])
        covered |= reach[best]
        bands[band_of(o['head'][2])] += 1
        heads.append(dict(o, gain=R3(g), phase=phase))
        phases.append(phase)
    return heads, tot, {'phases': phases, 'bands': bands, 'uncovered_cells': int((~covered).sum())}


def pick_pars_r2(C, n, spacing, fixed, cells, target, allowed):
    """R2: n hall PARs under the spacing rule (fixed units first, their own spacing not counted). Three phases, as the beams:
    (1) COVER (Church & ReVelle 1974, the maximal covering location greedy): each pick the lamp whose POOL (where its axis lands)
    brings the most still-uncovered painted cells within PAR_COVER_R_M (ties: the eye objective), among lamps that light
    something an eye sees; (2) THE ENTRY END: while an entry-side eye gets less PAR light than `target`, the lamp that fills most of
    the shortfalls; (3) the eye objective."""
    import numpy as np
    names = list(EYES)
    ei = [names.index(e) for e in ENTRY_EYES]
    tot = np.zeros((len(EYES), len(DEPTH_NAMES)))
    for f in fixed:
        if f.get('E') is not None:
            tot += np.asarray(f['E'])
    chosen = [dict(f) for f in fixed]
    cands = [c for c in C['pars'].values() if c.get('E') is not None and allowed(c)]
    pool = np.asarray([[c['pool'][0], c['pool'][2]] for c in cands], float)
    reach = np.hypot(cells[:, None, 0] - pool[None, :, 0], cells[:, None, 1] - pool[None, :, 1]) <= PAR_COVER_R_M
    covered = np.zeros(len(cells), bool)
    phase = 'cover'
    while len(chosen) < n + len(fixed):
        base = objective(tot)
        have = {o.get('id') for o in chosen}
        bi, bk = None, None
        short = np.maximum(np.asarray(target) - tot.sum(axis=1)[ei], 0.0)
        for i, c in enumerate(cands):
            if c['id'] in have or any(math.hypot(c['p'][0] - o['p'][0], c['p'][2] - o['p'][2]) < spacing - 1e-9 for o in chosen[len(fixed):]):
                continue
            if any(math.hypot(c['p'][0] - o['p'][0], c['p'][2] - o['p'][2]) < 1.0 for o in chosen[:len(fixed)]):
                continue
            E = np.asarray(c['E'])
            g = objective(tot + E) - base
            if phase == 'cover':
                if c['score'] <= 0:
                    continue
                newc = int(np.sum(reach[:, i] & ~covered))
                if newc == 0:
                    continue
                k = (newc, g)
            elif phase == 'entry':
                if not short.any():
                    break
                fill = float(np.sum(np.minimum(E.sum(axis=1)[ei], short) / np.maximum(np.asarray(target), 1e-12)))
                if fill <= 0:
                    continue
                k = (fill, g)
            else:
                k = (g,)
            if bk is None or k > bk:
                bi, bk = i, k
        if bi is None or (phase == 'entry' and not short.any()):
            if phase == 'cover':
                phase = 'entry'
                continue
            if phase == 'entry':
                phase = 'eyes'
                continue
            break
        c = cands[bi]
        chosen.append(dict(c, gain=R3(objective(tot + np.asarray(c['E'])) - base), phase=phase))
        tot += np.asarray(c['E'])
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


# ====================================================================== R2.6: the official patch, the cable router, power and DMX lines
def _natural(s):
    import re
    return [int(t) if t.isdigit() else t for t in re.split(r'(\d+)', s)]


def plan_addresses(repo, fixtures, plan=None):
    """A1 / R2.6: every unit's address from the official v2 patch (scripts/place/rigs/moxir-v2-patch-2026-10-09.json, #872, owner
    N460.2), as src/rigbuild/patchPlan.js lays it: per universe, per block in order, the lamps the block selects (type; group =
    ids '<group>-NN') walked by unit id (natural order: id-asc), from the block's start, each its mode's footprint, fixture
    numbers from the block's first. Lamps the plan keeps off DMX (the cubes) get none. Returns ({id: dmx}, the plan, the blocks
    whose lamps are not in this rig (the two UP-LA40WF of #873))."""
    import re
    P = plan if plan is not None else json.load(open(os.path.join(repo, PATCH_PLAN)))
    out, absent = {}, []
    for u in P['universes']:
        for b in u['blocks']:
            sel = b['select']
            rx = re.compile('^%s-\\d+$' % re.escape(sel['group'])) if sel.get('group') else None
            mine = sorted([f for f in fixtures if f['type'] == sel['type'] and (rx is None or rx.match(f['id']))], key=lambda f: _natural(f['id']))
            fp = int(re.match(r'(\d+)', P['modes'][sel['type']]['crew']).group(1))
            if not mine:
                absent.append({'universe': u['universe'], 'block': b['name'], 'start': b['start'], 'units': b.get('units'), 'footprint': fp})
                continue
            if b.get('units') is not None and len(mine) != b['units']:
                raise SystemExit('the patch block "%s" expects %d units, the rig has %d' % (b['name'], b['units'], len(mine)))
            for k, f in enumerate(mine):
                out[f['id']] = {'universe': u['universe'], 'address': b['start'] + k * fp, 'footprint': fp, 'fixture': b['fixture'] + k,
                                'mode': P['modes'][sel['type']]['crew'], 'port': u.get('port'), 'from': 'the v2 patch (%s, %s)' % (os.path.basename(PATCH_PLAN), b['name'])}
    return out, P, absent


def plan_with_counts(repo, fixtures):
    """#880 / #882: a copy of the official v2 patch (PATCH_PLAN) whose group blocks ('<group>-NN') carry THIS fixture list's counts.
    The official file carries the show rig's counts (cut 11 / planes 39 after 9cfc8ee7: planes-25 became cut-11 on the cranes);
    the ground layer still has cut 10 / planes 40, so each rig lays the same plan with its own counts and records them. Returns
    (plan copy, {group: count}). Limit, stated: addresses are walked by unit id from the block's start, so a layer whose count
    differs from the show rig's puts the units after the moved one on other addresses; the show patch is the composed rig's."""
    import copy, re
    P = copy.deepcopy(json.load(open(os.path.join(repo, PATCH_PLAN))))
    counts = {}
    for u in P['universes']:
        for b in u['blocks']:
            sel = b['select']
            if not sel.get('group'):
                continue
            rx = re.compile('^%s-\\d+$' % re.escape(sel['group']))
            n = sum(1 for f in fixtures if f['type'] == sel['type'] and rx.match(f['id']))
            counts[sel['group']] = n
            if b.get('units') is not None and n and n != b['units']:
                b['units'] = n
    return P, counts


class Router:
    """The cable router (R2 / A9): a 1 m grid inside the walls; a step costs its length on non-public floor and PUBLIC_COST x its
    length on public floor (and on the artists' route), never through a machine, a column or #873's tower pen. Dijkstra from a
    source over the whole grid (8 neighbours); paths along the walls and the column rows come out of the cost, not a rule."""

    def __init__(self, A, G):
        import numpy as np
        self.x0, self.z0 = HALL_IN['x_m'][0], HALL_IN['z_m'][0]
        self.nx = int(math.floor(HALL_IN['x_m'][1] - self.x0))
        self.nz = int(math.floor(HALL_IN['z_m'][1] - self.z0))
        xs = self.x0 + 0.5 + np.arange(self.nx)
        zs = self.z0 + 0.5 + np.arange(self.nz)
        P, _ = public_index(A, G)
        pub = np.zeros((self.nx, self.nz), bool)
        ix = np.clip(np.floor(P[:, 0] - self.x0).astype(int), 0, self.nx - 1)
        iz = np.clip(np.floor(P[:, 1] - self.z0).astype(int), 0, self.nz - 1)
        pub[ix, iz] = True
        self.public = pub
        self.walk = np.zeros((self.nx, self.nz), bool)
        self.block = np.zeros((self.nx, self.nz), bool)
        ko2 = ENTRY_LASERS['ko2']
        for i, x in enumerate(xs):
            for k, z in enumerate(zs):
                if massing_hits(G, x, z, 0.0, 0.3, -0.2) or near_column(G, x, z, 0.3) or inside_rect(x, z, {'x_m': ko2['x_m'], 'z_m': ko2['z_m']}):
                    self.block[i, k] = True
                if inside_rect(x, z, ARTISTS_ROUTE):
                    self.walk[i, k] = True
        self.cost = np.where(pub | self.walk, PUBLIC_COST, 1.0)
        self._trees = {}

    def cell(self, x, z):
        return (min(max(int(math.floor(x - self.x0)), 0), self.nx - 1), min(max(int(math.floor(z - self.z0)), 0), self.nz - 1))

    def free_cell(self, x, z):
        """The cell of plan point (x, z), or the nearest unblocked cell when a unit stands against a machine or a column (the
        last metre is a drop along that body, counted in the run's length by the caller)."""
        i, k = self.cell(x, z)
        if not self.block[i, k]:
            return (i, k)
        best = None
        for r in range(1, 6):
            for j in range(i - r, i + r + 1):
                for m in range(k - r, k + r + 1):
                    if 0 <= j < self.nx and 0 <= m < self.nz and not self.block[j, m]:
                        d = math.hypot(self.x0 + 0.5 + j - x, self.z0 + 0.5 + m - z)
                        if best is None or d < best[0]:
                            best = (d, (j, m))
            if best:
                return best[1]
        raise SystemExit('no free cell near %s' % ((x, z),))

    def tree(self, src):
        import heapq
        key = self.free_cell(src[0], src[1])
        if key in self._trees:
            return self._trees[key]
        dist = {key: 0.0}
        prev = {}
        h = [(0.0, key)]
        steps = [(1, 0, 1.0), (-1, 0, 1.0), (0, 1, 1.0), (0, -1, 1.0), (1, 1, 1.4142), (1, -1, 1.4142), (-1, 1, 1.4142), (-1, -1, 1.4142)]
        while h:
            d, (i, k) = heapq.heappop(h)
            if d > dist.get((i, k), 1e18):
                continue
            for di, dk, L in steps:
                j, m = i + di, k + dk
                if not (0 <= j < self.nx and 0 <= m < self.nz) or self.block[j, m]:
                    continue
                nd = d + L * 0.5 * (self.cost[i, k] + self.cost[j, m])
                if nd < dist.get((j, m), 1e18):
                    dist[(j, m)] = nd
                    prev[(j, m)] = (i, k)
                    heapq.heappush(h, (nd, (j, m)))
        self._trees[key] = (dist, prev)
        return self._trees[key]

    def route(self, a, b):
        """The cheapest run from plan point a to plan point b: {pts (cell centres, simplified), length_m, public_m, public_cells}."""
        dist, prev = self.tree(a)
        k = self.free_cell(b[0], b[1])
        if k not in dist:
            raise SystemExit('no cable route from %s to %s' % (a, b))
        path = [k]
        while path[-1] in prev:
            path.append(prev[path[-1]])
        path.reverse()
        pts = [(self.x0 + 0.5 + i, self.z0 + 0.5 + m) for i, m in path]
        L, pubL, cells = 0.0, 0.0, []
        for (i, m), (j, n) in zip(path, path[1:]):
            s = math.hypot(j - i, n - m)
            L += s
            if self.public[i, m] or self.public[j, n] or self.walk[i, m] or self.walk[j, n]:
                pubL += s
                cells.append((j, n))
        simp = [pts[0]]
        for q0, q1, q2 in zip(pts, pts[1:], pts[2:]):
            if (q1[0] - q0[0], q1[1] - q0[1]) != (q2[0] - q1[0], q2[1] - q1[1]):
                simp.append(q1)
        if len(pts) > 1:
            simp.append(pts[-1])
        L += math.hypot(a[0] - pts[0][0], a[1] - pts[0][1]) + math.hypot(b[0] - pts[-1][0], b[1] - pts[-1][1])
        return {'pts': [[R3(a[0]), R3(a[1])]] + [[R3(x), R3(z)] for x, z in simp] + [[R3(b[0]), R3(b[1])]], 'length_m': L, 'public_m': pubL, 'public_cells': cells}

    def crossings(self, cells):
        """The public stretches of one run: maximal runs of consecutive public cells, each with its length (ramp sections)."""
        out, cur = [], []
        for c in cells:
            if cur and max(abs(c[0] - cur[-1][0]), abs(c[1] - cur[-1][1])) > 1:
                out.append(cur)
                cur = []
            cur.append(c)
        if cur:
            out.append(cur)
        return [{'from': [R3(self.x0 + 0.5 + s[0][0]), R3(self.z0 + 0.5 + s[0][1])], 'to': [R3(self.x0 + 0.5 + s[-1][0]), R3(self.z0 + 0.5 + s[-1][1])], 'length_m': len(s)} for s in out]


def stock(length_m, sticks):
    """A run's stock cables: the fewest sticks of the stock lengths whose sum covers length_m (largest first, then the smallest
    one that closes the rest). Returns (the list, their total)."""
    out, left = [], length_m
    for s in sticks:
        while left > s:
            out.append(s)
            left -= s
    if left > 0:
        out.append(next(s for s in sorted(sticks) if s >= left))
    return out, sum(out)


DISTRO_OF = {'stage pen': 'D-STAGE', 'house left': 'D-LEFT', 'house right': 'D-RIGHT', 'far end': 'D-FAR', 'entry': 'D-ENTRY'}
# The entry end (2026-10-10 fix): DISTRO_OF sent every entry unit to D-ENTRY (house right), so the house-left entry PARs were fed
# round the whole hall (one leg 213 m, the router keeps cables off the door walkway and #873's strip). Each entry unit now takes
# the nearer of these by route.
ENTRY_FEEDS = ('D-ENTRY', 'D-LEFT')
ENTRY_NODES = ('NODE-RIGHT', 'NODE-LEFT')
NODE_OF = {'stage pen': 'NODE-STAGE', 'house left': 'NODE-LEFT', 'house right': 'NODE-RIGHT', 'far end': 'NODE-FAR', 'entry': 'NODE-RIGHT'}
FEEDERS = [('D-LEFT', 'D-STAGE'), ('D-LEFT', 'D-FAR'), ('D-FAR', 'D-RIGHT'), ('D-RIGHT', 'D-ENTRY')]       # the board ASSUMED at D-LEFT (its place owed)
NETWORK = [('CONTROL', 'NODE-STAGE'), ('NODE-STAGE', 'NODE-LEFT'), ('NODE-LEFT', 'NODE-FAR'), ('NODE-FAR', 'NODE-RIGHT')]


def unit_region(f, A):
    if f['part'].startswith('cut') or f['type'] == 'up-yz31p':
        return 'stage pen'
    if f.get('region') == 'machine':
        return 'machine'
    return region_of(f['p'][0], f['p'][2], A)


def circuits_r2(units, A, RT, extra=()):
    """R2 power: each unit on a 16 A radial from its area's distro (DISTROS_R2; an ember in a machine from the nearest by route),
    one kind per circuit, <= CIRCUIT_W and <= 5 % volt drop (2.5 mm2, else 4 mm2; BS 7671 Table 4D2B 18 / 11 mV/A/m), the chain
    distro -> nearest unit -> next ALONG THE ROUTER'S RUNS (each leg + CABLE_SLACK_M). Every leg's run, its public metres, its
    stock cables. extra: circuits planned elsewhere (the cubes' C-LASER) that still take a phase."""
    sites = DISTROS_R2
    by = {}
    for u in units:
        reg = unit_region(u, A)
        if reg == 'machine':
            dist = min(sites, key=lambda k: RT.route((sites[k][0], sites[k][2]), (u['p'][0], u['p'][2]))['length_m'])
        elif reg == 'entry':          # the entry end is split by the door walkway: each unit from the nearer of D-ENTRY / D-LEFT by route
            dist = min(ENTRY_FEEDS, key=lambda k: RT.route((sites[k][0], sites[k][2]), (u['p'][0], u['p'][2]))['length_m'])
        else:
            dist = DISTRO_OF[reg]
        kind = 'smoke' if u['type'] == 'up-yz31p' else ('beams' if u['type'] == 'up-b380f' else ('truss' if u['part'].startswith('cut') else 'pars'))
        by.setdefault((dist, kind), []).append(u)

    def chain_of(g, s):
        pts, at, chain = list(g), (s[0], s[2]), []
        while pts:
            rs = [RT.route(at, (q['p'][0], q['p'][2])) for q in pts]
            k = min(range(len(pts)), key=lambda j: rs[j]['length_m'])
            q = pts.pop(k)
            chain.append((rs[k]['length_m'] + q['p'][1] + CABLE_SLACK_M, q, rs[k]))
            at = (q['p'][0], q['p'][2])
        return chain

    def vd(chain, mv):
        left, v = sum(POWER_W[q['type']] for _, q, _ in chain), 0.0
        for seg, q, _ in chain:
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
    for (dist, kind), us in sorted(by.items()):
        s = sites[dist]
        groups, cur = [], []
        for u in sorted(us, key=lambda u: RT.route((s[0], s[2]), (u['p'][0], u['p'][2]))['length_m']):
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
            legs = [{'to': q['id'], 'run_m': R3(seg), 'public_m': R3(r['public_m']), 'stock_m': stock(seg, STOCK_POWER_M)[0]} for seg, q, r in ch]
            out.append({'circuit': 'C%02d' % n, 'distro': dist, 'kind': kind, 'units': [q['id'] for _, q, _ in ch], 'load_w': w,
                        'amps_230v': round(w / 230.0, 1), 'cable_m': round(sum(c for c, _, _ in ch), 1), 'first_run_m': round(ch[0][0], 1),
                        'cable_mm2': mm2, 'vdrop_pct': round(pct, 1), 'ok': w <= CIRCUIT_W and pct <= 5.0, 'legs': legs,
                        'public_m': R3(sum(r['public_m'] for _, _, r in ch)), '_cells': [c for _, _, r in ch for c in r['public_cells']],
                        'route': [p for _, _, r in ch for p in r['pts']]})
    allc = out + [dict(c) for c in extra]
    ph = {'L1': 0, 'L2': 0, 'L3': 0}
    for c in sorted(allc, key=lambda c: -c['load_w']):
        k = min(ph, key=ph.get)
        c['phase'] = k
        ph[k] += c['load_w']
    return allc, ph


def lines_r2(units, A, RT, absent=()):
    """R2.6 DMX lines: one line per area (its node, NODES_R2) and universe (port A = U1, port B = U2), <= DMX_MAX_DEVICES devices
    (ANSI E1.11 / EIA-485: 32 unit loads, 4 kept spare); a fuller area splits into -a / -b (a splitter output). Each line's daisy
    chain node -> nearest unit -> next along the router's runs, a 120 ohm terminator after its last unit. `absent`: the patch's
    lamps not in this rig (#873's two lasers): their line is listed from NODE-LEFT to the tower. Sets every unit's dmx line /
    node / port. Returns the lines."""
    import numpy as np
    by = {}
    for u in units:
        reg = unit_region(u, A)
        if reg == 'machine':
            reg = min(('house left', 'house right', 'stage pen'), key=lambda r: RT.route((NODES_R2[NODE_OF[r]][0], NODES_R2[NODE_OF[r]][2]), (u['p'][0], u['p'][2]))['length_m'])
        node = NODE_OF[reg]
        if reg == 'entry':            # as the power: the nearer node by route (the door walkway splits the entry end)
            node = min(ENTRY_NODES, key=lambda k: RT.route((NODES_R2[k][0], NODES_R2[k][2]), (u['p'][0], u['p'][2]))['length_m'])
        by.setdefault((node, reg, u['dmx']['universe']), []).append(u)
    out = []
    for (node, reg, uni), us in sorted(by.items()):
        s = NODES_R2[node]
        parts = [us] if len(us) <= DMX_MAX_DEVICES else [sorted(us, key=lambda u: u['p'][2])[:len(us) // 2], sorted(us, key=lambda u: u['p'][2])[len(us) // 2:]]
        for k, grp in enumerate(parts):
            pts, at, legs, cells, route = list(grp), (s[0], s[2]), [], [], [[R3(s[0]), R3(s[2])]]
            while pts:
                rs = [RT.route(at, (q['p'][0], q['p'][2])) for q in pts]
                j = min(range(len(pts)), key=lambda i: rs[i]['length_m'])
                q, r = pts.pop(j), rs[j]
                run = r['length_m'] + q['p'][1] + CABLE_SLACK_M
                legs.append({'to': q['id'], 'run_m': R3(run), 'public_m': R3(r['public_m']), 'stock_m': stock(run, STOCK_DMX_M)[0]})
                cells += r['public_cells']
                route += r['pts'][1:]
                at = (q['p'][0], q['p'][2])
            name = '%s-%s%s' % (node, 'A' if uni == 1 else 'B', ('-' + 'ab'[k]) if len(parts) > 1 else '')
            for q in grp:
                q['dmx'].update({'line': name, 'node': node, 'port': 'A' if uni == 1 else 'B'})
            out.append({'line': name, 'node': node, 'port': 'A' if uni == 1 else 'B', 'universe': uni, 'area': reg, 'devices': len(grp),
                        'units': [l['to'] for l in legs], 'cable_m': R3(sum(l['run_m'] for l in legs)), 'public_m': R3(sum(l['public_m'] for l in legs)),
                        'legs': legs, 'route': route, '_cells': cells, 'terminator': '120 ohm after %s' % legs[-1]['to'],
                        'ok': len(grp) <= DMX_MAX_DEVICES, 'splitter': len(parts) > 1})
    for a in absent:
        if a['block'].lower().startswith('up-la40wf'):
            s = NODES_R2['NODE-LEFT']
            tower = ((ENTRY_LASERS['ko2']['x_m'][0] + ENTRY_LASERS['ko2']['x_m'][1]) / 2, ENTRY_LASERS['ko2']['z_m'][0] - 0.3)
            r = RT.route((s[0], s[2]), tower)
            out.append({'line': 'NODE-LEFT-A-tower', 'node': 'NODE-LEFT', 'port': 'A', 'universe': a['universe'], 'area': 'the entry-laser tower (#873)', 'devices': a['units'],
                        'units': ['rig-la40wf-entry-01', 'rig-la40wf-entry-02'], 'cable_m': R3(r['length_m'] + 6.0 + CABLE_SLACK_M), 'public_m': R3(r['public_m']),
                        'legs': [{'to': 'the tower foot', 'run_m': R3(r['length_m']), 'public_m': R3(r['public_m']), 'stock_m': stock(r['length_m'] + 6.0 + CABLE_SLACK_M, STOCK_DMX_M)[0]}],
                        'route': r['pts'], '_cells': r['public_cells'], 'terminator': '120 ohm after rig-la40wf-entry-02', 'ok': True, 'splitter': False,
                        'note': '#873\'s two UP-LA40WF (U1.401 / U1.433 by the patch): not in this rig; their line from the house-left node, up the tower (6 m)'})
    return out


def trunk_runs(RT, pairs, sites):
    """The feeders (FEEDERS: the board ASSUMED at D-LEFT, its place is owed) and the network (NETWORK: Art-Net from the desk at
    FOH to every node): each run along the router, its public metres."""
    allsites = dict(sites, CONTROL=CONTROL_SITE)
    out = []
    for a, b in pairs:
        r = RT.route((allsites[a][0], allsites[a][2]), (allsites[b][0], allsites[b][2]))
        out.append({'from': a, 'to': b, 'run_m': R3(r['length_m'] + CABLE_SLACK_M), 'public_m': R3(r['public_m']), 'route': r['pts'], '_cells': r['public_cells'],
                    'crossings': RT.crossings(r['public_cells'])})
    return out



# ====================================================================== build: the ground layer + the full rig + the checks
RIG11 = 'scripts/place/rigs/moxir-epic-v1-1-2026-10-08.json'
GONE_PARTS = ('halo', 'stage columns', 'speaker face L', 'speaker face R', 'stage key', 'roof', 'embers', 'columns', 'runway',
              'plane 2 (the wings)', 'plane 3 (behind the stage)', 'plane 4 (the entry side)', 'DJ key (ground option)',
              'stage front booth (ground)', 'stage front PA L (ground)', 'plane 2 (wings, facing the entry)', 'stage front PA R (ground)', 'hall steel', 'entry wall')
FAN_PART = 'plane 1 (behind the DJ)'
# M6 (2026-10-10): the entry view at the peak whited out 0.94 % (budget 0.65 %). Measured on the real GPU (scratchpad tune2, one
# frame each): the three house-left wing heads aimed within 40 deg of the entry eye (planes-11 / -14 / -12, 37-39 deg; forward
# scatter in the haze, HG g 0.74) held at 0 -> 0.22 %; the three next (-17 / -18 / -13) at 0 -> 0.71 %; all of plane 2 at 0.6 ->
# 0.55 % but the near-the-entry eye's beam light (equal colours) would fall under x1.0 (those three give 0.49 of its 1.056).
# So a wing head whose aim comes within WING_ENTRY_DEG of the entry eye is its own part, ember at the peak (A3: a colour change
# with its reason): the equal-colour light (A5) is unchanged, the white (all channels >= 240) is what goes.
WING_ENTRY_PART = 'plane 2 (wings, facing the entry)'
WING_ENTRY_DEG = 45.0
KEY_PART = 'DJ key (ground option)'
# R2.7: the stage front from the ground keeps only the two lamps that stand behind the PA boxes' front line (the gap between the
# boxes, out of reach); the PA faces' two pit lamps are gone from the pit (an OWNER DECISION, checks.stage_front.pa_faces)
STAGE_FRONT = {k: v for k, v in STAGE_FRONT.items() if k in ('key', 'booth')}
STAGE_FRONT['booth'] = dict(STAGE_FRONT['booth'], p=[-3.15, 0.31, 6.55],
                            why='the far corner of the gap between the PA boxes (x -6.5..-2.9), behind the PA boxes\' front line (z 6.7: MOXIR.md 5.3, nothing between the PA and the barrier) and 1.61 m behind the barrier (out of reach, ISO 13857 1.4 m); its own lamp: from the floor the DJ face and the booth front are 14.7 deg apart, more than one 15 deg PAR holds')
STAGE_FRONT_FLOORS_LX = {'peak': {'DJ face': 44.0, 'booth front': 31.0}, 'dark': {'DJ face': 44.0, 'booth front': 31.0}}
FRONT_PARTS = {'key': KEY_PART, 'booth': 'stage front booth (ground)'}
FRONT_IDS = {'key': 'rig-par-planes-25', 'booth': 'rig-par-planes-23'}   # the spread's two keys: same jobs, now on the floor
PA_FACE_OLD = {'PA L': {'p': [-10.25, 0.31, 7.0], 'aim': [-8.25, 1.0, 6.75]}, 'PA R': {'p': [0.2, 0.31, 7.6], 'aim': [-0.9, 0.7, 7.25]}}
# the parts of the layer, by where a unit stands and what it lights (the peak's colours: R2.8 / A3, the spread's ember split)
PART_COLOUR_PEAK = {
    FAN_PART: (EMBER, 'B\'s fan as the owner saw and kept it: ember in the spread too'),
    'plane 2 (the wings)': (ASH, 'the spread\'s wing beams were ash (its one cut-through colour in the hall): kept ash'),
    WING_ENTRY_PART: (EMBER, 'NEW part (2026-10-10, M6): the wing heads aimed within 45 deg of the entry eye; in ash they whited out the entry view at the peak (0.94 % of the frame, budget 0.65 %; 0.22 % with these three dark): ember, the hall\'s colour; the light at equal colours (A5) is unchanged'),
    'plane 3 (behind the stage)': (EMBER, 'ember in the spread: kept'),
    'plane 4 (the entry side)': (EMBER, 'NEW part (the spread had no beam at the entry end): ember, the hall\'s colour, so the ember split holds'),
    'columns': (EMBER, 'the spread\'s column washes were ember: kept'),
    'hall steel': (EMBER, 'replaces the spread\'s 3 ASH roof PARs and its ember halo / stage columns: the roof and the walls are the hall\'s steel, so ember (the spread\'s split: steel in ember, ash only on the cut and a named few)'),
    'entry wall': (EMBER, 'NEW part (the entry wall from the floor): ember, the hall\'s colour'),
    'embers': (EMBER, 'ember in the spread: kept'),
    KEY_PART: (ASH, 'the spread\'s stage key was ash: kept (a named few)'),
    'stage front booth (ground)': (ASH, 'the spread\'s stage key was ash: kept (a named few)'),
    'cut down': (ASH, 'the cut (the truss workflow): ash in the spread, kept'),
    'cut up': (ASH, 'the cut (the truss workflow): ash in the spread, kept'),
}
LOOK_LEVELS = {
    # dark: one colour (ember), the spread's design faders for the beams; the PAR washes at 0.6 (2026-10-10 round 1 minor 1: at 0.5
    # the dark frames read half as bright as the spread's, and these lamps now stand at the hall's edges, farther from the eyes)
    'dark': {FAN_PART: [EMBER, 0.8], 'plane 2 (the wings)': [EMBER, 0.64], WING_ENTRY_PART: [EMBER, 0.64], 'plane 3 (behind the stage)': [EMBER, 0.35], 'plane 4 (the entry side)': [EMBER, 0.64],
             'columns': [EMBER, 0.6], 'hall steel': [EMBER, 0.6], 'entry wall': [EMBER, 0.6], 'embers': [EMBER, 0.6]},
    # peak (R2.8 / A4): every beam and PAR part at most PEAK_CAP (15 % left on the desk), the colours of PART_COLOUR_PEAK
    'peak': {p: [c, PEAK_CAP] for p, (c, _) in PART_COLOUR_PEAK.items() if p not in (KEY_PART, 'stage front booth (ground)')},
}
LEVEL_TUNING = {'budget_white_pct': 0.65, 'method': 'moxir-v2-true-frames.cjs, EV100 2.84, Full, haze t40, real GPU; frame_luma.py white-out', 'measured': []}
OWED = [
    'The crowd plan (the promoter\'s safety lead): the LINE along the public floor\'s edge where units stand behind it (checks.order.perimeter_line: metres and where), its type (a boundary, not a crowd-pressure line: pedestrian barrier or fence, ASSUMED) and stewards; the stage pen\'s own barrier (owed since the spread); the artists\' route from the SE gate to the stage pen (needed for the DJ anyway); capacity and exits (MOXIR.md 5.3).',
    'The 30 deg look-down rule is ASSUMED (a design heuristic: forward scatter at HG g 0.74), not a standard. The real limit is the B380F\'s IEC 62471 risk group and hazard distance: UNKNOWN until the rental (Poligraf) gives it; when it does, it decides, and this rule may be loosened or tightened.',
    'The PL5403 lens on the rental\'s 50 units (8, 15 or 25 deg sold): a photo or label from Poligraf. The places hold at 15 and 25 deg; at 8 deg every beam is inside the 15 deg cone, so they hold too.',
    'The B380F: its manual (clamp points, reset sweep, DMX-loss mode, power-up behaviour after a trip: UNKNOWN). Crew line until known: restore a tripped B380F circuit only with the lamp channel off and the shutter closed on the desk; nobody stands in front of a floor head during a reset.',
    'The desk: each floor B380F\'s pan/tilt window is an OPERATOR SHEET today (docs/moxir/moxir-v2-ground-operator-sheet.md): no desk enforces it. Enforcing it in di\'s desk is OWED code (rigPatch carries no limits; fine channels pass through; raw overrides bypass the limits; serverXR/src/lighting/engine.js). The DMX numbers assume centre = home and positive tilt toward the aim until the B380F channel walk.',
    'The power: the main board\'s place and rating (MOXIR.md 6 #4); the feeders are drawn from D-LEFT, ASSUMED the board\'s side, until it is photographed; 30 mA RCDs and earthing per distro; the PL5403\'s power factor (currents are W / 230 at PF 1); the UP-LA40WF\'s draw (#873\'s).',
    'The PAR\'s candela: the scene draws 30 478 cd, the spec figure is 11 000 cd (EQUIVALENT): every lux here is at the scene\'s figure (owed elsewhere: the photometry 2.77x question).',
    'The haze on site: the frames use the one machine\'s 40-minute estimate (UNVALIDATED). Haze vs the smoke detectors: the fire officer and the venue.',
    'The truss, the near crane and the cubes are other workflows\': the beams treat the crane park (x -12..12, z -2..7, 2.5-10.8 m) as solid; B\'s fan as before. The laser bar still hangs under the free crane in this rig (the v2.1 combine replaces it).',
    'The entry lasers (#873): the floor glare is measured without the 2 x 41 W lines (held dark until the IEC 60825-1 sign-off): measure again with them in the scene.',
    'A5, NOT MET (an OWNER DECISION): the largest beam-base gap is 24.64 m (rule <= 21.9): no out-of-crowd place lies within 21.9 m of the painted cell x 3 z 19.5. Option b, one fenced island beside the FOH riser (x -3.6..1.2, z 26.6..31.4, one B380F), measures 21.88 m for 23 m2 of paint and 19.2 m of barrier (checks.owner_decisions.a5_island); its barrier is not in this order list until he says yes.',
    'A5, NOT MET: the FOH eye\'s PAR light at the peak is x0.74 of the spread (mid-hall x1.40, near the entry x1.69). Bound, measured on candidates-r2.json: all 38 hall PARs aimed for the FOH eye alone, under the 6 m spacing, reach 0.91 (full-level sum); about 20 of the 38 would have to serve it to pass, at the cost of the hall\'s coverage. A wash by the FOH riser (the island, or the desk\'s own) is the other way: the owner\'s call.',
    'A13-A15 (#878): the cut\'s geometry is copied from #878 at 9c732712 (not merged here); the lead re-runs A13-A15 when v2.1 combines both. The bay\'s barrier (x -12..-10.5, z 1.75..6.5) is in the order list as part of the stage pen\'s. rig-beam-planes-06\'s pan is capped on the operator sheet (a wider pan meets the near crane\'s girder): the desk enforcing it is the same OWED code as every window.',
    'The owner\'s look at the page and at the project in the scene.',
]


def region_part(region):
    return {'house left': 'plane 2 (the wings)', 'house right': 'plane 2 (the wings)', 'far end': 'plane 3 (behind the stage)',
            'entry': 'plane 4 (the entry side)', 'stage pen': FAN_PART}[region]


def par_part(c):
    if c['kind'] in ('column foot', 'floor to column head'):
        return 'columns'
    if c['kind'] == 'entry wall':
        return 'entry wall'
    if c['kind'] == 'ember':
        return 'embers'
    return 'hall steel'


def beam_recheck(W, WF, A, F, f, EF):
    """A placed beam, checked again from the rig file's own numbers (head, rotation) as the room will draw it, over its whole
    desk window (every pan of WINDOW_PANS x every tilt of WINDOW_TILTS): the low run (R2.2; B's fan: its strip, the crew lanes,
    the smoke machine's refill point, FIX 4), the head's reach from the public floor, #873's strip, the dense glare over the public
    floor and the lean band (R2.3), every window direction's end, the ring at the aim, the laser keep-outs and, for B's fan, the
    near crane at every park."""
    import numpy as np
    head = np.array([f['p'][0], f['p'][1] - 0.7 + HEAD_Y, f['p'][2]])
    d = aim_dir(f['r'])
    fan = f.get('island') == 'the stage pen'
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
    if fan:
        pw = pen_window(head, d, tk, {'x_m': A.stage_pen['x_m'], 'z_m': A.stage_pen['z_m']}, True)
        low_ok, crew_ok = pw['ok'], pw['crew_ok']
        lr = {'r30': pw['r30'], 'r28': pw['r28'], 'public_gap_m': pw['barrier_gap_m'] + BARRIER_REACH_M}
    else:
        lr = run_window_r2(A, A.G, head, d, tk, False)
        low_ok, crew_ok, pw = lr['ok'], None, {}
    fg = float(field_glare(head, WD, EF).min()) if len(EF) else 180.0
    named = np.asarray(list(EYES.values()) + [DJ_EYE], float) if not fan else np.asarray([e for e in list(EYES.values()) + [DJ_EYE] if not inside_rect(e[0], e[2], A.stage_pen)], float)
    ng = float(field_glare(head, WD, named).min())
    gl = glare_min_deg(head, d, tk, dict(EYES, **{'the DJ': DJ_EYE}))
    bad_end = A.ends_bad(end[0], end[2])
    bg = block_gap(end)
    ap, cubes = aperture_gap(head, d, tk)
    from_pub = R3(float(dist_public(A, A.G, np.asarray([[head[0], head[2]]]), rmax=SLOT_MAX_FROM_PUBLIC_M + 2)[0]))
    corr = in_corridor(head[0], head[2], 0.0)
    parks = fan_park_meets(head, d) if fan else None
    aim_bad = cls[i0] in BAD_END and not (names[i0] and any(names[i0].startswith(a_) for a_ in allow))
    ok = (not aim_bad and ring_ok and low_ok and not bad_end and end[2] <= 53.0 and min(fg, ng) >= GLARE_DEG and tk >= MIN_THROW_M
          and bg >= BLOCK_FREE_M and ap >= APERTURE_PAD_M and cubes >= APERTURE_PAD_M and not win_bad and (crew_ok or not fan)
          and (fan or (from_pub >= HEAD_REACH_M and corr is None)) and (parks is None or not parks['cut']))
    return {'id': f['id'], 'part': f['part'], 'island': f.get('island'), 'region': f.get('region'), 'throw_m': R3(tk), 'ends_on': names[i0], 'end_cls': cls[i0],
            'end': [R3(v) for v in end], 'ring_ok': ring_ok, 'ring_why': ring_why, 'ring_ends': ring_ends, 'low_run_ok': low_ok, 'low_run_m': lr['r30'],
            'low_run_hand_m': lr['r28'], 'low_run_public_gap_m': lr['public_gap_m'], 'crew_ok': crew_ok,
            'smoke_service_gap_m': pw.get('smoke_gap_m') if fan else None, 'crew_lane_gap_m': pw.get('lane_gap_m') if fan else None,
            'head_from_public_m': from_pub, 'in_873_strip': corr['what'] if corr else None,
            'window': {'pan_az_deg': [R3(az_el(WD[0])[0]), R3(az_el(WD[len(WINDOW_PANS) - 1])[0])], 'tilt_el_deg': [R3(az_el(d)[1]), R3(min(az_el(d)[1] + TILT_UP_DEG, 89.5))],
                       'directions': len(WD), 'directions_refused': win_bad},
            'field_glare_min_deg': R3(fg), 'named_glare_min_deg': R3(ng), 'ends_in_bar_or_chill': bad_end, 'ends_on_entry_wall': end[2] > 53.0, 'glare_min_deg': gl,
            'glare_min_deg_any': R3(min(min(gl.values()), ng)), 'into_crane_or_park': (cls[i0] in ('crane', 'crane park')) and not fan, 'near_crane_parks': parks,
            'far_wall_block_gap_m': R3(bg), 'entry_aperture_gap_m': ap, 'cubes_box_gap_m': cubes, 'into_laser_keep_out': cls[i0] in KEEP_OUT_CLS, 'ok': ok}


def eye_totals(W, F, fixtures, A=None, look=None, equal=False):
    """Every non-truss PAR and B380F of a rig, seen from the 9 eyes (the selection's own metric): PAR lx from the lit surfaces
    (the crowd not see-through when A is given), beam G; at full, or (look given) each part at its level x its colour's
    luminance share, or (equal) at its level alone: the comparison at EQUAL COLOURS (A3: a "brighter" that is only white is not
    counted). W should be the fan's world (the crane park's air open) so two rigs are compared in the same hall."""
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
            k = lev * (1.0 if equal else SP.lum_factor(col or f.get('colour') or ASH))
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
    """Before / after per eye: beam G and PAR lx, with each eye's weight; the people-weighted totals, the review's crowd set and
    the entry-side eyes, and the RATIO ground / spread of each."""
    rows = {}
    for e in EYES:
        rows[e] = {'weight': wt[e]['weight'], 'beam_G': [eb['beam_G'][e], ea['beam_G'][e]], 'par_lx': [eb['par_lux_at_eye'][e], ea['par_lux_at_eye'][e]],
                   'beam_ratio': R3(ea['beam_G'][e] / max(eb['beam_G'][e], 1e-12)), 'par_ratio': R3(ea['par_lux_at_eye'][e] / max(eb['par_lux_at_eye'][e], 1e-12))}
    wsum = lambda key, i, eyes: sum(wt[e]['weight'] * rows[e][key][i] for e in eyes)
    out = {'per_eye': rows}
    for name, eyes in (('people_weighted', list(EYES)), ('crowd_eyes', list(CROWD_EYES)), ('entry_eyes', list(ENTRY_EYES))):
        bg = [round(wsum('beam_G', i, eyes), 5) for i in (0, 1)]
        pl = [R3(wsum('par_lx', i, eyes)) for i in (0, 1)]
        out[name] = {'eyes': eyes, 'beam_G': bg, 'par_lx': pl, 'beam_ratio': R3(bg[1] / max(bg[0], 1e-12)), 'par_ratio': R3(pl[1] / max(pl[0], 1e-12))}
    out['entry_min_beam_ratio'] = min(rows[e]['beam_ratio'] for e in ENTRY_EYES)
    out['entry_min_par_ratio'] = min(rows[e]['par_ratio'] for e in ENTRY_EYES)
    out['what'] = '[the spread, the ground] from the same nine eyes in the same hall (the fan\'s world: the crane park\'s air open); weights = the people each eye stands for (FIX 1); ratio = ground / spread'
    return out


def field_check(beams, EF, aim_only=False):
    """R2.3 on the placed rig: per public eye (EF: plan points x EYE_YS, the lean band included), the smallest angle to any beam
    over its whole window; returns the failing share of the eye plan points (a point fails when any of its heights does)."""
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
    return {'points': int(m), 'step_m': FIELD_STEP_M, 'heights_m': list(EYE_YS), 'fail_points': int(fail.sum()), 'fail_pct': R3(100.0 * float(fail.mean())),
            'fail_pct_by_height': by_y, 'min_deg': R3(float(per_pt.min())), 'exceptions': ex, 'rule_deg': GLARE_DEG, 'rule_status': GLARE_RULE_STATUS,
            'what': 'every public plan point (painted hot, wings, bar, chill + the door walkway; not the stage pen or a machine) every %.1f m AND every point of the %.1f m lean band outside its edge (0.25 m), eyes at %s m (+0.6 on the FOH riser), every beam over its whole desk window (%d pans x %d tilts), the angle at the head' % (
                FIELD_STEP_M, LEAN_M, '/'.join('%g' % y for y in EYE_YS), len(WINDOW_PANS), len(WINDOW_TILTS))}


GLARE_RULE_STATUS = ('ASSUMED: a design heuristic (forward scatter at HG g 0.74, HG(30 deg) ~ 1/5 of HG(15 deg); eyes.py), not a published standard. '
                     'The eye-safety limit is the B380F\'s IEC 62471 hazard distance: UNKNOWN until the rental gives its risk group.')


def par_eye_check(W, pars, P, lens=PAR_DESIGN_LENS_DEG):
    """R2.4 on the placed rig: for every floor PAR, its eye footprint at `lens` (par_eye_footprint) against the public feet points
    P (0.25 m; the stage pen and the machines out): a PAR fails when a public point lies within LEAN_M of it."""
    import numpy as np
    rows, bad = [], []
    for f in pars:
        fp, th = par_eye_footprint(W, f['p'], aim_dir(f['r']), lens)
        gap = footprint_gap(fp, P)
        if len(fp) and np.isfinite(gap) and gap < LEAN_M:
            bad.append(f['id'])
        rows.append({'id': f['id'], 'footprint_points': int(len(fp)), 'throw_m': R3(th), 'nearest_public_m': None if not np.isfinite(gap) else R3(gap), 'ok': f['id'] not in bad})
    return {'lens_deg': lens, 'pars': len(pars), 'fail': bad, 'fail_count': len(bad), 'rows': rows, 'lean_m': LEAN_M, 'heights_m': [min(EYE_YS), max(EYE_YS)],
            'what': 'every floor PAR: its beam (%g deg + %.0f deg aim tolerance, from its %.2f m lens) between 1.5 and 1.9 m up to its first hit, against every public feet point 0.25 m apart; a person leaning %.1f m' % (
                lens, PAR_AIM_TOL_DEG, PAR_LENS_R_M, LEAN_M)}


LINE_NEAR_M = 6.0      # ASSUMED: a unit's guard line runs along every public edge within 6 m of it (perimeter_lines)


def perimeter_lines(RT, units, near=LINE_NEAR_M):
    """A9 / R2.1: the public floor's edge where a unit of this layer stands behind it: every face between a public 1 m cell and an
    open (not public, not blocked) cell whose midpoint lies within `near` m of an out-of-crowd unit. Returns {length_m (the faces'
    sum: a staircase, an upper bound up to 1.41 x a straight line), by region, faces}."""
    import numpy as np
    U = np.asarray([[u['p'][0], u['p'][2]] for u in units], float)
    faces = []
    pub, blk = RT.public, RT.block
    for i in range(RT.nx):
        for k in range(RT.nz):
            if not pub[i, k]:
                continue
            for di, dk in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                j, m = i + di, k + dk
                if not (0 <= j < RT.nx and 0 <= m < RT.nz) or pub[j, m] or blk[j, m]:
                    continue
                mx, mz = RT.x0 + 0.5 + (i + j) / 2.0, RT.z0 + 0.5 + (k + m) / 2.0
                if len(U) and float(np.min(np.hypot(U[:, 0] - mx, U[:, 1] - mz))) <= near:
                    faces.append((R3(mx), R3(mz), 'z' if di else 'x'))
    return faces


def strip_edge_faces(RT, repo='.'):
    """A8: every face of the public floor's edge (as perimeter_lines finds them, with no unit filter) that lies inside #873's
    strip. A unit within LINE_NEAR_M of one of these would put its guard line (a barrier: something to stand on) in the strip,
    so build() refuses such places before the pick."""
    out = []
    pub, blk = RT.public, RT.block
    for i in range(RT.nx):
        for k in range(RT.nz):
            if not pub[i, k]:
                continue
            for di, dk in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                j, m = i + di, k + dk
                if not (0 <= j < RT.nx and 0 <= m < RT.nz) or pub[j, m] or blk[j, m]:
                    continue
                mx, mz = RT.x0 + 0.5 + (i + j) / 2.0, RT.z0 + 0.5 + (k + m) / 2.0
                if in_corridor(mx, mz, 0.0, repo):
                    out.append((mx, mz))
    return out


def operator_sheet(T, out_paths):
    """A10: the operator setup sheet, per floor B380F: its address (the v2 patch), pan/tilt window in degrees and as 16-bit DMX
    (coarse/fine), home/centre and the tilt direction ASSUMED until the channel walk. Written as .md, .csv and .html."""
    import html
    rows = []
    for f in sorted([f for f in T['fixtures'] if f['type'] == 'up-b380f'], key=lambda f: _natural(f['id'])):
        L, dm = f['desk_limits'], f['dmx']
        rows.append({'id': f['id'], 'fixture': dm.get('fixture'), 'address': 'U%d.%03d' % (dm['universe'], dm['address']), 'line': dm.get('line'), 'part': f['part'],
                     'where': '%s (x %.1f, z %.1f)' % (f.get('region') or f.get('island'), f['p'][0], f['p'][2]),
                     'base_front_az': L['base_front_faces_az_deg'], 'pan_deg': L['pan_deg_from_home'], 'tilt_deg': L['tilt_deg_from_home'],
                     'world_az': L['world_az_deg'], 'world_el': L['world_el_deg'], 'pan16': L['dmx16']['pan'], 'tilt16': L['dmx16']['tilt'],
                     'pan_cf': L['dmx16']['pan_coarse_fine'], 'tilt_cf': L['dmx16']['tilt_coarse_fine'], 'ch': [dm['address'], dm['address'] + 1, dm['address'] + 2, dm['address'] + 3]})
    head = ('# MOXIR v2 ground: B380F operator setup sheet (desk limits)\n\n'
            'Written by `scripts/place/moxir_v2_ground.py build` from `%s` (%s). **No desk enforces these numbers yet: set them by hand as position limits '
            '(pan / tilt min-max) on the show desk, per head, before the first focus. Enforcing them in di\'s desk is OWED code** (rigPatch carries no limits; '
            'fine channels pass through; raw overrides bypass the limits: serverXR/src/lighting/engine.js).\n\n'
            '- Channels (the 16-channel map TESTED on the Sevan units, channels 1-10): ch 1 pan, ch 2 tilt, ch 3 pan fine, ch 4 tilt fine (the head\'s address + 0..3).\n'
            '- 16-bit value = coarse x 256 + fine. Centre 32768 (coarse 128, fine 0) = HOME = the beam straight up out of the base (dmxDecode.js); 540 deg pan / 270 deg tilt (the maker\'s range, EXACT).\n'
            '- **ASSUMED until the channel walk** (docs/moxir/b380f-16ch-map-check-2026-10-09.md): that centre is home, that pan grows clockwise seen from above, and that tilt grows TOWARD the base\'s front. '
            'Each base is set down with its front facing the azimuth in the table. **A reversed tilt points the window backwards**: at the focus call, send each head to its aim (tilt high value) with the lamp OFF, check by eye that it points where the table says, then set the limits.\n'
            '- Tilt is degrees from home (0 = straight up); the window\'s low edge is the aim (the head never tilts lower than its aim: that is the safety edge), the high edge up to 15 deg more vertical.\n'
            '- Power trip / reset / DMX loss behaviour of the B380F is UNKNOWN (no manual). Crew line: restore a tripped B380F circuit only with the lamp channel off and the shutter closed on the desk; nobody stands in front of a floor head during its reset sweep.\n\n'
            '| head | fix # | address | DMX line | where | base front faces (az) | pan from home (deg) | tilt from home (deg) | world az | world el | pan 16-bit (coarse/fine) | tilt 16-bit (coarse/fine) |\n'
            '|---|---|---|---|---|---|---|---|---|---|---|---|\n') % (RIG_GR, T.get('date'))
    md = head + ''.join('| %s | %s | %s (ch %s) | %s | %s | %.1f | %+.1f..%+.1f | %.1f..%.1f | %.1f..%.1f | %.1f..%.1f | %d..%d (%d/%d..%d/%d) | %d..%d (%d/%d..%d/%d) |\n' % (
        r['id'], r['fixture'], r['address'], '-'.join(str(c) for c in (r['ch'][0], r['ch'][3])), r['line'], r['where'], r['base_front_az'], r['pan_deg'][0], r['pan_deg'][1],
        r['tilt_deg'][0], r['tilt_deg'][1], r['world_az'][0], r['world_az'][1], r['world_el'][0], r['world_el'][1], r['pan16'][0], r['pan16'][1], r['pan_cf'][0][0], r['pan_cf'][0][1],
        r['pan_cf'][1][0], r['pan_cf'][1][1], r['tilt16'][0], r['tilt16'][1], r['tilt_cf'][0][0], r['tilt_cf'][0][1], r['tilt_cf'][1][0], r['tilt_cf'][1][1]) for r in rows)
    csv = 'head,fixture,universe_address,dmx_line,where,base_front_az_deg,pan_min_deg,pan_max_deg,tilt_min_deg,tilt_max_deg,pan16_min,pan16_max,tilt16_min,tilt16_max,pan_coarse_min,pan_fine_min,pan_coarse_max,pan_fine_max,tilt_coarse_min,tilt_fine_min,tilt_coarse_max,tilt_fine_max\n'
    csv += ''.join('%s,%s,%s,%s,"%s",%.1f,%g,%g,%g,%g,%d,%d,%d,%d,%d,%d,%d,%d,%d,%d,%d,%d\n' % (
        r['id'], r['fixture'], r['address'], r['line'], r['where'], r['base_front_az'], r['pan_deg'][0], r['pan_deg'][1], r['tilt_deg'][0], r['tilt_deg'][1],
        r['pan16'][0], r['pan16'][1], r['tilt16'][0], r['tilt16'][1], r['pan_cf'][0][0], r['pan_cf'][0][1], r['pan_cf'][1][0], r['pan_cf'][1][1],
        r['tilt_cf'][0][0], r['tilt_cf'][0][1], r['tilt_cf'][1][0], r['tilt_cf'][1][1]) for r in rows)
    E = html.escape
    tbl = ''.join('<tr><td>%s</td><td>%s</td><td>%s</td><td>%s</td><td>%s</td><td>%.1f°</td><td>%+.1f…%+.1f°</td><td>%.1f…%.1f°</td><td>%d…%d<br><small>%d/%d…%d/%d</small></td><td>%d…%d<br><small>%d/%d…%d/%d</small></td></tr>' % (
        E(r['id']), r['fixture'], E(r['address']), E(r['line'] or ''), E(r['where']), r['base_front_az'], r['pan_deg'][0], r['pan_deg'][1], r['tilt_deg'][0], r['tilt_deg'][1],
        r['pan16'][0], r['pan16'][1], r['pan_cf'][0][0], r['pan_cf'][0][1], r['pan_cf'][1][0], r['pan_cf'][1][1], r['tilt16'][0], r['tilt16'][1],
        r['tilt_cf'][0][0], r['tilt_cf'][0][1], r['tilt_cf'][1][0], r['tilt_cf'][1][1]) for r in rows)
    doc = ('<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>B380F operator sheet</title>'
           '<style>body{font:14px/1.45 system-ui,sans-serif;margin:16px;color:#111;background:#fff}table{border-collapse:collapse;width:100%%;font-variant-numeric:tabular-nums}'
           'td,th{border:1px solid #999;padding:4px 6px;text-align:left;vertical-align:top}th{background:#eee}small{color:#555}.w{overflow-x:auto}@media print{body{margin:8mm}}</style></head><body>'
           '<h1>MOXIR v2 ground — B380F operator setup sheet</h1><p><b>No desk enforces these limits yet: set them by hand per head before the first focus. Enforcing them in di\'s desk is OWED code.</b> '
           'Channels: ch 1 pan, ch 2 tilt, ch 3 pan fine, ch 4 tilt fine (TESTED map). 16-bit = coarse × 256 + fine; centre 32768 = home (beam straight up), 540° / 270°. '
           '<b>ASSUMED until the channel walk:</b> centre = home, tilt grows toward the base\'s front, pan clockwise from above. Check each head\'s aim by eye with the lamp OFF before setting its limits. '
           'Power trip / reset / DMX-loss behaviour UNKNOWN: restore a B380F circuit only with the lamp channel off and the shutter closed.</p>'
           '<div class="w"><table><tr><th>head</th><th>fix #</th><th>address</th><th>DMX line</th><th>where</th><th>base front faces</th><th>pan from home</th><th>tilt from home</th><th>pan 16-bit<br><small>coarse/fine</small></th><th>tilt 16-bit<br><small>coarse/fine</small></th></tr>%s</table></div></body></html>') % tbl
    for d in out_paths:
        os.makedirs(d, exist_ok=True)
        open(os.path.join(d, 'moxir-v2-ground-operator-sheet.md'), 'w').write(md)
        open(os.path.join(d, 'moxir-v2-ground-operator-sheet.csv'), 'w').write(csv)
        open(os.path.join(d, 'moxir-v2-ground-operator-sheet.html'), 'w').write(doc)
    return rows


def patch_power(repo, T, A, G, SPR, RT, plan=None):
    """A1 / R2.6 + R2.3: the patch (addresses by unit id), the DMX lines, power and the cable runs for T['fixtures'], written into
    T['power'], T['patch'] and each unit's dmx / circuit. build() calls it; moxir_v2_compose.py calls it again on the composed
    list (plan = the patch plan to lay, default the official file). Returns what build() uses later."""
    units = [f for f in T['fixtures'] if f['type'] in ('up-pl5403', 'up-b380f', 'up-yz31p')]
    if plan is None:
        plan, counts = plan_with_counts(repo, units)
    else:
        counts = plan_with_counts(repo, units)[1]
    addr, plan_doc, absent = plan_addresses(repo, units, plan)
    for f in units:
        f['dmx'] = dict(addr[f['id']])
    lines = lines_r2(units, A, RT, absent)
    laser_c = next(c for c in SPR['power']['circuits'] if c['circuit'] == 'C-LASER')
    circ, ph = circuits_r2(units, A, RT, extra=[laser_c])
    cid = {u: c['circuit'] for c in circ for u in c['units']}
    for f in units:
        f['circuit'] = cid[f['id']]
    feeders = trunk_runs(RT, FEEDERS, DISTROS_R2)
    network = trunk_runs(RT, NETWORK, NODES_R2)
    runs = [('power ' + c['circuit'], c.get('_cells', [])) for c in circ] + [('dmx ' + l['line'], l['_cells']) for l in lines] + \
           [('feeder %s-%s' % (r['from'], r['to']), r['_cells']) for r in feeders] + [('network %s-%s' % (r['from'], r['to']), r['_cells']) for r in network]
    union = sorted({c for _, cs in runs for c in cs})
    xings = []
    for name, cs in runs:
        for x in RT.crossings(cs):
            xings.append(dict(x, run=name))
    for c in circ:
        c.pop('_cells', None)
    for l in lines:
        l.pop('_cells', None)
    for r in feeders + network:
        r.pop('_cells', None)
    cable_list = {'power': [{'circuit': c['circuit'], 'distro': c.get('distro'), 'mm2': c.get('cable_mm2'), 'legs': c.get('legs')} for c in circ if c.get('legs')],
                  'dmx': [{'line': l['line'], 'legs': l['legs'], 'terminator': l['terminator']} for l in lines],
                  'feeders': [{'from': r['from'], 'to': r['to'], 'run_m': r['run_m'], 'what': 'a 3-phase feeder (rating from the distro\'s load and the board, owed)'} for r in feeders],
                  'network': [{'from': r['from'], 'to': r['to'], 'run_m': r['run_m'], 'what': 'Cat5e/Cat6 (Art-Net); over 90 m a switch or fibre (TIA-568 channel limit 100 m)'} for r in network]}
    tot_stock = {}
    for c in cable_list['power']:
        for lg in c['legs']:
            for s_ in lg['stock_m']:
                tot_stock['power %dm' % s_] = tot_stock.get('power %dm' % s_, 0) + 1
    for l in cable_list['dmx']:
        for lg in l['legs']:
            for s_ in lg['stock_m']:
                tot_stock['dmx %dm' % s_] = tot_stock.get('dmx %dm' % s_, 0) + 1
    cable_list['stock_totals'] = dict(sorted(tot_stock.items()))
    cable_list['stock_lengths_assumed'] = {'power_m': STOCK_POWER_M, 'dmx_m': STOCK_DMX_M, 'slack_per_leg_m': CABLE_SLACK_M}
    uni_used = {}
    for f in units:
        uni_used.setdefault(f['dmx']['universe'], []).append(f['dmx']['footprint'])
    for a in absent:
        uni_used.setdefault(a['universe'], []).extend([a['footprint']] * (a['units'] or 0))
    T['power'] = {'circuits': circ, 'phases_w': ph, 'distros': DISTROS_R2, 'feeders': feeders,
                  'method': 'moxir_v2_ground.circuits_r2: each area\'s distro (DISTROS_R2), one kind per circuit, <= 2 944 W and <= 5 %% volt drop (BS 7671 4D2B), every leg along the cable router\'s run (walls and the hall\'s edges; a public metre costs %g); C-LASER phased with the rest; the board ASSUMED at D-LEFT (owed)' % PUBLIC_COST}
    official = json.load(open(os.path.join(repo, PATCH_PLAN)))
    show = {b['select']['group']: b.get('units') for u in official['universes'] for b in u['blocks'] if b['select'].get('group')}
    T['patch'] = {'from': PATCH_PLAN, 'owner': 'N460.2', 'universes': [{'universe': u, 'used': sum(v), 'devices': len(v)} for u, v in sorted(uni_used.items())],
                  'not_in_this_rig': absent, 'lines': lines, 'network': network, 'nodes': NODES_R2, 'control': CONTROL_SITE,
                  'counts': {'cut': counts.get('rig-par-cut', 0), 'planes': counts.get('rig-par-planes', 0)},
                  'show_counts': {'cut': show.get('rig-par-cut'), 'planes': show.get('rig-par-planes')},
                  'layer_note': 'this rig lays the official plan with its own counts (cut %d / planes %d; the official file says cut %s / planes %s for the show rig); '
                                'where they differ, the units after the moved one sit on other addresses here than in the show patch (the composed rig, moxir-v2-patch-v2-1-*.json)'
                                % (counts.get('rig-par-cut', 0), counts.get('rig-par-planes', 0), show.get('rig-par-cut'), show.get('rig-par-planes')),
                  'slots': {str(u): sum(v) for u, v in sorted(uni_used.items())},
                  'method': 'addresses by unit id from the official v2 patch (%s; src/rigbuild/patchPlan.js lays the same); this rig routes the lines: one per area and universe (port A = U1, B = U2), <= %d devices (ANSI E1.11 / EIA-485, 4 of 32 spare), a 120 ohm terminator after the last unit' % (PATCH_PLAN, DMX_MAX_DEVICES)}
    return dict(units=units, lines=lines, circ=circ, ph=ph, feeders=feeders, network=network, cable_list=cable_list, runs=runs, union=union, xings=xings, uni_used=uni_used, absent=absent)


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
    G = W.G
    w, wtable = eye_weights(A, G)
    set_eye_weights(w)
    sm = next(f for f in SPR['fixtures'] if f['type'] == 'up-yz31p')
    F = V.field_numbers(repo, [sm['p'][0], sm['p'][1] + 0.1, sm['p'][2]], [0, 0, 1], states=('t40',))['t40']
    pk_s = next(l for l in SPR['looks'] if l['id'] == 'peak')
    eyes_s_eq = eye_totals(WF, F, SPR['fixtures'], A, pk_s, equal=True)
    beam_target = [eyes_s_eq['beam_G'][e] / PEAK_CAP for e in ENTRY_EYES]
    par_target = [eyes_s_eq['par_lux_at_eye'][e] / PEAK_CAP for e in ENTRY_EYES]

    # ---- 1. the beams: B's fan (fixed), then 12 heads out of the crowd. Every scored option is first checked over its WHOLE
    # window's ends (every pan x tilt)
    if A.island is None:                          # the A5 option's island places belong to its variant only
        C['slots'] = {k: v for k, v in C['slots'].items() if not v.get('island')}
    dropped = 0
    for sid, s_ in C['slots'].items():
        keep_o = []
        for o in s_['options']:
            ok_w, _ = window_ends_ok(W, A, np.asarray(s_['head'], float), np.asarray(o['dir'], float), WINDOW_PANS, WINDOW_TILTS)
            if ok_w:
                keep_o.append(o)
            else:
                dropped += 1
        s_['options'] = keep_o
    print('options dropped by the whole window\'s ends: %d' % dropped, file=sys.stderr, flush=True)
    # A14 + A15 (#878): an aim into the cube beams' volume or onto the near crane at z 3.20 is refused before the pick (a window
    # direction that meets them caps that head's pan on its desk limits after the pick: checks_878)
    drop878 = 0
    for sid, s_ in C['slots'].items():
        keep_o = []
        for o in s_['options']:
            cm, ch = window_878(np.asarray(s_['head'], float), np.asarray(o['dir'], float), o.get('throw_m'), pans=(0.0,), tilts=(0.0,))
            if cm < 0.0 or ch:
                drop878 += 1
            else:
                keep_o.append(o)
        s_['options'] = keep_o
    print('options dropped by A14/A15 (#878): %d' % drop878, file=sys.stderr, flush=True)
    # A8: no guard line in #873's strip: refuse every place within LINE_NEAR_M of the public edge inside the strip
    RT = Router(A, G)
    SE = np.asarray(strip_edge_faces(RT, repo), float).reshape(-1, 2)
    near_strip = lambda x, z: bool(len(SE)) and float(np.min(np.hypot(SE[:, 0] - x, SE[:, 1] - z))) <= LINE_NEAR_M + 1e-9
    strip_refused = {'slots': [sid for sid, s_ in C['slots'].items() if near_strip(s_['head'][0], s_['head'][2])]}
    for sid in strip_refused['slots']:
        C['slots'][sid]['options'] = []
    for c in C['pars'].values():
        if not c.get('refused') and near_strip(c['p'][0], c['p'][2]):
            c['refused'] = 'its guard line would stand in #873\'s strip (A8)'
    strip_refused['pars'] = sum(1 for c in C['pars'].values() if c.get('refused', '').startswith('its guard line'))
    strip_refused['edge_faces_in_strip'] = len(SE)
    print('A8 strip: refused %d slots, %d PARs' % (len(strip_refused['slots']), strip_refused['pars']), file=sys.stderr, flush=True)
    cells = painted_cells(A)
    heads, Gtot, bpick = pick_beams_r2(C, cells, beam_target, n=18 - STAGE_PEN_HEADS)
    old_beams = sorted([f for f in SPR['fixtures'] if f['type'] == 'up-b380f'], key=lambda f: f['id'])
    old_by = {f['id']: f for f in old_beams}
    free_old = [f for f in old_beams if not f['part'].startswith('plane 1')]
    hall_heads = [h for h in heads if not h.get('slot_id')]
    m = match_ids([{'p': h['head']} for h in hall_heads], free_old)
    beams = []
    for h in heads:
        if h.get('slot_id'):
            was, dd = old_by[h['slot_id']], 0.0
            fid, p_, r_ = was['id'], list(was['p']), list(was['r'])           # B's fan: the spread's own numbers, untouched
            d = aim_dir(r_)
            part, region, island = FAN_PART, 'stage pen', 'the stage pen'
        else:
            was, dd = m[hall_heads.index(h)]
            fid = was['id']
            d = np.asarray(h['dir'], float)
            p_ = [R3(h['head'][0]), R3(h['head'][1] - HEAD_Y + 0.7), R3(h['head'][2])]
            r_ = rot_for_dir(d)
            region, island = h['region'], None
            part = region_part(region)
            if part == 'plane 2 (the wings)':
                to_eye = np.asarray(EYES['near the entry'], float) - np.array([p_[0], p_[1] - 0.7 + HEAD_Y, p_[2]])
                if math.degrees(math.acos(max(-1.0, min(1.0, float(d @ to_eye) / float(np.linalg.norm(to_eye) * np.linalg.norm(d)))))) < WING_ENTRY_DEG:
                    part = WING_ENTRY_PART
        az, el = az_el(d)
        head = np.array([p_[0], p_[1] - 0.7 + HEAD_Y, p_[2]])
        beams.append({'id': fid, 'type': 'up-b380f', 'part': part, 'layer': 'beams', 'status': 'used', 'moments': [],
                      'position': ('%s: base on the floor, bolted to a ballasted floor plate, levelled; aim %.0f/%.0f deg (az/el), throw %.1f m to %s'
                                   % ('the stage pen' if island else '%s, out of the crowd (%.1f m from the public floor)' % (region, h.get('from_public_m') or float(dist_public(A, G, np.asarray([[p_[0], p_[2]]]))[0])),
                                      az, el, h['throw_m'], h['ends_on'])) + (' (B\'s fan as the owner saw it on 10-09, not re-aimed)' if h.get('slot_id') else ''),
                      'p': p_, 'r': r_, 'colour': PART_COLOUR_PEAK[part][0], 'angle_rad': 0.0157, 'throw_m': h['throw_m'], 'ends_on': h['ends_on'],
                      'region': region, **({'island': island} if island else {}), 'slot': h.get('slot'), 'pick_phase': h.get('phase'),
                      'desk_limits': desk_limits(head, d), 'base': base_check(d),
                      'eye_G': {e: round(float(sum(h['G'][k])), 5) for k, e in enumerate(EYES)}, 'gain': h['gain'],
                      'moved_from': {'p': was['p'], 'part': was['part'], 'plan_m': R3(dd)}, 'power_w': POWER_W['up-b380f'],
                      **({'kept_from_spread': True} if h.get('slot_id') else {})})

    # ---- 2. the PARs: the stage front (2, fixed: the DJ key, the booth front), then the hall's 38 out of the crowd
    front = []
    for k, sf in STAGE_FRONT.items():
        d = unit(np.asarray(sf['aim']) - np.asarray(sf['p']))
        front.append({'id': 'stage front %s' % k, 'front': k, 'kind': 'DJ key' if k == 'key' else 'stage front', 'p': sf['p'], 'dir': [R3(v) for v in d],
                      'part': FRONT_PARTS[k], 'colour': ASH, 'targets': list(sf['targets']),
                      'position': ('DJ key, a GROUND OPTION (combine with the truss DJ light): %s' if k == 'key' else 'the booth front from the floor: %s') % sf['why']})
    refused = {}
    for c in C['pars'].values():
        why = c.get('refused') or ('its pool lands on the bar or the chill zone (OWNER DECISION: no light there until he says)' if c.get('pool_in_bar_or_chill') else None)
        if why:
            refused[why.split(' (gap')[0]] = refused.get(why.split(' (gap')[0], 0) + 1
    allowed = lambda c: not c.get('refused') and not c.get('pool_in_bar_or_chill')
    n_hall = GROUND_PARS - len(front)
    pars, Ptot = pick_pars_r2(C, n_hall, PAR_MIN_SPACING_M, front, cells, par_target, allowed)
    if len(pars) != n_hall:
        raise SystemExit('the spacing rule left room for %d PARs, needs %d' % (len(pars), n_hall))
    # OWNER DECISION (bar / chill): the same pick with pools allowed on the bar and the chill + food zone, measured
    pars_bc, Ptot_bc = pick_pars_r2(C, n_hall, PAR_MIN_SPACING_M, front, cells, par_target, lambda c: not c.get('refused'))
    old_pars = [f for f in SPR['fixtures'] if f['type'] == 'up-pl5403' and not f['part'].startswith('cut')]
    old_by.update({f['id']: f for f in old_pars})
    pool_ids = [f for f in old_pars if f['id'] not in FRONT_IDS.values()]
    m = match_ids(pars, pool_ids)
    gpars = []
    for i, q in enumerate(front + pars):
        if q.get('front'):
            was = old_by[FRONT_IDS[q['front']]]
            dd = math.hypot(q['p'][0] - was['p'][0], q['p'][2] - was['p'][2])
            where, region = 'stage pen', 'stage pen'
        else:
            was, dd = m[i - len(front)]
            region = q.get('region') or region_of(q['p'][0], q['p'][2], A)
            where = 'machine' if q['kind'] == 'ember' else ('stage pen' if region == 'stage pen' else 'out of the crowd')
        part = q['part'] if q.get('front') else par_part(q)
        gpars.append({'id': was['id'], 'type': 'up-pl5403', 'part': part, 'layer': 'pars', 'status': 'used', 'moments': [],
                      'position': q['position'], 'p': [R3(v) for v in q['p']], 'r': rot_for_dir(q['dir']), 'colour': PART_COLOUR_PEAK[part][0],
                      'angle_rad': 0.1309, 'stands_in': where, 'region': region, 'place': q.get('id'), 'pick_phase': q.get('phase'),
                      'guard': 'a mesh guard (the pit side of the barrier, security works there)' if q.get('front') else None,
                      'from_public_m': q.get('from_public_m'),
                      'throw_m': q.get('throw_m') if not q.get('front') else R3(par_eye_footprint(W, q['p'], unit(q['dir']))[1]),
                      'eye_lux': {e: R3(sum(q['E'][k])) for k, e in enumerate(EYES)} if q.get('E') else None, 'lit_pct': q.get('lit_pct'),
                      'gain': q.get('gain'), 'moved_from': {'p': was['p'], 'part': was['part'], 'plan_m': R3(dd)},
                      'power_w': POWER_W['up-pl5403'], **({'targets': q['targets']} if q.get('front') else {}),
                      **({'combine_with': 'the truss DJ light (another workflow): this key is a ground OPTION, one fader'} if q.get('kind') == 'DJ key' else {})})
    layer = gpars + beams

    # ---- 3. the full rig: the spread with its non-truss, non-laser, non-smoke units replaced by the layer
    T = copy.deepcopy(SPR)
    keep = [f for f in T['fixtures'] if f['part'].startswith('cut') or f['type'] in ('ext-lc-ultra-mk2', 'up-yz31p')]
    for f in keep:
        f.pop('dmx', None)
        if f['type'] == 'ext-lc-ultra-mk2' and 'laser' in f:
            f['laser'].pop('artnet', None)                 # A1: the cubes run over the LAN, no DMX (owner N460.2)
            f['laser']['lan'] = 'LAN only, through di Nodes: the LaserCube UDP protocol (45456 alive, 45457 commands, 45458 points); no DMX, no Art-Net, no universe (the v2 patch offDmx, owner N460.2)'
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
            for cpart in ('cut down', 'cut up'):
                if cpart in p:
                    p[cpart] = [p[cpart][0], min(p[cpart][1], PEAK_CAP)]     # A4: the truss's PARs keep 15 % too (the truss workflow may set its own)
            col = EMBER if lk['id'] == 'dark' else ASH
            for k, sf in STAGE_FRONT.items():
                need = [STAGE_FRONT_FLOORS_LX[lk['id']][t] / max(full[k][t] * SP.lum_factor(col), 1e-9) for t in sf['targets']]
                lv = min(PEAK_CAP, math.ceil(max(need) * 1000.0) / 1000.0)
                front_lv.setdefault(k, {})[lk['id']] = lv
                p[FRONT_PARTS[k]] = [col, lv]
        lk['parts'] = {k: v for k, v in p.items() if k in present or k == 'laser'}
    for c in T['cues']:
        c['name'] = c['name'].replace('B tuned + stage + lasers', 'v2 ground')

    # ---- 4. the patch (R2.6: the official v2 patch, by unit id), the DMX lines, power, the cable runs
    R4 = patch_power(repo, T, A, G, SPR, RT)
    units, lines, circ, ph, feeders, network, cable_list, runs, union, xings = (R4[k] for k in ('units', 'lines', 'circ', 'ph', 'feeders', 'network', 'cable_list', 'runs', 'union', 'xings'))
    lay_by = {f['id']: f for f in layer}
    for f in T['fixtures']:
        if f['id'] in lay_by:
            lay_by[f['id']]['dmx'], lay_by[f['id']]['circuit'] = f['dmx'], f['circuit']

    # ---- 5. checks
    nontruss = [f for f in T['fixtures'] if f['type'] in ('up-pl5403', 'up-b380f') and not f['part'].startswith('cut')]
    gp = [f for f in nontruss if f['type'] == 'up-pl5403']
    hall_p = [f for f in gp if f['part'] not in FRONT_PARTS.values()]
    nn = sorted(min(math.hypot(a['p'][0] - b['p'][0], a['p'][2] - b['p'][2]) for b in hall_p if b is not a) for a in hall_p)
    EF_all = public_eyes(A, G, step=FIELD_STEP_M)
    S.wait_cool()
    bfx = [f for f in T['fixtures'] if f['type'] == 'up-b380f']
    brows = [beam_recheck(W, WF, A, F, f, EF_all) for f in bfx]
    field = field_check(bfx, EF_all)
    field_no_lean = field_check(bfx, public_eyes(A, G, step=FIELD_STEP_M, lean=False))
    P_q, _ = public_index(A, G)
    S.wait_cool()
    par_eye = {('%g' % L): par_eye_check(W, gp, P_q, L) for L in PAR_SAFETY_LENSES_DEG}
    spread_field = field_check([f for f in SPR['fixtures'] if f['type'] == 'up-b380f'], EF_all, aim_only=True)
    spread_par_eye = par_eye_check(W, [f for f in SPR['fixtures'] if f['type'] == 'up-pl5403' and not f['part'].startswith('cut')], P_q, 15.0)
    pub_units = [f['id'] for f in T['fixtures'] if f['type'] in ('up-pl5403', 'up-b380f', 'up-yz31p') and not f['part'].startswith('cut') and A.public(f['p'][0], f['p'][2])]
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
                  for t in STAGE_FRONT_FLOORS_LX[lk]} for lk in stage}
    # OWNER DECISION: the PA faces. (a) as built: no floor lamp in the pit, the faces get what the rest of the rig gives;
    # (b) the barrier 1 m out (z 9.2, the crowd-safety lead's call) and round 1's two pit-end lamps back, at their round-1 levels
    pa_b = {}
    for k, o in PA_FACE_OLD.items():
        d = unit(np.asarray(o['aim']) - np.asarray(o['p']))
        f = {'id': 'option-b-%s' % k, 'type': 'up-pl5403', 'p': o['p'], 'r': rot_for_dir(d), 'angle_rad': 0.1309, 'part': 'x'}
        pa_b[k] = {t: R3(SP.e_on(W_sp, f, SP.TARGETS[t][0], SP.TARGETS[t][1], SP.PAR_CD_ROOM)) for t in ('PA L face', 'PA R face')}
    pa_faces = {'question': 'The PA boxes\' faces: lit from the truss (another workflow), or the barrier moved 1 m out (z 9.2) so two floor PARs can stand at the pit\'s ends out of reach?',
                'a_as_built': {'what': 'no floor PAR in the pit (MOXIR.md 5.3 holds); the faces get only what the rest of the rig gives', 'lx': {lk: {t: stage[lk]['room_30478cd'][t]['lx'] for t in ('PA L face', 'PA R face')} for lk in stage}},
                'b_barrier_out': {'what': 'the barrier at z 9.2 (the pit 1 m deeper: the crowd-safety lead), round 1\'s pit-end lamps back (x -10.25 z 7.0, x 0.2 z 7.6): each face\'s lux at full from its own lamp', 'lx_at_full': pa_b,
                                  'cost': 'the pit 1 m deeper over 13.6 m (~14 m2 of the dance floor), the barrier moved'},
                'spread_as_owner_saw_it': {lk: {t: stage_spread[lk][t]['lx'] for t in ('PA L face', 'PA R face')} for lk in stage_spread}}
    reach_front = {k: {'id': FRONT_IDS[k], 'behind_barrier_m': R3(BARRIER_Z - sf['p'][2]), 'out_of_reach': BARRIER_Z - sf['p'][2] >= OUT_OF_REACH_M,
                       'rule_m': OUT_OF_REACH_M, 'in_pit': inside_rect(sf['p'][0], sf['p'][2], PIT)} for k, sf in STAGE_FRONT.items()}
    in_pit = [f['id'] for f in gp if inside_rect(f['p'][0], f['p'][2], PIT)]
    zb, za = SP.zone_counts(SPR, Z), SP.zone_counts(T, Z)
    ko2 = {'x_m': ENTRY_LASERS['ko2']['x_m'], 'z_m': ENTRY_LASERS['ko2']['z_m']}
    entry = {'source': ENTRY_LASERS['source'],
             'units_in_tower_pen': [f['id'] for f in T['fixtures'] if f['type'] in ('up-pl5403', 'up-b380f', 'up-yz31p') and inside_rect(f['p'][0], f['p'][2], ko2)],
             'beam_aperture_gap_min_m': min(b['entry_aperture_gap_m'] for b in brows), 'beam_cubes_box_gap_min_m': min(b['cubes_box_gap_m'] for b in brows),
             'beam_far_wall_block_gap_min_m': min(b['far_wall_block_gap_m'] for b in brows), 'beams_into_laser_keep_out': [b['id'] for b in brows if b['into_laser_keep_out']],
             'rules': {'aperture_pad_m': APERTURE_PAD_M, 'block_free_m': BLOCK_FREE_M, 'why': 'ASSUMED margins: no B380F ray within 1 m of a laser unit, no B380F end within 3 m of a block'}}
    # A8: #873's strip: no unit and no line of this layer in it; the spread's own things there flagged
    out_units = [f for f in nontruss if f.get('region') not in ('stage pen',) and f.get('stands_in') != 'stage pen']
    faces = perimeter_lines(RT, out_units)
    faces_in_strip = [fc for fc in faces if in_corridor(fc[0], fc[1], 0.0, repo)]
    corr_units = [{'id': f['id'], 'band': in_corridor(f['p'][0], f['p'][2], 0.0, repo)['what'], 'limit_m': in_corridor(f['p'][0], f['p'][2], 0.0, repo)['highest_standing_surface_m'],
                   'region': 'stage pen' if A.in_pen(f['p'][0], f['p'][2]) else f.get('region')} for f in T['fixtures'] if f['type'] in ('up-pl5403', 'up-b380f', 'up-yz31p') and not f['part'].startswith('cut') and in_corridor(f['p'][0], f['p'][2], 0.0, repo)]
    corridor_check = {'source': '%s under_the_beams (#873)' % ENTRY_LASER_RIG, 'bands': corridor(repo),
                      'this_layer_units_in_strip': [u['id'] for u in corr_units if u['region'] != 'stage pen'],
                      'this_layer_lines_in_strip_m': len(faces_in_strip), 'barriers_added_by_this_layer_m': 0.0, 'refused_before_the_pick': strip_refused, 'line_near_m': LINE_NEAR_M,
                      'flagged_not_this_layer': {'stage pen units (crew only; B\'s fan and the two stage-front lamps, as the spread had them)': [u['id'] for u in corr_units if u['region'] == 'stage pen'],
                                                 'the stage pen\'s own barrier (owed since the spread)': 'its back (z -7.5) and front (z 8.2, the crowd barrier) cross the strip x -10.75..-3.13 (limit 0.34 m): the laser lead (LSO) and the crowd-safety lead must accept them as unclimbable, or the strip moves'},
                      'ok': not [u for u in corr_units if u['region'] != 'stage pen'] and not faces_in_strip}
    # A9: practice
    gaps_barriers = []
    sp_r = {'x_m': A.stage_pen['x_m'], 'z_m': A.stage_pen['z_m']}
    for fc in faces:
        for name, R in (('the stage pen', sp_r), ('the tower pen (KO-2)', ko2)):
            g = float(_rect_gap(np.asarray([fc[0]]), np.asarray([fc[1]]), R)[0])
            if g > 0:
                gaps_barriers.append((g, name, fc))
    gaps_barriers.sort()
    by_reg = {}
    for fc in faces:
        reg = region_of(fc[0], fc[1], A)
        by_reg[reg] = by_reg.get(reg, 0) + 1
    order = {'perimeter_line': {'length_m': len(faces), 'by_area_m': by_reg, 'type': 'a boundary line (not a crowd-pressure line): pedestrian barrier 1.1 m or fence (ASSUMED; the crowd-safety lead chooses); where a unit stands behind the public floor\'s edge within 6 m',
                                'measure': 'the 1 m faces of the public floor\'s edge (a staircase: an upper bound, up to 1.41 x the straight line)'},
             'stage_pen_barrier_m': R3(2 * (A.stage_pen['x_m'][1] - A.stage_pen['x_m'][0]) + 2 * (A.stage_pen['z_m'][1] - A.stage_pen['z_m'][0]) - (A.stage_pen['x_m'][1] - A.stage_pen['x_m'][0]) + 2 * (STAGE_BAY['x_m'][1] - STAGE_BAY['x_m'][0])),
             'stage_pen_barrier_note': 'the stage pen\'s back and sides (the front is the existing crowd barrier at z 8.2) + A13\'s bay x -12..-10.5, z 1.75..6.5 (+3.0 m: its two ends; its outer side replaces the pen\'s side there): owed since the spread, not this layer\'s',
             'floor_plates': {'count': sum(1 for f in bfx), 'what': '600 x 600 x 18 mm plywood, one per B380F (B\'s fan included)'},
             'sandbags': {'count': 2 * len(bfx), 'kg_each': 15.0, 'kg_total': 30.0 * len(bfx), 'alternative': BASE['anchors_alternative']},
             'cable_protectors': {'sections': int(len(union) / RAMP_SECTION_M + 0.999), 'public_metres_union': len(union), 'crossings': len(xings),
                                  'what': 'every metre of cable run over public floor (the union of all runs: power, DMX, feeders, network) under a cable protector; %g m sections ASSUMED; 5-channel protectors carry several runs' % RAMP_SECTION_M},
             'stewards': {'count': len(by_reg), 'areas': sorted(by_reg), 'basis': 'ASSUMED: one steward per area where the line stands (the Purple Guide is not read); the stage pen is crew (the stage manager)'},
             'public_floor_lost_m2': 0.0, 'public_floor_lost_why': 'no unit and no barrier of this layer stands on the public floor (A2)',
             'par_fixing': 'each PAR stands on its own yoke on the floor, outside the line (no plate: no moving part; a cable tie to the line where one is near)'}
    smoke = next(f for f in T['fixtures'] if f['type'] == 'up-yz31p')
    smoke_path = {'machine': smoke['p'], 'refill_point': list(SMOKE_SERVICE), 'in_stage_pen': inside_rect(SMOKE_SERVICE[0], SMOKE_SERVICE[1], A.stage_pen),
                  'refill_from_public_m': R3(float(dist_public(A, G, np.asarray([SMOKE_SERVICE]))[0])),
                  'plan': 'the machine stands on the crew side (the stage pen); both 6 L tanks (running + spare) and the fluid are staged INSIDE the stage pen before doors, so a refill is a crew action from the back lane (x -10.5..1.5, z -7.5..-6.6) with no crossing of the crowd; the crew reach the pen by the artists\' route (the crowd plan, owed)',
                  'ok': inside_rect(SMOKE_SERVICE[0], SMOKE_SERVICE[1], A.stage_pen)}
    cov_new = coverage(hall_p, cells)
    cov_old = coverage([f for f in SPR['fixtures'] if f['type'] == 'up-pl5403' and not f['part'].startswith('cut')], cells)
    pool_pts = [{'p': [q['pool'][0], 0.0, q['pool'][2]]} for q in pars]
    cov_pool = coverage(pool_pts, cells)
    beam_cov = {}
    for key, rig in (('spread', SPR), ('ground', T)):
        bs = [f for f in rig['fixtures'] if f['type'] == 'up-b380f']
        bases = np.asarray([[f['p'][0], f['p'][2]] for f in bs], float)
        dmin = np.min(np.hypot(cells[:, None, 0] - bases[None, :, 0], cells[:, None, 1] - bases[None, :, 1]), axis=1)
        bands = {n: 0 for n, _, _ in BEAM_BANDS}
        for f in bs:
            bands[band_of(f['p'][2])] += 1
        beam_cov[key] = {'base_gap_median_m': R3(np.median(dmin)), 'base_gap_max_m': R3(dmin.max()), 'bases_by_z_band': bands,
                         'bases_in_entry_half': sum(1 for f in bs if f['p'][2] >= ENTRY_HALF_Z), 'worst_cell': [R3(v) for v in cells[int(np.argmax(dmin))]]}
    beam_cov['rule'] = {'gap_max_m': SPREAD_BEAM_GAP_M, 'every_band_holds_a_base': True, 'ok': beam_cov['ground']['base_gap_max_m'] <= SPREAD_BEAM_GAP_M and all(v > 0 for v in beam_cov['ground']['bases_by_z_band'].values())}
    onn = sorted(min(math.hypot(a['p'][0] - b['p'][0], a['p'][2] - b['p'][2]) for b in old_pars if b is not a) for a in old_pars)
    S.wait_cool()
    eyes_b = eye_totals(WF, F, SPR['fixtures'], A)
    eyes_a = eye_totals(WF, F, T['fixtures'], A)
    epic = epic_table(eyes_b, eyes_a, wtable)
    pk_a = next(l for l in T['looks'] if l['id'] == 'peak')
    epic_peak = epic_table(eye_totals(WF, F, SPR['fixtures'], A, pk_s), eye_totals(WF, F, T['fixtures'], A, pk_a), wtable)
    epic_peak_eq = epic_table(eyes_s_eq, eye_totals(WF, F, T['fixtures'], A, pk_a, equal=True), wtable)
    entry_gate = {'eyes': list(ENTRY_EYES), 'beam_ratio': {e: epic_peak_eq['per_eye'][e]['beam_ratio'] for e in ENTRY_EYES},
                  'par_ratio': {e: epic_peak_eq['per_eye'][e]['par_ratio'] for e in ENTRY_EYES},
                  'ok_beams': all(epic_peak_eq['per_eye'][e]['beam_ratio'] >= 1.0 for e in ENTRY_EYES),
                  'ok_pars': all(epic_peak_eq['per_eye'][e]['par_ratio'] >= 1.0 for e in ENTRY_EYES),
                  'what': 'A5: each entry-side eye at the peak, ground / spread, at EQUAL COLOURS (level x light, the colour\'s luminance left out of both)'}
    # OWNER DECISION: the bar / chill: what the same pick gives with pools allowed there
    bc_rig = [dict(f) for f in T['fixtures'] if not (f['type'] == 'up-pl5403' and f['part'] not in FRONT_PARTS.values() and not f['part'].startswith('cut'))]
    for q in pars_bc:
        bc_rig.append({'id': q['id'], 'type': 'up-pl5403', 'part': par_part(q), 'p': q['p'], 'r': rot_for_dir(q['dir']), 'colour': EMBER})
    bc_eq = eye_totals(WF, F, bc_rig, A, pk_a, equal=True)
    bar_chill = {'question': 'Light on the bar and the chill + food zones (they are in your paint, marked bar / chill)?',
                 'a_as_built': {'what': 'no PAR pool and no beam end on the bar or the chill + food zone', 'par_lx_at_eye_peak_equal': {e: epic_peak_eq['per_eye'][e]['par_lx'][1] for e in ENTRY_EYES},
                                'pools_on_bar_or_chill': 0},
                 'b_allowed': {'what': 'the same pick with PAR pools allowed over the bar and the chill (beams still never end there)',
                               'par_lx_at_eye_peak_equal': {e: bc_eq['par_lux_at_eye'][e] for e in ENTRY_EYES},
                               'pools_on_bar_or_chill': sum(1 for q in pars_bc if q.get('pool_in_bar_or_chill'))},
                 'spread': {e: eyes_s_eq['par_lux_at_eye'][e] for e in ENTRY_EYES}}
    fan_rows = [b for b in brows if b['island'] == 'the stage pen']
    fan_kept = all(next(f for f in T['fixtures'] if f['id'] == s_['id'])['r'] == s_['r'] and next(f for f in T['fixtures'] if f['id'] == s_['id'])['p'] == s_['p']
                   for s_ in SPR['fixtures'] if s_['part'].startswith('plane 1'))
    palette = []
    sp_peak = pk_s['parts']
    for part in sorted(set(pk_a['parts']) - {'laser'}):
        col, lev = pk_a['parts'][part]
        palette.append({'part': part, 'peak_colour': col, 'peak_level': lev, 'spread_colour': (sp_peak.get(part) or [None])[0], 'spread_level': (sp_peak.get(part) or [None, None])[1],
                        'changed': (sp_peak.get(part) or [None])[0] != col, 'why': PART_COLOUR_PEAK.get(part, (None, 'kept as the spread'))[1],
                        'units': sum(1 for f in T['fixtures'] if f['part'] == part)})
    ash_units = sum(r['units'] for r in palette if r['peak_colour'] == ASH)
    looks_max = {lk['id']: max([v[1] for k, v in lk['parts'].items() if k != 'laser'] or [0]) for lk in T['looks']}
    c878 = checks_878(T, A, G)  # A13-A15 (#878); caps a beam's pan on its desk limits where its window (not its aim) would meet the crane or the cubes
    checks = {
        'round': ROUND,
        'kit': {'UP-PL5403': {'hung': sum(f['type'] == 'up-pl5403' for f in T['fixtures']), 'on_the_truss': sum(f['part'].startswith('cut') for f in T['fixtures']),
                              'on_the_ground': len(gp), 'ordered': 50},
                'UP-B380F': sum(f['type'] == 'up-b380f' for f in T['fixtures']), 'UP-YZ31P': sum(f['type'] == 'up-yz31p' for f in T['fixtures']),
                'EXT-LC-ULTRA-MK2': sum(f['type'] == 'ext-lc-ultra-mk2' for f in T['fixtures'])},
        'ground_units': len(nontruss), 'units_on_ground': sum(f['p'][1] <= GROUND_MAX_Y for f in nontruss),
        'units_above_ground': [f['id'] for f in nontruss if f['p'][1] > GROUND_MAX_Y],
        'in_the_crane_park_above_2_5m': in_park,
        'public_floor': {'units_on_it': pub_units, 'barriers_added_on_it_m': 0.0 if A.island is None else R3(2 * sum(A.island[k][1] - A.island[k][0] for k in ('x_m', 'z_m'))),
                         'islands': 0 if A.island is None else 1,
                         **({'island': dict(A.island, area_m2=R3((A.island['x_m'][1] - A.island['x_m'][0]) * (A.island['z_m'][1] - A.island['z_m'][0])),
                                            painted_m2_taken=int(sum(1 for x in np.arange(A.island['x_m'][0] + 0.125, A.island['x_m'][1], 0.25) for z in np.arange(A.island['z_m'][0] + 0.125, A.island['z_m'][1], 0.25)
                                                                     if any(A.Z.inside(k, x, z, 0.0) for k in ('hot', 'use', 'bar', 'chill')))) / 16.0)} if A.island is not None else {}),
                         'door_walkway': DOOR_WALK,
                         'units_by_area': {r: sum(1 for f in nontruss if f.get('region') == r) for r in ('stage pen', 'house left', 'house right', 'far end', 'entry', 'machine')},
                         'what': 'A2: the public floor = the paint (hot, wings, bar, chill) + the door walkway, less the stage pen and the machines; no unit and no barrier of this layer on it; no island'},
        'eye_weights': wtable,
        'par_spacing': {'rule_m': PAR_MIN_SPACING_M, 'applies_to': 'the hall\'s %d washes' % len(hall_p), 'min_m': R3(nn[0]), 'median_m': R3(nn[len(nn) // 2]),
                        'pairs_closer': pairs_closer(hall_p, PAR_MIN_SPACING_M), 'spread_min_m': R3(onn[0]), 'spread_median_m': R3(onn[len(onn) // 2])},
        'par_coverage': {'ground_bases': cov_new, 'ground_pools': cov_pool, 'spread_bases': cov_old, 'cells': len(cells), 'cover_r_m': PAR_COVER_R_M,
                         'what': 'plan distance from every 1 m cell of the hot zone + wings (not the bar or chill zone) to the nearest hall PAR base, and (ground_pools) to the nearest PAR POOL (where its axis lands on the steel)'},
        'beam_coverage': beam_cov, 'beam_pick': bpick,
        'par_places': {'refused': refused, 'stands_in': {k: sum(1 for f in gp if f.get('stands_in') == k) for k in ('stage pen', 'machine', 'out of the crowd')}},
        'par_eye_rule': {k: {kk: vv for kk, vv in v.items() if kk != 'rows'} for k, v in par_eye.items()},
        'stage_front': {'lamps': {k: {'id': FRONT_IDS[k], 'part': FRONT_PARTS[k], 'p': STAGE_FRONT[k]['p'], 'targets': list(STAGE_FRONT[k]['targets']),
                                      'lx_at_full_room': {t: R3(full[k][t]) for t in STAGE_FRONT[k]['targets']}, 'levels': front_lv.get(k), 'why': STAGE_FRONT[k]['why'],
                                      'reach': reach_front[k]} for k in STAGE_FRONT},
                        'floors': floors, 'all_floors_met': all(v['ok'] for lk in floors.values() for v in lk.values()), 'pa_faces': pa_faces, 'pars_in_the_pit': in_pit,
                        'out_of_reach_rule': 'ISO 13857:2019 Table 2 (high risk): a 0.4-0.6 m high hazard behind a 1.0 m barrier, c = 1.4 m (as reproduced in the Troax Safety Guide; EQUIVALENT)'},
        'entry_lasers': entry, 'corridor_873': corridor_check,
        'fan': {'kept_from_spread': fan_kept, 'heads': [b['id'] for b in fan_rows], 'all_ok': all(b['ok'] for b in fan_rows), 'strip': FAN_STRIP, 'crew_lanes': CREW_LANES,
                'smoke_service': list(SMOKE_SERVICE), 'smoke_service_gap_m_min': min(b['smoke_service_gap_m'] for b in fan_rows),
                'crew_lane_gap_m_min': min(b['crew_lane_gap_m'] for b in fan_rows), 'near_crane': {b['id']: b['near_crane_parks'] for b in fan_rows}},
        'beams': len(brows), 'beams_ok': sum(b['ok'] for b in brows), 'beams_ending_in_bar_or_chill': [b['id'] for b in brows if b['ends_in_bar_or_chill']],
        'beams_into_crane_or_park': [b['id'] for b in brows if b['into_crane_or_park']], 'beam_glare_min_deg': min(b['glare_min_deg_any'] for b in brows),
        'beam_field_glare': field, 'beam_field_glare_standing_only': {k: v for k, v in field_no_lean.items() if k != 'exceptions'},
        'beam_head_from_public_m_min': min(b['head_from_public_m'] for b in brows if b['island'] != 'the stage pen'),
        'beam_low_run_public_gap_m_min': min(b['low_run_public_gap_m'] for b in brows if b['island'] != 'the stage pen'),
        'spread_by_the_same_rules': {'field_glare_fail_pct_aims_only': spread_field['fail_pct'], 'par_eye_fail_count_15deg': spread_par_eye['fail_count'],
                                     'what': 'the spread (#864) by the same dense 30 deg rule (its aims alone) and the same PAR eye rule at 15 deg'},
        'beam_windows_ok': all(not b['window']['directions_refused'] for b in brows),
        'dj_glare_ok': {k: v['ok'] for k, v in glare.items()}, 'dj_glare_all_at_full_ok': glare_full['ok'],
        'dj_key': {'deg_from_eye_line': next((r['deg_from_eye_line'] for r in glare_full['lenses_seen'] if r['part'] == KEY_PART), None),
                   'levels': front_lv.get('key'), 'face_lx_full_room': R3(full['key']['DJ face']), 'combine_with': 'the truss DJ light (another workflow)'},
        'palette': {'peak': palette, 'ash_units_at_peak': ash_units, 'ash_parts': [r['part'] for r in palette if r['peak_colour'] == ASH],
                    'changed_vs_spread': [r for r in palette if r['changed']],
                    'what': 'A3: every part of the peak look, its colour and level against the spread\'s same part (None = the spread has no such part); each change with its reason'},
        'headroom': {'peak_cap': PEAK_CAP, 'max_level_by_look': looks_max, 'ok': all(v <= PEAK_CAP + 1e-9 for v in looks_max.values()),
                     'glare_rule': GLARE_RULE_STATUS, 'b380f_iec_62471': 'UNKNOWN: the rental (Poligraf) gives the risk group and the hazard distance; until then the 30 deg rule (ASSUMED), the line and the desk windows are the controls',
                     'what': 'A4: no beam or PAR part of any look above the cap (the laser part is the desk cap of the cubes, measured)'},
        'level_law': 'linear: a fader at L draws L (the #868 fix); stage light computed with exponent %d' % ROOM_LEVEL_EXP,
        'level_tuning': LEVEL_TUNING,
        'laser_cap': {'peak_fader': pk_a['parts'].get('laser'), 'desk_caps': pk_a.get('desk_caps'), 'source': 'the spread\'s cap after a9d4b0d1: fader 0.16 = the drawn fraction measured under the 0.65 % budget'},
        'stage_light_lx_room': {lk: {t: stage[lk]['room_30478cd'][t]['lx'] for t in SP.TARGETS} for lk in stage},
        'stage_light_lx_room_spread': {lk: {t: stage_spread[lk][t]['lx'] for t in SP.TARGETS} for lk in stage_spread},
        'laser_body_min_margin_m': clear[0]['margin_m'], 'laser_tubes_entered': [c['id'] for c in clear if c['margin_m'] < 0],
        'circuits': len(circ), 'circuits_ok': all(c.get('ok', True) for c in circ), 'phases_w': ph, 'dmx_lines_ok': all(l['ok'] for l in lines),
        'dmx_devices_max': max(l['devices'] for l in lines), 'connected_w': sum(c['load_w'] for c in circ),
        'cables': {'public_m_by_kind': {'power': R3(sum(c.get('public_m', 0) for c in circ)), 'dmx': R3(sum(l['public_m'] for l in lines)),
                                        'feeders': R3(sum(r['public_m'] for r in feeders)), 'network': R3(sum(r['public_m'] for r in network))},
                   'crossings': xings, 'protector_metres': len(union), 'cable_list': cable_list,
                   'what': 'A9: every run (power legs, DMX legs, feeders, network) along the cable router (1 m grid; a public metre costs %g; machines, columns and the tower pen blocked); a crossing = a stretch of consecutive public cells of one run; the protector metres = the union over all runs; ALL public floor counts (the paint + the door walkway + the artists\' route)' % PUBLIC_COST},
        'smoke_path': smoke_path, 'barrier_gaps_min': [{'gap_m': R3(g), 'to': n, 'at': fc} for g, n, fc in gaps_barriers[:3]],
        'barrier_gap_ok': (not gaps_barriers) or gaps_barriers[0][0] >= 1.2,
        'order': order,
        'zones_after': za, 'objective': {'pars': R3(objective(Ptot)), 'beams': R3(objective(Gtot))},
        'epic': epic, 'epic_peak_look': epic_peak, 'epic_peak_equal_colours': epic_peak_eq, 'entry_gate': entry_gate,
        'owner_decisions': {'bar_and_chill': bar_chill, 'pa_faces': pa_faces, 'a5_island': a5_island(out, beam_cov, entry_gate) if not VARIANT else None},
        'floor_glare_peak_measured': None,
        'near_crane_878': c878,
    }
    rules = {'round': ROUND, 'ground_max_y_m': GROUND_MAX_Y, 'par_min_spacing_m': PAR_MIN_SPACING_M, 'crane_park': CRANE_PARK, 'pen_clear_over_m': CLEAR_OVER_M,
             'hand_m': HAND_M, 'barrier_reach_m': BARRIER_REACH_M, 'head_reach_m': HEAD_REACH_M, 'par_reach_m': PAR_REACH_M, 'glare_deg': GLARE_DEG,
             'glare_rule_status': GLARE_RULE_STATUS, 'lean_m': LEAN_M, 'par_safety_lenses_deg': list(PAR_SAFETY_LENSES_DEG), 'par_design_lens_deg': PAR_DESIGN_LENS_DEG,
             'peak_cap': PEAK_CAP, 'beam_min_spacing_m': BEAM_MIN_SPACING_M, 'beam_cover_r_m': BEAM_COVER_R_M, 'door_walk': DOOR_WALK, 'artists_route': ARTISTS_ROUTE,
             'pit': PIT, 'dj_rule_deg': DJ_RULE_DEG, 'min_throw_m': MIN_THROW_M, 'eyes': EYES, 'eye_weights': {e: wtable[e]['weight'] for e in EYES},
             'objective': 'sum over eyes (weighted by the people each stands for) and depth bins of sqrt(light): PAR lx from lit surfaces (Lambertian, one bounce, the crowd not see-through), beam G (single scattering, haze t40)',
             'window': {'pan_deg': PAN_WIN_DEG, 'tilt_up_deg': TILT_UP_DEG, 'aim_tol_deg': AIM_TOL_DEG, 'aperture_r_m': APERTURE_R_M}, 'base': BASE, 'rules': RULES, 'par_rules': PAR_RULES}
    review = {'from': RIG_SP, 'owner': OWNER_WORDS, 'ledger': 'N465', 'brief': '~/work/agent-reports-2026-10-09/moxir-lead/ground-round2-brief.md',
              'zones_before': zb, 'zones_after': za, 'eyes_before': eyes_b, 'eyes_after': eyes_a, 'epic': epic, 'epic_peak_look': epic_peak, 'epic_peak_equal_colours': epic_peak_eq,
              'beam_checks': brows, 'dj_glare': glare, 'dj_glare_all_at_full': glare_full, 'stage_light': stage, 'stage_light_spread': stage_spread,
              'front_levels': front_lv, 'laser_clearance_tightest': clear[:5], 'par_eye_rows': {k: v['rows'] for k, v in par_eye.items()}, 'perimeter_faces': faces}
    n_out = sum(1 for f in gp if f.get('stands_in') == 'out of the crowd')
    T.update({'snapshot': 'moxir-v2-ground-%s' % DATE, 'version': 'MOXIR v2 ground (round 2) · on the ground, out of the crowd',
              'title': 'MOXIR v2 ground · on the ground, out of the crowd',
              'what': ('The spread, with every wash and beam that is not on the truss brought down to the floor (owner 10-09 21:05) and, round 2 (2026-10-10), every one of them OUT OF THE CROWD: '
                       '%d PARs on the floor (the truss keeps 10): %d along the walls, the wall column rows, the far end and the entry wall, the DJ key and the booth lamp behind the PA line in the stage pen, '
                       'no two of the hall\'s closer than %.0f m; B\'s ember fan behind the DJ as the owner saw it, and 12 beams at the walls, the far end and the entry corner, each with a desk window the '
                       'line at the public floor\'s edge holds. No unit and no barrier on the public floor; the patch is the official v2 patch (#872).') % (len(gp), n_out, PAR_MIN_SPACING_M),
              'written_by': 'scripts/place/moxir_v2_ground.py build (from %s; the layer %s)' % (RIG_SP, LAYER), 'date': DATE, 'round': ROUND, 'from_rig': RIG_SP, 'ground_layer': LAYER,
              'ground_rules': rules, 'checks': checks, 'review': review, 'owed': OWED})
    T.pop('reserved_for_truss', None)
    T['requires'] = dict(T['requires'], ground=('a line (barrier or fence, %d m: checks.order.perimeter_line) where the public floor\'s edge has a unit behind it; every floor B380F bolted to a ballasted floor plate '
                                                '(600 x 600 mm + 2 x 15 kg), levelled to +-1 deg, its desk window set by hand from the operator sheet (pan +-%g deg, tilt never below its aim) and its shutter closed on DMX loss and in a reset; '
                                                'B\'s fan strip marked on the stage floor; %d m of cable protector over public floor; the venue\'s OK for floor plates') % (len(faces), PAN_WIN_DEG, len(union)),
                     safety_in_desk='B380F pan/tilt limits per head (the operator sheet: docs/moxir/moxir-v2-ground-operator-sheet.md; desk_limits in each fixture): set by hand, no desk enforces them yet (OWED code)')
    T['requires'].pop('stage_front', None)
    L_ = {'what': 'MOXIR v2 GROUND LAYER (round 2): ONLY the lamps on the floor (%d UP-PL5403 + %d UP-B380F), out of the crowd; ids kept from %s where a unit just moves' % (len(gpars), len(beams), RIG_SP),
          'date': DATE, 'round': ROUND, 'owner': OWNER_WORDS, 'ledger': 'N465', 'written_by': 'scripts/place/moxir_v2_ground.py build', 'from_rig': RIG_SP, 'full_rig': RIG_GR,
          'frame': SPR['frame'], 'rules': rules, 'islands': [{'island': 'the stage pen', 'kind': 'stage pen', 'rect': {'x_m': list(A.stage_pen['x_m']), 'z_m': list(A.stage_pen['z_m'])}},
                                                   {'island': 'the stage pen\'s bay (A13, #878)', 'kind': 'stage pen', 'rect': {'x_m': list(STAGE_BAY['x_m']), 'z_m': list(STAGE_BAY['z_m'])}}]
                       + ([{'island': A.island['name'], 'kind': 'island', 'rect': {'x_m': list(A.island['x_m']), 'z_m': list(A.island['z_m'])}, 'why': A.island['why']}] if A.island is not None else []),
          'perimeter_faces': faces, 'fixtures': layer,
          'checks': {k: checks[k] for k in ('units_on_ground', 'units_above_ground', 'in_the_crane_park_above_2_5m', 'public_floor', 'par_spacing', 'par_coverage', 'beam_coverage',
                                             'par_places', 'par_eye_rule', 'stage_front', 'fan', 'beams', 'beams_ok', 'beams_ending_in_bar_or_chill', 'beams_into_crane_or_park',
                                             'beam_glare_min_deg', 'beam_field_glare', 'beam_windows_ok', 'entry_lasers', 'corridor_873', 'dj_glare_ok', 'dj_glare_all_at_full_ok', 'dj_key',
                                             'level_law', 'eye_weights', 'epic', 'epic_peak_look', 'epic_peak_equal_colours', 'entry_gate', 'palette', 'headroom', 'order', 'smoke_path',
                                             'owner_decisions', 'floor_glare_peak_measured', 'near_crane_878')}}
    if VARIANT:                                   # an option (OWNER DECISION): measured beside the rig, never written over it
        out = os.path.join(out, VARIANT)
        os.makedirs(out, exist_ok=True)
        json.dump(L_, open(os.path.join(out, os.path.basename(LAYER)), 'w'), indent=1, default=JD)
        json.dump(T, open(os.path.join(out, os.path.basename(RIG_GR)), 'w'), indent=1, default=JD)
    else:
        json.dump(L_, open(os.path.join(repo, LAYER), 'w'), indent=1, default=JD)
        json.dump(T, open(os.path.join(repo, RIG_GR), 'w'), indent=1, default=JD)
    os.makedirs(out, exist_ok=True)
    json.dump({'checks': checks, 'review': review}, open(os.path.join(out, 'checks.json'), 'w'), indent=1, default=JD)
    operator_sheet(T, [out] if VARIANT else [os.path.join(repo, 'docs/moxir'), out])
    plan_picture(SPR, None, os.path.join(out, 'plan-spread.png'), 'v2 spread (old): brackets on the columns, beams at 3.7 m')
    plan_picture(T, faces, os.path.join(out, 'plan-ground.png'), 'v2 ground, round 2: on the ground, out of the crowd')
    cable_picture(T, RT, union, xings, os.path.join(out, 'plan-cables.png'))
    print(json.dumps({'beams_ok': '%d/%d' % (checks['beams_ok'], checks['beams']), 'beam_pick': bpick, 'pars': len(gp), 'stands_in': checks['par_places']['stands_in'],
                      'refused': refused, 'public_floor': checks['public_floor'], 'spacing': {k: v for k, v in checks['par_spacing'].items() if k != 'pairs_closer'},
                      'field_glare': {k: v for k, v in field.items() if k not in ('exceptions', 'what')}, 'field_exceptions': field['exceptions'][:8],
                      'par_eye': {k: (v['fail_count'], v['fail'][:5]) for k, v in par_eye.items()}, 'stage_floors': floors, 'front_levels': front_lv,
                      'dj_glare_ok': checks['dj_glare_ok'], 'dj_full_ok': glare_full['ok'], 'circuits_ok': checks['circuits_ok'], 'dmx_ok': checks['dmx_lines_ok'],
                      'dmx_max': checks['dmx_devices_max'], 'phases': ph, 'cables': {k: v for k, v in checks['cables'].items() if k not in ('cable_list', 'crossings', 'what')},
                      'crossings': len(xings), 'order': order, 'c878': {k: v for k, v in c878.items() if k not in ('beams', 'source')}, 'corridor': {k: v for k, v in corridor_check.items() if k != 'bands'},
                      'epic': {k: v for k, v in epic.items() if k != 'per_eye'}, 'epic_peak_eq': {k: v for k, v in epic_peak_eq.items() if k != 'per_eye'},
                      'entry_gate': entry_gate, 'beam_coverage': beam_cov, 'headroom': checks['headroom']['max_level_by_look'],
                      'bad_beams': [{k: b[k] for k in ('id', 'ring_why', 'low_run_ok', 'crew_ok', 'field_glare_min_deg', 'named_glare_min_deg', 'head_from_public_m', 'in_873_strip')} | {'win_bad': b['window']['directions_refused'][:2]} for b in brows if not b['ok']]},
                     indent=1, default=JD))


# ====================================================================== the plan picture (top view)
def plan_picture(rig, pens, path, title, par_pens=None):
    """The top view: the paint, the hall, the units with each beam to its first hit; round 2: pens = the perimeter faces (the line
    at the public floor's edge where a unit stands behind it), the stage pen, #873's strip, the artists' route, the door walkway."""
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
    if pens is not None:
        sp = {'x_m': (-10.5, 1.5), 'z_m': (-7.5, 8.2)}
        ax.add_patch(Rectangle((sp['x_m'][0], sp['z_m'][0]), sp['x_m'][1] - sp['x_m'][0], sp['z_m'][1] - sp['z_m'][0], fill=False, ec='#6fe08f', lw=1.4, zorder=4))
        ax.text(sp['x_m'][1] + 0.3, sp['z_m'][1] + 1.2, 'stage pen (crew)', color='#6fe08f', fontsize=6, zorder=8)
        fs = FAN_STRIP
        ax.add_patch(Rectangle((fs['x_m'][0], fs['z_m'][0]), fs['x_m'][1] - fs['x_m'][0], fs['z_m'][1] - fs['z_m'][0], fc='#ff7a52', alpha=0.18, ec='#ff7a52', lw=0.6, zorder=3))
        for name, R in CREW_LANES.items():
            ax.add_patch(Rectangle((R['x_m'][0], R['z_m'][0]), R['x_m'][1] - R['x_m'][0], R['z_m'][1] - R['z_m'][0], fill=False, ec='#6fe08f', lw=0.6, ls=':', zorder=3))
        for b in corridor(repo):
            ax.add_patch(Rectangle((b['x_strip_m'][0], b['z_m'][0]), b['x_strip_m'][1] - b['x_strip_m'][0], b['z_m'][1] - b['z_m'][0], fc='#e070ff', alpha=0.07, ec='#e070ff', lw=0.4, ls=':', zorder=2))
        ax.text(-10.5, -50.0, '#873 40 W strip:\nnothing to stand on', color='#e070ff', fontsize=6, ha='right')
        ar = ARTISTS_ROUTE
        ax.add_patch(Rectangle((ar['x_m'][0], ar['z_m'][0]), ar['x_m'][1] - ar['x_m'][0], ar['z_m'][1] - ar['z_m'][0], fill=False, ec='#8fd0ff', lw=0.6, ls='--', zorder=3))
        ax.text(ar['x_m'][1] + 0.4, -46.0, "artists' route", color='#8fd0ff', fontsize=6)
        dw = DOOR_WALK
        ax.add_patch(Rectangle((dw['x_m'][0], dw['z_m'][0]), dw['x_m'][1] - dw['x_m'][0], dw['z_m'][1] - dw['z_m'][0], fc='#e04000', alpha=0.07, lw=0, zorder=2))
        ax.text(dw['x_m'][0] + 0.3, dw['z_m'][1] - 1.0, 'door walkway (public)', color='#e08060', fontsize=6)
        for (mx, mz, run) in pens:
            if run == 'z':
                ax.plot([mx, mx], [mz - 0.5, mz + 0.5], color='#ffffff', lw=1.6, zorder=5)
            else:
                ax.plot([mx - 0.5, mx + 0.5], [mz, mz], color='#ffffff', lw=1.6, zorder=5)
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
    hand = [plt.Line2D([], [], marker='o', ls='', color='#ff3a12', label='PAR, ember'), plt.Line2D([], [], marker='o', ls='', color='#e8e4dc', label='PAR, ash'),
            plt.Line2D([], [], marker='o', ls='', color='#ffb08a', label='PAR on the cut (truss: not this layer)'), plt.Line2D([], [], marker='s', ls='', color='#cfe6ff', label='B380F + its beam to its first hit'),
            plt.Line2D([], [], marker='o', ls='', fillstyle='none', color='#ffffff', label='white ring: up on the steel (over 1.5 m)'),
            plt.Line2D([], [], color='#ffffff', lw=1.6, label='the line at the public floor\'s edge (units behind it)'),
            plt.Line2D([], [], color='#6fe08f', lw=1.4, label='the stage pen (crew)'), plt.Line2D([], [], marker='x', ls='', color='#ffd84a', label='an audience eye (1.7 m)')]
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


def cable_picture(rig, RT, union, xings, path):
    """A9: the cable plan. Left: every power run (each leg along the router, from its distro) and the feeders; right: every DMX
    line (from its node) and the network from the desk. The public floor shaded; every metre of cable over it (the union of all
    runs, under protectors) in red."""
    import numpy as np
    import matplotlib
    matplotlib.use('Agg')
    import matplotlib.pyplot as plt
    from matplotlib.patches import Rectangle
    fig, axs = plt.subplots(1, 2, figsize=(18, 13), dpi=100)
    fig.patch.set_facecolor('#0b0c0e')
    pw = [(c['route'], False) for c in rig['power']['circuits'] if c.get('route')] + [(r['route'], True) for r in rig['power'].get('feeders', [])]
    dm = [(l['route'], False) for l in rig['patch']['lines']] + [(r['route'], True) for r in rig['patch'].get('network', [])]
    sites = dict(DISTROS_R2)
    nodes = dict(NODES_R2, CONTROL=CONTROL_SITE)
    for ax, (routes, col, title, st) in zip(axs, ((pw, '#ffcf5a', 'power: every 16 A run from its distro, and the feeders (dashed: the board ASSUMED at D-LEFT)', sites),
                                                 (dm, '#6fd0ff', 'DMX: every line from its node (<= %d devices) and the Art-Net network from the desk' % DMX_MAX_DEVICES, nodes))):
        ax.set_facecolor('#111214')
        P = np.argwhere(RT.public)
        ax.scatter(RT.x0 + 0.5 + P[:, 0], RT.z0 + 0.5 + P[:, 1], s=2.0, marker='s', color='#3a2a20', lw=0)
        B = np.argwhere(RT.block)
        ax.scatter(RT.x0 + 0.5 + B[:, 0], RT.z0 + 0.5 + B[:, 1], s=2.0, marker='s', color='#3b342c', lw=0)
        for rt, trunk in routes:
            ax.plot([q[0] for q in rt], [q[1] for q in rt], color=col, lw=1.2 if trunk else 0.8, alpha=0.8, ls='--' if trunk else '-')
        for k, s_ in st.items():
            ax.plot(s_[0], s_[2], 's', color=col, ms=7, mec='#000')
            ax.text(s_[0] + 0.8, s_[2] - 0.8, k, color=col, fontsize=7)
        U = np.asarray(union) if len(union) else np.zeros((0, 2))
        if len(U):
            ax.scatter(RT.x0 + 0.5 + U[:, 0], RT.z0 + 0.5 + U[:, 1], s=9.0, marker='s', color='#ff5050', lw=0, zorder=5)
        for f in rig['fixtures']:
            if f['type'] in ('up-pl5403', 'up-b380f', 'up-yz31p') and not f['part'].startswith('cut'):
                ax.plot(f['p'][0], f['p'][2], 'o' if f['type'] == 'up-pl5403' else 's', color='#e8e4dc', ms=2.8)
        ax.set_xlim(-37, 37)
        ax.set_ylim(56, -56)
        ax.set_aspect('equal')
        ax.tick_params(colors='#9aa0a8', labelsize=7)
        ax.set_title('%s\nred: cable over public floor (%d m under protectors, %d crossings)' % (title, len(union), len(xings)), color='#e8e4dc', fontsize=9)
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
    rec = {'round': ROUND, 'dj_white_pct': {lk: (luma.get('gr-t40-%s-dj' % lk) or {}).get('white_pct') for lk in LOOKS},
           'frame': 'gr-t40-peak-floor', 'white_pct': fr['white_pct'], 'mean_Y': fr['mean_Y'], 'budget_pct': GLARE_BUDGET_PCT, 'ok': fr['white_pct'] <= GLARE_BUDGET_PCT,
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


# ====================================================================== #878's constraints (A13-A15)
def _seg_pts(a, b, step=0.02):
    import numpy as np
    a, b = np.asarray(a, float), np.asarray(b, float)
    n = max(2, int(np.linalg.norm(b - a) / step) + 1)
    return a + (b - a) * np.linspace(0.0, 1.0, n)[:, None]


def cut_parts_878():
    """#878's cut at z 3.20 as sampled points, each with the radius of its body: the truss (its bottom chord, half its section),
    the three pick chains (truss top to the girder's underside, 7.6 m), the hl strap, the 11 lamp bodies."""
    import numpy as np
    zc = CUT_878['crane_z_m']
    (xa, ya), (xb, yb) = CUT_878['bottom_chord']
    parts = []
    parts.append(('the cut (H30V truss)', _seg_pts((xa, ya, zc), (xb, yb, zc)), CUT_878['section_m'] / 2))
    u0, u1 = CUT_878['u_ends']
    for u in CUT_878['picks_u_m']:
        f = (u - u0) / (u1 - u0)
        x, y = xa + f * (xb - xa), ya + f * (yb - ya) + CUT_878['section_m']
        parts.append(('pick u %+g' % u, _seg_pts((x, y, zc), (x, CUT_878['girder']['y_m'][0], zc)), 0.02))
    parts.append(('cut tie-off hl (strap)', _seg_pts(*CUT_878['strap_hl']), 0.025))
    for i, (x, y) in enumerate(CUT_878['lamps']):
        parts.append(('lamp body rig-par-cut-%02d' % (i + 1), np.array([[x, y, zc]]), CUT_878['lamp_r_m']))
    return parts


def hands_gap_878(A, G):
    """A13: the smallest gap between a raised hand (a vertical reach to RAISED_HANDS_M) and any part of #878's cut, over every
    floor point (0.25 m grid) near the cut that is OUTSIDE the stage pen's barrier and not in a machine, painted or not (people
    walk on unpainted floor too: the conservative reading, as #878's own check): with the bay inside the barrier (this layer)
    and with it outside (the 'before'). The painted public floor alone is reported beside it."""
    import numpy as np
    xs = np.arange(-16.0 + 0.125, 4.0, 0.25)
    zs = np.arange(CUT_878['crane_z_m'] - 6.0 + 0.125, CUT_878['crane_z_m'] + 6.0, 0.25)
    F_ = np.array([(x, z) for x in xs for z in zs if not inside_rect(x, z, A.stage_pen) and inside_rect(x, z, HALL_IN)
                   and not massing_hits(G, x, z, 0.0, 1.0, 0.0)]).reshape(-1, 2)
    in_bay = (F_[:, 0] >= STAGE_BAY['x_m'][0]) & (F_[:, 0] <= STAGE_BAY['x_m'][1]) & (F_[:, 1] >= STAGE_BAY['z_m'][0]) & (F_[:, 1] <= STAGE_BAY['z_m'][1])
    P = public_points(A, G, step=0.25)
    P = P[(np.abs(P[:, 1] - CUT_878['crane_z_m']) < 6.0) & (P[:, 0] > -16.0) & (P[:, 0] < 4.0)]

    def gap(Q):
        best = (99.0, None, None)
        if not len(Q):
            return best
        for name, S_, r in cut_parts_878():
            h = np.hypot(Q[:, None, 0] - S_[None, :, 0], Q[:, None, 1] - S_[None, :, 2])
            v = np.maximum(S_[None, :, 1] - RAISED_HANDS_M, 0.0)
            d = np.hypot(h, v) - r
            k = np.unravel_index(int(np.argmin(d)), d.shape)
            if d[k] < best[0]:
                best = (float(d[k]), name, [R3(Q[k[0], 0]), R3(Q[k[0], 1])])
        return best
    w, wo, pp = gap(F_[~in_bay]), gap(F_), gap(P)
    return {'with_the_bay': {'gap_m': R3(w[0]), 'nearest': w[1], 'at_feet': w[2]},
            'bay_outside_the_barrier': {'gap_m': R3(wo[0]), 'nearest': wo[1], 'at_feet': wo[2]},
            'painted_public_floor_only': {'gap_m': R3(pp[0]), 'nearest': pp[1], 'at_feet': pp[2]},
            'rule_m': HANDS_GAP_M, 'raised_hands_m': RAISED_HANDS_M, 'bay': STAGE_BAY, 'ok': w[0] >= HANDS_GAP_M,
            'cross_check': '#878 reports 0.33 m (the truss) before and 0.622 m (the hl strap) after; here the truss is its bottom chord less half its 0.29 m section, the lamp bodies %.2f m spheres (ASSUMED)' % CUT_878['lamp_r_m'],
            'source': SRC_878, 'what': 'A13: raised hands (%.1f m over every floor point outside the stage pen\'s barrier, 0.25 m grid, painted or not) to every part of the cut at z 3.20 (#878)' % RAISED_HANDS_M}


def cube_clearance(Q, t_beam):
    """A14: the clearance of points Q (n, 3) from the 6 cube beams' volume behind the stage (#878: from the free crane's far
    girder z -13.45 along -z to the far wall's block): the box between the apertures' spread (x -4.5..-1.0, y 8.54..9.09) and
    the one end (-4.031, 9.181, -53.8), padded by the 1.008 deg tube (+4 mm), the 0.25 m margin and the ground beam's own
    half width at its distance t_beam. Negative = inside. Points outside z -53.8..-13.45 get +inf (+ their z distance)."""
    import numpy as np
    Q = np.asarray(Q, float).reshape(-1, 3)
    C = CUBES_878
    z0, (ex, ey, ez) = C['z0_m'], C['end_m']
    s = np.clip(z0 - Q[:, 2], 0.0, z0 - ez)
    f = s / (z0 - ez)
    xl, xr = C['x_m'][0] + f * (ex - C['x_m'][0]), C['x_m'][1] + f * (ex - C['x_m'][1])
    yl, yh = C['y_m'][0] + f * (ey - C['y_m'][0]), C['y_m'][1] + f * (ey - C['y_m'][1])
    pad = C['waist_m'] / 2 + s * math.tan(math.radians(C['fan_deg'] / 2)) + C['margin_m'] + np.asarray(t_beam, float) * math.tan(math.radians(B380F_HALF_DEG))
    dx = np.maximum(np.maximum(xl - Q[:, 0], Q[:, 0] - xr), 0.0)
    dy = np.maximum(np.maximum(yl - Q[:, 1], Q[:, 1] - yh), 0.0)
    dz = np.maximum(np.maximum(Q[:, 2] - z0, ez - Q[:, 2]), 0.0)
    return np.hypot(np.hypot(dx, dy), dz) - pad


def ray_pts(head, d, t_max=None, step=0.1):
    """Points along a beam from its head to t_max (or to the roof, 10.8 m: the conservative end) and their distances."""
    import numpy as np
    head, d = np.asarray(head, float), np.asarray(d, float)
    if t_max is None:
        t_max = (10.8 - head[1]) / d[1] if d[1] > 1e-6 else 60.0
    tt = np.arange(0.3, min(t_max, 120.0), step)
    return head + d * tt[:, None], tt


def window_878(head, d, t_aim=None, pans=None, tilts=None):
    """A14 + A15 for one beam: its aim (to t_aim, its end) and every direction of its desk window (to the roof: conservative):
    the smallest clearance from the cube beams' volume and the directions that meet the near crane at z 3.20 (its girders or
    the cut: truss, picks, strap, lamps; + 0.3 m)."""
    import numpy as np
    pans = WINDOW_PANS if pans is None else pans
    tilts = WINDOW_TILTS if tilts is None else tilts
    parts = cut_parts_878()
    g = CUT_878['girder']
    az, el = az_el(d)
    cube_min, crane_hits = 99.0, []
    for ti in tilts:
        for pa in pans:
            wd = dir_of(az + pa, min(el + ti, 89.5))
            aim = (pa == 0.0 and ti == 0.0)
            q, tt = ray_pts(head, wd, t_aim if aim else None)
            if not len(q):
                continue
            cube_min = min(cube_min, float(cube_clearance(q, tt).min()))
            hit = np.zeros(len(q), bool)
            for dz in (-g['dz_m'], g['dz_m']):
                hit |= (np.abs(q[:, 2] - (CUT_878['crane_z_m'] + dz)) <= g['half_w_m']) & (q[:, 1] >= g['y_m'][0]) & (q[:, 1] <= g['y_m'][1]) & (np.abs(q[:, 0]) <= g['x_abs_m'])
            near = q[(np.abs(q[:, 2] - CUT_878['crane_z_m']) < 1.0)]
            what = 'girder' if hit.any() else None
            if what is None and len(near):
                for name, S_, r in parts:
                    if float(np.min(np.linalg.norm(near[:, None, :] - S_[None, :, :], axis=2))) <= r + 0.3:
                        what = name
                        break
            if what:
                crane_hits.append({'pan': pa, 'tilt': ti, 'meets': what})
    return R3(cube_min), crane_hits


def pan_cap_878(head, d, t_aim):
    """The widest symmetric-or-not pan window (0.5 deg steps, up to +-PAN_WIN_DEG) whose every tilt clears A14 and A15: (lo, hi)."""
    import numpy as np
    lo, hi = -PAN_WIN_DEG, PAN_WIN_DEG
    for side in (-1, 1):
        for p_ in np.arange(0.5, PAN_WIN_DEG + 0.01, 0.5):
            cm, ch = window_878(head, d, t_aim, pans=(side * p_,), tilts=WINDOW_TILTS)
            if cm < 0.0 or ch:
                if side < 0:
                    lo = -(p_ - 0.5)
                else:
                    hi = p_ - 0.5
                break
    return R3(lo), R3(hi)


def checks_878(T, A, G):
    """A13-A15 over the placed rig: the hands gap; every ground unit, cable vertex and beam (aim + window) against the cube
    volume; every beam against the near crane at z 3.20. A beam whose window (not its aim) meets either gets its pan capped on
    the operator sheet (desk_limits.pan_cap_878_deg)."""
    import numpy as np
    out = {'source': SRC_878, 'a13': hands_gap_878(A, G)}
    units = [f for f in T['fixtures'] if f['type'] in ('up-pl5403', 'up-b380f', 'up-yz31p') and not f['part'].startswith('cut')]
    up = np.array([[f['p'][0], f['p'][1] + 0.5, f['p'][2]] for f in units])
    uc = cube_clearance(up, np.zeros(len(up)))
    rows, capped = [], []
    for f in units:
        if f['type'] != 'up-b380f':
            continue
        head = np.array([f['p'][0], f['p'][1] - 0.7 + HEAD_Y, f['p'][2]])
        d = aim_dir(f['r'])
        aim_cm, aim_ch = window_878(head, d, f.get('throw_m'), pans=(0.0,), tilts=(0.0,))
        win_cm, win_ch = window_878(head, d, f.get('throw_m'))
        r = {'id': f['id'], 'aim_cube_clearance_m': aim_cm, 'aim_meets_crane': aim_ch, 'window_cube_clearance_m': win_cm, 'window_meets_crane': win_ch}
        if win_cm < 0.0 or win_ch:
            r['pan_cap_deg'] = list(pan_cap_878(head, d, f.get('throw_m')))
            old = f.get('desk_limits') or {}
            f['desk_limits'] = {**old, **desk_limits(head, d, pan=r['pan_cap_deg'])}
            f['desk_limits']['pan_cap_878_deg'] = r['pan_cap_deg']
            f['desk_limits']['pan_cap_878_why'] = 'A14/A15 (#878): a wider pan meets %s' % ('the near crane at z 3.20' if win_ch else 'the cube beams\' volume')
            capped.append(f['id'])
        rows.append(r)
    out['a14'] = {'units_min_clearance_m': R3(float(uc.min())) if len(uc) else None, 'units_inside': [units[i]['id'] for i in np.where(uc < 0)[0]],
                  'beams_aim_inside': [r['id'] for r in rows if r['aim_cube_clearance_m'] < 0], 'beams_window_inside': [r['id'] for r in rows if r['window_cube_clearance_m'] < 0],
                  'beam_aim_min_clearance_m': min([r['aim_cube_clearance_m'] for r in rows] or [99]), 'what': 'A14: the 6 cube beams behind the stage (#878), padded by their 1.008 deg tube + 0.25 m + the ground beam\'s own half width; cable runs lie on the floor (y 0), 8.5 m under the volume'}
    out['a15'] = {'crane_z_m': CUT_878['crane_z_m'], 'beams_aim_meet': [r['id'] for r in rows if r['aim_meets_crane']], 'beams_window_meet': [r['id'] for r in rows if r['window_meets_crane']],
                  'what': 'A15: no ground beam on the near crane parked at z 3.20 (#878): girders z 3.2 +-1.1 (0.7 wide, 7.6-8.92 m, x +-11.35) or the cut (truss, picks, hl strap, lamps; + 0.3 m)'}
    out['pan_capped'] = capped
    out['beams'] = rows
    out['ok'] = {'a13': out['a13']['ok'], 'a14': not out['a14']['units_inside'] and not out['a14']['beams_aim_inside'],
                 'a15': not out['a15']['beams_aim_meet']}
    return out


def a5_island(out, cov, entry_gate):
    """OWNER DECISION (A5): the rig with no island (as built) and the FOH island option, both measured. The option is built with
    MOXIR_GROUND_VARIANT=foh-island (its checks in <out>/foh-island/checks.json, run BEFORE this build); None when it is not there."""
    p = os.path.join(out, 'foh-island', 'checks.json')
    a = {'what': 'no island: every unit out of the crowd', 'base_gap_max_m': cov['ground']['base_gap_max_m'], 'entry_beam_ratio': entry_gate['beam_ratio'],
         'islands': 0, 'painted_m2_taken': 0.0, 'barrier_m': 0.0,
         'why_not_met': 'no out-of-crowd place stands within 21.9 m of the painted cell x 3 z 19.5 (the nearest is 24.6 m away), so no pick from them meets 21.9 m'}
    if not os.path.exists(p):
        return {'question': 'A5: one island in the hall (A2 allows one, justified) so the beams reach the middle?', 'a_no_island': a, 'b_foh_island': None,
                'note': 'the option was not built: run the build with MOXIR_GROUND_VARIANT=foh-island first'}
    c = json.load(open(p))['checks']
    I = c['public_floor'].get('island') or {}
    rp = os.path.join(out, 'foh-island', os.path.basename(RIG_GR))
    head = [{'id': f['id'], 'p': f['p'], 'throw_m': f.get('throw_m'), 'ends_on': f.get('ends_on')}
            for f in json.load(open(rp))['fixtures'] if 'FOH island' in str(f.get('slot', ''))] if os.path.exists(rp) else []
    return {'question': 'A5: one island in the hall (A2 allows one, justified) so the beams reach the middle?', 'a_no_island': a,
            'b_foh_island': {'what': 'one B380F on a fenced island beside the FOH riser (east of #873\'s strip), crew-only', 'rect': {'x_m': I.get('x_m'), 'z_m': I.get('z_m')},
                             'base_gap_max_m': c['beam_coverage']['ground']['base_gap_max_m'], 'entry_beam_ratio': c['entry_gate']['beam_ratio'],
                             'islands': c['public_floor']['islands'], 'painted_m2_taken': I.get('painted_m2_taken'), 'barrier_m': c['public_floor']['barriers_added_on_it_m'],
                             'heads': head, 'a13_a15_ok': c['near_crane_878']['ok'], 'field_glare_fail_points': c['beam_field_glare']['fail_points'],
                             'checks': p}}


def acceptance(repo, T):
    """A1-A15 from the rig's own checks: [(test, MET | NOT MET | MET + OWNER DECISION, the number)]. The tests in
    moxir-v2-ground.test.js recompute each with their own code; this is the page's summary of the same numbers."""
    ck = T['checks']
    S_ = lambda ok: 'MET' if ok else 'NOT MET'
    rows = []
    pf = ck['public_floor']
    rows.append(('A1 patch (official v2 patch)', S_(ck['dmx_lines_ok'] and ck['dmx_devices_max'] <= DMX_MAX_DEVICES),
                 'every address from patchPlan.js (%s); the fullest line %d devices (<= %d); cubes on the LAN' % (T['patch']['from'], ck['dmx_devices_max'], DMX_MAX_DEVICES)))
    rows.append(('A2 out of the crowd', S_(not pf['units_on_it'] and not ck['beams_ending_in_bar_or_chill'] and pf['islands'] == 0),
                 '%d units and %.0f m of barrier on the public floor, %d islands, %d beams ending in the bar or chill' % (len(pf['units_on_it']), pf['barriers_added_on_it_m'], pf['islands'], len(ck['beams_ending_in_bar_or_chill']))))
    pal = ck['palette']
    hall_ash = [r for r in pal['peak'] if r['peak_colour'] == ASH and r['part'] not in FRONT_PARTS.values() and not r['part'].startswith('cut') and r['part'] != FAN_PART and 'PAR' in r['part']]
    rows.append(('A3 palette (the ember split)', S_(not hall_ash), '%d units in ash at the peak (%s); %d parts changed vs the spread, each with its reason' % (
        pal['ash_units_at_peak'], ', '.join(pal['ash_parts']), len(pal['changed_vs_spread']))))
    hr = ck['headroom']
    rows.append(('A4 headroom (peak <= %.2f)' % PEAK_CAP, S_(hr['ok']), 'highest level %s; beams at the crowd x %.2f of the spread at equal colours (x %.2f at full); 30 deg rule ASSUMED; B380F IEC 62471 UNKNOWN' % (
        ', '.join('%s %.2f' % kv for kv in hr['max_level_by_look'].items()), ck['epic_peak_equal_colours']['crowd_eyes']['beam_ratio'], ck['epic']['crowd_eyes']['beam_ratio'])))
    bc, eg = ck['beam_coverage'], ck['entry_gate']
    rows.append(('A5 spread + entry side', S_(bc['rule']['ok'] and eg['ok_beams'] and eg['ok_pars']),
                 'largest beam-base gap %.1f m (spread %.1f, rule <= %.1f), bands %s; entry eyes beams %s, PARs %s' % (
                     bc['ground']['base_gap_max_m'], bc['spread']['base_gap_max_m'], SPREAD_BEAM_GAP_M, bc['ground']['bases_by_z_band'],
                     ', '.join('%s x%.2f' % kv for kv in eg['beam_ratio'].items()), ', '.join('%s x%.2f' % kv for kv in eg['par_ratio'].items()))))
    pe = ck['par_eye_rule']
    rows.append(('A6 PAR lens 15 + 25 deg', S_(all(pe[k]['fail_count'] == 0 for k in pe)), ', '.join('%s deg: %d of %d PARs with an eye in the beam' % (k, pe[k]['fail_count'], pe[k]['pars']) for k in sorted(pe))))
    fg = ck['beam_field_glare']
    rows.append(('A7 lean eyes (30 deg, ASSUMED)', S_(fg['fail_points'] == 0), '%d points (standing + 0.5 m lean), %.2f %% fail, smallest angle %.1f deg' % (fg['points'], fg['fail_pct'], fg['min_deg'])))
    co = ck['corridor_873']
    rows.append(('A8 #873 strip', S_(co['ok']), '%d units, %d m of line, %.0f m of barrier of this layer in it; the stage pen\'s own barrier flagged (not this layer)' % (
        len(co['this_layer_units_in_strip']), co['this_layer_lines_in_strip_m'], co['barriers_added_by_this_layer_m'])))
    cb = ck['cables']
    rows.append(('A9 practice', S_(ck['smoke_path']['ok'] and not ck['stage_front']['pars_in_the_pit'] and ck['barrier_gap_ok']),
                 '%d public crossings, %d m of cable protector; smoke refilled from the stage pen; %d PARs in the pit; order list in checks.order' % (
                     len(cb['crossings']), cb['protector_metres'], len(ck['stage_front']['pars_in_the_pit']))))
    sheet = os.path.exists(os.path.join(repo, 'docs/moxir/moxir-v2-ground-operator-sheet.md'))
    rows.append(('A10 desk limits', S_(sheet), 'operator sheet per head (degrees + 16-bit coarse/fine) in docs/moxir/; desk enforcement OWED code'))
    mx = open(os.path.join(repo, 'docs/moxir/MOXIR.md')).read()
    rows.append(('A11 MOXIR.md', S_('v2 ground' in mx and 'z 8.2, x' in mx), 'the v2 ground section, the change-log line, 5.3 fixed, B380F power trip UNKNOWN + the crew line'))
    gm = ck.get('floor_glare_peak_measured') or {}
    dj = gm.get('dj_white_pct') or {}
    rows.append(('A12 looked at', S_(bool(gm) and gm.get('round') == ROUND and gm.get('every_view_ok')),
                 ('floor peak white-out %.2f %% (budget %.2f); views over budget: %s; DJ view %s' % (gm['white_pct'], GLARE_BUDGET_PCT, ', '.join(gm['views_over_budget']) or 'none',
                  ', '.join('%s %.2f %%' % (k, v) for k, v in dj.items() if v is not None))) if gm else 'not drawn'))
    c8 = ck['near_crane_878']
    a13, a14, a15 = c8['a13'], c8['a14'], c8['a15']
    rows.append(('A13 the bay in the pen (#878)', S_(c8['ok']['a13']), 'raised hands (%.1f m) to the cut %.3f m with the bay inside the barrier (rule >= %.1f; %.3f m with it outside; %.2f m over the painted floor only); nearest: %s' % (
        a13['raised_hands_m'], a13['with_the_bay']['gap_m'], a13['rule_m'], a13['bay_outside_the_barrier']['gap_m'], a13['painted_public_floor_only']['gap_m'], a13['with_the_bay']['nearest'])))
    rows.append(('A14 the cube beams (#878)', S_(c8['ok']['a14']), '%d units, %d beam aims and %d windows inside; nearest unit %.1f m, nearest aim %.1f m; cables on the floor, 8.5 m under' % (
        len(a14['units_inside']), len(a14['beams_aim_inside']), len(a14['beams_window_inside']), a14['units_min_clearance_m'], a14['beam_aim_min_clearance_m'])))
    rows.append(('A15 the near crane at z 3.20 (#878)', S_(c8['ok']['a15']), '%d aims on the crane or the cut; windows that met it capped on the desk: %s' % (
        len(a15['beams_aim_meet']), ', '.join('%s pan %s' % (f['id'], f['desk_limits'].get('pan_deg_from_home')) for f in T['fixtures'] if f['id'] in c8['pan_capped']) or 'none')))
    od = ck['owner_decisions']
    isl = od.get('a5_island') or {}
    if isl.get('b_foh_island'):
        a, b = isl['a_no_island'], isl['b_foh_island']
        rows.append(('OWNER DECISION (A5)', 'OWNER DECISION', '%s (a) no island: gap %.2f m, NOT MET; (b) the FOH island x %s z %s: gap %.2f m, entry beams %s, %.0f m2 of paint and %.1f m of barrier' % (
            isl['question'], a['base_gap_max_m'], b['rect']['x_m'], b['rect']['z_m'], b['base_gap_max_m'], ', '.join('%s x%.2f' % kv for kv in b['entry_beam_ratio'].items()), b['painted_m2_taken'], b['barrier_m'])))
    rows.append(('OWNER DECISION', 'OWNER DECISION', '%s / %s' % (od['bar_and_chill']['question'], od['pa_faces']['question'])))
    return rows


def page(repo, out):
    """Round 2's comparison page: the acceptance table (A1-A12, each with its number and MET / NOT MET / OWNER DECISION from the
    rig's own checks), the plans, the twelve frame pairs (old spread left, new ground right, the same cameras) with their measured
    luminance and white-out, the palette, the owner's decisions with both options measured, and what is owed."""
    import html
    E = html.escape
    T = json.load(open(os.path.join(repo, RIG_GR)))
    ck = T['checks']
    lp = os.path.join(out, 'frame-luma.json')
    luma = json.load(open(lp)) if os.path.exists(lp) else {}
    fl = lambda v, n=2: ('%%.%df' % n) % (math.floor(float(v) * 10 ** n + 1e-9) / 10 ** n)      # never round a claim up (the owner's rule)
    fmt_l = lambda L: ('mean luminance %.4f · white-out %.2f %%' % (L['mean_Y'], L['white_pct'])) if L else 'not drawn'

    def fig(name):
        k, _, lk, v = name.split('-')
        src = 'frames/%s.png' % name
        if not os.path.exists(os.path.join(out, src)):
            return '<figure class="missing"><figcaption><b>%s · %s look</b><span>not drawn</span></figcaption></figure>' % (E(FRAME_LAYOUTS[k][0]), lk)
        return '<figure><a href="%s"><img src="%s" alt="%s, %s look, %s" loading="lazy"></a><figcaption><b>%s · %s look</b></figcaption></figure>' % (
            src, src, E(FRAME_LAYOUTS[k][0]), lk, E(VIEWS[v]['label']), E(FRAME_LAYOUTS[k][0]), lk)

    def pair(v, lk):
        a, b = 'sl-t40-%s-%s' % (lk, v), 'gr-t40-%s-%s' % (lk, v)
        return '<h3>%s · %s look</h3><p class="nums"><span>old: %s</span><span>new: %s</span></p><div class="pair">%s%s</div>' % (
            E(VIEWS[v]['label']), lk, fmt_l(luma.get(a)), fmt_l(luma.get(b)), fig(a), fig(b))
    pairs = ''.join(pair(v, lk) for v in VORDER for lk in LOOKS)
    acc = acceptance(repo, T)
    accrows = ''.join('<tr class="%s"><td>%s</td><td><b>%s</b></td><td>%s</td></tr>' % (
        'met' if s == 'MET' else ('dec' if 'OWNER' in s else 'not'), E(k), E(s), E(n)) for k, s, n in acc)
    pal = ''.join('<tr><td>%s</td><td>%d</td><td>%s %s</td><td>%s %s</td><td>%s</td></tr>' % (
        E(r['part']), r['units'], E(str(r['spread_colour'])), '' if r['spread_level'] is None else fl(r['spread_level']), E(r['peak_colour']), fl(r['peak_level']),
        E(r['why'] if r['changed'] or r['peak_colour'] == ASH else 'kept')) for r in ck['palette']['peak'])
    eg = ck['entry_gate']
    gate = ''.join('<tr><td>%s</td><td>x %s</td><td>x %s</td></tr>' % (E(e), fl(eg['beam_ratio'][e]), fl(eg['par_ratio'][e])) for e in eg['eyes'])
    od = ck['owner_decisions']
    bc = od['bar_and_chill']
    bcrows = ''.join('<tr><td>%s</td><td>%.1f</td><td>%.1f</td><td>%.1f</td></tr>' % (E(e), bc['spread'][e], bc['a_as_built']['par_lx_at_eye_peak_equal'][e], bc['b_allowed']['par_lx_at_eye_peak_equal'][e]) for e in ENTRY_EYES)
    pa = od['pa_faces']
    owed = ''.join('<li>%s</li>' % E(o) for o in T.get('owed', []))
    gm = ck.get('floor_glare_peak_measured') or {}
    dj = gm.get('dj_white_pct') or {}
    doc = PAGE.format(owner=E(OWNER_WORDS), accrows=accrows, pairs=pairs, pal=pal, gate=gate, bcrows=bcrows, owed=owed,
                      bc_q=E(bc['question']), pa_q=E(pa.get('question', '')), pa_a=E(json.dumps(pa.get('a_as_built', ''), default=JD)[:600]),
                      pa_b=E(json.dumps(pa.get('b_barrier_out', ''), default=JD)[:600]),
                      dj=('peak %.2f %% · dark %.2f %%' % (dj['peak'], dj['dark'])) if dj.get('peak') is not None else 'not drawn',
                      ratio_eq=fl(ck['epic_peak_equal_colours']['crowd_eyes']['beam_ratio']), ratio_full=fl(ck['epic']['crowd_eyes']['beam_ratio']))
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
table {{ border-collapse:collapse; width:100%; margin:10px 0; font-size:13.5px; font-variant-numeric:tabular-nums; }}
td, th {{ border:1px solid var(--line); padding:6px 8px; vertical-align:top; text-align:left; }} th {{ color:var(--dim); font-weight:600; }}
tr.met td:nth-child(2) {{ color:#8fd18f; }} tr.not td:nth-child(2) {{ color:var(--ember); }} tr.dec td:nth-child(2) {{ color:var(--hi); }}
.wrap {{ overflow-x:auto; }} ul {{ max-width:1000px; }}
@media (max-width: 800px) {{ .pair, .nums {{ grid-template-columns:1fr; }} }}
</style></head><body><main>
<h1>MOXIR v2 ground, round 2 — on the ground, out of the crowd</h1>
<p class="lead">You said: <q>{owner}</q>. Round 2 keeps every lamp that is not on the truss on the floor, and puts every one of them
<b>out of the crowd</b>: along the walls and window bands, the column rows, the stage edge behind the barrier, the far end and the
entry wall. Nothing of this layer stands on the public floor. Left: the spread (old). Right: the ground layout (new), the same cameras.
At the peak, at equal colours, the beams glow <b>x {ratio_eq}</b> of the spread's from the crowd eyes (x {ratio_full} with every beam at full).
The DJ's own view: white-out {dj}.</p>
<h2>The acceptance tests</h2>
<div class="wrap"><table><tr><th>test</th><th>status</th><th>the number</th></tr>{accrows}</table></div>
<h2>The plan, from above</h2>
<div class="pair"><figure><a href="plan-spread.png"><img src="plan-spread.png" alt="the spread from above" loading="lazy"></a><figcaption><b>v2 spread (old)</b></figcaption></figure>
<figure><a href="plan-ground.png"><img src="plan-ground.png" alt="the ground layout from above" loading="lazy"></a><figcaption><b>v2 ground, round 2</b>White lines: where a line (barrier or fence) stands at the public floor's edge with a unit behind it.</figcaption></figure></div>
<figure><a href="plan-cables.png"><img src="plan-cables.png" alt="the cable plan" loading="lazy"></a><figcaption><b>The cable plan</b>Every circuit, DMX line, feeder and network run along the walls; a red mark is a public crossing (cable protector).</figcaption></figure>
<p class="note">The B380F operator sheet (desk limits per head, degrees and 16-bit DMX): <a href="moxir-v2-ground-operator-sheet.html">moxir-v2-ground-operator-sheet.html</a> (.md, .csv beside it). No desk enforces these yet: OWED code.</p>
<h2>The frames — old left, new right</h2>
<p class="note">Drawn on the real GPU with the same viewer, measurement mode at EV100 2.84, Full quality, haze t40 (an estimate until measured on site). Above each pair: mean luminance and white-out (the share of pixels white in every channel), frame_luma.py.</p>
{pairs}
<h2>The peak's colours, part by part</h2>
<div class="wrap"><table><tr><th>part</th><th>units</th><th>spread (colour level)</th><th>ground (colour level)</th><th>why</th></tr>{pal}</table></div>
<h2>The entry side at the peak (equal colours)</h2>
<div class="wrap"><table><tr><th>eye</th><th>beams, ground / spread</th><th>PARs, ground / spread</th></tr>{gate}</table></div>
<h2>Your decisions (both options measured; nothing chosen for you)</h2>
<h3>{bc_q}</h3>
<div class="wrap"><table><tr><th>eye (PAR lx, peak, equal colours)</th><th>spread</th><th>a: as built (no pools there)</th><th>b: pools allowed there</th></tr>{bcrows}</table></div>
<h3>{pa_q}</h3>
<p class="note">a: {pa_a}</p><p class="note">b: {pa_b}</p>
<h2>Owed</h2>
<ul>{owed}</ul>
<p class="note">Every number: <a href="checks.json">checks.json</a>, <a href="candidates-r2.json">candidates-r2.json</a>, <a href="frame-luma.json">frame-luma.json</a>, <a href="frames/frames.json">frames/frames.json</a>.</p>
</main></body></html>
"""


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('cmd', choices=['candidates', 'candidates-empty', 'build', 'plan', 'tune', 'page', 'measured'])
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
    elif A_.cmd == 'candidates-empty':
        candidates(repo, out, only='empty')
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
