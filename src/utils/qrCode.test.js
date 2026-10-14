// @vitest-environment node
//
// A QR code is working when an independent reader gets the text back. The
// encoder is uqr (Nayuki's generator); the drawing is ours (qrPathData). So
// the test draws the code exactly as the page does — the same path data,
// rasterised module by module — and decodes it with jsQR, a separate
// implementation (Apache-2.0, dev-only).
import { describe, expect, it } from 'vitest'
import jsQR from 'jsqr'

import { QR_QUIET_ZONE, qrModules, qrPathData } from './qrCode.js'

// Rasterise the SVG path data (only M x y h w v1 h -w z runs) to RGBA, `scale`
// pixels per module, white ground — what a phone camera sees, minus the blur.
const rasterise = (size, d, scale = 4) => {
    const px = size * scale
    const rgba = new Uint8ClampedArray(px * px * 4).fill(255)
    for (const m of d.matchAll(/M(\d+) (\d+)h(\d+)v1h-\d+z/g)) {
        const [x0, y0, w] = [Number(m[1]), Number(m[2]), Number(m[3])]
        for (let y = y0 * scale; y < (y0 + 1) * scale; y += 1) {
            for (let x = x0 * scale; x < (x0 + w) * scale; x += 1) {
                const i = (y * px + x) * 4
                rgba[i] = 0; rgba[i + 1] = 0; rgba[i + 2] = 0
            }
        }
    }
    return { rgba, px }
}

const decode = (text) => {
    const qr = qrModules(text)
    const { rgba, px } = rasterise(qr.size, qrPathData(qr.data))
    return jsQR(rgba, px, px)?.data ?? null
}

describe('qrModules + qrPathData: a reader gets the address back', () => {
    it.each([
        'https://local.thedi.studio/',
        'https://local.thedi.studio:4000/',
        // a long space path: the old Light encoder (version 3, 42 bytes) refused this
        'https://festival-hall-2026.example.org/moxir/beta-v0-9?from=phone#touch'
    ])('decodes %s', (address) => {
        expect(decode(address)).toBe(address)
    })

    it('keeps a 4-module quiet zone on every side (ISO/IEC 18004)', () => {
        const { size, data } = qrModules('https://local.thedi.studio/')
        for (let i = 0; i < QR_QUIET_ZONE; i += 1) {
            expect(data[i].some(Boolean)).toBe(false)
            expect(data[size - 1 - i].some(Boolean)).toBe(false)
            expect(data.some((row) => row[i] || row[size - 1 - i])).toBe(false)
        }
        expect(data[QR_QUIET_ZONE][QR_QUIET_ZONE]).toBe(true) // the finder's corner
    })

    it('the path covers exactly the dark modules', () => {
        const { data } = qrModules('https://local.thedi.studio/')
        const dark = data.flat().filter(Boolean).length
        const drawn = [...qrPathData(data).matchAll(/h(\d+)v1/g)].reduce((n, m) => n + Number(m[1]), 0)
        expect(drawn).toBe(dark)
    })

    it('draws nothing for empty text', () => {
        expect(qrModules('')).toBeNull()
        expect(qrModules(null)).toBeNull()
    })
})
