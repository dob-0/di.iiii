#!/usr/bin/env python3
"""laser_frames.py — a show's per-scene laser design (scene `laser` data) compiled into the cube lines' `frames` (2026-10-15).

Generic: any scenes file (a `scenes` list, each with `id`, `cue` {fade_s, hold_s} and an optional `laser`) and any rig file
whose LaserCube fixtures (`type` ext-lc-ultra-mk2) hold `laser.beams` with a rotation `r` each. No production name here.

    python3 -I scripts/place/laser_frames.py --scenes <scenes.json> --rig <rig.json> --hall <hall.json> \
        --out <rig-with-frames.json> [--plan-out plan.json] [--show-epoch-ms N] [--timing clock|fade+hold] [--check]

THE `laser` FIELD OF A SCENE (null = the cubes dark in that scene). Validated by validate_laser(); an error stops the run.
    {
      "pattern":   "comb" | "net" | "fan" | "fan-sweep" | "single-scan" | "tunnel" | "sky",
      "cubes":     "all" | "odd" | "even" | "west" | "east" | "outer" | "inner"      (the cube group, cubes counted west → east)
      "colour":    "#rrggbb"            the cube's RGB (455/525/638 nm); the room takes it from the look's laser part
      "colour_key": "<palette key>"     optional, the scene palette's key
      "level":     0 < level <= 0.16    the desk's laser cap (0.16, measured 2026-10-09) is the ceiling, never more
      "tempo":     {"clock": "master", "bpm": > 0, "beats": > 0}   one cycle = beats x 60 / bpm seconds of the master clock
      "phase":     "unison" | "mirror" | "chase"                    how the cubes of the group move against each other
      "pitch_deg": >= 0      centre pitch over the horizontal (up-patterns; 0 for comb/net)
      "yaw_deg":   >= 0      centre yaw OUTWARD from the hall's long axis (west cubes to -x, east cubes to +x); up-patterns
      "spread_deg": >= 0     fan half-width / tunnel radius / sky half-width
      "amplitude_deg": >= 0  sweep half-amplitude (fan-sweep, single-scan, sky wave); net: the cross yaw
      "breathe":   null | {"min": 0..1}                     intensity breathing over one cycle
      "hits":      null | {"per_beat": > 0, "duty": 0 < d < 1}   hard hits on the beat (lit share of each hit period)
      "beams":     1..48, optional   how many beams the pattern draws per cube (default: one per line, 6). More than the lines:
                                     a line carries several, each lit after a blank move (comb/net: along the rigged aims;
                                     fan, fan-sweep, tunnel: across the spread). 2026-10-17: the owner, at the wall, "more
                                     robust scenes" — six dots a cube read as nothing.
      "segments":  2..24, optional   points per line of a `sky` sheet (default 4): the sheet's smoothness
      "refs":      [str], "why": str
    }

--keyframes (2026-10-17): one pose per room frame (no sub-sampled path) and `frames.tween: true`, so a player blends each
pose into the next (serverXR laserShow.js poseAt) — continuous motion instead of a jump every step (4.4 s on a 1116 s show).

THE `laser_lines` FIELD OF A SCENE (null or absent = the line units dark): the single-beam DMX lasers (`LINE_TYPES`, e.g. the
UP-LA40WF 40 W: one static beam each, X/Y position by hand ch 6/7, 7 diode colours ch 5, dimmer ch 1; maker chart
scripts/place/fixtures/charts/up-la40wf.json). Validated by validate_line(); the same keys as `laser` where they mean the same:
    {
      "pattern":   "still" | "sweep" | "lift"     still = the rigged aim; sweep = a yaw swing around it; lift = a rise above it, never below
      "units":     "all" | "west" | "east"        (line units counted west → east)
      "colour":    one of LINE_COLOURS             what the unit's colour channel can make (chart ch 5); "colour_key" optional
      "level", "tempo", "breathe", "hits", "refs", "why"   as `laser`
      "phase":     "unison" | "mirror" | "chase"   a sweep always runs inward (the X closes), so unison = mirror; chase: unit k k/n later
      "amplitude_deg": >= 0                        sweep half-amplitude (yaw) / lift height (pitch), around the rigged aim
      "base_lift_deg": >= 0                        optional: every ray starts this much above the rigged aim (ch 7 tilt), e.g. to
                                                   clear a crane crossing the rigged aim misses; never down
      "base_yaw_in_deg": >= 0                      optional: the base aim turned this much toward the hall's centre line (ch 6),
                                                   e.g. to keep a line inside the bay's column lines; a sweep runs inward from it
    }
A line unit's field is the line's own (fieldHalfDeg ±18.5, ASSUMED as the cubes'); every ray gets the same physics as a cube's.

GEOMETRY. A cube's axis is the mean of its lines' directions (as laser-frames.mjs fanOf): its field is checked around it.
A pattern's ray is written in hall terms (yaw from the long axis, pitch over the horizontal). Each of a cube's six lines draws one ray of the pattern (line j = ray j); the ray is
turned into that line's own field point exactly (the inverse of three.js Euler XYZ, then laserLine.js fieldDirection inverted).
`comb` keeps every line on its own rigged aim (field 0, 0): the approved still beams.

THE ROOM'S FRAMES. laserLine.js §6 plays ONE `frames` list per line, evenly, over `period`, on the server's clock, at most 256
frames and 20 000 points. The whole show loop is written as 256 frames (step = loop / 256): each frame holds what the cube draws
in that step — a still pattern as its points, a moving one as the path it travels in the step (the time-average the room can
show), hits as their lit share in the drive. Tempo inside a step is NOT visible in the room (a real limit of the format).
`--show-epoch-ms` phases the list so frame i shows show time (i·step − epoch) mod loop (showClock.js: t = now − showEpoch).

CHECKS (fail = exit 1, nothing written): schema; every point inside the line's field (|x|,|y| <= 1) and the cube's field
(|Y|,|P| <= fieldHalfDeg, ±18.5 ASSUMED, fixtures.json); no lit ray below the horizontal (the lowest point is the cube, over the
hand rule); every ray's first surface (physics_check.first_surface: walls, floor, roof deck, lantern glazing) plus the bay's
column lines (|x| = span/2 below the truss bottom) and the near crane (height at its z >= 9.2 m, the rig's crossing rule): a ray
must end on the roof deck, an end wall at >= 9.0 m, or a side wall — never the glazing (light would leave the building), the
columns, the crane or the floor; flashes <= 3 per second (WCAG 2.x); the room's frame caps; the real cube's point budget
(ASSUMED 30 kpps at >= 30 Hz refresh = 1000 points a frame; dwell 12 + blank 6 points a beam, 4 points a degree of path).
"""
import argparse, datetime, importlib.util, json, math, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
CUBE_TYPE = 'ext-lc-ultra-mk2'
FIELD_HALF_DEG = 18.5            # fixtures.json lasercube.scan_field_half_deg (ASSUMED: the maker's ">37 deg" read as ±18.5)
LEVEL_CAP = 0.16                 # the show desk's laser fader cap, measured 2026-10-09; --level-cap lifts it (≤ 1.0) on the officer's word
# THE OFFICER'S SWITCH (owner, 2026-10-17 08:0x, at the wall: "all is checked and safe — remove all things"): with
# --officer-checked "<sign-off>" the HALL rules below stop failing a scene and are written down as waivers instead, in the
# plan, the summary and the rig (who signed, which rule, how often). What stays a failure whatever is signed: the cube's
# own field (±FIELD_HALF_DEG, hardware), a ray behind its line, the flash rate (WCAG) and the point budget (the buffer).
HALL_RULES = ('below the horizontal', 'floor', 'column line (bay edge)', 'lantern glazing', 'entry wall', 'near crane crossing')
OFFICER = {'signoff': None, 'waived': {}}


def waivable(why):
    return any(why.startswith(rule) for rule in HALL_RULES)
MAX_FRAMES, MAX_POINTS = 256, 20000   # laserLine.js MAX_FRAMES, MAX_FRAME_POINTS_TOTAL
MAX_FLASH_HZ = 3.0
CUBE_PPS, MIN_REFRESH_HZ = 30000, 30  # ASSUMED (laserEngine.js dacRate example; flicker-free scanned figure)
DWELL_PTS, BLANK_PTS, PTS_PER_DEG = 12, 6, 4
MAX_BEAMS, MAX_SEGMENTS = 48, 24   # per cube: 48 x (12 + 6) = 864 points, inside the 1000-point frame
CRANE_CLEAR_M, CRANE_HALF_Z = 9.2, 1.45   # rig lasers.arithmetic (crossing >= 9.2 m); girders 2 x 0.7 + gap 1.5 (hall dims)
ENTRY_MIN_M = 9.0                # rig: entry wall >= 9.0 m (over the 6 m door)
SUBSAMPLES = 6                   # positions per room frame for a moving pattern
PATTERNS = ('comb', 'net', 'fan', 'fan-sweep', 'single-scan', 'tunnel', 'sky')
GROUPS = {'all': (1, 2, 3, 4, 5, 6), 'odd': (1, 3, 5), 'even': (2, 4, 6), 'west': (1, 2, 3), 'east': (4, 5, 6),
          'outer': (1, 6), 'inner': (3, 4)}
PHASES = ('unison', 'mirror', 'chase')
UP_PATTERNS = ('fan', 'fan-sweep', 'single-scan', 'tunnel', 'sky')
DEG = math.pi / 180
LINE_TYPES = ('up-la40wf',)       # single-beam DMX lasers (fixtureTypes.js UP-LA40WF: static beam, ch 6/7 aim by hand)
LINE_PATTERNS = ('still', 'sweep', 'lift')
LINE_GROUPS = {'all': (1, 2), 'west': (1,), 'east': (2,)}
LINE_COLOURS = {'#ffffff': ('white', 8), '#ff0000': ('red', 25), '#00ff00': ('green', 42), '#0000ff': ('blue', 59),
                '#ffff00': ('yellow', 76), '#ff00ff': ('purple', 93), '#00ffff': ('cyan', 110)}   # chart ch 5, mid-range values


def _physics():
    spec = importlib.util.spec_from_file_location('physics_check', os.path.join(HERE, 'physics_check.py'))
    mod = importlib.util.module_from_spec(spec); spec.loader.exec_module(mod)
    return mod


PHYS = _physics()


# ---- vectors and three.js Euler XYZ ---------------------------------------------------------------------------------------
def norm(v):
    l = math.sqrt(sum(c * c for c in v)) or 1.0
    return [c / l for c in v]


def cross(a, b):
    return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]


def dot(a, b):
    return sum(x * y for x, y in zip(a, b))


def _rx(v, a): c, s = math.cos(a), math.sin(a); return [v[0], v[1] * c - v[2] * s, v[1] * s + v[2] * c]
def _ry(v, a): c, s = math.cos(a), math.sin(a); return [v[0] * c + v[2] * s, v[1], -v[0] * s + v[2] * c]
def _rz(v, a): c, s = math.cos(a), math.sin(a); return [v[0] * c - v[1] * s, v[0] * s + v[1] * c, v[2]]


def to_world(v, r):
    return _rx(_ry(_rz(v, r[2]), r[1]), r[0])


def to_local(w, r):
    return _rz(_ry(_rx(w, -r[0]), -r[1]), -r[2])


def field_point(world_dir, r, half_deg):
    """The (x, y) of laserLine.js fieldDirection that draws `world_dir` from a line rotated `r`: inverse, exact."""
    v = to_local(world_dir, r)
    if v[1] >= -1e-9:
        return None
    return (math.atan(v[0] / -v[1]) / DEG / half_deg, math.atan(v[2] / -v[1]) / DEG / half_deg)


def world_of_field(x, y, r, half_deg):
    tx, ty = math.tan(x * half_deg * DEG), math.tan(y * half_deg * DEG)
    return norm(to_world([tx, -1.0, ty], r))


# ---- the schema -----------------------------------------------------------------------------------------------------------
def validate_laser(laser, where=''):
    """Errors of one scene's `laser` (None is valid: dark)."""
    if laser is None:
        return []
    e = []
    if not isinstance(laser, dict):
        return [f'{where}: laser must be an object or null']
    num = lambda k, lo=0.0: isinstance(laser.get(k, 0), (int, float)) and laser.get(k, 0) >= lo
    if laser.get('pattern') not in PATTERNS: e.append(f"{where}: pattern {laser.get('pattern')!r} not in {PATTERNS}")
    if laser.get('cubes') not in GROUPS: e.append(f"{where}: cubes {laser.get('cubes')!r} not in {tuple(GROUPS)}")
    c = laser.get('colour')
    if not (isinstance(c, str) and len(c) == 7 and c[0] == '#' and all(ch in '0123456789abcdefABCDEF' for ch in c[1:])):
        e.append(f'{where}: colour {c!r} is not #rrggbb')
    lv = laser.get('level')
    if not (isinstance(lv, (int, float)) and 0 < lv <= LEVEL_CAP): e.append(f'{where}: level {lv!r} not in (0, {LEVEL_CAP}]')
    t = laser.get('tempo') or {}
    if not (t.get('clock') == 'master' and isinstance(t.get('bpm'), (int, float)) and t['bpm'] > 0
            and isinstance(t.get('beats'), (int, float)) and t['beats'] > 0):
        e.append(f'{where}: tempo must be {{clock: master, bpm > 0, beats > 0}}')
    if laser.get('phase', 'unison') not in PHASES: e.append(f"{where}: phase {laser.get('phase')!r} not in {PHASES}")
    for k in ('pitch_deg', 'yaw_deg', 'spread_deg', 'amplitude_deg'):
        if not num(k): e.append(f'{where}: {k} must be a number >= 0')
    b = laser.get('breathe')
    if b is not None and not (isinstance(b, dict) and isinstance(b.get('min'), (int, float)) and 0 <= b['min'] <= 1):
        e.append(f'{where}: breathe must be null or {{min: 0..1}}')
    h = laser.get('hits')
    if h is not None and not (isinstance(h, dict) and isinstance(h.get('per_beat'), (int, float)) and h['per_beat'] > 0
                              and isinstance(h.get('duty'), (int, float)) and 0 < h['duty'] < 1):
        e.append(f'{where}: hits must be null or {{per_beat > 0, duty in (0, 1)}}')
    if laser.get('pattern') in ('comb', 'net') and (laser.get('pitch_deg') or laser.get('yaw_deg')):
        e.append(f'{where}: comb/net stay on the rigged aims (pitch_deg = yaw_deg = 0)')
    if not isinstance(laser.get('refs', []), list): e.append(f'{where}: refs must be a list')
    nb = laser.get('beams')
    if nb is not None and not (isinstance(nb, int) and 1 <= nb <= MAX_BEAMS): e.append(f'{where}: beams must be 1..{MAX_BEAMS}')
    ns = laser.get('segments')
    if ns is not None and not (isinstance(ns, int) and 2 <= ns <= MAX_SEGMENTS): e.append(f'{where}: segments must be 2..{MAX_SEGMENTS}')
    known = {'pattern', 'cubes', 'colour', 'colour_key', 'level', 'tempo', 'phase', 'pitch_deg', 'yaw_deg', 'spread_deg',
             'amplitude_deg', 'breathe', 'hits', 'beams', 'segments', 'refs', 'why'}
    extra = set(laser) - known
    if extra: e.append(f'{where}: unknown keys {sorted(extra)}')
    return e


def validate_line(line, where=''):
    """Errors of one scene's `laser_lines` (None is valid: dark)."""
    if line is None:
        return []
    if not isinstance(line, dict):
        return [f'{where}: laser_lines must be an object or null']
    e = []
    if line.get('pattern') not in LINE_PATTERNS: e.append(f"{where}: lines pattern {line.get('pattern')!r} not in {LINE_PATTERNS}")
    if line.get('units') not in LINE_GROUPS: e.append(f"{where}: lines units {line.get('units')!r} not in {tuple(LINE_GROUPS)}")
    if str(line.get('colour', '')).lower() not in LINE_COLOURS:
        e.append(f"{where}: lines colour {line.get('colour')!r} is not one the unit makes ({', '.join(LINE_COLOURS)})")
    base = {k: line.get(k) for k in ('level', 'tempo', 'phase', 'breathe', 'hits', 'refs')}
    base.update({'pattern': 'comb', 'cubes': 'all', 'colour': '#ffffff'})
    e += [m.replace(f'{where}:', f'{where}: lines') for m in validate_laser({k: v for k, v in base.items() if v is not None or k in ('breathe', 'hits')}, where)]
    if not (isinstance(line.get('amplitude_deg', 0), (int, float)) and line.get('amplitude_deg', 0) >= 0):
        e.append(f'{where}: lines amplitude_deg must be a number >= 0')
    if not (isinstance(line.get('base_lift_deg', 0), (int, float)) and line.get('base_lift_deg', 0) >= 0):
        e.append(f'{where}: lines base_lift_deg must be a number >= 0 (up only)')
    if not (isinstance(line.get('base_yaw_in_deg', 0), (int, float)) and line.get('base_yaw_in_deg', 0) >= 0):
        e.append(f'{where}: lines base_yaw_in_deg must be a number >= 0')
    known = {'pattern', 'units', 'colour', 'colour_key', 'level', 'tempo', 'phase', 'amplitude_deg', 'base_lift_deg', 'base_yaw_in_deg', 'breathe', 'hits',
             'refs', 'why'}
    extra = set(line) - known
    if extra: e.append(f'{where}: lines unknown keys {sorted(extra)}')
    return e


# ---- the rig's cubes ------------------------------------------------------------------------------------------------------
def cubes_of(rig):
    cubes = [f for f in rig.get('fixtures', []) if f.get('type') == CUBE_TYPE and (f.get('laser') or {}).get('beams')]
    cubes.sort(key=lambda f: f['p'][0])            # west → east: cube 1 … n
    out = []
    for i, f in enumerate(cubes, 1):
        beams = [b for b in f['laser']['beams'] if not b.get('off')]
        dirs = [norm(PHYS.axis_of(b['r'])) for b in beams]
        axis = norm([sum(d[k] for d in dirs) for k in range(3)])
        east = norm(cross([0, 1, 0], axis))
        up = cross(axis, east)
        hall_axis = [0.0, 0.0, 1.0 if axis[2] >= 0 else -1.0]   # the long axis the cube faces
        out.append({'hall_axis': hall_axis, 'n': i, 'id': f['id'], 'p': f['p'], 'beams': beams, 'dirs': dirs, 'axis': axis, 'east': east, 'up': up,
                    'side': -1 if f['p'][0] < 0 else 1})
    return out


def units_of(rig):
    """The single-beam line units (LINE_TYPES), west → east, in the cube shape (one beam each) plus their rigged aim in hall terms."""
    fx = [f for f in rig.get('fixtures', []) if f.get('type') in LINE_TYPES and [b for b in (f.get('laser') or {}).get('beams', []) if not b.get('off')]]
    fx.sort(key=lambda f: f['p'][0])
    out = []
    for i, f in enumerate(fx, 1):
        beam = [b for b in f['laser']['beams'] if not b.get('off')][0]
        d = norm(PHYS.axis_of(beam['r']))
        east = norm(cross([0, 1, 0], d))
        a = [0.0, 0.0, 1.0 if d[2] >= 0 else -1.0]
        out.append({'hall_axis': a, 'n': i, 'id': f['id'], 'p': f['p'], 'beams': [beam], 'dirs': [d], 'axis': d, 'east': east,
                    'up': cross(d, east), 'side': -1 if f['p'][0] < 0 else 1,
                    'yaw0': math.atan2(d[0], d[2] * a[2]) / DEG, 'pitch0': math.asin(max(-1, min(1, d[1]))) / DEG})
    return out


def line_rays_at(line, unit, group, u):
    """[(0, world dir | None, field offset | None)] of a line unit at cycle phase u: still / sweep / lift around its base aim
    (the rigged aim, raised by base_lift_deg and turned toward the hall's centre line by base_yaw_in_deg)."""
    pat, A = line['pattern'], line.get('amplitude_deg', 0)
    p0 = unit['pitch0'] + line.get('base_lift_deg', 0)
    inward = -1.0 if unit['yaw0'] > 0 else 1.0                  # toward the hall's centre line: the crossed X closes
    y0 = unit['yaw0'] + inward * min(abs(unit['yaw0']), line.get('base_yaw_in_deg', 0))
    ph = line.get('phase', 'unison')
    phase = u + (group.index(unit['n']) / max(1, len(group)) if ph == 'chase' else 0.0)
    s = math.sin(2 * math.pi * phase)
    if (pat == 'still' or not A) and not line.get('base_lift_deg') and not line.get('base_yaw_in_deg'):
        return [(0, None, (0.0, 0.0))]
    if pat == 'still' or not A:
        return [(0, ray(unit, y0, p0), None)]
    if pat == 'sweep':                                          # inward from the base and back: the X closes and opens
        return [(0, ray(unit, y0 + inward * A * (0.5 + 0.5 * s), p0), None)]
    return [(0, ray(unit, y0, p0 + A * (0.5 + 0.5 * s)), None)]      # lift: up from the base, never below


def ray(cube, yaw, pitch):
    """A world direction: yaw degrees from the hall's long axis toward +x, pitch degrees over the horizontal."""
    a = cube['hall_axis']
    cp = math.cos(pitch * DEG)
    return norm([cp * math.cos(yaw * DEG) * a[0] + cp * math.sin(yaw * DEG), math.sin(pitch * DEG), cp * math.cos(yaw * DEG) * a[2]])


def ray_angles(cube, d):
    """(Y, P) degrees of a world direction in the cube's frame."""
    return (math.atan2(dot(d, cube['east']), dot(d, cube['axis'])) / DEG, math.asin(max(-1, min(1, dot(d, cube['up'])))) / DEG)


def ray_cube(cube, Y, P):
    """A world direction from (Y, P) degrees in the cube's frame: the inverse of ray_angles."""
    cp, sp, cy, sy = math.cos(P * DEG), math.sin(P * DEG), math.cos(Y * DEG), math.sin(Y * DEG)
    return norm([cp * cy * cube['axis'][i] + cp * sy * cube['east'][i] + sp * cube['up'][i] for i in range(3)])


def spread_lines(cube, count):
    """`count` rays along the polyline of the rigged aims (west → east), as [(line index, Y, P)] in the cube's frame:
    count = the lines gives the rigged aims themselves; more fills the gaps between neighbouring lines."""
    n = len(cube['beams'])
    ang = [ray_angles(cube, world_of_field(0.0, 0.0, b['r'], FIELD_HALF_DEG)) for b in cube['beams']]
    out = []
    for k in range(count):
        u = (k * (n - 1) / (count - 1)) if count > 1 and n > 1 else 0.0
        j = min(n - 2, int(u)) if n > 1 else 0
        f = u - j
        Y = ang[j][0] + ((ang[j + 1][0] - ang[j][0]) * f if n > 1 else 0.0)
        P = ang[j][1] + ((ang[j + 1][1] - ang[j][1]) * f if n > 1 else 0.0)
        out.append((int(round(u)), Y, P))
    return out


def line_of(k, count, n):
    """Ray k of `count` (west → east) goes on line k·n/count: neighbouring rays share a line."""
    return min(n - 1, (k * n) // count)


# ---- the pattern at a time ------------------------------------------------------------------------------------------------
def cube_phase(laser, cube, group):
    ph = laser.get('phase', 'unison')
    if ph == 'chase':
        return group.index(cube['n']) / max(1, len(group))
    return 0.0


def rays_at(laser, cube, group, u):
    """[(line index, world dir | None for the rigged aim, field offset (x, y) | None)] lit at cycle phase u (0..1)."""
    pat = laser['pattern']
    side = cube['side']
    phase = u + cube_phase(laser, cube, group)
    s = math.sin(2 * math.pi * phase)
    A, W = laser.get('amplitude_deg', 0), laser.get('spread_deg', 0)
    P0, Y0 = laser.get('pitch_deg', 0), laser.get('yaw_deg', 0)
    # up-patterns, in hall terms: yaw outward from the long axis (west cubes to -x, east cubes to +x), pitch over the horizontal.
    # mirror: the two sides move mirrored (both open outward together); unison / chase: every cube moves the same world way.
    mirror = laser.get('phase') == 'mirror'
    centre = lambda y0, a: side * (y0 + a) if mirror else side * y0 + a
    n = len(cube['beams'])
    N = int(laser.get('beams') or n)                        # beams per cube: the lines, or more (several on a line)
    out = []
    if pat == 'comb':
        if N == n:
            return [(j, None, (0.0, 0.0)) for j in range(n)]
        return [(j, ray_cube(cube, Y, P), None) for j, Y, P in spread_lines(cube, N)]
    if pat == 'net':
        breath = (0.5 + 0.5 * s) if A else 1.0
        a = A * breath * (1 if cube['n'] % 2 else -1)
        if N == n:
            return [(j, None, (a / FIELD_HALF_DEG, 0.0)) for j in range(n)]
        return [(j, ray_cube(cube, Y + a, P), None) for j, Y, P in spread_lines(cube, N)]
    if pat in ('fan', 'fan-sweep'):
        yc = centre(Y0, A * s if pat == 'fan-sweep' else 0.0)
        for k in range(N):                                  # ray k (west → east) on line k·n/N (west → east aims)
            f = (2 * k / (N - 1) - 1) if N > 1 else 0
            out.append((line_of(k, N, n), ray(cube, yc + W * f, P0), None))
        return out
    if pat == 'single-scan':                                # the cube's outermost line
        return [(0 if side < 0 else n - 1, ray(cube, centre(Y0, A * s), P0), None)]
    if pat == 'tunnel':
        for k in range(N):
            th = math.pi * ((k / N + phase) % 1.0)          # N dots run round the upper half ring
            out.append((line_of(k, N, n), ray(cube, side * Y0 - W * math.cos(th), P0 + W * math.sin(th)), None))
        return out
    if pat == 'sky':                                        # each line draws one n-th of a waving sheet, S points each
        S = int(laser.get('segments') or 4)
        pts = []
        for j in range(n):
            seg = []
            for k in range(S):
                f = (2 * (j * (S - 1) + k) / ((S - 1) * n) - 1)
                seg.append(ray(cube, side * Y0 + W * f, P0 + A * math.sin(2 * math.pi * (f * 0.75 - phase))))
            pts.append((j, seg, None))
        return pts
    raise ValueError(pat)


def drive_at(laser, t):
    """The time-average drive (0..1) over a room frame: breathe and hits as their lit share."""
    d = 1.0
    b = laser.get('breathe')
    if b is not None:
        d *= (1 + b['min']) / 2
    h = laser.get('hits')
    if h is not None:
        d *= h['duty']
    return d


# ---- the physics ----------------------------------------------------------------------------------------------------------
def end_of(p, d, dims):
    """First surface of a lit ray: (distance, label, end point, ok, why)."""
    t, label = PHYS.first_surface(p, d, dims)
    half_span = float(dims['span_m']) / 2
    truss_bottom = float(dims['truss_bottom_h_m'])
    # the bay's column lines: crossing |x| = span/2 below the truss bottom
    for sx in (-half_span, half_span):
        if abs(d[0]) > 1e-9:
            tc = (sx - p[0]) / d[0]
            if 1e-6 < tc < t and p[1] + d[1] * tc < truss_bottom:
                t, label = tc, 'column line (bay edge)'
    end = [p[k] + d[k] * t for k in range(3)]
    ok, why = True, ''
    if d[1] < -1e-9:
        ok, why = False, 'below the horizontal'
    if label in ('floor', 'column line (bay edge)'):
        ok, why = False, label
    if label.startswith('lantern'):
        ok, why = False, 'lantern glazing: the light would leave the building'
    if label == 'entry wall' and end[1] < ENTRY_MIN_M:
        ok, why = False, f'entry wall at {end[1]:.2f} m < {ENTRY_MIN_M}'
    return t, label, end, ok, why


def crane_ok(p, d, t, crane_z):
    if crane_z is None or abs(d[2]) < 1e-9:
        return True, None
    tz = (crane_z - p[2]) / d[2]
    if not (0 < tz < t):
        return True, None
    h = p[1] + d[1] * tz
    return h >= CRANE_CLEAR_M - 0.005, h


# ---- timeline -------------------------------------------------------------------------------------------------------------
def timeline(scenes, timing):
    rows, t0 = [], 0.0
    for s in scenes:
        cue = s.get('cue') or {}
        dur = float(cue.get('hold_s', 0)) + (float(cue.get('fade_s', 0)) if timing == 'fade+hold' else 0.0)
        rows.append((t0, dur, s)); t0 += dur
    return rows, t0


def scene_at(rows, loop, tau):
    tau %= loop
    for t0, dur, s in rows:
        if t0 <= tau < t0 + dur:
            return s, tau - t0
    return rows[-1][2], tau - rows[-1][0]


def cycle_s(laser):
    return laser['tempo']['beats'] * 60.0 / laser['tempo']['bpm']


# ---- per scene: the check and the plan ------------------------------------------------------------------------------------
CUBE_SET = {'key': 'laser', 'group_key': 'cubes', 'groups': GROUPS, 'rays': lambda *a: rays_at(*a)}
LINE_SET = {'key': 'laser_lines', 'group_key': 'units', 'groups': LINE_GROUPS, 'rays': lambda *a: line_rays_at(*a)}


def scene_plan(scene, cubes, dims, crane_z, samples=24, kind=CUBE_SET):
    laser = scene.get(kind['key'])
    if laser is None:
        return {'id': scene['id'], 'laser': None}
    group = kind['groups'][laser[kind['group_key']]]
    rays_at = kind['rays']
    fails, ends, rays_out, max_field, max_line_field = [], {}, [], 0.0, 0.0
    waived = {}                                             # hall rules waived under the officer's sign-off: rule → rays
    budget = {}
    for cube in cubes:
        if cube['n'] not in group:
            continue
        for k in range(samples):
            u = k / samples
            for j, d, off in rays_at(laser, cube, group, u):
                beam = cube['beams'][j]
                dirs = d if (d and isinstance(d[0], list)) else [d]
                for dd in dirs:
                    if dd is None:
                        dd = world_of_field(off[0], off[1], beam['r'], FIELD_HALF_DEG)
                    Y, P = ray_angles(cube, dd)
                    max_field = max(max_field, abs(Y), abs(P))
                    fp = field_point(dd, beam['r'], FIELD_HALF_DEG)
                    if fp is None:
                        fails.append(f"{cube['id']} line {beam['id']}: ray behind the line"); continue
                    max_line_field = max(max_line_field, abs(fp[0]), abs(fp[1]))
                    t, label, end, ok, why = end_of(cube['p'], dd, dims)
                    cok, ch = crane_ok(cube['p'], dd, t, crane_z)
                    if not cok:
                        ok, why = False, f'near crane crossing at {ch:.2f} m < {CRANE_CLEAR_M}'
                    if not ok and OFFICER['signoff'] and waivable(why):
                        rule = next(r for r in HALL_RULES if why.startswith(r))
                        waived[rule] = waived.get(rule, 0) + 1
                        OFFICER['waived'][rule] = OFFICER['waived'].get(rule, 0) + 1
                    elif not ok:
                        fails.append(f"{cube['id']} line {beam['id']} u={u:.2f}: {why}")
                    ends.setdefault(label, []).append(end[1])
                    if k % 2 == 0 or laser['pattern'] in ('comb', 'net', 'fan', 'still'):
                        rays_out.append({'cube': cube['n'], 'from': [round(c, 2) for c in cube['p']],
                                         'to': [round(c, 2) for c in end], 'ends_on': label})
        # the real cube's point budget for one frame of this pattern
        pat = laser['pattern']
        n = int(laser.get('beams') or len(cube['beams']))
        if pat in ('comb', 'net', 'fan', 'fan-sweep', 'still', 'sweep', 'lift'):
            pts = n * (DWELL_PTS + BLANK_PTS)
        elif pat == 'single-scan':
            pts = DWELL_PTS + BLANK_PTS
        elif pat == 'tunnel':
            pts = n * (DWELL_PTS + BLANK_PTS) if laser.get('beams') else int(math.pi * laser['spread_deg'] * PTS_PER_DEG) + BLANK_PTS
        else:
            pts = int(2 * laser['spread_deg'] * PTS_PER_DEG) + BLANK_PTS
        budget[cube['n']] = pts
    if max_field > FIELD_HALF_DEG + 1e-6:
        fails.append(f'a ray at {max_field:.2f} deg from a cube axis > field ±{FIELD_HALF_DEG}')
    if max_line_field > 1 + 1e-9:
        fails.append(f'a field point at {max_line_field:.3f} > 1')
    flash = 0.0
    if laser.get('hits'):
        flash = laser['hits']['per_beat'] * laser['tempo']['bpm'] / 60.0
        if flash > MAX_FLASH_HZ:
            fails.append(f'{flash:.2f} flashes/s > {MAX_FLASH_HZ}')
    cap = CUBE_PPS // MIN_REFRESH_HZ
    worst = max(budget.values()) if budget else 0
    if worst > cap:
        fails.append(f'point budget {worst} > {cap} a frame')
    return {'id': scene['id'], 'laser': laser, 'group': list(group), 'cycle_s': round(cycle_s(laser), 2),
            'ends': {k: {'rays': len(v), 'height_m': [round(min(v), 2), round(max(v), 2)]} for k, v in ends.items()},
            'max_field_deg': round(max_field, 2), 'max_line_field': round(max_line_field, 3), 'flash_hz': round(flash, 2),
            'points_per_cube_frame': worst, 'points_cap': cap, 'lowest_m': round(min(c['p'][1] for c in cubes), 2),
            'fails': sorted(set(fails))[:12], 'fail_count': len(fails), 'waived': waived, 'waived_count': sum(waived.values()),
            'rays': rays_out[:600]}


# ---- the room's frames ----------------------------------------------------------------------------------------------------
def r4(v):
    return round(v, 4)


def room_frames(scenes, cubes, timing, epoch_ms, frames_n=MAX_FRAMES, kind=CUBE_SET, subsamples=SUBSAMPLES):
    """subsamples = 1 (--keyframes): one pose per frame, for a player that blends poses; more: the path within the frame."""
    rays_at = kind['rays']
    rows, loop = timeline(scenes, timing)
    step = loop / frames_n
    epoch_s = (epoch_ms or 0) / 1000.0
    lists = {b['id']: [] for c in cubes for b in c['beams']}
    for i in range(frames_n):
        start = (i * step - epoch_s) % loop
        per_beam = {bid: [] for bid in lists}
        for k in range(subsamples):
            tau = start + step * (k + 0.5) / subsamples
            s, ts = scene_at(rows, loop, tau)
            laser = s.get(kind['key'])
            if laser is None:
                continue
            group = kind['groups'][laser[kind['group_key']]]
            u = (ts / cycle_s(laser)) % 1.0
            drv = r4(drive_at(laser, ts))
            for cube in cubes:
                if cube['n'] not in group:
                    continue
                pieces = {}                                   # line index → the rays it carries this subsample, in order
                for j, d, off in rays_at(laser, cube, group, u):
                    beam = cube['beams'][j]
                    dirs = d if (d and isinstance(d[0], list)) else [d]
                    pts = []
                    for dd in dirs:
                        fp = off if dd is None else field_point(dd, beam['r'], FIELD_HALF_DEG)
                        pts.append([r4(fp[0]), r4(fp[1]), drv, drv, drv])
                    pieces.setdefault(j, []).append(pts)
                for j, ps in pieces.items():
                    beam = cube['beams'][j]
                    if len(ps) == 1:
                        per_beam[beam['id']].append(ps[0])        # one ray (a point) or one sheet segment, as before
                        continue
                    # several rays on one line (`beams` > the lines): each lit after a BLANK move to its own spot, so the room
                    # and the cube draw separate beams and never a stroke between them (laserLine.js scanLines lights a
                    # segment by its end point; the engine blanks a move)
                    flat = []
                    for p in ps:
                        flat.append([p[0][0], p[0][1], 0, 0, 0])
                        flat.extend(p)
                    per_beam[beam['id']].append(flat)
        for bid, poses in per_beam.items():
            if not poses:
                lists[bid].append([[0, 0, 0, 0, 0]])                       # dark: one blank point
                continue
            uniq = []
            for p in poses:
                if p not in uniq:
                    uniq.append(p)
            if len(uniq) == 1 and len(uniq[0]) == 1:
                lists[bid].append(uniq[0])                                  # a still beam: one lit point, full duty
            elif all(len(p) == 1 for p in uniq):
                path = [p[0] for p in uniq]
                lists[bid].append(path + path[-2:0:-1] if len(path) > 2 else path)   # the path travelled, out and back
            else:
                # sheets: up to three poses of the sheet, each drawn after a BLANK move to its first point (laserLine.js
                # scanLines lights a segment by its end point): the jump between poses and the loop's return stay dark,
                # as a projector blanks them; only the sheet's own segments are lit (fixed 2026-10-15, laser-frames-as-rays)
                flat = []
                for p in uniq[:3]:
                    flat.append([p[0][0], p[0][1], 0, 0, 0])
                    flat.extend(p)
                lists[bid].append(flat)
    total = {bid: sum(len(f) for f in fl) for bid, fl in lists.items()}
    return lists, loop, step, total


def stills_of(plans, cubes):
    """Per cube, the still beams (cube field x, y) of the static patterns: for the officer's laser.json stillBeams."""
    out = {}
    for c in cubes:
        pts = set()
        for p in plans:
            L = p.get('laser')
            if not L or L['pattern'] not in ('comb', 'net', 'fan') or c['n'] not in GROUPS[L['cubes']]:
                continue
            for j, d, off in rays_at(L, c, GROUPS[L['cubes']], 0.0):
                dd = d if d is not None else world_of_field(off[0], off[1], c['beams'][j]['r'], FIELD_HALF_DEG)
                Y, P = ray_angles(c, dd)
                pts.add((round(Y / FIELD_HALF_DEG, 3), round(P / FIELD_HALF_DEG, 3)))
        out[c['id']] = [{'x': x, 'y': y, 'within': 0.01} for x, y in sorted(pts)]
    return out


def desk_values(line, rays, units):
    """What the desk sends a line unit in this scene (fixtureTypes.js UP-LA40WF 32 ch): ch 1 dimmer, ch 5 colour, ch 6/7 the aim range."""
    name, value = LINE_COLOURS[line['colour'].lower()]
    pts = []
    for u in units:
        if u['n'] not in LINE_GROUPS[line['units']]:
            continue
        for k in range(24):
            for _, d, off in line_rays_at(line, u, LINE_GROUPS[line['units']], k / 24):
                pts.append(off if d is None else field_point(d, u['beams'][0]['r'], FIELD_HALF_DEG))
    dmx = lambda v: int(round(64 + max(-1, min(1, v)) * 61))            # ch 6/7: 0-125 by hand, 64 centre (fixtureTypes.js cap.aim)
    xs, ys = [p[0] for p in pts], [p[1] for p in pts]
    return {'ch1_dimmer': int(round(line['level'] * 255)), 'ch5_colour': value, 'colour': name,
            'ch6_x': [dmx(min(xs)), dmx(max(xs))], 'ch7_y': [dmx(min(ys)), dmx(max(ys))]}


def main(argv=None):
    global LEVEL_CAP
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    ap.add_argument('--scenes', required=True)
    ap.add_argument('--rig', required=True)
    ap.add_argument('--hall', required=True, help='hall record with dims (span_m, truss_bottom_h_m, truss_top_h_m, ...)')
    ap.add_argument('--out', help='the rig with frames written into each cube line (fixtures[].laser.beams[].frames)')
    ap.add_argument('--plan-out', help='per-scene check and top-plan rays (JSON) for the sheet')
    ap.add_argument('--crane-z', type=float, default=None, help='z of the crane the lines cross (clearance 9.2 m)')
    ap.add_argument('--show-epoch-ms', type=float, default=0)
    ap.add_argument('--timing', choices=('clock', 'fade+hold'), default='clock',
                    help='clock: a cue lasts its hold (showClock.js); fade+hold: fade then hold')
    ap.add_argument('--check', action='store_true', help='check only, write nothing but --plan-out')
    ap.add_argument('--keyframes', action='store_true', help='one pose per frame and frames.tween true: a player blends pose to pose')
    ap.add_argument('--officer-checked', default=None, metavar='SIGNOFF',
                    help='the laser safety officer signs the hall off: the hall rules (lantern, column line, entry minimum, floor, '
                         'below the horizontal, crane) are waived and written down, not failed; the field, flash and budget stay')
    ap.add_argument('--level-cap', type=float, default=None, help=f'the brightness ceiling a scene may ask (default {LEVEL_CAP}, at most 1.0)')
    a = ap.parse_args(argv)
    if a.officer_checked:
        OFFICER['signoff'] = a.officer_checked.strip() or None
    if a.level_cap is not None:
        LEVEL_CAP = max(0.01, min(1.0, float(a.level_cap)))
    S = json.load(open(a.scenes)); rig = json.load(open(a.rig)); dims = json.load(open(a.hall))['dims']
    scenes = S['scenes'] if isinstance(S, dict) else S
    errors = [m for s in scenes for m in validate_laser(s.get('laser'), s.get('id', '?'))]
    errors += [m for s in scenes for m in validate_line(s.get('laser_lines'), s.get('id', '?'))]
    if errors:
        print(json.dumps({'ok': False, 'schema_errors': errors[:40]}, indent=1)); return 1
    cubes = cubes_of(rig)
    if not cubes:
        print(json.dumps({'ok': False, 'error': f'no {CUBE_TYPE} fixtures with beams in the rig'})); return 1
    plans = [scene_plan(s, cubes, dims, a.crane_z) for s in scenes]
    lists, loop, step, total = room_frames(scenes, cubes, a.timing, a.show_epoch_ms, subsamples=1 if a.keyframes else SUBSAMPLES)
    frame_fails = [f'{bid}: {n} points > {MAX_POINTS}' for bid, n in total.items() if n > MAX_POINTS]
    units = units_of(rig)
    line_plans, line_lists = [], {}
    if units and any(s.get('laser_lines') for s in scenes):
        line_plans = [scene_plan(s, units, dims, a.crane_z, kind=LINE_SET) for s in scenes]
        for p in line_plans:
            if p.get('laser'):
                p['desk'] = desk_values(p['laser'], [r for r in p['rays']], units)
        line_lists, _, _, line_total = room_frames(scenes, units, a.timing, a.show_epoch_ms, kind=LINE_SET)
        frame_fails += [f'{bid}: {n} points > {MAX_POINTS}' for bid, n in line_total.items() if n > MAX_POINTS]
        total.update(line_total)
    fails = [(p['id'], p['fails']) for p in plans if p.get('fail_count')]
    fails += [(p['id'] + ' (lines)', p['fails']) for p in line_plans if p.get('fail_count')]
    officer = {'signoff': OFFICER['signoff'], 'waived': dict(OFFICER['waived']), 'level_cap': LEVEL_CAP} if OFFICER['signoff'] or a.level_cap is not None else None
    summary = {'ok': not fails and not frame_fails, 'officer_checked': officer, 'cubes': [c['id'] for c in cubes], 'lines': sum(len(c['beams']) for c in cubes),
               'scenes': len(scenes), 'scenes_lit': sum(1 for p in plans if p.get('laser')), 'loop_s': round(loop, 2),
               'timing': a.timing, 'frames': MAX_FRAMES, 'step_s': round(step, 3), 'max_points_a_line': max(total.values()),
               'show_epoch_ms': a.show_epoch_ms, 'fails': fails[:20], 'frame_fails': frame_fails,
               'line_units': [u['id'] for u in units], 'line_scenes_lit': sum(1 for p in line_plans if p.get('laser'))}
    if a.plan_out:
        json.dump({'summary': summary, 'stillBeams': stills_of(plans, cubes),
                   'cubes': [{'n': c['n'], 'id': c['id'], 'p': c['p']} for c in cubes], 'scenes': plans,
                   'line_units': [{'n': u['n'], 'id': u['id'], 'p': u['p'], 'yaw0': round(u['yaw0'], 2), 'pitch0': round(u['pitch0'], 2)} for u in units],
                   'line_scenes': line_plans},
                  open(a.plan_out, 'w'), indent=0)
    if summary['ok'] and a.out and not a.check:
        for f in rig['fixtures']:
            if f.get('type') != CUBE_TYPE:
                continue
            for b in f['laser']['beams']:
                if b['id'] in lists:
                    b['frames'] = {'period': round(loop, 3), 'list': lists[b['id']], **({'tween': True} if a.keyframes else {})}
                    b['fieldHalfDeg'] = FIELD_HALF_DEG
            f['laser']['frames_source'] = (f'scripts/place/laser_frames.py from {os.path.basename(a.scenes)} `laser`; '
                                           f'{MAX_FRAMES} frames x {step:.3f} s, timing {a.timing}, epoch {a.show_epoch_ms:.0f} ms'
                                           + ('; keyframes (tween)' if a.keyframes else ''))
        for f in rig['fixtures']:
            if f.get('type') not in LINE_TYPES or not line_lists:
                continue
            for b in f['laser']['beams']:
                if b['id'] in line_lists:
                    b['frames'] = {'period': round(loop, 3), 'list': line_lists[b['id']]}
                    b['fieldHalfDeg'] = FIELD_HALF_DEG
            f['laser']['frames_source'] = (f'scripts/place/laser_frames.py from {os.path.basename(a.scenes)} `laser_lines`; '
                                           f'{MAX_FRAMES} frames x {step:.3f} s, timing {a.timing}, epoch {a.show_epoch_ms:.0f} ms')
        if officer:
            rig['officer_checked'] = {**officer, 'at': datetime.datetime.now().isoformat(timespec='minutes'), 'scenes': os.path.basename(a.scenes)}
        json.dump(rig, open(a.out, 'w'), indent=1, ensure_ascii=False)
        summary['written'] = a.out
    print(json.dumps(summary, indent=1))
    return 0 if summary['ok'] else 1


if __name__ == '__main__':
    sys.exit(main())
