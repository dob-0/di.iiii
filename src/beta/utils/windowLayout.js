export const BETA_WINDOW_PADDING = 12
export const DEFAULT_BETA_WORKSPACE_TOP = 168

const clamp = (value, min, max) => Math.min(Math.max(value, min), max)

export function getWorkspaceTopInset({ topbarRect = null, padding = 16 } = {}) {
    const bottom = Math.max(0, Number(topbarRect?.bottom) || 0)
    return Math.max(DEFAULT_BETA_WORKSPACE_TOP, bottom + padding)
}

export function clampWindowFrame(frame = {}, bounds = {}) {
    const minTop = Number.isFinite(bounds.minTop) ? bounds.minTop : DEFAULT_BETA_WORKSPACE_TOP
    const minLeft = Number.isFinite(bounds.minLeft) ? bounds.minLeft : BETA_WINDOW_PADDING
    const viewportWidth = Number.isFinite(bounds.viewportWidth) ? bounds.viewportWidth : null
    const viewportHeight = Number.isFinite(bounds.viewportHeight) ? bounds.viewportHeight : null
    const viewportPadding = Number.isFinite(bounds.viewportPadding) ? bounds.viewportPadding : BETA_WINDOW_PADDING

    const width = Math.max(260, Number(frame.width) || 260)
    const height = Math.max(180, Number(frame.height) || 180)
    const maxX = viewportWidth
        ? Math.max(minLeft, viewportWidth - width - viewportPadding)
        : Math.max(minLeft, Number(frame.x) || minLeft)
    const maxY = viewportHeight
        ? Math.max(minTop, viewportHeight - height - viewportPadding)
        : Math.max(minTop, Number(frame.y) || minTop)

    return {
        ...frame,
        x: clamp(Number(frame.x) || minLeft, minLeft, maxX),
        y: clamp(Number(frame.y) || minTop, minTop, maxY),
        width,
        height
    }
}

export function getWorkspaceAdjustmentOps(windows = [], minTop = DEFAULT_BETA_WORKSPACE_TOP) {
    return windows
        .filter((windowState) => windowState?.visible && Number(windowState.y) < minTop)
        .map((windowState) => ({
            windowId: windowState.id,
            patch: {
                y: minTop
            }
        }))
}
