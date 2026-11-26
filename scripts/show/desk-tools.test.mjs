// Tests for the desk tools: mirror_sync.py, flip_truss_tilt.py, live_load.mjs (synthetic fixtures only, no show data).
// The loader runs against a throwaway offline desk (createDesk, output off, no Art-Net), never a live desk.
import { spawnSync, execFile } from 'node:child_process'
import { promisify } from 'node:util'
import fs from 'node:fs'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'

const here = path.dirname(fileURLToPath(import.meta.url))
const require = createRequire(import.meta.url)
const { createDesk } = require('../../serverXR/src/lighting/desk.js')
const execFileP = promisify(execFile)
const tmps = []
const tmp = () => { const d = fs.mkdtempSync(path.join(os.tmpdir(), 'di-desk-tools-')); tmps.push(d); return d }
afterEach(() => { while (tmps.length) fs.rmSync(tmps.pop(), { recursive: true, force: true }) })

const hasPython = spawnSync('python3', ['--version']).status === 0
const py = (script, args) => spawnSync('python3', ['-I', path.join(here, script), ...args], { encoding: 'utf8' })

// two pairs of bars: L1/R1, L2/R2, plus a fixture that is not a bar
const PRESETS = { units: { L1: { id: 'fl1' }, L2: { id: 'fl2' }, R1: { id: 'fr1' }, R2: { id: 'fr2' }, X1: { id: 'fx' } } }
const g16 = (v, ch) => v[ch] * 256 + (v[ch + '_fine'] || 0)
const put = (raw, p, t) => ({ pan: p >> 8, pan_fine: p & 255, tilt: t >> 8, tilt_fine: t & 255, dimmer: 200, red: 90 })
const bar = (p, t) => put(null, p, t)
const step = (l, r) => ({ values: { fl1: bar(...l), fr1: bar(...r), fl2: bar(...l), fr2: bar(...r), fx: { dimmer: 7, pan: 1, tilt: 2 } }, width: 1 })
const intoRoom = (side, p, t) => (side === 'L' ? -1 : 1) * Math.sin(((t - 32768) * 270 / 65535) * Math.PI / 180) * Math.cos(((p - 32768) * 540 / 65535) * Math.PI / 180)

const runMirror = (looks, extra = []) => {
  const d = tmp()
  const pf = path.join(d, 'presets.json'), inf = path.join(d, 'in.json'), outf = path.join(d, 'out.json')
  fs.writeFileSync(pf, JSON.stringify(PRESETS)); fs.writeFileSync(inf, JSON.stringify({ keep: 'me', looks }))
  const r = py('mirror_sync.py', [pf, inf, outf, ...extra])
  return { r, inf, out: fs.existsSync(outf) ? JSON.parse(fs.readFileSync(outf, 'utf8')) : null }
}

describe.skipIf(!hasPython)('mirror_sync.py', () => {
  it('equal left/right values become mirrored and both face the room', () => {
    const { r, out } = runMirror([{ id: 'a', name: 'A', steps: [step([32768, 40000], [32768, 40000])] }])
    expect(r.status, r.stdout + r.stderr).toBe(0)
    const v = out.looks[0].steps[0].values
    for (const [l, rr] of [['fl1', 'fr1'], ['fl2', 'fr2']]) {
      expect(Math.abs(g16(v[l], 'pan') + g16(v[rr], 'pan') - 65536)).toBeLessThanOrEqual(2)
      expect(Math.abs(g16(v[l], 'tilt') + g16(v[rr], 'tilt') - 65536)).toBeLessThanOrEqual(2)
      expect(intoRoom('L', g16(v[l], 'pan'), g16(v[l], 'tilt'))).toBeGreaterThanOrEqual(0)
      expect(intoRoom('R', g16(v[rr], 'pan'), g16(v[rr], 'tilt'))).toBeGreaterThanOrEqual(0)
    }
    expect(out.keep).toBe('me')
    expect(out.looks[0].aim_fix_sync).toMatch(/pair-steps changed/)
  })

  it('a look already mirrored and facing the room is left as it is', () => {
    const look = { id: 'ok', name: 'OK', steps: [step([30000, 26000], [35536, 39536])] }
    const { r, out } = runMirror([look])
    expect(r.status).toBe(0)
    expect(out.looks[0]).toEqual(look)
  })

  it('a sweep through straight down grows no step move (fold at 0)', () => {
    const tilts = [20000, 26000, 32000, 32768, 33500, 38000, 44000]
    const look = { id: 's', name: 'S', steps: tilts.map((t) => step([32768, t], [32768, t])) }
    const { r, out } = runMirror([look])
    expect(r.status, r.stdout + r.stderr).toBe(0)
    const move = (l, id) => Math.max(...l.steps.slice(1).map((s, i) => Math.abs(g16(s.values[id], 'tilt') - g16(l.steps[i].values[id], 'tilt'))))
    for (const id of ['fl1', 'fr1']) expect(move(out.looks[0], id)).toBeLessThanOrEqual(move(look, id) + 2)
  })

  it('does not let a lead switch sides: the bar keeps a small pan move', () => {
    const look = { id: 'w', name: 'W', steps: [step([10000, 26000], [10000, 26000]), step([55000, 40000], [55000, 40000])] }
    const { r, out } = runMirror([look])
    expect(r.status, r.stdout + r.stderr).toBe(0)
    for (const id of ['fl1', 'fr1']) {
      const [a, b] = out.looks[0].steps.map((s) => g16(s.values[id], 'pan'))
      expect(Math.abs(a - b)).toBeLessThan(1000)
    }
  })

  it('changes nothing but pan/tilt of the bars', () => {
    const { out } = runMirror([{ id: 'a', name: 'A', steps: [step([32768, 40000], [32768, 40000])] }])
    const v = out.looks[0].steps[0].values
    for (const id of ['fl1', 'fr1', 'fl2', 'fr2']) { expect(v[id].dimmer).toBe(200); expect(v[id].red).toBe(90) }
    expect(v.fx).toEqual({ dimmer: 7, pan: 1, tilt: 2 })
  })

  it('--copy-suffix makes new ids and leaves the originals; --skip-prefix leaves a look out', () => {
    const looks = [{ id: 'a', name: 'A', steps: [step([32768, 40000], [32768, 40000])] }, { id: 'keep-b', name: 'B', steps: [step([32768, 40000], [32768, 40000])] }]
    const { r, out, inf } = runMirror(looks, ['--copy-suffix', '-mir', '--skip-prefix', 'keep-'])
    expect(r.status, r.stdout + r.stderr).toBe(0)
    expect(out.looks.map((l) => l.id)).toEqual(['a-mir'])
    expect(out.looks[0].name).toBe('A mir')
    expect(JSON.parse(fs.readFileSync(inf, 'utf8')).looks.map((l) => l.id)).toEqual(['a', 'keep-b'])
  })

  it('--left/--right name other unit prefixes', () => {
    const d = tmp()
    const pf = path.join(d, 'p.json'), inf = path.join(d, 'i.json'), outf = path.join(d, 'o.json')
    fs.writeFileSync(pf, JSON.stringify({ units: { A1: { id: 'fa' }, B1: { id: 'fb' } } }))
    fs.writeFileSync(inf, JSON.stringify({ looks: [{ id: 'a', steps: [{ values: { fa: bar(32768, 40000), fb: bar(32768, 40000) } }] }] }))
    const r = py('mirror_sync.py', [pf, inf, outf, '--left', 'A', '--right', 'B'])
    expect(r.status, r.stdout + r.stderr).toBe(0)
    const v = JSON.parse(fs.readFileSync(outf, 'utf8')).looks[0].steps[0].values
    expect(Math.abs(g16(v.fa, 'tilt') + g16(v.fb, 'tilt') - 65536)).toBeLessThanOrEqual(2)
  })

  it('no pair in the presets is refused', () => {
    const d = tmp(); fs.writeFileSync(path.join(d, 'p.json'), JSON.stringify({ units: { X1: { id: 'x' } } })); fs.writeFileSync(path.join(d, 'i.json'), '{"looks":[]}')
    expect(py('mirror_sync.py', [path.join(d, 'p.json'), path.join(d, 'i.json'), path.join(d, 'o.json')]).status).not.toBe(0)
  })
})

describe.skipIf(!hasPython)('flip_truss_tilt.py', () => {
  it('mirrors tilt about straight down on the chosen side, keeps 32768 and pan', () => {
    const d = tmp()
    const pf = path.join(d, 'p.json'), inf = path.join(d, 'i.json'), outf = path.join(d, 'o.json')
    fs.writeFileSync(pf, JSON.stringify(PRESETS))
    fs.writeFileSync(inf, JSON.stringify({ looks: [{ id: 'a', steps: [step([30000, 40000], [30000, 32768])] }] }))
    const r = py('flip_truss_tilt.py', [pf, inf, outf, '--sides', 'R'])
    expect(r.status, r.stdout + r.stderr).toBe(0)
    const v = JSON.parse(fs.readFileSync(outf, 'utf8')).looks[0].steps[0].values
    expect(g16(v.fl1, 'tilt')).toBe(40000)
    expect(g16(v.fr1, 'tilt')).toBe(32768)
    expect(g16(v.fr1, 'pan')).toBe(30000)
    const both = path.join(d, 'b.json')
    expect(py('flip_truss_tilt.py', [pf, inf, both]).status).toBe(0)
    expect(g16(JSON.parse(fs.readFileSync(both, 'utf8')).looks[0].steps[0].values.fl1, 'tilt')).toBe(65536 - 40000)
  })
})

describe('live_load.mjs against a throwaway desk', () => {
  const mkLook = (id, name = id) => ({ id, name, steps: [{ values: { f1: { dimmer: 255 } }, width: 1, transition: 0 }] })
  const setup = async () => {
    const dir = tmp()
    const desk = createDesk({ dataDir: dir, offline: true, bindPort: 0, outputEnabledDefault: false, log: () => {} })
    const server = http.createServer((q, s) => desk.handle(q, s))
    await new Promise((res) => server.listen(0, '127.0.0.1', res))
    const base = `http://127.0.0.1:${server.address().port}`
    const post = (p, b) => fetch(base + p, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) })
    const get = async (p) => (await fetch(base + p)).json()
    return { dir, desk, server, base, post, get }
  }
  const files = (dir, ids) => {
    const lf = path.join(dir, 'looks.json'), cf = path.join(dir, 'cues.json')
    fs.writeFileSync(lf, JSON.stringify({ looks: ids.map((i) => mkLook(i)) }))
    fs.writeFileSync(cf, JSON.stringify({ cues: { project: 'suite-x', loop: false, autoplay: true, list: ids.map((i, n) => ({ id: `c${n}`, name: i, lookId: i, hold: 5, fade: 1 })) } }))
    return { lf, cf }
  }
  const load = async (base, lf, cf, ...a) => {
    try { const r = await execFileP('node', [path.join(here, 'live_load.mjs'), lf, cf, '--base', base, ...a]); return { rc: 0, out: r.stdout } }
    catch (e) { return { rc: e.code, out: String(e.stdout || '') + String(e.stderr || '') } }
  }
  const nLooks = async (t) => { const b = await t.get('/api/looks'); return (b.looks || b).length }
  const cueKey = async (t) => { const c = (await t.get('/api/cues')).cues; return `${c.project}/${c.list.length}/${c.index}/${c.running}` }

  it('dry run, apply, re-run, refusal, --looks-only and the snapshot undo', async () => {
    const t = await setup()
    try {
      await t.post('/api/looks/add', { look: mkLook('old-1') })
      await t.post('/api/looks/add', { look: mkLook('old-2') })
      const n0 = await nLooks(t), c0 = await cueKey(t)
      const { lf, cf } = files(t.dir, ['new-a', 'new-b', 'new-c'])

      const dry = await load(t.base, lf, cf)
      expect(dry.rc).toBe(0); expect(dry.out).toMatch(/dry run/)
      expect(await nLooks(t)).toBe(n0); expect(await cueKey(t)).toBe(c0)

      const ap = await load(t.base, lf, cf, '--apply', '--go')
      expect(ap.rc, ap.out).toBe(0)
      expect(await nLooks(t)).toBe(n0 + 3)
      const c = (await t.get('/api/cues')).cues
      expect([c.list.length, c.running, c.autoplay, c.index]).toEqual([3, true, true, 0])
      const snap = (ap.out.match(/^snapshot: (\S+)/m) || [])[1]
      expect(snap).toBeTruthy(); expect(ap.out).toMatch(/undo: curl/)

      const again = await load(t.base, lf, cf, '--apply')
      expect(again.rc).toBe(0); expect(again.out).toMatch(/add 0, replace 0, already there and identical 3/)

      // a changed look outside the prefix is refused with exit 2; inside it is replaced
      const changed = JSON.parse(fs.readFileSync(lf, 'utf8')); changed.looks[0].name = 'changed'
      const cfile = path.join(t.dir, 'changed.json'); fs.writeFileSync(cfile, JSON.stringify(changed))
      const ref = await load(t.base, cfile, cf, '--apply')
      expect(ref.rc).toBe(2); expect(ref.out).toMatch(/^REFUSED/m)
      const rep = await load(t.base, cfile, cf, '--apply', '--replace-prefix', 'new-')
      expect(rep.rc, rep.out).toBe(0); expect(rep.out).toMatch(/1 replaced/); expect(await nLooks(t)).toBe(n0 + 3)

      // an old look with other content is never replaced, even with a prefix that does not cover it
      const clash = path.join(t.dir, 'clash.json'); fs.writeFileSync(clash, JSON.stringify({ looks: [mkLook('old-1', 'other')] }))
      const cl = await load(t.base, clash, cf, '--apply', '--replace-prefix', 'new-')
      expect(cl.rc).toBe(2)

      // --looks-only leaves the cue list alone
      changed.looks[0].name = 'changed 2'; fs.writeFileSync(cfile, JSON.stringify(changed))
      const cs0 = await cueKey(t)
      const lo = await load(t.base, cfile, cf, '--apply', '--looks-only', '--replace-prefix', 'new-')
      expect(lo.rc, lo.out).toBe(0); expect(lo.out).toMatch(/cue list was not touched/); expect(await cueKey(t)).toBe(cs0)

      // the snapshot undo restores looks and cue list
      const r = await t.post('/api/snapshots/restore', { id: snap })
      expect(r.status).toBe(200)
      expect(await nLooks(t)).toBe(n0); expect(await cueKey(t)).toBe(c0)
    } finally { t.server.close() }
  }, 60000)

  it('an unreachable desk fails before any write (exit 2)', async () => {
    const d = tmp(); const { lf, cf } = files(d, ['a'])
    const r = await load('http://127.0.0.1:9', lf, cf)
    expect(r.rc).not.toBe(0)
  })
})
