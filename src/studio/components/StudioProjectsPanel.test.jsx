import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import StudioProjectsPanel from './StudioProjectsPanel.jsx'

const listProjects = vi.fn()
const createProject = vi.fn()
const updateProject = vi.fn()
const deleteProject = vi.fn()
const getServerSpace = vi.fn()
const updateServerSpace = vi.fn()
const navigateToStudioPath = vi.fn()

vi.mock('../../project/services/projectsApi.js', () => ({
    listProjects: (...args) => listProjects(...args),
    createProject: (...args) => createProject(...args),
    updateProject: (...args) => updateProject(...args),
    deleteProject: (...args) => deleteProject(...args)
}))

vi.mock('../../services/serverSpaces.js', () => ({
    getServerSpace: (...args) => getServerSpace(...args),
    updateServerSpace: (...args) => updateServerSpace(...args)
}))

vi.mock('../utils/studioRouting.js', async (importOriginal) => ({
    ...(await importOriginal()),
    navigateToStudioPath: (...args) => navigateToStudioPath(...args)
}))

describe('StudioProjectsPanel', () => {
    afterEach(() => {
        vi.clearAllMocks()
    })

    it('lists projects, marks the current and live ones, and opens a sibling', async () => {
        listProjects.mockResolvedValue([
            { id: 'br-id-ge-field', title: 'the field' },
            { id: 'br-id-ge-hosq', title: 'hosq one-pager' }
        ])
        getServerSpace.mockResolvedValue({ publishedProjectId: 'br-id-ge-hosq' })

        render(<StudioProjectsPanel spaceId="br-id-ge" currentProjectId="br-id-ge-field" />)

        const current = await screen.findByRole('button', { name: /the field/ })
        expect(current).toHaveAttribute('aria-current', 'page')
        expect(await screen.findByText('live')).toBeInTheDocument()

        await userEvent.click(screen.getByRole('button', { name: /hosq one-pager/ }))
        expect(navigateToStudioPath).toHaveBeenCalledWith('/br-id-ge/studio/projects/br-id-ge-hosq')

        navigateToStudioPath.mockClear()
        await userEvent.click(current)
        expect(navigateToStudioPath).not.toHaveBeenCalled()
    })

    it('creates a project and opens it', async () => {
        listProjects.mockResolvedValue([])
        getServerSpace.mockResolvedValue({ publishedProjectId: null })
        createProject.mockResolvedValue({ project: { id: 'fresh' } })

        render(<StudioProjectsPanel spaceId="br-id-ge" currentProjectId="other" />)

        await userEvent.click(await screen.findByRole('button', { name: /New project/ }))
        await userEvent.type(screen.getByRole('textbox', { name: 'New project title' }), 'sketch{Enter}')

        await waitFor(() => {
            expect(createProject).toHaveBeenCalledWith('br-id-ge', { title: 'sketch', slug: 'sketch', source: 'studio-v3' })
        })
        expect(navigateToStudioPath).toHaveBeenCalledWith('/br-id-ge/studio/projects/fresh')
    })

    it('renames a project in place', async () => {
        listProjects.mockResolvedValue([{ id: 'p1', title: 'draft' }])
        getServerSpace.mockResolvedValue({ publishedProjectId: null })
        updateProject.mockResolvedValue({})

        render(<StudioProjectsPanel spaceId="br-id-ge" currentProjectId="p1" />)

        await userEvent.click(await screen.findByRole('button', { name: 'Rename' }))
        const input = screen.getByRole('textbox', { name: 'Project title' })
        await userEvent.clear(input)
        await userEvent.type(input, 'final{Enter}')

        await waitFor(() => {
            expect(updateProject).toHaveBeenCalledWith('p1', { title: 'final' })
        })
        expect(await screen.findByText('final')).toBeInTheDocument()
    })

    it('deletes a non-current project, clearing the published pointer when it is live', async () => {
        listProjects.mockResolvedValue([
            { id: 'keep', title: 'keep me' },
            { id: 'gone', title: 'delete me' }
        ])
        getServerSpace.mockResolvedValue({ publishedProjectId: 'gone' })
        updateServerSpace.mockResolvedValue({})
        deleteProject.mockResolvedValue({})
        vi.spyOn(window, 'confirm').mockReturnValue(true)

        render(<StudioProjectsPanel spaceId="br-id-ge" currentProjectId="keep" />)

        await userEvent.click(await screen.findByRole('button', { name: 'Delete' }))

        await waitFor(() => {
            expect(deleteProject).toHaveBeenCalledWith('gone')
        })
        expect(updateServerSpace).toHaveBeenCalledWith('br-id-ge', { publishedProjectId: null })
        expect(listProjects).toHaveBeenCalledTimes(2)
    })

    // Regression guard: the warning used to be set before the project list
    // reloaded, and loadProjects clears the status on success — so the one
    // message telling the user their space is now pointing nowhere was wiped
    // before it could ever be read.
    it('keeps the failed-unpublish warning on screen after the list reloads', async () => {
        listProjects
            .mockResolvedValueOnce([
                { id: 'keep', title: 'keep me' },
                { id: 'gone', title: 'delete me' }
            ])
            .mockResolvedValue([{ id: 'keep', title: 'keep me' }])
        getServerSpace.mockResolvedValue({ publishedProjectId: 'gone' })
        updateServerSpace.mockRejectedValue(new Error('space is locked'))
        deleteProject.mockResolvedValue({})
        vi.spyOn(window, 'confirm').mockReturnValue(true)

        render(<StudioProjectsPanel spaceId="br-id-ge" currentProjectId="keep" />)

        await userEvent.click(await screen.findByRole('button', { name: 'Delete' }))

        // the reload has landed once the deleted row is gone from the list
        await waitFor(() => expect(screen.queryByText('delete me')).toBeNull())
        expect(screen.getByText(/Project deleted, but the space's live pointer could not be cleared: space is locked/)).toBeInTheDocument()
    })
})
