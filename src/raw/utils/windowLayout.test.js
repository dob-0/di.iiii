import { describe, expect, it } from 'vitest'
import {
    clampWindowFrame,
    getWorkspaceTopInset,
    selectMountedPanelNodes
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

    it('allows view windows to overflow above the top inset while still clamping the right and bottom edges', () => {
        expect(clampWindowFrame({
            x: 24,
            y: -140,
            width: 360,
            height: 240
        }, {
            minTop: 180,
            allowOverflowTop: true,
            viewportWidth: 1024,
            viewportHeight: 768
        })).toEqual(expect.objectContaining({
            x: 24,
            y: -140,
            width: 360,
            height: 240
        }))
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
