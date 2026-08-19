import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('./apiClient.js', () => ({
    apiBaseUrl: 'https://di-studio.xyz/serverXR'
}))

import {
    clearAssetSources,
    getAssetSourceUrl,
    getAssetUrlCandidates,
    mountRelativeApiUrl,
    registerAssetSources
} from './assetSources.js'

describe('assetSources', () => {
    beforeEach(() => {
        clearAssetSources()
    })

    it('remounts relative /api asset urls onto the API base (blank prod images bug)', () => {
        expect(mountRelativeApiUrl('/api/projects/main-dii-project/assets/a1'))
            .toBe('https://di-studio.xyz/serverXR/api/projects/main-dii-project/assets/a1')
    })

    it('leaves absolute and non-api urls alone in mountRelativeApiUrl', () => {
        expect(mountRelativeApiUrl('https://cdn.example.com/api/projects/p/assets/a1')).toBeNull()
        expect(mountRelativeApiUrl('/assets/uploads/a1.png')).toBeNull()
        expect(mountRelativeApiUrl('')).toBeNull()
    })

    it('prefers the mounted API base for legacy relative asset urls', () => {
        const candidates = getAssetUrlCandidates({
            id: 'asset-1',
            url: '/api/spaces/main/assets/asset-1'
        })

        expect(candidates[0]).toBe('https://di-studio.xyz/serverXR/api/spaces/main/assets/asset-1')
        expect(candidates).not.toContain('/api/spaces/main/assets/asset-1')
    })

    it('prefers the mounted API base for legacy relative asset bases', () => {
        const candidates = getAssetUrlCandidates(
            { id: 'asset-2' },
            '/api/spaces/main/assets'
        )

        expect(candidates[0]).toBe('https://di-studio.xyz/serverXR/api/spaces/main/assets/asset-2')
        expect(candidates).not.toContain('/api/spaces/main/assets/asset-2')
    })

    it('registers the corrected mounted path as the primary source', () => {
        registerAssetSources(
            [{ id: 'asset-3', url: '/api/spaces/main/assets/asset-3' }],
            ''
        )

        expect(getAssetSourceUrl('asset-3')).toBe('https://di-studio.xyz/serverXR/api/spaces/main/assets/asset-3')
    })

    it('canonicalizes legacy underscore and mixed-case space ids in absolute asset urls', () => {
        const candidates = getAssetUrlCandidates({
            id: 'asset-4',
            url: 'https://di-studio.xyz/serverXR/api/spaces/platform_recordAR/assets/asset-4'
        })

        expect(candidates[0]).toBe('https://di-studio.xyz/serverXR/api/spaces/platform-recordar/assets/asset-4')
        expect(candidates).toContain('https://di-studio.xyz/serverXR/api/spaces/platform_recordAR/assets/asset-4')
    })

    it('canonicalizes legacy underscore and mixed-case space ids in asset bases', () => {
        const candidates = getAssetUrlCandidates(
            { id: 'asset-5' },
            'https://di-studio.xyz/serverXR/api/spaces/platform_recordAR/assets'
        )

        expect(candidates[0]).toBe('https://di-studio.xyz/serverXR/api/spaces/platform-recordar/assets/asset-5')
        expect(candidates).toContain('https://di-studio.xyz/serverXR/api/spaces/platform_recordAR/assets/asset-5')
    })
})
