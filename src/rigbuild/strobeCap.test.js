import { describe, expect, it, vi } from 'vitest'

// Photosensitivity cap: at most 3 flashes a second in any look (strobeCap.js).
vi.mock('./looks.js', async (orig) => {
    const real = await orig()
    return { ...real, lookPoses: () => new Map([['S1', { level: 1, rotation: [0, 0, 0], position: [0, 6, 0] }]]) }
})

import { TYPE_LIBRARY } from './types/index.js'
import TYPES from './types/moxir.json'
import { MAX_STROBE_HZ, capStrobeHz, lookStrobeHz } from './strobeCap.js'
import { deskLooksWithValues } from './deskLookValues.js'
import { decodeDmx, encodeDmx } from './dmxDecode.js'
import { flashLamps, strobeEnvelope } from './rigFlash.js'
import { dmxEntities } from './dmxPose.js'

const strobe = { id: 'S1', type: 'spotLight', components: { transform: { position: [0, 6, 0], rotation: [0, 0, 0] }, light: { color: '#ffffff', intensity: 5, angle: 0.5 }, beam: { visible: true }, fixture: { type: 'ext-strobe', mode: '4ch-assumed', index: 9 } } }
const type = TYPES.types.find((t) => t.code === 'EXT-STROBE')
const mode = type.modes.find((m) => m.name === '4ch-assumed')
const valuesOf = (cell) => mode.channels.map((c) => cell[c.role] ?? c.default ?? 0)
const playedHz = (looks) => decodeDmx(mode.channels, valuesOf(looks[0].steps[0].values.F1), type).strobeHz
const deskFixtures = [{ id: 'F1', key: 'x:S1', profile: 'EXT-STROBE 4ch-assumed' }]
const desk = (look) => deskLooksWithValues({ looks: [{ id: 'l', ...look }] }, deskFixtures, { entities: [strobe], library: TYPE_LIBRARY })

describe('the strobe rate cap', () => {
    it('MAX_STROBE_HZ is 3 and capStrobeHz clamps to [0, 3]', () => {
        expect(MAX_STROBE_HZ).toBe(3)
        expect(capStrobeHz(10)).toBe(3)
        expect(capStrobeHz(2)).toBe(2)
        expect(capStrobeHz(-4)).toBe(0)
        expect(capStrobeHz('x')).toBe(0)
    })
    it('a look asking 10 Hz is clamped to 3 (and the DMX plays 3, not 10)', () => {
        expect(lookStrobeHz({ strobeHz: 10 })).toBe(3)
        expect(playedHz(desk({ strobeHz: 10 }))).toBeLessThanOrEqual(3)
        expect(playedHz(desk({ strobeHz: 10 }))).toBeCloseTo(3, 0)
    })
    it('a look may ask for less, and the default for "strobe on" is the cap', () => {
        expect(lookStrobeHz({ strobeHz: 1.5 })).toBe(1.5)
        expect(lookStrobeHz({})).toBe(3)
        expect(lookStrobeHz(null)).toBe(3)
        expect(playedHz(desk({}))).toBeCloseTo(3, 0)
    })
    it('a direct DMX request above the cap still writes a value that decodes to at most 3 Hz', () => {
        for (const hz of [3, 5, 10, 25, 1000]) {
            const cell = encodeDmx(mode.channels, { level: 1, strobeHz: hz }, type)
            expect(decodeDmx(mode.channels, valuesOf(cell), type).strobeHz).toBeLessThanOrEqual(3)
        }
    })
    it('the room flash never exceeds 3 per second, whatever the desk or console says', () => {
        for (const hz of [10, 25, 60]) {
            const period = 1 / MAX_STROBE_HZ
            expect(strobeEnvelope(period, hz)).toBeCloseTo(1, 6)
            expect(strobeEnvelope(period / 2, hz)).toBeLessThan(0.05)
        }
        expect(strobeEnvelope(1 / 3)).toBeCloseTo(1, 6)
        const fixtures = [{ index: 9, profile: 'EXT-STROBE 4ch-assumed', values: [255, 0, 255, 0] }]
        const flashed = { ...strobe, components: { ...strobe.components, rigFlash: { kind: 'strobe', level: 1 } } }
        const { entities: shown } = dmxEntities({ shown: [flashed], document: [strobe], fixtures, library: TYPE_LIBRARY })
        expect(flashLamps(shown)[0].hz).toBeLessThanOrEqual(3)
        expect(shown[0].components.rigFlash.hz).toBeLessThanOrEqual(3)
    })
})

describe('the union of every lamp\'s flashes stays within the cap (review A1-3)', () => {
    it('lamps asked for 3, 2.92, 3.03, 2.5, 1.2 and 0.5 Hz together flash at most 3 separate times a second', () => {
        const rates = [3, 2.92, 3.03, 2.5, 1.2, 0.5]
        const stepS = 0.001
        const flashes = []
        const prev = rates.map(() => 0)
        for (let t = 0; t < 20; t += stepS) {
            rates.forEach((hz, i) => {
                const v = strobeEnvelope(t, hz)
                if (v > 0.9 && prev[i] <= 0.9) flashes.push(t)
                prev[i] = v
            })
        }
        // merge flashes closer than 50 ms (the eye sees one)
        const merged = flashes.sort((a, b) => a - b).reduce((acc, f) => (acc.length && f - acc[acc.length - 1] < 0.05 ? acc : [...acc, f]), [])
        for (let s0 = 0; s0 + 1 <= 19; s0 += 0.25) expect(merged.filter((f) => f >= s0 && f < s0 + 1).length).toBeLessThanOrEqual(MAX_STROBE_HZ)
        expect(merged.length).toBeGreaterThan(10)
    })
})

describe('a laser is never lit by a look (runtime gate, review A2-1)', () => {
    const laserType = TYPES.types.find((t) => t.code === 'UP-LA40WF')
    const laserMode = laserType.modes[0]
    const laser = { id: 'L1', type: 'spotLight', components: { transform: { position: [0, 6, 0], rotation: [0, 0, 0] }, light: { color: '#ff0000', intensity: 5, angle: 0.1 }, beam: { visible: true }, fixture: { type: 'up-la40wf', mode: laserMode.name, index: 1 } } }
    const fx = [{ id: 'F1', key: 'x:L1', profile: `UP-LA40WF ${laserMode.name}` }]
    const run = (look) => deskLooksWithValues({ looks: [{ id: 'l', ...look }] }, fx, { entities: [laser], library: TYPE_LIBRARY })[0].steps[0].values.F1
    it('a look that asks the laser at 60 % writes every channel at 0', () => {
        const cell = run({ aims: {}, colours: {}, levels: { 'truss-top/up-la40wf': 0.6 } })
        expect(Object.values(cell).every((v) => v === 0)).toBe(true)
        expect(Object.keys(cell).length).toBe(laserMode.channels.length)
    })
})
