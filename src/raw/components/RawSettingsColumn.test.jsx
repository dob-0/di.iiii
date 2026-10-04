import { render, screen, fireEvent, act, cleanup, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useEffect as mockUseEffect } from 'react'

// Mock 3D deps before importing RawEditor to avoid ResizeObserver errors in jsdom
const viewportMountProps = []
vi.mock('./RawViewport.jsx', () => ({
    default: (props) => {
        viewportMountProps.push(props)
        return <div data-testid="mock-viewport" />
    }
}))
const graphMountProps = []
vi.mock('./RawGraphSurface.jsx', () => ({
    default: (props) => {
        graphMountProps.push(props)
        return (
        <div data-testid="mock-graph" role="presentation" onDoubleClick={() => props.onDoubleClick?.({})}>
            {/* The real surface renders emptyHint in the middle of the canvas,
                independent of the chrome — and only when it holds no card of
                either kind. The mock has to as well, or a zen workspace looks
                hintless here while the real one is not. */}
            {props.emptyHint && props.nodes?.length === 0 && !props.objectCards?.length && (
                <span data-testid="mock-graph-hint">{props.emptyHint}</span>
            )}
            {props.selectedNodeId && (
                <button type="button" onClick={() => props.onDeleteNode?.(props.selectedNodeId)}>
                    delete-via-graph-canvas
                </button>
            )}
            {props.nodes?.[0] && (
                <button type="button" onClick={() => props.onEnterNode?.(props.nodes[0].id)}>
                    enter-first-node
                </button>
            )}
            {/* A plain click on a card. Selection is the viewer's own now
                (NOPA audit F4), so a test selects the way a person does
                rather than seeding it into the document. */}
            {props.nodes?.map((node) => (
                <button key={`select-${node.id}`} type="button" onClick={() => props.onSelectNode?.(node.id)}>
                    {`select:${node.id}`}
                </button>
            ))}
            {/* The real surface offers this beside "Make me a scene" whenever
                the scope you are standing in is empty. Same reason as the hint
                above: without it here, the empty-state route to the sheet is
                untested while the marker route passes. */}
            {props.onExplainScope && (
                <button type="button" onClick={() => props.onExplainScope()}>explain-scope</button>
            )}
            {props.onMakeScene && (
                <button type="button" onClick={() => props.onMakeScene()}>make-me-a-scene</button>
            )}
            {/* The real surface's wire-drop handler reports a bare
                {fromNodeId, fromPort, toNodeId, toPort} — no id (see
                RawGraphSurface.jsx's pointerup handler). Mirror that shape
                here so a regression that stops minting the id downstream
                shows up in this harness too. */}
            {props.onCreateEdge && (
                <button
                    type="button"
                    onClick={() => props.onCreateEdge({
                        fromNodeId: 'node-a', fromPort: 'out', toNodeId: 'node-b', toPort: 'in'
                    })}
                >
                    drop-wire
                </button>
            )}
            {props.objectCards?.map((card) => (
                <button key={card.id} type="button" onClick={() => props.onSelectObject?.(card.entityId)}>
                    {`card:${card.label}`}
                </button>
            ))}
        </div>
        )
    }
}))
const mockApplyLocalOps = vi.fn()
const mockReplaceDocument = vi.fn(() => Promise.resolve())
// Null: the document never arrives (every older test here). A document: the
// hook loads it the way the real one does — load-start in an effect AFTER the
// first render, load-success a tick later — so a test can see what the editor
// decides before its project has loaded.
let mockLoadOnMount = null
vi.mock('../../project/hooks/useProjectDocumentSync.js', () => ({
    useProjectDocumentSync: ({ store }) => {
        mockUseEffect(() => {
            if (!mockLoadOnMount) return
            const { document, version, sameTick = false } = mockLoadOnMount
            store.dispatch({ type: 'load-start' })
            // sameTick: a load so fast its start and success land in one render
            if (sameTick) store.dispatch({ type: 'load-success', document, version })
            else Promise.resolve().then(() => store.dispatch({ type: 'load-success', document, version }))
        }, [])
        return { applyLocalOps: mockApplyLocalOps, replaceDocument: mockReplaceDocument }
    }
}))
vi.mock('../../project/hooks/useProjectPresence.js', () => ({
    useProjectPresence: () => ({ users: [], cursors: [], emitCursor: vi.fn(), clearCursor: vi.fn(), messages: [], sendChatMessage: vi.fn() })
}))
// Captures the onFrameChange prop each render so the stable-identity
// regression below can compare references across re-renders.
const webcamPanelProps = []
vi.mock('./WebcamSourcePanel.jsx', () => ({
    default: (props) => {
        webcamPanelProps.push(props)
        return <div data-testid="mock-webcam-panel" />
    }
}))

import RawEditor from './RawEditor.jsx'
import { canvasWidthFor, COLUMN_STORAGE_KEY } from '../utils/settingsColumn.js'

// The settings column (owner, 2026-10-05): the selected node's settings are a
// fixed column BESIDE the canvas, not a panel floating over it.
const KEY = 'test-settings-column-ws'
const seed = () => window.localStorage.setItem(KEY, JSON.stringify({
    nodes: [
        { id: 't1', typeId: 'view.text', label: 'The night', values: { content: 'Hello' } },
        { id: 'c1', typeId: 'geom.cube', label: 'Cube', values: {} }
    ],
    edges: [],
    workspaceState: {}
}))
const setWidth = (w) => { window.innerWidth = w; window.dispatchEvent(new Event('resize')) }

describe('settings column', () => {
    afterEach(() => {
        cleanup()
        window.localStorage.removeItem(KEY)
        window.localStorage.removeItem(COLUMN_STORAGE_KEY)
        setWidth(1024)
    })

    it('is a layout sibling of the canvas, not an overlay', () => {
        setWidth(1440)
        seed()
        render(<RawEditor localStorageKey={KEY} />)
        expect(screen.queryByTestId('raw-settings-column')).toBeNull()
        fireEvent.click(screen.getByRole('button', { name: 'select:c1' }))
        const column = screen.getByTestId('raw-settings-column')
        const bench = screen.getByTestId('raw-workbench')
        const canvas = bench.querySelector('.raw-surface-shell')
        expect(column.parentElement).toBe(bench)
        expect(canvas.parentElement).toBe(bench)
        expect(bench.classList.contains('has-column')).toBe(true)
        // the column carries a width the canvas gives up; it is not position:fixed inline
        expect(column.style.position).toBe('')
        expect(column.style.getPropertyValue('--raw-column-w')).toBe('320px')
    })

    it('the canvas width shrinks by the column width, and close restores it', () => {
        expect(canvasWidthFor(1440, 320, true)).toBe(1120)
        expect(canvasWidthFor(1440, 320, false)).toBe(1440)
        expect(canvasWidthFor(390, 320, true)).toBe(390) // phone: bottom sheet, canvas keeps all
        setWidth(1440)
        seed()
        render(<RawEditor localStorageKey={KEY} />)
        fireEvent.click(screen.getByRole('button', { name: 'select:c1' }))
        expect(screen.getByTestId('raw-workbench').classList.contains('has-column')).toBe(true)
        fireEvent.click(screen.getByRole('button', { name: 'Close settings' }))
        expect(screen.queryByTestId('raw-settings-column')).toBeNull()
        expect(screen.getByTestId('raw-workbench').classList.contains('has-column')).toBe(false)
    })

    // Found in the real browser: the column touches the bottom edge, was read as
    // a bottom sheet, and the fit gave the graph a 900 px bottom inset (zoom 34 %).
    it('does not tell the canvas it is covered from below (only the phone sheet does)', () => {
        setWidth(1440)
        window.innerHeight = 900
        const spy = vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function rect() {
            const column = this.classList?.contains('raw-selection-scaffold')
            return column
                ? { x: 1120, y: 0, left: 1120, top: 0, right: 1440, bottom: 900, width: 320, height: 900, toJSON: () => ({}) }
                : { x: 0, y: 0, left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0, toJSON: () => ({}) }
        })
        try {
            seed()
            render(<RawEditor localStorageKey={KEY} />)
            fireEvent.click(screen.getByRole('button', { name: 'select:c1' }))
            expect(graphMountProps.at(-1).bottomInset).toBe(0)
        } finally {
            spy.mockRestore()
        }
    })

    it('moves focus into the column on select; Escape closes it', () => {
        setWidth(1440)
        seed()
        render(<RawEditor localStorageKey={KEY} />)
        fireEvent.click(screen.getByRole('button', { name: 'select:c1' }))
        const column = screen.getByTestId('raw-settings-column')
        expect(document.activeElement).toBe(column)
        fireEvent.keyDown(column, { key: 'Escape' })
        expect(screen.queryByTestId('raw-settings-column')).toBeNull()
    })

    it('keeps the same fields, Delete reachable, and remembers a resized width', () => {
        setWidth(1440)
        seed()
        render(<RawEditor localStorageKey={KEY} />)
        fireEvent.click(screen.getByRole('button', { name: 'select:c1' }))
        expect(screen.getByRole('button', { name: 'Delete' })).toBeTruthy()
        const handle = screen.getByRole('separator', { name: 'Resize settings column' })
        fireEvent.keyDown(handle, { key: 'ArrowLeft' })
        expect(screen.getByTestId('raw-settings-column').style.getPropertyValue('--raw-column-w')).toBe('344px')
        expect(window.localStorage.getItem(COLUMN_STORAGE_KEY)).toBe('344')
    })

    it('on a phone width it is not in the layout row (bottom sheet) and has no resize handle', () => {
        setWidth(390)
        seed()
        render(<RawEditor localStorageKey={KEY} />)
        fireEvent.click(screen.getByRole('button', { name: 'select:c1' }))
        expect(screen.getByTestId('raw-workbench').classList.contains('has-column')).toBe(false)
        expect(screen.queryByRole('separator', { name: 'Resize settings column' })).toBeNull()
        expect(screen.getByRole('button', { name: 'Delete' })).toBeTruthy()
    })

    it('a Text card\'s Content is typed in the card, not in the column; the in-card edit writes node.values.content', () => {
        setWidth(1440)
        seed()
        render(<RawEditor localStorageKey={KEY} />)
        fireEvent.click(screen.getByRole('button', { name: 'select:t1' }))
        const column = screen.getByTestId('raw-settings-column')
        expect(within(column).queryByRole('textbox', { name: /content/i })).toBeNull()
        // No Content FIELD; the Ports section names the port, which is §3.5's "Content ↔".
        expect([...column.querySelectorAll('.raw-property-field')].some((label) => /Content/.test(label.textContent))).toBe(false)
        const { onEditMainValue } = graphMountProps.at(-1)
        act(() => onEditMainValue('t1', 'content', 'New words'))
        const op = mockApplyLocalOps.mock.calls.map(([o]) => (Array.isArray(o) ? o : [o])).flat().filter((o) => o?.type === 'updateNode').at(-1)
        expect(op.type).toBe('updateNode')
        expect(op.payload.patch.values.content).toBe('New words')
        // everything else in the column is still there
        expect(screen.getByRole('button', { name: 'Delete' })).toBeTruthy()
    })
})
