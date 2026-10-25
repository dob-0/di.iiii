# N1243: assemble Aren's three pieces as ONE building from what the photographed surfaces show (no map).
# Method: facade lines from the wall points; corner ends read on outside elevations (panel edge, eave cap, drainpipe);
# rigid pose per piece (turn about vertical + shift) so that the corners meet: dino wall high end = wall_mid windows end
# (the black string line and the yellow dino strokes continue there), dino wall low end = main facade far end,
# both long facades parallel, dino wall square to main facade; feet on main's foot line. Scales kept (main 2.443, wall 0.99x, wall_mid 4.09 m/unit).
import bpy, sys, json, math, mathutils, numpy as np
out=sys.argv[sys.argv.index('--')+1]; A=sys.argv[sys.argv.index('--')+2:]
DZ_MID=float(A[0]) if A else 0.0
SC=dict(main=2.443,wall=2.443*0.99,wall_mid=4.09); MU=2.443
L=json.load(open(out+'/lines.json')); E=dict(main_fac=(-7.62,5.21),wall_fac=(-4.21,4.33),wall_mid_fac=(-6.82,7.10))
def P(k,s): return np.array(L[k]['c'])+np.array(L[k]['t'])*s
def ang(v): return math.atan2(v[1],v[0])
def rot(a): c,s=math.cos(a),math.sin(a); return np.array([[c,-s],[s,c]])
tm=np.array(L['main_fac']['t']); n_in=np.array([-tm[1],tm[0]])                 # main facade direction, inward normal (+y)
C1=P('main_fac',E['main_fac'][0]); C4=P('main_fac',E['main_fac'][1])
# dino wall: low end (s=4.33) -> C1, direction low->high along n_in
wl=P('wall_fac',4.33); wh=P('wall_fac',-4.21); th_w=ang(n_in)-ang(wh-wl); Rw=rot(th_w); tw=C1-Rw@wl
C2=Rw@wh+tw
# wall_mid: windows end (s=-6.82) -> C2, direction windows->door along main facade
mw=P('wall_mid_fac',-6.82); md=P('wall_mid_fac',7.10); th_m=ang(tm)-ang(md-mw); Rm=rot(th_m); tmid=C2-Rm@mw; C3=Rm@md+tmid
D={}
for o in bpy.data.objects:
    if o.name.startswith('footprint'): o.hide_set(True); o.hide_render=True
ob={o.name:o for o in bpy.data.objects if o.name in SC}
V={k:(np.array([v.co for v in o.data.vertices])@np.array((mathutils.Matrix.Scale(SC[k],4)@mathutils.Matrix(o['before'])).to_3x3()).T
      +np.array((mathutils.Matrix.Scale(SC[k],4)@mathutils.Matrix(o['before'])).translation)) for k,o in ob.items()}
def foot(k,line,s0,s1):
    Q=V[k]; c=np.array(L[line]['c']); t=np.array(L[line]['t']); n=np.array([-t[1],t[0]]); s=(Q[:,:2]-c)@t; d=(Q[:,:2]-c)@n
    m=(np.abs(d)<0.3)&(s>s0)&(s<s1); return float(np.percentile(Q[m,2],2))
fz={'main':foot('main','main_fac',-7,5),'wall':foot('wall','wall_fac',-4,4.2),'wall_mid':foot('wall_mid','wall_mid_fac',-6.6,6.9)}
F={}
for k,(R2,t2) in dict(main=(np.eye(2),np.zeros(2)),wall=(Rw,tw),wall_mid=(Rm,tmid)).items():
    M=np.eye(4); M[:2,:2]=R2; M[:2,3]=t2; M[2,3]=-fz[k]+(DZ_MID if k=='wall_mid' else 0); F[k]=M
# main end wall, upper part (above the cardboard fence): its real plane
Q=V['main']; up=(Q[:,2]>fz['main']+2.1)&(Q[:,2]<fz['main']+3.3)&(Q[:,0]>-1.0)&(Q[:,0]<2.2)&(Q[:,1]>-3.5)&(Q[:,1]<5.5)
q=Q[up,:2]; cq=q.mean(0); _,_,vt=np.linalg.svd(q-cq); te=vt[0]*np.sign(vt[0][1]); ne=np.array([-te[1],te[0]])
for _ in range(4):
    r=(q-cq)@ne; kk=np.abs(r)<0.12; cq=q[kk].mean(0); _,_,vt=np.linalg.svd(q[kk]-cq); te=vt[0]*np.sign(vt[0][1]); ne=np.array([-te[1],te[0]])
se=(q[kk]-cq)@te; endhi=cq+te*np.percentile(se,99.5)
res=dict(C1=C1.round(3).tolist(),C2=C2.round(3).tolist(),C3_wall_mid_door_end=C3.round(3).tolist(),C4=C4.round(3).tolist(),
  turn_wall_deg=round(math.degrees(th_w),2),turn_wall_mid_deg=round(math.degrees(th_m),2),feet=fz,
  main_end_upper=dict(c=cq.round(3).tolist(),t=te.round(4).tolist(),angle_to_facade_deg=round(math.degrees(ang(te)-ang(tm)),2),high_end=endhi.round(3).tolist(),inliers=int(kk.sum())),
  C3_off_end_plane_m=round(float((C3-cq)@ne),3),C3_to_end_high_m=round(float(np.linalg.norm(C3-endhi)),3),
  depth_dino_m=round(float(np.linalg.norm(C2-C1)),3),len_main_fac_m=round(float(np.linalg.norm(C4-C1)),3),len_wall_mid_m=round(float(np.linalg.norm(C3-C2)),3))
for k,o in ob.items(): o.matrix_world=mathutils.Matrix((F[k]@np.array(mathutils.Matrix.Scale(SC[k],4)@mathutils.Matrix(o['before']))).tolist())
# visual.json: yard scan frame (y up), same convention as fit.json: p_yard = s R p + t on the P to_blender.py writes
Cm=np.array([[1,0,0,0],[0,0,-1,0],[0,1,0,0],[0,0,0,1.]]); POSE0=json.load(open(out+'/../poses-before.json'))
vj={'about':'N1243: the three pieces as one building, fitted by what the photos show (corners, paint across the seams, eave and foot lines); no map. p_yard = s*R*p + t on the piece P that to_blender.py writes (main, wall_mid: yard parts; wall: the wall fragment, IN_YARD folded in). Same convention as fit.json (N1241).',
    'date':'2026-10-23','metres_per_unit':MU,'unit':'yard scan unit (main is identity)','pieces':{}}
for k,o in ob.items():
    B=np.array(mathutils.Matrix(o['before'])); NEW=np.diag([1/MU]*3+[1])@F[k]@np.diag([SC[k]]*3+[1])@B
    NEW[2,3]+=fz['main']/MU   # keep main's own height (main stays identity)
    G=np.linalg.inv(Cm)@NEW@np.linalg.inv(B)@Cm
    if k=='wall':
        P0=np.eye(4); P0[:3,:3]=np.array(POSE0['wall']['R']); P0[:3,3]=np.array(POSE0['wall']['t']); G=G@P0
    s=float(np.cbrt(np.linalg.det(G[:3,:3]))); R=G[:3,:3]/s; qq=mathutils.Matrix(R.tolist()).to_quaternion()
    vj['pieces'][k]=dict(s=round(s,5),R=np.round(R,6).tolist(),q_xyzw=[round(qq.x,6),round(qq.y,6),round(qq.z,6),round(qq.w,6)],t=np.round(G[:3,3],4).tolist())
    o['fit_N1243']=json.dumps(vj['pieces'][k])
vj['corners_m_blender_frame']=res
json.dump(vj,open(out+'/visual.json','w'),indent=1)
bpy.context.scene.unit_settings.system='METRIC'
bpy.ops.wm.save_as_mainfile(filepath=out+'/yard-fix-visual.blend',copy=True)
print('JSON'+json.dumps(res))
