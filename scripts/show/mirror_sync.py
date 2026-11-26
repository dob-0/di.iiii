#!/usr/bin/env python3
"""mirror_sync.py: (di show desk tools) every left/right moving-bar pair mirrors its partner and faces the room, in every step of every look.

Why (a show night, 2026-11-26), the owner N7024 (relayed by dob-3f 21:4x), his words: "look and fix the scenes i want that
light work sync , now its bad becouse in scenes left line and right line is do the same movment and one the every time looks
to the wall".
Measured (camera frames 21:31:45 and 21:38:46, RDM GET 21:29, the N7020 fix): both trusses hang the same way; DMX tilt above
its centre (32768) turns a bar toward the LEFT wall while its pan is centred, and at pan centre the tilt moves the beam across
the room. So equal values on L<n> and R<n> send one bar into the room and its partner into its own wall, and the true mirror
of a bar's (pan, tilt) is (65536 - pan, 65536 - tilt) (beam (x, y, z) -> (-x, y, z)).

Rule, for every look and every pair n = 1..9 (the 5th left bar gives no light, but it stays in every scene: owner N7030):
  into(bar) = how far the beam points into the room: -sin(tilt) cos(pan) for L, +sin(tilt) cos(pan) for R
              (tilt and pan in degrees from their centres; 270 and 540 degree ranges)
  a look whose pair-steps all mirror (within 2 of 65536 on both axes) with no bar more than 5 deg into its own wall
  (into >= -sin 5 deg) stays as it is. In any other look, at every pair-step the LEAD bar keeps its move, folded at exactly
  0: where it points into its own wall (into < 0) its tilt is mirrored about the centre (pan kept), so a move through
  straight down stays continuous; its partner gets the mirror of the lead. The lead is tried three ways per look: the bar
  more into the room at each step ('step'), the left bar ('L'), the right bar ('R'); the tool keeps the way whose bars'
  largest step-to-step moves (and last -> first) grow least. Why: a lead that changes side between two steps swings a bar by
  twice its pan (seen 2026-11-26 21:52 on the older scenes with the per-step lead only: 2 -> 42 deg, 11 -> 101 deg), and a
  fold at -5 deg instead of 0 made 10 deg jumps (21:59).
Only pan, pan_fine, tilt and tilt_fine of the 18 moving bars change; colour, dimmer, cells, timing and the desk trims stay.
The tool proves that by walking every value, re-audits every pair-step of the output (0 not mirrored, 0 into a wall), and
refuses (exit 1) when a bar's largest step move grew by more than --max-grow degrees (default 5).

Usage: mirror_sync.py <presets.json> <in.json> <out.json> [--only-prefix P] [--skip-prefix P] [--copy-suffix S] [--max-grow DEG]
                      [--left L] [--right R]
  --left/--right: the unit-key prefixes of the two sides in presets .units (default L and R: L1..Ln pairs with R1..Rn;
                  only numbers present on both sides are pairs).
  in: a file with .looks[] (a suite or review file, or a desk /api/looks answer). Other top-level fields are kept.
  --copy-suffix S: the output looks get id+S and name+' '+S (copies; the originals stay where they are).
"""
import json, sys, math
from collections import Counter


def opt(name):
    if name in sys.argv:
        i = sys.argv.index(name)
        v = sys.argv[i + 1]
        del sys.argv[i:i + 2]
        return v
    return None


only, skip, suffix = opt('--only-prefix'), opt('--skip-prefix'), opt('--copy-suffix')
max_grow = float(opt('--max-grow') or 5)
LEFT, RIGHT = opt('--left') or 'L', opt('--right') or 'R'
if len(sys.argv) != 4:
    sys.exit('usage: mirror_sync.py <presets.json> <in.json> <out.json> [--only-prefix P] [--skip-prefix P] [--copy-suffix S] [--max-grow DEG] [--left L] [--right R]')
presets_f, in_f, out_f = sys.argv[1:4]
units = json.load(open(presets_f))['units']
bars = {k: u['id'] for k, u in units.items() if k[:len(LEFT)] == LEFT and k[len(LEFT):].isdigit() or k[:len(RIGHT)] == RIGHT and k[len(RIGHT):].isdigit()}
PAIRS = sorted(int(k[len(LEFT):]) for k in bars if k[:len(LEFT)] == LEFT and f'{RIGHT}{k[len(LEFT):]}' in bars)
if not PAIRS:
    sys.exit(f'no {LEFT}<n>/{RIGHT}<n> pair in the presets units')
bars = {k: v for k, v in bars.items() if k[len(LEFT):] in {str(n) for n in PAIRS} or k[len(RIGHT):] in {str(n) for n in PAIRS}}
EPS = math.sin(math.radians(5))
BARS = set(bars.values())
src = json.load(open(in_f))
all_looks = src.get('looks', src) if isinstance(src, dict) else src
looks = [l for l in all_looks if (not only or l['id'].startswith(only)) and (not skip or not l['id'].startswith(skip))]
if not looks:
    sys.exit('no looks selected')
before = json.loads(json.dumps(looks))


def g16(v, ch):
    return v[ch] * 256 + v.get(ch + '_fine', 0)


def s16(v, ch, x):
    x = max(0, min(65535, x))
    if ch + '_fine' in v:
        v[ch], v[ch + '_fine'] = x >> 8, x & 255
    else:
        v[ch] = min(255, (x + 128) >> 8)


def into(side, p, t):
    return (-1 if side == 'L' else 1) * math.sin(math.radians((t - 32768) * 270 / 65535)) * math.cos(math.radians((p - 32768) * 540 / 65535))


def mir(a, b):
    return abs(a + b - 65536) <= 2


def pairs(look):
    for st in look.get('steps', []):
        v = st.get('values') or {}
        for n in PAIRS:
            a, b = v.get(bars[f'{LEFT}{n}']), v.get(bars[f'{RIGHT}{n}'])
            if a and b and all(ch in x for x in (a, b) for ch in ('pan', 'tilt')):
                yield n, a, b


def audit(look):
    c = Counter()
    for n, a, b in pairs(look):
        pa, ta, pb, tb = g16(a, 'pan'), g16(a, 'tilt'), g16(b, 'pan'), g16(b, 'tilt')
        c['pairs'] += 1
        c['mirrored' if mir(pa, pb) and mir(ta, tb) else 'same' if abs(pa - pb) <= 2 and abs(ta - tb) <= 2 else 'other'] += 1
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
    return bool(a['same'] or a['other'] or a['wall'])


def sync(look, lead):
    """Mirror every pair-step of one look in place; lead = 'step' (the bar more into the room at that step), 'L' or 'R'.
    The lead is folded at exactly 0 (into < 0: tilt mirrored about the centre), the same rule at every step of the look, so a
    move through straight down stays continuous (a 5 deg threshold here made 10 deg jumps, seen 21:59)."""
    ch = Counter()
    for n, a, b in pairs(look):
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
        if turned or not (mir(rp, qp) and mir(rt, qt)):
            s16(part, 'pan', 65536 - rp)
            s16(part, 'tilt', 65536 - rt)
            ch['changed'] += 1
    return ch


rows, total = [], Counter()
for i, look in enumerate(looks):
    a0, j0 = audit(look), jumps(look)
    best = None
    for lead in (('step', 'L', 'R') if needs(look) else ()):
        trial = json.loads(json.dumps(look))
        ch = sync(trial, lead)
        gsum, gmax = grown(j0, jumps(trial))
        key = (round(gsum, 1), ch['turned'], ch['changed'])
        if best is None or key < best[0]:
            best = (key, lead, trial, ch, gmax)
    _, lead, look, ch, gmax = best or (None, '-', look, Counter(), 0.0)
    looks[i] = look
    if ch:
        look['aim_fix_sync'] = ('left/right pairs mirrored and facing the room in every step (owner N7024, 2026-11-26): '
                                f"{ch['changed']} pair-steps changed, {ch['turned']} turned to face the room, lead {lead}")
    if suffix:
        look['id'] = look['id'] + suffix
        look['name'] = f"{look.get('name', '')} {suffix.strip('-')}"
    a1, j1 = audit(look), jumps(look)
    rows.append((look.get('name', look['id']), a0, a1, ch, worst(j0), worst(j1), lead, gmax))
    total.update({'looks': 1, 'changed looks': bool(ch), 'pair-steps changed': ch['changed'], 'turned': ch['turned'],
                  'pairs': a1['pairs'], 'after not mirrored': a1['same'] + a1['other'], 'after into a wall': a1['wall'],
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
    elif a != b and not (len(path) >= 2 and path[-1] in ALLOWED and path[-2] in BARS):
        other += 1


for x, y in zip(before, looks):
    walk(x, y, [0])

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
sys.exit(1 if other or total['after not mirrored'] or total['after into a wall'] or total['moves grew'] else 0)
