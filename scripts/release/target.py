#!/usr/bin/env python3
"""target.py - the half of the show release tools that runs ON the machine that serves the show.

Shipped by content (ssh, base64) from scripts/show/install.mjs, scripts/show/hot-swap.mjs,
scripts/release/restore.mjs and scripts/release/drill.mjs, or run directly against a replica DI home
on this machine. Standard library only (python3 >= 3.6), so nothing has to be installed on the target.
Method, sources and limits: scripts/release/README.md.

  label    <home>                         base version + '+<id>' per line of the live release's PATCHES
  shalist  <home> <dir>...                sha256 of every file under those dirs of the live release
  apply    <home> <stamp> <patch-b64> [--bundle F] [--reload] [--server URL | --server-default]
                                          hot swap: clone the live release, lay the ui bundle (stdin or F)
                                          over the clone, check every file against the manifest, append
                                          one PATCHES line, exchange the two paths in one rename
  undo     <home> <stamp> [--reload] [--server URL | --server-default]
  install  <home> <pack> <sha256> <version> [--server URL | --server-default]
  manifest <home>                         write <home>/release-manifest.json (the restore manifest), print it
  verify   <home> <manifest-b64>          every file a manifest names is here with its sha256
  check    <home> [--server URL | --server-default]   desk pages answer 200, the laser state reads

Why the paths are exchanged and `current` is not moved: the running server serves the desk pages from
the REAL path of its release folder (node resolves a module's symlinks when it starts), so pointing
`current` at a new folder would change nothing until a restart. A hot swap must not restart (owner
2026-11-01 01:0x: "we can do that without restarting / disarming the laser; show is main"), so the new
release is built beside the live one and the two folders swap names in one renameat2(RENAME_EXCHANGE):
the live path holds the new release, the old one stays whole as <release>.before-<id>-<stamp>.

Exit: 0 ok, 1 check failed, 2 usage, 3 a file does not match its sha256 (nothing changed),
6 refused or failed (the line above says why).
"""
import base64
import ctypes
import hashlib
import io
import json
import os
import shlex
import shutil
import subprocess
import sys
import tarfile
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone

UI_DIRS = ['serverXR/src/showDesk/ui', 'serverXR/src/laser/ui', 'serverXR/src/lighting/ui']
MANIFEST_PREFIX = 'serverXR/src/.ui-manifest-'


def now():
    return datetime.now(timezone.utc).isoformat(timespec='seconds').replace('+00:00', 'Z')


def say(*a):
    print(*a, flush=True)


def die(msg, code):
    print('target: ' + msg, file=sys.stderr, flush=True)
    sys.exit(code)


def sha256_file(p):
    h = hashlib.sha256()
    with open(p, 'rb') as f:
        for chunk in iter(lambda: f.read(1 << 20), b''):
            h.update(chunk)
    return h.hexdigest()


def live_dir(home):
    cur = os.path.join(home, 'current')
    if not os.path.isdir(cur):
        die('no release is installed in %s (no current/)' % home, 6)
    return os.path.realpath(cur)


def state_version(home):
    try:
        with open(os.path.join(home, 'state.json')) as f:
            return json.load(f).get('version')
    except (OSError, ValueError):
        return None


def read_patches(d):
    out = []
    try:
        with open(os.path.join(d, 'PATCHES')) as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                try:
                    out.append(json.loads(line))
                except ValueError:
                    out.append({'id': 'unreadable', 'raw': line})
    except FileNotFoundError:
        pass
    return out


def label_of(home):
    # The same rule as scripts/di/overlays.mjs (`di version`); release.test.js checks that both agree.
    d = live_dir(home)
    base = state_version(home) or os.path.basename(d)
    return base + ''.join('+' + str(p.get('id', '?')) for p in read_patches(d))


def append_log(home, entry):
    entry = dict(entry, at=now())
    with open(os.path.join(home, 'releases.log'), 'a') as f:
        f.write(json.dumps(entry, sort_keys=True) + '\n')


def resolve_in(home, p):
    p = os.path.expanduser(p)
    return p if os.path.isabs(p) else os.path.join(home, p)


def free_name(folder, name):
    n, i = name, 2
    while os.path.lexists(os.path.join(folder, n)):
        n, i = '%s.%d' % (name, i), i + 1
    return n


def exchange(a, b):
    """Swap two paths in one step (Linux renameat2 RENAME_EXCHANGE); else three renames, said so."""
    err = 0
    try:
        libc = ctypes.CDLL(None, use_errno=True)
        fn = libc.renameat2
        fn.argtypes = [ctypes.c_int, ctypes.c_char_p, ctypes.c_int, ctypes.c_char_p, ctypes.c_uint]
        if fn(-100, os.fsencode(a), -100, os.fsencode(b), 2) == 0:
            return 'atomic (renameat2 RENAME_EXCHANGE)'
        err = ctypes.get_errno()
    except (AttributeError, OSError):
        pass
    tmp = a + '.swap-tmp'
    os.rename(a, tmp)
    os.rename(b, a)
    os.rename(tmp, b)
    return 'NOT atomic: renameat2 unavailable (%s); three renames' % (os.strerror(err) if err else 'no symbol')


def server_of(home, opts):
    if opts.get('server'):
        return opts['server'].rstrip('/')
    if not opts.get('server-default'):
        return None
    port = '4000'  # di's DEFAULT_PORT (scripts/di/state.mjs); di.env's PORT wins, as resolvePort() does
    try:
        with open(os.path.join(home, 'di.env')) as f:
            for line in f:
                line = line.strip()
                if line.startswith('PORT='):
                    port = line.split('=', 1)[1].strip().strip('"\'') or port
    except OSError:
        pass
    return 'http://127.0.0.1:' + port


def http_get(url, timeout=5):
    try:
        with urllib.request.urlopen(url, timeout=timeout) as r:
            return r.status, r.read()
    except urllib.error.HTTPError as e:
        return e.code, b''
    except Exception as e:  # refused, timeout: the page did not answer
        return None, str(e).encode()


def laser_state(server):
    if not server:
        return 'not read (no server address)'
    code, body = http_get(server + '/serverXR/laser/api/state', 4)
    if code != 200:
        return 'not read (%s)' % (code if code else body.decode('utf8', 'replace')[:60])
    try:
        e = json.loads(body.decode('utf8'))
        c = (e.get('cubes') or [{}])[0]
        return 'armed %s, stop %s' % (c.get('armed'), (c.get('stop') or {}).get('reason'))
    except Exception:
        return 'not read (not json)'


def check(home, server):
    if not server:
        say('check: no server address (give --server)')
        return False
    ok = True
    for u in ('show/', 'laser/', 'light/'):
        code, _ = http_get('%s/serverXR/%s' % (server, u))
        say('page %s %s' % (u, code))
        ok = ok and code == 200
    say('laser: ' + laser_state(server))
    return ok


def reload_desks():
    # Carried from di-atlas tools/projector-room/ui-hot-swap.sh: F5 to the two desk windows in place, no focus change.
    if not shutil.which('hyprctl'):
        say('reload: no hyprctl here; the desk pages pick up the new files on their next load')
        return
    env = dict(os.environ)
    env.setdefault('XDG_RUNTIME_DIR', '/run/user/%d' % os.getuid())
    hd = os.path.join(env['XDG_RUNTIME_DIR'], 'hypr')
    try:
        env['HYPRLAND_INSTANCE_SIGNATURE'] = sorted(os.listdir(hd), key=lambda n: os.path.getmtime(os.path.join(hd, n)))[-1]
        clients = json.loads(subprocess.run(['hyprctl', 'clients', '-j'], env=env, capture_output=True,
                                            text=True, timeout=10).stdout or '[]')
    except Exception as e:
        say('reload: no Hyprland session read (%s)' % e)
        return
    for title in ('Show desk', 'Laser desk'):
        c = [x for x in clients if x.get('title') == title and
             (x.get('class') == 'chromium' or str(x.get('class', '')).startswith('chrome-'))]
        if not c:
            say('reload %s: no window' % title)
            continue
        a = c[0]['address']
        r = subprocess.run(['hyprctl', 'dispatch', "hl.dsp.send_shortcut({ mods = '', key = 'F5', window = 'address:%s' })" % a],
                           env=env, capture_output=True, text=True, timeout=10)
        say('reload %s: %s' % (title, 'F5 sent to ' + a if r.returncode == 0 else 'send_shortcut failed; no window was focused'))


def extract_bundle(data, dest):
    with tarfile.open(fileobj=io.BytesIO(data), mode='r:gz') as tf:
        members = tf.getmembers()
        for m in members:
            parts = m.name.split('/')
            if m.name.startswith('/') or '..' in parts:
                die('unsafe path in the bundle: ' + m.name, 3)
            if not (m.isfile() or m.isdir()):
                die('the bundle holds something that is not a file or a folder: ' + m.name, 3)
            inside = any(m.name == d or m.name.startswith(d + '/') for d in UI_DIRS)
            if not (inside or m.name.startswith(MANIFEST_PREFIX) or m.name in ('serverXR', 'serverXR/src')):
                die('the bundle reaches outside the ui folders: ' + m.name, 3)
        if hasattr(tarfile, 'data_filter'):
            tf.extractall(dest, members=members, filter='data')
        else:
            tf.extractall(dest, members=members)


def manifest_file(root, sha8):
    return os.path.join(root, MANIFEST_PREFIX + sha8 + '.sha256')


def read_manifest(root, sha8):
    mf = manifest_file(root, sha8)
    if not os.path.isfile(mf):
        return None, ['the manifest %s is not in the bundle' % sha8]
    if sha256_file(mf)[:8] != sha8:
        return None, ['the manifest file does not hash to %s' % sha8]
    listed = {}
    with open(mf) as f:
        for line in f:
            line = line.rstrip('\n')
            if line:
                listed[line[66:]] = line[:64]
    bad = [rel for rel, want in sorted(listed.items())
           if not os.path.isfile(os.path.join(root, rel)) or sha256_file(os.path.join(root, rel)) != want]
    return listed, bad


def prune_unlisted(root, dirs, listed):
    gone = 0
    for d in dirs:
        for dp, _dns, fns in os.walk(os.path.join(root, d)):
            for fn in fns:
                p = os.path.join(dp, fn)
                if os.path.relpath(p, root) not in listed:
                    os.remove(p)
                    gone += 1
    return gone


def write_manifest(home):
    live = live_dir(home)
    base_version = state_version(home) or os.path.basename(live)
    base = {'version': base_version, 'pack': None, 'sha256': None}
    try:
        with open(os.path.join(home, 'releases.log')) as f:
            for line in f:
                try:
                    e = json.loads(line)
                except ValueError:
                    continue
                if e.get('action') == 'install' and e.get('version') == base_version:
                    base = {'version': base_version, 'pack': e.get('pack'), 'sha256': e.get('sha256')}
    except OSError:
        pass
    overlays = []
    for p in read_patches(live):
        rel = 'overlays/%s.%s.tar.gz' % (p.get('id'), p.get('manifest'))
        f = os.path.join(home, rel)
        overlays.append(dict(p, bundle=rel, bundleSha256=sha256_file(f) if os.path.isfile(f) else None))
    m = {'kind': 'di release manifest v1', 'label': label_of(home), 'base': base, 'overlays': overlays, 'writtenAt': now()}
    path = os.path.join(home, 'release-manifest.json')
    with open(path + '.partial', 'w') as f:
        json.dump(m, f, indent=2, sort_keys=True)
        f.write('\n')
    os.replace(path + '.partial', path)
    return m


def apply(home, stamp, patch, bundle_path, opts):
    live = live_dir(home)
    vers = os.path.dirname(live)
    pid, sha8 = str(patch.get('id') or ''), str(patch.get('manifest') or '')
    dirs = [d for d in (patch.get('dirs') or []) if d in UI_DIRS]
    if not pid or '/' in pid or len(sha8) != 8 or not dirs:
        die('the patch line needs an id, a manifest (8 hex) and the ui dirs it covers', 2)
    server = server_of(home, opts)
    if opts.get('reload'):
        say('laser before: ' + laser_state(server))
    with (open(bundle_path, 'rb') if bundle_path else sys.stdin.buffer) as f:
        data = f.read()
    nxt = os.path.join(vers, '.%s.next-%s' % (os.path.basename(live), stamp))
    before_name = free_name(vers, '%s.before-%s-%s' % (os.path.basename(live), pid, stamp))
    t0 = time.time()
    shutil.rmtree(nxt, ignore_errors=True)
    if subprocess.run(['cp', '-a', '--reflink=auto', live, nxt], capture_output=True).returncode != 0:
        shutil.rmtree(nxt, ignore_errors=True)
        shutil.copytree(live, nxt, symlinks=True)
    say('clone %s (%.2f s)' % (os.path.basename(live), time.time() - t0))
    try:
        extract_bundle(data, nxt)
        listed, bad = read_manifest(nxt, sha8)
        if listed is None or bad:
            die('SHA MISMATCH (%s): nothing changed, the live release is untouched' % ', '.join(bad[:3]), 3)
        gone = prune_unlisted(nxt, dirs, listed)
        old = b''
        if os.path.isfile(os.path.join(live, 'PATCHES')):
            with open(os.path.join(live, 'PATCHES'), 'rb') as f:
                old = f.read()
        line = (json.dumps(dict(patch, before=before_name), sort_keys=True) + '\n').encode('utf8')
        with open(os.path.join(nxt, 'PATCHES'), 'ab') as f:
            f.write(line)
        with open(os.path.join(nxt, 'PATCHES'), 'rb') as f:
            if f.read() != old + line:
                die('PATCHES of the new release is not the live PATCHES plus one line: refusing', 6)
        stash = os.path.join(home, 'overlays', '%s.%s.tar.gz' % (pid, sha8))
        if not os.path.isfile(stash):  # content-addressed by the manifest: never rewritten, so a manifest's sha256 holds
            os.makedirs(os.path.dirname(stash), exist_ok=True)
            with tarfile.open(stash + '.partial', 'w:gz') as tf:
                for rel in sorted(listed):
                    tf.add(os.path.join(nxt, rel), arcname=rel)
                tf.add(manifest_file(nxt, sha8), arcname=MANIFEST_PREFIX + sha8 + '.sha256')
            os.replace(stash + '.partial', stash)
    except SystemExit:
        shutil.rmtree(nxt, ignore_errors=True)
        raise
    say('checked %d ui files against manifest %s; %d file(s) the pack no longer has removed from the new release'
        % (len(listed), sha8, gone))
    how = exchange(live, nxt)
    os.rename(nxt, os.path.join(vers, before_name))
    label = label_of(home)
    append_log(home, {'action': 'hot-swap', 'id': pid, 'manifest': sha8, 'before': before_name, 'label': label,
                      'removed': gone, 'switch': how})
    write_manifest(home)
    say('switch: %s; the release before is kept as %s' % (how, before_name))
    say('label ' + label)
    if opts.get('reload'):
        css = os.path.join(live, 'serverXR', 'src', 'showDesk', 'ui', 'show.css')
        if server and os.path.isfile(css):
            code, body = http_get(server + '/serverXR/show/show.css')
            same = code == 200 and hashlib.sha256(body).hexdigest() == sha256_file(css)
            say('served show.css %s the installed file' % ('=' if same else '!= (WARN)'))
        reload_desks()
        time.sleep(3)
        check(home, server)
        say('laser after: ' + laser_state(server))


def undo(home, stamp, opts):
    live = live_dir(home)
    vers = os.path.dirname(live)
    patches = read_patches(live)
    if not patches:
        die('nothing to undo: the live release carries no overlay (label %s)' % label_of(home), 6)
    last = patches[-1]
    before = os.path.join(vers, str(last.get('before') or ''))
    if not last.get('before') or not os.path.isdir(before):
        die('the release before %s is gone (%s): restore from a checkpoint manifest instead'
            % (last.get('id'), last.get('before')), 6)
    if read_patches(before) != patches[:-1]:
        die('the release before %s does not carry the PATCHES it should: refusing' % last.get('id'), 6)
    server = server_of(home, opts)
    if opts.get('reload'):
        say('laser before: ' + laser_state(server))
    how = exchange(live, before)
    undone = free_name(vers, '%s.undone-%s-%s' % (os.path.basename(live), last.get('id'), stamp))
    os.rename(before, os.path.join(vers, undone))
    label = label_of(home)
    append_log(home, {'action': 'undo', 'id': last.get('id'), 'kept': undone, 'label': label, 'switch': how})
    write_manifest(home)
    say('undo %s: %s; the undone release is kept as %s' % (last.get('id'), how, undone))
    say('label ' + label)
    if opts.get('reload'):
        reload_desks()
        time.sleep(3)
        check(home, server)
        say('laser after: ' + laser_state(server))


def install(home, pack, sha, version, opts):
    pack = resolve_in(home, pack)
    if not os.path.isfile(pack):
        die('no pack at ' + pack, 6)
    real = sha256_file(pack)
    if real != sha:
        die('the pack here is not the one the gate passed: sha256 %s, expected %s' % (real[:12], sha[:12]), 3)
    packs = os.path.join(home, 'packs')
    os.makedirs(packs, exist_ok=True)
    dest = os.path.join(packs, os.path.basename(pack))
    if os.path.realpath(pack) != os.path.realpath(dest):
        shutil.move(pack, dest)
    env = dict(os.environ, DI_HOME=home)
    env['PATH'] = os.pathsep.join([os.path.join(home, 'runtime', 'node', 'bin'), os.path.join(home, 'bin'),
                                   env.get('PATH', '/usr/bin:/bin')])
    env.setdefault('XDG_RUNTIME_DIR', '/run/user/%d' % os.getuid())
    tmpl = os.environ.get('DI_SHOW_UPDATE_CMD')
    cmd = [a.replace('{pack}', dest).replace('{home}', home) for a in shlex.split(tmpl)] if tmpl \
        else ['di', 'update', '--from', dest]
    say('install start %s: %s' % (now(), ' '.join(shlex.quote(a) for a in cmd)))
    t0 = time.time()
    r = subprocess.run(cmd, env=env)
    say('install end (%.1f s, exit %d)' % (time.time() - t0, r.returncode))
    if r.returncode != 0:
        append_log(home, {'action': 'install-failed', 'pack': 'packs/' + os.path.basename(dest), 'sha256': sha,
                          'version': version, 'exit': r.returncode})
        die('the update failed (exit %d); the lines above say what it changed' % r.returncode, 6)
    cur = os.path.basename(live_dir(home))
    if cur != version:
        die('after the update current/ is %s, not %s' % (cur, version), 6)
    append_log(home, {'action': 'install', 'pack': 'packs/' + os.path.basename(dest), 'sha256': sha,
                      'version': version, 'label': label_of(home)})
    write_manifest(home)
    server = server_of(home, opts)
    if server:
        for _ in range(30):
            if http_get(server + '/serverXR/laser/api/state', 2)[0] == 200:
                break
            time.sleep(1)
        check(home, server)
    say('label ' + label_of(home))


def verify(home, m):
    problems = []
    b = m.get('base') or {}
    if not b.get('pack') or not b.get('sha256'):
        problems.append('the manifest names no base pack (installed before the gate existed): '
                        'install it once through scripts/show/install.mjs')
    elif not os.path.isfile(resolve_in(home, b['pack'])):
        problems.append('base pack %s is not here' % b['pack'])
    elif sha256_file(resolve_in(home, b['pack'])) != b['sha256']:
        problems.append('base pack %s does not match its sha256' % b['pack'])
    for o in m.get('overlays') or []:
        f = resolve_in(home, str(o.get('bundle') or ''))
        if not o.get('bundle') or not o.get('bundleSha256'):
            problems.append('overlay %s has no stored bundle' % o.get('id'))
        elif not os.path.isfile(f):
            problems.append('overlay bundle %s is not here' % o['bundle'])
        elif sha256_file(f) != o['bundleSha256']:
            problems.append('overlay bundle %s does not match its sha256' % o['bundle'])
    for p in problems:
        say('missing: ' + p)
    if problems:
        sys.exit(6)
    say('every file the manifest names is here: base %s + %d overlay(s)' % (b.get('pack'), len(m.get('overlays') or [])))


def shalist(home, dirs):
    live = live_dir(home)
    for d in dirs:
        if d.startswith('/') or '..' in d.split('/'):
            die('bad dir ' + d, 2)
        for dp, dns, fns in os.walk(os.path.join(live, d)):
            dns.sort()
            for fn in sorted(fns):
                p = os.path.join(dp, fn)
                say('%s  %s' % (sha256_file(p), os.path.relpath(p, live)))


def main(argv):
    if len(argv) < 2:
        die(__doc__, 2)
    cmd, home = argv[0], os.path.abspath(os.path.expanduser(argv[1]))
    rest, opts, pos, i = argv[2:], {}, [], 0
    while i < len(rest):
        a = rest[i]
        if a in ('--bundle', '--server'):
            if i + 1 >= len(rest):
                die(a + ' needs a value', 2)
            opts[a[2:]] = rest[i + 1]
            i += 2
        elif a in ('--reload', '--server-default'):
            opts[a[2:]] = True
            i += 1
        else:
            pos.append(a)
            i += 1
    stamp = time.strftime('%Y%m%d-%H%M%S')
    if cmd == 'label':
        say(label_of(home))
    elif cmd == 'shalist':
        shalist(home, pos)
    elif cmd == 'apply' and len(pos) == 2:
        apply(home, pos[0], json.loads(base64.b64decode(pos[1]).decode('utf8')),
              resolve_in(home, opts['bundle']) if opts.get('bundle') else None, opts)
    elif cmd == 'undo':
        undo(home, pos[0] if pos else stamp, opts)
    elif cmd == 'install' and len(pos) == 3:
        install(home, pos[0], pos[1], pos[2], opts)
    elif cmd == 'manifest':
        say(json.dumps(write_manifest(home), indent=2, sort_keys=True))
    elif cmd == 'verify' and len(pos) == 1:
        verify(home, json.loads(base64.b64decode(pos[0]).decode('utf8')))
    elif cmd == 'check':
        sys.exit(0 if check(home, server_of(home, opts)) else 1)
    else:
        die('usage: ' + __doc__, 2)


if __name__ == '__main__':
    main(sys.argv[1:])
