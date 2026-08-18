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

    // Two bugs in one day taught this contract, both found by looking at a
    // 390×844 phone at DPR 3 and neither catchable by any other test:
    //   1. windows stacked from the top covered the whole screen, so the cards —
    //      including the Studio one the welcome text says to tap — sat behind
    //      them;
    //   2. the fix for that, docking one window to each edge, left the
    //      inset-aware fit a pinched corridor and it zoomed the graph to 34%,
    //      below the zoom at which the enter chevron renders at all. Untappable
    //      again, by the opposite route.
    // What the fit actually needs is ONE contiguous band, wide open, at one end.
    it('leaves one contiguous band on a phone, not a pinched corridor', () => {
        const vw = 390
        const vh = 844
        const { nodes } = build({ viewportWidth: vw, viewportHeight: vh })
        const windows = nodes
            .map((node) => node.values?.frame)
            .filter((frame) => frame?.visible)
        expect(windows.length).toBeGreaterThan(1)

        const lowest = Math.max(...windows.map((frame) => frame.y + frame.height))
        const band = vh - lowest
        // Room for a couple of cards at a zoom where their controls still
        // render — a band that only fits the cluster at 34% is not a band.
        expect(band, `only ${Math.round(band)}px left below the windows`).toBeGreaterThan(vh * 0.28)

        // Every window must read as TOP-docked to getGraphEdgeInsets, which
        // files a full-width window under whichever edge it sits nearer:
        // distance-to-top (y) against distance-to-bottom (vh - y - h). A window
        // that comes out nearer the bottom is filed there, the two insets then
        // claim more than the whole surface, the fit discards them, and the
        // cards land back on top of the windows. That is the same 2y + h ≤ vh
        // the seed derives its phone height from.
        for (const frame of windows) {
            expect(
                frame.y * 2 + frame.height,
                `window at y=${frame.y} h=${frame.height} is nearer the bottom edge and will be filed as bottom-docked`
            ).toBeLessThanOrEqual(vh)
        }
    })

    // Same contract on a small phone, where the room and the note have to give
    // up height rather than push each other past the halfway line.
    it('keeps both windows top-docked on a 375x667 phone too', () => {
        const vh = 667
        const { nodes } = build({ viewportWidth: 375, viewportHeight: vh })
        const windows = nodes.map((node) => node.values?.frame).filter((frame) => frame?.visible)
        expect(windows.length).toBeGreaterThan(1)
        for (const frame of windows) {
            expect(frame.y * 2 + frame.height, `window at y=${frame.y} h=${frame.height}`).toBeLessThanOrEqual(vh)
        }
    })

    // The band guarantee above is checked at 844px tall. A real iPhone 13 hands
    // the page 664 once browser chrome is taken, and the 2y+h invariant still
    // HOLDS at 664 — it is necessary and not sufficient. Measured on three
    // devices with both windows open: iPhone 13 (664, 250px band) and iPhone SE
    // (568, 198px) left three of four cards unreachable behind the welcome
    // window, including the Studio card its own text says to tap, while Pixel 7
    // (839, 314px) and a 390x844 phone (318px) were fine. What separates them is
    // absolute pixels, not a fraction: a card's height does not scale with the
    // phone. Below CARD_BAND_MIN the note opens as a header only.
    it('leaves a real band of pixels below the open windows on every phone', () => {
        for (const [vw, vh] of [[320, 568], [375, 667], [390, 664], [390, 844], [412, 839]]) {
            const { nodes } = build({ viewportWidth: vw, viewportHeight: vh })
            const open = nodes
                .map((node) => node.values?.frame)
                .filter((frame) => frame?.visible && frame.minimized !== true)
            const lowest = Math.max(...open.map((frame) => frame.y + frame.height))
            expect(
                vh - lowest,
                `${vw}x${vh}: only ${vh - lowest}px left below the open windows`
            ).toBeGreaterThanOrEqual(300)
        }
    })

    it('folds the note to a header rather than hiding it, when it has to give way', () => {
        const { nodes } = build({ viewportWidth: 390, viewportHeight: 664 })
        const text = nodes.find((n) => n.typeId === 'view.text')
        expect(text.values.frame.minimized).toBe(true)
        // Still a real window with a real header to tap — not gone.
        expect(text.values.frame.visible).toBe(true)
        expect(text.values.frame.height).toBeGreaterThan(0)
    })

    it('leaves the note open wherever there is genuinely room for it', () => {
        for (const [vw, vh] of [[390, 844], [412, 839], [1440, 900]]) {
            const { nodes } = build({ viewportWidth: vw, viewportHeight: vh })
            expect(
                nodes.find((n) => n.typeId === 'view.text').values.frame.minimized,
                `${vw}x${vh} has room and should keep the note open`
            ).toBe(false)
        }
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

    // Reported 2026-08-18: at ~1050px, the World window sat on top of the card
    // column and every port on it was ungrabbable — "there are no in/out
    // connectors". RawGraphSurface centres the card cluster on the VIEWPORT,
    // not on the gap between the two windows, so a corridor merely wide enough
    // was not sufficient; it had to straddle the centre line. This is a plain
    // numeric check against the seed builder's own output, independent of the
    // surface's insets mechanism (covered separately in windowLayout.test.js) —
    // belt and suspenders, because the two could drift apart from each other.
    it('leaves a corridor between the two windows that straddles the centreline, across a range of desktop widths', () => {
        const CARD_LANE_HALF = 101 // half of RawGraphSurface's 200px card + a hair
        let sideBySideWidthsSeen = 0
        for (const vw of [700, 800, 900, 1000, 1050, 1100, 1200, 1280, 1440, 1600, 1920]) {
            const { nodes } = build({ viewportWidth: vw, viewportHeight: 950 })
            const frames = nodes.map((node) => node.values?.frame).filter((frame) => frame?.visible)
            // Below a threshold the seed switches to the stacked (full-width,
            // top/bottom) layout, where the corridor is vertical, not
            // horizontal — this check only applies to the side-by-side regime.
            if (frames.some((frame) => frame.width > vw * 0.9)) continue
            sideBySideWidthsSeen += 1
            const centre = vw / 2
            // Each window sits on whichever side its own centre is on; the
            // corridor is bounded by the innermost edge of each side.
            const leftFrames = frames.filter((frame) => frame.x + frame.width / 2 < centre)
            const rightFrames = frames.filter((frame) => frame.x + frame.width / 2 >= centre)
            const gapLeft = leftFrames.length ? Math.max(...leftFrames.map((frame) => frame.x + frame.width)) : 0
            const gapRight = rightFrames.length ? Math.min(...rightFrames.map((frame) => frame.x)) : vw
            const message = `vw=${vw} gap=[${gapLeft},${gapRight}] centre=${centre}`
            expect(gapRight - gapLeft, message).toBeGreaterThan(CARD_LANE_HALF * 2)
            expect(gapLeft, message).toBeLessThanOrEqual(centre - CARD_LANE_HALF)
            expect(gapRight, message).toBeGreaterThanOrEqual(centre + CARD_LANE_HALF)
        }
        // The gate above must not have swallowed the whole test — this is
        // exactly the case the reported bug lived in (~1050px).
        expect(sideBySideWidthsSeen).toBeGreaterThan(5)
    })
})
