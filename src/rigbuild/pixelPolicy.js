// The pixel bars' per-pixel colours per look (owner N3956, 2026-11-12: "we build and we will share with them").
// Acme Pixel Line IP 117ch (library, EXACT): 5 control channels, 32 pixels as p01r..p32b, 16 whites cw01..cw16.
// Pure. A look with no entry in PIXEL_PATTERNS lights every pixel in the look's colour (the manual's way: the pixels carry the
// colour, the dimmer the level). A pattern is a name from PATTERNS; edit the table, re-run desk-load, undo = delete the entry.
export const PIXELS = 32
export const PIXEL_PATTERNS = Object.freeze({})  // e.g. { 'build-ice': 'ramp' } (PROPOSED by nobody yet: the owner writes the pixel scenes)

// brightness factor 0..1 of pixel i of n
export const PATTERNS = Object.freeze({
    uniform: () => 1,
    ramp: (i, n) => (i + 1) / n,                       // dark end to bright end
    centre: (i, n) => 1 - Math.abs((i + 0.5) / n - 0.5) * 1.6, // bright in the middle, dim at both ends
    alternate: (i) => (i % 2 === 0 ? 1 : 0.15)
})

/** n factors for the look `lookId` (`rig-<name>` or `<name>`). */
export const pixelFactors = (lookId, n = PIXELS) => {
    const id = String(lookId || '').replace(/^rig-/, '')
    const fn = PATTERNS[PIXEL_PATTERNS[id]] || PATTERNS.uniform
    return Array.from({ length: n }, (_, i) => Math.max(0, Math.min(1, fn(i, n))))
}
