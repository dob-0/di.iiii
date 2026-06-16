import React from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import StudioHub from './StudioHub.jsx'

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
    uploadProjectAsset: (...args) => uploadProjectAsset(...args)
}))

vi.mock('../../services/serverSpaces.js', () => ({
    getServerSpace: (...args) => getServerSpace(...args),
    updateServerSpace: (...args) => updateServerSpace(...args)
}))

vi.mock('../../project/import/importLegacyScene.js', () => ({
    importLegacySceneFile: (...args) => importLegacySceneFile(...args)
}))

vi.mock('../utils/studioRouting.js', () => ({
    buildStudioProjectPath: (projectId, spaceId) => `/${spaceId}/studio/projects/${projectId}`,
    navigateToStudioPath: (...args) => navigateToStudioPath(...args)
}))

describe('StudioHub', () => {
    beforeEach(() => {
        createProject.mockReset()
        deleteProject.mockReset()
        listProjects.mockReset()
        updateProjectDocument.mockReset()
        uploadProjectAsset.mockReset()
        getServerSpace.mockReset()
        updateServerSpace.mockReset()
        navigateToStudioPath.mockReset()
        importLegacySceneFile.mockReset()
        vi.spyOn(window, 'confirm').mockImplementation(() => true)
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
