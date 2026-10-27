import jsQR from 'jsqr'
import { describe, expect, it } from 'vitest'
import { QR_LEVELS, QR_QUIET_ZONE, encodeQr, normaliseLevel, rasterQr } from './qrCode.js'

const sameBytes = (a, b) => a.length === b.length && a.every((value, i) => value === b[i])

// Read the picture back the way a phone would: decode its pixels.
const decode = (picture) => jsQR(new Uint8ClampedArray(picture.data), picture.width, picture.height)?.data ?? null

// A DataTexture's rows run bottom-up; flip them back to what the plane shows.
const asShown = (picture) => {
    const row = picture.width * 4
    const data = new Uint8Array(picture.data.length)
    for (let y = 0; y < picture.height; y += 1) {
        data.set(picture.data.subarray(y * row, (y + 1) * row), (picture.height - 1 - y) * row)
    }
    return { ...picture, data }
}

describe('encodeQr + rasterQr — round trip through a decoder', () => {
    const texts = [
        'https://dev.diiii.xyz',
        'https://example.org/open/jam?seat=12',
        'Ünïcode հայերեն ✓',
        `https://example.org/${'a'.repeat(400)}`,
    ]

    for (const level of QR_LEVELS) {
        it(`decodes back to the same text at level ${level}`, () => {
            for (const text of texts) {
                expect(decode(rasterQr(encodeQr(text, level))), `${level} ${text.slice(0, 30)}`).toBe(text)
            }
        })
    }

    // A decoder cannot prove orientation — jsQR reads a mirrored code too — so
    // the corners are checked directly: finders top-left, top-right and
    // bottom-left, none bottom-right.
    const isFinder = (grid, top, left) => {
        for (let r = 0; r < 7; r += 1) {
            for (let c = 0; c < 7; c += 1) {
                const ring = Math.max(Math.abs(r - 3), Math.abs(c - 3))
                if (grid.dark[(top + r) * grid.size + left + c] !== (ring === 2 ? 0 : 1)) return false
            }
        }
        return true
    }

    it('stands upright: the grid runs top-down, finders in three corners', () => {
        const grid = encodeQr('https://dev.diiii.xyz/open/jam', 'M')
        const far = grid.size - 7
        expect([isFinder(grid, 0, 0), isFinder(grid, 0, far), isFinder(grid, far, 0), isFinder(grid, far, far)])
            .toEqual([true, true, true, false])
    })

    it('drawn bottom-up for a texture, it is the upright picture row-flipped', () => {
        const text = 'https://dev.diiii.xyz/open/jam'
        const upright = rasterQr(encodeQr(text, 'M'))
        const texture = rasterQr(encodeQr(text, 'M'), { bottomUp: true })
        expect(sameBytes(asShown(texture).data, upright.data)).toBe(true)
        expect(sameBytes(texture.data, upright.data)).toBe(false)
        expect(decode(asShown(texture))).toBe(text)
    })

    it('keeps a four-module white border and whole-pixel modules', () => {
        const grid = encodeQr('https://dev.diiii.xyz', 'L')
        // 21 bytes at L fits version 2 (25 modules): 4*v + 17.
        expect(grid.size).toBe(25)
        const picture = rasterQr(grid)
        expect(picture.width).toBe((grid.size + 2 * QR_QUIET_ZONE) * picture.scale)
        expect(picture.width).toBeLessThanOrEqual(1024)
        const border = QR_QUIET_ZONE * picture.scale
        for (let y = 0; y < border; y += 1) {
            for (let x = 0; x < picture.width; x += 1) expect(picture.data[(y * picture.width + x) * 4]).toBe(255)
        }
        // The top-left finder's corner module is dark, right inside the border.
        expect(picture.data[(border * picture.width + border) * 4]).toBe(0)
    })

    it('a higher level is a bigger code for the same text', () => {
        const sizes = QR_LEVELS.map((level) => encodeQr('https://example.org/open/jam?seat=12', level).size)
        expect(sizes).toEqual([...sizes].sort((a, b) => a - b))
        expect(sizes[3]).toBeGreaterThan(sizes[0])
    })

    it('answers null for nothing, and for more than version 40 holds', () => {
        expect(encodeQr('', 'M')).toBeNull()
        expect(encodeQr(null, 'M')).toBeNull()
        // Version 40 at H holds 1273 bytes.
        expect(encodeQr('x'.repeat(1273), 'H')?.size).toBe(177)
        expect(encodeQr('x'.repeat(1274), 'H')).toBeNull()
        expect(rasterQr(null)).toBeNull()
    })

    it('reads an unknown level as M', () => {
        expect(normaliseLevel('h')).toBe('H')
        expect(normaliseLevel('Z')).toBe('M')
        expect(normaliseLevel(undefined)).toBe('M')
    })
})
