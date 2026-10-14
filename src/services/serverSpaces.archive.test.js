import { beforeEach, describe, expect, it, vi } from 'vitest'

const apiFetch = vi.fn()
vi.mock('./apiClient.js', () => ({ apiFetch: (...a) => apiFetch(...a), hasServerApi: () => true, apiBaseUrl: () => '' }))

import { updateServerSpace } from './serverSpaces.js'

// The client whitelists the fields it sends; archived was missing, so the UI's
// Archive answered 200 and archived nothing (seen on the real surface 2026-10-07).
describe('updateServerSpace archived', () => {
    beforeEach(() => { apiFetch.mockReset(); apiFetch.mockResolvedValue({ space: {} }) })

    it('sends archived true and false', async () => {
        await updateServerSpace('alpha', { archived: true })
        expect(JSON.parse(JSON.stringify(apiFetch.mock.calls[0][1].body)).archived).toBe(true)
        await updateServerSpace('alpha', { archived: false })
        expect(JSON.parse(JSON.stringify(apiFetch.mock.calls[1][1].body)).archived).toBe(false)
    })

    it('leaves it out when not asked, so other settings never touch the flag', async () => {
        await updateServerSpace('alpha', { isPublic: true })
        expect('archived' in JSON.parse(JSON.stringify(apiFetch.mock.calls[0][1].body))).toBe(false)
    })
})
