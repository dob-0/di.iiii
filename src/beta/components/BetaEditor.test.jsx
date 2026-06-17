import { render, screen, fireEvent } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import TextPanelWindow from './TextPanelWindow.jsx'

// Mock 3D deps before importing BetaEditor to avoid ResizeObserver errors in jsdom
vi.mock('./BetaViewport.jsx', () => ({ default: () => <div data-testid="mock-viewport" /> }))
vi.mock('./BetaGraphSurface.jsx', () => ({ default: () => <div data-testid="mock-graph" /> }))
vi.mock('../../project/hooks/useProjectDocumentSync.js', () => ({
    useProjectDocumentSync: () => ({ applyLocalOps: vi.fn() })
}))
vi.mock('../../project/hooks/useProjectPresence.js', () => ({
    useProjectPresence: () => ({ users: [], cursors: [], emitCursor: vi.fn(), clearCursor: vi.fn() })
}))

import BetaEditor from './BetaEditor.jsx'

const OUTLINER_STORAGE_KEY = 'test-outliner-ws'
const makeWorkspaceDoc = (nodes = []) => JSON.stringify({
    nodes,
    edges: [],
    workspaceState: {}
})

const makeNodeZero = () => ({
    id: 'node-0',
    typeId: 'universe.node0',
    label: 'Node 0',
    values: { title: 'Node 0' }
})

describe('BetaEditor outliner toggle', () => {
    afterEach(() => {
        window.localStorage.removeItem(OUTLINER_STORAGE_KEY)
    })

    it('does not show the node count button when the document has no nodes', () => {
        render(<BetaEditor localStorageKey={OUTLINER_STORAGE_KEY} />)
        expect(screen.queryByRole('button', { name: /nodes/i })).toBeNull()
    })

    it('shows the node count button when nodes exist on the active surface', () => {
        window.localStorage.setItem(
            OUTLINER_STORAGE_KEY,
            makeWorkspaceDoc([
                makeNodeZero(),
                { id: 'c1', typeId: 'geom.cube', label: 'Test Cube', values: {} }
            ])
        )
        render(<BetaEditor localStorageKey={OUTLINER_STORAGE_KEY} />)
        expect(screen.getByRole('button', { name: /2 nodes/i })).toBeTruthy()
    })

    it('opens the outliner dialog when the node count button is clicked', () => {
        window.localStorage.setItem(
            OUTLINER_STORAGE_KEY,
            makeWorkspaceDoc([
                makeNodeZero(),
                { id: 'c1', typeId: 'geom.cube', label: 'Test Cube', values: {} }
            ])
        )
        render(<BetaEditor localStorageKey={OUTLINER_STORAGE_KEY} />)
        fireEvent.click(screen.getByRole('button', { name: /2 nodes/i }))
        expect(screen.getByRole('dialog', { name: 'Outliner' })).toBeTruthy()
    })

    it('closes the outliner when the count button is clicked again', () => {
        window.localStorage.setItem(
            OUTLINER_STORAGE_KEY,
            makeWorkspaceDoc([
                makeNodeZero(),
                { id: 'c1', typeId: 'geom.cube', label: 'Test Cube', values: {} }
            ])
        )
        render(<BetaEditor localStorageKey={OUTLINER_STORAGE_KEY} />)
        const btn = screen.getByRole('button', { name: /2 nodes/i })
        fireEvent.click(btn)
        expect(screen.getByRole('dialog', { name: 'Outliner' })).toBeTruthy()
        fireEvent.click(btn)
        expect(screen.queryByRole('dialog', { name: 'Outliner' })).toBeNull()
    })
})

describe('BetaEditor undo/redo', () => {
    it('Ctrl+Z does not throw when history is empty', () => {
        render(<BetaEditor localStorageKey="test-undo" />)
        expect(() => {
            fireEvent.keyDown(window, { key: 'z', ctrlKey: true })
        }).not.toThrow()
    })

    it('Ctrl+Y does not throw when redo stack is empty', () => {
        render(<BetaEditor localStorageKey="test-redo" />)
        expect(() => {
            fireEvent.keyDown(window, { key: 'y', ctrlKey: true })
        }).not.toThrow()
    })

    it('ignores Ctrl+Z when focus is inside a text input', () => {
        const { container } = render(<BetaEditor localStorageKey="test-undo-input" />)
        const input = document.createElement('input')
        container.appendChild(input)
        input.focus()
        expect(() => {
            fireEvent.keyDown(input, { key: 'z', ctrlKey: true })
        }).not.toThrow()
    })
})

describe('BetaEditor canvas mode', () => {
    const CANVAS_STORAGE_KEY = 'test-canvas-node0'

    afterEach(() => {
        window.localStorage.removeItem(CANVAS_STORAGE_KEY)
    })

    it('auto-enters Node 0 when a blank workspace already has one', () => {
        window.localStorage.setItem(
            CANVAS_STORAGE_KEY,
            makeWorkspaceDoc([
                {
                    id: 'node-0',
                    typeId: 'universe.node0',
                    label: 'Node 0',
                    values: { title: 'Node 0' }
                }
            ])
        )

        render(<BetaEditor localStorageKey={CANVAS_STORAGE_KEY} canvasMode />)

        // Graph is the primary surface — no toggle button needed
        expect(screen.queryByRole('button', { name: /graph/i })).toBeNull()
        // World button only appears after a spatial node is added
        expect(screen.queryByRole('button', { name: /world/i })).toBeNull()
        // Node 0 is no longer a floating panel — topbar is its presence, scope label shows its name
        expect(screen.queryByRole('dialog', { name: 'Node 0' })).toBeNull()
        expect(screen.getAllByText('Node 0').length).toBeGreaterThan(0)
    })
})

describe('TextPanelWindow', () => {
    it('renders the view.text content port value', () => {
        render(
            <TextPanelWindow
                node={{
                    id: 'text-1',
                    typeId: 'view.text',
                    label: 'Text',
                    values: { title: 'Note', content: 'Authored note body' }
                }}
            />
        )

        expect(screen.getByText('Authored note body')).toBeTruthy()
    })

    it('keeps legacy text values readable', () => {
        render(
            <TextPanelWindow
                node={{
                    id: 'text-legacy',
                    typeId: 'view.text',
                    label: 'Text',
                    values: { text: 'Legacy note body' }
                }}
            />
        )

        expect(screen.getByText('Legacy note body')).toBeTruthy()
    })

    it('does not repeat the title inside the panel body', () => {
        render(
            <TextPanelWindow
                node={{
                    id: 'text-no-heading',
                    typeId: 'view.text',
                    label: 'Text',
                    values: { title: 'My note', content: 'Body only' }
                }}
            />
        )

        expect(screen.getByText('Body only')).toBeTruthy()
        expect(screen.queryByRole('heading', { name: 'My note' })).toBeNull()
    })
})
