#!/usr/bin/env bash
# TRELLIS.2-4B on our own Colab session. STATUS 2026-11-01: NEVER RUN (blocked, see
# agent-reports-2026-11-01/gen3d-kit/runs/TRELLIS.2-4B.md). Needs HF_TOKEN of an account that
# accepted the terms of facebook/dinov3-vitl16-pretrain-lvd1689m and briaai/RMBG-2.0 (both gated;
# RMBG-2.0 licence read as non-commercial - owner decides first). Pins from microsoft/TRELLIS.2 setup.sh.
set -euo pipefail
: "${HF_TOKEN:?set HF_TOKEN (gated DINOv3 + RMBG-2.0)}"
IN=/mnt/data/footage/place-cinema-house-2026-10-30/modelled/gen3d/inputs
OUT=/mnt/data/footage/place-cinema-house-2026-10-30/modelled/gen3d/out/TRELLIS.2-4B
C="env HOME=$HOME/.local/state/colab/gevorg $(dirname "$0")/../../colab-pinned.sh"
S=trellis2-$$; mkdir -p "$OUT"
trap '$C terminate -s $S || true' EXIT       # always end the session
$C new -s $S --gpu A100                       # card: >=24 GB, verified A100/H100
$C upload -s $S "$IN"/*.png /content/
cat > /tmp/job_$$.py <<'PY'
import os,subprocess,time,glob
sh=lambda c:subprocess.run(c,shell=True,check=True,executable="/bin/bash")
REV="75fbf0183001ed9876c8dbb35de6b68552ee08bd"
sh(f"git clone --recursive https://github.com/microsoft/TRELLIS.2 /content/T2 && cd /content/T2 && git checkout {REV} && git submodule update --init --recursive")
# Colab ships python3.12/torch; setup.sh pins torch 2.6.0+cu124, flash-attn 2.7.3, nvdiffrast v0.4.0, nvdiffrec renderutils
sh("cd /content/T2 && . ./setup.sh --basic --flash-attn --nvdiffrast --nvdiffrec --cumesh --o-voxel --flexgemm")
sh("pip freeze > /content/pip_freeze.txt; nvidia-smi -L > /content/gpu.txt")
os.environ["OPENCV_IO_ENABLE_OPENEXR"]="1"; os.chdir("/content/T2")
import sys; sys.path.insert(0,"/content/T2")
import torch,o_voxel
from PIL import Image
from trellis2.pipelines import Trellis2ImageTo3DPipeline
p=Trellis2ImageTo3DPipeline.from_pretrained("microsoft/TRELLIS.2-4B"); p.cuda()
for f in sorted(glob.glob("/content/*.png")):
    t=time.time(); m=p.run(Image.open(f))[0]; m.simplify(16777216)
    g=o_voxel.postprocess.to_glb(vertices=m.vertices,faces=m.faces,attr_volume=m.attrs,coords=m.coords,
      attr_layout=m.layout,voxel_size=m.voxel_size,aabb=[[-.5,-.5,-.5],[.5,.5,.5]],decimation_target=1000000,
      texture_size=4096,remesh=True,remesh_band=1,remesh_project=0,verbose=True)
    n=os.path.basename(f)[:-4]; g.export(f"/content/{n}.glb",extension_webp=True)
    open(f"/content/{n}.sec","w").write(str(time.time()-t))
PY
$C exec -s $S -e HF_TOKEN="$HF_TOKEN" -f /tmp/job_$$.py
for x in glb sec; do for f in $IN/*.png; do n=$(basename "$f" .png); $C download -s $S /content/$n.$x "$OUT/$n.$x"; done; done
$C download -s $S /content/pip_freeze.txt "$OUT/pip_freeze.txt"; $C download -s $S /content/gpu.txt "$OUT/gpu.txt"
$C usage | tee "$OUT/usage_after.txt"
# turntable: blender -b (script to be written when the run exists)
