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
const webcamPanelProps = []
vi.mock('./WebcamSourcePanel.jsx', () => ({
    default: (props) => {
        webcamPanelProps.push(props)
        return <div data-testid="mock-webcam-panel" />
    }
}))

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import RawEditor from './RawEditor.jsx'

// Audit 2026-10-05, build plan rows 3 and 4. Row 3: ONE right region — the
// settings column per node kind (§3.5), Delete in its footer, never empty,
// never over content, one occupant at a time. Row 4: inside a node opens its
// substance (§3.6) — no empty canvas, no round pill, no "room".

const KEY = 'test-region-inside-ws'
const NODES = [
    { id: 'text', typeId: 'view.text', label: 'The night', values: { content: 'Doors at ten.' } },
    { id: 'list', typeId: 'view.list', label: 'Bar', values: { title: 'Bar', groups: ['Drinks'], items: [{ id: 'i1', text: 'Water', group: 'Drinks' }] } },
    { id: 'math', typeId: 'math.op', label: 'Math', values: {} },
    { id: 'cube', typeId: 'geom.cube', label: 'Cube', values: {} },
    { id: 'scene', typeId: 'universe.world', label: 'Scene', values: {} },
    { id: 'tool', typeId: 'view.library', label: 'Shelf', values: { frame: { visible: true, x: 40, y: 120, width: 240, height: 200 } } }
]
const seed = (nodes = NODES) => window.localStorage.setItem(KEY, JSON.stringify({ nodes, edges: [], workspaceState: {} }))
const setWidth = (w) => { window.innerWidth = w; window.dispatchEvent(new Event('resize')) }
const column = () => screen.queryByTestId('raw-settings-column')
const select = (id) => fireEvent.click(screen.getByRole('button', { name: `select:${id}` }))
const open = (id) => {
    const { onEnterNode } = graphMountProps.at(-1)
    act(() => onEnterNode(id))
}

// Everything that may stand in the right region, counted wherever it is in
// the page: the column (any occupant), a help dialog, an outliner or chat
// window, a List/Text window.
const occupants = () => [
    ...document.querySelectorAll('[data-testid="raw-settings-column"]'),
    ...[...document.querySelectorAll('.raw-help-dialog')].filter((el) => !el.closest('[data-testid="raw-settings-column"]')),
    ...[...document.querySelectorAll('.raw-window')].filter((el) => /^(Outliner|Chat|The night|Bar)$/.test(el.getAttribute('aria-label') || ''))
]

afterEach(() => {
    cleanup()
    window.localStorage.removeItem(KEY)
    setWidth(1024)
    mockApplyLocalOps.mockClear()
})

// PR #778 as built opened the To do and Contacts Lists as windows stacked
// over the canvas on first load (seen 2026-10-05, ledger N140). The opening
// view is the canvas and its cards: nothing covers the work, even when the
// document (or this device) remembers those windows as open.
describe('opening view: nothing covers the canvas on first load', () => {
    const remembered = { visible: true, x: 120, y: 164, width: 660, height: 560, zIndex: 7 }
    const MOCT = [
        { id: 'night', typeId: 'view.text', label: 'The night', values: { content: 'Doors at ten.', frame: remembered } },
        { id: 'todo', typeId: 'view.list', label: 'To do', values: { title: 'To do', groups: ['This night'], items: [{ id: 't1', text: 'Sound check', group: 'This night' }], frame: remembered } },
        { id: 'contacts', typeId: 'view.list', label: 'Contacts', values: { title: 'Contacts', groups: ['People'], items: [{ id: 'c1', text: 'Venue', group: 'People' }], frame: remembered } },
        { id: 'bar', typeId: 'view.list', label: 'Bar', values: { title: 'Bar', groups: ['Drinks'], items: [] } }
    ]
    it('first load: no window, no column, no Help sheet over the canvas — at 1440 and 390', () => {
        for (const width of [1440, 390]) {
            setWidth(width)
            seed(MOCT)
            render(<RawEditor localStorageKey={KEY} />)
            expect(screen.getByTestId('mock-graph'), `${width}`).toBeTruthy()
            expect(graphMountProps.at(-1).nodes.map((n) => n.id).sort(), `${width}`).toEqual(['bar', 'contacts', 'night', 'todo'])
            expect(document.querySelectorAll('.raw-window'), `${width}`).toHaveLength(0)
            expect(column(), `${width}`).toBeNull()
            expect(document.querySelector('.raw-help-backdrop, .raw-help-dialog'), `${width}`).toBeNull()
            cleanup()
        }
    })
})

describe('row 3: one right region', () => {
    it('across 8 scripted sequences, at most one occupant is ever mounted', () => {
        setWidth(1440)
        seed()
        render(<RawEditor localStorageKey={KEY} />)
        const counts = []
        const step = (fn) => { fn(); counts.push(occupants().length) }
        const palette = (label) => {
            const { onDoubleClick } = graphMountProps.at(-1)
            act(() => onDoubleClick({}))
            const input = screen.getByPlaceholderText('type a node or panel name…')
            fireEvent.change(input, { target: { value: label } })
            fireEvent.keyDown(input, { key: 'Enter' })
        }
        // 1 select · 2 select another · 3 help over a selection · 4 select again
        // · 5 outliner · 6 chat · 7 Escape · 8 open a List (and come back)
        step(() => select('text'))
        step(() => select('list'))
        step(() => palette('Help'))
        expect(column().getAttribute('data-occupant')).toBe('help')
        step(() => select('math'))
        expect(column().getAttribute('data-occupant')).toBe('settings')
        step(() => palette('Outliner'))
        expect(column().getAttribute('data-occupant')).toBe('outliner')
        step(() => palette('Chat'))
        expect(column().getAttribute('data-occupant')).toBe('chat')
        step(() => fireEvent.keyDown(column(), { key: 'Escape' }))
        step(() => { select('list'); open('list') })
        expect(counts).toHaveLength(8)
        expect(Math.max(...counts)).toBeLessThanOrEqual(1)
    })

    it('a card\'s reading ("what it is made of") takes the region too, never a floating window', () => {
        setWidth(1440)
        seed()
        render(<RawEditor localStorageKey={KEY} />)
        select('math')
        act(() => graphMountProps.at(-1).onShowReading('math'))
        expect(column().getAttribute('data-occupant')).toBe('reading')
        expect(column().querySelector('.raw-anatomy')).toBeTruthy()
        expect([...document.querySelectorAll('.raw-window')].some((el) => /made of/.test(el.textContent))).toBe(false)
        expect(occupants()).toHaveLength(1)
        select('text')
        expect(column().getAttribute('data-occupant')).toBe('settings')
    })

        // Seen in the browser (2026-10-05): opening the column narrows the canvas
    // and re-fits it, so a card near the right edge moved under the pointer
    // between the two clicks of a double-click and the second click landed in
    // the column. The column now waits out the double-click.
    it('the column waits out a double-click, so the canvas never moves between its clicks', () => {
        vi.useFakeTimers()
        try {
            setWidth(1440)
            seed()
            render(<RawEditor localStorageKey={KEY} columnOpenDelayMs={320} />)
            select('cube')
            expect(column()).toBeNull()
            act(() => { vi.advanceTimersByTime(200) })
            expect(column()).toBeNull()
            // the second click arrives: Open, and the column never came
            open('cube')
            act(() => { vi.advanceTimersByTime(1000) })
            expect(column()).toBeNull()
            expect(screen.getByTestId('raw-inside-codeview')).toBeTruthy()
            // a single click: the column arrives after the wait
            fireEvent.click(screen.getByRole('button', { name: '← Back' }))
            select('text')
            act(() => { vi.advanceTimersByTime(320) })
            expect(column().getAttribute('data-occupant')).toBe('settings')
        } finally {
            vi.useRealTimers()
        }
    })

        it('List and Text have no window, on desktop or phone, so nothing stands over the column or a card', () => {
        for (const width of [1440, 390]) {
            setWidth(width)
            seed()
            render(<RawEditor localStorageKey={KEY} />)
            const labels = [...document.querySelectorAll('.raw-window')].map((el) => el.getAttribute('aria-label'))
            expect(labels, `${width}`).not.toContain('The night')
            expect(labels, `${width}`).not.toContain('Bar')
            // A tool keeps its window.
            expect(labels.length, `${width}`).toBeGreaterThan(0)
            cleanup()
        }
    })

    it('Delete is in the column footer when something is selected; no floating Delete', () => {
        setWidth(1440)
        seed()
        render(<RawEditor localStorageKey={KEY} />)
        expect(document.querySelector('.raw-delete-fab')).toBeNull()
        select('cube')
        expect(document.querySelector('.raw-delete-fab')).toBeNull()
        const footer = column().querySelector('.raw-property-footer')
        expect(footer).toBeTruthy()
        expect(within(footer).getByRole('button', { name: 'Delete' })).toBeTruthy()
        // …and the column holding it is in the layout beside the canvas, not
        // fixed over it: the desktop rule is sticky in the flow.
        const workbench = screen.getByTestId('raw-workbench')
        expect(column().parentElement).toBe(workbench)
        expect(workbench.className).toContain('has-column')
        const css = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../styles/raw.css'), 'utf8')
        const desktop = css.slice(0, css.indexOf('@media (max-width: 699px)'))
        const rule = /\n\.raw-selection-scaffold \{([^}]*)\}/.exec(desktop)?.[1] || ''
        expect(rule).toMatch(/position:\s*sticky/)
        // It starts BELOW the one bar (margin), never under it with the bar's
        // height as padding: at z 1350 over the bar's z 60 that covered the
        // bar's Chat, ?, ⋯ and account cells (seen 2026-10-07, 1920x1080).
        expect(rule).toMatch(/margin-top:\s*var\(--raw-scaffold-top\)/)
        expect(rule).not.toMatch(/padding-top:\s*var\(--raw-scaffold-top\)/)
    })

    it('is never empty: every kind shows its name, ports, Open and Delete; settings only where there are any', () => {
        setWidth(1440)
        seed()
        render(<RawEditor localStorageKey={KEY} />)
        for (const node of NODES) {
            select(node.id)
            const col = column()
            expect(col.getAttribute('data-occupant')).toBe('settings')
            expect(within(col).getByText(node.label)).toBeTruthy()
            expect(col.querySelector('.raw-column-ports'), node.typeId).toBeTruthy()
            expect(within(col).getByRole('button', { name: /^Open/ })).toBeTruthy()
            expect(within(col).getByRole('button', { name: 'Delete' })).toBeTruthy()
            expect(col.querySelector('.raw-property-empty')).toBeNull()
        }
        // Math has settings (its operation); a Text's Content is in its card.
        select('math')
        expect(column().querySelector('.raw-property-section:not(.raw-column-ports)')).toBeTruthy()
        select('text')
        expect([...column().querySelectorAll('.raw-property-field')].some((el) => /Content/.test(el.textContent))).toBe(false)
        expect(within(column().querySelector('.raw-column-ports')).getAllByText('Content').length).toBeGreaterThan(0)
        // A container's Open says what is inside.
        select('scene')
        expect(within(column()).getByRole('button', { name: /^Open: 0 nodes inside/ })).toBeTruthy()
    })

    it('Ports carry live values: a List gives its Count', () => {
        setWidth(1440)
        seed()
        render(<RawEditor localStorageKey={KEY} />)
        select('list')
        const count = column().querySelector('.raw-column-ports [data-port-id="count"] .raw-port-value')
        expect(count?.textContent).toBe('1')
    })
})

describe('row 4: inside a node opens its substance', () => {
    const enter = (id) => {
        setWidth(1440)
        seed()
        render(<RawEditor localStorageKey={KEY} />)
        open(id)
    }
    const noDeadEnd = () => {
        expect(document.querySelector('.raw-empty-state')).toBeNull()
        expect(document.querySelector('.raw-scope-marker')).toBeNull()
        expect(screen.queryByRole('button', { name: 'explain-scope' })).toBeNull()
        expect(document.body.textContent).not.toMatch(/\broom\b/i)
        expect(screen.getByRole('button', { name: '← Back' })).toBeTruthy()
    }

    it('List: an editable table, with its outputs on a rail', () => {
        enter('list')
        const view = screen.getByTestId('raw-inside-view')
        expect(view.dataset.kind).toBe('list')
        expect(view.querySelector('.raw-list-panel')).toBeTruthy()
        expect(within(view).getByText('Water')).toBeTruthy()
        expect(within(view.querySelector('.raw-inside-rail.is-out')).getByText('Count')).toBeTruthy()
        expect(screen.queryByTestId('mock-graph')).toBeNull()
        noDeadEnd()
    })

    it('Text: a text editor that writes the content', () => {
        enter('text')
        const box = screen.getByTestId('raw-inside-view').querySelector('textarea')
        expect(box.value).toBe('Doors at ten.')
        fireEvent.change(box, { target: { value: 'Doors at eleven.' } })
        const op = mockApplyLocalOps.mock.calls.flat(2).filter((o) => o?.type === 'updateNode').at(-1)
        expect(op.payload.patch.values.content).toBe('Doors at eleven.')
        noDeadEnd()
    })

    it('code: inputs, the runtime lines labelled read-only, outputs — and its settings at the top', () => {
        enter('math')
        const view = screen.getByTestId('raw-inside-codeview')
        expect(view.querySelector('.raw-inside-rail.is-in li')).toBeTruthy()
        expect(view.querySelector('.raw-inside-rail.is-out li')).toBeTruthy()
        expect(within(view).getByText('platform code · read-only')).toBeTruthy()
        expect(view.querySelector('.raw-inside-centre .raw-property-section')).toBeTruthy()
        expect(screen.queryByTestId('mock-graph')).toBeNull()
        noDeadEnd()
    })

    it('spatial: its children above and its code below', () => {
        enter('cube')
        expect(screen.getByTestId('mock-graph')).toBeTruthy()
        expect(screen.getByTestId('raw-inside-codeview')).toBeTruthy()
        noDeadEnd()
    })

    it('container: the sub-graph, unchanged', () => {
        enter('scene')
        expect(screen.getByTestId('mock-graph')).toBeTruthy()
        expect(screen.queryByTestId('raw-inside-view')).toBeNull()
        expect(screen.getByRole('navigation', { name: 'Inside' }).textContent).toMatch(/Scene.*0 nodes inside/)
    })

    it('tool: the tool itself fills the canvas', () => {
        enter('tool')
        const view = screen.getByTestId('raw-inside-view')
        expect(view.dataset.kind).toBe('tool')
        expect(view.querySelector('.raw-inside-body').children.length).toBeGreaterThan(0)
        noDeadEnd()
    })

    it('Back returns to the canvas', () => {
        enter('list')
        fireEvent.click(screen.getByRole('button', { name: '← Back' }))
        expect(screen.getByTestId('mock-graph')).toBeTruthy()
        expect(screen.queryByTestId('raw-inside-view')).toBeNull()
    })
})

describe('rectangles: the new chrome has no radius over 2px', () => {
    it('every rule for the region, the ports and the inside view is radius 0–2, and the pill is gone', () => {
        const css = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../styles/raw.css'), 'utf8')
        const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
            .filter(([, selector]) => /raw-(inside|port|property-footer|column-delete|region|help-inline|property-open|selection-scaffold)/.test(selector))
        expect(rules.length).toBeGreaterThan(10)
        for (const [, selector, body] of rules) {
            expect(body, selector.trim()).not.toMatch(/--di-radius-pill/)
            for (const [, value] of body.matchAll(/border-radius:\s*([^;]+);/g)) {
                expect(value.trim(), selector.trim()).toMatch(/^(0|1px|2px)$/)
            }
        }
        expect(css).not.toMatch(/\.raw-scope-marker/)
        expect(css).not.toMatch(/\.raw-delete-fab\s*\{/)
    })
})
