import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { smoothstep } from '../ritualClock.js'
import { createRandom } from '../random.js'

// Sequence 04 — metaball field.
//
// Replaces the test pattern at this slot, on direction: keep Assembly's one
// genuinely immersive property — things travelling AROUND the visitor rather
// than in front of them — and throw away its look, which had drifted into the
// white tunnel's register. White world, black metaballs, physics.
//
// ---- WHAT THE REFERENCE ACTUALLY IS ----------------------------------------
//
// kynd, 2016, "Distance field metaball" (http://www.kynd.info). Twenty lines,
// and three of them matter:
//
//   1. `smoothen(d1, d2)` is an EXPONENTIAL smooth minimum:
//          -log(exp(-k*d1) + exp(-k*d2)) / k
//      Not a lerp, not a union. It is a min() that rounds off where the two
//      arguments cross, and that rounding IS the neck between two merging
//      blobs. k controls how wide the neck is: the blend width is ~1/k.
//   2. The two sources move on `±cos(u_time) * 0.3` about the centre — they
//      cross THROUGH each other, fuse into one form, and pull apart again.
//      The whole piece of the reference is one merge, repeated.
//   3. `smoothstep(0.8, 0.8+ae, d)` is a THRESHOLD, not shading. Inside the
//      level set it is black, outside it is white, and `ae` is one pixel of
//      antialiasing on that edge. There is no light in this reference at all.
//
// Point 3 is the one that decides the whole implementation below. A metaball
// with no shading is a SILHOUETTE, and a silhouette is a test — "is this ray
// inside the field?" — not a surface that has to be found, lit and normal-
// mapped. That is why nothing here builds geometry.
//
// ---- WHAT MAKES IT 3D ------------------------------------------------------
//
// The field becomes a 3D distance field, the two sources become five PAIRS of
// sources, and the pairs orbit the standpoint at 2.9m so the merging happens
// around the visitor instead of in front of them. That is Assembly's mechanic,
// kept: in a headset the thing you cannot get from a screen is that the event
// is behind you as well, and you turn your head to follow it.
//
// Each pair merges with ITSELF and never with its neighbours, which is not a
// limitation — it is the reference. The reference is two blobs. Five instances
// of two blobs, at five bearings, is the same image wrapped around a head.
//
// ---- WHY IT IS RAYMARCHED AND NOT BUILT --------------------------------- ---
//
// The obvious route is marching cubes (drei ships it) and it was measured and
// rejected. The facet size on a marching-cubes silhouette is
// `volumeSize / resolution`, and the blobs are at roughly 0.7 × the volume
// size, so the angular facet is about 164/resolution DEGREES no matter how the
// scene is scaled — 3.4° at the resolution a headset can afford. On a flat
// black silhouette against pure white there is nothing to hide it: it reads as
// a low-poly blob, which is the one thing a metaball must not look like.
//
// Raymarching has the opposite cost profile and the saving grace is point 3
// above. Because we only need the THRESHOLD and never the surface, the march
// tracks the minimum field value along the ray and stops — no normal, no
// lighting, no second march toward a light. And because the field is
// partitioned into five small spheres rather than one volume around the
// viewer, a ray tests five cheap ray-sphere bounds and then marches inside at
// most one of them, over about 4 metres, against TWO sources. Roughly 24 steps
// × 2 exp() for the pixels that hit anything and a handful of dot products for
// the ones that do not — cheaper than the dispersion sphere's surface shader,
// which already ships.
//
// The bound is what makes this affordable. Do not merge the five volumes into
// one field "for simplicity": that turns every pixel into a 10-source march
// across the whole room and is roughly a twentyfold cost increase.

// ---- the ring --------------------------------------------------------------

// Five pairs at 72°, so there is always one behind you. Four leaves a clean
// gap at the shoulders and the enclosure stops reading.
//
// COST KNOB: the fragment shader loops over this. Raising it raises the
// per-pixel bound tests linearly.
const PAIR_COUNT = 9

// Distance from the standpoint. Under about 2m a 0.5m blob fights the
// visitor's vergence at its nearest approach; past about 4m the pair stops
// being something you are among and becomes something you are watching.
const ORBIT_RADIUS = 2.9

// Ring centre, on the standpoint's own eye height (see stageView.js) so the
// merges happen in the sightline rather than overhead or underfoot.
const ORBIT_HEIGHT = 1.6

// How fast the ring carries the pairs around. 0.35 rad/s is 100° across a
// five-second beat — enough that a visitor facing forward at the start has to
// turn to keep one, and slow enough to be nothing like a vection trigger:
// these are five discrete objects, not a coherent full-field flow (the thing
// DataField.jsx's comfort note is about).
const ORBIT_RATE = 0.35

// Blob radius. With the separation below, this is what sets the fusion
// threshold: two sources read as one form once their half-separation drops
// under about `BALL_RADIUS + 1/(2·SMOOTH_K)`, which here is 0.71m.
const BALL_RADIUS = 0.5

// ---- the merge -------------------------------------------------------------
//
// The reference's k = 1.5 acts on distances multiplied by 5.0 in a normalised
// screen, where the implied ball radius is 0.16 × 5 = 0.8 of those units. So
// the reference's blend width is (1/1.5) / 0.8 = 0.83 BALL RADII. Holding that
// ratio at our radius gives 1 / (0.83 × 0.5) = 2.4.
//
// This is worth having derived rather than dialled by eye: the neck between
// two merging blobs is the only thing the reference is actually about, and its
// thickness relative to the blobs is the whole character of the effect. Change
// BALL_RADIUS and this has to move with it or the merge stops looking like the
// reference.
const SMOOTH_K = 2.4

// ---- the physics -----------------------------------------------------------
//
// The reference moves its sources on a cosine. A cosine in a headset reads as
// a mechanism, so the separation here is a real one-dimensional oscillator
// instead: the two sources of a pair ATTRACT on a linear spring and REPEL on
// an inverse-square law, which is an orbit seen edge-on. It never settles and
// never collapses, its swing is not sinusoidal — fast through the merge, slow
// at the extremes, exactly like something with mass — and it costs two
// multiplies per pair per step.
//
// These two numbers are the merge rhythm and nothing else in the file changes
// it. They were solved rather than dialled, from the oscillator's own energy:
// with potential U(s) = ATTRACTION·s²/2 + REPULSION/s, a pair released at
// SEPARATION_START swings to the other s where U is equal. Set for a closest
// approach of 0.25m — well inside the ~0.7m at which the two fuse, so the merge
// is unambiguous, and well clear of the floor below, which must never be the
// thing that turns the pair around.
//
// ATTRACTION sets the period: 1.9 gives 2.67s, so three merges across this
// beat's eight seconds. The reference merges once every 6.3s; five pairs on a
// staggered 2.67s means something is always merging somewhere around the
// visitor without any one of them being hurried.
const ATTRACTION = 1.9
const REPULSION = 0.382

// Half-separation the pair starts at, in metres. Above the fusion threshold, so
// the beat opens on ten distinct blobs and the first merge is something the
// visitor watches happen rather than arrives after.
const SEPARATION_START = 1.15

// Hard floor on the half-separation, and it is a GUARD, not the physics: with
// the constants above the turnaround happens at 0.25m and this is never
// reached. It exists because the inverse-square term becomes stiff as s → 0, so
// a fixed-step integrator handed a bad dt could step straight through the
// turnaround and fling the pair apart. If you retune ATTRACTION or REPULSION,
// check that this still never engages — the physics test asserts it.
const SEPARATION_MIN = 0.12

// Fixed integration step. The oscillator is stiff near closest approach, so it
// is integrated on its own clock rather than on the frame delta — the piece
// must play identically on a 60Hz monitor and a 90Hz headset, and a
// variable-step integrator on a stiff spring guarantees it will not.
const PHYSICS_STEP = 1 / 240

// Guard against a long frame (a tab regaining focus, an XR session starting)
// asking for thousands of steps at once.
const MAX_STEP_SECONDS = 0.25

// ---- the render ------------------------------------------------------------

// How far the march may travel inside one pair's bound before giving up. The
// bound is at most about 2.1m in radius, so a ray crossing it centrally covers
// 4.2m; 24 steps of sphere tracing on a field this smooth clears that with
// room to spare.
//
// COST KNOB: this is the inner loop.
const MARCH_STEPS = 24

// Minimum step, so a ray running parallel to the surface at a near-zero
// distance cannot stall and burn all 24 steps going nowhere.
const MIN_STEP = 0.04

// Slack added to each pair's bounding sphere, in metres. The exponential
// smooth minimum reaches slightly beyond the union of the two spheres — the
// neck bulges outward — and a bound drawn tight to the spheres clips it into a
// visible flat edge.
const BOUND_SLACK = 0.45

// The antialiased edge, as a fraction of the hit distance. Kept angular rather
// than absolute so a blob 2m away and a blob 4m away have the same softness on
// screen — which is what `ae = 5.0 / u_resolution.y` does in the reference.
const EDGE_ANGULAR = 0.006

// The world, and it has to be true black on true white for the same reason the
// test pattern's bars do: the fog blends the ink toward the world colour with
// distance, and the falloff needs the full range to fall through. WORLD must
// match the backdrop colour on this sequence's edit-list row — they are two
// halves of one white room, and if they disagree the far blobs fade to a grey
// that is visibly not the background.
const WORLD = '#FFFFFF'
const INK = '#000000'

// Where the ink starts washing out and where it is gone. Tighter than the test
// pattern's corridor because the content here is a shell at 2.9m rather than a
// corridor running to the horizon: the far side of a pair should be measurably
// paler than its near side, which is the only depth cue an unlit silhouette
// has.
const FOG_NEAR = 2.2
const FOG_FAR = 11

// The shell the shader is drawn on. Large enough that both eyes are well
// inside it in room-scale XR, small enough to stay inside the far plane.
const SHELL_RADIUS = 24

// ---- THE APPROACH AND THE PORTAL -------------------------------------------
//
// On direction: the metaballs come at the visitor and open a circular portal
// that the reel globe is behind. This is what joins beat 04 to beat 05 — the
// two scenes stop being a cross-fade and become one move.
//
// Three things happen at once over the last third of the beat:
//
//   1. THE APPROACH. The ring closes from ORBIT_RADIUS to APPROACH_RADIUS and
//      the balls swell, so the pairs stop being separate objects and merge into
//      one black mass filling the view. It reads as the field arriving rather
//      than the visitor moving, which is the only version that is comfortable —
//      the geometry the eye tracks is coming closer, but nothing suggests
//      self-motion.
//
//   2. THE PORTAL. A cone of rays around PORTAL_DIR stops drawing ink, so a
//      circular hole opens in the mass and the globe is visible through it.
//
//   3. THE MASK FLIPS. Until now this shader drew UNDER everything (renderOrder
//      -1) so a handover painted the neighbouring scene on top. For the portal
//      to work it has to draw OVER the globe instead: the ink is the wall, the
//      hole is the way through. That is the whole trick and it is one number.
//
// WHY THE PORTAL IS A FIXED WORLD DIRECTION AND NOT THE VIEW CENTRE. Anything
// derived from where the visitor happens to be looking puts the hole in a
// different place for each eye and follows the head like a sticker on the
// visor. A portal is a place in the room. You turn to look at it, and if you
// look away it is behind you — which is the correct behaviour for a door.
// PORTAL_DIR is -Z, the standpoint's default forward, so it opens where a
// visitor is most likely already facing.
const PORTAL_DIR = [0, 0, -1]

// When the approach starts and when the portal starts, as fractions of local
// progress. The portal opens later so there is a beat of solid black wall
// before it breaks — a hole that opens the instant the wall arrives reads as a
// dissolve rather than as something being opened.
const APPROACH_START = 0.62
const PORTAL_START = 0.78

// Where the ring closes to. Inside the fusion threshold at this ball size, so
// the nine pairs weld into one surface rather than staying nine dumbbells.
const APPROACH_RADIUS = 1.55

// What the balls swell to. Large enough that the merged mass has no gaps for
// the white world to show through — a wall with holes in it is not a wall.
const APPROACH_BALL_RADIUS = 1.15

// Half-angle the portal opens to, in radians. 0.62 is about 36 degrees, which
// at the end of the beat is a hole wide enough to be a place you are going
// rather than a window you are looking at.
const PORTAL_MAX_ANGLE = 0.62

// Softness of the portal's rim, in radians. The metaball edge is antialiased by
// distance; this one is angular, and it wants to be slightly soft or the rim
// crawls with the ray steps.
const PORTAL_EDGE = 0.05

// When the portal stops being a doorway and swallows the wall. From here to the
// end of the beat the half-angle sweeps from PORTAL_MAX_ANGLE all the way to PI,
// so the ink irises out past the visitor's peripheral vision and the last frame
// draws nothing at all. Without this the wall — deliberately held at full
// opacity because it is the thing the portal is a hole IN — was still covering
// everything outside a 36-degree cone when the sequence unmounted, and most of
// the view popped off in one frame. The exit is the portal finishing the job it
// started, not a fade: the wall leaves through its own hole.
const EXIT_START = 0.9

// Fixed, so what gets approved is what the audience sees on every load — the
// same rule as the rest of the piece's noise.
const PHASE_SEED = 20260730

const VERTEX_SHADER = /* glsl */`
varying vec3 vWorldPos;

void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorldPos = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
}
`

// `cameraPosition` is three's own uniform and it is set from the camera being
// rendered, which in an XR frame means each eye gets its own. That is the
// whole reason this is stereo-correct: the ray is built in WORLD space from a
// per-eye origin, so the two eyes see one solid object at one distance rather
// than two copies of a screen-space effect. Anything derived from the view
// centre instead — the trap documented at length in DispersionSphere.jsx —
// puts the blob in a different place for each eye and it stops fusing.
const FRAGMENT_SHADER = /* glsl */`
uniform vec4 uBallA[PAIR_COUNT];
uniform vec4 uBallB[PAIR_COUNT];
uniform float uSmoothK;
uniform float uSlack;
uniform float uMinStep;
uniform float uEdge;
uniform float uOpacity;
uniform vec3 uPortalDir;
uniform float uPortalCos;
uniform float uPortalEdge;
uniform float uFogNear;
uniform float uFogFar;
uniform vec3 uWorld;
uniform vec3 uInk;

varying vec3 vWorldPos;

// kynd's smoothen(), as a signed distance to a pair of spheres. Identical in
// form to the reference; the radii are explicit here so the level set is 0
// rather than the reference's 0.8.
float pairField(vec3 p, vec4 a, vec4 b) {
    float da = length(p - a.xyz) - a.w;
    float db = length(p - b.xyz) - b.w;
    return -log(exp(-uSmoothK * da) + exp(-uSmoothK * db)) / uSmoothK;
}

void main() {
    vec3 rayOrigin = cameraPosition;
    vec3 rayDir = normalize(vWorldPos - rayOrigin);

    // The smallest field value anywhere along this ray, and where it happened.
    // Everything the reference does is a threshold on that number.
    float best = 1e9;
    float bestT = 0.0;

    for (int pair = 0; pair < PAIR_COUNT; pair++) {
        vec4 a = uBallA[pair];
        vec4 b = uBallB[pair];

        // Bounding sphere of this pair, derived rather than passed in.
        vec3 centre = (a.xyz + b.xyz) * 0.5;
        float bound = length(a.xyz - b.xyz) * 0.5 + a.w + uSlack;

        vec3 toCentre = rayOrigin - centre;
        float half_b = dot(toCentre, rayDir);
        float c = dot(toCentre, toCentre) - bound * bound;
        float disc = half_b * half_b - c;
        if (disc < 0.0) continue;

        float root = sqrt(disc);
        float tExit = -half_b + root;
        if (tExit <= 0.0) continue;
        float t = max(-half_b - root, 0.0);

        // Named marchStep and not step, because step() is a GLSL builtin and a
        // local of that name shadows it for the rest of the scope.
        for (int marchStep = 0; marchStep < MARCH_STEPS; marchStep++) {
            if (t > tExit) break;
            float d = pairField(rayOrigin + rayDir * t, a, b);
            if (d < best) {
                best = d;
                bestT = t;
            }
            // Inside the level set. Nothing further along this ray can be more
            // inside than this in a way the threshold would notice.
            if (d < 0.0) break;
            t += max(d, uMinStep);
        }
    }

    // The reference's smoothstep(0.8, 0.8 + ae, d), with the level set at 0.
    float edge = uEdge * max(bestT, 0.5);
    float alpha = 1.0 - smoothstep(0.0, edge, best);

    // THE PORTAL. A cone of rays around a fixed world direction stops drawing
    // ink, so the mass opens rather than fades. uPortalCos is cos(half-angle),
    // so a LARGER angle is a SMALLER cosine — the hole grows as uPortalCos
    // falls, and at 1.0 (the closed state) nothing is ever inside it.
    float portal = smoothstep(
        uPortalCos,
        uPortalCos + uPortalEdge,
        dot(rayDir, uPortalDir)
    );
    alpha *= 1.0 - portal;

    if (alpha <= 0.002) discard;

    // Distance wash toward the world, which is the only depth this silhouette
    // gets. Done here rather than by scene fog because the shell this is drawn
    // on sits at a fixed radius and scene fog would tint the whole thing by
    // the shell's distance instead of the blob's.
    float wash = smoothstep(uFogNear, uFogFar, bestT);
    vec3 colour = mix(uInk, uWorld, wash);

    // Written straight out, with no tone mapping or colour-space conversion —
    // the same decision as the test pattern's toneMapped={false}, for the same
    // reason. This sequence renders exactly two values, and 0 and 1 are the two
    // numbers that are identical in linear and in sRGB, so the ink matches true
    // black and the far wash matches the backdrop's white exactly. Pulling in
    // three's tonemapping and colorspace chunks would need their declaration
    // halves as well, and would buy nothing here: only the midpoint of the wash
    // would move, and this ramp is authored against what is on screen.
    gl_FragColor = vec4(colour, alpha * uOpacity);
}
`

const withConstants = (source) => source
    .replace(/PAIR_COUNT/g, String(PAIR_COUNT))
    .replace(/MARCH_STEPS/g, String(MARCH_STEPS))

/**
 * One step of the pair oscillator.
 *
 * Exported for the test: the claim that this thing swings rather than settling
 * or collapsing is the whole physics, and it is worth asserting rather than
 * looking at.
 */
export const stepSeparation = (separation, velocity, dt) => {
    // Attraction pulls the two together, repulsion holds them off. Both act on
    // the HALF-separation, so the pair stays symmetric about its own centre and
    // the centre is free to be carried by the ring.
    const acceleration = -ATTRACTION * separation + REPULSION / (separation * separation)
    let nextVelocity = velocity + acceleration * dt
    let nextSeparation = separation + nextVelocity * dt

    if (nextSeparation < SEPARATION_MIN) {
        nextSeparation = SEPARATION_MIN
        nextVelocity = Math.abs(nextVelocity)
    }

    return { separation: nextSeparation, velocity: nextVelocity }
}

export default function MetaballField({ progress }) {
    const materialRef = useRef(null)

    // Per-pair state. Phases are seeded so the five pairs are not a mechanism
    // in lockstep; the oscillator state is the same for all of them because
    // the phase offset is what stops them agreeing, not the initial energy.
    const pairs = useMemo(() => {
        const random = createRandom(PHASE_SEED)
        return Array.from({ length: PAIR_COUNT }, (unused, index) => ({
            bearing: (index / PAIR_COUNT) * Math.PI * 2,
            // Vertical offsets, so the ring is a loose band rather than a
            // ring of five things at exactly one height, which from the
            // standpoint reads as a horizon line.
            height: (random() - 0.5) * 1.5,
            bob: 0.18 + random() * 0.22,
            bobRate: 0.5 + random() * 0.7,
            // Tilt of the pair's own axis. Without it every merge happens
            // along the ring's tangent and the five look like one animation.
            tilt: (random() - 0.5) * 1.1,
            separation: SEPARATION_START,
            velocity: 0,
            // Staggered start, spread across a full oscillator period (2.67s)
            // so the five merges never land together. A stagger shorter than
            // the period leaves them visibly in phase.
            lead: random() * 2.67
        }))
    }, [])

    const scratch = useMemo(() => ({
        elapsed: 0,
        seeded: false,
        ballA: Array.from({ length: PAIR_COUNT }, () => new THREE.Vector4()),
        ballB: Array.from({ length: PAIR_COUNT }, () => new THREE.Vector4())
    }), [])

    const uniforms = useMemo(() => ({
        uBallA: { value: scratch.ballA },
        uBallB: { value: scratch.ballB },
        uSmoothK: { value: SMOOTH_K },
        uSlack: { value: BOUND_SLACK },
        uMinStep: { value: MIN_STEP },
        uEdge: { value: EDGE_ANGULAR },
        uOpacity: { value: 0 },
        uFogNear: { value: FOG_NEAR },
        uFogFar: { value: FOG_FAR },
        uWorld: { value: new THREE.Color(WORLD) },
        uInk: { value: new THREE.Color(INK) },
        uPortalDir: { value: new THREE.Vector3(...PORTAL_DIR).normalize() },
        // cos(half-angle). 1 is a hole of zero size, which is the closed state —
        // no ray can have a dot product above 1, so nothing is ever inside it.
        uPortalCos: { value: 1 },
        uPortalEdge: { value: PORTAL_EDGE }
    }), [scratch])

    useFrame((state, delta) => {
        const material = materialRef.current
        if (!material) return

        const local = progress
        if (local === null) return

        // The approach and the portal, both driven straight off local progress
        // rather than integrated — these are a choreographed move with a fixed
        // shape, not a velocity the body reads, so they SHOULD stretch if the
        // beat is retimed. The opposite call to the reel globe's acceleration,
        // for the opposite reason.
        const approach = smoothstep(APPROACH_START, 1, local)
        const portalOpen = smoothstep(PORTAL_START, 1, local)
        const exit = smoothstep(EXIT_START, 1, local)

        const orbitRadius = ORBIT_RADIUS + (APPROACH_RADIUS - ORBIT_RADIUS) * approach
        const ballRadius = BALL_RADIUS + (APPROACH_BALL_RADIUS - BALL_RADIUS) * approach

        // The fade-out is CANCELLED once the approach begins. Every other
        // sequence dips toward invisible at the end of its beat, and that dip is
        // the handover — but here the field has to stay solid right up to the
        // cut, because it is the wall the portal is a hole in. A wall that fades
        // has no hole in it; it just goes away, and the portal becomes a
        // cross-fade with extra steps.
        material.uniforms.uOpacity.value = smoothstep(0, 0.12, local)
            * Math.max(smoothstep(1, 0.88, local), approach)

        // cos(half-angle), driven from 1 (shut) down through cos(PORTAL_MAX_ANGLE)
        // and then, over the exit, to below -1 — see EXIT_START. The extra
        // PORTAL_EDGE below the floor matters: cos(PI) is exactly -1, and a ray
        // pointing straight away from the portal has a dot product of exactly -1,
        // which sits at the smoothstep's LOWER edge and still draws ink. Pushing
        // the threshold one rim-width past the floor puts every ray strictly
        // inside the hole, so the final frames genuinely draw nothing.
        const portalAngle = PORTAL_MAX_ANGLE * portalOpen
            + (Math.PI - PORTAL_MAX_ANGLE) * exit
        material.uniforms.uPortalCos.value = Math.cos(portalAngle) - PORTAL_EDGE * exit

        // Run the pairs forward before the first drawn frame, so the beat does
        // not open on ten sources sitting still at their start separation
        // waiting for physics to begin.
        if (!scratch.seeded) {
            scratch.seeded = true
            pairs.forEach((pair) => {
                let steps = Math.round(pair.lead / PHYSICS_STEP)
                while (steps-- > 0) {
                    const next = stepSeparation(pair.separation, pair.velocity, PHYSICS_STEP)
                    pair.separation = next.separation
                    pair.velocity = next.velocity
                }
            })
        }

        const dt = Math.min(delta, MAX_STEP_SECONDS)
        scratch.elapsed += dt

        let remaining = dt
        while (remaining > 0) {
            const step = Math.min(PHYSICS_STEP, remaining)
            pairs.forEach((pair) => {
                const next = stepSeparation(pair.separation, pair.velocity, step)
                pair.separation = next.separation
                pair.velocity = next.velocity
            })
            remaining -= step
        }

        const time = scratch.elapsed

        pairs.forEach((pair, index) => {
            const bearing = pair.bearing + time * ORBIT_RATE
            const cos = Math.cos(bearing)
            const sin = Math.sin(bearing)

            const centreX = cos * orbitRadius
            const centreZ = sin * orbitRadius
            const centreY = ORBIT_HEIGHT
                + pair.height
                + Math.sin(time * pair.bobRate + pair.bearing) * pair.bob

            // The pair's own axis: the ring's tangent, tilted out of horizontal
            // so each pair merges along a different line.
            const axisX = -sin * Math.cos(pair.tilt)
            const axisY = Math.sin(pair.tilt)
            const axisZ = cos * Math.cos(pair.tilt)

            const reach = pair.separation

            scratch.ballA[index].set(
                centreX + axisX * reach,
                centreY + axisY * reach,
                centreZ + axisZ * reach,
                ballRadius
            )
            scratch.ballB[index].set(
                centreX - axisX * reach,
                centreY - axisY * reach,
                centreZ - axisZ * reach,
                ballRadius
            )
        })
    })

    if (progress === null) return null

    // renderOrder 10 and not -1. This shader used to draw UNDER its neighbours,
    // so a handover painted the next scene on top of it; the portal inverts
    // that relationship — the ink has to be a wall standing in FRONT of the reel
    // globe, with the hole as the only way through. See THE APPROACH AND THE
    // PORTAL.
    return (
        <mesh frustumCulled={false} renderOrder={10}>
            <sphereGeometry args={[SHELL_RADIUS, 24, 16]} />
            {/* Drawn on the inside of a shell rather than on a full-screen
                quad: a quad fights the per-eye asymmetric projection an XR
                frame is rendered with, which is the same reason TransitionVeil
                is a sphere.

                depthTest off and drawn first. The blobs are the room in this
                beat and there is nothing else in it, but across the 1.2s
                handovers at either end the neighbouring sequence's content is
                mounted too — and with no depth to test against, that content
                always paints in front. For a cross-fade between two worlds
                that is the right way round; it would be wrong if this sequence
                ever had to interleave with solid geometry, and that is the one
                thing to know before reusing this shader anywhere else. */}
            <shaderMaterial
                ref={materialRef}
                vertexShader={withConstants(VERTEX_SHADER)}
                fragmentShader={withConstants(FRAGMENT_SHADER)}
                uniforms={uniforms}
                transparent
                depthWrite={false}
                depthTest={false}
                side={THREE.BackSide}
                fog={false}
            />
        </mesh>
    )
}
