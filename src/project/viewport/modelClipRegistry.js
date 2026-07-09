// Animation clip names discovered while loading model assets. The inspector's
// Clip picker can't know a file's clips until a viewport has actually loaded
// it, so ModelObject reports them here and the picker subscribes.
const clipsByAsset = new Map()
const listeners = new Set()

export const registerModelClips = (assetId, clips = []) => {
    if (!assetId) return
    const names = clips.map((clip) => clip?.name).filter(Boolean)
    const previous = clipsByAsset.get(assetId)
    if (previous && previous.length === names.length && previous.every((n, i) => n === names[i])) return
    clipsByAsset.set(assetId, names)
    listeners.forEach((listener) => listener())
}

// Stable empty result — getSnapshot consumers (useSyncExternalStore) need
// referential equality between calls or they re-render forever.
const EMPTY = Object.freeze([])
export const getModelClips = (assetId) => clipsByAsset.get(assetId) || EMPTY

export const subscribeModelClips = (listener) => {
    listeners.add(listener)
    return () => listeners.delete(listener)
}
