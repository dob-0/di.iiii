import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, within } from '@testing-library/react'
import MapAdvancedOutput from './MapAdvancedOutput.jsx'
import { presetScreens, screenPresets } from './wallScreens.js'
import { frameOf } from './sliceGeometry.js'

const output = { width: 3200, height: 1440 }
const row3 = screenPresets.find((preset) => preset.id === 'row3')

const makeSurfaces = () => presetScreens(row3, output).map((screen, index) => ({
    id: `s${index + 1}`,
    enabled: true,
    flip: 'none',
    isKey: false,
    blackBg: true,
    brightness: 1,
    contrast: 1,
    red: 0,
    green: 0,
    blue: 0,
    softEdge: { enabled: false, left: 0, right: 0, top: 0, bottom: 0, power: 2, gamma: 1, luminance: 0.5 },
    inputRotation: 0,
    ...screen
}))

let applyOps
let onClose

const props = (surfaces) => ({
    mapping: { output, surfaces, visuals: [], playing: '', fade: 0 },
    surfaces,
    visuals: [],
    output,
    machines: [],
    spaceId: '',
    projectId: null,
    network: null,
    assets: null,
    applyOps,
    setOutput: vi.fn(),
    undo: vi.fn(),
    redo: vi.fn(),
    canUndo: () => false,
    canRedo: () => false,
    play: vi.fn(),
    onClose
})

const open = (surfaces = makeSurfaces()) => {
    const view = render(<MapAdvancedOutput {...props(surfaces)} />)
    return { ...view, surfaces }
}

// The typed-number row with this label, in the right-hand panel.
const rowOf = (container, label) => {
    const panel = container.querySelector('.map-ao-right')
    const labelNode = within(panel).getAllByText(label).find((node) => node.classList.contains('map-ao-label'))
    return labelNode.closest('.map-ao-row')
}

beforeAll(() => {
    globalThis.ResizeObserver = globalThis.ResizeObserver || class { observe() {} unobserve() {} disconnect() {} }
})

beforeEach(() => {
    window.localStorage.clear()
    applyOps = vi.fn()
    onClose = vi.fn()
})

describe('MapAdvancedOutput', () => {
    it('shows both tabs and switches to the input fields', () => {
        const { container, getByRole, getByText } = open()
        expect(getByRole('tab', { name: 'Input Selection' })).toBeTruthy()
        expect(getByRole('tab', { name: 'Output Transformation' })).toBeTruthy()
        expect(getByRole('tab', { name: 'Output Transformation' }).getAttribute('aria-selected')).toBe('true')

        fireEvent.click(getByText('Input Selection'))
        expect(getByRole('tab', { name: 'Input Selection' }).getAttribute('aria-selected')).toBe('true')
        for (const label of ['X', 'Y', 'Left', 'Top', 'Width', 'Height', 'Rotation']) {
            expect(rowOf(container, label).querySelector('input[type="number"]')).toBeTruthy()
        }
        // The first slice takes the left third of the wall: 0..1066.67 px.
        expect(Number(rowOf(container, 'Left').querySelector('input').value)).toBe(0)
        expect(Number(rowOf(container, 'Width').querySelector('input').value)).toBeCloseTo(3200 / 3, 1)
    })

    it('lists the slices front-first (the last surface is first)', () => {
        const { container } = open()
        const names = [...container.querySelectorAll('.map-ao-slicerow .map-ao-slicename')].map((node) => node.textContent)
        expect(names).toEqual(['Screen 3', 'Screen 2', 'Screen 1'])
    })

    it('typing in the Rotation row sends one setMappingSurface op with rotated corners', () => {
        const { container, surfaces } = open()
        const input = rowOf(container, 'Rotation').querySelector('input')
        fireEvent.change(input, { target: { value: '30' } })
        expect(applyOps).toHaveBeenCalledTimes(1)
        const ops = applyOps.mock.calls[0][0]
        expect(ops).toHaveLength(1)
        expect(ops[0].type).toBe('setMappingSurface')
        expect(ops[0].payload.surfaceId).toBe('s1')
        const corners = ops[0].payload.patch.corners
        expect(corners).toHaveLength(4)
        expect(corners).not.toEqual(surfaces[0].corners)
        const frame = frameOf(corners.map(([x, y]) => [x * output.width, y * output.height]))
        expect(frame.rotation).toBeCloseTo(30, 3)
    })

    it('clicking a flip button sends { flip: "h" }', () => {
        const { getByRole } = open()
        fireEvent.click(getByRole('button', { name: 'Flip horizontally' }))
        expect(applyOps).toHaveBeenCalledTimes(1)
        expect(applyOps.mock.calls[0][0]).toEqual([{ type: 'setMappingSurface', payload: { surfaceId: 's1', patch: { flip: 'h' } } }])
    })

    it('Edit Points plus Subdivisions X "+" sends a warp of divisionsX 1 and 3x2 points', () => {
        const { container, getByText, getByRole } = open()
        fireEvent.click(getByText(/Edit Points/))
        expect(within(container.querySelector('.map-ao-right')).getByText('Warping')).toBeTruthy()
        fireEvent.click(getByRole('button', { name: 'Subdivisions X up' }))
        expect(applyOps).toHaveBeenCalledTimes(1)
        const [op] = applyOps.mock.calls[0][0]
        expect(op.type).toBe('setMappingSurface')
        const { warp } = op.payload.patch
        expect(warp.divisionsX).toBe(1)
        expect(warp.divisionsY).toBe(0)
        expect(warp.points).toHaveLength(6)
        expect(warp.points[0]).toEqual([0, 0])
        expect(warp.points[2]).toEqual([1, 0])
        expect(warp.points[5]).toEqual([1, 1])
    })

    it('Cancel after a change sends ops restoring the snapshot, then closes', () => {
        const original = makeSurfaces()
        const { rerender, getByRole } = open(original)
        // Something changed the first slice while the window was open.
        const changed = original.map((surface, index) => (index === 0
            ? { ...surface, flip: 'h', corners: surface.corners.map(([x, y]) => [x + 0.05, y]) }
            : surface))
        rerender(<MapAdvancedOutput {...props(changed)} />)
        fireEvent.click(getByRole('button', { name: 'Cancel' }))

        expect(applyOps).toHaveBeenCalledTimes(1)
        const ops = applyOps.mock.calls[0][0]
        const restore = ops.find((op) => op.type === 'setMappingSurface' && op.payload.surfaceId === 's1')
        expect(restore.payload.patch.corners).toEqual(original[0].corners)
        expect(restore.payload.patch.flip).toBe('none')
        expect(ops.filter((op) => op.type === 'setMappingSurface')).toHaveLength(3)
        expect(ops[ops.length - 1]).toEqual({ type: 'reorderMappingSurfaces', payload: { surfaceIds: ['s1', 's2', 's3'] } })
        expect(onClose).toHaveBeenCalledTimes(1)
    })

    it('Save & Close only closes', () => {
        const { getByRole } = open()
        fireEvent.click(getByRole('button', { name: 'Save & Close' }))
        expect(applyOps).not.toHaveBeenCalled()
        expect(onClose).toHaveBeenCalledTimes(1)
    })

    it('the Help box follows the mouse over [data-help]', () => {
        const { container, getByRole } = open()
        const help = container.querySelector('.map-ao-help p')
        expect(help.textContent).toMatch(/Move your mouse over/)
        const tab = getByRole('tab', { name: 'Input Selection' })
        fireEvent.mouseOver(tab)
        expect(help.textContent).toBe(tab.getAttribute('data-help'))
        expect(help.textContent).toMatch(/which part of the composition/)
        fireEvent.mouseOver(getByRole('button', { name: 'Cancel' }))
        expect(help.textContent).toMatch(/put every slice back/)
    })
})
