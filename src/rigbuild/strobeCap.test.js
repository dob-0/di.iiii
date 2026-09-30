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
