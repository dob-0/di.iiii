# Solo facade elevations in metres (piece scale applied to the exported pose), 100 px/m, plus eave/foot profiles.
import bpy, sys, json, math, mathutils, numpy as np
out=sys.argv[sys.argv.index('--')+1]; PPM=100
SC=dict(main=2.443,wall=2.443*0.99,wall_mid=4.09)
sc=bpy.context.scene; sc.render.engine='BLENDER_WORKBENCH'; sc.display.shading.light='FLAT'; sc.display.shading.color_type='TEXTURE'
sc.display.shading.show_backface_culling=False
for o in bpy.data.objects:
    if o.name.startswith('footprint'): o.hide_render=True
ms=[o for o in bpy.data.objects if o.name in SC]
for o in ms: o.matrix_world=mathutils.Matrix.Scale(SC[o.name],4)@mathutils.Matrix(o['before'])
bpy.context.view_layer.update()
cam=bpy.data.objects.new('cam',bpy.data.cameras.new('cam')); sc.collection.objects.link(cam); sc.camera=cam; cam.data.type='ORTHO'; cam.data.clip_end=500
meta={}
for o in ms:
    for p in ms: p.hide_render=(p is not o)
    M=o.matrix_world; me=o.data; n=len(me.polygons)
    nr=np.zeros(n*3); me.polygons.foreach_get('normal',nr); nr=nr.reshape(-1,3)
    ar=np.zeros(n); me.polygons.foreach_get('area',ar)
    ce=np.zeros(n*3); me.polygons.foreach_get('center',ce); ce=ce.reshape(-1,3)
    R3=np.array(M.to_3x3()); s=SC[o.name]; nw=nr@(R3/s).T; cw=ce@R3.T+np.array(M.translation); aw=ar*s*s
    V=np.array([v.co for v in me.vertices])@R3.T+np.array(M.translation)
    hz=np.abs(nw[:,2])<0.3; az=np.degrees(np.arctan2(nw[:,1],nw[:,0]))%180
    h,_=np.histogram(az[hz],bins=36,range=(0,180),weights=aw[hz]); used=[]
    for b in np.argsort(h)[::-1]:
        if any(abs(((b-u)+18)%36-18)<4 for u in used): continue
        used.append(b)
        if len(used)>2: break
        sel=hz&(np.abs(((az-(b*5+2.5)+90)%180)-90)<10)
        a=math.radians(np.average(az[sel],weights=aw[sel]) if True else b*5+2.5); d=np.array([math.cos(a),math.sin(a),0])
        off=cw[sel]@d
        hh,ed=np.histogram(off,bins=200,weights=aw[sel]); o_med=(ed[np.argmax(hh)]+ed[np.argmax(hh)+1])/2
        right=np.array([-d[1],d[0],0.])
        near=np.abs(V@d-o_med)<0.25; Vn=V[near]; u=Vn@right; z=Vn[:,2]
        u0,u1=np.percentile(u,[0.5,99.5]); z0,z1=np.percentile(z,[0.5,99.5])
        prof=[]
        for k in np.arange(u0,u1,0.25):
            m=(u>=k)&(u<k+0.25)
            if m.sum()>20: prof.append([round(k+0.125,2),round(float(np.percentile(z[m],2)),2),round(float(np.percentile(z[m],99)),2)])
        W=(u1-u0)+0.6; H=max(z1,4.5)-min(z0,-0.3)+0.3; zc=(max(z1,4.5)+min(z0,-0.3))/2
        c=right*(u0+u1)/2+np.array([0,0,zc])+d*o_med
        for side in (1,-1):
            cam.location=mathutils.Vector(c+d*side*30); look=-d*side
            cam.rotation_euler=mathutils.Vector(look).to_track_quat('-Z','Y').to_euler()
            cam.data.ortho_scale=max(W,H); sc.render.resolution_x=int(W*PPM); sc.render.resolution_y=int(H*PPM)
            tag=f'{o.name}_{len(used)-1}_{"p" if side>0 else "n"}'
            sc.render.filepath=f'{out}/e_{tag}.png'; bpy.ops.render.render(write_still=True)
            cr=np.array(cam.matrix_world.to_3x3())[:,0]
            meta[tag]=dict(az=round(math.degrees(a),2),d=d.round(4).tolist(),offset=round(float(o_med),3),centre=c.round(3).tolist(),cam_right=cr.round(4).tolist(),W=W,H=H,zc=zc,u_range=[round(u0,2),round(u1,2)],area=round(float(aw[sel].sum()),1),prof=prof)
json.dump(meta,open(f'{out}/fac-meta.json','w'))
for k,v in meta.items(): print('JSON',k,v['az'],v['offset'],v['u_range'],v['area'],'eave',[p[2] for p in v['prof']][::2],'foot',[p[1] for p in v['prof']][::4])
