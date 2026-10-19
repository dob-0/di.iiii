"""light_env_table — one table of the light environment of many project documents: exposure, tone mapping, bloom, floor surface,
haze/atmosphere, fog, look count, per-fixture-kind lamp medians. Generic: documents are arguments, no production name.
Venue-to-show skill: step 8 (the environment picker's data — what each scene's air, exposure and bloom actually are).
Moved from the MOXIR light-environment audit (table.py, 2026-10-15, ledger N811.8).

  python3 -I scripts/place/light_env_table.py OUT.json DOC.json [DOC.json ...]   # DOC = a project document, or {"document": {...}}
  python3 -I scripts/place/light_env_table.py --help
Prints one line per document; OUT.json gets the full rows (list). Document names in the table are the file names without .json."""
import json,math,collections,sys,os,statistics as st
if len(sys.argv) < 3 or sys.argv[1] in ('-h', '--help'):
  print(__doc__); sys.exit(0 if len(sys.argv) == 2 and sys.argv[1] in ('-h', '--help') else 2)
OUT, FILES = sys.argv[1], sys.argv[2:]
rows=[]
for path in FILES:
  name=os.path.basename(path)[:-5] if path.endswith('.json') else os.path.basename(path)
  d=json.load(open(path)); d=d.get('document',d)
  E=d['entities']; E=list(E.values()) if isinstance(E,dict) else E
  rs=d.get('renderSettings') or {}; at=rs.get('atmosphere') or {}; hz=at.get('haze') or {}
  ws=d.get('worldState') or {}; fog=ws.get('fog') or {}
  ps=d.get('presentationState') or {}; fc=ps.get('fixedCamera') or {}
  lamps=[e for e in E if e.get('type')=='spotLight']
  kinds=collections.defaultdict(list)
  compkeys=collections.Counter()
  for e in lamps:
    c=e['components']; compkeys.update(c.keys())
    k=(c.get('fixture') or {}).get('type') or 'none'
    kinds[k].append(c)
  kd={}
  for k,cs in kinds.items():
    I=[c.get('light',{}).get('intensity',0) for c in cs]; A=[math.degrees(c.get('light',{}).get('angle',0))*2 for c in cs]
    BL=[c.get('beam',{}).get('length') for c in cs]; BH=[c.get('beam',{}).get('haze') for c in cs]
    bl=[x for x in BL if x is not None]
    kd[k]=dict(n=len(cs),I=round(st.median(I),1),cone=round(st.median(A),1),haze=sorted(set(x for x in BH if x is not None))[:3],
       len=('none' if not bl else f'{len(bl)}/{len(cs)} {min(bl):.1f}-{max(bl):.1f}'))
  show=[e for e in E if (e['components'].get('rigLooks') or {}).get('looks')]
  rl=show[0]['components']['rigLooks'] if show else {}
  looks=rl.get('looks',[])
  extra=sorted(set(k for l in looks for k in l.keys())-{'id','title','intent','aims','colours','levels'})
  nonlamp=collections.Counter(e['type'] for e in E if e['type']!='spotLight')
  machines=[e.get('name') for e in E if any(w in json.dumps(e.get('components',{}).get('fixture',{})).lower()+str(e.get('name')).lower() for w in ('smoke','hazer','haze','fog'))]
  rows.append(dict(v=name,
    exp=rs.get('toneMappingExposure'),tm=rs.get('toneMapping'),autoexp=(rs.get('exposure') or {}).get('auto'),bloom=(rs.get('bloom') or {}).get('enabled') if isinstance(rs.get('bloom'),dict) else rs.get('bloom'),
    shadows=rs.get('shadows'),floor=(rs.get('surfaces') or {}).get('floor'),quality=rs.get('quality'),photo=rs.get('photometry'),
    scat=at.get('scattering'),aniso=at.get('anisotropy'),hmodel=hz.get('model'),hcal=hz.get('calibrate'),hkind=hz.get('kindLevels'),hmin=hz.get('minutes'),hdries=hz.get('dries'),hvol=hz.get('volume_m3'),
    fog=f"{fog.get('near')}-{fog.get('far')} {'on' if fog.get('enabled') else 'off'}",bg=ws.get('backgroundColor'),env=ws.get('environmentAssetId'),
    pool=(d.get('mappingState') or {}).get('lightPool'),entry=ps.get('entryView'),fc=[fc.get('position'),fc.get('target'),fc.get('fov')],
    kinds=kd,compkeys=dict(compkeys),nlooks=len(looks),deflook=rl.get('defaultLook'),lookkeys=extra,
    redlooks=[l['id'] for l in looks if 'red' in (l['id']+l.get('title','')).lower()],machines=machines[:4],nonlamp=dict(nonlamp)))
json.dump(rows,open(OUT,'w'),indent=1)
for r in rows:
  print(r['v'],'| exp',r['exp'],r['tm'],'auto',r['autoexp'],'bloom',r['bloom'],'sh',r['shadows'],'| scat',r['scat'],r['aniso'],r['hmodel'],'cal',r['hcal'],r['hkind'],'| fog',r['fog'],'| pool',r['pool'],'| entry',r['entry'],r['fc'][2],'| looks',r['nlooks'],r['deflook'],r['lookkeys'],r['redlooks'][:3])
