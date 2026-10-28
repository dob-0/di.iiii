#!/usr/bin/env python3
"""look_energy.py - how much light each cue's look puts in the room and in the air (read-only).

    python3 scripts/place/look_energy.py --doc <project document.json | http(s) url> [--cue <look id> ...] [--json out.json]

Reads the project document (as GET /serverXR/api/projects/<p>/document returns it), the looks
(`components.rigLooks.looks` on rig-show) and the cue list (`mappingState.cues[].lightLook` = 'rig-<look id>').
Per cue, over every lamp entity with a `fixture` and a `light`:
  key    = fixture.position with spaces as '-' + '/' + fixture.type, for 'named …'/'halo …' lamps (src/rigbuild/looks.js
           namedPositionKey; case and dots kept); other lamps are keyed by their deal slot, read here as kebab(position)
  level  = look.levels[key], a group the look does not name is at full (src/rigbuild/looks.js levelOfKey)
  cd     = light.intensity × level      (three.js candela, the rig's sceneScale already in it)
  lm     = light.intensity × Ω(angle)    (the lamp's flux as built: I = F / Ω, rig-lib.mjs candelaAt)
  air    = lm × level × beam.haze_drawn  (haze_drawn = beam.haze × level, looks.js atLevel; the air's
           scattering is one number per project, so this is the beam-in-the-air term, RIG_BUILD + physics rule)
Lasers (ext-lc-*, up-la40wf) are counted in `on`/`full` but left out of lm/air: their air brightness is set by hand
(rig-lib.mjs airFixed), not by a cone.
Output per cue: lamps lit (> 0), lamps ≥ 0.8, lamps ≥ 0.4, mean level over all lamps, Σ lm×level, Σ air.
"""
import argparse, json, math, re, sys, urllib.request

LASER = ('ext-lc-', 'up-la40wf')
HAZE_DEFAULT = 0.4  # looks.js HAZE_DEFAULT (spotBeam.js DEFAULT_HAZE)


def kebab(s): return re.sub(r'-+', '-', re.sub(r'[^a-z0-9]+', '-', str(s).lower())).strip('-')


def load(src):
    if src.startswith('http'):
        with urllib.request.urlopen(src) as r: d = json.load(r)
    else:
        d = json.load(open(src))
    return d.get('document', d)


def entities(doc):
    e = doc['entities']
    return list(e.values()) if isinstance(e, dict) else e


def lamps(doc):
    out = []
    for e in entities(doc):
        c = e.get('components', {})
        f, l = c.get('fixture'), c.get('light')
        if not f or not l: continue
        a = float(l.get('angle') or 0)
        cd = float(l.get('intensity') or 0)
        omega = 2 * math.pi * (1 - math.cos(a)) if a else 0  # three.js angle = half the cone
        b = c.get('beam') or {}
        pos = str(f.get('position', '')).strip()
        key = re.sub(r'\s+', '-', pos) if re.match(r'^(halo|named) ', pos) else kebab(pos)
        out.append(dict(id=e['id'], key=key + '/' + f.get('type', ''), type=f.get('type', ''),
                        cd=cd, lm=cd * omega, haze=b.get('haze') if isinstance(b.get('haze'), (int, float)) else HAZE_DEFAULT,
                        laser=f.get('type', '').startswith(LASER)))
    return out


def looks(doc):
    for e in entities(doc):
        rl = e.get('components', {}).get('rigLooks')
        if rl: return {l['id']: l for l in rl.get('looks', [])}
    return {}


def energy(look, ls):
    lv = look.get('levels') or {}
    rows = []
    for x in ls:
        v = lv.get(x['key'])
        L = min(1, max(0, float(v))) if isinstance(v, (int, float)) else 1.0
        rows.append((x, L))
    cone = [(x, L) for x, L in rows if not x['laser']]
    return dict(lamps=len(rows), on=sum(L > 0 for _, L in rows), full=sum(L >= 0.8 for _, L in rows),
                floor40=sum(L >= 0.4 for _, L in cone), mean=sum(L for _, L in rows) / max(1, len(rows)),
                lm=sum(x['lm'] * L for x, L in cone), air=sum(x['lm'] * L * x['haze'] * L for x, L in cone),
                named=sum(1 for x, _ in rows if x['key'] in lv))


def main():
    a = argparse.ArgumentParser()
    a.add_argument('--doc', required=True); a.add_argument('--cue', nargs='*'); a.add_argument('--json')
    a = a.parse_args()
    doc = load(a.doc); ls = lamps(doc); lk = looks(doc)
    cues = [c for c in doc.get('mappingState', {}).get('cues', []) if c.get('lightLook')]
    res = []
    for c in cues:
        lid = c['lightLook'][4:] if c['lightLook'].startswith('rig-') else c['lightLook']
        if a.cue and lid not in a.cue: continue
        if lid not in lk: res.append(dict(cue=c['name'], look=lid, missing=True)); continue
        res.append(dict(cue=c['name'], look=lid, **energy(lk[lid], ls)))
    print(f'{len(ls)} lamps ({sum(x["laser"] for x in ls)} lasers), {len(lk)} looks, {len(res)} cues')
    print(f'{"look":28} {"on":>3} {"≥.8":>4} {"≥.4":>4} {"mean":>5} {"Σlm·L":>9} {"air":>8} named')
    for r in res:
        if r.get('missing'): print(f'{r["look"]:28} MISSING'); continue
        print(f'{r["look"][:28]:28} {r["on"]:3} {r["full"]:4} {r["floor40"]:4} {r["mean"]:5.2f} {r["lm"]:9.0f} {r["air"]:8.0f} {r["named"]}')
    if a.json: json.dump(res, open(a.json, 'w'), indent=1)


if __name__ == '__main__':
    sys.exit(main())
