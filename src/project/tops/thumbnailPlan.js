// When each picture tile is redrawn. A tile on a node card is 160 px wide and
// is read by eye a few times a second; it used to be redrawn every third
// frame (20 times a second), each one a GL draw plus a canvas-to-canvas copy
// on the page's main thread. Now a small tile is due at most 4 times a second
// and only a few tiles are drawn on any one frame, oldest first, so the cost
// is spread flat instead of arriving as one bunch every third frame. A big
// canvas (a deck's master window, a preview pane) keeps the old 20 per second.

export const SMALL_TILE_EVERY_MS = 250
export const BIG_TILE_EVERY_MS = 33
export const BIG_TILE_WIDTH = 320
export const TILES_PER_FRAME = 3

/**
 * @param {{ smallEveryMs?: number, bigEveryMs?: number, perFrame?: number }} [options]
 */
export const createThumbnailScheduler = ({
    smallEveryMs = SMALL_TILE_EVERY_MS,
    bigEveryMs = BIG_TILE_EVERY_MS,
    perFrame = TILES_PER_FRAME
} = {}) => {
    // context -> time of its last draw (a WeakMap: a tile that goes away is forgotten)
    const last = new WeakMap()
    const everyFor = (context) => ((context?.canvas?.width || 0) >= BIG_TILE_WIDTH ? bigEveryMs : smallEveryMs)

    /**
     * The tiles to draw on this frame, in the shape engine.thumbnails takes.
     * @param {Array<Map<string, CanvasRenderingContext2D>>} groups registrations, as topThumbnailGroups()
     * @param {(nodeId: string) => boolean} has does the engine hold a picture for this node
     * @param {number} now ms clock
     * @returns {Array<Map<string, CanvasRenderingContext2D>>}
     */
    const due = (groups, has, now) => {
        const waiting = []
        for (const [index, group] of groups.entries()) {
            for (const [nodeId, context] of group) {
                if (!context || !has(nodeId)) continue
                const since = now - (last.get(context) ?? -Infinity)
                if (since >= everyFor(context)) waiting.push({ index, nodeId, context, since })
            }
        }
        // Big tiles are never held back by the per-frame cap; small ones go oldest first.
        const chosen = []
        let small = 0
        waiting.sort((a, b) => b.since - a.since)
        for (const item of waiting) {
            const big = (item.context.canvas?.width || 0) >= BIG_TILE_WIDTH
            if (!big) { if (small >= perFrame) continue; small += 1 }
            chosen.push(item)
        }
        const out = []
        for (const item of chosen) {
            last.set(item.context, now)
            if (!out[item.index]) out[item.index] = new Map()
            out[item.index].set(item.nodeId, item.context)
        }
        return out.filter(Boolean)
    }
    return { due }
}
