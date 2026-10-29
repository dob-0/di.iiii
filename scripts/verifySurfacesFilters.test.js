import { describe, expect, it } from 'vitest'
import { isForeignConsoleLine } from './verifySurfacesFilters.mjs'

const BASE = 'https://diiii.xyz'

describe('verify:surfaces console filter (F155)', () => {
    it('ignores the artist page\'s Cloudflare beacon CORS line', () => {
        const line = {
            text: "Access to fetch at 'https://hosq.raftad.com/cdn-cgi/rum?' from origin 'null' has been blocked by CORS policy",
            locationUrl: '',
        }
        expect(isForeignConsoleLine(line, BASE)).toBe(true)
    })

    it('ignores a line logged by a script on another origin', () => {
        expect(isForeignConsoleLine({ text: 'boom', locationUrl: 'https://other.example/a.js' }, BASE)).toBe(true)
    })

    it('still fails on di.iiii\'s own errors', () => {
        expect(isForeignConsoleLine({ text: 'TypeError: x is undefined', locationUrl: `${BASE}/assets/app.js` }, BASE)).toBe(false)
        expect(isForeignConsoleLine({ text: 'Failed to load resource: 404', locationUrl: `${BASE}/serverXR/api/x` }, BASE)).toBe(false)
        expect(isForeignConsoleLine({ text: `Refused ${BASE}/x`, locationUrl: '' }, BASE)).toBe(false)
        expect(isForeignConsoleLine({ text: 'plain error, no address', locationUrl: '' }, BASE)).toBe(false)
    })
})
