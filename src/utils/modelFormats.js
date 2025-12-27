export const MODEL_FORMATS = {
    GLTF: 'gltf',
    OBJ: 'obj',
    STL: 'stl'
}

const extensionMatchers = [
    { format: MODEL_FORMATS.GLTF, extensions: ['.glb', '.gltf'] },
    { format: MODEL_FORMATS.OBJ, extensions: ['.obj'] },
    { format: MODEL_FORMATS.STL, extensions: ['.stl'] }
]

const mimeMatchers = [
    { format: MODEL_FORMATS.GLTF, hints: ['gltf', 'glb'] },
    { format: MODEL_FORMATS.OBJ, hints: ['obj'] },
    { format: MODEL_FORMATS.STL, hints: ['stl'] }
]

const normalize = (value) => (value || '').toLowerCase()

export const stripExtension = (filename = '') => {
    const normalized = normalize(filename)
    const lastDot = normalized.lastIndexOf('.')
    if (lastDot === -1) return normalized
    return normalized.slice(0, lastDot)
}

export const detectModelFormatFromName = (name = '') => {
    const normalized = normalize(name)
    return extensionMatchers.find(({ extensions }) =>
        extensions.some((ext) => normalized.endsWith(ext))
    )?.format || null
}

export const detectModelFormatFromMime = (mimeType = '') => {
    const normalized = normalize(mimeType)
    return mimeMatchers.find(({ hints }) =>
        hints.some((hint) => normalized.includes(hint))
    )?.format || null
}

export const detectModelFormatFromFile = (file) => {
    if (!file) return null
    return detectModelFormatFromName(file.name) || detectModelFormatFromMime(file.type)
}

export const detectModelFormatFromMeta = (meta = {}) => {
    if (!meta) return null
    return detectModelFormatFromName(meta.name) || detectModelFormatFromMime(meta.mimeType)
}
