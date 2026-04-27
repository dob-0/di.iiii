import JSZip from 'jszip'

export const collectSceneAssetRefs = (objects = []) => {
    const refs = new Map()
    const addRef = (asset) => {
        if (!asset?.id) return
        if (!refs.has(asset.id)) {
            refs.set(asset.id, asset)
        }
    }
    objects.forEach((obj) => {
        addRef(obj.asset)
        addRef(obj.assetRef)
        addRef(obj.materialsAssetRef)
        if (Array.isArray(obj.assets)) {
            obj.assets.forEach(addRef)
        }
        if (obj.mediaVariants && typeof obj.mediaVariants === 'object') {
            Object.values(obj.mediaVariants).forEach(addRef)
        }
    })
    return refs
}

export const resolveAssetEntries = async (objects, { getAssetBlob, getAssetSourceUrl } = {}) => {
    const entries = []
    const assetRefs = collectSceneAssetRefs(objects || [])
    for (const [assetId, meta] of assetRefs.entries()) {
        try {
            const sourceUrl = getAssetSourceUrl?.(assetId) || null
            const blob = await getAssetBlob?.(assetId)
            if (blob) {
                entries.push({ meta, blob, source: 'local', sourceUrl })
                continue
            }
            if (sourceUrl) {
                const response = await fetch(sourceUrl)
                if (!response.ok) {
                    continue
                }
                const remoteBlob = await response.blob()
                entries.push({ meta, blob: remoteBlob, source: 'remote', sourceUrl })
            }
        } catch (error) {
        }
    }
    return entries
}

export const createSceneArchive = async (sceneData, { getAssetBlob, getAssetSourceUrl } = {}) => {
    const entries = await resolveAssetEntries(sceneData.objects || [], { getAssetBlob, getAssetSourceUrl })

    const zip = new JSZip()
    const assetsManifest = []
    entries.forEach(({ meta, blob }) => {
        const archivePath = `assets/${meta.id}`
        zip.file(archivePath, blob)
        assetsManifest.push({
            ...meta,
            archivePath
        })
    })
    const payload = {
        ...sceneData,
        assets: assetsManifest
    }
    zip.file('scene.json', JSON.stringify(payload, null, 2))
    return zip.generateAsync({ type: 'blob' })
}

export const loadSceneArchive = async (arrayBuffer, applyLoadedScene, options) => {
    const zip = await JSZip.loadAsync(arrayBuffer)
    const sceneEntry = zip.file('scene.json')
    if (!sceneEntry) {
        throw new Error('Archive is missing scene.json')
    }
    const sceneText = await sceneEntry.async('string')
    const sceneData = JSON.parse(sceneText)
    const blobLoader = async (asset) => {
        const assetFile = zip.file(asset.archivePath)
        if (!assetFile) {
            return null
        }
        return assetFile.async('blob')
    }
    return applyLoadedScene(sceneData, blobLoader, options)
}
