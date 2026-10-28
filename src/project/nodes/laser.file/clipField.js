// Clips frame v2 paths to the field (x and y in -1..1), for Laser File. A part of a path outside the field
// is BLANKED, never pressed onto the edge: pressing it there would draw lines the file never had along the
// field's edge and park the beam on its corners (review of PR #1071, finding 1). The path is split where it
// leaves the field and starts again where it comes back, as a device's out-of-bounds blanking does. Pure.

const EDGE = 1
// A piece shorter than this (field units) is dropped: clipping must never make a dot the file did not have.
const MIN_PIECE = 1e-6

const inside = (p, i) => p[i] >= -EDGE && p[i] <= EDGE && p[i + 1] >= -EDGE && p[i + 1] <= EDGE

// Liang–Barsky: the part [t0, t1] of a -> b inside the field, or null.
const clipSegment = (ax, ay, bx, by) => {
    const dx = bx - ax; const dy = by - ay
    let t0 = 0; let t1 = 1
    for (const [q, r] of [[-dx, ax + EDGE], [dx, EDGE - ax], [-dy, ay + EDGE], [dy, EDGE - ay]]) {
        if (q === 0) { if (r < 0) return null; continue }
        const t = r / q
        if (q < 0) { if (t > t1) return null; if (t > t0) t0 = t } else { if (t < t0) return null; if (t < t1) t1 = t }
    }
    return [t0, t1]
}

const at = (p, a, b, t) => {
    if (t === 0) return p.slice(a, a + 5)
    if (t === 1) return p.slice(b, b + 5)
    const out = []
    for (let k = 0; k < 5; k += 1) out.push(p[a + k] + (p[b + k] - p[a + k]) * t)
    // On the edge exactly, not a rounding hair past it.
    out[0] = Math.max(-EDGE, Math.min(EDGE, out[0])); out[1] = Math.max(-EDGE, Math.min(EDGE, out[1]))
    return out
}

const lengthOf = (piece) => {
    let l = 0
    for (let i = 5; i < piece.length; i += 5) l += Math.hypot(piece[i] - piece[i - 5], piece[i + 1] - piece[i - 4])
    return l
}

/**
 * Paths -> { paths, outside } where every vertex is inside the field. A path wholly inside is returned as
 * it is. A one-vertex path (a dot in the file) outside is dropped. Any other path that leaves the field is
 * cut into open pieces at the edge crossings; colour is interpolated at a crossing. `outside` counts the
 * vertices that lay outside. Pure.
 */
export const clipToField = (paths) => {
    const out = []
    let outside = 0
    for (const path of paths || []) {
        const p = path?.p
        if (!Array.isArray(p) || p.length < 5) continue
        const n = p.length / 5
        let away = 0
        for (let i = 0; i < p.length; i += 5) if (!inside(p, i)) away += 1
        if (!away) { out.push(path); continue }
        outside += away
        if (n === 1) continue
        const closed = Boolean(path.closed) && n >= 3
        const pieces = []
        let piece = []
        const end = () => { if (piece.length >= 10) pieces.push(piece); piece = [] }
        const segments = closed ? n : n - 1
        for (let s = 0; s < segments; s += 1) {
            const a = s * 5; const b = ((s + 1) % n) * 5
            const t = clipSegment(p[a], p[a + 1], p[b], p[b + 1])
            if (!t) { end(); continue }
            if (t[0] > 0 || !piece.length) { end(); piece.push(...at(p, a, b, t[0])) }
            piece.push(...at(p, a, b, t[1]))
            if (t[1] < 1) end()
        }
        end()
        // A closed path that was cut where it starts and ends inside: its last piece runs on into its first.
        if (closed && pieces.length > 1 && inside(p, 0)) {
            const last = pieces.pop()
            pieces[0] = last.slice(0, -5).concat(pieces[0])
        }
        for (const q of pieces) if (lengthOf(q) >= MIN_PIECE) out.push({ p: q, closed: false })
    }
    return { paths: out, outside }
}
