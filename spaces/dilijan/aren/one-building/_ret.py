import bpy, sys, mathutils, numpy as np
out=sys.argv[sys.argv.index('--')+1]
SC=dict(main=2.443,wall=2.443*0.99,wall_mid=4.09)
sc=bpy.context.scene; sc.render.engine='BLENDER_WORKBENCH'; sc.display.shading.light='FLAT'; sc.display.shading.color_type='TEXTURE'; sc.display.shading.show_backface_culling=False
for o in bpy.data.objects:
    if o.name.startswith('footprint'): o.hide_render=True
ms=[o for o in bpy.data.objects if o.name in SC]
for o in ms: o.matrix_world=mathutils.Matrix.Scale(SC[o.name],4)@mathutils.Matrix(o['before'])
cam=bpy.data.objects.new('cam',bpy.data.cameras.new('cam')); sc.collection.objects.link(cam); sc.camera=cam; cam.data.type='PERSP'; cam.data.lens=20; cam.data.clip_end=500
sc.render.resolution_x=1200; sc.render.resolution_y=800
for tag,pc,eye,tgt in (('ret_wall_low','wall',(9.0-0.616*6+0.79*2,-4.1-0.788*6-0.61*2,1.7),(9.3,-4.4,1.6)),
                       ('ret_main_left','main',(-14.5,-7.0,1.7),(-11.5,-4.2,1.5)),
                       ('ret_mid_right','wall_mid',(-1.5,-3.0,2.0),(1.0,-6.7,1.8)),
                       ('ret_wall_high','wall',(14.3-0.79*3+0.616*4,2.8+0.61*3+0.788*4,2.0),(14.0,2.6,1.8))):
    for p in ms: p.hide_render=(p.name!=pc)
    cam.location=eye; cam.rotation_euler=(mathutils.Vector(tgt)-mathutils.Vector(eye)).to_track_quat('-Z','Y').to_euler()
    sc.render.filepath=f'{out}/{tag}.png'; bpy.ops.render.render(write_still=True)
