#!/usr/bin/env bash
# video-to-3d.sh - walk-through video (or a frames folder) -> camera poses and a sparse/dense cloud, on a rented Colab GPU.
#
# One command, the whole recipe: extract frames, upload to the pinned Colab wrapper, run ONE tool, download the result,
# colab stop (also on error), write <out>/report.json with the frames registered.
# Recipe, advice and the measured costs: .claude/skills/video-to-3d/SKILL.md ; method and licences:
# docs/ai/decisions/2026-11-01-video-to-3d-recipe.md . Every tool that ran stays a --tool mode.
#
# Usage: scripts/place/video-to-3d.sh [options] INPUT...      INPUT = video file(s) or ONE folder of .jpg frames
#   --tool NAME       colmap (default) | colmap-global | mast3r | vggt | winner
#                       colmap         COLMAP incremental, sequential + exhaustive matching (BSD, no weights)
#                       colmap-global  COLMAP global mapper, ex-GLOMAP (BSD, no weights); --match exh|seq
#                       mast3r         MASt3R-SfM (code CC BY-NC-SA, weights non-commercial: research only)
#                       vggt           VGGT windowed (VGGT-1B CC BY-NC; needs HF_TOKEN in the environment)
#                       winner         resolves to the tool that beat the baseline. None did on 2026-11-01: refuses.
#   --gpu colab       where it runs (the only route; nothing runs on this machine's GPU)
#   --accel KIND      A100 | T4 | L4 | H100 | cpu (default: per tool)
#   --out DIR         result folder (default ./video-to-3d-out)
#   --fps N           frames per second taken from video (default 3)
#   --width PX        frame width sent up (default 1080; the Colab upload runs at ~90 KB/s)
#   --match exh|seq   colmap-global matching (default exh)      --overlap N  sequential overlap (default 20)
#   --max-frames N    keep only the first N frames (0 = all)
#   --session NAME    Colab session name (default v2d-<tool>-<time>)
#   --colab-home DIR  HOME of the Colab login to use (default: this user's)
#   --timeout-min N   give up waiting after N minutes (default 240)
#   --consent TEXT    REQUIRED for a real run: who agreed to be filmed / why no one is in frame. Stored in report.json.
#   --keep            leave the Colab session running      --dry-run  print the plan, run nothing (no Colab, no ffmpeg)
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TOOL=colmap; GPU=colab; ACCEL=""; OUT=./video-to-3d-out; FPS=3; WIDTH=1080; MATCH=exh; OVERLAP=20; MAXF=0
SESSION=""; COLAB_HOME=""; TIMEOUT_MIN=240; CONSENT=""; KEEP=0; DRY=0; INPUTS=()

die() { echo "video-to-3d: $*" >&2; exit "${RC:-2}"; }
usage() { sed -n '2,/^set -euo/p' "${BASH_SOURCE[0]}" | sed '$d' | sed 's/^# \{0,1\}//'; }
while [ $# -gt 0 ]; do
  case "$1" in
    --tool) TOOL="${2:?}"; shift 2;;      --gpu) GPU="${2:?}"; shift 2;;       --accel) ACCEL="${2:?}"; shift 2;;
    --out) OUT="${2:?}"; shift 2;;        --fps) FPS="${2:?}"; shift 2;;       --width) WIDTH="${2:?}"; shift 2;;
    --match) MATCH="${2:?}"; shift 2;;    --overlap) OVERLAP="${2:?}"; shift 2;; --max-frames) MAXF="${2:?}"; shift 2;;
    --session) SESSION="${2:?}"; shift 2;; --colab-home) COLAB_HOME="${2:?}"; shift 2;;
    --timeout-min) TIMEOUT_MIN="${2:?}"; shift 2;; --consent) CONSENT="${2:?}"; shift 2;;
    --keep) KEEP=1; shift;;               --dry-run) DRY=1; shift;;            -h|--help) usage; exit 0;;
    --) shift; INPUTS+=("$@"); break;;
    -*) die "unknown option $1 (see --help)";;
    *) INPUTS+=("$1"); shift;;
  esac
done

[ "$GPU" = colab ] || die "--gpu $GPU: only 'colab' exists (frames show people; they go to our own Colab session or nowhere)"
[ ${#INPUTS[@]} -gt 0 ] || die "give a video, several videos, or a folder of .jpg frames (see --help)"
[ "$MATCH" = exh ] || [ "$MATCH" = seq ] || die "--match must be exh or seq"
case "$TOOL" in
  winner) RC=3 die "no tool beat the baseline in the 2026-11-01 trial, so 'winner' is empty. Pick one: colmap | colmap-global | mast3r | vggt (docs/ai/decisions/2026-11-01-video-to-3d-recipe.md)";;
  colmap|colmap-global|mast3r|vggt) ;;
  *) die "unknown --tool $TOOL";;
esac

# Per-tool table: accelerator, licence, remote scripts, remote command, result files.
SC="$HERE"
case "$TOOL" in
  colmap)        DEF=cpu;  LIC="BSD-3-Clause (COLMAP/pycolmap), no weights"
                 FILES="$SC/colmap/sfm_exh_seq.py"; SETUP="pip install -q pycolmap==4.2.1 && mkdir -p /content/place && ln -sfn /content/frames /content/place/images"
                 RCMD="cd /content/v2d && python sfm_exh_seq.py"; RESULT="/content/place/sfm_results.json";;
  colmap-global) DEF=cpu;  LIC="BSD-3-Clause (COLMAP global mapper, ex-GLOMAP), no weights"
                 FILES="$SC/recon-glomap/sfm_global.py"; SETUP="pip install -q pycolmap==4.2.1"
                 RCMD="mkdir -p /content/place && cd /content/v2d && python sfm_global.py /content/frames run $MATCH $OVERLAP"
                 RESULT="/content/place/run/result.json";;
  mast3r)        DEF=A100; LIC="NON-COMMERCIAL: code CC BY-NC-SA 4.0, weights non-commercial (naver/mast3r CHECKPOINTS_NOTICE). Research/private use only"
                 FILES="$SC/recon-mast3r/install.py $SC/recon-mast3r/mast3r_sfm.py $SC/recon-mast3r/mesh.py"; SETUP="python /content/v2d/install.py"
                 RCMD="cd /content && python /content/v2d/mast3r_sfm.py /content/frames /content/out --win 6 --loops 4 && OUT=out python /content/v2d/mesh.py"
                 RESULT="/content/out/result.json /content/out/poses.npz /content/out/mesh.glb";;
  vggt)          DEF=A100; LIC="NON-COMMERCIAL for VGGT-1B (CC BY-NC 4.0); VGGT-1B-Commercial is gated (needs approval + HF_TOKEN)"
                 FILES="$SC/learned/vggt_run.py"; SETUP="pip install -q huggingface_hub"
                 RCMD="cd /content/v2d && python vggt_run.py --tar /content/frames.tar --out /content/out --stride 6 --window 60"
                 RESULT="/content/out/model.npz";;
esac
[ -n "$ACCEL" ] || ACCEL="$DEF"
[ -n "$SESSION" ] || SESSION="v2d-$TOOL-$(date +%H%M%S)"
[ "$TOOL" != vggt ] || [ "$DRY" = 1 ] || [ -n "${HF_TOKEN:-}" ] || die "vggt needs HF_TOKEN in the environment (the gated weights); it goes only to our own Colab session"

# Colab wrapper: pinned CLI (colab-pinned.sh says why). Use $PLACE_COLAB to point at another.
COLAB="${PLACE_COLAB:-$HERE/colab-pinned.sh}"
colab() { if [ -n "$COLAB_HOME" ]; then HOME="$COLAB_HOME" "$COLAB" "$@"; else "$COLAB" "$@"; fi; }
NEWFLAGS=(); if [ "$ACCEL" = cpu ]; then NEWFLAGS=(--high-mem); else NEWFLAGS=(--gpu "$ACCEL"); fi

[ "$DRY" = 1 ] || [ -n "$CONSENT" ] || die "frames of a place show people. Give --consent \"who agreed / nobody in frame\"; it is stored in report.json. Frames stay on this machine and in our own Colab session."
# Input kind.
KIND=videos; if [ ${#INPUTS[@]} -eq 1 ] && [ -d "${INPUTS[0]}" ]; then KIND=frames; fi
if [ "$KIND" = videos ]; then for f in "${INPUTS[@]}"; do [ "$DRY" = 1 ] || [ -f "$f" ] || die "not a file: $f"; done; fi

if [ "$DRY" = 1 ]; then
  cat <<PLAN
video-to-3d PLAN (dry run: no Colab, no ffmpeg, nothing written)
  tool      $TOOL   accel $ACCEL   session $SESSION   licence: $LIC
  input     $KIND: ${INPUTS[*]}
  out       $OUT
1 frames    $( [ "$KIND" = videos ] && echo "ffmpeg -vf fps=$FPS,scale=$WIDTH:-2 -q:v 3 per video -> $OUT/frames/<clip>__%05d.jpg (no blur cut: it starves white walls)" || echo "copy .jpg from ${INPUTS[0]}, scaled to $WIDTH px wide" )$( [ "$MAXF" -gt 0 ] && echo " ; max-frames $MAXF" )
2 pack      tar frames, split in 5 MB parts (a single 24 MB upload times out)
3 colab     colab new -s $SESSION ${NEWFLAGS[*]}      (pinned wrapper: $COLAB)
4 upload    parts -> /content/parts (5 in parallel); scripts: $(for f in $FILES; do basename "$f"; done | tr '\n' ' ')-> /content/v2d
5 setup     $SETUP
6 run       detached on the VM, poll every 120 s until a DONE/FAILED marker (limit $TIMEOUT_MIN min): $RCMD
7 download  $RESULT -> $OUT/result/
8 stop      colab stop -s $SESSION   (always, also on error; --keep skips)
9 report    $OUT/report.json : tool, input, frames, registered, models, licence, consent, seconds
consent     ${CONSENT:-"(missing: a real run refuses without --consent TEXT)"}
PLAN
  exit 0
fi

command -v ffmpeg >/dev/null || [ "$KIND" = frames ] || die "ffmpeg not installed"
mkdir -p "$OUT/frames" "$OUT/result" "$OUT/work"
OUT="$(cd "$OUT" && pwd)"; T0=$(date +%s)

# 1 frames
if [ "$KIND" = videos ]; then
  for v in "${INPUTS[@]}"; do
    clip="$(basename "${v%.*}" | tr -c 'A-Za-z0-9\n' _)"
    ffmpeg -loglevel error -y -i "$v" -vf "fps=$FPS,scale=$WIDTH:-2" -q:v 3 "$OUT/frames/${clip}__%05d.jpg"
  done
else
  python3 -I - "${INPUTS[0]}" "$OUT/frames" "$WIDTH" <<'PY'
import sys, os
from PIL import Image
src, dst, w = sys.argv[1], sys.argv[2], int(sys.argv[3])
for n in sorted(os.listdir(src)):
    if n.lower().endswith(('.jpg', '.jpeg')):
        im = Image.open(os.path.join(src, n)).convert('RGB'); im = im.resize((w, round(im.height * w / im.width)))
        im.save(os.path.join(dst, 'f__' + n), quality=92)
PY
fi
if [ "$MAXF" -gt 0 ]; then ls "$OUT/frames" | sort | tail -n +$((MAXF+1)) | while read -r f; do rm -f "$OUT/frames/$f"; done; fi
NFRAMES=$(ls "$OUT/frames" | wc -l); [ "$NFRAMES" -gt 0 ] || die "no frames extracted"
echo "frames: $NFRAMES"

# 2 pack
tar cf "$OUT/work/frames.tar" -C "$OUT/frames" .
rm -rf "$OUT/work/parts"; mkdir "$OUT/work/parts"; split -b 5M -d -a 3 "$OUT/work/frames.tar" "$OUT/work/parts/p."

# remote helper programs
cat > "$OUT/work/launch.py" <<'PY'
import os, subprocess
cmd = os.environ['V2D_CMD']; os.makedirs('/content/v2d', exist_ok=True)
for m in ('DONE', 'FAILED'):
    if os.path.exists('/content/v2d/' + m): os.remove('/content/v2d/' + m)
sh = f'( {cmd} ) > /content/v2d/run.log 2>&1 && touch /content/v2d/DONE || touch /content/v2d/FAILED'
subprocess.Popen(['bash', '-c', sh], start_new_session=True); print('started', flush=True)
PY
cat > "$OUT/work/status.py" <<'PY'
import os, subprocess
print('STATE', 'DONE' if os.path.exists('/content/v2d/DONE') else 'FAILED' if os.path.exists('/content/v2d/FAILED') else 'RUNNING')
print(subprocess.run('tail -n 3 /content/v2d/run.log', shell=True, capture_output=True, text=True).stdout[-600:])
PY
cat > "$OUT/work/unpack.py" <<'PY'
import subprocess
subprocess.run('mkdir -p /content/frames && cat /content/parts/p.* > /content/frames.tar && tar xf /content/frames.tar -C /content/frames && ls /content/frames | wc -l', shell=True, check=True)
PY
printf 'import subprocess\nsubprocess.run(%s, shell=True, check=True)\nprint("SETUP_DONE")\n' "$(python3 -c 'import sys,json;print(json.dumps(sys.argv[1]))' "$SETUP")" > "$OUT/work/setup.py"

CREATED=0; STATE=not-run
finish() {
  rc=$?
  if [ "$CREATED" = 1 ] && [ "$KEEP" = 0 ]; then colab stop -s "$SESSION" >/dev/null 2>&1 && echo "colab stop: $SESSION" || echo "WARNING: colab stop failed for $SESSION; run: colab sessions" >&2; fi
  python3 -I - "$OUT" "$TOOL" "$NFRAMES" "$STATE" "$rc" "$(( $(date +%s) - T0 ))" "$LIC" "$CONSENT" "$SESSION" "$ACCEL" <<'PY'
import sys, json, os, glob
out, tool, nframes, state, rc, secs, lic, consent, session, accel = sys.argv[1:]
res = os.path.join(out, 'result'); reg = None; models = None; note = None
def models_of(x):  # list of [id, registered, points]
    return [m for m in x if isinstance(m, list)]
try:
    if tool == 'colmap' and os.path.exists(res + '/sfm_results.json'):
        d = json.load(open(res + '/sfm_results.json')); allm = [m for v in d.values() if isinstance(v, list) for m in v]
        models = len(allm); reg = max([m[1] for m in allm], default=0); note = 'best model over seq and exh; per-run: ' + json.dumps({k: (max([m[1] for m in v], default=0) if isinstance(v, list) else v) for k, v in d.items()})
    elif tool == 'colmap-global' and os.path.exists(res + '/result.json'):
        d = json.load(open(res + '/result.json')); ms = models_of(d['models']); models = len(ms); reg = max([m[1] for m in ms], default=0)
    elif tool == 'mast3r' and os.path.exists(res + '/result.json'):
        d = json.load(open(res + '/result.json')); reg = d['frames']; models = 1
        note = 'registered is forced by the method (every frame is placed); it does NOT measure success - look at the camera path'
    elif tool == 'vggt' and os.path.exists(res + '/model.npz'):
        import numpy as np; z = np.load(res + '/model.npz'); reg = int(z['ok'].sum()); models = 1
        note = 'ok = windows with Sim3 RANSAC inlier share >= 0.5'
except Exception as e:
    note = 'could not read result: %r' % e
ok = reg is not None and rc == '0'
json.dump({'tool': tool, 'ok': ok, 'frames': int(nframes), 'registered': reg, 'models': models, 'share': (round(reg / int(nframes), 3) if reg is not None and int(nframes) else None),
           'state': state, 'exit': int(rc), 'seconds': int(secs), 'accel': accel, 'session': session, 'licence': lic, 'consent': consent,
           'note': note, 'camera_path_checked': False,
           'warning': 'registered counts are not proof of a good model: 2026-11-01 a 342/400 model was a collapsed fan. Look at the camera path before use.'},
          open(os.path.join(out, 'report.json'), 'w'), indent=1)
print('report:', os.path.join(out, 'report.json'))
PY
  exit $rc
}
trap finish EXIT

# 3-5 colab
colab new -s "$SESSION" "${NEWFLAGS[@]}"; CREATED=1; STATE=session-up
for f in $FILES; do colab upload -s "$SESSION" "$f" "/content/v2d/$(basename "$f")"; done
# five uploads at a time (one big upload times out); a failed part is retried once, serially
n=0; for p in $(ls "$OUT/work/parts"); do
  colab upload -s "$SESSION" "$OUT/work/parts/$p" "/content/parts/$p" >/dev/null 2>&1 || colab upload -s "$SESSION" "$OUT/work/parts/$p" "/content/parts/$p" >/dev/null &
  n=$((n+1)); [ $((n % 5)) -ne 0 ] || wait
done; wait
colab exec -s "$SESSION" -f "$OUT/work/unpack.py"; STATE=uploaded
colab exec -s "$SESSION" -f "$OUT/work/setup.py" --timeout 1800 | tail -3

# 6 run, detached; poll rarely (each poll is a tool round for an agent)
ENVARGS=(--env "V2D_CMD=$RCMD"); [ "$TOOL" != vggt ] || ENVARGS+=(--env "HF_TOKEN=$HF_TOKEN")
colab exec -s "$SESSION" -f "$OUT/work/launch.py" "${ENVARGS[@]}"; STATE=running
DEADLINE=$(( $(date +%s) + TIMEOUT_MIN * 60 ))
while :; do
  sleep "${V2D_POLL:-120}"
  S="$(colab exec -s "$SESSION" -f "$OUT/work/status.py" 2>&1 || true)"; echo "$S" | tail -2
  case "$S" in *"STATE DONE"*) STATE=done; break;; *"STATE FAILED"*) STATE=failed; echo "$S" >&2; exit 1;; esac
  [ "$(date +%s)" -lt "$DEADLINE" ] || { STATE=timeout; echo "timed out after $TIMEOUT_MIN min" >&2; exit 1; }
done

# 7 download
for r in $RESULT; do colab download -s "$SESSION" "$r" "$OUT/result/$(basename "$r")" || echo "WARNING: could not download $r" >&2; done
colab download -s "$SESSION" /content/v2d/run.log "$OUT/result/run.log" || true
echo "done: $OUT/result"
