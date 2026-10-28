// Pointer → value for the thumb controls (Slider, Pad). Pure, so the
// mapping is tested without a layout engine: rect is a DOMRect-shaped
// { left, top, width, height }, the point is a client x/y.

const clamp = (value, lo, hi) => Math.min(hi, Math.max(lo, value))

export const sliderRange = (min, max) => {
    const a = Number.isFinite(Number(min)) ? Number(min) : 0
    const b = Number.isFinite(Number(max)) ? Number(max) : 1
    return [Math.min(a, b), Math.max(a, b)]
}

// Vertical: the top edge is Max, the bottom Min (a fader). Horizontal: the
// left edge is Min, the right Max. A zero-sized rect answers Min.
export const sliderValueAt = (rect, clientX, clientY, { min = 0, max = 1, vertical = true } = {}) => {
    const [lo, hi] = sliderRange(min, max)
    const span = vertical ? rect.height : rect.width
    if (!(span > 0)) return lo
    const fraction = vertical
        ? 1 - (clientY - rect.top) / span
        : (clientX - rect.left) / span
    return lo + clamp(fraction, 0, 1) * (hi - lo)
}

export const sliderFraction = (value, min, max) => {
    const [lo, hi] = sliderRange(min, max)
    if (hi === lo) return 0
    return clamp((Number(value) - lo) / (hi - lo), 0, 1) || 0
}

// The pad's centre is 0,0; right and up are positive; each axis is held
// inside -1..1 (a finger dragged past the edge pins to it).
export const padPointAt = (rect, clientX, clientY) => {
    if (!(rect.width > 0) || !(rect.height > 0)) return { x: 0, y: 0 }
    const x = ((clientX - rect.left) / rect.width) * 2 - 1
    const y = 1 - ((clientY - rect.top) / rect.height) * 2
    return { x: clamp(x, -1, 1), y: clamp(y, -1, 1) }
}

export const formatControlNumber = (value) => {
    const number = Number(value) || 0
    return Math.abs(number) >= 100 ? number.toFixed(0) : number.toFixed(2)
}
