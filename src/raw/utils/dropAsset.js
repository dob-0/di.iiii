import { detectAssetMediaKind } from '../../utils/mediaAssetTypes.js'

// Which node a dropped file becomes. Keyed by the same media kinds the rest
// of the platform already detects, so a file behaves identically whether it
// arrives through Studio's importer or onto Raw's canvas.
export const NODE_TYPE_BY_ASSET_KIND = {
    model: 'geom.model',
    video: 'media.video',
    audio: 'media.audio',
    image: 'view.image'
}

// A File carries .name and .type, which is exactly what detectAssetMediaKind
// reads — no adapter needed. Returns null for anything Raw has no node for,
// so the caller can say so out loud instead of dropping it on the floor.
export const pickNodeTypeForFile = (file) => {
    if (!file) return null
    return NODE_TYPE_BY_ASSET_KIND[detectAssetMediaKind(file)] || null
}

export const partitionDroppedFiles = (files = []) => {
    const accepted = []
    const rejected = []
    for (const file of Array.from(files || [])) {
        const typeId = pickNodeTypeForFile(file)
        if (typeId) accepted.push({ file, typeId })
        else rejected.push(file)
    }
    return { accepted, rejected }
}

// Which scope a dropped file joins. Dropping ON a room puts it IN that room —
// otherwise it lands in the scope the graph is currently showing. `elementAt`
// is document.elementFromPoint, passed in so this stays testable.
export const resolveDropScopeId = (elementAt, x, y, fallbackScopeId = null) => {
    const element = typeof elementAt === 'function' ? elementAt(x, y) : null
    const panel = element?.closest?.('[data-world-scope-id]')
    if (!panel) return fallbackScopeId
    // The attribute is written as '' for the root scope, which is a real scope
    // and must not be confused with "no room here".
    const value = panel.getAttribute('data-world-scope-id')
    return value === '' ? null : value
}

// Said to the person, not logged. A drop that does nothing and explains
// nothing is the exact failure this whole change exists to remove.
export const describeRejectedFiles = (rejected = []) => {
    if (!rejected.length) return ''
    const names = rejected.map((file) => file?.name || 'file')
    const list = names.length > 3
        ? `${names.slice(0, 3).join(', ')} and ${names.length - 3} more`
        : names.join(', ')
    return `Raw has no node for ${list}. It takes 3D models (.glb, .gltf, .obj, .stl, .fbx), video, sound and images.`
}
