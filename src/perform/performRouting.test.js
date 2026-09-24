import { describe, expect, it } from 'vitest'
import { buildPerformPath, getPerformLocationState, isPerformLocation } from './performRouting.js'

const at = (pathname, search = '') => getPerformLocationState({ pathname, search })

describe('perform routing', () => {
    it('builds the address, with the preset and the desk it came from', () => {
        expect(buildPerformPath('stage', 'show')).toBe('/stage/perform/show')
        expect(buildPerformPath('stage', 'show', { preset: 'vj' })).toBe('/stage/perform/show?preset=vj')
        expect(buildPerformPath('stage', 'show', { preset: 'show:abc', from: 'map' })).toBe('/stage/perform/show?preset=show%3Aabc&from=map')
    })

    it('never writes a preset or a desk it would refuse to read', () => {
        expect(buildPerformPath('stage', 'show', { preset: '../../x', from: 'admin' })).toBe('/stage/perform/show')
    })

    it('reads the address and its query', () => {
        expect(at('/stage/perform/show', '?preset=wall&from=map')).toEqual({
            isPerform: true, spaceId: 'stage', projectId: 'show', preset: 'wall', from: 'map'
        })
        expect(at('/stage/perform/show/', '?preset=mine:k3_x')).toMatchObject({ isPerform: true, preset: 'mine:k3_x' })
    })

    it('drops a preset or desk it does not recognise, but still opens', () => {
        expect(at('/stage/perform/show', '?preset=<script>&from=elsewhere')).toMatchObject({ isPerform: true, preset: null, from: null })
    })

    it('is not the lane for other shapes', () => {
        expect(isPerformLocation(at('/stage/perform'))).toBe(false)
        expect(isPerformLocation(at('/stage/perform/show/out'))).toBe(false)
        expect(isPerformLocation(at('/stage/map/show'))).toBe(false)
        expect(isPerformLocation(at('//perform/show'))).toBe(false)
    })
})
