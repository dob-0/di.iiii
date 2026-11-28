import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render } from '@testing-library/react'
import MapStage from './MapStage.jsx'
import { presetScreens, screenPresets } from './wallScreens.js'
import { normalizeMappingState } from '../shared/projectSchema.js'

const output = { width: 3200, height: 1440 }
const row5 = screenPresets.find((preset) => preset.id === 'row5')

// The shared iframe layer is for what the mesh cannot draw — a web link — so
// these use one; v2 is a colour, which the mesh draws (see the last suite).
const PAGE = { kind: 'url', ref: 'https://example.com/visual' }
const buildMapping = ({ patchScreen = {}, playing = 'v1', fade = 0, visual = PAGE } = {}) => {
    const screens = presetScreens(row5, output).map((screen, index) => ({
        id: `screen-${index + 1}`,
        enabled: true,
        ...screen,
        ...(patchScreen[index + 1] || {})
    }))
    return normalizeMappingState({
        output,
        fade,
        surfaces: screens,
        visuals: [{ id: 'v1', name: 'Visual', source: visual }, { id: 'v2', name: 'Red', source: { kind: 'colour', ref: '#ff0000' } }],
        playing
    })
}

const subpaths = (element) => (element.style.clipPath.match(/M/g) || []).length
const stage = (mapping) => <MapStage mapping={mapping} width={1600} height={720} />

beforeEach(() => { vi.useFakeTimers() })
afterEach(() => { vi.useRealTimers() })

describe('MapStage with wall screens', () => {
    it('draws five unwarped screens through ONE shared element', () => {
        const { container } = render(stage(buildMapping()))
        const shared = container.querySelectorAll('[data-surface-id="wall"]')
        expect(shared).toHaveLength(1)
        expect(subpaths(shared[0])).toBe(5)
        expect(container.querySelectorAll('.map-stage-surface')).toHaveLength(1)
        for (let n = 1; n <= 5; n += 1) expect(container.querySelector(`[data-surface-id="screen-${n}"]`)).toBeNull()
    })

    it('gives a warped screen its own element and leaves the other four shared', () => {
        const base = buildMapping()
        const warped = base.surfaces[2].corners.map((corner, index) => (index === 0 ? [corner[0] + 0.01, corner[1]] : corner))
        const { container } = render(stage(buildMapping({ patchScreen: { 3: { corners: warped } } })))
        const shared = container.querySelectorAll('[data-surface-id="wall"]')
        expect(shared).toHaveLength(1)
        expect(subpaths(shared[0])).toBe(4)
        expect(container.querySelectorAll('[data-surface-id="screen-3"]')).toHaveLength(1)
        expect(container.querySelector('[data-surface-id="screen-3"] .map-wall-picture')).toBeTruthy()
    })

    it('renders a visual-kind screen on its own', () => {
        const { container } = render(stage(buildMapping({ patchScreen: { 3: { source: { kind: 'visual', ref: 'v2' } } } })))
        const shared = container.querySelectorAll('[data-surface-id="wall"]')
        expect(subpaths(shared[0])).toBe(4)
        const own = container.querySelector('[data-surface-id="screen-3"]')
        expect(own).toBeTruthy()
        // A colour is drawn by the mesh, on its own.
        expect(own.className).toContain('map-stage-mesh')
        expect(own.querySelector('.map-wall-picture')).toBeNull()
    })

    it('leaves no layers in the shared element once nothing is playing and the fade has passed', () => {
        const { container, rerender } = render(stage(buildMapping()))
        expect(container.querySelectorAll('.map-crossfade-layer').length).toBeGreaterThan(0)
        rerender(stage(buildMapping({ playing: '' })))
        act(() => { vi.advanceTimersByTime(200) })
        const shared = container.querySelector('[data-surface-id="wall"]')
        expect(shared).toBeTruthy()
        expect(shared.querySelectorAll('.map-crossfade-layer')).toHaveLength(0)
    })

    it('leaves a disabled screen out of the clip path', () => {
        const { container } = render(stage(buildMapping({ patchScreen: { 2: { enabled: false } } })))
        expect(subpaths(container.querySelector('[data-surface-id="wall"]'))).toBe(4)
    })

    // 2026-10-25: "when I'm changing points the image is disappearing". A
    // source the mesh can draw goes through the mesh on EVERY screen, bent or
    // not, so moving a point never swaps — and so never restarts — the drawing.
    describe('a visual the mesh can draw', () => {
        const RED = { kind: 'colour', ref: '#ff0000' }

        it('draws every screen through the mesh, with no shared iframe layer', () => {
            const { container } = render(stage(buildMapping({ visual: RED })))
            expect(container.querySelectorAll('.map-stage-mesh')).toHaveLength(5)
            expect(container.querySelector('[data-surface-id="wall"]')).toBeNull()
        })

        it('keeps the very same elements when a warp point moves', () => {
            const flat = buildMapping({ visual: RED })
            const { container, rerender } = render(stage(flat))
            const before = [...container.querySelectorAll('.map-stage-mesh')]
            const bent = buildMapping({
                visual: RED,
                patchScreen: { 2: { warp: { mode: 'linear', divisionsX: 1, divisionsY: 0, points: [[0, 0], [0.5, 0.2], [1, 0], [0, 1], [0.5, 1], [1, 1]] } } }
            })
            rerender(stage(bent))
            const after = [...container.querySelectorAll('.map-stage-mesh')]
            expect(after).toHaveLength(5)
            after.forEach((node, index) => expect(node).toBe(before[index]))
        })
    })
})
