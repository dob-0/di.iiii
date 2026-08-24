import { describe, expect, it } from 'vitest'
import {
    clampWindowFrame,
    getGraphEdgeInsets,
    getWorkspaceTopInset,
    selectMountedPanelNodes,
    getAnatomyDefaultFrame,
    getScopeMarkerTop,
    RAW_SCOPE_MARKER_HEIGHT,
    RAW_WINDOW_BOTTOM_RESERVE,
    RAW_WINDOW_PADDING
} from './windowLayout.js'

describe('selectMountedPanelNodes', () => {
    const isPanel = (node) => node.panel === true
    const world = (id, parentId) => ({ id, parentId, panel: true })
    const deepChain = Array.from({ length: 24 }, (_, i) => world(`w${i}`, i === 0 ? null : `w${i - 1}`))

    it('mounts only panels whose parent is the current scope', () => {
        expect(selectMountedPanelNodes({ nodes: deepChain, isPanel, currentScopeId: null })
            .map((node) => node.id)).toEqual(['w0'])
        expect(selectMountedPanelNodes({ nodes: deepChain, isPanel, currentScopeId: 'w7' })
            .map((node) => node.id)).toEqual(['w8'])
    })

    it('never mounts a whole nested chain at once — the WebGL context cap is ~16', () => {
        const mounted = selectMountedPanelNodes({ nodes: deepChain, isPanel, currentScopeId: null })
        expect(mounted.length).toBeLessThan(16)
    })

    it('mounts nothing behind a fullscreen world', () => {
        expect(selectMountedPanelNodes({
            nodes: deepChain,
            isPanel,
            currentScopeId: null,
            isWorldFullscreen: true
        })).toEqual([])
    })

    it('skips non-panel nodes and explicitly hidden frames', () => {
        const nodes = [
            { id: 'a', parentId: null, panel: true },
            { id: 'b', parentId: null, panel: false },
            { id: 'c', parentId: null, panel: true, values: { frame: { visible: false } } },
            { id: 'd', parentId: null, panel: true, values: { frame: { visible: true } } }
        ]
        expect(selectMountedPanelNodes({ nodes, isPanel, currentScopeId: null })
            .map((node) => node.id)).toEqual(['a', 'd'])
    })

    it('treats undefined parentId and null scope as the same root', () => {
        const nodes = [{ id: 'root-child', panel: true }]
        expect(selectMountedPanelNodes({ nodes, isPanel, currentScopeId: undefined })
            .map((node) => node.id)).toEqual(['root-child'])
    })
})

describe('windowLayout', () => {
    it('computes a workspace inset from the topbar bottom edge', () => {
        expect(getWorkspaceTopInset({
            topbarRect: {
                bottom: 132
            }
        })).toBe(140)

        expect(getWorkspaceTopInset({
            topbarRect: {
                bottom: 210
            }
        })).toBe(218)
    })

    it('clamps windows below the workspace chrome and inside the viewport', () => {
        expect(clampWindowFrame({
            x: 2,
            y: 20,
            width: 360,
            height: 240
        }, {
            minTop: 180,
            viewportWidth: 1024,
            viewportHeight: 768
        })).toEqual(expect.objectContaining({
            x: 12,
            y: 180,
            width: 360,
            height: 240
        }))
    })

    it('places a minimized window by the bar it actually is, not by the height it would open to', () => {
        // The reported shape: a collapsed bar authored low on the surface, whose
        // stored height is a full panel. Clamped by the stored height it was
        // dragged hundreds of pixels up, onto the cards. 810 - 56 - 132 = 622,
        // so y: 640 lands at 622 rather than at 810 - 430 - 132 = 248.
        expect(clampWindowFrame({
            x: 24,
            y: 640,
            width: 300,
            height: 430,
            minimized: true
        }, {
            allowOverflowLeft: true,
            allowOverflowTop: true,
            viewportWidth: 1440,
            viewportHeight: 810
        })).toEqual(expect.objectContaining({
            y: 622,
            // the authored height survives, so expanding restores the real panel
            height: 430
        }))
    })

    it('still clamps an OPEN window by its full height', () => {
        expect(clampWindowFrame({
            x: 24,
            y: 640,
            width: 300,
            height: 430
        }, {
            allowOverflowLeft: true,
            allowOverflowTop: true,
            viewportWidth: 1440,
            viewportHeight: 810
        })).toEqual(expect.objectContaining({ y: 248, height: 430 }))
    })

    it('allows view windows to overflow left while still clamping top and right edges', () => {
        expect(clampWindowFrame({
            x: -120,
            y: 20,
            width: 360,
            height: 240
        }, {
            minTop: 180,
            allowOverflowLeft: true,
            viewportWidth: 1024,
            viewportHeight: 768
        })).toEqual(expect.objectContaining({
            x: -120,
            y: 180,
            width: 360,
            height: 240
        }))
    })

    it('allows overflow above the top INSET but never above the viewport — the header must stay reachable', () => {
        // above the topbar inset (minTop) is allowed…
        expect(clampWindowFrame({
            x: 24, y: 40, width: 360, height: 240
        }, {
            minTop: 180, allowOverflowTop: true, viewportWidth: 1024, viewportHeight: 768
        })).toEqual(expect.objectContaining({ x: 24, y: 40 }))
        // …above the viewport top is not: a header at y<0 is unreachable and
        // the frame persists, so one stray swipe would lose the window forever
        expect(clampWindowFrame({
            x: 24, y: -140, width: 360, height: 240
        }, {
            minTop: 180, allowOverflowTop: true, viewportWidth: 1024, viewportHeight: 768
        })).toEqual(expect.objectContaining({ x: 24, y: 0 }))
    })

    it('keeps at least 72px of an overflow-left window inside the viewport', () => {
        expect(clampWindowFrame({
            x: -5000, y: 200, width: 360, height: 240
        }, {
            minTop: 64, allowOverflowLeft: true, viewportWidth: 390, viewportHeight: 844
        }).x).toBe(-(360 - 72))
    })

    it('shrinks a desktop-sized default (e.g. universe.world 680x480) to fit a phone viewport', () => {
        const result = clampWindowFrame({
            x: 96,
            y: 60,
            width: 680,
            height: 480
        }, {
            minTop: 64,
            viewportWidth: 390,
            viewportHeight: 844
        })
        expect(result.width).toBeLessThanOrEqual(390)
        expect(result.height).toBeLessThanOrEqual(844 - 64)
        expect(result.x + result.width).toBeLessThanOrEqual(390)
        expect(result.y + result.height).toBeLessThanOrEqual(844)
    })

    it('never shrinks a window below its usable minimum, even on a very small viewport', () => {
        const result = clampWindowFrame({
            x: 0,
            y: 0,
            width: 680,
            height: 480
        }, {
            minTop: 64,
            viewportWidth: 280,
            viewportHeight: 500
        })
        expect(result.width).toBeGreaterThanOrEqual(260)
        expect(result.height).toBeGreaterThanOrEqual(180)
    })

    it('never lands a window flush against the bottom-right corner — the delete FAB and zoom controls live there', () => {
        // Chat's default frame ({ x: 24, y: 432, width: 280, height: 360 }) on an
        // iPhone SE viewport (320x568): before the bottom reserve existed, this
        // clamped flush to the true bottom edge, landing directly under
        // raw-delete-fab (fixed, z-index 1300 — above any window) whenever a
        // node was selected, covering the chat input for both display and clicks.
        const result = clampWindowFrame({
            x: 24,
            y: 432,
            width: 280,
            height: 360
        }, {
            minTop: 64,
            viewportWidth: 320,
            viewportHeight: 568
        })
        expect(result.y + result.height).toBeLessThanOrEqual(568 - RAW_WINDOW_BOTTOM_RESERVE)
    })

    it('leaves a window that already fits the viewport untouched', () => {
        expect(clampWindowFrame({
            x: 96,
            y: 60,
            width: 320,
            height: 240
        }, {
            minTop: 64,
            viewportWidth: 1440,
            viewportHeight: 900
        })).toEqual(expect.objectContaining({
            width: 320,
            height: 240
        }))
    })
})

// getGraphEdgeInsets: reported 2026-08-18 — a visitor at ~1050px could not
// wire anything to a seeded World node because its window sat on top of the
// card column, burying every port dot on it. The surface's auto-fit centres
// the card cluster on its own box, which knows nothing about the windows
// floating over it, so a corridor that is technically wide enough still
// buries the cards if it is not centred. This function turns docked window
// frames into edge insets so the fit can dodge them.
describe('getGraphEdgeInsets', () => {
    const rect = { left: 0, top: 0, width: 1440, height: 900 }

    it('returns no insets with no windows', () => {
        expect(getGraphEdgeInsets({ frames: [], surfaceRect: rect })).toEqual({
            left: 0, right: 0, top: 0, bottom: 0
        })
    })

    it('charges a window to the edge it hugs, by nearest distance', () => {
        // Docked hard against the right edge.
        const right = getGraphEdgeInsets({ frames: [{ x: 1000, y: 100, width: 440, height: 300 }], surfaceRect: rect })
        expect(right).toEqual({ left: 0, right: 440, top: 0, bottom: 0 })

        // Docked hard against the left edge.
        const left = getGraphEdgeInsets({ frames: [{ x: 0, y: 400, width: 340, height: 380 }], surfaceRect: rect })
        expect(left).toEqual({ left: 340, right: 0, top: 0, bottom: 0 })
    })

    it('charges a full-width window to top or bottom, never left/right', () => {
        const topBand = getGraphEdgeInsets({ frames: [{ x: 12, y: 88, width: 1400, height: 200 }], surfaceRect: rect })
        expect(topBand).toEqual({ left: 0, right: 0, top: 288, bottom: 0 })

        const bottomBand = getGraphEdgeInsets({ frames: [{ x: 12, y: 600, width: 1400, height: 280 }], surfaceRect: rect })
        expect(bottomBand).toEqual({ left: 0, right: 0, top: 0, bottom: 300 })
    })

    it('ignores a window floating away from every edge — nothing to dodge', () => {
        const floating = getGraphEdgeInsets({ frames: [{ x: 600, y: 400, width: 200, height: 150 }], surfaceRect: rect })
        expect(floating).toEqual({ left: 0, right: 0, top: 0, bottom: 0 })
    })

    it('the historical bug, numerically: a ~1050px viewport with World docked right and welcome docked left', () => {
        // The exact shapes that reproduced the report: world 441x309 at the
        // right edge, welcome 282x382 at the left, on a 1050x950 surface.
        const insets = getGraphEdgeInsets({
            frames: [
                { x: 1050 - 441 - 24, y: 96, width: 441, height: 309 },
                { x: 24, y: 438, width: 282, height: 382 }
            ],
            surfaceRect: { left: 0, top: 0, width: 1050, height: 950 }
        })
        expect(insets.right).toBe(441 + 24)
        expect(insets.left).toBe(282 + 24)
        // The fix is NOT forcing this corridor to be centred — it is telling
        // the fit exactly where the true (here, off-centre) corridor is, so it
        // can centre ON THAT instead of on the viewport. Confirm it is really
        // off-centre, which is what made the old viewport-centred fit bury the
        // cards under the World window in the first place.
        const corridorWidth = 1050 - insets.left - insets.right
        const corridorCenter = insets.left + corridorWidth / 2
        expect(corridorCenter).not.toBeCloseTo(525, 0)
        expect(corridorCenter).toBeCloseTo(445.5, 1)
    })

    it('MUST NOT scale a real inset down to fit a cap — that reports free space that does not exist', () => {
        // Two full-width windows genuinely eating 740 of 950px (the phone
        // regression found while fixing the desktop bug): a scaled-down
        // report understates a window's true footprint, and the fit still
        // lands cards inside it.
        const insets = getGraphEdgeInsets({
            frames: [
                { x: 12, y: 88, width: 776, height: 220 },
                { x: 12, y: 518, width: 776, height: 300 }
            ],
            surfaceRect: { left: 0, top: 0, width: 800, height: 950 }
        })
        expect(insets.top).toBe(308) // 88 + 220, exactly — never rounded down
        expect(insets.bottom).toBe(432) // 950 - 518, exactly
    })

    it('gives up on an axis only when no honest corridor is left at all, not merely a thin one', () => {
        // A thin-but-positive band must still be reported — fitGraph's own
        // FIT_MIN_USEFUL_ZOOM fallback exists to make a small band usable,
        // and giving up here just recreates the overlap this function exists
        // to prevent.
        const thin = getGraphEdgeInsets({
            frames: [
                { x: 0, y: 0, width: 390, height: 300 },
                { x: 0, y: 540, width: 390, height: 304 }
            ],
            surfaceRect: { left: 0, top: 0, width: 390, height: 844 }
        })
        expect(thin.top).toBeGreaterThan(0)
        expect(thin.bottom).toBeGreaterThan(0)

        // But truly no room (windows overlapping or touching) gives up rather
        // than reporting an inset that would leave zero or negative space.
        const none = getGraphEdgeInsets({
            frames: [
                { x: 0, y: 0, width: 390, height: 430 },
                { x: 0, y: 420, width: 390, height: 424 }
            ],
            surfaceRect: { left: 0, top: 0, width: 390, height: 844 }
        })
        expect(none).toEqual({ left: 0, right: 0, top: 0, bottom: 0 })
    })
})

describe('getAnatomyDefaultFrame', () => {
    // LEFT, not right. Entering a node selects it, so the selection inspector
    // is up whenever this sheet opens, and on a desktop the inspector is docked
    // right at `min(320px, …)` + 24px. Measured at 1440x900: a right-docked
    // sheet opened underneath it. The assertion is the clearance, not the
    // number, so it survives the sheet changing width.
    it('opens clear of the selection inspector on a desktop', () => {
        const frame = getAnatomyDefaultFrame({ viewportWidth: 1440, viewportHeight: 900, workspaceTop: 64 })
        expect(frame).toMatchObject({ width: 400, height: 620, minimized: false })
        const inspectorLeft = 1440 - Math.min(320, 1440 - 48) - 24
        expect(frame.x + frame.width).toBeLessThanOrEqual(inspectorLeft)
    })

    // The marker is z-index 1400 and the window is 20, so level is not a near
    // miss — it is the marker printed over the window's own title. Seen at
    // 1440x900 with the toolbar up.
    it('opens below the "inside X" marker, never level with it', () => {
        for (const chromeVisible of [true, false]) {
            const frame = getAnatomyDefaultFrame({ viewportWidth: 1440, viewportHeight: 900, workspaceTop: 57, chromeVisible })
            const markerTop = getScopeMarkerTop({ chromeVisible, workspaceTop: 57 })
            expect(frame.y, `chrome ${chromeVisible}`).toBeGreaterThanOrEqual(markerTop + RAW_SCOPE_MARKER_HEIGHT)
        }
    })

    it('shrinks rather than running off a short desktop', () => {
        const frame = getAnatomyDefaultFrame({ viewportWidth: 1024, viewportHeight: 600, workspaceTop: 64 })
        expect(frame.y + frame.height).toBeLessThanOrEqual(600 - RAW_WINDOW_BOTTOM_RESERVE)
    })

    // The phone rule, as numbers. The selection sheet docks to the bottom edge
    // at 38dvh whenever a node is selected; a second sheet opening into that
    // band would put two of them in one place. Asserted at 664 — the height a
    // real iPhone 13 hands the page once browser chrome is taken — because the
    // starter layout was got wrong twice by checking the arithmetic at 844.
    it('stays clear of the selection sheet on a phone', () => {
        for (const viewportHeight of [844, 664, 568]) {
            const frame = getAnatomyDefaultFrame({ viewportWidth: 390, viewportHeight, workspaceTop: 57 })
            // Minus the window's own edges: it renders ~3px taller than the
            // height it is given, which was enough to land inside the sheet.
            const sheetTop = viewportHeight - Math.ceil(viewportHeight * 0.38)
            expect(frame.y + frame.height + 4, `${viewportHeight}px tall`).toBeLessThanOrEqual(sheetTop)
            expect(frame.x).toBe(RAW_WINDOW_PADDING)
            expect(frame.width).toBe(390 - RAW_WINDOW_PADDING * 2)
        }
    })

    it('opens as a header when there is no band left to open into', () => {
        expect(getAnatomyDefaultFrame({ viewportWidth: 390, viewportHeight: 664, workspaceTop: 57 }).minimized)
            .toBe(false)
        // A landscape phone, or a tall toolbar: the band falls under the floor
        // and a header you can tap beats one heading and a scrollbar.
        expect(getAnatomyDefaultFrame({ viewportWidth: 390, viewportHeight: 420, workspaceTop: 57 }).minimized)
            .toBe(true)
        expect(getAnatomyDefaultFrame({ viewportWidth: 390, viewportHeight: 664, workspaceTop: 300 }).minimized)
            .toBe(true)
    })
})
