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
    it('a prism is in at 64+ (the chart); its rotation read as an index', () => {
        expect(decodeDmx(channels, values({ prism: 63 }), {}).optics).toBeNull()
        const o = decodeDmx(channels, values({ prism: 64, rotation: 255 }), {}).optics
        expect(o.prism.facets).toBe(16)
        expect(o.prism.rotation).toBeCloseTo(Math.PI * 2, 9)
    })
    it('frost is an insert at 128–191 only (192–255 is the colourful insert, not frost)', () => {
        expect(decodeDmx(channels, values({ frost: 127 }), {}).optics).toBeNull()
        expect(decodeDmx(channels, values({ frost: 150 }), {}).optics.frost).toBe(1)
        expect(decodeDmx(channels, values({ frost: 255 }), {}).optics).toBeNull()
    })
})
