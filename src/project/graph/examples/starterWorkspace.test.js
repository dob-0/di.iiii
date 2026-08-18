import { describe, expect, it } from 'vitest'
import { getNodeType, isNodeTypeImplemented } from '../../nodeRegistry.js'
import { STUDIO_TYPE_ID } from '../studioNode.js'
import {
    STARTER_SKY_COLOR,
    buildStarterWorkspaceDocument
} from './starterWorkspace.js'

const build = (overrides = {}) => buildStarterWorkspaceDocument({
    workspaceTop: 168,
    viewportWidth: 1280,
    viewportHeight: 800,
    ...overrides
})

describe('starter workspace', () => {
    it('every node is a registered, implemented type', () => {
        const { nodes } = build()
        expect(nodes.length).toBeGreaterThan(0)
        for (const node of nodes) {
            expect(getNodeType(node.typeId), node.typeId).toBeTruthy()
            expect(isNodeTypeImplemented(node.typeId), node.typeId).toBe(true)
        }
    })

    it('sets the desk: visible World and welcome windows, hidden studio interior', () => {
        const { nodes } = build()
        const world = nodes.find((n) => n.typeId === 'universe.world')
        const text = nodes.find((n) => n.typeId === 'view.text')
        const studio = nodes.find((n) => n.typeId === STUDIO_TYPE_ID)
        expect(world?.values?.frame?.visible).toBe(true)
        expect(text?.values?.frame?.visible).toBe(true)
        expect(studio).toBeTruthy()
        const interior = nodes.filter((n) => n.parentId === studio.id)
        expect(interior.length).toBeGreaterThan(0)
        for (const node of interior) {
            if (node.values?.frame) expect(node.values.frame.visible).toBe(false)
        }
    })

    it('wires Sky into the World background through real ports', () => {
        const { nodes, edges } = build()
        const sky = nodes.find((n) => n.typeId === 'value.color')
        const world = nodes.find((n) => n.typeId === 'universe.world')
        expect(sky?.values?.value).toBe(STARTER_SKY_COLOR)
        // The wire must be causal: the seeded color deliberately differs from
        // the World default, or the demo edge would prove nothing.
        expect(STARTER_SKY_COLOR).not.toBe(getNodeType('universe.world').defaultValues.bgColor)
        const edge = edges.find((e) => e.fromNodeId === sky.id && e.toNodeId === world.id)
        expect(edge).toBeTruthy()
        expect(edge.fromPort).toBe('out')
        expect(edge.toPort).toBe('bgColor')
        const outPorts = getNodeType('value.color').outputs.map((p) => p.id)
        const inPorts = getNodeType('universe.world').inputs.map((p) => p.id)
        expect(outPorts).toContain(edge.fromPort)
        expect(inPorts).toContain(edge.toPort)
    })

    it('keeps both windows inside a phone viewport', () => {
        const vw = 390
        const vh = 844
        const { nodes } = build({ viewportWidth: vw, viewportHeight: vh })
        for (const node of nodes) {
            const frame = node.values?.frame
            if (!frame?.visible) continue
            expect(frame.x).toBeGreaterThanOrEqual(0)
            expect(frame.x + frame.width).toBeLessThanOrEqual(vw)
            expect(frame.y + frame.height).toBeLessThanOrEqual(vh)
        }
    })
})
