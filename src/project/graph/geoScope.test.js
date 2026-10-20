import { describe, expect, it } from 'vitest'
import { createNode } from '../nodeRegistry.js'
import { applyProjectOps, normalizeProjectDocument } from '../../shared/projectSchema.js'
import {
    GEO_ADD_TYPES,
    buildAddIntoGeoOps,
    buildNewGeoOps,
    findGeoNode,
    geoChildRow,
    geoNodeInspectorSections,
    geoNodeInspectorValues,
    geoPathLabel,
    listGeoChoices,
    listGeoChildren,
    listGeoNodes,
    nodeTransformPatch,
    nodeValuesPatch
} from './geoScope.js'

// Two Geos made in Nodes, a cube in A, a Time node in A (wiring, not a thing),
// a sphere in B, and a cube standing loose in the top room.
const fixture = () => {
    const geoA = createNode('geom.geo', { id: 'geo-a', label: 'Table', values: { position: [2, 0, 0] } })
    const geoB = createNode('geom.geo', { id: 'geo-b', label: 'Shelf', parentId: 'geo-a' })
    const cubeA = createNode('geom.cube', { id: 'cube-a', parentId: 'geo-a' })
    const timeA = createNode('value.number', { id: 'time-a', parentId: 'geo-a' })
    const sphereB = createNode('geom.sphere', { id: 'sphere-b', parentId: 'geo-b' })
    const loose = createNode('geom.cube', { id: 'cube-root' })
    return normalizeProjectDocument({
        projectMeta: { id: 'p1', title: 'P' },
        entities: [{ id: 'ent-1', type: 'box', name: 'Box', components: {} }],
        nodes: [geoA, geoB, cubeA, timeA, sphereB, loose].filter(Boolean)
    })
}

describe('the Geos of a project', () => {
    it('lists every Geo, in document order', () => {
        // Every fixture node is a real type (createNode returns null otherwise).
        expect(fixture().nodes).toHaveLength(6)
        expect(listGeoNodes(fixture()).map((node) => node.id)).toEqual(['geo-a', 'geo-b'])
    })

    it('finds a Geo by id, and nothing that is not a Geo', () => {
        const document = fixture()
        expect(findGeoNode(document, 'geo-a')?.label).toBe('Table')
        expect(findGeoNode(document, 'cube-a')).toBeNull()
        expect(findGeoNode(document, 'nope')).toBeNull()
        expect(findGeoNode(document, null)).toBeNull()
    })

    it('names a nested Geo by its path', () => {
        expect(geoPathLabel(fixture(), 'geo-b')).toBe('Table / Shelf')
    })

    it('numbers Geos that share a name, so the switcher offers two choices', () => {
        const document = normalizeProjectDocument({
            nodes: [createNode('geom.geo', { id: 'g1' }), createNode('geom.geo', { id: 'g2' }), createNode('geom.geo', { id: 'g3', label: 'Table' })]
        })
        expect(listGeoChoices(document)).toEqual([
            { id: 'g1', label: 'Geo 1' },
            { id: 'g2', label: 'Geo 2' },
            { id: 'g3', label: 'Table' }
        ])
    })

    it('survives a parent loop when naming the path', () => {
        const document = fixture()
        document.nodes.find((node) => node.id === 'geo-a').parentId = 'geo-b'
        expect(geoPathLabel(document, 'geo-b')).toBe('Table / Shelf')
    })
})

describe('what stands in a Geo', () => {
    it('lists the things standing directly in it — not wiring, not grandchildren', () => {
        const ids = listGeoChildren(fixture(), 'geo-a').map((node) => node.id)
        expect(ids).toEqual(['geo-b', 'cube-a'])
    })

    it('lists nothing for no Geo', () => {
        expect(listGeoChildren(fixture(), null)).toEqual([])
    })

    it('makes an Objects row in the shape the Objects list reads', () => {
        const row = geoChildRow(fixture().nodes.find((node) => node.id === 'cube-a'))
        expect(row).toMatchObject({ id: 'cube-a', name: 'Cube', type: 'cube', parentId: null })
    })
})

describe('adding into a Geo', () => {
    it('is one createNode with the Geo as parent — the op Nodes writes', () => {
        const document = fixture()
        const result = buildAddIntoGeoOps(document, 'geo-a', 'box', { id: 'new-box', createdBy: 'tester' })
        expect(result.ops).toHaveLength(1)
        expect(result.ops[0].type).toBe('createNode')
        expect(result.node).toMatchObject({ id: 'new-box', typeId: 'geom.cube', parentId: 'geo-a', createdBy: 'tester' })
    })

    it('lands in the document as a child of the Geo, and nowhere else', () => {
        const document = fixture()
        const { ops } = buildAddIntoGeoOps(document, 'geo-a', 'box', { id: 'new-box' })
        const next = applyProjectOps(document, ops)
        const added = next.nodes.find((node) => node.id === 'new-box')
        expect(added.parentId).toBe('geo-a')
        expect(listGeoChildren(next, 'geo-a').map((node) => node.id)).toContain('new-box')
        expect(listGeoChildren(next, 'geo-b').map((node) => node.id)).not.toContain('new-box')
        // Studio's own objects are untouched.
        expect(next.entities.map((entity) => entity.id)).toEqual(['ent-1'])
    })

    it('its card lands clear of the cards already in the Geo, on Nodes\' canvas', () => {
        const document = fixture()
        const { node } = buildAddIntoGeoOps(document, 'geo-a', 'box')
        const siblings = document.nodes.filter((other) => other.parentId === 'geo-a')
        expect(siblings.every((other) => Math.abs(other.graphX - node.graphX) >= 300 || Math.abs(other.graphY - node.graphY) >= 300)).toBe(true)
    })

    it('stands where it was pointed, local to the Geo', () => {
        const { node } = buildAddIntoGeoOps(fixture(), 'geo-a', 'sphere', { position: [1, 0, -1] })
        expect(node.values.position[0]).toBe(1)
        expect(node.values.position[2]).toBe(-1)
    })

    it('steps aside from what already stands there when no point is given', () => {
        const { node } = buildAddIntoGeoOps(fixture(), 'geo-a', 'box')
        // cube-a stands at the cube default [0, 0.5, 0]
        expect(node.values.position).not.toEqual([0, 0.5, 0])
    })

    it('maps every Create-window key to a real node type', () => {
        for (const kind of Object.keys(GEO_ADD_TYPES)) {
            const result = buildAddIntoGeoOps(fixture(), 'geo-a', kind)
            expect(result?.node?.typeId, kind).toBe(GEO_ADD_TYPES[kind])
        }
    })

    it('a lamp is the lamp Nodes places', () => {
        expect(buildAddIntoGeoOps(fixture(), 'geo-a', 'pointLight').node.typeId).toBe('light.point')
    })

    it('a model carries its file', () => {
        expect(buildAddIntoGeoOps(fixture(), 'geo-a', 'model', { src: 'asset-1' }).node.values.src).toBe('asset-1')
    })

    it('refuses a kind with no node, and a Geo that is not there', () => {
        expect(buildAddIntoGeoOps(fixture(), 'geo-a', 'portal')).toBeNull()
        expect(buildAddIntoGeoOps(fixture(), 'missing', 'box')).toBeNull()
        expect(buildAddIntoGeoOps(fixture(), 'cube-a', 'box')).toBeNull()
    })

    it('"+ Geo" makes an empty Geo in the top room, named after the count', () => {
        const document = fixture()
        const { node, ops } = buildNewGeoOps(document, { id: 'geo-c' })
        expect(node).toMatchObject({ typeId: 'geom.geo', parentId: null, label: 'Geo 3' })
        const next = applyProjectOps(document, ops)
        expect(listGeoNodes(next).map((geo) => geo.id)).toEqual(['geo-a', 'geo-b', 'geo-c'])
    })
})

describe('moving and editing a thing in a Geo', () => {
    const cube = () => fixture().nodes.find((node) => node.id === 'cube-a')

    it('a move writes the node\'s own position and nothing it did not change', () => {
        const patch = nodeTransformPatch(cube(), { position: [1, 0.5, 2], rotation: [0, 0, 0], scale: [1, 1, 1] })
        expect(patch).toEqual({ position: [1, 0.5, 2] })
    })

    it('a turn writes rotation, a stretch writes scale', () => {
        const patch = nodeTransformPatch(cube(), { position: [0, 0.5, 0], rotation: [0, 1, 0], scale: [2, 2, 2] })
        expect(patch).toEqual({ rotation: [0, 1, 0], scale: [2, 2, 2] })
    })

    it('goes through updateNode into the node\'s values', () => {
        const document = fixture()
        const patch = nodeTransformPatch(cube(), { position: [3, 0.5, 0] })
        const next = applyProjectOps(document, [{ type: 'updateNode', payload: { nodeId: 'cube-a', patch: { values: patch } } }])
        const moved = next.nodes.find((node) => node.id === 'cube-a')
        expect(moved.values.position).toEqual([3, 0.5, 0])
        expect(moved.parentId).toBe('geo-a')
        expect(moved.values.color).toBe(cube().values.color)
    })

    it('an inspector edit sends only the changed key', () => {
        const node = cube()
        expect(nodeValuesPatch(node, { ...node.values, color: '#ff0000' })).toEqual({ color: '#ff0000' })
        expect(nodeValuesPatch(node, { ...node.values })).toEqual({})
    })

    it('the inspector shows transform as X/Y/Z triplets, then the node\'s own values', () => {
        const sections = geoNodeInspectorSections(cube())
        expect(sections.map((section) => section.id)).toEqual(['transform', 'appearance'])
        expect(sections[0].fields.map((field) => field.label)).toEqual([
            'Position X', 'Position Y', 'Position Z',
            'Rotation X', 'Rotation Y', 'Rotation Z',
            'Scale X', 'Scale Y', 'Scale Z'
        ])
        const own = sections[1].fields.map((field) => field.label)
        expect(own).toContain('Colour')
        expect(own).toContain('Size X')
        expect(sections.every((section) => section.fields.every((field) => field.component === 'values'))).toBe(true)
    })

    it('fills an unset rotation and scale with their resting values', () => {
        const { values } = geoNodeInspectorValues({ values: { position: [1, 2, 3] } })
        expect(values.rotation).toEqual([0, 0, 0])
        expect(values.scale).toEqual([1, 1, 1])
    })
})
