import { render, screen, fireEvent } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import TextPanelWindow from './TextPanelWindow.jsx'

// Mock 3D deps before importing BetaEditor to avoid ResizeObserver errors in jsdom
vi.mock('./BetaViewport.jsx', () => ({ default: () => <div data-testid="mock-viewport" /> }))
vi.mock('./BetaGraphSurface.jsx', () => ({
    default: (props) => (
        <div data-testid="mock-graph" role="presentation" onDoubleClick={() => props.onDoubleClick?.({})}>
            {props.selectedNodeId && (
                <button type="button" onClick={() => props.onDeleteNode?.(props.selectedNodeId)}>
                    delete-via-graph-canvas
                </button>
            )}
        </div>
    )
}))
const mockApplyLocalOps = vi.fn()
const mockReplaceDocument = vi.fn(() => Promise.resolve())
vi.mock('../../project/hooks/useProjectDocumentSync.js', () => ({
    useProjectDocumentSync: () => ({ applyLocalOps: mockApplyLocalOps, replaceDocument: mockReplaceDocument })
}))
vi.mock('../../project/hooks/useProjectPresence.js', () => ({
    useProjectPresence: () => ({ users: [], cursors: [], emitCursor: vi.fn(), clearCursor: vi.fn(), messages: [], sendChatMessage: vi.fn() })
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

    it('undo replays inverse ops through the ops path — never replaceDocument, never a local-only dispatch', () => {
        mockApplyLocalOps.mockClear()
        mockReplaceDocument.mockClear()
        render(<BetaEditor projectId="proj-1" />)

        // Seed history by creating Node 0 (double-click on the empty graph surface).
        fireEvent.doubleClick(screen.getByTestId('mock-graph'))
        const batches = () => mockApplyLocalOps.mock.calls
            .map(([ops]) => (Array.isArray(ops) ? ops : [ops]))
        const createdNode = batches().flat().find((op) => op.type === 'createNode')
        expect(createdNode).toBeDefined()

        fireEvent.keyDown(window, { key: 'z', ctrlKey: true })

        const undoBatch = batches().at(-1)
        expect(undoBatch.some((op) => op.type === 'deleteNode' && op.payload.nodeId === createdNode.payload.node.id)).toBe(true)
        expect(mockReplaceDocument).not.toHaveBeenCalled()
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

describe('BetaEditor Node 0 deletion guard', () => {
    const GUARD_STORAGE_KEY = 'test-node0-delete-guard'

    afterEach(() => {
        window.localStorage.removeItem(GUARD_STORAGE_KEY)
        vi.restoreAllMocks()
    })

    // activeSurface must be 'graph' — matches the real app's state after Node 0
    // is actually created (handleStartFromNodeZero sets it explicitly), and is
    // required for a render:'hidden' node type like universe.node0 to count as
    // "surface selected" (schema default is 'world', which only matches
    // spatial-3d/world-category types).
    const seedSelectedNodeZero = () => {
        window.localStorage.setItem(
            GUARD_STORAGE_KEY,
            JSON.stringify({
                nodes: [makeNodeZero()],
                edges: [],
                workspaceState: { selectedNodeId: 'node-0', activeSurface: 'graph' }
            })
        )
    }

    it('asks for confirmation before deleting Node 0 via the Delete FAB, and aborts on cancel', () => {
        seedSelectedNodeZero()
        const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false)
        mockApplyLocalOps.mockClear()
        render(<BetaEditor localStorageKey={GUARD_STORAGE_KEY} />)

        fireEvent.click(screen.getByRole('button', { name: 'Delete' }))

        expect(confirmSpy).toHaveBeenCalledWith(expect.stringMatching(/Node 0/))
        const deletedNode0 = mockApplyLocalOps.mock.calls
            .map(([ops]) => (Array.isArray(ops) ? ops : [ops]))
            .flat()
            .some((op) => op.type === 'deleteNode' && op.payload.nodeId === 'node-0')
        expect(deletedNode0).toBe(false)
    })

    it('deletes Node 0 via the Delete FAB once the user confirms', () => {
        seedSelectedNodeZero()
        vi.spyOn(window, 'confirm').mockReturnValue(true)
        mockApplyLocalOps.mockClear()
        render(<BetaEditor localStorageKey={GUARD_STORAGE_KEY} />)

        fireEvent.click(screen.getByRole('button', { name: 'Delete' }))

        const deletedNode0 = mockApplyLocalOps.mock.calls
            .map(([ops]) => (Array.isArray(ops) ? ops : [ops]))
            .flat()
            .some((op) => op.type === 'deleteNode' && op.payload.nodeId === 'node-0')
        expect(deletedNode0).toBe(true)
    })

    it('asks for confirmation before deleting Node 0 via the graph canvas\'s own delete path', () => {
        seedSelectedNodeZero()
        const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false)
        mockApplyLocalOps.mockClear()
        render(<BetaEditor localStorageKey={GUARD_STORAGE_KEY} />)

        fireEvent.click(screen.getByText('delete-via-graph-canvas'))

        expect(confirmSpy).toHaveBeenCalledWith(expect.stringMatching(/Node 0/))
        const deletedNode0 = mockApplyLocalOps.mock.calls
            .map(([ops]) => (Array.isArray(ops) ? ops : [ops]))
            .flat()
            .some((op) => op.type === 'deleteNode' && op.payload.nodeId === 'node-0')
        expect(deletedNode0).toBe(false)
    })

    it('never asks for confirmation when deleting a normal (non-root) node', () => {
        window.localStorage.setItem(
            GUARD_STORAGE_KEY,
            JSON.stringify({
                nodes: [makeNodeZero(), { id: 'c1', typeId: 'geom.cube', label: 'Test Cube', values: {} }],
                edges: [],
                workspaceState: { selectedNodeId: 'c1' }
            })
        )
        const confirmSpy = vi.spyOn(window, 'confirm')
        mockApplyLocalOps.mockClear()
        render(<BetaEditor localStorageKey={GUARD_STORAGE_KEY} />)

        fireEvent.click(screen.getByRole('button', { name: 'Delete' }))

        expect(confirmSpy).not.toHaveBeenCalled()
        const deletedCube = mockApplyLocalOps.mock.calls
            .map(([ops]) => (Array.isArray(ops) ? ops : [ops]))
            .flat()
            .some((op) => op.type === 'deleteNode' && op.payload.nodeId === 'c1')
        expect(deletedCube).toBe(true)
    })
})

describe('BetaEditor live-world toggle', () => {
    const LIVE_STORAGE_KEY = 'test-live-world'

    afterEach(() => {
        window.localStorage.removeItem(LIVE_STORAGE_KEY)
    })

    const makeWorldNode = (id, parentId = null) => ({
        id,
        typeId: 'universe.world',
        label: 'World',
        parentId,
        values: { frame: { x: 0, y: 0, width: 200, height: 200, visible: true } }
    })

    it('marks a world live for its scope via setWorkspaceState, keyed by parentId', () => {
        window.localStorage.setItem(
            LIVE_STORAGE_KEY,
            JSON.stringify({ nodes: [makeWorldNode('world-1')], edges: [], workspaceState: {} })
        )
        mockApplyLocalOps.mockClear()
        render(<BetaEditor localStorageKey={LIVE_STORAGE_KEY} />)

        fireEvent.click(screen.getByRole('button', { name: /Mark as live output for this scope/i }))

        const setLiveOp = mockApplyLocalOps.mock.calls
            .map(([ops]) => (Array.isArray(ops) ? ops : [ops]))
            .flat()
            .find((op) => op.type === 'setWorkspaceState' && op.payload?.patch?.liveWorldNodeIdByScope)
        expect(setLiveOp?.payload.patch.liveWorldNodeIdByScope).toEqual({ '': 'world-1' })
    })

    it('shows a world as live when the document already marks it so', () => {
        window.localStorage.setItem(
            LIVE_STORAGE_KEY,
            JSON.stringify({
                nodes: [makeWorldNode('world-1')],
                edges: [],
                workspaceState: { liveWorldNodeIdByScope: { '': 'world-1' } }
            })
        )
        render(<BetaEditor localStorageKey={LIVE_STORAGE_KEY} />)

        expect(screen.getByRole('button', { name: /^Live output for this scope/i })).toBeTruthy()
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
