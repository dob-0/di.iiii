// LUMA — how bright a rendered frame reads, as numbers, so "too dark" is a
// measurement and not an impression (docs/architecture/RIG_BUILD.md §18).
//
// Luma Y' = 0.2126 R' + 0.7152 G' + 0.0722 B' on the frame's own 8-bit sRGB-encoded
// values (ITU-R BT.709-6, item 3.2 — the weights applied to gamma-encoded
// components, i.e. luma, not relative luminance). The same formula is used on
// reference photographs, so a render and a photo are compared on one scale.
//
// The crop: rows from `top` to `bottom` of the height (default 20 %–90 %), which
// drops the page chrome at the top (the version row, the show chip) and the bottom
// strip, where a room shows its floor and nothing of the light.
//
// Pure: takes a raw pixel buffer, no image library, no browser.

/** Luma statistics of a raw interleaved pixel buffer (3 or 4 channels, 8 bit). */
export const lumaStats = (data, width, height, channels = 4, { top = 0.2, bottom = 0.9 } = {}) => {
    if (!data || !(width > 0) || !(height > 0)) throw new Error('lumaStats needs pixels')
    const y0 = Math.max(0, Math.floor(height * top))
    const y1 = Math.min(height, Math.ceil(height * bottom))
    const hist = new Uint32Array(256)
    let sum = 0
    let n = 0
    for (let y = y0; y < y1; y += 1) {
        let i = y * width * channels
        for (let x = 0; x < width; x += 1, i += channels) {
            const v = Math.round(0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2])
            hist[v] += 1
            sum += v
            n += 1
        }
    }
    if (!n) throw new Error('empty crop')
    const pct = (p) => {
        const want = p * (n - 1)
        let seen = 0
        for (let v = 0; v < 256; v += 1) {
            seen += hist[v]
            if (seen > want) return v
        }
        return 255
    }
    let max = 0
    for (let v = 255; v >= 0; v -= 1) if (hist[v]) { max = v; break }
    let below16 = 0
    let above200 = 0
    for (let v = 0; v < 16; v += 1) below16 += hist[v]
    for (let v = 201; v < 256; v += 1) above200 += hist[v]
    const r = (v, k = 10) => Math.round(v * k) / k
    return {
        mean: r(sum / n),
        median: pct(0.5),
        p10: pct(0.1),
        p90: pct(0.9),
        p99: pct(0.99),
        max,
        // "black between the beams": the share of the crop a viewer reads as black.
        black: r(below16 / n, 1000),
        // "beam cores": the share at or near clipping.
        bright: r(above200 / n, 1000),
        pixels: n
    }
}
