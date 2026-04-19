import JSZip from 'jszip'
import { describe, expect, it, vi } from 'vitest'
import { importLegacySceneFile } from './importLegacyScene.js'
import {
    isServerSafeAssetId,
    uploadImportedProjectAssets
} from './projectImportAssets.js'

const SERVER_ASSET_ID = '4c122913-7872-42b3-8b04-9f73942022fd'

const buildLegacySceneArchive = async () => {
    const zip = new JSZip()
    zip.file('assets/asset-legacy-1', 'image-bytes')
    zip.file('scene.json', JSON.stringify({
        objects: [{
            id: 'image-1',
            type: 'image',
            name: 'Legacy Image',
            assetRef: {
                id: 'asset-legacy-1',
                name: 'hero.webp',
                mimeType: 'image/webp'
            }
        }],
        assets: [{
            id: 'asset-legacy-1',
            name: 'hero.webp',
            mimeType: 'image/webp',
            archivePath: 'assets/asset-legacy-1'
        }]
    }))
    const arrayBuffer = await zip.generateAsync({ type: 'arraybuffer' })
    return {
        name: 'legacy-scene.zip',
        type: 'application/zip',
        arrayBuffer: async () => arrayBuffer
    }
}

describe('project import asset remapping', () => {
    it('remaps unsafe legacy asset ids to server-generated ids', async () => {
        const { document, assetFiles } = await importLegacySceneFile(await buildLegacySceneArchive())
        const uploadProjectAsset = vi.fn().mockResolvedValue({
            id: SERVER_ASSET_ID,
            name: 'hero.webp',
            mimeType: 'image/webp',
            size: 11,
            url: `/serverXR/api/projects/imported-project/assets/${SERVER_ASSET_ID}`
        })

        expect(document.assets[0].id).toBe('asset-legacy-1')
        expect(document.entities[0].components.media.assetId).toBe('asset-legacy-1')

        const result = await uploadImportedProjectAssets({
            projectId: 'imported-project',
            document,
            assetFiles,
            uploadProjectAsset
        })

        expect(uploadProjectAsset).toHaveBeenCalledWith(
            'imported-project',
            expect.any(File),
            {}
        )
        expect(result.document.assets).toEqual([
            expect.objectContaining({
                id: SERVER_ASSET_ID,
                name: 'hero.webp',
                mimeType: 'image/webp',
                url: `/serverXR/api/projects/imported-project/assets/${SERVER_ASSET_ID}`
            })
        ])
        expect(result.document.entities[0].components.media.assetId).toBe(SERVER_ASSET_ID)
        expect(result.document.entities[0].type).toBe('image')
    })

    it('preserves server-safe ids during upload', async () => {
        const safeAssetId = '5d233024-8983-4ba6-a7df-61818c45ec60'
        const assetFile = new File(['image-bytes'], 'safe.webp', { type: 'image/webp' })
        const uploadProjectAsset = vi.fn().mockResolvedValue({
            id: safeAssetId,
            name: 'safe.webp',
            mimeType: 'image/webp',
            size: 11,
            url: `/serverXR/api/projects/imported-project/assets/${safeAssetId}`
        })

        expect(isServerSafeAssetId(safeAssetId)).toBe(true)

        await uploadImportedProjectAssets({
            projectId: 'imported-project',
            document: {
                assets: [{ id: safeAssetId, name: 'safe.webp', mimeType: 'image/webp' }],
                entities: []
            },
            assetFiles: new Map([[safeAssetId, assetFile]]),
            uploadProjectAsset
        })

        expect(uploadProjectAsset).toHaveBeenCalledWith(
            'imported-project',
            assetFile,
            { assetId: safeAssetId }
        )
    })

    it('preserves remote manifest assets from legacy json imports when no embedded file exists', async () => {
        const file = {
            name: 'legacy-scene.json',
            type: 'application/json',
            text: async () => JSON.stringify({
                objects: [{
                    id: 'image-1',
                    type: 'image',
                    assetRef: {
                        id: 'asset-legacy-remote',
                        name: 'poster.webp',
                        mimeType: 'application/octet-stream',
                        url: 'https://cdn.example.test/poster.webp'
                    }
                }],
                assets: [{
                    id: 'asset-legacy-remote',
                    name: 'poster.webp',
                    mimeType: 'application/octet-stream',
                    url: 'https://cdn.example.test/poster.webp'
                }]
            })
        }

        const { document, assetFiles } = await importLegacySceneFile(file)
        const uploadProjectAsset = vi.fn()

        const result = await uploadImportedProjectAssets({
            projectId: 'imported-project',
            document,
            assetFiles,
            uploadProjectAsset
        })

        expect(uploadProjectAsset).not.toHaveBeenCalled()
        expect(result.document.assets).toEqual([
            expect.objectContaining({
                id: 'asset-legacy-remote',
                mimeType: 'image/webp',
                url: 'https://cdn.example.test/poster.webp'
            })
        ])
        expect(result.document.entities[0].components.media.assetId).toBe('asset-legacy-remote')
    })
})
