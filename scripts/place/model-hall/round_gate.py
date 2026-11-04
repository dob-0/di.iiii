#!/usr/bin/env python3
"""round_gate.py - per-round archive and same-pose overlap gate for the fix pass (place modelling).

A fixer's change to a room is kept only if the room's same-pose match to the video frames does not
fall below the previous round's. The score is measured, never judged by eye.

  round_gate.py archive <modelled> <round>                     copy floor.glb/.json, place.json, room build inputs -> rounds/r<round>/
  round_gate.py restore <modelled> <round> [--room ID ...]     put archived rooms (or the whole floor) back
  round_gate.py score   <modelled> <round> [--glb FILE]        render the round's floor.glb at the fixed pose set, score each room
  round_gate.py check   <modelled> <round> --prev <round> [--tol 0.01] [--apply]
                                                                keep/rollback per room; --apply restores rolled-back rooms
                                                                from rounds/r<prev>/ (rebuild the floor after that)
  round_gate.py finalize <modelled> <round>                     after a rollback + rebuild: keep the pre-gate archive as
                                                                rounds/r<round>-pre-gate/, archive the rebuilt floor as r<round>, score it

Fixed pose set: <modelled>/gate_poses.json = {"<room>": [{"frame": "<file in survey/frames>", "pose": "<pose json, rel. to modelled>"}]}.
The same set is used for every round, so scores are comparable. Poses come from pose_from_frame.py (T_wc, f, w, h).

Score per pose (Canny edges of frame and render, render resized to the frame):
  precision = render edge pixels within 4 px of a frame edge / render edge pixels
  recall    = frame edge pixels within 4 px of a render edge / frame edge pixels  (stops a room scoring well by showing less)
  f1        = harmonic mean; room score = mean f1 over its poses. cover = share of render pixels with geometry.
Method: edge-based model-to-image registration score (chamfer-style edge agreement; Barrow et al. 1977, Borgefors 1988).
Limit: edge agreement measures geometry and strong texture edges only, not colour or tone; a pose error lowers every round
equally. It is a gate against regressions, not a proof of correctness - the judge still looks.
"""
import argparse, hashlib, json, os, shutil, subprocess, sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
RENDER = HERE / 'compare' / 'render_same_pose.py'
# build inputs only; renders, scratch and old backups stay out of the archive
SKIP_DIRS = ('renders', '_round', 'compare', 'cam', 'r5', 'r6', 'r7', 'tools', 'poses', '__pycache__', '_wallcheck')
SKIP_EXT = ('.jpg', '.blend1', '.log')
FLOOR_FILES = ('floor.glb', 'floor.json', 'place.json')


def sha(p):
    h = hashlib.sha256()
    with open(p, 'rb') as f:
        for b in iter(lambda: f.read(1 << 20), b''): h.update(b)
    return h.hexdigest()


def room_files(room):
    for dp, dns, fns in os.walk(room):
        dns[:] = [d for d in dns if d not in SKIP_DIRS]
        for fn in fns:
            if not fn.endswith(SKIP_EXT): yield Path(dp) / fn


def archive(m, rnd):
    dst = m / 'rounds' / f'r{rnd}'
    if dst.exists(): sys.exit(f'{dst} exists - an archive is never overwritten')
    man = {'round': rnd, 'files': {}}
    for f in FLOOR_FILES:
        if (m / f).exists():
            (dst).mkdir(parents=True, exist_ok=True); shutil.copy2(m / f, dst / f); man['files'][f] = sha(m / f)
    for room in sorted(p for p in (m / 'rooms').iterdir() if p.is_dir() and not p.name.startswith('_')):
        for f in room_files(room):
            rel = f.relative_to(m); (dst / rel).parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(f, dst / rel); man['files'][str(rel)] = sha(f)
    json.dump(man, open(dst / 'MANIFEST.json', 'w'), indent=1)
    size = sum((dst / k).stat().st_size for k in man['files'])
    print(f'archived r{rnd}: {len(man["files"])} files, {size / 1e6:.1f} MB -> {dst}')


def restore(m, rnd, rooms):
    src = m / 'rounds' / f'r{rnd}'
    man = json.load(open(src / 'MANIFEST.json'))
    n = 0
    for rel in man['files']:
        parts = Path(rel).parts
        if rooms and not (parts[0] == 'rooms' and parts[1] in rooms): continue
        if not rooms or parts[0] == 'rooms':
            (m / rel).parent.mkdir(parents=True, exist_ok=True); shutil.copy2(src / rel, m / rel); n += 1
    # files added after the archive inside a restored room are build inputs that did not exist then: move them aside, never delete
    for r in rooms or []:
        for f in room_files(m / 'rooms' / r):
            rel = str(f.relative_to(m))
            if rel not in man['files']:
                aside = m / 'rounds' / f'r{rnd}-rolled-back-extra' / rel
                aside.parent.mkdir(parents=True, exist_ok=True); shutil.move(f, aside)
    print(f'restored {n} files from r{rnd}' + (f' for {",".join(rooms)}' if rooms else ' (whole floor)'))


def edges(cv2, img):
    g = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    return cv2.Canny(cv2.GaussianBlur(g, (5, 5), 0), 50, 130)


def score_pair(cv2, np, frame, render_rgba, tol_px=4):
    H, W = frame.shape[:2]
    a = render_rgba[..., 3:4] / 255.0 if render_rgba.shape[2] == 4 else np.ones(render_rgba.shape[:2] + (1,))
    rgb = (render_rgba[..., :3] * a + 40 * (1 - a)).astype(np.uint8)
    rgb = cv2.resize(rgb, (W, H)); a = cv2.resize(a[..., 0], (W, H))
    k = np.ones((2 * tol_px + 1, 2 * tol_px + 1), np.uint8)
    ef, er = edges(cv2, frame) > 0, edges(cv2, rgb) > 0
    efd, erd = cv2.dilate(ef.astype(np.uint8), k) > 0, cv2.dilate(er.astype(np.uint8), k) > 0
    p = float((er & efd).sum() / max(er.sum(), 1)); r = float((ef & erd).sum() / max(ef.sum(), 1))
    f1 = 0.0 if p + r == 0 else 2 * p * r / (p + r)
    return {'precision': round(p, 3), 'recall': round(r, 3), 'f1': round(f1, 3), 'cover': round(float((a > 0.5).mean()), 3)}


def pose_set(m):
    """(valid pose count, sha256 of gate_poses.json). Valid = the pose file loads and the frame file exists."""
    gp = json.load(open(m / 'gate_poses.json')); n = 0
    for items in gp.values():
        for it in items:
            try:
                (m / it['pose']).read_text() and json.loads((m / it['pose']).read_text())
                n += (m / 'survey' / 'frames' / it['frame']).exists()
            except (OSError, ValueError, KeyError): pass
    return n, sha(m / 'gate_poses.json')


def score(m, rnd, glb, blender):
    import cv2, numpy as np
    gp = json.load(open(m / 'gate_poses.json')); n_valid, gp_sha = pose_set(m)
    out = m / 'rounds' / f'r{rnd}' / 'gate'; out.mkdir(parents=True, exist_ok=True)
    glb = Path(glb) if glb else m / 'rounds' / f'r{rnd}' / 'floor.glb'
    batch = []
    for room, items in gp.items():
        for i, it in enumerate(items):
            pose = json.load(open(m / it['pose'])); pose = pose[0] if isinstance(pose, list) else pose
            batch.append(dict(pose, out=str(out / f'{room}_{i}.png')))
    bf = out / 'batch_poses.json'; json.dump(batch, open(bf, 'w'))
    env = dict(os.environ, OMP_NUM_THREADS=os.environ.get('OMP_NUM_THREADS', '6'))
    cmd = ['nice', '-n', '10', blender, '-b', '--factory-startup', '-t', '6', '--python', str(RENDER), '--', str(glb), str(bf), str(out / 'x.png')]
    r = subprocess.run(cmd, env=env, capture_output=True, text=True)
    if r.returncode: sys.exit('render failed: ' + r.stderr[-800:])
    res = {}
    for room, items in gp.items():
        per = []
        for i, it in enumerate(items):
            fr = cv2.imread(str(m / 'survey' / 'frames' / it['frame'])); rd = cv2.imread(str(out / f'{room}_{i}.png'), cv2.IMREAD_UNCHANGED)
            if fr is None or rd is None: per.append({'frame': it['frame'], 'error': 'missing frame or render'}); continue
            per.append(dict(frame=it['frame'], **score_pair(cv2, np, fr, rd)))
        ok = [p for p in per if 'f1' in p]
        res[room] = {'score': round(sum(p['f1'] for p in ok) / len(ok), 3) if ok else None, 'poses': per}
    json.dump({'round': rnd, 'glb': str(glb), 'glb_sha256': sha(glb),
               'valid_poses': n_valid, 'gate_poses_sha256': gp_sha, 'rooms': res}, open(out.parent / 'overlap.json', 'w'), indent=1)
    for room, v in res.items(): print(f'{room:15s} {v["score"]}')


def check(m, rnd, prev, tol, apply):
    A = json.load(open(m / 'rounds' / f'r{prev}' / 'overlap.json'))
    B = json.load(open(m / 'rounds' / f'r{rnd}' / 'overlap.json'))
    for key, what in (('valid_poses', 'count of valid poses'), ('gate_poses_sha256', 'sha256 of gate_poses.json')):
        if key not in A or key not in B:
            print(f'warning: {what} not recorded in r{prev if key not in A else rnd}/overlap.json (older score); cannot compare', file=sys.stderr)
        elif A[key] != B[key]:
            sys.exit(f'REFUSED: {what} differs between r{prev} ({A[key]}) and r{rnd} ({B[key]}); scores are not comparable. '
                     f'Re-score r{prev} with the same pose set, or keep the pose set fixed.')
    a, b = A['rooms'], B['rooms']
    rows, back = [], []
    for room in b:
        s0, s1 = (a.get(room) or {}).get('score'), b[room]['score']
        keep = s1 is not None and (s0 is None or s1 >= s0 - tol)
        dec = 'keep' if keep else 'rollback'
        if keep and s0 is not None and s0 < 0.01:
            dec = 'keep, NO BASELINE (score ~0: the pose set misses this room; fix gate_poses.json)'
        rows.append({'room': room, f'r{prev}': s0, f'r{rnd}': s1, 'decision': dec})
        if not keep: back.append(room)
    json.dump({'prev': prev, 'round': rnd, 'tol': tol, 'rows': rows}, open(m / 'rounds' / f'r{rnd}' / 'gate.json', 'w'), indent=1)
    for r in rows: print(f"{r['room']:15s} r{prev}={r[f'r{prev}']} r{rnd}={r[f'r{rnd}']} -> {r['decision']}")
    if apply and back:
        restore(m, prev, back); print('rolled back:', ','.join(back), '- rebuild the floor (model_floor.sh) and score again')
    return back


def finalize(m, rnd, blender):
    r = m / 'rounds' / f'r{rnd}'; pre = m / 'rounds' / f'r{rnd}-pre-gate'
    if pre.exists(): sys.exit(f'{pre} exists - finalize runs once per round')
    if not (m / 'gate_poses.json').exists() or not (m / 'floor.glb').exists(): sys.exit('finalize needs floor.glb and gate_poses.json')
    shutil.move(r, pre)
    try:
        archive(m, rnd)
        if (pre / 'gate.json').exists(): shutil.copy2(pre / 'gate.json', r / 'gate.json')
        score(m, rnd, None, blender)
    except BaseException:
        # roll the move back so a re-run works
        if r.exists(): shutil.rmtree(r)
        shutil.move(pre, r); print(f'finalize failed - r{rnd} restored to its pre-gate state, re-run is possible', file=sys.stderr)
        raise


def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    ap.add_argument('cmd', choices=['archive', 'restore', 'score', 'check', 'finalize']); ap.add_argument('modelled'); ap.add_argument('round', type=int)
    ap.add_argument('--room', nargs='*', default=[]); ap.add_argument('--glb'); ap.add_argument('--prev', type=int)
    ap.add_argument('--tol', type=float, default=0.01); ap.add_argument('--apply', action='store_true')
    ap.add_argument('--blender', default=os.environ.get('BLENDER', 'blender'))
    a = ap.parse_args(); m = Path(a.modelled).resolve()
    if a.cmd == 'archive': archive(m, a.round)
    elif a.cmd == 'restore': restore(m, a.round, a.room)
    elif a.cmd == 'score': score(m, a.round, a.glb, a.blender)
    elif a.cmd == 'finalize': finalize(m, a.round, a.blender)
    else:
        if a.prev is None: sys.exit('check needs --prev')
        check(m, a.round, a.prev, a.tol, a.apply)


if __name__ == '__main__':
    main()
