// SURFACES DIMMED BY THE SAME HAZE AS THE BEAMS — Beer–Lambert, not a linear fog.
//
// Light from a surface d metres away crosses d metres of haze: by Beer–Lambert it arrives with the
// fraction T = exp(−σt·d) (σt = σs for a haze, single-scattering albedo ≈ 1). The beams already use
// exactly that (beamAir.js, beamAirMaterial.js: exp(−uFill·(s + λ))). The surfaces used three.js's fog,
// a smoothstep from `near` to `far` (60…250 m on dev): a wall 60 m away kept all its light where
// Beer–Lambert at the beams' σ = 0.02 /m leaves it 30 % (MOXIR simulation audit §0 point 4, §2.5).
//
// THE MECHANISM: three.js has two fogs (smoothstep `Fog`, and `FogExp2` = exp(−(ρd)²) — neither is
// Beer–Lambert). Its fog chunk is patched once, globally, to add a third law selected by the fog's own
// numbers: `far < near` (meaningless for three's smoothstep fog: GLSL leaves smoothstep undefined when
// edge0 ≥ edge1, so no working scene uses it) means
//
//     fogFactor = 1 − exp(−max(d − near, 0) / (near − far)),   i.e. σ = 1/(near − far), starting at `near`
//
// with d the true distance from the eye (the length of the view-space position, not three's depth −z).
// So SmartView's "the fog stands back" (it adds one offset to near and to far, smartViewGeometry.js)
// still composes: the haze then starts at the building's edge. The fog colour is the room's background:
// the light the haze scatters INTO the view from the dark hall's diffuse light is taken as ≈ 0 (a dark
// hall); the beams draw their own in-scattered light.
//
// Limits, stated: the light's path from the lamp TO the surface is not dimmed here (exp(−σ·d_lamp)); at
// the kit's estimated σ ≈ 3·10⁻⁴ /m that is under 2 % at 60 m, at dev's 0.02 /m it would be 70 %. Owed:
// a per-light term in the light shader. The haze is the well-mixed one (σ of the fill), not the plume.

import { ShaderChunk } from 'three'

export const BEER_LAMBERT_MARK = '/* di.iiii beer-lambert fog */'

/** The fog distances that ask the patched chunk for Beer–Lambert at σ (1/m), starting at `start` metres. */
export const beerLambertFog = (sigma, start = 0) => {
    const s = Number(sigma)
    if (!(s > 0)) return null
    return { near: start, far: start - 1 / s }
}

/** The σ a fog's distances stand for under the patched chunk, or null (an ordinary smoothstep fog). */
export const sigmaOfFog = (near, far) => (Number(far) < Number(near) ? 1 / (Number(near) - Number(far)) : null)

/** The patched fog's factor (the share of the fog colour) at a distance — the GLSL, in JS, for the tests. */
export const fogFactorAt = (d, near, far) => {
    const sigma = sigmaOfFog(near, far)
    if (sigma !== null) return 1 - Math.exp(-Math.max(d - near, 0) * sigma)
    const t = Math.min(1, Math.max(0, (d - near) / (far - near)))
    return t * t * (3 - 2 * t)
}

const FRAGMENT = /* glsl */`${BEER_LAMBERT_MARK}
#ifdef USE_FOG

	#ifdef FOG_EXP2

		float fogFactor = 1.0 - exp( - fogDensity * fogDensity * vFogDepth * vFogDepth );

	#else

		// far < near: Beer–Lambert, σ = 1 / (near − far), from \`near\` on, along the true distance
		float fogFactor = fogFar < fogNear
			? 1.0 - exp( - max( length( vFogView ) - fogNear, 0.0 ) / ( fogNear - fogFar ) )
			: smoothstep( fogNear, fogFar, vFogDepth );

	#endif

	gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, fogFactor );

#endif
`

const PARS_FRAGMENT = /* glsl */`
#ifdef USE_FOG

	uniform vec3 fogColor;
	varying float vFogDepth;
	varying vec3 vFogView;

	#ifdef FOG_EXP2

		uniform float fogDensity;

	#else

		uniform float fogNear;
		uniform float fogFar;

	#endif

#endif
`

const PARS_VERTEX = /* glsl */`
#ifdef USE_FOG

	varying float vFogDepth;
	varying vec3 vFogView;

#endif
`

const VERTEX = /* glsl */`
#ifdef USE_FOG

	vFogDepth = - mvPosition.z;
	vFogView = mvPosition.xyz;

#endif
`

/**
 * Patch three's fog chunks once (idempotent). Must run before the first program is compiled — it is
 * called when RenderSettingsEffect.jsx is imported. A program compiled earlier keeps three's chunk.
 */
export const installBeerLambertFog = (chunks = ShaderChunk) => {
    if (String(chunks.fog_fragment || '').startsWith(BEER_LAMBERT_MARK)) return false
    chunks.fog_fragment = FRAGMENT
    chunks.fog_pars_fragment = PARS_FRAGMENT
    chunks.fog_pars_vertex = PARS_VERTEX
    chunks.fog_vertex = VERTEX
    return true
}
