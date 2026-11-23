import { beforeAll, describe, expect, it, vi } from 'vitest'
import { fireEvent, render } from '@testing-library/react'
import MapSliceCanvas from './MapSliceCanvas.jsx'
import { regularGrid } from './sliceGeometry.js'

// The wall in the mapping window has no modes (2026-11-11): what is under the
// pointer decides what a drag does. These pin each gesture to its op.

vi.mock('./MapStage.jsx', () => ({ default: () => null }))

const W = 1000
const H = 500
const VIEW = { width: 1000, height: 600 }
// zoom 'fit' leaves 48px round the wall; jsdom puts the viewport at 0,0.
const Z = Math.min((VIEW.width - 96) / W, (VIEW.height - 96) / H)
const O = [(VIEW.width - (W * Z)) / 2, (VIEW.height - (H * Z)) / 2]
const toScreen = ([x, y]) => [O[0] + (x * W * Z), O[1] + (y * H * Z)]

// 200 × 100 wall pixels, top-left at (100, 50).
const flat = {
    id: 'a', name: 'A', enabled: true,
    corners: [[0.1, 0.1], [0.3, 0.1], [0.3, 0.3], [0.1, 0.3]],
    source: { kind: 'wall', ref: '' }, input: [0.1, 0.1, 0.2, 0.2]
}

beforeAll(() => {
    globalThis.ResizeObserver = class {
        constructor(callback) { this.callback = callback }
        observe() { this.callback([{ contentRect: VIEW }]) }
        disconnect() {}
    }
})

const mouse = (el, type, [x, y], extra = {}) => fireEvent(el, new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0, ...extra }))
const drag = (el, from, by) => {
    mouse(el, 'pointerdown', from)
    mouse(el, 'pointermove', [from[0] + by[0], from[1] + by[1]])
    mouse(el, 'pointerup', [from[0] + by[0], from[1] + by[1]])
}

const setup = (piece = flat) => {
    const spies = { applyOps: vi.fn(), onBend: vi.fn(), onSelect: vi.fn(), onSelectPoints: vi.fn(), onHover: vi.fn() }
    const view = render(
        <MapSliceCanvas
            mapping={{ surfaces: [piece] }} surfaces={[piece]} W={W} H={H}
            zoom="fit" onZoom={() => {}} pan={[0, 0]} onPan={() => {}} snap={false} grid={0}
            selectedIds={['a']} selectedPoints={[]} live={false} {...spies}
        />
    )
    return { ...view, el: view.container.querySelector('.map-mo-viewport'), ...spies }
}
const lastCorners = (applyOps) => applyOps.mock.calls.at(-1)[0][0].payload.patch.corners
const px = (corners) => corners.map(([x, y]) => [x * W, y * H])

describe('MapSliceCanvas — one view, no modes', () => {
    it('dragging a corner pins only that corner', () => {
        const { el, applyOps } = setup()
        drag(el, toScreen([0.1, 0.1]), [20, 10])
        const corners = lastCorners(applyOps)
        expect(corners[0][0]).toBeCloseTo(0.1 + (20 / (W * Z)), 5)
        expect(corners[0][1]).toBeCloseTo(0.1 + (10 / (H * Z)), 5)
        expect(corners.slice(1)).toEqual(flat.corners.slice(1))
    })

    it('dragging inside moves the whole piece', () => {
        const { el, applyOps } = setup()
        drag(el, toScreen([0.2, 0.2]), [30, 0])
        const corners = lastCorners(applyOps)
        corners.forEach(([x, y], index) => {
            expect(x).toBeCloseTo(flat.corners[index][0] + (30 / (W * Z)), 5)
            expect(y).toBeCloseTo(flat.corners[index][1], 5)
        })
    })

    it('the knob above it turns it', () => {
        const { el, applyOps } = setup()
        const top = toScreen([0.2, 0.1])
        const centre = toScreen([0.2, 0.2])
        // Knob straight above the top edge; pull it round to the right = 90°.
        mouse(el, 'pointerdown', [top[0], top[1] - 30])
        mouse(el, 'pointermove', [centre[0] + 150, centre[1]])
        mouse(el, 'pointerup', [centre[0] + 150, centre[1]])
        const quad = px(lastCorners(applyOps))
        const xs = quad.map(([x]) => x)
        const ys = quad.map(([, y]) => y)
        expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(100, 3)
        expect(Math.max(...ys) - Math.min(...ys)).toBeCloseTo(200, 3)
    })

    it('an edge bar stretches that side and keeps the other', () => {
        const { el, applyOps } = setup()
        drag(el, toScreen([0.3, 0.2]), [50, 0])
        const corners = lastCorners(applyOps)
        expect(corners[0][0]).toBeCloseTo(0.1, 5)
        expect(corners[3][0]).toBeCloseTo(0.1, 5)
        expect(corners[1][0]).toBeCloseTo(0.3 + (50 / (W * Z)), 5)
        expect(corners[2][0]).toBeCloseTo(0.3 + (50 / (W * Z)), 5)
    })

    it('double-clicking a piece asks to bend it', () => {
        const { el, onBend } = setup()
        mouse(el, 'dblclick', toScreen([0.2, 0.2]))
        expect(onBend).toHaveBeenCalledWith('a')
    })

    it('a bent piece shows its bend points and no edge bars', () => {
        const bent = { ...flat, warp: { mode: 'linear', divisionsX: 1, divisionsY: 1, points: regularGrid(1, 1) } }
        const { container } = setup(bent)
        expect(container.querySelectorAll('.map-mo-pin')).toHaveLength(4)
        expect(container.querySelectorAll('.map-mo-bend')).toHaveLength(5)
        expect(container.querySelectorAll('.map-mo-edge')).toHaveLength(0)
    })

    it('says what a press would do before you press', () => {
        const { el, onHover } = setup()
        mouse(el, 'pointermove', toScreen([0.1, 0.1]))
        expect(onHover).toHaveBeenLastCalledWith('corner')
        mouse(el, 'pointermove', toScreen([0.2, 0.2]))
        expect(onHover).toHaveBeenLastCalledWith('body')
    })
})
