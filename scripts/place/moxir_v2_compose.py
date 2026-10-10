#!/usr/bin/env python3
# moxir_v2_compose.py - MOXIR v2.1: ONE rig composed from the two v2 rigs, #875 (ground) and #878 (cranes).
#
#   python3 -I scripts/place/moxir_v2_compose.py --repo . \
#       scripts/place/rigs/moxir-v2-ground-2026-10-09.json scripts/place/rigs/moxir-v2-cranes-2026-10-09.json
#   # writes scripts/place/rigs/moxir-v2-1-2026-10-10.json and the patch it lays (moxir-v2-patch-v2-1-2026-10-10.json),
#   # prints the sha256 of the rig built twice. ROUND 3 re-composes with that one command (after both pieces are rebuilt).
#
# THE LEAD'S RULE (moxir lead, 2026-10-10; binding; UNVALIDATED until the C3 proofs pass; no source in the field's practice,
# it is a 3-way merge of two rigs that both came from the v2 spread):
#   OWNED BY MOUNT. The cranes rig (#878 @ a4ece687) owns position, aim AND levels, in every look, of everything mounted on the cut,
#   a crane or the hall structure: cut-01..cut-11, the 6 LaserCubes, both UP-LA40WF (#873, not units of either rig file), the groups
#   stage key / dj back / dj kicker; and the crane parks, the stage, the hall, the solids, the lasers block.
#   The ground rig (#875 @ b4453938) owns every other unit: position, aim and levels.
#   planes-25 is dropped; cut-11 stays. Totals 50 PL5403 + 18 B380F + 2 LA40WF + smoke.
#   Patch and power are RE-RUN by #875's own code (moxir_v2_ground.patch_power) on the composed list; cut-11 gets its address and
#   leg from that code, never copied from planes-25.
#   A look that exists in only one build: this script lists it and STOPS (exit 2). Levels are never invented.
#
# WHAT THE COMPOSED PATCH CHANGES (stated, owed to the owner): the official patch file (moxir-v2-patch-2026-10-09.json, N460.2)
#   lays 10 cut + 40 planes PARs; planes-25 -> cut-11 makes it 11 + 39, which the file's own block counts refuse. The composer lays a
#   COPY with units 11 / 39 (nothing else changed: universes, starts, modes) as moxir-v2-patch-v2-1-2026-10-10.json. U2 stays
#   50 x 8 ch = 400 of 512. The official file is untouched.
# WHAT IS CARRIED, NOT RE-MEASURED: the ground rig's checks / review / ground_rules / owed (as recorded on the ground rig; the
#   ground builder's measures are not re-run on the composed list) and the cranes rig's under checks_cranes / review_cranes.
#   The proofs of the composition are the C3 checks (scripts/place/moxir-v2-compose.test.js and the pieces' own).
import argparse, copy, hashlib, json, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.dont_write_bytecode = True

DATE = '2026-10-10'
OUT = 'scripts/place/rigs/moxir-v2-1-%s.json' % DATE
OUT_PATCH = 'scripts/place/rigs/moxir-v2-patch-v2-1-%s.json' % DATE
DROPPED = ('rig-par-planes-25',)
CUT_PREFIX, CUBE_PREFIX = 'rig-par-cut-', 'rig-lasercube-cut-'
CRANES_GROUPS = ('stage key', 'dj back', 'dj kicker')
CRANES_BLOCKS = ('solids', 'stage', 'cut', 'far_crane', 'lasers', 'near_crane', 'hall', 'built', 'owner')
GROUND_ONLY = ('round', 'ground_layer', 'ground_rules', 'owed')


def JD(o):
    return list(o) if isinstance(o, (set, tuple)) else str(o)


def owned_by_cranes(f):
    """The rule, as a predicate on the CRANES-side record of a unit."""
    return f['id'].startswith(CUT_PREFIX) or f['id'].startswith(CUBE_PREFIX) or f['part'] in CRANES_GROUPS


def look_ids(rig):
    return [l['id'] for l in rig['looks']]


def compose(repo, gpath, cpath):
    g = json.load(open(gpath))
    c = json.load(open(cpath))
    lg, lc = look_ids(g), look_ids(c)
    if sorted(lg) != sorted(lc):
        print('STOP: a look exists in only one build: ground %s, cranes %s' % (lg, lc), file=sys.stderr)
        sys.exit(2)
    G = {f['id']: f for f in g['fixtures']}
    C = {f['id']: f for f in c['fixtures']}
    cr = {i for i, f in C.items() if owned_by_cranes(f)}
    if not {i for i in G if i.startswith(CUT_PREFIX) or i.startswith(CUBE_PREFIX)} <= cr:
        raise SystemExit('a ground cut / cube unit is missing on the cranes side')
    fx, only = [], []
    for f in g['fixtures']:
        i = f['id']
        if i in DROPPED:
            continue
        if i in cr:
            fx.append(copy.deepcopy(C[i]))
            if i == CUT_PREFIX + '10':
                fx.append(copy.deepcopy(C[CUT_PREFIX + '11']))     # the lamp planes-25 became
        else:
            fx.append(copy.deepcopy(f))
    ids = [f['id'] for f in fx]
    if len(set(ids)) != len(ids) or CUT_PREFIX + '11' not in ids:
        raise SystemExit('composed ids are not unique or cut-11 is missing')
    T = copy.deepcopy(g)
    T['fixtures'] = fx
    # --- looks: a part's [colour, level] from the owner of its units; a part with no unit is dropped
    owner = {f['id']: ('c' if f['id'] in cr else 'g') for f in fx}
    parts_c = {f['part'] for f in fx if owner[f['id']] == 'c'}
    parts_g = {f['part'] for f in fx if owner[f['id']] == 'g'}
    both = sorted(parts_c & parts_g)
    if both:
        print('STOP: a part holds units of both owners: %s' % both, file=sys.stderr)
        sys.exit(2)
    looks = []
    for lg_ in g['looks']:
        lc_ = next(l for l in c['looks'] if l['id'] == lg_['id'])
        if lg_['desk_caps'] != lc_['desk_caps']:
            print('STOP: desk_caps of look %s differ between the builds' % lg_['id'], file=sys.stderr)
            sys.exit(2)
        parts = {}
        for f in fx:
            p = f['part']
            if p in parts:
                continue
            src = lc_ if owner[f['id']] == 'c' else lg_
            if p not in src['parts']:
                continue          # the owner's build does not light this part in this look (off there, off here)
            parts[p] = copy.deepcopy(src['parts'][p])
        L = copy.deepcopy(lg_)
        L['parts'] = parts
        looks.append(L)
    T['looks'] = looks
    for k_, cue in enumerate(T['cues']):
        cc = next(x for x in c['cues'] if x['look'] == cue['look'])
        if (cue['fade'], cue['hold']) != (cc['fade'], cc['hold']):
            print('STOP: cue %s fade/hold differ between the builds' % cue['look'], file=sys.stderr)
            sys.exit(2)
        cue['name'] = 'v2.1 · %s' % ('dark (one colour)' if cue['look'] == 'dark' else cue['look'])
    for k in CRANES_BLOCKS:
        T[k] = copy.deepcopy(c[k])
    T['requires'] = dict(copy.deepcopy(c['requires']), **copy.deepcopy(g['requires']))
    T['checks_cranes'], T['review_cranes'] = copy.deepcopy(c['checks']), copy.deepcopy(c['review'])
    T['snapshot'] = 'moxir-v2-1-%s' % DATE
    T['version'] = 'MOXIR v2.1'
    T['title'] = 'MOXIR v2.1 - the ground units of #875 and the cut, cranes and lasers of #878, composed'
    T['what'] = ('v2.1 = ONE rig composed by scripts/place/moxir_v2_compose.py from %s (ground, #875 @ b4453938) and %s (cranes, #878 @ a4ece687): '
                 'owned by mount (the cranes rig: cut-01..11, the 6 cubes, stage key / dj back / dj kicker, the crane parks, the hall; the ground rig: every other unit), '
                 'planes-25 dropped, cut-11 kept, patch and power re-run on the composed list. UNVALIDATED until the C3 proofs pass.'
                 % (os.path.basename(gpath), os.path.basename(cpath)))
    T['written_by'] = 'scripts/place/moxir_v2_compose.py'
    T['date'] = DATE
    T['compose'] = {'rule': 'owned by mount (docstring of moxir_v2_compose.py)', 'status': 'unvalidated until the C3 proofs pass',
                    'cranes_owned': sorted(i for i in ids if owner[i] == 'c'), 'dropped': list(DROPPED),
                    'from': {'ground': os.path.basename(gpath), 'cranes': os.path.basename(cpath)},
                    'carried_not_remeasured': ['checks', 'review', 'ground_rules', 'owed (ground rig, as recorded)'],
                    'part_levels': {'cranes_parts': sorted(parts_c), 'ground_parts': sorted(parts_g)}}
    T['patch_note'] = 'the composed patch: moxir-v2-patch-v2-1-%s.json (official N460.2 file with the block counts 11 cut / 39 planes); see compose.' % DATE
    T['checks'] = copy.deepcopy(g['checks'])
    T['review'] = copy.deepcopy(g['review'])
    # --- patch, DMX lines, power: #875's own code, on the composed list
    import moxir_v2_ground as GR
    plan = json.load(open(os.path.join(repo, GR.PATCH_PLAN)))
    n_cut = sum(1 for f in fx if f['id'].startswith(CUT_PREFIX))
    n_planes = sum(1 for f in fx if f['id'].startswith('rig-par-planes-') and f['type'] == 'up-pl5403')
    for u in plan['universes']:
        for b in u['blocks']:
            if b['select'].get('group') == 'rig-par-cut':
                b['units'] = n_cut
            elif b['select'].get('group') == 'rig-par-planes':
                b['units'] = n_planes
    plan['v2_1_note'] = 'a copy of the official v2 patch (N460.2) with the block counts cut %d / planes %d (planes-25 became cut-11); nothing else changed' % (n_cut, n_planes)
    A = GR.Area(repo)
    G_ = GR.world(repo).G
    SPR = json.load(open(os.path.join(repo, GR.RIG_SP)))
    RT = GR.Router(A, G_)
    R4 = GR.patch_power(repo, T, A, G_, SPR, RT, plan)
    T['patch']['from'] = os.path.basename(OUT_PATCH)
    return T, plan


def dump(o):
    return json.dumps(o, indent=1, default=JD) + '\n'


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('ground')
    ap.add_argument('cranes')
    ap.add_argument('--repo', default='.')
    ap.add_argument('--out', default=None, help='write here instead of the repo (a temp copy)')
    A_ = ap.parse_args()
    repo = os.path.abspath(os.path.expanduser(A_.repo))
    os.chdir(repo)
    shas = []
    for k in range(2):
        T, plan = compose(repo, A_.ground, A_.cranes)
        s = dump(T)
        shas.append(hashlib.sha256(s.encode()).hexdigest())
        print('build %d sha256 %s' % (k + 1, shas[-1]), flush=True)
    if shas[0] != shas[1]:
        print('NOT DETERMINISTIC', file=sys.stderr)
        sys.exit(1)
    out = A_.out or os.path.join(repo, OUT)
    open(out, 'w').write(s)
    open(os.path.join(os.path.dirname(out), os.path.basename(OUT_PATCH)) if A_.out else os.path.join(repo, OUT_PATCH), 'w').write(dump(plan))
    print('wrote', out)


if __name__ == '__main__':
    main()
