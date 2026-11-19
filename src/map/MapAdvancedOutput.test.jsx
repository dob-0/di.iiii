import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, within } from '@testing-library/react'
import MapAdvancedOutput from './MapAdvancedOutput.jsx'
import { boundsOfCorners, presetScreens, screenPresets } from './wallScreens.js'
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

beforeAll(() => {
    globalThis.ResizeObserver = globalThis.ResizeObserver || class { observe() {} unobserve() {} disconnect() {} }
})

beforeEach(() => {
    window.localStorage.clear()
    applyOps = vi.fn()
    onClose = vi.fn()
})

// The mapping window, 2026-11-11: di.iiii's own, not a copy of Resolume's
// Advanced Output — one wall view, no tabs, no modes, plain words.
describe('MapAdvancedOutput', () => {
    it('has no Input/Output tabs, no Transform/Edit Points modes, no Save & Close', () => {
        const { queryByRole, queryByText } = open()
        expect(queryByRole('tab')).toBeNull()
        expect(queryByText(/Edit Points/)).toBeNull()
        expect(queryByText(/Input Selection|Output Transformation/)).toBeNull()
        expect(queryByRole('button', { name: 'Save & Close' })).toBeNull()
        expect(queryByRole('button', { name: 'Done' })).toBeTruthy()
    })

    it('lists the pieces in drawing order, numbered from 1', () => {
        const { container } = open()
        const rows = [...container.querySelectorAll('.map-mo-piece-row')]
        expect(rows.map((row) => row.querySelector('.map-mo-piece-name').textContent)).toEqual(['Screen 1', 'Screen 2', 'Screen 3'])
        expect(rows.map((row) => row.querySelector('.map-mo-num').textContent)).toEqual(['1', '2', '3'])
    })

    it('typing in Place → Turn sends one setMappingSurface op with turned corners', () => {
        const { container, surfaces } = open()
        const input = within(container.querySelector('.map-mo-place')).getByLabelText('Turn')
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

    it('Mirror left–right sends { flip: "h" }', () => {
        const { getByRole } = open()
        fireEvent.click(getByRole('button', { name: 'Mirror left–right' }))
        expect(applyOps).toHaveBeenCalledTimes(1)
        expect(applyOps.mock.calls[0][0]).toEqual([{ type: 'setMappingSurface', payload: { surfaceId: 's1', patch: { flip: 'h' } } }])
    })

    it('Bend → Points across 3 sends a warp of divisionsX 1 and 3×2 points', () => {
        const { getByRole } = open()
        fireEvent.click(within(getByRole('radiogroup', { name: 'Points across' })).getByRole('radio', { name: '3' }))
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

    it('Takes → "same as where it lands" takes exactly what the piece covers', () => {
        const { getByRole, surfaces } = open()
        fireEvent.click(getByRole('button', { name: 'same as where it lands' }))
        expect(applyOps).toHaveBeenCalledTimes(1)
        expect(applyOps.mock.calls[0][0]).toEqual([{
            type: 'setMappingSurface',
            payload: { surfaceId: 's1', patch: { input: boundsOfCorners(surfaces[0].corners), inputRotation: 0 } }
        }])
    })

    it('Revert sends ops restoring the snapshot and keeps the window open', () => {
        const original = makeSurfaces()
        const { rerender, getByRole } = open(original)
        // Something changed the first piece while the window was open.
        const changed = original.map((surface, index) => (index === 0
            ? { ...surface, flip: 'h', corners: surface.corners.map(([x, y]) => [x + 0.05, y]) }
            : surface))
        rerender(<MapAdvancedOutput {...props(changed)} />)
        fireEvent.click(getByRole('button', { name: 'Revert' }))

        expect(applyOps).toHaveBeenCalledTimes(1)
        const ops = applyOps.mock.calls[0][0]
        const restore = ops.find((op) => op.type === 'setMappingSurface' && op.payload.surfaceId === 's1')
        expect(restore.payload.patch.corners).toEqual(original[0].corners)
        expect(restore.payload.patch.flip).toBe('none')
        expect(ops.filter((op) => op.type === 'setMappingSurface')).toHaveLength(3)
        expect(ops[ops.length - 1]).toEqual({ type: 'reorderMappingSurfaces', payload: { surfaceIds: ['s1', 's2', 's3'] } })
        expect(onClose).not.toHaveBeenCalled()
    })

    it('Done only closes', () => {
        const { getByRole } = open()
        fireEvent.click(getByRole('button', { name: 'Done' }))
        expect(applyOps).not.toHaveBeenCalled()
        expect(onClose).toHaveBeenCalledTimes(1)
    })

    it('the hint line says what can be done with the picked piece', () => {
        const { container } = open()
        expect(container.querySelector('.map-mo-hint').textContent).toMatch(/Screen 1 · corners pin/)
    })
})

// Audit 11-12: keys on a focused control, the clipboard, the wall size, renaming.
describe('MapAdvancedOutput keys and fields (audit 11-12)', () => {
    const sent = () => applyOps.mock.calls.flatMap(([ops]) => ops)

    it('Delete and arrows on a focused slider leave the piece alone', () => {
        const { getByRole } = open()
        const slider = getByRole('slider', { name: 'Brightness' })
        slider.focus()
        fireEvent.keyDown(slider, { key: 'Delete' })
        fireEvent.keyDown(slider, { key: 'Backspace' })
        fireEvent.keyDown(slider, { key: 'ArrowRight' })
        expect(sent().map((op) => op.type)).not.toContain('deleteMappingSurface')
        const patches = sent().map((op) => op.payload?.patch || {})
        expect(patches.some((patch) => 'corners' in patch)).toBe(false)
        expect(patches.some((patch) => 'brightness' in patch)).toBe(true)
    })

    it('with no control focused, Delete still deletes the picked piece', () => {
        open()
        fireEvent.keyDown(document.body, { key: 'Delete' })
        expect(sent().map((op) => op.type)).toContain('deleteMappingSurface')
    })

    it('Ctrl+C on nothing keeps the copy, and each paste lands a step further on', () => {
        const { surfaces } = open()
        fireEvent.keyDown(document.body, { key: 'c', ctrlKey: true })
        fireEvent.keyDown(document.body, { key: 'Escape' })
        fireEvent.keyDown(document.body, { key: 'c', ctrlKey: true })
        fireEvent.keyDown(document.body, { key: 'v', ctrlKey: true })
        fireEvent.keyDown(document.body, { key: 'v', ctrlKey: true })
        const made = sent().filter((op) => op.type === 'createMappingSurface').map((op) => op.payload.surface)
        expect(made).toHaveLength(2)
        const [x0] = surfaces[0].corners[0]
        expect(made[0].corners[0][0]).toBeCloseTo(x0 + 0.02, 6)
        expect(made[1].corners[0][0]).toBeCloseTo(x0 + 0.04, 6)
    })

    it('Ctrl+X copies and removes the picked piece', () => {
        open()
        fireEvent.keyDown(document.body, { key: 'x', ctrlKey: true })
        expect(sent().map((op) => op.type)).toContain('deleteMappingSurface')
        applyOps.mockClear()
        fireEvent.keyDown(document.body, { key: 'v', ctrlKey: true })
        expect(sent().map((op) => op.type)).toEqual(['createMappingSurface'])
    })

    it('the wall size is set on Enter, not on every key, and never below 16 px', () => {
        const { container } = open()
        const setOutput = vi.fn()
        // re-render with a spy we can read
        const view = render(<MapAdvancedOutput {...props(makeSurfaces())} setOutput={setOutput} />)
        const height = within(view.container.querySelector('.map-mo-wall')).getByLabelText('Height')
        fireEvent.focus(height)
        fireEvent.change(height, { target: { value: '1' } })
        fireEvent.change(height, { target: { value: '12' } })
        expect(setOutput).not.toHaveBeenCalled()
        fireEvent.change(height, { target: { value: '0' } })
        fireEvent.keyDown(height, { key: 'Enter' })
        fireEvent.blur(height)
        expect(setOutput).toHaveBeenCalledTimes(1)
        expect(setOutput.mock.calls[0][0].output.height).toBe(16)
        expect(container).toBeTruthy()
    })

    it('Esc in the wall size puts the old number back', () => {
        const setOutput = vi.fn()
        const view = render(<MapAdvancedOutput {...props(makeSurfaces())} setOutput={setOutput} />)
        const width = within(view.container.querySelector('.map-mo-wall')).getByLabelText('Width')
        fireEvent.focus(width)
        fireEvent.change(width, { target: { value: '99' } })
        fireEvent.keyDown(width, { key: 'Escape' })
        fireEvent.blur(width)
        expect(setOutput).not.toHaveBeenCalled()
    })

    it('Place X is kept near the wall', () => {
        const { container } = open()
        const x = within(container.querySelector('.map-mo-place')).getByLabelText('X')
        fireEvent.change(x, { target: { value: '99999999' } })
        const corners = sent().find((op) => op.type === 'setMappingSurface').payload.patch.corners
        expect(Math.max(...corners.map(([cx]) => cx))).toBeLessThan(5)
    })

    it('renaming to nothing keeps the old name', () => {
        const { container } = open()
        const row = container.querySelector('.map-mo-piece-row')
        fireEvent.doubleClick(row)
        const input = container.querySelector('.map-mo-rename')
        fireEvent.change(input, { target: { value: '   ' } })
        fireEvent.blur(input)
        expect(sent().some((op) => op.payload?.patch && 'name' in op.payload.patch)).toBe(false)
    })
})
