import { webcrypto } from 'node:crypto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createProject, hashFileSha256, listProjects, uploadProjectAsset } from './projectsApi.js'

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
})

describe('content-addressed asset uploads', () => {
    const HELLO_SHA256 = '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824'
    const makeFile = (text, name) => ({
        name,
        arrayBuffer: async () => new TextEncoder().encode(text).buffer
    })

    // jsdom's File has no arrayBuffer(); give it one so pre-hashing runs
    const makeUploadableFile = (text, name) => {
        const file = new File([text], name, { type: 'text/plain' })
        if (typeof file.arrayBuffer !== 'function') {
            Object.defineProperty(file, 'arrayBuffer', {
                value: async () => new TextEncoder().encode(text).buffer
            })
        }
        return file
    }

    beforeEach(() => {
        apiFetch.mockReset()
        if (!globalThis.crypto?.subtle) {
            vi.stubGlobal('crypto', webcrypto)
        }
    })

    it('hashes file content to the sha256 hex digest', async () => {
        await expect(hashFileSha256(makeFile('hello', 'hello.txt'))).resolves.toBe(HELLO_SHA256)
    })

    it('skips the byte upload when the server already has the content', async () => {
        apiFetch.mockResolvedValueOnce({
            ok: true,
            asset: { id: HELLO_SHA256, name: 'original.txt', url: `/api/projects/p1/assets/${HELLO_SHA256}` }
        })

        const asset = await uploadProjectAsset('p1', makeFile('hello', 'renamed.txt'))

        expect(apiFetch).toHaveBeenCalledTimes(1)
        expect(apiFetch).toHaveBeenCalledWith(`/api/projects/p1/assets/${HELLO_SHA256}/meta`)
        expect(asset).toMatchObject({ id: HELLO_SHA256, name: 'renamed.txt' })
    })

    it('uploads with the pre-hashed id when the content is missing', async () => {
        const missing = new Error('Asset not found.')
        missing.status = 404
        apiFetch
            .mockRejectedValueOnce(missing)
            .mockResolvedValueOnce({ ok: true, asset: { id: HELLO_SHA256 } })

        const asset = await uploadProjectAsset('p1', makeUploadableFile('hello', 'hello.txt'))

        expect(apiFetch).toHaveBeenCalledTimes(2)
        const [url, init] = apiFetch.mock.calls[1]
        expect(url).toBe('/api/projects/p1/assets')
        expect(init.method).toBe('POST')
        expect(init.body.get('assetId')).toBe(HELLO_SHA256)
        expect(asset).toEqual({ id: HELLO_SHA256 })
    })

    it('does not dedupe legacy non-sha asset ids', async () => {
        apiFetch.mockResolvedValueOnce({ ok: true, asset: { id: 'legacy-uuid-1234' } })

        await uploadProjectAsset('p1', makeUploadableFile('hello', 'hello.txt'), { assetId: 'legacy-uuid-1234' })

        expect(apiFetch).toHaveBeenCalledTimes(1)
        const [url, init] = apiFetch.mock.calls[0]
        expect(url).toBe('/api/projects/p1/assets')
        expect(init.body.get('assetId')).toBe('legacy-uuid-1234')
    })
})
