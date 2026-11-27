#!/usr/bin/env python3
"""mirror_sync.py: (di show desk tools) every left/right moving-bar pair mirrors its partner and faces the room, in every step of every look.

Why (a show night, 2026-11-26), the owner N7024 (relayed by dob-3f 21:4x), his words: "look and fix the scenes i want that
light work sync , now its bad becouse in scenes left line and right line is do the same movment and one the every time looks
to the wall".

The rig's mirror rule is DATA, read from the presets file's `constants` (the show kit's convention, replicated from
presets_lib_measured.py `_m()` and `cell_mirror()`; not imported):
  MIRROR_MODE_PAN / MIRROR_MODE_TILT override MIRROR_MODE. 'negate': m(side) = +1 for the left prefix, -1 for the right
  prefix; any other value: m = 1. The partner's value on an axis is 65536 - lead when that axis is 'negate', equal to the
  lead otherwise.
  into(side, p, t) = m_tilt(side) * FACE_SIGN * sin(t) * cos(p)   (angles from the centres; 270 deg tilt, 540 deg pan)
  CELL_MIRROR_LR (falls back to CELL_MIRROR, default True): True = the partner shows the lead's cells in reversed index
  order, False = the same index. Cell channels are the keys <c><i> (c in r, g, b, w; i = 1..N, N from the keys present).
  No FACE_SIGN, or no mirror mode for an axis: exit 2 (never a guessed sign: two wrong loads happened on 2026-11-26).
  Each key the rule uses (FACE_SIGN, the pan key, the tilt key, and unless --keep-cells the cell key) also needs
  measured.<KEY> in the presets: the same value (a boolean measured value for a number constant is refused) and a confidence other than none; else exit 2 naming the key.
Measured rule of the Reika rig (camera record, 2026-11-26 22:4x, dob-3f's controlled hold, all 18 bars at pan 128; tilt 156
put both sides inward, tilt 100 put both on their own walls; the lead dob-39 viewed the frame): the right bars hang turned
180 degrees, DMX tilt above centre lands INWARD on both sides. Presets values: MIRROR_MODE_PAN negate, MIRROR_MODE_TILT
same, FACE_SIGN +1, CELL_MIRROR_LR True (pan R = 65536 - pan L, tilt R = tilt L, R cells = L cells reversed).
The OLD rule (measured wrong for that hall, kept as presets values for other rigs): both trusses hang the same way,
MIRROR_MODE negate, FACE_SIGN -1, so the mirror is (65536 - pan, 65536 - tilt); the old tool's moves come back with --keep-cells
and, for presets with no camera record, --rule-unmeasured-ok (the provenance check below).

Rule, for every look and every pair n = 1..9 (the 5th left bar gives no light, but it stays in every scene: owner N7030):
  a look whose pair-steps all mirror (within 2 on both axes, cells too) with no bar more than 5 deg into its own wall
  (into >= -sin 5 deg) stays as it is. In any other look, at every pair-step the LEAD bar keeps its move, folded at exactly
  0: where it points into its own wall (into < 0) its tilt is mirrored about the centre (pan kept), so a move through
  straight down stays continuous; its partner gets the mirror of the lead (pan, tilt, and cells unless --keep-cells). The
  lead is tried three ways per look: the bar more into the room at each step ('step'), the left bar ('L'), the right bar
  ('R'); the tool keeps the way whose bars' largest step-to-step moves (and last -> first) grow least. Why: a lead that
  changes side between two steps swings a bar by twice its pan (seen 2026-11-26 21:52), and a fold at -5 deg instead of 0
  made 10 deg jumps (21:59).
Only pan, pan_fine, tilt, tilt_fine of the moving bars change, plus the partner's cell channels unless --keep-cells; colour,
dimmer, timing and the desk trims stay. The tool proves that by walking every value, re-audits every pair-step of the
output (0 not mirrored, 0 into a wall; the cell counts uniform / reversed / same / other are printed), and refuses (exit 1)
when a bar's largest step move grew by more than --max-grow degrees (default 5).
Designed two-sided looks: a look with `twoSided: true` (call and answer: the two sides do different things on purpose) goes to
the output exactly as it came in, never mirrored and never counted as changed; one line names it ("kept as designed (twoSided):
<ids>"). The builder or the merge that makes a call-and-answer look sets the flag on the look; the desk keeps the field only from
an install that carries this change (older desks drop unknown look fields, so a look read back from one has lost the flag).
Exit codes: 0 ok; 1 wrong argument count (usage), no pair in the presets, "no looks selected", or a failed proof (another value
changed, a pair not mirrored, a cell not as the rule says, a bar into a wall, a step move grew more than --max-grow); 2 the rule
is incomplete or unmeasured, or a constant or measured value is not valid.
Undo: the output is a new file (--copy-suffix writes copies next to the originals); the input is never changed.

Usage: mirror_sync.py <presets.json> <in.json> <out.json> [--only-prefix P] [--skip-prefix P] [--copy-suffix S] [--max-grow DEG]
                      [--left L] [--right R] [--keep-cells]
                      [--rule-unmeasured-ok]
  --left/--right: the unit-key prefixes of the two sides in presets .units (default L and R: L1..Ln pairs with R1..Rn;
                  only numbers present on both sides are pairs).
  --keep-cells: leave every colour/cell as it is (the old behaviour).
  --rule-unmeasured-ok: skip the provenance check (other rigs, test fixtures); the rule line then says "rule NOT measured".
  in: a file with .looks[] (a suite or review file, or a desk /api/looks answer). Other top-level fields are kept.
  --copy-suffix S: the output looks get id+S and name+' '+S (copies; the originals stay where they are).
"""
import json, sys, math, re
from collections import Counter


def opt(name):
    if name in sys.argv:
        i = sys.argv.index(name)
        v = sys.argv[i + 1]
        del sys.argv[i:i + 2]
        return v
    return None


KEEP_CELLS = '--keep-cells' in sys.argv
if KEEP_CELLS:
    sys.argv.remove('--keep-cells')
UNMEASURED_OK = '--rule-unmeasured-ok' in sys.argv
if UNMEASURED_OK:
    sys.argv.remove('--rule-unmeasured-ok')
only, skip, suffix = opt('--only-prefix'), opt('--skip-prefix'), opt('--copy-suffix')
max_grow = float(opt('--max-grow') or 5)
LEFT, RIGHT = opt('--left') or 'L', opt('--right') or 'R'
if len(sys.argv) != 4:
    sys.exit('usage: mirror_sync.py <presets.json> <in.json> <out.json> [--only-prefix P] [--skip-prefix P] [--copy-suffix S] [--max-grow DEG] [--left L] [--right R] [--keep-cells] [--rule-unmeasured-ok]')
presets_f, in_f, out_f = sys.argv[1:4]
presets = json.load(open(presets_f))
units = presets['units']
C = presets.get('constants') or {}
bars = {k: u['id'] for k, u in units.items() if k[:len(LEFT)] == LEFT and k[len(LEFT):].isdigit() or k[:len(RIGHT)] == RIGHT and k[len(RIGHT):].isdigit()}
PAIRS = sorted(int(k[len(LEFT):]) for k in bars if k[:len(LEFT)] == LEFT and f'{RIGHT}{k[len(LEFT):]}' in bars)
if not PAIRS:
    sys.exit(f'no {LEFT}<n>/{RIGHT}<n> pair in the presets units')
bars = {k: v for k, v in bars.items() if k[len(LEFT):] in {str(n) for n in PAIRS} or k[len(RIGHT):] in {str(n) for n in PAIRS}}
EPS = math.sin(math.radians(5))
_mode = C.get('MIRROR_MODE')
MODE = {'pan': C.get('MIRROR_MODE_PAN', _mode), 'tilt': C.get('MIRROR_MODE_TILT', _mode)}
FACE = C.get('FACE_SIGN')
if isinstance(FACE, bool) or not isinstance(FACE, (int, float)) or FACE not in (1, -1) or any(m is None for m in MODE.values()):
    sys.stderr.write('the presets give no complete mirror rule (FACE_SIGN and a mirror mode for pan and tilt): a measured rule is needed '
             'from a camera hold; this tool never guesses a sign\n')
    sys.exit(2)
FACE = int(FACE)
NEG = {ax: m == 'negate' for ax, m in MODE.items()}
CELL_REV = bool(C.get('CELL_MIRROR_LR', C.get('CELL_MIRROR', True)))
CELLS = not KEEP_CELLS
KEYS = [('FACE_SIGN', FACE)]
KEYS += [(('MIRROR_MODE_PAN' if 'MIRROR_MODE_PAN' in C else 'MIRROR_MODE'), MODE['pan']),
         (('MIRROR_MODE_TILT' if 'MIRROR_MODE_TILT' in C else 'MIRROR_MODE'), MODE['tilt'])]
if CELLS:
    KEYS.append((('CELL_MIRROR_LR' if 'CELL_MIRROR_LR' in C else 'CELL_MIRROR'), C.get('CELL_MIRROR_LR', C.get('CELL_MIRROR', True))))
MEAS = presets.get('measured') or {}


def provenance():
    """Each key the rule uses needs a camera record: measured.<KEY> with the same value and a confidence that is not none.
    Returns the per-key text for the rule line, or exits 2 with one line."""
    out = []
    for k, v in KEYS:
        m = MEAS.get(k) if isinstance(MEAS, dict) else None
        if not isinstance(m, dict):
            why = 'no measured entry'
        elif isinstance(m.get('value'), bool) != isinstance(v, bool):
            why = f"measured value {m.get('value')!r} is a boolean"
        elif m.get('value') != v:
            why = f"measured value {m.get('value')!r} differs from the constant {v!r}"
        elif str(m.get('confidence', 'none')).strip().lower() in ('', 'none'):
            why = 'confidence is none'
        else:
            out.append(f"{k}={v} ({m['confidence']}: {str(m.get('method', ''))[:60]})")
            continue
        sys.stderr.write(f'the presets have no camera record for {k} ({why}): a measured rule is needed from a camera hold; '
                         'pass --rule-unmeasured-ok only for another rig or a test\n')
        sys.exit(2)
    return out


PROV = [] if UNMEASURED_OK else provenance()
RULE = (('rule NOT measured (--rule-unmeasured-ok)' if UNMEASURED_OK else 'rule from presets') +
        f": pan {'negate' if NEG['pan'] else 'same'}, tilt {'negate' if NEG['tilt'] else 'same'}, "
        f"FACE_SIGN {FACE:+d}, " + ('cells kept (--keep-cells)' if KEEP_CELLS else 'cells reversed' if CELL_REV else 'cells same index') +
        ('; ' + '; '.join(PROV) if PROV else ''))
CELL_KEY = re.compile(r'^([rgbw])(\d+)$')
BARS = set(bars.values())
src = json.load(open(in_f))
all_looks = src.get('looks', src) if isinstance(src, dict) else src
looks = [l for l in all_looks if (not only or l['id'].startswith(only)) and (not skip or not l['id'].startswith(skip))]
if not looks:
    sys.exit('no looks selected')
before = json.loads(json.dumps(looks))
DESIGNED = [l['id'] for l in looks if l.get('twoSided') is True]


def g16(v, ch):
    return v[ch] * 256 + v.get(ch + '_fine', 0)


def s16(v, ch, x):
    x = max(0, min(65535, x))
    if ch + '_fine' in v:
        v[ch], v[ch + '_fine'] = x >> 8, x & 255
    else:
        v[ch] = min(255, (x + 128) >> 8)


def mside(side, ax):
    """The rule's m(side) for one axis: +1 left, -1 right when that axis is 'negate', else 1."""
    return (1 if side == 'L' else -1) if NEG[ax] else 1


def into(side, p, t):
    return mside(side, 'tilt') * FACE * math.sin(math.radians((t - 32768) * 270 / 65535)) * math.cos(math.radians((p - 32768) * 540 / 65535))


def partner(ax, x):
    return 65536 - x if NEG[ax] else x


def mir(ax, a, b):
    return abs(partner(ax, a) - b) <= 2


def cells(v):
    """{channel: {index: value}} of the cell keys <c><i> present in one bar's values."""
    out = {}
    for k, x in v.items():
        m = CELL_KEY.match(k)
        if m:
            out.setdefault(m.group(1), {})[int(m.group(2))] = x
    return out


def cell_state(a, b):
    """uniform / reversed / same / other for one pair-step (None when either bar has no cells). Lead a, partner b."""
    ca, cb = cells(a), cells(b)
    if not ca or not cb or set(ca) != set(cb):
        return None
    rev = same = True
    for c in ca:
        n = max(ca[c])
        if set(ca[c]) != set(range(1, n + 1)) or set(cb[c]) != set(ca[c]):
            return 'other'
        rev = rev and all(cb[c][i] == ca[c][n + 1 - i] for i in ca[c])
        same = same and all(cb[c][i] == ca[c][i] for i in ca[c])
    return 'uniform' if rev and same else 'reversed' if rev else 'same' if same else 'other'


def cells_ok(a, b):
    st = cell_state(a, b)
    return st is None or st == 'uniform' or st == ('reversed' if CELL_REV else 'same')


def pairs(look):
    for si, st in enumerate(look.get('steps', [])):
        v = st.get('values') or {}
        for n in PAIRS:
            a, b = v.get(bars[f'{LEFT}{n}']), v.get(bars[f'{RIGHT}{n}'])
            if a and b and all(ch in x for x in (a, b) for ch in ('pan', 'tilt')):
                yield si, n, a, b


def audit(look):
    c = Counter()
    for _, n, a, b in pairs(look):
        pa, ta, pb, tb = g16(a, 'pan'), g16(a, 'tilt'), g16(b, 'pan'), g16(b, 'tilt')
        c['pairs'] += 1
        c['mirrored' if mir('pan', pa, pb) and mir('tilt', ta, tb) else 'same' if abs(pa - pb) <= 2 and abs(ta - tb) <= 2 else 'other'] += 1
        if CELLS:
            st = cell_state(a, b)
            if st:
                c['cells ' + st] += 1
                c['cells bad'] += not cells_ok(a, b)
        c['wall'] += min(into('L', pa, ta), into('R', pb, tb)) < -EPS
    return c


def jumps(look):
    """Per moving bar: its largest pan and tilt move in degrees between two steps that follow each other (and last -> first)."""
    out = {}
    steps = look.get('steps', [])
    links = list(zip(steps, steps[1:])) + ([(steps[-1], steps[0])] if len(steps) > 2 else [])
    for s0, s1 in links:
        for fid in BARS:
            a, b = (s0.get('values') or {}).get(fid), (s1.get('values') or {}).get(fid)
            if a and b and all(ch in x for x in (a, b) for ch in ('pan', 'tilt')):
                op, ot = out.get(fid, (0.0, 0.0))
                out[fid] = (max(op, abs(g16(a, 'pan') - g16(b, 'pan')) * 540 / 65535),
                            max(ot, abs(g16(a, 'tilt') - g16(b, 'tilt')) * 270 / 65535))
    return out


def worst(j):
    return f"{max((v[0] for v in j.values()), default=0):.0f}/{max((v[1] for v in j.values()), default=0):.0f}"


def grown(j0, j1):
    """How much the bars' largest step moves grew: the sum over bars and both axes, and the single largest growth (degrees)."""
    g = [max(0.0, j1.get(f, (0.0, 0.0))[k] - j0.get(f, (0.0, 0.0))[k]) for f in BARS for k in (0, 1)]
    return sum(g), max(g, default=0.0)


def needs(look):
    """A look is changed only if some pair-step is not mirrored or has a bar more than 5 deg into its own wall."""
    a = audit(look)
    return bool(a['same'] or a['other'] or a['wall'] or a['cells bad'])


def sync(look, lead, parts):
    """Mirror every pair-step of one look in place; lead = 'step' (the bar more into the room at that step), 'L' or 'R'.
    The lead is folded at exactly 0 (into < 0: tilt mirrored about the centre), the same rule at every step of the look, so a
    move through straight down stays continuous (a 5 deg threshold here made 10 deg jumps, seen 21:59)."""
    ch = Counter()
    for si, n, a, b in pairs(look):
        pa, ta, pb, tb = g16(a, 'pan'), g16(a, 'tilt'), g16(b, 'pan'), g16(b, 'tilt')
        ia, ib = into('L', pa, ta), into('R', pb, tb)
        left_leads = ia >= ib if lead == 'step' else lead == 'L'
        ref, rp, rt, ri, part = (a, pa, ta, ia, b) if left_leads else (b, pb, tb, ib, a)
        qp, qt = (pb, tb) if left_leads else (pa, ta)
        turned = ri < 0
        if turned:
            rt = 65536 - rt
            s16(ref, 'tilt', rt)
            ch['turned'] += 1
        if turned or not (mir('pan', rp, qp) and mir('tilt', rt, qt)) or (CELLS and not cells_ok(ref, part)):
            s16(part, 'pan', partner('pan', rp))
            s16(part, 'tilt', partner('tilt', rt))
            if CELLS:
                parts.add((si, bars[f'{RIGHT if left_leads else LEFT}{n}']))
                cr = cells(ref)
                for c, d in cr.items():
                    n = max(d)
                    for i in d:
                        part[f'{c}{i}'] = d[n + 1 - i] if CELL_REV and set(d) == set(range(1, n + 1)) else d[i]
            ch['changed'] += 1
    return ch


rows, total = [], Counter()
PARTS = {}  # look index -> {(step index, partner fixture id)}: the only bars whose cells the tool may rewrite
for i, look in enumerate(looks):
    a0, j0 = audit(look), jumps(look)
    best = None
    for lead in (('step', 'L', 'R') if needs(look) and look.get('twoSided') is not True else ()):
        trial = json.loads(json.dumps(look))
        parts = set()
        ch = sync(trial, lead, parts)
        gsum, gmax = grown(j0, jumps(trial))
        key = (round(gsum, 1), ch['turned'], ch['changed'])
        if best is None or key < best[0]:
            best = (key, lead, trial, ch, gmax, parts)
    _, lead, look, ch, gmax, parts = best or (None, '-', look, Counter(), 0.0, set())
    looks[i] = look
    PARTS[i] = parts
    if ch:
        look['aim_fix_sync'] = ('left/right pairs mirrored and facing the room in every step (owner N7024, 2026-11-26): '
                                f"{ch['changed']} pair-steps changed, {ch['turned']} turned to face the room, lead {lead}")
    if suffix:
        look['id'] = look['id'] + suffix
        look['name'] = f"{look.get('name', '')} {suffix.strip('-')}"
    a1, j1 = audit(look), jumps(look)
    if look.get('twoSided') is True:
        total.update({'looks': 1})  # kept as designed: not audited, not counted as changed or as a failed proof
        continue
    rows.append((look.get('name', look['id']), a0, a1, ch, worst(j0), worst(j1), lead, gmax))
    total.update({'looks': 1, 'changed looks': bool(ch), 'pair-steps changed': ch['changed'], 'turned': ch['turned'],
                  'pairs': a1['pairs'], 'after not mirrored': a1['same'] + a1['other'], 'after into a wall': a1['wall'],
                  'cells uniform': a1['cells uniform'], 'cells reversed': a1['cells reversed'], 'cells same': a1['cells same'],
                  'cells other': a1['cells other'], 'cells bad': a1['cells bad'],
                  'before same': a0['same'], 'before other': a0['other'], 'before into a wall': a0['wall'],
                  'moves grew': gmax > max_grow})

other = 0
ALLOWED = {'pan', 'pan_fine', 'tilt', 'tilt_fine'}


def walk(a, b, path):
    global other
    if isinstance(a, dict) or isinstance(b, dict):
        if not (isinstance(a, dict) and isinstance(b, dict)):
            other += 1
            return
        for k in set(a) | set(b):
            if len(path) == 1 and k in ('aim_fix_sync',) + (('id', 'name') if suffix else ()):
                continue
            walk(a.get(k), b.get(k), path + [k])
    elif isinstance(a, list) or isinstance(b, list):
        if not (isinstance(a, list) and isinstance(b, list)) or len(a) != len(b):
            other += 1
            return
        for i, (x, y) in enumerate(zip(a, b)):
            walk(x, y, path + [i])
    elif a != b and not (len(path) == 6 and path[1:2] + path[3:4] == ['steps', 'values'] and path[4] in BARS and (
            path[-1] in ALLOWED or (CELLS and CELL_KEY.match(str(path[-1])) and (path[0], path[2], path[4]) in PARTS_OK))):
        other += 1


PARTS_OK = {(i, si, fid) for i, p in PARTS.items() for si, fid in p}
for k, (x, y) in enumerate(zip(before, looks)):
    walk(x, y, [k])

for name, a0, a1, ch, w0, w1, lead, gmax in rows:
    if ch or a0['wall'] or a0['same'] or a0['other']:
        print(f"{str(name)[:20]:<20} {a0['pairs']:>4} pair-steps: before same {a0['same']}, other {a0['other']}, into a wall {a0['wall']} -> "
              f"lead {lead}: changed {ch['changed']} (turned {ch['turned']}); after not mirrored {a1['same'] + a1['other']}, into a wall {a1['wall']}; "
              f"largest step move pan/tilt deg {w0} -> {w1}, one bar's move grew at most {gmax:.0f}")
out = dict(src) if isinstance(src, dict) else {}
out['looks'] = looks
json.dump(out, open(out_f, 'w'), indent=1)
print(f"{total['looks']} looks, {total['changed looks']} changed: {total['pair-steps changed']} of {total['pairs']} pair-steps "
      f"changed ({total['turned']} turned to face the room); before: same {total['before same']}, other {total['before other']}, "
      f"into a wall {total['before into a wall']}; after: not mirrored {total['after not mirrored']}, into a wall {total['after into a wall']}; "
      f"{total['moves grew']} looks where a bar's step move grew more than {max_grow:g} deg; {other} other values changed; wrote {out_f}")
if CELLS:
    print(f"cells after (pair-steps): uniform {total['cells uniform']}, reversed {total['cells reversed']}, same {total['cells same']}, "
          f"other {total['cells other']}, not as the rule says {total['cells bad']}")
print(RULE)
if DESIGNED:
    print('kept as designed (twoSided): ' + ', '.join(DESIGNED))
sys.exit(1 if other or total['cells bad'] or total['after not mirrored'] or total['after into a wall'] or total['moves grew'] else 0)
