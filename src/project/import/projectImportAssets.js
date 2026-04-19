import {
    detectEntityTypeForAsset,
    resolveAssetMimeType
} from '../../utils/mediaAssetTypes.js'

const SERVER_SAFE_ASSET_ID_REGEX = /^[a-f0-9-]{8,64}$/i

export const normalizeLegacyAssetKey = (value) => {
    const text = String(value || '').trim()
    return text || null
}

export const isServerSafeAssetId = (value) => {
    const text = normalizeLegacyAssetKey(value)
    return text ? SERVER_SAFE_ASSET_ID_REGEX.test(text) : false
}

const normalizeUploadedAsset = (uploaded = {}, fallback = {}) => {
    const id = normalizeLegacyAssetKey(uploaded.id || uploaded.assetId)
    if (!id) {
        throw new Error(`Asset upload did not return an id for ${fallback.name || fallback.legacyAssetId || 'imported asset'}.`)
    }
    const file = fallback.file
    return {
        id,
        name: uploaded.name || file?.name || fallback.legacyAssetId || id,
        mimeType: resolveAssetMimeType({
            name: uploaded.name || file?.name || fallback.legacyAssetId || id,
            mimeType: uploaded.mimeType || file?.type || ''
        }),
        size: uploaded.size ?? file?.size ?? 0,
        createdAt: uploaded.createdAt || Date.now(),
        source: uploaded.source || 'server',
        url: uploaded.url || ''
    }
}

export const rewriteImportedProjectDocumentAssets = (document = {}, uploadedByLegacyId = new Map()) => {
    const uploadedAssets = Array.from(uploadedByLegacyId.values())
    const uploadedAssetIds = new Set()
    const nextAssets = []
    const retainedAssetIds = new Set()

    ;(Array.isArray(document.assets) ? document.assets : []).forEach((asset) => {
        const legacyAssetId = normalizeLegacyAssetKey(asset?.id)
        const uploaded = legacyAssetId ? uploadedByLegacyId.get(legacyAssetId) : null
        if (uploaded) {
            nextAssets.push(uploaded)
            uploadedAssetIds.add(uploaded.id)
            retainedAssetIds.add(legacyAssetId)
            return
        }
        if (!legacyAssetId || isServerSafeAssetId(legacyAssetId) || asset?.url) {
            nextAssets.push(asset)
            if (legacyAssetId) {
                retainedAssetIds.add(legacyAssetId)
            }
        }
    })

    uploadedAssets.forEach((asset) => {
        if (uploadedAssetIds.has(asset.id)) return
        nextAssets.push(asset)
        uploadedAssetIds.add(asset.id)
    })

    const nextEntities = (Array.isArray(document.entities) ? document.entities : []).map((entity) => {
        const media = entity?.components?.media
        const legacyAssetId = normalizeLegacyAssetKey(media?.assetId)
        if (!legacyAssetId) return entity

        const uploaded = uploadedByLegacyId.get(legacyAssetId)
        if (!uploaded) {
            if (isServerSafeAssetId(legacyAssetId)) {
                return entity
            }
            if (retainedAssetIds.has(legacyAssetId)) {
                return entity
            }
            return {
                ...entity,
                components: {
                    ...entity.components,
                    media: {
                        ...media,
                        assetId: null
                    }
                }
            }
        }

        const nextType = detectEntityTypeForAsset(uploaded, null)
        return {
            ...entity,
            type: nextType || entity.type,
            components: {
                ...entity.components,
                media: {
                    ...media,
                    assetId: uploaded.id
                }
            }
        }
    })

    return {
        ...document,
        assets: nextAssets,
        entities: nextEntities
    }
}

export async function uploadImportedProjectAssets({
    projectId,
    document,
    assetFiles,
    uploadProjectAsset
} = {}) {
    if (!projectId) {
        throw new Error('Project id is required before importing assets.')
    }
    if (typeof uploadProjectAsset !== 'function') {
        throw new Error('Asset upload function is required.')
    }

    const uploadedByLegacyId = new Map()
    const entries = assetFiles instanceof Map ? Array.from(assetFiles.entries()) : []

    for (const [rawLegacyAssetId, assetFile] of entries) {
        const legacyAssetId = normalizeLegacyAssetKey(rawLegacyAssetId)
        if (!legacyAssetId || !assetFile) continue
        const uploadOptions = isServerSafeAssetId(legacyAssetId)
            ? { assetId: legacyAssetId }
            : {}
        const uploaded = await uploadProjectAsset(projectId, assetFile, uploadOptions)
        uploadedByLegacyId.set(legacyAssetId, normalizeUploadedAsset(uploaded, {
            file: assetFile,
            legacyAssetId
        }))
    }

    return {
        assetMap: uploadedByLegacyId,
        document: rewriteImportedProjectDocumentAssets(document, uploadedByLegacyId)
    }
}
