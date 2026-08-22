import { render, screen, fireEvent, act, cleanup, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import TextPanelWindow from './TextPanelWindow.jsx'

// Mock 3D deps before importing RawEditor to avoid ResizeObserver errors in jsdom
const viewportMountProps = []
vi.mock('./RawViewport.jsx', () => ({
    default: (props) => {
        viewportMountProps.push(props)
        return <div data-testid="mock-viewport" />
    }
}))
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

import RawEditor, { WINDOW_DEFAULT_POSITIONS } from './RawEditor.jsx'
import { getNodeType } from '../../project/nodeRegistry.js'

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
// like deleting any other node, no special confirmation. Only Clear the canvas
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
                workspaceState: { selectedNodeId: 'node-0' }
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

    // Regression test for the 2026-07-17 audit: "Clear the canvas" wipes the
    // entire local document (every node/edge/window) and previously had NO
    // confirmation at all — this guard is unrelated to Node 0 and stays.
    it('asks for confirmation before clearing the canvas, and aborts on cancel', () => {
        seedSelectedNodeZero()
        const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false)
        render(<RawEditor localStorageKey={GUARD_STORAGE_KEY} />)

        fireEvent.click(screen.getByText('⋯'))
        fireEvent.click(screen.getByText('Clear the canvas'))

        expect(confirmSpy).toHaveBeenCalledWith(expect.stringMatching(/Clear this canvas/))
        expect(window.localStorage.getItem(GUARD_STORAGE_KEY)).not.toBeNull()
    })

    // Doors audit 2026-08-21: the canvas was a sealed room — no way back to
    // the platform. The wordmark is the way home, and the ⋯ menu carries the
    // Spaces and Wiki exits.
    it('keeps the platform exits: wordmark links home, ⋯ offers Spaces and Wiki', () => {
        seedSelectedNodeZero()
        render(<RawEditor localStorageKey={GUARD_STORAGE_KEY} />)

        const wordmark = screen.getByRole('link', { name: 'di.iiii — home' })
        expect(wordmark.getAttribute('href')).toBe('/')

        fireEvent.click(screen.getByText('⋯'))
        expect(screen.getByText('Spaces')).toBeInTheDocument()
        expect(screen.getByText('Wiki')).toBeInTheDocument()
    })

    // Doors audit 2026-08-21: one project, two editors, and no door between
    // them — "Open in Studio" is the Raw side of that door. The local canvas
    // has no Studio twin, so the entry must not appear there.
    it('offers Open in Studio for a server project, never for the local canvas', () => {
        seedSelectedNodeZero()
        const { unmount } = render(<RawEditor localStorageKey={GUARD_STORAGE_KEY} />)
        fireEvent.click(screen.getByText('⋯'))
        expect(screen.queryByText('Open in Studio')).toBeNull()
        expect(screen.queryByText('Copy projector link')).toBeNull()
        unmount()

        // An empty project defaults to zen (no topbar); the door lives in the
        // topbar's ⋯ menu, so switch zen off for this key first.
        window.localStorage.setItem('dii.raw.zen.p1', 'off')
        render(<RawEditor projectId="p1" spaceId="gallery" />)
        fireEvent.click(screen.getByText('⋯'))
        expect(screen.getByText('Open in Studio')).toBeInTheDocument()
        expect(screen.getByText('Copy projector link')).toBeInTheDocument()
    })

    it('clears the canvas via the overflow menu once the user confirms', () => {
        seedSelectedNodeZero()
        vi.spyOn(window, 'confirm').mockReturnValue(true)
        render(<RawEditor localStorageKey={GUARD_STORAGE_KEY} />)

        fireEvent.click(screen.getByText('⋯'))
        fireEvent.click(screen.getByText('Clear the canvas'))

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

describe('RawEditor scope-clamped selection (the surface axis is retired)', () => {
    const KEY = 'test-scope-selection'
    afterEach(() => {
        window.localStorage.removeItem(KEY)
    })

    it('a selected PANEL node gets the inspector and the Delete FAB', () => {
        // The old filter matched node TYPE against activeSurface (default
        // 'world'), so Text/Image/Monitor selections showed nothing at all.
        window.localStorage.setItem(KEY, JSON.stringify({
            nodes: [{ id: 't1', typeId: 'view.text', label: 'Note', values: { frame: { visible: true, x: 40, y: 120, width: 200, height: 120 } } }],
            edges: [],
            workspaceState: { selectedNodeId: 't1' }
        }))
        render(<RawEditor localStorageKey={KEY} />)
        expect(screen.getByRole('button', { name: 'Delete' })).toBeTruthy()
    })

    it('a selection whose node stands in ANOTHER scope shows no Delete FAB', () => {
        window.localStorage.setItem(KEY, JSON.stringify({
            nodes: [
                { id: 'geo', typeId: 'geom.geo', label: 'Geo', values: {} },
                { id: 'c1', typeId: 'geom.cube', label: 'Cube', parentId: 'geo', values: {} }
            ],
            edges: [],
            workspaceState: { selectedNodeId: 'c1' }
        }))
        render(<RawEditor localStorageKey={KEY} />)
        expect(screen.queryByRole('button', { name: 'Delete' })).toBeNull()
    })

    it('walking through a door clears the selection instead of carrying it', () => {
        window.localStorage.setItem(KEY, JSON.stringify({
            nodes: [{ id: 'geo', typeId: 'geom.geo', label: 'Geo', values: {} }],
            edges: [],
            workspaceState: { selectedNodeId: 'geo' }
        }))
        mockApplyLocalOps.mockClear()
        render(<RawEditor localStorageKey={KEY} />)
        fireEvent.click(screen.getByRole('button', { name: 'enter-first-node' }))
        const clearedSelection = mockApplyLocalOps.mock.calls
            .map(([ops]) => (Array.isArray(ops) ? ops : [ops]))
            .flat()
            .some((op) => op.type === 'setWorkspaceState' && op.payload?.patch?.selectedNodeId === null)
        expect(clearedSelection).toBe(true)
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
        label: 'Scene',
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

        fireEvent.click(screen.getByRole('button', { name: /Make this the live Scene here/i }))

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

        expect(screen.getByRole('button', { name: /^The live Scene here/i })).toBeTruthy()
    })
})

// Product decision 2026-07-17: universe.space's showChrome value lets one
// universe be a normal authoring space (full topbar) and another a
// chromeless embed/kiosk view, without a global toggle.
// Owner, 2026-08-20, final form: "i mean clear desk". The backdrop room is
// retired — the desk is flat paper ALWAYS, whatever stands in the document.
// The room is seen through the Scene window, the fullscreen Room (topbar and
// palette), and /out — never as wallpaper behind the cards.
describe('RawEditor clear desk — no backdrop, ever', () => {
    const ROOM_STORAGE_KEY = 'test-room-gating'

    afterEach(() => {
        window.localStorage.removeItem(ROOM_STORAGE_KEY)
    })

    it.each([
        ['an empty desk', []],
        ['a Geo at root', [{ id: 'geo-1', typeId: 'geom.geo', label: 'Geo', values: {} }]],
        ['a cube at root', [{ id: 'c-1', typeId: 'geom.cube', label: 'Cube', values: {} }]],
        ['a Scene card', [{ id: 'w-1', typeId: 'universe.world', label: 'Scene', values: {} }]]
    ])('mounts no backdrop with %s', (_label, nodes) => {
        window.localStorage.setItem(ROOM_STORAGE_KEY, makeWorkspaceDoc(nodes))
        const { container } = render(<RawEditor localStorageKey={ROOM_STORAGE_KEY} canvasMode />)
        expect(container.querySelector('.raw-world-overlay')).toBeNull()
        expect(container.querySelector('.raw-surface-shell.is-world-overlay')).toBeNull()
    })

    // With the wallpaper gone, the palette is the zen route into the scene.
    // The command is "Full screen", NOT "Scene": the palette also lists the
    // node type Scene (universe.world), and two entries answering to one word
    // meant typing it ran the command instead of placing the node.
    it('the palette offers Full screen, and running it opens the fullscreen scene', () => {
        window.localStorage.setItem(ROOM_STORAGE_KEY, makeWorkspaceDoc([
            { id: 'c-1', typeId: 'geom.cube', label: 'Cube', values: {} }
        ]))
        render(<RawEditor localStorageKey={ROOM_STORAGE_KEY} canvasMode />)
        fireEvent.doubleClick(screen.getByTestId('mock-graph'))
        fireEvent.change(screen.getByPlaceholderText('type a node or panel name…'), { target: { value: 'Full screen' } })
        fireEvent.keyDown(screen.getByPlaceholderText('type a node or panel name…'), { key: 'Enter' })
        expect(screen.getByRole('button', { name: '← Graph' })).toBeTruthy()
    })
})

describe('RawEditor chrome sweep (plan PR 1.6)', () => {
    const KEY = 'test-chrome-sweep'
    afterEach(() => {
        window.localStorage.removeItem(KEY)
        viewportMountProps.length = 0
    })

    it('Escape at the top of the stack exits the fullscreen scene', () => {
        window.localStorage.setItem(KEY, makeWorkspaceDoc([
            { id: 'c-1', typeId: 'geom.cube', label: 'Cube', values: {} }
        ]))
        render(<RawEditor localStorageKey={KEY} canvasMode />)
        fireEvent.doubleClick(screen.getByTestId('mock-graph'))
        fireEvent.change(screen.getByPlaceholderText('type a node or panel name…'), { target: { value: 'Full screen' } })
        fireEvent.keyDown(screen.getByPlaceholderText('type a node or panel name…'), { key: 'Enter' })
        expect(screen.getByRole('button', { name: '← Graph' })).toBeTruthy()
        fireEvent.keyDown(window, { key: 'Escape' })
        expect(screen.queryByRole('button', { name: '← Graph' })).toBeNull()
    })

    it('every default window position names a registered type — no phantoms', () => {
        for (const typeId of Object.keys(WINDOW_DEFAULT_POSITIONS)) {
            expect(getNodeType(typeId), typeId).toBeTruthy()
        }
    })

    it('the ⋯ menu no longer offers the Streaming Prototype (eight shells in one click)', () => {
        window.localStorage.setItem(KEY, makeWorkspaceDoc([
            { id: 'c-1', typeId: 'geom.cube', label: 'Cube', values: {} }
        ]))
        render(<RawEditor localStorageKey={KEY} />)
        fireEvent.click(screen.getByRole('button', { name: '⋯' }))
        expect(screen.queryByRole('button', { name: 'Streaming Prototype' })).toBeNull()
    })

    it('two Scene windows in one room show ONE sky — both viewports get the scope-resolved world', () => {
        window.localStorage.setItem(KEY, JSON.stringify({
            nodes: [
                { id: 'w1', typeId: 'universe.world', label: 'Scene', values: { bgColor: '#101010', frame: { visible: true, x: 20, y: 80, width: 300, height: 200 } } },
                { id: 'w2', typeId: 'universe.world', label: 'Scene', values: { bgColor: '#909090', frame: { visible: true, x: 360, y: 80, width: 300, height: 200 } } }
            ],
            edges: [],
            workspaceState: { liveWorldNodeIdByScope: { '': 'w2' } }
        }))
        render(<RawEditor localStorageKey={KEY} />)
        const worldIds = viewportMountProps.map((props) => props.worldNode?.id).filter(Boolean)
        expect(worldIds.length).toBeGreaterThanOrEqual(2)
        expect(new Set(worldIds).size).toBe(1)
        expect(worldIds[0]).toBe('w2')
    })

    it('the topbar count is THIS room, not the whole document', () => {
        window.localStorage.setItem(KEY, JSON.stringify({
            nodes: [
                { id: 'geo', typeId: 'geom.geo', label: 'Geo', values: {} },
                { id: 'a', typeId: 'geom.cube', label: 'Cube', parentId: 'geo', values: {} },
                { id: 'b', typeId: 'geom.cube', label: 'Cube', parentId: 'geo', values: {} }
            ],
            edges: [],
            workspaceState: {}
        }))
        render(<RawEditor localStorageKey={KEY} />)
        expect(screen.getByRole('button', { name: '1 nodes' })).toBeTruthy()
    })
})

describe('RawEditor hardware Back (mobile finding #3)', () => {
    const KEY = 'test-back-root'
    afterEach(() => { window.localStorage.removeItem(KEY) })

    it('Back at ROOT keeps the canvas — no false-empty data-loss state', () => {
        window.localStorage.setItem(KEY, JSON.stringify({
            nodes: [{ id: 'c1', typeId: 'geom.cube', label: 'Cube', values: {} }],
            edges: [], workspaceState: {}
        }))
        render(<RawEditor localStorageKey={KEY} />)
        expect(screen.getByRole('button', { name: '1 nodes' })).toBeTruthy()
        act(() => { window.dispatchEvent(new PopStateEvent('popstate')) })
        // the node count survives — the old guard navigated to index -1 and
        // rendered "place your first node" over an intact document
        expect(screen.getByRole('button', { name: '1 nodes' })).toBeTruthy()
        expect(screen.queryByText(/place your first node/i)).toBeNull()
    })

    it('Back inside a scope still pops one level', () => {
        window.localStorage.setItem(KEY, JSON.stringify({
            nodes: [{ id: 'geo', typeId: 'geom.geo', label: 'Geo', values: {} }],
            edges: [], workspaceState: {}
        }))
        render(<RawEditor localStorageKey={KEY} />)
        fireEvent.click(screen.getByRole('button', { name: 'enter-first-node' }))
        expect(screen.getByText(/inside/)).toBeTruthy()
        act(() => { window.dispatchEvent(new PopStateEvent('popstate')) })
        expect(screen.queryByText(/inside/)).toBeNull()
    })
})

describe('RawEditor Create window back-compat (plan PR 1.7)', () => {
    const KEY = 'test-create-backcompat'
    afterEach(() => { window.localStorage.removeItem(KEY) })

    it('an existing view.library node still renders its window — retired from the palette, not from documents', () => {
        window.localStorage.setItem(KEY, JSON.stringify({
            nodes: [{ id: 'lib', typeId: 'view.library', label: 'Create', values: { frame: { visible: true, x: 40, y: 90, width: 260, height: 380 } } }],
            edges: [],
            workspaceState: {}
        }))
        render(<RawEditor localStorageKey={KEY} />)
        expect(screen.getByText('Create')).toBeTruthy()
    })
})

// "Make me a scene" is an offer for a truly blank desk, not a trapdoor: a
// stray double-click inside a fresh Geo used to inject the whole six-node
// demo INTO the container the person was filling (seen live 2026-08-20).
describe('RawEditor make-me-a-scene scoping', () => {
    const SCENE_STORAGE_KEY = 'test-make-scene-scope'

    afterEach(() => {
        window.localStorage.removeItem(SCENE_STORAGE_KEY)
    })

    it('offers the demo on a truly blank desk', () => {
        window.localStorage.setItem(SCENE_STORAGE_KEY, makeWorkspaceDoc([]))
        render(<RawEditor localStorageKey={SCENE_STORAGE_KEY} canvasMode />)
        expect(screen.getByRole('button', { name: 'make-me-a-scene' })).toBeTruthy()
    })

    it('never offers it inside a container — an empty Geo is yours, not a demo stage', () => {
        window.localStorage.setItem(SCENE_STORAGE_KEY, makeWorkspaceDoc([
            { id: 'geo-1', typeId: 'geom.geo', label: 'Geo', values: {} }
        ]))
        render(<RawEditor localStorageKey={SCENE_STORAGE_KEY} canvasMode />)
        fireEvent.click(screen.getByRole('button', { name: 'enter-first-node' }))
        expect(screen.queryByRole('button', { name: 'make-me-a-scene' })).toBeNull()
    })
})

// A spatial node lands IN THE ROOM at the click — its card used to land
// centred on the very same click, burying the thing it had just made.
describe('RawEditor spatial card placement', () => {
    it('a spatial card steps below the click; a hidden card stays centred', () => {
        mockApplyLocalOps.mockClear()
        render(<RawEditor localStorageKey="test-card-offset" canvasMode />)
        const create = (query) => {
            fireEvent.doubleClick(screen.getByTestId('mock-graph'))
            fireEvent.change(screen.getByPlaceholderText('type a node or panel name…'), { target: { value: query } })
            fireEvent.keyDown(screen.getByPlaceholderText('type a node or panel name…'), { key: 'Enter' })
            const batches = mockApplyLocalOps.mock.calls.map(([ops]) => (Array.isArray(ops) ? ops : [ops]))
            return batches.flat().filter((op) => op.type === 'createNode').at(-1).payload.node
        }
        const cube = create('Cube')
        const number = create('Number')
        expect(cube.typeId).toBe('geom.cube')
        expect(number.typeId).toBe('value.number')
        // Same (defaulted) click point for both — the spatial card must sit
        // clearly lower than the code card.
        expect(cube.graphY).toBeGreaterThan(number.graphY + 60)
        window.localStorage.removeItem('test-card-offset')
    })
})

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
                { id: 'world-1', typeId: 'universe.world', label: 'Scene', parentId: null, values: {} }
            ])
        )
        mockApplyLocalOps.mockClear()
        render(<RawEditor localStorageKey={FREE_NEST_STORAGE_KEY} />)

        fireEvent.doubleClick(screen.getByTestId('mock-graph'))
        fireEvent.change(screen.getByPlaceholderText('type a node or panel name…'), { target: { value: 'Scene' } })
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

    it('says the empty local canvas is a local canvas, on the canvas itself', () => {
        // The only other place that says so is the topbar title, and an empty
        // workspace opens in zen, which hides the topbar. So at the moment a
        // first-time visitor arrives from "Step inside", nothing on screen told
        // them a browser-only scratch surface apart from a space that keeps
        // their work — and the landing sends everyone here.
        mockPointer(false)
        render(<RawEditor localStorageKey={HINT_STORAGE_KEY} />)
        expect(screen.getByText(/nothing here is saved to a space yet/i)).toBeTruthy()
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
                    { id: 'world-1', typeId: 'universe.world', label: 'Scene', parentId: null, values: { title: 'Static Title' } }
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

describe('RawEditor stream.monitor panel', () => {
    const MONITOR_STORAGE_KEY = 'test-stream-monitor'

    afterEach(() => {
        window.localStorage.removeItem(MONITOR_STORAGE_KEY)
    })

    // Implemented 2026-08-20 (was a gated shell since 2026-07-30). With no
    // texture wired it must say so quietly rather than fall through to the
    // generic text-panel placeholder — the exact trap the audit counted.
    it('renders its own empty state, not the generic text-panel fallback', () => {
        window.localStorage.setItem(
            MONITOR_STORAGE_KEY,
            makeWorkspaceDoc([
                { id: 'mon-1', typeId: 'stream.monitor', label: 'Monitor', parentId: null, values: {} }
            ])
        )
        render(<RawEditor localStorageKey={MONITOR_STORAGE_KEY} />)

        expect(screen.getByText(/Wire a texture into Source/)).toBeInTheDocument()
        expect(screen.queryByText('This panel is ready for authored UI.')).toBeNull()
    })
})

// A window and its graph card are two views of ONE node, and nothing used to
// say so: the card said "the scene" in the family's colour while the window said
// UNIVERSE.WORLD in grey, and both wore the same cyan frame. The window now
// carries the family's word and the family's hue.
describe('RawEditor window identity', () => {
    const IDENTITY_KEY = 'test-window-identity'

    afterEach(() => {
        window.localStorage.removeItem(IDENTITY_KEY)
    })

    it('names the family on the window, not the internal type id', () => {
        window.localStorage.setItem(
            IDENTITY_KEY,
            makeWorkspaceDoc([
                { id: 'world-1', typeId: 'universe.world', label: 'Scene', parentId: null, values: {} }
            ])
        )
        render(<RawEditor localStorageKey={IDENTITY_KEY} />)

        const dialog = screen.getByRole('dialog', { name: 'Scene' })
        expect(dialog.textContent).toContain('the scene')
        expect(dialog.textContent).not.toContain('universe.world')
    })

    it('hands the window its node\'s family colour, so it matches its card', () => {
        window.localStorage.setItem(
            IDENTITY_KEY,
            makeWorkspaceDoc([
                { id: 'world-1', typeId: 'universe.world', label: 'Scene', parentId: null, values: {} }
            ])
        )
        render(<RawEditor localStorageKey={IDENTITY_KEY} />)

        const dialog = screen.getByRole('dialog', { name: 'Scene' })
        // getNodeFamily('universe.world') → the 'room' family
        expect(dialog.style.getPropertyValue('--window-accent')).toBe('#bd93f9')
    })
})

// Create is the Studio panel that carries a verb: the Outliner lists and the
// Inspector edits, but before view.library existed a visitor could enter the
// Studio node, look at an empty scene, and have no way to put anything in it.
describe('RawEditor view.library panel', () => {
    const LIBRARY_STORAGE_KEY = 'test-view-library'

    afterEach(() => {
        window.localStorage.removeItem(LIBRARY_STORAGE_KEY)
        mockApplyLocalOps.mockClear()
    })

    const renderWithLibrary = () => {
        window.localStorage.setItem(
            LIBRARY_STORAGE_KEY,
            makeWorkspaceDoc([
                { id: 'lib-1', typeId: 'view.library', label: 'Create', parentId: null, values: {} }
            ])
        )
        render(<RawEditor localStorageKey={LIBRARY_STORAGE_KEY} />)
    }

    it('offers the shared entity palette, not the generic text-panel fallback', () => {
        renderWithLibrary()

        expect(screen.getByRole('button', { name: /box/ })).toBeTruthy()
        expect(screen.getByRole('button', { name: /Ambient/ })).toBeTruthy()
        expect(screen.queryByText('This panel is ready for authored UI.')).toBeNull()
    })

    it('creates a real entity through the shared createEntity op', () => {
        renderWithLibrary()
        mockApplyLocalOps.mockClear()

        fireEvent.click(screen.getByRole('button', { name: /box/ }))

        const created = mockApplyLocalOps.mock.calls
            .map(([ops]) => (Array.isArray(ops) ? ops : [ops]))
            .flat()
            .find((op) => op.type === 'createEntity')
        expect(created).toBeTruthy()
        expect(created.payload.entity.type).toBe('box')
        // A shape dropped at the world origin every time reads as broken the
        // second time you press the same button.
        expect(created.payload.entity.components?.transform?.position).toBeTruthy()
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
                { id: 'world-1', typeId: 'universe.world', label: 'Scene', parentId: null, values: {} }
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
                { id: 'world-1', typeId: 'universe.world', label: 'Scene', parentId: null, values: {} }
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


// A document built to catch ONE wiring mistake, because nothing simpler can.
//
// The sheet must be handed every node in the document, not the cards in the
// scope you are standing in. Most fixtures cannot tell those apart: the doors
// on the container you are inside are its children, so they are in the scoped
// list too, and a scoped-list version of this sheet passes.
//
// What is NOT in the scoped list is the far end of a wire coming in from
// outside — and if that far end is itself a container, the port the wire leaves
// by is a door standing inside IT, two scopes away. Name that port and the
// sheet has read the whole document; hand it the scoped list and the label
// falls back to the door's raw id, which is a uuid nobody can read.
//
// So: a Source container with an Out door called Beat, wired into a Camera door
// on the container we walk into. Standing inside the second one, the sheet has
// to say "wired from Source · Beat".
const ANATOMY_STORAGE_KEY = 'test-anatomy-ws'
const FAR_DOOR_ID = 'door-out-of-source'
const makeDoorwayDoc = () => JSON.stringify({
    nodes: [
        { id: 'box', typeId: 'universe.space', label: 'A container', values: {} },
        {
            id: 'door-in',
            typeId: 'port.in',
            label: 'In',
            parentId: 'box',
            values: { label: 'Camera', portType: 'vec3' }
        },
        { id: 'source', typeId: 'universe.space', label: 'Source', values: {} },
        {
            id: FAR_DOOR_ID,
            typeId: 'port.out',
            label: 'Out',
            parentId: 'source',
            values: { label: 'Beat', portType: 'vec3' }
        },
        { id: 'start', typeId: 'value.vec3', label: 'Start position', parentId: 'source', values: { value: [9, 9, 9] } }
    ],
    edges: [
        { id: 'e0', fromNodeId: 'start', fromPort: 'out', toNodeId: FAR_DOOR_ID, toPort: 'value' },
        { id: 'e1', fromNodeId: 'source', fromPort: FAR_DOOR_ID, toNodeId: 'box', toPort: 'door-in' }
    ],
    workspaceState: {}
})

describe('RawEditor — what a node is made of', () => {
    afterEach(() => {
        window.localStorage.removeItem(ANATOMY_STORAGE_KEY)
    })

    const enterTheContainer = () => {
        window.localStorage.setItem(ANATOMY_STORAGE_KEY, makeDoorwayDoc())
        render(<RawEditor localStorageKey={ANATOMY_STORAGE_KEY} />)
        fireEvent.click(screen.getByRole('button', { name: 'enter-first-node' }))
    }

    it('is not offered at the top level — there is no node you are standing in', () => {
        window.localStorage.setItem(ANATOMY_STORAGE_KEY, makeDoorwayDoc())
        render(<RawEditor localStorageKey={ANATOMY_STORAGE_KEY} />)
        expect(screen.queryByRole('button', { name: /made of/i })).toBeNull()
        expect(screen.queryByRole('button', { name: 'explain-scope' })).toBeNull()
    })

    // THE wiring assertion. NodeAnatomyPanel can be perfect while the editor
    // hands it the wrong node list or a context it built itself, and only a
    // value that has travelled the whole way — a card two scopes out, through
    // that container's own door, down a wire, onto this container's face — can
    // tell the difference.
    //
    // Watched red: swapping `allNodes: authoredNodes` for the scoped card list
    // renders "wired from Source · door-out-of-source" and fails here, while
    // every other test in this file stays green.
    it('reads a socket fed from outside, through a door, with the app own graph', () => {
        enterTheContainer()
        fireEvent.click(screen.getByRole('button', { name: /what is it made of/i }))
        const sheet = document.querySelector('.raw-anatomy')
        expect(sheet).toBeTruthy()
        expect(sheet.textContent).toContain('9, 9, 9')
        expect(sheet.textContent).toContain('wired from Source · Beat')
        expect(sheet.textContent).not.toContain(FAR_DOOR_ID)
        expect(sheet.textContent).toContain('this socket is the door \u201cCamera\u201d standing inside it')
    })

    // The empty-canvas entry point exists only inside CODE-made nodes, where
    // the empty canvas IS the question; a container's reading stays one tap
    // away on the marker's ? — two resident buttons for one answer was the
    // clutter the audit counted.
    it('offers the empty-canvas way in only inside a code-made node', () => {
        enterTheContainer()
        expect(screen.queryByRole('button', { name: 'explain-scope' })).toBeNull()
        cleanup()
        window.localStorage.setItem(ANATOMY_STORAGE_KEY, JSON.stringify({
            nodes: [{ id: 'cube', typeId: 'geom.cube', label: 'A cube', values: {} }],
            edges: [],
            workspaceState: {}
        }))
        render(<RawEditor localStorageKey={ANATOMY_STORAGE_KEY} />)
        fireEvent.click(screen.getByRole('button', { name: 'enter-first-node' }))
        fireEvent.click(screen.getByRole('button', { name: 'explain-scope' }))
        expect(document.querySelector('.raw-anatomy')).toBeTruthy()
    })

    // A sheet describing the node you have walked out of looks current and is
    // not, which is worse than no sheet.
    it('closes itself when you leave the node', () => {
        enterTheContainer()
        fireEvent.click(screen.getByRole('button', { name: /what is it made of/i }))
        expect(document.querySelector('.raw-anatomy')).toBeTruthy()
        // By class, not by name: the way out is labelled with a chevron and
        // carries "Leave" only as a title, so its accessible name is the glyph.
        fireEvent.click(document.querySelector('.raw-scope-marker-out'))
        expect(document.querySelector('.raw-anatomy')).toBeNull()
    })
})


describe('RawEditor — the room behind the graph', () => {
    afterEach(() => {
        window.localStorage.removeItem(ANATOMY_STORAGE_KEY)
    })

    // The desk is flat paper in every scope — spatial content included
    // (owner, 2026-08-20: "i mean clear desk"). The room is a view you open,
    // not wallpaper.
    it('the desk stays flat in every scope, spatial content or not', () => {
        window.localStorage.setItem(ANATOMY_STORAGE_KEY, JSON.stringify({
            nodes: [
                { id: 'geo', typeId: 'geom.geo', label: 'Geo', values: {} },
                { id: 'cube', typeId: 'geom.cube', label: 'Cube', parentId: 'geo', values: {} }
            ],
            edges: [],
            workspaceState: {}
        }))
        const { container } = render(<RawEditor localStorageKey={ANATOMY_STORAGE_KEY} />)
        expect(container.querySelector('.raw-world-overlay')).toBeNull()
        fireEvent.click(screen.getByRole('button', { name: 'enter-first-node' }))
        expect(container.querySelector('.raw-world-overlay')).toBeNull()
    })

    // Fullscreen used to cancel on every scope step, so the render and the
    // graph could never be part of one journey. Now a door swaps which room
    // fills the screen — the TouchDesigner go-inside/come-out feel.
    it('keeps the fullscreen scene across scope navigation', () => {
        window.localStorage.setItem(ANATOMY_STORAGE_KEY, makeDoorwayDoc())
        render(<RawEditor localStorageKey={ANATOMY_STORAGE_KEY} />)
        fireEvent.click(screen.getByRole('button', { name: 'Scene' }))
        expect(screen.getByRole('button', { name: '← Graph' })).toBeTruthy()
        fireEvent.click(screen.getByRole('button', { name: 'enter-first-node' }))
        expect(screen.getByRole('button', { name: '← Graph' })).toBeTruthy()
        // …and the on-surface exit works without any chrome at all.
        fireEvent.click(document.querySelector('.raw-room-exit'))
        expect(screen.queryByRole('button', { name: '← Graph' })).toBeNull()
    })
})

describe('RawEditor show clock stamp', () => {
    // applyLocalOps is a no-op mock in this harness, so the document never
    // actually gains the epoch — the contract under test is the op itself:
    // fired once with a wall-clock stamp, and only when it should be.
    const CLOCK_KEY = 'test-show-clock'
    const timeDoc = () => makeWorkspaceDoc([{ id: 't1', typeId: 'time', label: 'Time', values: {} }])
    const stampCalls = () => mockApplyLocalOps.mock.calls
        .flat(2)
        .filter((op) => op?.type === 'setShowState')

    afterEach(() => {
        window.localStorage.removeItem(CLOCK_KEY)
    })

    it('stamps showState.clockEpoch once when a Time node exists', async () => {
        mockApplyLocalOps.mockClear()
        const start = Date.now()
        window.localStorage.setItem(CLOCK_KEY, timeDoc())
        render(<RawEditor localStorageKey={CLOCK_KEY} />)
        await waitFor(() => expect(stampCalls().length).toBe(1))
        const epoch = stampCalls()[0].payload?.patch?.clockEpoch
        expect(epoch).toBeGreaterThanOrEqual(start)
        expect(epoch).toBeLessThanOrEqual(Date.now())
    })

    it('never re-stamps an already-stamped clock', async () => {
        mockApplyLocalOps.mockClear()
        const doc = JSON.parse(timeDoc())
        doc.showState = { clockEpoch: 1700000000000 }
        window.localStorage.setItem(CLOCK_KEY, JSON.stringify(doc))
        render(<RawEditor localStorageKey={CLOCK_KEY} />)
        await act(async () => { await Promise.resolve() })
        expect(stampCalls()).toEqual([])
    })

    it('leaves a document without a Time node unstamped', async () => {
        mockApplyLocalOps.mockClear()
        window.localStorage.setItem(CLOCK_KEY, makeWorkspaceDoc([makeNodeZero()]))
        render(<RawEditor localStorageKey={CLOCK_KEY} />)
        await act(async () => { await Promise.resolve() })
        expect(stampCalls()).toEqual([])
    })
})
