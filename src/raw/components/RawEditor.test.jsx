import { render, screen, fireEvent, act } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import TextPanelWindow from './TextPanelWindow.jsx'

// Mock 3D deps before importing RawEditor to avoid ResizeObserver errors in jsdom
vi.mock('./RawViewport.jsx', () => ({ default: () => <div data-testid="mock-viewport" /> }))
vi.mock('./RawGraphSurface.jsx', () => ({
    default: (props) => (
        <div data-testid="mock-graph" role="presentation" onDoubleClick={() => props.onDoubleClick?.({})}>
            {/* The real surface renders emptyHint in the middle of the canvas,
                independent of the chrome. The mock has to as well, or a zen
                workspace looks hintless here while the real one is not. */}
            {props.emptyHint && props.nodes?.length === 0 && (
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

// The zen preference is per workspace key and STICKY by design — a workspace
// that opened empty stays chromeless once it has nodes. Tests reuse one key
// across a suite, so without this the first empty render decides the chrome for
// every later test in the file.
afterEach(() => {
    for (const key of Object.keys(window.localStorage)) {
        if (key.startsWith('dii.raw.zen.')) window.localStorage.removeItem(key)
    }
})

describe('RawEditor outliner toggle', () => {
    afterEach(() => {
        window.localStorage.removeItem(OUTLINER_STORAGE_KEY)
    })

    it('does not show the node count button when the document has no nodes', () => {
        render(<RawEditor localStorageKey={OUTLINER_STORAGE_KEY} />)
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
        render(<RawEditor localStorageKey={OUTLINER_STORAGE_KEY} />)
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
        render(<RawEditor localStorageKey={OUTLINER_STORAGE_KEY} />)
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
        render(<RawEditor localStorageKey={OUTLINER_STORAGE_KEY} />)
        const btn = screen.getByRole('button', { name: /2 nodes/i })
        fireEvent.click(btn)
        expect(screen.getByRole('dialog', { name: 'Outliner' })).toBeTruthy()
        fireEvent.click(btn)
        expect(screen.queryByRole('dialog', { name: 'Outliner' })).toBeNull()
    })
})

describe('RawEditor undo/redo', () => {
    it('Ctrl+Z does not throw when history is empty', () => {
        render(<RawEditor localStorageKey="test-undo" />)
        expect(() => {
            fireEvent.keyDown(window, { key: 'z', ctrlKey: true })
        }).not.toThrow()
    })

    it('Ctrl+Y does not throw when redo stack is empty', () => {
        render(<RawEditor localStorageKey="test-redo" />)
        expect(() => {
            fireEvent.keyDown(window, { key: 'y', ctrlKey: true })
        }).not.toThrow()
    })

    it('ignores Ctrl+Z when focus is inside a text input', () => {
        const { container } = render(<RawEditor localStorageKey="test-undo-input" />)
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
        render(<RawEditor projectId="proj-1" />)

        // Seed history by creating a node via the palette (double-click on the
        // empty graph surface opens it directly — no forced Node 0 first step).
        fireEvent.doubleClick(screen.getByTestId('mock-graph'))
        fireEvent.change(screen.getByPlaceholderText('type a node or panel name…'), { target: { value: 'Cube' } })
        fireEvent.keyDown(screen.getByPlaceholderText('type a node or panel name…'), { key: 'Enter' })
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

describe('RawEditor canvas mode', () => {
    const CANVAS_STORAGE_KEY = 'test-canvas-node0'

    afterEach(() => {
        window.localStorage.removeItem(CANVAS_STORAGE_KEY)
    })

    // Product decision 2026-07-17: Node 0 is an ordinary node, not an
    // auto-created/auto-entered singleton root — a pre-existing one just sits
    // as a plain top-level node like any other, not force-entered on load.
    it('does not auto-enter a pre-existing Node 0 — it sits as an ordinary top-level node', () => {
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

        render(<RawEditor localStorageKey={CANVAS_STORAGE_KEY} canvasMode />)

        // Graph is the primary surface — no toggle button needed
        expect(screen.queryByRole('button', { name: /graph/i })).toBeNull()
        // World button only appears after a spatial node is added
        expect(screen.queryByRole('button', { name: /world/i })).toBeNull()
        // Not auto-entered: no breadcrumb crumb for it, no "Node 0" text anywhere
        expect(screen.queryByText('Node 0')).toBeNull()
    })

    it('opens the node palette directly on double-click, on a completely empty project', () => {
        mockApplyLocalOps.mockClear()
        render(<RawEditor localStorageKey={CANVAS_STORAGE_KEY} canvasMode />)

        fireEvent.doubleClick(screen.getByTestId('mock-graph'))

        expect(screen.getByRole('dialog', { name: 'Create a node, or summon a panel' })).toBeTruthy()
        // No node auto-created just by opening the palette
        expect(mockApplyLocalOps).not.toHaveBeenCalled()
    })
})

// Product decision 2026-07-17: Node 0 is an ordinary node — deleting it (via
// either the Delete FAB or the graph canvas's own delete path) behaves exactly
// like deleting any other node, no special confirmation. Only Reset Workspace
// (a document-wide wipe) still confirms.
describe('RawEditor delete/reset confirmations', () => {
    const GUARD_STORAGE_KEY = 'test-node0-delete-guard'

    afterEach(() => {
        window.localStorage.removeItem(GUARD_STORAGE_KEY)
        vi.restoreAllMocks()
    })

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

    it('deletes Node 0 via the Delete FAB with no confirmation, same as any other node', () => {
        seedSelectedNodeZero()
        const confirmSpy = vi.spyOn(window, 'confirm')
        mockApplyLocalOps.mockClear()
        render(<RawEditor localStorageKey={GUARD_STORAGE_KEY} />)

        fireEvent.click(screen.getByRole('button', { name: 'Delete' }))

        expect(confirmSpy).not.toHaveBeenCalled()
        const deletedNode0 = mockApplyLocalOps.mock.calls
            .map(([ops]) => (Array.isArray(ops) ? ops : [ops]))
            .flat()
            .some((op) => op.type === 'deleteNode' && op.payload.nodeId === 'node-0')
        expect(deletedNode0).toBe(true)
    })

    it('deletes Node 0 via the graph canvas\'s own delete path with no confirmation', () => {
        seedSelectedNodeZero()
        const confirmSpy = vi.spyOn(window, 'confirm')
        mockApplyLocalOps.mockClear()
        render(<RawEditor localStorageKey={GUARD_STORAGE_KEY} />)

        fireEvent.click(screen.getByText('delete-via-graph-canvas'))

        expect(confirmSpy).not.toHaveBeenCalled()
        const deletedNode0 = mockApplyLocalOps.mock.calls
            .map(([ops]) => (Array.isArray(ops) ? ops : [ops]))
            .flat()
            .some((op) => op.type === 'deleteNode' && op.payload.nodeId === 'node-0')
        expect(deletedNode0).toBe(true)
    })

    // Regression test for the 2026-07-17 audit: "Reset Workspace" wipes the
    // entire local document (every node/edge/window) and previously had NO
    // confirmation at all — this guard is unrelated to Node 0 and stays.
    it('asks for confirmation before Reset Workspace, and aborts on cancel', () => {
        seedSelectedNodeZero()
        const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false)
        render(<RawEditor localStorageKey={GUARD_STORAGE_KEY} />)

        fireEvent.click(screen.getByText('⋯'))
        fireEvent.click(screen.getByText('Reset Workspace'))

        expect(confirmSpy).toHaveBeenCalledWith(expect.stringMatching(/Reset Workspace/))
        expect(window.localStorage.getItem(GUARD_STORAGE_KEY)).not.toBeNull()
    })

    it('resets the workspace via the overflow menu once the user confirms', () => {
        seedSelectedNodeZero()
        vi.spyOn(window, 'confirm').mockReturnValue(true)
        render(<RawEditor localStorageKey={GUARD_STORAGE_KEY} />)

        fireEvent.click(screen.getByText('⋯'))
        fireEvent.click(screen.getByText('Reset Workspace'))

        expect(screen.queryByText('Node 0')).toBeNull()
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
        render(<RawEditor localStorageKey={GUARD_STORAGE_KEY} />)

        fireEvent.click(screen.getByRole('button', { name: 'Delete' }))

        expect(confirmSpy).not.toHaveBeenCalled()
        const deletedCube = mockApplyLocalOps.mock.calls
            .map(([ops]) => (Array.isArray(ops) ? ops : [ops]))
            .flat()
            .some((op) => op.type === 'deleteNode' && op.payload.nodeId === 'c1')
        expect(deletedCube).toBe(true)
    })
})

describe('RawEditor live-world toggle', () => {
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
        render(<RawEditor localStorageKey={LIVE_STORAGE_KEY} />)

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
        render(<RawEditor localStorageKey={LIVE_STORAGE_KEY} />)

        expect(screen.getByRole('button', { name: /^Live output for this scope/i })).toBeTruthy()
    })
})

// Product decision 2026-07-17: universe.space's showChrome value lets one
// universe be a normal authoring space (full topbar) and another a
// chromeless embed/kiosk view, without a global toggle.
describe('RawEditor per-universe chrome visibility', () => {
    const CHROME_STORAGE_KEY = 'test-chrome-visibility'

    afterEach(() => {
        window.localStorage.removeItem(CHROME_STORAGE_KEY)
    })

    const makeUniverse = (id, showChrome) => ({
        id,
        typeId: 'universe.space',
        label: 'Universe',
        values: { title: 'Universe', showChrome }
    })

    it('shows the full topbar at the true document root', () => {
        window.localStorage.setItem(CHROME_STORAGE_KEY, makeWorkspaceDoc([makeUniverse('u1', false)]))
        render(<RawEditor localStorageKey={CHROME_STORAGE_KEY} />)

        expect(screen.getByRole('button', { name: /Help/i })).toBeTruthy()
    })

    it('hides the full topbar once inside a universe with showChrome: false', () => {
        window.localStorage.setItem(CHROME_STORAGE_KEY, makeWorkspaceDoc([makeUniverse('u1', false)]))
        render(<RawEditor localStorageKey={CHROME_STORAGE_KEY} />)

        fireEvent.click(screen.getByText('enter-first-node'))

        expect(screen.queryByRole('button', { name: /Help/i })).toBeNull()
    })

    it('keeps the full topbar inside a universe with showChrome: true', () => {
        window.localStorage.setItem(CHROME_STORAGE_KEY, makeWorkspaceDoc([makeUniverse('u1', true)]))
        render(<RawEditor localStorageKey={CHROME_STORAGE_KEY} />)

        fireEvent.click(screen.getByText('enter-first-node'))

        expect(screen.getByRole('button', { name: /Help/i })).toBeTruthy()
    })
})

// Regression test for product decision 2026-07-19: no node type is a
// singleton anymore — a second World in the same scope used to be silently
// dropped (then, briefly, blocked with a warning); it's now just a normal
// second node, no dedup, no warning.
describe('RawEditor free-nesting palette create', () => {
    const FREE_NEST_STORAGE_KEY = 'test-palette-free-nest'

    afterEach(() => {
        window.localStorage.removeItem(FREE_NEST_STORAGE_KEY)
    })

    it('creates a second World in the same scope without any block or warning', () => {
        window.localStorage.setItem(
            FREE_NEST_STORAGE_KEY,
            makeWorkspaceDoc([
                { id: 'world-1', typeId: 'universe.world', label: 'World', parentId: null, values: {} }
            ])
        )
        mockApplyLocalOps.mockClear()
        render(<RawEditor localStorageKey={FREE_NEST_STORAGE_KEY} />)

        fireEvent.doubleClick(screen.getByTestId('mock-graph'))
        fireEvent.change(screen.getByPlaceholderText('type a node or panel name…'), { target: { value: 'World' } })
        fireEvent.keyDown(screen.getByPlaceholderText('type a node or panel name…'), { key: 'Enter' })

        expect(screen.queryByText(/Only one World per scope/)).toBeNull()
        const createdWorld = mockApplyLocalOps.mock.calls
            .map(([ops]) => (Array.isArray(ops) ? ops : [ops]))
            .flat()
            .some((op) => op.type === 'createNode' && op.payload?.node?.typeId === 'universe.world')
        expect(createdWorld).toBe(true)
    })
})

describe('RawEditor topbar empty-state hint', () => {
    const HINT_STORAGE_KEY = 'test-topbar-hint'
    const originalMatchMedia = window.matchMedia

    afterEach(() => {
        window.localStorage.removeItem(HINT_STORAGE_KEY)
        window.matchMedia = originalMatchMedia
    })

    const mockPointer = (coarse) => {
        window.matchMedia = vi.fn().mockImplementation((query) => ({
            matches: coarse && query.includes('coarse'),
            media: query,
            addEventListener: () => {},
            removeEventListener: () => {}
        }))
    }

    it('says "Double-click" on a fine pointer (mouse)', () => {
        mockPointer(false)
        render(<RawEditor localStorageKey={HINT_STORAGE_KEY} />)
        expect(screen.getByText(/Double-click to place your first node/)).toBeTruthy()
        expect(screen.queryByText(/Double-tap/)).toBeNull()
    })

    it('says "Double-tap" on a coarse pointer (touch)', () => {
        mockPointer(true)
        render(<RawEditor localStorageKey={HINT_STORAGE_KEY} />)
        expect(screen.getByText(/Double-tap to place your first node/)).toBeTruthy()
        expect(screen.queryByText(/Double-click/)).toBeNull()
    })

    it('renders no topbar hint pill once any node exists — only the mocked canvas hint area remains', () => {
        mockPointer(false)
        window.localStorage.setItem(HINT_STORAGE_KEY, makeWorkspaceDoc([makeNodeZero()]))
        render(<RawEditor localStorageKey={HINT_STORAGE_KEY} />)
        expect(screen.queryByText(/Double-click|Double-tap/)).toBeNull()
    })
})

describe('RawEditor world title wiring', () => {
    const TITLE_WIRE_STORAGE_KEY = 'test-world-title-wire'

    afterEach(() => {
        window.localStorage.removeItem(TITLE_WIRE_STORAGE_KEY)
    })

    // Regression: universe.world's `title` input is a real, drawable port, but
    // the window chrome read node.values.title directly and never went
    // through evaluateNodeInput — wiring a value.string node into it looked
    // like it should work (the palette lets you draw the edge) and did nothing.
    it('shows the title from a wired value.string node over the world\'s own static title', () => {
        window.localStorage.setItem(
            TITLE_WIRE_STORAGE_KEY,
            makeWorkspaceDoc(
                [
                    { id: 'title-1', typeId: 'value.string', label: 'Title', parentId: null, values: { value: 'Wired Title' } },
                    { id: 'world-1', typeId: 'universe.world', label: 'World', parentId: null, values: { title: 'Static Title' } }
                ]
            ).replace('"edges":[]', '"edges":[{"id":"e1","fromNodeId":"title-1","fromPort":"out","toNodeId":"world-1","toPort":"title"}]')
        )
        render(<RawEditor localStorageKey={TITLE_WIRE_STORAGE_KEY} />)

        expect(screen.getByRole('heading', { name: 'Wired Title' })).toBeTruthy()
        expect(screen.queryByRole('heading', { name: 'Static Title' })).toBeNull()
    })
})

describe('RawEditor view.browser panel', () => {
    const BROWSER_STORAGE_KEY = 'test-view-browser'

    afterEach(() => {
        window.localStorage.removeItem(BROWSER_STORAGE_KEY)
    })

    // view.browser had zero test coverage despite being counted as one of the
    // 27 "working" node types — nothing proved it rendered as an iframe rather
    // than falling through renderViewNodeContent's default branch into
    // TextPanelWindow's generic placeholder (the same trap desk.3d and the
    // deleted Streaming Prototype preset hit for other unimplemented types).
    it('renders as an iframe with a wired URL, not the generic text-panel fallback', () => {
        window.localStorage.setItem(
            BROWSER_STORAGE_KEY,
            makeWorkspaceDoc(
                [
                    { id: 'url-1', typeId: 'value.string', label: 'URL', parentId: null, values: { value: 'https://di-studio.xyz' } },
                    { id: 'browser-1', typeId: 'view.browser', label: 'Browser', parentId: null, values: {} }
                ]
            ).replace('"edges":[]', '"edges":[{"id":"e1","fromNodeId":"url-1","fromPort":"out","toNodeId":"browser-1","toPort":"url"}]')
        )
        render(<RawEditor localStorageKey={BROWSER_STORAGE_KEY} />)

        const iframe = document.querySelector('iframe')
        expect(iframe).toBeTruthy()
        expect(iframe.getAttribute('src')).toBe('https://di-studio.xyz')
        expect(screen.queryByText('This panel is ready for authored UI.')).toBeNull()
    })
})

// Regression: universe.world (and every other panel-2d node type) never
// rendered as an enterable graph card, so scopeEnterNode was unreachable for
// them — nodes created while "inside" a World always landed as siblings at
// the surrounding scope instead of real children of the World (found via
// live manual testing, confirmed by inspecting parentId directly against
// the server's own document). DesktopWindow's Enter button, wired to the
// same handleEnterNode used by the graph card's double-click, is the fix.
describe('RawEditor world scope entry', () => {
    const ENTER_STORAGE_KEY = 'test-world-scope-entry'

    afterEach(() => {
        window.localStorage.removeItem(ENTER_STORAGE_KEY)
    })

    it('navigates into a World node\'s own scope via its window\'s Enter button', () => {
        window.localStorage.setItem(
            ENTER_STORAGE_KEY,
            makeWorkspaceDoc([
                { id: 'world-1', typeId: 'universe.world', label: 'World', parentId: null, values: {} }
            ])
        )
        render(<RawEditor localStorageKey={ENTER_STORAGE_KEY} />)

        expect(screen.queryByRole('navigation', { name: 'Node scope' })).toBeNull()

        fireEvent.click(screen.getByText('Enter ›'))

        expect(screen.getByRole('navigation', { name: 'Node scope' })).toBeTruthy()
    })

    it('parents a node created after entering World to the World node, not its surrounding scope', () => {
        window.localStorage.setItem(
            ENTER_STORAGE_KEY,
            makeWorkspaceDoc([
                { id: 'world-1', typeId: 'universe.world', label: 'World', parentId: null, values: {} }
            ])
        )
        mockApplyLocalOps.mockClear()
        render(<RawEditor localStorageKey={ENTER_STORAGE_KEY} />)

        fireEvent.click(screen.getByText('Enter ›'))
        fireEvent.doubleClick(screen.getByTestId('mock-graph'))
        fireEvent.change(screen.getByPlaceholderText('type a node or panel name…'), { target: { value: 'Cube' } })
        fireEvent.keyDown(screen.getByPlaceholderText('type a node or panel name…'), { key: 'Enter' })

        const createdCube = mockApplyLocalOps.mock.calls
            .map(([ops]) => (Array.isArray(ops) ? ops : [ops]))
            .flat()
            .find((op) => op.type === 'createNode' && op.payload?.node?.typeId === 'geom.cube')
        expect(createdCube?.payload.node.parentId).toBe('world-1')
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

// Regression: the webcam/mic capture panels received INLINE-lambda live-output
// callbacks whose identity changed every render. Their effects depend on that
// identity and their cleanup mutates liveOutputs — with an active capture that
// is set→delete→set on parent state, an infinite "Maximum update depth
// exceeded" loop (hit live 2026-08-08). The callbacks must be render-stable.
describe('RawEditor capture panel callback stability', () => {
    const WEBCAM_STORAGE_KEY = 'test-webcam-stable'

    afterEach(() => {
        window.localStorage.removeItem(WEBCAM_STORAGE_KEY)
    })

    it('passes the same onFrameChange reference across re-renders', () => {
        window.localStorage.setItem(
            WEBCAM_STORAGE_KEY,
            makeWorkspaceDoc([
                { id: 'cam-1', typeId: 'source.webcam', label: 'Webcam', parentId: null, values: {} }
            ])
        )
        webcamPanelProps.length = 0
        render(<RawEditor localStorageKey={WEBCAM_STORAGE_KEY} />)
        expect(webcamPanelProps.length).toBeGreaterThan(0)
        const first = webcamPanelProps[0].onFrameChange

        // what the real panel does with a live camera: report a frame — this
        // mutates liveOutputs and re-renders the editor
        act(() => { first('cam-1', { isTexture: true }) })

        const last = webcamPanelProps.at(-1).onFrameChange
        expect(webcamPanelProps.length).toBeGreaterThan(1)
        expect(last).toBe(first)
    })
})
