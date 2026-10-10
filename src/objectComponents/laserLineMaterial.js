// The shader for laserLine.js: each line of a laser (a static beam, or one sub-line of a scanned shape) is a
// ribbon facing the camera, as wide as the beam (√(a² + (φs)²)) or MIN_PIXELS pixels, whichever is wider.
// Its luminance is the line-source law L = σs(x)·p(θ)·Φ·T / (W·sinθ) with W the DRAWN width, so what a
// pixel sums is the beam's real intensity per unit length at any width (laserLine.js, 3.). The haze is the
// room's own field (hazeSigma, the beams' code: HAZE_FIELD_GLSL), T the well-mixed Beer–Lambert, p the
// Henyey–Greenstein phase with the room's g. A cross profile 1.5·(1 − u²) (mean 1) softens the ribbon's
// edges without changing its total. Added, tone-mapped with the room, like the beams (beamAirMaterial.js).
import { AdditiveBlending, BufferAttribute, BufferGeometry, DoubleSide, ShaderMaterial, Vector2 } from 'three'
import { HAZE_FIELD_GLSL } from './beamAirMaterial.js'
import { hazeUniformsFor } from './hazeUniforms.js'
import { MIN_PIXELS, MIN_SIN } from './laserLine.js'

const vertexShader = /* glsl */`
attribute vec3 aDir;
attribute float aS;
attribute float aSide;
attribute vec3 aFlux;
uniform float uPixelAngle;
uniform float uDiam;
uniform float uDiv;
uniform float uMinPx;
varying vec3 vWorld;
varying vec3 vDirW;
varying float vS;
varying float vW;
varying float vSide;
varying vec3 vFlux;
void main() {
    vec4 w = modelMatrix * vec4(aDir * aS, 1.0);
    vec3 dirW = normalize(mat3(modelMatrix) * aDir);
    vec3 toCam = cameraPosition - w.xyz;
    float dist = max(length(toCam), 1e-4);
    vec3 side = cross(dirW, toCam / dist);
    float sl = length(side);
    side = sl > 1e-5 ? side / sl : vec3(0.0, 1.0, 0.0);
    float beamW = sqrt(uDiam * uDiam + (uDiv * aS) * (uDiv * aS));
    float W = max(beamW, dist * uPixelAngle * uMinPx);
    w.xyz += side * aSide * 0.5 * W;
    vWorld = w.xyz;
    vDirW = dirW;
    vS = aS;
    vW = W;
    vSide = aSide;
    vFlux = aFlux;
    gl_Position = projectionMatrix * viewMatrix * w;
}
`

const fragmentShader = /* glsl */`
uniform float uG;
varying vec3 vWorld;
varying vec3 vDirW;
varying float vS;
varying float vW;
varying float vSide;
varying vec3 vFlux;
#include <common>
${HAZE_FIELD_GLSL}
float hgPhaseL(float c, float g) {
    float g2 = g * g;
    return (1.0 - g2) / (4.0 * PI * pow(max(1.0 + g2 - 2.0 * g * c, 1e-6), 1.5));
}
void main() {
    vec3 toCam = cameraPosition - vWorld;
    float d = max(length(toCam), 1e-4);
    // the scattering angle: between the light's direction and the direction to the eye
    float c = dot(vDirW, toCam / d);
    float sinT = max(sqrt(max(1.0 - c * c, 0.0)), ${MIN_SIN.toFixed(3)});
    float T = exp(-uFill * (vS + d));
    float across = 1.5 * (1.0 - vSide * vSide);
    vec3 radiance = hazeSigma(vWorld) * hgPhaseL(c, uG) * vFlux * T / (vW * sinT) * across;
    gl_FragColor = vec4(radiance, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
}
`

/** One ribbon per line, `stations` steps from the aperture to `length`. Lines: [{ dir, flux: [r,g,b] }]. */
export const laserLineGeometry = (lines, length, stations = 48) => {
    const per = (stations + 1) * 2
    const n = lines.length * per
    const dir = new Float32Array(n * 3)
    const s = new Float32Array(n)
    const side = new Float32Array(n)
    const flux = new Float32Array(n * 3)
    const index = []
    lines.forEach((line, li) => {
        for (let k = 0; k <= stations; k += 1) {
            // stations closer near the aperture, where the width changes fastest relative to itself
            const t = k / stations
            const at = length * t * t
            for (let e = 0; e < 2; e += 1) {
                const v = li * per + k * 2 + e
                dir.set(line.dir, v * 3)
                s[v] = at
                side[v] = e === 0 ? -1 : 1
                flux.set(line.flux, v * 3)
            }
            if (k < stations) {
                const a = li * per + k * 2
                index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2)
            }
        }
    })
    const g = new BufferGeometry()
    // the ribbon is widened in the vertex shader; position only gives the bounds (and three needs one)
    const position = new Float32Array(n * 3)
    for (let v = 0; v < n; v += 1) for (let k = 0; k < 3; k += 1) position[v * 3 + k] = dir[v * 3 + k] * s[v]
    g.setAttribute('position', new BufferAttribute(position, 3))
    g.setAttribute('aDir', new BufferAttribute(dir, 3))
    g.setAttribute('aS', new BufferAttribute(s, 1))
    g.setAttribute('aSide', new BufferAttribute(side, 1))
    g.setAttribute('aFlux', new BufferAttribute(flux, 3))
    g.setIndex(index)
    g.userData.vertsPerLine = per // read by the measurement API (beamsOf)
    g.userData.lineCount = lines.length
    g.computeBoundingSphere()
    if (g.boundingSphere) g.boundingSphere.radius += 1 // the ribbon's width
    return g
}

export const createLaserLineMaterial = (shared = hazeUniformsFor(null)) => new ShaderMaterial({
    uniforms: {
        uPixelAngle: { value: 0.001 },
        uDiam: { value: 0.004 },
        uDiv: { value: 0.001 },
        uMinPx: { value: MIN_PIXELS },
        uG: { value: 0.74 },
        ...shared
    },
    vertexShader,
    fragmentShader,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    side: DoubleSide,
    fog: false,
    toneMapped: true
})

const size = new Vector2()
/** Per draw: how many radians one pixel spans (vertical), so a line is never thinner than MIN_PIXELS. */
export const laserLineBeforeRender = (mesh, renderer, camera) => {
    const u = mesh.material?.uniforms
    if (!u || !camera?.isPerspectiveCamera) return
    renderer.getDrawingBufferSize(size)
    u.uPixelAngle.value = (2 * Math.tan((camera.fov * Math.PI) / 360)) / Math.max(size.y, 1) / Math.max(camera.zoom || 1, 1e-3)
}
