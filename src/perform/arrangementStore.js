import { GRID } from './presets.js'

// THE REMEMBERED ARRANGEMENT of the Perform desk: where each window stands,
// how big it is, its stacking and its state (minimised, maximised, hidden),
// kept PER DEVICE in localStorage, under ONE key that carries the project.
// Nothing goes into the project document. It is the same shape the desk holds
// in state ({ presetId, widthClass, windows, rects, order, minimized, restore }),
// in percent rectangles, so a place written on a big screen is the same shape
// on a small one — and it is clamped into the desk on every read anyway.
// A value that is corrupt, of another version, or for another width class
// reads as nothing: the preset opens as it always did. "Arrange all" and
// "Reset layout" stay the way back.
export const ARRANGEMENT_VERSION = 1
export const arrangementKey = (spaceId, projectId) => `di.perform.arrangement.v${ARRANGEMENT_VERSION}:${spaceId || '-'}:${projectId || '-'}`

const MAX_WINDOWS = 24

const storage = () => {
    try {
        return typeof window !== 'undefined' ? window.localStorage || null : null
    } catch {
        return null
    }
}

/** A percent rectangle forced inside the desk and no smaller than one unit of its grid; null if it is not a rectangle. */
export const clampRect = (rect, grid = GRID.wide) => {
    // Not normalizePerformRect: it trims the width to what is left of the desk to the right of x,
    // so a window placed near the right edge would shrink to a sliver. Here the window keeps its
    // size and is shifted back into the desk.
    if (!Array.isArray(rect) || rect.length !== 4) return null
    const base = rect.map(Number)
    if (!base.every(Number.isFinite)) return null
    const minW = 100 / grid.cols
    const minH = 100 / grid.rows
    const width = Math.min(100, Math.max(minW, base[2]))
    const height = Math.min(100, Math.max(minH, base[3]))
    const x = Math.min(100 - width, Math.max(0, base[0]))
    const y = Math.min(100 - height, Math.max(0, base[1]))
    return [x, y, width, height].map((n) => Math.round(n * 100) / 100)
}

/** Any stored value → a safe arrangement, or null. Pure. */
export const sanitizeArrangement = (value) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null
    if (value.v !== ARRANGEMENT_VERSION) return null
    if (typeof value.presetId !== 'string' || !value.presetId) return null
    const widthClass = value.widthClass === 'narrow' ? 'narrow' : value.widthClass === 'wide' ? 'wide' : null
    if (!widthClass || !Array.isArray(value.windows) || !value.rects || typeof value.rects !== 'object') return null
    const grid = GRID[widthClass]
    const seen = new Set()
    const windows = []
    const rects = {}
    for (const item of value.windows.slice(0, MAX_WINDOWS)) {
        if (!item || typeof item.id !== 'string' || typeof item.kind !== 'string' || !item.id || item.id.length > 60 || seen.has(item.id)) continue
        const rect = clampRect(value.rects[item.id], grid)
        if (!rect) continue
        seen.add(item.id)
        windows.push({ id: item.id, kind: item.kind })
        rects[item.id] = rect
    }
    if (!windows.length) return null
    const order = [
        ...(Array.isArray(value.order) ? value.order.filter((id, i, all) => seen.has(id) && all.indexOf(id) === i) : []),
    ]
    windows.forEach((item) => { if (!order.includes(item.id)) order.push(item.id) })
    const minimized = {}
    if (value.minimized && typeof value.minimized === 'object') {
        for (const id of Object.keys(value.minimized)) if (seen.has(id) && value.minimized[id] === true) minimized[id] = true
    }
    const restore = {}
    if (value.restore && typeof value.restore === 'object') {
        for (const id of Object.keys(value.restore)) {
            const rect = seen.has(id) ? clampRect(value.restore[id], grid) : null
            if (rect) restore[id] = rect
        }
    }
    return { presetId: value.presetId, widthClass, windows, rects, order, minimized, restore, changed: true }
}

export const readArrangement = (spaceId, projectId) => {
    const store = storage()
    if (!store) return null
    try {
        const raw = store.getItem(arrangementKey(spaceId, projectId))
        return raw ? sanitizeArrangement(JSON.parse(raw)) : null
    } catch {
        return null
    }
}

export const writeArrangement = (spaceId, projectId, arrangement) => {
    const store = storage()
    if (!store || !arrangement) return false
    try {
        const { presetId, widthClass, windows, rects, order, minimized, restore } = arrangement
        store.setItem(arrangementKey(spaceId, projectId), JSON.stringify({ v: ARRANGEMENT_VERSION, presetId, widthClass, windows, rects, order, minimized, restore }))
        return true
    } catch {
        return false
    }
}

export const clearArrangement = (spaceId, projectId) => {
    const store = storage()
    if (!store) return false
    try {
        store.removeItem(arrangementKey(spaceId, projectId))
        return true
    } catch {
        return false
    }
}
