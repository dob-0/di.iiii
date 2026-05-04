import { describe, expect, it } from 'vitest'
import { createEdge, createNode } from '../../project/nodeRegistry.js'
import { createNodeGraphContext } from './nodeGraphRuntime.js'
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
})
