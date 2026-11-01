// Keeping the visitor inside the space.
//
// Walk mode has never had wall collision -- the walker was only clamped to one
// big axis-aligned box derived from entity positions plus a 22m margin, so in
// any space with real architecture you could stroll out through a wall and get
// lost in empty world. `worldState.walkableAreas` fixes that by declaring the
// walkable floor plan as a union of rectangles: a corridor is one rectangle,
// each side room is another.
//
// Rectangles are tested WITHOUT padding on purpose. Padding each rectangle
// independently would shrink it away from its neighbours and seal the joins
// between them, so you could no longer step from a corridor into a room that
// adjoins it. Authors keep the visitor off the walls by insetting the rectangles
// they author, and overlap them where two regions meet.

export function isInsideAreas(areas, x, z) {
    if (!areas || !areas.length) return true
    for (const a of areas) {
        if (x >= a.minX && x <= a.maxX && z >= a.minZ && z <= a.maxZ) return true
    }
    return false
}

// Nearest reachable point, used only to recover a walker that is already
// outside every region (a bad spawn, or areas edited while someone is standing
// there). Without this, such a walker would be frozen in place forever.
export function nearestPointInAreas(areas, x, z) {
    let best = null
    let bestDist = Infinity
    for (const a of areas) {
        const cx = Math.min(Math.max(x, a.minX), a.maxX)
        const cz = Math.min(Math.max(z, a.minZ), a.maxZ)
        const d = (cx - x) ** 2 + (cz - z) ** 2
        if (d < bestDist) { bestDist = d; best = { x: cx, z: cz } }
    }
    return best
}

/**
 * Resolve a intended move against the walkable regions.
 * Falls back to the intended position when no regions are declared, so spaces
 * that never author them behave exactly as they always have.
 */
export function confineToAreas(areas, fromX, fromZ, toX, toZ) {
    if (!areas || !areas.length) return { x: toX, z: toZ }
    if (isInsideAreas(areas, toX, toZ)) return { x: toX, z: toZ }

    // Already outside (bad spawn / edited regions): walk them back in rather
    // than locking them where they stand.
    if (!isInsideAreas(areas, fromX, fromZ)) {
        return nearestPointInAreas(areas, toX, toZ) || { x: fromX, z: fromZ }
    }

    // Blocked: retry each axis alone, so hitting a wall at an angle slides
    // along it instead of stopping dead.
    if (isInsideAreas(areas, toX, fromZ)) return { x: toX, z: fromZ }
    if (isInsideAreas(areas, fromX, toZ)) return { x: fromX, z: toZ }
    return { x: fromX, z: fromZ }
}

/**
 * The entity-position bounds (LiveProjectScene) know nothing of how big a model is: ONE hall model at the origin
 * got a +-22 m box, so the 72 m Cinema House floor stopped the walker at 22 m (2026-11-01). Where the author
 * declared a floor plan, the plan is the author's decision of where a visitor may stand: the bounds grow to cover
 * it. They never shrink, and with no plan nothing changes.
 */
export function boundsCoveringAreas(bounds, areas) {
    if (!bounds || !Array.isArray(areas) || !areas.length) return bounds
    const out = { ...bounds }
    for (const a of areas) {
        if (![a?.minX, a?.maxX, a?.minZ, a?.maxZ].every(Number.isFinite)) continue
        out.minX = Math.min(out.minX, a.minX)
        out.maxX = Math.max(out.maxX, a.maxX)
        out.minZ = Math.min(out.minZ, a.minZ)
        out.maxZ = Math.max(out.maxZ, a.maxZ)
    }
    return out
}

/**
 * Fly ceiling (round 6): an authored area may carry `maxY`, the highest point of the model it frames. Fly stops there
 * (the eye 0.3 m under it) instead of at the engine's 60 m, so a visitor cannot rise out of the roof of a floor plan.
 * No area with a finite maxY: null, nothing changes.
 */
export function ceilingOfAreas(areas) {
    if (!Array.isArray(areas)) return null
    let top = null
    for (const a of areas) if (Number.isFinite(a?.maxY)) top = top === null ? a.maxY : Math.max(top, a.maxY)
    return top
}
