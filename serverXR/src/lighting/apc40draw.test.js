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
    expect(Object.keys(b).sort()).toEqual(Object.keys(BUTTONS).sort())
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
    // blackout still comes from the preset layout: the drawing never invents a binding the preset lacks
    expect(v.buttons.find((x) => x.key === 'blackout').note).toBe(0x56)
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
    const p = createLedPainter({ out: () => port, armed: () => true, map: () => map, cues: () => cues, state: () => ({ blackout: true }), looks: () => looks, page: () => state.page, setPage: (n) => { state.page = n }, polledId: () => state.polled, now: () => 0 })
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
