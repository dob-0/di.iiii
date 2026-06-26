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

export const resolveAssetEntries = async (
    objects,
    { getAssetBlob, getAssetSourceUrl, getAssetSourceUrls, onMissingAsset } = {}
) => {
    const entries = []
    const assetRefs = collectSceneAssetRefs(objects || [])
    for (const [assetId, meta] of assetRefs.entries()) {
        let resolved = false
        try {
            const primaryUrl = getAssetSourceUrl?.(assetId) || null
            const blob = await getAssetBlob?.(assetId)
            if (blob) {
                entries.push({ meta, blob, source: 'local', sourceUrl: primaryUrl })
                continue
            }
            // Try every known source: the primary URL plus any additional
            // candidates (e.g. the space asset route, which holds media the
            // project route 404s on). First one that responds wins.
            const urls = []
            if (primaryUrl) urls.push(primaryUrl)
            for (const url of getAssetSourceUrls?.(assetId, meta) || []) {
                if (url && !urls.includes(url)) urls.push(url)
            }
            for (const url of urls) {
                try {
                    const response = await fetch(url)
                    if (!response.ok) continue
                    entries.push({ meta, blob: await response.blob(), source: 'remote', sourceUrl: url })
                    resolved = true
                    break
                } catch {
                    // try the next candidate
                }
            }
        } catch {
            // fall through to the missing-asset report below
        }
        if (!resolved) onMissingAsset?.(meta || { id: assetId })
    }
    return entries
}

export const createSceneArchive = async (sceneData, { getAssetBlob, getAssetSourceUrl, getAssetSourceUrls, onMissingAsset } = {}) => {
    const entries = await resolveAssetEntries(sceneData.objects || [], { getAssetBlob, getAssetSourceUrl, getAssetSourceUrls, onMissingAsset })

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
