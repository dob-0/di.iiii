import { describe, expect, it, vi, beforeEach } from 'vitest'
import {
    formatMissingAssetList,
    getMissingAssetRefs,
    isCurrentSpaceServerAssetUrl,
    selectAssetsForServerPublish
} from './serverAssetSync.js'

describe('serverAssetSync', () => {
    beforeEach(() => {
        vi.restoreAllMocks()
    })

    it('recognizes server asset URLs for the current space', () => {
        expect(isCurrentSpaceServerAssetUrl(
            '/serverXR/api/spaces/recordar-platform/assets/asset-1',
            'asset-1',
            '/serverXR/api/spaces/recordar-platform/assets'
        )).toBe(true)
        expect(isCurrentSpaceServerAssetUrl(
            '/serverXR/api/spaces/other-space/assets/asset-1',
            'asset-1',
            '/serverXR/api/spaces/recordar-platform/assets'
        )).toBe(false)
    })

    it('reports missing asset refs before publish', () => {
        const assetRefs = new Map([
            ['asset-1', { id: 'asset-1', name: 'poster.webp' }],
            ['asset-2', { id: 'asset-2', name: 'clip.mp4' }]
        ])
        const entries = [{
            meta: { id: 'asset-1', name: 'poster.webp' },
            blob: new Blob(['poster'], { type: 'image/webp' })
        }]

        expect(getMissingAssetRefs(assetRefs, entries)).toEqual([
            { id: 'asset-2', name: 'clip.mp4' }
        ])
        expect(formatMissingAssetList([
            { id: 'asset-1', name: 'poster.webp' },
            { id: 'asset-2', name: 'clip.mp4' }
        ])).toBe('poster.webp, clip.mp4')
    })

    it('re-uploads when the current server copy is missing or invalid', async () => {
        const fetchMock = vi.fn().mockResolvedValue({
            ok: false,
            headers: {
                get: () => 'text/html'
            }
        })
        vi.stubGlobal('fetch', fetchMock)

        const targets = await selectAssetsForServerPublish([{
            meta: { id: 'asset-1', name: 'poster.webp' },
            blob: new Blob(['poster'], { type: 'image/webp' }),
            sourceUrl: '/serverXR/api/spaces/recordar-platform/assets/asset-1'
        }], '/serverXR/api/spaces/recordar-platform/assets')

        expect(fetchMock).toHaveBeenCalledWith('/serverXR/api/spaces/recordar-platform/assets/asset-1', {
            method: 'HEAD',
            cache: 'no-store'
        })
        expect(targets).toHaveLength(1)
    })

    it('skips re-upload when the current server copy is already available', async () => {
        const fetchMock = vi.fn().mockResolvedValue({
            ok: true,
            headers: {
                get: () => 'image/webp'
            }
        })
        vi.stubGlobal('fetch', fetchMock)

        const targets = await selectAssetsForServerPublish([{
            meta: { id: 'asset-1', name: 'poster.webp' },
            blob: new Blob(['poster'], { type: 'image/webp' }),
            sourceUrl: '/serverXR/api/spaces/recordar-platform/assets/asset-1'
        }], '/serverXR/api/spaces/recordar-platform/assets')

        expect(targets).toEqual([])
    })
})
