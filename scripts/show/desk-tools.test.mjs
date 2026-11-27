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
const py = (script, args, dir = here) => spawnSync('python3', ['-I', path.join(dir, script), ...args], { encoding: 'utf8' })

// two pairs of bars: L1/R1, L2/R2, plus a fixture that is not a bar
const OLD = { MIRROR_MODE: 'negate', FACE_SIGN: -1, CELL_MIRROR_LR: true }
const CAM = { MIRROR_MODE_PAN: 'negate', MIRROR_MODE_TILT: 'same', MIRROR_MODE: 'negate', FACE_SIGN: 1, CELL_MIRROR_LR: true }
// every key of a fixture gets a camera record (measured.<KEY> with the same value), as the tool requires
const meas = (c) => Object.fromEntries(Object.entries(c).map(([k, value]) => [k, { value, confidence: 'high', method: `test fixture, ${k}` }]))
const PRESETS = { constants: OLD, units: { L1: { id: 'fl1' }, L2: { id: 'fl2' }, R1: { id: 'fr1' }, R2: { id: 'fr2' }, X1: { id: 'fx' } } }
const g16 = (v, ch) => v[ch] * 256 + (v[ch + '_fine'] || 0)
const put = (raw, p, t) => ({ pan: p >> 8, pan_fine: p & 255, tilt: t >> 8, tilt_fine: t & 255, dimmer: 200, red: 90 })
const bar = (p, t) => put(null, p, t)
const step = (l, r) => ({ values: { fl1: bar(...l), fr1: bar(...r), fl2: bar(...l), fr2: bar(...r), fx: { dimmer: 7, pan: 1, tilt: 2 } }, width: 1 })
const intoRoom = (side, p, t, face = side === 'L' ? -1 : 1) => face * Math.sin(((t - 32768) * 270 / 65535) * Math.PI / 180) * Math.cos(((p - 32768) * 540 / 65535) * Math.PI / 180)

const runMirror = (looks, extra = [], constants = OLD, measured, script = [here]) => {
  const d = tmp()
  const pf = path.join(d, 'presets.json'), inf = path.join(d, 'in.json'), outf = path.join(d, 'out.json')
  fs.writeFileSync(pf, JSON.stringify(constants === null ? { units: PRESETS.units } : { ...PRESETS, constants, measured: measured === undefined ? meas(constants) : measured })); fs.writeFileSync(inf, JSON.stringify({ keep: 'me', looks }))
  const r = py('mirror_sync.py', [pf, inf, outf, ...extra], script[0])
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

  // Rules the code is built on, pinned one by one (each was checked by mutating the tool: a changed rule fails one of these).
  const both = (l, r, extra = {}) => ({ values: { fl1: bar(...l), fr1: bar(...r), fl2: bar(...l), fr2: bar(...r), ...extra }, width: 1 })

  it('the partner is exactly 65536 minus the lead, on both axes (no off-by-one)', () => {
    const { r, out } = runMirror([{ id: 'e', name: 'E', steps: [step([30001, 26000], [30001, 26000])] }])
    expect(r.status, r.stdout + r.stderr).toBe(0)
    const v = out.looks[0].steps[0].values
    expect(g16(v.fl1, 'pan')).toBe(30001); expect(g16(v.fl1, 'tilt')).toBe(26000)
    expect(g16(v.fr1, 'pan')).toBe(65536 - 30001); expect(g16(v.fr1, 'tilt')).toBe(65536 - 26000)
  })

  it('the lead is folded at exactly 0: a bar 2 degrees into its own wall is turned, none ends into a wall', () => {
    // tilt 33253 is 2 degrees past centre: the left bar points 2 degrees into its own wall (more into it than the right one)
    const look = { id: 'f', name: 'F', steps: [step([32768, 33253], [32768, 31000])] }
    const { r, out } = runMirror([look])
    expect(r.status, r.stdout + r.stderr).toBe(0)
    const v = out.looks[0].steps[0].values
    expect(g16(v.fl1, 'tilt')).toBe(65536 - 33253); expect(g16(v.fr1, 'tilt')).toBe(33253) // turned exactly about 65536
    for (const [l, rr] of [['fl1', 'fr1'], ['fl2', 'fr2']]) {
      expect(intoRoom('L', g16(v[l], 'pan'), g16(v[l], 'tilt'))).toBeGreaterThanOrEqual(-1e-9)
      expect(intoRoom('R', g16(v[rr], 'pan'), g16(v[rr], 'tilt'))).toBeGreaterThanOrEqual(-1e-9)
    }
  })

  it('a fixed left or right lead is tried: no step move grows more than 5 degrees', () => {
    // step 1 the left bar is more into the room, step 2 the right bar: a per-step lead would swing a bar by twice its pan
    // found by search: the per-step lead alone grows a bar's move by more than 5 degrees (exit 1); a fixed L or R lead does not
    const look = { id: 'sw', name: 'SW', steps: [both([39033, 22147], [39844, 20431]), both([35375, 28498], [38048, 27678])] }
    const { r, out } = runMirror([look])
    expect(r.status, r.stdout + r.stderr).toBe(0)
    const move = (l, id) => Math.abs(g16(l.steps[0].values[id], 'pan') - g16(l.steps[1].values[id], 'pan'))
    for (const id of ['fl1', 'fr1']) expect(move(out.looks[0], id)).toBeLessThanOrEqual(move(look, id) + 300)
  })

  it('a bar without a fine channel is rounded, not cut, and clamped to the channel range', () => {
    const coarse = (p, t) => ({ pan: p, tilt: t, dimmer: 5 })
    const lead = { pan: 117, pan_fine: 49, tilt: 101, tilt_fine: 0, dimmer: 5 } // pan 30001
    const look = { id: 'c', name: 'C', steps: [{ values: { fl1: lead, fr1: coarse(117, 101), fl2: bar(0, 26000), fr2: bar(0, 26000) } }] }
    // exit 1 is expected: a coarse-only bar cannot mirror within 2 of 65536 (its step is 256), and the tool says so
    const { out } = runMirror([look])
    const v = out.looks[0].steps[0].values
    expect(v.fr1.pan).toBe(139) // 65536 - 30001 = 35535 -> 138.8 rounds to 139 (a cut would give 138)
    expect('pan_fine' in v.fr1).toBe(false)
    expect(g16(v.fr2, 'pan')).toBe(65535) // 65536 - 0 clamps to the 16-bit maximum
  })

  it('changes nothing but pan/tilt of the bars', () => {
    const { out } = runMirror([{ id: 'a', name: 'A', steps: [step([32768, 40000], [32768, 40000])] }], ['--keep-cells'])
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
    fs.writeFileSync(pf, JSON.stringify({ constants: OLD, measured: meas(OLD), units: { A1: { id: 'fa' }, B1: { id: 'fb' } } }))
    fs.writeFileSync(inf, JSON.stringify({ looks: [{ id: 'a', steps: [{ values: { fa: bar(32768, 40000), fb: bar(32768, 40000) } }] }] }))
    const r = py('mirror_sync.py', [pf, inf, outf, '--left', 'A', '--right', 'B'])
    expect(r.status, r.stdout + r.stderr).toBe(0)
    const v = JSON.parse(fs.readFileSync(outf, 'utf8')).looks[0].steps[0].values
    expect(Math.abs(g16(v.fa, 'tilt') + g16(v.fb, 'tilt') - 65536)).toBeLessThanOrEqual(2)
  })

  // The rule is data in the presets (camera record 2026-11-26 22:4x): FACE_SIGN +1, pan negate, tilt same, cells reversed.
  const cellBar = (p, t, cs) => ({ ...bar(p, t), ...cs })
  const cellsOf = (v) => Object.fromEntries(Object.keys(v).filter((k) => /^[rgbw]\d+$/.test(k)).map((k) => [k, v[k]]))
  const L7 = { r1: 1, r2: 2, r3: 3, r4: 4, r5: 5, r6: 6, r7: 7, g1: 11, g2: 12, g3: 13, g4: 14, g5: 15, g6: 16, g7: 17 }
  const flipped = (c, n = 7) => Object.fromEntries(Object.entries(c).map(([k, x]) => [k[0] + (n + 1 - Number(k.slice(1))), x]))
  const L5 = { r1: 1, r2: 2, r3: 3, r4: 4, r5: 5, g1: 11, g2: 12, g3: 13, g4: 14, g5: 15 }
  const camLook = (l, r, extra) => ({ id: 'c', name: 'C', steps: [{ values: { fl1: cellBar(...l, extra?.l || {}), fr1: cellBar(...r, extra?.r || {}), fl2: bar(...l), fr2: bar(...r) } }] })

  it('camera rule: the partner is (65536 - pan, same tilt), into the room is equal on both sides', () => {
    const { r, out } = runMirror([{ id: 'a', name: 'A', steps: [step([30001, 40000], [30001, 40000])] }], [], CAM)
    expect(r.status, r.stdout + r.stderr).toBe(0)
    expect(r.stdout).toMatch(/rule from presets: pan negate, tilt same, FACE_SIGN \+1, cells reversed/)
    const v = out.looks[0].steps[0].values
    expect(g16(v.fl1, 'pan')).toBe(30001); expect(g16(v.fl1, 'tilt')).toBe(40000)
    expect(g16(v.fr1, 'pan')).toBe(65536 - 30001); expect(g16(v.fr1, 'tilt')).toBe(40000)
    const a = intoRoom('L', g16(v.fl1, 'pan'), g16(v.fl1, 'tilt'), 1), b = intoRoom('R', g16(v.fr1, 'pan'), g16(v.fr1, 'tilt'), 1)
    expect(Math.abs(a - b)).toBeLessThan(1e-9)
  })

  it('camera rule: a look facing the walls is folded, nothing ends into a wall; a facing look stays', () => {
    // FACE_SIGN +1: tilt above centre (32768) points into the room, tilt below it into the wall; 26000 and 24000 are below, so both sides fold
    const walls = { id: 'w', name: 'W', steps: [step([32768, 26000], [32768, 26000]), step([32768, 24000], [32768, 24000])] }
    const { r, out } = runMirror([walls], [], CAM)
    expect(r.status, r.stdout + r.stderr).toBe(0)
    for (const s of out.looks[0].steps) for (const [l, rr] of [['fl1', 'fr1'], ['fl2', 'fr2']]) {
      expect(intoRoom('L', g16(s.values[l], 'pan'), g16(s.values[l], 'tilt'), 1)).toBeGreaterThanOrEqual(-1e-9)
      expect(intoRoom('R', g16(s.values[rr], 'pan'), g16(s.values[rr], 'tilt'), 1)).toBeGreaterThanOrEqual(-1e-9)
    }
    // folded about the centre: tilt 26000 -> 39536 and 24000 -> 41536 on both sides; pan R = 65536 - pan L (= 32768 here)
    out.looks[0].steps.forEach((s, k) => {
      for (const id of ['fl1', 'fr1', 'fl2', 'fr2']) expect(g16(s.values[id], 'tilt')).toBe(65536 - [26000, 24000][k])
    })
    const ok = { id: 'ok', name: 'OK', steps: [step([30000, 40000], [35536, 40000])] }
    expect(runMirror([ok], [], CAM).out.looks[0]).toEqual(ok)
  })

  const allR = (L) => Object.fromEntries(Object.keys(L).map((k) => [k, 90]))
  const ruleLine = (stdout) => stdout.split('\n').find((x) => x.startsWith('rule '))

  it('cells come out reversed from the lead, and the rule line says reversed', () => {
    const look = camLook([32768, 40000], [32768, 40000], { l: L7, r: allR(L7) })
    const a = runMirror([look], [], CAM)
    expect(a.r.status, a.r.stdout + a.r.stderr).toBe(0)
    const v = a.out.looks[0].steps[0].values
    expect(cellsOf(v.fl1)).toEqual(L7)
    expect(cellsOf(v.fr1)).toEqual(flipped(L7))
    expect(a.r.stdout).toMatch(/cells after \(pair-steps\): uniform 0, reversed 1/)
    expect(ruleLine(a.r.stdout)).toMatch(/^rule from presets: pan negate, tilt same, FACE_SIGN \+1, cells reversed;/)
  })

  it('CELL_MIRROR_LR false: the partner gets the same index, and the rule line says same index', () => {
    const look = camLook([32768, 40000], [32768, 40000], { l: L7, r: allR(L7) })
    const b = runMirror([look], [], { ...CAM, CELL_MIRROR_LR: false })
    expect(b.r.status, b.r.stdout + b.r.stderr).toBe(0)
    expect(cellsOf(b.out.looks[0].steps[0].values.fr1)).toEqual(L7)
    expect(ruleLine(b.r.stdout)).toMatch(/FACE_SIGN \+1, cells same index;/)
    expect(ruleLine(b.r.stdout)).not.toMatch(/cells reversed/)
  })

  it('a bar with 5 cells: N comes from the keys, not 7', () => {
    const look = camLook([32768, 40000], [32768, 40000], { l: L5, r: allR(L5) })
    const a = runMirror([look], [], CAM)
    expect(a.r.status, a.r.stdout + a.r.stderr).toBe(0)
    expect(cellsOf(a.out.looks[0].steps[0].values.fr1)).toEqual(flipped(L5, 5))
  })

  it('--keep-cells: a look whose right cells are not the left reversed has them changed without it, and byte-equal with it', () => {
    const look = camLook([32768, 40000], [30000, 41000], { l: L7, r: allR(L7) })
    const without = runMirror([look], [], CAM)
    const cellsBoth = (o) => JSON.stringify(['fl1', 'fr1'].map((id) => cellsOf(o.looks[0].steps[0].values[id])))
    expect(cellsBoth(without.out)).not.toEqual(cellsBoth({ looks: [look] }))
    const kept = runMirror([look], ['--keep-cells'], CAM)
    expect(kept.r.status, kept.r.stdout + kept.r.stderr).toBe(0)
    for (const id of ['fl1', 'fr1', 'fl2', 'fr2']) expect(cellsOf(kept.out.looks[0].steps[0].values[id])).toEqual(cellsOf(look.steps[0].values[id]))
    // sync ran (pan/tilt were mirrored), only the cells are kept
    const pt = (o) => JSON.stringify(['fl1', 'fr1'].map((id) => [g16(o.looks[0].steps[0].values[id], 'pan'), g16(o.looks[0].steps[0].values[id], 'tilt')]))
    expect(pt(kept.out)).not.toEqual(pt({ looks: [look] }))
    expect(ruleLine(kept.r.stdout)).toMatch(/cells kept \(--keep-cells\)/)
  })

  it('the walk proof refuses a run that rewrote the LEAD bar\'s own cells (patched copy of the tool)', () => {
    const src = fs.readFileSync(path.join(here, 'mirror_sync.py'), 'utf8')
    const hook = "                        part[f'{c}{i}'] = d[n + 1 - i] if CELL_REV and set(d) == set(range(1, n + 1)) else d[i]\n"
    expect(src).toContain(hook)
    const dir = tmp()
    fs.writeFileSync(path.join(dir, 'mirror_sync.py'), src.replace(hook, hook + "                        ref[f'{c}{i}'] = 99\n"))
    const look = camLook([32768, 40000], [32768, 40000], { l: L7, r: allR(L7) })
    const { r } = runMirror([look], [], CAM, undefined, [dir])
    expect(r.status, r.stdout + r.stderr).toBe(1)
    expect(r.stdout).toMatch(/[1-9]\d* other values changed/)
    const ok = runMirror([look], [], CAM)
    expect(ok.r.stdout).toMatch(/0 other values changed/)
  })

  it('provenance: every key used needs a camera record with the same value and a confidence other than none', () => {
    const look = { id: 'a', name: 'A', steps: [step([30001, 40000], [30001, 40000])] }
    const good = meas(CAM)
    const cases = [
      [{ ...good, FACE_SIGN: { ...good.FACE_SIGN, confidence: 'none' } }, /FACE_SIGN.*confidence is none/],
      [{ ...good, MIRROR_MODE_TILT: { ...good.MIRROR_MODE_TILT, value: 'negate' } }, /MIRROR_MODE_TILT.*differs/],
      [{ ...good, CELL_MIRROR_LR: undefined }, /CELL_MIRROR_LR.*no measured entry/],
      [{ ...good, MIRROR_MODE_PAN: { value: 'negate' } }, /MIRROR_MODE_PAN.*confidence is none/],
      [null, /no measured entry/],
    ]
    for (const [m, re] of cases) {
      const { r, out } = runMirror([look], [], CAM, m)
      expect(r.status, r.stdout).toBe(2)
      expect(r.stderr.trim().split('\n')).toHaveLength(1)
      expect(r.stderr).toMatch(re)
      expect(out).toBeNull()
    }
    // --keep-cells does not use the cell key, so its record is not needed
    expect(runMirror([look], ['--keep-cells'], CAM, { ...good, CELL_MIRROR_LR: undefined }).r.status).toBe(0)
    // the flag skips the check and says so
    const f = runMirror([look], ['--rule-unmeasured-ok'], CAM, null)
    expect(f.r.status, f.r.stdout + f.r.stderr).toBe(0)
    expect(ruleLine(f.r.stdout)).toMatch(/^rule NOT measured/)
    // the measured rule line carries each key's confidence and the start of its method
    const m = runMirror([look], [], CAM)
    expect(ruleLine(m.r.stdout)).toMatch(/FACE_SIGN=1 \(high: test fixture, FACE_SIGN\); MIRROR_MODE_PAN=negate \(high: test fixture, MIRROR_MODE_PAN\); MIRROR_MODE_TILT=same \(high: /)
  })

  it('FACE_SIGN as a float 1.0 / -1.0 works; any other number exits 2 with one line', () => {
    const look = { id: 'a', name: 'A', steps: [step([30001, 40000], [30001, 40000])] }
    // JSON.stringify writes 1.0 as 1, so the presets text is written by hand with a literal 1.0 / -1.0
    for (const f of ['1.0', '-1.0']) {
      const d = tmp()
      const pf = path.join(d, 'p.json'), inf = path.join(d, 'i.json'), outf = path.join(d, 'o.json')
      const consts = JSON.stringify({ ...CAM, FACE_SIGN: 0 }).replace('"FACE_SIGN":0', `"FACE_SIGN":${f}`)
      const meast = JSON.stringify(meas({ ...CAM, FACE_SIGN: 0 })).replace('"value":0', `"value":${f}`)
      fs.writeFileSync(pf, `{"constants":${consts},"measured":${meast},"units":${JSON.stringify(PRESETS.units)}}`)
      expect(fs.readFileSync(pf, 'utf8')).toContain(`"FACE_SIGN":${f}`)
      fs.writeFileSync(inf, JSON.stringify({ looks: [look] }))
      const r = py('mirror_sync.py', [pf, inf, outf])
      expect(r.status, r.stdout + r.stderr).not.toBe(2)
      expect(r.stderr).not.toMatch(/Traceback/)
    }
    for (const f of [0.5, 2, '1', true]) {
      const { r } = runMirror([look], [], { ...CAM, FACE_SIGN: f })
      expect(r.status).toBe(2)
      expect(r.stderr.trim().split('\n')).toHaveLength(1)
    }
  })

  it('a boolean measured value is refused with exit 2 and one line (True == 1 in Python)', () => {
    const look = { id: 'a', name: 'A', steps: [step([30001, 40000], [30001, 40000])] }
    const good = meas(CAM)
    const { r, out } = runMirror([look], [], CAM, { ...good, FACE_SIGN: { ...good.FACE_SIGN, value: true } })
    expect(r.status, r.stdout).toBe(2)
    expect(r.stderr.trim().split('\n')).toHaveLength(1)
    expect(r.stderr).toMatch(/FACE_SIGN.*boolean/)
    expect(out).toBeNull()
  })

  it('twoSided: true goes out unchanged and is named; the same look without the flag is fixed', () => {
    const wrong = (extra) => ({ id: 'duel', name: 'Duel', ...extra, steps: [step([30001, 40000], [30001, 40000])] })
    const other = { id: 'x', name: 'X', steps: [step([30001, 40000], [30001, 40000])] }
    const a = runMirror([wrong({ twoSided: true }), other], [], CAM)
    expect(a.r.status, a.r.stdout + a.r.stderr).toBe(0)
    expect(a.out.looks[0]).toEqual(wrong({ twoSided: true }))
    expect(a.out.looks[1].aim_fix_sync).toMatch(/pair-steps changed/)
    expect(a.r.stdout).toMatch(/^kept as designed \(twoSided\): duel$/m)
    expect(a.r.stdout).toMatch(/2 looks, 1 changed/)
    const b = runMirror([wrong({})], [], CAM)
    expect(b.out.looks[0].aim_fix_sync).toMatch(/pair-steps changed/)
    expect(b.r.stdout).not.toMatch(/kept as designed/)
    // only the exact boolean counts
    expect(runMirror([wrong({ twoSided: 'true' })], [], CAM).out.looks[0].aim_fix_sync).toBeTruthy()
  })

  it('a per-axis key wins over MIRROR_MODE', () => {
    // MIRROR_MODE negate everywhere, but tilt is 'same' by its own key: the tilt is copied, not negated
    const a = runMirror([{ id: 'a', name: 'A', steps: [step([30001, 40000], [30001, 40000])] }], [], { MIRROR_MODE: 'negate', MIRROR_MODE_TILT: 'same', FACE_SIGN: 1, CELL_MIRROR_LR: true })
    expect(a.r.status, a.r.stdout + a.r.stderr).toBe(0)
    expect(g16(a.out.looks[0].steps[0].values.fr1, 'tilt')).toBe(40000)
    // and the other way round: MIRROR_MODE 'same', pan negated by its own key
    const b = runMirror([{ id: 'a', name: 'A', steps: [step([30001, 40000], [30001, 40000])] }], [], { MIRROR_MODE: 'same', MIRROR_MODE_PAN: 'negate', FACE_SIGN: 1, CELL_MIRROR_LR: true })
    expect(b.r.status, b.r.stdout + b.r.stderr).toBe(0)
    expect(g16(b.out.looks[0].steps[0].values.fr1, 'pan')).toBe(65536 - 30001)
  })

  it('no FACE_SIGN or no mirror mode: exit 2 and one clean line, no file written', () => {
    const look = { id: 'a', name: 'A', steps: [step([32768, 40000], [32768, 40000])] }
    for (const c of [{ MIRROR_MODE: 'negate' }, { FACE_SIGN: 1 }, { FACE_SIGN: 1, MIRROR_MODE_PAN: 'negate' }, null]) {
      const { r, out } = runMirror([look], [], c)
      expect(r.status).toBe(2)
      expect(r.stderr.trim().split('\n')).toHaveLength(1)
      expect(r.stderr).toMatch(/measured rule is needed from a camera hold/)
      expect(out).toBeNull()
    }
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

  it('an unreachable desk is refused before any write: exit 2 and a clean line, no stack trace', async () => {
    const d = tmp(); const { lf, cf } = files(d, ['a'])
    for (const extra of [[], ['--apply']]) {
      const r = await load('http://127.0.0.1:9', lf, cf, ...extra)
      expect(r.rc).toBe(2)
      expect(r.out).toMatch(/^REFUSED: .*not reachable/m)
      expect(r.out).not.toMatch(/at .*\.(m?js|ts):\d+|Error:/)
    }
  })

  // A fake desk: answers the snapshot, then breaks at the chosen path (drops the socket or answers non-JSON).
  const fakeDesk = async (breakAt, how) => {
    const server = http.createServer((q, s) => {
      const u = q.url
      q.resume()
      if (u === breakAt && how === 'drop') return q.socket.destroy()
      const send = (o) => { s.setHeader('content-type', 'application/json'); s.end(JSON.stringify(o)) }
      if (u === breakAt && how === 'text') { s.end('<html>nope</html>'); return }
      if (u === '/api/looks' && q.method === 'GET') return send({ looks: [] })
      if (u === '/api/snapshots') return send({ snapshot: { id: 'S1' } })
      if (u === '/api/looks/add') return send({ ok: true })
      if (u === '/api/cues/load') return send({ cues: { project: 'suite-x', list: [{}] } })
      send({})
    })
    await new Promise((res) => server.listen(0, '127.0.0.1', res))
    return { server, base: `http://127.0.0.1:${server.address().port}` }
  }
  for (const [breakAt, how] of [['/api/looks/add', 'drop'], ['/api/looks', 'text'], ['/api/cues/load', 'drop']]) {
    it(`a ${how === 'drop' ? 'dropped connection' : 'non-JSON answer'} at ${breakAt} after the snapshot still prints the undo line (exit 1)`, async () => {
      const d = tmp(); const { lf, cf } = files(d, ['a'])
      const f = await fakeDesk(breakAt, how)
      try {
        const r = await load(f.base, lf, cf, '--apply')
        // GET /api/looks as text fails the first read (before the snapshot): refused with 2, nothing written
        if (breakAt === '/api/looks') { expect(r.rc).toBe(2); expect(r.out).toMatch(/^REFUSED/m); return }
        expect(r.rc).toBe(1)
        expect(r.out).toMatch(/^FAILED: /m)
        expect(r.out).toMatch(/undo: curl .*"id":"S1"/)
        expect(r.out).not.toMatch(/at .*\.(m?js|ts):\d+|TypeError/)
      } finally { f.server.close() }
    })
  }
})
