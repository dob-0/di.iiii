import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { BLEND_MODES, createDeck, setClip, trigger } from '../../project/tops/vjDeck.js'
import {
    PICKUP_WINDOW, applyMidi, effectiveMap, entryFor, isContinuousEntry, softTakeover, ledBytes, ledChanges, ledsFor, learnEntry, normalizeOverrides, relativeDelta, targetFromKey, withOverride
} from './deckBinding.js'
import { XONE_K2_CONTROLS, XONE_K2_FREE, XONE_K2_LEDS, XONE_K2_MAP, defaultMap, pickInputId } from './xoneK2.js'

const clip = (n) => ({ kind: 'asset', asset: `a${n}` })
const cc = (number, value, channel = 15) => ({ kind: 'cc', channel, cc: number, value })
const noteOn = (note, channel = 15) => ({ kind: 'noteOn', channel, note, velocity: 127 })
const noteOff = (note, channel = 15) => ({ kind: 'noteOff', channel, note, velocity: 0 })
const entry = (kind, number, action, args = {}, extra = {}) => ({ match: { kind, number, channel: 15 }, action, args, ...extra })

const filled = () => {
    let deck = createDeck({ layers: 4, columns: 4 })
    for (let l = 0; l < 4; l += 1) for (let c = 0; c < 2; c += 1) deck = setClip(deck, l, c, clip(l * 4 + c))
    return deck
}

describe('applyMidi', () => {
    it('opacity is absolute 0..1', () => {
        const deck = createDeck({ layers: 2 })
        const next = applyMidi(deck, cc(16, 127), [entry('cc', 16, 'opacity', { layer: 1 })])
        expect(next.layers[1].opacity).toBe(1)
        expect(applyMidi(deck, cc(16, 0), [entry('cc', 16, 'opacity', { layer: 1 })]).layers[1].opacity).toBe(0)
        expect(applyMidi(deck, cc(16, 64), [entry('cc', 16, 'opacity', { layer: 0 })]).layers[0].opacity).toBeCloseTo(64 / 127)
    })
    it('bypass, solo and side toggle on press and ignore release', () => {
        const deck = createDeck({ layers: 2 })
        const map = [entry('note', 1, 'bypass', { layer: 0 }), entry('note', 2, 'solo', { layer: 1 }), entry('note', 3, 'side', { layer: 0 })]
        const b = applyMidi(deck, noteOn(1), map)
        expect(b.layers[0].bypass).toBe(true)
        expect(applyMidi(b, noteOn(1), map).layers[0].bypass).toBe(false)
        expect(applyMidi(b, noteOff(1), map)).toBe(b)
        expect(applyMidi(deck, noteOn(2), map).layers[1].solo).toBe(true)
        const a = applyMidi(deck, noteOn(3), map)
        const bSide = applyMidi(a, noteOn(3), map)
        const off = applyMidi(bSide, noteOn(3), map)
        expect([a.layers[0].side, bSide.layers[0].side, off.layers[0].side]).toEqual(['a', 'b', ''])
    })
    it('clip trigger plays a filled slot and leaves an empty one alone', () => {
        const deck = filled()
        const map = [entry('note', 36, 'clip', { layer: 2, column: 1 }), entry('note', 37, 'clip', { layer: 2, column: 3 })]
        const next = applyMidi(deck, noteOn(36), map)
        expect(next.layers[2].active).toBe(1)
        expect(next.layers[2].trigger).toBe(deck.layers[2].trigger + 1)
        expect(applyMidi(deck, noteOn(37), map)).toBe(deck)
    })
    it('column play takes every layer', () => {
        const next = applyMidi(filled(), noteOn(52), [entry('note', 52, 'column', { column: 1 })])
        expect(next.layers.map((l) => l.active)).toEqual([1, 1, 1, 1])
    })
    it('crossfade and master are absolute', () => {
        const deck = createDeck()
        expect(applyMidi(deck, cc(9, 127), [entry('cc', 9, 'crossfade')]).crossfade).toBe(1)
        expect(applyMidi(deck, cc(9, 0), [entry('cc', 9, 'master')]).master).toBe(0)
    })
    it('relative encoders: two\'s complement ticks nudge, 0 does nothing, ends clamp', () => {
        expect([relativeDelta(1), relativeDelta(3), relativeDelta(127), relativeDelta(125), relativeDelta(0)]).toEqual([1, 3, -1, -3, 0])
        const deck = createDeck()
        const map = [entry('cc', 20, 'crossfade', {}, { relative: true }), entry('cc', 21, 'master', {}, { relative: true }), entry('cc', 0, 'bpm', {}, { relative: true })]
        expect(applyMidi(deck, cc(20, 1), map).crossfade).toBeCloseTo(0.52)
        expect(applyMidi(deck, cc(20, 127), map).crossfade).toBeCloseTo(0.48)
        expect(applyMidi(deck, cc(20, 0), map)).toBe(deck)
        expect(applyMidi(deck, cc(21, 5), map).master).toBe(1)
        expect(applyMidi(deck, cc(21, 120), map).master).toBeCloseTo(1 - 8 * 0.02)
        expect(applyMidi(deck, cc(0, 2), map).bpm).toBeCloseTo(deck.bpm + 1)
    })
    it('blend and clip speed come from a pot', () => {
        const deck = filled()
        const playing = trigger(deck, 0, 1)
        expect(applyMidi(deck, cc(4, 127), [entry('cc', 4, 'blend', { layer: 0 })]).layers[0].blend).toBe(String(BLEND_MODES.length - 1))
        expect(applyMidi(playing, cc(8, 127), [entry('cc', 8, 'clipSpeed', { layer: 0 })]).layers[0].clips[1].speed).toBe(4)
        expect(applyMidi(deck, cc(8, 127), [entry('cc', 8, 'clipSpeed', { layer: 0 })])).toBe(deck)
    })
    it('clearLayer stops the layer', () => {
        const playing = trigger(filled(), 1, 0)
        expect(applyMidi(playing, noteOn(5), [entry('note', 5, 'clearLayer', { layer: 1 })]).layers[1].active).toBe(-1)
    })
    it('tap goes to the view\'s handler when given, else counts taps itself', () => {
        const deck = createDeck()
        const map = [entry('note', 13, 'tap')]
        let taps = 0
        expect(applyMidi(deck, noteOn(13), map, { onTap: () => { taps += 1 } })).toBe(deck)
        expect(taps).toBe(1)
        const tapState = { taps: [] }
        applyMidi(deck, noteOn(13), map, { tapState, now: 1000 })
        const next = applyMidi(deck, noteOn(13), map, { tapState, now: 1500 })
        expect(next.bpm).toBeCloseTo(120)
    })
    it('unknown message, wrong channel, missing layer: the same deck object', () => {
        const deck = createDeck({ layers: 2 })
        const map = [entry('cc', 16, 'opacity', { layer: 0 }), entry('note', 40, 'bypass', { layer: 7 })]
        expect(applyMidi(deck, cc(99, 10), map)).toBe(deck)
        expect(applyMidi(deck, cc(16, 10, 3), map)).toBe(deck)
        expect(applyMidi(deck, noteOn(40), map)).toBe(deck)
        expect(applyMidi(deck, { kind: 'noteOn', channel: 1 }, [])).toBe(deck)
        expect(applyMidi(deck, null, map)).toBe(deck)
    })
})

describe('the K2 default map', () => {
    it('binds each control at most once and each entry is a distinct control', () => {
        const names = XONE_K2_MAP.map((e) => e.control)
        expect(new Set(names).size).toBe(names.length)
        const keys = XONE_K2_MAP.map((e) => `${e.match.kind}:${e.match.number}`)
        expect(new Set(keys).size).toBe(keys.length)
    })
    it('uses only numbers present in the sheet', () => {
        for (const bound of XONE_K2_MAP) {
            const found = XONE_K2_CONTROLS.find((c) => c.control === bound.control)
            expect(found, bound.control).toBeTruthy()
            expect(bound.match).toEqual({ kind: found.kind, number: found.number, channel: found.channel })
        }
        expect(XONE_K2_CONTROLS).toHaveLength(58)
    })
    it('the sheet beside the code is the underground sheet, when that file is on this machine', () => {
        const source = '/home/dob/work/agent-reports-2026-10-31/projector-room/underground/midi/xone-k2-default.json'
        if (!existsSync(source)) return
        expect(JSON.parse(readFileSync(source, 'utf8'))).toEqual(XONE_K2_CONTROLS)
    })
    it('lists what it leaves free and keeps the laser and light out', () => {
        expect(XONE_K2_MAP.length + XONE_K2_FREE.length).toBe(58)
        expect(XONE_K2_FREE).not.toContain('pot 9') // pots 9-12 drive the first effect
        // the top knobs 2-4 carry what four strips cannot: layers 5 and 6, and the master effect (N3635)
        // LAYER, encoder 6 push and EXIT SETUP now carry the effects (next FX layer, next effect, freeze hold)
        expect(XONE_K2_FREE).toEqual([])
        const turn = { kind: 'cc', cc: 1, channel: 15, value: 127 } // encoder 2, one step down
        const six = createDeck({ layers: 6, columns: 4 })
        expect(applyMidi(six, turn, defaultMap()).layers[4].opacity).toBeLessThan(six.layers[4].opacity)
        expect(XONE_K2_MAP.every((e) => !/laser|light|arm/i.test(e.action))).toBe(true)
    })
    it('plays the layout: fader 3, matrix G, pot switches, encoders', () => {
        const deck = filled()
        const map = defaultMap()
        expect(applyMidi(deck, cc(18, 127), map).layers[2].opacity).toBe(1)
        expect(applyMidi(deck, noteOn(34), map).layers[1].active).toBe(-1) // G = row 2, col 3: empty slot
        expect(applyMidi(deck, noteOn(33), map).layers[1].active).toBe(1) // F = row 2, col 2
        expect(applyMidi(deck, noteOn(48), map).layers[0].bypass).toBe(true)
        expect(applyMidi(deck, noteOn(47), map).layers[3].solo).toBe(true)
        expect(applyMidi(deck, noteOn(40), map)).toBe(deck) // pot switch 9 = effect 1 on/off; this deck has no effect
        expect(applyMidi(deck, noteOn(53), map).layers[0].active).toBe(1)
        expect(applyMidi(deck, cc(20, 10), map).crossfade).toBeGreaterThan(deck.crossfade)
        expect(applyMidi(deck, cc(21, 127), map).master).toBeCloseTo(0.98)
    })
    it('picks the K2 input by name, else the first', () => {
        expect(pickInputId([{ id: 'a', name: 'IAC' }, { id: 'k', name: 'XONE:K2 MIDI 1' }])).toBe('k')
        expect(pickInputId([{ id: 'a', name: 'IAC' }])).toBe('a')
        expect(pickInputId([])).toBe('')
    })
})

describe('LEDs', () => {
    it('playing green, loaded amber, empty off, bypass red, solo green', () => {
        const deck = trigger(filled(), 0, 0)
        const map = defaultMap()
        const state = (note) => {
            const colours = XONE_K2_LEDS[note]
            const lit = ledsFor(deck, map, XONE_K2_LEDS).filter((l) => l.velocity > 0 && [colours.red, colours.amber, colours.green].includes(l.note))
            return lit.map((l) => ['red', 'amber', 'green'].find((n) => colours[n] === l.note))
        }
        expect(state(36)).toEqual(['green'])
        expect(state(37)).toEqual(['amber'])
        expect(state(38)).toEqual([])
        const marked = { ...deck, layers: deck.layers.map((l, i) => ({ ...l, bypass: i === 0, solo: i === 1 })) }
        const lit = ledsFor(marked, map, XONE_K2_LEDS)
        expect(lit.find((l) => l.note === XONE_K2_LEDS[48].red).velocity).toBe(127)
        expect(lit.find((l) => l.note === XONE_K2_LEDS[45].green).velocity).toBe(127)
    })
    it('three messages per lit control, channel 15, and only changes are sent again', () => {
        const deck = filled()
        const leds = ledsFor(deck, defaultMap(), XONE_K2_LEDS)
        expect(leds.every((l) => l.channel === 15)).toBe(true)
        const previous = new Map()
        expect(ledChanges(leds, previous)).toHaveLength(leds.length)
        expect(ledChanges(leds, previous)).toEqual([])
        const after = ledChanges(ledsFor(trigger(deck, 0, 0), defaultMap(), XONE_K2_LEDS), previous)
        expect(after).toHaveLength(2) // green on, amber off for matrix A
        expect(ledBytes({ channel: 15, note: 36, velocity: 127 })).toEqual([0x9e, 36, 127])
    })
})

describe('learn', () => {
    it('targets come from screen keys', () => {
        expect(targetFromKey('clip:1:2')).toEqual({ action: 'clip', args: { layer: 1, column: 2 } })
        expect(targetFromKey('crossfade')).toEqual({ action: 'crossfade', args: {} })
        expect(targetFromKey('opacity:x')).toBeNull()
        expect(targetFromKey('nope')).toBeNull()
    })
    it('a learned override beats the default for its control and for its action', () => {
        const target = targetFromKey('opacity:0')
        const learned = learnEntry(target, cc(60, 100, 3))
        const stored = withOverride(null, learned)
        const map = effectiveMap(defaultMap(), normalizeOverrides(stored))
        const deck = createDeck({ layers: 4 })
        // the new control moves layer 1
        expect(applyMidi(deck, cc(60, 0, 3), map).layers[0].opacity).toBe(0)
        // fader 1 (cc 16) no longer does: its action was taken over
        expect(applyMidi(deck, cc(16, 0), map)).toBe(deck)
        // fader 2 still does
        expect(applyMidi(deck, cc(17, 0), map).layers[1].opacity).toBe(0)
        // a learned button on an existing K2 control takes that control from its default
        const onMatrix = learnEntry(targetFromKey('bypass:2'), noteOn(36))
        const map2 = effectiveMap(defaultMap(), [onMatrix])
        expect(applyMidi(filled(), noteOn(36), map2).layers[2].bypass).toBe(true)
        expect(map2.filter((e) => e.match.number === 36 && e.match.kind === 'note')).toHaveLength(1)
    })
    it('rebinding the same target replaces the earlier learned one; garbage is dropped', () => {
        const target = targetFromKey('master')
        let stored = withOverride(null, learnEntry(target, cc(70, 5)))
        stored = withOverride(stored, learnEntry(target, cc(71, 5)))
        expect(stored.bindings).toHaveLength(1)
        expect(stored.bindings[0].match.number).toBe(71)
        expect(normalizeOverrides({ bindings: [{ action: 'laserArm', match: { kind: 'note', number: 1 } }, null, { action: 'tap', match: { kind: 'x', number: 1 } }] })).toEqual([])
        expect(normalizeOverrides(null)).toEqual([])
    })
    it('learns an encoder as relative from the sheet\'s hint; a release learns nothing', () => {
        const hinted = learnEntry(targetFromKey('crossfade'), cc(20, 1), { relative: () => true })
        expect(hinted.relative).toBe(true)
        expect(learnEntry(targetFromKey('crossfade'), cc(20, 1))).not.toHaveProperty('relative')
        expect(learnEntry(targetFromKey('bypass:0'), noteOff(36))).toBeNull()
    })
})

describe('soft takeover', () => {
    it('ignores a far incoming value, engages when it comes within the window', () => {
        let r = softTakeover(undefined, 1, 0)
        expect(r.pass).toBe(false)
        r = softTakeover(r.state, 1, 0.5)
        expect(r.pass).toBe(false)
        r = softTakeover(r.state, 1, 1 - PICKUP_WINDOW / 2)
        expect(r.pass).toBe(true)
        expect(softTakeover(r.state, 1 - PICKUP_WINDOW / 2, 0.2).pass).toBe(true) // engaged: it now follows
    })
    it('engages by crossing the current value, even when it jumps over the window', () => {
        let r = softTakeover(undefined, 0.5, 0)
        expect(r.pass).toBe(false)
        r = softTakeover(r.state, 0.5, 0.8) // 0 -> 0.8 crossed 0.5
        expect(r.pass).toBe(true)
    })
    it('starts over when the target was changed from elsewhere', () => {
        let r = softTakeover(undefined, 0.5, 0.5)
        expect(r.pass).toBe(true)
        r = softTakeover(r.state, 0.5, 0.6)
        expect(r.pass).toBe(true)
        const moved = softTakeover(r.state, 0.1, 0.65) // the deck says 0.1, we last set 0.6
        expect(moved.pass).toBe(false)
        expect(softTakeover(moved.state, 0.1, 0.12).pass).toBe(true)
    })
    it('applyMidi with a pickup Map: a fader at the other end does not jump the layer, then follows', () => {
        const deck = createDeck({ layers: 2 }) // opacity 1
        const map = [entry('cc', 16, 'opacity', { layer: 0 })]
        const pickup = new Map()
        expect(applyMidi(deck, cc(16, 0), map, { pickup })).toBe(deck)
        expect(applyMidi(deck, cc(16, 60), map, { pickup })).toBe(deck)
        const arrived = applyMidi(deck, cc(16, 126), map, { pickup })
        expect(arrived.layers[0].opacity).toBeCloseTo(126 / 127)
        const follows = applyMidi(arrived, cc(16, 30), map, { pickup })
        expect(follows.layers[0].opacity).toBeCloseTo(30 / 127)
        // the layer was changed from elsewhere (a click): the fader must be picked up again
        const clicked = { ...follows, layers: follows.layers.map((layer, i) => (i === 0 ? { ...layer, opacity: 1 } : layer)) }
        expect(applyMidi(clicked, cc(16, 20), map, { pickup })).toBe(clicked)
    })
    it('each control keeps its own pickup; relative encoders never need it', () => {
        const deck = createDeck({ layers: 2 })
        const map = [entry('cc', 16, 'opacity', { layer: 0 }), entry('cc', 17, 'opacity', { layer: 1 }), entry('cc', 20, 'crossfade', {}, { relative: true })]
        const pickup = new Map()
        applyMidi(deck, cc(16, 127), map, { pickup })
        expect(applyMidi(deck, cc(17, 10), map, { pickup })).toBe(deck) // the other fader is not engaged
        expect(applyMidi(deck, cc(20, 1), map, { pickup }).crossfade).toBeCloseTo(0.52)
    })
    it('without a pickup Map an absolute control behaves as before (jumps)', () => {
        expect(applyMidi(createDeck({ layers: 1 }), cc(16, 0), [entry('cc', 16, 'opacity', { layer: 0 })]).layers[0].opacity).toBe(0)
    })
    it('entryFor and isContinuousEntry tell faders from buttons', () => {
        const map = [entry('cc', 16, 'opacity', { layer: 0 }), entry('note', 5, 'clip', { layer: 0, column: 0 }), entry('cc', 20, 'master', {}, { relative: true })]
        expect(isContinuousEntry(entryFor(cc(16, 5), map))).toBe(true)
        expect(isContinuousEntry(entryFor(noteOn(5), map))).toBe(false)
        expect(isContinuousEntry(entryFor(cc(20, 1), map))).toBe(true)
        expect(isContinuousEntry(entryFor(cc(99, 1), map))).toBe(false)
    })
    it('the K2 sheet marks encoders 5 and 6 with a check note; the default keeps the sheet mode', () => {
        const checked = XONE_K2_CONTROLS.filter((item) => item.check).map((item) => item.control)
        expect(checked).toEqual(['encoder 5', 'encoder 6'])
        for (const name of checked) expect(XONE_K2_CONTROLS.find((item) => item.control === name).mode).toBe('relative')
        expect(XONE_K2_MAP.filter((item) => checked.includes(item.control)).every((item) => item.relative)).toBe(true)
    })
})
