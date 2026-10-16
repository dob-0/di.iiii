import { describe, expect, it } from 'vitest'
import { decodeDmx } from './dmxDecode.js'
import { MAKER_CHANNEL_LISTS } from './fixtureTypes.js'

// The B380F's 16-channel list as the desk plays it (fixtureTypes.js, APPROVED chart with caps).
const channels = MAKER_CHANNEL_LISTS['UP-B380F'].modes[16]
const values = (set) => channels.map((c) => (c.role in set ? set[c.role] : c.default ?? 0))

describe('what the desk puts in a B380F\'s path', () => {
    it('nothing in: no optics', () => {
        expect(decodeDmx(channels, values({}), {}).optics).toBeNull()
    })
    it('gobo 5–69 is gobos 1–13 (the chart); 70–190 not drawn; 191+ shakes', () => {
        expect(decodeDmx(channels, values({ gobo: 5 }), {}).optics.gobo.pattern).toBe(1)
        expect(decodeDmx(channels, values({ gobo: 10 }), {}).optics.gobo.pattern).toBe(2)
        expect(decodeDmx(channels, values({ gobo: 69 }), {}).optics.gobo.pattern).toBe(13)
        expect(decodeDmx(channels, values({ gobo: 120 }), {}).optics).toBeNull() // 70–190: rotate or white, not drawn
        expect(decodeDmx(channels, values({ gobo: 200 }), {}).optics.goboShake).toBe(true)
    })
    it('a prism is in at 128+ (the printed manual); its rotation 0-127 is an index 0…360°, 128+ a spin with no phase', () => {
        expect(decodeDmx(channels, values({ prism: 127 }), {}).optics).toBeNull()
        const o = decodeDmx(channels, values({ prism: 128, rotation: 127 }), {}).optics
        expect(o.prism.facets).toBe(16)
        expect(o.prism.rotation).toBeCloseTo(Math.PI * 2, 9)
        expect(o.prism.spin).toBeUndefined()
        expect(decodeDmx(channels, values({ prism: 128, rotation: 64 }), {}).optics.prism.rotation).toBeCloseTo((64 / 127) * Math.PI * 2, 9)
        const s = decodeDmx(channels, values({ prism: 128, rotation: 255 }), {}).optics.prism
        expect(s).toMatchObject({ rotation: 0, spin: true })
        expect(decodeDmx(channels, values({ aux1: 128, aux2: 150 }), {}).optics.honeycomb).toMatchObject({ rotation: 0, spin: true })
    })
    it('frost is an insert at 192–255 only (128–191 is the colourful insert, not frost — the printed manual)', () => {
        expect(decodeDmx(channels, values({ frost: 127 }), {}).optics).toBeNull()
        expect(decodeDmx(channels, values({ frost: 150 }), {}).optics).toBeNull()
        expect(decodeDmx(channels, values({ frost: 191 }), {}).optics).toBeNull()
        expect(decodeDmx(channels, values({ frost: 192 }), {}).optics.frost).toBe(1)
        expect(decodeDmx(channels, values({ frost: 255 }), {}).optics.frost).toBe(1)
    })
})
