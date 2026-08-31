import { describe, expect, it } from 'vitest'
import { buildMapOutputPath, buildMapPath, getMapLocationState, isMapLocation } from './mapRouting.js'

const at = (pathname) => getMapLocationState({ pathname })

describe('map lane routing', () => {
    it('builds the desk and output addresses', () => {
        expect(buildMapPath('dilijan', 'wall')).toBe('/dilijan/map/wall')
        expect(buildMapOutputPath('dilijan', 'wall')).toBe('/dilijan/map/wall/out')
    })

    it('reads the desk address', () => {
        expect(at('/dilijan/map/wall')).toEqual({ isMap: true, isOutput: false, spaceId: 'dilijan', projectId: 'wall' })
    })

    it('reads the output address', () => {
        expect(at('/dilijan/map/wall/out')).toEqual({ isMap: true, isOutput: true, spaceId: 'dilijan', projectId: 'wall' })
    })

    it('tolerates a trailing slash', () => {
        expect(at('/dilijan/map/wall/')).toMatchObject({ isMap: true, isOutput: false })
    })

    it('is not the lane for other shapes', () => {
        expect(isMapLocation(at('/dilijan/map'))).toBe(false)
        expect(isMapLocation(at('/dilijan/raw/projects/wall'))).toBe(false)
        expect(isMapLocation(at('/dilijan/make/wall'))).toBe(false)
        expect(isMapLocation(at('/dilijan'))).toBe(false)
    })

    it('refuses a fourth segment that is not the output word', () => {
        // Otherwise /{space}/map/{id}/anything silently opens the desk, and a
        // link somebody meant as a deeper address lands on an editor.
        expect(isMapLocation(at('/dilijan/map/wall/edit'))).toBe(false)
        expect(isMapLocation(at('/dilijan/map/wall/out/more'))).toBe(false)
    })

    it('is not the lane when a segment is empty', () => {
        expect(isMapLocation(at('//map/wall'))).toBe(false)
    })
})
