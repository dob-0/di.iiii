import { afterEach, describe, expect, it } from 'vitest'
import {
    LFO_DEFAULT, clipMotion, clipParams, lfoRange, lfoValueAt, lfoWave, takesLfo, valuesAt, withLfo
} from './paramLfo.js'
import {
    _setShowClockForTest, deskBeat, deskTempo, resetDeskBeat, setDeskTempo, tapTempo, tempoKeepingBeat
} from './deskBeat.js'
import { chainIsAnimated, chainSignature, effectParams, glPasses, newEffect, strobeColourAt } from './visualEffects.js'

// Emily, 2026-11-11: "can we add lfo option for each parametres". These pin
// what a swing is (paramLfo.js) and what it counts in (deskBeat.js).

const amount = { key: 'amount', kind: 'number', min: 0, max: 1 }

describe('LFO — the waves', () => {
    it('every wave is at its top on beat one of its round', () => {
        ['sine', 'tri', 'saw', 'square'].forEach((wave) => {
            expect(lfoWave(wave, 0, 4)).toBeCloseTo(1, 9)
            expect(lfoWave(wave, 8, 4)).toBeCloseTo(1, 9)
        })
    })

    it('sine and triangle are at the bottom half way round; square drops there; saw falls', () => {
        expect(lfoWave('sine', 2, 4)).toBeCloseTo(0, 9)
        expect(lfoWave('tri', 2, 4)).toBeCloseTo(0, 9)
        expect(lfoWave('tri', 1, 4)).toBeCloseTo(0.5, 9)
        expect(lfoWave('square', 1.9, 4)).toBe(1)
        expect(lfoWave('square', 2.1, 4)).toBe(0)
        expect(lfoWave('saw', 1, 4)).toBeCloseTo(0.75, 9)
    })

    it('random holds one value through a round and takes a new one on the next', () => {
        const a = lfoWave('random', 0.1, 1, 'x')
        expect(lfoWave('random', 0.9, 1, 'x')).toBe(a)
        expect(lfoWave('random', 1.1, 1, 'x')).not.toBe(a)
        expect(lfoWave('random', 0.1, 1, 'y')).not.toBe(a)
    })
})

describe('LFO — where a setting swings', () => {
    it('centres on the slider when there is room', () => {
        const [low, high] = lfoRange(amount, 0.5, { on: true, depth: 0.4 })
        expect(low).toBeCloseTo(0.3, 9)
        expect(high).toBeCloseTo(0.7, 9)
    })

    it('a setting at its top swings down from there, never flattened at the end', () => {
        const [low, high] = lfoRange(amount, 1, { on: true, depth: 1 })
        expect(low).toBeCloseTo(0, 9)
        expect(high).toBeCloseTo(1, 9)
        const near = lfoRange(amount, 0.9, { on: true, depth: 0.4 })
        expect(near[0]).toBeCloseTo(0.6, 9)
        expect(near[1]).toBeCloseTo(1, 9)
    })

    it('swings over the whole range in time: top on the one, bottom half way', () => {
        const lfo = { on: true, wave: 'sine', beats: 4, depth: 0.5 }
        expect(lfoValueAt(amount, 0.5, lfo, 0)).toBeCloseTo(0.75, 9)
        expect(lfoValueAt(amount, 0.5, lfo, 2)).toBeCloseTo(0.25, 9)
    })

    it('off, zero depth, a speed and a choice stay put', () => {
        expect(lfoValueAt(amount, 0.5, { on: false, depth: 1 }, 2)).toBe(0.5)
        expect(lfoValueAt(amount, 0.5, { on: true, depth: 0 }, 2)).toBe(0.5)
        expect(takesLfo({ kind: 'number', rate: true })).toBe(false)
        expect(takesLfo({ kind: 'choice' })).toBe(false)
        // A clip's own speed is known by its name (the loops scale their time by it).
        expect(takesLfo({ type: 'number', key: 'speed', label: 'Speed' })).toBe(false)
        expect(takesLfo({ type: 'number', key: 'b', label: 'Wave speed' })).toBe(false)
        expect(takesLfo({ type: 'number', key: 'thickness', label: 'Line thickness' })).toBe(true)
        expect(lfoValueAt({ ...amount, rate: true }, 0.5, { on: true, depth: 1 }, 2)).toBe(0.5)
    })

    it('valuesAt changes only the swinging ones and keeps the object when none swing', () => {
        const specs = [amount, { key: 'size', kind: 'number', min: 0, max: 10 }]
        const values = { amount: 0.5, size: 4 }
        expect(valuesAt(specs, values, {}, 1)).toBe(values)
        const out = valuesAt(specs, values, { size: { on: true, wave: 'square', beats: 1, depth: 0.2 } }, 0.25)
        expect(out.amount).toBe(0.5)
        expect(out.size).toBeCloseTo(5, 9)
    })

    it('withLfo adds, replaces and removes one setting, and an empty map is {}', () => {
        const one = withLfo(undefined, 'amount', LFO_DEFAULT)
        expect(one).toEqual({ amount: { on: true, wave: 'sine', beats: 4, depth: 0.5 } })
        expect(withLfo(one, 'amount', null)).toEqual({})
    })
})

describe('LFO — on effects', () => {
    afterEach(() => resetDeskBeat())

    it('an effect with a swinging setting moves, and its uniforms follow the beat', () => {
        const effect = { ...newEffect('invert'), lfo: { amount: { on: true, wave: 'square', beats: 2, depth: 1 } } }
        expect(chainIsAnimated([effect])).toBe(true)
        expect(effectParams(effect, 0.5).amount).toBeCloseTo(1, 9)
        expect(effectParams(effect, 1.5).amount).toBeCloseTo(0, 9)
        expect(glPasses([effect], 0, 0.5)[0].a[0]).toBeCloseTo(1, 9)
        expect(glPasses([effect], 0, 1.5)[0].a[0]).toBeCloseTo(0, 9)
        // Without a beat: where the slider is.
        expect(effectParams(effect).amount).toBe(1)
    })

    it('an LFO that is off does not make a still chain move, but it is part of its signature', () => {
        const effect = { ...newEffect('invert'), lfo: { amount: { on: false, wave: 'sine', beats: 4, depth: 1 } } }
        expect(chainIsAnimated([effect])).toBe(false)
        expect(chainSignature([effect])).not.toBe(chainSignature([newEffect('invert')]))
    })

    it('Colour Strobe flashes on the beat, a new colour each round', () => {
        const p = { every: '1', duty: 0.35, colours: 'rgb', mode: 'flash' }
        expect(strobeColourAt(p, 0.1)).toMatchObject({ on: true, hex: '#ff0000' })
        expect(strobeColourAt(p, 0.5).on).toBe(false)
        expect(strobeColourAt(p, 1.1)).toMatchObject({ on: true, hex: '#00ff00' })
    })
})

describe('LFO — a clip’s opacity and its own settings', () => {
    const visual = {
        id: 'v',
        opacity: 0.8,
        paramSpec: [
            { key: 'thick', label: 'Thickness', type: 'number', min: 0, max: 1, step: 0.01, default: 0.3 },
            { key: 'cubes', label: 'Cubes', type: 'choice', options: [['a', 'A'], ['b', 'B']], default: 'a' }
        ],
        params: { thick: 0.6 }
    }

    it('a page hears its whole set of settings, defaults included', () => {
        expect(clipParams(visual)).toEqual({ thick: 0.6, cubes: 'a' })
        expect(clipParams({ id: 'x', params: { a: 1 } })).toEqual({ a: 1 })
    })

    it('nothing swinging = no motion', () => {
        expect(clipMotion(visual)).toBeNull()
        expect(clipMotion({ ...visual, lfo: { thick: { on: false, depth: 1 } } })).toBeNull()
    })

    it('opacity and settings swing to the beat', () => {
        const motion = clipMotion({
            ...visual,
            lfo: {
                opacity: { on: true, wave: 'square', beats: 2, depth: 1 },
                thick: { on: true, wave: 'square', beats: 2, depth: 0.2 }
            }
        })
        expect(motion.movesOpacity).toBe(true)
        expect(motion.movesParams).toBe(true)
        expect(motion.opacityAt(0.5)).toBeCloseTo(1, 9)
        expect(motion.opacityAt(1.5)).toBeCloseTo(0, 9)
        expect(motion.paramsAt(0.5)).toEqual({ thick: expect.closeTo(0.7, 9), cubes: 'a' })
        expect(motion.paramsAt(1.5).thick).toBeCloseTo(0.5, 9)
    })
})

describe('the desk’s beat', () => {
    afterEach(() => resetDeskBeat())

    it('counts beats from the tempo’s zero', () => {
        setDeskTempo({ bpm: 120, zero: 1000 })
        expect(deskBeat(1000)).toBeCloseTo(0, 9)
        expect(deskBeat(1500)).toBeCloseTo(1, 9)
        expect(deskTempo()).toMatchObject({ bpm: 120, from: 'desk' })
        expect(deskTempo()).toBe(deskTempo())
    })

    it('a typed tempo keeps the beat where it is', () => {
        setDeskTempo({ bpm: 120, zero: 0 })
        const at = 10_000
        const next = tempoKeepingBeat(90, at)
        expect(((at - next.zero) * 90) / 60000).toBeCloseTo(deskBeat(at), 2)
    })

    it('tap tempo: the gaps between taps set the bpm, and the last tap is beat one', () => {
        expect(tapTempo(1000)).toBeNull()
        tapTempo(1500)
        tapTempo(2000)
        const next = tapTempo(2500)
        expect(next).toEqual({ bpm: 120, zero: 2500 })
        // A long pause starts a new count.
        expect(tapTempo(9000)).toBeNull()
    })

    it('the bar show leads while it runs, counted from its bar 1, and gives way when it stops', () => {
        setDeskTempo({ bpm: 100, zero: 0 })
        _setShowClockForTest({ bpm: 171, zero: 0, phraseZero: 2 })
        expect(deskTempo()).toMatchObject({ bpm: 171, from: 'show' })
        // phraseZero = beat 2 of the engine's count, so that moment is beat 0 here.
        const barOne = (2 * 60000) / 171
        expect(deskBeat(barOne)).toBeCloseTo(0, 6)
        _setShowClockForTest(null)
        expect(deskTempo()).toMatchObject({ bpm: 100, from: 'desk' })
    })

    it('a small clock correction eases in; a fresh engine’s hello lands at once', () => {
        const at = Date.now()
        _setShowClockForTest({ bpm: 120, zero: at })
        // 100 ms later = 0.2 beat: a correction, so the beat slides onto it.
        _setShowClockForTest({ bpm: 120, zero: at + 100 })
        expect(deskBeat(Date.now())).not.toBeCloseTo(((Date.now() - (at + 100)) * 120) / 60000, 3)
        // The same jump as a hello (an engine restarted by handover) snaps.
        _setShowClockForTest({ bpm: 120, zero: at + 200 }, { snap: true })
        expect(deskBeat(Date.now())).toBeCloseTo(((Date.now() - (at + 200)) * 120) / 60000, 3)
    })
})
