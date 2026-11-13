#!/usr/bin/env bash
# Hunyuan3D-2.1 image-to-3D (shape + PBR paint) on OUR Colab session, then a Blender turntable per GLB.
# RESEARCH / COMPARISON ONLY: Tencent Hunyuan 3D 2.1 Community Licence, LICENSE of the repo at COMMIT:
#   1.l Territory excludes EU, UK, South Korea; 5.c no use/display of Works or Output outside the Territory;
#   5.b no use of Output to improve any other AI model; >1M MAU needs a Tencent licence.
# Do not show outputs in EU/UK/KR, do not train on them. (The file name uses "-" because "/" cannot be in a file name.)
#
# usage: runner.sh [INPUT_DIR] [OUT_DIR]      env: GPU=A100, REUSE=<session> (re-run on a live session; setup is skipped), COLLECT_ONLY=1 (with REUSE: no upload/start, only wait+download) (default; L4 24 GB < 29 GB needed for shape+paint)
# needs: colab-pinned.sh (CLI 0.7.5), gevorg login state at ~/.local/state/colab/gevorg, blender, ffmpeg.
# Always terminates its session (trap). Never pkill.
set -uo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
W="$HERE/../../colab-pinned.sh"
export HOME="${COLAB_STATE_HOME:-/home/dob/.local/state/colab/gevorg}"
IN="${1:-/mnt/data/footage/place-cinema-house-2026-10-30/modelled/gen3d/inputs}"
OUT="${2:-/mnt/data/footage/place-cinema-house-2026-10-30/modelled/gen3d/out/Hunyuan3D-2.1 (RESEARCH-COMPARISON ONLY)}"
GPU="${GPU:-A100}"
SES="h21-$$"
COMMIT=82920d643c0dc2f7bfd7255f45f62d386edfe60c
TMP="$(mktemp -d)"
mkdir -p "$OUT"
cleanup() { $W sessions 2>&1 | tail -3 >"$OUT/sessions_after.txt"; $W stop -s "$SES" >>"$OUT/colab.log" 2>&1; $W sessions >>"$OUT/sessions_after.txt" 2>&1; rm -rf "$TMP"; }
trap cleanup EXIT
log() { echo "[$(date +%T)] $*" | tee -a "$OUT/colab.log"; }

# ---- remote files -------------------------------------------------------------------------------
cat >"$TMP/job.sh" <<JOB
set -euxo pipefail
cd /content
if [ ! -f /content/SETUP_OK ]; then
pip -q install uv; export UV_PYTHON_PREFERENCE=only-managed
git clone https://github.com/Tencent-Hunyuan/Hunyuan3D-2.1 h21 && git -C h21 checkout $COMMIT
uv venv --python 3.10 /content/venv && /content/venv/bin/python -V
export VIRTUAL_ENV=/content/venv PATH=/content/venv/bin:\$PATH
cd h21
uv pip install --python /content/venv/bin/python torch==2.5.1 torchvision==0.20.1 torchaudio==2.5.1 --index-url https://download.pytorch.org/whl/cu124
# dropped: gradio fastapi uvicorn pythreejs deepspeed tb_nightly (demo/training only); bpy==4.0 (not on PyPI: stubbed,
# GLB is built with the repo's own bpy-free create_glb_with_pbr_materials, same as its gradio_app.py)
grep -v -i -E '^(--extra-index|gradio|fastapi|uvicorn|pythreejs|deepspeed|tb_nightly|bpy)' requirements.txt > /content/req.txt
uv pip install --python /content/venv/bin/python --index-strategy unsafe-best-match -r /content/req.txt "setuptools<81" wheel  # pkg_resources is gone in setuptools>=81 (pytorch-lightning 1.9.5 needs it)
# Colab ships nvcc 13.0, torch 2.5.1 is cu124: torch refuses the mismatch -> side-by-side CUDA 12.4.1 toolkit (no driver)
wget -q https://developer.download.nvidia.com/compute/cuda/12.4.1/local_installers/cuda_12.4.1_550.54.15_linux.run -O /content/cuda.run
sh /content/cuda.run --silent --toolkit --toolkitpath=/content/cuda-12.4 --no-opengl-libs --no-man-page --override
export CUDA_HOME=/content/cuda-12.4 PATH=/content/cuda-12.4/bin:\$PATH
nvcc --version
export TORCH_CUDA_ARCH_LIST="8.0"
(cd hy3dpaint/custom_rasterizer && python setup.py install)
mkdir -p hy3dpaint/ckpt && wget -q https://github.com/xinntao/Real-ESRGAN/releases/download/v0.1.0/RealESRGAN_x4plus.pth -P hy3dpaint/ckpt
uv pip freeze --python /content/venv/bin/python > /content/pip_freeze.txt
nvidia-smi --query-gpu=name,memory.total,driver_version --format=csv > /content/gpu.txt
touch /content/SETUP_OK
fi
echo SETUP_DONE
cd /content/h21
export VIRTUAL_ENV=/content/venv PATH=/content/cuda-12.4/bin:/content/venv/bin:\$PATH CUDA_HOME=/content/cuda-12.4
# the repo's compile_mesh_painter.sh asks the SYSTEM python3-config for the suffix (Colab python != venv 3.10): use the venv's
uv pip install --python /content/venv/bin/python "setuptools<81" -q
ls hy3dpaint/DifferentiableRenderer/mesh_inpaint_processor*.so >/dev/null 2>&1 || (cd hy3dpaint/DifferentiableRenderer && rm -f mesh_inpaint_processor && c++ -O3 -Wall -shared -std=c++11 -fPIC \$(python -m pybind11 --includes) mesh_inpaint_processor.cpp -o mesh_inpaint_processor\$(python -c "import sysconfig;print(sysconfig.get_config_var('EXT_SUFFIX'))"))
export VIRTUAL_ENV=/content/venv PATH=/content/cuda-12.4/bin:/content/venv/bin:\$PATH CUDA_HOME=/content/cuda-12.4
python /content/run.py
echo ALL_DONE
JOB
cat >"$TMP/run.py" <<'PY'
import sys, os, time, json, glob, shutil
os.chdir('/content/h21')
sys.path[:0] = ['/content/h21', './hy3dshape', './hy3dpaint']
import torch, types
sys.modules['bpy']=types.ModuleType('bpy')
from PIL import Image
try:
    from torchvision_fix import apply_fix; apply_fix()
except Exception as e: print('torchvision_fix FAILED', e); raise
from hy3dshape.rembg import BackgroundRemover
from hy3dshape.pipelines import Hunyuan3DDiTFlowMatchingPipeline
t=time.time()
shape = Hunyuan3DDiTFlowMatchingPipeline.from_pretrained('tencent/Hunyuan3D-2.1')
rm = BackgroundRemover()
load_shape = time.time()-t
os.chdir('/content/h21')
if not os.path.exists('ckpt'): os.symlink('hy3dpaint/ckpt','ckpt')  # configs use repo-root-relative paths
from textureGenPipeline import Hunyuan3DPaintPipeline, Hunyuan3DPaintConfig
t=time.time()
paint = Hunyuan3DPaintPipeline(Hunyuan3DPaintConfig(max_num_view=6, resolution=512))
load_paint = time.time()-t
os.chdir('/content/h21')
res = {'load_shape_s': load_shape, 'load_paint_s': load_paint, 'items': {}}
for f in sorted(glob.glob('/content/inputs/*.png')):
    name = os.path.splitext(os.path.basename(f))[0]
    d = f'/content/out/{name}'; os.makedirs(d, exist_ok=True)
    r = {}
    try:
        img = Image.open(f).convert('RGBA')
        t=time.time(); img = rm(img.convert('RGB')); r['rembg_s']=time.time()-t
        img.save(f'{d}/input_rgba.png')
        torch.cuda.reset_peak_memory_stats()
        t=time.time(); mesh = shape(image=img, generator=torch.Generator('cuda').manual_seed(1234))[0]; r['shape_s']=time.time()-t
        mesh.export(f'{d}/shape.glb'); r['shape_peak_gb']=torch.cuda.max_memory_allocated()/2**30
        torch.cuda.empty_cache(); torch.cuda.reset_peak_memory_stats()
        t=time.time()
        out = paint(mesh_path=f'{d}/shape.glb', image_path=f'{d}/input_rgba.png', output_mesh_path=f'{d}/textured.obj', save_glb=False)
        from convert_utils import create_glb_with_pbr_materials
        b=f'{d}/textured'; os.chdir(d)
        create_glb_with_pbr_materials(b+'.obj', {'albedo':b+'.jpg','metallic':b+'_metallic.jpg','roughness':b+'_roughness.jpg'}, b+'.glb')
        os.chdir('/content/h21')
        r['paint_s']=time.time()-t; r['paint_peak_gb']=torch.cuda.max_memory_allocated()/2**30; r['paint_out']=str(out)
    except Exception as e:
        import traceback; traceback.print_exc(); r['error']=repr(e)
        os.chdir('/content/h21')
    res['items'][name]=r; print(name, r, flush=True)
    json.dump(res, open('/content/out/timings.json','w'), indent=1)
PY
printf "import subprocess\nprint(subprocess.run(\"nvidia-smi -L;mkdir -p /content/inputs\",shell=True,capture_output=True,text=True).stdout)\n" >"$TMP/init.py"
printf "import os\nprint(\" \".join(os.listdir(\"/content/out\")))\n" >"$TMP/ls.py"
cat >"$TMP/start.py" <<'PY'
import subprocess
subprocess.Popen(['bash','-c','bash /content/job.sh > /content/job.log 2>&1'], stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, start_new_session=True)
print('started')
PY
cat >"$TMP/poll.py" <<'PY'
import subprocess
print(subprocess.run('tail -n 12 /content/job.log | cut -c1-200; ls /content/out 2>/dev/null', shell=True, capture_output=True, text=True).stdout)
PY
cat >"$TMP/turntable.py" <<'PY'
import bpy, sys, math, mathutils
glb, outdir = sys.argv[sys.argv.index('--')+1:][:2]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=glb)
objs=[o for o in bpy.context.scene.objects if o.type=='MESH']
pts=[o.matrix_world@mathutils.Vector(c) for o in objs for c in o.bound_box]
lo=mathutils.Vector((min(p[i] for p in pts) for i in range(3))); hi=mathutils.Vector((max(p[i] for p in pts) for i in range(3)))
ctr=(lo+hi)/2; size=max((hi-lo)); 
sc=bpy.context.scene; sc.render.engine='BLENDER_WORKBENCH'
sh=sc.display.shading; sh.light='STUDIO'; sh.color_type='TEXTURE'; sh.show_cavity=False
sc.render.resolution_x=sc.render.resolution_y=384
sc.world=bpy.data.worlds.new('w'); sc.world.color=(0.8,0.8,0.8)
cam=bpy.data.objects.new('c',bpy.data.cameras.new('c')); sc.collection.objects.link(cam); sc.camera=cam
n=36
for i in range(n):
    a=2*math.pi*i/n; r=size*1.9
    cam.location=ctr+mathutils.Vector((r*math.cos(a), r*math.sin(a), size*0.5))
    cam.rotation_euler=(ctr-cam.location).to_track_quat('-Z','Y').to_euler()
    sc.render.filepath=f'{outdir}/f{i:03d}.png'; bpy.ops.render.render(write_still=True)
PY

# ---- run ---------------------------------------------------------------------------------------
T0=$(date +%s)
log "new session $SES gpu=$GPU"; $W usage 2>&1 | head -2 | tee -a "$OUT/colab.log"
if [ -n "${REUSE:-}" ]; then SES="$REUSE"; log "reusing session $SES (setup already done there)"; else
$W new -s "$SES" --gpu "$GPU" >>"$OUT/colab.log" 2>&1 || { log "session create failed"; exit 2; }; fi
if [ -z "${COLLECT_ONLY:-}" ]; then
$W exec -s "$SES" -f "$TMP/init.py" >>"$OUT/colab.log" 2>&1 || true
up() { for t in 1 2 3 4; do $W upload -s "$SES" "$1" "$2" >>"$OUT/colab.log" 2>&1 && return 0; sleep 10; done; log "UPLOAD FAILED $1"; return 1; }
for f in "$IN"/*.png; do up "$f" "/content/inputs/$(basename "$f")"; done
for f in job.sh run.py; do up "$TMP/$f" "/content/$f"; done
$W exec -s "$SES" -f "$TMP/start.py" 2>&1 | tee -a "$OUT/colab.log"
fi
while :; do
  sleep 60
  P=$($W exec -s "$SES" --timeout 60 -f "$TMP/poll.py" 2>&1); echo "$P" | tail -4 >"$OUT/last_poll.txt"
  echo "$P" | grep -q 'ALL_DONE' && break
  echo "$P" | grep -q -E 'Traceback|Error' && echo "$P" | tail -3 | tee -a "$OUT/colab.log"
  [ $(( $(date +%s) - T0 )) -gt 5400 ] && { log "timeout 90 min"; break; }
done
T1=$(date +%s)
$W exec -s "$SES" --timeout 60 -f "$TMP/poll.py" >>"$OUT/colab.log" 2>&1
for f in timings.json; do $W download -s "$SES" "/content/out/$f" "$OUT/$f" >>"$OUT/colab.log" 2>&1; done
for f in job.log pip_freeze.txt gpu.txt; do $W download -s "$SES" "/content/$f" "$OUT/$f" >>"$OUT/colab.log" 2>&1; done
for d in $($W exec -s "$SES" --timeout 60 -f "$TMP/ls.py" 2>/dev/null | tail -1); do
  [ "$d" = timings.json ] && continue
  mkdir -p "$OUT/$d"
  for g in shape.glb textured.glb input_rgba.png; do $W download -s "$SES" "/content/out/$d/$g" "$OUT/$d/$g" >>"$OUT/colab.log" 2>&1; done
done
echo "{\"wall_s\": $((T1-T0)), \"gpu\": \"$GPU\", \"commit\": \"$COMMIT\"}" >"$OUT/wall.json"
$W usage 2>&1 | head -2 | tee -a "$OUT/colab.log"
# ---- turntables (local, Blender background) ------------------------------------------------------
for d in "$OUT"/*/; do
  for g in textured shape; do
    [ -f "$d/$g.glb" ] || continue
    mkdir -p "$d/tt_$g"; blender -b -P "$TMP/turntable.py" -- "$d/$g.glb" "$d/tt_$g" >"$d/tt_$g.log" 2>&1
    ffmpeg -y -loglevel error -framerate 12 -i "$d/tt_$g/f%03d.png" -pix_fmt yuv420p "$d/turntable_$g.mp4" && rm -rf "$d/tt_$g"
  done
done
log "done; session terminated by trap"
