import { describe, expect, it } from 'vitest'
import { isContentAddressedAssetUrl } from './contentAddressedAsset.js'

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
