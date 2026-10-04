// Two small rules for the pile of panel windows in Nodes (NOPA audit F8,
// 2026-10-02). Both are what desktop window managers have long done: a new
// window that would land exactly on another is cascaded down and right by a
// title bar's height (AppKit's NSWindow.cascadeTopLeft(from:), Windows'
// CascadeWindows), and Escape dismisses the window in front.

export const RAW_CASCADE_STEP_PX = 32
const COINCIDENT_PX = 8
const MAX_STEPS = 12

// windows: [{ id, x, y, inWorld }] in a STABLE order (document order), so the
// window that keeps its spot never changes when focus changes the z-order.
// World windows are in graph units, so distances are measured on screen
// (times the zoom) and the step is divided back. Returns Map id -> { x, y }.
export function cascadeCoincidentWindows(windows = [], { zoom = 1, step = RAW_CASCADE_STEP_PX } = {}) {
    const scale = Number.isFinite(zoom) && zoom > 0 ? zoom : 1
    const placed = []
    const out = new Map()
    for (const win of windows) {
        const unit = win.inWorld ? scale : 1
        let x = Number(win.x) || 0
        let y = Number(win.y) || 0
        const clashes = () => placed.some((other) => other.inWorld === Boolean(win.inWorld)
            && Math.abs(other.x - x) * unit < COINCIDENT_PX
            && Math.abs(other.y - y) * unit < COINCIDENT_PX)
        for (let i = 0; i < MAX_STEPS && clashes(); i += 1) {
            x = (Number(win.x) || 0) + (step / unit) * (i + 1)
            y = (Number(win.y) || 0) + (step / unit) * (i + 1)
        }
        placed.push({ x, y, inWorld: Boolean(win.inWorld) })
        out.set(win.id, { x: Math.round(x * 100) / 100, y: Math.round(y * 100) / 100 })
    }
    return out
}

// The window Escape closes: the front-most one the person opened or raised in
// this session. The windows a project opens with are its arrangement — Escape
// there still means "leave this level", as it always has.
export function pickEscapeWindow(windows = [], touchedIds = []) {
    const touched = new Set(touchedIds)
    const candidates = windows.filter((win) => touched.has(win.id) && !win.minimized)
    if (!candidates.length) return null
    return candidates.reduce((front, win) => ((win.zIndex || 0) > (front.zIndex || 0) ? win : front)).id
}
