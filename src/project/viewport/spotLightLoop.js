// SPOT LIGHTS IN A LOOP — why a room with 70 real lamps froze for seconds.
//
// three.js writes every spot light out longhand in each lit shader: its
// `#pragma unroll_loop_start` turns the light loop into one copy of the body
// per lamp. In MOXIR's hall that is 70 copies in every lit material, and Chrome
// on Windows (ANGLE → Direct3D 11) takes 2.2–3.6 s to compile each one. The
// page is frozen while it does: ~30 s of stutter on load, ~6 s on the first
// X-ray (measured 2026-10-03 on the RTX 5060).
//
// Only the lamps that sample a texture need the longhand form: GLSL ES 3.0 may
// index a sampler array by a constant only, so a lamp with a shadow map or a
// light map needs its own copy. three already sorts spot lights so those come
// first ([shadows with maps, shadows, maps, none]) and counts them as
// NUM_SPOT_LIGHT_COORDS. So the loop is split there: the first
// NUM_SPOT_LIGHT_COORDS lamps stay unrolled exactly as three wrote them, and
// the rest — lamps that only add light — run in a plain loop with the same
// body minus the two texture branches they never took. Same light on every
// surface; the frame shader compiles in ~0.6 s instead of ~2.1 s.
//
// The patch is applied once, on import, to three's shared ShaderChunk. If a
// three upgrade changes the chunk, the original text is not found, nothing is
// patched, and spotLightLoop.test.js fails — so the upgrade gets a look rather
// than a silent return of the freeze.

import { ShaderChunk } from 'three'

// three's spot loop, matched loosely: the built bundle drops the blank lines.
const UNROLLED_HEAD = /#pragma unroll_loop_start\s+for \( int i = 0; i < NUM_SPOT_LIGHTS; i \+\+ \) \{\s+spotLight = spotLights\[ i \];/
const UNROLLED_TAIL = /RE_Direct\( directLight, [^;]*\);\s*\}\s*#pragma unroll_loop_end/

const PLAIN_LOOP = `

	// lamps with no shadow and no light map: a plain loop (see spotLightLoop.js)
	for ( int i = NUM_SPOT_LIGHT_COORDS; i < NUM_SPOT_LIGHTS; i ++ ) {

		spotLight = spotLights[ i ];

		getSpotLightInfo( spotLight, geometryPosition, directLight );

		RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );

	}`

const MARK = 'see spotLightLoop.js'

/**
 * The lights chunk with the spot loop split, or null when the chunk is not the
 * one this patch was written against.
 *
 * @param {string} chunk three's `lights_fragment_begin`
 * @returns {string|null}
 */
export const splitSpotLightLoop = (chunk) => {
    if (typeof chunk !== 'string') return null
    if (chunk.includes(MARK)) return chunk
    const head = chunk.search(UNROLLED_HEAD)
    if (head < 0) return null
    const tail = UNROLLED_TAIL.exec(chunk.slice(head))
    if (!tail) return null
    const end = head + tail.index + tail[0].length
    const unrolled = chunk.slice(head, end).replace('i < NUM_SPOT_LIGHTS;', 'i < NUM_SPOT_LIGHT_COORDS;')
    return chunk.slice(0, head) + unrolled + PLAIN_LOOP + chunk.slice(end)
}

/** Patch three's shared chunk once. Returns whether the split loop is in place. */
export const installSpotLightLoop = () => {
    const patched = splitSpotLightLoop(ShaderChunk.lights_fragment_begin)
    if (!patched) return false
    ShaderChunk.lights_fragment_begin = patched
    return true
}

export const spotLightLoopInstalled = installSpotLightLoop()
