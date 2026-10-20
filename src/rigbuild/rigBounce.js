// THE LIGHT THAT COMES BACK — a hall at night with no work light is black except
// for what the rig's own light returns off its floor, walls and roof. This is that
// return, as one ambient term, from the lamps the room is drawing right now (so the
// red room glows faintly red, the one-beam blackout is nearly black, the white
// cathedral lifts the whole hall a little). RIG_BUILD.md §20.
//
// The model is the integrating-sphere relation for the mean illuminance an
// enclosure's walls get from their own inter-reflections (Labsphere, "A Guide to
// Integrating Sphere Theory and Applications", sphere multiplier ρ/(1−ρ); the same
// flux-transfer idea as the lumen method's room-surface term):
//
//     E_bounce = Φ · ρ / (A · (1 − ρ))
//
//   Φ  the flux the lamps put into the room: Σ I·Ω, each lamp's candela over its
//      beam's solid angle Ω = 2π(1 − cos θ) (a uniform cone — the same
//      approximation rig-lib.mjs uses for photometry), at the level it is drawn
//   ρ  the enclosure's mean reflectance, A its inner surface area — both measured
//      from the hall's own model by the data script (components.rigBounce)
//
// three.js (r155+) lights a surface with an AmbientLight's colour × intensity as
// IRRADIANCE, the same unit as a SpotLight's I/d², so E_bounce is the intensity.
// Limits, stated: the hall is treated as one enclosure evenly lit by its returns
// (a real hall is brighter near the lit surfaces and darker far away); a lamp's
// light that lands outside (up through a skylight) is still counted.

const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n))

/**
 * THE HAZE'S OWN GLOW, as a factor on the wall return. The air between the beams is lit by
 * two kinds of diffuse light: what the walls send back (ρ of the flux, the bounce above) and
 * what the haze itself scatters out of the beams before they reach a wall — the fraction
 * 1 − e^(−τ) of the flux, with τ = σ · 4V/A the haze's optical depth over the enclosure's
 * mean chord (4V/A, the mean free path of a straight line in a convex volume — Cauchy).
 * The beam shader draws the first scatter INSIDE each cone; this is that light after it
 * has left the cone, spread through the hall. Seen through enough haze, the air's radiance
 * is the diffuse field's: (ρ + 1 − e^(−τ)) · Φ / (π A (1 − ρ)) — so the factor on
 * E_bounce/π (which is ρ · Φ / (π A (1 − ρ))) is (ρ + 1 − e^(−τ)) / ρ.
 * (Photo research 2026-10-01: in hazed halls the air between beams sits at 10–20 % code,
 * tinted the show's colour — the walls' return alone left it near black. Model agreed with
 * emily-9f, who measured the hall's one air: V 186 890 m³, A 28 605 m², τ ≈ 1.3 at σ 0.05.)
 */
export const hazeGlowFactor = (spec, sigma) => {
    if (!spec?.volume || !(sigma > 0)) return 1
    const tau = (sigma * 4 * spec.volume) / spec.area
    return (spec.reflectance + (1 - Math.exp(-tau))) / spec.reflectance
}

/** The room's enclosure, from `components.rigBounce` on any entity, or null. */
export const bounceSpecOf = (entities = []) => {
    for (const e of entities) {
        const b = e?.components?.rigBounce
        if (!b) continue
        const area = Number(b.area_m2)
        const reflectance = Number(b.reflectance)
        // volume_m3 (realism.mjs enclosureOf, 2026-10-01): the hall's one air, for the haze glow
        const volume = Number(b.volume_m3) > 0 ? Number(b.volume_m3) : null
        if (area > 0 && reflectance > 0 && reflectance < 1) return { area, reflectance: clamp(reflectance, 0.01, 0.95), ...(volume ? { volume } : {}) }
    }
    return null
}

const hexToLinear = (hex) => {
    const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || ''))
    const n = m ? parseInt(m[1], 16) : 0xffffff
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
        const c = v / 255
        return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
    })
}
const linearToHex = (rgb) => `#${rgb.map((c) => {
    const v = c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055
    return Math.round(clamp(v, 0, 1) * 255).toString(16).padStart(2, '0')
}).join('')}`

/**
 * The bounce the drawn lamps give: { intensity (irradiance, lux-equivalent in the
 * scene's units), color (hex), flux (scene lumens, luminous) }. three.js lights per
 * channel with colour × intensity, so the sum is kept per channel — Σ I·Ω·rgb —
 * and handed over as its peak channel (intensity) and the ratio (colour): the red
 * room returns red. Strobes and blinders (`rigFlash`) are left out: their light is
 * a flash (RigFlashes), not a level the room holds.
 */
export const bounceOf = (entities = [], spec) => {
    if (!spec) return null
    const sum = [0, 0, 0]
    let flux = 0
    for (const e of entities) {
        if (e?.type !== 'spotLight') continue
        const c = e.components || {}
        if (c.rigFlash) continue
        const light = c.light || {}
        const intensity = Number(light.intensity)
        if (!(intensity > 0)) continue
        const half = clamp(Number(light.angle) || 0.52, 0.001, Math.PI / 2)
        const phi = intensity * 2 * Math.PI * (1 - Math.cos(half))
        const rgb = hexToLinear(light.color)
        for (let k = 0; k < 3; k += 1) sum[k] += phi * rgb[k]
        flux += phi * (0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2])
    }
    const peak = Math.max(...sum)
    if (!(peak > 0)) return { intensity: 0, color: '#000000', flux: 0 }
    const { area, reflectance: rho } = spec
    const k = rho / (area * (1 - rho))
    return {
        intensity: Math.round(peak * k * 1e5) / 1e5,
        color: linearToHex(sum.map((v) => v / peak)),
        flux: Math.round(flux)
    }
}
