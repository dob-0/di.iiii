import { render, screen, fireEvent } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const mockReplaceDocument = vi.fn(() => Promise.resolve())
vi.mock('../../project/hooks/useProjectDocumentSync.js', () => ({
    useProjectDocumentSync: () => ({ applyLocalOps: vi.fn(), replaceDocument: mockReplaceDocument })
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
vi.mock('../hooks/useStudioLayoutPrefs.js', () => ({
    useStudioLayoutPrefs: () => ({ layout: {}, updateLayout: vi.fn() })
}))
// StudioShell renders the whole editor UI; stub it with a single button that
// exercises the one path this test cares about (creating an entity, which
// seeds undo history) so undo/redo can be exercised without the real shell.
vi.mock('./StudioShell.jsx', () => ({
    default: (props) => (
        <button type="button" onClick={() => props.onCreateEntity('box')}>create-entity</button>
    )
}))

import StudioEditor from './StudioEditor.jsx'

describe('StudioEditor undo/redo', () => {
    afterEach(() => {
        mockReplaceDocument.mockClear()
    })

    it('does not throw on Ctrl+Z when history is empty', () => {
        render(<StudioEditor projectId="proj-1" />)
        expect(() => {
            fireEvent.keyDown(window, { key: 'z', ctrlKey: true })
        }).not.toThrow()
        expect(mockReplaceDocument).not.toHaveBeenCalled()
    })

    it('routes undo through replaceDocument (network-backed), not a local-only dispatch', () => {
        render(<StudioEditor projectId="proj-1" />)

        fireEvent.click(screen.getByRole('button', { name: 'create-entity' }))
        fireEvent.keyDown(window, { key: 'z', ctrlKey: true })

        expect(mockReplaceDocument).toHaveBeenCalledTimes(1)
    })
})
