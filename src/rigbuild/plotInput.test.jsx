import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPlanWheel } from './planWheel.js'

// The plot's input across devices (docs/ai/audits/2026-10-21-rig-show-pages.md, P1/P2): a touchpad's
// two-finger scroll is a wheel with pixel deltas on BOTH axes and must pan the plan, never zoom it and never
// drop deltaX; a pinch is a wheel with ctrlKey and zooms; a mouse notch zooms to the pointer as before; and a
// person with one pointer or a keyboard can zoom without a wheel or two fingers (WCAG 2.5.1, 2.1.1).
// jsdom: the viewBox the page writes is what is measured. Nothing here was felt on a real touchpad.

vi.mock('../project/hooks/useProjectDocumentSync.js', () => ({ useProjectDocumentSync: () => ({ applyLocalOps: () => {} }) }))
vi.mock('../project/state/projectStore.js', async (importOriginal) => {
    const real = await importOriginal()
    const document = { ...real.createProjectStoreState({}).document, entities: [] }
    return { ...real, useProjectStore: () => ({ state: { ...real.createProjectStoreState({}), document, hasLoaded: true, selectedEntityIds: [] }, dispatch: () => {} }) }
})
vi.mock('../studio/hooks/useRigAutoPatch.js', () => ({ useRigAutoPatch: () => ({ flags: [], message: '', at: 0, patchGroup: () => Promise.resolve({ ok: false }), patchNow: () => Promise.resolve({ ok: false }) }) }))
vi.mock('../map/lightingLink.js', async (importOriginal) => ({ ...(await importOriginal()), probeLightingDesk: () => Promise.resolve(false) }))
vi.mock('./RigSteps.jsx', () => ({ default: () => null }))
vi.mock('../hooks/useLocalInstall.js', () => ({ default: () => ({ isLocal: false }) }))

beforeEach(() => {
    vi.stubGlobal('ResizeObserver', undefined)
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('no network in this test'))))
})

const mountPlot = async () => {
    const { default: PlotSurface } = await import('./PlotSurface.jsx')
    render(<PlotSurface spaceId="s" projectId="p" readOnly />)
    const svg = screen.getByRole('application', { name: /Lighting plot/ })
    const box = () => svg.getAttribute('viewBox').split(' ').map(Number)
    return { svg, box }
}

describe('the plot under a touchpad, a mouse and one pointer', () => {
    it('two-finger scroll pans on both axes at the same scale; pinch zooms in; a mouse notch zooms out', async () => {
        const { svg, box } = await mountPlot()
        const before = box()
        fireEvent.wheel(svg, { deltaX: 14.5, deltaY: 9.25, deltaMode: 0 })
        const scrolled = box()
        expect(scrolled[0]).toBeGreaterThan(before[0]) // deltaX kept: the plan moves right-to-left
        expect(scrolled[1]).toBeGreaterThan(before[1])
        expect(scrolled[2]).toBeCloseTo(before[2], 9) // not a zoom
        fireEvent.wheel(svg, { deltaY: -12, ctrlKey: true, deltaMode: 0 })
        const pinched = box()
        expect(pinched[2]).toBeLessThan(scrolled[2])
        fireEvent.wheel(svg, { deltaY: 100, deltaMode: 0 })
        expect(box()[2]).toBeGreaterThan(pinched[2])
    })

    it('zooms with buttons and with + / - / 0, no wheel and no second finger', async () => {
        const { box } = await mountPlot()
        const start = box()
        fireEvent.click(screen.getByRole('button', { name: 'Zoom in' }))
        const zoomed = box()
        expect(zoomed[2]).toBeLessThan(start[2])
        fireEvent.click(screen.getByRole('button', { name: 'Zoom out' }))
        fireEvent.click(screen.getByRole('button', { name: 'Zoom out' }))
        expect(box()[2]).toBeGreaterThan(start[2])
        fireEvent.click(screen.getByRole('button', { name: 'Fit the plan' }))
        expect(box()[2]).toBeCloseTo(start[2], 6)
        fireEvent.keyDown(window, { key: '+' })
        expect(box()[2]).toBeLessThan(start[2])
        fireEvent.keyDown(window, { key: '0' })
        expect(box()[2]).toBeCloseTo(start[2], 6)
        fireEvent.keyDown(window, { key: '-' })
        expect(box()[2]).toBeGreaterThan(start[2])
    })
})

describe('createPlanWheel — which gesture a wheel event is', () => {
    const wheel = createPlanWheel
    it('a pinch (ctrlKey) zooms, by its deltaY', () => {
        const w = wheel()
        const out = w({ deltaX: 3, deltaY: -10, deltaMode: 0, ctrlKey: true }, 0)
        expect(out.pan).toBeNull()
        expect(out.zoom).toBeGreaterThan(1)
    })
    it('a touchpad scroll with any sideways part pans, both axes, in pixels', () => {
        expect(wheel()({ deltaX: -4, deltaY: 0, deltaMode: 0 }, 0)).toEqual({ zoom: 1, pan: [-4, 0] })
    })
    it('a fractional vertical delta (a touchpad, never a notch) pans', () => {
        expect(wheel()({ deltaX: 0, deltaY: 2.5, deltaMode: 0 }, 0).pan).toEqual([0, 2.5])
    })
    it('a whole-pixel vertical notch, or a line-mode wheel, zooms', () => {
        expect(wheel()({ deltaX: 0, deltaY: 100, deltaMode: 0 }, 0).pan).toBeNull()
        expect(wheel()({ deltaX: 0, deltaY: 3, deltaMode: 1 }, 0).pan).toBeNull()
    })
    it('a gesture keeps its first meaning while its events keep coming, and turns to a pan once deltaX shows', () => {
        const w = wheel()
        expect(w({ deltaX: 2, deltaY: 1, deltaMode: 0 }, 0).pan).not.toBeNull()
        expect(w({ deltaX: 0, deltaY: 8, deltaMode: 0 }, 50).pan).toEqual([0, 8]) // same gesture: still a pan
        expect(w({ deltaX: 0, deltaY: 100, deltaMode: 0 }, 1000).pan).toBeNull() // a new one, a notch: zoom
        expect(w({ deltaX: 6, deltaY: 4, deltaMode: 0 }, 1050).pan).toEqual([6, 4]) // deltaX is never dropped
    })
})
