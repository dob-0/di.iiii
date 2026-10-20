"""light_env_analyze — measure the screenshots of a light-environment run: mean / median / p99 luminance, lit and bright pixel shares,
the floor strip's mean, the share of red pixels, beside the run's fps and temperature. Venue-to-show skill: step 8 (env picker, measured
not felt). Moved from the MOXIR light-environment audit (analyze.py, 2026-10-15, ledger N811.8).
  python3 -I scripts/place/light_env_analyze.py SHOTS_DIR OUT.json     # SHOTS_DIR holds shots.json {shots:[{name,file,fps:{mean,p95Ms},tempBefore}]} + the images
(shots.json comes from scripts/measure/light-env-shots.cjs). Needs Pillow."""
import json,sys,os
if len(sys.argv) != 3 or sys.argv[1] in ('-h', '--help'):
  print(__doc__); sys.exit(0 if len(sys.argv) == 2 else 2)
from PIL import Image
O=sys.argv[1]
res=json.load(open(f'{O}/shots.json'))
out=[]
for s in res['shots']:
  if not s.get('file'): out.append({'name':s['name'],'error':s.get('error')}); continue
  im=Image.open(f"{O}/{s['file']}").convert('RGB'); W,H=im.size
  px=list(im.getdata()); n=len(px)
  L=[(0.2126*r+0.7152*g+0.0722*b)/255 for r,g,b in px]
  Ls=sorted(L)
  floor=[L[y*W+x] for y in range(int(H*0.8),H) for x in range(0,W,2)]
  red=sum(1 for (r,g,b) in px if r>60 and r>1.6*max(g,b))/n
  out.append(dict(name=s['name'],fps=s['fps']['mean'],p95ms=s['fps']['p95Ms'],tempC=s['tempBefore'],meanL=round(sum(L)/n,4),p50=round(Ls[n//2],4),p99=round(Ls[int(n*.99)],3),
    lit=round(sum(1 for v in L if v>0.1)/n,4),bright=round(sum(1 for v in L if v>0.5)/n,5),floorMean=round(sum(floor)/len(floor),4),redShare=round(red,4)))
json.dump(out,open(sys.argv[2],'w'),indent=1)
for o in out: print(o)
