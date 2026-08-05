// The piece's timing, saved somewhere a laptop is not required to reach.
//
// The Director has always written its edits back into sequences/index.js
// through a Vite dev-server middleware — so the timeline could be OPENED on
// di-studio.xyz and not SAVED from it. Anyone but the author, on any machine
// but the one running `npm run dev`, could retime the piece and lose the work
// on reload.
//
// An overlay rather than a copy of the edit list, on purpose. A row carries a
// Component, a backdrop and paragraphs of argument about why a beat is the
// length it is; none of that is data and none of it belongs on a server. What
// travels is the handful of numbers a director actually moves, keyed by row
// id, and only the ones that differ from the file. The file stays the source
// of truth and the overlay says how the live space differs from it — so
// reading the source still tells you what the piece is, and clearing the
// overlay always lands back on it.

/**
 * The fields a director can move on the timeline. Everything else in a row is
 * either code (`Component`), authored prose (`note`, `title`) or a world
 * (`backdrop`) — none of which a timing overlay has any business carrying.
 */
export const TIMING_FIELDS = Object.freeze(['startSec', 'endSec'])

const isFiniteNumber = (value) => typeof value === 'number' && Number.isFinite(value)

/**
 * The difference between an edited list and the one the file declares, as
 * `{ [rowId]: { startSec, endSec } }` — changed fields only.
 *
 * Rows the baseline does not have are skipped: a row ADDED in the panel is a
 * new scene, which needs a Component, which is code. Copy still covers that
 * case and says so.
 */
export const timingOverlayFrom = (sequences = [], baseline = []) => {
    const byId = new Map(baseline.map((row) => [row?.id, row]))
    const overlay = {}
    for (const row of sequences) {
        const id = row?.id
        if (!id) continue
        const original = byId.get(id)
        if (!original) continue
        const changed = {}
        for (const field of TIMING_FIELDS) {
            const next = row[field]
            if (!isFiniteNumber(next)) continue
            if (next === original[field]) continue
            changed[field] = next
        }
        if (Object.keys(changed).length) overlay[id] = changed
    }
    return overlay
}

/**
 * The edit list as the live space means it. Returns the same array reference
 * when the overlay changes nothing, so callers can use identity to tell
 * "nothing saved here" from "saved, and equal".
 *
 * Unknown ids are ignored rather than dropped or errored: a row can be cut
 * from the file while a stale override for it still sits on the server, and
 * the piece must keep playing.
 */
export const applyTimingOverlay = (sequences = [], overlay = null) => {
    if (!overlay || typeof overlay !== 'object') return sequences
    let touched = false
    const next = sequences.map((row) => {
        const patch = overlay[row?.id]
        if (!patch || typeof patch !== 'object') return row
        const changed = {}
        for (const field of TIMING_FIELDS) {
            const value = patch[field]
            if (!isFiniteNumber(value)) continue
            if (value === row[field]) continue
            changed[field] = value
        }
        if (!Object.keys(changed).length) return row
        touched = true
        return { ...row, ...changed }
    })
    return touched ? next : sequences
}

/** Is there anything saved here at all? */
export const hasTimingOverlay = (overlay) =>
    Boolean(overlay && typeof overlay === 'object' && Object.keys(overlay).length)

/**
 * Where the overlay sits inside a space's settings blob. Namespaced because
 * the blob belongs to the space, not to this piece — a second code space
 * keeping its own settings must not collide with this one.
 */
export const SETTINGS_KEY = 'algovrithm'

export const readTimingSettings = (settings) =>
    settings?.[SETTINGS_KEY]?.timing || null

export const writeTimingSettings = (settings, overlay) => ({
    ...(settings && typeof settings === 'object' ? settings : {}),
    [SETTINGS_KEY]: {
        ...(settings?.[SETTINGS_KEY] || {}),
        timing: overlay
    }
})
