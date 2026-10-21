import { afterEach, describe, expect, it, vi } from 'vitest'
import { BARE_POINTS_SOURCE, prefersLightPoints } from './PointCloud.jsx'
import { geometryPoints } from '../points/geometryPoints.js'

const withMedia = (matching) => {
    vi.stubGlobal('matchMedia', (query) => ({ matches: matching.includes(query) }))
    window.matchMedia = globalThis.matchMedia
}

describe('PointCloud', () => {
    const original = window.matchMedia
    afterEach(() => {
        vi.unstubAllGlobals()
        window.matchMedia = original
    })

    it('takes the lighter cap on a phone and for reduced motion, the full one otherwise', () => {
        withMedia([])
        expect(prefersLightPoints()).toBe(false)
        withMedia(['(pointer: coarse)'])
        expect(prefersLightPoints()).toBe(true)
        withMedia(['(prefers-reduced-motion: reduce)'])
        expect(prefersLightPoints()).toBe(true)
    })

    it('reads a browser without matchMedia as the full cap, not as an error', () => {
        window.matchMedia = undefined
        expect(prefersLightPoints()).toBe(false)
    })

    it('scatters a bare Points over a sphere, so a placed node is never invisible', () => {
        expect(geometryPoints(BARE_POINTS_SOURCE, 100).count).toBe(100)
    })
})
