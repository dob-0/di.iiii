#!/usr/bin/env python3
"""scenes_energy.py - give every scene of a scenes file a designed energy (0..1) and set its LEVELS to match.

    python3 scripts/place/scenes_energy.py --scenes <scenes.json> --energy <energy.json> --rig <rig.json> \
        --beams "<part>,<part>" --floor "<part>,<part>" [--outside "<part>,..."] --out <scenes out.json>

`energy.json` = {"<scene id>": 0..1, ...} for every scene (the designer's curve; a scene without one is refused).
Colours are never changed: only levels, and which beam parts are in (a beam part added takes the colour of a
beam part already in that scene, so the scene's palette stays the one it had). The tiers (a set's energy curve:
Butler 2006 "Unlocking the Groove" ch. 4 build / peak / breakdown; the levels are this repo's numbers, measured
against the example look with scripts/place/look_energy.py):
  full  E >= 0.85: every beam part at 1.0 (a beam part missing is added); every other part in the scene,
                   except --outside, at >= 0.7; the --floor parts at >= 0.7 (the hall reads).
  mid   0.5 <= E < 0.85: beam parts in the scene at >= E; other inside parts at >= 0.5; floor >= 0.4; a scene with NO
                   beam part gets the first --beams part at E, in the colour of its brightest inside part (the air is never empty).
  low   E < 0.5: levels kept; floor parts at >= 0.4, so >= 3 lamps of the hall are at >= 40 % (never "nothing").
Writes `energy` (and `energy_tier`) into each scene. Checks: every part named exists in the rig; levels 0..1;
the colours of every part that was in the scene are unchanged. Exits 1 and writes nothing when a check fails.
"""
import argparse, collections, copy, json, sys

TIERS = ((0.85, 'full'), (0.5, 'mid'), (0.0, 'low'))


def tier(e): return next(n for t, n in TIERS if e >= t)


def lift(parts, k, lo):
    if k in parts: parts[k] = [parts[k][0], round(max(parts[k][1], lo), 3)]


def main():
    a = argparse.ArgumentParser()
    for k in ('scenes', 'energy', 'rig', 'beams', 'floor', 'out'): a.add_argument('--' + k, required=True)
    a.add_argument('--outside', default='')
    a = a.parse_args()
    split = lambda s: [x.strip() for x in s.split(',') if x.strip()]
    beams, floor, outside = split(a.beams), split(a.floor), set(split(a.outside))
    doc = json.load(open(a.scenes)); scenes = doc['scenes'] if isinstance(doc, dict) else doc
    energy = json.load(open(a.energy))
    rig = json.load(open(a.rig))
    count = collections.Counter(f.get('part') for f in rig['fixtures'])
    errs = [f'part {p!r} not in rig' for p in beams + floor + sorted(outside) if p not in count]
    out = copy.deepcopy(doc); sc_out = out['scenes'] if isinstance(out, dict) else out
    for s in sc_out:
        e = energy.get(s['id'])
        if not isinstance(e, (int, float)) or not 0 <= e <= 1: errs.append(f'{s["id"]}: no energy 0..1'); continue
        p, t, before = s['parts'], tier(e), {k: v[0] for k, v in s['parts'].items()}
        inside = [k for k in p if k not in outside and k not in beams and k not in floor and k != 'laser']
        if t == 'full':
            colour = next((p[b][0] for b in beams if b in p), None)
            for b in beams:
                if b in p: p[b] = [p[b][0], 1.0]
                elif colour: p[b] = [colour, 1.0]
            for k in inside: lift(p, k, 0.7)
            for k in floor: lift(p, k, 0.7)
        elif t == 'mid':
            if not any(b in p for b in beams) and inside:
                p[beams[0]] = [p[max(inside, key=lambda k: p[k][1])][0], round(e, 2)]
            for b in beams: lift(p, b, round(e, 2))
            for k in inside: lift(p, k, 0.5)
            for k in floor: lift(p, k, 0.4)
        else:
            for k in floor: lift(p, k, 0.4)
        s['energy'], s['energy_tier'] = round(e, 2), t
        for k, c in before.items():
            if p[k][0] != c: errs.append(f'{s["id"]}: colour of {k} changed')
        for k, v in p.items():
            if k not in count: errs.append(f'{s["id"]}: part {k!r} not in rig')
            if not 0 <= v[1] <= 1: errs.append(f'{s["id"]}: level {k} {v[1]}')
        lit = sum(count[k] for k, v in p.items() if k not in outside and k != 'laser' and v[1] >= 0.4)
        if lit < 3: errs.append(f'{s["id"]}: only {lit} hall lamps at >= 0.4')
    if errs:
        print('\n'.join(errs[:40])); sys.exit(1)
    json.dump(out, open(a.out, 'w'), indent=1, ensure_ascii=False)
    c = collections.Counter(s['energy_tier'] for s in sc_out)
    print(f'{a.out}: {len(sc_out)} scenes, tiers {dict(c)}, mean energy {sum(s["energy"] for s in sc_out) / len(sc_out):.2f}')


if __name__ == '__main__':
    main()
