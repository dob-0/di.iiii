export const BETA_WINDOW_PADDING = 12
export const DEFAULT_BETA_WORKSPACE_TOP = 64

const clamp = (value, min, max) => Math.min(Math.max(value, min), max)
const hasFiniteValue = (value) => Number.isFinite(Number(value))

export function getWorkspaceTopInset({ topbarRect = null, padding = 8 } = {}) {
    const bottom = Math.max(0, Number(topbarRect?.bottom) || 0)
    return bottom > 0 ? bottom + padding : DEFAULT_BETA_WORKSPACE_TOP
}

// Which panel windows actually get mounted. Every mounted world panel holds a
// live WebGL context, and browsers cap concurrent contexts (~16) — past that
// they start killing the oldest, which the context guard answers by remounting,
// which kills another, and the tab freezes. So: only panels in the current
// scope, and none at all behind a fullscreen world that covers them anyway.
// Ported from the raw lane, which fixed this first.
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
    const minTop = Number.isFinite(bounds.minTop) ? bounds.minTop : DEFAULT_BETA_WORKSPACE_TOP
    const allowOverflowLeft = bounds.allowOverflowLeft === true
    const allowOverflowTop = bounds.allowOverflowTop === true
    const minLeft = allowOverflowLeft
        ? null
        : (Number.isFinite(bounds.minLeft) ? bounds.minLeft : BETA_WINDOW_PADDING)
    const effectiveMinTop = allowOverflowTop ? null : minTop
    const viewportWidth = Number.isFinite(bounds.viewportWidth) ? bounds.viewportWidth : null
    const viewportHeight = Number.isFinite(bounds.viewportHeight) ? bounds.viewportHeight : null
    const viewportPadding = Number.isFinite(bounds.viewportPadding) ? bounds.viewportPadding : BETA_WINDOW_PADDING

    const width = Math.max(260, Number(frame.width) || 260)
    const height = Math.max(180, Number(frame.height) || 180)
    const nextX = hasFiniteValue(frame.x) ? Number(frame.x) : (minLeft ?? 0)
    const nextY = hasFiniteValue(frame.y) ? Number(frame.y) : (effectiveMinTop ?? 0)
    const maxX = viewportWidth
        ? (allowOverflowLeft
            ? viewportWidth - width - viewportPadding
            : Math.max(minLeft, viewportWidth - width - viewportPadding))
        : (allowOverflowLeft ? nextX : Math.max(minLeft, nextX))
    const maxY = viewportHeight
        ? (allowOverflowTop
            ? viewportHeight - height - viewportPadding
            : Math.max(minTop, viewportHeight - height - viewportPadding))
        : (allowOverflowTop ? nextY : Math.max(minTop, nextY))

    return {
        ...frame,
        x: allowOverflowLeft ? Math.min(nextX, maxX) : clamp(nextX, minLeft, maxX),
        y: allowOverflowTop ? Math.min(nextY, maxY) : clamp(nextY, minTop, maxY),
        width,
        height
    }
}

