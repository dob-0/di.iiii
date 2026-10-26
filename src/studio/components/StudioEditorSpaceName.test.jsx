import { render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// One name per space (owner, 2026-09-14; docs/ai/vocabulary.md): Studio's bar says the space's name, else its address, and
// links to the address. StudioEditor is where the space's record meets the shell, so what it hands the shell is pinned here;
// StudioShell's side (the bar) is pinned in components/surfaceBar.embed.test.jsx.

vi.mock('../../project/hooks/useProjectDocumentSync.js', () => ({
    useProjectDocumentSync: () => ({ applyLocalOps: vi.fn(), replaceDocument: vi.fn(() => Promise.resolve()) })
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

const getServerSpaceMock = vi.fn()
vi.mock('../../services/serverSpaces.js', () => ({
    getServerSpace: (...args) => getServerSpaceMock(...args),
    listServerSpaces: () => Promise.resolve([]),
    deleteServerAsset: () => Promise.resolve(),
    importCommonsAssets: () => Promise.resolve({}),
    importDriveAssets: () => Promise.resolve({}),
    importDriveSelection: () => Promise.resolve({}),
    setAssetShared: () => Promise.resolve(),
    updateServerSpace: () => Promise.resolve()
}))

// The real shell draws the whole editor; this one shows only what the editor tells it about the space.
vi.mock('./StudioShell.jsx', () => ({
    default: ({ liveProjectState }) => (
        <p data-testid="told">{JSON.stringify({
            spaceId: liveProjectState?.spaceId,
            spaceLabel: liveProjectState?.spaceLabel,
            spaceAddress: liveProjectState?.spaceAddress
        })}</p>
    )
}))

import StudioEditor from './StudioEditor.jsx'

const told = () => JSON.parse(screen.getByTestId('told').textContent)

describe('what StudioEditor tells the shell about the space', () => {
    beforeEach(() => {
        getServerSpaceMock.mockReset()
    })

    it('is the name and the address of the platform\'s own space, whichever address was typed', async () => {
        getServerSpaceMock.mockResolvedValue({ id: 'main', slug: 'di-iiii', label: 'di.iiii', publishedProjectId: 'main-dii-project' })
        for (const typed of ['main', 'di-iiii']) {
            const { unmount } = render(<StudioEditor projectId="main-dii-project" spaceId={typed} />)
            await waitFor(() => expect(told().spaceLabel, typed).toBe('di.iiii'))
            expect(told().spaceAddress, typed).toBe('di-iiii')
            // the tools still open from the space as the surface was reached
            expect(told().spaceId, typed).toBe(typed)
            unmount()
        }
    })

    it('is the address as the name, for a space that has no name — not the id it was typed as', async () => {
        getServerSpaceMock.mockResolvedValue({ id: 'queerlab', slug: 'queer-lab', label: '', publishedProjectId: null })

        render(<StudioEditor projectId="p" spaceId="queerlab" />)

        await waitFor(() => expect(told().spaceAddress).toBe('queer-lab'))
        expect(told().spaceLabel).toBe('queer-lab')
    })

    it('is the id, as name and address, until the space has answered and when it cannot', async () => {
        getServerSpaceMock.mockRejectedValue(new Error('network down'))

        render(<StudioEditor projectId="p" spaceId="queerlab" />)

        expect(told()).toEqual({ spaceId: 'queerlab', spaceLabel: 'queerlab', spaceAddress: 'queerlab' })
        await waitFor(() => expect(getServerSpaceMock).toHaveBeenCalled())
        expect(told().spaceAddress).toBe('queerlab')
    })
})
