// Laser Text: a string -> single-stroke laser paths (frame v2) in Hershey Roman Simplex (A. V. Hershey,
// U.S. National Bureau of Standards, 1967; the glyph data and its required acknowledgements are in
// hersheyRomanSimplex.js). Laser Phase 9, design 2026-10-14 §5. Pure.
import { FRAME_VERSION } from '../../../shared/laserFrame.js'
import { capPaths } from '../laser.file/capPaths.js'
import { FIRST_CODE, GLYPHS, LAST_CODE } from './hersheyRomanSimplex.js'

// Roman Simplex units: a capital runs from y -12 (its top) to 9 (the baseline), so 21 units tall
// (read from 'A', glyph 501: "RF" to "J[" / "Z[", F = -12, [ = 9).
export const CAP_TOP = -12
export const BASELINE = 9
export const CAP_HEIGHT = BASELINE - CAP_TOP
// Baseline to baseline, in the same units. UNVALIDATED: the common Hershey practice, not from the 1967 report.
export const LINE_ADVANCE = 32
// Text never reaches the field's edge: past 95 % of it the size is brought down, and the status says so.
const MARGIN = 0.95
const R = 'R'.charCodeAt(0)

const hexToRgb = (hex) => {
    const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(hex || '').trim())
    if (!m) return null
    const h = m[1].length === 3 ? m[1].split('').map((c) => c + c).join('') : m[1]
    return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255)
}

/** A glyph by char code -> { number, left, right, strokes: [[[x, y], …], …] } in Hershey units, or null. Pure. */
export const glyphFor = (code) => {
    if (code < FIRST_CODE || code > LAST_CODE) return null
    const [number, body] = GLYPHS[code - FIRST_CODE]
    const left = body.charCodeAt(0) - R
    const right = body.charCodeAt(1) - R
    const strokes = []
    let stroke = []
    for (let i = 2; i < body.length; i += 2) {
        if (body[i] === ' ' && body[i + 1] === 'R') { if (stroke.length) strokes.push(stroke); stroke = []; continue }
        stroke.push([body.charCodeAt(i) - R, body.charCodeAt(i + 1) - R])
    }
    if (stroke.length) strokes.push(stroke)
    return { number, left, right, strokes }
}

/**
 * Text -> { frame, stats }. `size` is a capital's height in field units (the field is 2 tall); lines are
 * centred on x = 0 and the block's middle sits at `height`. A character outside ASCII 32-126 is drawn
 * as '?' and counted (stats.missing); a tab is a space. If the text would pass 95 % of the field the size
 * is brought down to fit and stats.fitted is true — never clipped. Pure.
 */
export const layoutText = (textIn, { size = 0.2, height = 0.5, colour = '#00ff40', level = 1, max } = {}) => {
    const text = String(textIn ?? '').replace(/\t/g, ' ').replace(/\r\n?/g, '\n')
    const lines = text.split('\n')
    let missing = 0
    const laid = lines.map((line) => {
        const glyphs = []
        let width = 0
        for (const ch of line) {
            let g = glyphFor(ch.codePointAt(0))
            if (!g) { missing += 1; g = glyphFor(63) }
            glyphs.push({ g, at: width })
            width += g.right - g.left
        }
        return { glyphs, width }
    })
    const widest = laid.reduce((m, l) => Math.max(m, l.width), 0)
    const blockHeight = CAP_HEIGHT + (lines.length - 1) * LINE_ADVANCE
    let k = (Number.isFinite(size) && size > 0 ? size : 0.2) / CAP_HEIGHT
    const dy = Math.max(-MARGIN, Math.min(MARGIN, Number.isFinite(height) ? height : 0.5))
    // Hershey y runs down; the block's middle (in Hershey units, from the first line's cap top) goes to dy.
    const mid = CAP_TOP + blockHeight / 2
    // Every stroke must land inside 95 % of the field: x from the glyphs' bounds, y from the strokes
    // themselves (descenders and brackets pass the cap height).
    let top = mid; let bottom = mid
    laid.forEach((line, row) => {
        for (const { g: glyph } of line.glyphs) for (const stroke of glyph.strokes) for (const [, y] of stroke) {
            const Y = row * LINE_ADVANCE + y
            if (Y < top) top = Y
            if (Y > bottom) bottom = Y
        }
    })
    const limits = [widest > 0 ? (2 * MARGIN) / widest : Infinity]
    if (mid > top) limits.push((MARGIN - dy) / (mid - top))
    if (bottom > mid) limits.push((MARGIN + dy) / (bottom - mid))
    const kFit = Math.min(...limits)
    const fitted = k > kFit
    if (fitted) k = kFit
    const rgb = hexToRgb(colour) || [0, 1, 64 / 255]
    const lv = Number.isFinite(level) ? Math.max(0, Math.min(1, level)) : 1
    const [r, g, b] = rgb.map((c) => c * lv)
    const paths = []
    laid.forEach((line, row) => {
        const x0 = -line.width / 2
        const y0 = row * LINE_ADVANCE
        for (const { g: glyph, at } of line.glyphs) {
            for (const stroke of glyph.strokes) {
                const p = []
                for (const [x, y] of stroke) p.push((x0 + at + x - glyph.left) * k, -(y0 + y - mid) * k + dy, r, g, b)
                paths.push({ p, closed: false })
            }
        }
    })
    const capped = capPaths(paths, max)
    const points = capped.paths.reduce((s, p) => s + p.p.length / 5, 0)
    return {
        frame: { kind: 'laser', v: FRAME_VERSION, paths: capped.paths, order: 'free' },
        stats: { paths: capped.paths.length, points, missing, fitted, size: k * CAP_HEIGHT, cutPoints: capped.cutPoints, cutPaths: capped.cutPaths },
    }
}
