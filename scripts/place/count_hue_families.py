#!/usr/bin/env python3
"""Count distinct hue families in a suite review json (looks[].steps[].values[fixture] with r1..r7/g/b/w cells).
Family = hue name by 30-degree sector (red 345-15, orange 15-45, yellow 45-75, lime/green 75-165, cyan 165-210, blue 210-255,
violet 255-285, magenta/pink 285-345) plus 'white' when saturation<0.25 and w or equal rgb. Cells under 8% of 255 are ignored."""
import json, sys, colorsys, collections
d = json.load(open(sys.argv[1]))
NAMES = [(345,15,'red'),(15,45,'orange'),(45,75,'yellow'),(75,165,'green'),(165,210,'cyan'),(210,255,'blue'),(255,285,'violet'),(285,345,'pink')]
def fam(r,g,b,w):
    mx=max(r,g,b)
    if mx<20 and w<20: return None
    h,s,v=colorsys.rgb_to_hsv(r/255,g/255,b/255)
    if mx<20 or s<0.25: return 'white'
    deg=h*360
    for a,z,n in NAMES:
        if (a<=deg<z) or (a>z and (deg>=a or deg<z)): return n
fams=collections.Counter(); per={}
for L in d['looks']:
    s=set()
    for st in L['steps']:
        for fx,v in st['values'].items():
            for n in range(1,8):
                f=fam(v.get(f'r{n}',0),v.get(f'g{n}',0),v.get(f'b{n}',0),v.get(f'w{n}',0))
                if f: s.add(f)
    per[L['id']]=sorted(s); fams.update(s)
print('looks',len(per)); print('distinct hue families:',len(fams),dict(fams))
for k,v in per.items(): print(' ',k,v)
