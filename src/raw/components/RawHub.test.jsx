import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import RawHub from './RawHub.jsx'

const listProjects = vi.fn()
const createProject = vi.fn()
const getProjectDocument = vi.fn()

vi.mock('../../project/services/projectsApi.js', () => ({
    DEFAULT_PROJECT_SPACE_ID: 'main',
    createProject: (...args) => createProject(...args),
    deleteProject: vi.fn(),
    getProjectDocument: (...args) => getProjectDocument(...args),
    listProjects: (...args) => listProjects(...args),
    updateProjectDocument: vi.fn(),
    uploadProjectAsset: vi.fn()
}))

vi.mock('../../services/serverSpaces.js', () => ({
    getServerSpace: vi.fn(),
    updateServerSpace: vi.fn()
}))

vi.mock('../../project/import/importLegacyScene.js', () => ({
    importLegacySceneFile: vi.fn()
}))

vi.mock('../../studio/utils/studioRouting.js', () => ({
    buildStudioHubPath: (spaceId) => `/${spaceId}/studio`
}))

vi.mock('../utils/rawRouting.js', () => ({
    buildRawProjectPath: (projectId, spaceId) => `/${spaceId}/raw/projects/${projectId}`,
    navigateToRawPath: vi.fn()
}))

describe('RawHub', () => {
    beforeEach(() => {
        listProjects.mockReset()
        createProject.mockReset()
        getProjectDocument.mockReset()
    })

    it('renders separate visitor and creator onboarding cards', async () => {
        listProjects.mockResolvedValue([])

        render(<RawHub spaceId="gallery" />)

        await waitFor(() => {
            expect(screen.getByText('For Visitors')).toBeTruthy()
        })

        expect(screen.getByText('For Creators')).toBeTruthy()
        expect(screen.getByRole('button', { name: 'Open Public Space' })).toBeTruthy()
        expect(screen.getByRole('button', { name: 'Start Creating' })).toBeTruthy()
    })

    // `projects.id` is a GLOBAL primary key and ids come from slugs, so a fixed
    // 'studio-node' slug meant exactly one space in the install could ever hold
    // a Studio node — every space after the first got a 409 and the button died
    // in setStatus.
    it('asks for a Studio node slug scoped to the space', async () => {
        listProjects.mockResolvedValue([])
        createProject.mockResolvedValue({ project: { id: 'studio-node-gallery' }, document: { nodes: [] } })

        render(<RawHub spaceId="gallery" />)
        await waitFor(() => expect(screen.getByText('For Creators')).toBeTruthy())

        fireEvent.click(screen.getByRole('button', { name: 'open the Studio node' }))

        await waitFor(() => expect(createProject).toHaveBeenCalled())
        expect(createProject.mock.calls[0][0]).toBe('gallery')
        expect(createProject.mock.calls[0][1].slug).toBe('studio-node-gallery')
    })

    it('reuses a legacy bare studio-node that is already in THIS space', async () => {
        // It can only be in this space's list if it belongs here, so the one
        // space that already has one keeps it — nothing needs migrating.
        listProjects.mockResolvedValue([{ id: 'studio-node', title: 'Studio' }])
        getProjectDocument.mockResolvedValue({ document: { nodes: [] } })

        render(<RawHub spaceId="gallery" />)
        await waitFor(() => expect(screen.getByText('For Creators')).toBeTruthy())

        fireEvent.click(screen.getByRole('button', { name: 'open the Studio node' }))

        await waitFor(() => expect(getProjectDocument).toHaveBeenCalledWith('studio-node'))
        expect(createProject).not.toHaveBeenCalled()
    })
})
