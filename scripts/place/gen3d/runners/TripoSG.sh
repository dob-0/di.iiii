#!/usr/bin/env bash
# TripoSG (VAST-AI-Research/TripoSG, MIT code + MIT weights) image-to-3D on OUR Colab Pro+ session.
# Reproducible runner: new session -> upload crops -> pinned install -> infer each -> download -> stop -> Blender turntables.
# Usage: TripoSG.sh [GPU=L4] [INPUT_DIR] [OUT_DIR]      Needs: colab-pinned.sh (CLI 0.7.5), blender, ffmpeg.
# NOTE background removal inside TripoSG uses briaai/RMBG-1.4 = NON-COMMERCIAL weights. Set BGREM=none to skip it
# (inputs must then already be cut out), or replace with a permissive matting model.
set -euo pipefail
GPU="${1:-L4}"
IN="${2:-/mnt/data/footage/place-cinema-house-2026-10-30/modelled/gen3d/inputs}"
OUT="${3:-/mnt/data/footage/place-cinema-house-2026-10-30/modelled/gen3d/out/TripoSG}"
COMMIT="${TRIPOSG_COMMIT:-fc5c40990181e2a756c4e0b1c2f4d6b5202faf8c}"
BGREM="${BGREM:-rmbg14}"
SESS="triposg-$$"
HERE="$(cd "$(dirname "$0")" && pwd)"
COLAB="$HERE/../../colab-pinned.sh"
export HOME="${COLAB_HOME:-$HOME/.local/state/colab/gevorg}"   # gevorg login state; real home resolved inside the wrapper
mkdir -p "$OUT"
cb() { "$COLAB" "$@"; }
usage_bal() { cb usage 2>&1 | awk '/balance/{print $3}'; }
stop() { cb stop -s "$SESS" >/dev/null 2>&1 || true; cb sessions 2>&1 | tail -3; }
trap stop EXIT

if [ -z "${SKIP_COLAB:-}" ]; then   # SKIP_COLAB=1 redoes only the Blender step
BAL0=$(usage_bal); T0=$(date +%s)
cb new -s "$SESS" --gpu "$GPU"
for f in "$IN"/*.png; do cb upload -s "$SESS" "$f" "/content/in_$(basename "$f")"; done

REMOTE="$(mktemp --suffix=.py)"
cat > "$REMOTE" <<PY
import subprocess, time, glob, os, json
def sh(c, **k): return subprocess.run(c, shell=True, check=True, text=True, **k)
t=time.time()
sh("nvidia-smi --query-gpu=name,memory.total,driver_version --format=csv,noheader | tee /content/gpu.txt")
if not os.path.isdir('/content/TripoSG'):
    sh("git clone -q https://github.com/VAST-AI-Research/TripoSG /content/TripoSG && cd /content/TripoSG && git checkout -q $COMMIT")
    # Measured 2026-11-01 on Colab (Py3.13, torch 2.11+cu130): the repo's numpy==1.22.3 pin has no wheel -> dropped;
    # unpinned diffusers/transformers (0.42/5.x) break the repo's custom scheduler loading -> March-2025 set pinned;
    # diso needs the image's torch at build time -> --no-build-isolation. torch-cluster (optional VAE encoder) skipped.
    sh("cd /content/TripoSG && sed -i '/^numpy==/d;/^diso/d;/^diffusers/d;/^transformers/d;/^huggingface_hub/d;/^peft/d' requirements.txt && pip install -q -r requirements.txt 2>&1 | tail -3")
    sh("pip install -q diffusers==0.32.2 transformers==4.49.0 huggingface_hub==0.29.3 peft==0.14.0 2>&1 | tail -3")
    sh("pip install -q --no-build-isolation diso 2>&1 | tail -3")
setup=time.time()-t
sh("python -V; nvcc --version | tail -2; pip freeze > /content/pip_freeze.txt; git -C /content/TripoSG rev-parse HEAD")
res={}
for f in sorted(glob.glob('/content/in_*.png')):
    n=os.path.basename(f)[3:-4]; t=time.time()
    r=subprocess.run(f"cd /content/TripoSG && python -m scripts.inference_triposg --image-input {f} --output-path /content/out_{n}.glb > /content/log_{n}.txt 2>&1", shell=True)
    tail=open(f'/content/log_{n}.txt').read()[-300:]
    res[n]={'sec':round(time.time()-t,1),'rc':r.returncode,'tail':tail}
    print(n,res[n],flush=True)
res['_setup_sec']=round(setup,1)
json.dump(res,open('/content/timings.json','w'),indent=1)
PY
cb upload -s "$SESS" "$REMOTE" /content/run_triposg.py
cb exec -s "$SESS" --timeout 3000 -f "$REMOTE" | tail -30
for f in "$IN"/*.png; do n=$(basename "$f" .png); cb download -s "$SESS" "/content/out_$n.glb" "$OUT/$n.glb" || echo "MISSING $n"; done
for f in timings.json gpu.txt pip_freeze.txt; do cb download -s "$SESS" "/content/$f" "$OUT/$f"; done
cb stop -s "$SESS" || true
T1=$(date +%s); BAL1=$(usage_bal)
echo "{\"gpu\":\"$GPU\",\"commit\":\"$COMMIT\",\"wall_sec\":$((T1-T0)),\"units_before\":$BAL0,\"units_after\":$BAL1}" > "$OUT/cost.json"; cat "$OUT/cost.json"

fi
trap - EXIT
# Turntable (Blender workbench, 24 frames, 360 deg) per GLB -> mp4 + contact sheet png
TT="$(mktemp --suffix=.py)"
cat > "$TT" <<'BPY'
import bpy, sys, math, mathutils
glb, outdir = sys.argv[-2], sys.argv[-1]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=glb)
objs=[o for o in bpy.context.scene.objects if o.type=='MESH']
pts=[o.matrix_world@mathutils.Vector(c) for o in objs for c in o.bound_box]
lo=mathutils.Vector([min(p[i] for p in pts) for i in range(3)]); hi=mathutils.Vector([max(p[i] for p in pts) for i in range(3)])
ctr=(lo+hi)/2; r=max((hi-lo).length/2,1e-3)
pivot=bpy.data.objects.new("pivot",None); bpy.context.scene.collection.objects.link(pivot); pivot.location=ctr
cam=bpy.data.cameras.new("c"); co=bpy.data.objects.new("c",cam); bpy.context.scene.collection.objects.link(co)
co.parent=pivot; co.location=(0,-r*3.0,r*1.0); cam.clip_end=1000
tr=co.constraints.new('TRACK_TO'); tr.target=pivot; tr.track_axis='TRACK_NEGATIVE_Z'; tr.up_axis='UP_Y'
sc=bpy.context.scene; sc.camera=co; sc.render.engine='BLENDER_WORKBENCH'
sc.display.shading.light='STUDIO'; sc.display.shading.color_type='MATERIAL'
sc.render.resolution_x=sc.render.resolution_y=384; sc.frame_start=1; sc.frame_end=24
sc.world=bpy.data.worlds.new("w"); sc.world.color=(0.12,0.12,0.14)
sc.render.image_settings.file_format='PNG'
for i in range(24):   # explicit per-frame stills: Blender 5 slotted actions have no .fcurves
    pivot.rotation_euler=(0,0,2*math.pi*i/24)
    sc.render.filepath=outdir+"/f_%04d.png"%(i+1)
    bpy.ops.render.render(write_still=True)
BPY
shopt -s nullglob
for g in "$OUT"/*.glb; do n=$(basename "$g" .glb); d="$OUT/turntable_$n"; mkdir -p "$d"
  blender -b -P "$TT" -- "$g" "$d" >"$d/blender.log" 2>&1 || echo "blender failed $n"
  ffmpeg -loglevel error -y -framerate 12 -i "$d/f_%04d.png" -pix_fmt yuv420p "$OUT/turntable_$n.mp4"
  ffmpeg -loglevel error -y -i "$d/f_%04d.png" -vf "select='not(mod(n\,4))',tile=6x1" -frames:v 1 "$OUT/sheet_$n.png"
done
