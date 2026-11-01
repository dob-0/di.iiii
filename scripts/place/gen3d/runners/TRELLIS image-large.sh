#!/usr/bin/env bash
# TRELLIS image-large (microsoft/TRELLIS, commit 193e0502b5cb3eb5997ec457d5340e95d09b158e) on our own Colab L4.
# Reproduces the 2026-11-01 run: image crops -> textured GLB + timings + pip freeze + Blender turntable.
#   usage: TRELLIS\ image-large.sh [run|render] [INPUT_DIR] [OUT_DIR]
#     run     = new L4 session, install, generate, download, stop session (always, also on error)
#     render  = turntable PNGs (blender -b) of each GLB in OUT_DIR
# Login: gevorg Colab Pro+ state at ~/.local/state/colab/gevorg; CLI pinned 0.7.5 via colab-pinned.sh.
# Licence warning (read 2026-11-01): the GLB texture-bake path needs nvdiffrast (NVIDIA 1-way commercial:
# licensee use "non-commercially ... research or evaluation purposes only") and the Inria Gaussian-Splatting
# rasterizer (research / non-commercial). See runs/TRELLIS image-large.md before any client use.
set -euo pipefail
MODE="${1:-run}"
BASE=/mnt/data/footage/place-cinema-house-2026-10-30/modelled/gen3d
IN="${2:-$BASE/inputs}"; OUT="${3:-$BASE/out/TRELLIS image-large}"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COLAB="$HERE/../../colab-pinned.sh"
export HOME="${COLAB_HOME:-/home/dob/.local/state/colab/gevorg}"   # the login's state; uv cache follows the real user in colab-pinned.sh
SESS="trellis-$$"; TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT

render() {
cat > "$TMP/turn.py" <<'PY'
import bpy, sys, math, os
glb, outdir = sys.argv[sys.argv.index('--')+1:][:2]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=glb)
objs=[o for o in bpy.context.scene.objects if o.type=='MESH']
import mathutils
mn=mathutils.Vector((1e9,)*3); mx=mathutils.Vector((-1e9,)*3)
for o in objs:
    for c in o.bound_box:
        w=o.matrix_world@mathutils.Vector(c); mn=mathutils.Vector(map(min,mn,w)); mx=mathutils.Vector(map(max,mx,w))
ctr=(mn+mx)/2; r=max((mx-mn).length/2,1e-3)
cam=bpy.data.objects.new('cam',bpy.data.cameras.new('cam')); bpy.context.scene.collection.objects.link(cam); bpy.context.scene.camera=cam
cam.data.lens=50
w=bpy.data.worlds.new('w'); w.use_nodes=True; w.node_tree.nodes['Background'].inputs[0].default_value=(0.8,0.8,0.8,1); bpy.context.scene.world=w
sun=bpy.data.objects.new('sun',bpy.data.lights.new('sun','SUN')); sun.data.energy=3; sun.rotation_euler=(0.8,0.2,0.6); bpy.context.scene.collection.objects.link(sun)
sc=bpy.context.scene; sc.render.engine='BLENDER_EEVEE'; sc.render.resolution_x=sc.render.resolution_y=512
d=r*2.6
for i,a in enumerate((0,90,180,270)):
    t=math.radians(a); cam.location=ctr+mathutils.Vector((d*math.sin(t),-d*math.cos(t),d*0.35))
    cam.rotation_euler=(ctr-cam.location).to_track_quat('-Z','Y').to_euler()
    sc.render.filepath=os.path.join(outdir,f'{os.path.basename(glb)[:-4]}_turn{a:03d}.png'); bpy.ops.render.render(write_still=True)
PY
  mkdir -p "$OUT/turntable"
  for g in "$OUT"/*.glb; do blender -b -P "$TMP/turn.py" -- "$g" "$OUT/turntable" >/dev/null 2>&1 || echo "render failed: $g" >&2; done
}
[ "$MODE" = render ] && { render; exit 0; }

# ---- remote files ----
cat > "$TMP/setup.sh" <<'SH'
set -ex
export UV_SYSTEM_PYTHON=false   # Colab sets it true; we want the venv
COMMIT=193e0502b5cb3eb5997ec457d5340e95d09b158e
# nvcc 12.6 from NVIDIA's apt repo (12.1/12.4 are not offered for Ubuntu 24.04); torch cu124 vs nvcc 12.6 = same major, builds fine
apt-get install -y -qq cuda-nvcc-12-6 cuda-cudart-dev-12-6 cuda-cccl-12-6 libcusparse-dev-12-6 libcublas-dev-12-6 libcusolver-dev-12-6 ninja-build libgl1 libegl1 libgomp1 >/dev/null
export CUDA_HOME=/usr/local/cuda-12.6 PATH=/usr/local/cuda-12.6/bin:$PATH
cd /content; rm -rf TRELLIS venv
git clone -q https://github.com/microsoft/TRELLIS.git; cd TRELLIS; git checkout -q $COMMIT; git submodule update --init --recursive -q
uv venv --python 3.10 /content/venv -q
export VIRTUAL_ENV=/content/venv PATH=/content/venv/bin:$PATH
uv pip install -q torch==2.5.1 torchvision==0.20.1 --index-url https://download.pytorch.org/whl/cu124
uv pip install -q pillow imageio imageio-ffmpeg tqdm easydict opencv-python-headless scipy ninja rembg onnxruntime trimesh open3d xatlas pyvista pymeshfix igraph transformers==4.46.3 setuptools wheel numpy==1.26.4 "git+https://github.com/EasternJournalist/utils3d.git@9a4eb15e4021b67b12c460c7057d642626897ec8" xformers==0.0.28.post3 --extra-index-url https://download.pytorch.org/whl/cu124
uv pip install -q spconv-cu120
uv pip install -q kaolin==0.17.0 -f https://nvidia-kaolin.s3.us-east-2.amazonaws.com/torch-2.5.1_cu124.html   # imported by flexicubes (check_tensor)
mkdir -p /tmp/ext; cd /tmp/ext
git clone -q https://github.com/NVlabs/nvdiffrast.git
git clone -q https://github.com/autonomousvision/mip-splatting.git
for d in nvdiffrast mip-splatting; do echo "REV $d $(git -C $d rev-parse HEAD)"; done   # 2026-11-01: mip-splatting dda02ab5ecf45d6edb8c540d9bb65c7e451345a9
export TORCH_CUDA_ARCH_LIST=8.9
uv pip install -q --no-build-isolation ./nvdiffrast
uv pip install -q --no-build-isolation ./mip-splatting/submodules/diff-gaussian-rasterization/
echo SETUP_DONE
SH
cat > "$TMP/run.py" <<'PY'
import os, sys, json, time, glob, traceback
os.environ['ATTN_BACKEND']='xformers'; os.environ['SPCONV_ALGO']='native'
sys.path.insert(0,'/content/TRELLIS')
import torch
from PIL import Image
from trellis.pipelines import TrellisImageTo3DPipeline
from trellis.utils import postprocessing_utils
inp,out=sys.argv[1],sys.argv[2]; os.makedirs(out,exist_ok=True)
t=time.time(); pipe=TrellisImageTo3DPipeline.from_pretrained("microsoft/TRELLIS-image-large"); pipe.cuda()
res={'load_s':round(time.time()-t,1),'gpu':torch.cuda.get_device_name(0),'torch':torch.__version__,'items':{}}
for f in sorted(glob.glob(inp+'/*.png')):
    n=os.path.basename(f)[:-4]; r={}
    try:
        torch.cuda.reset_peak_memory_stats(); t=time.time()
        outs=pipe.run(Image.open(f),seed=1,sparse_structure_sampler_params={"steps":12,"cfg_strength":7.5},slat_sampler_params={"steps":12,"cfg_strength":3})
        torch.cuda.synchronize(); r['generate_s']=round(time.time()-t,1); t=time.time()
        glb=postprocessing_utils.to_glb(outs['gaussian'][0],outs['mesh'][0],simplify=0.95,texture_size=1024)
        glb.export(f'{out}/{n}.glb'); r['bake_export_s']=round(time.time()-t,1)
        r['peak_vram_gb']=round(torch.cuda.max_memory_allocated()/1e9,2); r['glb_bytes']=os.path.getsize(f'{out}/{n}.glb')
    except Exception as e:
        r['error']=repr(e); traceback.print_exc()
    res['items'][n]=r; print(n,r,flush=True)
json.dump(res,open(out+'/timings.json','w'),indent=1)
PY
cat > "$TMP/launch.py" <<'PY'
import subprocess, sys
# detached, so a dropped link does not kill the job; logs in /content/*.log
subprocess.Popen("cd /content && nohup bash -c 'bash setup.sh > setup.log 2>&1 && export CUDA_HOME=/usr/local/cuda-12.6 PATH=/usr/local/cuda-12.6/bin:/content/venv/bin:$PATH TORCH_CUDA_ARCH_LIST=8.9 && /content/venv/bin/python run.py /content/inputs /content/out > run.log 2>&1; UV_SYSTEM_PYTHON=false uv pip freeze --python /content/venv/bin/python > freeze.txt; echo ALL_DONE >> run.log' >/dev/null 2>&1 &",shell=True)
PY
cat > "$TMP/poll.py" <<'PY'
import subprocess
print(subprocess.run("tail -c 300 /content/setup.log | tail -2; grep -E '^[a-z_]+ \\{|Error|ALL_DONE' /content/run.log | tail -8",shell=True,capture_output=True,text=True).stdout)
PY
echo 'import os;os.makedirs("/content/inputs",exist_ok=True)' > "$TMP/mk.py"

# ---- orchestration; the session is always stopped ----
C() { timeout 110 "$COLAB" "$@"; }
trap '"$COLAB" stop -s "$SESS" >/dev/null 2>&1 || true; rm -rf "$TMP"' EXIT
"$COLAB" usage | head -1
"$COLAB" new -s "$SESS" --gpu L4
C exec -s "$SESS" -f "$TMP/mk.py"
C upload -s "$SESS" "$TMP/setup.sh" /content/setup.sh; C upload -s "$SESS" "$TMP/run.py" /content/run.py
for f in "$IN"/*.png; do C upload -s "$SESS" "$f" "/content/inputs/$(basename "$f")"; done   # crops WITHOUT people; checked by eye
C exec -s "$SESS" -f "$TMP/launch.py"
for i in $(seq 1 60); do   # poll up to ~30 min
  sleep 30; o="$(C exec -s "$SESS" -f "$TMP/poll.py" 2>&1 || true)"; echo "$o" | tail -3
  grep -q ALL_DONE <<<"$o" && break
done
mkdir -p "$OUT"
for f in $(C ls -s "$SESS" /content/out 2>/dev/null | grep -oE '[A-Za-z0-9_]+\.(glb|json)'); do C download -s "$SESS" "/content/out/$f" "$OUT/$f"; done
C download -s "$SESS" /content/freeze.txt "$OUT/pip-freeze.txt"
C download -s "$SESS" /content/setup.log "$OUT/setup.log" || true
"$COLAB" stop -s "$SESS"; "$COLAB" usage | head -1
render
