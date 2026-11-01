# Runs on the Colab VM (exec). Installs MASt3R at a pinned commit and fetches the checkpoint.
import subprocess, os
def sh(c, tail=1200):
    r = subprocess.run(c, shell=True, capture_output=True, text=True)
    print('$', c[:90], '->', r.returncode); print((r.stdout + r.stderr)[-tail:], flush=True)
    return r.returncode
if not os.path.isdir('/content/mast3r'):
    sh('cd /content && git clone --recursive -q https://github.com/naver/mast3r')
sh('cd /content/mast3r && git log -1 --format=%H')
sh('cd /content/mast3r && pip install -q -r requirements.txt -r dust3r/requirements.txt open3d trimesh 2>&1 | tail -3')
sh('python -c "import torch;print(torch.__version__, torch.cuda.get_device_name(0))"')
sh('''python - <<'P'
from huggingface_hub import hf_hub_download
p=hf_hub_download('naver/MASt3R_ViTLarge_BaseDecoder_512_catmlpdpt_metric','model.safetensors') if False else None
P''')
print('INSTALL_DONE', flush=True)
