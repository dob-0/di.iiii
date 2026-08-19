import { describe, expect, it } from 'vitest'
import { getNodeType, isNodeTypeImplemented } from '../../nodeRegistry.js'
import { createNodeGraphContext, evaluateNodeInput } from '../nodeGraphRuntime.js'
import { SCENE_EXAMPLE_CUBE_COLOR, buildSceneExample } from './sceneExample.js'

const build = (overrides = {}) => buildSceneExample({ workspaceTop: 160, ...overrides })

describe('scene example', () => {
    it('every node is a real, implemented type', () => {
        const { nodes } = build()
        expect(nodes.length).toBeGreaterThan(0)
        for (const node of nodes) {
            expect(getNodeType(node.typeId), node.typeId).toBeTruthy()
            expect(isNodeTypeImplemented(node.typeId), node.typeId).toBe(true)
        }
    })

    // The three things the owner asked for by name: "cube light or i want
    // upload mine".
    it('contains a room, a light, a shape and a place for your own file', () => {
        const types = build().nodes.map((node) => node.typeId)
        expect(types).toContain('universe.world')
        expect(types).toContain('world.light')
        expect(types).toContain('geom.cube')
        expect(types).toContain('geom.model')
    })

    // The wire has to DO something visible, or it teaches nothing. This is the
    // same rule the starter workspace's Sky wire is held to.
    it('wires the colour into the cube, and it actually arrives', () => {
        const { nodes, edges } = build()
        const cube = nodes.find((node) => node.typeId === 'geom.cube')
        const context = createNodeGraphContext({ nodes, edges })
        expect(evaluateNodeInput(cube, 'color', context)).toBe(SCENE_EXAMPLE_CUBE_COLOR)
        // …and it is causal: the seeded colour differs from the cube's default,
        // so the wire is doing the work rather than agreeing with it.
        expect(SCENE_EXAMPLE_CUBE_COLOR).not.toBe(getNodeType('geom.cube').inputs.find((p) => p.id === 'color').default)
    })

    // A model node with no file renders nothing. That is the state a person
    // meets after placing one, so the example meets it too — beside an
    // instruction rather than alone. Seeding a fake asset id would draw a broken
    // model and teach the opposite.
    it('leaves the model empty on purpose', () => {
        const model = build().nodes.find((node) => node.typeId === 'geom.model')
        expect(model.values.src).toBe('')
    })

    it('opens the room and the note, so the scene is visible the moment it is made', () => {
        const { nodes } = build()
        const world = nodes.find((node) => node.typeId === 'universe.world')
        const note = nodes.find((node) => node.typeId === 'view.text')
        expect(world.values.frame.visible).toBe(true)
        expect(note.values.frame.visible).toBe(true)
    })

    it('says the three moves in words, not in jargon', () => {
        const note = build().nodes.find((node) => node.typeId === 'view.text')
        const text = note.values.content.toLowerCase()
        expect(text).toContain('double-tap')
        expect(text).toContain('drag')
        expect(text).toMatch(/\.glb/)
        // No node-graph vocabulary a theatre director would have to look up.
        expect(text).not.toMatch(/\bschema\b|\bruntime\b|\bop-log\b|\bparentid\b/)
    })

    it('builds into a scope when asked, so it can be made inside a container', () => {
        const { nodes } = build({ parentId: 'box-1' })
        for (const node of nodes) expect(node.parentId).toBe('box-1')
    })

    it('gives every node a distinct place on the canvas', () => {
        const { nodes } = build()
        const seen = new Set(nodes.map((node) => `${node.graphX},${node.graphY}`))
        expect(seen.size).toBe(nodes.length)
    })
})
