import { describe, expect, it } from 'vitest'
import { getNodeType } from '../../project/nodeRegistry.js'
import { filterNodeTypesForSurface, matchesNodeTypeSurface } from './nodeSurfaceFilters.js'

describe('matchesNodeTypeSurface', () => {
    it('keeps panel nodes on the view surface', () => {
        expect(matchesNodeTypeSurface(getNodeType('view.text'), 'view')).toBe(true)
        expect(matchesNodeTypeSurface(getNodeType('geom.cube'), 'view')).toBe(false)
        expect(matchesNodeTypeSurface(getNodeType('world.background'), 'view')).toBe(false)
    })

    it('keeps spatial and world-control nodes on the world surface', () => {
        expect(matchesNodeTypeSurface(getNodeType('geom.cube'), 'world')).toBe(true)
        expect(matchesNodeTypeSurface(getNodeType('world.background'), 'world')).toBe(true)
        expect(matchesNodeTypeSurface(getNodeType('view.text'), 'world')).toBe(false)
        expect(matchesNodeTypeSurface(getNodeType('math.add'), 'world')).toBe(false)
    })

    it('keeps the full node language on the graph surface', () => {
        expect(matchesNodeTypeSurface(getNodeType('math.add'), 'graph')).toBe(true)
        expect(matchesNodeTypeSurface(getNodeType('device.midi.in'), 'graph')).toBe(true)
        expect(matchesNodeTypeSurface(getNodeType('view.text'), 'graph')).toBe(true)
    })
})

describe('filterNodeTypesForSurface', () => {
    it('filters a mixed list by surface', () => {
        const types = [
            getNodeType('geom.cube'),
            getNodeType('view.text'),
            getNodeType('world.background'),
            getNodeType('math.add')
        ]

        expect(filterNodeTypesForSurface(types, 'view').map((type) => type.id)).toEqual(['view.text'])
        expect(filterNodeTypesForSurface(types, 'world').map((type) => type.id)).toEqual(['geom.cube', 'world.background'])
        expect(filterNodeTypesForSurface(types, 'graph').map((type) => type.id)).toEqual([
            'geom.cube',
            'view.text',
            'world.background',
            'math.add'
        ])
    })
})
