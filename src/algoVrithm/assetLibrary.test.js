import { describe, expect, it } from 'vitest'
import {
    assetIdFromPath,
    assetKindFromPath,
    assetTitleFromPath,
    buildAssetLibrary,
    extensionOf,
    fileNameFromPath,
    findAsset
} from './assetLibrary.js'

describe('assetKindFromPath', () => {
    it('recognises the three things the piece can render', () => {
        expect(assetKindFromPath('./assets/ritual-01.png')).toBe('image')
        expect(assetKindFromPath('./assets/corridor.mp4')).toBe('video')
        expect(assetKindFromPath('./assets/altar.glb')).toBe('model')
    })

    it('is case-insensitive about the extension', () => {
        // Phone cameras and Blender both hand out screaming extensions.
        expect(assetKindFromPath('./assets/IMG_0042.JPG')).toBe('image')
        expect(assetKindFromPath('./assets/CLIP.MP4')).toBe('video')
    })

    it('returns null for anything else so the folder can hold notes', () => {
        expect(assetKindFromPath('./assets/README.md')).toBeNull()
        expect(assetKindFromPath('./assets/.DS_Store')).toBeNull()
        expect(assetKindFromPath('./assets/noextension')).toBeNull()
    })
})

describe('assetIdFromPath', () => {
    it('is the filename without its extension', () => {
        expect(assetIdFromPath('./assets/ritual-01.png')).toBe('ritual-01')
    })

    it('flattens spaces and punctuation so the id survives a paste into source', () => {
        expect(assetIdFromPath('./assets/Ritual Take 2 (final).png')).toBe('ritual-take-2-final')
        expect(assetIdFromPath('./assets/__weird__.png')).toBe('weird')
    })

    it('keeps a dotted filename whole apart from the real extension', () => {
        expect(assetIdFromPath('./assets/v1.2.altar.glb')).toBe('v1-2-altar')
    })
})

describe('fileNameFromPath / extensionOf / assetTitleFromPath', () => {
    it('reads the parts of a path', () => {
        expect(fileNameFromPath('./assets/ritual-01.png')).toBe('ritual-01.png')
        expect(extensionOf('./assets/ritual-01.PNG')).toBe('png')
        expect(assetTitleFromPath('./assets/ritual-01.png')).toBe('ritual 01')
    })
})

describe('buildAssetLibrary', () => {
    const modules = {
        './assets/README.md': '/README.md',
        './assets/corridor.mp4': '/build/corridor.hash.mp4',
        './assets/altar.glb': '/build/altar.hash.glb',
        './assets/ritual-01.png': '/build/ritual-01.hash.png'
    }

    it('keeps only renderable files', () => {
        expect(buildAssetLibrary(modules).map((a) => a.id))
            .toEqual(['altar', 'corridor', 'ritual-01'])
    })

    it('sorts by filename so the bin does not reshuffle between builds', () => {
        const shuffled = buildAssetLibrary({
            './assets/zebra.png': '/z.png',
            './assets/apple.png': '/a.png'
        })
        expect(shuffled.map((a) => a.fileName)).toEqual(['apple.png', 'zebra.png'])
    })

    it('carries the built URL through untouched', () => {
        const library = buildAssetLibrary(modules)
        expect(findAsset('ritual-01', library).src).toBe('/build/ritual-01.hash.png')
        expect(findAsset('ritual-01', library).kind).toBe('image')
    })

    it('returns null for an asset that is no longer in the folder', () => {
        // A clip referencing a deleted file must resolve to nothing rather
        // than to a URL that 404s.
        expect(findAsset('deleted-yesterday', buildAssetLibrary(modules))).toBeNull()
    })

    it('survives an empty folder', () => {
        expect(buildAssetLibrary({})).toEqual([])
    })
})
