import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { smoothstep } from '../ritualClock.js'
import { IRIS_RAMP, PALETTE, TUNNEL_WHITE } from '../palette.js'
import { dispersionControls } from '../dispersionControls.js'

// Dispersion sphere — a monumental floating sphere in a dark minimal
// architectural space, its surface a procedural fluid: iridescent colour
// emerging from moving sources, expanding outward, folding, swirling and
// dissolving. Pigment in water, not fire.
//
// Nothing here is a texture or a video. The whole image is a fragment shader.
//
// WHY THE FIELD IS SAMPLED FROM A DIRECTION AND NOT FROM UV. A sphere's UV map
// has a seam down one side and pinches at both poles, so any noise sampled
// through it shows a visible join and two spirals — precisely the "obvious
// repetition" and "hard edges" the brief rules out, and they are the first
// thing the eye finds on a slowly rotating object. Sampling 3D noise along the
// surface NORMAL has no seam and no poles at all: the field is continuous
// everywhere because it is a solid, and the sphere is a window into it.
//
// WHY THE COLOUR SOURCES ARE POINTS ON THE SPHERE AND NOT THE CENTRE OF THE
// DISC. "Emerging from the centre" has a flat-screen reading — the middle of
// what you see — which cannot survive stereo: each eye has its own centre, so
// a view-derived origin puts the bloom in two different places and the sphere
// stops fusing into one object. Geodesic distance from a source POINT is
// view-independent, is genuinely radial across the surface, and is what a drop
// of ink actually does. Three sources on incommensurate orbits, so the surface
// never returns to an arrangement it has held before — the loop is seamless
// because there is no loop.
//
// WHY THE BLOOM IS GEOMETRY. The brief asks for bloom AND for Quest
// performance, and those pull against each other: an EffectComposer bloom pass
// is a full-screen blur chain, it is not in this repo's dependencies, and in a
// WebXR session it has to run per eye against a framebuffer the headset owns.
// The rest of this piece already fakes glow with additive geometry (LightHaze,
// the `glow` light kind), so this does too — two additive shells standing off
// the surface, driven by fresnel so they sit at the limb where a real bloom
// would. Costs two draw calls and no render target.

// Where the sphere hangs, and how the room is laid out. The sphere's height is
// derived from its radius rather than fixed, so dragging the size slider never
// buries it in the floor or leaves it sitting on nothing.
// SPHERE_Z and sphereHeight are exported for the same reason COLUMNS is: the
// score puts the drone AT the monument, and a hand-copied seat would silently
// come loose the first time the sphere is moved or resized.
const FLOOR_Y = 0
export const SPHERE_Z = -15
export const sphereHeight = (radius) => FLOOR_Y + radius * 1.25 + 1

// Icosahedron, not SphereGeometry. Same reason the field avoids UV: a UV
// sphere concentrates vertices at the poles, which is wasted detail in two
// places and not enough anywhere else. Detail 5 is 20,480 triangles — the
// silhouette is what sells "monumental", and facets on the edge of a
// five-metre object are visible from across the room.
const SPHERE_DETAIL = 5

// The shells are blurred, additive and have no detail of their own, so they buy
// nothing from density beyond a clean silhouette.
const SHELL_DETAIL = 4

// How far each glow shell stands off the surface, as a multiple of the radius.
// Two, not four: each one is a full-area transparent pass over the largest
// object in the scene, and fill rate is the actual budget on a standalone
// headset — not triangles.
//
// Generous gaps, because the halo is drawn in the annulus between the sphere's
// silhouette and the shell's. A shell at 1.05 has almost no annulus to fade
// across and reads as a hard outline rather than as light coming off something.
const SHELL_SCALES = [1.15, 1.42]

const RAMP_SIZE = IRIS_RAMP.length

// What the halo and the room light drain toward. `offWhite` rather than pure
// white, and warm rather than blue, because palette.js rule 4 is that white is
// a highlight — a pure-white surround would be the brightest thing in the frame
// and would out-shout the sphere it exists to make readable. Built once at
// module scope: it is a constant, and rebuilding it per frame would allocate.
const PALETTE_CALM = new THREE.Color(PALETTE.offWhite)

// Shared noise. Value noise rather than simplex for the same reason PixelField
// gives: this runs over a very large area of the screen on a mobile GPU, and
// the field is soft enough everywhere that simplex's better gradients would
// not survive being blurred by the domain warp anyway.
const NOISE_GLSL = /* glsl */`
    float hash(vec3 p) {
        p = fract(p * 0.3183099 + 0.1);
        p *= 17.0;
        return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
    }

    float noise(vec3 x) {
        vec3 i = floor(x);
        vec3 f = fract(x);
        // Smoothstepped, not linear: linear interpolation leaves the cell
        // boundaries visible as creases, and a crease is a hard edge.
        f = f * f * (3.0 - 2.0 * f);
        return mix(
            mix(mix(hash(i), hash(i + vec3(1.0, 0.0, 0.0)), f.x),
                mix(hash(i + vec3(0.0, 1.0, 0.0)), hash(i + vec3(1.0, 1.0, 0.0)), f.x), f.y),
            mix(mix(hash(i + vec3(0.0, 0.0, 1.0)), hash(i + vec3(1.0, 0.0, 1.0)), f.x),
                mix(hash(i + vec3(0.0, 1.0, 1.0)), hash(i + vec3(1.0, 1.0, 1.0)), f.x), f.y),
            f.z);
    }

    float fbm(vec3 p) {
        float amplitude = 0.5;
        float sum = 0.0;
        for (int i = 0; i < 4; i++) {
            sum += amplitude * noise(p);
            // 2.02, not 2.0. An exact doubling lands every octave on the same
            // lattice and the sum develops a visible square grid.
            p *= 2.02;
            amplitude *= 0.5;
        }
        return sum;
    }

    // Turbulence is fbm folded at zero — abs() puts a crease at every zero
    // crossing, and the creases are the wispy filaments that make dispersing
    // ink look like ink rather than like smoke. Three octaves: the fourth
    // lands at a frequency that shimmers once the headset resamples it.
    float turbulence(vec3 p) {
        float amplitude = 0.5;
        float sum = 0.0;
        for (int i = 0; i < 3; i++) {
            sum += amplitude * abs(noise(p) * 2.0 - 1.0);
            p *= 2.03;
            amplitude *= 0.5;
        }
        return sum;
    }
`

const vertexShader = /* glsl */`
    varying vec3 vDir;
    varying vec3 vWorldNormal;
    varying vec3 vViewDir;

    #include <fog_pars_vertex>

    void main() {
        // Unit-radius geometry, so the vertex position IS the direction. The
        // mesh is scaled to the sphere's real size, which means the field does
        // not stretch when the size slider moves — fluidScale owns that, and
        // keeping the two independent is the whole reason they are two knobs.
        vDir = normalize(position);

        vec4 worldPosition = modelMatrix * vec4(position, 1.0);
        vWorldNormal = normalize(mat3(modelMatrix) * normal);
        vViewDir = normalize(cameraPosition - worldPosition.xyz);

        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mvPosition;

        #include <fog_vertex>
    }
`

const fragmentShader = /* glsl */`
    // highp, explicitly. The hash multiplies by 17 and keeps fractions of a
    // product of three fractions; at the mediump a mobile GPU hands a fragment
    // shader by default the low bits that ARE the result are already gone, and
    // the noise collapses into flat bands. It looks perfect on desktop and
    // wrong only on the headset, which is the worst possible place to find out.
    precision highp float;

    uniform float uTime;
    uniform float uTurbulence;
    uniform float uExpansion;
    uniform float uIntensity;
    uniform float uScale;
    uniform float uSpectrum;
    uniform float uEnvelope;
    uniform vec3 uSourceA;
    uniform vec3 uSourceB;
    uniform vec3 uSourceC;
    uniform vec3 uRamp[${RAMP_SIZE}];

    varying vec3 vDir;
    varying vec3 vWorldNormal;
    varying vec3 vViewDir;

    #include <fog_pars_fragment>

    ${NOISE_GLSL}

    // Smooth HSV, used only for the full-spectrum mode. Hue wraps at 1, so a
    // hue that simply keeps increasing is seamless by construction — there is
    // no join to hide and no ramp to run off the end of.
    vec3 hsv2rgb(vec3 c) {
        vec3 p = abs(fract(c.xxx + vec3(1.0, 2.0 / 3.0, 1.0 / 3.0)) * 6.0 - 3.0);
        return c.z * mix(vec3(1.0), clamp(p - 1.0, 0.0, 1.0), c.y);
    }

    /**
     * The palette's own iridescence. A tent filter over the ramp rather than an
     * indexed lookup: GLSL ES only guarantees constant indexing into uniform
     * arrays, and where computed indexing fails it fails silently. Tent width 1
     * means only two neighbours ever contribute, so this interpolates between
     * adjacent entries — which is exactly the property IRIS_RAMP is ordered for.
     */
    vec3 sampleRamp(float t) {
        float x = fract(t) * float(${RAMP_SIZE});
        vec3 acc = vec3(0.0);
        float total = 0.0;
        for (int i = 0; i < ${RAMP_SIZE}; i++) {
            float d = abs(x - float(i));
            // Wrapped distance, so the ramp is a loop with no seam at the join.
            d = min(d, float(${RAMP_SIZE}) - d);
            float w = max(0.0, 1.0 - d);
            w = w * w * (3.0 - 2.0 * w);
            acc += uRamp[i] * w;
            total += w;
        }
        return acc / max(total, 0.0001);
    }

    void main() {
        vec3 dir = normalize(vDir);
        vec3 p = dir * uScale;

        // ---- the fluid ------------------------------------------------
        //
        // Domain warping: noise sampled at coordinates that are themselves
        // noise. Sampled straight, fbm gives clouds; warped, it gives the
        // sheets, folds and filaments of something being STIRRED. This one
        // line is most of the difference between "pigment in water" and "a
        // cloud texture", and the three warp axes are offset by unrelated
        // constants so they cannot fold into a symmetry.
        vec3 warp = vec3(
            fbm(p + vec3(0.0, 1.7, 4.2) + uTime * 0.071),
            fbm(p + vec3(5.2, 1.3, 2.8) - uTime * 0.054),
            fbm(p + vec3(2.9, 4.1, 0.7) + uTime * 0.043)
        );
        float fluid = fbm(p + (1.4 + uTurbulence * 0.9) * warp);

        // The filaments. Turbulence is added rather than blended so it can be
        // taken to zero and leave a perfectly smooth field behind — at 0 this
        // is a slow lava lamp, which is a legitimate place to want to be.
        fluid += turbulence(p * 2.05 + warp * 1.2 + vec3(0.0, 0.0, uTime * 0.06))
            * uTurbulence * 0.32;

        // A second, deeper sample offset along the view ray. Cheap fake
        // interior: the colour under the surface is not the colour on it, so
        // the sphere reads as something you are looking INTO rather than as
        // something painted. One octave, because it is a hint and not an image.
        float deep = noise((dir - vViewDir * 0.22) * uScale * 0.8 + warp - uTime * 0.02);
        fluid = mix(fluid, deep, 0.22);

        // ---- colour emerging and expanding ----------------------------
        //
        // acos of the dot product is the geodesic angle from this point to the
        // source, so subtracting time makes rings that TRAVEL away from it
        // rather than a pulse that blinks in place. Amplitude falls off with
        // that angle, so each source reads as a bloom that spreads and
        // dissolves instead of as a standing ripple covering the whole sphere.
        //
        // The three periods share no common factor, which is what makes the
        // motion non-repeating: the sources never return to the same relative
        // arrangement, so neither does the image.
        float angleA = acos(clamp(dot(dir, uSourceA), -1.0, 1.0));
        float angleB = acos(clamp(dot(dir, uSourceB), -1.0, 1.0));
        float angleC = acos(clamp(dot(dir, uSourceC), -1.0, 1.0));

        float waves = 0.0;
        waves += 0.34 * sin(angleA * 3.1 - uTime * 0.83) * exp(-angleA * 0.55);
        waves += 0.26 * sin(angleB * 4.3 - uTime * 0.61) * exp(-angleB * 0.7);
        waves += 0.19 * sin(angleC * 5.7 - uTime * 0.44) * exp(-angleC * 0.85);

        float field = fluid + waves * uExpansion;

        // Both colour modes are computed and mixed rather than branched. A
        // ternary here would be a divergent branch containing a loop, which on
        // a tile-based mobile GPU costs both sides anyway — and mixing lets the
        // spectrum knob be a crossfade instead of a switch.
        vec3 iridescent = sampleRamp(field * 0.78 + uTime * 0.021);
        // Hue driven by the field itself, drifting slowly on top. Saturation
        // held well under 1: a fully saturated rainbow is the RGB/cyberpunk
        // read the piece avoids even where it is allowed a rainbow at all.
        // The hue span across the surface is deliberately NARROW — about a
        // third of the wheel at any instant — and the whole band drifts around
        // the wheel over time. Mapping the field across the full spectrum was
        // the obvious reading of "rainbow" and it looks poisoned: green sitting
        // next to purple on one object is a clash at any moment you freeze it,
        // and no amount of smoothness rescues it. A narrow band reads as ONE
        // iridescent material catching the light, which is what pigment in
        // water actually does, and the drift still takes it through every hue
        // there is — just never all at once.
        vec3 spectral = hsv2rgb(vec3(
            fract(field * 0.3 + uTime * 0.021),
            0.62,
            clamp(0.35 + field * 0.75, 0.0, 1.0)
        ));
        vec3 color = mix(iridescent, spectral, uSpectrum);

        // ---- dissolve -------------------------------------------------
        //
        // Not every part of the surface is carrying pigment. Without this the
        // sphere is uniformly full of colour, which reads as a painted ball;
        // letting patches drain toward dark is what makes the colour read as
        // something IN a medium, arriving and leaving. Smoothstepped over a
        // wide span so there is no edge anywhere in it.
        float density = smoothstep(-0.05, 0.95, field + 0.3);
        color *= density;

        // The limb. A real volume is brightest where the line of sight passes
        // through the most of it, which on a sphere is the edge — this is the
        // same reason a soap bubble has a bright rim. It is also what stops the
        // silhouette being a hard circle cut out of the room.
        float fresnel = pow(
            1.0 - max(dot(normalize(vWorldNormal), normalize(vViewDir)), 0.0),
            2.4);
        color += color * fresnel * 0.9;

        gl_FragColor = vec4(color * uIntensity * uEnvelope, 1.0);

        #include <fog_fragment>
    }
`

// The shells. Deliberately a different, much cheaper shader — they cover a
// large area twice over, so anything expensive here is paid for at full screen
// resolution, per eye.
const shellVertexShader = /* glsl */`
    varying vec3 vDir;
    varying vec3 vWorldNormal;
    varying vec3 vViewDir;

    void main() {
        vDir = normalize(position);
        vec4 worldPosition = modelMatrix * vec4(position, 1.0);
        vWorldNormal = normalize(mat3(modelMatrix) * normal);
        vViewDir = normalize(cameraPosition - worldPosition.xyz);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
`

const shellFragmentShader = /* glsl */`
    precision highp float;

    uniform float uTime;
    uniform float uScale;
    uniform float uSpectrum;
    uniform float uBloom;
    uniform float uEnvelope;
    uniform float uHaloTint;
    uniform vec3 uCalm;
    uniform vec3 uRamp[${RAMP_SIZE}];

    varying vec3 vDir;
    varying vec3 vWorldNormal;
    varying vec3 vViewDir;

    ${NOISE_GLSL}

    vec3 hsv2rgb(vec3 c) {
        vec3 p = abs(fract(c.xxx + vec3(1.0, 2.0 / 3.0, 1.0 / 3.0)) * 6.0 - 3.0);
        return c.z * mix(vec3(1.0), clamp(p - 1.0, 0.0, 1.0), c.y);
    }

    vec3 sampleRamp(float t) {
        float x = fract(t) * float(${RAMP_SIZE});
        vec3 acc = vec3(0.0);
        float total = 0.0;
        for (int i = 0; i < ${RAMP_SIZE}; i++) {
            float d = abs(x - float(i));
            d = min(d, float(${RAMP_SIZE}) - d);
            float w = max(0.0, 1.0 - d);
            w = w * w * (3.0 - 2.0 * w);
            acc += uRamp[i] * w;
            total += w;
        }
        return acc / max(total, 0.0001);
    }

    void main() {
        // One octave, at a LOWER frequency than the surface. That is what makes
        // this read as the sphere's light spilling out rather than as a second
        // copy of the sphere floating just outside it — a blur, approximated by
        // simply not asking for the detail in the first place.
        float halo = noise(normalize(vDir) * uScale * 0.55 + vec3(0.0, 0.0, uTime * 0.03));

        vec3 color = mix(
            sampleRamp(halo * 0.9 + uTime * 0.021),
            hsv2rgb(vec3(fract(halo * 0.7 + uTime * 0.021), 0.55, 1.0)),
            uSpectrum);

        // Drained toward white, and this is the scene's main colour decision
        // rather than a tweak. A coloured halo around a coloured sphere puts
        // the same hue in every part of the frame at once — nothing is left for
        // the colour to be read AGAINST, so the sphere stops registering as the
        // coloured thing and the whole image flattens into a wash. Keeping the
        // surround close to white costs the halo its own drama and hands all of
        // it to the object, which is where it was wanted.
        //
        // Not pure white: a trace of the sphere's hue survives at the default
        // tint, so the halo still belongs to the sphere rather than looking
        // like a separate white lamp behind it.
        color = mix(uCalm, color, uHaloTint);

        // How much shell the eye is looking THROUGH — not fresnel.
        //
        // Fresnel was the reflex here and it is wrong for a halo. It peaks
        // wherever a surface turns edge-on to the viewer, which on this shell
        // is its OWN silhouette — so it would paint a bright rim at the outer
        // edge of the glow and leave the part nearest the sphere dim. Two
        // shells like that are two hard rings floating around the sphere,
        // which is the opposite of bloom.
        //
        // Only the back half of the shell is drawn (see side: BackSide), and
        // its outward normal points away from the eye there, so -dot rises
        // toward the middle of the disc and falls to zero at the shell's
        // silhouette. Across the annulus that is actually visible — between
        // the sphere's edge and the shell's — that is a smooth outward falloff,
        // which is what light spilling off a surface looks like. It is also
        // very nearly the true chord length through the shell, for free.
        float through = max(
            -dot(normalize(vWorldNormal), normalize(vViewDir)),
            0.0);
        // Eased rather than linear, so the halo has no perceptible outer edge.
        through = pow(through, 1.6);

        gl_FragColor = vec4(color, through * uBloom * 0.55 * uEnvelope);
    }
`

// Fades. Slower in than out — this scene is arrived at and then left, and a
// long open is what gives the sphere time to read as monumental before
// anything happens on it.
const IN_START = 0.04
const IN_END = 0.3

// How the three colour sources wander, in seconds per orbit. No shared factors,
// so their relative arrangement never repeats.
const SOURCE_PERIODS = [41, 27, 19]

// The columns, in the order the strobe fires them.
//
// Stepping OUTWARD in depth and alternating sides means the pulse reads as one
// thing travelling away from the viewer rather than as eight lamps blinking.
// Built as data rather than nested maps so the render order and the strobe
// order are the same list and cannot drift apart — with two separate loops,
// reordering the columns visually would silently scramble the pulse.
// Near pair moved back from 2m to 8m. At 2m a column stands at roughly 78° off
// axis, so on a flat screen it crops to a featureless slab down the edge of the
// frame — and when it was the one firing, the strobe read as the whole side of
// the picture changing colour rather than as a column lighting up. Far enough
// back that all four pairs read as columns; the last pair still clears the wall.
// EXPORTED because the spatial score fires a voice at the column that is
// currently flashing, and a mirrored copy of these positions would let the
// sound drift off the light the first time the colonnade is re-laid out. Same
// arrangement WhiteTunnel already uses for STROBE_HZ — the score imports the
// scene's constants rather than restating them (MetaballField's mirrored orbit
// numbers are the counter-example that has to be retuned in two places).
export const COLUMNS = [0, 1, 2, 3].flatMap((step) => [-1, 1].map((side) => ({
    key: `${side}-${step}`,
    position: [side * 9.5, 9, SPHERE_Z + 8 - step * 9]
})))

// When the strobe happens, in local progress. Deliberately ONE window in the
// middle rather than the whole scene: the sphere needs to be established before
// anything interrupts it, and an event that runs the entire time is not an
// event. Ends well before the fade so the scene settles again afterwards.
export const STROBE_WINDOW = [0.42, 0.74]

// How many times the pulse runs the full colonnade inside that window. Three
// is enough to read as a rhythm; one reads as a glitch.
export const STROBE_RUNS = 3

// How fast a column falls dark after it fires. High, because this is a strobe —
// a slow decay is a fade, and eight overlapping fades is just the colonnade
// getting brighter.
export const STROBE_DECAY = 4.2

export default function DispersionSphere({ progress }) {
    const sphereRef = useRef(null)
    const materialRef = useRef(null)
    const shellRefs = useRef([])
    const lampRef = useRef(null)
    const strobeLampRef = useRef(null)

    // Scratch colours, allocated once. Reading and writing colour every frame
    // through fresh THREE.Color objects would allocate several per frame per
    // eye, which is exactly the shape of garbage that shows up as periodic
    // hitching in a headset rather than as a lower frame rate.
    const scratch = useMemo(() => ({
        room: new THREE.Color(),
        spectral: new THREE.Color(),
        strobe: new THREE.Color(),
        hsl: { h: 0, s: 0, l: 0 }
    }), [])

    const envelope = smoothstep(IN_START, IN_END, progress)
        * (1 - smoothstep(0.9, 1, progress))

    const ramp = useMemo(() => IRIS_RAMP.map((hex) => new THREE.Color(hex)), [])

    const sphereGeometry = useMemo(
        () => new THREE.IcosahedronGeometry(1, SPHERE_DETAIL),
        [])
    const shellGeometry = useMemo(
        () => new THREE.IcosahedronGeometry(1, SHELL_DETAIL),
        [])

    const material = useMemo(() => new THREE.ShaderMaterial({
        vertexShader,
        fragmentShader,
        // Merging the fog uniforms is what makes the #include <fog_*> chunks
        // compile; a ShaderMaterial has no fog support otherwise, and the
        // sphere would sit on top of the room's atmosphere instead of inside it.
        uniforms: THREE.UniformsUtils.merge([
            THREE.UniformsLib.fog,
            {
                uTime: { value: 0 },
                uTurbulence: { value: 0 },
                uExpansion: { value: 0 },
                uIntensity: { value: 0 },
                uScale: { value: 1 },
                uSpectrum: { value: 1 },
                uEnvelope: { value: 0 },
                uSourceA: { value: new THREE.Vector3(0, 1, 0) },
                uSourceB: { value: new THREE.Vector3(1, 0, 0) },
                uSourceC: { value: new THREE.Vector3(0, 0, 1) },
                uRamp: { value: ramp }
            }
        ]),
        fog: true
    }), [ramp])

    const shellMaterials = useMemo(() => SHELL_SCALES.map(() => new THREE.ShaderMaterial({
        vertexShader: shellVertexShader,
        fragmentShader: shellFragmentShader,
        uniforms: {
            uTime: { value: 0 },
            uScale: { value: 1 },
            uSpectrum: { value: 1 },
            uBloom: { value: 0 },
            uEnvelope: { value: 0 },
            uHaloTint: { value: 0 },
            // The piece's own near-white. Warm rather than blue, so the calm
            // surround reads as light rather than as paper — palette.js rule 4.
            uCalm: { value: new THREE.Color(PALETTE.offWhite) },
            uRamp: { value: ramp }
        },
        transparent: true,
        blending: THREE.AdditiveBlending,
        // Front faces culled, so only the far half of each shell is drawn.
        // Two reasons, and the second is the one that matters: it halves the
        // fill, and it means the opaque sphere's own depth buffer clips the
        // halo to exactly the annulus outside its silhouette. Drawing the near
        // half instead would lay a flat wash of colour across the sphere's
        // face and hide the fluid the shells exist to be glowing off.
        side: THREE.BackSide,
        depthWrite: false
    })), [ramp])

    // Architecture. Dark, matte-ish and entirely unlit by anything except the
    // sphere — the room exists to be a surface for the sphere's colour to land
    // on, which is the only way "reflected coloured light" reads as reflected
    // rather than as a second light source someone placed.
    const floorMaterial = useMemo(() => new THREE.MeshStandardMaterial({
        color: '#0A0E12',
        // Low roughness with some metalness gives a wet-stone sheen that
        // stretches the sphere's colour across the floor. A fully rough floor
        // takes the light and gives nothing back, and a mirror would need a
        // reflection probe the headset cannot afford.
        roughness: 0.34,
        metalness: 0.55
    }), [])

    // Lighter than it looks like it should be, and this was measured rather
    // than chosen. At #0C1116 the columns were mathematically lit and visually
    // absent — a near-black surface returning a fraction of a dim lamp lands
    // under the black point of the display, so the room read as a void with a
    // glow on the floor and the architecture may as well not have been built.
    // Dark still, but dark enough to SEE is a different value from dark enough
    // to be black.
    const stoneMaterial = useMemo(() => new THREE.MeshStandardMaterial({
        color: '#18212A',
        roughness: 0.58,
        metalness: 0.16
    }), [])

    // One material PER COLUMN, not one shared. A material is where `emissive`
    // lives, so eight columns sharing one can only ever strobe in unison — the
    // pulse travelling down the colonnade needs eight independent values and
    // there is no way to get them from a single instance.
    const columnMaterials = useMemo(() => COLUMNS.map(() => new THREE.MeshStandardMaterial({
        color: '#18212A',
        roughness: 0.58,
        metalness: 0.16,
        emissive: new THREE.Color('#000000'),
        emissiveIntensity: 0
    })), [])

    // Free the GPU-side buffers when the sequence is torn down. The edit list
    // loops unattended, so this piece is remounted once every ~53s all day —
    // without this every pass leaks another set of geometries and materials.
    useEffect(() => () => {
        sphereGeometry.dispose()
        shellGeometry.dispose()
        material.dispose()
        shellMaterials.forEach((shellMaterial) => shellMaterial.dispose())
        floorMaterial.dispose()
        stoneMaterial.dispose()
        columnMaterials.forEach((columnMaterial) => columnMaterial.dispose())
    }, [
        sphereGeometry,
        shellGeometry,
        material,
        shellMaterials,
        floorMaterial,
        stoneMaterial,
        columnMaterials
    ])

    useFrame(({ clock }) => {
        const time = clock.getElapsedTime()
        const controls = dispersionControls

        // The playhead drives the fade; the wall clock drives the motion, so
        // scrubbing the timeline does not scrub the fluid. That is deliberate:
        // this is a continuous process the piece cuts into, not an animation
        // with a first frame.
        const animated = time * controls.speed

        const current = materialRef.current
        if (current) {
            const uniforms = current.uniforms
            uniforms.uTime.value = animated
            uniforms.uTurbulence.value = controls.turbulence
            uniforms.uExpansion.value = controls.expansion
            uniforms.uIntensity.value = controls.colorIntensity
            uniforms.uScale.value = controls.fluidScale
            uniforms.uSpectrum.value = controls.spectrum
            uniforms.uEnvelope.value = envelope

            // The sources wander the surface. On the CPU because it is three
            // vectors a frame rather than three per fragment, and because the
            // shader needs them as a shared origin it cannot derive locally.
            const [pa, pb, pc] = SOURCE_PERIODS
            const a = (animated / pa) * Math.PI * 2
            const b = (animated / pb) * Math.PI * 2
            const c = (animated / pc) * Math.PI * 2
            uniforms.uSourceA.value
                .set(Math.cos(a), Math.sin(a * 0.61), Math.sin(a)).normalize()
            uniforms.uSourceB.value
                .set(Math.sin(b * 0.77), Math.cos(b), Math.cos(b * 0.43)).normalize()
            uniforms.uSourceC.value
                .set(Math.cos(c * 0.39), Math.sin(c * 0.83), Math.cos(c)).normalize()
        }

        const radius = controls.sphereSize
        const height = sphereHeight(radius)

        if (sphereRef.current) {
            sphereRef.current.scale.setScalar(radius)
            sphereRef.current.position.set(0, height, SPHERE_Z)
        }

        shellRefs.current.forEach((shell, index) => {
            if (!shell) return
            shell.scale.setScalar(radius * SHELL_SCALES[index])
            shell.position.set(0, height, SPHERE_Z)
            const uniforms = shellMaterials[index].uniforms
            uniforms.uTime.value = animated
            uniforms.uScale.value = controls.fluidScale
            uniforms.uSpectrum.value = controls.spectrum
            uniforms.uEnvelope.value = envelope
            // The outer shell is fainter than the inner one, or the pair reads
            // as two rings rather than as one falloff.
            uniforms.uBloom.value = controls.bloom * (index === 0 ? 1 : 0.45)
            uniforms.uHaloTint.value = controls.haloTint
        })

        // The room's light IS the sphere. One lamp at its centre, coloured by
        // roughly where the ramp currently sits, so the floor and the stone
        // pick up whatever the surface is doing. Approximate on purpose —
        // matching the shader exactly would mean reading pixels back, and the
        // eye is judging "the room went salmon", not a colour value.
        // ---- what colour the sphere currently is --------------------------
        //
        // Approximated on the CPU rather than read back from the shader. The
        // eye is judging "the room went salmon", not a colour value, and a
        // readback would stall the pipeline every frame to answer a question
        // nobody asked precisely.
        //
        // 0.021 appears here and in BOTH shaders and the three have to be the
        // same number. At 0.014 the sphere went yellow while the floor under it
        // stayed salmon, which reads instantly as a second hidden light rather
        // than as a reflection, and undoes the one thing this lamp is for.
        const phase = (animated * 0.021) % 1
        const irisIndex = phase * RAMP_SIZE
        const low = ramp[Math.floor(irisIndex) % RAMP_SIZE]
        const high = ramp[(Math.floor(irisIndex) + 1) % RAMP_SIZE]
        scratch.room.copy(low).lerp(high, irisIndex % 1)
        scratch.spectral.setHSL(phase, 0.62, 0.6)
        scratch.room.lerp(scratch.spectral, controls.spectrum)

        if (lampRef.current) {
            // Drained toward the same near-white as the halo, by the same knob.
            // The room light and the halo are the two things that put the
            // sphere's colour everywhere else in the frame, so they have to be
            // calmed together — whitening one and leaving the other is how you
            // get a white glow sitting inside a coloured room.
            lampRef.current.color
                .copy(PALETTE_CALM)
                .lerp(scratch.room, controls.haloTint)
            lampRef.current.intensity =
                envelope * controls.colorIntensity * controls.bloom * 26
            lampRef.current.position.set(0, height, SPHERE_Z)
        }

        // ---- the column strobe --------------------------------------------
        //
        // The one hard event in a scene that is otherwise entirely continuous.
        //
        // WHITE, on direction (2026-08-01, "i want strobe be white"), and this
        // REVERSES the amber-from-the-sphere's-hue rule that used to live
        // here — worth saying plainly so nobody re-derives the old saturated
        // pulse from the comments around COLUMNS. The colonnade now fires in
        // TUNNEL_WHITE.ring, the piece's one strobe white: the work opens on
        // a white pulse in a dark corridor and now closes on the same pulse
        // in a dark colonnade, which makes the ending a bookend rather than
        // a new colour arriving in the last eight seconds. The old behaviour
        // is one line: setHSL from scratch.room with saturation pushed up.
        const [strobeIn, strobeOut] = STROBE_WINDOW
        const strobeAmount = controls.strobe * envelope
        const running = strobeAmount > 0 && progress > strobeIn && progress < strobeOut

        scratch.strobe.set(TUNNEL_WHITE.ring)

        // Where the head of the pulse is, in column units. Wrapping this per
        // column rather than tracking an index means no column can be skipped
        // when the frame rate dips — a missed flash in a strobe is far more
        // visible than a late one.
        const head = running
            ? ((progress - strobeIn) / (strobeOut - strobeIn)) * STROBE_RUNS * COLUMNS.length
            : 0

        let leadIndex = 0
        let leadFlash = 0

        columnMaterials.forEach((columnMaterial, index) => {
            if (!running) {
                columnMaterial.emissiveIntensity = 0
                return
            }
            let behind = (head - index) % COLUMNS.length
            if (behind < 0) behind += COLUMNS.length
            const flash = Math.exp(-behind * STROBE_DECAY)

            columnMaterial.emissive.copy(scratch.strobe)
            columnMaterial.emissiveIntensity = flash * strobeAmount * 2.4

            if (flash > leadFlash) {
                leadFlash = flash
                leadIndex = index
            }
        })

        // ONE travelling lamp, not eight. Emissive alone makes a column glow
        // but throws nothing onto the floor or its neighbours, and eight point
        // lights is past what a standalone headset should be asked to shade.
        // Snapping a single light to whichever column is currently brightest
        // buys the bounce for the cost of one — and because only one column is
        // ever really lit at a time, the cheat has nothing to give it away.
        if (strobeLampRef.current) {
            const lead = COLUMNS[leadIndex].position
            strobeLampRef.current.position.set(lead[0], lead[1] - 4, lead[2])
            strobeLampRef.current.color.copy(scratch.strobe)
            strobeLampRef.current.intensity = running ? leadFlash * strobeAmount * 34 : 0
        }
    })

    if (progress === null) return null

    return (
        <group>
            <mesh ref={sphereRef} geometry={sphereGeometry}>
                <primitive object={material} ref={materialRef} attach="material" />
            </mesh>

            {SHELL_SCALES.map((scale, index) => (
                <mesh
                    key={scale}
                    ref={(node) => { shellRefs.current[index] = node }}
                    geometry={shellGeometry}
                >
                    <primitive object={shellMaterials[index]} attach="material" />
                </mesh>
            ))}

            {/* Distance-limited so the sphere's light cannot reach the rest of
                the installation in the outside view and wash the other
                sequences. decay 1.4 rather than the physical 2 for the reason
                palette.js gives: true inverse-square in a room this size lights
                a two-metre bubble and reads as a bug. */}
            <pointLight ref={lampRef} distance={90} decay={1.4} />

            {/* The floor. Large enough that its far edge is well past the fog,
                so the room has no visible end — a floor you can see the edge of
                is a stage, not a space. */}
            <mesh
                rotation={[-Math.PI / 2, 0, 0]}
                position={[0, FLOOR_Y, SPHERE_Z]}
                material={floorMaterial}
            >
                <planeGeometry args={[90, 90]} />
            </mesh>

            {/* Minimal architecture: two colonnades flanking the sphere and one
                wall well behind it. Their only job is to be surfaces at known
                distances — the coloured light falling off across them is what
                gives the room a scale, and without something to fall off ON,
                "monumental" has no reference. */}
            {/* Pulled in from ±13 to ±9.5. At the wider spacing the nearest
                pair fell outside the horizontal frustum at this FOV and the
                rest were too far off-axis to read, so the colonnade existed
                only in the source. Close enough to frame the sphere, far enough
                that the viewer is standing in the aisle rather than against a
                column — and the near pair sits just behind the eye, which is
                what gives a headset something to turn around and find.

                Rendered from the same COLUMNS list the strobe walks, so the
                order on screen and the order of the pulse are one thing. */}
            {COLUMNS.map((column, index) => (
                <mesh
                    key={column.key}
                    position={column.position}
                    material={columnMaterials[index]}
                >
                    <boxGeometry args={[1.6, 18, 1.6]} />
                </mesh>
            ))}

            {/* The travelling strobe lamp. Parked at zero intensity outside its
                window rather than unmounted: mounting a light mid-scene makes
                three.js recompile every material in the room, which on a
                headset is a visible hitch at exactly the moment the strobe is
                supposed to be sharp. */}
            <pointLight ref={strobeLampRef} distance={34} decay={1.5} intensity={0} />

            <mesh position={[0, 10, SPHERE_Z - 26]} material={stoneMaterial}>
                <boxGeometry args={[70, 20, 1]} />
            </mesh>
        </group>
    )
}
