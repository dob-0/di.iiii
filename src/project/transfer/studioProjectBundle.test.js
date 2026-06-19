import JSZip from 'jszip'
import { describe, expect, it, vi } from 'vitest'
import { createStudioProjectBundle, readStudioProjectBundle } from './studioProjectBundle.js'

const sourceDocument = {
    projectMeta: { id: 'project-1', spaceId: 'main', title: 'Portable' },
    assets: [
        { id: 'asset-1', name: 'texture.png', mimeType: 'image/png', size: 3, url: '/api/assets/asset-1' },
        { id: 'asset-2', name: 'sound.mp3', mimeType: 'audio/mpeg', size: 3, url: '/api/assets/asset-2' }
    ]
}

const asArrayBuffer = (blob) => new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(reader.error)
    reader.onload = () => resolve(reader.result)
    reader.readAsArrayBuffer(blob)
})

describe('Studio project bundles', () => {
    it('writes the project and every asset into one archive', async () => {
        const loadAsset = vi.fn(async (asset) => new Blob([asset.id], { type: asset.mimeType }))
        const onProgress = vi.fn()
        const bundle = await createStudioProjectBundle(sourceDocument, { loadAsset, onProgress })
        const zip = await JSZip.loadAsync(await asArrayBuffer(bundle))
        const project = JSON.parse(await zip.file('project.json').async('string'))

        expect(loadAsset).toHaveBeenCalledTimes(2)
        expect(onProgress).toHaveBeenCalledWith(expect.objectContaining({ phase: 'downloading', completed: 2, total: 2 }))
        expect(onProgress).toHaveBeenCalledWith(expect.objectContaining({ phase: 'packing' }))
        expect(project.bundle).toEqual({ format: 'dii-studio-project', version: 1 })
        expect(project.assets).toHaveLength(2)
        for (const asset of project.assets) {
            expect(zip.file(asset.archivePath)).not.toBeNull()
        }
    })

    it('reads bundled assets back as files keyed by their stable IDs', async () => {
        const bundle = await createStudioProjectBundle(sourceDocument, {
            loadAsset: async (asset) => new Blob([asset.id], { type: asset.mimeType })
        })
        const file = new File([bundle], 'portable.studio.zip', { type: 'application/zip' })
        const imported = await readStudioProjectBundle(file)

        expect(imported.document.projectMeta.title).toBe('Portable')
        expect([...imported.assetFiles.keys()]).toEqual(['asset-1', 'asset-2'])
        expect(imported.assetFiles.get('asset-1').name).toBe('texture.png')
    })

    it('keeps legacy JSON project imports working', async () => {
        const file = new File([JSON.stringify(sourceDocument)], 'portable.studio.json', { type: 'application/json' })
        const imported = await readStudioProjectBundle(file)

        expect(imported.document.assets).toHaveLength(2)
        expect(imported.assetFiles.size).toBe(0)
    })
})
