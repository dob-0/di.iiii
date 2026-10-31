#!/usr/bin/env python3
"""Fault-injection tests for scene_selftest.py against an in-process fake light desk (same routes and reply shapes as
di 0.4.4-look.9e2028c7: raw holds with owners, recallHolds, cue layer, LFOs, POST /fixture clearing activeScene).
Each case starts from the same found state and must end with the fake desk exactly as found."""
import copy, json, math, os, signal, subprocess, sys, tempfile, threading, time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

HERE = os.path.dirname(os.path.abspath(__file__))
SCRIPT = os.path.join(HERE, 'scene_selftest.py')
A1, A10 = 'fxA1', 'fxA10'
INIT = {
    'profiles': {'drgbsc': {'channels': ['dimmer', 'r', 'g', 'b', 'strobe', 'color']}, 'drgb': {'channels': ['dimmer', 'r', 'g', 'b']}},
    'fixtures': [{'id': A1, 'name': 'Light A1', 'universe': 0, 'address': 1, 'profile': 'drgbsc', 'on': True,
                  'values': {'dimmer': 0, 'r': 255, 'g': 255, 'b': 255, 'strobe': 0, 'color': 0}},
                 {'id': A10, 'name': 'Light A10', 'universe': 0, 'address': 10, 'profile': 'drgb', 'on': True,
                  'values': {'dimmer': 0, 'r': 255, 'g': 255, 'b': 255}}],
    'scenes': [
        {'id': 'muth01', 'name': 'MUTH 01', 'fadeMs': 8000, 'raw': {}, 'lfos': [],
         'fixtures': [{'id': A1, 'on': True, 'values': {'dimmer': 90, 'r': 70, 'g': 0, 'b': 160, 'strobe': 0, 'color': 0}},
                      {'id': A10, 'on': True, 'values': {'dimmer': 50, 'r': 120, 'g': 0, 'b': 18}}]},
        {'id': 'muth08', 'name': 'MUTH 08', 'fadeMs': 15000, 'raw': {},
         'lfos': [{'id': 'drift', 'enabled': True, 'channel': 'b', 'beats': 4, 'depth': 70, 'targets': {'ids': [A1]}}],
         'fixtures': [{'id': A1, 'on': True, 'values': {'dimmer': 120, 'r': 70, 'g': 0, 'b': 100, 'strobe': 0, 'color': 0}},
                      {'id': A10, 'on': True, 'values': {'dimmer': 60, 'r': 210, 'g': 0, 'b': 28}}]},
        {'id': 'muth00', 'name': 'MUTH 00', 'fadeMs': 3000, 'raw': {}, 'lfos': [],
         'fixtures': [{'id': A1, 'on': True, 'values': {'dimmer': 60, 'r': 70, 'g': 0, 'b': 160, 'strobe': 0, 'color': 0}},
                      {'id': A10, 'on': True, 'values': {'dimmer': 25, 'r': 120, 'g': 0, 'b': 18}}]}],
    'looks': [{'id': i, 'measure': 1, 'steps': [{'values': {A1: {'dimmer': 200}, A10: {'dimmer': 40}}},
                                               {'values': {A1: {'dimmer': 40}, A10: {'dimmer': 200}}}]}
              for i in ('muth01', 'muth08', 'muth00')],
    'raw': {'0:1': 255, '0:2': 0, '0:3': 0, '0:4': 255, '0:5': 0, '0:6': 0, '0:7': 0,
            '0:10': 255, '0:11': 255, '0:12': 255, '0:13': 255, '0:14': 255, '0:15': 121},
    'activeScene': None, 'layers': [], 'lfos': [], 'master': 255, 'blackout': False,
    'fx': {'mode': 'none', 'bpm': 120, 'enabled': False, 'epoch': 0},
    'chase': {'enabled': False}, 'audioCfg': {'enabled': False}, 'cues': {'running': False},
}
INIT['rawOwners'] = {k: 'owner' for k in INIT['raw']}
LASER = {'liveId': None, 'live': None, 'blackout': False, 'master': 1,
         'cubes': [{'id': 'cube-1', 'on': True, 'driving': False, 'dark': False, 'engineDark': None, 'held': None}]}


class Desk:
    def __init__(self, fault=''):
        self.s = copy.deepcopy(INIT)
        self.fault, self.n = fault, {}
        self.lock = threading.Lock()

    def bump(self, k):
        self.n[k] = self.n.get(k, 0) + 1
        return self.n[k]

    def dmx(self):
        s, out, now = self.s, [0] * 512, time.time()
        fx = {f['id']: f for f in s['fixtures']}
        for f in s['fixtures']:
            names = s['profiles'][f['profile']]['channels']
            vals = dict(f['values']) if f.get('on', True) else {n: 0 for n in names}
            for l in s['lfos']:
                if f['id'] in (l.get('targets') or {}).get('ids', []) and l['channel'] in vals:
                    vals[l['channel']] = max(0, min(255, int(vals[l['channel']] + l['depth'] * math.sin(now))))
            for lay in s['layers']:
                look = next(x for x in s['looks'] if x['id'] == lay['lookId'])
                k = int(((now - lay['t0']) * 2) % len(look['steps']))   # 120 BPM, one step per beat
                cell = look['steps'][k]['values'].get(f['id'])
                if cell:
                    vals['dimmer'] = cell['dimmer']
            for i, n in enumerate(names):
                out[f['address'] - 1 + i] = vals.get(n, 0)
        for key, v in s['raw'].items():
            out[int(key.split(':')[1]) - 1] = v
        return out

    def handle(self, method, path, body):
        s = self.s
        if method == 'GET':
            if path == '/laser':
                return 200, LASER
            if path == '/api/state':
                return 200, s
            if path == '/api/summary':
                return 200, {'output': {'enabled': True, 'connected': True}}
            if path == '/api/clock':
                return 200, {'bpm': 120, 'up': True}
            if path == '/api/dmx':
                return 200, {'dmx': {'0': self.dmx()}}
            if path == '/api/raw':
                return 200, {'holds': [{'key': k, 'value': v, 'owner': s['rawOwners'].get(k, 'owner')} for k, v in s['raw'].items()]}
            return 404, {'error': 'no route'}
        if path == '/api/raw':
            n = self.bump('raw')
            if self.fault == 'raw500_on_restore' and n == 2:
                return 500, {'error': 'injected'}
            owner, refused = body.get('owner', 'owner'), {}
            for c in body.get('channels', []):
                key = f"{c.get('universe', 0)}:{c['channel']}"
                if c.get('value') is None:
                    if key in s['raw'] and s['rawOwners'].get(key) != owner:
                        refused[s['rawOwners'][key]] = refused.get(s['rawOwners'][key], 0) + 1
                    else:
                        s['raw'].pop(key, None); s['rawOwners'].pop(key, None)
                else:
                    s['raw'][key] = c['value']; s['rawOwners'][key] = owner
            out = {'ok': True, 'raw': s['raw'], 'rawOwners': s['rawOwners']}
            if refused:
                out['refused'] = refused
            if self.fault == 'lost_first_raw' and n == 1:
                return 'SLEEP', out
            return 200, out
        if path == '/api/scenes/recall':
            sc = next((x for x in s['scenes'] if x['id'] == body['id']), None)
            if not sc:
                return 200, {'ok': False}
            owner = body.get('owner', 'owner')
            for sf in sc['fixtures']:
                f = next(x for x in s['fixtures'] if x['id'] == sf['id'])
                f['on'] = sf.get('on', True); f['values'].update(sf['values'])
            for k in [k for k, o in s['rawOwners'].items() if o == owner]:
                s['raw'].pop(k, None); s['rawOwners'].pop(k, None)
            if isinstance(sc.get('lfos'), list):
                s['lfos'] = copy.deepcopy(sc['lfos'])
            s['activeScene'] = sc['id']
            return 200, {'ok': True}
        if path == '/api/looks/fire':
            s['layers'] = [l for l in s['layers'] if l['id'] != 'cue'] + [{'id': 'cue', 'lookId': body['id'], 't0': time.time()}]
            return 200, {'ok': True}
        if path == '/api/layers/remove':
            if not any(l['id'] == body['id'] for l in s['layers']):
                return 404, {'error': 'no such layer'}
            s['layers'] = [l for l in s['layers'] if l['id'] != body['id']]
            return 200, {'ok': True}
        if path == '/api/fixture':
            n = self.bump('fixture')
            if self.fault == 'fixture500_once' and n == 1:
                return 500, {'error': 'injected'}
            f = next(x for x in s['fixtures'] if x['id'] == body['id'])
            f['values'].update(body.get('values') or {})
            if 'on' in body:
                f['on'] = body['on']
            s['activeScene'] = None
            return 200, {'ok': True, 'fixture': f}
        if path == '/api/lfos':
            s['lfos'] = body['lfos']
            return 200, {'ok': True, 'lfos': s['lfos']}
        return 404, {'error': 'no route'}


def serve(desk):
    class H(BaseHTTPRequestHandler):
        def log_message(self, *a):
            pass

        def go(self, method):
            body = json.loads(self.rfile.read(int(self.headers.get('Content-Length') or 0)) or b'null') if method == 'POST' else None
            with desk.lock:
                code, out = desk.handle(method, self.path, body)
            if code == 'SLEEP':           # applied, but the reply never arrives in time
                time.sleep(7)
                code = 200
            data = json.dumps(out).encode()
            self.send_response(code)
            self.send_header('Content-Type', 'application/json'); self.send_header('Content-Length', str(len(data)))
            self.end_headers(); self.wfile.write(data)

        def do_GET(self):
            self.go('GET')

        def do_POST(self):
            self.go('POST')
    srv = ThreadingHTTPServer(('127.0.0.1', 0), H)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv


def same_as_found(desk):
    s, i = desk.s, INIT
    keys = ('raw', 'rawOwners', 'activeScene', 'layers', 'lfos', 'fixtures', 'master', 'blackout', 'fx')
    return {k: s[k] == i[k] for k in keys if s[k] != i[k]} == {}, {k: (s[k], i[k]) for k in keys if s[k] != i[k]}


def run_case(name, fault='', signal_at=None, sig=signal.SIGTERM, second_sig=None, kill9_at=None):
    desk = Desk(fault)
    srv = serve(desk)
    port = srv.server_address[1]
    tmp = tempfile.mkdtemp(prefix='sst-')
    sheet = os.path.join(tmp, 'sheet.md')
    open(sheet, 'w').write('### MUTH 01 A — 120 BPM\n### MUTH 08 B — 130 BPM\n### MUTH 00 C — 120 BPM\n')
    out, state = os.path.join(tmp, 'out.json'), os.path.join(tmp, 'found.json')
    cmd = [sys.executable, SCRIPT, '--run', '--prefix', 'muth', '--runsheet', sheet, '--sample-s', '1',
           '--base', f'http://127.0.0.1:{port}/api', '--laser-state', f'http://127.0.0.1:{port}/laser',
           '--out', out, '--state-file', state]
    p = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
    trigger = signal_at or kill9_at
    if trigger:
        t_end = time.time() + 30
        while time.time() < t_end:
            try:
                if any(trigger in w for _, w in json.load(open(out))['progress']):
                    break
            except (OSError, ValueError, KeyError):
                pass
            time.sleep(0.02)
        if kill9_at:
            p.send_signal(signal.SIGKILL)
        else:
            p.send_signal(sig)
            if second_sig:
                time.sleep(0.00005)
                p.send_signal(second_sig)
    text, _ = p.communicate(timeout=180)
    rc = p.returncode
    if kill9_at:
        r = subprocess.run([sys.executable, SCRIPT, '--restore', state, '--out', out + '.restore'], capture_output=True, text=True, timeout=180)
        rc, text = r.returncode, text + r.stdout + r.stderr
    ok, diff = same_as_found(desk)
    srv.shutdown()
    print(f'{name:28s} exit {rc}  desk as found: {ok}  {"" if ok else json.dumps(diff)[:300]}')
    last = [l for l in text.splitlines() if l.startswith(('mode=', 'restore'))]
    print('   ', ' | '.join(last)[:300])
    return ok


results = [
    run_case('happy path'),
    run_case('lost reply on release', fault='lost_first_raw'),
    run_case('SIGTERM while sampling', signal_at='muth08 look fired'),
    run_case('SIGHUP + SIGTERM 50 us', signal_at='muth01 look fired', sig=signal.SIGHUP, second_sig=signal.SIGTERM),
    run_case('fixture 500 once in restore', fault='fixture500_once', signal_at='muth01 recalled'),
    run_case('raw 500 on re-hold', fault='raw500_on_restore', signal_at='muth01 recalled'),
    run_case('kill -9, then --restore', kill9_at='muth08 look fired'),
]
print(f'{sum(results)}/{len(results)} cases end with the desk exactly as found')
sys.exit(0 if all(results) else 1)
