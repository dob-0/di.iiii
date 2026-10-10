#!/usr/bin/env python3
# epic_plot.py — the epic plot, PHASE 2 DRAFT (2026-10-08), SUPERSEDED by moxir_v1.py (elite + minimal + the review): kept for its helpers: the owner chose every advised placement option.
# From the advised placement (epic_placement.py) this derives the looks and cues, the full fixture schedule (position,
# mount, aim, colour, DMX, watts, circuit), the network (the 6 LaserCubes on one switch, fixed IPs; they take di's LAN stream, not DMX), the
# power budget per circuit and the supply the venue must give, the cable runs, every check, and writes:
#   rigs/moxir-epic-2026-10-08.json         the rig file (the beta v0.9 snapshot schema: one record per unit, read by
#                                          scripts/rigbuild/epic-build.mjs to load it into a copy of beta, as ops)
#   <out>/epic.html, <out>/epic-look-*.png  the plot, a picture per look
#   <out>/crew-setup.html                   the one-page set-up sheet
#   the survey copy (occlusion/moxir-survey.html): today's open items appended (a backup is kept beside it)
#
#   python3 -I scripts/place/epic_plot.py --repo . --out ~/Downloads/moxir/stage/epic            # everything
#   python3 -I scripts/place/epic_plot.py --repo . --check                                        # the numbers, JSON
#
# METHODS (named; numbers carry their source in the output)
#   - DMX512-A (ANSI E1.11-2008 R2018): 512 slots per universe; at most 32 unit loads on one line segment, so every
#     branch here holds <= 32 devices (a splitter output starts a new segment). Art-Net 4 (Artistic Licence) for the
#     network side: port-address = net/sub-net/universe.
#   - Ethernet: TIA-568 channel length <= 100 m for Cat6 (90 m permanent link + 10 m cords).
#   - Power: 230 V single-phase 16 A circuits planned at 80 % = 2944 W (the repo's planning limit, audit A-05, the
#     continuous-load derating practice of BS 7909 / IEC 60364-7-711); fixture watts from fixtures.json (supply watts
#     where the maker states them). The 3-phase supply need is the connected load split over three phases.
#   - Cable lengths: Manhattan distance along the floor (cables follow walls and column lines, never diagonals across
#     the floor), plus every rise to a fixture, plus 10 % slack; nearest-neighbour daisy-chain order from the source.
#     A planning method, not a measured route (the route is walked on site).
#   - Ground movers: no B380F / 250BSW / HK1915 ray crosses the dance zone (x +-5.35, z 25.8-48) below 2.5 m.
import argparse, base64, collections, html, json, math, os, shutil, sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.dont_write_bytecode = True
import numpy as np

ap = argparse.ArgumentParser()
ap.add_argument('--repo', default='.')
ap.add_argument('--out', default=None)
ap.add_argument('--check', action='store_true')
ap.add_argument('--survey', default='~/Downloads/moxir/stage/occlusion/moxir-survey.html')
ap.add_argument('--rig-out', default='scripts/place/rigs/moxir-epic-phase2-2026-10-08.json')
A4 = ap.parse_known_args()[0]

import epic_placement as EP      # noqa: E402  (the advised placement, measured; lasers_v2, design_paint, the engine)
LV, D, L, OC = EP.LV, EP.D, EP.L, EP.OC
FXJ = json.load(open(os.path.join(A4.repo, 'scripts/place/fixtures/fixtures.json')))
GRPS = EP.GRP
for g, o in (('far', 'b'), ('columns', 'feet'), ('roof', 'floor'), ('farwall', 'floor'), ('beams', 'depth'), ('haze', 'plus2'), ('flash', 'behind')):
    assert GRPS[g]['advice'] == o, 'the owner chose the advised option of every group (2026-10-08): %s is now %s' % (g, GRPS[g]['advice'])

ASH, ASH_GREY, EMBER, EMBER_DEEP = '#e8e4dc', '#a9a49a', '#ff4a12', '#b0200c'

# ------------------------------------------------------------------ the units: what each one is
KIND_OF = {'ext-lc-ultra-mk2': 'lasercube', 'up-pl5403': 'par', 'up-b380f': 'beam380', 'up-250bsw': 'bsw250', 'up-hk1915': 'beeEye',
           'ext-strobe': 'strobe', 'ext-blinder': 'blinder', 'ext-hazer': 'hazer', 'up-yz31p': 'smoke'}
CODE = {k: FXJ['kinds'][v]['code'] for k, v in KIND_OF.items()}


def spec(type_id, field):
    s = FXJ['kinds'][KIND_OF[type_id]]['specs'].get(field)
    return s['value'] if isinstance(s, dict) else s


# Mains watts: the maker's supply figure where stated (UP-PL5403 200 W), else its power rating; the LaserCube's is not
# in the repo's datasheet: ASSUMED 150 W until the power brick's label is read (shot list).
WATTS = {t: (spec(t, 'supply_w') or spec(t, 'power_w')) for t in KIND_OF if t != 'ext-lc-ultra-mk2'}
WATTS['ext-lc-ultra-mk2'] = 150
WATTS_BASIS = {t: ('supply_w' if spec(t, 'supply_w') else 'power_w') + ' (fixtures.json %s)' % KIND_OF[t] for t in WATTS if t != 'ext-lc-ultra-mk2'}
WATTS_BASIS['ext-lc-ultra-mk2'] = 'ASSUMED 150 W: no mains figure in the repo\'s datasheet; read the power brick on site'
# DMX footprint: the smallest mode the maker publishes (fixtures.json dmx_channels), the planning default
FOOT = {'up-pl5403': 8, 'up-b380f': 16, 'up-250bsw': 24, 'up-hk1915': 21, 'ext-strobe': 4, 'ext-blinder': 4, 'ext-hazer': 2, 'up-yz31p': 1, 'ext-lc-ultra-mk2': 16}
for t, n in FOOT.items():
    ch = spec(t, 'dmx_channels')
    assert n in (ch if isinstance(ch, list) else [ch]), (t, n, ch)

PART_OF_GROUP = {'the X (truss)': 'cut-x', 'the curtain (truss)': 'cut-curtain', 'the bridge-up PARs (truss top)': 'cut-bridge',
                 'the halo PARs (floor, behind the riser)': 'halo', 'the press crown (floor, in front of the press)': 'press',
                 'the backlight fan (floor, behind the riser)': 'fan', 'the spine (floor, behind the truss)': 'spine',
                 'wash: left span wall columns (PAR uplights)': 'col-wall', 'wash: right span wall columns (PAR uplights)': 'col-wall',
                 'the vista (far columns)': 'col-vista', 'wash: left span roof (HK1915, up)': 'roof', 'wash: right span roof (HK1915, up)': 'roof',
                 'wash: the far end wall (BSW250)': 'farwall', "wash: the side spans' far ends (BSW250)": 'spanends',
                 'wash: beside the audience (BSW250, up)': 'beside', 'the column arch (floor, column rows)': 'arches',
                 'the depth comb (far nave floor)': 'comb', 'flash: strobe': 'strobe', 'flash: blinder': 'blinder', 'hazers': 'hazer', 'smoke': 'smoke'}
LAYER_OF = {'cut-x': 'cut', 'cut-curtain': 'cut', 'cut-bridge': 'cut', 'halo': 'stage', 'press': 'stage', 'fan': 'beams', 'spine': 'beams',
            'arches': 'beams', 'comb': 'beams', 'col-wall': 'hall', 'col-vista': 'hall', 'roof': 'hall', 'farwall': 'hall', 'spanends': 'hall',
            'beside': 'hall', 'strobe': 'flash', 'blinder': 'flash', 'laser': 'lasers', 'hazer': 'air', 'smoke': 'air'}
MOUNT = {'cut-x': 'hung under the cut (H30V), half-coupler + safety', 'cut-curtain': 'hung under the cut, half-coupler + safety, straight down',
         'cut-bridge': 'standing on the cut\'s top chords, half-coupler + safety', 'halo': 'floor, on its bracket', 'press': 'floor, on its bracket',
         'fan': 'floor, base down (mount face 0.7 m)', 'spine': 'floor, base down', 'arches': 'floor at the column row, base down',
         'comb': 'floor in the far nave, base down', 'col-wall': 'floor bracket 0.7 m off the column face', 'col-vista': 'floor bracket at the column\'s nave face',
         'roof': 'floor, base down, lens up', 'farwall': 'floor, base down', 'spanends': 'floor, base down', 'beside': 'floor, base down',
         'strobe': 'floor strip behind the truss, on a stand plate', 'blinder': 'floor strip behind the truss, on a stand plate',
         'hazer': 'floor', 'smoke': 'floor'}


def advised_units():
    out, LZ, FXO = EP.run()
    fx = []
    seen_ids = set()

    def add(f, part=None):
        if f['id'] in seen_ids:
            return
        seen_ids.add(f['id'])
        fx.append(dict(f, part=part or PART_OF_GROUP[f['groupName']]))
    for f in FXO[('truss', 'kept')] + FXO[('stagefloor', 'kept')]:
        add(f)
    for g in ('columns', 'roof', 'farwall', 'beams', 'flash'):
        for f in FXO[(g, GRPS[g]['advice'])]:
            add(f)
    others = EP.BY_GROUP["wash: the side spans' far ends (BSW250)"] + EP.BY_GROUP['wash: beside the audience (BSW250, up)']
    rows = EP.check_fixtures([dict(f) for f in others], ('farwall', 'others'))
    out['groups']['farwall_others'] = {'kept': {'summary': EP.summarise(rows), 'rows': rows}}
    for f in others:
        add(f)
    for f in FXO[('haze', GRPS['haze']['advice'])] + EP.BY_GROUP['smoke']:
        add(dict(f, groupName='smoke' if f['kind'] == 'smoke' else 'hazers'))
    return out, LZ, FXO, fx


# ------------------------------------------------------------------ the lasers
# LEGACY (owner N460.2, 2026-10-09): the cubes were once planned on Art-Net universe ten, 16 ch each. They run on the LAN through
# di Nodes (LaserCube UDP 45456-45458) with NO DMX. The key stays only because the committed rig files and moxir_v1_1.py still
# read laser.artnet; nothing is patched from it and no text below says it.
ARTNET_LASER_UNIVERSE = 10


def cubes(LZ):
    run = LZ['b']
    out = []
    for c in LV.V2['cubes']:
        bs = [(b, r) for b, r in zip(run['bs'], run['res']) if b['cube'] == c['n']]
        b0 = bs[0][0]
        mid = EP.unit(np.mean([b['d'] for b, _ in bs], axis=0))
        out.append({'n': c['n'], 'id': c['id'], 'type': 'ext-lc-ultra-mk2', 'p': [round(float(v), 3) for v in b0['p']], 'mount': b0['mount'],
                    'colour': c['colour'], 'hex': LV.V2['colours'][c['colour']], 'ip': '192.168.1.%d' % (100 + c['n']),
                    'artnet': {'universe': ARTNET_LASER_UNIVERSE, 'address': 1 + 16 * (c['n'] - 1), 'footprint': 16},
                    'd': mid, 'beams': [{'id': b['id'], 'to': [round(float(v), 2) for v in r['to']], 'stop': r['stop'], 'length_m': r['length_m'],
                                         'pass': r['pass'], 'cd_m2_per_beam': run['vis'][b['id']]['cd_m2'], 'seen': run['vis'][b['id']]['seen_share'],
                                         'aim_yaw_deg': yaw_el(b['d'])[0], 'aim_el_deg': yaw_el(b['d'])[1]} for b, r in bs],
                    'power_w': WATTS['ext-lc-ultra-mk2']})
    return out


def yaw_el(d):
    d = np.asarray(d, float)
    return round(math.degrees(math.atan2(d[0], -d[2])), 1), round(math.degrees(math.asin(max(-1, min(1, d[1])))), 1)


# ------------------------------------------------------------------ DMX
BRANCHES = [  # (branch, universe, Art-Net port-address, node, parts in chain order)
    ('U1-A truss', 1, 0, 'NODE-STAGE', ['cut-x', 'cut-curtain', 'cut-bridge', 'strobe', 'blinder']),
    ('U1-B stage floor', 1, 0, 'NODE-STAGE', ['halo', 'fan', 'spine', 'press', 'arches', 'hazer-near', 'smoke']),
    ('U2 far nave', 2, 1, 'NODE-FAR', ['comb', 'col-vista', 'farwall', 'hazer-far']),
    ('U3-S left span, far half', 3, 2, 'NODE-LEFT', ['col-wall-L-S', 'roof-L-S', 'spanends-L-S']),
    ('U3-N left span, near half', 3, 2, 'NODE-LEFT', ['col-wall-L-N', 'roof-L-N', 'beside-L-N']),
    ('U4-S right span, far half', 4, 3, 'NODE-RIGHT', ['col-wall-R-S', 'roof-R-S', 'spanends-R-S']),
    ('U4-N right span, near half', 4, 3, 'NODE-RIGHT', ['col-wall-R-N', 'roof-R-N', 'beside-R-N']),
]


def branch_part(f):
    p = f['part']
    if p == 'hazer':
        return 'hazer-near' if f['p'][2] > 10 else 'hazer-far'
    if p in ('col-wall', 'roof', 'spanends', 'beside'):
        return p + ('-L' if f['p'][0] < 0 else '-R') + ('-S' if f['p'][2] < 0 else '-N')
    return p


def patch(fx):
    by = collections.defaultdict(list)
    for f in fx:
        by[branch_part(f)].append(f)
    nxt = collections.Counter()
    rows = []
    for name, uni, pa, node, parts in BRANCHES:
        devs = 0
        for part in parts:
            for f in sorted(by.pop(part, []), key=lambda f: (round(f['p'][2], 1), f['p'][0])):
                n = FOOT[f['type']]
                a = nxt[uni] + 1
                nxt[uni] += n
                f['dmx'] = {'universe': uni, 'address': a, 'footprint': n, 'branch': name, 'artnet_port_address': pa, 'node': node}
                devs += 1
        rows.append({'branch': name, 'universe': uni, 'artnet_port_address': pa, 'node': node, 'devices': devs})
    assert not by, 'unpatched parts: %s' % list(by)
    used = {u: nxt[u] for u in sorted(nxt)}
    return rows, used


# ------------------------------------------------------------------ places of the infrastructure (ASSUMED until walked)
SITES = {
    'FOH': (7.5, 0.0, 45.0, 'the desk: house right of the dance floor\'s back edge, outside the used zone (x 5.35): ASSUMED, walk it'),
    'D-STAGE': (-8.0, 0.0, 19.0, 'main lighting distro behind the stage, house left of the truss line'),
    'D-FAR': (-8.0, 0.0, -24.0, 'far-nave sub-distro at the nave column x -12 z -24'),
    'D-LEFT': (-29.5, 0.0, 0.0, 'left-span sub-distro at the joint, between the wall columns and the roof washes'),
    'D-RIGHT': (29.5, 0.0, 0.0, 'right-span sub-distro at the joint'),
    'SW-FOH': (7.5, 0.0, 45.0, 'switch at the desk'),
    'SW-STAGE': (-6.5, 0.0, 20.4, 'switch behind the truss (with NODE-STAGE)'),
    'SW-LASER': (-6.5, 0.0, -24.0, 'the laser switch: all 6 cubes on it (with NODE-FAR)'),
    'NODE-STAGE': (-6.5, 0.0, 20.4, 'Art-Net to DMX, 2 ports: U1-A, U1-B (the same universe on both)'),
    'NODE-FAR': (-6.5, 0.0, -24.0, 'Art-Net to DMX, 1 port: U2'),
    'NODE-LEFT': (-29.5, 0.0, 0.0, 'Art-Net to DMX at the left span\'s joint, 2 ports: U3 to the far half and the near half'),
    'NODE-RIGHT': (29.5, 0.0, 0.0, 'Art-Net to DMX at the right span\'s joint, 2 ports: U4 to the far half and the near half'),
}
ZONE_DISTRO = lambda f: ('D-LEFT' if f['p'][0] < -12.6 else 'D-RIGHT' if f['p'][0] > 12.6 else ('D-FAR' if f['p'][2] < 0 else 'D-STAGE'))
CIRCUIT_W = 2944
# Voltage drop, copper, single-phase, mV per amp per metre (BS 7671:2018 Appendix 4, Table 4D2B, 70 C): the drop is
# taken as if the whole load sat at the end of the run (conservative), and must stay <= 5 % of 230 V (BS 7909 practice).
MV_A_M = {2.5: 18.0, 4.0: 11.0, 6.0: 7.3}


def manhattan(a, b):
    return abs(a[0] - b[0]) + abs(a[2] - b[2])


def chain(src, pts):
    """Nearest-neighbour order from src; the length along the floor + every rise + 10 % slack."""
    left = list(pts)
    cur = np.asarray(src, float)
    order, run = [], 0.0
    while left:
        k = min(range(len(left)), key=lambda i: manhattan(cur, left[i]['p']))
        q = left.pop(k)
        run += manhattan(cur, q['p']) + abs(float(q['p'][1]) - float(cur[1]))
        cur = np.asarray(q['p'], float)
        order.append(q)
    return order, round(run * 1.10, 1)


def circuits(fx, cubes_):
    units = list(fx) + [dict(c, part='laser', p=np.array(c['p'])) for c in cubes_]
    by = collections.defaultdict(list)
    for f in units:
        by[ZONE_DISTRO(f)].append(f)
    rows = []
    split = collections.defaultdict(list)
    for dist, us in by.items():
        for u in us:
            split[(dist, ('S' if u['p'][2] < 0 else 'N') if dist in ('D-LEFT', 'D-RIGHT') else '')].append(u)
    for (dist, half), us in split.items():
        src = SITES[dist][:3]
        # lasers on their own clean circuit with the network; heaters (hazers, smoke) never share with lamps
        groups = [('lasers + network', [u for u in us if u['part'] == 'laser'])]
        groups.append(('heaters', [u for u in us if u['part'] in ('hazer', 'smoke')]))
        groups.append(('lamps', [u for u in us if u['part'] not in ('laser', 'hazer', 'smoke')]))
        for tag, gu in groups:
            if not gu:
                continue
            order, _ = chain(src, gu)
            cur, load = [], 0.0
            for u in order:
                w = WATTS[u['type']]
                if cur and load + w > CIRCUIT_W:
                    rows.append((dist, tag, cur, load))
                    cur, load = [], 0.0
                cur.append(u)
                load += w
            if cur:
                rows.append((dist, tag, cur, load + (120 if tag == 'lasers + network' else 0)))
    out = []
    for i, (dist, tag, us, load) in enumerate(sorted(rows, key=lambda r: (list(SITES).index(r[0]), r[1]))):
        cid = 'C%02d' % (i + 1)
        _, run = chain(SITES[dist][:3], us)
        for u in us:
            u['circuit'] = cid
        amps = load / 230.0
        size = next((mm for mm in (2.5, 4.0, 6.0) if MV_A_M[mm] * amps * run / 1000.0 <= 0.05 * 230), None)
        vd = MV_A_M[size or 6.0] * amps * run / 1000.0
        out.append({'circuit': cid, 'distro': dist, 'kind': tag, 'units': [u['id'] for u in us], 'n': len(us), 'load_w': round(load),
                    'amps_230v': round(amps, 1), 'limit_w': CIRCUIT_W, 'cable_m': run, 'cable_mm2': size or 6.0,
                    'vdrop_v': round(vd, 1), 'vdrop_pct': round(100 * vd / 230, 1), 'ok': load <= CIRCUIT_W and size is not None,
                    'cable': 'H07RN-F 3G%g, 16 A CEE / Schuko; daisy-chained PowerCON TRUE1 where the fixture has it' % (size or 6.0)})
    # phases: greedy balance per distro feed
    ph = {'L1': 0.0, 'L2': 0.0, 'L3': 0.0}
    for c in sorted(out, key=lambda c: -c['load_w']):
        k = min(ph, key=ph.get)
        c['phase'] = k
        ph[k] += c['load_w']
    return out, ph


def supply(circ, ph):
    tot = sum(c['load_w'] for c in circ)
    by = collections.defaultdict(float)
    for c in circ:
        by[c['distro']] += c['load_w']
    worst = max(ph.values())
    amps = worst / 230.0
    need = next(a for a in (32, 63, 125, 250) if a >= amps)
    return {'connected_w': round(tot), 'per_distro_w': {k: round(v) for k, v in by.items()}, 'per_phase_w': {k: round(v) for k, v in ph.items()},
            'worst_phase_a': round(amps, 1), 'need': '3-phase 400 V / 230 V, %d A per phase (CEE %dA 5-pin), for lighting and effects only (sound on its own supply)' % (need, need),
            'need_a': need,
            'basis': 'connected load (every unit at its datasheet watts, every circuit at once: the hazers\' and smoke machines\' heaters at warm-up are the worst case), balanced over 3 phases; no diversity taken. If the venue gives less, the first to cut is the smoke machines (6 kW) on a timer, then the hazers\' warm-up staggered.',
            'feeds': {'D-STAGE': 'main distro; the venue supply lands here (OPEN: where is the supply point?)', 'D-FAR': 'sub-feed from D-STAGE, 5-core 16 mm2 or 32 A CEE 3-phase',
                      'D-LEFT': 'sub-feed from D-STAGE, 32 A CEE 3-phase', 'D-RIGHT': 'sub-feed from D-STAGE, 32 A CEE 3-phase'}}


def network(cubes_):
    links = []

    def link(a, b, what, kind='Cat6 U/FTP, etherCON'):
        pa, pb = SITES[a][:3] if a in SITES else a, SITES[b][:3] if b in SITES else b
        m = round((manhattan(pa, pb) + abs(pa[1] - pb[1])) * 1.1, 1)
        links.append({'from': a if isinstance(a, str) else what.split(':')[0], 'to': b if isinstance(b, str) else what, 'what': what, 'kind': kind,
                      'length_m': m, 'limit_m': 100, 'ok': m <= 100})
    link('SW-FOH', 'SW-STAGE', 'backbone: the desk to the stage')
    link('SW-STAGE', 'SW-LASER', 'backbone: the stage to the far nave')
    link('SW-STAGE', 'NODE-LEFT', 'the left span\'s node')
    link('SW-STAGE', 'NODE-RIGHT', 'the right span\'s node')
    for c in cubes_:
        link('SW-LASER', tuple(c['p']), 'cube %d (%s)' % (c['n'], c['ip']))
    ips = [{'ip': '192.168.1.2', 'what': 'SW-FOH, managed gigabit switch (mgmt)'}, {'ip': '192.168.1.3', 'what': 'SW-STAGE, managed gigabit switch (mgmt)'},
           {'ip': '192.168.1.4', 'what': 'SW-LASER, managed gigabit switch, 8 ports: the 6 cubes + the uplink + NODE-FAR'},
           {'ip': '192.168.1.10', 'what': 'the desk (UP-Q3L MA console from the rental list): Art-Net out'},
           {'ip': '192.168.1.11', 'what': 'the di Nodes laptop (the lasers\' stream, the previs)'},
           {'ip': '192.168.1.21', 'what': 'NODE-STAGE, Art-Net to DMX, 2 ports (port-address 0 on both: U1-A, U1-B)'},
           {'ip': '192.168.1.22', 'what': 'NODE-FAR, Art-Net to DMX, 1 port (port-address 1)'},
           {'ip': '192.168.1.23', 'what': 'NODE-LEFT, Art-Net to DMX, 2 ports (port-address 2 on both)'},
           {'ip': '192.168.1.24', 'what': 'NODE-RIGHT, Art-Net to DMX, 2 ports (port-address 3 on both)'}] + \
          [{'ip': c['ip'], 'what': 'LaserCube %d (%s): LAN only, through di Nodes (LaserCube UDP 45456-45458), no DMX' % (c['n'], c['colour'])} for c in cubes_]
    return {'subnet': '192.168.1.0/24, mask 255.255.255.0, no gateway, no DHCP: every address fixed by hand on the unit, written on a label on it',
            'rules': ['a closed show network: nothing else plugged in, no Wi-Fi bridge (each cube\'s Wi-Fi OFF, set in LaserOS)',
                      'the cubes on ONE switch, SW-LASER, as asked; di Nodes (the laptop at 192.168.1.11) reaches them through the two backbone links',
                      'Art-Net 4: the console sends unicast to the nodes; the cubes are not on Art-Net (di Nodes sends each its own UDP stream, ports 45456-45458, about 2.4 Mbit/s at 30 kpps)',
                      'the cubes run over the LAN through di Nodes, never DMX or Art-Net (owner N460.2, 2026-10-09); the maker\'s 16-ch DMX profile (ULTRA MK2 Guide pp. 57-59) is unused. The stream is reverse-engineered and unconfirmed on a real cube: the real-cube test is owed'],
            'ips': ips, 'links': links}


def dmx_runs(fx, rows):
    out = []
    for name, uni, pa, node, parts in BRANCHES:
        us = [f for f in fx if f.get('dmx', {}).get('branch') == name]
        _, m = chain(SITES[node][:3], us)
        out.append({'branch': name, 'from': node, 'devices': len(us), 'length_m': m, 'limit': 'ANSI E1.11: 32 unit loads per segment; 300 m planning length on DMX cable (ESTA practice)',
                    'ok': len(us) <= 32 and m <= 300, 'cable': '5-pin XLR DMX cable (120 ohm), terminated at the last unit'})
    return out


# ------------------------------------------------------------------ ground movers through the dance zone
def mover_check(fx):
    bad = []
    for f in fx:
        if f['type'] not in ('up-b380f', 'up-250bsw', 'up-hk1915'):
            continue
        a = D.RES.get(f['id'])
        if not a:
            continue
        for r in a['_spec']:
            e = EP.land(f, r)
            for s in np.linspace(0, 1, 60):
                q = f['p'] + (e - f['p']) * s
                if -5.35 <= q[0] <= 5.35 and 25.8 <= q[2] <= 48.0 and q[1] < 2.5:
                    bad.append(f['id'])
                    break
            else:
                continue
            break
    return sorted(set(bad))


# ------------------------------------------------------------------ the looks and the cues
# Each look: the parts that burn (and at what colour / level); layers = the parts' layers; <= 3 per look.
LOOKS = [
    {'id': 'embers', 'title': '1 · Embers', 'when': 'doors, the first hour: haze building',
     'parts': {'halo': (EMBER, 0.45), 'farwall': (EMBER_DEEP, 0.35), 'col-vista': (EMBER_DEEP, 0.3)},
     'floor_sees': 'black hall; a low red glow behind the DJ\'s place; 75 m away the far wall and the far columns glow dark red through the haze',
     'ash': 'what still glows after the fire: embers at both ends of a dead hall', 'refs': 'one colour per part; darkness as a layer'},
    {'id': 'burnt_hall', 'title': '2 · The burnt-out hall', 'when': 'the warm-up sets: the hall as the set',
     'parts': {'roof': (ASH, 0.8), 'col-wall': (EMBER, 0.7), 'col-vista': (EMBER, 0.7), 'farwall': (EMBER, 0.6), 'spanends': (EMBER, 0.6), 'halo': (EMBER_DEEP, 0.3)},
     'floor_sees': 'the side spans\' roofs a cold ash-white ceiling end to end; every column foot-to-head in ember; the far wall red; the DJ a dim shape',
     'ash': 'the factory as what is left standing after the fire: cold ash above, embers at the feet', 'refs': 'mirrored pairs (left span = right span); one colour per part'},
    {'id': 'silhouette', 'title': '3 · The silhouette', 'when': 'the headliner walks on; the first drop of the night is held back',
     'parts': {'cut-curtain': (ASH, 1.0), 'cut-x': (EMBER, 1.0), 'fan': (ASH, 1.0), 'halo': (EMBER, 0.6)},
     'floor_sees': 'the DJ black, cut out of an ash-white sheet of light falling from the truss; the red X over his head; seven white beams meeting 10 m above him',
     'ash': 'a figure standing in the smoke in front of the last of the fire', 'refs': 'video 4: silhouette + beams meeting at one point; video 1: the backlight'},
    {'id': 'sparks', 'title': '4 · Sparks from the depth', 'when': 'the build: the laser chase from far to near',
     'parts': {'laser': (None, 1.0), 'comb': (ASH, 0.9), 'farwall': (EMBER_DEEP, 0.4)},
     'floor_sees': 'ash-white and ember-red lines born 64 m behind the DJ, converging on the stage; four white columns of light rising out of the dark far half',
     'ash': 'sparks rising out of the dark of a burnt-out hall, carried by the smoke toward the stage', 'refs': 'chase 2 → 1+3 → 4+5 → 6 → all (mirrored pairs); one colour per part'},
    {'id': 'fire', 'title': '5 · The fire (the drop)', 'when': 'the peak: on the downbeat, then a blackout',
     'parts': {'laser': (None, 1.0), 'arches': (ASH, 1.0), 'fan': (ASH, 1.0), 'spine': (ASH, 1.0), 'comb': (ASH, 1.0), 'strobe': (ASH, 1.0), 'blinder': (ASH, 1.0)},
     'floor_sees': 'everything at once for 16 bars: the laser web, the arches over the floor, the fan, the comb, the flash behind the DJ (no light in the eyes); then 2 bars of black',
     'ash': 'the fire itself, once; then the black it leaves', 'refs': 'all synced, then blackout (videos 2, 3); the flash behind the DJ is a white silhouette'},
    {'id': 'ash_falling', 'title': '6 · Ash falling (the breakdown)', 'when': 'the breakdown: no kick',
     'parts': {'spine': (ASH, 1.0), 'cut-curtain': (ASH_GREY, 0.25)},
     'floor_sees': 'black; one thin white shaft straight up behind the DJ into the roof, a faint grey sheet behind him',
     'ash': 'one column of smoke rising from what is left', 'refs': 'video 1: blackout + one shaft'},
    {'id': 'dawn', 'title': '7 · Dawn over the ruin (the closing)', 'when': 'the last record and after: house lights by fade',
     'parts': {'roof': (ASH, 1.0), 'col-wall': (ASH, 0.6), 'halo': (EMBER_DEEP, 0.2)},
     'floor_sees': 'the roof and the walls slowly turn a grey morning white; the last ember behind the DJ goes out',
     'ash': 'the light after the fire: grey, cold, everything visible', 'refs': 'one colour per part; a long fade'},
]
CUES = [
    {'q': '1', 'look': 'embers', 'go': 'doors open', 'fade_s': 10, 'note': 'hazers on from 60 min before doors; check the far half reads (cube test beams at low power only after the LSO\'s OK)'},
    {'q': '2', 'look': 'burnt_hall', 'go': 'first DJ, by ear', 'fade_s': 20, 'note': 'slow: the hall appears'},
    {'q': '3', 'look': 'silhouette', 'go': 'headliner on stage', 'fade_s': 2, 'note': ''},
    {'q': '4', 'look': 'sparks', 'go': 'the build', 'fade_s': 0, 'note': 'laser chase, 8 bars each: cube 2 → 1+3 → 4+5 → 6 → all (at 132 BPM 8 bars = 14.5 s); the comb rises on "all"'},
    {'q': '5', 'look': 'fire', 'go': 'the drop, on the downbeat', 'fade_s': 0, 'note': '16 bars; strobes and blinders at most 4 flashes per second (HSE, The Event Safety Guide, HSG195)'},
    {'q': '5.1', 'look': None, 'go': 'bar 17', 'fade_s': 0, 'note': 'BLACKOUT for 2 bars (haze stays on); the lasers are OFF in black, not blanked to a dot'},
    {'q': '6', 'look': 'ash_falling', 'go': 'the breakdown', 'fade_s': 1, 'note': ''},
    {'q': '7', 'look': 'sparks', 'go': 'the next build', 'fade_s': 0, 'note': 'loop Q4 → Q5 → Q5.1 → Q6 as the DJ drives the night'},
    {'q': '8', 'look': 'dawn', 'go': 'the last record', 'fade_s': 60, 'note': ''},
    {'q': '9', 'look': None, 'go': 'end', 'fade_s': 10, 'note': 'work light (the venue\'s) on; lasers OFF and key switches out'},
]


def look_units(lk, fx, lasers_px):
    lit, col = set(), {}
    for f in fx:
        if f['part'] in lk['parts']:
            c, lev = lk['parts'][f['part']]
            lit.add(f['id'])
            col[f['id']] = (c, lev)
    if 'laser' in lk['parts']:
        for f in lasers_px:
            lit.add(f['id'])
            col[f['id']] = (f['colour'], 1.0)
    layers = sorted({LAYER_OF[p] for p in lk['parts']})
    return lit, col, layers


def dim(hexc, lev):
    k = max(0.15, lev) ** 0.6
    r, g, b = (int(hexc[i:i + 2], 16) for i in (1, 3, 5))
    return '#%02x%02x%02x' % (int(r * k), int(g * k), int(b * k))


def look_glare(lk, fx, lit):
    per = np.zeros(len(L.EYES))
    for f in fx:
        if f['id'] in lit and f['d'] is not None and f['kind'] in ('par', 'beam', 'wash', 'spot'):
            g = EP.glare(f)
            if g:
                per += g['_per']
    front = L.EYES[:, 2] <= 27.8
    return {'eyes': int((per > 0).sum()), 'front_lux': round(float(per[front].max()), 1)}


def render_looks(fx, lasers_px, od):
    pngs = {}
    allfx = [dict(f, spare=False) for f in fx if f['kind'] in ('par', 'beam', 'wash', 'spot')] + lasers_px
    for lk in LOOKS:
        lit, col, layers = look_units(lk, fx, lasers_px)
        drawn = [dict(f, colour=dim(*col[f['id']]) if f['id'] in col else f.get('colour', '#30353c')) for f in allfx]
        p = os.path.join(od, 'epic-look-%s.png' % lk['id'])
        D.render_view(drawn, lit, p, '%s  (%s)' % (lk['title'], ' + '.join(layers)),
                      'from the centre of the dance floor, eye 1.6 m, z 38: %s. Sketch from the hall model\'s triangles (matplotlib, no WebGL), not a render.' % lk['floor_sees'][:120],
                      [0.0, 1.6, 38.0], [0.0, 6.5, -20.0])
        pngs[lk['id']] = p
    return pngs


# ------------------------------------------------------------------ the schedule
def schedule(fx, cubes_):
    rows = []
    for f in fx:
        T = None
        if f.get('aim') and f['aim'].get('rule') in ('targets', 'point', 'laser') and (f['aim'].get('targets') or f['aim'].get('target')):
            t = f['aim'].get('targets') or f['aim'].get('target')
            T = t[f.get('aim_i', 0)] if isinstance(t[0], (list, tuple)) else t
        y, e = yaw_el(f['d']) if f['d'] is not None else (None, None)
        col = {'cut-x': EMBER, 'cut-curtain': ASH, 'cut-bridge': ASH, 'halo': EMBER, 'press': ASH, 'fan': ASH, 'spine': ASH, 'arches': ASH, 'comb': ASH,
               'col-wall': EMBER, 'col-vista': EMBER, 'roof': ASH, 'farwall': EMBER, 'spanends': EMBER, 'beside': ASH, 'strobe': ASH, 'blinder': ASH}.get(f['part'])
        rows.append({'id': f['id'], 'type': f['type'], 'model': CODE[f['type']], 'part': f['part'], 'layer': LAYER_OF[f['part']],
                     'p': [round(float(v), 2) for v in f['p']], 'mount': MOUNT[f['part']],
                     'aim': ('at (%.1f, %.1f, %.1f)' % tuple(T)) if T is not None else (None if y is None else ('straight up' if e > 85 else 'yaw %+.0f°, up %.0f°' % (y, e))),
                     'yaw_deg': y, 'el_deg': e, 'beam_deg': round(2 * OC.half_of(f), 1) if f['d'] is not None else None,
                     'home_colour': col, 'dmx': f['dmx'], 'power_w': WATTS[f['type']], 'circuit': f.get('circuit')})
    for c in cubes_:
        rows.append({'id': c['id'], 'type': c['type'], 'model': CODE[c['type']], 'part': 'laser', 'layer': 'lasers', 'p': c['p'], 'mount': c['mount'],
                     'aim': '; '.join('%s → (%.1f, %.1f, %.1f) %s' % (b['id'], *b['to'], b['stop']) for b in c['beams']), 'yaw_deg': None, 'el_deg': None,
                     'beam_deg': 0.06, 'home_colour': c['colour'], 'dmx': {'universe': 'LAN (no DMX)', 'address': None,
                                                                             'footprint': 0, 'branch': 'network: SW-LASER, ' + c['ip']},
                     'power_w': c['power_w'], 'circuit': c.get('circuit')})
    return rows


# ------------------------------------------------------------------ the rig file (the beta v0.9 snapshot schema + what v1.0 adds)
def rig_file(fx, cubes_, patch_rows, circ, net, sup, lasers_sum):
    def fixture(f):
        r = L.rot_for_dir(f['d']) if f['d'] is not None else (0.0, 0.0, 0.0)
        return {'id': f['id'], 'type': f['type'], 'position': MOUNT[f['part']], 'part': f['part'], 'layer': LAYER_OF[f['part']],
                'p': [round(float(v), 3) for v in f['p']], 'r': [round(float(v), 6) for v in r],
                'colour': f.get('colour_home'), 'angle_rad': round(math.radians(OC.half_of(f)), 4) if f['d'] is not None else None,
                'dmx': f['dmx'], 'power_w': WATTS[f['type']], 'circuit': f.get('circuit')}
    fixtures = [fixture(f) for f in fx]
    for c in cubes_:
        fixtures.append({'id': c['id'], 'type': c['type'], 'position': c['mount'], 'part': 'laser', 'layer': 'lasers', 'p': c['p'],
                         'r': [round(float(v), 6) for v in L.rot_for_dir(c['d'])], 'colour': c['hex'], 'angle_rad': 0.0105,
                         'laser': {'colour': c['colour'], 'ip': c['ip'], 'artnet': c['artnet'], 'beams': c['beams']}, 'power_w': c['power_w'],
                         'circuit': c.get('circuit')})
    gp = LV.V2['options_far'][1]
    solids = [{'id': 'rig-goalpost-span-%d' % (i + 1), 'name': 'goal-post truss for lasers 1-3 (Prolyte H30V L300)', 'kind': 'truss-3m',
               'p': [-4.5 + 3.0 * i, gp['height_m'] - 0.145, gp['z']], 'r': [0, 0, 0], 's': [1, 1, 1]} for i in range(4)]
    solids += [{'id': 'rig-goalpost-tower-%s' % s, 'name': 'goal-post tower (H30V), base plate + outriggers', 'kind': 'tower',
                'p': [x, 0.0, gp['z']], 'r': [0, 0, 0], 's': [1, round((gp['height_m'] - 0.29) / 6.0, 4), 1]} for s, x in (('l', -6.0), ('r', 6.0))]
    p6 = [c for c in cubes_ if c['n'] == 6][0]['p']
    solids.append({'id': 'rig-tower-cube6', 'name': 'tower for laser 6 (H30V), base plate + outriggers', 'kind': 'tower', 'p': [p6[0], 0.0, p6[2]],
                   'r': [0, 0, 0], 's': [1, round((p6[1] - 0.25) / 6.0, 4), 1]})
    return {'snapshot': 'moxir-epic-2026-10-08', 'version': 'MOXIR v1.0', 'what': 'Every unit of MOXIR v1.0 (the epic plot: the owner chose every advised placement option, 2026-10-08): position, rotation, colour, cone, DMX, watts, circuit; the new rig solids (the goal post, the tower for cube 6); the looks, the cues, the network, the power. Generated by scripts/place/epic_plot.py: never edit by hand.',
            'schema': 'the beta v0.9 snapshot schema (rigs/moxir-beta-v0.9-lights-2026-10-07.json: fixtures[{id,type,position,p,r,colour,angle_rad}] + solids[{id,name,kind,p,r,s}]) with dmx/power_w/circuit per fixture and laser per cube added. versions.mjs\'s rule schema places by mount rules and cannot hold per-unit positions; scripts/rigbuild/epic-build.mjs loads this file into a copy of beta as ops.',
            'frame': 'hall frame: metres, Y up, +x house right (the audience\'s right facing the DJ), +z toward the entry. Rotations three.js Euler XYZ in radians; a spot light\'s unrotated beam points down (-Y). angle_rad = half the beam angle. Pieces: truss origin at the section centre, tower at the base-plate centre (src/rigbuild/pieces.js); a tower\'s s[1] scales the 6 m catalogue tower.',
            'base': {'project': 'moxir-known-full-stage-back (MOXIR beta v0.9)', 'hall': 'moxir-hall-2026-10-07-v8-show-back21', 'kept': 'the stage, the step, the PA, the barrier, the cut and its rigging, the near crane at z 21'},
            'assumed': ['the near crane girder underside 7.95 m (the far crane\'s; the 10-08 tape)', 'the LaserCubes 10 W for safety, 6 W for brightness (label owed)',
                        'LaserCube mains 150 W', 'the haze reach 15 m', 'FOH and distro places', 'strobe/blinder/hazer = equivalents until the other supplier is chosen'],
            'fixtures': fixtures, 'solids': solids,
            'looks': [{k: v for k, v in lk.items()} for lk in LOOKS], 'cues': CUES,
            'patch': {'branches': patch_rows, 'universes_used': None}, 'network': net, 'power': {'circuits': circ, 'supply': sup},
            'lasers': lasers_sum}


# ------------------------------------------------------------------ the survey copy: today's open items
SURVEY_ITEMS = [
    ('Venue power: where is the supply point, what is it (CEE 3-phase 63 / 125 A?), how many, how far from the stage', 'the venue\'s main board / ask the site owner', 'photo + tape', 'type + amps + distance', 'epic_power_supply'),
    ('Smoke / fire detection: what system, which zones, can it be isolated for the night, who decides (fire watch)', 'ask the site owner; photo the detectors in the roof', 'photo + ask', 'yes/no + who', 'epic_smoke_detection'),
    ('FOH: a 3 x 2 m spot for the desk at the back of the dance floor, house right (x 7.5, z 45)? Cable path from there to the stage', 'stand there; look at the stage', 'photo', 'yes/no + where', 'epic_foh'),
    ('Goal post at z -41.5: floor flat and free from x -6.5 to +6.5? Anything overhead below 7.5 m? Floor surface (concrete? plates?)', 'the nave at the far crane + 19 m toward the far gate', 'laser + photo', '±0.1 m', 'epic_goalpost_floor'),
    ('Laser 6 tower at x 0.3, z -9.2: floor free 2 x 2 m, clear to 7 m overhead?', 'nave, behind the press', 'laser + photo', 'yes/no', 'epic_tower6'),
    ('Laser 4/5 brackets: the nave columns x ±12 at z -24, inner (nave) corner at 5.0 m: concrete sound, nothing fixed there, room for a strap?', 'under each column, photo up', 'photo + reference', 'yes/no + what', 'epic_col_brackets'),
    ('Column feet: 0.7 m free in front of each wall column of both side spans (x ±35.6 faces, z -48 to +36), every 12 m', 'walk both side spans', 'photo per column', 'free / not', 'epic_col_feet'),
    ('Far end floor at z -49.5: free for 8 heads (x -30, -18, -9, -3, 3, 9, 18, 30)?', 'along the far end wall', 'photo', 'free / not', 'epic_far_floor'),
    ('Depth comb spots x ±10, z -27 and -33: floor free, clear straight up to the roof?', 'far nave, by the far crane', 'photo up', 'yes/no', 'epic_depth_comb'),
    ('Hazer spots: x ±10.6 at z -4 (beside the press) and x ±6 at z -37: floor free, power near?', 'nave', 'photo', 'yes/no', 'epic_haze_spots'),
    ('The strip behind the truss line (z 19.6-20.8, x -6 to +6): free floor for 14 flash units on plates?', 'behind the DJ place', 'photo', 'free / not', 'epic_flash_strip'),
    ('Cable routes: desk → stage (~45 m) → far nave (~50 m) → side spans (~35 m each): doors, thresholds, walkways to cross, cable ramps needed?', 'walk each route', 'photo + paces', 'm', 'epic_cable_routes'),
]


def merge_survey(path):
    path = os.path.expanduser(path)
    if not os.path.exists(path):
        return None
    s = open(path).read()
    k0 = s.index('const ITEMS=') + len('const ITEMS=')
    items, k1 = json.JSONDecoder().raw_decode(s, k0)
    items = [i for i in items if not str(i.get('key', '')).startswith('epic_')]
    n0 = max(i['n'] for i in items)
    for j, (what, where, tool, tol, key) in enumerate(SURVEY_ITEMS):
        items.append({'n': n0 + j + 1, 'what': '[epic plot] ' + what, 'where': where, 'tool': tool, 'tol': tol, 'key': key})
    bak = path.replace('.html', '.before-epic.html')
    if not os.path.exists(bak):
        shutil.copy2(path, bak)
    s = s[:k0] + json.dumps(items, ensure_ascii=False) + s[k1:]
    open(path, 'w').write(s)
    return {'path': path, 'backup': bak, 'added': len(SURVEY_ITEMS), 'total': len(items)}


# ------------------------------------------------------------------ the pass
def build():
    out, LZ, FXO, fx = advised_units()
    chosen = [k for k in EP.RESO if k[1] in ('kept', 'others') or k[1] == GRPS.get(k[0], {}).get('advice')]
    for f in fx:
        hit = [EP.RESO[k][f['id']] for k in chosen if f['id'] in EP.RESO[k]]
        if hit:
            D.RES[f['id']] = hit[0]
    cubes_ = cubes(LZ)
    prow, used = patch(fx)
    circ, ph = circuits(fx, cubes_)
    cid = {u: c['circuit'] for c in circ for u in c['units']}
    for c in cubes_:
        c['circuit'] = cid[c['id']]
    sup = supply(circ, ph)
    net = network(cubes_)
    runs = dmx_runs(fx, prow)
    movers = mover_check(fx)
    lasers_px = LV.as_fixtures(LZ['b']['bs'], LZ['b']['res'])
    looks = []
    for lk in LOOKS:
        lit, col, layers = look_units(lk, fx, lasers_px)
        g = look_glare(lk, fx, lit)
        looks.append({'id': lk['id'], 'title': lk['title'], 'layers': layers, 'n_layers': len(layers), 'units': len(lit), **g})
    sched = schedule(fx, cubes_)
    for f in fx:
        f['colour_home'] = next((r['home_colour'] for r in sched if r['id'] == f['id']), None)
    run_b = LZ['b']
    lasers_sum = {'beams': sum(len(c['beams']) for c in cubes_), 'pass': sum(b['pass'] for c in cubes_ for b in c['beams']),
                  'nohd': out['nohd'], 'per_beam_model': EP.REC['laser_model'], 'far_cd_m2': run_b['far_cd'], 'mid_cd_m2': run_b['mid_cd'],
                  'crane_precondition': [x for x in (out['crane_as_photographed'] or []) if x['end_z'] > 21]}
    G_ = out['groups']
    advised_sum = {g: G_[g][GRPS[g]['advice']]['summary'] for g in ('columns', 'roof', 'farwall', 'beams', 'flash')}
    advised_sum['farwall_others'] = G_['farwall_others']['kept']['summary']
    advised_sum['truss'] = G_['truss']['kept']['summary']
    advised_sum['stagefloor'] = G_['stagefloor']['kept']['summary']
    checks = {
        'blocking': {'units_traced': sum(v['n'] for v in advised_sum.values()), 'units_with_a_blocked_ray': sum(v['blocked'] for k, v in advised_sum.items() if k != 'flash'),
                     'detail': {k: (v['blocked'], v.get('blockers')) for k, v in advised_sum.items() if v['blocked'] and k != 'flash'},
                     'flash_lands_on': advised_sum['flash'].get('lands_on')},
        'lasers': {'beams': lasers_sum['beams'], 'pass': lasers_sum['pass'], 'nohd_m': out['nohd']['nohd_m']},
        'glare': {'eyes_in_any_field': sum(v['eyes'] for v in advised_sum.values()), 'front_row_lux': max(v['front_lux'] for v in advised_sum.values())},
        'movers_through_the_dance_zone_below_2_5m': movers,
        'looks_max_layers': max(l['n_layers'] for l in looks),
        'universes': {u: n for u, n in used.items()}, 'universes_ok': all(n <= 512 for n in used.values()),
        'branches_ok': all(r['devices'] <= 32 for r in prow), 'dmx_runs_ok': all(r['ok'] for r in runs),
        'circuits_ok': all(c['ok'] for c in circ), 'circuits': len(circ), 'network_ok': all(l['ok'] for l in net['links']),
        'loads': {'goalpost_kg': out['goalpost_load']['lasers_kg'], 'goalpost_allowed_kg': out['goalpost_load']['allowable_third_points_kg'],
                  'cut': 'unchanged from beta v0.9: 17 PARs (136 kg); no flash unit on the truss (option behind)', 'towers': 'OWED: the goal post\'s 2 towers and cube 6\'s tower: the rental house\'s tower data + a stability check (ANSI E1.21 class)'},
        'haze': G_['haze'][GRPS['haze']['advice']]['summary'],
    }
    rig = rig_file(fx, cubes_, prow, circ, net, sup, lasers_sum)
    rig['patch']['universes_used'] = used
    rig['checks'] = checks
    return {'out': out, 'LZ': LZ, 'fx': fx, 'cubes': cubes_, 'patch': prow, 'used': used, 'circuits': circ, 'phases': ph, 'supply': sup,
            'network': net, 'dmx_runs': runs, 'looks': looks, 'schedule': sched, 'checks': checks, 'rig': rig, 'lasers_px': lasers_px, 'lasers_sum': lasers_sum}


# ------------------------------------------------------------------ rental vs owned
def rental(B):
    cnt = collections.Counter(r['model'] for r in B['schedule'])
    order = {i['code']: i for i in json.load(open(os.path.join(A4.repo, 'scripts/rigbuild/rentals/moxir-order-2026-09-27.json')))['items']}
    cat = {c['code']: c for c in json.load(open(os.path.join(A4.repo, 'scripts/rigbuild/rentals/moxir-2026-10-17-known-full.json')))['rentalList']['catalogue']}
    rows = []
    for code, n in sorted(cnt.items()):
        o = order.get(code)
        src = 'the owner\'s own' if code == 'EXT-LC-ULTRA-MK2' else ('rental house (UPlight list)' if code in cat else 'other supplier (rate owed)')
        rows.append({'code': code, 'used': n, 'ordered': o['ordered'] if o else None, 'stock': cat.get(code, {}).get('stock'), 'from': src,
                     'action': ('ok' if o and o['ordered'] == n else ('order %d (stock %s)' % (n, cat.get(code, {}).get('stock')) if code in cat else ('own' if src.startswith('the owner') else 'book %d' % n)))})
    for code in ('UP-LA40WF', 'UP-Q108S', 'UP-YH600F'):
        rows.append({'code': code, 'used': 0, 'ordered': order[code]['ordered'], 'stock': cat.get(code, {}).get('stock'), 'from': 'rental house',
                     'action': 'RELEASE: not in the plot (40 W lasers need their own LSO plan; CO2 and cold spark are outside the brief)'})
    extra = [('UP-Q3L', 1, 'MA console (rental list): the desk, Art-Net out'), ('UP-PDU60A / UP-PDU60B', 2, 'DMX splitters (rental list): U1 into its two branches + a spare'),
             ('UP-POWER12', 1, '12-way distro (rental list) at D-STAGE'), ('Prolyte H30V-L300', 4, 'the goal-post span (12 m)'), ('H30V tower ~7 m + base + 4 outriggers', 3, '2 for the goal post, 1 for cube 6'),
             ('half-coupler + safety', 60, 'every hung unit and the cubes'), ('column bracket + 2 t strap', 2, 'cubes 4 and 5 at 5.0 m'),
             ('managed gigabit switch, 8 port', 3, 'SW-FOH, SW-STAGE, SW-LASER'), ('Art-Net to DMX node, 2-port', 4, 'NODE-STAGE, NODE-FAR, NODE-LEFT, NODE-RIGHT'),
             ('3-phase sub-distro 32 A', 3, 'D-FAR, D-LEFT, D-RIGHT')]
    return rows, [{'item': a, 'n': b, 'for': c} for a, b, c in extra]


# ------------------------------------------------------------------ pages
STYLE = """:root{color-scheme:dark}*{box-sizing:border-box}html,body{background:#0b0c0d}"""


def b64(p):
    return 'data:image/png;base64,' + base64.b64encode(open(p, 'rb').read()).decode()


EPIC_PAGE = r"""<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>MOXIR v1.0 epic plot</title><style>__STYLE__</style></head><body><main id="root"></main>
<script>
"use strict";
const C={bg:"#0b0c0d",panel:"#121416",line:"#2a2e33",fg:"#e3e6ea",sub:"#a3aab1",dim:"#8f969e",ok:"#3cff3c",bad:"#ff5a4f",warn:"#ffb36b",accent:"#ff6a2a",ash:"#e8e4dc",ember:"#ff4a12",fixed:"#c9a200"};
const D=__DATA__;const F="ui-monospace,'DejaVu Sans Mono',monospace";
const el=(t,s,h)=>{const e=document.createElement(t);if(s)Object.assign(e.style,s);if(h!=null)e.innerHTML=h;return e;};
const esc=s=>String(s==null?"":s).replace(/[&<>]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;"}[c]));
const wrap=t=>{const w=el("div",{overflowX:"auto",maxWidth:"100%"});w.appendChild(t);return w;};
const td=(t,s)=>el("td",Object.assign({border:"1px solid "+C.line,padding:"5px 7px",verticalAlign:"top"},s||{}),t);
const table=(head,rows,small)=>{const t=el("table",{borderCollapse:"collapse",width:"100%",font:(small?"11.5px":"12.5px")+"/1.45 "+F,color:"#c4c9cf"});
  const h=el("tr");for(const k of head)h.appendChild(td(esc(k),{color:C.fg,position:"sticky",top:"0",background:C.panel}));t.appendChild(h);
  for(const r of rows){const tr=el("tr");for(const c of r)tr.appendChild(typeof c==="object"&&c&&c.html!=null?td(c.html,c.style):td(esc(c)));t.appendChild(tr);}return wrap(t);};
const img=(src,alt)=>{const i=el("img",{display:"block",width:"100%",height:"auto",background:"#000",margin:"8px 0 4px"});i.src=src;i.alt=alt;return i;};
Object.assign(document.body.style,{margin:"0",background:C.bg,color:C.fg,font:"16px/1.5 system-ui,-apple-system,'Segoe UI',sans-serif"});
const root=document.getElementById("root");Object.assign(root.style,{maxWidth:"1240px",margin:"0 auto",padding:"32px 16px 60px"});
const h2=(n,t)=>root.appendChild(el("h2",{font:"600 18px/1.3 "+F,margin:"36px 0 10px"},"<span style='color:"+C.accent+";margin-right:10px'>"+n+"</span>"+t));
const h3=t=>root.appendChild(el("h3",{font:"600 15px/1.3 "+F,margin:"22px 0 6px"},t));
const p=(t,s)=>root.appendChild(el("p",Object.assign({color:C.sub,margin:"0 0 10px"},s||{}),t));
const note=t=>root.appendChild(el("div",{color:C.dim,font:"12px/1.5 "+F,margin:"4px 0 12px"},t));
const okc=b=>({html:b?"<b style='color:"+C.ok+"'>PASS</b>":"<b style='color:"+C.bad+"'>FAIL</b>"});
const swatch=c=>c?"<span style='display:inline-block;width:10px;height:10px;background:"+c+";margin-right:6px;vertical-align:middle'></span>":"";
const B=D.B;
root.appendChild(el("h1",{font:"600 22px/1.25 "+F,margin:"0 0 6px"},"MOXIR v1.0 &middot; the epic plot"));
note("2026-10-08. MOXIR = մոխիր, ash: the remains of a fire. Your placement picks (every advised option), lit. Pictures and numbers for planning, not a build; nothing here is a laser-safety or rigging sign-off.");
h2("1","The answer");
const ans=el("div",{background:C.panel,border:"1px solid "+C.line,padding:"14px 16px",font:"15px/1.6 system-ui,sans-serif"});
ans.innerHTML=D.answer.map((a,i)=>"<b>"+(i+1)+".</b> "+a).join("<br>");root.appendChild(ans);
h2("2","The night, look by look (from the centre of the dance floor)");
for(const lk of D.looks){const m=D.lookMeta[lk.id];h3(esc(lk.title)+" <span style='color:"+C.dim+";font-weight:400'>· "+esc(lk.when)+" · "+m.layers.join(" + ")+" ("+m.n_layers+" layers)</span>");
  root.appendChild(img(D.png["look_"+lk.id],lk.title));
  p("<b>The floor sees:</b> "+esc(lk.floor_sees)+". <b>Ash:</b> "+esc(lk.ash)+". <i>"+esc(lk.refs)+"</i>");}
h2("3","From above: the whole building");root.appendChild(img(D.png.plan,"plan"));
h2("4","Heights");root.appendChild(img(D.png.section,"section"));
h2("5","The lasers");
root.appendChild(table(["cube","colour","at (x, y, z)","mount","IP · LAN","beam","to (stop)","length","passes","floor sees","cd/m² per beam"],B.cubes.flatMap(c=>c.beams.map((b,i)=>[i?"":c.n,i?"":{html:swatch(c.hex)+esc(c.colour)},i?"":"("+c.p.join(", ")+")",i?"":c.mount,i?"":c.ip+" · LAN (di Nodes)",b.id,"("+b.to.join(", ")+") "+b.stop,b.length_m+" m",okc(b.pass),Math.round(100*b.seen)+" %",b.cd_m2_per_beam]))),true);
note("Per beam: the 6 W unit, its power split between the cube's 2 beams (duty 0.45; Talbot–Plateau). Safety at 10 W, all power in one beam (scan failure, IEC TR 60825-3): NOHD "+B.lasers_sum.nohd.nohd_m+" m (IEC 60825-1:2014 Table A.1), longer than the hall: no beam may reach an eye, and none does: every beam ends on steel behind the DJ or on a side span's runway girder, never past z 21, never under 3 m over a floor.");
if(B.lasers_sum.crane_precondition.length)root.appendChild(el("p",{color:C.bad,font:"600 14px/1.5 "+F},"HARD PRECONDITION: the near crane parked at z 21 is the beam stop. Where the photos show it (z 4.8), "+B.lasers_sum.crane_precondition.map(x=>x.beam).join(", ")+" would reach the entry end. No stage-ward emission until it is seen at z 21 and the stop checked (crew sheet, the laser test)."));
h2("6","Looks and cues");
root.appendChild(table(["look","layers lit (≤ 3)","parts: colour, level","eyes in a field","front-row lux"],D.looks.map(lk=>{const m=D.lookMeta[lk.id];return [lk.title,m.layers.join(" + ")+" ("+m.n_layers+")",{html:Object.entries(lk.parts).map(([k,v])=>swatch(v[0]||C.ash)+esc(k)+(v[0]?" "+Math.round(100*v[1])+" %":" (as the cube)")).join("<br>")},m.eyes,m.front_lux];})));
root.appendChild(table(["Q","look","GO","fade","note"],D.cues.map(q=>[q.q,q.look?D.looks.find(l=>l.id===q.look).title:"(black)",q.go,q.fade_s+" s",q.note])));
note("References (the owner's 4 videos, 2026-10-06): silhouette, mirrored pairs, one colour per part, beams meeting at one point, side combs, blackouts; never more than 3 layers lit. Strobes at most 4 flashes per second (HSE HSG195), and a notice at the door.");
h2("7","Fixture schedule (every unit)");
root.appendChild(table(["id","model","x","y","z","mount","aim","beam°","colour","DMX","W","circuit"],B.schedule.map(r=>[r.id.replace("rig-",""),r.model,r.p[0],r.p[1],r.p[2],r.mount,r.aim||"",r.beam_deg==null?"":r.beam_deg,{html:swatch(r.home_colour&&r.home_colour[0]==="#"?r.home_colour:null)+esc(r.home_colour||"")},(typeof r.dmx.universe==="number"?"U"+r.dmx.universe+" / "+r.dmx.address+" ("+r.dmx.footprint+" ch)":r.dmx.universe+(r.dmx.address==null?"":" / "+r.dmx.address)),r.power_w,r.circuit||""]),true));
note(B.schedule.length+" units. Aim: a target point (x, y, z) in the hall frame, or yaw (0 = toward the far gate, + toward house right) and the angle up. DMX footprints: the smallest mode each maker publishes (fixtures.json). Colour: the unit's home colour; the looks set the rest.");
h3("DMX / Art-Net");
root.appendChild(table(["branch","universe","Art-Net port-address","node","devices (≤ 32)","run","check"],B.patch.map(r=>{const run=B.dmx_runs.find(x=>x.branch===r.branch);return [r.branch,r.universe,r.artnet_port_address,r.node,r.devices,run.length_m+" m",okc(run.ok)];})));
note("Slots used: "+Object.entries(B.used).map(([u,n])=>"U"+u+" "+n+"/512").join(", ")+"; the 6 lasers are on the LAN through di Nodes, not on DMX (owner N460.2). DMX512-A (ANSI E1.11): 32 unit loads per segment; U1 leaves the splitter on two outputs.");
h3("Network: the 6 cubes on one switch");
root.appendChild(table(["IP","what"],B.network.ips.map(x=>[x.ip,x.what])));
root.appendChild(table(["link","from → to","cable","length (+10 %)","≤ 100 m"],B.network.links.map(l=>[l.what,esc(l.from)+" → "+esc(l.to),l.kind,l.length_m+" m",okc(l.ok)])));
note(esc(B.network.subnet)+". "+B.network.rules.map(esc).join(" · "));
h3("Power per circuit");
root.appendChild(table(["circuit","distro","phase","kind","units","load","A at 230 V","cable run","cable","drop (≤ 5 %)","check"],B.circuits.map(c=>[c.circuit,c.distro,c.phase,c.kind,c.n,c.load_w+" W",c.amps_230v,c.cable_m+" m",c.cable_mm2+" mm²",c.vdrop_v+" V ("+c.vdrop_pct+" %)",okc(c.ok)])));
p("<b>The venue must give:</b> "+esc(B.supply.need)+". Connected load "+B.supply.connected_w+" W; per phase "+Object.entries(B.supply.per_phase_w).map(([k,v])=>k+" "+v+" W").join(", ")+" (worst "+B.supply.worst_phase_a+" A). "+esc(B.supply.basis));
note("Circuits: 230 V 16 A at 80 % = 2944 W (continuous-load planning, BS 7909 practice; audit A-05). Voltage drop: BS 7671 Appendix 4 (Table 4D2B, mV/A/m) with the whole load at the end of the run, ≤ 5 %; the cable size is the smallest that holds it. Watts: datasheet supply or rated watts (fixtures.json); LaserCube 150 W ASSUMED. Places of the distros and the desk are ASSUMED until walked (survey items).");
h2("8","The checks");
const K=B.checks;
root.appendChild(table(["check","result","pass"],[
 ["blocking (hall model + rig solids + goal post), every unit traced",K.blocking.units_traced+" units; "+K.blocking.units_with_a_blocked_ray+" with a ray clipped: "+Object.entries(K.blocking.detail).map(([k,v])=>k+": "+v[0]+" ("+(v[1]||[]).join(", ")+")").join("; "),{html:"<b style='color:"+C.warn+"'>PASS with a note</b>"}],
 ["lasers: every beam on its steel stop, behind z 21, ≥ 3 m over floors, mirror worst case",K.lasers.pass+" of "+K.lasers.beams+" beams; NOHD "+K.lasers.nohd_m+" m",okc(K.lasers.pass===K.lasers.beams)],
 ["glare: audience eyes in any lamp's field (front-row target 0 lux)",K.glare.eyes_in_any_field+" eyes; front row "+K.glare.front_row_lux+" lux",okc(K.glare.front_row_lux===0)],
 ["ground movers: no beam through the dance zone below 2.5 m",K.movers_through_the_dance_zone_below_2_5m.length?K.movers_through_the_dance_zone_below_2_5m.join(", "):"none",okc(!K.movers_through_the_dance_zone_below_2_5m.length)],
 ["looks: at most 3 layers lit","max "+K.looks_max_layers,okc(K.looks_max_layers<=3)],
 ["DMX: ≤ 512 slots per universe, ≤ 32 devices per branch, runs ≤ 300 m",Object.entries(K.universes).map(([u,n])=>"U"+u+" "+n).join(", "),okc(K.universes_ok&&K.branches_ok&&K.dmx_runs_ok)],
 ["network: every Cat6 link ≤ 100 m (TIA-568)",B.network.links.length+" links, longest "+Math.max(...B.network.links.map(l=>l.length_m))+" m",okc(K.network_ok)],
 ["power: every circuit ≤ 2944 W and ≤ 5 % voltage drop",K.circuits+" circuits; worst drop "+Math.max(...B.circuits.map(c=>c.vdrop_pct))+" %",okc(K.circuits_ok)],
 ["loads: goal post (Prolyte H30V 12 m table)",K.loads.goalpost_kg+" kg of "+K.loads.goalpost_allowed_kg+" kg; "+K.loads.cut,okc(K.loads.goalpost_kg<K.loads.goalpost_allowed_kg)],
 ["towers (goal post ×2, cube 6)",K.loads.towers,{html:"<b style='color:"+C.warn+"'>OWED</b>"}],
 ["haze (reach ASSUMED 15 m)",esc(K.haze.verdict),{html:"<b style='color:"+C.warn+"'>ASSUMED</b>"}]]));
h2("9","Rental and owned");
root.appendChild(table(["code","used","ordered","stock","from","action"],B.rental.map(r=>[r.code,r.used,r.ordered==null?"":r.ordered,r.stock==null?"":r.stock,r.from,r.action])));
root.appendChild(table(["also needed","n","for"],B.extra.map(r=>[r.item,r.n,r.for])));
p("<b>With what we own and have ordered, if the other supplier fails:</b> no strobes or blinders: the drop's flash is the 18 UP-B380F's own strobe channel (the fan, the arches and the comb flashing white behind and over the floor). No 2 extra hazers: the 'spread' haze option (the 2 from z 33 to the far end; the lasers stay as well hazed, the floor's arches read thinner).");
h2("10","Open items for today's site visit");
root.appendChild(table(["#","what","where","how","key"],D.survey_items.map((s,i)=>[i+1,s[0],s[1],s[2],s[4]])));
note("Also merged into the survey copy (occlusion/moxir-survey.html), after the 28 earlier items; a copy of the page before the merge is kept beside it.");
h2("11","Limits and ASSUMED");
p(D.rig.assumed.map(esc).join(" · ")+". The hall model carries hall.json's confidence; the pendant lamps at 7.5–8.7 m over the nave are not in it (shot L27). Lamp intensities are borrowed equivalents (fixtures.json).");
root.appendChild(el("div",{color:C.dim,font:"12px/1.55 "+F,marginTop:"26px",borderTop:"1px solid "+C.line,paddingTop:"12px"},"Generated by scripts/place/epic_plot.py (PR #823) on top of epic_placement.py, lasers_v2.py and design_paint.py; rig file rigs/moxir-epic-2026-10-08.json."));
</script></body></html>
"""

CREW_PAGE = r"""<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>MOXIR crew setup</title>
<style>
:root{color-scheme:light dark;--bg:#ffffff;--fg:#111;--sub:#444;--line:#999;--warn:#b00000}
@media (prefers-color-scheme: dark){:root:not([data-theme="light"]){--bg:#0b0c0d;--fg:#e3e6ea;--sub:#a3aab1;--line:#3a4048;--warn:#ff5a4f}}
:root[data-theme="dark"]{--bg:#0b0c0d;--fg:#e3e6ea;--sub:#a3aab1;--line:#3a4048;--warn:#ff5a4f}
*{box-sizing:border-box}html,body{margin:0;background:var(--bg);color:var(--fg);font:11px/1.35 "DejaVu Sans",system-ui,sans-serif}
main{max-width:1100px;margin:0 auto;padding:16px}
h1{font:700 16px/1.2 "DejaVu Sans Mono",monospace;margin:0 0 2px}h2{font:700 12.5px/1.2 "DejaVu Sans Mono",monospace;margin:10px 0 4px;border-bottom:1px solid var(--line)}
table{border-collapse:collapse;width:100%}td,th{border:1px solid var(--line);padding:2px 4px;text-align:left;vertical-align:top}th{font-weight:700}
.cols{display:grid;grid-template-columns:1fr 1fr;gap:12px}@media (max-width:700px){.cols{grid-template-columns:1fr}}
.warn{color:var(--warn);font-weight:700}.sub{color:var(--sub)}ol{margin:2px 0 0 16px;padding:0}li{margin:0 0 2px}
.w{overflow-x:auto;max-width:100%}
@media print{html,body{background:#fff;color:#000;font-size:9px}main{padding:0}.noprint{display:none}h2{break-after:avoid}@page{size:A4 landscape;margin:8mm}}
</style></head><body><main>
<h1>MOXIR v1.0 · crew set-up sheet · 17.10.2026</h1>
<div class="sub">Generated by scripts/place/epic_plot.py from rigs/moxir-epic-2026-10-08.json (2026-10-08). Hall frame: x + = house right (facing the DJ), z + = toward the entry, y = up, metres. Planning sheet: the rigger signs the rigging, the laser safety officer signs the lasers.</div>
<p class="warn">BEFORE ANY LASER EMISSION toward the stage: the near crane is parked at z 21 (it is the beam stop), seen and checked. Without it, beams fly to the entry end over the crowd.</p>
__BODY__
</main></body></html>
"""


def esc(s):
    return html.escape(str(s if s is not None else ''))


def crew_body(B):
    rows = []
    groups = collections.OrderedDict()
    for r in B['schedule']:
        groups.setdefault(r['part'], []).append(r)
    t = ['<h2>1 · Positions, by group (every unit: epic.html section 7)</h2><div class="w"><table><tr><th>group</th><th>n</th><th>model</th><th>where (x, z)</th><th>height</th><th>mount</th><th>aim</th><th>DMX</th><th>circuit</th></tr>']
    for part, rs in groups.items():
        xs = sorted({r['p'][0] for r in rs})
        zs = sorted({r['p'][2] for r in rs})
        ys = sorted({r['p'][1] for r in rs})
        dm = [r['dmx'] for r in rs]
        dmx = ('U%s %s–%s' % (dm[0]['universe'], min(d['address'] for d in dm), max(d['address'] + d['footprint'] - 1 for d in dm))) if isinstance(dm[0]['universe'], int) else 'LAN: di Nodes, no DMX'
        aims = sorted({r['aim'] for r in rs if r['aim']})
        t.append('<tr><td><b>%s</b></td><td>%d</td><td>%s</td><td>x %s; z %s</td><td>%s m</td><td>%s</td><td>%s</td><td>%s</td><td>%s</td></tr>' % (
            esc(part), len(rs), esc(rs[0]['model']), esc(', '.join('%g' % v for v in xs[:8]) + (' …' if len(xs) > 8 else '')), esc(', '.join('%g' % v for v in zs[:8]) + (' …' if len(zs) > 8 else '')),
            esc('/'.join('%g' % v for v in ys[:4])), esc(rs[0]['mount']), esc('; '.join(aims[:2]) + (' …' if len(aims) > 2 else '')), esc(dmx),
            esc(', '.join(sorted({r['circuit'] or '' for r in rs})))))
    t.append('</table></div>')
    net = B['network']
    t.append('<div class="cols"><div><h2>2 · Network (closed; static IPs; Wi-Fi OFF on the cubes)</h2><table><tr><th>IP</th><th>what</th></tr>' +
             ''.join('<tr><td>%s</td><td>%s</td></tr>' % (esc(x['ip']), esc(x['what'])) for x in net['ips']) + '</table><div class="sub">%s</div>' % esc(net['subnet']))
    t.append('<h2>3 · DMX</h2><table><tr><th>branch</th><th>U</th><th>node</th><th>devices</th><th>run</th></tr>' +
             ''.join('<tr><td>%s</td><td>%s</td><td>%s</td><td>%s</td><td>%s m</td></tr>' % (esc(r['branch']), r['universe'], esc(r['node']), r['devices'], [x for x in B['dmx_runs'] if x['branch'] == r['branch']][0]['length_m']) for r in B['patch']) +
             '</table><div class="sub">5-pin DMX, 120 Ω terminator on the last unit of every branch. Lasers: not DMX &mdash; the LAN through di Nodes (LaserCube UDP 45456&ndash;45458).</div>')
    t.append('<h2>4 · Power</h2><table><tr><th>distro</th><th>circuits</th><th>load</th></tr>' +
             ''.join('<tr><td>%s</td><td>%s</td><td>%d W</td></tr>' % (esc(d), ', '.join(c['circuit'] for c in B['circuits'] if c['distro'] == d), w) for d, w in B['supply']['per_distro_w'].items()) +
             '</table><div class="sub">Venue supply needed: %s. Every circuit ≤ 2944 W (16 A at 80 %%). Heaters (hazers, smoke) never on a lamp circuit; lasers + network on their own circuit.</div></div>' % esc(B['supply']['need']))
    t.append('<div><h2>5 · Safety steps (in this order)</h2><ol>' + ''.join('<li>%s</li>' % esc(s) for s in SAFETY) + '</ol>')
    t.append('<h2>6 · Laser test procedure (the LSO leads; nobody in the hall but the crew named)</h2><ol>' + ''.join('<li>%s</li>' % esc(s) for s in LASER_TEST) + '</ol></div></div>')
    return '\n'.join(t)


SAFETY = [
    'The venue\'s OK in writing: the near crane parked at z 21 and locked out (its operator), the far crane stays at z -22.2 locked out.',
    'Floor cleared as the show hall lists it (moxir-hall-show-cleared-2026-10-17.json); cable routes ramped where people walk.',
    'Goal post and cube 6 tower: base plates level, outriggers out, towers plumb; the rigger signs the stability check before anything is hung.',
    'Every hung unit: half-coupler + a rated safety; cubes 4/5 brackets strapped at 5.0 m and bonded.',
    'Power: the distro\'s RCDs tested; heaters on their own circuits; every circuit\'s load as the schedule says (≤ 2944 W).',
    'Smoke detection: isolated (or not) only by the venue, with a fire watch named for the night.',
    'Strobes: ≤ 4 flashes per second; the photosensitivity notice at the door (HSG195).',
]
LASER_TEST = [
    'LSO present; the Class 4 permit on site; the key switches with the LSO; the emergency stop (interlock) of every cube tested.',
    'Confirm the label on each cube (10 W or 6 W) and write it on the sheet: the NOHD changes (724 m at 10 W, 544 m at 6 W).',
    'Each cube on its fixed IP; Wi-Fi OFF; di Nodes reaches it over the LAN (one test frame per cube, output disarmed).',
    'In LaserOS set the output zones so that NO point outside the two beam points can be drawn (the controller\'s zones are the second barrier).',
    'Align at the lowest power the cube allows, one beam at a time, with a card at the stop: the beam lands on the near crane\'s back girder (z 19.55, 7.95-8.75 m) or the side span\'s runway girder, never past it.',
    'Walk each beam\'s path with a card from the cube to the stop: nothing hangs in it (pendant lamps, cables, hooks at 7-9 m).',
    'Check the reflection at each stop with a card: it goes back into the far half, high, never toward the floor.',
    'Raise to show power only after every beam has passed; record the final power per cube.',
    'During the show the LSO stands with the E-stop in sight of the far half; any change of the crane or a beam = lasers OFF.',
]


def answer(B):
    lz = B['lasers_sum']
    K = B['checks']
    return ['Your placement, lit as a night in 7 looks that build like a fire: <b>embers → the burnt-out hall → the silhouette → sparks from the depth → the fire (the drop, then black) → ash falling → dawn over the ruin</b>; never more than 3 layers at once, ash-white and ember-red, one colour per part, mirrored pairs.',
            '<b>%d units</b> scheduled (position, mount, aim, colour, DMX, watts, circuit): 4 DMX universes (the 6 cubes are not DMX: the LAN through di Nodes), the 6 cubes on one switch at 192.168.1.101–106; %d circuits, the venue must give <b>%s</b>.' % (
                len(B['schedule']), K['circuits'], '3-phase, %d A per phase' % B['supply']['need_a']),
            'Checks: lasers %d/%d beams on steel; front row %.0f lux in every look; no ground mover through the dance zone; every universe, branch, Cat6 link and circuit inside its limit. Owed: the towers\' stability, the crane at z 21, the cube labels, the venue\'s supply.' % (
                K['lasers']['pass'], K['lasers']['beams'], K['glare']['front_row_lux'])]


def main():
    B = build()
    if A4.check or not A4.out:
        pub = {k: B[k] for k in ('cubes', 'patch', 'used', 'circuits', 'phases', 'supply', 'network', 'dmx_runs', 'looks', 'checks', 'lasers_sum')}
        pub['n_units'] = len(B['schedule'])
        pub['schedule'] = B['schedule']
        print(json.dumps(pub, indent=1, default=lambda v: v.tolist() if hasattr(v, 'tolist') else str(v)))
        return
    od = os.path.expanduser(A4.out)
    os.makedirs(od, exist_ok=True)
    rig = B['rig']
    with open(os.path.join(A4.repo, A4.rig_out), 'w') as fh:
        json.dump(rig, fh, indent=1, ensure_ascii=False, default=lambda v: v.tolist() if hasattr(v, 'tolist') else str(v))
        fh.write('\n')
    pngs = render_looks(B['fx'], B['lasers_px'], od)
    B['rental'], B['extra'] = rental(B)
    data = {'B': {k: B[k] for k in ('cubes', 'patch', 'used', 'circuits', 'supply', 'network', 'dmx_runs', 'checks', 'lasers_sum', 'schedule', 'rental', 'extra')},
            'looks': LOOKS, 'lookMeta': {l['id']: l for l in B['looks']}, 'cues': CUES, 'answer': answer(B), 'rig': {'assumed': rig['assumed']},
            'survey_items': SURVEY_ITEMS,
            'png': dict({'look_' + k: b64(v) for k, v in pngs.items()}, plan=b64(os.path.join(od, 'placement-plan.png')), section=b64(os.path.join(od, 'placement-section.png')))}
    page = EPIC_PAGE.replace('__STYLE__', STYLE).replace('__DATA__', json.dumps(data, default=lambda v: v.tolist() if hasattr(v, 'tolist') else str(v)))
    open(os.path.join(od, 'epic-phase2.html'), 'w').write(page)
    open(os.path.join(od, 'crew-setup-phase2.html'), 'w').write(CREW_PAGE.replace('__BODY__', crew_body(B)))
    sv = None   # the survey merge moved to moxir_v1.py (v1.0 supersedes this phase-2 draft)
    with open(os.path.join(od, 'epic.json'), 'w') as fh:
        json.dump({k: B[k] for k in ('patch', 'used', 'circuits', 'supply', 'network', 'dmx_runs', 'looks', 'checks', 'lasers_sum', 'schedule')}, fh, indent=1,
                  default=lambda v: v.tolist() if hasattr(v, 'tolist') else str(v))
    for v in list(pngs.values()) + [os.path.join(od, x) for x in ('epic-phase2.html', 'crew-setup-phase2.html', 'epic.json')] + [os.path.join(A4.repo, A4.rig_out)]:
        print('wrote', v)
    print('survey', sv)


if __name__ == '__main__':
    main()
