import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { createEdge, createNode } from '../../../project/nodeRegistry.js'
import { reportTop } from '../../../project/tops/topReports.js'
import { TOP_OPERATORS } from '../../../project/tops/topOperators.js'

vi.mock('virtual:node-source', () => ({
    SOURCE_TEXTS: ['case cube', 'draws cube'],
    NODE_SOURCE: { 'geom.cube': { computes: { file: 'src/project/graph/nodeGraphRuntime.js', fromLine: 267, toLine: 268, text: 0 }, draws: null, branch: null, component: null, feed: null } },
    DOORWAY_SOURCE: null,
    FILE_LOADERS: {}
}))

// jsdom has no WebGL, so the real compile check always passes here. The
// check itself is the engine's; what is tested is that a refusal is honoured.
vi.mock('../../../project/tops/topEngine.js', async (importOriginal) => {
    const actual = await importOriginal()
    return { ...actual, checkShader: (fragment) => (fragment.includes('( {') ? 'syntax error' : null) }
})

const { default: InsideView, insideGeometry } = await import('./InsideView.jsx')

const machines = [{ id: 'asuz', name: 'asuz', self: false, scripts: false }, { id: 'pc', name: 'aylmo', self: true, scripts: true }]

const mount = (node, { nodes = [node], edges = [], ...props } = {}) => {
    const handlers = {
        onChangeValue: vi.fn(),
        onPatchValues: vi.fn(),
        onGoToNode: vi.fn(),
        onWire: vi.fn(),
        onUnplug: vi.fn(),
        onLeave: vi.fn()
    }
    const utils = render(
        <InsideView node={node} allNodes={nodes} document={{ nodes, edges }} machines={machines} {...handlers} {...props} />
    )
    return { ...utils, ...handlers }
}

describe('InsideView — one frame for every node', () => {
    it('frames a Cube: head, In with its fields, Out, and the made-of tabs', () => {
        const cube = createNode('geom.cube', { label: 'Box' })
        mount(cube)
        expect(screen.getByRole('button', { name: 'Leave Box' })).toBeTruthy()
        expect(document.querySelector('.raw-inside-kind').textContent).toBe('Cube')
        expect(screen.getByRole('region', { name: /In — what Box takes/ }).textContent).toContain('Size')
        expect(screen.getByRole('region', { name: /Out — what Box gives/ }).textContent).toContain('Geometry')
        expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual(['computes', 'draws', 'script'])
    })

    it('dispatches a change from an In field with the value', () => {
        const cube = createNode('geom.cube', { label: 'Box' })
        const { onChangeValue } = mount(cube)
        fireEvent.change(document.querySelector('.raw-inside-in input[type="color"]'), { target: { value: '#00ff00' } })
        expect(onChangeValue).toHaveBeenCalledWith(cube.id, 'color', '#00ff00')
    })

    it('scopes an Oscillator and names where each output goes; a feed is one press to its card', () => {
        const lfo = createNode('signal.lfo', { label: 'Wave' })
        const cube = createNode('geom.cube', { label: 'Box' })
        const { onGoToNode } = mount(lfo, { nodes: [lfo, cube], edges: [createEdge(lfo.id, 'sine', cube.id, 'opacity')] })
        expect(document.querySelector('.raw-inside-scope')).toBeTruthy()
        expect(document.querySelector('.raw-inside-scope-readout').textContent).toContain('Sine')
        fireEvent.click(screen.getByRole('button', { name: 'Go to Box, fed by Sine' }))
        expect(onGoToNode).toHaveBeenCalledWith(cube.id)
    })

    it('shows a Webcam its own window in SEE, handed in by the editor', () => {
        const cam = createNode('source.webcam', { label: 'Cam' })
        const renderWindow = vi.fn(() => <div data-testid="the-window" />)
        mount(cam, { renderWindow })
        expect(screen.getAllByTestId('the-window')).toHaveLength(1)
        expect(renderWindow).toHaveBeenCalledWith(expect.objectContaining({ id: cam.id }), { placement: 'inside' })
    })

    it('frames a Geo like any other node, holding its children', () => {
        const geo = createNode('geom.geo', { label: 'Group' })
        const inner = createNode('geom.cube', { parentId: geo.id })
        mount(geo, { nodes: [geo, inner], childCount: 1 })
        expect(document.querySelector('.raw-inside-kind').textContent).toContain('holds 1')
        expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toContain('door')
    })

    it('opens MADE OF on a tab and shows the real lines with their own line numbers', async () => {
        const cube = createNode('geom.cube', { label: 'Box' })
        mount(cube)
        fireEvent.click(screen.getByRole('tab', { name: 'computes' }))
        await waitFor(() => expect(document.querySelector('.raw-inside-code')).toBeTruthy())
        expect(document.querySelector('.raw-inside-code-number').textContent).toBe('267')
        expect(document.querySelector('.raw-inside-code').textContent).toContain('case cube')
    })

    it('offers the script slot for a plain node, connected by props', async () => {
        const lfo = createNode('signal.lfo', { label: 'Wave' })
        const onApply = vi.fn(async () => ({ ok: false, error: 'no loops, please' }))
        const { onPatchValues } = mount(lfo, { scriptProps: { onApply, example: 'function compute() {}' } })
        fireEvent.click(screen.getByRole('tab', { name: 'script' }))
        fireEvent.change(screen.getByRole('textbox', { name: 'Script for Wave' }), { target: { value: 'while(true){}' } })
        fireEvent.click(screen.getByRole('button', { name: /Apply/ }))
        await waitFor(() => expect(screen.getByRole('alert').textContent).toBe('no loops, please'))
        expect(onPatchValues).not.toHaveBeenCalled()
    })

    it('says plainly when no script runner is connected, instead of a box nothing runs', () => {
        const lfo = createNode('signal.lfo', { label: 'Wave' })
        mount(lfo)
        fireEvent.click(screen.getByRole('tab', { name: 'script' }))
        expect(screen.queryByRole('textbox', { name: /Script/ })).toBeNull()
        expect(document.querySelector('.raw-inside-madeof-body').textContent).toMatch(/not available/)
    })
})

// The cases that used to live in TopInsidePanel.test.jsx — the same behaviour,
// now inside the one frame.
describe('InsideView — a picture operator', () => {
    const camera = (values = {}) => ({ id: 'cam-1', typeId: 'top.camera', label: 'Camera In', values: { machine: 'asuz', ...values } })

    it('shows where it runs, its settings in In, and turns a camera control into constraints', () => {
        const { onPatchValues } = mount(camera())
        expect(document.querySelector('.raw-inside-where').textContent).toBe('runs on asuz')
        expect(screen.getByRole('region', { name: /In — what Camera In takes/ }).textContent).toContain('Runs on')
        act(() => reportTop('cam-1', {
            camera: {
                label: 'USB2.0 HD UVC WebCam',
                capabilities: { width: { min: 160, max: 1280 }, height: { min: 120, max: 720 }, exposureMode: ['manual', 'continuous'], brightness: { min: -64, max: 64, step: 1 } },
                settings: { width: 640, height: 480, frameRate: 30, brightness: 0, exposureMode: 'continuous' }
            }
        }))
        expect(screen.getByText('USB2.0 HD UVC WebCam')).toBeTruthy()
        fireEvent.change(screen.getByLabelText('Brightness'), { target: { value: '12' } })
        expect(onPatchValues).toHaveBeenLastCalledWith('cam-1', { __constraints: { brightness: 12 } })
    })

    it('shows the real shader, refuses one that does not compile, applies an edit and goes back', () => {
        const node = { id: 'lvl', typeId: 'top.level', label: 'Level', values: {} }
        const { onPatchValues, rerender } = mount(node)
        fireEvent.click(screen.getByRole('tab', { name: 'shader' }))
        const code = screen.getAllByRole('textbox').find((box) => box.value.includes('p_gain'))
        expect(code.value.trim()).toBe(TOP_OPERATORS['top.level'].fragment.trim())
        fireEvent.change(code, { target: { value: 'void main( {' } })
        fireEvent.click(screen.getByRole('button', { name: /Apply/ }))
        expect(onPatchValues).not.toHaveBeenCalled()
        expect(screen.getByText(/Does not compile here: syntax error/)).toBeTruthy()
        fireEvent.change(code, { target: { value: `${TOP_OPERATORS['top.level'].fragment}\n// mine` } })
        fireEvent.click(screen.getByRole('button', { name: /Apply/ }))
        const shader = onPatchValues.mock.calls.at(-1)[1].__shader
        expect(shader).toContain('// mine')
        rerender(<InsideView node={{ ...node, values: { __shader: shader } }} allNodes={[node]} document={{ nodes: [node], edges: [] }} machines={machines} onPatchValues={onPatchValues} />)
        fireEvent.click(screen.getByRole('button', { name: 'Back to the original' }))
        expect(onPatchValues).toHaveBeenLastCalledWith('lvl', { __shader: '' })
    })

    it('says plainly when its machine does not run desk scripts, and refuses code that does not parse', () => {
        const { onPatchValues } = mount(camera())
        fireEvent.click(screen.getByRole('tab', { name: 'script' }))
        expect(screen.getByText(/does not run desk scripts/)).toBeTruthy()
        const script = screen.getAllByRole('textbox').find((box) => box.placeholder?.includes('async function open'))
        fireEvent.change(script, { target: { value: 'function frame( {' } })
        fireEvent.click(screen.getAllByRole('button', { name: /Apply/ }).at(-1))
        expect(onPatchValues).not.toHaveBeenCalledWith('cam-1', expect.objectContaining({ __script: expect.anything() }))
    })
})

describe('insideGeometry — the frame and the canvas agree on what is covered', () => {
    it('docks IN and OUT on a wide screen, folds OUT under IN below 1100, and goes one column on a phone', () => {
        expect(insideGeometry({ width: 1440, height: 900, top: 49 })).toMatchObject({ layout: 'wide', insets: { left: 280, right: 260 } })
        expect(insideGeometry({ width: 1024, height: 768 })).toMatchObject({ layout: 'folded', insets: { left: 300, right: 0 } })
        const phone = insideGeometry({ width: 390, height: 844, phonePanel: 'in' })
        expect(phone.layout).toBe('phone')
        expect(phone.insets.left).toBe(0)
        expect(phone.sheet).toBeGreaterThan(0)
        expect(insideGeometry({ width: 390, height: 844, phonePanel: 'canvas' }).sheet).toBe(0)
    })

    it('gives the canvas back the picture when SEE is folded', () => {
        const open = insideGeometry({ width: 1440, height: 900, seeOpen: true })
        const folded = insideGeometry({ width: 1440, height: 900, seeOpen: false })
        expect(folded.insets.top).toBeLessThan(open.insets.top)
    })
})
