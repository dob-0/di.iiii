# Colour runs (yellow / red / black paint) in a strip at each piece's seam edge, by height z (m above the piece's z=0).
import numpy as np, json, sys
from PIL import Image
M=json.load(open('o-meta.json'))
def strip(k,s_edge,inward,w=0.25):
    v=M[k]; im=np.asarray(Image.open(f'o_{k}.png').convert('RGB')).astype(int); P=v['ppm']; H=im.shape[0]; W=im.shape[1]
    def x_of(s): x=(s-v['s0'])*P; return W-x if v['flip'] else x
    xa,xb=sorted([x_of(s_edge),x_of(s_edge+inward*w)]); S=im[:,int(xa):int(xb)]
    R,G,B=S[...,0],S[...,1],S[...,2]
    cls={'yellow':(R>130)&(G>120)&(B<110)&(R-B>60),'red':(R>130)&(G<90)&(B<100),'black':(R+G+B<75)&(np.abs(R-B)<20)}
    z=(H-np.arange(H))/P+v['z0']
    out={}
    for c,mk in cls.items():
        f=mk.mean(1); rows=np.where(f>0.12)[0]; runs=[]
        if len(rows):
            br=np.split(rows,np.where(np.diff(rows)>3)[0]+1)
            runs=[[round(float(z[r[-1]]),3),round(float(z[r[0]]),3)] for r in br if len(r)>=2]
        out[c]=runs
    return out
