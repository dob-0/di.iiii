// Laser File: a file's bytes -> one laser value (frame v2), for laser.file (laser Phase 9, design 2026-10-14
// §5). An ILDA file (ildaFile.js) or SVG path data (svgPath.js), told apart by the bytes, never the name.
// Pure: the same bytes and options give the same frame; the node's runtime only finds the bytes.
import { FRAME_VERSION } from '../../../shared/laserFrame.js'
import { capPaths } from './capPaths.js'
import { ildaFrameToPaths, isIldaBytes, readIlda } from './ildaFile.js'
import { flattenPathData, parsePathData } from './svgPath.js'

// Unwired and with no stroke in the file, an SVG path is drawn in Laser's own green (laser.shape).
export const DEFAULT_COLOUR = '#00ff40'
// The largest distance from a curve to its chords, in field units (the field is 2 wide). UNVALIDATED:
// a starting value — about 1/1000 of the field — to be judged on the wall.
export const DEFAULT_TOLERANCE = 0.002
// An SVG is fitted so its larger side is this share of the field, as Laser Trace's size 0 fits a shape.
const FIT = 0.8
// Bytes past this are not read: a laser drawing of this size would never fit a frame anyway.
export const MAX_FILE_BYTES = 8 * 1024 * 1024

const hexToRgb = (hex) => {
    const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(hex || '').trim())
    if (!m) return null
    const h = m[1].length === 3 ? m[1].split('').map((c) => c + c).join('') : m[1]
    return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255)
}

const toBytes = (input) => {
    if (input instanceof Uint8Array) return input
    if (input instanceof ArrayBuffer) return new Uint8Array(input)
    if (ArrayBuffer.isView(input)) return new Uint8Array(input.buffer, input.byteOffset, input.byteLength)
    if (typeof input === 'string') return new TextEncoder().encode(input)
    return null
}

const attr = (tag, name) => {
    const m = new RegExp(`\\s${name}\\s*=\\s*("([^"]*)"|'([^']*)')`, 'i').exec(tag)
    return m ? (m[2] ?? m[3]) : null
}

const decodeEntities = (s) => s.replace(/&#x([0-9a-f]+);|&#(\d+);|&(amp|lt|gt|quot|apos);/gi, (all, hex, dec, name) => {
    if (hex) return String.fromCodePoint(parseInt(hex, 16))
    if (dec) return String.fromCodePoint(Number(dec))
    return { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }[name.toLowerCase()]
})

/**
 * SVG text -> [{ d, stroke }]: every <path>'s d, with its stroke colour (the attribute, or `stroke:` in
 * its style) when that is a hex colour. Bare path data (no '<' in the text) is one path. Elements other
 * than <path> and every `transform` are NOT read; they are counted. Pure.
 */
export const svgPaths = (textIn) => {
    const text = String(textIn || '')
    if (!text.includes('<')) return { paths: text.trim() ? [{ d: text, stroke: null }] : [], skipped: 0, transforms: 0 }
    const body = text.replace(/<!--[\s\S]*?-->/g, '')
    const paths = []
    let transforms = 0
    for (const m of body.matchAll(/<path\b[^>]*>/gi)) {
        const tag = m[0]
        const d = attr(tag, 'd')
        if (d === null) continue
        if (attr(tag, 'transform') !== null) transforms += 1
        const style = attr(tag, 'style') || ''
        const stroke = attr(tag, 'stroke') || (/(?:^|;)\s*stroke\s*:\s*([^;]+)/i.exec(style)?.[1] ?? null)
        paths.push({ d: decodeEntities(d), stroke: stroke && hexToRgb(stroke) ? stroke.trim() : null })
    }
    transforms += (body.match(/<g\b[^>]*\stransform\s*=/gi) || []).length
    const skipped = (body.match(/<(?:rect|circle|ellipse|line|polyline|polygon|text|use|image)\b/gi) || []).length
    return { paths, skipped, transforms }
}

const finish = (paths, { colour, level }) => {
    const tint = hexToRgb(colour)
    const lv = Number.isFinite(level) ? Math.max(0, Math.min(1, level)) : 1
    for (const path of paths) {
        for (let i = 0; i < path.p.length; i += 5) {
            if (tint) { path.p[i + 2] = tint[0]; path.p[i + 3] = tint[1]; path.p[i + 4] = tint[2] }
            path.p[i + 2] *= lv; path.p[i + 3] *= lv; path.p[i + 4] *= lv
        }
    }
    return paths
}

const ILDA_READS = new WeakMap()

const clampField = (v) => (v < -1 ? -1 : v > 1 ? 1 : v)

/**
 * Bytes (or a string) -> { ok: true, kind: 'ilda' | 'svg', frame, frames, status, cut } or
 * { ok: false, reason, at, status }. `frame` is a frame v2 value within FRAME_MAX_POINTS vertices.
 * options: index (which ILDA frame, wrapped), size (1 = as the file says for ILDA, fitted to 80 % of the
 * field for SVG), height (added to y), colour (a hex string recolours every point; unset keeps the file's),
 * level (0..1 brightness), tolerance (field units, SVG curves), max (vertex cap). Refusal reasons:
 * empty, too-large, not-laser-file (neither ILDA nor SVG path data), every readIlda reason, and the
 * SVG grammar's when not one segment could be read. Pure.
 */
export const readLaserFile = (input, {
    index = 0, size = 1, height = 0, colour = null, level = 1, tolerance = DEFAULT_TOLERANCE, max,
} = {}) => {
    const bytes = toBytes(input)
    const no = (reason, at = 0, detail = '') => ({ ok: false, reason, at, status: `Refused: ${reason}${detail ? ` (${detail})` : ''}` })
    if (!bytes || !bytes.length) return no('empty')
    if (bytes.length > MAX_FILE_BYTES) return no('too-large', 0, `${bytes.length} bytes, the most is ${MAX_FILE_BYTES}`)
    const scale = Number.isFinite(size) && size > 0 ? size : 1
    const dy = Number.isFinite(height) ? height : 0
    const frame = { kind: 'laser', v: FRAME_VERSION, paths: [], order: 'free' }
    if (isIldaBytes(bytes)) {
        // Memoised by the bytes' identity: an animated file is read once, not once per frame.
        let read = ILDA_READS.get(bytes)
        if (!read) { read = readIlda(bytes); ILDA_READS.set(bytes, read) }
        if (!read.ok) return no(read.reason, read.at, read.detail)
        const count = read.frames.length
        const i = ((Math.floor(Number.isFinite(index) ? index : 0) % count) + count) % count
        const f = read.frames[i]
        let paths = ildaFrameToPaths(f)
        for (const path of paths) for (let k = 0; k < path.p.length; k += 5) {
            path.p[k] = clampField(path.p[k] * scale)
            path.p[k + 1] = clampField(path.p[k + 1] * scale + dy)
        }
        const capped = capPaths(finish(paths, { colour, level }), max)
        paths = capped.paths
        frame.paths = paths
        // An ILDA frame's order is the artist's: kept, as the projector would draw it.
        frame.order = 'kept'
        const points = paths.reduce((s, p) => s + p.p.length / 5, 0)
        const cut = capped.cutPoints + capped.cutPaths ? `, cut ${capped.cutPoints} points / ${capped.cutPaths} paths to fit` : ''
        return {
            ok: true, kind: 'ilda', frame, frames: count, cut: { points: capped.cutPoints, paths: capped.cutPaths },
            status: `ILDA format ${f.format}, frame ${i + 1} of ${count}, ${paths.length} paths, ${points} points${cut}${read.ended ? '' : ', no end header'}`,
        }
    }
    const text = new TextDecoder('utf-8', { fatal: false }).decode(bytes)
    const isSvg = /<svg\b/i.test(text) || /<path\b/i.test(text)
    const bare = !text.includes('<') && /^\s*[Mm]/.test(text)
    if (!isSvg && !bare) return no('not-laser-file', 0, 'neither ILDA nor SVG path data')
    const { paths: found, skipped, transforms } = svgPaths(text)
    if (!found.length) return no('no-paths', 0, skipped ? `${skipped} elements other than <path> are not read` : 'no <path d>')
    // Pass 1 finds the bounds: a rough span from every coordinate and radius the segments name, then the
    // curves flattened to 1/10000 of it (an arc bulges past its ends, so its ends alone would understate
    // the bounds). Pass 2 flattens to the field tolerance.
    let lo = Infinity; let hi = -Infinity; let radius = 0
    for (const { d } of found) {
        for (const s of parsePathData(d).segments) {
            for (const v of [s.x, s.y, s.x1, s.y1, s.x2, s.y2]) if (Number.isFinite(v)) { lo = Math.min(lo, v); hi = Math.max(hi, v) }
            if (s.type === 'A') radius = Math.max(radius, Math.abs(s.rx), Math.abs(s.ry))
        }
    }
    const rough = (Number.isFinite(hi - lo) ? hi - lo : 0) + 2 * radius
    let minX = Infinity; let minY = Infinity; let maxX = -Infinity; let maxY = -Infinity
    let firstError = null
    for (const { d } of found) {
        const { polylines, error } = flattenPathData(d, { tolerance: (rough > 0 ? rough : 1) * 1e-4 })
        if (error && !firstError) firstError = error
        for (const line of polylines) for (const [x, y] of line.points) {
            if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y
        }
    }
    if (!Number.isFinite(minX)) return no(firstError?.reason || 'no-paths', firstError?.at || 0, 'no segment could be drawn')
    const span = Math.max(maxX - minX, maxY - minY) || 1
    const k = (2 * FIT * scale) / span
    const midX = (minX + maxX) / 2; const midY = (minY + maxY) / 2
    const tol = (Number.isFinite(tolerance) && tolerance > 0 ? tolerance : DEFAULT_TOLERANCE) / k
    const paths = []
    for (const { d, stroke } of found) {
        const rgb = hexToRgb(stroke) || hexToRgb(DEFAULT_COLOUR)
        for (const line of flattenPathData(d, { tolerance: tol }).polylines) {
            const p = []
            // SVG's y runs down, the field's up.
            for (const [x, y] of line.points) p.push(clampField((x - midX) * k), clampField(-(y - midY) * k + dy), rgb[0], rgb[1], rgb[2])
            paths.push({ p, closed: line.closed })
        }
    }
    const capped = capPaths(finish(paths, { colour, level }), max)
    frame.paths = capped.paths
    const points = capped.paths.reduce((s, p) => s + p.p.length / 5, 0)
    const notes = [
        capped.cutPoints + capped.cutPaths ? `cut ${capped.cutPoints} points / ${capped.cutPaths} paths to fit` : '',
        firstError ? `stopped at ${firstError.reason} (char ${firstError.at})` : '',
        skipped ? `${skipped} non-path elements not read` : '',
        transforms ? `${transforms} transforms ignored` : '',
    ].filter(Boolean)
    return {
        ok: true, kind: 'svg', frame, frames: 1, cut: { points: capped.cutPoints, paths: capped.cutPaths },
        status: `SVG, ${capped.paths.length} paths, ${points} points${notes.length ? `, ${notes.join(', ')}` : ''}`,
    }
}
