import { detectModelFormatFromMeta } from './modelFormats.js'

const GENERIC_MIME_TYPES = new Set([
    '',
    'application/octet-stream',
    'binary/octet-stream'
])

const EXTENSION_MIME_TYPES = new Map([
    ['.jpg', 'image/jpeg'],
    ['.jpeg', 'image/jpeg'],
    ['.png', 'image/png'],
    ['.gif', 'image/gif'],
    ['.webp', 'image/webp'],
    ['.svg', 'image/svg+xml'],
    ['.mp4', 'video/mp4'],
    ['.m4v', 'video/mp4'],
    ['.mov', 'video/quicktime'],
    ['.webm', 'video/webm'],
    ['.ogv', 'video/ogg'],
    ['.mp3', 'audio/mpeg'],
    ['.m4a', 'audio/mp4'],
    ['.wav', 'audio/wav'],
    ['.ogg', 'audio/ogg'],
    ['.oga', 'audio/ogg'],
    ['.flac', 'audio/flac'],
    ['.glb', 'model/gltf-binary'],
    ['.gltf', 'model/gltf+json'],
    ['.obj', 'model/obj'],
    ['.stl', 'model/stl']
])

const normalizeMimeType = (value = '') => String(value || '').trim().toLowerCase()
const normalizeName = (value = '') => String(value || '').trim().toLowerCase()

const getAssetName = (asset = {}) => asset?.name || asset?.filename || asset?.originalname || ''
const getAssetMime = (asset = {}) => asset?.mimeType || asset?.type || ''

const getExtension = (name = '') => {
    const normalized = normalizeName(name)
    const dotIndex = normalized.lastIndexOf('.')
    return dotIndex >= 0 ? normalized.slice(dotIndex) : ''
}

export const isGenericMimeType = (mimeType = '') => GENERIC_MIME_TYPES.has(normalizeMimeType(mimeType))

export const inferMimeTypeFromName = (name = '') => EXTENSION_MIME_TYPES.get(getExtension(name)) || ''

export const resolveAssetMimeType = (asset = {}, fallback = 'application/octet-stream') => {
    const mimeType = normalizeMimeType(getAssetMime(asset))
    if (mimeType && !isGenericMimeType(mimeType)) {
        return mimeType
    }
    return inferMimeTypeFromName(getAssetName(asset)) || mimeType || fallback
}

export const detectAssetMediaKind = (asset = {}) => {
    const mimeType = resolveAssetMimeType(asset, '')
    if (mimeType.startsWith('image/')) return 'image'
    if (mimeType.startsWith('video/')) return 'video'
    if (mimeType.startsWith('audio/')) return 'audio'
    if (mimeType.startsWith('model/') || detectModelFormatFromMeta({
        name: getAssetName(asset),
        mimeType
    })) {
        return 'model'
    }
    return null
}

export const detectEntityTypeForAsset = (asset = {}, fallback = 'model') => {
    return detectAssetMediaKind(asset) || fallback
}

export const getExpectedPlayableTopLevel = (asset = {}) => {
    const kind = detectAssetMediaKind(asset)
    if (['image', 'video', 'audio'].includes(kind)) {
        return kind
    }
    const mimeType = normalizeMimeType(getAssetMime(asset))
    if (!mimeType || isGenericMimeType(mimeType)) {
        return null
    }
    const topLevel = mimeType.split('/')[0]
    return ['image', 'video', 'audio'].includes(topLevel) ? topLevel : null
}
