import bpy, sys, numpy as np, mathutils
out=sys.argv[sys.argv.index('--')+1]
SC=dict(main=2.443,wall=2.443*0.99,wall_mid=4.09); D={}
for o in bpy.data.objects:
    if o.name in SC:
        M=mathutils.Matrix.Scale(SC[o.name],4)@mathutils.Matrix(o['before'])
        V=np.array([v.co for v in o.data.vertices]); R=np.array(M); D[o.name]=V@R[:3,:3].T+R[:3,3]
        D[o.name+'_before']=np.array(o['before'])
np.savez(out+'/verts.npz',**D)
