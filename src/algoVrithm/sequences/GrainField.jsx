import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { smoothstep } from '../../timeline/clock.js'
import { createRandom } from '../random.js'
import { PALETTE, quieten } from '../palette.js'

// Grain field — Patricio González Vivo's lines pattern, taken off the screen.
//
// SOURCE: "Noise" chapter of The Book of Shaders, @patriciogv 2015,
// https://thebookofshaders.com/11/ — the wood-grain sketch: parallel stripes
// whose coordinates are rotated by value noise sampled at those same
// coordinates. Its value noise is Inigo Quilez's (iq, 2013,
// https://www.shadertoy.com/view/lsf3WH). Both functions are reproduced
// verbatim below; the only thing this file changes is what they are fed.
//
// WHY IT CANNOT BE PORTED AS-IS. The original is driven by gl_FragCoord — it
// paints in screen space, at one fixed distance from the eye. Put that on a
// quad in VR and both eyes receive an identical image, so there is no
// binocular disparity, no motion parallax, and no amount of beauty in the
// pattern will stop it reading as wallpaper stuck to your face. Depth in a
// headset is not a look; it is two eyes disagreeing about where something is.
// The disagreement has to be geometric or it does not exist.
//
// So each line becomes a real object at its own distance. The pattern's
// identity is kept in the two places that actually carry it — `lines()` shapes
// each strand's cross-section, and `rotate2d(noise(...))` swirls the strands
// around the viewer the way it swirled his stripes across the frame.
//
// WHY THE GEOMETRY DOES NOT MOVE. The obvious build is to make the strands and
// fly them at the viewer. It fails twice. A long bar travelling along its own
// axis shows no motion at all — there is no leading edge to watch, so it reads
// as static (a barber's pole with no stripe on it). And anything that travels
// has to recycle, which pops the instant it wraps; on a flat screen the pop is
// behind the camera, but this piece is 360° and the viewer WILL look back.
// Fixed strands with light flowing along them solve both, and are kinder in a
// headset besides: the eyes get stable geometry to converge on while the
// motion happens in luminance, which is the one channel that carries speed
// without carrying vection.

// Strands. Each is two triangles, so this is nothing on a GPU — the ceiling
// here is not fill rate but SHIMMER: every additional strand is another thin
// bright edge for the headset's reprojection to crawl on. This many reads as a
// thicket without turning the far half of the field into static.
const STRAND_COUNT = 520

// The cylinder the viewer stands inside, in metres.
//
// MIN_RADIUS is a comfort limit, not an aesthetic one. Stereo fusion starts
// failing inside roughly half a metre, and a bright line passing through the
// face is where people take the headset off. This is close enough that a small
// head movement swings the near strands hard across the far ones — which is
// motion parallax, the strongest depth cue available and the entire reason the
// lines were separated in the first place.
const MIN_RADIUS = 0.85
const MAX_RADIUS = 13

// How far the strands run fore and aft. Long enough that their ends are never
// the thing you notice; the longitudinal fade below hides them anyway.
const HALF_LENGTH = 23

// Strand width as a FRACTION OF ITS OWN RADIUS, not an absolute.
//
// A constant world-space width makes distant strands sub-pixel, and a
// sub-pixel bright line on a dark field is the worst case for a headset — it
// scintillates as the panel resamples it, and the scintillation is what people
// report as "the VR made my eyes tired". Scaling with distance holds every
// strand at about the same ANGULAR width instead, which is both stable and
// what the original pattern actually looks like: even stripes.
const WIDTH_RATIO = 0.011

// Standing eye height, so the cylinder is centred on the head rather than on
// the floor. Matches the standpoint the rest of the piece uses.
const EYE_HEIGHT = 1.6

// Fixed, so the field looks identical on every load and what gets approved is
// what the audience sees.
const SCATTER_SEED = 20260729

// Colour is cool family only, and this is a palette rule rather than a
// preference. The strands blend additively and cross each other constantly in
// depth, so any line of sight sums several of them — put warm strands in among
// cool ones and the overlaps land exactly on the magenta the palette exists to
// avoid (see rule 3 in palette.js, and the hemisphere split in LightHaze).
// Splitting the families by depth instead of by direction does not help: near
// and far is precisely the axis that sums.
//
// Within the cool family, near strands are paler and far ones deeper. That is
// aerial perspective — the real cue, doing real work here rather than being a
// stylistic nod. Pre-dimmed the way FIELD_COLORS is, because additive dots and
// additive lines have the same failure: each strand has to land well under its
// intended value so the SUM arrives at it.
const NEAR_COLOR = quieten(PALETTE.skyBlue, 0.42)
const FAR_COLOR = quieten(PALETTE.deepSky, 0.1)

// @patriciogv's functions, unchanged. Shared between both stages: the vertex
// shader needs noise + rotate2d to place the strands, the fragment needs noise
// + lines to shade them.
const PATRICIO_GLSL = /* glsl */`
    float random (in vec2 st) {
        return fract(sin(dot(st.xy,
                             vec2(12.9898,78.233)))
                    * 43758.5453123);
    }

    // Value noise by Inigo Quilez - iq/2013
    float noise(vec2 st) {
        vec2 i = floor(st);
        vec2 f = fract(st);
        vec2 u = f*f*(3.0-2.0*f);
        return mix( mix( random( i + vec2(0.0,0.0) ),
                         random( i + vec2(1.0,0.0) ), u.x),
                    mix( random( i + vec2(0.0,1.0) ),
                         random( i + vec2(1.0,1.0) ), u.x), u.y);
    }

    mat2 rotate2d(float angle){
        return mat2(cos(angle),-sin(angle),
                    sin(angle),cos(angle));
    }

    float lines(in vec2 pos, float b){
        float scale = 10.0;
        pos *= scale;
        return smoothstep(0.0,
                        .5+b*.5,
                        abs((sin(pos.x*3.1415)+b*2.0))*.5);
    }
`

const vertexShader = /* glsl */`
    uniform float uTime;
    uniform float uSwirl;
    uniform float uEmergence;

    attribute float aAngle;
    attribute float aRadius;
    attribute float aAcross;

    varying float vAcross;
    varying float vAngle;
    varying float vZ;
    varying float vDepth;

    #include <fog_pars_vertex>

    ${PATRICIO_GLSL}

    void main() {
        // position.z is the only part of the baked attribute the shader reads —
        // position.xy exists so three.js can compute a bounding sphere. Without
        // one the whole field is frustum-culled the moment the viewer turns
        // their head, and in a 360° piece that is every second.
        float z = position.z;

        // ---- the grain warp -------------------------------------------
        //
        // This is the original's one line — rotate the coordinate by noise
        // sampled at that coordinate — with the plane it rotates in changed.
        // His rotated the frame; this rotates the strand AROUND THE VIEWER, by
        // an amount that varies along the strand's length. So a strand does not
        // sit at a fixed bearing: it spirals slowly past you, and neighbouring
        // strands drift together into ropes and apart into gaps. That bunching
        // is what makes the pattern read as grain rather than as a barcode, and
        // it is the whole reason the noise is there.
        //
        // The 0.5 offset makes the swirl signed. Without it every strand
        // rotates the same way and the field looks combed rather than grown.
        vec2 grain = vec2(aAngle * 1.3, z * 0.06 + uTime * 0.02);
        float swirl = (noise(grain) - 0.5) * uSwirl;

        vec2 spoke = rotate2d(swirl) * vec2(cos(aAngle), sin(aAngle)) * aRadius;

        // The width runs tangentially — perpendicular to the line from the
        // viewer's axis out to the strand — so every strand presents its face
        // to the centre of the room. Billboarding toward the camera would be
        // the reflex here and is wrong in VR: a quad turned to face "the"
        // camera is facing neither eye, and the mismatch reads as a shimmer
        // along the edge that no amount of smoothing removes.
        vec2 outward = normalize(spoke);
        vec2 tangent = vec2(-outward.y, outward.x);
        vec2 xy = spoke + tangent * (aAcross * aRadius * ${WIDTH_RATIO});

        // Emergence scales the cylinder open from the viewer's own position, so
        // the field arrives by growing outward past them rather than fading up
        // already built. Fading up in place is the move that reads as a screen
        // being switched on; growing outward reads as a space opening.
        vec3 transformed = vec3(
            xy.x * uEmergence,
            ${EYE_HEIGHT.toFixed(2)} + (xy.y * uEmergence),
            z
        );

        vAcross = aAcross;
        vAngle = aAngle;
        vZ = z;
        vDepth = clamp(
            (aRadius - ${MIN_RADIUS.toFixed(2)})
                / ${(MAX_RADIUS - MIN_RADIUS).toFixed(2)},
            0.0, 1.0);

        vec4 mvPosition = modelViewMatrix * vec4(transformed, 1.0);
        gl_Position = projectionMatrix * mvPosition;

        #include <fog_vertex>
    }
`

const fragmentShader = /* glsl */`
    // highp, explicitly, and this is not boilerplate.
    //
    // random() is the classic sin-dot-fract hash, and it is a precision trap:
    // it multiplies by 43758.5453 and keeps the fraction, so at mediump —
    // which is what a mobile GPU gives a fragment shader by default, and the
    // Quest is a mobile GPU — the low bits that ARE the result are already
    // gone. The symptom is not an error; it is wide flat bands where the noise
    // should be, on the headset only, while the desktop preview looks perfect.
    precision highp float;

    uniform float uTime;
    uniform float uFlow;
    uniform float uSoftness;
    uniform float uOpacity;
    uniform float uGain;
    uniform vec3 uNear;
    uniform vec3 uFar;

    varying float vAcross;
    varying float vAngle;
    varying float vZ;
    varying float vDepth;

    #include <fog_pars_fragment>

    ${PATRICIO_GLSL}

    void main() {
        // ---- the line's cross-section ---------------------------------
        //
        // lines() unchanged, fed so that exactly one of its stripes spans this
        // strand. It scales pos by 10 internally and its period is 2, bright at
        // 0.5 and dark at 1.5, so mapping across (-1..1) to (0.5 + across) and
        // pre-dividing by the scale puts the bright core down the strand's
        // centre with both edges landing on its dark. The soft shoulder is
        // doing real work in VR — a hard-edged bright line is the shape a
        // headset's reprojection crawls on worst.
        float profile = lines(vec2((0.5 + vAcross) / 10.0, 0.0), uSoftness);

        // ---- light flowing toward the viewer --------------------------
        //
        // The same noise again, sampled along the strand and scrolled in +z:
        // the camera looks down -z, so features travelling toward +z travel
        // toward the face and past the ear. This is the ENTIRE sense of motion
        // in the sequence — the strands themselves never move. Near strands
        // sweep their bright patches across your view fast and far ones crawl,
        // for free and correctly, because they are genuinely at those distances
        // and the projection does the rest.
        float flow = noise(vec2(vAngle * 2.1, vZ * 0.18 - uTime * uFlow));
        flow = smoothstep(0.25, 0.85, flow);

        // The ends fade rather than stopping. A strand that simply stops leaves
        // a bright cut end hanging in the air, and directly behind the viewer
        // there is nothing else to look at, so it is the first thing they find.
        //
        // Written as 1.0 - smoothstep(low, high, x) rather than the shorter
        // smoothstep(high, low, x). GLSL ES leaves smoothstep UNDEFINED when
        // edge0 >= edge1 — desktop drivers quietly do the reasonable thing, so
        // the reversed form previews perfectly and is free to render garbage on
        // the headset, which is the only place it matters.
        float ends = 1.0 - smoothstep(0.72, 1.0, abs(vZ) / ${HALF_LENGTH.toFixed(1)});

        vec3 tint = mix(uNear, uFar, vDepth);
        float alpha = profile * flow * ends * uOpacity * uGain;

        gl_FragColor = vec4(tint, alpha);

        #include <fog_fragment>
    }
`

// Held at nothing, then opened. Slower in than out: a field that arrives
// gradually and leaves quickly reads as having been passed THROUGH, which is
// the sensation the sequence is for.
const FIELD_IN_START = 0.06
const FIELD_IN_END = 0.34

export default function GrainField({ progress }) {
    const materialRef = useRef(null)

    const envelope = smoothstep(FIELD_IN_START, FIELD_IN_END, progress)
        * (1 - smoothstep(0.86, 1, progress))

    const geometry = useMemo(() => {
        // Four vertices and two triangles per strand, built into one buffer
        // rather than instanced. Instancing buys nothing at this count and
        // costs the per-vertex attributes the warp needs.
        const positions = new Float32Array(STRAND_COUNT * 4 * 3)
        const angles = new Float32Array(STRAND_COUNT * 4)
        const radii = new Float32Array(STRAND_COUNT * 4)
        const across = new Float32Array(STRAND_COUNT * 4)
        const indices = new Uint16Array(STRAND_COUNT * 6)
        const random = createRandom(SCATTER_SEED)

        for (let strand = 0; strand < STRAND_COUNT; strand++) {
            const angle = random() * Math.PI * 2

            // sqrt-distributed, so strands spread evenly through the VOLUME
            // rather than evenly along the radius. A uniform radius packs most
            // of them into the near shell, where their overlap sums to a bright
            // cage around the head and the far field is left empty — the exact
            // inverse of the depth this sequence is built to produce.
            const radius = MIN_RADIUS
                + (MAX_RADIUS - MIN_RADIUS) * Math.sqrt(random())

            const restX = Math.cos(angle) * radius
            const restY = EYE_HEIGHT + Math.sin(angle) * radius

            const vertex = strand * 4
            const corners = [
                [-1, -HALF_LENGTH],
                [1, -HALF_LENGTH],
                [1, HALF_LENGTH],
                [-1, HALF_LENGTH]
            ]

            for (let corner = 0; corner < 4; corner++) {
                const index = vertex + corner
                // Rest position, for the bounding sphere only — the shader
                // recomputes where the vertex actually goes.
                positions[index * 3] = restX
                positions[index * 3 + 1] = restY
                positions[index * 3 + 2] = corners[corner][1]
                angles[index] = angle
                radii[index] = radius
                across[index] = corners[corner][0]
            }

            const face = strand * 6
            indices[face] = vertex
            indices[face + 1] = vertex + 1
            indices[face + 2] = vertex + 2
            indices[face + 3] = vertex
            indices[face + 4] = vertex + 2
            indices[face + 5] = vertex + 3
        }

        const result = new THREE.BufferGeometry()
        result.setAttribute('position', new THREE.BufferAttribute(positions, 3))
        result.setAttribute('aAngle', new THREE.BufferAttribute(angles, 1))
        result.setAttribute('aRadius', new THREE.BufferAttribute(radii, 1))
        result.setAttribute('aAcross', new THREE.BufferAttribute(across, 1))
        result.setIndex(new THREE.BufferAttribute(indices, 1))
        result.computeBoundingSphere()
        // The swirl moves strands off their rest positions by up to a radian of
        // arc, which at the outer radius is several metres. A tight sphere
        // would cull the field exactly when a strand swings widest.
        result.boundingSphere.radius += MAX_RADIUS * 0.5
        return result
    }, [])

    const material = useMemo(() => new THREE.ShaderMaterial({
        vertexShader,
        fragmentShader,
        // Merging the fog uniforms is what makes the #include <fog_*> chunks
        // work; a ShaderMaterial gets no fog otherwise. Fog is not decoration
        // here — it is the third depth cue after disparity and parallax, and
        // the only one that still works when the viewer holds their head
        // perfectly still.
        uniforms: THREE.UniformsUtils.merge([
            THREE.UniformsLib.fog,
            {
                uTime: { value: 0 },
                uOpacity: { value: 0 },
                uEmergence: { value: 0 },
                uNear: { value: new THREE.Color(NEAR_COLOR) },
                uFar: { value: new THREE.Color(FAR_COLOR) },
                // How far a strand swings around the viewer, in radians. Most
                // of the piece's character is in this number: at 0 the field is
                // a rigid cage of spokes, and past about 1.5 the strands cross
                // each other so often that the grain turns to felt.
                uSwirl: { value: 0.9 },
                // Speed of the light travelling along the strands. Not a
                // physical velocity — it is how fast the noise field is
                // scrolled, so it reads faster on the near strands than the far
                // ones, which is correct and is the parallax doing its job.
                uFlow: { value: 0.55 },
                // `b` in the original. Low is a hard-edged stripe, high is a
                // soft band; this sits toward soft because thin hard lines are
                // what shimmer in a headset.
                uSoftness: { value: 0.62 },
                // Per-strand contribution. Additive blending SUMS and a line of
                // sight through the cylinder crosses many strands, so each has
                // to land well under the value the field should reach.
                uGain: { value: 0.72 }
            }
        ]),
        fog: true,
        transparent: true,
        // Additive against the black world: crossings build into brightness the
        // way overlapping light does.
        blending: THREE.AdditiveBlending,
        // Strands must not write depth, or the near ones punch holes in the
        // ones behind and the field reads as broken rather than as transparent.
        depthWrite: false,
        // Both faces: the viewer is INSIDE this geometry and the swirl turns
        // strands away from them. Back-face culling would blink them out.
        side: THREE.DoubleSide
    }), [])

    useFrame(({ clock }) => {
        const current = materialRef.current
        if (!current) return
        current.uniforms.uTime.value = clock.getElapsedTime()
        current.uniforms.uOpacity.value = envelope
        current.uniforms.uEmergence.value =
            smoothstep(FIELD_IN_START, 0.55, progress)
    })

    if (progress === null) return null

    return (
        <group>
            <mesh geometry={geometry} frustumCulled={false}>
                <primitive object={material} ref={materialRef} attach="material" />
            </mesh>
        </group>
    )
}
