// Pure colour arithmetic shared by the colour operators. Hex in, hex out —
// the colour wire carries '#rrggbb' strings; channels travel 0..1.
export const hexToRgb = (value, fallback = [0, 0, 0]) => {
    if (typeof value !== 'string') return fallback
    const m = value.trim().match(/^#?([0-9a-f]{6})$/i)
    if (!m) return fallback
    const n = parseInt(m[1], 16)
    return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]
}

export const rgbToHex = (r, g, b) => {
    const byte = (v) => Math.round(Math.min(1, Math.max(0, Number(v) || 0)) * 255)
    return '#' + [byte(r), byte(g), byte(b)].map((v) => v.toString(16).padStart(2, '0')).join('')
}

export const rgbToHsl = ([r, g, b]) => {
    const max = Math.max(r, g, b)
    const min = Math.min(r, g, b)
    const l = (max + min) / 2
    if (max === min) return [0, 0, l]
    const d = max - min
    const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    let h
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6
    else if (max === g) h = ((b - r) / d + 2) / 6
    else h = ((r - g) / d + 4) / 6
    return [h, s, l]
}

export const lerpHex = (a, b, t) => {
    const ca = hexToRgb(a)
    const cb = hexToRgb(b)
    const k = Math.min(1, Math.max(0, t))
    return rgbToHex(ca[0] + (cb[0] - ca[0]) * k, ca[1] + (cb[1] - ca[1]) * k, ca[2] + (cb[2] - ca[2]) * k)
}
