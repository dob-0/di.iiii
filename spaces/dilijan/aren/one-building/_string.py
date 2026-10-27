# Trace the black string line near corner C2 on both pieces: darkest row per column in a z window; robust line fit; value at the edge.
import json, numpy as np
from PIL import Image
M=json.load(open('o-meta.json'))
def trace(k,s_a,s_b,z_lo,z_hi,edge):
    v=M[k]; im=np.asarray(Image.open(f'o_{k}.png').convert('L')).astype(float); P=v['ppm']; H,W=im.shape
    pts=[]
    for s in np.arange(s_a,s_b,1/P):
        x=int((W-(s-v['s0'])*P) if v['flip'] else (s-v['s0'])*P)
        y0=int(H-(z_hi-v['z0'])*P); y1=int(H-(z_lo-v['z0'])*P); col=im[y0:y1,x]
        j=np.argmin(col); 
        if col[j]<0.6*np.median(col): pts.append((s,(H-(y0+j))/P+v['z0']))
    p=np.array(pts); A=np.c_[p[:,0],np.ones(len(p))]
    for _ in range(4):
        c,*_=np.linalg.lstsq(A,p[:,1],rcond=None); r=np.abs(A@c-p[:,1]); k2=r<max(0.02,2*np.median(r)); A,p=A[k2],p[k2]
    return dict(n=len(p),slope_deg=round(float(np.degrees(np.arctan(c[0]))),2),z_edge=round(float(c[0]*edge+c[1]),3),rms_cm=round(float(np.sqrt(np.mean((A@c-p[:,1])**2))*100),2))
print('wall_mid (s from edge -6.82 inward)',trace('wall_mid_fac',-6.75,-5.9,1.25,1.65,-6.82))
print('dino (s from edge -4.21 inward)',trace('wall_fac',-3.9,-2.6,1.3,1.7,-4.21))
