export const RAW_WINDOW_PADDING = 12
export const DEFAULT_RAW_WORKSPACE_TOP = 64
// The bottom-right corner permanently hosts several pieces of fixed chrome a
// window can land under: the zoom controls, the destructive raw-delete-fab
// (z-index 1300, whenever a node is selected), and — app-wide, on every
// route, not just Raw — AccountButton's "Sign in" icon at zIndex 9999,
// `bottom: 86px`/30px tall, i.e. up to 116px above the true viewport edge.
// That z-index is above everything, so it isn't just visual: it eats clicks
// meant for whatever a window put underneath it. On a phone, where a
// window's default frame routinely shrinks to fill most of the available
// height (see the width/height clamp below), a window reliably lands there
// unless this space is reserved. Reserve it on every window, not only when
// a node happens to be selected — the alternative is a window that jumps
// size the moment a selection (and therefore the delete FAB) changes.
export const RAW_WINDOW_BOTTOM_RESERVE = 120
// What a minimized window actually occupies: its header, and nothing else
// (DesktopWindow renders `height: auto` and drops the body and the resizer).
// The placement maths below has to use THIS, not the stored height — see the
// comment on maxY.
export const RAW_WINDOW_MINIMIZED_HEIGHT = 56
// The smallest honest window: a title bar with its four controls on ONE row,
// and a body a person can still read one line in. 260x180 was the old floor;
// at 260 the header wrapped to two rows and ate 100 of the 180px.
export const RAW_WINDOW_MIN_WIDTH = 200
export const RAW_WINDOW_MIN_HEIGHT = 120
// The bottom reserve exists for the phone, where AccountButton's "Sign in"
// icon and the delete FAB sit under whatever a nearly-full-height window
// lands on. On a desktop the same 120px band took 22% of a 584px-tall
// embed for a corner nothing was going to touch.
export const RAW_WINDOW_BOTTOM_RESERVE_WIDE = 40
export const RAW_NARROW_VIEWPORT = 640
export const getBottomReserve = (viewportWidth) => (
    Number.isFinite(viewportWidth) && viewportWidth >= RAW_NARROW_VIEWPORT
        ? RAW_WINDOW_BOTTOM_RESERVE_WIDE
        : RAW_WINDOW_BOTTOM_RESERVE
)

const clamp = (value, min, max) => Math.min(Math.max(value, min), max)
const hasFiniteValue = (value) => Number.isFinite(Number(value))

export function getWorkspaceTopInset({ topbarRect = null, padding = 8 } = {}) {
    const bottom = Math.max(0, Number(topbarRect?.bottom) || 0)
    return bottom > 0 ? bottom + padding : DEFAULT_RAW_WORKSPACE_TOP
}

// Which panel windows actually get mounted. Every mounted world panel holds a
// live WebGL context, and browsers cap concurrent contexts (~16) — past that
// they start killing the oldest, which the context guard answers by remounting,
// which kills another, and the tab freezes. So: only panels in the current
// scope, and none at all behind a fullscreen world that covers them anyway.
export function selectMountedPanelNodes({
    nodes = [],
    isPanel = () => false,
    currentScopeId = null,
    isWorldFullscreen = false
} = {}) {
    if (isWorldFullscreen) return []
    return nodes.filter((node) => (
        isPanel(node)
        && (node.parentId || null) === (currentScopeId || null)
        && node.values?.frame?.visible !== false
    ))
}

export function clampWindowFrame(frame = {}, bounds = {}) {
    const minTop = Number.isFinite(bounds.minTop) ? bounds.minTop : DEFAULT_RAW_WORKSPACE_TOP
    const allowOverflowLeft = bounds.allowOverflowLeft === true
    const allowOverflowTop = bounds.allowOverflowTop === true
    const minLeft = allowOverflowLeft
        ? null
        : (Number.isFinite(bounds.minLeft) ? bounds.minLeft : RAW_WINDOW_PADDING)
    const effectiveMinTop = allowOverflowTop ? null : minTop
    const viewportWidth = Number.isFinite(bounds.viewportWidth) ? bounds.viewportWidth : null
    const viewportHeight = Number.isFinite(bounds.viewportHeight) ? bounds.viewportHeight : null
    const viewportPadding = Number.isFinite(bounds.viewportPadding) ? bounds.viewportPadding : RAW_WINDOW_PADDING
    const bottomReserve = Number.isFinite(bounds.bottomReserve) ? bounds.bottomReserve : getBottomReserve(viewportWidth)
    const bottomEdgePadding = viewportPadding + bottomReserve
    // A resize must never MOVE the window. Without this, growing a window past
    // the floor pinned its bottom edge and slid its top edge up to meet the
    // cursor — the grip escaped from under the pointer and the window looked
    // like it had stopped responding. Cap the size against the window's own
    // position instead, so growth simply stops at the edge.
    const resizing = bounds.resizing === true

    const nextX = hasFiniteValue(frame.x) ? Number(frame.x) : (minLeft ?? 0)
    const nextY = hasFiniteValue(frame.y) ? Number(frame.y) : (effectiveMinTop ?? 0)
    // A node's default window size (e.g. universe.world's 680x480) is tuned for
    // desktop and is never re-derived per viewport. Without a ceiling here, that
    // fixed size ships as-is on a 390px phone: wider than the whole screen, and
    // tall enough to cover it below the topbar, with no way to see anything else.
    const maxWidth = viewportWidth
        ? Math.max(RAW_WINDOW_MIN_WIDTH, (resizing ? viewportWidth - nextX : viewportWidth - viewportPadding) - viewportPadding)
        : Infinity
    const maxHeight = viewportHeight
        ? Math.max(RAW_WINDOW_MIN_HEIGHT, viewportHeight - (resizing ? Math.max(nextY, effectiveMinTop ?? 0) : (effectiveMinTop ?? 0)) - bottomEdgePadding)
        : Infinity
    const width = clamp(Math.max(RAW_WINDOW_MIN_WIDTH, Number(frame.width) || RAW_WINDOW_MIN_WIDTH), RAW_WINDOW_MIN_WIDTH, maxWidth)
    const height = clamp(Math.max(RAW_WINDOW_MIN_HEIGHT, Number(frame.height) || RAW_WINDOW_MIN_HEIGHT), RAW_WINDOW_MIN_HEIGHT, maxHeight)
    const maxX = viewportWidth
        ? (allowOverflowLeft
            ? viewportWidth - width - viewportPadding
            : Math.max(minLeft, viewportWidth - width - viewportPadding))
        : (allowOverflowLeft ? nextX : Math.max(minLeft, nextX))
    // A minimized window is a title bar, but the clamp used to place it by its
    // STORED height — so a collapsed bar authored near the bottom got yanked
    // upward by however tall it would be if opened, landing on top of whatever
    // was there. Measured: a bar at y=640 with height 430 jumped to y=248 at
    // 1440x810, straight onto the card row. Place it by what it actually
    // occupies; `height` is still returned untouched so expanding restores the
    // authored size.
    const placedHeight = frame.minimized === true
        ? Math.min(height, RAW_WINDOW_MINIMIZED_HEIGHT)
        : height
    const maxY = viewportHeight
        ? (allowOverflowTop
            ? viewportHeight - placedHeight - bottomEdgePadding
            : Math.max(minTop, viewportHeight - placedHeight - bottomEdgePadding))
        : (allowOverflowTop ? nextY : Math.max(minTop, nextY))

    // Overflow is allowed, but never total: some of the header must stay
    // reachable or one stray swipe loses the window forever (there is no
    // window list and frames persist into the document). Keep at least 72px
    // of the window inside the viewport horizontally, and never let the
    // header rise above the viewport top.
    const overflowFloorX = viewportWidth ? -(width - 72) : nextX
    return {
        ...frame,
        x: allowOverflowLeft ? clamp(nextX, Math.min(overflowFloorX, maxX), maxX) : clamp(nextX, minLeft, maxX),
        // A viewport shorter than the reserve stack used to yield maxY < 0
        // and park the header ABOVE the top edge, unreachable. The floor is 0.
        y: allowOverflowTop ? clamp(nextY, 0, Math.max(0, maxY)) : clamp(nextY, minTop, Math.max(minTop, maxY)),
        width,
        height
    }
}


/**
 * How much of the graph surface each edge-docked window eats.
 *
 * The surface fits and CENTRES the card cluster on its own box, which knows
 * nothing about the windows floating over it — so a perfectly good corridor
 * between two windows still ends up with cards underneath one of them if the
 * corridor is not centred. That is not hypothetical: on 2026-08-18 a ~1050px
 * window put the World panel exactly on top of the card column, and the output
 * dots on the cards' right edge could not be grabbed at all, which reads as
 * "this node has no connectors". Reported by the owner, reproduced at 700-1200px.
 *
 * Each window is charged to ONE edge: the one it hugs. A window spanning most
 * of the width can only be a top/bottom band (its left and right edges are both
 * near an edge, so "nearest edge" alone would wrongly eat the whole width), and
 * likewise for height; anything else is charged to its nearest edge. Windows
 * floating in the middle are charged to nothing — the fit cannot dodge those,
 * and pretending otherwise would shrink the graph for no gain.
 *
 * Frames are viewport coordinates (windows are fixed-positioned); surfaceRect
 * is the surface's own box, so the two are compared in the same space.
 */
export function getGraphEdgeInsets({
    frames = [],
    surfaceRect = null,
    edgeSlack = 56,
    spanFraction = 0.7
} = {}) {
    const GRAPH_FIT_PADDING_PX = 24 // mirrors RawGraphSurface's own constant
    const width = Number(surfaceRect?.width) || 0
    const height = Number(surfaceRect?.height) || 0
    const insets = { left: 0, right: 0, top: 0, bottom: 0 }
    if (!width || !height) return insets

    const originX = Number(surfaceRect?.left) || 0
    const originY = Number(surfaceRect?.top) || 0

    for (const frame of frames) {
        const w = Number(frame?.width)
        const h = Number(frame?.height)
        const x = Number(frame?.x) - originX
        const y = Number(frame?.y) - originY
        if (![w, h, x, y].every(Number.isFinite) || w <= 0 || h <= 0) continue

        const distances = {
            left: x,
            right: width - (x + w),
            top: y,
            bottom: height - (y + h)
        }
        const spansWidth = w >= width * spanFraction
        const spansHeight = h >= height * spanFraction

        let edge = null
        if (spansWidth && !spansHeight) {
            edge = distances.top <= distances.bottom ? 'top' : 'bottom'
        } else if (spansHeight && !spansWidth) {
            edge = distances.left <= distances.right ? 'left' : 'right'
        } else if (!spansWidth && !spansHeight) {
            const nearest = Object.entries(distances).sort((a, b) => a[1] - b[1])[0]
            if (nearest && nearest[1] <= edgeSlack) edge = nearest[0]
        }
        if (!edge) continue

        if (edge === 'left') insets.left = Math.max(insets.left, x + w)
        if (edge === 'right') insets.right = Math.max(insets.right, width - x)
        if (edge === 'top') insets.top = Math.max(insets.top, y + h)
        if (edge === 'bottom') insets.bottom = Math.max(insets.bottom, height - y)
    }

    // Report what the windows actually occupy — do NOT scale it down. A
    // shrunk-to-fit inset is a lie about how much room there is, and the fit
    // trusts it completely: at 800x950 a two-window stack legitimately eating
    // 740 of 950px got reported as 683 to stay under a 72% cap, and the fit
    // placed the card cluster 33px into where the bottom window really was —
    // the exact overlap this mechanism exists to prevent, just harder to find
    // because it only shows up on the one row nearest the lie.
    //
    // The only thing worth guarding against is an axis with NO honest corridor
    // left at all — dodging cannot succeed there, so give up rather than
    // report a small positive number that still overlaps. That floor has to
    // be an absolute pixel amount, not a fraction of the viewport: on a phone
    // two edge-docked windows legitimately leave as little as ~17% of the
    // height free (390x844, both windows near their minimum height), and that
    // sliver is exactly what fitGraph's own FIT_MIN_USEFUL_ZOOM fallback is
    // for — reverting to "ignore the windows" there recreates the overlap
    // this function exists to prevent. Only a genuinely negative or
    // pointlessly thin band (nothing a legible card could occupy) gives up.
    const minFreePx = GRAPH_FIT_PADDING_PX * 2
    const left = Math.max(0, insets.left)
    const right = Math.max(0, insets.right)
    const top = Math.max(0, insets.top)
    const bottom = Math.max(0, insets.bottom)
    const dodgeX = (width - left - right) >= minFreePx
    const dodgeY = (height - top - bottom) >= minFreePx
    return {
        left: dodgeX ? left : 0,
        right: dodgeX ? right : 0,
        top: dodgeY ? top : 0,
        bottom: dodgeY ? bottom : 0
    }
}

// The "what is it made of" sheet's opening frame.
//
// Derived rather than stored so the phone case is arithmetic a test can assert
// as NUMBERS. Two facts drive it, and both are measurements of surfaces that
// already exist:
//
//  1. The selection inspector is already docked somewhere, and entering a node
//     selects it — so the inspector is up whenever this sheet opens. On a
//     desktop it is `right: 24px, width: min(320px, …)`; MEASURED at 1440x900,
//     a right-docked sheet landed underneath it and the reading was unreadable
//     behind the Cube's own port fields. So this one docks LEFT. At <=640px the
//     inspector becomes a bottom sheet at `max-height: 38dvh` instead, so the
//     phone case is a TOP band ending where that one begins, and the two can
//     both be up at once.
//  2. Below a certain band there is no honest window left. The sheet is a
//     stack of four sections; under ~220px it shows one heading and a scrollbar,
//     which is worse than a header you tap to open. So it opens MINIMIZED, the
//     same answer the starter welcome note reached on a 664px phone.
export const RAW_ANATOMY_WIDTH = 400
export const RAW_ANATOMY_HEIGHT = 620
export const RAW_ANATOMY_MIN_BAND = 220
// .raw-selection-scaffold's phone rule. Kept next to the arithmetic that
// depends on it rather than as a bare 0.62 nobody can trace back to a rule.
export const RAW_SELECTION_SHEET_FRACTION = 0.38
// Above the fullscreen room, below the way out of it. Entering a Scene puts
// `.raw-world-fullscreen` (z-index 1200) over everything, and at a panel
// window's ordinary z-index 20 the sheet rendered BEHIND it: the button was
// reachable, the reading was not, and pressing it looked like nothing
// happening. Seen by hit-testing the middle of the sheet, which came back as
// the room's <canvas>. The rest of the stack, so this number can be read
// rather than guessed at: world-fullscreen 1200 · delete FAB 1300 ·
// selection sheet 1350 · the "inside X" marker and its way out 1400.
export const RAW_ANATOMY_Z = 1250
// A window is taller than the height it is given: two 1px edges plus the 2px
// family stripe on top. MEASURED — a band computed to land exactly on the
// selection sheet's top edge rendered 3px into it, which is enough to eat the
// first row of taps. The rest of the allowance is a visible gap, because two
// panels touching read as one broken panel.
const RAW_WINDOW_CHROME_ALLOWANCE = 12

// Where the "inside X" marker sits. Exported and used by BOTH the marker's own
// style and the sheet's opening frame, because the two must not drift: the
// sheet opened at the same y as the marker and the marker (z-index 1400) sat
// straight on top of the window's title. MEASURED at 1440x900 and 390x664: the
// marker is 50px tall in both, whatever the viewport.
export const RAW_SCOPE_MARKER_HEIGHT = 50
export const getScopeMarkerTop = ({ chromeVisible = true, workspaceTop = DEFAULT_RAW_WORKSPACE_TOP } = {}) =>
    (chromeVisible ? workspaceTop : 12) + 8

export function getAnatomyDefaultFrame({
    viewportWidth = 1280,
    viewportHeight = 800,
    workspaceTop = DEFAULT_RAW_WORKSPACE_TOP,
    chromeVisible = true
} = {}) {
    // Below the marker, never level with it: the sheet only ever opens while you
    // are standing inside a node, which is exactly when the marker is up.
    const y = getScopeMarkerTop({ chromeVisible, workspaceTop }) + RAW_SCOPE_MARKER_HEIGHT + 8
    const narrow = viewportWidth < 640
    const base = { zIndex: RAW_ANATOMY_Z, pinned: false, minimized: false }

    if (!narrow) {
        return {
            ...base,
            x: RAW_WINDOW_PADDING * 2,
            y,
            width: RAW_ANATOMY_WIDTH,
            // Never taller than the room below the topbar, minus the corner
            // chrome the bottom reserve exists for.
            height: Math.max(180, Math.min(
                RAW_ANATOMY_HEIGHT,
                viewportHeight - y - RAW_WINDOW_PADDING - RAW_WINDOW_BOTTOM_RESERVE
            ))
        }
    }

    // Ceil the sheet's own height, floor nothing: dvh resolves against the
    // visual viewport and rounds against us.
    const sheetTop = viewportHeight - Math.ceil(viewportHeight * RAW_SELECTION_SHEET_FRACTION)
    const band = sheetTop - y - RAW_WINDOW_CHROME_ALLOWANCE
    return {
        ...base,
        x: RAW_WINDOW_PADDING,
        y,
        width: Math.max(260, viewportWidth - RAW_WINDOW_PADDING * 2),
        height: Math.max(180, band),
        minimized: band < RAW_ANATOMY_MIN_BAND
    }
}
