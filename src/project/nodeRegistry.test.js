import { describe, expect, it } from 'vitest'
import {
    createNodeFromDefinition,
    listNodeDefinitionsForSurface
} from './nodeRegistry.js'

describe('nodeRegistry', () => {
    it('exposes world control nodes in the world OP list', () => {
        const ids = listNodeDefinitionsForSurface('world').map((definition) => definition.id)

        expect(ids).toEqual(expect.arrayContaining([
            'geom.cube',
            'world.color',
            'world.grid',
            'world.light',
            'world.camera',
            'app.browser'
        ]))
    })

    it('exposes basic 2D authored UI nodes in the view OP list', () => {
        const ids = listNodeDefinitionsForSurface('view').map((definition) => definition.id)

        expect(ids).toEqual(expect.arrayContaining([
            'view.panel',
            'view.text',
            'view.inspector',
            'view.assets',
            'view.browser'
        ]))
    })

    it('creates hidden world singleton nodes without spatial placement', () => {
        const gridNode = createNodeFromDefinition('world.grid')

        expect(gridNode.definitionId).toBe('world.grid')
        expect(gridNode.mount).toEqual({ surface: 'world', mode: 'hidden' })
        expect(gridNode.spatial).toBeNull()
    })
})
