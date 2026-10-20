// AUTO EXPOSURE — the room seen the way a camera or an eye sees a show: it adapts.
// The room is calibrated at one exposure (renderSettings.toneMappingExposure, chosen
// against the §20 photographs of bright looks). A dark look — a few columns washed, the
// rest of the hall black — then stays near black on a screen, where a camera opens up and
// an eye adapts within a second or two (2026-10-01, owner: "too dark … not like a real
// simulation"). This pass measures the frame's average brightness on the GPU and scales
// the light, slowly, toward a normal key — inside limits, so a dark look still READS dark,
// just no darker than a camera would show it.
//
// The method is the standard one for real-time HDR (Reinhard et al., "Photographic Tone
// Reproduction", SIGGRAPH 2002 — the log-average "key"; temporal adaptation as in most
// engines' eye adaptation): log luminance → downsampled to 1 texel on the GPU → mixed
// with last frame's value at rate 1 − e^(−dt/τ) → a gain on the HDR buffer, applied
// before OutputPass's own exposure and tone mapping. No readback to the CPU (a 1-pixel
// readPixels still stalls the pipeline); the gain lives in a texture.
//
// Only in the half-float path (HdrBloom.jsx). In a headset the plain path renders as
// calibrated: an XR frame cannot run a composer.
import { HalfFloatType, LinearFilter, NearestFilter, RGBAFormat, ShaderMaterial, WebGLRenderTarget } from 'three'
import { FullScreenQuad, Pass } from 'three/examples/jsm/postprocessing/Pass.js'

// The defaults, each a choice stated:
export const EXPOSURE_KEY = 0.02 //  the log-average the gain aims the frame at, before the
//                                   room's own exposure. 0.045 was tried (PONYO, Known · full,
//                                   Floor): it opened "Columns from below" ×3 and showed the
//                                   whole hall flat under the work light — a lit warehouse, not
//                                   a show. 0.02 opens dark looks gently and keeps them dark.
export const GAIN_MIN = 0.5 //       a blinding look is held back at most one stop
export const GAIN_MAX = 3 //         a dark look is opened up at most ~1.6 stops: it still reads dark
export const ADAPT_TAU_S = 0.9 //    seconds to adapt (an eye adapts to dark slower; a camera ~1 s)

const quadVertex = /* glsl */`
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`

const target = (w, h) => new WebGLRenderTarget(w, h, { type: HalfFloatType, format: RGBAFormat, minFilter: NearestFilter, magFilter: NearestFilter, depthBuffer: false })

export class AutoExposurePass extends Pass {
    constructor({ key = EXPOSURE_KEY, min = GAIN_MIN, max = GAIN_MAX, tau = ADAPT_TAU_S } = {}) {
        super()
        this.needsSwap = true
        this.key = key
        this.min = min
        this.max = max
        this.tau = tau
        // the chain: the frame's log luminance at 64², then 16², 4², 1² (each texel the mean of 4×4)
        this.chain = [target(64, 64), target(16, 16), target(4, 4), target(1, 1)]
        this.adapted = [target(1, 1), target(1, 1)]
        this.flip = 0
        this.first = true
        this.logLum = new FullScreenQuad(new ShaderMaterial({
            uniforms: { tDiffuse: { value: null } },
            vertexShader: quadVertex,
            fragmentShader: /* glsl */`
uniform sampler2D tDiffuse;
varying vec2 vUv;
void main() {
    // 4 taps per 64² texel, spread over its footprint of the frame
    float s = 0.0;
    for (int i = 0; i < 4; i++) {
        vec2 o = (vec2(float(i - (i / 2) * 2), float(i / 2)) - 0.5) / 128.0;
        vec3 c = texture2D(tDiffuse, vUv + o).rgb;
        s += log(max(dot(c, vec3(0.2126, 0.7152, 0.0722)), 1e-5));
    }
    gl_FragColor = vec4(s * 0.25, 0.0, 0.0, 1.0);
}`
        }))
        this.down = new FullScreenQuad(new ShaderMaterial({
            uniforms: { tIn: { value: null }, uTexel: { value: 1 / 64 } },
            vertexShader: quadVertex,
            fragmentShader: /* glsl */`
uniform sampler2D tIn;
uniform float uTexel;
varying vec2 vUv;
void main() {
    float s = 0.0;
    for (int y = 0; y < 4; y++) for (int x = 0; x < 4; x++)
        s += texture2D(tIn, vUv + (vec2(float(x), float(y)) - 1.5) * uTexel).r;
    gl_FragColor = vec4(s / 16.0, 0.0, 0.0, 1.0);
}`
        }))
        this.adapt = new FullScreenQuad(new ShaderMaterial({
            uniforms: { tNow: { value: null }, tPrev: { value: null }, uRate: { value: 1 } },
            vertexShader: quadVertex,
            fragmentShader: /* glsl */`
uniform sampler2D tNow;
uniform sampler2D tPrev;
uniform float uRate;
varying vec2 vUv;
void main() {
    float now = texture2D(tNow, vec2(0.5)).r;
    float prev = texture2D(tPrev, vec2(0.5)).r;
    gl_FragColor = vec4(mix(prev, now, uRate), 0.0, 0.0, 1.0);
}`
        }))
        this.apply = new FullScreenQuad(new ShaderMaterial({
            uniforms: { tDiffuse: { value: null }, tLum: { value: null }, uKey: { value: key }, uMin: { value: min }, uMax: { value: max } },
            vertexShader: quadVertex,
            fragmentShader: /* glsl */`
uniform sampler2D tDiffuse;
uniform sampler2D tLum;
uniform float uKey;
uniform float uMin;
uniform float uMax;
varying vec2 vUv;
void main() {
    float avg = exp(texture2D(tLum, vec2(0.5)).r);
    float gain = clamp(uKey / max(avg, 1e-5), uMin, uMax);
    vec4 c = texture2D(tDiffuse, vUv);
    gl_FragColor = vec4(c.rgb * gain, c.a);
}`
        }))
        for (const t of this.chain) t.texture.minFilter = t.texture.magFilter = LinearFilter
    }

    render(renderer, writeBuffer, readBuffer, deltaTime) {
        const was = renderer.getRenderTarget()
        // 1. log luminance, 64²
        this.logLum.material.uniforms.tDiffuse.value = readBuffer.texture
        renderer.setRenderTarget(this.chain[0])
        this.logLum.render(renderer)
        // 2. down to one texel
        for (let i = 1; i < this.chain.length; i += 1) {
            this.down.material.uniforms.tIn.value = this.chain[i - 1].texture
            this.down.material.uniforms.uTexel.value = 1 / this.chain[i - 1].width
            renderer.setRenderTarget(this.chain[i])
            this.down.render(renderer)
        }
        // 3. adapt: the first frame takes the measure as it is; then e^(−dt/τ)
        const prev = this.adapted[this.flip]
        const next = this.adapted[1 - this.flip]
        const dt = Number.isFinite(deltaTime) && deltaTime > 0 ? Math.min(deltaTime, 0.5) : 1 / 60
        this.adapt.material.uniforms.uRate.value = this.first ? 1 : 1 - Math.exp(-dt / this.tau)
        this.adapt.material.uniforms.tNow.value = this.chain[this.chain.length - 1].texture
        this.adapt.material.uniforms.tPrev.value = prev.texture
        renderer.setRenderTarget(next)
        this.adapt.render(renderer)
        this.flip = 1 - this.flip
        this.first = false
        // 4. the gain on the frame
        const u = this.apply.material.uniforms
        u.tDiffuse.value = readBuffer.texture
        u.tLum.value = next.texture
        u.uKey.value = this.key
        u.uMin.value = this.min
        u.uMax.value = this.max
        renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer)
        this.apply.render(renderer)
        renderer.setRenderTarget(was)
    }

    dispose() {
        for (const t of [...this.chain, ...this.adapted]) t.dispose()
        for (const q of [this.logLum, this.down, this.adapt, this.apply]) { q.material.dispose(); q.dispose() }
    }
}

/** `renderSettings.exposure.auto` (default on in a room with bloom) and its limits, cleaned. */
export const autoExposureOf = (renderSettings) => {
    const e = renderSettings?.exposure
    if (e && typeof e === 'object' && e.auto === false) return null
    const num = (v, d) => (Number.isFinite(Number(v)) ? Number(v) : d)
    return {
        key: Math.max(num(e?.key, EXPOSURE_KEY), 1e-4),
        min: Math.max(num(e?.min, GAIN_MIN), 0.05),
        max: Math.max(num(e?.max, GAIN_MAX), 1),
        tau: Math.max(num(e?.tau, ADAPT_TAU_S), 0.05)
    }
}
