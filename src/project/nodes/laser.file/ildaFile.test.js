// ILDA read/write (laser Phase 9). Every fixture is GENERATED here, by this test, from numbers in this
// file — none is an ILDA test pattern (ilda.com could not be fetched; see ildaFile.js).
import { describe, expect, it } from 'vitest'
import { DEFAULT_PALETTE, ILDA_FORMATS, ildaFrameToPaths, isIldaBytes, readIlda, writeIlda } from './ildaFile.js'

const Q = 1 / 32767
// A closed square in pure colours and an open three-vertex line with a colour per vertex.
const SQUARE = { p: [-0.5, -0.5, 1, 0, 0, 0.5, -0.5, 0, 1, 0, 0.5, 0.5, 0, 0, 1, -0.5, 0.5, 1, 1, 1], closed: true }
const LINE = { p: [-0.9, 0.8, 1, 1, 0, 0, 0.9, 0, 1, 1, 0.9, 0.8, 1, 0, 1], closed: false }

const expectPathsClose = (got, want, colourStep) => {
    expect(got).toHaveLength(want.length)
    got.forEach((path, i) => {
        expect(path.closed).toBe(want[i].closed)
        expect(path.p).toHaveLength(want[i].p.length)
        path.p.forEach((v, k) => {
            const c = k % 5
            expect(Math.abs(v - want[i].p[k])).toBeLessThanOrEqual(c < 2 ? Q : colourStep)
        })
    })
}

// Builds one section by hand, byte by byte, from the layout in ildaFile.js's header — not with writeIlda.
const section = (format, records, recordBytes, name = 'hand') => {
    const head = new Uint8Array(32)
    head.set([0x49, 0x4c, 0x44, 0x41, 0, 0, 0, format])
    for (let i = 0; i < name.length; i += 1) head[8 + i] = name.charCodeAt(i)
    new DataView(head.buffer).setUint16(24, records.length)
    const body = new Uint8Array(records.length * recordBytes)
    records.forEach((r, i) => body.set(r, i * recordBytes))
    return [...head, ...body]
}
const be16 = (v) => [(v >> 8) & 0xff, v & 0xff]
const END = section(0, [], 8)

describe('ILDA round trip, one per format (generated fixtures)', () => {
    for (const format of ILDA_FORMATS) {
        it(`format ${format}: paths -> bytes -> paths keeps geometry to 1/32767 and colour to 1/255`, () => {
            const bytes = writeIlda([{ paths: [SQUARE, LINE], name: 'fix' }], { format })
            const read = readIlda(bytes)
            expect(read.ok).toBe(true)
            expect(read.ended).toBe(true)
            expect(read.frames).toHaveLength(1)
            expect(read.frames[0].format).toBe(format)
            expect(read.frames[0].name).toBe('fix')
            // Indexed formats carry their palette (format 2) ahead of the frame.
            expect(read.palettes).toHaveLength(format === 0 || format === 1 ? 1 : 0)
            expectPathsClose(ildaFrameToPaths(read.frames[0]), [SQUARE, LINE], 0.5 / 255 + 1e-9)
        })
    }

    it('3D formats keep z in the record (written 0) and 2D formats have none: record sizes 8, 6, 10, 8', () => {
        const sizes = {}
        for (const format of ILDA_FORMATS) {
            const one = writeIlda([{ paths: [{ p: [0, 0, 1, 1, 1], closed: false }] }], { format, palette: 'default' })
            // header + 2 records (a blank and a lit point) + end header
            sizes[format] = (one.length - 64) / 2
        }
        expect(sizes).toEqual({ 0: 8, 1: 6, 4: 10, 5: 8 })
    })

    it('several frames keep their order, numbers and total', () => {
        const frames = [0, 1, 2].map((i) => ({ paths: [{ p: [i / 10, 0, 1, 0, 0, i / 10, 0.5, 1, 0, 0], closed: false }], name: `f${i}` }))
        const read = readIlda(writeIlda(frames, { format: 4 }))
        expect(read.frames.map((f) => [f.name, f.number, f.total])).toEqual([['f0', 0, 3], ['f1', 1, 3], ['f2', 2, 3]])
        expect(ildaFrameToPaths(read.frames[2])[0].p[0]).toBeCloseTo(0.2, 4)
    })

    it('palette "default" writes no palette and picks each colour from DEFAULT_PALETTE', () => {
        const blue = DEFAULT_PALETTE[40].map((c) => c / 255)
        const bytes = writeIlda([{ paths: [{ p: [0, 0, ...blue, 0.5, 0, ...blue], closed: false }] }], { format: 1, palette: 'default' })
        const read = readIlda(bytes)
        expect(read.palettes).toHaveLength(0)
        expect(read.frames[0].points.filter((p) => !p.blank).map((p) => p.index)).toEqual([40, 40])
    })

    it('the last record of a frame carries the last-point bit and only it; blank moves carry the blank bit', () => {
        const read = readIlda(writeIlda([{ paths: [SQUARE, LINE] }], { format: 5 }))
        const pts = read.frames[0].points
        expect(pts.map((p) => p.last)).toEqual(pts.map((_, i) => i === pts.length - 1))
        // one blank at each path's entry: the square's 1 + 5 (closed, back to the start), the line's 1 + 3
        expect(pts.map((p) => p.blank)).toEqual([true, false, false, false, false, false, true, false, false, false])
    })

    it('refuses a frame over 65535 records rather than cutting it', () => {
        const p = []
        for (let i = 0; i < 70000; i += 1) p.push(0, 0, 1, 1, 1)
        expect(() => writeIlda([{ paths: [{ p, closed: false }] }], { format: 5 })).toThrow(/65535/)
        expect(() => writeIlda([], { format: 3 })).toThrow(/format 3/)
    })
})

describe('ILDA bytes built by hand (the layout, independent of the writer)', () => {
    it('format 5: x, y big-endian int16, then status, then b, g, r', () => {
        const bytes = new Uint8Array([
            ...section(5, [
                [...be16(-32767), ...be16(16384), 0x40, 0, 0, 0],          // blanked, (-1, 0.5)
                [...be16(32767), ...be16(16384), 0x80, 10, 20, 30],        // last, lit: b 10 g 20 r 30
            ], 8),
            ...END,
        ])
        const read = readIlda(bytes)
        expect(read.ok).toBe(true)
        const [a, b] = read.frames[0].points
        expect([a.x, a.y, a.blank, a.last]).toEqual([-32767, 16384, true, false])
        expect([b.r, b.g, b.b, b.last, b.blank]).toEqual([30, 20, 10, true, false])
        const paths = ildaFrameToPaths(read.frames[0])
        // the beam travels from the blanked point to the lit one: one path of two vertices, the lit colour
        expect(paths).toHaveLength(1)
        expect(paths[0].p.map((v) => Math.round(v * 1000) / 1000)).toEqual([-1, 0.5, 0.118, 0.078, 0.039, 1, 0.5, 0.118, 0.078, 0.039])
    })

    it('format 0 and 1 colour by the format-2 palette when the file has one, else by DEFAULT_PALETTE', () => {
        const pal = section(2, [[1, 2, 3], [200, 100, 50]], 3, 'pal')
        const f0 = section(0, [[...be16(0), ...be16(0), ...be16(500), 0x80, 1]], 8)
        const f1 = section(1, [[...be16(0), ...be16(0), 0x80, 40]], 6)
        const withPalette = readIlda(new Uint8Array([...pal, ...f0, ...END]))
        expect(withPalette.frames[0].points[0]).toMatchObject({ z: 500, index: 1, r: 200, g: 100, b: 50 })
        const without = readIlda(new Uint8Array([...f1, ...END]))
        expect(without.frames[0].points[0]).toMatchObject({ index: 40, r: 0, g: 0, b: 255 })
    })

    it('format 4: x y z, status, b g r — 10 bytes', () => {
        const read = readIlda(new Uint8Array([...section(4, [[...be16(100), ...be16(-100), ...be16(-7), 0x80, 1, 2, 3]], 10), ...END]))
        expect(read.frames[0].points[0]).toMatchObject({ x: 100, y: -100, z: -7, r: 3, g: 2, b: 1 })
    })
})

describe('ILDA refusals, each by name', () => {
    const good = writeIlda([{ paths: [LINE] }], { format: 5 })
    it.each([
        ['not-bytes', 'a string', 'ILDA'],
        ['not-ilda', 'a PNG signature', new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0])],
        ['truncated-header', 'a 20-byte header', good.slice(0, 20)],
        ['truncated-records', 'a frame cut in its records', good.slice(0, 32 + 8 * 2 + 3)],
        ['unknown-format', 'format 3 (not in revision 011)', new Uint8Array([...section(3, [[0, 0, 0]], 3), ...END])],
        ['no-frames', 'only a palette', new Uint8Array([...section(2, [[1, 2, 3]], 3), ...END])],
        ['no-frames', 'only the end header', new Uint8Array(END)],
        ['not-ilda', 'garbage after a section where a header must start', new Uint8Array([...section(5, [[0, 0, 0, 0x80, 0, 0, 0, 0].slice(0, 8)], 8), 1, 2, 3, 4, 5])],
    ])('%s: %s', (reason, _what, bytes) => {
        const read = readIlda(bytes)
        expect(read.ok).toBe(false)
        expect(read.reason).toBe(reason)
    })

    it('a file without the closing header is read and says so', () => {
        const read = readIlda(good.slice(0, good.length - 32))
        expect(read.ok).toBe(true)
        expect(read.ended).toBe(false)
    })

    it('knows an ILDA file by its first four bytes only', () => {
        expect(isIldaBytes(good)).toBe(true)
        expect(isIldaBytes(new TextEncoder().encode('<svg'))).toBe(false)
    })
})
