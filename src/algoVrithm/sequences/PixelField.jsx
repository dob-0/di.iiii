import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { smoothstep } from '../../timeline/clock.js'
import { createRandom } from '../random.js'
import { IRIS_RAMP } from '../palette.js'

// Sequence 02 — the pixel field, as an iridescent sphere.
//
// A luminous orb made of pixels, filled with liquid light: colour blooms from a
// source and spreads outward in slow waves, folding into itself, never
// repeating. The references are soap film, oil on water and ink dispersing in
// water — all the same physical effect, thin-film interference, where the
// colour you see is a function of how THICK the film is at that spot.
//
// WHY A SHELL AND NOT A BALL. The points blend additively, so brightness is the
// sum along a line of sight. A solid sphere is deepest through the middle,
// which would blow the centre to white exactly where the colour is supposed to
// be richest — and white is the one thing this palette spends its whole
// existence avoiding. A shell has roughly even depth across the disc and piles
// up only at the limb, where a real bubble is also brightest. It is also what
// the reference actually is: soap film is a film.
//
// WHY POINTS, NOT A MESH: one draw call for the whole sphere, each point a
// screen-facing dot the GPU rasterises directly. And it keeps the sequence's
// premise — the world made of pixels, not of surfaces.
//
// WHY THE MOTION IS IN A SHADER: 24,000 points animated on the CPU is 2.2
// million iterations a second at 90Hz, in JavaScript, on a mobile chip. The
// vertex shader does it in parallel; the per-frame CPU cost here is a handful
// of uniform updates.

const COUNT = 24000

// The film. Radius is the sphere itself; THICKNESS is how far points scatter
// either side of it.
//
// Thickness is doing two jobs at once. It stops the shell reading as a drawn
// outline — a zero-thickness sphere of points is a wireframe, and every point
// stays individually countable. And it is what lets the colour field read as a
// VOLUME of liquid rather than as a pattern painted on a surface: a line of
// sight crosses several points at slightly different thicknesses, so their
// colours sum the way ink in water does.
const RADIUS = 3.4
const THICKNESS = 0.62

// Where it hangs. Far enough to be seen whole and read as an object — this is a
// thing you look AT, which is what the brief asks for. Put it any closer and
// the viewer is inside it, and a sphere you are inside is a room, not a sphere.
// Eye height, slightly above, so it is not levelled with the horizon.
const CENTRE = [0, 1.7, -11]

// Distance from the surface at which the film has drained to nothing. Points
// this far out fade rather than stopping at a hard edge — "no sharp edges"
// applies to the silhouette as much as to the gradients.
const EDGE_SOFTNESS = 0.55

// Change this to reshuffle the sphere. Fixed, so the piece looks identical on
// every load and what gets approved is what the audience sees.
const SCATTER_SEED = 20260728

// GLSL ES needs a compile-time constant for the array size and the loop bound.
// Derived from the ramp itself rather than written out: the shader is built by
// interpolation, so the constant the GPU compiles is the array's actual length
// and the two cannot fall out of step. Hardcoding it would make adding a colour
// to IRIS_RAMP a silent wrong-colours bug rather than a compile error.
const RAMP_SIZE = IRIS_RAMP.length

const vertexShader = /* glsl */`
    uniform float uTime;
    uniform float uEmergence;
    uniform float uSize;
    uniform float uFold;
    uniform float uRefDistance;
    uniform vec3 uCentre;
    uniform vec3 uSourceA;
    uniform vec3 uSourceB;
    uniform vec3 uRamp[${RAMP_SIZE}];

    attribute vec3 aDirection;
    attribute float aDepth;

    varying vec3 vColor;
    varying float vFade;

    #include <fog_pars_vertex>

    // Cheap hash-based value noise. Not simplex: this runs 24,000 times a frame
    // on a standalone headset's GPU, and simplex costs several times as much
    // for a difference nothing here would show — the field is viewed through
    // thousands of soft overlapping dots, which hides the grid artefacts value
    // noise is criticised for.
    float hash(vec3 p) {
        p = fract(p * 0.3183099 + 0.1);
        p *= 17.0;
        return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
    }

    float noise(vec3 x) {
        vec3 i = floor(x);
        vec3 f = fract(x);
        // Smoothstepped interpolation — with linear interpolation the cell
        // boundaries are visible as creases, which is exactly the "sharp edge"
        // this piece is not allowed to have.
        f = f * f * (3.0 - 2.0 * f);
        return mix(
            mix(mix(hash(i), hash(i + vec3(1.0, 0.0, 0.0)), f.x),
                mix(hash(i + vec3(0.0, 1.0, 0.0)), hash(i + vec3(1.0, 1.0, 0.0)), f.x), f.y),
            mix(mix(hash(i + vec3(0.0, 0.0, 1.0)), hash(i + vec3(1.0, 0.0, 1.0)), f.x),
                mix(hash(i + vec3(0.0, 1.0, 1.0)), hash(i + vec3(1.0, 1.0, 1.0)), f.x), f.y),
            f.z);
    }

    // Four octaves. Three reads as smooth blobs, five costs more than it shows
    // once the dots have blurred it.
    float fbm(vec3 p) {
        float amplitude = 0.5;
        float sum = 0.0;
        for (int i = 0; i < 4; i++) {
            sum += amplitude * noise(p);
            // 2.02 rather than 2.0: an exact doubling lines every octave's grid
            // up on the same lattice and the sum develops a visible square
            // structure.
            p *= 2.02;
            amplitude *= 0.5;
        }
        return sum;
    }

    /**
     * Colour from film thickness.
     *
     * A tent filter over the ramp rather than an indexed lookup: GLSL ES only
     * guarantees constant indexing into uniform arrays, so uRamp[i] with a
     * computed i is not portable — and on the hardware where it fails it fails
     * silently. Tent width 1 means at most two entries ever contribute, so this
     * is an interpolation between neighbours, which is the whole reason
     * IRIS_RAMP is ordered the way it is.
     */
    vec3 sampleRamp(float t) {
        float x = fract(t) * float(${RAMP_SIZE});
        vec3 acc = vec3(0.0);
        float total = 0.0;
        for (int i = 0; i < ${RAMP_SIZE}; i++) {
            float d = abs(x - float(i));
            // Wrap distance, so the ramp is a loop with no seam at the join.
            d = min(d, float(${RAMP_SIZE}) - d);
            float w = max(0.0, 1.0 - d);
            // Eased, so a band's edge has no visible start and stop.
            w = w * w * (3.0 - 2.0 * w);
            acc += uRamp[i] * w;
            total += w;
        }
        return acc / max(total, 0.0001);
    }

    void main() {
        vec3 dir = aDirection;

        // ---- the thickness field -------------------------------------
        //
        // Domain warping: noise sampled at coordinates that are themselves
        // noise. This is what turns blobs into something that looks STIRRED —
        // the folding and swirling in the brief. Sampled straight, fbm gives
        // clouds; warped, it gives the sheets and filaments of a fluid.
        // Sampled from DIRECTION alone. Adding a per-point random offset here
        // was the difference between silk and dust: the noise field has to be
        // continuous ACROSS the surface for neighbouring points to belong to
        // the same sheet. Give every point its own offset and each one samples
        // an unrelated part of the field, which is a perfect uniform fizz — the
        // structure is still there mathematically and invisible on screen.
        vec3 p = dir * 1.9;
        vec3 warp = vec3(
            fbm(p + vec3(0.0, 1.7, 4.2) + uTime * 0.031),
            fbm(p + vec3(5.2, 1.3, 2.8) - uTime * 0.024),
            fbm(p + vec3(2.9, 4.1, 0.7) + uTime * 0.019)
        );
        float thickness = fbm(p + 2.6 * warp);

        // Two travelling waves, spreading outward from two sources that drift
        // over the surface — colour "blooming from the centre and expanding
        // outward", the way a drop of ink spreads from where it landed.
        //
        // acos of the dot product is the angle along the surface between this
        // point and the source, so subtracting time from it makes rings that
        // travel AWAY from the source rather than a pulse that blinks.
        float angleA = acos(clamp(dot(dir, uSourceA), -1.0, 1.0));
        float angleB = acos(clamp(dot(dir, uSourceB), -1.0, 1.0));
        // Periods deliberately share no factor, so the two never line up and
        // the surface never repeats — the same rule the light room runs on.
        thickness += 0.30 * sin(angleA * 3.1 - uTime * 0.47);
        thickness += 0.22 * sin(angleB * 4.3 - uTime * 0.31);

        // Depth through the film also shifts the colour. This is the part that
        // makes it read as liquid rather than as a painted sphere: two points
        // on the same line of sight are at different thicknesses, so they are
        // different colours, and the eye sums them into something with
        // substance behind it.
        thickness += aDepth * 0.4;

        // Two things decide which colours are reachable, and both are easy to
        // get wrong without noticing.
        //
        // The SCALE sets how much of the ramp the field spans. thickness lands
        // around 0.47 with a spread of roughly a third, so multiplying by 0.5
        // confined it to the ramp's first half — which is the entire cool block.
        // The warm family was unreachable, and the sphere came out blue with a
        // couple of peach flecks at the extremes.
        //
        // The DRIFT walks the whole film through the sequence over time. This is
        // what a draining bubble does — its thickness falls, so it cycles down
        // the interference orders — and it is what guarantees both families are
        // actually seen rather than merely available. Slow enough (a full cycle
        // is about fifty seconds) that you cannot catch it moving.
        vColor = sampleRamp(thickness * 0.95 + uTime * 0.02);

        // ---- where the point actually goes ---------------------------
        //
        // The film bulges where it is thick. Small: this is a sphere breathing,
        // not a blob. Past about 0.5 the silhouette stops reading as round and
        // the whole thing turns into a lump.
        float bulge = (thickness - 0.9) * uFold;

        // Tangential drift, so the surface SLIDES as well as swells — a film
        // that only moves in and out reads as a pulsing balloon. The cross
        // product gives a vector along the surface; scaling it by noise makes
        // neighbouring points slide by different amounts, which is shear, which
        // is what makes a fluid look like a fluid.
        vec3 tangent = normalize(cross(dir, vec3(0.0, 1.0, 0.13)) + 0.0001);
        float slide = (warp.x - 0.5) * 0.9;

        // Emergence grows the sphere from nothing rather than fading it in. The
        // tunnel hands over on a total blackout, so this sequence has to arrive
        // FROM the black — a sphere already at full size, fading up, reads as
        // having been there all along behind the dark.
        float radius = (${RADIUS.toFixed(2)} + aDepth * ${THICKNESS.toFixed(2)} + bulge) * uEmergence;
        vec3 transformed = uCentre + dir * radius + tangent * slide * uEmergence;

        // The film thins to nothing at its outermost points instead of ending
        // at a hard shell boundary.
        vFade = 1.0 - smoothstep(1.0 - ${EDGE_SOFTNESS.toFixed(2)}, 1.0, abs(aDepth));

        vec4 mvPosition = modelViewMatrix * vec4(transformed, 1.0);

        // Size attenuation: dots shrink with distance the way real points do.
        //
        // Stated as PIXELS AT A REFERENCE DISTANCE rather than as an arbitrary
        // constant over z. The previous form multiplied by 300.0 / -z, tuned
        // when this sequence was a 24-metre-wide field; at the sphere's 11
        // metres the identical expression yields dots about 85 pixels across,
        // and 24,000 of those blending additively is a white disc with a
        // coloured fringe. Writing the reference distance down means the number
        // travels with the geometry instead of silently meaning something else
        // the moment anything moves.
        gl_PointSize = uSize * (uRefDistance / -mvPosition.z);
        gl_Position = projectionMatrix * mvPosition;

        #include <fog_vertex>
    }
`

const fragmentShader = /* glsl */`
    uniform float uOpacity;
    uniform float uGain;
    varying vec3 vColor;
    varying float vFade;

    #include <fog_pars_fragment>

    void main() {
        // gl_PointCoord is 0..1 across the sprite. Discarding outside a radius
        // turns the default square into a round dot.
        vec2 offset = gl_PointCoord - vec2(0.5);
        float distanceSquared = dot(offset, offset);
        if (distanceSquared > 0.25) discard;

        // Squared falloff: a small bright centre with a fast fade rather than a
        // filled disc. It keeps each dot's contribution low, so the places where
        // many overlap gain COLOUR instead of blowing to white — the difference
        // between glossy and blown out.
        float falloff = smoothstep(0.25, 0.0, distanceSquared);
        float alpha = falloff * falloff * uOpacity * vFade * uGain;
        gl_FragColor = vec4(vColor, alpha);

        #include <fog_fragment>
    }
`

// This sequence starts 2.25s before the tunnel ends, and the tunnel ends by
// going completely black — its dark mouth arrives and swallows the frame. So
// the sphere must not simply be waiting there behind it: it has to EMERGE from
// the blackout, not be revealed as having been on the whole time.
//
// Held at nothing until the tunnel is done (0.15 of this window is exactly the
// tunnel's last frame), then up over the next third.
const FIELD_IN_START = 0.15
const FIELD_IN_END = 0.42

// Where the two colour sources sit, and how fast they wander. Incommensurate
// periods, so the pair never returns to the same arrangement and the surface
// keeps generating patterns it has not shown before — the "endless loop" in the
// brief is a loop with no seam, not a clip that repeats.
const SOURCE_A_PERIOD = 37
const SOURCE_B_PERIOD = 23

export default function PixelField({ progress }) {
    const materialRef = useRef(null)

    // Not fadeEnvelope's symmetric in/out: the fade-in has to be DELAYED, not
    // just slow. A fade starting at 0 is already a third of the way up by the
    // time the tunnel goes black, which is what put a lit field behind the
    // blackout.
    const envelope = smoothstep(FIELD_IN_START, FIELD_IN_END, progress)
        * (1 - smoothstep(0.88, 1, progress))

    const geometry = useMemo(() => {
        const directions = new Float32Array(COUNT * 3)
        const depths = new Float32Array(COUNT)
        const positions = new Float32Array(COUNT * 3)
        const random = createRandom(SCATTER_SEED)

        // Fibonacci sphere. Scattering by two uniform random angles clumps
        // points at the poles, because equal steps of latitude cover far less
        // area near the top than at the equator — and on a shell that clumping
        // is not subtle, it is two bright spots. The golden angle lands every
        // point in the largest remaining gap, so the cover is even everywhere.
        const golden = Math.PI * (3 - Math.sqrt(5))

        for (let index = 0; index < COUNT; index++) {
            // Evenly spaced in COSINE of latitude, not in latitude — this is
            // the same equal-area correction, on the other axis.
            const y = 1 - (index / (COUNT - 1)) * 2
            const ring = Math.sqrt(Math.max(0, 1 - y * y))
            const theta = golden * index

            const dx = Math.cos(theta) * ring
            const dz = Math.sin(theta) * ring

            directions[index * 3] = dx
            directions[index * 3 + 1] = y
            directions[index * 3 + 2] = dz

            // Signed position through the film, -1..1. Cubed so points gather
            // toward the mid-surface and thin out at both faces: a uniform
            // spread gives the shell two visible skins, which is two hard edges
            // where the brief wants none.
            const t = random() * 2 - 1
            depths[index] = t * t * t

            // The real positions are computed in the vertex shader every frame.
            // This attribute exists only so three.js can compute a bounding
            // sphere — without one the whole cloud is frustum-culled the moment
            // the viewer looks slightly away, and the sphere vanishes.
            positions[index * 3] = CENTRE[0] + dx * RADIUS
            positions[index * 3 + 1] = CENTRE[1] + y * RADIUS
            positions[index * 3 + 2] = CENTRE[2] + dz * RADIUS
        }

        const result = new THREE.BufferGeometry()
        result.setAttribute('position', new THREE.BufferAttribute(positions, 3))
        result.setAttribute('aDirection', new THREE.BufferAttribute(directions, 3))
        result.setAttribute('aDepth', new THREE.BufferAttribute(depths, 1))
        // Computed once from the rest position and then left alone. The shader
        // moves points by well under a metre, so a slightly generous sphere is
        // correct and re-deriving it per frame would mean reading 24,000 points
        // back on the CPU, which is the exact cost the shader exists to avoid.
        result.computeBoundingSphere()
        result.boundingSphere.radius += RADIUS * 0.5
        return result
    }, [])

    const material = useMemo(() => new THREE.ShaderMaterial({
        vertexShader,
        fragmentShader,
        // Merging the fog uniforms is what lets the #include <fog_*> chunks
        // work — a ShaderMaterial gets no fog support otherwise, and the sphere
        // would sit on top of the fog instead of dissolving into it.
        uniforms: THREE.UniformsUtils.merge([
            THREE.UniformsLib.fog,
            {
                uTime: { value: 0 },
                uEmergence: { value: 0 },
                uOpacity: { value: 0 },
                uCentre: { value: new THREE.Vector3(...CENTRE) },
                uSourceA: { value: new THREE.Vector3(0, 1, 0) },
                uSourceB: { value: new THREE.Vector3(1, 0, 0) },
                uRamp: { value: IRIS_RAMP.map((hex) => new THREE.Color(hex)) },
                // How far the film bulges where it is thick. Kept low — this is
                // a sphere breathing, not a blob.
                uFold: { value: 0.55 },
                // Slightly larger than the old field's 2.4. These dots overlap
                // far more here, and at 2.4 the shell read as grain rather than
                // as liquid — but every step up also stacks faster, so this is
                // the largest value that still resolves as pixels.
                uSize: { value: 3.0 },
                // The distance uSize is quoted at — the sphere's own, so
                // "2.6" means 2.6 pixels when you are looking straight at it.
                uRefDistance: { value: 11 },
                // Per-point contribution. Additive blending SUMS, and a line of
                // sight crosses the shell twice plus its thickness, so each dot
                // has to land well under the value it should reach on its own.
                // This is the number that decides whether the sphere is glossy
                // or blown out.
                uGain: { value: 0.88 }
            }
        ]),
        fog: true,
        transparent: true,
        // Additive against the near-black backdrop: overlapping dots build up
        // into brightness the way light does.
        blending: THREE.AdditiveBlending,
        // Points must not write depth or the nearer ones punch holes in the ones
        // behind, which on a transparent shell looks like missing data.
        depthWrite: false
    }), [])

    useFrame(({ clock }) => {
        const current = materialRef.current
        if (!current) return
        const time = clock.getElapsedTime()
        current.uniforms.uTime.value = time

        // The two colour sources wander the surface. Done on the CPU because it
        // is two vectors a frame, not 24,000 — and the shader needs them as a
        // shared origin, which it cannot derive per point.
        const a = current.uniforms.uSourceA.value
        const angleA = (time / SOURCE_A_PERIOD) * Math.PI * 2
        a.set(Math.cos(angleA), Math.sin(angleA * 0.61), Math.sin(angleA)).normalize()

        const b = current.uniforms.uSourceB.value
        const angleB = (time / SOURCE_B_PERIOD) * Math.PI * 2
        b.set(Math.sin(angleB * 0.77), Math.cos(angleB), Math.cos(angleB * 0.43)).normalize()

        // Grows out of the blackout rather than fading up at full size.
        current.uniforms.uEmergence.value = smoothstep(FIELD_IN_START, 0.5, progress)
        current.uniforms.uOpacity.value = envelope
    })

    if (progress === null) return null

    return (
        <group>
            {/* No floor grid, and no ground of any kind. The sphere hangs in
                unlit air with nothing to stand on and nothing to tell you which
                way is down — which is what "minimal black background" asks for,
                and what keeps the object reading as luminous rather than as lit
                from somewhere. */}
            <points geometry={geometry}>
                <primitive object={material} ref={materialRef} attach="material" />
            </points>
        </group>
    )
}
