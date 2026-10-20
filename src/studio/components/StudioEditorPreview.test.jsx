import { render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// The Studio's Preview button (owner 2026-10-13: "from studio I can't find the button to go to the
// preview"). The editor works out the address of the project's VIEW page and hands it to the shell:
// the slug is not on the Studio's document, so it is read from the project's record. The network is
// faked, the document store is real; the shell is a stub that prints what it was given.
const { mockGetProject, mockGetServerSpace } = vi.hoisted(() => ({
    mockGetProject: vi.fn(),
    mockGetServerSpace: vi.fn()
}))

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
vi.mock('../../services/serverSpaces.js', () => ({
    getServerSpace: (...args) => mockGetServerSpace(...args),
    listServerSpaces: () => Promise.resolve([]),
    deleteServerAsset: () => Promise.resolve(),
    importCommonsAssets: () => Promise.resolve({}),
    importDriveAssets: () => Promise.resolve({}),
    importDriveSelection: () => Promise.resolve({}),
    setAssetShared: () => Promise.resolve(),
    updateServerSpace: () => Promise.resolve()
}))
vi.mock('../../project/services/projectsApi.js', async (importOriginal) => ({
    ...(await importOriginal()),
    getProject: (...args) => mockGetProject(...args)
}))
vi.mock('./StudioShell.jsx', () => ({
    default: (props) => <output data-testid="preview-url">{props.previewUrl || ''}</output>
}))

import StudioEditor from './StudioEditor.jsx'

const shown = () => screen.getByTestId('preview-url')

describe('StudioEditor: the address the Preview button opens', () => {
    beforeEach(() => {
        mockGetProject.mockReset()
        mockGetServerSpace.mockReset()
        mockGetServerSpace.mockResolvedValue({ id: 'moxir', slug: 'moxir', label: 'MOXIR' })
    })

    it('is the permanent address at first and the pretty one once the project\'s record has its slug', async () => {
        mockGetProject.mockResolvedValue({ project: { id: 'moxir-v2-9', slug: 'v2-9' } })
        render(<StudioEditor spaceId="moxir" projectId="moxir-v2-9" />)
        expect(shown()).toHaveTextContent(`${window.location.origin}/moxir/p/moxir-v2-9`)
        await waitFor(() => expect(shown()).toHaveTextContent(`${window.location.origin}/moxir/v2-9`))
        expect(mockGetProject).toHaveBeenCalledWith('moxir-v2-9')
    })

    it('stays the permanent address for a project that has no slug', async () => {
        mockGetProject.mockResolvedValue({ project: { id: 'moxir-v2-9', slug: null } })
        render(<StudioEditor spaceId="moxir" projectId="moxir-v2-9" />)
        await waitFor(() => expect(mockGetProject).toHaveBeenCalledTimes(1))
        await Promise.resolve()
        expect(shown()).toHaveTextContent(`${window.location.origin}/moxir/p/moxir-v2-9`)
    })

    it('stays the permanent address when the record cannot be read (offline, signed out) and does not throw', async () => {
        mockGetProject.mockRejectedValue(new Error('offline'))
        render(<StudioEditor spaceId="moxir" projectId="moxir-v2-9" />)
        await waitFor(() => expect(mockGetProject).toHaveBeenCalledTimes(1))
        await Promise.resolve()
        expect(shown()).toHaveTextContent(`${window.location.origin}/moxir/p/moxir-v2-9`)
    })

    it('never shows one project\'s slug for another project', async () => {
        mockGetProject.mockResolvedValueOnce({ project: { id: 'a', slug: 'slug-of-a' } })
        const { rerender } = render(<StudioEditor spaceId="moxir" projectId="a" />)
        await waitFor(() => expect(shown()).toHaveTextContent(`${window.location.origin}/moxir/slug-of-a`))
        mockGetProject.mockReturnValueOnce(new Promise(() => {}))
        rerender(<StudioEditor spaceId="moxir" projectId="b" />)
        expect(shown()).toHaveTextContent(`${window.location.origin}/moxir/p/b`)
        expect(shown()).not.toHaveTextContent('slug-of-a')
    })
})
