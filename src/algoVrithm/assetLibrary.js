// The media bin. Whatever sits in src/algoVrithm/assets/ is the library — there
// is no upload step, no database and no manifest to keep in sync. Drop a file
// in the folder and it appears in the director panel.
//
// WHY THE REPO AND NOT serverXR: every other di.iiii space keeps assets in
// per-space server storage, which is why a fresh clone of one renders empty
// until content is pulled down. algovrithm is deliberately code rather than a
// project document, and its media should behave the same way — clone the
// branch and the piece is complete, including at an exhibition where the DB
// may be a fresh box. The cost is binaries in git history, which is the trade
// this space is making on purpose.

// Eager so the library is a plain array at import time rather than a promise
// the panel has to await. `?url` yields the built asset's URL, so files are
// hashed and emitted by the normal build — small ones may be inlined.
const ASSET_MODULES = import.meta.glob('./assets/*.*', {
    eager: true,
    query: '?url',
    import: 'default'
})

const KIND_BY_EXTENSION = {
    png: 'image',
    jpg: 'image',
    jpeg: 'image',
    webp: 'image',
    gif: 'image',
    avif: 'image',
    mp4: 'video',
    webm: 'video',
    mov: 'video',
    glb: 'model',
    gltf: 'model'
}

export const ASSET_KINDS = ['image', 'video', 'model']

export const fileNameFromPath = (path) => path.split('/').pop() ?? path

export const extensionOf = (path) => {
    const name = fileNameFromPath(path)
    const dot = name.lastIndexOf('.')
    return dot === -1 ? '' : name.slice(dot + 1).toLowerCase()
}

/** null for anything the piece cannot render — README.md, stray .txt, .DS_Store. */
export const assetKindFromPath = (path) => KIND_BY_EXTENSION[extensionOf(path)] ?? null

/**
 * Stable id derived from the filename, so an asset clip in a pasted-back edit
 * list still resolves after a reload. Renaming a file therefore orphans its
 * clip — which is the honest behaviour: the file it pointed at is gone.
 */
export const assetIdFromPath = (path) => {
    const name = fileNameFromPath(path)
    const dot = name.lastIndexOf('.')
    return (dot === -1 ? name : name.slice(0, dot))
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
}

export const assetTitleFromPath = (path) => {
    const id = assetIdFromPath(path)
    return id ? id.replace(/-/g, ' ') : fileNameFromPath(path)
}

/** Pure half, so the tests do not depend on which files happen to be on disk. */
export const buildAssetLibrary = (modules) =>
    Object.entries(modules)
        .map(([path, src]) => ({
            id: assetIdFromPath(path),
            kind: assetKindFromPath(path),
            fileName: fileNameFromPath(path),
            title: assetTitleFromPath(path),
            src
        }))
        .filter((asset) => asset.kind !== null && asset.id !== '')
        .sort((a, b) => a.fileName.localeCompare(b.fileName))

export const ASSET_LIBRARY = buildAssetLibrary(ASSET_MODULES)

export const ASSET_FOLDER = 'src/algoVrithm/assets/'

export const findAsset = (id, library = ASSET_LIBRARY) =>
    library.find((asset) => asset.id === id) ?? null
