// A stroke font, not an outline font.
//
// Every glyph here is a set of polylines through a 1.0-tall em box (y=0 is the
// baseline, y=1 the cap height). Nothing is a filled shape. That is the whole
// point: a marker letter IS a stroke, so drawing the centre line and giving it
// thickness at render time reproduces the reference posters far better than
// extruding a typeface would — and it lets the same data drive two renderers,
// flat SVG for headings and swept tubes for the 3D hero.
//
// Coordinates are deliberately imprecise. Straight lines that are slightly not
// straight are what stops the result reading as a font.

export const CAP_HEIGHT = 1
export const SPACE_ADVANCE = 0.34
const GAP = 0.18

// Strokes per glyph. Advance width is derived: rightmost x + GAP.
const GLYPHS = {
    A: [[[0, 0], [0.17, 0.52], [0.3, 1], [0.44, 0.52], [0.6, 0]], [[0.13, 0.4], [0.47, 0.4]]],
    B: [[[0.02, 0], [0, 1]], [[0, 1], [0.32, 0.97], [0.44, 0.78], [0.4, 0.6], [0.02, 0.53]], [[0.02, 0.53], [0.46, 0.45], [0.52, 0.22], [0.34, 0.02], [0.02, 0]]],
    C: [[[0.55, 0.84], [0.42, 0.97], [0.22, 1], [0.06, 0.78], [0.04, 0.4], [0.14, 0.08], [0.36, 0], [0.56, 0.14]]],
    D: [[[0.02, 0], [0, 1], [0.28, 0.98], [0.52, 0.74], [0.54, 0.32], [0.32, 0.03], [0.02, 0]]],
    E: [[[0.5, 1], [0.02, 0.98], [0, 0], [0.52, 0.02]], [[0.01, 0.51], [0.38, 0.49]]],
    F: [[[0.5, 1], [0.02, 0.98], [0, 0]], [[0.01, 0.55], [0.38, 0.53]]],
    G: [[[0.55, 0.84], [0.42, 0.97], [0.22, 1], [0.06, 0.78], [0.04, 0.4], [0.14, 0.08], [0.36, 0], [0.55, 0.16], [0.56, 0.44], [0.33, 0.45]]],
    H: [[[0.01, 1], [0, 0]], [[0.5, 0.98], [0.51, 0]], [[0.01, 0.52], [0.5, 0.5]]],
    I: [[[0.14, 1], [0.12, 0]]],
    J: [[[0.46, 1], [0.44, 0.22], [0.28, 0.01], [0.06, 0.14]]],
    K: [[[0.01, 1], [0, 0]], [[0.5, 1], [0.02, 0.44]], [[0.16, 0.56], [0.52, 0]]],
    L: [[[0.02, 1], [0, 0], [0.46, 0.03]]],
    M: [[[0, 0], [0.04, 1], [0.31, 0.34], [0.58, 1], [0.62, 0]]],
    N: [[[0, 0], [0.03, 1], [0.49, 0.06], [0.52, 1]]],
    O: [[[0.3, 1], [0.08, 0.86], [0.03, 0.5], [0.09, 0.14], [0.3, 0], [0.52, 0.14], [0.57, 0.5], [0.52, 0.86], [0.3, 1]]],
    P: [[[0.02, 0], [0, 1], [0.36, 0.97], [0.47, 0.76], [0.42, 0.58], [0.01, 0.53]]],
    Q: [[[0.3, 1], [0.08, 0.86], [0.03, 0.5], [0.09, 0.14], [0.3, 0], [0.52, 0.14], [0.57, 0.5], [0.52, 0.86], [0.3, 1]], [[0.36, 0.28], [0.62, -0.06]]],
    R: [[[0.02, 0], [0, 1], [0.36, 0.97], [0.47, 0.76], [0.42, 0.58], [0.01, 0.53]], [[0.18, 0.55], [0.52, 0]]],
    S: [[[0.52, 0.86], [0.34, 0.99], [0.12, 0.94], [0.06, 0.74], [0.24, 0.58], [0.44, 0.47], [0.5, 0.24], [0.3, 0.01], [0.04, 0.13]]],
    T: [[[0, 1], [0.5, 0.98]], [[0.26, 1], [0.24, 0]]],
    U: [[[0.01, 1], [0, 0.26], [0.15, 0.03], [0.38, 0.02], [0.51, 0.24], [0.5, 1]]],
    V: [[[0, 1], [0.28, 0], [0.55, 1]]],
    W: [[[0, 1], [0.14, 0], [0.35, 0.62], [0.53, 0], [0.68, 1]]],
    X: [[[0, 1], [0.51, 0]], [[0.5, 1], [0.01, 0]]],
    Y: [[[0, 1], [0.27, 0.52], [0.55, 1]], [[0.27, 0.52], [0.26, 0]]],
    Z: [[[0, 1], [0.51, 0.98], [0.02, 0.02], [0.53, 0]]],

    0: [[[0.28, 1], [0.07, 0.84], [0.03, 0.5], [0.08, 0.14], [0.28, 0], [0.49, 0.15], [0.53, 0.5], [0.48, 0.85], [0.28, 1]]],
    1: [[[0.04, 0.8], [0.22, 1], [0.2, 0]]],
    2: [[[0.03, 0.84], [0.24, 1], [0.46, 0.86], [0.42, 0.6], [0.04, 0.02], [0.52, 0]]],
    3: [[[0.04, 0.88], [0.26, 1], [0.47, 0.84], [0.26, 0.56], [0.5, 0.32], [0.32, 0.01], [0.04, 0.11]]],
    4: [[[0.4, 0], [0.42, 1], [0.02, 0.29], [0.53, 0.31]]],
    5: [[[0.48, 1], [0.1, 0.98], [0.05, 0.55], [0.3, 0.63], [0.5, 0.42], [0.36, 0.03], [0.05, 0.12]]],
    6: [[[0.45, 0.94], [0.16, 0.78], [0.05, 0.34], [0.26, 0.01], [0.5, 0.18], [0.43, 0.45], [0.1, 0.41]]],
    7: [[[0, 1], [0.5, 0.98], [0.2, 0]]],
    8: [[[0.28, 0.54], [0.06, 0.72], [0.12, 0.95], [0.34, 0.99], [0.48, 0.78], [0.28, 0.54], [0.04, 0.32], [0.14, 0.03], [0.4, 0.03], [0.52, 0.28], [0.28, 0.54]]],
    9: [[[0.1, 0.06], [0.4, 0.24], [0.51, 0.68], [0.3, 1], [0.07, 0.82], [0.15, 0.56], [0.47, 0.6]]],

    '-': [[[0.04, 0.47], [0.42, 0.45]]],
    '+': [[[0.04, 0.5], [0.44, 0.48]], [[0.24, 0.7], [0.24, 0.28]]],
    '/': [[[0, -0.04], [0.36, 1]]],
    '.': [[[0.1, 0.03], [0.13, 0.02]]],
    ',': [[[0.15, 0.09], [0.06, -0.12]]],
    ':': [[[0.1, 0.62], [0.13, 0.61]], [[0.1, 0.05], [0.13, 0.04]]],
    '!': [[[0.13, 1], [0.11, 0.26]], [[0.11, 0.05], [0.13, 0.04]]],
    '?': [[[0.04, 0.83], [0.24, 1], [0.45, 0.83], [0.26, 0.52], [0.25, 0.32]], [[0.24, 0.06], [0.26, 0.05]]],
    "'": [[[0.11, 1], [0.06, 0.74]]],
    '(': [[[0.24, 1], [0.06, 0.66], [0.06, 0.32], [0.25, 0]]],
    ')': [[[0.04, 1], [0.22, 0.66], [0.22, 0.32], [0.03, 0]]],
    '€': [[[0.56, 0.84], [0.36, 0.99], [0.14, 0.78], [0.12, 0.24], [0.34, 0.01], [0.56, 0.14]], [[0, 0.62], [0.36, 0.6]], [[0, 0.4], [0.34, 0.38]]]
}

const advanceOf = (strokes) => {
    let max = 0
    for (const stroke of strokes) {
        for (const point of stroke) if (point[0] > max) max = point[0]
    }
    return max + GAP
}

export const GLYPH_TABLE = Object.fromEntries(
    Object.entries(GLYPHS).map(([char, strokes]) => [char, { strokes, advance: advanceOf(strokes) }])
)

export const hasGlyph = (char) => Object.hasOwn(GLYPH_TABLE, char)

// A string hashed to a seed, so a given word wobbles the SAME way on every
// render. Jitter re-rolled each frame reads as a broken shader, not as
// handwriting — handwriting is wrong once and then stays wrong.
const seedFrom = (text) => {
    let h = 2166136261
    for (let i = 0; i < text.length; i += 1) {
        h ^= text.charCodeAt(i)
        h = Math.imul(h, 16777619)
    }
    return h >>> 0
}

const makeRandom = (seed) => {
    let state = seed || 1
    return () => {
        state ^= state << 13
        state ^= state >>> 17
        state ^= state << 5
        state >>>= 0
        return state / 4294967296
    }
}

// Resamples a polyline so short strokes get as much wobble as long ones, then
// pushes every point off its ideal position. `jitter` is in em units.
const shakyStroke = (stroke, random, jitter) => {
    const dense = []
    for (let i = 0; i < stroke.length - 1; i += 1) {
        const [x1, y1] = stroke[i]
        const [x2, y2] = stroke[i + 1]
        const length = Math.hypot(x2 - x1, y2 - y1)
        const steps = Math.max(1, Math.round(length / 0.16))
        for (let s = 0; s < steps; s += 1) {
            const t = s / steps
            dense.push([x1 + (x2 - x1) * t, y1 + (y2 - y1) * t])
        }
    }
    dense.push(stroke[stroke.length - 1])

    return dense.map(([x, y], index) => {
        // Endpoints barely move — a marker lands where the hand aims, it is the
        // middle of the stroke that drifts.
        const edge = index === 0 || index === dense.length - 1 ? 0.25 : 1
        return [
            x + (random() - 0.5) * jitter * edge,
            y + (random() - 0.5) * jitter * edge
        ]
    })
}

/**
 * Lays a string out into wobbled strokes in em units, y-up, starting at x=0.
 *
 * `strokes` is every stroke in the string, flat — what a single-colour renderer
 * wants. `glyphs` keeps them grouped per letter, which is what a renderer
 * colouring letter by letter needs; the two share the same stroke arrays.
 *
 * @returns {{ strokes: number[][][], glyphs: { char: string, strokes: number[][][] }[], width: number }}
 */
export const layoutText = (text, options = {}) => {
    const { jitter = 0.035, tilt = 0.02 } = options
    const upper = String(text || '').toUpperCase()
    const random = makeRandom(seedFrom(upper))
    const strokes = []
    const glyphs = []
    let cursor = 0

    for (const char of upper) {
        const glyph = GLYPH_TABLE[char]
        if (!glyph) {
            cursor += SPACE_ADVANCE
            continue
        }

        // Per-letter rotation, scale and baseline drift. Hand lettering does
        // not sit on a baseline, it sits near one.
        const angle = (random() - 0.5) * tilt * 2 * Math.PI
        const sin = Math.sin(angle)
        const cos = Math.cos(angle)
        const dropY = (random() - 0.5) * 0.06
        const scale = 1 + (random() - 0.5) * 0.08
        const pivotX = glyph.advance / 2
        const pivotY = 0.5

        const placed = []
        for (const stroke of glyph.strokes) {
            const shaken = shakyStroke(stroke, random, jitter)
            placed.push(shaken.map(([x, y]) => {
                const dx = (x - pivotX) * scale
                const dy = (y - pivotY) * scale
                return [
                    cursor + pivotX + dx * cos - dy * sin,
                    pivotY + dx * sin + dy * cos + dropY
                ]
            }))
        }

        glyphs.push({ char, strokes: placed })
        strokes.push(...placed)
        cursor += glyph.advance * scale
    }

    return { strokes, glyphs, width: Math.max(cursor - GAP, 0.001) }
}
