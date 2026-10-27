import bpy, sys, json, math, mathutils, numpy as np
out=sys.argv[sys.argv.index('--')+1]
vj=json.load(open(out+'/visual.json')); c=vj['corners_m_blender_frame']; L=json.load(open(out+'/lines.json'))
C={k:np.array(c[k2]) for k,k2 in (('C1','C1'),('C2','C2'),('C3','C3_wall_mid_door_end'),('C4','C4'))}
tm=np.array(L['main_fac']['t']); n_in=np.array([-tm[1],tm[0]])
sc=bpy.context.scene; sc.render.engine='BLENDER_WORKBENCH'; sc.display.shading.light='STUDIO'; sc.display.shading.color_type='TEXTURE'
sc.display.shading.show_backface_culling=False; sc.display.shading.show_cavity=False
sc.world=sc.world or bpy.data.worlds.new('w'); sc.world.color=(0.75,0.78,0.82)
sc.render.resolution_x=1400; sc.render.resolution_y=900
cam=bpy.data.objects.new('cam',bpy.data.cameras.new('cam')); sc.collection.objects.link(cam); sc.camera=cam; cam.data.clip_end=500
def shoot(tag,eye,tgt,lens=24,ortho=None):
    if ortho: cam.data.type='ORTHO'; cam.data.ortho_scale=ortho
    else: cam.data.type='PERSP'; cam.data.lens=lens
    cam.location=eye; cam.rotation_euler=(mathutils.Vector(tgt)-mathutils.Vector(eye)).to_track_quat('-Z','Y').to_euler()
    sc.render.filepath=f'{out}/../visual-{tag}.png'; bpy.ops.render.render(write_still=True)
def v3(p,z): return (float(p[0]),float(p[1]),z)
for tag,k,o in (('corner-C1-dino-low-main',  'C1',-n_in-tm),('corner-C2-dino-high-wallmid','C2',n_in-tm),
                ('corner-C3-wallmid-door-mainend','C3',n_in+tm),('corner-C4-main-mainend','C4',-n_in+tm)):
    o=o/np.linalg.norm(o); shoot(tag,v3(C[k]+o*7.5,1.9),v3(C[k],1.7),lens=22)
mid=(C['C1']+C['C4'])/2; shoot('side-main-facade',v3(mid-n_in*15,2.2),v3(mid,1.5),lens=20)
mid=(C['C2']+C['C3'])/2; shoot('side-wallmid-facade',v3(mid+n_in*15,2.2),v3(mid,1.5),lens=20)
mid=(C['C1']+C['C2'])/2; shoot('end-dino-wall',v3(mid-tm*11,1.9),v3(mid,1.6),lens=22)
cen=(C['C1']+C['C2']+C['C3']+C['C4'])/4; sc.render.resolution_x=1400; sc.render.resolution_y=1400
cam.data.type='ORTHO'; cam.data.ortho_scale=30; cam.location=(cen[0],cen[1],60); cam.rotation_euler=(0,0,math.atan2(tm[1],tm[0]))
sc.render.filepath=f'{out}/../visual-top.png'; bpy.ops.render.render(write_still=True)
# corner metrics: eave (98th pct z) and foot (2nd pct) in 0.3 m strips each side of each corner, per piece
SC={}
for o in bpy.data.objects:
    if o.type=='MESH' and not o.name.startswith('footprint'):
        M=np.array(o.matrix_world); V=np.array([v.co for v in o.data.vertices])@M[:3,:3].T+M[:3,3]; SC[o.name]=V
def strip(name,corner,along,depth_dir):
    V=SC[name]; s=(V[:,:2]-corner)@along; d=(V[:,:2]-corner)@depth_dir; m=(s>0.05)&(s<0.35)&(np.abs(d)<0.35)
    return dict(n=int(m.sum()),eave=round(float(np.percentile(V[m,2],98)),3),foot=round(float(np.percentile(V[m,2],2)),3)) if m.sum()>20 else None
met={'C1':dict(wall=strip('wall',C['C1'],n_in,tm),main=strip('main',C['C1'],tm,n_in)),
     'C2':dict(wall=strip('wall',C['C2'],-n_in,tm),wall_mid=strip('wall_mid',C['C2'],tm,n_in)),
     'C3':dict(wall_mid=strip('wall_mid',C['C3'],-tm,n_in),main=strip('main',np.array(c['main_end_upper']['high_end']),-n_in,tm))}
print('JSON'+json.dumps(met))
