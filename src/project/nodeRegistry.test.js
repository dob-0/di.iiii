import { existsSync, readFileSync } from 'node:fs'
import { NODE_RUNTIMES } from './nodes/index.js'
import { resolve } from 'node:path'
import { cwd } from 'node:process'
import { describe, expect, it } from 'vitest'
import {
    NODE_TYPES,
    PORT_TYPES,
    NODE_FAMILIES,
    FAMILY_BY_TYPE,
    createNode,
    createEdge,
    listNodeTypes,
    UNIMPLEMENTED_NODE_TYPES,
    arePortsCompatible,
    getNodeFamily,
    getNodeType,
    getNodeInputs,
    getNodeOutputs,
    isNodeMadeOfCode,
    CONTAINER_TYPE_IDS,
} from './nodeRegistry.js'

describe('paletteHidden', () => {
    it('view.library (Create) is implemented but not offered — its buttons make objects, not nodes', () => {
        const offered = listNodeTypes().map((type) => type.id)
        expect(offered).not.toContain('view.library')
        const everything = listNodeTypes({ includeUnimplemented: true }).map((type) => type.id)
        expect(everything).toContain('view.library')
    })
})

describe('PORT_TYPES', () => {
    it('defines core port types with label and color', () => {
        for (const key of ['number', 'vec3', 'color', 'boolean', 'string', 'geometry', 'texture', 'signal', 'any']) {
            expect(PORT_TYPES[key]).toHaveProperty('label')
            expect(PORT_TYPES[key]).toHaveProperty('color')
        }
    })
})

describe('NODE_TYPES', () => {
    it('every node type has required fields', () => {
        for (const [id, type] of Object.entries(NODE_TYPES)) {
            expect(type.id).toBe(id)
            expect(type.label).toBeTruthy()
            expect(type.category).toBeTruthy()
            expect(['any', 'web', 'local']).toContain(type.runtime)
            expect(Array.isArray(type.inputs)).toBe(true)
            expect(Array.isArray(type.outputs)).toBe(true)
            expect(['spatial-3d', 'panel-2d', 'hidden']).toContain(type.render)
        }
    })

    it('every port on every node type has id, type, and label', () => {
        for (const type of Object.values(NODE_TYPES)) {
            for (const port of [...type.inputs, ...type.outputs]) {
                expect(port.id).toBeTruthy()
                expect(port.type).toBeTruthy()
                expect(port.label).toBeTruthy()
                expect(PORT_TYPES[port.type] || port.type === 'any').toBeTruthy()
            }
        }
    })

    it('geometry nodes render spatial-3d', () => {
        expect(NODE_TYPES['geom.cube'].render).toBe('spatial-3d')
        expect(NODE_TYPES['geom.sphere'].render).toBe('spatial-3d')
        expect(NODE_TYPES['geom.plane'].render).toBe('spatial-3d')
    })

    it('view nodes render panel-2d', () => {
        expect(NODE_TYPES['view.text'].render).toBe('panel-2d')
        expect(NODE_TYPES['view.browser'].render).toBe('panel-2d')
        expect(NODE_TYPES['view.image'].render).toBe('panel-2d')
    })

    it('world and math nodes are hidden — except Light and Camera, which stand somewhere', () => {
        // world.light went spatial 2026-08-19 so a Light can be COLLECTED
        // inside a container (a real point light with a marker); at root it
        // still draws nothing and keeps its settings job. world.camera went in
        // spatial 2026-08-20: the authored eye stands in the room, carried by
        // containers like anything else.
        expect(NODE_TYPES['world.light'].render).toBe('spatial-3d')
        expect(NODE_TYPES['world.camera'].render).toBe('spatial-3d')
        expect(NODE_TYPES['world.background'].render).toBe('hidden')
        expect(NODE_TYPES['math.add'].render).toBe('hidden')
    })

    it('a fresh Camera is the room\'s own default view — authored without a jump', () => {
        // These three defaults are byte-identical to RawViewport's built-in
        // camera (position [0,2.4,6.5], target [0,0.75,0], fov 50). If either
        // side drifts, placing a Camera would CUT to a different shot the
        // moment it lands.
        const inputs = Object.fromEntries(NODE_TYPES['world.camera'].inputs.map((i) => [i.id, i.default]))
        expect(inputs.position).toEqual([0, 2.4, 6.5])
        expect(inputs.lookAt).toEqual([0, 0.75, 0])
        expect(inputs.fov).toBe(50)
    })

    // Product decision 2026-07-19: no node type is a singleton — every type,
    // including the former singletons (time, source.ar, universe.world,
    // world.light, world.background, world.grid), is free-form and
    // placeable any number of times. Generalizes the earlier universe.node0
    // reversal (2026-07-17) to every remaining former singleton.
    it('no node type is marked singleton', () => {
        expect(NODE_TYPES['world.light'].singleton).toBeFalsy()
        expect(NODE_TYPES['world.background'].singleton).toBeFalsy()
        expect(NODE_TYPES['world.grid'].singleton).toBeFalsy()
        expect(NODE_TYPES['universe.world'].singleton).toBeFalsy()
        expect(NODE_TYPES['time'].singleton).toBeFalsy()
        expect(NODE_TYPES['source.ar'].singleton).toBeFalsy()
    })

    // Regression (2026-08-01): `time` was implemented (removed from
    // UNIMPLEMENTED_NODE_TYPES, evaluator added in nodeGraphRuntime) but kept
    // its stale authoringOnly flag, so the palette still said "doesn't compute
    // or render anything yet". Any type the runtime evaluates must not carry
    // the flag — extracted from the evaluator source so a new implementation
    // that forgets the flag fails here, not in the palette.
    it('no runtime-evaluated node type is marked authoringOnly', () => {
        const runtimePath = ['project/graph/nodeGraphRuntime.js', 'src/project/graph/nodeGraphRuntime.js']
            .map((p) => resolve(cwd(), p)).find(existsSync)
        const runtimeSource = readFileSync(runtimePath, 'utf8')
        // Evaluated types live in TWO homes since the colocation seed: the
        // legacy switch (scanned from source) and the NODE_RUNTIMES map.
        const evaluatedTypeIds = [
            ...[...runtimeSource.matchAll(/case '([^']+)':/g)].map((m) => m[1]),
            ...NODE_RUNTIMES.keys()
        ]
        expect(evaluatedTypeIds).toContain('time')
        for (const typeId of evaluatedTypeIds) {
            if (!NODE_TYPES[typeId]) continue
            expect(NODE_TYPES[typeId].authoringOnly, `${typeId} is evaluated but flagged authoringOnly`).toBeFalsy()
        }
    })

    it('universe.node0 is an ordinary node type', () => {
        const rootType = NODE_TYPES['universe.node0']
        expect(rootType).toBeTruthy()
        expect(rootType.category).toBe('universe')
        expect(rootType.render).toBe('hidden')
        expect(rootType.defaultValues.title).toBe('Node 0')
        expect(rootType.singleton).toBeFalsy()
    })

    // Product decision 2026-07-17: universe.space carries a per-universe
    // showChrome flag so one universe can be a normal authoring space (full
    // topbar) and another a chromeless embed/kiosk view. Defaults to true —
    // existing/new universes keep the full-chrome behavior unless someone
    // explicitly turns it off.
    it('universe.space defaults to showChrome: true', () => {
        const node = createNode('universe.space')
        expect(node.values.showChrome).toBe(true)
    })

    it('node.null is the extensibility primitive', () => {
        const nullType = NODE_TYPES['node.null']
        expect(nullType.isNull).toBe(true)
        expect(nullType.inputs).toHaveLength(0)
        expect(nullType.outputs).toHaveLength(0)
        expect(nullType.defaultValues).toHaveProperty('body')
        expect(nullType.defaultValues).toHaveProperty('portDefs')
    })
})

describe('createNode', () => {
    it('creates a node instance with defaults from port definitions', () => {
        const node = createNode('geom.cube')
        expect(node.typeId).toBe('geom.cube')
        expect(typeof node.id).toBe('string')
        expect(node.id.length).toBeGreaterThan(0)
        expect(node.values.color).toBe('#5fa8ff')
        expect(node.values.size).toEqual([1, 1, 1])
        expect(node.values.position).toEqual([0, 0.5, 0])
    })

    it('merges options.values over defaults', () => {
        const node = createNode('geom.cube', { values: { color: '#ff0000' } })
        expect(node.values.color).toBe('#ff0000')
        expect(node.values.size).toEqual([1, 1, 1])
    })

    it('uses options.id when provided', () => {
        const node = createNode('geom.cube', { id: 'my-id' })
        expect(node.id).toBe('my-id')
    })

    it('sets graphX/graphY position', () => {
        const node = createNode('value.number', { graphX: 100, graphY: 200 })
        expect(node.graphX).toBe(100)
        expect(node.graphY).toBe(200)
    })

    it('returns null for unknown typeId', () => {
        expect(createNode('does.not.exist')).toBeNull()
    })

    it('creates a null node with empty body and portDefs', () => {
        const node = createNode('node.null')
        expect(node.typeId).toBe('node.null')
        expect(node.values.body).toBe('')
        expect(node.values.portDefs).toEqual([])
    })

    it('creates a string source node with an empty value', () => {
        const node = createNode('value.string')
        expect(node.typeId).toBe('value.string')
        expect(node.values.value).toBe('')
    })

    it('creates universe.node0 with root defaults', () => {
        const node = createNode('universe.node0')
        expect(node.typeId).toBe('universe.node0')
        expect(node.values.title).toBe('Node 0')
        expect(node.values.active).toBe(true)
    })
})

describe('createEdge', () => {
    it('creates an edge between two node ports', () => {
        const edge = createEdge('node-a', 'out', 'node-b', 'color')
        expect(typeof edge.id).toBe('string')
        expect(edge.id.length).toBeGreaterThan(0)
        expect(edge.fromNodeId).toBe('node-a')
        expect(edge.fromPort).toBe('out')
        expect(edge.toNodeId).toBe('node-b')
        expect(edge.toPort).toBe('color')
    })
})

describe('listNodeTypes', () => {
    it('returns every implemented type when no filter given', () => {
        // Not every declared type: unimplemented ones are withheld from the
        // palette so the editor stops offering nodes that do nothing, and
        // paletteHidden ones are implemented but deliberately not offered.
        const paletteHidden = Object.values(NODE_TYPES).filter((t) => t.paletteHidden && !UNIMPLEMENTED_NODE_TYPES.has(t.id)).length
        const all = listNodeTypes()
        expect(all.length).toBe(Object.keys(NODE_TYPES).length - UNIMPLEMENTED_NODE_TYPES.size - paletteHidden)
    })

    it('filters by category', () => {
        const geom = listNodeTypes({ category: 'geometry' })
        expect(geom.every(t => t.category === 'geometry')).toBe(true)
        expect(geom.map(t => t.id)).toContain('geom.cube')
    })

    it('filters by query', () => {
        const results = listNodeTypes({ query: 'cube' })
        expect(results.map(t => t.id)).toContain('geom.cube')
        expect(results.map(t => t.id)).not.toContain('geom.sphere')
    })

    it('matches keywords — "claude" and "chat" find the agent node', () => {
        expect(listNodeTypes({ query: 'claude' }).map(t => t.id)).toContain('agent')
        expect(listNodeTypes({ query: 'chat' }).map(t => t.id)).toContain('agent')
    })

    it('returns all nodes including web-only when runtime filter is any (no filter)', () => {
        const all = listNodeTypes({ runtime: 'any', includeUnimplemented: true })
        expect(all.length).toBe(Object.keys(NODE_TYPES).length)
    })

    it('includes only any+web nodes when runtime is web', () => {
        // includeUnimplemented: source.ar/webcam are the web-runtime examples and
        // are both still on the backlog — this asserts the runtime filter, not
        // the palette gate.
        const web = listNodeTypes({ runtime: 'web', includeUnimplemented: true })
        expect(web.map(t => t.id)).toContain('source.ar')
        expect(web.map(t => t.id)).toContain('source.webcam')
        expect(web.map(t => t.id)).toContain('geom.cube') // runtime: 'any' always included
    })

    it('excludes web-only nodes when runtime is local', () => {
        const local = listNodeTypes({ runtime: 'local', includeUnimplemented: true })
        expect(local.map(t => t.id)).not.toContain('source.ar')
        expect(local.map(t => t.id)).toContain('geom.cube') // runtime: 'any' always included
    })
})

describe('arePortsCompatible', () => {
    it('same type is compatible', () => {
        expect(arePortsCompatible('number', 'number')).toBe(true)
        expect(arePortsCompatible('color', 'color')).toBe(true)
    })

    it('any connects to everything', () => {
        expect(arePortsCompatible('any', 'number')).toBe(true)
        expect(arePortsCompatible('geometry', 'any')).toBe(true)
    })

    it('color and vec3 are interchangeable', () => {
        expect(arePortsCompatible('color', 'vec3')).toBe(true)
        expect(arePortsCompatible('vec3', 'color')).toBe(true)
    })

    it('incompatible types return false', () => {
        expect(arePortsCompatible('number', 'geometry')).toBe(false)
        expect(arePortsCompatible('string', 'texture')).toBe(false)
    })
})

describe('getNodeInputs / getNodeOutputs', () => {
    it('returns type-level ports for standard nodes', () => {
        const node = createNode('geom.cube')
        expect(getNodeInputs(node).map(p => p.id)).toContain('color')
        expect(getNodeOutputs(node).map(p => p.id)).toContain('bounds')
    })

    it('exposes a texture input on geom.plane distinct from textureUrl, for a live source like source.webcam', () => {
        const node = createNode('geom.plane')
        const inputIds = getNodeInputs(node).map(p => p.id)
        expect(inputIds).toContain('texture')
        expect(inputIds).toContain('textureUrl')
    })

    it('returns instance portDefs for null nodes', () => {
        const node = createNode('node.null', {
            values: {
                body: '',
                portDefs: [
                    { dir: 'in',  id: 'value', type: 'number', label: 'Value' },
                    { dir: 'out', id: 'result', type: 'number', label: 'Result' },
                ]
            }
        })
        expect(getNodeInputs(node).map(p => p.id)).toContain('value')
        expect(getNodeOutputs(node).map(p => p.id)).toContain('result')
    })
})

describe('unimplemented node types', () => {
    it('withholds types with nothing behind them from the palette', () => {
        const offered = listNodeTypes().map((type) => type.id)
        // device.midi.in left this list on 2026-08-08 — Web MIDI is real in the
        // page, so it is implemented. device.midi.out stands in its place: it
        // has no sender yet.
        for (const id of ['source.ar', 'device.midi.out', 'stream.compositor', 'universe.link']) {
            expect(offered).not.toContain(id)
        }
    })

    it('still offers everything that actually works', () => {
        const offered = listNodeTypes().map((type) => type.id)
        // world.light left this list with the Light split: it still WORKS
        // (old documents keep both its behaviours) but is paletteHidden —
        // the palette offers Environment and Light (light.point) instead.
        for (const id of [
            'value.number', 'math.add', 'geom.cube', 'light.point',
            'world.environment', 'universe.world', 'view.image', 'view.browser', 'time',
            'source.webcam', 'source.mic', 'agent.keeper', 'device.midi.in'
        ]) {
            expect(offered).toContain(id)
        }
    })

    it('keeps the definitions resolvable so existing documents still load', () => {
        // Gating creation must never break a document that already contains one.
        for (const id of UNIMPLEMENTED_NODE_TYPES) {
            expect(getNodeType(id)).toBeTruthy()
        }
    })

    it('can list them explicitly, for the backlog', () => {
        const all = listNodeTypes({ includeUnimplemented: true }).map((type) => type.id)
        expect(all).toContain('source.ar')
        expect(all.length).toBeGreaterThan(listNodeTypes().length)
    })

    it('names only types that really exist — a typo here would silently hide nothing', () => {
        for (const id of UNIMPLEMENTED_NODE_TYPES) {
            expect(getNodeType(id), `${id} is listed as unimplemented but is not a real type`).toBeTruthy()
        }
    })
})

// The palette groups by family; a type missing from the map would silently
// fall out of browse mode while staying searchable — invisible until someone
// notices a node "disappeared". Both directions are enforced here.
describe('node families', () => {
    it('every node type belongs to exactly one declared family', () => {
        const familyIds = new Set(NODE_FAMILIES.map((family) => family.id))
        for (const typeId of Object.keys(NODE_TYPES)) {
            const familyId = FAMILY_BY_TYPE[typeId]
            expect(familyId, `${typeId} has no family`).toBeTruthy()
            expect(familyIds.has(familyId), `${typeId} points at unknown family ${familyId}`).toBe(true)
        }
    })

    it('the family map names only types that really exist', () => {
        for (const typeId of Object.keys(FAMILY_BY_TYPE)) {
            expect(getNodeType(typeId), `${typeId} is mapped to a family but is not a real type`).toBeTruthy()
        }
    })

    // A real palette test on staging searched these nine words and every one
    // returned "no match" — the node did not exist. Now it does, and the
    // words a person actually types have to reach it.
    it.each([
        ['model', 'geom.model'], ['glb', 'geom.model'], ['gltf', 'geom.model'],
        ['mesh', 'geom.model'], ['fbx', 'geom.model'], ['scan', 'geom.model'],
        ['video', 'media.video'], ['mp4', 'media.video'], ['footage', 'media.video'],
        ['sound', 'media.audio'], ['audio', 'media.audio'], ['music', 'media.audio']
    ])('searching the palette for "%s" finds %s', (query, typeId) => {
        expect(listNodeTypes({ query }).map((type) => type.id)).toContain(typeId)
    })

    it('"import" and "file" reach all three ways of bringing something in', () => {
        for (const query of ['import', 'file']) {
            const found = listNodeTypes({ query }).map((type) => type.id)
            expect(found, query).toEqual(expect.arrayContaining(['geom.model', 'media.video', 'media.audio']))
        }
    })

    it('resolves a family with label and color for any placeable type', () => {
        for (const type of listNodeTypes()) {
            const family = getNodeFamily(type.id)
            expect(family?.label, `${type.id} resolves no family`).toBeTruthy()
            expect(family?.color).toMatch(/^#[0-9a-f]{6}$/i)
        }
    })
})

// An empty canvas means two different things and used to show one screen for
// both: an empty ROOM, or a thing that HAS no room. Going inside a Cube gave
// the same blank grid as a fresh workspace, with nothing to say that a Cube is
// a case in a JavaScript switch and has no insides to look at.
describe('what a node is made of', () => {
    it('calls a cube, a light and a number made of code', () => {
        for (const typeId of ['geom.cube', 'geom.sphere', 'world.light', 'value.number', 'math.add', 'view.text']) {
            expect(isNodeMadeOfCode(typeId), typeId).toBe(true)
        }
    })

    it('does not say that of the things whose whole point is having an inside', () => {
        for (const typeId of ['universe.world', 'universe.desk.3d', 'studio', 'universe.space']) {
            expect(isNodeMadeOfCode(typeId), typeId).toBe(false)
        }
    })

    it('says nothing about a type it has never heard of', () => {
        expect(isNodeMadeOfCode('not.a.real.type')).toBe(false)
        expect(isNodeMadeOfCode(undefined)).toBe(false)
    })

    // Derived, not listed, so it cannot rot as types are added.
    it('covers every registered type one way or the other', () => {
        for (const typeId of Object.keys(NODE_TYPES)) {
            expect(isNodeMadeOfCode(typeId) || CONTAINER_TYPE_IDS.has(typeId), typeId).toBe(true)
        }
    })
})

