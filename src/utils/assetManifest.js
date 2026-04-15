export const mergeAssetsManifest = (manifest = [], overrides = []) => {
    const baseList = Array.isArray(manifest) ? manifest : []
    if (!Array.isArray(overrides) || overrides.length === 0) {
        return baseList
    }
    const merged = new Map()
    baseList.forEach(entry => {
        if (entry?.id) {
            merged.set(entry.id, { ...entry })
        }
    })
    overrides.forEach(entry => {
        if (!entry?.id) return
        const existing = merged.get(entry.id) || {}
        merged.set(entry.id, {
            ...existing,
            ...entry
        })
    })
    return Array.from(merged.values())
}

export default mergeAssetsManifest
