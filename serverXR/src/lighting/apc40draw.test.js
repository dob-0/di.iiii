import { describe, it, expect } from 'vitest'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { apc40View, ledHex, LED_HEX, BUTTONS } = require('./ui/apc40draw.js')
const { createLedPainter, apc40Preset, apc40PadNote, lookPadTargets, APC40_COLOUR } = require('./ui/midiCues.js')

const looks = Array.from({ length: 67 }, (_, i) => ({ id: 'l' + (i + 1), name: 'Look ' + (i + 1) }))
const keys = ['lookpage:prev', 'lookpage:next', 'cuego', 'cueback', 'cuestop', 'cueauto', 'cueloop', 'blackout', 'master', ...lookPadTargets().map((t) => t.key)]
const map = Object.fromEntries(apc40Preset(keys).map((m) => [m.key, { type: m.type, ch: m.ch, num: m.num }]))
const view = (o = {}) => apc40View({ map, cues: { list: [] }, state: {}, looks, page: 0, activeId: '', ...o })

describe('drawn APC40: pads', () => {
  it('top-left pad is look 1, bottom-right look 40, by name', () => {
    const v = view()
    expect(v.pads).toHaveLength(40)
    expect(v.pads[0]).toMatchObject({ i: 0, slot: 0, key: 'lookpad:0', name: 'Look 1', no: 1 })
    expect(v.pads[39]).toMatchObject({ slot: 39, name: 'Look 40', no: 40 })
  })
  it('the look on air is red, the others ember, a slot past the list dark and nameless', () => {
    const v = view({ activeId: 'l3', page: 1 })
    const live = v.pads.filter((p) => p.state === 'live')
    expect(live).toHaveLength(0)   // l3 is on page 1: page 2 holds looks 41-67
    expect(v.pads[0].name).toBe('Look 41'); expect(v.pads[0].no).toBe(41)
    expect(v.pads[27]).toMatchObject({ state: 'empty', name: '', no: 0, hex: LED_HEX[0] })
    const on = view({ activeId: 'l3' })
    expect(on.pads[2]).toMatchObject({ state: 'live', vel: APC40_COLOUR.running, hex: '#ff0000' })
    expect(on.pads.filter((p) => p.state === 'ember').every((p) => p.hex === '#591d00')).toBe(true)
    expect(on.pads.filter((p) => p.state === 'ember')).toHaveLength(39)
  })
  it('names the look on air, even when it is on another page', () => {
    expect(view({ activeId: 'l60' }).onAir).toBe('Look 60')
    expect(view().onAir).toBe('')
  })
  it('page count and clamp follow the looks', () => {
    expect(view({ page: 9 }).page).toBe(1)
    expect(view().pages).toBe(2)
    expect(view({ looks: [] }).pages).toBe(1)
    expect(view({ looks: [] }).pads.every((p) => p.state === 'empty')).toBe(true)
  })
  it('an unnamed look is still labelled', () => {
    expect(view({ looks: [{ id: 'x' }] }).pads[0].name).toBe('(unnamed)')
  })
})

describe('drawn APC40: buttons', () => {
  it('each mapped button carries what it does, on the control the preset puts it on', () => {
    const b = Object.fromEntries(view().buttons.map((x) => [x.key, x]))
    expect(b.cuego).toMatchObject({ note: 0x5b, hw: 'PLAY', short: 'GO' })
    expect(b.cuestop).toMatchObject({ note: 0x51, hw: 'STOP ALL CLIPS' })
    expect(b.cueback.hw).toBe('SCENE LAUNCH 1'); expect(b.cueauto.hw).toBe('SCENE LAUNCH 2'); expect(b.cueloop.hw).toBe('SCENE LAUNCH 3')
    expect(b.blackout).toMatchObject({ note: 0x56, hw: 'SCENE LAUNCH 5', danger: true })
    expect(b['lookpage:next'].hw).toBe('RIGHT'); expect(b['lookpage:prev'].hw).toBe('LEFT')
    expect(Object.keys(b).sort()).toEqual(Object.keys(map).filter((k) => BUTTONS[k]).sort())   // round 3: only what the map binds
    expect(view().master).toMatchObject({ mapped: true, cc: 0x0e })
  })
  it('blackout is the only one marked danger; its LED goes bright red when on, dim red when off', () => {
    expect(view().buttons.filter((x) => x.danger).map((x) => x.key)).toEqual(['blackout'])
    expect(view({ state: { blackout: true } }).buttons.find((x) => x.key === 'blackout').hex).toBe('#ff0000')
    expect(view().buttons.find((x) => x.key === 'blackout').hex).toBe('#590000')
  })
  it('the blackout button reads "Blackout on/off" on the drawing and in the legend text', () => {
    const b = view().buttons.find((x) => x.key === 'blackout')
    expect(b.short).toBe('BLACKOUT\non/off')
    expect(b.does).toMatch(/^Blackout on\/off/)
  })
  it('a rebound button is drawn where the map put it; an unbound key is not drawn', () => {
    const m2 = { ...map, cuego: { type: 'note', ch: 1, num: 0x5d }, blackout: undefined }
    delete m2.blackout
    const v = apc40View({ map: m2, cues: { list: [] }, state: {}, looks, page: 0 })
    expect(v.buttons.find((x) => x.key === 'cuego').note).toBe(0x5d)
    // round 3: an unbound key is not drawn, not even from the preset
    expect(v.buttons.find((x) => x.key === 'blackout')).toBeUndefined()
  })
  it('an empty map draws the preset layout and says it is not mapped; a bound map says so', () => {
    expect(apc40View({ map: {}, looks, page: 0 }).mapped).toBe(false)
    expect(view().mapped).toBe(true)
    expect(apc40View({ map: {}, looks, page: 0 }).pads[0].name).toBe('Look 1')
  })
})

describe('drawn APC40 = the real LEDs (fake APC40 port)', () => {
  it('every pad colour and button colour equals the velocity the painter sends, through the Akai table', () => {
    const sent = new Map()
    const port = { send: (b) => sent.set(b[1], b[2]) }
    const state = { polled: 'l5', page: 0 }
    const cues = { list: [{ id: 'c1' }, { id: 'c2' }], autoplay: true, loop: false }
    const p = createLedPainter({ out: () => port, armed: () => true, map: () => Object.fromEntries(apc40Preset([...Object.keys(BUTTONS), 'master', ...lookPadTargets().map((t) => t.key)]).map((m) => [m.key, { type: m.type, ch: m.ch, num: m.num }])), cues: () => cues, state: () => ({ blackout: true }), looks: () => looks, page: () => state.page, setPage: (n) => { state.page = n }, polledId: () => state.polled, now: () => 0 })
    p.paint()
    const v = view({ cues, state: { blackout: true }, activeId: 'l5' })
    for (const pad of v.pads) expect(pad.vel).toBe(sent.get(apc40PadNote(pad.i)))
    for (const b of v.buttons) if (b.vel != null) expect(b.vel).toBe(sent.get(b.note))
    expect(v.pads[4].hex).toBe(ledHex(sent.get(apc40PadNote(4))))
  })
  it('a velocity the table here lacks is grey and countable, never a made-up colour', () => {
    expect(ledHex(77)).toBe('#808080')
    expect(ledHex(5)).toBe('#ff0000')
  })
})

describe('drawn APC40: the full patch, strobe and the knob pages (round 2)', () => {
  const P = require('./ui/midiPatch.js')
  const all = [...Object.keys(BUTTONS), 'master', ...require('./ui/apc40draw.js').CONTROLS.map((c) => c.key), ...P.KNOBS.map((k) => k.key), ...lookPadTargets().map((t) => t.key)]
  const full = Object.fromEntries(apc40Preset(all).map((m) => [m.key, { type: m.type, ch: m.ch, num: m.num }]))
  const v = apc40View({ map: full, cues: { list: [] }, state: {}, looks, page: 0, activeId: '' })
  it('draws every new control: buttons, faders/knobs, and 23 device knobs on 4 banks', () => {
    expect(v.knobs).toHaveLength(23)
    expect(new Set(v.knobs.map((k) => k.bank))).toEqual(new Set([1, 2, 3, 4]))
    expect(v.controls).toHaveLength(16)
    for (const key of ['hit:strobe-all', 'hit:strobe-movers', 'tap', 'panic', 'hit:white']) expect(v.buttons.map((b) => b.key)).toContain(key)
    expect(v.controls.find((c) => c.key === 'strobe:rate').range).toMatch(/3 Hz/)
    expect(v.controls.find((c) => c.key === 'headscale').where).toBe('CC 49 ch 1')
  })
  it('every row has a printed name, a sentence and a range, none empty', () => {
    for (const r of [...v.controls, ...v.knobs]) { expect(r.hw).toBeTruthy(); expect(r.does).toBeTruthy(); expect(r.range).toBeTruthy() }
  })
})

describe('round 2: safe look, contrast, callouts', () => {
  const draw = require('./ui/apc40draw.js')
  const fs = require('node:fs')
  const src = fs.readFileSync(new URL('./ui/apc40draw.js', import.meta.url), 'utf8')
  const lum = (h) => { const c = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((x) => (x <= .03928 ? x / 12.92 : ((x + .055) / 1.055) ** 2.4)); return .2126 * c[0] + .7152 * c[1] + .0722 * c[2] }
  it('Safe dims the pads and kills every glow (pinned in the CSS)', () => {
    expect(src).toContain('.apc40.safe .apcp .pad')
    expect(src).toMatch(/\.apc40\.safe \.apcp \*[^']*box-shadow:none!important;filter:none!important/)
  })
  it('on-air label gradient keeps white text at 4.5:1 or more', () => {
    for (const bg of draw.LIVE_GRADIENT) expect(1.05 / (lum(bg) + .05)).toBeGreaterThanOrEqual(4.5)
  })
  it('crossfader A/B buttons have the press flash', () => { expect(src).toContain('.apcp .xab.hit') })
  it('ccTarget reads the Akai table: track faders by channel, master, crossfader, bank knobs', () => {
    expect(draw.ccTarget(3, 7)).toMatchObject({ id: 'fader.2' })
    expect(draw.ccTarget(1, 14)).toMatchObject({ id: 'fader.8' })
    expect(draw.ccTarget(1, 15)).toMatchObject({ id: 'xfader' })
    expect(draw.ccTarget(2, 18)).toMatchObject({ id: 'dk.2', bank: 2 })
    expect(draw.ccTarget(1, 13)).toMatchObject({ id: 'tempo', kind: 'rel' })
  })
  it('callouts come from the live binding map, one per bound group, none for unbound', () => {
    const c = draw.apc40Callouts(map, view())
    expect(c.length).toBeGreaterThan(0)
    for (const x of c) { expect(['top', 'bottom', 'left', 'right']).toContain(x.side); expect(x.text).toBeTruthy(); expect(x.target).toBeTruthy() }
    expect(draw.apc40Callouts({}, view({ map: {} })).length).toBeLessThan(c.length)
  })
})
