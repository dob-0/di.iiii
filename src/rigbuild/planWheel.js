// The plot's wheel, from any device. Pure, so each device is testable without a plan on screen.
//
// A 2D plan follows the 2D editors of Blender's manual ("Navigation" — Ctrl + wheel zooms, wheel scrolls in
// the editors that scroll) and the touchpad's own meaning: a pinch arrives as a wheel with ctrlKey (Chromium,
// Firefox) and zooms; a two-finger scroll arrives as pixel deltas on both axes and pans; a mouse notch keeps
// what the plot always did, zoom to the pointer. A browser does not say which device sent a wheel, so the
// tell is the event itself: only a sideways part (deltaX ≠ 0) marks a touchpad. A fraction of a pixel is NOT
// a tell: Chromium divides a mouse notch by the screen's scale (100 px arrives as 66.67 at 150 %, measured over
// CDP in review of #1070) and a macOS accelerated wheel sends 4.000244…, and both must zoom as they do on dev.
// One gesture keeps one meaning while its events keep coming (a touchpad's scroll is not cut into zoom and pan
// halfway), but a sideways part always pans: deltaX is never dropped. Limit: a touchpad scroll that is purely
// vertical from its first event reads as a mouse and zooms, which is what dev does today (UNVERIFIED on a
// real touchpad).

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
        const looksLikeTouchpad = (e.deltaMode || 0) === 0 && dx !== 0
        const mode = looksLikeTouchpad || (going && last.mode === 'pan') ? 'pan' : 'zoom'
        last = { mode, at: now }
        if (mode === 'pan') return { zoom: 1, pan: [dx, dy] }
        return { zoom: Math.exp(-dy * PLAN_WHEEL_ZOOM), pan: null }
    }
}
