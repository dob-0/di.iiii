import { render, screen, fireEvent } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const mockApplyLocalOps = vi.fn()
const mockReplaceDocument = vi.fn(() => Promise.resolve())
vi.mock('../../project/hooks/useProjectDocumentSync.js', () => ({
    useProjectDocumentSync: () => ({ applyLocalOps: mockApplyLocalOps, replaceDocument: mockReplaceDocument })
}))
vi.mock('../../project/hooks/useProjectPresence.js', () => ({
    useProjectPresence: () => ({ users: [], cursors: [], emitCursor: vi.fn(), clearCursor: vi.fn() })
}))
vi.mock('../../hooks/useXrAr.js', () => ({
    default: () => ({
        xrStore: {},
        isXrPresenting: false,
        canEnterVr: false,
        canEnterAr: false,
        handleEnterXrSession: vi.fn(),
        handleExitXrSession: vi.fn()
    })
}))
vi.mock('../../hooks/useSpaceAssets.js', () => ({
    default: () => ({ assets: [], refresh: vi.fn() })
}))
vi.mock('../../services/serverSpaces.js', () => ({
    getServerSpace: () => Promise.resolve(null),
    listServerSpaces: () => Promise.resolve([]),
    deleteServerAsset: () => Promise.resolve(),
    importCommonsAssets: () => Promise.resolve({}),
    importDriveAssets: () => Promise.resolve({}),
    importDriveSelection: () => Promise.resolve({}),
    setAssetShared: () => Promise.resolve(),
    updateServerSpace: () => Promise.resolve()
}))
// StudioShell renders the whole editor UI; stub it with a single button that
// exercises the one path this test cares about (creating an entity, which
// seeds undo history) so undo/redo can be exercised without the real shell.
vi.mock('./StudioShell.jsx', () => ({
    default: (props) => (
        <>
            <button type="button" onClick={() => props.onCreateEntity('box')}>create-entity</button>
            <button type="button" onClick={props.onUndo}>shell-undo</button>
            <button type="button" onClick={props.onRedo}>shell-redo</button>
            <span data-testid="shell-sync" data-has-loaded={String(props.syncState?.hasLoaded)} data-load-error={String(props.syncState?.loadError)} />
        </>
    )
}))

import StudioEditor from './StudioEditor.jsx'

describe('StudioEditor undo/redo', () => {
    afterEach(() => {
        mockApplyLocalOps.mockClear()
        mockReplaceDocument.mockClear()
    })

    const batches = () => mockApplyLocalOps.mock.calls
        .map(([ops]) => (Array.isArray(ops) ? ops : [ops]))

    it('does not emit anything on Ctrl+Z when history is empty', () => {
        render(<StudioEditor projectId="proj-1" />)
        expect(() => {
            fireEvent.keyDown(window, { key: 'z', ctrlKey: true })
        }).not.toThrow()
        expect(mockApplyLocalOps).not.toHaveBeenCalled()
        expect(mockReplaceDocument).not.toHaveBeenCalled()
    })

    it('undo replays inverse ops through the ops path — never replaceDocument, never a local-only dispatch', () => {
        render(<StudioEditor projectId="proj-1" />)

        fireEvent.click(screen.getByRole('button', { name: 'create-entity' }))
        const created = batches()[0][0]
        expect(created.type).toBe('createEntity')

        fireEvent.keyDown(window, { key: 'z', ctrlKey: true })

        const undoBatch = batches()[1]
        expect(undoBatch).toEqual([{ type: 'deleteEntity', payload: { entityId: created.payload.entity.id } }])
        expect(mockReplaceDocument).not.toHaveBeenCalled()
    })

    it('redo re-applies the forward ops without stale opIds', () => {
        render(<StudioEditor projectId="proj-1" />)

        fireEvent.click(screen.getByRole('button', { name: 'create-entity' }))
        fireEvent.keyDown(window, { key: 'z', ctrlKey: true })
        fireEvent.keyDown(window, { key: 'z', ctrlKey: true, shiftKey: true })

        const redoBatch = batches()[2]
        expect(redoBatch).toHaveLength(1)
        expect(redoBatch[0].type).toBe('createEntity')
        expect(redoBatch[0].payload.entity.id).toBe(batches()[0][0].payload.entity.id)
        expect(redoBatch[0].opId).toBeUndefined()
        expect(mockReplaceDocument).not.toHaveBeenCalled()
    })

    // UX audit F025: undo was a key only. The shell now gets onUndo / onRedo, and they must be the very same
    // calls the key makes: inverse ops through applyLocalOps, never replaceDocument.
    it('the Undo and Redo buttons of the shell run the same op path as Ctrl+Z', () => {
        render(<StudioEditor projectId="proj-1" />)
        fireEvent.click(screen.getByRole('button', { name: 'create-entity' }))
        const created = batches()[0][0]

        fireEvent.click(screen.getByRole('button', { name: 'shell-undo' }))
        expect(batches()[1]).toEqual([{ type: 'deleteEntity', payload: { entityId: created.payload.entity.id } }])

        fireEvent.click(screen.getByRole('button', { name: 'shell-redo' }))
        const redoBatch = batches()[2]
        expect(redoBatch[0].type).toBe('createEntity')
        expect(redoBatch[0].payload.entity.id).toBe(created.payload.entity.id)
        expect(mockReplaceDocument).not.toHaveBeenCalled()
    })

    it('the Undo button with an empty history emits nothing', () => {
        render(<StudioEditor projectId="proj-1" />)
        fireEvent.click(screen.getByRole('button', { name: 'shell-undo' }))
        expect(mockApplyLocalOps).not.toHaveBeenCalled()
    })

    // Review of S03: the save line said "Saved" before the project had loaded. It can only know if the Studio
    // hands it the store's hasLoaded and loadError, so the Studio must.
    it('hands the shell hasLoaded and loadError for the save line', () => {
        render(<StudioEditor projectId="proj-1" />)
        const probe = screen.getByTestId('shell-sync')
        expect(probe.dataset.hasLoaded).not.toBe('undefined')
        expect(probe.dataset.loadError).not.toBe('undefined')
    })
})
