import { describe, it, expect } from 'vitest'
import { createRequire } from 'node:module'

const req = createRequire(import.meta.url)
const P = req('./ui/midiPatch.js')
const { apc40Preset, apc40Lights, lightDiff, createLedPainter } = req('./ui/midiCues.js')

describe('relative encoder (tempo, cue level)', () => {
  it('1-63 is up, 64-127 is down, 0 and 64 are no move', () => {
    expect(P.relDelta(1)).toBe(1)
    expect(P.relDelta(63)).toBe(63)
    expect(P.relDelta(127)).toBe(-1)
    expect(P.relDelta(65)).toBe(-63)
    expect(P.relDelta(0)).toBe(0)
    expect(P.relDelta(64)).toBe(0)
    expect(P.relDelta(200)).toBe(0)
    expect(P.relDelta(NaN)).toBe(0)
  })
  it('one click is one BPM and the desk range holds', () => {
    expect(P.bpmStep(120, 1)).toBe(121)
    expect(P.bpmStep(120, -3)).toBe(117)
    expect(P.bpmStep(300, 5)).toBe(300)
    expect(P.bpmStep(20, -5)).toBe(20)
    expect(P.bpmStep(undefined, 1)).toBe(121)
  })
  it('colour effect mode steps one detent per press and stops at the ends', () => {
    expect(P.cfxModeStep('none', 1)).toBe('hue')
    expect(P.cfxModeStep('hue', 5)).toBe('chase')
    expect(P.cfxModeStep('swap', 1)).toBe('swap')
    expect(P.cfxModeStep('none', -1)).toBe('none')
    expect(P.cfxModeStep('chase', -1)).toBe('hue')
    expect(P.cfxModeStep('weird', 1)).toBe('hue')
  })
})

describe('tap tempo and nudge', () => {
  it('the first tap sets the beat only, the second gives the speed', () => {
    const t = P.createTapper()
    expect(t.tap(10000)).toEqual({ epoch: 10000 })
    expect(t.tap(10500)).toEqual({ epoch: 10500, bpm: 120 })
  })
  it('the mean of the last four taps, a long gap starts again', () => {
    const t = P.createTapper()
    ;[0, 500, 1000, 1500, 2000].forEach((x) => t.tap(x))
    expect(t.tap(2500).bpm).toBe(120)
    expect(t.count()).toBe(P.TAP_KEEP)
    expect(t.tap(2500 + P.TAP_RESET_MS + 1)).toEqual({ epoch: 2500 + P.TAP_RESET_MS + 1 })
  })
  it('a gap that is no tempo (over 300 BPM) moves the beat and leaves the speed', () => {
    const t = P.createTapper()
    t.tap(1000)
    expect(t.tap(1100)).toEqual({ epoch: 1100 })
  })
  it('nudge moves the beat grid by 25 ms either way, never below 0', () => {
    expect(P.NUDGE_MS).toBe(25)
    expect(P.nudgeEpoch(1000, 1, 5000)).toBe(1025)
    expect(P.nudgeEpoch(1000, -1, 5000)).toBe(975)
    expect(P.nudgeEpoch(0, 1, 5000)).toBe(5025)   // no beat yet: starts from now
    expect(P.nudgeEpoch(10, -1, 5000)).toBe(0)
  })
})

describe('layer rate taper', () => {
  it('centre is 1x, ends are 1/8x and 8x, and it reads back', () => {
    expect(P.rateFromUnit(0.5)).toBe(1)
    expect(P.rateFromUnit(0)).toBe(0.125)
    expect(P.rateFromUnit(1)).toBe(8)
    expect(P.unitFromRate(1)).toBeCloseTo(0.5, 6)
    expect(P.unitFromRate(64)).toBe(1)
    expect(P.unitFromRate(0.01)).toBe(0)
    expect(P.unitFromRate(undefined)).toBeCloseTo(0.5, 6)
  })
  it('always inside what api/layer accepts (0.01-64)', () => {
    for (let u = -0.5; u <= 1.5; u += 0.05) { const r = P.rateFromUnit(u); expect(r).toBeGreaterThanOrEqual(0.01); expect(r).toBeLessThanOrEqual(64) }
  })
})

describe('colour effect controls', () => {
  it('beats come from the fader in six steps and read back to the same step', () => {
    expect([0, 0.2, 0.4, 0.6, 0.8, 1].map(P.cfxBeatsFromUnit)).toEqual([1, 2, 4, 8, 16, 32])
    for (const b of P.CFX_BEATS) expect(P.cfxBeatsFromUnit(P.unitFromCfxBeats(b))).toBe(b)
  })
  it('the on/off button returns to the last mode, hue the first time', () => {
    expect(P.cfxToggle('none', null)).toBe('hue')
    expect(P.cfxToggle('chase', 'chase')).toBe('none')
    expect(P.cfxToggle('none', 'swap')).toBe('swap')
  })
  it('offers only the desk modes, and none of them is a colour pick (the no-green rule stays in colorfx.js)', () => {
    const { sanitizeColorFx } = req('./colorfx.js')
    for (const m of P.CFX_MODES) expect(sanitizeColorFx({}, { mode: m }).mode).toBe(m)
    for (const b of P.CFX_BEATS) expect(sanitizeColorFx({}, { beats: b }).beats).toBe(b)
  })
})

// the Reika rig as the test copy has it: 9 + 9 movers on universes 5 and 4, 15 bars on 2 and 3
const rig = () => [
  ...Array.from({ length: 9 }, (_, i) => ({ id: 'L' + i, universe: 5, address: 1 + i * 40, profile: 'MovingBar43', on: true, values: { dimmer: 200 } })),
  ...Array.from({ length: 9 }, (_, i) => ({ id: 'R' + i, universe: 4, address: 1 + i * 40, profile: 'MovingBar43', on: true, values: { dimmer: 100 } })),
  ...Array.from({ length: 8 }, (_, i) => ({ id: 'B' + i, universe: 2, address: 1 + i * 60, profile: 'BAR1240PIX57', on: true, values: { dimmer: 255 } })),
  ...Array.from({ length: 7 }, (_, i) => ({ id: 'C' + i, universe: 3, address: 1 + i * 60, profile: 'BAR1240PIX57', on: true, values: { dimmer: 255 } })),
]
describe('rig groups', () => {
  it('left truss is universe 5, right truss universe 4, back bars the rest', () => {
    const g = P.rigGroups(rig(), [])
    expect(g.map((x) => [x.key, x.label, x.ids.length])).toEqual([['left', 'Left truss', 9], ['right', 'Right truss', 9], ['back', 'Back bars', 15]])
    expect(g[0].ids.every((id) => id.startsWith('L'))).toBe(true)
    expect(g[1].ids.every((id) => id.startsWith('R'))).toBe(true)
    expect(g[2].ids.every((id) => /^[BC]/.test(id))).toBe(true)
  })
  it('a desk group with the name wins over the universe rule', () => {
    const g = P.rigGroups(rig(), [{ name: 'Left Truss', ids: ['R0', 'R1'] }])
    expect(g[0].ids).toEqual(['R0', 'R1'])
    expect(g[1].ids).toHaveLength(9)
  })
  it('no fixtures, no groups', () => {
    expect(P.rigGroups(null, null).map((x) => x.ids.length)).toEqual([0, 0, 0])
  })
  it('the dimmer reads the mean of the group, on means every member on', () => {
    const f = rig(), [l, r] = P.rigGroups(f, [])
    expect(P.groupDimRead(f, l)).toBeCloseTo(200 / 255, 6)
    expect(P.groupDimRead(f, r)).toBeCloseTo(100 / 255, 6)
    expect(P.groupIsOn(f, l)).toBe(true)
    f.find((x) => x.id === 'L3').on = false
    expect(P.groupIsOn(f, l)).toBe(false)
    expect(P.groupIsOn(f, { ids: [] })).toBe(false)
  })
})

describe('hold-to-flash channels', () => {
  const prof = { channels: ['pan', 'tilt', 'dimmer', 'shutter', 'strobe', 'r1', 'g1', 'b1', 'w1', 'color_macro', 'uv'] }
  it('dimmer, open shutter and every emitter at 255; never strobe, pan, tilt or macro', () => {
    const c = P.flashChannels({ universe: 5, address: 10 }, prof)
    expect(c.map((x) => x.channel)).toEqual([12, 13, 15, 16, 17, 18])
    expect(c.every((x) => x.universe === 5 && x.value === 255)).toBe(true)
  })
  it('release is the same channels at -1', () => {
    const c = P.flashChannels({ universe: 0, address: 1 }, { channels: ['dimmer', 'r', 'g', 'b'] })
    expect(P.releaseOf(c).map((x) => x.value)).toEqual([-1, -1, -1, -1])
    expect(P.releaseOf(c).map((x) => x.channel)).toEqual(c.map((x) => x.channel))
  })
  it('a channel past 512 is dropped', () => {
    expect(P.flashChannels({ universe: 0, address: 511 }, { channels: ['dimmer', 'r', 'g', 'b'] }).map((x) => x.channel)).toEqual([511, 512])
  })
  it('the owner tag is one the desk accepts, and a forgotten hit lets go by itself', () => {
    expect(P.HOLD_OWNER).toMatch(/^[A-Za-z0-9._:@-]{1,40}$/)
    expect(P.MAX_HOLD_MS).toBeLessThanOrEqual(30000)
  })
  it('zoom roles of a profile', () => {
    expect(P.zoomRoles({ channels: ['tilt', 'zoom', 'zoom2', 'dimmer'] })).toEqual(['zoom', 'zoom2'])
    expect(P.zoomRoles({ channels: ['dimmer'] })).toEqual([])
    expect(P.zoomRoles(undefined)).toEqual([])
  })
})

const FULL_KEYS = ['master', 'cuego', 'cuestop', 'cueback', 'cueauto', 'cueloop', 'blackout', 'lookpage:next', 'lookpage:prev',
  ...Array.from({ length: 40 }, (_, k) => 'lookpad:' + k),
  'grp:left:dim', 'grp:right:dim', 'grp:back:dim', 'grp:left:on', 'grp:right:on', 'grp:back:on',
  'layerlevel', 'layerrate', 'tap', 'nudge:-', 'nudge:+', 'tempo:rel',
  'zoom', 'cfxamount', 'cfxbeats', 'cfxspread', 'cfxmode:rel', 'cfxon',
  'hit:white', 'hit:left', 'hit:right', 'hit:swap', 'blackoutoff', 'panic',
  // rows the preset must never bind
  'ch:fx1:strobe', 'ch:fx1:zoom', 'ch:fx1:shutter', 'fix:fx1', 'alldim']

describe('APC40 preset, the full patch', () => {
  const rows = apc40Preset(FULL_KEYS)
  const by = Object.fromEntries(rows.map((r) => [r.key, r]))
  it('49 before, 49 + 24 now: every new target is bound once', () => {
    expect(apc40Preset(FULL_KEYS.filter((k) => !/^(grp:|layer|tap|nudge|tempo|zoom|cfx|hit:|blackoutoff|panic)/.test(k)))).toHaveLength(49)
    expect(rows).toHaveLength(73)
  })
  it('faders 1-3 and activators 1-3 are the three groups, on the channel of their track', () => {
    expect(by['grp:left:dim']).toEqual({ key: 'grp:left:dim', type: 'cc', ch: 1, num: 7 })
    expect(by['grp:right:dim']).toMatchObject({ type: 'cc', ch: 2, num: 7 })
    expect(by['grp:back:dim']).toMatchObject({ type: 'cc', ch: 3, num: 7 })
    expect(by['grp:left:on']).toEqual({ key: 'grp:left:on', type: 'note', ch: 1, num: 0x32 })
    expect(by['grp:right:on']).toMatchObject({ ch: 2, num: 0x32 })
    expect(by['grp:back:on']).toMatchObject({ ch: 3, num: 0x32 })
  })
  it('layer level, rate, zoom and colour on faders 6-8 and track knobs 6-8', () => {
    expect(by.zoom).toMatchObject({ type: 'cc', ch: 6, num: 7 })
    expect(by.layerlevel).toMatchObject({ type: 'cc', ch: 7, num: 7 })
    expect(by.cfxamount).toMatchObject({ type: 'cc', ch: 8, num: 7 })
    expect(by.layerrate).toMatchObject({ type: 'cc', ch: 1, num: 53 })
    expect(by.cfxbeats).toMatchObject({ num: 54 })
    expect(by.cfxspread).toMatchObject({ num: 55 })
  })
  it('tempo knob and cue level are the relative CCs 13 and 47; tap and nudge are 0x63-0x65', () => {
    expect(by['tempo:rel']).toMatchObject({ type: 'cc', ch: 1, num: 13 })
    expect(by['cfxmode:rel']).toMatchObject({ type: 'cc', ch: 1, num: 47 })
    expect([by.tap.num, by['nudge:-'].num, by['nudge:+'].num]).toEqual([0x63, 0x64, 0x65])
    expect(by.cfxon.num).toBe(0x5a)
  })
  it('hits are the four momentary device buttons, release and panic the two single buttons', () => {
    expect([by['hit:white'].num, by['hit:left'].num, by['hit:right'].num, by['hit:swap'].num]).toEqual([0x3e, 0x3f, 0x40, 0x41])
    expect(by.blackoutoff.num).toBe(0x66)
    expect(by.panic.num).toBe(0x67)
    expect(by.blackout.num).toBe(0x56)   // unchanged
  })
  it('strobe stays out: nothing per-channel, no strobe, no fixture rows', () => {
    expect(rows.some((r) => r.key.startsWith('ch:') || r.key.startsWith('fix:') || /strobe|shutter/.test(r.key))).toBe(false)
  })
  it('one control drives one target', () => {
    const seen = new Set()
    for (const r of rows) { const id = `${r.type}:${r.ch}:${r.num}`; expect(seen.has(id)).toBe(false); seen.add(id) }
  })
  it('only keys the page offers', () => {
    expect(apc40Preset(['tap']).map((r) => r.key)).toEqual(['tap'])
    expect(apc40Preset([])).toEqual([])
  })
})

describe('activator lights', () => {
  const map = { 'grp:left:on': { type: 'note', ch: 1, num: 0x32 }, 'grp:right:on': { type: 'note', ch: 2, num: 0x32 }, 'grp:back:on': { type: 'note', ch: 3, num: 0x32 }, blackoutoff: { type: 'note', ch: 1, num: 0x66 } }
  it('single colour on the channel of the track: 1 on, 0 off', () => {
    const l = apc40Lights(map, { list: [] }, { blackout: false, groupOn: { left: true, right: false, back: true } }, null)
    expect(l.filter((x) => x.note === 0x32)).toEqual([{ note: 0x32, vel: 1, ch: 0 }, { note: 0x32, vel: 0, ch: 1 }, { note: 0x32, vel: 1, ch: 2 }])
    expect(l.find((x) => x.note === 0x66)).toEqual({ note: 0x66, vel: 0 })
  })
  it('session record lights while blacked out', () => {
    const l = apc40Lights(map, { list: [] }, { blackout: true, groupOn: {} }, null)
    expect(l.find((x) => x.note === 0x66).vel).toBe(1)
  })
  it('three activators on one note are three lights in the diff, and only changes go out', () => {
    const sent = new Map()
    const l = apc40Lights(map, { list: [] }, { blackout: false, groupOn: { left: true, right: true, back: true } }, null)
    expect(lightDiff(l, sent).filter((x) => x.note === 0x32)).toHaveLength(3)
    expect(lightDiff(l, sent)).toHaveLength(0)
    const l2 = apc40Lights(map, { list: [] }, { blackout: false, groupOn: { left: true, right: false, back: true } }, null)
    expect(lightDiff(l2, sent)).toEqual([{ note: 0x32, vel: 0, ch: 1 }])
  })
  it('the painter sends them on the track channel (0x90 + track)', () => {
    const wire = []
    const p = createLedPainter({ out: () => ({ send: (m) => wire.push(m) }), armed: () => true, map: () => map, cues: () => ({ list: [] }),
      state: () => ({ blackout: false, groupOn: { left: true, right: false, back: true } }), looks: () => [], page: () => 0, setPage: () => {},
      polledId: () => '', now: () => 0 })
    p.paint()
    expect(wire.filter((m) => m[1] === 0x32)).toEqual([[0x90, 0x32, 1], [0x91, 0x32, 0], [0x92, 0x32, 1]])
  })
  it('Safe: no group state, no activator light', () => {
    const l = apc40Lights(map, { list: [] }, { blackout: false }, null)
    expect(l.filter((x) => x.note === 0x32)).toEqual([])
  })
})
