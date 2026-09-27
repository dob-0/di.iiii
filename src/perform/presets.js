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
export const WINDOW_ORDER = ['deck', 'out', 'clock', 'master', 'wall', 'wallout', 'surfaces', 'cues', 'machines', 'surface', 'scenes', 'looks', 'audio', 'status', 'footage', 'mysurface', 'now']

export const isKnownKind = (kind) => Object.prototype.hasOwnProperty.call(WINDOW_KINDS, kind)
export const isComingKind = (kind) => isKnownKind(kind) && WINDOW_KINDS[kind].phase > 1

const w = (id, kind = id) => ({ id, kind })

// The seven, from his real use (the sketch he was shown on 2026-09-24,
// local.thedi.studio/lab/p/perform-sketch). The rectangles are the sketch's.
export const BUILT_IN_PRESETS = [
    {
        id: 'vj',
        name: 'VJ',
        who: 'Club and laser nights. The deck is the instrument; the wall only has to be right.',
        windows: [w('deck'), w('out'), w('clock'), w('master')],
        wide: { deck: [1, 2, 66, 95], out: [68, 2, 31, 44], clock: [68, 48, 31, 25], master: [68, 75, 31, 22] },
        narrow: { out: [0, 0, 100, 22], clock: [0, 22, 100, 28], deck: [0, 50, 100, 50] }
    },
    {
        id: 'wall',
        name: 'Wall',
        who: 'The stage rig: one machine drives the projector on another. Corners, surfaces, cues.',
        windows: [w('surfaces'), w('cues'), w('wall'), w('wallout'), w('machines')],
        wide: { surfaces: [1, 2, 22, 52], cues: [1, 56, 22, 41], wall: [24, 2, 55, 95], wallout: [80, 2, 19, 34], machines: [80, 38, 19, 30] },
        narrow: { wall: [0, 0, 100, 42], cues: [0, 42, 100, 30], surfaces: [0, 72, 100, 28] }
    },
    {
        id: 'light',
        name: 'Light',
        who: 'The studio DMX rig and the club desk. Scenes, master, blackout, tempo.',
        windows: [w('scenes'), w('looks'), w('master'), w('clock'), w('audio')],
        wide: { scenes: [1, 2, 46, 60], looks: [48, 2, 28, 60], master: [77, 2, 22, 60], clock: [1, 64, 46, 33], audio: [48, 64, 51, 33] },
        narrow: { scenes: [0, 0, 100, 40], master: [0, 40, 100, 36], clock: [0, 76, 100, 24] }
    },
    {
        id: 'caller',
        name: 'Caller',
        who: 'Show mode: one person calls the show. One list, one clock; blackout reaches everything.',
        windows: [w('cues'), w('wall'), w('wallout'), w('deck'), w('clock'), w('master')],
        wide: { cues: [1, 2, 34, 95], wall: [36, 2, 36, 48], wallout: [73, 2, 26, 48], deck: [36, 52, 36, 45], clock: [73, 52, 26, 22], master: [73, 76, 26, 21] },
        narrow: { cues: [0, 0, 100, 64], master: [0, 64, 100, 36] }
    },
    {
        id: 'unattended',
        name: 'Unattended',
        who: 'The installation: machines play on their own for days. Nothing to touch but the one line and blackout.',
        windows: [w('wallout'), w('status'), w('master')],
        wide: { wallout: [1, 2, 98, 80], status: [1, 84, 70, 13], master: [72, 84, 27, 13] },
        narrow: { status: [0, 0, 100, 50], master: [0, 50, 100, 50] }
    },
    {
        id: 'guest',
        name: 'Guest',
        who: 'A guest artist on her own laptop, following the space: bring footage, put it on her surface.',
        windows: [w('footage'), w('mysurface'), w('now')],
        wide: { footage: [1, 2, 38, 95], mysurface: [40, 2, 59, 62], now: [40, 66, 59, 31] },
        narrow: { footage: [0, 0, 100, 60], mysurface: [0, 60, 100, 40] }
    },
    {
        id: 'remote',
        name: 'Remote',
        who: 'The phone at the side of the room. Cues, master, blackout. Nothing to drag.',
        windows: [w('cues'), w('master'), w('clock')],
        wide: { cues: [1, 2, 48, 95], master: [50, 2, 49, 60], clock: [50, 64, 49, 33] },
        narrow: { cues: [0, 0, 100, 50], master: [0, 50, 100, 30], clock: [0, 80, 100, 20] }
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
 * Order: the address, then this device's last one, then the default for the
 * desk the person came from. A `mine:` preset from another device is not
 * here — said, and its base (or VJ) opened instead of an empty desk.
 */
export const choosePreset = ({ requested = null, lastActive = null, from = null, mine = [], show = [] } = {}) => {
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
    const last = lastActive ? findPreset(lastActive, lists) : null
    if (last) return { preset: last, notice: '' }
    return { preset: builtInPreset(fallbackId), notice: '' }
}

/** Which width class a workspace is — the same line Nodes draws (640px). */
export const widthClassOf = (viewportWidth, narrowBelow = 640) => (
    Number.isFinite(viewportWidth) && viewportWidth >= narrowBelow ? 'wide' : 'narrow'
)

const GUTTER = 6

/**
 * Percent rectangles → pixel frames inside `area` ({ left, top, width, height }).
 * A small gutter keeps two windows that touch in the drawing from sharing an
 * edge on screen. Frames are screen-pinned: Perform has no canvas to pan.
 */
export const framesFromRects = (rects = {}, area = {}, { zBase = 10 } = {}) => {
    const left = Number(area.left) || 0
    const top = Number(area.top) || 0
    const width = Math.max(1, Number(area.width) || 0)
    const height = Math.max(1, Number(area.height) || 0)
    const frames = {}
    let z = zBase
    for (const [id, rect] of Object.entries(rects || {})) {
        const [x, y, rw, rh] = rect
        frames[id] = {
            x: Math.round(left + (x / 100) * width + GUTTER / 2),
            y: Math.round(top + (y / 100) * height + GUTTER / 2),
            width: Math.max(1, Math.round((rw / 100) * width - GUTTER)),
            height: Math.max(1, Math.round((rh / 100) * height - GUTTER)),
            zIndex: z,
            pinned: true,
            minimized: false,
            visible: true
        }
        z += 1
    }
    return frames
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
            ((Number(frame.x) - GUTTER / 2 - left) / width) * 100,
            ((Number(frame.y) - GUTTER / 2 - top) / height) * 100,
            ((Number(frame.width) + GUTTER) / width) * 100,
            ((Number(frame.height) + GUTTER) / height) * 100
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
    const share = 100 / count
    return Object.fromEntries(ids.map((id, index) => [id, [0, Math.round(index * share * 100) / 100, 100, Math.round(share * 100) / 100]]))
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

/**
 * Where a window added by hand opens, in percent like a preset: in the
 * middle of a desk, the lower half of a phone. On top, and the person moves it.
 */
export const rectForAddedWindow = (widthClass = 'wide') => (widthClass === 'narrow' ? [0, 50, 100, 50] : [30, 20, 40, 56])
