// @vitest-environment node

import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import sceneAssetsModule from './sceneAssets.js'

const { filterAvailableSceneAssets, isValidAssetId } = sceneAssetsModule

const tempDirs = []

const createTempAssetsDir = async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'dii-scene-assets-'))
    const assetsDir = path.join(root, 'assets')
    await mkdir(assetsDir, { recursive: true })
    tempDirs.push(root)
    return assetsDir
}

afterEach(async () => {
    await Promise.all(tempDirs.splice(0).map(dir => rm(dir, { recursive: true, force: true })))
})

describe('sceneAssets', () => {
    it('keeps only scene asset manifest entries whose files exist on disk', async () => {
        const assetsDir = await createTempAssetsDir()
        const availableId = '4c122913-7872-42b3-8b04-9f73942022fd'
        await writeFile(path.join(assetsDir, availableId), Buffer.from('poster'))

        const nextScene = await filterAvailableSceneAssets({
            version: 4,
            assets: [
                { id: availableId, name: 'poster.webp' },
                { id: '5d233024-8983-4ba6-a7df-61818c45ec60', name: 'missing.webp' }
            ]
        }, assetsDir)

        expect(nextScene.assets).toEqual([
            { id: availableId, name: 'poster.webp' }
        ])
    })

    it('accepts legacy non-uuid asset ids', () => {
        expect(isValidAssetId('2022u52jt')).toBe(true)
        expect(isValidAssetId('46bd7196-ff80-4d40-8f4b-94ef7b9c5b52')).toBe(true)
        expect(isValidAssetId('../escape')).toBe(false)
    })
})
