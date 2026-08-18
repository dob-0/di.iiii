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

    // The bug this guards, found by looking at a 390×844 phone at DPR 3: both
    // seeded windows stacked from the top and between them covered the whole
    // screen, so every graph card sat behind them — including the Studio card
    // that the welcome text tells the visitor to enter. The graph surface
    // centres the card cluster vertically, so a clear band down the MIDDLE is
    // the only thing that makes the cards reachable.
    it('leaves a clear band across the middle of a phone, where the cards are centred', () => {
        const vw = 390
        const vh = 844
        const { nodes } = build({ viewportWidth: vw, viewportHeight: vh })
        const windows = nodes
            .map((node) => node.values?.frame)
            .filter((frame) => frame?.visible)
        expect(windows.length).toBeGreaterThan(1)

        // The band the surface centres cards into: a generous middle third.
        const bandTop = vh * 0.36
        const bandBottom = vh * 0.64
        for (const frame of windows) {
            const covers = frame.y < bandBottom && frame.y + frame.height > bandTop
            expect(covers, `window at y=${frame.y} h=${frame.height} covers the card band`).toBe(false)
        }
        // …and the band is worth having: two cards' worth of room.
        expect(bandBottom - bandTop).toBeGreaterThan(180)
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
