// PERFORM PRESETS — a stored view of windows and where they stand.
//
// Method (di-atlas decisions/2026-09-24-perform-line.md, METHOD): a preset is
// what grandMA3 calls a VIEW — "the set up of windows in the user-defined
// area", stored and recalled — and what ETC Eos calls a SNAPSHOT of the
// display layout. Adopted from those two:
//   · a preset is a set of windows plus their layout, nothing else — it never
//     carries show content (the deck's clips, the wall's corners stay in the
//     document, exactly as a grandMA3 view never stores programmer values);
//   · two places to keep one, as grandMA3 keeps views in a USER PROFILE and
//     Eos keeps snapshots IN THE SHOW FILE: "mine" (this device, per width
//     class) and "the show's" (the project document, travels in the .diiii);
//   · recall is by id from a button or an address, like a view button.
// Rejected: grandMA3's per-screen view storage (a browser tab is one screen;
// the second screen here is the /out page, not a view) and Eos's partial
// snapshot recall of faders/encoders (a preset here never changes a value).
//
// Coordinates are PERCENT of the workspace below the bar, so one preset fits
// any window the way a desk layout must (feedback: layouts use the window).
// `wide` is the desk arrangement, `narrow` the phone's; a window absent from
// one is simply not opened at that width and stays in the "+ window" list.
//
// Nothing here touches React, the DOM or storage.

import { normalizePerformPreset, normalizePerformRect } from '../shared/projectSchema.js'

export const PRESET_VERSION = 1
export const MAX_PRESET_WINDOWS = 16
export const MAX_PRESET_NAME = 60
export const MAX_SAVED_PRESETS = 24

// What a window IS. `phase: 2` means it is not a native window yet: it opens
// as a dim window saying so, and what it will be — never a framed page (a
// sandboxed frame of a di.iiii page breaks module loading in Firefox) and
// never a drawing that looks like the real thing.
export const WINDOW_KINDS = {
    deck: { label: 'VJ Deck', family: 'pictures', phase: 1 },
    out: { label: 'Out', family: 'pictures', phase: 1 },
    clock: { label: 'Clock', family: 'time', phase: 1 },
    master: { label: 'Master · Blackout', family: 'light', phase: 1 },
    lightlooks: { label: 'Light', family: 'light', phase: 1 },
    laser: { label: 'Laser', family: 'light', phase: 1 },
    wall: { label: 'Wall', family: 'wall', phase: 1 },
    surfaces: { label: 'Surfaces', family: 'wall', phase: 1 },
    cues: { label: 'Cues', family: 'wall', phase: 1 },
    wallout: { label: 'Wall out', family: 'pictures', phase: 1 },
    machines: { label: 'Machines', family: 'rig', phase: 1 },
    surface: { label: 'Surface settings', family: 'wall', phase: 1 },
    scenes: { label: 'Scenes', family: 'light', phase: 2, coming: 'The Light desk’s scenes as a window. Today they are on the Light page.' },
    looks: { label: 'Looks · FX', family: 'light', phase: 2, coming: 'Looks and FX from the Light desk, beside the deck. Today they are on the Light page.' },
    audio: { label: 'Audio', family: 'light', phase: 2, coming: 'The mic, its level and the beats it hears. Today on the Light page.' },
    status: { label: 'Status', family: 'rig', phase: 2, coming: 'One line: what is on, which machine, and why it stopped.' },
    footage: { label: 'Footage', family: 'files', phase: 2, coming: 'Drop footage here and it goes into this project’s files, carried to the other machines.' },
    mysurface: { label: 'My surface', family: 'pictures', phase: 2, coming: 'A guest’s own surface on the wall, and nothing else of the show.' },
    now: { label: 'Now', family: 'show', phase: 2, coming: 'The cue that is running, read only, for a guest.' }
}

// The order of the "+ window" list. Nodes is not a window: it is the way to
// the whole patch, and sits under the list on its own line.
export const WINDOW_ORDER = ['deck', 'out', 'clock', 'master', 'lightlooks', 'laser', 'wall', 'wallout', 'surfaces', 'cues', 'machines', 'surface', 'scenes', 'looks', 'audio', 'status', 'footage', 'mysurface', 'now']

export const isKnownKind = (kind) => Object.prototype.hasOwnProperty.call(WINDOW_KINDS, kind)
export const isComingKind = (kind) => isKnownKind(kind) && WINDOW_KINDS[kind].phase > 1

const w = (id, kind = id) => ({ id, kind })

// THE UNIT GRID (2026-11-10, owner: "like lego and minimal"). Every block on
// Perform is a whole number of units: the area is 12 columns x 8 rows on a
// desk and 4 columns x 8 rows on a phone (blocks stack). Blocks touch edge to
// edge, so a built-in preset fills the area with no gap and no dead margin.
// Storage stays PERCENT (the document's own rule, shared/projectSchema.js);
// these helpers write the percent of a whole-unit rectangle, and
// framesFromRects snaps whatever it is given (a saved one too) to the grid.
export const GRID = {
    wide: { cols: 12, rows: 8 },
    narrow: { cols: 4, rows: 8 }
}

const pct = (value) => Math.round(value * 100) / 100
const unitRect = (grid) => (col, row, cols, rows) => [pct((col / grid.cols) * 100), pct((row / grid.rows) * 100), pct((cols / grid.cols) * 100), pct((rows / grid.rows) * 100)]
const wu = unitRect(GRID.wide)
const nu = unitRect(GRID.narrow)

// [col, row, cols, rows] per window, wide then narrow.
const layout = (wide = {}, narrow = {}) => ({
    wide: Object.fromEntries(Object.entries(wide).map(([id, rect]) => [id, wu(...rect)])),
    narrow: Object.fromEntries(Object.entries(narrow).map(([id, rect]) => [id, nu(...rect)]))
})

// The built-ins, from his real use (the sketch he was shown on 2026-09-24,
// local.thedi.studio/lab/p/perform-sketch), laid on the unit grid. A Master or
// a Clock is one row high: a brick, not a panel.
export const BUILT_IN_PRESETS = [
    {
        id: 'vj',
        name: 'VJ',
        who: 'Club and laser nights. The deck is the instrument and fills the room: grid, preview, output, sources and clip settings in one.',
        windows: [w('deck')],
        ...layout({ deck: [0, 0, 12, 8] }, { deck: [0, 0, 4, 8] })
    },
    {
        // Today's four windows, kept whole (the arrangement before the deck got
        // its own preview and output monitors).
        id: 'vj-windows',
        name: 'VJ windows',
        who: 'The deck with the picture out, the clock and the master as separate windows.',
        windows: [w('deck'), w('out'), w('clock'), w('master')],
        ...layout(
            { deck: [0, 0, 8, 8], out: [8, 0, 4, 3], clock: [8, 3, 4, 2], master: [8, 5, 4, 3] },
            { out: [0, 0, 4, 2], deck: [0, 2, 4, 3], master: [0, 5, 4, 2], clock: [0, 7, 4, 1] }
        )
    },
    {
        id: 'wall',
        name: 'Wall',
        who: 'The stage rig: one machine drives the projector on another. Corners, surfaces, cues.',
        windows: [w('surfaces'), w('cues'), w('wall'), w('wallout'), w('machines')],
        ...layout(
            { surfaces: [0, 0, 3, 4], cues: [0, 4, 3, 4], wall: [3, 0, 6, 8], wallout: [9, 0, 3, 5], machines: [9, 5, 3, 3] },
            { wall: [0, 0, 4, 3], cues: [0, 3, 2, 2], wallout: [2, 3, 2, 2], surfaces: [0, 5, 4, 2], machines: [0, 7, 4, 1] }
        )
    },
    {
        id: 'light',
        name: 'Light',
        who: 'The studio DMX rig and the club desk. Scenes, master, blackout, tempo.',
        windows: [w('scenes'), w('looks'), w('master'), w('clock'), w('audio')],
        ...layout(
            { scenes: [0, 0, 4, 6], looks: [4, 0, 4, 6], audio: [8, 0, 4, 6], master: [0, 6, 8, 2], clock: [8, 6, 4, 2] },
            { scenes: [0, 0, 4, 2], looks: [0, 2, 4, 2], audio: [0, 4, 4, 1], master: [0, 5, 4, 2], clock: [0, 7, 4, 1] }
        )
    },
    {
        id: 'caller',
        name: 'Caller',
        who: 'Show mode: one person calls the show. One list, one clock; blackout reaches everything.',
        windows: [w('cues'), w('wall'), w('wallout'), w('deck'), w('clock'), w('master')],
        ...layout(
            { cues: [0, 0, 4, 6], wall: [4, 0, 4, 4], wallout: [8, 0, 4, 4], deck: [4, 4, 8, 2], master: [0, 6, 8, 2], clock: [8, 6, 4, 2] },
            { cues: [0, 0, 4, 2], wall: [0, 2, 2, 1], wallout: [2, 2, 2, 1], deck: [0, 3, 4, 2], master: [0, 5, 4, 2], clock: [0, 7, 4, 1] }
        )
    },
    {
        id: 'unattended',
        name: 'Unattended',
        who: 'The installation: machines play on their own for days. Nothing to touch but the one line and blackout.',
        windows: [w('wallout'), w('status'), w('master')],
        ...layout(
            { wallout: [0, 0, 12, 6], status: [0, 6, 6, 2], master: [6, 6, 6, 2] },
            { wallout: [0, 0, 4, 5], status: [0, 5, 4, 1], master: [0, 6, 4, 2] }
        )
    },
    {
        id: 'guest',
        name: 'Guest',
        who: 'A guest artist on her own laptop, following the space: bring footage, put it on her surface.',
        windows: [w('footage'), w('mysurface'), w('now')],
        ...layout(
            { footage: [0, 0, 5, 8], mysurface: [5, 0, 7, 5], now: [5, 5, 7, 3] },
            { footage: [0, 0, 4, 4], mysurface: [0, 4, 4, 3], now: [0, 7, 4, 1] }
        )
    },
    {
        id: 'remote',
        name: 'Remote',
        who: 'The phone at the side of the room. Cues, master, blackout. Nothing to drag.',
        windows: [w('cues'), w('master'), w('clock')],
        ...layout(
            { cues: [0, 0, 12, 5], master: [0, 5, 12, 2], clock: [0, 7, 12, 1] },
            { cues: [0, 0, 4, 5], master: [0, 5, 4, 2], clock: [0, 7, 4, 1] }
        )
    },
    {
        id: 'show',
        name: 'Show',
        who: 'Picture, light and laser together: the deck, the light looks, the laser looks, the cues (one go), one blackout for all three.',
        windows: [w('deck'), w('lightlooks'), w('laser'), w('cues'), w('master'), w('clock')],
        ...layout(
            { deck: [0, 0, 6, 6], lightlooks: [6, 0, 3, 4], laser: [9, 0, 3, 4], cues: [6, 4, 6, 2], master: [0, 6, 8, 2], clock: [8, 6, 4, 2] },
            { deck: [0, 0, 4, 2], cues: [0, 2, 2, 1], lightlooks: [2, 2, 2, 1], laser: [0, 3, 4, 2], master: [0, 5, 4, 2], clock: [0, 7, 4, 1] }
        )
    }
].map((preset) => ({ ...preset, source: 'builtin' }))

export const DEFAULT_PRESET_ID = 'vj'

// From each desk, the preset its switch opens first when nothing was chosen
// before on this device: Projection opens the wall, the rest the deck.
export const DEFAULT_PRESET_FROM = { map: 'wall', raw: 'vj', studio: 'vj' }

const isObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value)

// One set of rules for what a stored preset may hold, shared with the
// document (src/shared/projectSchema.js normalizePerformPreset), so a preset
// kept on this device and one kept in the show can never disagree about it.
const normalizeRect = normalizePerformRect

/**
 * Any stored value → a preset safe to open, or null. A kind this build does
 * not know is KEPT (a newer di.iiii made it; dropping it would lose the
 * window when this device saves the preset back) and opened as a window
 * that says so.
 */
export const normalizePreset = (raw, { source = null } = {}) => {
    const preset = normalizePerformPreset(raw)
    if (!preset) return null
    if (source) preset.source = source
    else if (!isObject(raw) || !['builtin', 'mine', 'show'].includes(raw.source)) preset.source = 'mine'
    return preset
}

export const normalizePresetList = (list, { source } = {}) => {
    const out = []
    const seen = new Set()
    for (const raw of Array.isArray(list) ? list : []) {
        const preset = normalizePreset(raw, { source })
        if (!preset || seen.has(preset.id)) continue
        seen.add(preset.id)
        out.push(preset)
        if (out.length >= MAX_SAVED_PRESETS) break
    }
    return out
}

export const builtInPreset = (id) => BUILT_IN_PRESETS.find((preset) => preset.id === id) || null

/**
 * The three groups the menu shows, in the menu's order.
 */
export const presetGroups = ({ mine = [], show = [] } = {}) => ([
    { key: 'builtin', label: 'Built in', presets: BUILT_IN_PRESETS },
    { key: 'mine', label: 'Mine · this device', presets: normalizePresetList(mine, { source: 'mine' }) },
    { key: 'show', label: 'This show’s', presets: normalizePresetList(show, { source: 'show' }) }
])

export const findPreset = (id, { mine = [], show = [] } = {}) => {
    if (!id) return null
    for (const group of presetGroups({ mine, show })) {
        const hit = group.presets.find((preset) => preset.id === id)
        if (hit) return hit
    }
    return null
}

/**
 * Which preset to open, and what to say when it is not the one asked for.
 * Order: the address, then the show's default preset (performState.defaultPreset: a preset
 * saved without a window opens without it on every device), then this device's last one, then the default for the
 * desk the person came from. A `mine:` preset from another device is not
 * here — said, and its base (or VJ) opened instead of an empty desk.
 */
export const choosePreset = ({ requested = null, lastActive = null, showDefault = null, from = null, mine = [], show = [] } = {}) => {
    const lists = { mine, show }
    const fallbackId = DEFAULT_PRESET_FROM[from] || DEFAULT_PRESET_ID
    if (requested) {
        const hit = findPreset(requested, lists)
        if (hit) return { preset: hit, notice: '' }
        const notice = requested.startsWith('mine:')
            ? 'That preset was saved on another device. Opened the built-in one instead.'
            : requested.startsWith('show:')
                ? 'This show has no preset by that name any more. Opened the built-in one instead.'
                : `There is no preset called “${requested}”. Opened the built-in one instead.`
        return { preset: builtInPreset(fallbackId), notice }
    }
    const showOwn = showDefault ? presetGroups(lists).find((group) => group.key === 'show').presets.find((preset) => preset.id === showDefault) : null
    if (showOwn) return { preset: showOwn, notice: '' }
    const last = lastActive ? findPreset(lastActive, lists) : null
    if (last) return { preset: last, notice: '' }
    return { preset: builtInPreset(fallbackId), notice: '' }
}

/** Which width class a workspace is — the same line Nodes draws (640px). */
export const widthClassOf = (viewportWidth, narrowBelow = 640) => (
    Number.isFinite(viewportWidth) && viewportWidth >= narrowBelow ? 'wide' : 'narrow'
)

// Where unit line `index` of `count` stands in `size` pixels: whole pixels, and
// the same pixel for the right edge of one block and the left edge of the next.
const edge = (origin, size, count, index) => origin + Math.round((index * size) / count)

const unitsOf = (rect, grid) => {
    const [x, y, rw, rh] = rect
    const col = Math.min(grid.cols - 1, Math.max(0, Math.round((x / 100) * grid.cols)))
    const row = Math.min(grid.rows - 1, Math.max(0, Math.round((y / 100) * grid.rows)))
    const cols = Math.min(grid.cols - col, Math.max(1, Math.round(((x + rw) / 100) * grid.cols) - col))
    const rows = Math.min(grid.rows - row, Math.max(1, Math.round(((y + rh) / 100) * grid.rows) - row))
    return { col, row, cols, rows }
}

const frameOfUnits = (units, area, grid) => {
    const left = Number(area.left) || 0
    const top = Number(area.top) || 0
    const width = Math.max(1, Number(area.width) || 0)
    const height = Math.max(1, Number(area.height) || 0)
    const x0 = edge(left, width, grid.cols, units.col)
    const x1 = edge(left, width, grid.cols, units.col + units.cols)
    const y0 = edge(top, height, grid.rows, units.row)
    const y1 = edge(top, height, grid.rows, units.row + units.rows)
    return { x: x0, y: y0, width: Math.max(1, x1 - x0), height: Math.max(1, y1 - y0) }
}

/** One unit of the area, in pixels: the smallest a block may be. */
export const unitSize = (area = {}, grid = GRID.wide) => ({
    width: Math.max(1, Math.floor((Number(area.width) || 0) / grid.cols)),
    height: Math.max(1, Math.floor((Number(area.height) || 0) / grid.rows))
})

/**
 * Percent rectangles → pixel frames inside `area` ({ left, top, width, height }),
 * every edge on a unit line of `grid`. Blocks that touch in the drawing touch
 * on screen: the same pixel is one block's right edge and the next one's left,
 * the 1px line between them is the block's own border. Frames are
 * screen-pinned: Perform has no canvas to pan.
 */
export const framesFromRects = (rects = {}, area = {}, { zBase = 10, grid = GRID.wide } = {}) => {
    const frames = {}
    let z = zBase
    for (const [id, rect] of Object.entries(rects || {})) {
        frames[id] = {
            ...frameOfUnits(unitsOf(rect, grid), area, grid),
            zIndex: z,
            pinned: true,
            minimized: false,
            visible: true
        }
        z += 1
    }
    return frames
}

/** A pixel frame moved onto the unit grid: its four edges go to the nearest unit lines. */
export const snapFrame = (frame = {}, area = {}, grid = GRID.wide) => {
    const left = Number(area.left) || 0
    const top = Number(area.top) || 0
    const width = Math.max(1, Number(area.width) || 0)
    const height = Math.max(1, Number(area.height) || 0)
    const x = Number(frame.x) || 0
    const y = Number(frame.y) || 0
    const rect = [
        ((x - left) / width) * 100,
        ((y - top) / height) * 100,
        ((Number(frame.width) || 0) / width) * 100,
        ((Number(frame.height) || 0) / height) * 100
    ]
    return { ...frame, ...frameOfUnits(unitsOf(rect, grid), area, grid) }
}

/** The inverse, for saving what the person arranged as a preset. */
export const rectsFromFrames = (frames = {}, area = {}) => {
    const left = Number(area.left) || 0
    const top = Number(area.top) || 0
    const width = Math.max(1, Number(area.width) || 0)
    const height = Math.max(1, Number(area.height) || 0)
    const rects = {}
    for (const [id, frame] of Object.entries(frames || {})) {
        if (!frame || frame.visible === false) continue
        const rect = normalizeRect([
            ((Number(frame.x) - left) / width) * 100,
            ((Number(frame.y) - top) / height) * 100,
            (Number(frame.width) / width) * 100,
            (Number(frame.height) / height) * 100
        ])
        if (rect) rects[id] = rect
    }
    return rects
}

/**
 * A stack for the other width class, for a preset saved on one: every window
 * in the saved order, one under the other, equal shares. A phone gets the
 * same windows, in a shape a phone can hold, until someone arranges it there.
 */
export const stackRects = (ids = []) => {
    const count = ids.length
    if (!count) return {}
    // Whole rows of the grid, so a stack is blocks too (the last one takes what is left).
    const rows = GRID.narrow.rows
    const share = Math.max(1, Math.floor(rows / count))
    return Object.fromEntries(ids.map((id, index) => {
        const row = Math.min(rows - 1, index * share)
        const height = index === count - 1 ? rows - row : share
        return [id, nu(0, row, GRID.narrow.cols, Math.max(1, height))]
    }))
}

const randomId = () => {
    const bytes = typeof crypto !== 'undefined' && crypto.getRandomValues ? crypto.getRandomValues(new Uint8Array(6)) : null
    if (bytes) return Array.from(bytes, (b) => b.toString(36).padStart(2, '0')).join('').slice(0, 10)
    return Math.random().toString(36).slice(2, 12)
}

/**
 * What the person has on screen, as a preset to keep.
 *   windows   the open windows, [{ id, kind }], in stacking order
 *   frames    their pixel frames
 *   area      the workspace they were measured in
 *   widthClass which layout these frames are
 *   previous  the preset they started from — its other width class is kept
 */
export const presetFromArrangement = ({ name, source, windows = [], frames = {}, area = {}, widthClass = 'wide', previous = null, now = Date.now() }) => {
    const open = windows.filter((item) => frames[item.id] && frames[item.id].visible !== false)
    const rects = rectsFromFrames(Object.fromEntries(open.map((item) => [item.id, frames[item.id]])), area)
    const other = widthClass === 'wide' ? 'narrow' : 'wide'
    const previousOther = previous?.[other] && typeof previous[other] === 'object' ? previous[other] : null
    // The other width class keeps what the preset already said about it. A
    // window with no place there is simply not opened at that width (it stays
    // in the preset and in "+ window") — the same rule the built-ins follow.
    // With nothing to keep at all, the other width gets a plain stack.
    let otherRects = {}
    for (const item of open) {
        if (previousOther?.[item.id]) otherRects[item.id] = previousOther[item.id]
    }
    if (!Object.keys(otherRects).length) otherRects = stackRects(open.map((item) => item.id))
    return normalizePreset({
        id: `${source}:${randomId()}`,
        name,
        source,
        base: previous?.source === 'builtin' ? previous.id : (previous?.base || previous?.id || null),
        windows: open.map(({ id, kind }) => ({ id, kind })),
        [widthClass]: rects,
        [other]: otherRects,
        updatedAt: now
    }, { source })
}

/** A slot id for a new window of `kind` that is not taken yet. */
export const nextSlotId = (kind, taken = []) => {
    const used = new Set(taken)
    if (!used.has(kind)) return kind
    let n = 2
    while (used.has(`${kind}-${n}`)) n += 1
    return `${kind}-${n}`
}

// How big a block opens when it is added by hand, in units [cols, rows] (wide).
// A bar is one row; the deck and the wall are large; anything else is 3 x 3.
const DEFAULT_UNITS = { deck: [6, 5], wall: [4, 4], clock: [4, 1], master: [4, 1], out: [3, 3], lightlooks: [3, 3], laser: [3, 3] }

/**
 * Where a window added by hand opens, in percent like a preset: the first free
 * unit area of its default size, scanning left to right, top to bottom. With
 * no free area it opens on top, in the middle (the person moves it), as before.
 *   rects  the percent rectangles already on screen
 */
export const rectForAddedWindow = (widthClass = 'wide', kind = null, rects = {}) => {
    const grid = GRID[widthClass] || GRID.wide
    const [wantCols, wantRows] = widthClass === 'narrow' ? [grid.cols, DEFAULT_UNITS[kind]?.[1] === 1 ? 1 : 2] : (DEFAULT_UNITS[kind] || [3, 3])
    const taken = Object.values(rects || {}).map((rect) => unitsOf(rect, grid))
    const free = (col, row) => !taken.some((box) => col < box.col + box.cols && col + wantCols > box.col && row < box.row + box.rows && row + wantRows > box.row)
    for (let row = 0; row + wantRows <= grid.rows; row += 1) {
        for (let col = 0; col + wantCols <= grid.cols; col += 1) {
            if (free(col, row)) return unitRect(grid)(col, row, wantCols, wantRows)
        }
    }
    return widthClass === 'narrow' ? nu(0, 3, 4, 3) : wu(3, 2, 6, 4)
}

/**
 * ARRANGE ALL: tile the given windows over the whole unit grid, edge to edge,
 * no gap and no overlap. Whole unit rows, and in each row whole unit columns
 * (the remainder goes to the first ones), so the rectangles are exactly what
 * a built-in preset is made of and snapFrame leaves them alone. The row/column
 * count is the one whose cell shape is nearest a 16:9 picture in `area`
 * (pixels), so a desk gets wide cells and a phone gets a stack.
 *   ids   window ids, in the order they should read (left→right, top→bottom)
 * Returns { id: [x, y, w, h] } in percent, like a preset. More windows than
 * grid cells cannot tile on whole units: the extra ones are not placed.
 */
export const tileRects = (ids = [], widthClass = 'wide', area = {}) => {
    const grid = GRID[widthClass] || GRID.wide
    const list = ids.slice(0, grid.cols * grid.rows)
    const count = list.length
    if (!count) return {}
    const aspect = (Number(area.width) || 16) / (Number(area.height) || 9)
    let best = null
    for (let rows = 1; rows <= Math.min(count, grid.rows); rows += 1) {
        const cols = Math.ceil(count / rows)
        if (cols > grid.cols) continue
        const cell = aspect * (rows / cols)
        const score = Math.abs(Math.log(cell / (16 / 9))) + (rows * cols - count) * 0.05
        if (!best || score < best.score) best = { rows, cols, score }
    }
    const share = (total, parts, index) => {
        const base = Math.floor(total / parts)
        const extra = total % parts
        const start = index * base + Math.min(index, extra)
        return [start, base + (index < extra ? 1 : 0)]
    }
    const rect = unitRect(grid)
    const out = {}
    let cursor = 0
    for (let row = 0; row < best.rows; row += 1) {
        const remaining = count - cursor
        const inRow = Math.ceil(remaining / (best.rows - row))
        const [rowStart, rowHeight] = share(grid.rows, best.rows, row)
        for (let col = 0; col < inRow; col += 1) {
            const [colStart, colWidth] = share(grid.cols, inRow, col)
            out[list[cursor]] = rect(colStart, rowStart, colWidth, rowHeight)
            cursor += 1
        }
    }
    return out
}
