// Where a dragged card may go, and when the canvas pans under it.
//
// The rule (audit 2026-10-05, B1): a card's position is its TOP-LEFT corner
// in graph units. The drag used to clamp that corner with the numbers of the
// PLACEMENT clamp, which treats the point as the card's CENTRE, so the card
// stopped half a card (plus the door) short of the left edge, and 44 units
// short of the top. Here the rule is stated on screen, in the units a person
// sees: the card's top-left corner stays at least GRAB_PX inside every edge
// of the canvas, so its title is always there to grab.
//
// Auto-pan is the standard node-editor edge scroll (Figma, Blender, TouchDesigner):
// inside a band of EDGE_BAND_PX at each edge the canvas pans, faster the deeper
// the pointer is, so a card can be carried further than the screen shows.

export const GRAB_PX = 24
export const EDGE_BAND_PX = 24
export const EDGE_PAN_MAX_PX_PER_S = 900

const clamp = (value, min, max) => Math.min(Math.max(value, min), max)

/**
 * Clamp a card's top-left (graph units) so it stays GRAB_PX inside the canvas.
 * @param {{x:number,y:number}} topLeft  wanted top-left, graph units
 * @param {{rect:{left:number,top:number,right:number,bottom:number}, panX:number, panY:number, zoom:number}} view
 *        rect is the canvas on screen; panX/panY/zoom the viewport.
 */
export const dragClamp = (topLeft, { rect, panX, panY, zoom, grab = GRAB_PX, inset = null }) => {
    if (!rect || !(rect.right - rect.left > 0) || !(rect.bottom - rect.top > 0) || !(zoom > 0)) return { x: topLeft.x, y: topLeft.y }
    // `inset` is what a docked window or panel covers at each edge of the
    // canvas, in screen px: the card stays in the VISIBLE band, not under it.
    const cover = { left: inset?.left || 0, right: inset?.right || 0, top: inset?.top || 0, bottom: inset?.bottom || 0 }
    const minX = (cover.left + grab) / zoom - panX / zoom
    const maxX = (rect.right - rect.left - cover.right - grab) / zoom - panX / zoom
    const minY = (cover.top + grab) / zoom - panY / zoom
    const maxY = (rect.bottom - rect.top - cover.bottom - grab) / zoom - panY / zoom
    return {
        x: maxX > minX ? clamp(topLeft.x, minX, maxX) : topLeft.x,
        y: maxY > minY ? clamp(topLeft.y, minY, maxY) : topLeft.y
    }
}

/**
 * Pan velocity (screen px per second) for a pointer near or past an edge, or
 * null when it is clear of every band. Positive vx means the canvas content
 * moves right (the pointer is at the left edge).
 */
export const edgePanVelocity = (pointer, rect, { band = EDGE_BAND_PX, max = EDGE_PAN_MAX_PX_PER_S } = {}) => {
    if (!rect || !(rect.right - rect.left > band * 2) || !(rect.bottom - rect.top > band * 2)) return null
    const depth = (distance) => clamp((band - distance) / band, 0, 1)
    const left = depth(pointer.x - rect.left)
    const right = depth(rect.right - pointer.x)
    const top = depth(pointer.y - rect.top)
    const bottom = depth(rect.bottom - pointer.y)
    const vx = (left - right) * max
    const vy = (top - bottom) * max
    return vx || vy ? { vx, vy } : null
}
