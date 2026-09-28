import { createBasePathHelpers, joinPath } from '../project/routing/laneBasePath.js'

// /{space}/equipment/{projectId} — the show's equipment list: the inventory (every device
// as a tile, its item card, take or skip, how many) and the order (cost by the quote's day
// rule, CSV, a printable A4 order). docs/architecture/RIG_BUILD.md §13. The same
// three-segment shape as /{space}/plot/{id}, /{space}/cards/{id} and /{space}/build/{id},
// claimed the same way, before the generic /{space}/{projectSlug} rule would read
// "equipment" as a project. Behind the same gate, because it writes the same document.
export const EQUIPMENT_SEGMENT = 'equipment'

const { getBasePrefix, stripBasePath } = createBasePathHelpers(import.meta.env.BASE_URL || '/')

export const buildEquipmentPath = (spaceId, projectId) => joinPath(getBasePrefix(), spaceId, EQUIPMENT_SEGMENT, projectId)

const EMPTY = { isEquipment: false, spaceId: null, projectId: null }

export const getEquipmentLocationState = (locationLike = null) => {
    const resolved = locationLike || (typeof window !== 'undefined' ? window.location : null)
    if (!resolved) return EMPTY
    const relative = stripBasePath(resolved.pathname || '/').replace(/^\/+/g, '').replace(/\/+$/g, '')
    const segments = relative ? relative.split('/') : []
    if (segments.length !== 3 || segments[1] !== EQUIPMENT_SEGMENT || !segments[0] || !segments[2]) return EMPTY
    return { isEquipment: true, spaceId: segments[0], projectId: segments[2] }
}

export const isEquipmentLocation = (state = null) => Boolean(state?.isEquipment)
