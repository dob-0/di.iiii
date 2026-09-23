import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { normalizeProjectDocument } from '../shared/projectSchema.js'
import { createEntityOfType } from './entityRegistry.js'
import { createEdge, createNode, NODE_TYPES } from './nodeRegistry.js'
import {
    describeProjectLayers,
    isProjectLoaded,
    LAMP_OBJECT_TYPES,
    readProjectLayers,
    STANDING_NODE_KINDS,
    WINDOW_NODE_KINDS
} from './layers.js'
import { LIGHTS } from './entityPalette.js'

const require = createRequire(import.meta.url)
const serverTwin = require(path.join(path.dirname(fileURLToPath(import.meta.url)), '../../shared/layers.cjs'))

// The eight fixture projects of the decision (2026-09-23, unit 1's verify line):
// empty; objects only; nodes only; a wire; a surface; a Picture Out; a lamp; a
// joined lamp. Each is a document as the server would send it.
const doc = (patch = {}) => normalizeProjectDocument({ projectMeta: { id: 'p1', spaceId: 'lab' }, ...patch })
const lamp = (index = null) => {
    const entity = createEntityOfType('spotLight')
    return index == null ? entity : { ...entity, components: { ...entity.components, fixture: { index } } }
}
const noise = createNode('top.noise')
const blur = createNode('top.blur')
const FIXTURES = {
    empty: doc(),
    objectsOnly: doc({ entities: [createEntityOfType('box'), createEntityOfType('sphere'), createEntityOfType('cone')] }),
    nodesOnly: doc({ nodes: [createNode('geom.cube'), createNode('time')] }),
    aWire: doc({ nodes: [noise, blur], edges: [createEdge(noise.id, 'out', blur.id, 'a')] }),
    aSurface: doc({ mappingState: { surfaces: [{ id: 's1', name: 'Wall A' }] } }),
    aPictureOut: doc({ nodes: [createNode('top.out')] }),
    aLamp: doc({ entities: [lamp()] }),
    aJoinedLamp: doc({ entities: [lamp(3)] })
}

const openOf = (document) => readProjectLayers(document).open

describe('layers — what inside what', () => {
    it('an empty project: only the space and the room are open, and it is empty', () => {
        const layers = readProjectLayers(FIXTURES.empty)
        expect(layers.open).toEqual({ space: true, things: true, connections: false, wall: false, lamps: false, handover: false })
        expect(layers.empty).toBe(true)
        expect(describeProjectLayers(layers.counts)).toBe('empty')
    })

    it('objects only: things holds something, so connections and hand-over open — not the wall', () => {
        const layers = readProjectLayers(FIXTURES.objectsOnly)
        expect(layers.holds.things).toBe(true)
        expect(layers.open).toEqual({ space: true, things: true, connections: true, wall: false, lamps: false, handover: true })
        expect(describeProjectLayers(layers.counts)).toBe('3 things')
    })

    it('nodes only: a standing node is a thing, a Time node is a connection — so the wall opens', () => {
        const layers = readProjectLayers(FIXTURES.nodesOnly)
        expect(layers.counts).toMatchObject({ things: 1, standingNodes: 1, nodes: 1 })
        expect(layers.open).toMatchObject({ connections: true, wall: true, lamps: false })
        expect(describeProjectLayers(layers.counts)).toBe('1 thing · 1 node')
    })

    it('a wire with no thing in the room still opens connections and the wall (a layer that holds something never hides)', () => {
        const layers = readProjectLayers(FIXTURES.aWire)
        expect(layers.holds).toMatchObject({ things: false, connections: true })
        expect(layers.open).toMatchObject({ connections: true, wall: true, handover: false })
        expect(describeProjectLayers(layers.counts)).toBe('2 nodes · 1 wire')
    })

    it('a surface alone: the wall holds something, so it shows though nothing opened it', () => {
        const layers = readProjectLayers(FIXTURES.aSurface)
        expect(layers.holds).toMatchObject({ wall: true, connections: false, things: false })
        expect(layers.open).toMatchObject({ wall: true, connections: false })
        expect(describeProjectLayers(layers.counts)).toBe('1 surface')
    })

    it('a Picture Out counts for the wall, and is itself a connection', () => {
        const layers = readProjectLayers(FIXTURES.aPictureOut)
        expect(layers.counts).toMatchObject({ pictureOuts: 1, nodes: 1 })
        expect(layers.holds).toMatchObject({ wall: true, connections: true })
        expect(layers.open.wall).toBe(true)
    })

    it('a lamp standing in the room opens the lamps layer; it holds nothing until joined', () => {
        const layers = readProjectLayers(FIXTURES.aLamp)
        expect(layers.open.lamps).toBe(true)
        expect(layers.holds.lamps).toBe(false)
        expect(layers.holds.things).toBe(true)
        expect(describeProjectLayers(layers.counts)).toBe('1 lamp')
    })

    it('a lamp joined to a fixture: the lamps layer holds something', () => {
        const layers = readProjectLayers(FIXTURES.aJoinedLamp)
        expect(layers.counts).toMatchObject({ lamps: 1, joinedLamps: 1 })
        expect(layers.holds.lamps).toBe(true)
        expect(layers.open.lamps).toBe(true)
    })

    it('nothing opens or hides before the project has loaded', () => {
        const layers = readProjectLayers(FIXTURES.objectsOnly, { loaded: false })
        expect(layers.open).toBeNull()
        expect(layers.empty).toBeNull()
        expect(layers.loaded).toBe(false)
    })

    it('a window on the canvas opens nothing; a mic on the canvas is a connection', () => {
        expect(openOf(doc({ nodes: [createNode('view.outliner'), createNode('view.inspector')] }))).toMatchObject({ connections: false, wall: false })
        expect(readProjectLayers(doc({ nodes: [createNode('view.outliner')] })).empty).toBe(true)
        expect(readProjectLayers(doc({ nodes: [createNode('source.mic')] })).holds.connections).toBe(true)
    })

    it('a cue that calls the light desk holds the lamps layer — the show is already in use', () => {
        const layers = readProjectLayers(doc({ mappingState: { cues: [{ id: 'c1', lightScene: 'scene-1' }] } }))
        expect(layers.holds.lamps).toBe(true)
        expect(layers.open.lamps).toBe(true)
    })

    it('a shared link or a saved file holds hand-over', () => {
        expect(readProjectLayers(doc({ publishState: { shareEnabled: true } })).holds.handover).toBe(true)
        expect(readProjectLayers(doc({ publishState: { lastExportAt: 1 } })).holds.handover).toBe(true)
    })

    it('a project that builds a page is never empty', () => {
        const layers = readProjectLayers(doc({ presentationState: { mode: 'code', codeHtml: '<h1>hi</h1>' } }))
        expect(layers.empty).toBe(false)
        expect(describeProjectLayers(layers.counts)).toBe('a page')
    })

    it('reads a raw, unnormalized document without throwing', () => {
        expect(readProjectLayers({}).empty).toBe(true)
        expect(readProjectLayers(null).empty).toBe(true)
        expect(readProjectLayers({ entities: [null], nodes: [null], mappingState: { cues: [null] } }).counts.things).toBe(1)
    })

    it('knows the real document by its id, not by a stored flag', () => {
        expect(isProjectLoaded(doc({ projectMeta: { id: '' } }), 'p1')).toBe(false)
        expect(isProjectLoaded(FIXTURES.empty, 'p1')).toBe(true)
        expect(isProjectLoaded(FIXTURES.empty, 'p2')).toBe(false)
        expect(isProjectLoaded(FIXTURES.empty, null)).toBe(false)
    })
})

describe('layers — the server twin stays in lockstep (shared/layers.cjs)', () => {
    it('lists the same 17 standing kinds as the registry', () => {
        const registry = Object.values(NODE_TYPES).filter((type) => type.render === 'spatial-3d').map((type) => type.id).sort()
        expect(registry).toHaveLength(17)
        expect([...serverTwin.STANDING_NODE_KINDS].sort()).toEqual(registry)
        expect([...STANDING_NODE_KINDS].sort()).toEqual(registry)
    })

    it('lists the same windows, and every one is a registered kind', () => {
        expect([...serverTwin.WINDOW_NODE_KINDS].sort()).toEqual([...WINDOW_NODE_KINDS].sort())
        for (const id of WINDOW_NODE_KINDS) expect(NODE_TYPES[id]).toBeTruthy()
    })

    it('knows the same lamps as Studio\'s Lights row', () => {
        expect([...LAMP_OBJECT_TYPES].sort()).toEqual(LIGHTS.map(({ key }) => key).sort())
        expect([...serverTwin.LAMP_OBJECT_TYPES].sort()).toEqual([...LAMP_OBJECT_TYPES].sort())
    })

    it('counts every fixture exactly as the browser does', () => {
        for (const [name, document] of Object.entries(FIXTURES)) {
            expect({ name, counts: serverTwin.countProjectLayers(document) }).toEqual({ name, counts: readProjectLayers(document).counts })
        }
    })
})
