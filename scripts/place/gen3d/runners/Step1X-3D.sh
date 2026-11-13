#!/usr/bin/env bash
# Step1X-3D (stepfun-ai, Apache-2.0) image -> textured GLB on our own Colab Pro+ session.
# Reproducible runner for the place-twin object step (gen3d kit).
#
#   Step1X-3D.sh [--gpu L4|A100] [--inputs DIR] [--out DIR] [--session NAME] [--keep]
#
# Pins: code commit CODE_SHA, torch 2.5.1+cu124, CUDA 12.4.1 toolkit (for the
# custom_rasterizer build), Python 3.10 (uv), Colab CLI 0.7.5 (colab-pinned.sh).
# The session is always terminated on exit (trap) unless --keep.
# Local part after the download: blender -b turntable per GLB.
# Method: upstream README 4.1-4.3 + inference.py (cb5ac94), minus pytorch3d / kaolin /
# torch-cluster (only used by texture_sync/, not by inference.py).
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COLAB="bash $HERE/../../colab-pinned.sh"
export HOME_REAL="$HOME"
GPU=L4; SESSION=s1x3d; KEEP=0; REUSE=0
BASE=/mnt/data/footage/place-cinema-house-2026-10-30/modelled/gen3d
IN="$BASE/inputs"; OUT="$BASE/out/Step1X-3D"
CODE_SHA=cb5ac944709c6c913109070c7b90c3447f57f3d4
while [ $# -gt 0 ]; do case "$1" in
  --gpu) GPU="$2"; shift 2;; --inputs) IN="$2"; shift 2;; --out) OUT="$2"; shift 2;;
  --session) SESSION="$2"; shift 2;; --keep) KEEP=1; shift;; --reuse) REUSE=1; shift;;   # reuse = session exists and setup already ran (resume after a client hang)
   -h|--help) sed -n 2,12p "$0"; exit 0;;
  *) echo "unknown $1" >&2; exit 2;; esac; done
export HOME="$(getent passwd "$(id -un)" | cut -d: -f6)/.local/state/colab/gevorg"   # the Pro+ login's CLI state
mkdir -p "$OUT"; W="$(mktemp -d)"
cleanup(){ if [ "$KEEP" = 0 ]; then $COLAB stop -s "$SESSION" >/dev/null 2>&1 || true; fi; rm -rf "$W"; }
trap cleanup EXIT
px(){ printf "%s\n" "$1" > "$W/c.py"; timeout 100 $COLAB exec -s "$SESSION" -f "$W/c.py" 2>&1; }   # the exec client can hang on a busy kernel; poll again
log(){ echo "[$(date +%T)] $*" | tee -a "$OUT/run.log"; }
$COLAB usage 2>&1 | grep -i balance | sed 's/^/before: /' | tee "$OUT/units_before.txt"

# ---- Colab side: setup.sh ----
cat > "$W/setup.sh" <<EOS
set -euxo pipefail
T0=\$(date +%s)
cd /content
[ -d Step1X-3D ] || git clone -q https://github.com/stepfun-ai/Step1X-3D.git
cd Step1X-3D && git checkout -q $CODE_SHA && git log -1 --format=%H
uv venv --python 3.10 /content/venv
. /content/venv/bin/activate
if [ ! -x /usr/local/cuda-12.4/bin/nvcc ]; then
  wget -q https://developer.download.nvidia.com/compute/cuda/12.4.1/local_installers/cuda_12.4.1_550.54.15_linux.run
  sh cuda_12.4.1_550.54.15_linux.run --silent --toolkit --toolkitpath=/usr/local/cuda-12.4 --no-opengl-libs --no-drm --no-man-page
fi
export CUDA_HOME=/usr/local/cuda-12.4 PATH=/usr/local/cuda-12.4/bin:\$PATH TORCH_CUDA_ARCH_LIST="8.0;8.9"
uv pip install --python /content/venv/bin/python torch==2.5.1 torchvision==0.20.1 --index-url https://download.pytorch.org/whl/cu124
grep -viE 'pytorch3d|^git\+.*nvdiffrast|wandb|gradio|^spaces|mosaicml|deepspeed|prodigyopt|tensorboard|sageattention|open3d|cupy|^bs4' requirements.txt > /content/req.min.txt
uv pip install --python /content/venv/bin/python -r /content/req.min.txt "setuptools==75.8.0" wheel ninja pybind11
uv pip install --python /content/venv/bin/python --no-build-isolation "git+https://github.com/NVlabs/nvdiffrast.git"
(cd step1x3d_texture/custom_rasterizer && /content/venv/bin/python setup.py install)
(cd step1x3d_texture/differentiable_renderer && /content/venv/bin/python setup.py install)
uv pip freeze --python /content/venv/bin/python > /content/pip_freeze.txt
echo SETUP_SECONDS=\$((\$(date +%s)-T0))
EOS

# ---- Colab side: infer.py (geometry for all, free, texture for all) ----
cat > "$W/infer.py" <<'EOP'
import json, os, sys, time, glob, gc, torch, trimesh
sys.path.insert(0, "/content/Step1X-3D")
os.chdir("/content/Step1X-3D")
from step1x3d_geometry.models.pipelines.pipeline import Step1X3DGeometryPipeline
from step1x3d_geometry.models.pipelines.pipeline_utils import reduce_face, remove_degenerate_face
from step1x3d_texture.pipelines.step1x_3d_texture_synthesis_pipeline import Step1X3DTexturePipeline
IN, OUT, SEED = "/content/in", "/content/out", 2025
os.makedirs(OUT, exist_ok=True)
imgs = sorted(glob.glob(IN + "/*.png")); res = {}
def peak(): return round(torch.cuda.max_memory_allocated() / 2**30, 2)
t = time.time()
g = Step1X3DGeometryPipeline.from_pretrained("stepfun-ai/Step1X-3D", subfolder="Step1X-3D-Geometry-1300m").to("cuda")
load_g = round(time.time() - t, 1)
for p in imgs:
    n = os.path.basename(p)[:-4]; torch.cuda.reset_peak_memory_stats(); t = time.time()
    gen = torch.Generator(device=g.device); gen.manual_seed(SEED)
    out = g(p, guidance_scale=7.5, num_inference_steps=50, generator=gen)
    out.mesh[0].export(f"{OUT}/{n}.untextured.glb"); torch.cuda.synchronize()
    res[n] = {"geometry_s": round(time.time() - t, 1), "geometry_peak_gib": peak()}
del g, out; gc.collect(); torch.cuda.empty_cache()
t = time.time()
tp = Step1X3DTexturePipeline.from_pretrained("stepfun-ai/Step1X-3D", subfolder="Step1X-3D-Texture")
load_t = round(time.time() - t, 1)
for p in imgs:
    n = os.path.basename(p)[:-4]; torch.cuda.reset_peak_memory_stats(); t = time.time()
    m = trimesh.load(f"{OUT}/{n}.untextured.glb")
    m = reduce_face(remove_degenerate_face(m))
    tm = tp(p, m, seed=SEED)
    tm.export(f"{OUT}/{n}.glb"); torch.cuda.synchronize()
    res[n].update(texture_s=round(time.time() - t, 1), texture_peak_gib=peak(),
                  faces=int(len(tm.faces)) if hasattr(tm, "faces") else None)
json.dump({"seed": SEED, "load_geometry_s": load_g, "load_texture_s": load_t,
           "gpu": torch.cuda.get_device_name(0), "torch": torch.__version__, "items": res},
          open(f"{OUT}/timings.json", "w"), indent=1)
print(json.dumps(res, indent=1))
EOP

log "new session $SESSION gpu=$GPU"
T0=$(date +%s)
if [ "$REUSE" = 0 ]; then
  for try in 1 2 3 4 5 6; do   # capacity / too-many-sessions refusals are transient
    if $COLAB new -s "$SESSION" --gpu "$GPU" 2>&1 | tee -a "$OUT/run.log" | grep -q "READY"; then break; fi
    [ $try = 6 ] && { log "no GPU allocated after 6 tries"; exit 1; }; sleep 120; done
  px "import os;os.makedirs('/content/in',exist_ok=True)" >/dev/null 2>&1 || true
  for f in "$IN"/*.png; do $COLAB upload -s "$SESSION" "$f" /content/in/$(basename "$f") 2>&1 | tail -1; done
  $COLAB upload -s "$SESSION" "$W/setup.sh" /content/setup.sh | tail -1
  log "setup (detached; log /content/setup.log)"
  px "import subprocess;subprocess.Popen('bash /content/setup.sh > /content/setup.log 2>&1; echo EXIT=\$? >> /content/setup.log',shell=True,start_new_session=True)" >/dev/null
  until [[ "$(px "print(open('/content/setup.log').read()[-300:])")" == *EXIT=* ]]; do sleep 20; done
  px "print(open('/content/setup.log').read()[-600:])" 2>&1 | tail -8 | tee -a "$OUT/run.log"
fi
$COLAB upload -s "$SESSION" "$W/infer.py" /content/infer.py | tail -1
log "inference (detached; log /content/infer.log)"
px "import subprocess;subprocess.Popen('/content/venv/bin/python /content/infer.py > /content/infer.log 2>&1; echo EXIT=\$? >> /content/infer.log',shell=True,start_new_session=True)" >/dev/null
until [[ "$(px "print(open('/content/infer.log').read()[-300:])")" == *EXIT=* ]]; do sleep 20; done
px "print(open('/content/infer.log').read()[-1500:])" 2>&1 | tail -30 | tee -a "$OUT/run.log"
T1=$(date +%s)
$COLAB download -s "$SESSION" /content/infer.log "$OUT/infer.log" 2>&1 | tail -1
grep -q "EXIT=0" "$OUT/infer.log" || { log "INFERENCE FAILED, see $OUT/infer.log (session kept if --keep)"; tail -15 "$OUT/infer.log"; exit 1; }
for f in /content/out/timings.json /content/pip_freeze.txt /content/setup.log /content/infer.log; do $COLAB download -s "$SESSION" "$f" "$OUT/$(basename "$f")" 2>&1 | tail -1; done
for f in "$IN"/*.png; do n=$(basename "$f" .png); $COLAB download -s "$SESSION" "/content/out/$n.glb" "$OUT/$n.glb" 2>&1 | tail -1; $COLAB download -s "$SESSION" "/content/out/$n.untextured.glb" "$OUT/$n.untextured.glb" 2>&1 | tail -1; done
log "wall seconds new->downloaded: $((T1-T0))"
$COLAB stop -s "$SESSION" 2>&1 | tail -1; KEEP=1
$COLAB usage 2>&1 | grep -i balance | sed 's/^/after: /' | tee "$OUT/units_after.txt"
$COLAB sessions 2>&1 | tail -2 | tee -a "$OUT/run.log"

# ---- local: turntable per GLB (blender -b, EEVEE-less workbench, 8 frames over 360 deg) ----
cat > "$W/turntable.py" <<'EOT'
import bpy, sys, math, mathutils
glb, outp = sys.argv[sys.argv.index("--")+1:][:2]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=glb)
objs=[o for o in bpy.context.scene.objects if o.type=="MESH"]
pts=[o.matrix_world@mathutils.Vector(c) for o in objs for c in o.bound_box]
lo=mathutils.Vector([min(p[i] for p in pts) for i in range(3)]); hi=mathutils.Vector([max(p[i] for p in pts) for i in range(3)])
c=(lo+hi)/2; r=max((hi-lo).length,1e-3)
sc=bpy.context.scene; sc.render.engine="BLENDER_WORKBENCH"
sc.display.shading.light="STUDIO"; sc.display.shading.color_type="TEXTURE"
sc.render.resolution_x=sc.render.resolution_y=384
w=bpy.data.worlds.new("w"); w.color=(0.2,0.2,0.22); sc.world=w
cam=bpy.data.objects.new("c",bpy.data.cameras.new("c")); sc.collection.objects.link(cam); sc.camera=cam
for k in range(8):
    a=2*math.pi*k/8
    cam.location=c+mathutils.Vector((math.sin(a)*r*1.3, -math.cos(a)*r*1.3, r*0.35))
    cam.rotation_euler=(c-cam.location).to_track_quat("-Z","Y").to_euler()
    sc.render.filepath=f"{outp}_{k}.png"; bpy.ops.render.render(write_still=True)
EOT
for f in "$OUT"/*.glb; do case "$f" in *.untextured.glb) continue;; esac; n=$(basename "$f" .glb)
  mkdir -p "$OUT/turntable"; blender -b -P "$W/turntable.py" -- "$f" "$OUT/turntable/$n" >/dev/null 2>&1 || log "turntable FAILED $n"
  python3 -I - "$OUT/turntable" "$n" <<'EOM'
import sys,glob
from PIL import Image
d,n=sys.argv[1:3]; ims=[Image.open(f"{d}/{n}_{k}.png").convert("RGB") for k in range(8)]
s=Image.new("RGB",(384*4,384*2))
for k,i in enumerate(ims): s.paste(i,((k%4)*384,(k//4)*384))
s.save(f"{d}/{n}_sheet.png")
EOM
done
log "done; outputs in $OUT"
