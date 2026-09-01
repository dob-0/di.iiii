// di.desk — where things sit, and the two ways of arranging them.
//
// The desk borrowed from `~/di-crypto/desk` has one idea worth more than its
// chrome: the SAME set of windows has more than one arrangement. `canvas` is
// where you put things; `grid` is where they are tidied without being moved
// in spirit. Switching between them is not a layout change, it is a way of
// looking — which is the same relationship Studio and Raw already have with
// one project, and the same one the landing has with the room.

import { DEFAULT_RAW_WORKSPACE_TOP } from '../raw/utils/windowLayout.js'

export const DESK_GRID = 24
export const WINDOW_GAP = 16

// DesktopWindow clamps every frame to a minimum top and will not be argued
// with. Laying the first row above it meant the clamp quietly pushed row 0
// down while row 1 stayed where the maths put it — and the two rows overlapped
// by exactly the difference. The desk lays out to the same floor the windows
// are held to, rather than discovering it 48px at a time.
export const DESK_TOP = DEFAULT_RAW_WORKSPACE_TOP

// What can stand on the desk. Written as sentences on purpose: the add menu
// is read, not scanned, and "note — free text" tells a first-timer what they
// are about to get in a way that a taxonomy of categories never does.
export const DESK_KINDS = [
    { kind: 'note', label: 'note', what: 'free text', width: 320, height: 220 },
    { kind: 'room', label: 'room', what: 'the space, live', width: 640, height: 420 },
    { kind: 'graph', label: 'graph', what: 'the nodes', width: 560, height: 380 }
]

export const kindSpec = (kind) => DESK_KINDS.find((entry) => entry.kind === kind) || DESK_KINDS[0]

const snap = (value) => Math.round(value / DESK_GRID) * DESK_GRID

let sequence = 0
export const nextWindowId = (kind) => `${kind}-${Date.now().toString(36)}-${(sequence += 1)}`

// A new window lands where there is room, not on top of the last one. Spiral
// out from the middle of what the visitor is looking at and take the first
// clear spot — placing them all at one offset means the fifth is a stack.
export const placeWindow = (windows, spec, viewport) => {
    const startX = snap((viewport?.x ?? 0) + ((viewport?.width ?? 1200) - spec.width) / 2)
    const startY = snap((viewport?.y ?? 0) + ((viewport?.height ?? 700) - spec.height) / 2)

    const collides = (x, y) => windows.some((w) => (
        x < w.x + w.width + WINDOW_GAP
        && x + spec.width + WINDOW_GAP > w.x
        && y < w.y + w.height + WINDOW_GAP
        && y + spec.height + WINDOW_GAP > w.y
    ))

    if (!collides(startX, startY)) return { x: startX, y: startY }

    const step = DESK_GRID * 2
    for (let ring = 1; ring <= 24; ring += 1) {
        for (const [dx, dy] of [[1, 0], [0, 1], [-1, 0], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]]) {
            const x = startX + dx * ring * step
            const y = startY + dy * ring * step
            if (!collides(x, y)) return { x, y }
        }
    }
    return { x: startX + windows.length * DESK_GRID, y: startY + windows.length * DESK_GRID }
}

// The grid arrangement: same windows, same order, packed left to right in as
// many columns as the width allows. Their canvas positions are NOT overwritten
// — `grid` is a way of looking, and going back to `canvas` has to find the
// desk exactly as it was left.
export const arrangeGrid = (windows, viewportWidth) => {
    if (!windows.length) return []
    const widest = Math.max(...windows.map((w) => w.width))
    const columns = Math.max(1, Math.floor((viewportWidth - WINDOW_GAP) / (widest + WINDOW_GAP)))

    // Row heights are measured in a FIRST pass. Accumulating them while
    // placing meant a row was positioned against a height that had not
    // finished being measured — the tallest window in row 0 was still to
    // come — so row 1 was laid over the bottom of row 0.
    const rowHeights = []
    windows.forEach((w, index) => {
        const row = Math.floor(index / columns)
        rowHeights[row] = Math.max(rowHeights[row] || 0, w.height)
    })

    const rowTops = []
    rowHeights.reduce((top, height, row) => {
        rowTops[row] = top
        return top + height + WINDOW_GAP
    }, DESK_TOP)

    return windows.map((w, index) => ({
        ...w,
        x: WINDOW_GAP + (index % columns) * (widest + WINDOW_GAP),
        y: rowTops[Math.floor(index / columns)]
    }))
}

// "see it all" — the offset that brings every window into view at once. Pure,
// so the button and any future keyboard route agree by construction.
export const fitAll = (windows, viewport) => {
    if (!windows.length) return { x: 0, y: 0 }
    const minX = Math.min(...windows.map((w) => w.x))
    const minY = Math.min(...windows.map((w) => w.y))
    const maxX = Math.max(...windows.map((w) => w.x + w.width))
    const maxY = Math.max(...windows.map((w) => w.y + w.height))
    return {
        x: Math.round((viewport.width - (maxX - minX)) / 2 - minX),
        y: Math.round((viewport.height - (maxY - minY)) / 2 - minY)
    }
}
