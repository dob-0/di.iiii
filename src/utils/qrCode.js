// A QR code as SVG path data, for an address a phone should scan rather than
// type (src/landing/GuestAddressPanel.jsx).
//
// The encoding is not ours: `uqr` (unjs, MIT, zero dependencies, pinned in
// package.json) is a port of Project Nayuki's QR Code generator, the reference
// implementation of ISO/IEC 18004 most libraries are checked against. Ours is
// only the drawing, and the test decodes what we draw with an independent
// reader (jsQR) — a code is "working" when a reader gets the address back.
//
// Choices, each from the standard:
//   - error correction M (15 %): the usual level for a code on a screen;
//   - a quiet zone of 4 modules on every side, the width ISO/IEC 18004
//     requires around a code;
//   - dark modules on light, always, whatever the page theme: many readers do
//     not read inverted codes.
import { encode } from 'uqr'

export const QR_QUIET_ZONE = 4
export const QR_ECC = 'M'

/**
 * The module grid for `text`, quiet zone included: { size, data } where
 * data[y][x] is true for a dark module. null for empty text.
 */
export function qrModules(text) {
    const value = String(text || '')
    if (!value) return null
    const { size, data, version } = encode(value, { ecc: QR_ECC, border: QR_QUIET_ZONE })
    return { size, data, version }
}

/**
 * One path for every dark module, a horizontal run per `h` command, so a
 * version-3 code is a few hundred bytes of SVG instead of a rect per module.
 * Coordinates are in modules; the caller's viewBox is `0 0 size size`.
 */
export function qrPathData(data) {
    let d = ''
    for (let y = 0; y < data.length; y += 1) {
        const row = data[y]
        let x = 0
        while (x < row.length) {
            if (!row[x]) { x += 1; continue }
            let end = x
            while (end < row.length && row[end]) end += 1
            d += `M${x} ${y}h${end - x}v1h${x - end}z`
            x = end
        }
    }
    return d
}
