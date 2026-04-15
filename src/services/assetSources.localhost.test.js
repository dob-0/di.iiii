import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('./apiClient.js', () => ({
    apiBaseUrl: 'http://localhost:4000/serverXR'
}))

import { clearAssetSources, getAssetUrlCandidates } from './assetSources.js'

describe('assetSources localhost remapping', () => {
    beforeEach(() => {
        clearAssetSources()
    })

    it('prefers the mounted localhost server asset url over a production absolute asset url', () => {
        const candidates = getAssetUrlCandidates({
            id: 'asset-local',
            url: 'https://di-studio.xyz/serverXR/api/spaces/main/assets/asset-local'
        })

        expect(candidates[0]).toBe('http://localhost:4000/serverXR/api/spaces/main/assets/asset-local')
        expect(candidates).not.toContain('https://di-studio.xyz/serverXR/api/spaces/main/assets/asset-local')
    })

    it('prefers the mounted localhost server asset base over a production absolute asset base', () => {
        const candidates = getAssetUrlCandidates(
            { id: 'asset-local-base' },
            'https://di-studio.xyz/serverXR/api/spaces/main/assets'
        )

        expect(candidates[0]).toBe('http://localhost:4000/serverXR/api/spaces/main/assets/asset-local-base')
        expect(candidates).not.toContain('https://di-studio.xyz/serverXR/api/spaces/main/assets/asset-local-base')
    })
})
