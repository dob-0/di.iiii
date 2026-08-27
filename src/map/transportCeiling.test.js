import { describe, expect, it } from 'vitest'
import {
    countPageSurfaces,
    HTTP1_PAGE_SURFACE_LIMIT,
    isMultiplexedOrigin,
    transportWarning
} from './transportCeiling.js'

const surface = (patch = {}) => ({
    enabled: true,
    source: { kind: 'project', ref: 'scene-1' },
    ...patch
})

describe('countPageSurfaces', () => {
    it('counts only the surfaces that each cost a connection', () => {
        expect(countPageSurfaces([
            surface(),
            surface({ source: { kind: 'url', ref: 'https://example.test' } }),
            surface({ source: { kind: 'video', ref: 'a.mp4' } }),
            surface({ source: { kind: 'test', ref: 'grid' } }),
            surface({ source: { kind: 'colour', ref: '#fff' } })
        ])).toBe(2)
    })

    it('ignores a page surface that is switched off or has no source yet', () => {
        expect(countPageSurfaces([
            surface({ enabled: false }),
            surface({ source: { kind: 'project', ref: '' } })
        ])).toBe(0)
    })
})

describe('transportWarning', () => {
    const pages = (n) => Array.from({ length: n }, (_, i) => surface({ source: { kind: 'project', ref: `scene-${i}` } }))

    it('says nothing while the wall is within what HTTP/1.1 can carry', () => {
        expect(transportWarning(pages(HTTP1_PAGE_SURFACE_LIMIT), 'http/1.1')).toBeNull()
    })

    it('warns once the count goes past it on an HTTP/1.1 origin', () => {
        const warning = transportWarning(pages(HTTP1_PAGE_SURFACE_LIMIT + 1), 'http/1.1')
        expect(warning).toContain('http/1.1')
        expect(warning).toContain('video or image')
    })

    it('says nothing on a multiplexed origin, where the ceiling does not exist', () => {
        expect(transportWarning(pages(8), 'h2')).toBeNull()
        expect(transportWarning(pages(8), 'h3')).toBeNull()
    })

    it('stays quiet when the browser will not name the protocol', () => {
        // Guessing "this will fail" at somebody whose wall is about to work is
        // worse than saying nothing.
        expect(transportWarning(pages(8), '')).toBeNull()
    })

    it('knows h2 and h3 are multiplexed and http/1.1 is not', () => {
        expect(isMultiplexedOrigin('h2')).toBe(true)
        expect(isMultiplexedOrigin('h3-29')).toBe(true)
        expect(isMultiplexedOrigin('http/1.1')).toBe(false)
    })
})
