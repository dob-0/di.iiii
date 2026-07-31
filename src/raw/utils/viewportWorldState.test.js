import { describe, expect, it } from 'vitest'
import { createEdge, createNode } from '../../project/nodeRegistry.js'
import { createNodeGraphContext } from '../../project/graph/nodeGraphRuntime.js'
import { getRawWorldBackgroundColor, pickActiveTypeNode, resolveScopeWorldNode } from './viewportWorldState.js'

describe('resolveScopeWorldNode', () => {
    const nodes = [
        { id: 'root-child', typeId: 'math.add', parentId: null, values: {} },
        { id: 'world-1', typeId: 'universe.world', parentId: null, values: {} },
        { id: 'world-2', typeId: 'universe.world', parentId: null, values: {} },
        { id: 'inner-sphere', typeId: 'geometry.sphere', parentId: 'world-1', values: {} }
    ]

    it('picks the first world sibling of the scope by default', () => {
        expect(resolveScopeWorldNode(nodes, null, {}).id).toBe('world-1')
    })

    it('honors the live marker over creation order', () => {
        expect(resolveScopeWorldNode(nodes, null, { '': 'world-2' }).id).toBe('world-2')
    })

    // Regression (2026-08-01): entering a world node via "Enter ›" made the
    // scope the world itself, so the sibling-only lookup returned null and
    // RawEditor's no-world effect cancelled the just-requested fullscreen.
    // Inside a world scope, the world is the scope node.
    it('resolves the scope node itself when the scope is a world', () => {
        expect(resolveScopeWorldNode(nodes, 'world-1', {}).id).toBe('world-1')
    })

    it('returns null in a non-world scope with no world children', () => {
        expect(resolveScopeWorldNode(nodes, 'root-child', {})).toBeNull()
    })
})

describe('pickActiveTypeNode', () => {
    const nodes = [
        { id: 'bg-1', typeId: 'world.background', parentId: 'scope-a', values: {} },
        { id: 'bg-2', typeId: 'world.background', parentId: 'scope-a', values: {} },
        { id: 'bg-3', typeId: 'world.background', parentId: 'scope-b', values: {} }
    ]

    it('defaults to the first candidate in the scope when nothing is marked active', () => {
        expect(pickActiveTypeNode(nodes, 'world.background', { scopeId: 'scope-a', activeMap: {} }).id).toBe('bg-1')
    })

    it('honors an explicit active marker over creation order', () => {
        const activeMap = { 'world.background::scope-a': 'bg-2' }
        expect(pickActiveTypeNode(nodes, 'world.background', { scopeId: 'scope-a', activeMap }).id).toBe('bg-2')
    })

    it('ignores a marker for a different scope', () => {
        const activeMap = { 'world.background::scope-b': 'bg-3' }
        expect(pickActiveTypeNode(nodes, 'world.background', { scopeId: 'scope-a', activeMap }).id).toBe('bg-1')
    })

    it('returns null when there are no candidates in scope', () => {
        expect(pickActiveTypeNode(nodes, 'world.background', { scopeId: 'scope-c', activeMap: {} })).toBeNull()
    })
})

describe('getRawWorldBackgroundColor', () => {
    it('uses the world.background node color before legacy worldState color', () => {
        expect(getRawWorldBackgroundColor({
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

    it('falls back to worldState and then the Raw default', () => {
        expect(getRawWorldBackgroundColor({
            worldState: { backgroundColor: '#05070a' },
            nodes: []
        })).toBe('#05070a')

        expect(getRawWorldBackgroundColor({ nodes: [] })).toBe('#0a0e16')
    })

    it('resolves a graph-driven background color', () => {
        const colorNode = createNode('value.color', { id: 'color-1', values: { value: '#112233' } })
        const backgroundNode = createNode('world.background', { id: 'bg-1' })
        const document = {
            nodes: [colorNode, backgroundNode],
            edges: [createEdge('color-1', 'out', 'bg-1', 'color')]
        }

        expect(getRawWorldBackgroundColor(document, createNodeGraphContext(document))).toBe('#112233')
    })

    it('only matches a world.background node in the same scope when scopeId is given', () => {
        const document = {
            worldState: { backgroundColor: '#05070a' },
            nodes: [
                { id: 'bg-other-scope', typeId: 'world.background', parentId: 'other-world', values: { color: '#ff0000' } }
            ]
        }
        // Not in scope 'my-world' — falls through to worldState, not the other scope's node.
        expect(getRawWorldBackgroundColor(document, null, { scopeId: 'my-world' })).toBe('#05070a')

        const documentWithMatch = {
            nodes: [
                { id: 'bg-other-scope', typeId: 'world.background', parentId: 'other-world', values: { color: '#ff0000' } },
                { id: 'bg-my-scope', typeId: 'world.background', parentId: 'my-world', values: { color: '#00ff00' } }
            ]
        }
        expect(getRawWorldBackgroundColor(documentWithMatch, null, { scopeId: 'my-world' })).toBe('#00ff00')
    })

    it('falls back to the world node\'s own bgColor before worldState, once scoped', () => {
        const document = { worldState: { backgroundColor: '#05070a' }, nodes: [] }
        const worldNode = { id: 'world-1', values: { bgColor: '#663399' } }
        expect(getRawWorldBackgroundColor(document, null, { scopeId: 'root', worldNode })).toBe('#663399')
    })

    it('with multiple world.background siblings in one scope, uses the one marked active', () => {
        const document = {
            nodes: [
                { id: 'bg-first', typeId: 'world.background', parentId: 'my-world', values: { color: '#111111' } },
                { id: 'bg-marked', typeId: 'world.background', parentId: 'my-world', values: { color: '#222222' } }
            ],
            workspaceState: { activeNodeIdByTypeScope: { 'world.background::my-world': 'bg-marked' } }
        }
        expect(getRawWorldBackgroundColor(document, null, { scopeId: 'my-world' })).toBe('#222222')
    })
})
