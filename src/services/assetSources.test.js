import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('./apiClient.js', () => ({
    apiBaseUrl: 'https://di-studio.xyz/serverXR'
}))

import {
    clearAssetSources,
    getAssetSourceUrl,
    getAssetUrlCandidates,
    registerAssetSources
} from './assetSources.js'

describe('assetSources', () => {
    beforeEach(() => {
        clearAssetSources()
    })

    it('prefers the mounted API base for legacy relative asset urls', () => {
        const candidates = getAssetUrlCandidates({
            id: 'asset-1',
            url: '/api/spaces/main/assets/asset-1'
        })

        expect(candidates[0]).toBe('https://di-studio.xyz/serverXR/api/spaces/main/assets/asset-1')
        expect(candidates.some((url) => /\/api\/spaces\/main\/assets\/asset-1$/.test(url) && !url.includes('/serverXR/api/'))).toBe(true)
    })

    it('prefers the mounted API base for legacy relative asset bases', () => {
        const candidates = getAssetUrlCandidates(
            { id: 'asset-2' },
            '/api/spaces/main/assets'
        )

        expect(candidates[0]).toBe('https://di-studio.xyz/serverXR/api/spaces/main/assets/asset-2')
        expect(candidates).toContain('/api/spaces/main/assets/asset-2')
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
