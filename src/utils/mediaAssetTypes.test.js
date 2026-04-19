import { describe, expect, it } from 'vitest'
import {
    detectAssetMediaKind,
    detectEntityTypeForAsset,
    getExpectedPlayableTopLevel,
    inferMimeTypeFromName,
    resolveAssetMimeType
} from './mediaAssetTypes.js'

describe('mediaAssetTypes', () => {
    it('detects media kinds from filenames when MIME is generic or missing', () => {
        expect(detectAssetMediaKind({ name: 'poster.webp', mimeType: 'application/octet-stream' })).toBe('image')
        expect(detectAssetMediaKind({ name: 'clip.mp4', mimeType: '' })).toBe('video')
        expect(detectAssetMediaKind({ name: 'voice.ogg', mimeType: 'application/octet-stream' })).toBe('audio')
        expect(detectAssetMediaKind({ name: 'scene.glb', mimeType: 'application/octet-stream' })).toBe('model')
    })

    it('normalizes MIME and entity type from extension fallbacks', () => {
        expect(inferMimeTypeFromName('poster.PNG')).toBe('image/png')
        expect(resolveAssetMimeType({ name: 'clip.webm', mimeType: 'application/octet-stream' })).toBe('video/webm')
        expect(detectEntityTypeForAsset({ name: 'song.flac', mimeType: '' })).toBe('audio')
        expect(getExpectedPlayableTopLevel({ name: 'poster.svg', mimeType: '' })).toBe('image')
    })
})
