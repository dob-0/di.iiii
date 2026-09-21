import { describe, expect, it } from 'vitest'
import { assetFetchCacheMode, isContentAddressedAssetUrl } from './contentAddressedAsset.js'

describe('isContentAddressedAssetUrl', () => {
    const sha256 = 'a'.repeat(64)

    it('recognizes a bare sha256 hex id', () => {
        expect(isContentAddressedAssetUrl(sha256)).toBe(true)
    })

    it('recognizes a sha256 id as the last path segment of a full URL', () => {
        expect(isContentAddressedAssetUrl(`/api/spaces/main/assets/${sha256}`)).toBe(true)
        expect(isContentAddressedAssetUrl(`https://di-studio.xyz/api/projects/p1/assets/${sha256}?w=480`)).toBe(true)
    })

    it('rejects a legacy (non-sha256) asset id', () => {
        expect(isContentAddressedAssetUrl('550e8400-e29b-41d4-a716-446655440000')).toBe(false)
        expect(isContentAddressedAssetUrl('/api/spaces/main/assets/legacy-uuid-here')).toBe(false)
    })

    it('rejects a too-short or too-long hex string', () => {
        expect(isContentAddressedAssetUrl('a'.repeat(63))).toBe(false)
        expect(isContentAddressedAssetUrl('a'.repeat(65))).toBe(false)
    })

    it('is case-insensitive on hex digits', () => {
        expect(isContentAddressedAssetUrl(sha256.toUpperCase())).toBe(true)
    })

    it('handles null/empty/non-string input safely', () => {
        expect(isContentAddressedAssetUrl(null)).toBe(false)
        expect(isContentAddressedAssetUrl(undefined)).toBe(false)
        expect(isContentAddressedAssetUrl('')).toBe(false)
    })
})

describe('assetFetchCacheMode', () => {
    const sha256 = 'b'.repeat(64)
    const legacy = '02ccc1c3-8a5a-4a83-aca2-387e3e48f2b5'

    it('trusts the immutable cache for a content-addressed asset', () => {
        expect(assetFetchCacheMode(sha256)).toBe('default')
        expect(assetFetchCacheMode(`/api/spaces/main/assets/${sha256}`)).toBe('default')
    })

    it('revalidates a legacy asset instead of re-downloading it', () => {
        // `no-cache` stores the response and checks it with the server before
        // every reuse; `no-store` (what this was until 2026-09-21) forbids
        // storing at all, so a mutable asset was pulled whole on every mount.
        expect(assetFetchCacheMode(legacy)).toBe('no-cache')
        expect(assetFetchCacheMode(`/api/projects/main-dii-project/assets/${legacy}`)).toBe('no-cache')
    })

    it('never returns no-store, which is what cost the bytes', () => {
        for (const input of [sha256, legacy, '', null, undefined]) {
            expect(assetFetchCacheMode(input)).not.toBe('no-store')
        }
    })
})
