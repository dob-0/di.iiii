import { render, screen, act } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

// The out surface is a room and nothing else — the viewport mock records its
// props so the tests can read what the audience would be given.
const viewportProps = []
vi.mock('./RawViewport.jsx', () => ({
    default: function MockRawViewport(props) {
        viewportProps.push(props)
        return <div data-testid="mock-out-viewport">{(props.document?.nodes || []).length} nodes</div>
    }
}))
vi.mock('../../project/hooks/useProjectDocumentSync.js', () => ({
    useProjectDocumentSync: () => ({ applyLocalOps: vi.fn(), replaceDocument: vi.fn() })
}))

import RawOutSurface from './RawOutSurface.jsx'

const KEY = 'dii.localNodeWorkspace.test-out'
const writeDoc = (nodes) => window.localStorage.setItem(KEY, JSON.stringify({ nodes, edges: [], workspaceState: {} }))

afterEach(() => {
    window.localStorage.removeItem(KEY)
    viewportProps.length = 0
})

describe('RawOutSurface', () => {
    it('renders the room read-only: no selection, no cursors, no edit handlers', () => {
        writeDoc([{ id: 'c1', typeId: 'geom.cube', label: 'Cube', values: {} }])
        render(<RawOutSurface localStorageKey={KEY} />)
        const props = viewportProps.at(-1)
        expect(props.selectedNodeId).toBeNull()
        expect(props.cursors).toEqual([])
        expect(props.onSelectNode).toBeUndefined()
        expect(props.onMoveNode).toBeUndefined()
        expect(props.onWorldDoubleClick).toBeUndefined()
        expect(props.showEmptyHint).toBe(false)
        // Handlers-not-passed is not enough: OrbitControls mounts its own DOM
        // listeners, so the surface must explicitly refuse interaction.
        expect(props.interactive).toBe(false)
        expect(screen.getByText('1 nodes')).toBeInTheDocument()
    })

    it('aims at the scope it was given', () => {
        writeDoc([{ id: 'geo', typeId: 'geom.geo', label: 'Geo', values: {} }])
        render(<RawOutSurface localStorageKey={KEY} scopeId="geo" />)
        expect(viewportProps.at(-1).scopeId).toBe('geo')
    })

    // The desk writes localStorage on every change; the storage event is the
    // one channel another window of the same browser gets for free. Without
    // this, a second window shows a snapshot and silently drifts.
    it('follows the desk live across windows via storage events', () => {
        writeDoc([{ id: 'c1', typeId: 'geom.cube', label: 'Cube', values: {} }])
        render(<RawOutSurface localStorageKey={KEY} />)
        expect(screen.getByText('1 nodes')).toBeInTheDocument()

        writeDoc([
            { id: 'c1', typeId: 'geom.cube', label: 'Cube', values: {} },
            { id: 'l1', typeId: 'world.light', parentId: 'c1', label: 'Light', values: {} }
        ])
        act(() => {
            window.dispatchEvent(new StorageEvent('storage', { key: KEY }))
        })
        expect(screen.getByText('2 nodes')).toBeInTheDocument()
    })

    it('ignores storage events for other keys', () => {
        writeDoc([{ id: 'c1', typeId: 'geom.cube', label: 'Cube', values: {} }])
        render(<RawOutSurface localStorageKey={KEY} />)
        window.localStorage.setItem('dii.localNodeWorkspace.other', JSON.stringify({ nodes: [{ id: 'x', typeId: 'geom.cube', values: {} }, { id: 'y', typeId: 'geom.cube', values: {} }, { id: 'z', typeId: 'geom.cube', values: {} }], edges: [], workspaceState: {} }))
        act(() => {
            window.dispatchEvent(new StorageEvent('storage', { key: 'dii.localNodeWorkspace.other' }))
        })
        expect(screen.getByText('1 nodes')).toBeInTheDocument()
        window.localStorage.removeItem('dii.localNodeWorkspace.other')
    })
})
