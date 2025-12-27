import { clear, createStore, del, get, set } from 'idb-keyval'

const assetStore = createStore('dii-scene-assets', 'files')

let assetStoreQuotaExceeded = false

const generateId = () => {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
        return crypto.randomUUID()
    }
    return Math.random().toString(36).slice(2, 11)
}

const toMeta = (record) => {
    if (!record) return null
    const { id, name, mimeType, size, createdAt } = record
    return { id, name, mimeType, size, createdAt }
}

const isQuotaExceeded = (error) => {
    if (!error) return false
    if (error.name === 'QuotaExceededError' || error.name === 'NS_ERROR_DOM_QUOTA_REACHED') return true
    return error.code === 22 || error.code === 1014
}

export const hasAssetStoreQuotaExceeded = () => assetStoreQuotaExceeded
export const resetAssetStoreQuotaExceeded = () => {
    assetStoreQuotaExceeded = false
}

export async function saveAssetFromFile(file, options = {}) {
    const blob = file instanceof Blob ? file : new Blob([file], { type: file?.type || 'application/octet-stream' })
    return saveAssetBlob(blob, {
        name: file?.name || options.name,
        mimeType: blob.type || options.mimeType,
        id: options.id,
        createdAt: options.createdAt
    })
}

export async function saveAssetBlob(blob, { name = 'asset', mimeType = blob.type || 'application/octet-stream', id, createdAt = Date.now() } = {}) {
    const assetId = id || generateId()
    const meta = {
        id: assetId,
        name,
        mimeType,
        size: blob?.size ?? 0,
        createdAt
    }
    try {
        await set(assetId, { ...meta, blob }, assetStore)
    } catch (error) {
        if (isQuotaExceeded(error)) {
            assetStoreQuotaExceeded = true
        }
        throw error
    }
    return meta
}

export async function getAssetRecord(id) {
    const record = await get(id, assetStore)
    if (!record) return null
    return { ...record, meta: toMeta(record) }
}

export async function getAssetMeta(id) {
    const record = await getAssetRecord(id)
    return record?.meta ?? null
}

export async function getAssetBlob(id) {
    const record = await get(id, assetStore)
    return record?.blob ?? null
}

export async function deleteAsset(id) {
    if (!id) return
    await del(id, assetStore)
}

export async function clearAllAssets() {
    await clear(assetStore)
    assetStoreQuotaExceeded = false
}

export const blobToDataUrl = (blob) => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onloadend = () => resolve(reader.result)
        reader.onerror = reject
        reader.readAsDataURL(blob)
    })
}

const base64ToBytes = (base64String) => {
    if (typeof atob === 'function') {
        const binaryString = atob(base64String)
        const len = binaryString.length
        const bytes = new Uint8Array(len)
        for (let i = 0; i < len; i++) {
            bytes[i] = binaryString.charCodeAt(i)
        }
        return bytes
    }
    const buffer = Buffer.from(base64String, 'base64')
    return new Uint8Array(buffer)
}

export const dataUrlToBlob = (dataUrl) => {
    const [metaPart, base64Data] = dataUrl.split(',')
    const mimeMatch = /data:(.*?);base64/.exec(metaPart || '')
    const mimeType = mimeMatch ? mimeMatch[1] : 'application/octet-stream'
    const bytes = base64ToBytes(base64Data || '')
    return new Blob([bytes], { type: mimeType })
}
