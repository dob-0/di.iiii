// The shader for laserLine.js: each line of a laser (a static beam, or one sub-line of a scanned shape) is a
// ribbon facing the camera that carries two profiles across it (laserLine.js 7., coreHalo — the same arithmetic):
//   the CORE, as wide as the beam (√(a² + (φs)²)) or MIN_CORE_PX pixels, whichever is wider, a hard box with a
//   one-pixel ramp at its edges, carrying (1 − haloShare) of the line's light; and
//   the HALO, a Gaussian of haloRadiusCapped (Fermi–Eyges, held under half the gap to the next line of its own fan,
//   aSpacing) carrying haloShare = 1 − exp(−σs·s).
// What a pixel row sums is the line-source law I = σs(x)·p(θ)·Φ·T / sinθ at any width (laserLine.js, 3.). The haze is
// the room's own field (hazeSigma, the beams' code: HAZE_FIELD_GLSL), T the well-mixed Beer–Lambert, p the
// Henyey–Greenstein phase with the room's g. A line far above white tone-maps to a white core with its colour in the
// halo, as a laser in haze reads on camera (the owner's look, 2026-10-15). The lines are drawn AFTER the bloom
// (laserOverBloom.js): a glow would merge lines an eye separates. Added, like the beams (beamAirMaterial.js).
// The END SPOT (laserLine.js 8.) is a second, small material: a dot on the first surface, its own luminance.
import { AdditiveBlending, BufferAttribute, BufferGeometry, DoubleSide, ShaderMaterial, Vector2 } from 'three'
import { HAZE_FIELD_GLSL } from './beamAirMaterial.js'
import { hazeUniformsFor } from './hazeUniforms.js'
import { HALO_SPACING_CAP, LONE_LINE_SPACING_RAD, MIN_CORE_PX, MIN_SIN, SPOT_ALBEDO } from './laserLine.js'

const vertexShader = /* glsl */`
attribute vec3 aDir;
attribute float aS;
attribute float aSide;
attribute vec3 aFlux;
attribute float aSpacing;
uniform float uPixelAngle;
uniform float uDiam;
uniform float uDiv;
uniform float uMinPx;
uniform float uG;
uniform float uFill;
varying vec3 vWorld;
varying vec3 vDirW;
varying float vS;
varying float vX;
varying vec3 vFlux;
varying float vCoreW;
varying float vHaloR;
varying float vShare;
varying float vPx;
void main() {
    vec4 w = modelMatrix * vec4(aDir * aS, 1.0);
    vec3 dirW = normalize(mat3(modelMatrix) * aDir);
    vec3 toCam = cameraPosition - w.xyz;
    float dist = max(length(toCam), 1e-4);
    vec3 side = cross(dirW, toCam / dist);
    float sl = length(side);
    side = sl > 1e-5 ? side / sl : vec3(0.0, 1.0, 0.0);
    float px = dist * uPixelAngle;
    // laserLine.js coreWidth, haloShare, haloRadiusCapped — the same formulas
    float beamW = sqrt(uDiam * uDiam + (uDiv * aS) * (uDiv * aS));
    float coreW = max(beamW, px * uMinPx);
    float share = 1.0 - exp(-max(uFill, 0.0) * aS);
    float g = clamp(uG, -0.95, 0.95);
    float r0 = sqrt((2.0 / 3.0) * max(uFill, 0.0) * 2.0 * (1.0 - g) * aS * aS * aS);
    // never narrower than half a pixel, or the Gaussian falls between pixels (its light is kept: it is normalised)
    float r = max(min(r0, ${HALO_SPACING_CAP.toFixed(3)} * aSpacing * aS), 0.5 * px);
    // the ribbon spans the core and its one-pixel ramps, and the halo to ±3r (99.7 % of it)
    float W = max(coreW + 2.0 * px, 6.0 * r);
    w.xyz += side * aSide * 0.5 * W;
    vWorld = w.xyz;
    vDirW = dirW;
    vS = aS;
    // the signed distance from the axis, in metres, as ONE varying: it is affine across the ribbon's plane, so the GPU
    // interpolates it exactly. Interpolating aSide and W apart and multiplying them (before 2026-10-15) bent the core at
    // every station of a wide ribbon (a halo metres wide): the lines drew as zig-zags (known-fixes 2026-10-15).
    vX = aSide * 0.5 * W;
    vFlux = aFlux;
    vCoreW = coreW;
    vHaloR = r;
    vShare = share;
    vPx = px;
    gl_Position = projectionMatrix * viewMatrix * w;
}
`

const fragmentShader = /* glsl */`
uniform float uG;
varying vec3 vWorld;
varying vec3 vDirW;
varying float vS;
varying float vX;
varying vec3 vFlux;
varying float vCoreW;
varying float vHaloR;
varying float vShare;
varying float vPx;
#include <common>
${HAZE_FIELD_GLSL}
float hgPhaseL(float c, float g) {
    float g2 = g * g;
    return (1.0 - g2) / (4.0 * PI * pow(max(1.0 + g2 - 2.0 * g * c, 1e-6), 1.5));
}
void main() {
    // no line outside the building (beamReach.js): it stops at the surface, and nothing scatters past it
    if (hazeOutside(vWorld)) discard;
    vec3 toCam = cameraPosition - vWorld;
    float d = max(length(toCam), 1e-4);
    // the scattering angle: between the light's direction and the direction to the eye
    float c = dot(vDirW, toCam / d);
    float sinT = max(sqrt(max(1.0 - c * c, 0.0)), ${MIN_SIN.toFixed(3)});
    float T = exp(-uFill * (vS + d));
    // the line's intensity per unit length (laserLine.js lineLuminance at width 1)
    vec3 perLength = hazeSigma(vWorld) * hgPhaseL(c, uG) * vFlux * T / sinT;
    float x = abs(vX); // metres from the line's axis
    // core: a box of vCoreW with a one-pixel ramp each side — its integral across is vCoreW, so this sums to 1
    float core = clamp((0.5 * vCoreW - x) / vPx + 0.5, 0.0, 1.0) / vCoreW;
    // halo: a unit-area Gaussian of radius vHaloR
    float halo = exp(-0.5 * x * x / (vHaloR * vHaloR)) / (2.5066283 * vHaloR);
    vec3 radiance = perLength * ((1.0 - vShare) * core + vShare * halo);
    gl_FragColor = vec4(radiance, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
}
`

/** One ribbon per line, `stations` steps from the aperture to its own `line.length` (the first surface it meets,
 * beamReach.js), else `length`. Lines: [{ dir, flux: [r,g,b], length?, spacing? (rad, laserLine.js lineSpacings) }]. */
export const laserLineGeometry = (lines, length, stations = 48) => {
    const per = (stations + 1) * 2
    const n = lines.length * per
    const dir = new Float32Array(n * 3)
    const s = new Float32Array(n)
    const side = new Float32Array(n)
    const flux = new Float32Array(n * 3)
    const spacing = new Float32Array(n)
    const index = []
    lines.forEach((line, li) => {
        for (let k = 0; k <= stations; k += 1) {
            // stations closer near the aperture, where the width changes fastest relative to itself
            const t = k / stations
            const at = (Number(line.length) > 0 ? Number(line.length) : length) * t * t
            for (let e = 0; e < 2; e += 1) {
                const v = li * per + k * 2 + e
                dir.set(line.dir, v * 3)
                s[v] = at
                side[v] = e === 0 ? -1 : 1
                flux.set(line.flux, v * 3)
                spacing[v] = Number(line.spacing) > 0 ? Number(line.spacing) : LONE_LINE_SPACING_RAD
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
    g.setAttribute('aSpacing', new BufferAttribute(spacing, 1))
    g.setIndex(index)
    g.userData.vertsPerLine = per // read by the measurement API (beamsOf)
    g.userData.lineCount = lines.length
    g.computeBoundingSphere()
    if (g.boundingSphere) g.boundingSphere.radius += 2 // the ribbon's width, halo included
    return g
}

export const createLaserLineMaterial = (shared = hazeUniformsFor(null)) => new ShaderMaterial({
    uniforms: {
        uPixelAngle: { value: 0.001 },
        uDiam: { value: 0.004 },
        uDiv: { value: 0.001 },
        uMinPx: { value: MIN_CORE_PX },
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
/** Per draw: how many radians one pixel spans (vertical), so a core is never thinner than MIN_CORE_PX (lines and end spots). */
export const laserLineBeforeRender = (mesh, renderer, camera) => {
    const u = mesh.material?.uniforms
    if (!u || !camera?.isPerspectiveCamera) return
    renderer.getDrawingBufferSize(size)
    u.uPixelAngle.value = (2 * Math.tan((camera.fov * Math.PI) / 360)) / Math.max(size.y, 1) / Math.max(camera.zoom || 1, 1e-3)
}

const spotVertex = /* glsl */`
attribute vec3 aDir;
attribute float aS;
attribute vec2 aCorner;
attribute vec3 aFlux;
uniform float uPixelAngle;
uniform float uDiam;
uniform float uDiv;
uniform float uMinPx;
varying vec2 vCorner;
varying float vD;
varying float vPx;
varying float vS;
varying float vDist;
varying vec3 vFlux;
void main() {
    vec4 c = modelMatrix * vec4(aDir * aS, 1.0);
    float dist = max(length(cameraPosition - c.xyz), 1e-4);
    float px = dist * uPixelAngle;
    // laserLine.js laserSpot: the beam's width at s, or MIN_CORE_PX pixels
    float D = max(sqrt(uDiam * uDiam + (uDiv * aS) * (uDiv * aS)), px * uMinPx);
    vec4 mv = viewMatrix * c;
    mv.xy += aCorner * (0.5 * D + px); // the dot and a one-pixel ramp
    vCorner = aCorner;
    vD = D;
    vPx = px;
    vS = aS;
    vDist = dist;
    vFlux = aFlux;
    gl_Position = projectionMatrix * mv;
}
`

const spotFragment = /* glsl */`
uniform float uFill;
uniform float uAlbedo;
varying vec2 vCorner;
varying float vD;
varying float vPx;
varying float vS;
varying float vDist;
varying vec3 vFlux;
#include <common>
void main() {
    float r = length(vCorner) * (0.5 * vD + vPx);
    float disc = clamp((0.5 * vD - r) / vPx + 0.5, 0.0, 1.0);
    if (disc <= 0.0) discard;
    // a Lambertian surface: L = ρ·E/π, E = Φ·T(s)/A (laserLine.js 8.); back to the eye through T(d)
    float area = 0.25 * PI * vD * vD;
    vec3 radiance = uAlbedo / PI * vFlux * exp(-uFill * (vS + vDist)) / area * disc;
    gl_FragColor = vec4(radiance, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
}
`

/** One camera-facing dot per line that meets a surface (`line.spot`), at its `line.length`. */
export const laserSpotGeometry = (lines) => {
    const hits = lines.filter((l) => l.spot && Number(l.length) > 0)
    const n = hits.length * 4
    const dir = new Float32Array(n * 3)
    const s = new Float32Array(n)
    const corner = new Float32Array(n * 2)
    const flux = new Float32Array(n * 3)
    const position = new Float32Array(n * 3)
    const index = []
    const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]]
    hits.forEach((line, li) => {
        corners.forEach((cc, k) => {
            const v = li * 4 + k
            dir.set(line.dir, v * 3)
            s[v] = Number(line.length)
            corner.set(cc, v * 2)
            flux.set(line.flux, v * 3)
            for (let a = 0; a < 3; a += 1) position[v * 3 + a] = line.dir[a] * s[v]
        })
        const a = li * 4
        index.push(a, a + 1, a + 2, a, a + 2, a + 3)
    })
    const g = new BufferGeometry()
    g.setAttribute('position', new BufferAttribute(position, 3))
    g.setAttribute('aDir', new BufferAttribute(dir, 3))
    g.setAttribute('aS', new BufferAttribute(s, 1))
    g.setAttribute('aCorner', new BufferAttribute(corner, 2))
    g.setAttribute('aFlux', new BufferAttribute(flux, 3))
    g.setIndex(index)
    g.userData.spotCount = hits.length
    g.computeBoundingSphere()
    return g
}

export const createLaserSpotMaterial = (shared = hazeUniformsFor(null)) => new ShaderMaterial({
    uniforms: {
        uPixelAngle: { value: 0.001 },
        uDiam: { value: 0.004 },
        uDiv: { value: 0.001 },
        uMinPx: { value: MIN_CORE_PX },
        uAlbedo: { value: SPOT_ALBEDO },
        uFill: shared.uFill
    },
    vertexShader: spotVertex,
    fragmentShader: spotFragment,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    fog: false,
    toneMapped: true
})
