// THE LENS AS A LIGHT SOURCE — what a camera (or an eye) sees when it looks at a lamp.
// Down the beam a lens is the brightest thing in the room: its luminance is the lamp's
// intensity spread over the lens, L = I / (π a²) (cd/m², in the scene's units — the same
// candela the beam in the air is drawn from, beamAir.js). Off the beam it falls as the
// beam's own profile (beamAir.js beamProfile: 50 % at the beam angle), down to a faint
// glow of the glass lit from inside. Drawn through the renderer's exposure and tone
// mapping like every lit surface, so bloom (HdrBloom.jsx) flares a lens exactly when it
// is aimed at the viewer — and a lens seen from the side stays a small dull disc.
// (Render audit F, 2026-10-01: lenses were unlit, ≤ 1 and not tone mapped — the haze in
// front of a lens outshone the lens, and bloom had no hot source.)
import { ShaderMaterial } from 'three'

// The glass seen from the side, as a fraction of the lamp's colour (ASSUMED: a faint
// inner glow, chosen so an off-beam lens reads about as before — a lit dot of its colour).
export const LENS_SIDE_GLOW = 0.35

/** Per-instance glow for one lamp: [L0, tanHalf, p] (L0 = I / (π a²), 0 when the lamp is off). */
export const lensGlowOf = ({ intensity, aperture, angle, penumbra, on = true }) => {
    const I = Math.max(0, Number(intensity) || 0)
    const a = Number(aperture) > 0 ? Number(aperture) : 0.05
    const tanHalf = Math.tan(Math.min(Math.max(Number(angle) || 0.52, 0.001), Math.PI / 2 - 0.01))
    const edge = Math.min(1, Math.max(0.2, Number(penumbra) || 0))
    return [on ? I / (Math.PI * a * a) : 0, tanHalf, 2 + 6 * (1 - edge)]
}

/** The lens's luminance seen from a direction: the JS twin of the shader (tests). */
export const lensLuminance = ([L0, tanHalf, p], cosView, side = LENS_SIDE_GLOW) => {
    if (cosView <= 0) return side
    const tanT = Math.sqrt(Math.max(1 - cosView * cosView, 0)) / cosView
    return L0 * Math.exp(-Math.LN2 * (tanT / Math.max(tanHalf, 1e-4)) ** p) + side
}

export const createLensMaterial = () => new ShaderMaterial({
    uniforms: { uSide: { value: LENS_SIDE_GLOW } },
    vertexShader: /* glsl */`
attribute vec3 aGlow; // L0, tanHalf, p
attribute vec3 aDir;  // the beam's direction, world
varying vec3 vGlow;
varying vec3 vDir;
varying vec3 vWorldPos;
varying vec3 vCol;
void main() {
    vec4 wp = modelMatrix * instanceMatrix * vec4(position, 1.0);
    vWorldPos = wp.xyz;
    vGlow = aGlow;
    vDir = aDir;
#ifdef USE_INSTANCING_COLOR
    vCol = instanceColor;
#else
    vCol = vec3(1.0);
#endif
    gl_Position = projectionMatrix * viewMatrix * wp;
}
`,
    fragmentShader: /* glsl */`
uniform float uSide;
varying vec3 vGlow;
varying vec3 vDir;
varying vec3 vWorldPos;
varying vec3 vCol;
#include <common>
void main() {
    vec3 v = normalize(cameraPosition - vWorldPos);
    float c = dot(normalize(vDir), v);
    float lum = uSide;
    if (c > 0.0) {
        float tanT = sqrt(max(1.0 - c * c, 0.0)) / c;
        lum += vGlow.x * exp(-0.693147 * pow(tanT / max(vGlow.y, 1e-4), vGlow.z));
    }
    gl_FragColor = vec4(vCol * lum, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
}
`,
    toneMapped: true
})
