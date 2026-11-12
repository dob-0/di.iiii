// The sizes of the deck's panels, as THIS viewer keeps them (VjDeckView.jsx, DeckSeam.jsx).
//
// Five seams (the lead's decision D1; the Preview | Output seam is not built):
//   s1  layer strip | clip grid        value = the strip's width      (px)
//   s2  clip grid | monitor column     value = the monitor column     (px)
//   s4  main row | bottom row          value = the bottom row's height (px)
//   s5  Sources | Clip                 value = the Sources width      (px)
//   s6  Clip | Effects                 value = the Clip width         (px)
//
// Stored: localStorage 'di.vjDeck.layout' = { v: 1, head, monitorW, bottomH, cols: [a, b], folded: [..], locked }.
// folded = the bottom panels shown as a narrow rail (PANEL_IDS, never all three); locked = the viewer's
// hand lock: borders and fold controls do nothing (the whole-layout reset still works).
// Every field is optional and is a FRACTION of the deck box (its width for head, monitorW and
// cols; its height for bottomH), never px: a phone and a desk want different pixels. The deck
// box is the deck's content box (what the container queries measure, padding left out).
// An unset field means today's CSS: nothing is written for it, no variable, no inline style.
//
// Nothing here touches the project document. This file is pure: storage and boxes are passed in.

export const LAYOUT_KEY = 'di.vjDeck.layout'
export const LAYOUT_VERSION = 1
export const SEAM_IDS = ['s1', 's2', 's4', 's5', 's6']
// The three bottom panels, left to right.
export const PANEL_IDS = ['sources', 'clip', 'effects']

// px limits (the lead's decision D11).
export const LIMITS = {
    head: [150, 280],
    monitorMin: 140,
    monitorMax: 480,
    // The 8-column grid at its smallest (size-check minimum) with the Perform strip of 198px.
    gridMin: 734,
    gridMinHead: 198,
    bottomMin: 120,
    bottomMaxShare: 0.6,
    mainMin: 220,
    // At 900px or less the monitors stack under the grid and the CSS main row keeps 520px.
    mainMinNarrow: 520,
    panelMin: 220
}

// The container queries of vjDeck.css: at or under these widths the CSS rules and no variable apply.
// bottomStacked: at or under this the three bottom panels stack in one column. It is three panels of
// panelMin plus two column gaps (3 x 220 + 2 x 12 = 684) minus 1px, so at every wider deck the
// borders s5 and s6 exist; at every narrower one the panels are stacked and have no side neighbour.
// vjDeck.css has the same number in its container query (a test reads both).
export const NARROW = { sideBySide: 900, stacked: 560, bottomStacked: 683 }

// A stored fraction outside these reads as unset (a hand-edited or corrupt value).
const FRACTION = { head: [0.02, 0.5], monitorW: [0.02, 0.6], bottomH: [0.03, 0.6], cols: [0.02, 0.8] }

const inRange = (value, [low, high]) => typeof value === 'number' && Number.isFinite(value) && value >= low && value <= high
const round = (value) => Math.round(value * 100000) / 100000
const clamp = (value, low, high) => Math.min(Math.max(value, low), Math.max(low, high))

/** The folded panel ids in panel order, without repeats or unknown ids. All three folded reads as none: one panel stays open. */
export const sanitizeFolded = (value) => {
    if (!Array.isArray(value)) return []
    const list = PANEL_IDS.filter((id) => value.includes(id))
    return list.length >= PANEL_IDS.length ? [] : list
}

/** The valid fields of any parsed value; anything else is left out. A wrong version reads as nothing. */
export const sanitizeLayout = (raw) => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
    if (raw.v !== undefined && raw.v !== LAYOUT_VERSION) return {}
    const out = {}
    if (inRange(raw.head, FRACTION.head)) out.head = raw.head
    if (inRange(raw.monitorW, FRACTION.monitorW)) out.monitorW = raw.monitorW
    if (inRange(raw.bottomH, FRACTION.bottomH)) out.bottomH = raw.bottomH
    const folded = sanitizeFolded(raw.folded)
    if (folded.length) out.folded = folded
    if (raw.locked === true) out.locked = true
    if (Array.isArray(raw.cols) && raw.cols.length === 2 && raw.cols.every((value) => inRange(value, FRACTION.cols))) {
        out.cols = [raw.cols[0], raw.cols[1]]
    }
    return out
}

export const hasLayout = (layout) => Object.keys(layout || {}).length > 0

/** True when the layout holds a size or a fold: the lock alone is not a different layout. */
export const hasArrangement = (layout) => Object.keys(layout || {}).some((key) => key !== 'locked')

/** The folded panel ids of a layout (always an array). */
export const foldedOf = (layout) => sanitizeFolded(layout?.folded)

/** The layout after a panel is folded or unfolded; the last open panel cannot be folded (returns the same layout). */
export const toggleFold = (layout, panel) => {
    if (!PANEL_IDS.includes(panel)) return layout
    const current = foldedOf(layout)
    const next = { ...(layout || {}) }
    if (current.includes(panel)) {
        const rest = current.filter((id) => id !== panel)
        if (rest.length) next.folded = rest
        else delete next.folded
        return next
    }
    if (current.length >= PANEL_IDS.length - 1) return layout
    next.folded = PANEL_IDS.filter((id) => id === panel || current.includes(id))
    return next
}

/** The layout after the whole-layout reset: sizes and folds go back to today's, the hand lock stays. */
export const resetArrangement = (layout) => (layout?.locked ? { locked: true } : {})

/** The grid columns of the bottom row while a panel is folded: a rail for it, an equal share for the others. */
export const foldColumns = (folded, rail = 'max(var(--vj-control), var(--di-space-7))') => (
    PANEL_IDS.map((id) => (folded.includes(id) ? rail : 'minmax(0, 1fr)')).join(' ')
)

/** The stored layout (or {}). Storage may be blocked or hold anything: that reads as nothing stored. */
export const readLayout = (storage) => {
    try {
        // The window.localStorage getter itself throws when site data is blocked: it stays inside the try.
        const store = storage ?? window.localStorage
        return sanitizeLayout(JSON.parse(store.getItem(LAYOUT_KEY) || 'null'))
    } catch {
        return {}
    }
}

/** Stores the layout; an empty one removes the key. Returns true when storage took it. */
export const writeLayout = (storage, layout = {}) => {
    try {
        const store = storage ?? window.localStorage
        const clean = sanitizeLayout(layout)
        if (!hasLayout(clean)) store.removeItem(LAYOUT_KEY)
        else store.setItem(LAYOUT_KEY, JSON.stringify({ v: LAYOUT_VERSION, ...clean }))
        return true
    } catch {
        return false
    }
}

/**
 * Which seams exist at this box. box = { width, height, top, gap } in px (top = the top bar's height).
 * s1 and s2 need more than 900px, s4 and s5/s6 more than 683px (below it the bottom row is stacked,
 * vjDeck.css); s5/s6 also need room for three panels of 220px. No variable is applied where a seam is hidden.
 */
export const seamsShown = (box) => {
    if (!box || !(box.width > 0)) return { s1s2: false, s4: false, s56: false }
    return {
        s1s2: box.width > NARROW.sideBySide,
        s4: box.width > NARROW.bottomStacked && box.height > 0,
        s56: box.width > NARROW.bottomStacked && box.width - 2 * colGapOf(box) >= 3 * LIMITS.panelMin
    }
}

/** The gap between columns (the bottom row's; the main row uses the same token). Falls back to the row gap. */
const colGapOf = (box) => (box.colGap != null ? box.colGap : box.gap || 0)

/** The widest the monitor column may be: the grid keeps 734px (more when the strip is wider than 198px). */
const monitorMax = (box, headPx) => {
    const extra = Math.max(0, (headPx || LIMITS.gridMinHead) - LIMITS.gridMinHead)
    return Math.max(LIMITS.monitorMin, Math.min(LIMITS.monitorMax, box.width - (LIMITS.gridMin + extra) - colGapOf(box)))
}

/** The tallest the bottom row may be: 60% of the deck, and the main row keeps 220px. */
const bottomMax = (box) => Math.max(
    LIMITS.bottomMin,
    Math.min(
        LIMITS.bottomMaxShare * box.height,
        box.height - (box.top || 0) - 2 * (box.gap || 0) - (box.width <= NARROW.sideBySide ? LIMITS.mainMinNarrow : LIMITS.mainMin)
    )
)

/** Panel widths a and b (Sources, Clip) clamped so that all three panels keep 220px. */
export const clampCols = (a, b, box) => {
    const room = box.width - 2 * colGapOf(box)
    const first = clamp(a, LIMITS.panelMin, room - 2 * LIMITS.panelMin)
    return [first, clamp(b, LIMITS.panelMin, room - first - LIMITS.panelMin)]
}

/**
 * The stored layout in px at this box, clamped. A field whose seam is not shown is left out (no
 * variable is applied there). The stored layout itself is never rewritten by a clamp.
 */
export const resolveLayout = (layout, box) => {
    const out = {}
    const shown = seamsShown(box)
    const stored = layout || {}
    if (shown.s1s2) {
        if (stored.head != null) out.head = clamp(stored.head * box.width, ...LIMITS.head)
        if (stored.monitorW != null) out.monitorW = clamp(stored.monitorW * box.width, LIMITS.monitorMin, monitorMax(box, out.head))
    }
    if (shown.s4 && stored.bottomH != null) out.bottomH = clamp(stored.bottomH * box.height, LIMITS.bottomMin, bottomMax(box))
    if (shown.s56 && stored.cols) {
        const [a, b] = clampCols(stored.cols[0] * box.width, stored.cols[1] * box.width, box)
        out.cols = [a, b]
    }
    return out
}

/**
 * The limits of one seam in px: { min, max, dim }. dim is the box side its percent is taken of.
 * now = the seam's sizes right now in px ({ head, monitorW, bottomH, a, b }, measured when unset).
 */
export const seamLimits = (id, box, now = {}) => {
    switch (id) {
        case 's1': return { min: LIMITS.head[0], max: LIMITS.head[1], dim: box.width }
        case 's2': return { min: LIMITS.monitorMin, max: monitorMax(box, now.head), dim: box.width }
        case 's4': return { min: LIMITS.bottomMin, max: bottomMax(box), dim: box.height }
        case 's5': {
            const sum = (now.a || 0) + (now.b || 0)
            return { min: LIMITS.panelMin, max: Math.max(LIMITS.panelMin, sum - LIMITS.panelMin), dim: box.width }
        }
        case 's6': {
            const room = box.width - 2 * colGapOf(box)
            return { min: LIMITS.panelMin, max: Math.max(LIMITS.panelMin, room - (now.a || 0) - LIMITS.panelMin), dim: box.width }
        }
        default: return { min: 0, max: 0, dim: 1 }
    }
}

/** The layout after one seam is moved to px (a fraction is stored; the clamp is done on read). */
export const applySeam = (layout, id, px, box, now = {}) => {
    const next = { ...(layout || {}) }
    const { min, max } = seamLimits(id, box, now)
    const value = clamp(px, min, max)
    switch (id) {
        case 's1': next.head = round(value / box.width); break
        case 's2': next.monitorW = round(value / box.width); break
        case 's4': next.bottomH = round(value / box.height); break
        case 's5': next.cols = [round(value / box.width), round(((now.a || 0) + (now.b || 0) - value) / box.width)]; break
        case 's6': next.cols = [round((now.a || 0) / box.width), round(value / box.width)]; break
        default: return next
    }
    return sanitizeLayout(next)
}

/**
 * The layout with ONLY this border back at its default. s1, s2 and s4 own one field. s5 and s6 share
 * the two column widths: s5 puts Sources back to a third and leaves Effects where it is (Clip takes the
 * difference); s6 puts Clip back to a third and leaves Sources. When both are thirds the field is cleared.
 * now = the sizes in px right now ({ a, b }); without a box or sizes the whole field goes (the old behaviour).
 */
export const resetOneSeam = (layout, id, box, now = {}) => {
    if ((id !== 's5' && id !== 's6') || !box || !(box.width > 0) || !((now.a || 0) > 0) || !((now.b || 0) > 0)) return clearSeam(layout, id)
    const third = (box.width - 2 * colGapOf(box)) / 3
    const total = now.a + now.b
    const a = id === 's5' ? third : now.a
    const b = id === 's6' ? third : total - a
    const next = { ...(layout || {}) }
    if (Math.abs(a - third) < 1 && Math.abs(b - third) < 1) { delete next.cols; return next }
    next.cols = [round(a / box.width), round(clamp(b, LIMITS.panelMin, box.width - 2 * colGapOf(box) - a - LIMITS.panelMin) / box.width)]
    return sanitizeLayout(next)
}

/** The layout with one seam back at today's size. */
export const clearSeam = (layout, id) => {
    const next = { ...(layout || {}) }
    if (id === 's1') delete next.head
    else if (id === 's2') delete next.monitorW
    else if (id === 's4') delete next.bottomH
    else delete next.cols // s5 and s6 share one field: the three panels go back to thirds together
    return next
}

/** The CSS variables of a resolved layout; a missing field is a missing variable. */
export const layoutVars = (resolved) => {
    const vars = {}
    const px = (value) => `${Math.round(value * 100) / 100}px`
    if (resolved.head != null) vars['--vj-head'] = px(resolved.head)
    if (resolved.monitorW != null) vars['--vj-monitor-w'] = px(resolved.monitorW)
    if (resolved.bottomH != null) vars['--vj-bottom-h'] = px(resolved.bottomH)
    if (resolved.cols) {
        vars['--vj-bottom-a'] = px(resolved.cols[0])
        vars['--vj-bottom-b'] = px(resolved.cols[1])
        vars['--vj-bottom-cols'] = `${px(resolved.cols[0])} ${px(resolved.cols[1])} minmax(0, 1fr)`
    }
    return vars
}

export const LAYOUT_VAR_NAMES = ['--vj-head', '--vj-monitor-w', '--vj-bottom-h', '--vj-bottom-cols', '--vj-bottom-a', '--vj-bottom-b', '--vj-fold-cols']

/**
 * What a key does to a seam (WAI-ARIA window splitter). Returns the new value in px, or null when
 * the key is not the seam's. state = { value, min, max, dim, sign, restore }; sign is +1 when
 * Right/Up grows the value, -1 when it shrinks it (the seam moves with the arrow).
 * Arrows move 1% of the box (Shift 10%); Home and End go to min and max; Enter goes to min, and
 * back to the value it left when it is already there.
 */
export const keyValue = (key, shiftKey, { value, min, max, dim, sign = 1, restore = null }) => {
    const step = (shiftKey ? 0.1 : 0.01) * dim
    switch (key) {
        case 'ArrowRight':
        case 'ArrowUp': return clamp(value + sign * step, min, max)
        case 'ArrowLeft':
        case 'ArrowDown': return clamp(value - sign * step, min, max)
        case 'Home': return min
        case 'End': return max
        case 'Enter': return value > min ? min : (restore != null ? clamp(restore, min, max) : null)
        default: return null
    }
}
