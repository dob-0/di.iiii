// Steady: take the hand shake out of a camera picture (a handheld camera into the deck).
//
// Each new frame is drawn down to a small grey picture (STEADY_W x STEADY_H) and compared with the frame
// before: the whole-picture shift that makes them match best is how far the picture jumped. The jumps add up
// to the camera's PATH; a slow follower of that path is where the camera is MEANT to look (a pan is kept, a
// shake is not). The picture is moved by the difference and zoomed in a little, so its moving edge stays out
// of sight. Translation only: no roll, no zoom (the cheap part that takes most of a hand shake out).
//
// Everything here is plain numbers (no GL), so it is tested on made-up pictures in steadyMotion.test.js.

export const STEADY_W = 128
export const STEADY_H = 72
// Search reach in small-picture pixels, each way: 10 of 128 = about 8 % of the frame per frame.
export const STEADY_RANGE = 10

/** RGBA bytes (as readPixels gives them) -> grey 0..1, with the picture's own mean taken out. */
export const greyOf = (rgba, width = STEADY_W, height = STEADY_H) => {
    const count = width * height
    const grey = new Float32Array(count)
    let sum = 0
    for (let i = 0, p = 0; i < count; i += 1, p += 4) {
        const v = (rgba[p] * 0.299 + rgba[p + 1] * 0.587 + rgba[p + 2] * 0.114) / 255
        grey[i] = v
        sum += v
    }
    // Mean out: a light change (a strobe, a colour wash) moves every pixel the same way and is not a shift.
    const mean = sum / count
    let spread = 0
    for (let i = 0; i < count; i += 1) { grey[i] -= mean; spread += Math.abs(grey[i]) }
    return { grey, spread: spread / count }
}

/**
 * How far `cur` moved against `prev` (both from greyOf), in small-picture pixels: content at x in prev is at
 * x + dx in cur. Sum of absolute differences over the middle of the picture (every 2nd pixel), every whole
 * shift within `range`, then a parabola through the best one and its neighbours for the part between pixels.
 * `sure` is 0..1: 0 = no clear best (a flat or new picture), so the shift should not be trusted.
 */
// Mean absolute difference of prev against cur moved by (dx, dy), over the middle `edge` pixels in from each
// side, every `step`-th pixel.
const sadAt = (prev, cur, width, height, dx, dy, edge, step) => {
    let sad = 0
    let n = 0
    for (let y = edge; y < height - edge; y += step) {
        const row = y * width
        const rowCur = (y + dy) * width + dx
        for (let x = edge; x < width - edge; x += step) {
            sad += Math.abs(prev[row + x] - cur[rowCur + x])
            n += 1
        }
    }
    return sad / n
}
const halfOf = (grey, width, height) => {
    const w = width >> 1
    const h = height >> 1
    const out = new Float32Array(w * h)
    for (let y = 0; y < h; y += 1) {
        for (let x = 0; x < w; x += 1) {
            const p = 2 * y * width + 2 * x
            out[y * w + x] = (grey[p] + grey[p + 1] + grey[p + width] + grey[p + width + 1]) * 0.25
        }
    }
    return out
}

export const shiftBetween = (prev, cur, width = STEADY_W, height = STEADY_H, range = STEADY_RANGE) => {
    // Coarse first: every shift within reach on the half-size picture (a quarter of the pixels, a quarter
    // of the shifts), then the full-size picture only around the best of those.
    const hw = width >> 1
    const hh = height >> 1
    const hr = Math.ceil(range / 2)
    const hp = halfOf(prev, width, height)
    const hc = halfOf(cur, width, height)
    let coarse = Infinity
    let cx = 0
    let cy = 0
    let total = 0
    let count = 0
    for (let dy = -hr; dy <= hr; dy += 1) {
        for (let dx = -hr; dx <= hr; dx += 1) {
            const c = sadAt(hp, hc, hw, hh, dx, dy, hr, 1)
            total += c
            count += 1
            if (c < coarse) { coarse = c; cx = dx; cy = dy }
        }
    }
    const span = 5
    const cost = new Float64Array(span * span)
    let best = Infinity
    let bx = 0
    let by = 0
    for (let oy = -2; oy <= 2; oy += 1) {
        for (let ox = -2; ox <= 2; ox += 1) {
            const dx = Math.max(-range, Math.min(range, 2 * cx + ox))
            const dy = Math.max(-range, Math.min(range, 2 * cy + oy))
            const c = sadAt(prev, cur, width, height, dx, dy, range, 2)
            cost[(oy + 2) * span + (ox + 2)] = c
            if (c < best) { best = c; bx = ox; by = oy }
        }
    }
    const at = (ox, oy) => cost[(oy + 2) * span + (ox + 2)]
    const part = (minus, mid, plus) => {
        const curve = minus - 2 * mid + plus
        return curve > 1e-9 ? Math.max(-0.5, Math.min(0.5, 0.5 * (minus - plus) / curve)) : 0
    }
    const fx = bx > -2 && bx < 2 ? part(at(bx - 1, by), best, at(bx + 1, by)) : 0
    const fy = by > -2 && by < 2 ? part(at(bx, by - 1), best, at(bx, by + 1)) : 0
    const mean = total / count
    // A clear valley: the best coarse match much better than the average shift. Flat pictures have none.
    const sure = mean > 1e-6 ? Math.max(0, Math.min(1, (1 - coarse / mean) * 2)) : 0
    const dx = Math.max(-range, Math.min(range, 2 * cx + bx)) + fx
    const dy = Math.max(-range, Math.min(range, 2 * cy + by)) + fy
    return { dx, dy, sure, best, mean }
}

const sameGrey = (a, b) => {
    if (a.length !== b.length) return false
    for (let i = 0; i < a.length; i += 1) if (a[i] !== b[i]) return false
    return true
}

/** A fresh follower state (one per Steady effect). */
export const steadyState = () => ({ prev: null, lastTime: null, offsetX: 0, offsetY: 0 })

/**
 * One new frame. Returns the offset (in picture units, 0..1 of the frame) the shader adds to where it reads:
 * the picture is pulled back by the shake. `params`: smooth 0..1 (how slowly the follower catches up with the
 * real path: more = steadier, pans lag more), zoom >= 1 (how much is cropped: the offset can never be more
 * than the crop hides), reach 0..1 (the largest offset allowed, as a share of the frame).
 */
export const steadyStep = (state, frame, params, now) => {
    const { grey, spread } = frame
    const prev = state.prev
    // The same picture again (the engine draws faster than the camera sends): nothing moved, the offset
    // holds, and no search is spent on it.
    if (prev && sameGrey(prev, grey)) return [state.offsetX, state.offsetY]
    state.prev = grey
    const dt = state.lastTime === null ? 0 : Math.max(0, Math.min(0.25, (now - state.lastTime) / 1000))
    state.lastTime = now
    if (!prev) return [state.offsetX, state.offsetY]
    const zoom = Math.max(1, Number(params.zoom) || 1)
    const margin = Math.min(0.5 - 0.5 / zoom, Math.max(0, Number(params.reach) || 0))
    const motion = shiftBetween(prev, grey)
    // The offset is the camera path minus its slow follower. The follower is an exponential lag of the
    // path, so the difference is a leak: each frame it takes the new jump and lets go of a share of what
    // it holds (smooth 0 = 0.1 s, barely steadied; 1 = 2.1 s). A pan leaks away (kept); a shake, back
    // and forth faster than the leak, is held and undone. Never further than the crop hides: at the
    // limit a long pan drags the picture along instead of sticking at the edge.
    const tau = 0.1 + Math.max(0, Math.min(1, Number(params.smooth) || 0)) * 2
    const keep = dt > 0 ? Math.exp(-dt / tau) : 1
    // A cut (the ATEM switched input), a dark stage, a picture with nothing to hold on to: no jump is
    // trusted, and the picture drifts back to the middle at the same slow pace (never snaps: a snap
    // is a visible jump on the wall).
    const trust = spread >= 0.01 && motion.sure >= 0.15
    const jumpX = trust ? motion.dx / STEADY_W : 0
    const jumpY = trust ? motion.dy / STEADY_H : 0
    const clamp = (v) => Math.max(-margin, Math.min(margin, v))
    state.offsetX = clamp((state.offsetX + jumpX) * keep)
    state.offsetY = clamp((state.offsetY + jumpY) * keep)
    return [state.offsetX, state.offsetY]
}
