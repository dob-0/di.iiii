# Runs on the VM via exec: unpack once, then start mast3r_sfm.py detached. Args via env: SET (in400|indense), OUT, EXTRA
import os, subprocess
S = os.environ['SET']; OUT = os.environ['OUT']; EXTRA = os.environ.get('EXTRA', '')
pre = {'in400': 'a', 'indense': 'b'}[S]
if not os.path.isdir(f'/content/{S}'):
    os.makedirs(f'/content/{S}')
    subprocess.run(f'cat /content/parts/{pre}.* | tar xf - -C /content/{S}', shell=True, check=True)
print(S, len(os.listdir(f'/content/{S}')), 'images', flush=True)
os.makedirs(f'/content/{OUT}', exist_ok=True)
subprocess.Popen(f'cd /content && nohup python /content/mast3r_sfm.py /content/{S} /content/{OUT} {EXTRA} > /content/{OUT}/stdout.log 2>&1 &', shell=True)
print('started', OUT)
