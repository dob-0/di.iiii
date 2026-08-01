import React from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import StudioHub from './StudioHub.jsx'
import { setAppNavigate } from '../../utils/appNavigate.js'

const createProject = vi.fn()
const deleteProject = vi.fn()
const listProjects = vi.fn()
const updateProjectDocument = vi.fn()
const uploadProjectAsset = vi.fn()
const getServerSpace = vi.fn()
const updateServerSpace = vi.fn()
const navigateToStudioPath = vi.fn()
const importLegacySceneFile = vi.fn()

vi.mock('../../project/services/projectsApi.js', () => ({
    DEFAULT_PROJECT_SPACE_ID: 'main',
    createProject: (...args) => createProject(...args),
    deleteProject: (...args) => deleteProject(...args),
    listProjects: (...args) => listProjects(...args),
    updateProjectDocument: (...args) => updateProjectDocument(...args),
    uploadProjectAsset: (...args) => uploadProjectAsset(...args),
    // GridFloorBackground (rendered by StudioHub) fetches its own live
    // document independently of anything this suite asserts on.
    buildProjectEventsUrl: () => '',
    getProjectDocument: () => Promise.resolve({ document: {}, version: 0 }),
    listProjectOps: () => Promise.resolve({ ops: [], latestVersion: 0 })
}))

vi.mock('../../services/serverSpaces.js', () => ({
    getServerSpace: (...args) => getServerSpace(...args),
    updateServerSpace: (...args) => updateServerSpace(...args),
    // GridFloorBackground (rendered by StudioHub) also calls this directly.
    listServerSpaces: () => Promise.resolve([])
}))

vi.mock('../../project/import/importLegacyScene.js', () => ({
    importLegacySceneFile: (...args) => importLegacySceneFile(...args)
}))

vi.mock('../utils/studioRouting.js', () => ({
    buildStudioProjectPath: (projectId, spaceId) => `/${spaceId}/studio/projects/${projectId}`,
    navigateToStudioPath: (...args) => navigateToStudioPath(...args)
}))

let authState = {}

vi.mock('../../hooks/useAuthSession.js', () => ({
    default: () => authState
}))

describe('StudioHub', () => {
    beforeEach(() => {
        createProject.mockReset()
        deleteProject.mockReset()
        listProjects.mockReset()
        updateProjectDocument.mockReset()
        uploadProjectAsset.mockReset()
        getServerSpace.mockReset()
        getServerSpace.mockResolvedValue(null)
        updateServerSpace.mockReset()
        navigateToStudioPath.mockReset()
        importLegacySceneFile.mockReset()
        authState = { role: null, openSpaceId: null }
        vi.spyOn(window, 'confirm').mockImplementation(() => true)
    })

    it('forwards the open-space hub straight into the shared jam project', async () => {
        authState = { role: null, openSpaceId: 'open' }
        listProjects.mockResolvedValue([
            { id: 'open-jam', title: 'Open Jam', updatedAt: Date.now(), source: 'studio-v3' }
        ])

        render(<StudioHub spaceId="open" />)

        await waitFor(() =>
            expect(navigateToStudioPath).toHaveBeenCalledWith('/open/studio/projects/open-jam')
        )
    })

    it('clears the live pointer before deleting a published project', async () => {
        listProjects
            .mockResolvedValueOnce([{
                id: 'live-project',
                title: 'Live Project',
                updatedAt: Date.now(),
                source: 'studio-v3'
            }])
            .mockResolvedValueOnce([])
        getServerSpace.mockResolvedValue({
            id: 'gallery',
            publishedProjectId: 'live-project'
        })
        updateServerSpace.mockResolvedValue({ id: 'gallery', publishedProjectId: null })
        deleteProject.mockResolvedValue({ ok: true })

        render(<StudioHub spaceId="gallery" />)

        fireEvent.click(await screen.findByRole('button', { name: 'Delete' }))

        await waitFor(() => {
            expect(updateServerSpace).toHaveBeenCalledWith('gallery', { publishedProjectId: null })
            expect(deleteProject).toHaveBeenCalledWith('live-project')
        })
    })

    describe('code spaces', () => {
        // algovrithm's scene is a React route, not a project document, so the
        // server correctly reports zero projects for it. Without the registry
        // Studio then tells the author their finished installation is an empty
        // space and offers to create a project that could never render it.
        const navigate = vi.fn()

        beforeEach(() => {
            navigate.mockReset()
            setAppNavigate(navigate)
        })

        afterEach(() => setAppNavigate(null))

        it('lists the code space instead of the empty state', async () => {
            listProjects.mockResolvedValue([])

            render(<StudioHub spaceId="algovrithm" />)

            expect(await screen.findByText('algovrithm')).toBeTruthy()
            expect(screen.getByText('code space')).toBeTruthy()
            expect(screen.queryByText('No projects yet')).toBeNull()
            expect(screen.queryByRole('button', { name: '+ Create your first project' })).toBeNull()
        })

        it('opens the piece from the card', async () => {
            listProjects.mockResolvedValue([])

            render(<StudioHub spaceId="algovrithm" />)

            fireEvent.click(await screen.findByRole('button', { name: 'Open' }))
            expect(navigate).toHaveBeenCalledWith('/algovrithm', { replace: false })
        })

        it('opens the director without also firing the card underneath', async () => {
            // The action sits inside a clickable card; without stopPropagation
            // the click would navigate twice and the last one would win.
            listProjects.mockResolvedValue([])

            render(<StudioHub spaceId="algovrithm" />)

            fireEvent.click(await screen.findByRole('button', { name: 'Director' }))
            expect(navigate).toHaveBeenCalledTimes(1)
            expect(navigate).toHaveBeenCalledWith('/algovrithm?director', { replace: false })
        })

        it('leaves an ordinary empty space alone', async () => {
            listProjects.mockResolvedValue([])

            render(<StudioHub spaceId="gallery" />)

            expect(await screen.findByText('No projects yet')).toBeTruthy()
            expect(screen.queryByText('code space')).toBeNull()
        })
    })

    it('shows a create-first-project empty state when the space has no projects', async () => {
        listProjects.mockResolvedValue([])

        render(<StudioHub spaceId="gallery" />)

        expect(await screen.findByText('No projects yet')).toBeTruthy()
        fireEvent.click(screen.getByRole('button', { name: '+ Create your first project' }))
        expect(screen.getByPlaceholderText('Project name')).toBeTruthy()
    })

    it('creates imported Studio projects with the Studio import source', async () => {
        listProjects.mockResolvedValue([])
        createProject.mockResolvedValue({
            project: {
                id: 'imported-project'
            }
        })
        uploadProjectAsset.mockResolvedValue({
            id: 'asset-1',
            mimeType: 'image/webp'
        })
        updateProjectDocument.mockResolvedValue({ ok: true })
        importLegacySceneFile.mockResolvedValue({
            document: {
                projectMeta: {
                    title: 'Imported Studio Scene'
                },
                assets: [],
                entities: []
            },
            assetFiles: new Map(),
            warnings: []
        })

        render(<StudioHub spaceId="gallery" />)

        const input = document.querySelector('input[type="file"]')
        const file = new File(['{}'], 'legacy-scene.json', { type: 'application/json' })
        fireEvent.change(input, {
            target: {
                files: [file]
            }
        })

        await waitFor(() => {
            expect(createProject).toHaveBeenCalledWith('gallery', {
                title: 'Imported Studio Scene',
                slug: 'Imported Studio Scene',
                source: 'legacy-import-studio'
            })
        })
        expect(updateProjectDocument).toHaveBeenCalledWith('imported-project', expect.objectContaining({
            projectMeta: expect.objectContaining({
                id: 'imported-project',
                spaceId: 'gallery',
                source: 'legacy-import-studio'
            })
        }))
    })
})
