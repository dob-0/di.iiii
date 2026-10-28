#!/usr/bin/env python3
"""scenes_build.py — build a show's scenes file from a compact spec and check it. Step 5 of the venue-to-show skill
(docs/ai/skills/venue-to-show.md): the scenes (looks + cue list) as DATA in the rig's look schema.

    python3 -I scripts/place/scenes_build.py --spec SPEC.json --out SCENES.json     # build + check, writes OUT
    python3 -I scripts/place/scenes_build.py --check SCENES.json                     # check only

SPEC.json = {"config": {...}, "scenes": [...], <any other top-level key is copied through: what, source, licence, date, version, rules, palette ...>}
  config.still            number held on every scene's `motion.still`-style rule (kept as top-level `rules.still` when rules is absent)
  config.floor            {"parts": ["part a", "part b"], "per_act": {"1": ["#hex", level], ...}} — the floor strips, one colour per act
  config.desk_caps        object put in `desk_caps` of any scene that uses a part of config.cap_parts (else null)
  config.cap_parts        list of part names (lasers) the desk cap applies to
  config.parts            optional list of every allowed part name; a scene part outside it is an error
  scene: id title act intent parts{part: [hex, level]} motion heads laser_colour fade_s hold_s notes
         floor (false = no floor strips) floor_colour ([hex, level] overrides the act's floor)
The build adds the floor strips (a scene's own parts win), the cue {fade_s, hold_s}, desk_caps, loop true and loop_s = sum of cues.
Checks: unique ids, act 1.., hex colours, levels 0..1, cue seconds >= 0, parts allowed, and (when the file has a `palette`) every part colour is
one of palette[].hex or beam_wheel_seen[].hex — the production's accepted colours (2026-10-17). The desk cap is data for the desk (a part's look level is a previs value); laser levels are checked by laser_frames.py.
The colour audit (palette, eye rules, colour mix) is scripts/place/palette_*.py, not here."""
import argparse, json, re, sys

HEX = re.compile(r'^#[0-9a-fA-F]{6}$')


def build(spec):
    cfg = spec.get('config', {})
    floor = cfg.get('floor') or {}
    out = {k: v for k, v in spec.items() if k not in ('config', 'scenes')}
    if 'still' in cfg:
        out.setdefault('rules', {}).setdefault('still', cfg['still'])
    scenes = []
    for s in spec['scenes']:
        parts = dict(s.get('parts', {}))
        if s.get('floor', True) and floor:
            fc = s.get('floor_colour') or floor['per_act'].get(str(s['act']))
            if fc:
                for k in floor['parts']:
                    parts.setdefault(k, list(fc))
        capped = any(k in parts for k in cfg.get('cap_parts', []))
        scenes.append({'id': s['id'], 'title': s['title'], 'act': s['act'], 'intent': s.get('intent', ''), 'parts': parts,
                       'motion': s.get('motion'), 'heads': s.get('heads'), 'laser_colour': s.get('laser_colour'),
                       'desk_caps': cfg.get('desk_caps') if capped else None,
                       'cue': {'fade_s': s.get('fade_s', 3), 'hold_s': s.get('hold_s', 24)}, 'notes': s.get('notes', '')})
    out.update({'loop': True, 'loop_s': sum(x['cue']['fade_s'] + x['cue']['hold_s'] for x in scenes), 'scenes': scenes})
    return out


def check(doc, allowed=None):
    e, seen = [], set()
    for s in doc['scenes']:
        i = s.get('id')
        if i in seen: e.append(f'{i}: duplicate id')
        seen.add(i)
        if not isinstance(s.get('act'), int) or s['act'] < 1: e.append(f'{i}: act must be an integer >= 1')
        for k, v in s.get('parts', {}).items():
            if allowed is not None and k not in allowed: e.append(f'{i}: part {k!r} not in config.parts')
            if not (isinstance(v, list) and len(v) == 2 and isinstance(v[0], str) and HEX.match(v[0])): e.append(f'{i}: part {k!r} colour is not [#rrggbb, level]'); continue
            if not isinstance(v[1], (int, float)) or not 0 <= v[1] <= 1: e.append(f'{i}: part {k!r} level {v[1]!r} not in 0..1')
        cue = s.get('cue', {})
        if not all(isinstance(cue.get(k), (int, float)) and cue[k] >= 0 for k in ('fade_s', 'hold_s')): e.append(f'{i}: cue needs fade_s and hold_s >= 0')
    pal = doc.get('palette')                       # 2026-10-17: a scene's colours stay inside the file's OWN accepted palette (v5 went 'colourful')
    if isinstance(pal, list) and pal:
        ok = {str(p.get('hex', '')).lower() for p in pal if isinstance(p, dict)}
        ok |= {str(v.get('hex', '')).lower() for v in (doc.get('beam_wheel_seen') or {}).values() if isinstance(v, dict)}
        for s in doc['scenes']:
            for k, v in s.get('parts', {}).items():
                if isinstance(v, list) and v and isinstance(v[0], str) and HEX.match(v[0]) and v[0].lower() not in ok:
                    e.append(f"{s.get('id')}: part {k!r} colour {v[0]} is not in the file's palette (palette[].hex or beam_wheel_seen[].hex)")
    if doc.get('loop') and abs(doc.get('loop_s', -1) - sum(s['cue']['fade_s'] + s['cue']['hold_s'] for s in doc['scenes'] if 'cue' in s)) > 1e-6:
        e.append('loop_s differs from the sum of the cues')
    return e


def main(argv=None):
    ap = argparse.ArgumentParser(description='Build a scenes file from a compact spec, or check one (see the module doc).')
    ap.add_argument('--spec'); ap.add_argument('--out'); ap.add_argument('--check')
    a = ap.parse_args(argv)
    if a.check:
        doc, allowed = json.load(open(a.check, encoding='utf-8')), None
    elif a.spec and a.out:
        spec = json.load(open(a.spec, encoding='utf-8')); doc = build(spec); allowed = spec.get('config', {}).get('parts')
    else:
        ap.error('give --spec and --out, or --check')
    errs = check(doc, allowed)
    if errs: sys.exit('\n'.join(errs))
    if a.out:
        json.dump(doc, open(a.out, 'w', encoding='utf-8'), indent=1, ensure_ascii=False)
    print(f"{len(doc['scenes'])} scenes, loop {doc.get('loop_s')} s: ok" + (f' -> {a.out}' if a.out else ''))


if __name__ == '__main__':
    main()
