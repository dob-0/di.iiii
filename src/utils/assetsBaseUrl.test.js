import { describe, expect, it } from 'vitest'
import { preferLocalAssetsBaseUrl } from './assetsBaseUrl.js'

describe('preferLocalAssetsBaseUrl', () => {
    it('keeps the scene base when it is already local', () => {
        expect(preferLocalAssetsBaseUrl({
            sceneBaseUrl: 'http://localhost:4000/serverXR/api/spaces/main/assets',
            serverAssetBaseUrl: 'http://localhost:4000/serverXR/api/spaces/main/assets'
        })).toBe('http://localhost:4000/serverXR/api/spaces/main/assets')
    })

    it('prefers the local server asset base over a remote absolute scene base on localhost', () => {
        expect(preferLocalAssetsBaseUrl({
            sceneBaseUrl: 'https://di-studio.xyz/serverXR/api/spaces/main/assets',
            serverAssetBaseUrl: 'http://localhost:4000/serverXR/api/spaces/main/assets'
        })).toBe('http://localhost:4000/serverXR/api/spaces/main/assets')
    })

    it('can still force the server asset base explicitly', () => {
        expect(preferLocalAssetsBaseUrl({
            sceneBaseUrl: '/default-scene',
            serverAssetBaseUrl: '/serverXR/api/spaces/main/assets',
            forceServerAssetsBase: true
        })).toBe('/serverXR/api/spaces/main/assets')
    })
})
