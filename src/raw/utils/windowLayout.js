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

    return {
        ...frame,
        x: allowOverflowLeft ? Math.min(nextX, maxX) : clamp(nextX, minLeft, maxX),
        y: allowOverflowTop ? Math.min(nextY, maxY) : clamp(nextY, minTop, maxY),
        width,
        height
    }
}

