import { describe, expect, it } from 'vitest'
import { decodeDmx } from './dmxDecode.js'
import { TESTED_CHANNEL_LISTS } from './fixtureTypes.js'

// The B380F's 16-channel list as the desk plays it (fixtureTypes.js, TESTED with caps).
const channels = TESTED_CHANNEL_LISTS['UP-B380F'].modes[16]
const values = (set) => channels.map((c) => (c.role in set ? set[c.role] : c.default ?? 0))

describe('what the desk puts in a B380F\'s path', () => {
    it('nothing in: no optics', () => {
        expect(decodeDmx(channels, values({}), {}).optics).toBeNull()
    })
    it('gobo 5–89 is gobos 1–17 (the chart); 171+ shakes', () => {
        expect(decodeDmx(channels, values({ gobo: 5 }), {}).optics.gobo.pattern).toBe(1)
        expect(decodeDmx(channels, values({ gobo: 12 }), {}).optics.gobo.pattern).toBe(2)
        expect(decodeDmx(channels, values({ gobo: 89 }), {}).optics.gobo.pattern).toBe(17)
        expect(decodeDmx(channels, values({ gobo: 120 }), {}).optics).toBeNull() // 90–170: not mapped
        expect(decodeDmx(channels, values({ gobo: 200 }), {}).optics.goboShake).toBe(true)
    })
    it('prism 1 in at 128+ (the chart): the 16-facet; its rotation read as an index', () => {
        expect(decodeDmx(channels, values({ prism: 127 }), {}).optics).toBeNull()
        const o = decodeDmx(channels, values({ prism: 128, rotation: 255 }), {}).optics
        expect(o.prism.facets).toBe(16)
        expect(o.prism.rotation).toBeCloseTo(Math.PI * 2, 9)
    })
    it('prism 2 (the honeycomb) and frost', () => {
        const o = decodeDmx(channels, values({ aux1: 200, frost: 255 }), {}).optics
        expect(o.honeycomb).toEqual({ rotation: 0 })
        expect(o.frost).toBe(1)
    })
})
