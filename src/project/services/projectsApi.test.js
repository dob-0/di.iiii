import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createProject, listProjects, uploadProjectAsset } from './projectsApi.js'

const apiFetch = vi.fn()
const createServerSpace = vi.fn()

vi.mock('../../services/apiClient.js', () => ({
    apiBaseUrl: '/serverXR',
    apiFetch: (...args) => apiFetch(...args)
}))

vi.mock('../../services/serverSpaces.js', () => ({
    createServerSpace: (...args) => createServerSpace(...args)
}))

describe('projectsApi', () => {
    beforeEach(() => {
        apiFetch.mockReset()
        createServerSpace.mockReset()
    })

    it('auto-provisions a missing space before retrying project listing', async () => {
        const missingSpaceError = new Error('Space not found.')
        missingSpaceError.status = 404
        missingSpaceError.data = { error: 'Space not found.' }

        apiFetch
            .mockRejectedValueOnce(missingSpaceError)
            .mockResolvedValueOnce({ projects: [{ id: 'hero-project' }] })
        createServerSpace.mockResolvedValue({ id: 'wcc' })

        const projects = await listProjects('wcc')

        expect(createServerSpace).toHaveBeenCalledWith({
            label: 'wcc',
            slug: 'wcc',
            isPermanent: false
        })
        expect(apiFetch).toHaveBeenCalledTimes(2)
        expect(apiFetch).toHaveBeenNthCalledWith(1, '/api/spaces/wcc/projects')
        expect(apiFetch).toHaveBeenNthCalledWith(2, '/api/spaces/wcc/projects')
        expect(projects).toEqual([{ id: 'hero-project' }])
    })

    it('auto-provisions a missing space before retrying project creation', async () => {
        const missingSpaceError = new Error('Space not found.')
        missingSpaceError.status = 404
        missingSpaceError.data = { error: 'Space not found.' }

        apiFetch
            .mockRejectedValueOnce(missingSpaceError)
            .mockResolvedValueOnce({ project: { id: 'wcc-project' } })
        createServerSpace.mockResolvedValue({ id: 'wcc' })

        const response = await createProject('wcc', {
            title: 'WCC Project',
            slug: 'wcc-project',
            source: 'studio-v3'
        })

        expect(createServerSpace).toHaveBeenCalledWith({
            label: 'wcc',
            slug: 'wcc',
            isPermanent: false
        })
        expect(apiFetch).toHaveBeenCalledTimes(2)
        expect(apiFetch).toHaveBeenNthCalledWith(1, '/api/spaces/wcc/projects', {
            method: 'POST',
            body: {
                title: 'WCC Project',
                slug: 'wcc-project',
                source: 'studio-v3'
            }
        })
        expect(apiFetch).toHaveBeenNthCalledWith(2, '/api/spaces/wcc/projects', {
            method: 'POST',
            body: {
                title: 'WCC Project',
                slug: 'wcc-project',
                source: 'studio-v3'
            }
        })
        expect(response).toEqual({ project: { id: 'wcc-project' } })
    })

    it('normalizes uploaded project asset MIME from filenames when the server returns a generic type', async () => {
        apiFetch.mockResolvedValue({
            asset: {
                id: 'asset-1',
                name: 'clip.mp4',
                mimeType: 'application/octet-stream',
                size: 11,
                url: '/serverXR/api/projects/project-1/assets/asset-1'
            }
        })

        const asset = await uploadProjectAsset(
            'project-1',
            new File(['video'], 'clip.mp4', { type: 'application/octet-stream' })
        )

        expect(asset).toEqual(expect.objectContaining({
            id: 'asset-1',
            mimeType: 'video/mp4'
        }))
    })
})
