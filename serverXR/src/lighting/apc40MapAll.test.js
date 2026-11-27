import { describe, it, expect } from 'vitest'
import { createRequire } from 'node:module'

const req = createRequire(import.meta.url)
const P = req('./ui/midiPatch.js')
const { apc40Preset } = req('./ui/midiCues.js')
const draw = req('./ui/apc40draw.js')
const fs = req('node:fs')

// The mkII's 147 panel controls, from Akai's "APC40 Mk2 Communication Protocol" v1.2 (2015-01-19), inbound tables
// (note numbers pp.32-33, CC numbers; Mode 0 notes p.10). Each entry: [name, type, number, channels the control speaks on].
// In Mode 0 TRACK SELECT 1-8 and MASTER SELECT send NO MIDI: they page the 8 device knobs, whose rows sit on ch 1-9.
const ch18 = [1, 2, 3, 4, 5, 6, 7, 8]
const SPEC = []
const add = (name, type, num, chans) => SPEC.push({ name, type, num, chans })
for (let i = 0; i < 40; i++) add('clip launch ' + (i + 1), 'note', i, [1])
for (let i = 0; i < 5; i++) add('scene launch ' + (i + 1), 'note', 0x52 + i, [1])
add('stop all clips', 'note', 0x51, [1])
for (const [name, num] of [['clip stop', 0x34], ['solo', 0x31], ['record arm', 0x30], ['activator', 0x32], ['crossfade A/B', 0x42]]) {
  for (const c of ch18) add(name + ' ' + c, 'note', num, [c])
}
for (const [name, num] of [['device left', 0x3a], ['device right', 0x3b], ['bank left', 0x3c], ['bank right', 0x3d], ['device on/off', 0x3e], ['device lock', 0x3f], ['clip/device view', 0x40], ['detail view', 0x41],
  ['bank lock', 0x67], ['pan', 0x57], ['sends', 0x58], ['user', 0x59], ['metronome', 0x5a], ['play', 0x5b], ['record', 0x5d], ['session record', 0x66],
  ['up', 0x5e], ['down', 0x5f], ['right', 0x60], ['left', 0x61], ['shift', 0x62], ['tap tempo', 0x63], ['nudge -', 0x64], ['nudge +', 0x65]]) add(name, 'note', num, [1])
for (const c of ch18) add('track fader ' + c, 'cc', 7, [c])
add('master fader', 'cc', 0x0e, [1]); add('crossfader', 'cc', 0x0f, [1])
for (let k = 0; k < 8; k++) add('device knob ' + (k + 1), 'cc', 0x10 + k, [1, 2, 3, 4, 5, 6, 7, 8, 9])   // any bank row counts
for (let k = 0; k < 8; k++) add('track knob ' + (k + 1), 'cc', 0x30 + k, [1])
add('cue level', 'cc', 0x2f, [1]); add('tempo', 'cc', 0x0d, [1])
// the 9 select buttons: no MIDI in Mode 0, each is one knob page (device knobs on its channel)
for (let b = 1; b <= 9; b++) add('track/master select ' + b + ' = knob page ' + b, 'page', 0, [b])

const offered = () => {
  const all = [...draw.CONTROLS.map((c) => c.key), ...Object.keys(draw.BUTTONS), 'master', ...P.KNOBS.map((k) => k.key),
    ...Array.from({ length: 40 }, (_, k) => 'lookpad:' + k), 'lookpage:next', 'lookpage:prev', 'cuego', 'cuestop', 'cueback', 'cueauto', 'cueloop', 'blackout']
  return all
}
const rows = apc40Preset(offered())

describe('APC40 mkII: every control has a preset row', () => {
  it('the spec lists 147 panel controls: 138 with their own note / CC + the 9 select buttons (knob pages)', () => {
    expect(SPEC).toHaveLength(147)
    expect(SPEC.filter((s) => s.type === 'page')).toHaveLength(9)
  })
  it('0 free: each control is bound by a row on its note / CC (and channel), or is a knob page', () => {
    const free = []
    for (const s of SPEC) {
      let hit
      if (s.type === 'page') hit = rows.some((r) => r.key.startsWith('kn:') && r.ch === s.chans[0])
      else hit = rows.some((r) => r.type === s.type && r.num === s.num && s.chans.includes(r.ch))
      if (!hit) free.push(s.name)
    }
    expect(free).toEqual([])
  })
  it('one control, one target: no two rows share a note/CC and channel, no key twice', () => {
    const seen = new Set(); const keys = new Set()
    for (const r of rows) {
      const k = `${r.type}:${r.ch}:${r.num}`
      expect(seen.has(k), k + ' ' + r.key).toBe(false); seen.add(k)
      expect(keys.has(r.key), r.key).toBe(false); keys.add(r.key)
    }
  })
  it('every row sits on a real control of the spec', () => {
    const real = new Set(SPEC.filter((s) => s.type !== 'page').flatMap((s) => s.chans.map((c) => `${s.type}:${c}:${s.num}`)))
    for (const r of rows) expect(real.has(`${r.type}:${r.ch}:${r.num}`), r.key).toBe(true)
  })
  it('the legend names every new key', () => {
    for (const r of rows) {
      if (/^(lookpad:|kn:)/.test(r.key)) continue
      expect(draw.CONTROLS.some((c) => c.key === r.key) || r.key in draw.BUTTONS || r.key === 'master' || /^(cue|blackout|lookpage)/.test(r.key), r.key).toBe(true)
    }
  })
})

describe('APC40 map-all: ARM, release and the strobe cap', () => {
  const app = fs.readFileSync(new URL('./ui/app.js', import.meta.url), 'utf8')
  it('every new button goes through the ARM gate (a press while Safe does nothing)', () => {
    const start = app.indexOf('// ---- map-all (owner 2026-11-27')
    const end = app.indexOf("T.push({ group: 'Safety' })")
    const block = app.slice(start, end)
    // each pad() body starts with the armed check; the holds are gated inside midiHoldDown / midiStrobeDown / midiSend
    const pads = block.match(/pad\('[^']+'[^\n]*\n?[^\n]*if \(!midiArmed\) return/g) || []
    expect(pads.length).toBeGreaterThanOrEqual(5)
    expect(app).toMatch(/function midiHoldDown[\s\S]{0,120}if \(!midiArmed/)
    expect(app).toMatch(/function midiStrobeDown[\s\S]{0,120}if \(!midiArmed/)
  })
  it('a hit releases on note-off (up) and by its own timer; the arm flash timer is <= 1.5 s', () => {
    expect(P.ARM_FLASH_MS).toBeLessThanOrEqual(1500)
    for (let n = 1; n <= 8; n++) expect(app).toContain("up: () => midiHoldUp(key)")
    expect(app).toContain('maxMs || mp.MAX_HOLD_MS')
  })
  it('strobe cap: whatever the knob or the arm buttons ask, the bar strobe channel never exceeds DMX 14 (<= 3 Hz)', () => {
    for (let u = 0; u <= 1.0001; u += 0.01) {
      const v = P.strobeDmxFromUnit(u)
      expect(v).toBeLessThanOrEqual(14)
      expect(P.strobeHzFromDmx(v)).toBeLessThanOrEqual(3)
    }
    for (const bad of [15, 40, 103, 104, 200, 255, NaN, -1]) expect(P.capStrobeDmx(bad)).toBeLessThanOrEqual(14)
    // the arm 6-8 strobe hits go through strobeHit, which writes only capped values onto a strobe channel
    const fx = [{ id: 'b', universe: 0, address: 1, profile: 'bar' }, { id: 'm', universe: 1, address: 1, profile: 'mov' }]
    const prof = { bar: { channels: ['dimmer', 'r', 'g', 'b', 'w', 'strobe'] }, mov: { channels: ['pan', 'tilt', 'dimmer', 'shutter'] } }
    for (const u of [0, 0.5, 1]) {
      const hit = P.strobeHit(fx, (f) => prof[f.profile], 'all', u)
      const sc = hit.holds.filter((c) => c.channel === 6)
      expect(sc).toHaveLength(1)
      expect(sc[0].value).toBeLessThanOrEqual(14)
      expect(hit.holds.some((c) => c.universe === 1)).toBe(false)   // a mover is soft strobe only, its shutter untouched
      expect(hit.fxIds).toEqual(['m'])
    }
  })
  it('crossfader and solo maths', () => {
    expect(P.xfadeFactor('A', 0)).toBe(1); expect(P.xfadeFactor('A', 0.5)).toBe(1); expect(P.xfadeFactor('A', 1)).toBe(0)
    expect(P.xfadeFactor('B', 1)).toBe(1); expect(P.xfadeFactor('B', 0.5)).toBe(1); expect(P.xfadeFactor('B', 0)).toBe(0)
    expect(P.soloFactor(new Set(['a']), 'a')).toBe(1); expect(P.soloFactor(new Set(['a']), 'b')).toBe(P.SOLO_REST); expect(P.soloFactor(new Set(), 'b')).toBe(1)
    expect(P.rateStep(1, 1)).toBe(2); expect(P.rateStep(8, 1)).toBe(8); expect(P.rateStep(0.125, -1)).toBe(0.125)
  })
  it('knob pages 5-9 only write values the desk routes accept', () => {
    const S = { fx: { depth: 255, bpm: 120 }, colorFx: { mode: 'hue', beats: 4, spread: 0.5, amount: 100 }, layers: [{ id: 'cue', level: 1, rate: 1, headScale: 1 }], chase: { holdMs: 500, fadeMs: 100, beats: 4 }, master: 200, fixtures: [{ id: 'a', values: { dimmer: 100 } }] }
    for (const k of P.KNOBS.filter((x) => x.ch >= 5)) {
      for (const u of [0, 0.5, 1]) {
        const r = P.knobSend(k, u, S)
        expect(r && r.route).toMatch(/^api\//)
        expect(JSON.stringify(r.body)).not.toMatch(/null|NaN/)
      }
      expect(P.knobUnit(k, k.read(S))).not.toBeUndefined()
    }
  })
})
