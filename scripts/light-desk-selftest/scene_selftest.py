#!/usr/bin/env python3
"""Light-desk scene self-test, run ON the machine that drives the lights (stdlib only). v2, 2026-10-31:
fixes from review wf_9e4a6b54-9f2 (two Opus skeptics): LFO restore, flags set BEFORE each POST, per-step retrying
restore + verify + second pass, signals only set a flag, found state fsynced to disk before the first POST with a
--restore mode, WCAG-style flash count in any 1 s at show tempo, and the proof decides the exit code.

For each scene: recall it (fade 0) under a test owner, read the DMX frame and compare every patched channel with the
scene's values (channels an LFO of that scene drives are reported, not compared); fire the look of the same id on the
cue layer, sample the frame, check that only dimmers move (LFO channels apart), inside the look's step range, and count
flashes. Then put everything back exactly as found and prove it. The laser desk is only READ, never posted to.

Flash proxy (unvalidated for LED dimmer curves): W3C WCAG 2.2 SC 2.3.1 "Three Flashes or Below Threshold". A flash is a
pair of opposing changes of >= 10 % of full scale on the DMX dimmer channel (26 of 255). The desk clock runs at the BPM
read at start; looks are beat-based, so a 1 s window at the show BPM is a window of show_bpm/clock_bpm s at the clock
BPM. Pass = at most 3 flashes in any such window. Sampling is 20 Hz, so flicker above 10 Hz would alias.

  python3 scene_selftest.py --dry --prefix muth [--runsheet FILE]     # GETs only; prints the plan
  python3 scene_selftest.py --run --prefix muth [--runsheet FILE]     # live test + exact restore + proof
  python3 scene_selftest.py --restore /tmp/scene-selftest.found.json  # put a dead run's found state back (idempotent)
Exit: 0 = test ran and the desk is proven as found; 1 = aborted but restored; 2 = RESTORE INCOMPLETE.
"""
import argparse, json, os, re, signal, sys, time, urllib.error, urllib.request

ap = argparse.ArgumentParser()
mode = ap.add_mutually_exclusive_group(required=True)
mode.add_argument('--dry', action='store_true')
mode.add_argument('--run', action='store_true')
mode.add_argument('--restore', metavar='STATE_FILE')
ap.add_argument('--base', default='http://127.0.0.1:4000/serverXR/light/api')
ap.add_argument('--laser-state', default='http://127.0.0.1:4000/laser/desk/api/state')
ap.add_argument('--prefix', default='')
ap.add_argument('--runsheet', default='', help='optional markdown with "### NAME NN ... — BPM BPM" headings')
ap.add_argument('--release', default='1,2,3,4,5,6,10,11,12,13', help='held, patched channels (universe 0) released for the test')
ap.add_argument('--hold-owner', default='owner')
ap.add_argument('--test-owner', default='scene-selftest')
ap.add_argument('--sample-s', type=float, default=8.0)
ap.add_argument('--every-ms', type=int, default=50)
ap.add_argument('--timeout', type=float, default=5.0)
ap.add_argument('--out', default='/tmp/scene-selftest.json')
ap.add_argument('--state-file', default='/tmp/scene-selftest.found.json')
a = ap.parse_args()
LIVE = bool(a.run or a.restore)

LOG = {'mode': 'run' if a.run else ('restore' if a.restore else 'dry'), 'started': time.strftime('%F %T %z'),
       'method': {'flash': 'WCAG 2.2 SC 2.3.1 proxy: opposing dimmer changes >= 26/255; flashes = transitions // 2 in any '
                           '1 s at show BPM (window show_bpm/clock_bpm s at clock BPM); pass <= 3; 20 Hz sampling, '
                           'aliasing above 10 Hz; dimmer is not luminance (LED curve unvalidated)',
                  'static': 'recall fadeMs 0, read GET /dmx after 0.3 s; channels driven by the scene LFOs excluded'},
       'progress': [], 'calls': [], 'checks': [], 'scenes': [], 'restore': {}, 'abort': None}
SIGS = (signal.SIGTERM, signal.SIGHUP, signal.SIGINT)
STOP = {'sig': None}


class Stop(Exception):
    pass


def on_signal(signum, _frame):
    for s in SIGS:                      # a second signal can never interrupt the unwind or the restore
        signal.signal(s, signal.SIG_IGN)
    STOP['sig'] = signum                # nothing is raised inside a request; the loop checks the flag


for _s in SIGS:
    signal.signal(_s, on_signal)


def write_json(path, obj, sync=False):
    tmp = path + '.tmp'
    with open(tmp, 'w', encoding='utf-8') as fh:
        json.dump(obj, fh, indent=1)
        if sync:
            fh.flush()
            os.fsync(fh.fileno())
    os.replace(tmp, path)


def checkpoint(where):
    LOG['progress'].append([time.strftime('%T'), where])
    write_json(a.out, LOG)
    if STOP['sig']:
        raise Stop(f'signal {STOP["sig"]} at {where}')


def http(method, path, body=None, base=None):
    url = (base if base is not None else a.base) + path
    data = None if body is None else json.dumps(body).encode()
    req = urllib.request.Request(url, data=data, method=method,
                                 headers={'Content-Type': 'application/json'} if data is not None else {})
    t0 = time.monotonic()
    try:
        with urllib.request.urlopen(req, timeout=a.timeout) as r:
            code, raw = r.status, r.read()
    except urllib.error.HTTPError as e:
        code, raw = e.code, e.read()
    ms = round((time.monotonic() - t0) * 1000, 1)
    try:
        out = json.loads(raw or b'null')
    except ValueError:
        out = {'_text': raw[:200].decode('utf-8', 'replace')}
    return code, out, ms


def get(path, base=None):
    code, out, _ = http('GET', path, base=base)
    if code != 200:
        raise RuntimeError(f'GET {path} -> {code} {str(out)[:200]}')
    return out


def post(path, body, ok=(200,), need_ok_true=True):
    """--dry sends nothing. A reply outside `ok`, or {ok:false}, raises (HTTP 200 can still carry ok:false)."""
    entry = {'t': time.strftime('%T'), 'POST': path, 'body': body}
    LOG['calls'].append(entry)
    if not LIVE:
        entry['dry'] = True
        return 200, {'ok': True, 'dry': True}
    code, out, ms = http('POST', path, body)
    entry.update(code=code, ms=ms, reply=json.dumps(out)[:300])
    if code not in ok or (need_ok_true and code == 200 and isinstance(out, dict) and out.get('ok') is not True):
        raise RuntimeError(f'POST {path} -> {code} {str(out)[:200]}')
    return code, out


def check(name, ok, detail=''):
    LOG['checks'].append({'check': name, 'ok': bool(ok), 'detail': detail})
    return bool(ok)


def laser_view():
    s = get('', base=a.laser_state)
    return {'liveId': s.get('liveId'), 'live': s.get('live'), 'blackout': s.get('blackout'), 'master': s.get('master'),
            'cubes': [{k: c.get(k) for k in ('id', 'on', 'driving', 'dark', 'engineDark', 'held')} for c in s.get('cubes', [])]}


def frame():
    return get('/dmx')['dmx']['0']


def desk_view(st):
    """Everything the restore must bring back, in comparable form."""
    return {
        'raw': dict(st.get('raw') or {}), 'rawOwners': dict(st.get('rawOwners') or {}),
        'fixtures': {f['id']: {'on': f.get('on', True), 'values': dict(f['values'])} for f in st['fixtures']},
        'activeScene': st.get('activeScene'), 'layers': st.get('layers') or [], 'lfos': st.get('lfos') or [],
        'fx': st.get('fx'), 'master': st.get('master'), 'blackout': bool(st.get('blackout')),
        'chase_enabled': bool((st.get('chase') or {}).get('enabled')),
        'audio_enabled': bool((st.get('audioCfg') or {}).get('enabled')),
        'cues_running': bool((st.get('cues') or {}).get('running')),
    }


# ---------------------------------------------------------------- restore (shared by the finally and --restore)
def retry(name, fn, delays=(0, 0.5, 1, 2, 4, 8, 16, 30)):
    last = None
    for i, d in enumerate(delays):
        if d:
            time.sleep(d)
        try:
            fn()
            LOG['restore'].setdefault('steps', []).append([name, 'ok', i + 1])
            return True
        except Exception as e:  # noqa: BLE001 -- every restore step retries on any failure
            last = f'{type(e).__name__}: {e}'
    LOG['restore'].setdefault('steps', []).append([name, 'FAILED', last])
    return False


def restore(found, release, hold_owner, flags):
    """Idempotent steps, each retried ~60 s; order: cue layer, LFOs, fixtures, holds."""
    def remove_cue():
        post('/layers/remove', {'id': 'cue'}, ok=(200, 404), need_ok_true=False)

    def put_lfos():
        post('/lfos', {'lfos': found['lfos']})

    def put_fixtures():
        for fid, fv in found['fixtures'].items():
            post('/fixture', {'id': fid, 'values': fv['values'], 'on': fv['on']})

    def put_holds():
        now = {h['key']: h['owner'] for h in get('/raw').get('holds', [])}
        chans, skipped = [], []
        for c in release:
            key = f'0:{c}'
            if key not in found['raw']:
                continue
            if key in now and now[key] != hold_owner:   # a newer hand took it: never overwrite another owner
                skipped.append(f'{key} held by {now[key]}')
                continue
            chans.append({'universe': 0, 'channel': c, 'value': found['raw'][key]})
        if skipped:
            LOG['restore']['not_overwritten'] = skipped
        if chans:
            _, rep = post('/raw', {'owner': hold_owner, 'channels': chans})
            if rep.get('refused'):
                raise RuntimeError(f'refused {rep["refused"]}')

    ok = True
    if flags.get('fired'):
        ok &= retry('cue layer', remove_cue)
    if flags.get('recalled'):
        ok &= retry('lfos', put_lfos)
        ok &= retry('fixtures', put_fixtures)
    if flags.get('released'):
        ok &= retry('holds', put_holds)
    return ok


def verify(found, dmx32_found, laser_before):
    r = {}
    try:
        after = desk_view(get('/state'))
        for k in ('raw', 'rawOwners', 'fixtures', 'activeScene', 'layers', 'lfos', 'fx', 'master', 'blackout',
                  'chase_enabled', 'audio_enabled', 'cues_running'):
            r[k + '_same'] = after[k] == found[k]
        d = frame()[:32]
        r['dmx32_same'] = d == dmx32_found
        if not r['dmx32_same']:
            r['dmx32_diff'] = {i + 1: [dmx32_found[i], d[i]] for i in range(32) if d[i] != dmx32_found[i]}
        if laser_before is not None:
            r['laser_untouched'] = laser_view() == laser_before
    except Exception as e:  # noqa: BLE001
        r['verify_error'] = f'{type(e).__name__}: {e}'
    return r


def restore_and_prove(found, dmx32_found, laser_before, release, hold_owner, flags):
    for s in SIGS:
        signal.signal(s, signal.SIG_IGN)
    LOG['restore']['pass1'] = restore(found, release, hold_owner, flags)
    v = verify(found, dmx32_found, laser_before)
    if 'verify_error' in v or not all(x for k, x in v.items() if k.endswith('_same') or k == 'laser_untouched'):
        LOG['restore']['pass2'] = restore(found, release, hold_owner, {'fired': True, 'recalled': True, 'released': True})
        v = verify(found, dmx32_found, laser_before)
    LOG['restore']['proof'] = v
    good = 'verify_error' not in v and all(x for k, x in v.items() if k.endswith('_same') or k == 'laser_untouched')
    LOG['restore']['complete'] = good
    return good


# ---------------------------------------------------------------- --restore mode
if a.restore:
    saved = json.load(open(a.restore, encoding='utf-8'))
    a.base, a.laser_state = saved['base'], saved['laser_state']
    good = restore_and_prove(saved['found'], saved['dmx32'], saved['laser_before'], saved['release'], saved['hold_owner'],
                             {'fired': True, 'recalled': True, 'released': True})
    LOG['ended'] = time.strftime('%F %T %z')
    write_json(a.out, LOG)
    print('restore', 'complete' if good else 'RESTORE INCOMPLETE', json.dumps(LOG['restore']['proof'])[:600])
    sys.exit(0 if good else 2)

if not a.prefix:
    sys.exit('--prefix is required for --dry and --run')

# ---------------------------------------------------------------- read everything (no POST before every precheck passes)
state = get('/state')
summary = get('/summary')
clock = get('/clock')
laser_before = laser_view()
LOG['laser_before'] = laser_before
profiles = state['profiles']
fixtures = {f['id']: f for f in state['fixtures']}
chmap = {}
for f in state['fixtures']:
    if (f.get('universe') or 0) != 0:
        sys.exit(f'fixture {f["name"]} is on universe {f.get("universe")}; this test reads universe 0 only')
    chmap[f['id']] = [(f['address'] - 1 + i, n) for i, n in enumerate(profiles[f['profile']]['channels'])]
patched = {idx + 1 for chans in chmap.values() for idx, _ in chans}
scenes = [s for s in state['scenes'] if s['id'].startswith(a.prefix)]
scenes.sort(key=lambda s: (s['id'] == f'{a.prefix}00', s['id']))   # 01..09 first, 00 (the quiet one) last
looks = {l['id']: l for l in state['looks']}
RELEASE = [int(x) for x in a.release.split(',') if x.strip()]
bpm_show = {}
if a.runsheet:
    for line in open(a.runsheet, encoding='utf-8'):
        m = re.match(r'^###\s+\S+\s+(\d\d)\b.*?(\d+(?:\.\d+)?)\s*BPM', line)
        if m:
            bpm_show[f'{a.prefix}{m.group(1)}'] = float(m.group(2))


def lfo_channels(scene):
    out = set()
    for l in scene.get('lfos') or []:
        if not l.get('enabled', True):
            continue
        ids = ((l.get('targets') or {}).get('ids')) or list(fixtures)
        for fid in ids:
            out.add((fid, l.get('channel')))
    return out


found = desk_view(state)
dmx32_found = frame()[:32]
LOG['found'] = found
LOG['dmx32_found'] = dmx32_found
LOG['clock_start'] = clock.get('bpm')
held_unpatched = sorted(int(k.split(':')[1]) for k in found['raw'] if k.startswith('0:') and int(k.split(':')[1]) not in patched)
out = summary.get('output') or {}
pre = [
    check('output enabled + connected', out.get('enabled') and out.get('connected'), json.dumps(out)[:160]),
    check('blackout off, master 255', not found['blackout'] and found['master'] == 255, f"{found['blackout']} {found['master']}"),
    check('chase, cues, audio, fx effect all off', not (found['chase_enabled'] or found['cues_running'] or found['audio_enabled']
                                                      or (found['fx'] or {}).get('enabled'))),
    check('no layers, no LFOs, no active scene (the restore can only produce null)',
          not found['layers'] and not found['lfos'] and found['activeScene'] is None),
    check(f'scenes with prefix {a.prefix!r}', len(scenes) > 0, ','.join(s['id'] for s in scenes)),
    check('every scene has a look of the same id', all(s['id'] in looks for s in scenes),
          ','.join(s['id'] for s in scenes if s['id'] not in looks)),
    check('no scene carries raw holds, fx or audio', all(not s.get('raw') and 'fx' not in s and 'audioCfg' not in s for s in scenes)),
    check('every scene has a show BPM from the run sheet', (not a.runsheet) or all(s['id'] in bpm_show for s in scenes),
          ','.join(s['id'] for s in scenes if s['id'] not in bpm_show)),
    check('release channels are patched and never the held unpatched ones', set(RELEASE) <= patched and not set(RELEASE) & set(held_unpatched),
          f'release {RELEASE} patched {sorted(patched)} held_unpatched {held_unpatched}'),
    check('release channels held only by the hold owner', all(found['rawOwners'].get(f'0:{c}', a.hold_owner) == a.hold_owner for c in RELEASE)),
    check('no hold owned by the test owner', a.test_owner not in found['rawOwners'].values()),
    check('laser not live', laser_before['liveId'] is None and not any(c.get('driving') for c in laser_before['cubes']),
          json.dumps(laser_before)[:200]),
]
LOG['scene_lfos'] = {s['id']: sorted(f'{fixtures[f]["name"]}:{c}' for f, c in lfo_channels(s)) for s in scenes if lfo_channels(s)}
if not all(pre):
    LOG['abort'] = 'precheck failed: ' + ', '.join(c['check'] for c in LOG['checks'] if not c['ok'])

# the found state reaches the disk (fsync) before the first POST, with what --restore needs
if a.run and not LOG['abort']:
    write_json(a.state_file, {'base': a.base, 'laser_state': a.laser_state, 'found': found, 'dmx32': dmx32_found,
                              'laser_before': laser_before, 'release': RELEASE, 'hold_owner': a.hold_owner,
                              'written': time.strftime('%F %T %z')}, sync=True)
flags = {'released': False, 'recalled': False, 'fired': False}


def expected_errors(scene, fr, skip):
    errs = []
    for sf in scene['fixtures']:
        for idx, name in chmap.get(sf['id'], []):
            if (sf['id'], name) in skip or name not in sf['values'] or not sf.get('on', True):
                continue
            want = int(sf['values'][name])
            if abs(fr[idx] - want) > 1:
                errs.append(f'{fixtures[sf["id"]]["name"]} {name} ch{idx + 1}: want {want} got {fr[idx]}')
    return errs


def transitions(series, thr=26):
    """Times of opposing changes >= thr (hysteresis): each rise or fall counts once."""
    if not series:
        return []
    out, direction, lo, hi = [], 0, series[0][1], series[0][1]
    for t, v in series:
        lo, hi = min(lo, v), max(hi, v)
        if direction >= 0 and hi - v >= thr:
            out.append(t)
            direction, lo, hi = -1, v, v
        elif direction <= 0 and v - lo >= thr:
            out.append(t)
            direction, lo, hi = 1, v, v
    return out


def max_flashes(times, window_s):
    best = 0
    for i, t0 in enumerate(times):
        n = sum(1 for u in times[i:] if u < t0 + window_s)
        best = max(best, n // 2)
    return best


def step_dimmers(look, fid):
    vals = []
    for st in look.get('steps', []):
        cell = (st.get('values') or {}).get(fid) or (st.get('values') or {}).get('*') or {}
        v = cell.get('dimmer')
        if isinstance(v, (int, float)):
            vals.append(v)
        elif v is not None:
            return None          # a {ref} cell: no fixed range to check
    return vals


rc = 0
try:
    checkpoint('prechecks done')
    if LOG['abort']:
        raise Stop(LOG['abort'])
    rel = [{'universe': 0, 'channel': c, 'value': None} for c in RELEASE if f'0:{c}' in found['raw']]
    if rel:
        flags['released'] = True                       # BEFORE the POST: a lost reply still gets undone
        _, rep = post('/raw', {'owner': a.hold_owner, 'channels': rel})
        if LIVE:
            kept = {k: v for k, v in found['raw'].items() if int(k.split(':')[1]) not in RELEASE}
            good = not rep.get('refused') and all(rep['raw'].get(k) == v for k, v in kept.items()) \
                and not any(f'0:{c}' in rep['raw'] for c in RELEASE)
            if not check('only the listed holds released, the others kept', good, json.dumps(rep.get('raw'))[:200]):
                raise RuntimeError('release did not do exactly what was planned')
    checkpoint('released')
    clock_bpm = float(clock.get('bpm') or 120)
    dt = a.every_ms / 1000.0
    for sc in scenes:
        row = {'id': sc['id'], 'name': sc['name'], 'show_bpm': bpm_show.get(sc['id'])}
        skip = lfo_channels(sc)
        flags['recalled'] = True
        post('/scenes/recall', {'id': sc['id'], 'fadeMs': 0, 'owner': a.test_owner})
        checkpoint(f'{sc["id"]} recalled')
        if LIVE:
            time.sleep(0.3)
            fr = frame()
            row['static_errors'] = expected_errors(sc, fr, skip)
            row['lfo_channels'] = sorted(f'{fixtures[f]["name"]}:{c}' for f, c in skip)
            row['static_frame'] = fr[:24]
            row['other_holds_kept'] = all(fr[int(k.split(':')[1]) - 1] == v for k, v in found['raw'].items()
                                          if int(k.split(':')[1]) not in RELEASE)
        flags['fired'] = True
        post('/looks/fire', {'id': sc['id']})
        checkpoint(f'{sc["id"]} look fired')
        if LIVE:
            look = looks[sc['id']]
            series = {fid: [] for fid in chmap}
            t_start = time.monotonic()
            lat = []
            for _ in range(int(a.sample_s / dt)):
                if STOP['sig']:
                    raise Stop(f'signal {STOP["sig"]} while sampling {sc["id"]}')
                t0 = time.monotonic()
                fr = frame()
                lat.append((time.monotonic() - t0) * 1000)
                for fid, chans in chmap.items():
                    series[fid].append((t0 - t_start, {name: fr[idx] for idx, name in chans}))
                rest = dt - (time.monotonic() - t0)
                if rest > 0:
                    time.sleep(rest)
            row['dmx_get_ms'] = {'median': round(sorted(lat)[len(lat) // 2], 1), 'max': round(max(lat), 1), 'n': len(lat)}
            window = (row['show_bpm'] / clock_bpm) if row['show_bpm'] else 1.0
            per = {}
            for fid, ser in series.items():
                name = fixtures[fid]['name']
                dims = [(t, v.get('dimmer', 0)) for t, v in ser]
                moved = {}
                for ch in (k for k in ser[0][1] if k != 'dimmer'):
                    vals = [v[ch] for _, v in ser]
                    if max(vals) - min(vals) > 1:
                        moved[ch] = [min(vals), max(vals)]
                steps = step_dimmers(look, fid)
                lo, hi = min(v for _, v in dims), max(v for _, v in dims)
                tr = transitions(dims)
                per[name] = {
                    'dimmer_min': lo, 'dimmer_max': hi, 'look_steps': steps,
                    'inside_steps': 'n/a' if not steps else (min(steps) - 2 <= lo and hi <= max(steps) + 2),
                    'non_dimmer_moved': {k: v for k, v in moved.items() if (fid, k) not in skip},
                    'lfo_moved': {k: v for k, v in moved.items() if (fid, k) in skip},
                    'max_flashes_in_1s_at_show_bpm': max_flashes(tr, window),
                    'transitions_per_s_at_clock': round(len(tr) / max(ser[-1][0] - ser[0][0], dt), 2),
                }
            row['look'] = per
        _, rep = post('/layers/remove', {'id': 'cue'})
        checkpoint(f'{sc["id"]} cue removed')
        LOG['scenes'].append(row)
    if LIVE:
        LOG['clock_end'] = get('/clock').get('bpm')
        check('desk clock BPM unchanged during the run', LOG['clock_end'] == LOG['clock_start'],
              f"{LOG['clock_start']} -> {LOG['clock_end']}")
except Stop as e:
    LOG['abort'] = LOG['abort'] or str(e)
except Exception as e:  # noqa: BLE001 -- any failure must still reach the restore
    LOG['abort'] = f'{type(e).__name__}: {e}'
finally:
    if LIVE and any(flags.values()):
        good = restore_and_prove(found, dmx32_found, laser_before, RELEASE, a.hold_owner, flags)
        rc = 0 if good and not LOG['abort'] else (1 if good else 2)
    elif LOG['abort']:
        rc = 1
    LOG['ended'] = time.strftime('%F %T %z')
    LOG['exit'] = rc
    write_json(a.out, LOG)
    try:
        with open(a.out + '.done', 'w', encoding='utf-8') as fh:
            fh.write(f'{rc}\n')
    except OSError:
        pass

# ---------------------------------------------------------------- short report
print(f"mode={LOG['mode']} exit={rc} abort={LOG['abort']} out={a.out}")
for c in LOG['checks']:
    if not c['ok']:
        print(f"CHECK FAIL {c['check']}: {c['detail']}")
print(f"checks ok {sum(c['ok'] for c in LOG['checks'])}/{len(LOG['checks'])}; posts {len(LOG['calls'])}; scene LFOs {LOG['scene_lfos']}")
for row in LOG['scenes']:
    if 'look' not in row:
        print(f"{row['id']} planned")
        continue
    worst = max(v['max_flashes_in_1s_at_show_bpm'] for v in row['look'].values())
    moved = {n: v['non_dimmer_moved'] for n, v in row['look'].items() if v['non_dimmer_moved']}
    inside = [v['inside_steps'] for v in row['look'].values()]
    print(f"{row['id']} bpm {row['show_bpm']} static_err {len(row['static_errors'])} holds_kept {row['other_holds_kept']} "
          f"inside_steps {inside} non_dimmer_moved {moved or '-'} max_flashes/1s@show {worst} get_ms {row['dmx_get_ms']['median']}")
    for e in row['static_errors'][:3]:
        print('   ', e)
if LOG['restore']:
    print('restore', 'complete' if LOG['restore'].get('complete') else 'RESTORE INCOMPLETE',
          json.dumps(LOG['restore'].get('proof', {}), separators=(',', ':'))[:500])
sys.exit(rc)
