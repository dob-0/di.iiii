// @vitest-environment node
//
// The armed-tab behaviour of ui/app.js (PR #1394, round 2): the live mirror, ARM never stored, the remembered input,
// the fast poll, urgent sends. app.js is a browser script, so each function is cut out of its source and run here
// with the page's globals stubbed (the same way identify.test.js cuts out wireName). A function that is renamed or
// removed makes grab() throw, which fails the test.
import fs from 'node:fs'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

const require = createRequire(import.meta.url)
const SRC = fs.readFileSync(path.join(__dirname, 'ui/app.js'), 'utf8')
const grab = (name) => {
  const one = SRC.match(new RegExp('^function ' + name + '\\([^)]*\\) \\{.*\\}$', 'm'))   // a one-line function
  if (one) return one[0]
  const m = SRC.match(new RegExp('(?:async )?function ' + name + '\\([^)]*\\) \\{[\\s\\S]*?\\n\\}\\n'))
  if (!m) throw new Error('app.js has no function ' + name)
  return m[0]
}
const grabLine = (re) => {
  const m = SRC.match(re)
  if (!m) throw new Error('app.js has no line ' + re)
  return m[0]
}

// One page: the MIDI half of app.js with stubbed globals. `o` seeds the desk's state, the ports and the storage.
function page(o = {}) {
  const log = { sends: [], fetches: [], paints: 0, draws: 0, resets: 0, onAirApplied: 0, say: [], flashes: [], leds: [] }
  const store = Object.assign({}, o.store || {})
  const ports = o.ports || []
  const els = {}
  const $ = (sel) => (els[sel] ||= { className: '', textContent: '', innerHTML: '', value: '', selectedOptions: [], addEventListener() {} })
  const body = `
    let S = ${JSON.stringify(o.S === undefined ? null : o.S)};
    let midiArmed = false, midiLiveWait = false, midiFlushing = false, midiFlushTimer = null, midiInput = null, midiMapLoaded = true;
    let midiAccessReady = false, midiRestored = false, midiOnAirTimer = null, midiOnAirGone = false, midiClaim = null;
    let midiBlackoutOv = null, touchedAt = 0, midiMsgCount = 0, midiAccess = A.access;
    const midiLive = { master: 255, blackout: false, fxDepth: 255, fxBpm: 120, fxMode: null, fxOn: false, holdMs: 2000, fadeMs: 800, chase: false, allDim: 255 };
    const midiPickup = {}, midiLastVal = {}, midiMap = A.map, midiPending = new Map(), midiLedSent = new Set();
    const midiTabId = 'tab';
    const midiTargets = [], midiReleaseAll = () => {};   // the APC40 patch's hold release and relative-knob exemption (#1397)
    const window = { deskMidiCues: A.mcl, deskPanicKeys: { midiBlackoutToggle: (b) => ({ blackout: !b }) } };
    const looksOf = () => (Array.isArray(S && S.looks) ? S.looks : []);
    let midiLookPage = 0, midiBlackoutSentAt = 0;
    const midiCueSent = {}, CUES = null;
    const midiFlash = (m) => { L.flashes.push(m); }, midiLookLed = (id) => { L.leds.push(id); };
    const midiPainter = { reset() { L.resets++; } };
    const midiBlackoutNow = () => false;
    const midiDraw = () => { L.draws++; }, midiPaintLights = () => { L.paints++; }, midiLedsOff = () => {}, midiBindLights = () => {};
    const midiLookAnswer = () => {}, midiPill = (s, t) => { L.pill = t; }, midiApplyPreset = () => { L.preset = true; };
    const midiPresetFor = () => null, onMidiMessage = () => {}, say = (t) => { L.say.push(t); }, esc = (t) => String(t);
    const applyOnAir = () => { L.onAirApplied++; return true; };
    const MIDI_PREF_KEY = 'lightdeskMidiPrefs';
    ${grabLine(/const MIDI_ONAIR_MS = \d+;/)}
    ${['midiPrefs', 'midiPrefSet', 'midiRefreshLive', 'midiLiveArrived', 'midiSend', 'midiFlush', 'midiSetArmed', 'midiOnAirTick', 'midiOnAirStart', 'midiOnAirStop', 'midiListInputs', 'midiBindInput', 'midiRestoreTry', 'midiLookPress', 'midiBlackoutPress'].map(grab).join('\n')}
    ${grabLine(/if \(midiPrefs\(\)\.enabled\) midiEnable\(\);/).replace('midiEnable()', 'A.enable()')}
    return {
      get armed() { return midiArmed; }, get wait() { return midiLiveWait; }, live: midiLive, pickup: midiPickup, pending: midiPending,
      get input() { return midiInput; }, get timer() { return midiOnAirTimer; },
      setS(v) { S = v; }, get ov() { return midiBlackoutOv; }, midiLookPress, midiBlackoutPress, midiSetArmed, midiLiveArrived, midiSend, midiOnAirTick, midiListInputs, midiRestoreTry, midiPrefSet, midiPrefs,
    };`
  const A = {
    mcl: require('./ui/midiCues.js'),
    map: o.map || { master: { type: 'cc', ch: 1, num: 14 } },
    enable: () => { log.enabled = true },
    access: { inputs: new Map(ports.map((p) => [p.id, Object.assign({ onmidimessage: null }, p)])) },
  }
  const localStorage = { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v) } }
  const sessionStorage = { getItem: () => { throw new Error('ARM must not be read from sessionStorage') }, setItem: () => { throw new Error('ARM must not be written to sessionStorage') }, removeItem: () => {} }
  const fetch = vi.fn(async (route, init) => { log.fetches.push({ route, body: init && init.body ? JSON.parse(init.body) : null }); return { ok: true, status: 200, json: async () => ({}) } })
  const api = new Function('$', 'A', 'L', 'localStorage', 'sessionStorage', 'fetch', body)($, A, log, localStorage, sessionStorage, fetch)
  pages.push(api)
  return { api, log, store, els, fetch }
}
const pages = []
afterEach(() => { for (const a of pages.splice(0)) if (a.armed) a.midiSetArmed(false) })   // no poll timer outlives its test
const desk = (master = 128, extra = {}) => ({ master, fx: { depth: 100, bpm: 90, mode: 'wave', enabled: true }, chase: { holdMs: 1500, fadeMs: 500, enabled: true }, ...extra })

describe('I1: an armed tab never takes over from the page defaults', () => {
  it('armed before the first state: nothing is sent, then the first state fills the mirror from the desk', async () => {
    const { api, log } = page({ S: null })
    api.midiSetArmed(true)
    expect(api.armed).toBe(true)
    expect(api.wait).toBe(true)
    api.midiSend('api/master', { master: 10 })
    expect([...api.pending.keys()].filter((k) => k !== 'hold:clearflash')).toEqual([])   // only the arm-time clearFlash may wait behind the clear
    expect(log.fetches.filter((f) => f.route !== 'api/onair' && f.route !== 'api/raw' && f.route !== 'api/fx')).toEqual([])   // api/raw + api/fx = the arm-time clear of a stale hit and of a stale software strobe (#1397)
    api.setS(desk(128)); api.midiLiveArrived()
    expect(api.wait).toBe(false)
    expect(api.live.master).toBe(128)        // not the default 255
    expect([api.live.fxDepth, api.live.fxBpm, api.live.holdMs, api.live.fadeMs]).toEqual([100, 90, 1500, 500])
    expect(api.live.chase).toBe(true)        // a running chase: the first press stops it
    expect(api.pickup.master).toBe(true)     // the fader is caught again from the desk's value
    api.midiSend('api/master', { master: 10 })
    await vi.waitFor(() => expect(log.fetches.filter((f) => f.route === 'api/master').length).toBe(1))
  })
  it('armed after a state: read at once, no waiting', () => {
    const { api } = page({ S: desk(64) })
    api.midiSetArmed(true)
    expect(api.wait).toBe(false)
    expect(api.live.master).toBe(64)
  })
  it('a disarm while waiting leaves nothing waiting', () => {
    const { api } = page({ S: null })
    api.midiSetArmed(true); api.midiSetArmed(false)
    expect(api.wait).toBe(false)
  })
  it('the fader path records and returns while waiting for the first state', () => {
    expect(SRC).toMatch(/if \(!midiArmed \|\| midiLiveWait\) \{ midiLastVal\[key\] = unit; return; \}/)
  })
  it('every applied desk state tells the mirror', () => {
    expect(SRC).toMatch(/S = next;\s*midiLiveArrived\(\);/)
  })
})

describe('a stale hit is cleared on ARM (#1397 review L2)', () => {
  it('arming sends one owner-scoped raw clear, so a hit whose release never came cannot stay on', async () => {
    const { api, log } = page({ S: desk() })
    api.midiSetArmed(true)
    await vi.waitFor(() => expect(log.fetches.filter((f) => f.route === 'api/raw').length).toBe(1))
    expect(log.fetches.find((f) => f.route === 'api/raw').body).toEqual({ owner: 'apc40', clear: true })
  })
})

describe('I2: ARM is never stored and never comes back by itself', () => {
  it('app.js keeps no ARM key in any storage', () => {
    const block = SRC.slice(SRC.indexOf('// ---- what this browser remembers of MIDI'), SRC.indexOf("$('#miWizard')"))
    expect(block.length).toBeGreaterThan(1000)
    expect(block).not.toMatch(/sessionStorage/)
    expect(block).not.toMatch(/setItem\([^)]*arm/i)
    expect(SRC).not.toMatch(/lightdeskMidiArmed|MIDI_ARM_KEY|midiArmedStore|midiRearmAfterReload/)
  })
  it('a load restores enable, input and preset but never arms, whatever is in storage', () => {
    const { api, log } = page({
      ports: [{ id: 'p1', name: 'APC40 mkII' }],
      store: { lightdeskMidiPrefs: JSON.stringify({ enabled: true, inputName: 'APC40 mkII', preset: 'x' }), lightdeskMidiArmed: 'tab' },
    })
    api.midiListInputs()
    expect(log.enabled).toBe(true)
    expect(api.armed).toBe(false)
    expect(api.input && api.input.name).toBe('APC40 mkII')
    expect(log.fetches).toEqual([])
  })
  it('ARM is a press, and a press arms', () => {
    const { api } = page({ S: desk() })
    expect(api.armed).toBe(false)
    api.midiSetArmed(true)
    expect(api.armed).toBe(true)
  })
  it('enable is restored from the browser\'s prefs', () => {
    const on = page({ store: { lightdeskMidiPrefs: JSON.stringify({ enabled: true }) } })
    expect(on.log.enabled).toBe(true)
    const off = page({ store: {} })
    expect(off.log.enabled).toBeUndefined()
  })
})

describe('L5: the remembered input is matched by its exact name, and no other port takes its place', () => {
  const through = { id: 'a', name: 'Midi Through Port-0' }
  const apc = { id: 'b', name: 'APC40 mkII' }
  const saved = (name) => ({ lightdeskMidiPrefs: JSON.stringify({ input: 'old-id', inputName: name }) })
  it('the saved name wins, whatever the id is now', () => {
    const { api, store } = page({ ports: [through, apc], store: saved('APC40 mkII') })
    api.midiListInputs()
    expect(api.input.id).toBe('b')
    expect(JSON.parse(store.lightdeskMidiPrefs).input).toBe('old-id')   // an automatic pick is not stored
  })
  it('the saved port absent: none is bound, never Midi Through, shown as not connected', () => {
    const { api, log, els } = page({ ports: [through], store: saved('APC40 mkII') })
    api.midiListInputs()
    expect(api.input).toBe(null)
    expect(log.pill).toMatch(/APC40 mkII.*not connected/)
    expect(els['#miInputs'].innerHTML).toMatch(/APC40 mkII — not connected/)
    expect(JSON.parse(page({ ports: [through], store: saved('APC40 mkII') }).store.lightdeskMidiPrefs).inputName).toBe('APC40 mkII')
  })
  it('nothing saved: a real device is picked, Midi Through alone is not', () => {
    const a = page({ ports: [through, apc] }); a.api.midiListInputs()
    expect(a.api.input.name).toBe('APC40 mkII')
    const b = page({ ports: [through] }); b.api.midiListInputs()
    expect(b.api.input).toBe(null)
  })
  it('a port the saved name does not match is not taken by an id match either', () => {
    const { api } = page({ ports: [{ id: 'old-id', name: 'Something else' }], store: saved('APC40 mkII') })
    api.midiListInputs()
    expect(api.input).toBe(null)
  })
})

describe('the fast poll and the urgent sends', () => {
  it('arming starts the fast poll; disarming stops it and drops the guess', async () => {
    const { api, log } = page({ S: desk() })
    api.midiSetArmed(true)
    expect(api.timer).not.toBe(null)
    api.midiSetArmed(false)
    expect(api.timer).toBe(null)
    expect(log.resets).toBe(1)
  })
  it('the poll reads api/onair, applies it, and keeps going while armed (hidden or not), and stops at disarm', async () => {
    vi.useFakeTimers()
    try {
      const { api, log } = page({ S: desk() })
      api.midiSetArmed(true)
      await vi.advanceTimersByTimeAsync(1000)
      const polls = log.fetches.filter((f) => f.route === 'api/onair')
      expect(polls.length).toBeGreaterThanOrEqual(5)
      expect(log.onAirApplied).toBe(polls.length)
      api.midiSetArmed(false)
      const n = log.fetches.length
      await vi.advanceTimersByTimeAsync(1000)
      expect(log.fetches.length).toBe(n)
    } finally { vi.useRealTimers() }
  })
  it('the poll does not look at document.hidden: the APC40 is used while the tab is hidden', () => {
    expect(grab('midiOnAirTick')).not.toMatch(/hidden|visibility/)
  })
  it('a look pad press leaves at once (no 40 ms wait) as ONE fire call carrying autoplayOff (#1395)', async () => {
    vi.useFakeTimers()
    try {
      const { api, log } = page({ S: desk() })
      api.midiSetArmed(true)
      api.midiSend('api/looks/fire', { id: 'l1', autoplayOff: true }, 'lookpad:3', true)
      await vi.advanceTimersByTimeAsync(5)   // 5 ms: far under the 40 ms merge timer
      expect(log.fetches.filter((f) => f.route !== 'api/onair' && f.route !== 'api/raw' && f.route !== 'api/fx')).toEqual([{ route: 'api/looks/fire', body: { id: 'l1', autoplayOff: true } }])
    } finally { vi.useRealTimers() }
  })
  it('the pad handler builds that one call: fire body + autoplayOff, sent as the urgent key', () => {
    expect(SRC).toMatch(/fire\.body = Object\.assign\(\{\}, fire\.body, \{ autoplayOff: true \}\);/)
    expect(SRC).toMatch(/midiSend\(fire\.route, fire\.body, 'lookpad:' \+ k, true\);/)
  })
  it('a fader value is not urgent: it waits for the 40 ms merge timer', async () => {
    vi.useFakeTimers()
    try {
      const { api, log } = page({ S: desk() })
      api.midiSetArmed(true)
      api.midiSend('api/master', { master: 10 })
      expect(log.fetches.filter((f) => f.route === 'api/master').length).toBe(0)
      await vi.advanceTimersByTimeAsync(41)
      expect(log.fetches.filter((f) => f.route === 'api/master').length).toBe(1)
    } finally { vi.useRealTimers() }
  })
})

describe('state.onAir is the desk\'s own fact and the page follows it', () => {
  it('the page applies state.onAir on every poll', () => {
    expect(SRC).toMatch(/if \(next\.onAir\) applyOnAir\(next\.onAir, askedAt\);/)
  })
  let d, server, base, dir
  beforeAll(async () => {
    const { createDesk } = require('./desk.js')
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'midi-arm-'))
    d = createDesk({ dataDir: dir, offline: true, bindPort: 0, outputEnabledDefault: false, log: () => {} })
    server = http.createServer((req, res) => d.handle(req, res))
    await new Promise((r) => server.listen(0, '127.0.0.1', r))
    base = 'http://127.0.0.1:' + server.address().port
  })
  afterAll(async () => {
    d.close(); server.closeAllConnections?.()
    await new Promise((r) => server.close(r))
    fs.rmSync(dir, { recursive: true, force: true })
  })
  it('GET api/state carries onAir, equal to GET api/onair, and follows a fired look', async () => {
    const j = async (m, r, b) => (await fetch(base + r, { method: m, headers: { 'content-type': 'application/json' }, body: b ? JSON.stringify(b) : undefined })).json()
    const l = { id: 'lk1', name: 'lk1', kind: 'all', fixtures: [], steps: [{ values: { a: { dimmer: 1 } } }] }
    d.state.looks = [l]
    const before = await j('GET', '/api/state')
    expect(before.onAir).toEqual(expect.objectContaining({ lookId: expect.any(String), blackout: expect.any(Boolean) }))
    await j('POST', '/api/looks/fire', { id: 'lk1' })
    const after = await j('GET', '/api/state')
    expect(after.onAir.lookId).toBe('lk1')
    expect((await j('GET', '/api/onair')).lookId).toBe('lk1')
  })
})

const withLooks = (extra = {}) => desk(128, { looks: [{ id: 'l1', name: 'On air' }, { id: 'l2', name: 'Other' }], ...extra })

// ARM's own one-time hold clear (#1397 L2: a hit whose release never came lets go on ARM) and the on-air poll are not presses.
const notArmNoise = (f) => f.route !== 'api/onair' && !(f.route === 'api/raw' && f.body && f.body.owner === 'apc40' && f.body.clear === true) && !(f.route === 'api/fx' && f.body && f.body.clearFlash === true)

describe('round 3: the look pad press at the handler (N4, and the two mutations the round-2 review found alive)', () => {
  it('a look pad press is ONE fire call carrying autoplayOff, sent at once with no 40 ms wait', async () => {
    vi.useFakeTimers()
    try {
      const { api, log } = page({ S: withLooks() })
      api.midiSetArmed(true)
      api.midiLookPress(1)
      await vi.advanceTimersByTimeAsync(5)   // far under the 40 ms merge timer
      // exactly one call: a separate api/cues/autoplay call before the fire ("two calls again") makes this two
      expect(log.fetches.filter(notArmNoise)).toEqual([{ route: 'api/looks/fire', body: { id: 'l2', autoplayOff: true } }])
      expect(log.leds).toEqual(['l2'])
    } finally { vi.useRealTimers() }
  })
  it('autoplayOff rides whatever this tab believes about play-in-order (a hidden tab holds a stale cue view)', async () => {
    vi.useFakeTimers()
    try {
      const { api, log } = page({ S: withLooks() })
      api.midiSetArmed(true)
      api.midiLookPress(0)
      await vi.advanceTimersByTimeAsync(5)
      const fire = log.fetches.find((f) => f.route === 'api/looks/fire')
      expect(fire && fire.body.autoplayOff).toBe(true)
    } finally { vi.useRealTimers() }
  })
  it('the desk takes autoplayOff as a no-op when play-in-order is off (desk.js reads it only when on)', () => {
    const src = fs.readFileSync(path.join(__dirname, 'desk.js'), 'utf8')
    expect(src).toMatch(/if \(body\.autoplayOff === true && \(cueRunner\.brief\(\) \|\| \{\}\)\.autoplay\) cueRunner\.setAutoplay\(false\);/)
  })
})

describe('round 3: waiting for the first desk state (N1, N2, N3)', () => {
  it('N1: an error body as the first state keeps the wait; the next good state ends it with the desk values', () => {
    const { api } = page({ S: null })
    api.midiSetArmed(true)
    api.setS({ error: 'desk busy' }); api.midiLiveArrived()
    expect(api.wait).toBe(true)
    expect(Number.isNaN(api.live.master)).toBe(false)
    expect(api.live.master).toBe(255)        // untouched, and never undefined or NaN
    api.setS(desk(128)); api.midiLiveArrived()
    expect(api.wait).toBe(false)
    expect(api.live.master).toBe(128)
    expect(api.live.fxDepth).toBe(100)
  })
  it('N1: arming on top of an error body waits, and a half state does not count either', () => {
    const a = page({ S: { error: 'x' } })
    a.api.midiSetArmed(true)
    expect(a.api.wait).toBe(true)
    const b = page({ S: { master: 10 } })
    b.api.midiSetArmed(true)
    expect(b.api.wait).toBe(true)
  })
  it('N1: a soft takeover never catches on a target that is not a number', () => {
    expect(SRC).toMatch(/if \(!Number\.isFinite\(target\)\) \{ midiLastVal\[key\] = unit; return; \}/)
  })
  it('N2, N3: a look pad press while waiting sends nothing, lights no pad, and says so', async () => {
    const { api, log } = page({ S: null })
    api.midiSetArmed(true)
    api.setS(withLooks()); api.midiLiveArrived()   // looks known, then a bad state puts the wait back is not needed: use a fresh wait below
    const w = page({ S: { error: 'x', looks: [{ id: 'l1', name: 'On air' }] } })
    w.api.midiSetArmed(true)
    expect(w.api.wait).toBe(true)
    w.api.midiLookPress(0)
    expect(w.log.leds).toEqual([])
    expect(w.log.fetches.filter(notArmNoise)).toEqual([])
    expect(w.log.flashes[0]).toMatch(/waiting for the desk — nothing sent/)
    expect(log.leds).toEqual([])
  })
  it('N2, N3: a blackout pad press while waiting sets no override, no guess, and sends nothing', () => {
    const { api, log } = page({ S: { error: 'x' } })
    api.midiSetArmed(true)
    api.midiBlackoutPress()
    expect(api.ov).toBe(null)
    expect(api.live.blackout).toBe(false)
    expect(log.paints).toBe(1)   // only ARM's own full repaint, none for the press
    expect(log.flashes[0]).toMatch(/waiting for the desk — nothing sent/)
    expect(log.fetches.filter(notArmNoise)).toEqual([])
  })
  it('after the wait, the blackout pad flips and sends as before', async () => {
    const { api, log } = page({ S: desk() })
    api.midiSetArmed(true)
    api.midiBlackoutPress()
    expect(api.ov && api.ov.value).toBe(true)
    await vi.waitFor(() => expect(log.fetches.filter((f) => f.route === 'api/master').length).toBe(1))
  })
})
