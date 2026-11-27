import { describe, it, expect } from 'vitest'
import { createRequire } from 'node:module'

const { createLedPainter, OPT_LOOK_MS, LOOK_PADS, LOOK_PAGE_KEYS, lookPageCount, clampLookPage, lookAt, lookPadFire, lookPadTargets, MAX_CUE_PADS, SENT_WINS_MS, APC40_COLOUR, cuePadTargets, cueTransport, cueView, noteSent, apc40PadNote, apc40Preset, nextIndex, apc40Lights, lightDiff } =
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
    const keys = ['master', 'blackout', 'cuego', 'cueback', 'cuestop', 'cueauto', 'cueloop', ...cuePadTargets(cues(28)).map((t) => t.key), 'lookpage:prev', 'lookpage:next', ...lookPadTargets().map((t) => t.key)]
    const p = apc40Preset(keys)
    expect(p).toHaveLength(7 + 2 + 40)   // the cue:<i> pads are offered but not on the preset grid
    expect(p.some((m) => m.key.startsWith('cue:'))).toBe(false)
    expect(p.find((m) => m.key === 'lookpage:next')).toEqual({ key: 'lookpage:next', type: 'note', ch: 1, num: 0x60 })
    expect(p.find((m) => m.key === 'lookpage:prev')).toEqual({ key: 'lookpage:prev', type: 'note', ch: 1, num: 0x61 })
    expect(p.find((m) => m.key === 'lookpad:0').num).toBe(apc40PadNote(0))
    expect(p.find((m) => m.key === 'lookpad:39').num).toBe(apc40PadNote(39))
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
  // the cue pads are off the preset grid now; the learn row can still put them on pads
  const map = Object.fromEntries([...apc40Preset(keys).map((m) => [m.key, { type: m.type, ch: m.ch, num: m.num }]),
    ...Array.from({ length: 40 }, (_, i) => ['cue:' + i, { type: 'note', ch: 1, num: apc40PadNote(i) }])])
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

describe('looks on the grid, 40 to a page', () => {
  const looks = Array.from({ length: 67 }, (_, i) => ({ id: 'l' + (i + 1), name: 'Look ' + (i + 1) }))
  const keys = ['lookpage:prev', 'lookpage:next', 'cuego', 'cueback', 'cuestop', 'cueauto', 'cueloop', 'blackout', ...lookPadTargets().map((t) => t.key)]
  const map = Object.fromEntries(apc40Preset(keys).map((m) => [m.key, { type: m.type, ch: m.ch, num: m.num }]))
  const at = (lights, note) => lights.find((l) => l.note === note).vel
  const view = (page, activeId = '') => ({ looks, page, activeId })

  it('67 looks are 2 pages; the page follows the list and never leaves it', () => {
    expect(lookPageCount(67)).toBe(2)
    expect(lookPageCount(40)).toBe(1)
    expect(lookPageCount(41)).toBe(2)
    expect(lookPageCount(0)).toBe(1)
    expect(clampLookPage(5, 67)).toBe(1)
    expect(clampLookPage(-1, 67)).toBe(0)
    expect(clampLookPage(1, 30)).toBe(0)
  })
  it('slot k of page p is look 40 p + k; past the last look it is empty', () => {
    expect(lookAt(looks, 0, 0).id).toBe('l1')
    expect(lookAt(looks, 0, 39).id).toBe('l40')
    expect(lookAt(looks, 1, 0).id).toBe('l41')
    expect(lookAt(looks, 1, 26).id).toBe('l67')
    expect(lookAt(looks, 1, 27)).toBe(null)
    expect(lookAt(looks, 1, 39)).toBe(null)
    expect(lookAt(looks, 0, 40)).toBe(null)
    expect(lookAt([], 0, 0)).toBe(null)
    expect(lookPadTargets()).toHaveLength(LOOK_PADS)
    expect(lookPadTargets()[7].key).toBe('lookpad:7')
    expect(LOOK_PAGE_KEYS).toEqual({ prev: 'lookpage:prev', next: 'lookpage:next' })
  })
  it('lights: look on air red, the others on the page ember, empty slots dark; the page change repaints', () => {
    const p1 = apc40Lights(map, null, {}, view(0, 'l3'))
    expect(at(p1, apc40PadNote(2))).toBe(APC40_COLOUR.running)
    expect(at(p1, apc40PadNote(0))).toBe(APC40_COLOUR.cue)
    expect(at(p1, apc40PadNote(39))).toBe(APC40_COLOUR.cue)
    const p2 = apc40Lights(map, null, {}, view(1, 'l3'))   // the look on air is on page 1: no red here
    expect(p2.filter((l) => l.note < 0x28 && l.vel === APC40_COLOUR.running)).toEqual([])
    expect(at(p2, apc40PadNote(26))).toBe(APC40_COLOUR.cue)
    expect(at(p2, apc40PadNote(27))).toBe(APC40_COLOUR.off)
    expect(at(p2, apc40PadNote(39))).toBe(APC40_COLOUR.off)
    const on41 = apc40Lights(map, null, {}, view(1, 'l41'))
    expect(at(on41, apc40PadNote(0))).toBe(APC40_COLOUR.running)
    const sent = new Map()
    expect(lightDiff(p1, sent).filter((l) => l.note < 0x28)).toHaveLength(40)
    expect(lightDiff(p2, sent).filter((l) => l.note < 0x28).length).toBeGreaterThan(0)
  })
  it('lookPadFire: the tile call, no layer key, empty slot gives null', () => {
    expect(lookPadFire(looks, 0, 0)).toEqual({ route: 'api/looks/fire', body: { id: 'l1' } })
    expect(lookPadFire(looks, 1, 26)).toEqual({ route: 'api/looks/fire', body: { id: 'l67' } })
    expect(Object.keys(lookPadFire(looks, 1, 0).body)).toEqual(['id'])
    expect(lookPadFire(looks, 1, 27)).toBe(null)
    expect(lookPadFire([], 0, 0)).toBe(null)
  })
  it('no look view lights no look pad (the cue pads keep working)', () => {
    expect(apc40Lights(map, cues(3), {}).filter((l) => l.note < 0x28)).toEqual([])
  })
})

describe('pad lights go out at the press (fake APC40 port)', () => {
  const looks = Array.from({ length: 67 }, (_, i) => ({ id: 'l' + (i + 1), name: 'Look ' + (i + 1) }))
  const keys = ['lookpage:prev', 'lookpage:next', 'cuego', 'cueback', 'cuestop', 'cueauto', 'cueloop', 'blackout', ...lookPadTargets().map((t) => t.key)]
  const map = Object.fromEntries(apc40Preset(keys).map((m) => [m.key, { type: m.type, ch: m.ch, num: m.num }]))
  // The fake Web MIDI output port: records every message with the harness clock.
  const rig = (armed = true) => {
    const h = { t: 0, polled: '', at: 0, page: 0, armed, msgs: [] }
    const port = { send: (b) => h.msgs.push({ t: h.t, note: b[1], vel: b[2] }) }
    h.p = createLedPainter({
      out: () => port, armed: () => h.armed, map: () => map, cues: () => ({ list: [] }), state: () => ({}),
      looks: () => looks, page: () => h.page, setPage: (p) => { h.page = p }, polledId: () => h.polled, polledAt: () => h.at, now: () => h.t,
    })
    return h
  }
  const note = (k) => apc40PadNote(k)
  const velOf = (h, n) => h.msgs.filter((m) => m.note === n).pop().vel

  it('the pressed pad is red in the same tick, the old one back to ember', () => {
    const h = rig(); h.polled = 'l1'; h.p.paint(); h.msgs.length = 0
    h.t = 100; h.p.pressLook('l3')
    expect(h.msgs.length).toBe(2)
    expect(h.msgs.every((m) => m.t === 100)).toBe(true)
    expect(velOf(h, note(2))).toBe(APC40_COLOUR.running); expect(velOf(h, note(0))).toBe(APC40_COLOUR.cue)
  })
  it('modelled: press to LED message on a fake clock, before = next poll (1.5 s gap + 0.9 s state), after = same tick', () => {
    const POLL_MS = 1500, STATE_MS = 900
    // before: the painter learns of the new look only from a poll that comes back after the fire
    const before = rig(); before.polled = 'l1'; before.p.paint(); before.msgs.length = 0
    const pressAt = 0
    before.t = pressAt + POLL_MS + STATE_MS; before.polled = 'l3'; before.p.paint()
    const beforeMs = before.msgs[0].t - pressAt
    const after = rig(); after.polled = 'l1'; after.p.paint(); after.msgs.length = 0
    const t0 = performance.now(); after.p.pressLook('l3'); const realMs = performance.now() - t0
    const afterMs = after.msgs[0].t - pressAt
    console.log(`press-to-LED  before ${beforeMs} ms  after ${afterMs} ms (fake clock); real send call ${realMs.toFixed(3)} ms`)
    expect(afterMs).toBe(0)
    expect(realMs).toBeLessThan(30)   // the only measured number here: one real send call
  })
  it('a poll that still shows the old look does not flip the pad back; the poll that agrees confirms', () => {
    const h = rig(); h.polled = 'l1'; h.p.paint(); h.p.pressLook('l3'); h.msgs.length = 0
    h.t = 1000; h.p.paint(); expect(h.msgs).toEqual([])
    h.t = 2000; h.polled = 'l3'; h.p.paint(); expect(h.msgs).toEqual([])
    h.polled = 'l5'; h.p.paint(); expect(velOf(h, note(2))).toBe(APC40_COLOUR.cue)   // desk moved on: the poll rules again
  })
  it('a refused or failed fire takes the guess back', () => {
    const h = rig(); h.polled = 'l1'; h.p.paint(); h.p.pressLook('l3'); h.msgs.length = 0
    h.p.answer('l3', true); expect(h.msgs).toEqual([])
    h.p.answer('l3', false)
    expect(velOf(h, note(2))).toBe(APC40_COLOUR.cue); expect(velOf(h, note(0))).toBe(APC40_COLOUR.running)
  })
  it('a guess the poll never confirms expires', () => {
    const h = rig(); h.polled = 'l1'; h.p.paint(); h.p.pressLook('l3'); h.msgs.length = 0
    h.t = OPT_LOOK_MS + 1; h.p.paint()
    expect(velOf(h, note(0))).toBe(APC40_COLOUR.running)
  })
  // I1 of the #1388 review: the guess ends by request time, not by age.
  it('a reading asked for BEFORE the desk answered the press never undoes the guess, past the old 4 s', () => {
    const h = rig(); h.polled = 'l1'; h.at = 0; h.p.paint(); h.t = 100; h.p.pressLook('l3'); h.msgs.length = 0
    h.t = 700; h.p.answer('l3', true)
    h.t = 9000; h.at = 650; h.p.paint()                // a busy-held poll, asked before the answer, 9 s later (the old 4 s guess would have flipped)
    expect(h.msgs).toEqual([])
  })
  it('a reading asked for AFTER the answer rules at once: it agrees, or it shows a third look', () => {
    const h = rig(); h.polled = 'l1'; h.at = 0; h.p.paint(); h.t = 100; h.p.pressLook('l3'); h.t = 700; h.p.answer('l3', true); h.msgs.length = 0
    h.t = 800; h.polled = 'l5'; h.at = 760; h.p.paint()   // another surface moved the desk on; no 4 s of waiting
    expect(velOf(h, note(4))).toBe(APC40_COLOUR.running); expect(velOf(h, note(2))).toBe(APC40_COLOUR.cue)
  })
  it('a reading asked in the SAME millisecond as the answer counts as after it (>= not >)', () => {
    const h = rig(); h.polled = 'l1'; h.at = 0; h.p.paint(); h.t = 100; h.p.pressLook('l3'); h.t = 700; h.p.answer('l3', true); h.msgs.length = 0
    h.t = 800; h.polled = 'l5'; h.at = 700; h.p.paint()
    expect(velOf(h, note(4))).toBe(APC40_COLOUR.running)
  })
  it('an unanswered fire is held for the backstop only', () => {
    const h = rig(); h.polled = 'l1'; h.at = 0; h.p.paint(); h.p.pressLook('l3'); h.msgs.length = 0
    h.t = 5000; h.at = 4900; h.p.paint(); expect(h.msgs).toEqual([])
    h.t = OPT_LOOK_MS + 1; h.p.paint(); expect(velOf(h, note(0))).toBe(APC40_COLOUR.running)
  })
  it('a disarm drops the guess (L1): the re-armed pads show what the desk shows', () => {
    const h = rig(); h.polled = 'l1'; h.p.paint(); h.p.pressLook('l3'); h.p.reset(); h.msgs.length = 0
    h.p.paint()
    expect(velOf(h, note(0))).toBe(APC40_COLOUR.running); expect(velOf(h, note(2))).toBe(APC40_COLOUR.cue)
  })
  it('Safe: nothing is painted and a press sends no light', () => {
    const h = rig(false); h.p.pressLook('l3'); h.p.paint()
    expect(h.msgs).toEqual([])
  })
  it('a press on a look off this page lights nothing here; a page change repaints at once', () => {
    const h = rig(); h.polled = 'l1'; h.p.paint(); h.msgs.length = 0
    h.p.pressLook('l50'); expect(velOf(h, note(0))).toBe(APC40_COLOUR.cue)
    h.msgs.length = 0; h.page = 1; h.p.reset(); h.p.paint()
    expect(h.msgs.filter((m) => m.note < 0x28).length).toBe(40)
  })
})
