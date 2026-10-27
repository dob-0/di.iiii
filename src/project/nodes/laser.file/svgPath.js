// SVG path data -> polylines, for Laser File (laser Phase 9, design 2026-10-14 §5). Pure.
//
// Grammar: SVG 2, W3C Candidate Recommendation, §9.3 "Path data" (https://www.w3.org/TR/SVG2/paths.html):
// commands M L H V C S Q T A Z, upper case absolute and lower case relative; a command letter may be
// followed by several argument sets (an M's extra pairs are L, an m's are l); numbers may run together
// ("1.5.5" is 1.5 then .5, "1-2" is 1 then -2) and an arc's two flags may be written with no separator
// ("a1 1 0 00 1 1"). Error handling per §9.5.4: the path is drawn up to the last good segment and the
// error is reported by name (not-moveto, bad-number, bad-flag, missing-arguments, unknown-command).
// Smooth curves (S, T) reflect the previous control point only after C/S (Q/T), else use the current point.
//
// Arcs: SVG 2 Appendix B.2.4 "Conversion from endpoint to center parameterization" with the
// out-of-range corrections of B.2.5 (rx or ry 0 -> a line; |r| taken; radii scaled up by sqrt(Λ) when
// Λ = x1'²/rx² + y1'²/ry² > 1). Flattening, with `tolerance` the largest distance allowed between the
// true curve and its chords, in the path's own units:
//   cubic and quadratic Béziers: subdivided at t = 1/2 (de Casteljau) until both control points lie within
//     `tolerance` of the chord — the curve lies in its control polygon's convex hull, so it is within
//     `tolerance` of the chord too (a bound, not an estimate);
//   arcs: n chords of equal angle, with the sagitta r·(1 − cos(Δθ/2)) ≤ tolerance for r = max(rx, ry).

export const MAX_SUBDIVISION_DEPTH = 16
export const MAX_SEGMENTS = 100000

const COMMANDS = 'MmLlHhVvCcSsQqTtAaZz'
const ARGS = { M: 2, L: 2, H: 1, V: 1, C: 6, S: 4, Q: 4, T: 2, A: 7, Z: 0 }
// Sticky, so a number is matched where the reader stands without copying the rest of the string.
const NUMBER = /[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/y
const isWsp = (c) => c === ' ' || c === '\t' || c === '\n' || c === '\r' || c === '\f'

// The tokenizer: one command letter, or one number, or one flag (when `flag` is asked for).
const makeReader = (d) => {
    let i = 0
    const skip = () => { while (i < d.length && (isWsp(d[i]) || d[i] === ',')) i += 1 }
    const skipWsp = () => { while (i < d.length && isWsp(d[i])) i += 1 }
    return {
        get at() { return i },
        done() { skipWsp(); return i >= d.length },
        peekCommand() { skipWsp(); return i < d.length && COMMANDS.includes(d[i]) ? d[i] : null },
        takeCommand() { skipWsp(); return d[i++] },
        startsNumber() {
            skip()
            const c = d[i]
            return c !== undefined && ((c >= '0' && c <= '9') || c === '.' || c === '-' || c === '+')
        },
        number() {
            skip()
            NUMBER.lastIndex = i
            const m = NUMBER.exec(d)
            if (!m) return null
            i += m[0].length
            return Number(m[0])
        },
        flag() {
            skip()
            const c = d[i]
            if (c !== '0' && c !== '1') return null
            i += 1
            return c === '1' ? 1 : 0
        },
    }
}

/**
 * Path data -> { segments, error }: every segment absolute, one of
 *   { type: 'M', x, y } · { type: 'L', x, y } · { type: 'C', x1, y1, x2, y2, x, y }
 *   { type: 'Q', x1, y1, x, y } · { type: 'A', rx, ry, phi, large, sweep, x, y } · { type: 'Z', x, y }
 * (H and V become L; S becomes C and T becomes Q with the reflected control point; Z carries the point it
 * returns to). `error` is null or { reason, at } with `at` the character index. Pure.
 */
export const parsePathData = (d) => {
    const s = typeof d === 'string' ? d : ''
    const r = makeReader(s)
    const segments = []
    let cx = 0; let cy = 0; let sx = 0; let sy = 0
    let lastCubic = null; let lastQuad = null
    let command = null
    const fail = (reason) => ({ segments, error: { reason, at: r.at } })
    while (!r.done()) {
        if (segments.length >= MAX_SEGMENTS) return fail('too-many-segments')
        const letter = r.peekCommand()
        if (letter) {
            command = r.takeCommand()
        } else if (!command || command === 'Z' || command === 'z') {
            return fail(command ? 'unknown-command' : 'not-moveto')
        } else if (!r.startsNumber()) {
            return fail('unknown-command')
        }
        if (!segments.length && command !== 'M' && command !== 'm') return fail('not-moveto')
        const upper = command.toUpperCase()
        const rel = command !== upper
        if (upper === 'Z') {
            segments.push({ type: 'Z', x: sx, y: sy })
            cx = sx; cy = sy
            lastCubic = null; lastQuad = null
            continue
        }
        const args = []
        for (let k = 0; k < ARGS[upper]; k += 1) {
            const v = upper === 'A' && (k === 3 || k === 4) ? r.flag() : r.number()
            if (v === null) {
                if (k === 0) return fail('missing-arguments')
                return fail(upper === 'A' && (k === 3 || k === 4) ? 'bad-flag' : 'bad-number')
            }
            args.push(v)
        }
        const ox = rel ? cx : 0
        const oy = rel ? cy : 0
        let cubic = null; let quad = null
        if (upper === 'M') {
            cx = args[0] + ox; cy = args[1] + oy; sx = cx; sy = cy
            segments.push({ type: 'M', x: cx, y: cy })
            command = rel ? 'l' : 'L'
        } else if (upper === 'L' || upper === 'H' || upper === 'V') {
            if (upper === 'L') { cx = args[0] + ox; cy = args[1] + oy }
            if (upper === 'H') cx = args[0] + ox
            if (upper === 'V') cy = args[0] + oy
            segments.push({ type: 'L', x: cx, y: cy })
        } else if (upper === 'C' || upper === 'S') {
            let x1; let y1; let rest
            if (upper === 'C') { x1 = args[0] + ox; y1 = args[1] + oy; rest = args.slice(2) } else {
                x1 = lastCubic ? 2 * cx - lastCubic[0] : cx
                y1 = lastCubic ? 2 * cy - lastCubic[1] : cy
                rest = args
            }
            const seg = { type: 'C', x1, y1, x2: rest[0] + ox, y2: rest[1] + oy, x: rest[2] + ox, y: rest[3] + oy }
            segments.push(seg)
            cubic = [seg.x2, seg.y2]
            cx = seg.x; cy = seg.y
        } else if (upper === 'Q' || upper === 'T') {
            let x1; let y1; let end
            if (upper === 'Q') { x1 = args[0] + ox; y1 = args[1] + oy; end = args.slice(2) } else {
                x1 = lastQuad ? 2 * cx - lastQuad[0] : cx
                y1 = lastQuad ? 2 * cy - lastQuad[1] : cy
                end = args
            }
            const seg = { type: 'Q', x1, y1, x: end[0] + ox, y: end[1] + oy }
            segments.push(seg)
            quad = [x1, y1]
            cx = seg.x; cy = seg.y
        } else if (upper === 'A') {
            const seg = { type: 'A', rx: args[0], ry: args[1], phi: args[2], large: args[3], sweep: args[4], x: args[5] + ox, y: args[6] + oy }
            segments.push(seg)
            cx = seg.x; cy = seg.y
        }
        lastCubic = cubic
        lastQuad = quad
    }
    return { segments, error: null }
}

const distToLine = (px, py, ax, ay, bx, by) => {
    const dx = bx - ax; const dy = by - ay
    const len = Math.hypot(dx, dy)
    if (len === 0) return Math.hypot(px - ax, py - ay)
    return Math.abs(dy * px - dx * py + bx * ay - by * ax) / len
}

// Cubic from (x0,y0): push the chord ends after (x0,y0) into `out`.
const flattenCubic = (out, x0, y0, x1, y1, x2, y2, x3, y3, tol, depth) => {
    const flat = distToLine(x1, y1, x0, y0, x3, y3) <= tol && distToLine(x2, y2, x0, y0, x3, y3) <= tol
    if (flat || depth >= MAX_SUBDIVISION_DEPTH) { out.push([x3, y3]); return }
    const ax = (x0 + x1) / 2; const ay = (y0 + y1) / 2
    const bx = (x1 + x2) / 2; const by = (y1 + y2) / 2
    const cx = (x2 + x3) / 2; const cy = (y2 + y3) / 2
    const dx = (ax + bx) / 2; const dy = (ay + by) / 2
    const ex = (bx + cx) / 2; const ey = (by + cy) / 2
    const mx = (dx + ex) / 2; const my = (dy + ey) / 2
    flattenCubic(out, x0, y0, ax, ay, dx, dy, mx, my, tol, depth + 1)
    flattenCubic(out, mx, my, ex, ey, cx, cy, x3, y3, tol, depth + 1)
}

const flattenQuad = (out, x0, y0, x1, y1, x2, y2, tol, depth) => {
    if (distToLine(x1, y1, x0, y0, x2, y2) <= tol || depth >= MAX_SUBDIVISION_DEPTH) { out.push([x2, y2]); return }
    const ax = (x0 + x1) / 2; const ay = (y0 + y1) / 2
    const bx = (x1 + x2) / 2; const by = (y1 + y2) / 2
    const mx = (ax + bx) / 2; const my = (ay + by) / 2
    flattenQuad(out, x0, y0, ax, ay, mx, my, tol, depth + 1)
    flattenQuad(out, mx, my, bx, by, x2, y2, tol, depth + 1)
}

const angle = (ux, uy, vx, vy) => {
    const a = Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy)
    return a
}

/**
 * SVG 2 Appendix B.2.4 (with B.2.5): an endpoint arc -> { cx, cy, rx, ry, phi, theta1, dtheta } in radians,
 * or null when it is a straight line (a radius 0) or nothing (the ends coincide). Pure.
 */
export const arcEndpointToCentre = (x1, y1, x2, y2, rxIn, ryIn, phiDeg, large, sweep) => {
    if (x1 === x2 && y1 === y2) return null
    let rx = Math.abs(rxIn); let ry = Math.abs(ryIn)
    if (rx === 0 || ry === 0) return null
    const phi = ((phiDeg % 360) * Math.PI) / 180
    const cos = Math.cos(phi); const sin = Math.sin(phi)
    // Step 1: (x1', y1')
    const dx = (x1 - x2) / 2; const dy = (y1 - y2) / 2
    const x1p = cos * dx + sin * dy
    const y1p = -sin * dx + cos * dy
    // B.2.5: scale the radii up if the ends are too far apart for them.
    const lambda = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry)
    if (lambda > 1) { const k = Math.sqrt(lambda); rx *= k; ry *= k }
    // Step 2: (cx', cy')
    const num = rx * rx * ry * ry - rx * rx * y1p * y1p - ry * ry * x1p * x1p
    const den = rx * rx * y1p * y1p + ry * ry * x1p * x1p
    let coef = Math.sqrt(Math.max(0, num / den))
    if (large === sweep) coef = -coef
    const cxp = coef * ((rx * y1p) / ry)
    const cyp = coef * (-(ry * x1p) / rx)
    // Step 3: (cx, cy)
    const cx = cos * cxp - sin * cyp + (x1 + x2) / 2
    const cy = sin * cxp + cos * cyp + (y1 + y2) / 2
    // Step 4: θ1 and Δθ
    const ux = (x1p - cxp) / rx; const uy = (y1p - cyp) / ry
    const vx = (-x1p - cxp) / rx; const vy = (-y1p - cyp) / ry
    const theta1 = angle(1, 0, ux, uy)
    let dtheta = angle(ux, uy, vx, vy)
    if (!sweep && dtheta > 0) dtheta -= 2 * Math.PI
    if (sweep && dtheta < 0) dtheta += 2 * Math.PI
    return { cx, cy, rx, ry, phi, theta1, dtheta }
}

/** The point at angle θ on a centre-parameterised arc. Pure. */
export const arcPoint = ({ cx, cy, rx, ry, phi }, theta) => {
    const cos = Math.cos(phi); const sin = Math.sin(phi)
    const ex = rx * Math.cos(theta); const ey = ry * Math.sin(theta)
    return [cos * ex - sin * ey + cx, sin * ex + cos * ey + cy]
}

/** The chord count that keeps an arc of radius r and sweep |Δθ| within `tol` (the sagitta). Pure. */
export const arcChords = (r, dtheta, tol) => {
    if (!(r > 0) || !(tol > 0)) return 1
    if (tol >= r) return Math.max(1, Math.ceil(Math.abs(dtheta) / Math.PI))
    const step = 2 * Math.acos(1 - tol / r)
    return Math.max(1, Math.min(MAX_SEGMENTS, Math.ceil(Math.abs(dtheta) / step)))
}

/**
 * Path data -> { polylines: [{ points: [[x, y], …], closed }], error } in the path's own units, curves
 * and arcs flattened to within `tolerance`. A subpath with only a moveto is dropped (it draws nothing). Pure.
 */
export const flattenPathData = (d, { tolerance = 0.5 } = {}) => {
    const tol = Number.isFinite(tolerance) && tolerance > 0 ? tolerance : 0.5
    const { segments, error } = parsePathData(d)
    const polylines = []
    let current = null
    let x = 0; let y = 0
    const finish = () => { if (current && current.points.length > 1) polylines.push(current); current = null }
    for (const seg of segments) {
        if (seg.type === 'M') { finish(); current = { points: [[seg.x, seg.y]], closed: false }; x = seg.x; y = seg.y; continue }
        if (!current) current = { points: [[x, y]], closed: false }
        if (seg.type === 'L') current.points.push([seg.x, seg.y])
        else if (seg.type === 'C') flattenCubic(current.points, x, y, seg.x1, seg.y1, seg.x2, seg.y2, seg.x, seg.y, tol, 0)
        else if (seg.type === 'Q') flattenQuad(current.points, x, y, seg.x1, seg.y1, seg.x, seg.y, tol, 0)
        else if (seg.type === 'A') {
            const arc = arcEndpointToCentre(x, y, seg.x, seg.y, seg.rx, seg.ry, seg.phi, seg.large, seg.sweep)
            if (!arc) { if (seg.x !== x || seg.y !== y) current.points.push([seg.x, seg.y]) } else {
                const n = arcChords(Math.max(arc.rx, arc.ry), arc.dtheta, tol)
                for (let k = 1; k < n; k += 1) current.points.push(arcPoint(arc, arc.theta1 + (arc.dtheta * k) / n))
                current.points.push([seg.x, seg.y])
            }
        } else if (seg.type === 'Z') {
            const first = current.points[0]
            const last = current.points[current.points.length - 1]
            if (last[0] === first[0] && last[1] === first[1] && current.points.length > 1) current.points.pop()
            current.closed = current.points.length > 1
            const start = current.points[0]
            finish()
            // A command after Z starts a new subpath at the same start point (SVG 2 §9.3.3).
            current = { points: [[start[0], start[1]]], closed: false }
        }
        x = seg.x; y = seg.y
    }
    finish()
    return { polylines, error }
}
