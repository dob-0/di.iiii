#!/usr/bin/env python3
"""Export the lights and rig of one MOXIR project document to src/scene.json for the overview page.

  python3 export-scene.py <path to the project's document.json> [out.json]

Reads the document only. A lamp's aim is its rotation applied to local -Y (serverXR spotLightAim.js).
'held back' in a lamp's name = in the model but not hung for the show (MOXIR.md: elite and minimal).
"""
import json, math, re, sys, collections

def aim(r):
    x, y, z = r; v = [0, -1, 0]
    cz, sz = math.cos(z), math.sin(z); v = [v[0]*cz - v[1]*sz, v[0]*sz + v[1]*cz, v[2]]
    cy, sy = math.cos(y), math.sin(y); v = [v[0]*cy + v[2]*sy, v[1], -v[0]*sy + v[2]*cy]
    cx, sx = math.cos(x), math.sin(x); v = [v[0], v[1]*cx - v[2]*sx, v[1]*sx + v[2]*cx]
    return [round(a, 4) for a in v]

KINDS = [('PL5403', 'par'), ('B380F', 'beam'), ('250BSW', 'wash'), ('HK1915', 'bee'), ('BLINDER', 'blinder'), ('STROBE', 'strobe'), ('LaserCube', 'laser')]
def kind_of(name):
    for key, kind in KINDS:
        if key in name: return kind
    return 'other'

def box_kind(name):
    n = name.lower()
    for key, kind in (('truss line', 'truss'), ('dj riser', 'step'), ('dj table', 'table'), ('crowd barrier', 'barrier'), ('ash wall', 'ashwall'),
                      ('tower for laser', 'tower'), ('pa v1', 'pa'), ('bridle', 'rigging'), ('beam clamp', 'rigging'), ('chain hoist', 'rigging'),
                      ('hoist chain', 'rigging'), ('safety steel', 'rigging'), ('tie-off', 'rigging')):
        if key in n: return kind
    return None

doc = json.load(open(sys.argv[1]))
ents = doc['entities']; ents = list(ents.values()) if isinstance(ents, dict) else ents
lights, boxes, smoke = [], [], []
for e in ents:
    c = e.get('components', {}); t = c.get('transform', {})
    if e['type'] == 'spotLight':
        lg = c.get('light', {})
        lights.append(dict(id=e['id'], kind=kind_of(e['name']), held='held back' in e['name'], p=[round(a, 3) for a in t['position']], d=aim(t.get('rotation', [0, 0, 0])),
                           color=c.get('appearance', {}).get('color', '#ffffff'), dist=lg.get('distance', 20), ang=lg.get('angle', .13)))
    elif e['type'] in ('model', 'box') and 'the hall' not in e['name']:
        k = box_kind(e['name'])
        if not k: continue
        s = t.get('scale', [1, 1, 1]); r = t.get('rotation', [0, 0, 0]); p = t['position']
        if k == 'truss': dims = [3, .3, .3]
        elif k == 'step': dims = [1, .4, 2]; p = [p[0], p[1] + .2, p[2]]
        else: dims = s; p = [p[0], p[1] + s[1] / 2, p[2]] if k in ('barrier', 'pa', 'tower', 'table') else p
        boxes.append(dict(kind=k, p=[round(a, 3) for a in p], r=[round(a, 4) for a in r], s=[round(a, 3) for a in dims]))
    elif e['type'] == 'group' and 'smoke' in e['name'].lower():
        smoke.append([round(a, 2) for a in t['position']])
out = dict(source=sys.argv[1].split('/')[-2], title=doc.get('projectMeta', {}).get('title'), lights=lights, boxes=boxes, smoke=smoke)
json.dump(out, open(sys.argv[2] if len(sys.argv) > 2 else 'src/scene.json', 'w'), separators=(',', ':'))
cnt = collections.Counter((l['kind'], 'held back' if l['held'] else 'used') for l in lights)
print(out['source'], '|', len(lights), 'lamps', '|', len(boxes), 'objects', '|', len(smoke), 'smoke machines'); [print(' ', k, v) for k, v in sorted(cnt.items())]
