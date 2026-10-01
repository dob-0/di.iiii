// The shader for beamAir.js: a spot's beam in haze, drawn on a closed truncated
// cone that bounds the beam. Each fragment finds where its view ray is inside the
// beam (the same quadratic as beamChord) and sums the single-scattering integral
// along that chord (beamAirRadiance). The result goes through the renderer's own
// tone mapping and exposure (toneMapped), exactly like a lit surface, and is ADDED
// to what is behind it.
//
// The haze's scattering is not one number any more: hazeSigma() asks the room's haze
// field (hazeField.js — the hall's well-mixed haze, each hazer's and fog machine's
// jet, and the drifting unevenness) at every sample. A room with no haze settings
// hands every beam a field that IS one number (uFill = atmosphere.scattering, no
// jets, no noise), and draws exactly as before.
//
// Faces: the front faces while the camera is outside the beam — the depth test
// then hides the part of a beam behind a wall, the floor or the roof, which is how
// a beam ends on what it hits — and the back faces while the camera stands inside
// it (a front face is not there to draw from inside). Chosen per frame in
// onBeforeRender, before three.js sets the draw's state.
import { AdditiveBlending, BackSide, Color, CylinderGeometry, FrontSide, Matrix4, ShaderMaterial, Vector3 } from 'three'
import { BEAM_AIR_SAMPLES, DEFAULT_APERTURE, HULL_BASE, HULL_SLOPE, beamExtent } from './beamAir.js'
import { JET_K, MAX_HAZE_SOURCES, NOISE_TILE_M } from './hazeField.js'
import { hazeUniformsFor } from './hazeUniforms.js'

const vertexShader = /* glsl */`
varying vec3 vLocal;
varying vec3 vWorld;
void main() {
    vLocal = position;
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
}
`

const fragmentShader = /* glsl */`
#define BEAM_SAMPLES ${BEAM_AIR_SAMPLES}
uniform vec3 uColor;
uniform float uIntensity;
uniform float uTan;
uniform float uAperture;
uniform float uLength;
uniform float uEdge;
uniform float uG;
uniform vec3 uCamLocal;
uniform float uHullBase;
uniform float uHullSlope;
uniform float uGlare;
uniform float uLit; // how much of the throw is above the floor (beamAirBeforeRender)
varying vec3 vLocal;
varying vec3 vWorld;
#include <common>
#include <dithering_pars_fragment>

// THE HAZE FIELD (hazeField.js has the formulas and where they come from; this is
// hazeScatteringAt, line for line). Shared by every beam of the renderer
// (hazeUniforms.js).
#define HAZE_MAX ${MAX_HAZE_SOURCES}
uniform float uFill;
uniform int uHazeCount;
uniform vec3 uHazePos[HAZE_MAX];
uniform vec3 uHazeDir[HAZE_MAX];
uniform vec4 uHazeJet[HAZE_MAX]; // σ0 at the nozzle, nozzle diameter, spread, reach
uniform highp sampler3D uHazeNoise;
uniform float uPatch;
uniform vec3 uDrift;
uniform float uHazeTime;

float hazeSigma(vec3 p) {
    if (uHazeCount == 0 && uPatch <= 0.0) return uFill;
    float n = 0.5;
    if (uPatch > 0.0) n = texture(uHazeNoise, (p - uDrift * uHazeTime) / ${NOISE_TILE_M.toFixed(1)}).r;
    float swing = 2.0 * (n - 0.5);
    float sigma = uFill * (1.0 + uPatch * swing);
    float eddy = clamp(1.0 + 1.6 * uPatch * swing, 0.0, 3.0);
    for (int j = 0; j < HAZE_MAX; j++) {
        if (j >= uHazeCount) break;
        vec4 jet = uHazeJet[j];
        vec3 v = p - uHazePos[j];
        float u = dot(v, uHazeDir[j]);
        float along = max(u, 0.0);
        // far behind the nozzle, past five reaches, or three widths off the axis:
        // under e^-5 of the jet, skipped (most samples, most jets)
        if (u < -jet.y || along > jet.w * 5.0) continue;
        float r2 = max(dot(v, v) - u * u, 0.0);
        float w = jet.y * 0.5 + jet.z * along;
        if (r2 > 9.0 * w * w) continue;
        float decay = min(1.0, ${JET_K.toFixed(1)} * jet.y / max(along, 1e-6));
        float ramp = clamp((u + jet.y * 0.5) / jet.y, 0.0, 1.0);
        sigma += jet.x * decay * exp(-r2 / (w * w)) * exp(-along / jet.w) * ramp * eddy;
    }
    return sigma;
}

float hgPhase(float c, float g) {
    float g2 = g * g;
    return (1.0 - g2) / (12.566370614 * pow(max(1.0 + g2 - 2.0 * g * c, 1e-4), 1.5));
}

uniform float uGlareOn;

void main() {
#if BEAM_PART == 1
    // the room is drawn with real bloom (HdrBloom.jsx): the veil steps aside
    if (uGlareOn < 0.5) discard;
#endif
    vec3 ro = uCamLocal;
    vec3 rd = normalize(vLocal - ro);
    float t = max(uTan, 1e-4);
    float a = uAperture;
    // The cross-section (beamAir.js beamProfile): 50 % at the beam angle, falling as
    // exp(−ln2·ρ^p); the chord is taken through where it has fallen to PROFILE_FLOOR.
    float pExp = 2.0 + 6.0 * (1.0 - clamp(uEdge, 0.0, 1.0));
    float kExt = pow(log(1.0 / 0.02) / 0.693147, 1.0 / pExp);
    float tw = t * kExt;
    float aw = a * kExt;
    float c0 = aw - ro.y * tw;
    float c1 = -rd.y * tw;
    float A = rd.x * rd.x + rd.z * rd.z - c1 * c1;
    float B = 2.0 * (ro.x * rd.x + ro.z * rd.z - c0 * c1);
    float C = ro.x * ro.x + ro.z * ro.z - c0 * c0;
    float s0 = -1e9;
    float s1 = 1e9;
    bool hit = true;
    if (abs(rd.y) < 1e-6) {
        if (ro.y > 0.0 || ro.y < -uLength) hit = false;
    } else {
        float ta = -ro.y / rd.y;
        float tb = (-uLength - ro.y) / rd.y;
        s0 = min(ta, tb);
        s1 = max(ta, tb);
    }
    float e0 = -1e9;
    float e1 = 1e9;
    float disc = B * B - 4.0 * A * C;
    if (abs(A) < 1e-9) {
        if (abs(B) < 1e-9) {
            if (C >= 0.0) hit = false;
        } else if (B > 0.0) {
            e1 = -C / B;
        } else {
            e0 = -C / B;
        }
    } else if (disc < 0.0) {
        if (A > 0.0) hit = false;
    } else {
        float sq = sqrt(disc);
        float r0 = (-B - sq) / (2.0 * A);
        float r1 = (-B + sq) / (2.0 * A);
        float lo = min(r0, r1);
        float hi = max(r0, r1);
        if (A > 0.0) {
            e0 = lo;
            e1 = hi;
        } else if (min(s1, lo) - s0 >= s1 - max(s0, hi)) {
            e1 = lo;
        } else {
            e0 = hi;
        }
    }
    float la = max(max(s0, e0), 0.0);
    float lb = min(s1, e1);
    if (!hit || lb <= la) lb = la;

    float dl = (lb - la) / float(BEAM_SAMPLES);
    // Interleaved gradient noise (Jimenez, "Next Generation Post Processing in
    // Call of Duty: Advanced Warfare", SIGGRAPH 2014): a per-pixel offset of the
    // samples, so the sum's error is grain, not bands.
    float jitter = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
    vec3 apex = vec3(0.0, a / t, 0.0);
    float sum = 0.0;
    // The same ray in the world, where the haze field lives: from the camera through
    // this fragment, the beam frame's metres converted (an entity may be scaled).
    vec3 wd = vWorld - cameraPosition;
    float worldPerLocal = length(wd) / max(length(vLocal - ro), 1e-6);
    vec3 wrd = normalize(wd);
#if BEAM_PART == 1
    lb = la;
#endif
    if (lb > la) for (int i = 0; i < BEAM_SAMPLES; i++) {
        float lam = la + (float(i) + jitter) * dl;
        vec3 p = ro + rd * lam;
        float s = max(-p.y, 0.0);
        float R = a + s * t;
        float rho = length(p.xz) / max(R, 1e-5);
        float profile = exp(-0.693147 * pow(rho, pExp));
        float E = uIntensity * t * t / max(R * R, 1e-8);
        vec3 wi = p - apex;
        float cosT = -dot(wi, rd) / max(length(wi), 1e-5);
        // toward the eye and from the lens, the well-mixed haze dims the light
        // (a plume between is not counted — hazeField.js, limits)
        float T = exp(-uFill * (s + lam));
        float sigma = hazeSigma(cameraPosition + wrd * (lam * worldPerLocal));
        sum += sigma * E * profile * hgPhase(cosT, uG) * T;
    }
    float inBeam = sum * dl;
#if BEAM_PART == 1
    inBeam = 0.0;
#endif

    // GLARE — how an eye (and a camera) shows a light far brighter than a screen can:
    // a veil of light around it. The CIE disability-glare formula (CIE 146:2002, the
    // Stiles–Holladay form): a source giving illuminance E at the eye, θ degrees off the
    // line of sight, adds a veiling luminance L_v = 10·E/θ² (valid 1°–30°). The beam's
    // core is a line on the picture, of radiance L and angular width w; integrated
    // along it, L_v = 10·π²/180 · L·w / θ(deg) — a 1/θ fall-off. Drawn on the wider
    // hull around the beam and faded out before the hull's edge (so it stops, softly,
    // a few degrees out — the formula's tail beyond is not drawn). The core's radiance
    // here uses the hall's well-mixed haze (a veil is too soft to show a plume).
    vec3 axis = vec3(0.0, -1.0, 0.0);
    float bb = dot(rd, axis);
    float dd = dot(rd, ro);
    float ee = dot(axis, ro);
    float den = max(1.0 - bb * bb, 1e-5);
    // only the part of the beam above the floor shines: a veil worked out from the
    // throw beneath it laid a flat grey sheath over the floor where each beam lands
    float tq = clamp((ee - bb * dd) / den, 0.0, uLit);
    vec3 q = axis * tq;
    vec3 v = q - ro;
    float dq = max(length(v), 1e-3);
    float Rq = a + tq * t;
    float cosV = clamp(dot(rd, v) / dq, -1.0, 1.0);
    float theta = max(acos(cosV) - Rq / dq, 0.0);
    float sinPhi = sqrt(den);
    float chordQ = min(2.0 * Rq / max(sinPhi, 1e-3), uLit);
    vec3 wq = q - apex;
    float cosQ = -dot(wq, normalize(v)) / max(length(wq), 1e-5);
    float Eq = uIntensity * t * t / max(Rq * Rq, 1e-8);
    float Lcore = uFill * hgPhase(cosQ, uG) * Eq * chordQ * exp(-uFill * (tq + dq));
    float width = 2.0 * Rq / dq;
    float thetaDeg = max(theta * 57.29578, 1.0);
    float lsf = 0.54831 / thetaDeg;
    // fade by the ray's closest distance to the axis against the hull there
    vec3 closest = ro + rd * max(dot(v, rd), 0.0);
    float perp = length(closest.xz) ;
    float hull = Rq + uHullBase + uHullSlope * tq;
    float fade = 1.0 - smoothstep(0.55, 1.0, perp / hull);
    float glare = uGlare * Lcore * width * lsf * fade;

#if BEAM_PART == 0
    float total = inBeam;
#else
    float total = glare;
#endif
    if (total <= 0.0) discard;
    vec3 radiance = uColor * total;
    gl_FragColor = vec4(radiance, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    #include <dithering_fragment>
}
`

/** The closed cone that bounds a beam: lens at the origin, the throw down −Y. */
export const beamAirGeometry = ({ aperture, tanHalf, length, edge = 0.2 }, part = 'core') => {
    // The core: the cone the beam's light reaches (beamExtent — past the beam angle, to
    // where its profile has fallen to 2 %), 2 % over, so the depth test ends it on the
    // girder, the roof or the floor it meets. The glare: the beam plus the margin its
    // veil is drawn in (HULL_BASE + HULL_SLOPE·s) — a veil lies over what stands in front
    // of the beam too, as it does in an eye.
    const k = part === 'glare' ? 1 : beamExtent(edge)
    const [base, slope] = part === 'glare' ? [HULL_BASE, HULL_SLOPE] : [0.02 * aperture * k, 0.02 * tanHalf * k]
    const top = Math.max(aperture * k, 1e-3) + base
    const bottom = (aperture + length * tanHalf) * k + base + slope * length
    const geometry = new CylinderGeometry(top, bottom, length, 24, 1, false)
    geometry.translate(0, -length / 2, 0)
    return geometry
}

const inverse = new Matrix4()
const camera = new Vector3()
const lens = new Vector3()
const axis = new Vector3()

// The floor the hall stands on (world y). The rig's rooms are built on y = 0.
const FLOOR_Y = 0

/**
 * A material for one beam's core ('core') or its glare ('glare'); update it with
 * setBeamAirUniforms. `shared` = the renderer's haze uniforms (hazeUniforms.js): the
 * same objects in every beam, so the haze changes for all of them without a React
 * render or a recompile.
 */
export const createBeamAirMaterial = (part = 'core', shared = hazeUniformsFor(null)) => {
    const glare = part === 'glare'
    const material = new ShaderMaterial({
        defines: { BEAM_PART: glare ? 1 : 0 },
        uniforms: {
            uColor: { value: new Color('#ffffff') },
            uIntensity: { value: 0 },
            uTan: { value: 0.1 },
            uAperture: { value: DEFAULT_APERTURE },
            uLength: { value: 10 },
            uEdge: { value: 0.2 },
            uG: { value: 0.7 },
            uCamLocal: { value: new Vector3() },
            uHullBase: { value: glare ? HULL_BASE : 0 },
            uHullSlope: { value: glare ? HULL_SLOPE : 0 },
            uGlare: { value: 1 },
            uLit: { value: 10 },
            ...shared
        },
        vertexShader,
        fragmentShader,
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
        side: FrontSide,
        fog: false,
        toneMapped: true,
        dithering: true
    })
    return material
}

export const setBeamAirUniforms = (material, { color, intensity, tanHalf, aperture, length, edge, atmosphere }) => {
    const u = material.uniforms
    u.uColor.value.set(color || '#ffffff')
    u.uIntensity.value = Math.max(0, Number(intensity) || 0)
    u.uTan.value = tanHalf
    u.uAperture.value = aperture
    u.uLength.value = length
    u.uLit.value = length
    u.uEdge.value = edge
    u.uG.value = atmosphere.anisotropy
}

/**
 * The per-frame half, for the mesh's onBeforeRender: the camera in the beam's own
 * frame, and which faces to draw from where it stands.
 */
export const beamAirBeforeRender = (mesh, cam) => {
    const material = mesh.material
    const u = material.uniforms
    inverse.copy(mesh.matrixWorld).invert()
    camera.setFromMatrixPosition(cam.matrixWorld).applyMatrix4(inverse)
    u.uCamLocal.value.copy(camera)
    // How far down its throw the beam is still above the floor, in the beam's own units:
    // the lens and the beam's axis (−Y) in the world, and where that line meets y = FLOOR_Y.
    lens.setFromMatrixPosition(mesh.matrixWorld)
    const perMetre = axis.set(0, -1, 0).applyMatrix4(mesh.matrixWorld).sub(lens).length() || 1
    axis.divideScalar(perMetre)
    let lit = u.uLength.value
    if (axis.y < -1e-4 && lens.y > FLOOR_Y) lit = Math.min(lit, (lens.y - FLOOR_Y) / -axis.y / perMetre)
    u.uLit.value = Math.max(lit, 0)
    const s = -camera.y
    const k = Math.max(beamExtent(u.uEdge.value), 1)
    const radius = (u.uAperture.value + Math.max(s, 0) * u.uTan.value) * k + Math.max(s, 0) * u.uHullSlope.value + u.uHullBase.value
    // A margin of the near plane's reach: a camera a hair outside the surface
    // still has the front face clipped away by the near plane.
    const margin = (cam.near || 0.05) * 2
    const inside = s > -margin && s < u.uLength.value + margin && Math.hypot(camera.x, camera.z) < radius + margin
    const side = inside ? BackSide : FrontSide
    if (material.side !== side) material.side = side
}
