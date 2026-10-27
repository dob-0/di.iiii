# Face-on outside elevations along the fitted lines; ticks in the line coordinate s (m). Solo pieces, metres, 'before' frame.
import bpy, sys, json, mathutils, numpy as np
out=sys.argv[sys.argv.index('--')+1]; PPM=120
SC=dict(main=2.443,wall=2.443*0.99,wall_mid=4.09); L=json.load(open(out+'/lines.json'))
OUTS={'main_fac':-1,'main_end':-1,'wall_mid_fac':1,'wall_fac':-1}
sc=bpy.context.scene; sc.render.engine='BLENDER_WORKBENCH'; sc.display.shading.light='FLAT'; sc.display.shading.color_type='TEXTURE'
sc.display.shading.show_backface_culling=False
for o in bpy.data.objects:
    if o.name.startswith('footprint'): o.hide_render=True
ms=[o for o in bpy.data.objects if o.name in SC]
for o in ms: o.matrix_world=mathutils.Matrix.Scale(SC[o.name],4)@mathutils.Matrix(o['before'])
cam=bpy.data.objects.new('cam',bpy.data.cameras.new('cam')); sc.collection.objects.link(cam); sc.camera=cam; cam.data.type='ORTHO'; cam.data.clip_end=500
meta={}
for k,sg in OUTS.items():
    pc=k.rsplit('_',1)[0]
    for p in ms: p.hide_render=(p.name!=pc)
    c=np.array(L[k]['c']+[0]); t=np.array(L[k]['t']+[0]); nrm=np.array([t[1],-t[0],0])*(-sg) if sg==1 else np.array([t[1],-t[0],0])
    s0,s1=L[k]['s_ext']; s0-=1.0; s1+=1.0; W=s1-s0; z0=-0.2; z1=5.0; H=z1-z0
    ctr=c+t*(s0+s1)/2+np.array([0,0,(z0+z1)/2])
    cam.location=mathutils.Vector(ctr+nrm*30); cam.rotation_euler=mathutils.Vector(-nrm).to_track_quat('-Z','Y').to_euler()
    cam.data.ortho_scale=max(W,H); sc.render.resolution_x=int(W*PPM); sc.render.resolution_y=int(H*PPM)
    bpy.context.view_layer.update(); r=np.array(cam.matrix_world.to_3x3())[:,0]
    sc.render.filepath=f'{out}/o_{k}.png'; bpy.ops.render.render(write_still=True)
    meta[k]=dict(nrm=nrm.round(4).tolist(),s0=s0,s1=s1,z0=z0,z1=z1,ppm=PPM,flip=bool(r@t<0))
json.dump(meta,open(out+'/o-meta.json','w'))
