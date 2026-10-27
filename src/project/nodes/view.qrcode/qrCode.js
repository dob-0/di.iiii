// QR Code, per ISO/IEC 18004, through `uqr` (MIT, pinned in package.json) —
// the same encoder as src/utils/qrCode.js. Pure: text in, a module grid out,
// then RGBA bytes — no three, no DOM, so the encoding can be decoded back in a test.
import { encode } from 'uqr'

export const QR_LEVELS = ['L', 'M', 'Q', 'H']
export const QR_DEFAULT_LEVEL = 'M'
// ISO/IEC 18004 asks for four light modules around the symbol.
export const QR_QUIET_ZONE = 4
// The longest side the picture is drawn at. Modules stay whole pixels.
export const QR_MAX_PIXELS = 1024

export const normaliseLevel = (level) => {
    const upper = String(level ?? '').trim().toUpperCase()
    return QR_LEVELS.includes(upper) ? upper : QR_DEFAULT_LEVEL
}

/** text -> { size, dark: Uint8Array(size * size), row-major from the top }
 * or null when there is nothing to encode or it does not fit version 40. */
export const encodeQr = (text, level = QR_DEFAULT_LEVEL) => {
    const value = String(text ?? '')
    if (!value) return null
    let grid
    try {
        // border 0: rasterQr draws the quiet zone. boostEcc off: the level asked for is the level used.
        grid = encode(value, { ecc: normaliseLevel(level), border: 0, boostEcc: false }).data
    } catch {
        // Longer than version 40 holds at this level (2953 bytes at L, fewer at H).
        return null
    }
    const size = grid.length
    const dark = new Uint8Array(size * size)
    for (let row = 0; row < size; row += 1) {
        for (let col = 0; col < size; col += 1) dark[row * size + col] = grid[row][col] ? 1 : 0
    }
    return { size, dark }
}

/** grid -> square RGBA bytes, dark modules black on white, with the quiet
 * zone. `bottomUp` writes the last row first, which is how a DataTexture
 * lays rows out (v = 0 at the bottom), so the code stands upright on a plane. */
export const rasterQr = (grid, { quiet = QR_QUIET_ZONE, maxPixels = QR_MAX_PIXELS, bottomUp = false } = {}) => {
    if (!grid) return null
    const span = grid.size + quiet * 2
    const scale = Math.max(1, Math.floor(maxPixels / span))
    const width = span * scale
    const data = new Uint8Array(width * width * 4).fill(255)
    for (let row = 0; row < grid.size; row += 1) {
        for (let col = 0; col < grid.size; col += 1) {
            if (!grid.dark[row * grid.size + col]) continue
            for (let dy = 0; dy < scale; dy += 1) {
                const y = (row + quiet) * scale + dy
                const line = bottomUp ? width - 1 - y : y
                for (let dx = 0; dx < scale; dx += 1) {
                    const i = (line * width + (col + quiet) * scale + dx) * 4
                    data[i] = 0
                    data[i + 1] = 0
                    data[i + 2] = 0
                }
            }
        }
    }
    return { width, height: width, scale, data }
}
