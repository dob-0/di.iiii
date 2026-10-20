// The plot's wheel, from any device. Pure, so each device is testable without a plan on screen.
//
// A 2D plan follows the 2D editors of Blender's manual ("Navigation" — Ctrl + wheel zooms, wheel scrolls in
// the editors that scroll) and the touchpad's own meaning: a pinch arrives as a wheel with ctrlKey (Chromium,
// Firefox) and zooms; a two-finger scroll arrives as pixel deltas on both axes and pans; a mouse notch keeps
// what the plot always did, zoom to the pointer. A browser does not say which device sent a wheel, so the
// tell is the event itself: a sideways part (deltaX ≠ 0) or a fraction of a pixel comes from a touchpad, a
// whole-pixel vertical step or a line-mode wheel from a mouse. One gesture keeps one meaning while its events
// keep coming (a touchpad's scroll is not cut into zoom and pan halfway), but a sideways part always pans:
// deltaX is never dropped. Limit: a touchpad scroll that is perfectly vertical in whole pixels from its first
// event reads as a mouse and zooms (seen nowhere yet; UNVERIFIED on a real touchpad).

export const PLAN_GESTURE_GAP_MS = 180
export const PLAN_WHEEL_ZOOM = 0.0015
export const PLAN_PINCH_ZOOM = 0.01

const modeScale = (e) => (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 100 : 1)

/** Returns (event, now) => { zoom, pan }: a zoom factor (1 = none) about the pointer, or a pan in screen px. */
export const createPlanWheel = () => {
    let last = { mode: null, at: -Infinity }
    return (e, now = 0) => {
        const s = modeScale(e)
        const dx = (Number(e.deltaX) || 0) * s
        const dy = (Number(e.deltaY) || 0) * s
        if (e.ctrlKey) {
            last = { mode: 'pinch', at: now }
            return { zoom: Math.exp(-dy * PLAN_PINCH_ZOOM), pan: null }
        }
        const going = now - last.at < PLAN_GESTURE_GAP_MS && last.mode !== 'pinch'
        const looksLikeTouchpad = (e.deltaMode || 0) === 0 && (dx !== 0 || !Number.isInteger(dy))
        const mode = looksLikeTouchpad || (going && last.mode === 'pan') ? 'pan' : 'zoom'
        last = { mode, at: now }
        if (mode === 'pan') return { zoom: 1, pan: [dx, dy] }
        return { zoom: Math.exp(-dy * PLAN_WHEEL_ZOOM), pan: null }
    }
}
