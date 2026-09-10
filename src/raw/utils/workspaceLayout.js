import { RAW_NARROW_VIEWPORT } from './windowLayout.js'

/**
 * Where a window IS, versus what the window IS.
 *
 * Until now both lived in `node.values.frame`, inside the project document —
 * which means the op log, which means everyone. Moving a window moved it for
 * every person in the project, and for the same person on their phone, and it
 * pushed an undo entry. That is right for the node and wrong for the furniture:
 * two people at one desk do not share a chair.
 *
 * So the document keeps the SEED — the arrangement the project opens on, and
 * the one the projector (`RawOutSurface`) renders from — and the person keeps
 * the arrangement. Precedence is local → seed → the type's default cascade, so
 * an existing project opens exactly as it did before and forks on first drag.
 *
 * Scoped per device on purpose: a phone layout is a different arrangement of
 * the same room, and inheriting desktop frames on a 390px screen is how a
 * window ends up off the edge.
 */

export const RAW_LAYOUT_VERSION = 1

// Only these belong to the person. `title` stays document state — it names the
// thing, it does not place it.
export const LOCAL_FRAME_FIELDS = ['x', 'y', 'width', 'height', 'zIndex', 'visible', 'minimized', 'pinned', 'maximized', 'restore']

const isNarrow = (viewportWidth) => !(Number.isFinite(viewportWidth) && viewportWidth >= RAW_NARROW_VIEWPORT)

export const layoutScopeKey = ({ spaceId = null, projectId = null, viewportWidth = null } = {}) => (
    `dii.rawLayout.${spaceId || 'main'}.${projectId || 'local'}.${isNarrow(viewportWidth) ? 'narrow' : 'wide'}`
)

// The seed decides everything the person has not touched. A local entry that
// carries only `{ zIndex }` must not blank the seed's position.
export const mergeFrame = (seedFrame = null, localFrame = null) => {
    const seed = seedFrame && typeof seedFrame === 'object' ? seedFrame : {}
    if (!localFrame || typeof localFrame !== 'object') return seed
    const merged = { ...seed }
    for (const field of LOCAL_FRAME_FIELDS) {
        if (localFrame[field] !== undefined) merged[field] = localFrame[field]
    }
    return merged
}

// A layout outlives the nodes it describes: delete a window and its entry would
// sit in the slot forever, and localStorage has a ceiling.
export const pruneLayout = (frames = null, liveNodeIds = []) => {
    if (!frames || typeof frames !== 'object') return {}
    const live = new Set(liveNodeIds)
    const next = {}
    for (const [nodeId, frame] of Object.entries(frames)) {
        if (live.has(nodeId) && frame && typeof frame === 'object') next[nodeId] = frame
    }
    return next
}

/**
 * Maximise fills the WORKSPACE, not the page: a window that covers the topbar
 * hides the way out, and one that reaches the true bottom edge lands under the
 * sign-in button and the delete FAB (see RAW_WINDOW_BOTTOM_RESERVE).
 *
 * The frame it replaces travels with it as `restore`, because the document seed
 * is not where the person left the window — restoring to the seed would undo
 * their own arrangement as the price of maximising once.
 */
export const maximiseFrame = (frame = {}, bounds = {}) => {
    const left = Number.isFinite(bounds.left) ? bounds.left : 0
    const top = Number.isFinite(bounds.top) ? bounds.top : 0
    const width = Math.max(1, Number(bounds.width) || 0)
    const height = Math.max(1, Number(bounds.height) || 0)
    const restore = {}
    for (const field of ['x', 'y', 'width', 'height', 'pinned']) {
        if (frame[field] !== undefined) restore[field] = frame[field]
    }
    return {
        ...frame,
        x: left,
        y: top,
        width,
        height,
        // A maximised window is measured in screen pixels; leaving it in world
        // space would let a pan slide the "full screen" off the screen.
        pinned: true,
        minimized: false,
        maximized: true,
        restore
    }
}

export const restoreFrame = (frame = {}) => {
    const { restore, ...rest } = frame || {}
    const previous = restore && typeof restore === 'object' ? restore : {}
    return { ...rest, ...previous, maximized: false, restore: undefined }
}

export const isMaximised = (frame = null) => Boolean(frame && frame.maximized)

/**
 * The next window in the cycle, by the order they are stacked — so the keyboard
 * walks the pile the way the eye does, top to bottom, and wraps.
 */
export const cycleFocus = (order = [], currentId = null, direction = 1) => {
    const ids = order.filter(Boolean)
    if (ids.length === 0) return null
    const index = ids.indexOf(currentId)
    if (index === -1) return ids[direction >= 0 ? 0 : ids.length - 1]
    const step = direction >= 0 ? 1 : -1
    return ids[(index + step + ids.length) % ids.length]
}
