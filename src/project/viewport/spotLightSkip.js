// SPOT LIGHTS SKIPPED WHERE THEY CANNOT REACH — the same picture for less work.
//
// three's lit shaders run the full lighting model (`RE_Direct`, the GGX BRDF)
// for every spot light on every pixel, and sample that lamp's shadow map, even
// where `getSpotLightInfo` has already found the pixel outside the cone and set
// `directLight.visible = false` with a zero colour. In a rig room that is most
// of the work: MOXIR has 70 real lamps with narrow beams, so nearly every pixel
// sits outside nearly every cone, and each wasted lamp costs a BRDF plus, for
// the 12 shadowed ones, a PCF shadow lookup.
//
// The patch puts both behind `if ( directLight.visible )`. What it skips was
// already multiplied by zero, so the image does not change; neighbouring pixels
// take the same branch, so the GPU really does skip it. Measured 2026-10-03 on
// /moxir (RTX 5060, DPR 2, haze + bloom + shadows): the main scene pass went
// from 9.1 ms to 5.5 ms a frame.
//
// Tried first and dropped: running the shadowless lamps in a plain loop instead
// of three's longhand copies. It compiles 3.5× faster on ANGLE/Direct3D 11 but
// ran 3× slower (35 ms) — Direct3D indexes the uniform light array badly in a
// loop. The longhand copies compile slowly (seconds per lit material), which
// shaderWarmup.js keeps off the main thread, and Chrome caches the result.
//
// Applied once, on import, to three's shared ShaderChunk. If a three upgrade
// changes the chunk, the text is not found, nothing is patched, and
// spotLightSkip.test.js fails — the upgrade gets a look.

import { ShaderChunk } from 'three'

// three's spot loop, matched loosely: the built bundle drops the blank lines.
const SPOT_LOOP = /for \( int i = 0; i < NUM_SPOT_LIGHTS; i \+\+ \) \{[\s\S]*?#pragma unroll_loop_end/
const SHADOW = /directLight\.color \*= \( directLight\.visible && receiveShadow \) \? (getShadow\( spotShadowMap\[ i \][^;]*?) : 1\.0;/
const DIRECT = /(\n\s*)(RE_Direct\( directLight, [^;]*\);)/

const MARK = 'if ( directLight.visible ) RE_Direct'

/**
 * The lights chunk with spot lights skipped outside their cone, or null when
 * the chunk is not the one this patch was written against.
 *
 * @param {string} chunk three's `lights_fragment_begin`
 * @returns {string|null}
 */
export const skipUnlitSpotLights = (chunk) => {
    if (typeof chunk !== 'string') return null
    if (chunk.includes(MARK)) return chunk
    const loop = SPOT_LOOP.exec(chunk)
    if (!loop || !SHADOW.test(loop[0]) || !DIRECT.test(loop[0])) return null
    const patched = loop[0]
        .replace(SHADOW, 'if ( directLight.visible && receiveShadow ) directLight.color *= $1;')
        .replace(DIRECT, '$1if ( directLight.visible ) $2')
    return chunk.slice(0, loop.index) + patched + chunk.slice(loop.index + loop[0].length)
}

/** Patch three's shared chunk once. Returns whether the skip is in place. */
export const installSpotLightSkip = () => {
    const patched = skipUnlitSpotLights(ShaderChunk.lights_fragment_begin)
    if (!patched) return false
    ShaderChunk.lights_fragment_begin = patched
    return true
}

export const spotLightSkipInstalled = installSpotLightSkip()
