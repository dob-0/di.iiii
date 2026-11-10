import { describe, expect, it, vi, afterEach } from 'vitest'
import { fireEvent, render, screen, cleanup } from '@testing-library/react'
import OutputControl from './OutputControl.jsx'
import { normalizeProjectDocument, applyProjectOps } from '../shared/projectSchema.js'

afterEach(() => { cleanup(); vi.restoreAllMocks() })

const ctxFor = (mappingState = {}) => ({
    spaceId: 's',
    projectId: 'p',
    document: { mappingState: { output: { width: 1920, height: 1080 }, surfaces: [{ id: 'a', resolution: [1280, 720] }], ...mappingState } },
    mapApi: { setOutput: vi.fn(), applyOps: vi.fn() }
})

describe('OutputControl', () => {
    it('toggles: OPEN OUTPUT opens, then shows OPEN and a click closes', () => {
        const win = { closed: false, close: vi.fn(() => { win.closed = true }) }
        const open = vi.spyOn(window, 'open').mockReturnValue(win)
        render(<OutputControl ctx={ctxFor()} />)
        expect(screen.getByRole('status').textContent).toBe('CLOSED')
        fireEvent.click(screen.getByRole('button', { name: 'OPEN OUTPUT' }))
        expect(open).toHaveBeenCalledWith('/s/map/p/out', 'di-map-out-p', undefined)
        expect(screen.getByRole('status').textContent).toBe('OPEN')
        const close = screen.getByRole('button', { name: 'CLOSE OUTPUT' })
        expect(close.getAttribute('aria-pressed')).toBe('true')
        fireEvent.click(close)
        expect(win.close).toHaveBeenCalled()
        expect(screen.getByRole('status').textContent).toBe('CLOSED')
    })

    it('match the screen writes both sizes through one batch', () => {
        const ctx = ctxFor()
        vi.stubGlobal('screen', { width: 2560, height: 1440 })
        render(<OutputControl ctx={ctx} />)
        fireEvent.click(screen.getByRole('button', { name: 'Settings' }))
        expect(screen.getByText(/cannot place a window on a screen/)).toBeTruthy()
        fireEvent.click(screen.getByRole('button', { name: /Match the screen/ }))
        const ops = ctx.mapApi.applyOps.mock.calls[0][0]
        expect(ops[0].payload.patch.output).toMatchObject({ width: 2560, height: 1440 })
        expect(ops[1].payload).toEqual({ surfaceId: 'a', patch: { resolution: [2560, 1440] } })
        vi.unstubAllGlobals()
    })

    it('full screen on open is written into output.window', () => {
        const ctx = ctxFor()
        render(<OutputControl ctx={ctx} />)
        fireEvent.click(screen.getByRole('button', { name: 'Settings' }))
        fireEvent.click(screen.getByLabelText('Full screen on open'))
        expect(ctx.mapApi.setOutput).toHaveBeenCalledWith({ output: { width: 1920, height: 1080, window: { fullscreen: true } } })
    })
})

describe('the document: one output, old documents unchanged', () => {
    it('an old document has no window key and one output of its own size', () => {
        const doc = normalizeProjectDocument({ mappingState: { output: { width: 1280, height: 800 } } })
        expect(doc.mappingState.output).toEqual({ width: 1280, height: 800 })
    })
    it('window settings survive a write and a re-normalise', () => {
        const window = { screen: { label: 'Projector', index: 1, size: [1920, 1080] }, fullscreen: true }
        const written = applyProjectOps(normalizeProjectDocument({}), [{ type: 'setMappingState', payload: { patch: { output: { width: 1920, height: 1080, window } } } }])
        expect(normalizeProjectDocument(JSON.parse(JSON.stringify(written))).mappingState.output.window).toEqual(window)
    })
})
