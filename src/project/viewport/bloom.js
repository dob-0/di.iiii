// `renderSettings.bloom` — the room drawn in high dynamic range with a glow around its
// brightest light (HdrBloom.jsx has the why). Off unless a room asks:
//   { enabled: true, strength 0..1 (0.03), radius 0..1 (0.4), threshold > 0 (1) }
//
// The strength is SMALL on purpose. In a half-float buffer a beam's core is thousands of
// times the screen's white, and three's bloom adds its blurred light back about three
// times over (five scales, weights 1 … 0.2) × strength. A lens or an eye spreads only a
// few percent of a light into its glow (CIE 146: the veil is a few % of the source's
// light at a degree off), so 0.6 — three's own default, made for 0..1 colour — washed
// MOXIR's hall white. Seen on ponyo's RTX 5060 (Known · full, DJ view): 0.01 crisp,
// 0.03 the lamps blooming into the haze as a camera shows them, 0.08 already milky.
// And NOT a high threshold with a stronger glow (tried: strength 0.3, threshold 20 —
// the far hall went milky): the beams sit thousands of times above any threshold that
// keeps the walls out, so what passes is still a flood. A low strength with no effective
// threshold IS a lens's point-spread: every pixel gives up a few percent, the walls
// (near 1) visibly nothing, the beams a glow. Do not "fix" it back to 0.6.
// `threshold` is in the screen's terms: light that the exposure takes past about white
// starts to glow. Returns null when the room has no bloom.
const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n))
const num = (n, fallback) => (Number.isFinite(Number(n)) ? Number(n) : fallback)

export const bloomOf = (renderSettings) => {
    const b = renderSettings?.bloom
    if (!b || typeof b !== 'object' || b.enabled !== true) return null
    return {
        strength: clamp(num(b.strength, 0.03), 0, 1),
        radius: clamp(num(b.radius, 0.4), 0, 1),
        threshold: clamp(num(b.threshold, 1), 0.01, 100)
    }
}
