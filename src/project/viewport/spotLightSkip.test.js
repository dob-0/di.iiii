import { describe, expect, it } from 'vitest'
import { ShaderChunk } from 'three'

import { skipUnlitSpotLights, spotLightSkipInstalled } from './spotLightSkip.js'

// three's own unroll step (WebGLProgram.js), restated so the test sees the
// shader text the GPU compiler gets.
const unroll = (s) => s.replace(
    /#pragma unroll_loop_start\s+for\s*\(\s*int\s+i\s*=\s*(\d+)\s*;\s*i\s*<\s*(\d+)\s*;\s*i\s*\+\+\s*\)\s*{([\s\S]+?)}\s+#pragma unroll_loop_end/g,
    (_, a, b, body) => Array.from({ length: +b - +a }, (_, k) => body.replace(/\[\s*i\s*\]/g, `[ ${+a + k} ]`).replace(/UNROLLED_LOOP_INDEX/g, +a + k)).join('')
)
const forRoom = (chunk, spots) => unroll(chunk.replace(/NUM_SPOT_LIGHTS/g, spots))

describe('spot lights skipped where they cannot reach', () => {
    it('is in place on three\'s shared chunk (a three upgrade that moves the text fails here)', () => {
        expect(spotLightSkipInstalled).toBe(true)
    })

    it('guards every lamp\'s lighting and shadow lookup by its cone, and keeps them written out', () => {
        const glsl = forRoom(ShaderChunk.lights_fragment_begin, 70)
        expect(glsl.match(/spotLight = spotLights\[ \d+ \];/g)).toHaveLength(70)
        expect(glsl.match(/if \( directLight\.visible \) RE_Direct\(/g).length).toBeGreaterThanOrEqual(70)
        expect(glsl.match(/if \( directLight\.visible && receiveShadow \) directLight\.color \*= getShadow\( spotShadowMap\[ \d+ \]/g)).toHaveLength(70)
        const spots = glsl.slice(glsl.indexOf('spotLight = spotLights[ 0 ]'), glsl.lastIndexOf('spotLight = spotLights[ 69 ]') + 2000)
        expect(spots).not.toContain('spotShadowMap[ 0 ], spotLightShadow.shadowMapSize, spotLightShadow.shadowIntensity, spotLightShadow.shadowBias, spotLightShadow.shadowRadius, vSpotLightCoord[ 0 ] ) : 1.0;')
    })

    it('leaves the other light kinds alone', () => {
        const stock = ShaderChunk.lights_fragment_begin
        const point = (s) => s.slice(s.indexOf('NUM_POINT_LIGHTS > 0'), s.indexOf('NUM_SPOT_LIGHTS > 0'))
        expect(point(stock)).not.toContain('if ( directLight.visible )')
    })

    it('patches once and refuses a chunk it does not recognise', () => {
        const once = ShaderChunk.lights_fragment_begin
        expect(skipUnlitSpotLights(once)).toBe(once)
        expect(skipUnlitSpotLights('void main() {}')).toBeNull()
    })
})
