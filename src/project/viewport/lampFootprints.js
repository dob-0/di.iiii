// LAMP FOOTPRINTS — in Lite, every lamp shows where it lands. Pure.
//
// Owner (Gevorg, 2026-10-04): "we don't need high quality; the point is a useful, 100 %
// simulation". Lite's light pool (lightPool.js) carries the light ON the room with 4 real
// lights, so the other lamps drew their beams in the air but lit nothing: a look's floor
// read wrong. Here every rig lamp gets its light on the surfaces back, cheaply: ONE extra
// loop in the lit shaders over a small table of lamps (a float texture, 3 texels a lamp),
// bounded by a uniform (ANGLE on D3D11 unrolls constant-bound loops — moxir-previs-haze trap).
//
// The light is three's own diffuse term for a spot light, nothing invented: the cone's
// smooth edge (spotLightCone, as SpotLightObject fits a rig lamp's real light),
// getDistanceAttenuation (inverse square with the lamp's cutoff), N·L and BRDF_Lambert —
// so a footprint has the size, colour and brightness the Full renderer gives it, minus
// the shine (specular) and the shadows. A lamp a pool slot carries is left out while the
// slot holds it (scaled by 1 − the slot's envelope, so a hand-over never doubles or drops).

import { Color } from 'three'
import { spotAimDirection } from './spotLightAim.js'
import { spotLightCone } from '../../objectComponents/spotBeam.js'

export const FOOTPRINT_TEXELS = 3
export const FOOTPRINT_MAX = 256

const num = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d)

/** The rig lamps whose light a footprint carries: rig spot lights (a fixture), not pool slots. */
export const footprintLamps = (entities = []) => {
    const carried = new Map()
    for (const e of entities) {
        const pool = e?.components?.lightPool
        if (pool && pool.lamp) carried.set(pool.lamp, Math.max(carried.get(pool.lamp) || 0, num(pool.envelope)))
    }
    const out = []
    for (const e of entities) {
        if (e?.type !== 'spotLight' || !e.components?.fixture || e.components?.lightPool) continue
        if (e.components?.runtime?.visible === false) continue
        const light = e.components.light || {}
        const weight = 1 - Math.min(1, carried.get(e.id) || 0)
        const intensity = num(light.intensity) * weight
        if (!(intensity > 0)) continue
        out.push({ entity: e, intensity })
    }
    return out
}

/**
 * The lamps as rows of the footprint texture, RGBA float, FOOTPRINT_TEXELS texels a lamp:
 *   0: position x, y, z, cutoff distance (0 = none)
 *   1: aim x, y, z (unit), cos of the cone's outer edge
 *   2: colour × intensity (linear), cos of its inner edge
 * @returns {{ data: Float32Array, count: number }}
 */
export const packFootprints = (entities = [], max = FOOTPRINT_MAX) => {
    const lamps = footprintLamps(entities).slice(0, max)
    const data = new Float32Array(max * FOOTPRINT_TEXELS * 4)
    const colour = new Color()
    lamps.forEach(({ entity, intensity }, i) => {
        const t = entity.components.transform || {}
        const p = t.position || [0, 0, 0]
        const d = spotAimDirection(t.rotation || [0, 0, 0])
        const light = entity.components.light || {}
        const cone = spotLightCone({ angle: light.angle, penumbra: light.penumbra })
        colour.set(light.color || entity.components.appearance?.color || '#ffffff')
        const o = i * FOOTPRINT_TEXELS * 4
        data.set([num(p[0]), num(p[1]), num(p[2]), Math.max(0, num(light.distance))], o)
        data.set([d[0], d[1], d[2], Math.cos(cone.angle)], o + 4)
        data.set([colour.r * intensity, colour.g * intensity, colour.b * intensity, Math.cos(cone.angle * (1 - cone.penumbra))], o + 8)
    })
    return { data, count: lamps.length }
}

/** The GLSL added before three's `lights_fragment_end`: the diffuse light of every footprint lamp. */
export const FOOTPRINT_FRAGMENT = /* glsl */ `
#ifdef USE_LAMP_FOOTPRINTS
	for ( int fpI = 0; fpI < uFootprintCount; fpI ++ ) {
		vec4 fpA = texelFetch( uFootprints, ivec2( 0, fpI ), 0 );
		vec4 fpB = texelFetch( uFootprints, ivec2( 1, fpI ), 0 );
		vec4 fpC = texelFetch( uFootprints, ivec2( 2, fpI ), 0 );
		vec3 fpToLamp = ( viewMatrix * vec4( fpA.xyz, 1.0 ) ).xyz - geometryPosition;
		float fpDist = length( fpToLamp );
		vec3 fpL = fpToLamp / max( fpDist, 1e-4 );
		vec3 fpAim = normalize( ( viewMatrix * vec4( fpB.xyz, 0.0 ) ).xyz );
		float fpCone = smoothstep( fpB.w, fpC.w, dot( - fpL, fpAim ) );
		if ( fpCone <= 0.0 ) continue;
		float fpNdotL = saturate( dot( geometryNormal, fpL ) );
		if ( fpNdotL <= 0.0 ) continue;
		reflectedLight.directDiffuse += fpC.rgb * ( fpCone * getDistanceAttenuation( fpDist, fpA.w, 2.0 ) * fpNdotL ) * BRDF_Lambert( material.diffuseColor );
	}
#endif
`

export const FOOTPRINT_PARS = /* glsl */ `
#ifdef USE_LAMP_FOOTPRINTS
uniform highp sampler2D uFootprints;
uniform int uFootprintCount;
#endif
`

/**
 * Add the footprints to a material's program (onBeforeCompile's shader). Only a lit
 * material with three's light chunks takes it; any other is left as it is.
 * @returns {boolean} whether the shader was changed
 */
export const injectFootprints = (shader, uniforms) => {
    const fs = shader.fragmentShader
    if (!fs.includes('#include <lights_fragment_end>') || fs.includes('USE_LAMP_FOOTPRINTS')) return false
    shader.uniforms.uFootprints = uniforms.uFootprints
    shader.uniforms.uFootprintCount = uniforms.uFootprintCount
    shader.fragmentShader = `#define USE_LAMP_FOOTPRINTS\n${FOOTPRINT_PARS}\n${fs.replace('#include <lights_fragment_end>', `${FOOTPRINT_FRAGMENT}\n#include <lights_fragment_end>`)}`
    return true
}
