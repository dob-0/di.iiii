import { describe, expect, it } from 'vitest'
import { ShaderChunk } from 'three'

import { spotLightLoopInstalled, splitSpotLightLoop } from './spotLightLoop.js'

// three's own unroll step (WebGLProgram.js), restated so the test sees the
// shader text the GPU compiler gets.
const unroll = (s) => s.replace(
    /#pragma unroll_loop_start\s+for\s*\(\s*int\s+i\s*=\s*(\d+)\s*;\s*i\s*<\s*(\d+)\s*;\s*i\s*\+\+\s*\)\s*{([\s\S]+?)}\s+#pragma unroll_loop_end/g,
    (_, a, b, body) => Array.from({ length: +b - +a }, (_, k) => body.replace(/\[\s*i\s*\]/g, `[ ${+a + k} ]`).replace(/UNROLLED_LOOP_INDEX/g, +a + k)).join('')
)
const forRoom = (chunk, { spots, coords }) => unroll(chunk.replace(/NUM_SPOT_LIGHT_COORDS/g, coords).replace(/NUM_SPOT_LIGHTS/g, spots))

describe('spot lights in a loop', () => {
    it('is in place on three\'s shared chunk (a three upgrade that moves the text fails here)', () => {
        expect(spotLightLoopInstalled).toBe(true)
        expect(ShaderChunk.lights_fragment_begin).toContain('i = NUM_SPOT_LIGHT_COORDS; i < NUM_SPOT_LIGHTS;')
    })

    it('writes out only the lamps with a shadow or a light map; the rest share one loop', () => {
        const glsl = forRoom(ShaderChunk.lights_fragment_begin, { spots: 70, coords: 12 })
        expect(glsl.match(/spotLight = spotLights\[ \d+ \];/g)).toHaveLength(12)
        expect(glsl).toContain('spotShadowMap[ 11 ]')
        expect(glsl).not.toContain('spotLights[ 12 ]')
        expect(glsl).toContain('for ( int i = 12; i < 70; i ++ )')
    })

    it('leaves a room without shadows as one plain loop, and one with only shadowed lamps fully unrolled', () => {
        const none = forRoom(ShaderChunk.lights_fragment_begin, { spots: 8, coords: 0 })
        expect(none).not.toMatch(/spotLights\[ \d+ \]/)
        expect(none).toContain('for ( int i = 0; i < 8; i ++ )')
        const all = forRoom(ShaderChunk.lights_fragment_begin, { spots: 4, coords: 4 })
        expect(all.match(/spotLight = spotLights\[ \d+ \];/g)).toHaveLength(4)
        expect(all).toContain('for ( int i = 4; i < 4; i ++ )')
    })

    it('patches once and refuses a chunk it does not recognise', () => {
        const once = ShaderChunk.lights_fragment_begin
        expect(splitSpotLightLoop(once)).toBe(once)
        expect(splitSpotLightLoop('void main() {}')).toBeNull()
    })
})
