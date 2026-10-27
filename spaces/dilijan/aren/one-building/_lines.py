import numpy as np, json
D=np.load('verts.npz'); m=json.load(open('fac-meta.json'))
def fitline(P):
    c=P.mean(0); u,s,vt=np.linalg.svd(P-c); t=vt[0]; n=np.array([-t[1],t[0]])
    for _ in range(3):
        r=(P-c)@n; k=np.abs(r)<max(0.08,2.5*np.median(np.abs(r))); c=P[k].mean(0); u,s,vt=np.linalg.svd(P[k]-c); t=vt[0]; n=np.array([-t[1],t[0]])
    r=(P-c)@n; return c,t,n,np.abs(r)
def band(n,lo=0.9,hi=2.0):
    V=D[n]; f=np.percentile(V[:,2],3); s=(V[:,2]>f+lo)&(V[:,2]<f+hi); return V[s]
out={}
for n,sel in (('main_fac',lambda P:(P[:,1]<-3.4)&(P[:,1]>-5.2)&(P[:,0]<1.5)),('main_end',lambda P:(P[:,0]>0.0)&(P[:,0]<2.2)&(P[:,1]>-4.0)&(P[:,1]<5.5)),
              ('wall_mid_fac',lambda P:np.abs(P[:,1]-(-7.2+(P[:,0]-8)*(-0.055)))<0.7),('wall_fac',None)):
    pc=n.rsplit('_',1)[0]; P=band(pc)[:,:2]
    if sel is None:
        d=np.array(m['wall_0_p']['d'][:2]); P=P[np.abs(P@d-m['wall_0_p']['offset'])<0.5]
    else: P=P[sel(P)]
    c,t,nn,r=fitline(P); k=r<0.12; s=(P[k]-c)@t
    h,e=np.histogram(s,bins=np.arange(s.min()-0.2,s.max()+0.2,0.1)); occ=e[:-1][h>3]
    out[n]=dict(c=c.round(3).tolist(),t=t.round(4).tolist(),ang=round(float(np.degrees(np.arctan2(t[1],t[0]))),2),s_ext=[round(float(np.percentile(s,0.5)),2),round(float(np.percentile(s,99.5)),2)],
      inl=int(k.sum()),rms_cm=round(float(np.sqrt(np.mean(r[k]**2))*100),1),gaps=[ [round(float(a),1)] for a,b in zip(occ[:-1],occ[1:]) if b-a>0.35])
    print(n,out[n])
json.dump(out,open('lines.json','w'))
