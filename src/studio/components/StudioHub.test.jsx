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
const SERVER_ASSET_ID = '4c122913-7872-42b3-8b04-9f73942022fd'

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

    it('creates imported Studio projects with remapped legacy assets', async () => {
        const assetFile = new File(['image-bytes'], 'hero.webp', { type: 'image/webp' })
        listProjects.mockResolvedValue([])
        createProject.mockResolvedValue({
            project: {
                id: 'imported-project'
            }
        })
        uploadProjectAsset.mockResolvedValue({
            id: SERVER_ASSET_ID,
            name: 'hero.webp',
            mimeType: 'image/webp',
            size: 11,
            url: `/serverXR/api/projects/imported-project/assets/${SERVER_ASSET_ID}`
        })
        updateProjectDocument.mockResolvedValue({ ok: true })
        importLegacySceneFile.mockResolvedValue({
            document: {
                projectMeta: {
                    title: 'Imported Studio Scene'
                },
                assets: [{
                    id: 'asset-legacy-1',
                    name: 'hero.webp',
                    mimeType: 'image/webp',
                    size: 11
                }],
                entities: [{
                    id: 'image-1',
                    type: 'box',
                    components: {
                        media: {
                            assetId: 'asset-legacy-1'
                        }
                    }
                }]
            },
            assetFiles: new Map([['asset-legacy-1', assetFile]]),
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
        expect(uploadProjectAsset).toHaveBeenCalledWith('imported-project', assetFile, {})
        const savedDocument = updateProjectDocument.mock.calls[0][1]
        expect(savedDocument.assets).toEqual([
            expect.objectContaining({
                id: SERVER_ASSET_ID,
                url: `/serverXR/api/projects/imported-project/assets/${SERVER_ASSET_ID}`
            })
        ])
        expect(savedDocument.entities[0].type).toBe('image')
        expect(savedDocument.entities[0].components.media.assetId).toBe(SERVER_ASSET_ID)
        expect(navigateToStudioPath).toHaveBeenCalledWith('/gallery/studio/projects/imported-project')
    })

    it('cleans up a partial imported project when asset upload fails', async () => {
        const assetFile = new File(['image-bytes'], 'hero.webp', { type: 'image/webp' })
        listProjects.mockResolvedValue([])
        createProject.mockResolvedValue({
            project: {
                id: 'imported-project'
            }
        })
        uploadProjectAsset.mockRejectedValue(new Error('Upload failed before document save.'))
        deleteProject.mockResolvedValue({ ok: true })
        importLegacySceneFile.mockResolvedValue({
            document: {
                projectMeta: {
                    title: 'Imported Studio Scene'
                },
                assets: [{
                    id: 'asset-legacy-1',
                    name: 'hero.webp',
                    mimeType: 'image/webp'
                }],
                entities: [{
                    id: 'image-1',
                    type: 'image',
                    components: {
                        media: {
                            assetId: 'asset-legacy-1'
                        }
                    }
                }]
            },
            assetFiles: new Map([['asset-legacy-1', assetFile]]),
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
            expect(deleteProject).toHaveBeenCalledWith('imported-project')
        })
        expect(updateProjectDocument).not.toHaveBeenCalled()
        expect(navigateToStudioPath).not.toHaveBeenCalled()
        expect(await screen.findByText('Upload failed before document save.')).toBeInTheDocument()
    })
})
