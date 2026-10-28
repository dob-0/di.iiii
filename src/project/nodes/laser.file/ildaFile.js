// ILDA files: read and write the ILDA Image Data Transfer Format, revision 011 (ILDA Technical Committee,
// 2014; ilda.com "Technical Standards", ILDA_IDTF14_rev011.pdf), formats 0, 1, 4 and 5, and the format-2
// colour palette. Pure functions of bytes; nothing here touches a cube (laser Phase 9, design 2026-10-14 §5).
//
// THE SPEC WAS NOT READ IN THE SESSION THAT WROTE THIS (2026-10-20): ilda.com was refused by the session's
// network policy. The layout below is the one two independent readers agree on — @laser-dac/ilda-reader
// 0.3.3 (npm, MIT; dist/index.js, dist/file.js) and the long-standing community description — and the
// tests hold this module to its own writer, not to a file from the ILDA. INDEXED COLOUR IS UNVERIFIED:
// DEFAULT_PALETTE is the 64-colour table that @laser-dac/ilda-reader dist/color.js says it copied from
// rev011 ("the official suggested default color palette"), second-hand. Re-check both against the PDF.
//
// A section is a 32-byte header, then its records (all numbers big-endian):
//   0-3 "ILDA" · 4-6 reserved 0 · 7 format · 8-15 name · 16-23 company · 24-25 records (uint16)
//   26-27 frame (or palette) number · 28-29 total frames · 30 projector · 31 reserved
// Records: format 0  x y z (int16) status colourIndex      8 bytes   3D, indexed
//          format 1  x y   (int16) status colourIndex      6 bytes   2D, indexed
//          format 2  r g b                                 3 bytes   the palette for later indexed frames
//          format 4  x y z (int16) status b g r           10 bytes   3D, true colour
//          format 5  x y   (int16) status b g r            8 bytes   2D, true colour
// Status: bit 7 last point of the frame, bit 6 blanked (the beam off); the other bits are reserved.
// The file ends with a header whose record count is 0.
//
// The ILDA convention is that a point's colour is the colour of the beam travelling TO it, so a lit
// point after a blanked one draws the line from the blanked point. readIlda keeps the records as they
// are; ildaFrameToPaths turns one frame into frame v2 paths with that rule.

export const ILDA_FORMATS = Object.freeze([0, 1, 4, 5])
const RECORD_BYTES = { 0: 8, 1: 6, 2: 3, 4: 10, 5: 8 }
const HEADER_BYTES = 32
const LAST = 0x80
const BLANK = 0x40
// A file may hold this many sections before it is refused: bounds the work, never reached by a real show.
export const MAX_SECTIONS = 10000

// 64 colours, 0..255. Second-hand (see the header): UNVERIFIED against rev011. Entry 63 reads
// (0, 34, 34) in the source, which breaks the red-to-white ramp of 56..62; it is kept as given, not guessed.
export const DEFAULT_PALETTE = Object.freeze([
    [255, 0, 0], [255, 17, 0], [255, 34, 0], [255, 51, 0], [255, 68, 0], [255, 85, 0], [255, 102, 0], [255, 119, 0],
    [255, 136, 0], [255, 153, 0], [255, 170, 0], [255, 187, 0], [255, 204, 0], [255, 221, 0], [255, 238, 0], [255, 255, 0],
    [255, 255, 0], [238, 255, 0], [204, 255, 0], [170, 255, 0], [136, 255, 0], [102, 255, 0], [68, 255, 0], [34, 255, 0],
    [0, 255, 0], [0, 255, 34], [0, 255, 68], [0, 255, 102], [0, 255, 136], [0, 255, 170], [0, 255, 204], [0, 255, 238],
    [0, 136, 255], [0, 119, 255], [0, 102, 255], [0, 102, 255], [0, 85, 255], [0, 68, 255], [0, 68, 255], [0, 34, 255],
    [0, 0, 255], [34, 0, 255], [68, 0, 255], [102, 0, 255], [136, 0, 255], [170, 0, 255], [204, 0, 255], [238, 0, 255],
    [255, 0, 255], [255, 34, 255], [255, 68, 255], [255, 102, 255], [255, 136, 255], [255, 170, 255], [255, 204, 255], [255, 238, 255],
    [255, 255, 255], [255, 238, 238], [255, 204, 204], [255, 170, 170], [255, 136, 136], [255, 102, 102], [255, 68, 68], [0, 34, 34],
].map(Object.freeze))

const refuse = (reason, at, detail) => ({ ok: false, reason, at, detail })

const toBytes = (input) => {
    if (input instanceof Uint8Array) return input
    if (input instanceof ArrayBuffer) return new Uint8Array(input)
    if (ArrayBuffer.isView(input)) return new Uint8Array(input.buffer, input.byteOffset, input.byteLength)
    return null
}

const text = (bytes, at, length) => {
    let s = ''
    for (let i = at; i < at + length; i += 1) {
        if (bytes[i] === 0) break
        s += String.fromCharCode(bytes[i])
    }
    return s.trim()
}

/** Does this look like an ILDA file (its first four bytes)? */
export const isIldaBytes = (input) => {
    const b = toBytes(input)
    return Boolean(b && b.length >= 4 && b[0] === 0x49 && b[1] === 0x4c && b[2] === 0x44 && b[3] === 0x41)
}

/**
 * Bytes -> { ok: true, frames, palettes, ended } or { ok: false, reason, at, detail }. A frame is
 * { format, name, company, number, total, projector, points: [{ x, y, z, blank, last, r, g, b, index? }] }
 * with x, y, z as the file's int16 and r, g, b 0..255; an indexed point is coloured by the palette in force
 * (the last format-2 section before it, else DEFAULT_PALETTE) and keeps its `index`. Refusals, by name:
 * not-bytes, not-ilda (no "ILDA" where a header must start), truncated-header, truncated-records,
 * unknown-format (3, or anything not 0/1/2/4/5), too-many-sections, no-frames. A file without the
 * closing 0-record header is read and says `ended: false`. Pure.
 */
export const readIlda = (input) => {
    const bytes = toBytes(input)
    if (!bytes) return refuse('not-bytes', 0, 'expected a Uint8Array or ArrayBuffer')
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
    const frames = []
    const palettes = []
    let palette = null
    let at = 0
    let ended = false
    let sections = 0
    while (at < bytes.length) {
        if (!isIldaBytes(bytes.subarray(at, at + 4))) {
            if (bytes.length - at < 4) return refuse('truncated-header', at, `${bytes.length - at} bytes where a 32-byte header starts`)
            return refuse('not-ilda', at, 'no "ILDA" where a section header must start')
        }
        if (bytes.length - at < HEADER_BYTES) return refuse('truncated-header', at, `${bytes.length - at} of 32 header bytes`)
        sections += 1
        if (sections > MAX_SECTIONS) return refuse('too-many-sections', at, `more than ${MAX_SECTIONS}`)
        const format = bytes[at + 7]
        const size = RECORD_BYTES[format]
        if (!size) return refuse('unknown-format', at + 7, `format ${format}`)
        const count = view.getUint16(at + 24)
        const header = {
            format,
            name: text(bytes, at + 8, 8),
            company: text(bytes, at + 16, 8),
            number: view.getUint16(at + 26),
            total: view.getUint16(at + 28),
            projector: bytes[at + 30],
        }
        at += HEADER_BYTES
        if (count === 0) { ended = true; break }
        if (bytes.length - at < count * size) {
            return refuse('truncated-records', at, `format ${format} needs ${count * size} bytes for ${count} records, ${bytes.length - at} left`)
        }
        if (format === 2) {
            const colours = []
            for (let i = 0; i < count; i += 1, at += 3) colours.push([bytes[at], bytes[at + 1], bytes[at + 2]])
            palette = colours
            palettes.push({ ...header, colours })
            continue
        }
        const threeD = format === 0 || format === 4
        const points = []
        for (let i = 0; i < count; i += 1, at += size) {
            const x = view.getInt16(at)
            const y = view.getInt16(at + 2)
            const z = threeD ? view.getInt16(at + 4) : 0
            const o = threeD ? at + 6 : at + 4
            const status = bytes[o]
            const point = { x, y, z, blank: (status & BLANK) !== 0, last: (status & LAST) !== 0, r: 0, g: 0, b: 0 }
            if (format === 0 || format === 1) {
                const index = bytes[o + 1]
                const table = palette || DEFAULT_PALETTE
                const rgb = table[index] || [0, 0, 0]
                point.index = index
                point.r = rgb[0]; point.g = rgb[1]; point.b = rgb[2]
            } else {
                point.b = bytes[o + 1]; point.g = bytes[o + 2]; point.r = bytes[o + 3]
            }
            points.push(point)
        }
        frames.push({ ...header, points })
    }
    if (!frames.length) return refuse('no-frames', at, palettes.length ? 'only a palette' : 'no point section')
    return { ok: true, frames, palettes, ended }
}

const q16 = (v) => Math.max(-32768, Math.min(32767, Math.round(v * 32767)))
const unq16 = (v) => Math.max(-1, Math.min(1, v / 32767))
const to255 = (v) => Math.max(0, Math.min(255, Math.round((Number.isFinite(v) ? v : 0) * 255)))

/**
 * One read frame -> frame v2 paths ({ p, closed }), x and y in -1..1 (int16 / 32767), colour 0..1.
 * A run of lit points is one path; it starts at the point before it (the beam travels from there),
 * unless that point is where the run's first point already is. A path whose last vertex returns to
 * its first is stored closed. z is dropped (the front view, as the cube would draw a 3D file). Pure.
 */
export const ildaFrameToPaths = (frame) => {
    const paths = []
    let current = null
    let prev = null
    for (const pt of frame?.points || []) {
        const x = unq16(pt.x)
        const y = unq16(pt.y)
        const lit = !pt.blank && (pt.r + pt.g + pt.b) > 0
        if (!lit) { current = null; prev = { x, y }; continue }
        const r = pt.r / 255; const g = pt.g / 255; const b = pt.b / 255
        if (!current) {
            current = { p: [], closed: false }
            paths.push(current)
            if (prev && (prev.x !== x || prev.y !== y)) current.p.push(prev.x, prev.y, r, g, b)
        }
        current.p.push(x, y, r, g, b)
        prev = { x, y }
    }
    for (const path of paths) {
        const n = path.p.length / 5
        if (n >= 4 && path.p[0] === path.p[(n - 1) * 5] && path.p[1] === path.p[(n - 1) * 5 + 1]) {
            path.p.length = (n - 1) * 5
            path.closed = true
        }
    }
    return paths
}

const nearestIndex = (table, r, g, b) => {
    let best = 0
    let bestD = Infinity
    for (let i = 0; i < table.length; i += 1) {
        const c = table[i]
        const d = (c[0] - r) ** 2 + (c[1] - g) ** 2 + (c[2] - b) ** 2
        if (d < bestD) { bestD = d; best = i }
    }
    return best
}

// Frame v2 paths -> records: per path one blanked point at its start, then every vertex lit (the first
// repeated lit, so its own colour survives the travel-to rule); a closed path returns to its first vertex.
const pathsToRecords = (paths) => {
    const records = []
    for (const path of paths || []) {
        const p = Array.isArray(path?.p) ? path.p : []
        const n = Math.floor(p.length / 5)
        if (!n) continue
        records.push({ x: p[0], y: p[1], z: 0, blank: true, r: 0, g: 0, b: 0 })
        const count = path.closed && n > 1 ? n + 1 : n
        for (let k = 0; k < count; k += 1) {
            const o = (k % n) * 5
            records.push({ x: p[o], y: p[o + 1], z: 0, blank: false, r: to255(p[o + 2]), g: to255(p[o + 3]), b: to255(p[o + 4]) })
        }
    }
    return records
}

const writeHeader = (out, at, { format, name = '', company = '', count, number = 0, total = 0, projector = 0 }) => {
    out.set([0x49, 0x4c, 0x44, 0x41, 0, 0, 0, format], at)
    for (let i = 0; i < 8; i += 1) out[at + 8 + i] = i < name.length ? name.charCodeAt(i) & 0x7f : 0
    for (let i = 0; i < 8; i += 1) out[at + 16 + i] = i < company.length ? company.charCodeAt(i) & 0x7f : 0
    const view = new DataView(out.buffer, out.byteOffset, out.byteLength)
    view.setUint16(at + 24, count)
    view.setUint16(at + 26, number)
    view.setUint16(at + 28, total)
    out[at + 30] = projector & 0xff
    out[at + 31] = 0
}

/**
 * Frames of frame v2 paths -> ILDA bytes in one format (0, 1, 4 or 5), each frame one section, then the
 * closing 0-record header. Indexed formats (0, 1) write a format-2 palette first with the colours used
 * (up to 256; past that, each colour takes the nearest of the first 256), unless `palette: 'default'`,
 * which writes none and takes the nearest of DEFAULT_PALETTE. A frame over 65535 records is refused
 * (throws), never cut. z is written 0. Pure.
 * @param {{ paths: object[], name?: string }[]} frames
 */
export const writeIlda = (frames, { format = 5, palette = 'embed', name = '', company = 'di.iiii' } = {}) => {
    if (!ILDA_FORMATS.includes(format)) throw new Error(`writeIlda: format ${format} is not one of 0, 1, 4, 5`)
    const list = (frames || []).map((f) => ({ name: f?.name ?? name, records: pathsToRecords(f?.paths) }))
    for (const f of list) if (f.records.length > 65535) throw new Error(`writeIlda: ${f.records.length} records in one frame, the format holds 65535`)
    const indexed = format === 0 || format === 1
    let table = null
    if (indexed) {
        if (palette === 'default') table = DEFAULT_PALETTE
        else {
            const seen = new Map()
            for (const f of list) for (const r of f.records) {
                if (r.blank) continue
                const key = (r.r << 16) | (r.g << 8) | r.b
                if (!seen.has(key) && seen.size < 256) seen.set(key, [r.r, r.g, r.b])
            }
            table = seen.size ? [...seen.values()] : [[255, 255, 255]]
        }
    }
    const size = RECORD_BYTES[format]
    const embed = indexed && palette !== 'default'
    const bytes = (embed ? HEADER_BYTES + table.length * 3 : 0)
        + list.reduce((s, f) => s + HEADER_BYTES + f.records.length * size, 0) + HEADER_BYTES
    const out = new Uint8Array(bytes)
    const view = new DataView(out.buffer)
    let at = 0
    if (embed) {
        writeHeader(out, at, { format: 2, name: 'palette', company, count: table.length })
        at += HEADER_BYTES
        for (const c of table) { out[at] = c[0]; out[at + 1] = c[1]; out[at + 2] = c[2]; at += 3 }
    }
    const threeD = format === 0 || format === 4
    list.forEach((f, number) => {
        writeHeader(out, at, { format, name: f.name, company, count: f.records.length, number, total: list.length })
        at += HEADER_BYTES
        f.records.forEach((r, i) => {
            view.setInt16(at, q16(r.x))
            view.setInt16(at + 2, q16(r.y))
            if (threeD) view.setInt16(at + 4, q16(r.z))
            const o = threeD ? at + 6 : at + 4
            out[o] = (r.blank ? BLANK : 0) | (i === f.records.length - 1 ? LAST : 0)
            if (indexed) out[o + 1] = r.blank ? 0 : nearestIndex(table, r.r, r.g, r.b)
            else { out[o + 1] = r.b; out[o + 2] = r.g; out[o + 3] = r.r }
            at += size
        })
    })
    writeHeader(out, at, { format, company, count: 0, total: list.length })
    return out
}
