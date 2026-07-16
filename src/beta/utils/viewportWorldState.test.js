import { describe, expect, it } from 'vitest'
import { createEdge, createNode } from '../../project/nodeRegistry.js'
import { createNodeGraphContext } from '../../project/graph/nodeGraphRuntime.js'
import { getBetaWorldBackgroundColor } from './viewportWorldState.js'

describe('getBetaWorldBackgroundColor', () => {
    it('uses the world.background node color before legacy worldState color', () => {
        expect(getBetaWorldBackgroundColor({
            worldState: { backgroundColor: '#111111' },
            nodes: [
                {
                    id: 'background',
                    typeId: 'world.background',
                    values: { color: '#224466' }
                }
            ]
        })).toBe('#224466')
    })

    it('falls back to worldState and then the Beta default', () => {
        expect(getBetaWorldBackgroundColor({
            worldState: { backgroundColor: '#05070a' },
            nodes: []
        })).toBe('#05070a')

        expect(getBetaWorldBackgroundColor({ nodes: [] })).toBe('#0a0e16')
    })

    it('resolves a graph-driven background color', () => {
        const colorNode = createNode('value.color', { id: 'color-1', values: { value: '#112233' } })
        const backgroundNode = createNode('world.background', { id: 'bg-1' })
        const document = {
            nodes: [colorNode, backgroundNode],
            edges: [createEdge('color-1', 'out', 'bg-1', 'color')]
        }

        expect(getBetaWorldBackgroundColor(document, createNodeGraphContext(document))).toBe('#112233')
    })

    it('only matches a world.background node in the same scope when scopeId is given', () => {
        const document = {
            worldState: { backgroundColor: '#05070a' },
            nodes: [
                { id: 'bg-other-scope', typeId: 'world.background', parentId: 'other-world', values: { color: '#ff0000' } }
            ]
        }
        // Not in scope 'my-world' — falls through to worldState, not the other scope's node.
        expect(getBetaWorldBackgroundColor(document, null, { scopeId: 'my-world' })).toBe('#05070a')

        const documentWithMatch = {
            nodes: [
                { id: 'bg-other-scope', typeId: 'world.background', parentId: 'other-world', values: { color: '#ff0000' } },
                { id: 'bg-my-scope', typeId: 'world.background', parentId: 'my-world', values: { color: '#00ff00' } }
            ]
        }
        expect(getBetaWorldBackgroundColor(documentWithMatch, null, { scopeId: 'my-world' })).toBe('#00ff00')
    })

    it('falls back to the world node\'s own bgColor before worldState, once scoped', () => {
        const document = { worldState: { backgroundColor: '#05070a' }, nodes: [] }
        const worldNode = { id: 'world-1', values: { bgColor: '#663399' } }
        expect(getBetaWorldBackgroundColor(document, null, { scopeId: 'root', worldNode })).toBe('#663399')
    })
})
