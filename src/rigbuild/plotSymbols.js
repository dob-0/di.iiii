// THE PLOT'S SYMBOLS — one outline per fixture TYPE, the key that reads them, and
// the notation beside each lamp. docs/architecture/RIG_BUILD.md §10.
//
// USITT RP-2 (2006) asks that each instrument type have its own symbol, drawn at the
// hanging point, with an instrument key on the sheet; it leaves automated fixtures
// and effects to the designer's key. The outlines here are our own drawings in that
// practice (none of the RP-2 artwork is copied) and follow sketch B: a circle for a
// beam, a square for a spot, a hexagon for a bee-eye, a small solid bar for a PAR,
// a triangle for an effect, a diamond for a laser. A type not listed gets the next
// free outline in a fixed order, so two types never share one.
//
// Ink only. Colour is used in exactly one place: a lamp whose own light colour is
// not white gets a small swatch at its symbol (the "colour" RP-2 notes beside the
// lens), because there the colour is information.

export const SHAPES = ['circle', 'square', 'hexagon', 'bar', 'triangle', 'diamond', 'pentagon', 'octagon', 'cross']

const BY_CATEGORY = {
    'moving-head': 'circle', par: 'bar', laser: 'diamond', 'co2-jet': 'triangle',
    'spark-machine': 'triangle', 'smoke-machine': 'triangle', hazer: 'triangle', 'fog-machine': 'triangle', effect: 'triangle'
}

// The MOXIR types as the sketch drew them; everything else by category, then by order.
const BY_TYPE = { 'up-b380f': 'circle', 'up-250bsw': 'square', 'up-hk1915': 'hexagon', 'up-pl5403': 'bar' }

// Effects share the triangle and are told apart by a letter inside it.
const LETTER = { 'co2-jet': 'C', 'spark-machine': 'S', 'smoke-machine': 'Z', hazer: 'H', 'fog-machine': 'F', effect: 'E', laser: 'L' }

// A box on the floor with no beam: an effect. One list for the plot, the hand (hotbar)
// and a new lamp (plotEdits): the hazer (RIG_BUILD.md §13) joined the first three.
export const EFFECT_CATEGORIES = new Set(['co2-jet', 'spark-machine', 'smoke-machine', 'hazer', 'fog-machine', 'effect'])
export const isEffectType = (type) => EFFECT_CATEGORIES.has(type?.category)

/**
 * A shape (and a letter) for every type in a library: stable, never two moving
 * heads on one outline.
 * @returns {Map<string, {shape: string, letter: string}>}
 */
export const symbolTable = (types = []) => {
    const table = new Map()
    const used = new Set()
    const claim = (id, shape, letter = '') => { table.set(id, { shape, letter }); if (!letter) used.add(shape) }
    for (const t of types) if (BY_TYPE[t.id]) claim(t.id, BY_TYPE[t.id])
    for (const t of types) {
        if (table.has(t.id)) continue
        if (LETTER[t.category]) { claim(t.id, BY_CATEGORY[t.category], LETTER[t.category]); continue }
        const wanted = BY_CATEGORY[t.category]
        const shape = wanted && !used.has(wanted) ? wanted : SHAPES.find((s) => !used.has(s) && s !== 'triangle') || 'circle'
        claim(t.id, shape)
    }
    return table
}

const poly = (cx, cy, r, n, rot = -Math.PI / 2) => {
    const pts = []
    for (let i = 0; i < n; i++) {
        const a = rot + (i * 2 * Math.PI) / n
        pts.push(`${(cx + r * Math.cos(a)).toFixed(4)},${(cy + r * Math.sin(a)).toFixed(4)}`)
    }
    return `M${pts.join('L')}Z`
}

/**
 * An SVG path for a shape centred at (cx, cy), `r` its half-size.
 * `bar` is the only filled outline (the sketch's small solid PAR).
 */
export const shapePath = (shape, cx, cy, r) => {
    const f = (v) => v.toFixed(4)
    switch (shape) {
        case 'circle': return `M${f(cx - r)},${f(cy)}a${f(r)},${f(r)} 0 1,0 ${f(2 * r)},0a${f(r)},${f(r)} 0 1,0 ${f(-2 * r)},0Z`
        case 'square': return `M${f(cx - r)},${f(cy - r)}h${f(2 * r)}v${f(2 * r)}h${f(-2 * r)}Z`
        case 'hexagon': return poly(cx, cy, r, 6, 0)
        case 'bar': return `M${f(cx - r)},${f(cy - r * 0.55)}h${f(2 * r)}v${f(1.1 * r)}h${f(-2 * r)}Z`
        case 'triangle': return poly(cx, cy + r * 0.2, r * 1.15, 3)
        case 'diamond': return poly(cx, cy, r * 1.1, 4)
        case 'pentagon': return poly(cx, cy, r, 5)
        case 'octagon': return poly(cx, cy, r, 8, Math.PI / 8)
        default: return `M${f(cx - r)},${f(cy - r)}L${f(cx + r)},${f(cy + r)}M${f(cx + r)},${f(cy - r)}L${f(cx - r)},${f(cy + r)}`
    }
}

export const isFilledShape = (shape) => shape === 'bar'

/** '#eef3ff' → a colour worth a swatch? Only when it is visibly not white (chroma ≥ 0.2). */
export const meaningfulColour = (hex) => {
    const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || ''))
    if (!m) return null
    const n = parseInt(m[1], 16)
    const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => v / 255)
    // Chroma (max - min), not HSL saturation: a near-white tint like #eef3ff has a
    // high saturation and no colour a crew would gel for.
    return Math.max(r, g, b) - Math.min(r, g, b) >= 0.2 ? `#${m[1].toLowerCase()}` : null
}

const pad3 = (n) => String(n).padStart(3, '0')

/**
 * The notation beside a lamp, as the sketch writes it: `#41` (the console's
 * fixture number), `2.145` (universe.address), the unit number inside the symbol.
 * A lamp that is not patched says why in one word.
 */
export const lampNotation = (row) => ({
    number: row.index != null ? `#${row.index}` : '#—',
    address: row.universe != null && row.address != null
        ? `${row.universe}.${pad3(row.address)}`
        : row.flags?.includes('mode-unknown') ? 'mode?' : 'unpatched',
    unit: row.unit != null ? String(row.unit) : ''
})

/**
 * The key: one line per type present in the room, with its count and mode, in
 * the order of the library.
 */
export const keyRows = ({ rows = [], types = [], table }) => {
    const byType = new Map()
    for (const r of rows) {
        if (!byType.has(r.type)) byType.set(r.type, { n: 0, modes: new Set(), code: r.code })
        const e = byType.get(r.type)
        e.n += 1
        if (r.mode) e.modes.add(r.mode)
    }
    const order = new Map(types.map((t, i) => [t.id, i]))
    return [...byType.entries()]
        .sort((a, b) => (order.get(a[0]) ?? 1e9) - (order.get(b[0]) ?? 1e9))
        .map(([id, e]) => ({
            type: id,
            code: e.code,
            n: e.n,
            mode: [...e.modes].join(', ') || 'mode owed',
            ...(table.get(id) || { shape: 'cross', letter: '' })
        }))
}
