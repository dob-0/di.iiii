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
    const bottomReserve = Number.isFinite(bounds.bottomReserve) ? bounds.bottomReserve : RAW_WINDOW_BOTTOM_RESERVE
    const bottomEdgePadding = viewportPadding + bottomReserve

    // A node's default window size (e.g. universe.world's 680x480) is tuned for
    // desktop and is never re-derived per viewport. Without a ceiling here, that
    // fixed size ships as-is on a 390px phone: wider than the whole screen, and
    // tall enough to cover it below the topbar, with no way to see anything else.
    const maxWidth = viewportWidth
        ? Math.max(260, viewportWidth - viewportPadding * 2)
        : Infinity
    const maxHeight = viewportHeight
        ? Math.max(180, viewportHeight - (effectiveMinTop ?? 0) - bottomEdgePadding)
        : Infinity
    const width = clamp(Math.max(260, Number(frame.width) || 260), 260, maxWidth)
    const height = clamp(Math.max(180, Number(frame.height) || 180), 180, maxHeight)
    const nextX = hasFiniteValue(frame.x) ? Number(frame.x) : (minLeft ?? 0)
    const nextY = hasFiniteValue(frame.y) ? Number(frame.y) : (effectiveMinTop ?? 0)
    const maxX = viewportWidth
        ? (allowOverflowLeft
            ? viewportWidth - width - viewportPadding
            : Math.max(minLeft, viewportWidth - width - viewportPadding))
        : (allowOverflowLeft ? nextX : Math.max(minLeft, nextX))
    const maxY = viewportHeight
        ? (allowOverflowTop
            ? viewportHeight - height - bottomEdgePadding
            : Math.max(minTop, viewportHeight - height - bottomEdgePadding))
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
        y: allowOverflowTop ? clamp(nextY, Math.min(0, maxY), maxY) : clamp(nextY, minTop, maxY),
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
