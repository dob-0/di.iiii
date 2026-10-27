# Each piece alone, 'before' pose (as exported, scan frame): top + 4 side ortho views, plus bounds in that frame.
import bpy, sys, json, mathutils, numpy as np
out=sys.argv[sys.argv.index('--')+1]
sc=bpy.context.scene; sc.render.engine='BLENDER_WORKBENCH'; sc.display.shading.light='FLAT'; sc.display.shading.color_type='TEXTURE'
sc.display.shading.show_backface_culling=False
ms=[o for o in bpy.data.objects if o.type=='MESH' and not o.name.startswith('footprint')]
for o in bpy.data.objects:
    if o.name.startswith('footprint'): o.hide_render=True
for o in ms: o.matrix_world=mathutils.Matrix(o['before'])
bpy.context.view_layer.update()
cam=bpy.data.objects.new('cam',bpy.data.cameras.new('cam')); sc.collection.objects.link(cam); sc.camera=cam; cam.data.type='ORTHO'; cam.data.clip_end=500
info={}
for o in ms:
    V=np.array([o.matrix_world@v.co for v in o.data.vertices]); lo=np.percentile(V,1,0); hi=np.percentile(V,99,0); c=(lo+hi)/2
    info[o.name]=dict(lo=lo.round(2).tolist(),hi=hi.round(2).tolist())
    for p in ms: p.hide_render=(p is not o)
    S=max(hi-lo)+0.3
    for tag,d in (('top',(0,0,1)),('px',(1,0,0)),('nx',(-1,0,0)),('py',(0,1,0)),('ny',(0,-1,0))):
        d=mathutils.Vector(d); cam.location=mathutils.Vector(c)+d*50
        cam.rotation_euler=(-d).to_track_quat('-Z','Y' if tag!='top' else 'Y').to_euler()
        cam.data.ortho_scale=S; sc.render.resolution_x=800; sc.render.resolution_y=800 if tag=='top' else 400
        sc.render.filepath=f'{out}/{o.name}_{tag}.png'; bpy.ops.render.render(write_still=True)
print('JSON'+json.dumps(info))
