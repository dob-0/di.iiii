import { describe, expect, it } from 'vitest'
import {
    MAX_GEOMETRY_PIECES,
    countGeometryPieces,
    isGeometryDescriptor,
    mergeGeometry
} from './geometryDescriptor.js'
import { createEdge, createNode } from '../nodeRegistry.js'
import { createNodeGraphContext, evaluateNodeOutput } from './nodeGraphRuntime.js'
import { wearConstructorGeometry } from './constructorGeometry.js'

const ctxOf = (nodes, edges = []) => createNodeGraphContext({ nodes, edges }, { now: 0 })

describe('the geometry descriptor', () => {
    it('accepts the four kinds and rejects everything else', () => {
        expect(isGeometryDescriptor({ kind: 'box', size: [1, 1, 1] })).toBe(true)
        expect(isGeometryDescriptor({ kind: 'group', children: [] })).toBe(true)
        expect(isGeometryDescriptor({ kind: 'group' })).toBe(false)
        expect(isGeometryDescriptor({ kind: 'torus' })).toBe(false)
        expect(isGeometryDescriptor([1, 2, 3])).toBe(false)
        expect(isGeometryDescriptor('box')).toBe(false)
        expect(isGeometryDescriptor(null)).toBe(false)
    })

    // "Nothing" and "an empty group" are different facts: the first reads as
    // `nothing` on every surface, the second would draw as an invisible
    // something and read as a value.
    it('merges to undefined when nothing real is offered', () => {
        expect(mergeGeometry([])).toBeUndefined()
        expect(mergeGeometry([undefined, null, { kind: 'nope' }])).toBeUndefined()
        const box = { kind: 'box', size: [1, 1, 1] }
        expect(mergeGeometry([box, undefined])).toBe(box)
        expect(mergeGeometry([box, box])).toEqual({ kind: 'group', children: [box, box] })
    })

    it('counts pieces the way the renderer walks, caps included', () => {
        const box = { kind: 'box', size: [1, 1, 1] }
        expect(countGeometryPieces(box)).toBe(1)
        expect(countGeometryPieces({ kind: 'group', children: [box, box, box] })).toBe(3)
        const huge = { kind: 'group', children: Array.from({ length: 1000 }, () => box) }
        expect(countGeometryPieces(huge)).toBe(MAX_GEOMETRY_PIECES)
        // Self-reference: a descriptor cannot normally contain itself, but a
        // hand-built document could hand one over — depth must end the walk.
        const loop = { kind: 'group', children: [] }
        loop.children.push(loop)
        expect(countGeometryPieces(loop)).toBe(0)
    })

    // The defect the adversarial review caught by execution: every Merge used
    // to nest a fresh group, so the DOCUMENTED pattern for combining many
    // parts — chain Merges — hit the depth cap at seventeen parts and silently
    // dropped the earliest-wired ones. Twenty parts through nineteen chained
    // Merges must arrive intact.
    it('a hand-built merge chain never eats parts', () => {
        const spheres = Array.from({ length: 20 }, (_, i) => ({ kind: 'sphere', radius: i + 1 }))
        let chain = mergeGeometry([spheres[0], spheres[1]])
        for (let i = 2; i < spheres.length; i += 1) chain = mergeGeometry([chain, spheres[i]])
        expect(countGeometryPieces(chain)).toBe(20)
        expect(chain.children).toHaveLength(20)
        // …while a group that carries a transform keeps its own frame intact.
        const placed = { kind: 'group', children: [spheres[0]], position: [1, 0, 0] }
        const merged = mergeGeometry([placed, spheres[1]])
        expect(merged.children[0]).toBe(placed)
    })
})

describe('geometry down a wire', () => {
    it('carries a wired colour into the descriptor, not the stale local one', () => {
        const red = createNode('value.color', { values: { value: '#ff0000' } })
        const cube = createNode('geom.cube', { values: { color: '#00ff00', size: [2, 2, 2] } })
        const context = ctxOf([red, cube], [createEdge(red.id, 'out', cube.id, 'color')])
        expect(evaluateNodeOutput(cube, 'geometry', context)).toEqual({
            kind: 'box',
            size: [2, 2, 2],
            color: '#ff0000',
            position: [0, 0.5, 0],
            rotation: [0, 0, 0]
        })
    })

    it('an unwired Merge carries nothing, visibly', () => {
        const merge = createNode('shape.merge')
        expect(evaluateNodeOutput(merge, 'out', ctxOf([merge]))).toBeUndefined()
    })
})

describe('what a Constructor wears', () => {
    const buildSnowman = () => {
        const box = createNode('geom.constructor', { label: 'Snowman' })
        const head = createNode('geom.sphere', {
            parentId: box.id, values: { radius: 0.3, color: '#ffffff', position: [0, 1.2, 0] }
        })
        const body = createNode('geom.sphere', {
            parentId: box.id, values: { radius: 0.5, color: '#eeeeff', position: [0, 0.5, 0] }
        })
        const merge = createNode('shape.merge', { parentId: box.id })
        const door = createNode('port.out', { parentId: box.id, values: { label: 'Shape' } })
        const nodes = [box, head, body, merge, door]
        const edges = [
            createEdge(head.id, 'geometry', merge.id, 'a'),
            createEdge(body.id, 'geometry', merge.id, 'b'),
            createEdge(merge.id, 'out', door.id, 'value')
        ]
        return { box, head, merge, door, nodes, edges }
    }

    it('wears what its doors carry — the whole chain, no mocks', () => {
        const { box, nodes, edges } = buildSnowman()
        const worn = wearConstructorGeometry(box, nodes, ctxOf(nodes, edges))
        expect(worn.kind).toBe('group')
        expect(worn.children.map((child) => child.radius)).toEqual([0.3, 0.5])
    })

    it('wears nothing while a door is unwired — a door means exactly this, nothing else', () => {
        const { box, nodes } = buildSnowman()
        // Same nodes, NO edges: the door exists and carries undefined, and its
        // presence SUPPRESSES the automatic path below.
        expect(wearConstructorGeometry(box, nodes, ctxOf(nodes))).toBeNull()
        const bare = createNode('geom.constructor')
        expect(wearConstructorGeometry(bare, [bare], ctxOf([bare]))).toBeNull()
    })

    // The TouchDesigner flag model: with no doors at all, everything spatial
    // inside contributes — no Merge, no wiring, place a part and the
    // constructor wears it. The audit measured the wall this removes: a
    // two-part build took sixteen actions, all blind.
    it('wears its spatial children automatically when it has no doors', () => {
        const box = createNode('geom.constructor')
        const head = createNode('geom.sphere', { parentId: box.id, values: { radius: 0.3, position: [0, 1.2, 0] } })
        const body = createNode('geom.sphere', { parentId: box.id, values: { radius: 0.5, position: [0, 0.5, 0] } })
        // Non-spatial residents do not become geometry by standing there.
        const colour = createNode('value.color', { parentId: box.id })
        const nodes = [box, head, body, colour]
        const worn = wearConstructorGeometry(box, nodes, ctxOf(nodes))
        expect(worn.kind).toBe('group')
        expect(worn.children.map((child) => child.radius).sort()).toEqual([0.3, 0.5])
    })

    it('refuses a door carrying something that is not a shape', () => {
        const box = createNode('geom.constructor')
        const number = createNode('value.number', { parentId: box.id, values: { value: 7 } })
        const door = createNode('port.out', { parentId: box.id })
        const nodes = [box, number, door]
        const edges = [createEdge(number.id, 'out', door.id, 'value')]
        expect(wearConstructorGeometry(box, nodes, ctxOf(nodes, edges))).toBeNull()
    })

    // The doors live in a different scope from the constructor's card — the
    // same trap getNodeInputs documents, asserted here from the other side.
    it('finds no doors when handed the scoped list instead of the document', () => {
        const { box, nodes, edges } = buildSnowman()
        expect(wearConstructorGeometry(box, [box], ctxOf(nodes, edges))).toBeNull()
    })

    // Two constructors feeding each other. The stack guard used to cut the
    // loop wherever the FIRST evaluation walked in, so the viewport and the
    // sheet — separate contexts, different ask orders — showed two different
    // shapes for the same document at the same instant (proved by execution
    // in review). Now the whole loop is poisoned: every member answers
    // nothing, in every ask order, on every surface. Watched red against the
    // entry-point-only guard: A-first wore group(2), B-first wore nothing.
    it('a feedback loop wears nothing, in every ask order', () => {
        const build = () => {
            const a = createNode('geom.constructor', { label: 'A' })
            const aCube = createNode('geom.cube', { parentId: a.id })
            const aIn = createNode('port.in', { parentId: a.id })
            const aMerge = createNode('shape.merge', { parentId: a.id })
            const aDoor = createNode('port.out', { parentId: a.id })
            const b = createNode('geom.constructor', { label: 'B' })
            const bSphere = createNode('geom.sphere', { parentId: b.id })
            const bIn = createNode('port.in', { parentId: b.id })
            const bMerge = createNode('shape.merge', { parentId: b.id })
            const bDoor = createNode('port.out', { parentId: b.id })
            const nodes = [a, aCube, aIn, aMerge, aDoor, b, bSphere, bIn, bMerge, bDoor]
            const edges = [
                createEdge(aCube.id, 'geometry', aMerge.id, 'a'),
                createEdge(aIn.id, 'value', aMerge.id, 'b'),
                createEdge(aMerge.id, 'out', aDoor.id, 'value'),
                createEdge(bSphere.id, 'geometry', bMerge.id, 'a'),
                createEdge(bIn.id, 'value', bMerge.id, 'b'),
                createEdge(bMerge.id, 'out', bDoor.id, 'value'),
                createEdge(a.id, aDoor.id, b.id, bIn.id),
                createEdge(b.id, bDoor.id, a.id, aIn.id)
            ]
            return { a, b, nodes, edges }
        }
        const first = build()
        const ctxA = ctxOf(first.nodes, first.edges)
        expect(wearConstructorGeometry(first.a, first.nodes, ctxA)).toBeNull()
        expect(wearConstructorGeometry(first.b, first.nodes, ctxA)).toBeNull()
        const second = build()
        const ctxB = ctxOf(second.nodes, second.edges)
        expect(wearConstructorGeometry(second.b, second.nodes, ctxB)).toBeNull()
        expect(wearConstructorGeometry(second.a, second.nodes, ctxB)).toBeNull()
    })

    it('a constructor inside a constructor nests as a group', () => {
        const outer = createNode('geom.constructor', { label: 'Outer' })
        const inner = createNode('geom.constructor', { label: 'Inner', parentId: outer.id })
        const cube = createNode('geom.cube', { parentId: inner.id })
        const innerDoor = createNode('port.out', { parentId: inner.id })
        const outerDoor = createNode('port.out', { parentId: outer.id })
        const nodes = [outer, inner, cube, innerDoor, outerDoor]
        const edges = [
            createEdge(cube.id, 'geometry', innerDoor.id, 'value'),
            // The inner constructor's socket id IS its door's id — wire that
            // socket onward to the outer door.
            createEdge(inner.id, innerDoor.id, outerDoor.id, 'value')
        ]
        const context = ctxOf(nodes, edges)
        const worn = wearConstructorGeometry(outer, nodes, context)
        expect(worn?.kind).toBe('box')
    })
})
