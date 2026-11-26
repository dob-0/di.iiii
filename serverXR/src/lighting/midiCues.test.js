import { describe, it, expect } from 'vitest'
import { createRequire } from 'node:module'

const { MAX_CUE_PADS, SENT_WINS_MS, APC40_COLOUR, cuePadTargets, cueTransport, cueView, noteSent, apc40PadNote, apc40Preset, nextIndex, apc40Lights, lightDiff } =
  createRequire(import.meta.url)('./ui/midiCues.js')

const cues = (n, extra = {}) => ({ list: Array.from({ length: n }, (_, i) => ({ id: 'c' + i, name: 'Look ' + (i + 1) })), ...extra })

describe('cue list on MIDI pads', () => {
  it('one pad per cue, GO with that index', () => {
    const t = cuePadTargets(cues(28))
    expect(t).toHaveLength(28)
    expect(t[0]).toEqual({ key: 'cue:0', label: 'Cue 1  Look 1', route: 'api/cues/go', body: { index: 0 } })
    expect(t[27].body).toEqual({ index: 27 })
  })
  it('never more pads than the grid, nothing for no list', () => {
    expect(cuePadTargets(cues(55))).toHaveLength(MAX_CUE_PADS)
    expect(cuePadTargets(null)).toEqual([])
    expect(cuePadTargets({ list: 'x' })).toEqual([])
  })
  it('play-in-order and loop flip the desk state, not a page mirror', () => {
    const off = Object.fromEntries(cueTransport(cues(3, { autoplay: false, loop: true })).map((t) => [t.key, t.body]))
    expect(off.cueauto).toEqual({ autoplay: true })
    expect(off.cueloop).toEqual({ loop: false })
    const on = Object.fromEntries(cueTransport(cues(3, { autoplay: true })).map((t) => [t.key, t.body]))
    expect(on.cueauto).toEqual({ autoplay: false })
    expect(on.cuego).toEqual({})
  })
})

describe('a switch pressed twice flips back', () => {
  it('what the page just sent beats a stale poll, then the desk has the word again', () => {
    const sent = {}
    const stale = { list: [], autoplay: false, loop: false }
    noteSent(sent, { autoplay: true }, 1000)
    const v = cueView(stale, sent, 1500)
    expect(v.autoplay).toBe(true)
    expect(cueTransport(v).find((t) => t.key === 'cueauto').body).toEqual({ autoplay: false })
    expect(v.loop).toBe(false)
    expect(cueView(stale, sent, 1000 + SENT_WINS_MS).autoplay).toBe(false)
    expect(stale.autoplay).toBe(false)
  })
})

describe('APC40 mkII layout (Akai protocol v1.2, Generic Mode)', () => {
  it('cue 1 is the top-left pad, cue 40 the bottom-right', () => {
    expect(apc40PadNote(0)).toBe(0x20)
    expect(apc40PadNote(7)).toBe(0x27)
    expect(apc40PadNote(8)).toBe(0x18)
    expect(apc40PadNote(32)).toBe(0x00)
    expect(apc40PadNote(39)).toBe(0x07)
    expect(apc40PadNote(40)).toBe(null)
  })
  it('40 pads, 40 different notes, all inside CLIP LAUNCH 0x00-0x27', () => {
    const n = Array.from({ length: 40 }, (_, i) => apc40PadNote(i))
    expect(new Set(n).size).toBe(40)
    expect(Math.min(...n)).toBe(0)
    expect(Math.max(...n)).toBe(0x27)
  })
  it('maps only what the page offers, and no control twice', () => {
    const keys = ['master', 'blackout', 'cuego', 'cueback', 'cuestop', 'cueauto', 'cueloop', ...cuePadTargets(cues(28)).map((t) => t.key)]
    const p = apc40Preset(keys)
    expect(p).toHaveLength(7 + 28)
    expect(p.find((m) => m.key === 'master')).toEqual({ key: 'master', type: 'cc', ch: 1, num: 0x0e })
    expect(p.find((m) => m.key === 'cuego').num).toBe(0x5b)
    expect(p.find((m) => m.key === 'blackout').num).toBe(0x56)
    const sig = p.map((m) => m.type + m.ch + ':' + m.num)
    expect(new Set(sig).size).toBe(sig.length)
    expect(apc40Preset([])).toEqual([])
  })
})

describe('APC40 pad lights follow the cue list', () => {
  const keys = ['master', 'blackout', 'cuego', 'cueback', 'cuestop', 'cueauto', 'cueloop', ...Array.from({ length: 40 }, (_, i) => 'cue:' + i)]
  const map = Object.fromEntries(apc40Preset(keys).map((m) => [m.key, { type: m.type, ch: m.ch, num: m.num }]))
  const at = (lights, note) => lights.find((l) => l.note === note).vel

  it('running red, next orange, other cues ember, empty pads dark', () => {
    const L = apc40Lights(map, cues(28, { index: 4, running: true }), {})
    expect(at(L, apc40PadNote(4))).toBe(APC40_COLOUR.running)
    expect(at(L, apc40PadNote(5))).toBe(APC40_COLOUR.next)
    expect(at(L, apc40PadNote(0))).toBe(APC40_COLOUR.cue)
    expect(at(L, apc40PadNote(27))).toBe(APC40_COLOUR.cue)
    expect(at(L, apc40PadNote(28))).toBe(APC40_COLOUR.off)
    expect(at(L, 0x5b)).toBe(1)
  })
  it('stopped: nothing red, PLAY dark, GO would fire the next cue', () => {
    const L = apc40Lights(map, cues(28, { index: 4, running: false }), {})
    expect(L.filter((l) => l.vel === APC40_COLOUR.running && l.note < 0x28)).toEqual([])
    expect(at(L, apc40PadNote(5))).toBe(APC40_COLOUR.next)
    expect(at(L, 0x5b)).toBe(0)
  })
  it('last cue: next is cue 1 only when the list loops', () => {
    expect(nextIndex(27, 28, false)).toBe(-1)
    expect(nextIndex(27, 28, true)).toBe(0)
    expect(nextIndex(-1, 28, false)).toBe(0)
    expect(nextIndex(0, 0, true)).toBe(-1)
  })
  it('switches and blackout show their state', () => {
    const on = apc40Lights(map, cues(3, { autoplay: true, loop: true }), { blackout: true })
    expect(at(on, 0x53)).toBe(APC40_COLOUR.next)
    expect(at(on, 0x54)).toBe(APC40_COLOUR.next)
    expect(at(on, 0x56)).toBe(APC40_COLOUR.running)
    const off = apc40Lights(map, cues(3), {})
    expect(at(off, 0x53)).toBe(APC40_COLOUR.cue)
    expect(at(off, 0x56)).toBe(APC40_COLOUR.dim)
  })
  it('a re-learned pad lights where it now is; a fader binding lights nothing', () => {
    const m2 = { ...map, 'cue:0': { type: 'note', ch: 1, num: 0x07 }, master: { type: 'cc', ch: 1, num: 14 } }
    const L = apc40Lights(m2, cues(2, { index: 0, running: true }), {})
    expect(at(L, 0x07)).toBe(APC40_COLOUR.running)
    expect(apc40Lights({ master: { type: "cc", ch: 1, num: 14 } }, cues(2), {})).toEqual([])
    expect(apc40Lights({}, cues(5), {})).toEqual([])
    expect(apc40Lights(map, null, {}).filter((l) => l.note < 0x28).every((l) => l.vel === 0)).toBe(true)
  })
  it('only changes go on the wire; a forgotten pad is sent again', () => {
    const sent = new Map()
    const L = apc40Lights(map, cues(28, { index: 0, running: true }), {})
    expect(lightDiff(L, sent)).toHaveLength(L.length)
    expect(lightDiff(L, sent)).toEqual([])
    sent.delete(apc40PadNote(0))
    expect(lightDiff(L, sent)).toEqual([{ note: apc40PadNote(0), vel: APC40_COLOUR.running }])
  })
})
