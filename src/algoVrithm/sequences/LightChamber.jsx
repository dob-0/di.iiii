import { useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { MeshReflectorMaterial } from '@react-three/drei'
import * as THREE from 'three'
import { fadeEnvelope } from '../ritualClock.js'
import { PALETTE, mixHex, quieten } from '../palette.js'
import {
    apertureOpening,
    breathe,
    colorWalk,
    drift,
    viewerInfluence
} from '../lightField.js'

// Sequence — the light chamber.
//
// A Turrell Ganzfeld by way of Tundra's "Row": vast luminous volumes receding
// into haze above a matte reflective floor. There are deliberately no OBJECTS
// here. Everything you can see is either light, fog, or the floor that light
// falls on, and the only event in sixty seconds is the colour slowly becoming
// a different colour.
//
// WHY IT IS ALL PLANES: a Turrell aperture reads as a hole into a lit volume,
// not as a lit rectangle, and the thing that sells it is the ABSENCE of an
// edge. So each volume is a plane whose alpha falls away to nothing well
// before its geometry ends — the mesh has a boundary, the light does not. A
// mesh with a visible border would read as a screen hanging in a room, which
// is the single failure mode of this whole look.
//
// WHY ADDITIVE: these are lamps. Where two overlap they should sum into
// something brighter, the way real light does. LightHaze keeps the cool and
// warm families on opposite sides of the room so that summing never produces
// magenta — see the note there.

// The Row. Panels receding into fog, each larger than the last so they hold a
// constant angular size — that is what makes the recession read as endless
// rather than as five rectangles at five distances.
const ROW_COUNT = 5
const ROW_START_Z = -7
const ROW_SPACING = 7.5
const ROW_GROWTH = 1.34

const PANEL_WIDTH = 5.4
const PANEL_HEIGHT = 3.6

const FLOOR_SIZE = 90

const vertexShader = /* glsl */`
    varying vec2 vUv;

    #include <fog_pars_vertex>

    void main() {
        vUv = uv;
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
    }
`

const fragmentShader = /* glsl */`
    uniform vec3 uTop;
    uniform vec3 uBottom;
    uniform float uOpacity;

    varying vec2 vUv;

    #include <fog_pars_fragment>

    void main() {
        // The gradient itself, eased so there is no band where it turns over.
        float t = smoothstep(0.0, 1.0, vUv.y);
        vec3 color = mix(uBottom, uTop, t);

        // The edge, or rather the lack of one. Falls off over nearly a third of
        // the panel on each side — anything tighter and the boundary becomes
        // findable, which turns the light back into a rectangle.
        float edgeX = smoothstep(0.0, 0.32, vUv.x) * smoothstep(1.0, 0.68, vUv.x);
        float edgeY = smoothstep(0.0, 0.26, vUv.y) * smoothstep(1.0, 0.74, vUv.y);

        gl_FragColor = vec4(color, edgeX * edgeY * uOpacity);

        #include <fog_fragment>
    }
`

const createPanelMaterial = () => new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    uniforms: THREE.UniformsUtils.merge([
        THREE.UniformsLib.fog,
        {
            uTop: { value: new THREE.Color(PALETTE.iceBlue) },
            uBottom: { value: new THREE.Color(PALETTE.deepSky) },
            uOpacity: { value: 0 }
        }
    ]),
    fog: true,
    transparent: true,
    blending: THREE.AdditiveBlending,
    // Light volumes must not write depth. A depth-writing transparent plane
    // punches a hole in whatever is behind it, which on an additive glow looks
    // like a rectangular bite taken out of the room.
    depthWrite: false,
    side: THREE.DoubleSide
})

export default function LightChamber({ progress }) {
    const groupRef = useRef(null)
    const camera = useThree((state) => state.camera)
    const envelope = fadeEnvelope(progress, 0.22, 0.22)

    // One material per panel: they run the same walk at different phases, so
    // the room is never one flat colour, and a shared material could not do
    // that. Created once and mutated per frame rather than rebuilt.
    const panels = useMemo(() => Array.from({ length: ROW_COUNT }, (_, index) => ({
        key: `row-${index}`,
        material: createPanelMaterial(),
        z: ROW_START_Z - index * ROW_SPACING,
        scale: Math.pow(ROW_GROWTH, index),
        // Offset phases so the row breathes as a travelling swell rather than
        // as one object. This is the "synchronised by an invisible
        // intelligence" part — related, clearly not coincidental, but never
        // actually in step.
        phase: index * 0.17,
        seed: index * 0.31
    })), [])

    const scratch = useMemo(() => ({
        top: new THREE.Color(),
        bottom: new THREE.Color(),
        cameraPosition: new THREE.Vector3()
    }), [])

    useFrame(({ clock }) => {
        const group = groupRef.current
        if (!group) return

        const time = clock.getElapsedTime()
        camera.getWorldPosition(scratch.cameraPosition)

        group.children.forEach((mesh, index) => {
            const panel = panels[index]
            if (!panel) return

            const breath = breathe(time, undefined, panel.phase)
            const walk = colorWalk(time + panel.phase * 9)

            // The colour the room is currently becoming. Top and bottom walk
            // the ramp a step apart, so every panel is itself a gradient
            // between two neighbouring colours rather than a flat wash.
            scratch.top.set(mixHex(walk.from, walk.to, walk.amount))
            scratch.bottom.set(quieten(mixHex(walk.to, walk.from, walk.amount), 0.3))

            const uniforms = mesh.material.uniforms
            uniforms.uTop.value.copy(scratch.top)
            uniforms.uBottom.value.copy(scratch.bottom)

            // The room leaning toward whoever is in it. Kept well under the
            // threshold of being noticeable as cause and effect — see the note
            // on viewerInfluence.
            const distance = scratch.cameraPosition.distanceTo(mesh.position)
            const nearness = viewerInfluence(distance, 14)

            uniforms.uOpacity.value = envelope
                * apertureOpening(progress, breath)
                * (0.5 + nearness * 0.22)

            // Drift, not orbit. Slow enough that the row is somewhere slightly
            // different whenever you look back at it.
            const offset = drift(time, panel.seed, 1.1)
            mesh.position.x = offset.x
            mesh.position.y = 1.9 + offset.y
        })
    })

    if (progress === null) return null

    return (
        <group>
            {/* Fill light. A Ganzfeld has no visible source — the air is simply
                bright — so this is broad and almost shadowless rather than a
                lamp placed somewhere.

                The flat part of that fill now lives on this sequence's row as
                `ambient: 0.55` (WORLD_PRESETS.chamber): it is the brightest
                room in the piece and that number is the reason, so it belongs
                where an author can find it next to the colour and the fog
                rather than inside this file. The hemisphere light stays — it
                has a direction (cool above, warm below), which is a lighting
                idea specific to this chamber and not something the room model
                expresses. */}
            <hemisphereLight
                color={PALETTE.iceBlue}
                groundColor={PALETTE.salmon}
                intensity={0.4 * envelope}
            />

            <group ref={groupRef}>
                {panels.map((panel) => (
                    <mesh key={panel.key} position={[0, 1.9, panel.z]} scale={panel.scale}>
                        <planeGeometry args={[PANEL_WIDTH, PANEL_HEIGHT]} />
                        <primitive object={panel.material} attach="material" />
                    </mesh>
                ))}
            </group>

            {/* The floor. Matte reflective, not mirrored: the reflection is
                what gives the light somewhere to land and turns a row of
                floating panels into a place.

                PERFORMANCE: a reflector re-renders the scene into a texture,
                and in an XR session that cost is paid per eye. Kept at 256 with
                heavy blur — which is also what makes it matte rather than a
                mirror, so the cheap setting and the right look happen to agree.
                This is the first thing to drop if a headset struggles. */}
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]}>
                <planeGeometry args={[FLOOR_SIZE, FLOOR_SIZE]} />
                <MeshReflectorMaterial
                    resolution={256}
                    blur={[900, 380]}
                    mixBlur={12}
                    mixStrength={1.5}
                    depthScale={1.1}
                    minDepthThreshold={0.4}
                    maxDepthThreshold={1.3}
                    color={quieten(PALETTE.shadow, 0.25)}
                    metalness={0.15}
                    roughness={0.92}
                    transparent
                    opacity={envelope}
                />
            </mesh>
        </group>
    )
}
