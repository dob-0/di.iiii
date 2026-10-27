import bpy, sys, json, math, mathutils, numpy as np
out=sys.argv[sys.argv.index('--')+1]; vj=json.load(open(out+'/visual.json'))['corners_m_blender_frame']; L=json.load(open(out+'/lines.json'))
tm=np.array(L['main_fac']['t']); n_in=np.array([-tm[1],tm[0]])
sc=bpy.context.scene; sc.render.engine='BLENDER_WORKBENCH'; sc.display.shading.light='STUDIO'; sc.display.shading.color_type='TEXTURE'; sc.display.shading.show_backface_culling=False
sc.world=sc.world or bpy.data.worlds.new('w'); sc.world.color=(0.75,0.78,0.82); sc.render.resolution_x=1400; sc.render.resolution_y=900
cam=bpy.data.objects.new('cam',bpy.data.cameras.new('cam')); sc.collection.objects.link(cam); sc.camera=cam; cam.data.lens=26
def shoot(tag,eye,tgt):
    cam.location=eye; cam.rotation_euler=(mathutils.Vector(tgt)-mathutils.Vector(eye)).to_track_quat('-Z','Y').to_euler()
    sc.render.filepath=f'{out}/../visual-{tag}.png'; bpy.ops.render.render(write_still=True)
C4=np.array(vj['C4']); o=(-n_in*1.0+tm*0.35); o/=np.linalg.norm(o); e=C4+o*9
shoot('corner-C4-main-mainend',(e[0],e[1],3.2),(C4[0],C4[1],1.4))
C2=np.array(vj['C2']); o=(n_in-tm); o/=np.linalg.norm(o); e=C2+o*4.2
shoot('seam-C2-closeup',(e[0],e[1],1.6),(C2[0],C2[1],1.5))
