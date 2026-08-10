import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import RawHub from './RawHub.jsx'

const listProjects = vi.fn()
const deleteProject = vi.fn()
const getServerSpace = vi.fn()
const updateServerSpace = vi.fn()

vi.mock('../../project/services/projectsApi.js', () => ({
    DEFAULT_PROJECT_SPACE_ID: 'main',
    createProject: vi.fn(),
    deleteProject: (...args) => deleteProject(...args),
    listProjects: (...args) => listProjects(...args),
    updateProjectDocument: vi.fn(),
    uploadProjectAsset: vi.fn()
}))

vi.mock('../../services/serverSpaces.js', () => ({
    getServerSpace: (...args) => getServerSpace(...args),
    updateServerSpace: (...args) => updateServerSpace(...args)
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
        deleteProject.mockReset()
        getServerSpace.mockReset()
        updateServerSpace.mockReset()
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

    describe('deleting a project', () => {
        const LIVE = { id: 'live-one', title: 'the live one' }

        const renderWithDelete = async ({ listAfterDelete = [] } = {}) => {
            listProjects
                .mockResolvedValueOnce([LIVE])
                .mockResolvedValue(listAfterDelete)
            getServerSpace.mockResolvedValue({ publishedProjectId: LIVE.id })
            vi.spyOn(window, 'confirm').mockReturnValue(true)

            render(<RawHub spaceId="gallery" />)
            const deleteButton = await screen.findByRole('button', { name: '×' })
            await userEvent.click(deleteButton)
        }

        it('clears the space live pointer only after the delete has succeeded', async () => {
            const order = []
            deleteProject.mockImplementation(async () => { order.push('delete') })
            updateServerSpace.mockImplementation(async () => { order.push('unpublish') })

            await renderWithDelete()

            await waitFor(() => {
                expect(updateServerSpace).toHaveBeenCalledWith('gallery', { publishedProjectId: null })
            })
            expect(deleteProject).toHaveBeenCalledWith(LIVE.id)
            expect(order).toEqual(['delete', 'unpublish'])
        })

        it('leaves the published pointer intact when the delete fails', async () => {
            deleteProject.mockRejectedValue(new Error('server said no'))
            updateServerSpace.mockResolvedValue({})

            await renderWithDelete()

            await waitFor(() => {
                expect(deleteProject).toHaveBeenCalledWith(LIVE.id)
            })
            expect(updateServerSpace).not.toHaveBeenCalled()
        })

        it('reports when the project was deleted but the live pointer could not be cleared', async () => {
            deleteProject.mockResolvedValue({})
            updateServerSpace.mockRejectedValue(new Error('space is locked'))

            await renderWithDelete({ listAfterDelete: [] })

            expect(await screen.findByText(/Project deleted, but the space's live pointer could not be cleared: space is locked/)).toBeTruthy()
        })
    })
})
