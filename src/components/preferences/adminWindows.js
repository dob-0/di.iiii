import { GRID, widthClassOf } from '../../perform/presets.js'
import { isTypingTarget, windowKeyAction } from '../../perform/windowKeys.js'

// THE ADMIN DESK — what a window is, where it stands, which key does what.
//
// Method: the window-kind table of src/perform/presets.js (WINDOW_KINDS: one
// row per kind, the label a person reads, a family) and the stored view of
// grandMA3 / Eos that Perform follows (a layout = which windows are open and
// where; nothing else). Coordinates are PERCENT of the desk area, snapped to
// the same 12 x 8 unit grid as Perform (GRID.wide), so a layout fits any screen.
// Per device and per width class, in localStorage, like useWorkspaceLayout.
//
// Nothing here touches React or the DOM, except the two storage helpers, which
// are wrapped in try/catch: a blocked storage only means the layout lasts this visit.

// The section keys never change (#manage, #monitor … are links people hold); the
// words a person reads say what you DO there (UX audit 2026-10-28, F045/F109).
// `system` stays the key of the switches; its log and its build facts became
// their own windows (`log`, `build`) because "Log and settings" was three jobs.
export const ADMIN_GROUPS = [
    { key: 'admin', label: 'Manage' },
    { key: 'knowledge', label: 'Knowledge' },
    { key: 'diagnostics', label: 'Staff tools' }
]

export const ADMIN_WINDOW_KINDS = [
    { key: 'manage', label: 'Spaces and users', group: 'admin', hint: 'Spaces, projects, people and who can see what.' },
    { key: 'opencall', label: 'Open call', group: 'admin', hint: 'Applications to the open call: review and decide.' },
    // Owner-only: the kind exists in the desk only after GET /api/monitor answered 200.
    { key: 'monitor', label: 'Monitor', group: 'admin', hint: 'Machines, agents, services and pull requests, live.', gate: 'monitor' },
    { key: 'rules', label: 'Rules', group: 'knowledge', hint: 'The standing rules, newest first. Click one to read it.', gate: 'monitor' },
    { key: 'hooks', label: 'Hooks', group: 'knowledge', hint: 'The hooks that guard the agents, by event.', gate: 'monitor' },
    { key: 'requests', label: 'Requests', group: 'knowledge', hint: 'The request rows from the ledger, newest first.', gate: 'monitor' },
    { key: 'agents', label: 'Agents', group: 'admin', hint: 'Agent chats and topics, live first, then recent.' },
    { key: 'visitors', label: 'Visitors', group: 'admin', hint: 'Programs that called di.iiii, with a block switch.' },
    { key: 'overview', label: 'Status', group: 'diagnostics', hint: 'The quick switches, the signal chain and the last log lines.' },
    { key: 'inspect', label: 'Scene objects', group: 'diagnostics', hint: 'The architecture map, objects, people and spaces of this scene.' },
    { key: 'system', label: 'Switches', group: 'diagnostics', hint: 'Command deck, panel matrix and scene values.' },
    { key: 'log', label: 'Log', group: 'diagnostics', hint: 'The runtime log of this page.' },
    { key: 'build', label: 'Build info', group: 'diagnostics', hint: 'Browser, release, session paths and stored keys.' },
    { key: 'estate', label: 'Machines', group: 'diagnostics', hint: 'Every machine, address and store from the private atlas.' }
]

/** The kinds this person may open: the Monitor kind is absent until the server said 200. */
export const availableKinds = ({ monitorAllowed = false } = {}) => (
    ADMIN_WINDOW_KINDS.filter((kind) => kind.gate !== 'monitor' || monitorAllowed)
)

export const kindOf = (key) => ADMIN_WINDOW_KINDS.find((kind) => kind.key === key) || null
export const isAdminKind = (key) => ADMIN_WINDOW_KINDS.some((kind) => kind.key === key)

/**
 * /admin#<section> → the section key, or null. #monitor-full is the Monitor
 * (already in full screen, a link for the phone); `full` says so.
 */
export const parseAdminHash = (hash) => {
    const raw = String(hash || '').replace(/^#/, '')
    const full = raw === 'monitor-full'
    const key = full ? 'monitor' : raw
    return isAdminKind(key) ? { key, full } : null
}

// ── keys ──────────────────────────────────────────────────────────────────
// Perform's table (windowKeys.js) answers next / previous / maximise / add /
// hide / arrange. The desk reads the same function and adds one key: ? for
// the key card. It is never read while typing in a field.
export const ADMIN_KEYS = [
    { keys: 'Ctrl+`', label: 'Next window' },
    { keys: 'Ctrl+Shift+`', label: 'Previous window' },
    { keys: 'M', label: 'Maximize / restore' },
    { keys: '/', label: 'Find a window' },
    { keys: 'Shift+A', label: 'Arrange all' },
    { keys: 'Esc', label: 'Restore, close the card' },
    { keys: '?', label: 'This card' }
]

/** Which desk action a key press asks for, or null. Never while typing. */
export const adminKeyAction = (event) => {
    if (!event || event.defaultPrevented || event.repeat) return null
    if (isTypingTarget(event.target)) return null
    if (!event.ctrlKey && !event.metaKey && !event.altKey && event.key === '?') return 'help'
    const action = windowKeyAction(event)
    // Esc on the desk never closes a window (the Monitor uses Esc itself): it restores one.
    return action === 'hide' ? 'escape' : action
}

// ── layout ────────────────────────────────────────────────────────────────
export const LAYOUT_VERSION = 1
const STORAGE_PREFIX = 'di.admin.desk.v1.'
export const layoutStorageKey = (widthClass) => `${STORAGE_PREFIX}${widthClass === 'narrow' ? 'narrow' : 'wide'}`

export const deskWidthClass = (viewportWidth) => widthClassOf(viewportWidth, 600)

export const emptyLayout = () => ({ v: LAYOUT_VERSION, open: [], order: [], rects: {}, manual: false, max: null })

const pct = (value) => Math.round(value * 100) / 100

/** Percent rectangles [x, y, w, h] for n windows: one fills the desk, more tile it with no overlap. */
export const arrangeRects = (count) => {
    if (count <= 0) return []
    const cols = count <= 2 ? count : Math.ceil(Math.sqrt(count))
    const rows = Math.ceil(count / cols)
    const out = []
    for (let r = 0; r < rows; r += 1) {
        const inRow = r === rows - 1 ? count - cols * (rows - 1) : cols
        for (let c = 0; c < inRow; c += 1) {
            out.push([pct((c / inRow) * 100), pct((r / rows) * 100), pct(100 / inRow), pct(100 / rows)])
        }
    }
    return out
}

const arrangedFor = (open) => {
    const rects = {}
    arrangeRects(open.length).forEach((rect, index) => { rects[open[index]] = rect })
    return rects
}

const clean = (layout, allowed) => {
    const keep = (key) => !allowed || allowed.includes(key)
    const open = [...new Set((layout.open || []).filter((key) => isAdminKind(key) && keep(key)))]
    const order = [...new Set([...(layout.order || []).filter((key) => open.includes(key)), ...open])]
    const rects = {}
    for (const key of open) {
        const r = layout.rects?.[key]
        rects[key] = Array.isArray(r) && r.length === 4 && r.every(Number.isFinite) ? r.map(pct) : null
    }
    const fallback = arrangedFor(open)
    for (const key of open) if (!rects[key]) rects[key] = fallback[key]
    return { v: LAYOUT_VERSION, open, order, rects, manual: Boolean(layout.manual), max: open.includes(layout.max) ? layout.max : null }
}

/** A stored value → a layout: unknown or gated keys dropped, bad rectangles re-tiled. Never throws. */
export const parseLayout = (raw, allowed = null) => {
    try {
        const data = typeof raw === 'string' ? JSON.parse(raw) : raw
        if (!data || data.v !== LAYOUT_VERSION) return emptyLayout()
        return clean(data, allowed)
    } catch {
        return emptyLayout()
    }
}

export const loadLayout = (widthClass, allowed = null, storage = typeof window === 'undefined' ? null : window.localStorage) => {
    try {
        return parseLayout(storage?.getItem(layoutStorageKey(widthClass)), allowed)
    } catch {
        return emptyLayout()
    }
}

export const saveLayout = (widthClass, layout, storage = typeof window === 'undefined' ? null : window.localStorage) => {
    try {
        storage?.setItem(layoutStorageKey(widthClass), JSON.stringify(layout))
        return true
    } catch {
        return false // blocked storage: the arrangement lasts this visit
    }
}

/** The set of windows the layout may hold changed (a gate closed): drop what is no longer allowed. */
export const restrictLayout = (layout, allowed) => clean(layout, allowed)

/** Open a window (and raise it). A phone shows one at a time. Auto layouts re-tile; a hand-placed one keeps its places. */
export const openWindow = (layout, key, { narrow = false, full = false } = {}) => {
    if (!isAdminKind(key)) return layout
    if (narrow) return { ...emptyLayout(), open: [key], order: [key], rects: { [key]: [0, 0, 100, 100] }, max: key }
    const had = layout.open.includes(key)
    const open = had ? layout.open : [...layout.open, key]
    const order = [...layout.order.filter((k) => k !== key), key]
    let rects = { ...layout.rects }
    if (!had) {
        if (layout.manual && layout.open.length) rects[key] = [pct(100 / 6), pct(100 / 8), pct(200 / 3), pct(75)]
        else rects = arrangedFor(open)
    }
    return { ...layout, open, order, rects, max: full ? key : layout.max }
}

export const closeWindow = (layout, key) => {
    const open = layout.open.filter((k) => k !== key)
    const rects = { ...layout.rects }
    delete rects[key]
    const next = { ...layout, open, order: layout.order.filter((k) => k !== key), rects, max: layout.max === key ? null : layout.max }
    return layout.manual ? next : { ...next, rects: arrangedFor(open) }
}

export const closeAll = () => emptyLayout()

export const focusWindow = (layout, key) => (
    layout.open.includes(key) ? { ...layout, order: [...layout.order.filter((k) => k !== key), key] } : layout
)

/** A window was dragged or resized: its rectangle is now the person's own. */
export const placeWindow = (layout, key, rect) => (
    layout.open.includes(key) ? { ...layout, rects: { ...layout.rects, [key]: rect.map(pct) }, manual: true } : layout
)

export const toggleMaximize = (layout, key) => (
    layout.open.includes(key) ? { ...layout, max: layout.max === key ? null : key } : layout
)

export const arrangeAll = (layout) => ({ ...layout, rects: arrangedFor(layout.order.length ? layout.order : layout.open), manual: false, max: null })

/** A pixel frame → the percent rectangle of the desk area. */
export const rectFromFrame = (frame, area) => {
    const width = Math.max(1, Number(area.width) || 0)
    const height = Math.max(1, Number(area.height) || 0)
    return [
        ((Number(frame.x) - (Number(area.left) || 0)) / width) * 100,
        ((Number(frame.y) - (Number(area.top) || 0)) / height) * 100,
        (Number(frame.width) / width) * 100,
        (Number(frame.height) / height) * 100
    ]
}

export { GRID }
