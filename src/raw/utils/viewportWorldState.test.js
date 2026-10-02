import { describe, expect, it } from 'vitest'
import { createEdge, createNode } from '../../project/nodeRegistry.js'
import { createNodeGraphContext } from '../../project/graph/nodeGraphRuntime.js'
import { getRawWorldBackgroundColor, pickActiveTypeNode, readSceneObjects, resolveSceneLighting, sceneObjectSourceIds, resolveScopeWorldNode } from './viewportWorldState.js'

describe('resolveScopeWorldNode', () => {
    const nodes = [
        { id: 'root-child', typeId: 'math.op', parentId: null, values: {} },
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

    // Changed deliberately 2026-08-19 (was: returns null here). A scope with
    // no World of its own — standing inside a 3D Desk or a Studio — is still
    // somewhere you look around from, and returning null gated the whole 3D
    // surface off, so entering a desk blanked the stage. Now the nearest
    // ancestor's World lights the room you are standing in.
    it('falls back to the nearest ancestor world when the scope has none of its own', () => {
        expect(resolveScopeWorldNode(nodes, 'root-child', {}).id).toBe('world-1')
    })

    it('still honours the live marker of the ancestor it fell back to', () => {
        expect(resolveScopeWorldNode(nodes, 'root-child', { '': 'world-2' }).id).toBe('world-2')
    })

    it('prefers a world in the scope itself over an ancestor\'s', () => {
        const nested = [
            ...nodes,
            { id: 'desk', typeId: 'universe.desk.3d', parentId: null, values: {} },
            { id: 'desk-world', typeId: 'universe.world', parentId: 'desk', values: {} }
        ]
        expect(resolveScopeWorldNode(nested, 'desk', {}).id).toBe('desk-world')
    })

    it('returns null when no ancestor has a world at all', () => {
        const worldless = [
            { id: 'a', typeId: 'math.op', parentId: null, values: {} },
            { id: 'b', typeId: 'math.op', parentId: 'a', values: {} }
        ]
        expect(resolveScopeWorldNode(worldless, 'b', {})).toBeNull()
    })

    // A damaged document must not hang the viewport.
    it('survives a parentId cycle', () => {
        const cyclic = [
            { id: 'x', typeId: 'math.op', parentId: 'y', values: {} },
            { id: 'y', typeId: 'math.op', parentId: 'x', values: {} }
        ]
        expect(resolveScopeWorldNode(cyclic, 'x', {})).toBeNull()
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

    it('a wire into the world node\'s own bgColor input overrides its static value', () => {
        const document = { worldState: { backgroundColor: '#05070a' }, nodes: [] }
        const colorNode = createNode('value.color', { id: 'color-1', values: { value: '#663399' } })
        const worldNode = createNode('universe.world', { id: 'world-1', values: { bgColor: '#000000' } })
        const graphContext = createNodeGraphContext({
            nodes: [colorNode, worldNode],
            edges: [createEdge('color-1', 'out', 'world-1', 'bgColor')]
        })
        expect(getRawWorldBackgroundColor(document, graphContext, { scopeId: 'root', worldNode })).toBe('#663399')
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

describe('resolveSceneLighting — the Light split, read side', () => {
    const env = { id: 'env', typeId: 'world.environment', parentId: null, values: { ambientIntensity: 0.3 } }
    const legacy = { id: 'leg', typeId: 'world.light', parentId: null, values: { ambientIntensity: 0.9 } }

    it('an Environment in scope wins', () => {
        const doc = { nodes: [env, legacy], workspaceState: {} }
        expect(resolveSceneLighting(doc, null, { scopeId: null }).ambientIntensity).toBe(0.3)
    })

    it('with no Environment, the retired dual Light still drives — old documents light as they did', () => {
        const doc = { nodes: [legacy], workspaceState: {} }
        expect(resolveSceneLighting(doc, null, { scopeId: null }).ambientIntensity).toBe(0.9)
    })

    it('with neither, null — callers keep their own fallbacks', () => {
        expect(resolveSceneLighting({ nodes: [], workspaceState: {} }, null, { scopeId: null })).toBeNull()
    })
})

describe('readSceneObjects — what is wired into a Scene stands on its stage', () => {
    const world = createNode('universe.world', { id: 'w' })
    const read = (nodes, edges, worldNode = world) =>
        readSceneObjects(worldNode, createNodeGraphContext({ nodes: [worldNode, ...nodes], edges }))

    it('a wired Cube arrives as its shape, with its own size and colour', () => {
        const cube = createNode('geom.cube', { id: 'c', values: { size: [2, 1, 1], color: '#ff0000' } })
        const shape = read([cube], [createEdge('c', 'geometry', 'w', 'objects')])
        expect(shape.kind).toBe('box')
        expect(shape.size).toEqual([2, 1, 1])
        expect(shape.color).toBe('#ff0000')
    })

    it('many objects arrive through Merge, chained for more', () => {
        const a = createNode('geom.cube', { id: 'a' })
        const b = createNode('geom.sphere', { id: 'b' })
        const c = createNode('geom.cone', { id: 'c' })
        const m1 = createNode('shape.merge', { id: 'm1' })
        const m2 = createNode('shape.merge', { id: 'm2' })
        const shape = read([a, b, c, m1, m2], [
            createEdge('a', 'geometry', 'm1', 'a'),
            createEdge('b', 'geometry', 'm1', 'b'),
            createEdge('m1', 'out', 'm2', 'a'),
            createEdge('c', 'geometry', 'm2', 'b'),
            createEdge('m2', 'out', 'w', 'objects'),
        ])
        expect(shape.kind).toBe('group')
        expect(shape.children).toHaveLength(3)
    })

    it('nothing wired, or not a Scene, draws nothing', () => {
        expect(read([], [])).toBeNull()
        expect(readSceneObjects(null, createNodeGraphContext({ nodes: [], edges: [] }))).toBeNull()
        const cube = createNode('geom.cube', { id: 'c' })
        expect(readSceneObjects(cube, createNodeGraphContext({ nodes: [cube], edges: [] }))).toBeNull()
    })
})

describe('sceneObjectSourceIds — what the Scene draws, the room does not draw again', () => {
    const world = createNode('universe.world', { id: 'w' })
    const cube = createNode('geom.cube', { id: 'c' })
    const sphere = createNode('geom.sphere', { id: 's' })
    const loose = createNode('geom.cube', { id: 'loose' })
    const merge = createNode('shape.merge', { id: 'm' })
    const colour = createNode('value.color', { id: 'col' })

    it('walks the shape back through Merge to every part, and only shapes', () => {
        const document = {
            nodes: [world, cube, sphere, loose, merge, colour],
            edges: [
                createEdge('col', 'out', 'c', 'color'),
                createEdge('c', 'geometry', 'm', 'a'),
                createEdge('s', 'geometry', 'm', 'b'),
                createEdge('m', 'out', 'w', 'objects'),
            ]
        }
        expect([...sceneObjectSourceIds(document, world)].sort()).toEqual(['c', 'm', 's'])
    })

    it('nothing wired → nothing hidden; a Cube wired elsewhere stays in the room', () => {
        const document = { nodes: [world, cube, merge], edges: [createEdge('c', 'geometry', 'm', 'a')] }
        expect(sceneObjectSourceIds(document, world).size).toBe(0)
        expect(sceneObjectSourceIds(document, null).size).toBe(0)
    })

    it('a feedback loop ends', () => {
        const t = createNode('geom.transform', { id: 't' })
        const document = {
            nodes: [world, t, merge],
            edges: [createEdge('t', 'out', 'm', 'a'), createEdge('m', 'out', 't', 'geometry'), createEdge('m', 'out', 'w', 'objects')]
        }
        expect([...sceneObjectSourceIds(document, world)].sort()).toEqual(['m', 't'])
    })
})
