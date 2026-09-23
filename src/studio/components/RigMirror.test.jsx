import { render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import RigMirror, { RIG_FLOOR, RigMirrorMarkers, rigFloorPosition, rigMarkerLook } from './RigMirror.jsx'

// r3f's lowercase elements mount under plain react-dom as unknown tags — enough to
// count what would be drawn. React complains about the casing; that noise is muted.
vi.mock('@react-three/drei', () => ({
    Billboard: ({ children }) => <div data-billboard>{children}</div>,
    Text: ({ children }) => <span data-label>{children}</span>
}))

const FIXTURES = [
    { id: 'a', index: 1, name: 'Back left', x: 0, y: 0, colour: { r: 255, g: 120, b: 0 }, level: 1 },
    { id: 'b', index: 2, name: 'Wash', x: 1, y: 1, colour: { r: 100, g: 20, b: 0 }, level: 0.39 },
    { id: 'c', index: 3, name: 'Dim', x: 0.5, y: 0.5, colour: { r: 0, g: 0, b: 0 }, level: 0 }
]

const mirrorOf = (snapshot) => ({
    getSnapshot: () => snapshot,
    subscribe: () => () => {},
    probe: vi.fn(),
    watch: vi.fn(() => () => {})
})

describe('RigMirror', () => {
    let errorSpy
    beforeEach(() => { errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {}) })
    afterEach(() => errorSpy.mockRestore())

    it('draws one marker and one label per fixture', () => {
        const { container } = render(<RigMirrorMarkers fixtures={FIXTURES} />)
        expect(container.querySelectorAll('mesh')).toHaveLength(3)
        const labels = [...container.querySelectorAll('[data-label]')].map((n) => n.textContent)
        expect(labels).toEqual(['1.Back left', '2.Wash', '3.Dim'])
    })

    it('draws nothing at all for an empty rig', () => {
        const { container } = render(<RigMirrorMarkers fixtures={[]} />)
        expect(container.innerHTML).toBe('')
    })

    it('draws nothing when there is no desk, and N markers when there is', () => {
        const snapshot = { present: false, fixtures: [], master: null, blackout: false }
        const absent = render(<RigMirror mirror={mirrorOf(snapshot)} />)
        expect(absent.container.innerHTML).toBe('')

        const present = mirrorOf({ present: true, fixtures: FIXTURES, master: 255, blackout: false })
        const here = render(<RigMirror mirror={present} />)
        expect(here.container.querySelectorAll('mesh')).toHaveLength(3)
        expect(present.watch).toHaveBeenCalledTimes(1)
    })

    it('lays the plan onto the provisional floor rectangle, just above the floor', () => {
        expect(rigFloorPosition({ x: 0, y: 0 })).toEqual([RIG_FLOOR.minX, 0.1, RIG_FLOOR.minZ])
        expect(rigFloorPosition({ x: 1, y: 1 })).toEqual([5, 0.1, 5])
        expect(rigFloorPosition({ x: 0.5, y: 0.25 })).toEqual([0, 0.1, -2.5])
    })

    it('a dark fixture is a dim neutral marker; a lit one keeps its hue and never glows past 1', () => {
        expect(rigMarkerLook(FIXTURES[2])).toEqual({ lit: false, colour: '#5c6166', glow: 0.18 })
        const dimAmber = rigMarkerLook(FIXTURES[1])
        expect(dimAmber.lit).toBe(true)
        expect(dimAmber.colour).toBe('rgb(255, 51, 0)')
        expect(dimAmber.glow).toBeGreaterThan(0.04)
        expect(dimAmber.glow).toBeLessThan(0.5)
        expect(rigMarkerLook(FIXTURES[0]).glow).toBe(1)
    })
})
