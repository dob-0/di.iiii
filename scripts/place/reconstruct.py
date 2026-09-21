"""Run Meshroom on a Colab GPU and leave the result where it can be fetched.

The Meshroom invocation itself is written from the 2025.1.0 documentation and
has not been proved correct on a box yet. Everything around it has: sign-in,
session, the chunked upload, the detached start, polling and download all run
against a real L4.

This file is executed on the Colab VM, repeatedly, by scripts/place/colab-job.mjs:

  first call   unpacks /content/place/images.tar, fetches Meshroom, starts
               meshroom_batch DETACHED, and returns at once
  later calls  report how it is going

Detached on purpose. A Colab runtime can vanish mid-job and a websocket can
drop long before that; a reconstruction that only lives inside one `colab exec`
dies with the connection. Started with setsid + nohup it keeps going, and the
driver can reattach, poll, and pull the mesh the moment it exists.

Every call prints one machine-readable line the driver reads:

    PLACE_STATUS {"state": "running", "elapsed": 412, ...}
"""
import json
import os
import shutil
import subprocess
import sys
import tarfile
import time

ROOT = '/content/place'
IMAGES_TAR = '/content/images.tar'
IMAGES_DIR = os.path.join(ROOT, 'images')
OUT_DIR = os.path.join(ROOT, 'out')
CACHE_DIR = os.path.join(ROOT, 'cache')
LOG = os.path.join(ROOT, 'meshroom.log')
STATE = os.path.join(ROOT, 'state.json')

MESHROOM_URL = ('https://zenodo.org/records/16887472/files/'
                'Meshroom-2025.1.0-Linux.tar.gz')
MESHROOM_HOME = '/content/Meshroom-2025.1.0'

# The textured mesh Meshroom writes when it finishes. Its exact location has
# moved between releases, so we look in a few places rather than one.
RESULT_NAMES = ('texturedMesh.obj', 'texturedMesh.glb', 'mesh.obj')


def status(**fields):
    print('PLACE_STATUS ' + json.dumps(fields, sort_keys=True), flush=True)


def read_state():
    try:
        with open(STATE) as handle:
            return json.load(handle)
    except Exception:
        return {}


def write_state(state):
    os.makedirs(ROOT, exist_ok=True)
    with open(STATE, 'w') as handle:
        json.dump(state, handle)


def alive(pid):
    if not pid:
        return False
    try:
        os.kill(int(pid), 0)
        return True
    except OSError:
        return False


def find_result():
    """The textured mesh, wherever this Meshroom release decided to put it."""
    for base in (OUT_DIR, CACHE_DIR):
        for current, _dirs, files in os.walk(base):
            for name in files:
                if name in RESULT_NAMES:
                    return os.path.join(current, name)
    return None


def tail(path, lines=12):
    try:
        with open(path, errors='replace') as handle:
            return handle.read().splitlines()[-lines:]
    except Exception:
        return []


PARTS_DIR = '/content/parts'


def assemble_tar():
    """Put the uploaded pieces back together.

    The frames arrive split: `colab upload` goes through Jupyter's contents
    API, which base64s the whole file into one JSON body, and a hall's worth
    of photos answers 500 (2026-09-21). Each piece is small enough to land.
    """
    if os.path.exists(IMAGES_TAR):
        return
    if not os.path.isdir(PARTS_DIR):
        raise SystemExit(f'no {IMAGES_TAR} and no {PARTS_DIR} on this VM')
    names = sorted(name for name in os.listdir(PARTS_DIR) if 'images.tar.' in name)
    if not names:
        raise SystemExit(f'{PARTS_DIR} is empty — nothing to put together')
    with open(IMAGES_TAR, 'wb') as whole:
        for name in names:
            with open(os.path.join(PARTS_DIR, name), 'rb') as piece:
                shutil.copyfileobj(piece, whole)


def unpack_images():
    os.makedirs(IMAGES_DIR, exist_ok=True)
    assemble_tar()
    if not os.path.exists(IMAGES_TAR):
        raise SystemExit(f'no {IMAGES_TAR} on this VM — upload it first')
    with tarfile.open(IMAGES_TAR) as archive:
        archive.extractall(IMAGES_DIR)
    # A tar of a folder lands one level deep; flatten so Meshroom sees images.
    entries = [os.path.join(IMAGES_DIR, name) for name in os.listdir(IMAGES_DIR)]
    if len(entries) == 1 and os.path.isdir(entries[0]):
        inner = entries[0]
        for name in os.listdir(inner):
            shutil.move(os.path.join(inner, name), os.path.join(IMAGES_DIR, name))
        os.rmdir(inner)
    return len([n for n in os.listdir(IMAGES_DIR)
                if os.path.isfile(os.path.join(IMAGES_DIR, n))])


# The whole job — fetch, unpack, reconstruct — as one detached shell script.
#
# It has to be detached from the very first byte. Meshroom is an 8 GB
# download before it is an hour of GPU, and `colab exec` holds the websocket
# open for as long as the cell runs: doing the fetch inside the exec times the
# call out and takes the job down with it (learned the hard way, 2026-09-21).
# setsid + nohup means the call returns in a second and the box carries on
# alone, which is also what makes the job survive a dropped connection.
RUN_SH = """#!/usr/bin/env bash
set -o pipefail
cd {root}
# A heartbeat, because nothing else here is reliable proof of life: the
# download is quiet for minutes at a time, and a pid can belong to a process
# that forked and left.
( while [ ! -f {root}/finished ]; do touch {root}/beat; sleep 15; done ) &
touch {root}/beat
echo "START $(date -u)"
if [ ! -d {home} ]; then
  # In parallel, and resumable. The tarball is ~9 GB (it carries CUDA), and a
  # single-stream wget took over an hour on Colab — long enough for the
  # runtime to be reclaimed out from under the job, which is exactly what
  # happened on 2026-09-21. aria2c with sixteen connections turns that into
  # minutes; -c means a retry carries on instead of starting again.
  if ! command -v aria2c >/dev/null; then
    apt-get install -y -qq aria2 >/dev/null 2>&1 || true
  fi
  if command -v aria2c >/dev/null; then
    aria2c -x16 -s16 -c --console-log-level=warn --summary-interval=60 \
      -d /content -o meshroom.tar.gz '{url}' || echo "MESHROOM DOWNLOAD FAILED"
  else
    wget -c -q -O /content/meshroom.tar.gz '{url}' || echo "MESHROOM DOWNLOAD FAILED"
  fi
  echo "DOWNLOADED $(du -m /content/meshroom.tar.gz | cut -f1) MB at $(date -u)"
  mkdir -p {home}
  tar -xzf /content/meshroom.tar.gz -C {home} --strip-components=1
  echo "EXTRACTED at $(date -u)"
fi
export QT_QPA_PLATFORM=offscreen
export LD_LIBRARY_PATH={home}/aliceVision/lib:$LD_LIBRARY_PATH
{home}/meshroom_batch \\
  --input {images} \\
  --output {out} \\
  --cache {cache} \\
  --pipeline photogrammetry \\
  --save {root}/project.mg
echo "MESHROOM EXIT $?"
touch {root}/finished
"""


def start():
    os.makedirs(OUT_DIR, exist_ok=True)
    os.makedirs(CACHE_DIR, exist_ok=True)
    count = unpack_images()
    script = os.path.join(ROOT, 'run.sh')
    with open(script, 'w') as handle:
        handle.write(RUN_SH.format(root=ROOT, home=MESHROOM_HOME, url=MESHROOM_URL,
                                   images=IMAGES_DIR, out=OUT_DIR, cache=CACHE_DIR))
    os.chmod(script, 0o755)
    log = open(LOG, 'ab')
    # NOT setsid. `start_new_session=True` already detaches the child into its
    # own session, and setsid on top of it forks and exits — so the pid we
    # wrote down belonged to a process that was gone within a second, every
    # poll read "it died", and a reconstruction that was working fine was
    # killed at 90 seconds with an empty log (2026-09-21).
    process = subprocess.Popen(['bash', script], stdout=log,
                               stderr=subprocess.STDOUT, cwd=ROOT,
                               start_new_session=True)
    write_state({'pid': process.pid, 'startedAt': time.time(), 'images': count})
    status(state='started', pid=process.pid, images=count)


def heartbeat_age():
    try:
        return time.time() - os.path.getmtime(os.path.join(ROOT, 'beat'))
    except OSError:
        return None


def report():
    state = read_state()
    result = find_result()
    elapsed = int(time.time() - state.get('startedAt', time.time()))
    # Three ways to be sure it is still working, in order of trust: the job
    # has not touched `finished`, AND either its heartbeat is fresh or its pid
    # is alive. The heartbeat leads, because a pid is only as good as the
    # process that holds it.
    finished = os.path.exists(os.path.join(ROOT, 'finished'))
    beat = heartbeat_age()
    warming_up = beat is None and elapsed < 90
    running = not finished and (
        (beat is not None and beat < 120) or alive(state.get('pid')) or warming_up)
    if result:
        textures = []
        folder = os.path.dirname(result)
        for name in sorted(os.listdir(folder)):
            if name != os.path.basename(result):
                textures.append(os.path.join(folder, name))
        status(state='done', result=result, folder=folder, files=textures,
               elapsed=elapsed, running=running)
    elif running:
        status(state='running', elapsed=elapsed, beat=beat, log=tail(LOG, 6))
    else:
        status(state='failed', elapsed=elapsed, beat=beat, finished=finished,
               log=tail(LOG, 40))


def main():
    os.makedirs(ROOT, exist_ok=True)
    state = read_state()
    if state.get('pid') and (alive(state['pid']) or find_result()):
        report()
        return
    if state.get('pid'):
        # It died. Say so with the tail of the log rather than starting again
        # and burning another hour on the same broken footage.
        report()
        return
    start()


if __name__ == '__main__':
    try:
        main()
    except Exception as error:  # the driver must always get a status line
        status(state='error', error=str(error))
        sys.exit(1)
