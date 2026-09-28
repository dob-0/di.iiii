import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { flashLamps, flashRig, strobeEnvelope, FLASH } from './rigFlash.js'

// STROBES AND BLINDERS AS A FLASH — RIG_BUILD.md §15.6. Owner's brief for MOXIR: "the
// underground rave thing … not the commercial shit"; the strobe hit rendered as huge flat
// grey cones and a white floor, which is nothing like a strobe.
//
// What a strobe is in a dark hazy room: a few milliseconds of white, many times a
// second — the face of the fixture blown out, the surfaces in front of it lit white for
// an instant, then black. A blinder is a warm face you cannot look into and a warm pool
// in front of it. Neither is a visible cone. So, per lamp lit in the look:
//   - its FACE: a quad on the lens, unlit and additive, and a camera-facing glare
//     sprite around it — the thing a photo of a strobe shows;
//   - the SURFACES it faces: ONE shared real spot light per kind (at the lit lamps'
//     centre, along their mean aim), pulsed at the strobe rate for strobes and steady
//     for blinders. One light, not one per lamp: the room's budget is ≤ 8 real lights
//     (spotBeam.js beamCastsLight), and it is mounted whenever the room has that kind at
//     all — at 0 when nothing is lit — so the shader's light count never changes mid-show
//     (a change recompiles every lit material: a visible hitch).
// The lamp entities themselves draw no cone and no light (looks.js flashEntities).
// Time is R3F's clock, so a recording on a controlled clock flashes on its own frames.

const glareTexture = (() => {
    let tex = null
    return () => {
        if (tex || typeof document === 'undefined') return tex
        const c = document.createElement('canvas')
        c.width = c.height = 128
        const g = c.getContext('2d')
        const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64)
        grad.addColorStop(0, 'rgba(255,255,255,1)')
        grad.addColorStop(0.12, 'rgba(255,255,255,0.85)')
        grad.addColorStop(0.35, 'rgba(255,255,255,0.22)')
        grad.addColorStop(1, 'rgba(255,255,255,0)')
        g.fillStyle = grad
        g.fillRect(0, 0, 128, 128)
        tex = new THREE.CanvasTexture(c)
        tex.colorSpace = THREE.SRGBColorSpace
        return tex
    }
})()

function Face({ lamp, envRef }) {
    const face = useRef(null)
    const glare = useRef(null)
    const spec = FLASH[lamp.kind]
    const { position, quaternion } = useMemo(() => {
        const dir = new THREE.Vector3(...lamp.dir)
        const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir)
        const p = new THREE.Vector3(...lamp.lens).addScaledVector(dir, 0.03)
        return { position: p, quaternion: q }
    }, [lamp.lens, lamp.dir])
    useFrame(() => {
        const e = envRef.current * lamp.level
        if (face.current) {
            face.current.material.opacity = Math.min(1, e)
            face.current.visible = e > 0.004
        }
        if (glare.current) {
            glare.current.material.opacity = Math.min(1, e * spec.glareOpacity)
            glare.current.visible = e > 0.004
        }
    })
    return (
        <>
            <mesh ref={face} position={position} quaternion={quaternion} raycast={() => null} renderOrder={3}>
                <planeGeometry args={spec.face} />
                <meshBasicMaterial color={spec.colour} transparent opacity={0} blending={THREE.AdditiveBlending} depthWrite={false} side={THREE.DoubleSide} toneMapped={false} fog={false} />
            </mesh>
            <sprite ref={glare} position={position} scale={[spec.glare, spec.glare, 1]} raycast={() => null} renderOrder={4}>
                <spriteMaterial map={glareTexture()} color={spec.colour} transparent opacity={0} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} fog={false} />
            </sprite>
        </>
    )
}

function SharedLight({ kind, rig, envRef }) {
    const light = useRef(null)
    const target = useRef(null)
    const spec = FLASH[kind]
    useEffect(() => {
        if (light.current && target.current) light.current.target = target.current
    }, [])
    useFrame(() => {
        const l = light.current
        if (!l) return
        l.intensity = rig ? spec.lightIntensity * rig.level * envRef.current : 0
    })
    const at = rig?.lens || [0, -1000, 0]
    const to = rig ? rig.lens.map((v, i) => v + rig.dir[i] * 10) : [0, -1001, 0]
    return (
        <>
            <spotLight ref={light} position={at} color={spec.colour} intensity={0} distance={spec.lightDistance} angle={spec.lightAngle} penumbra={0.75} decay={2} />
            <object3D ref={target} position={to} />
        </>
    )
}

export default function RigFlashes({ entities }) {
    const all = useMemo(() => flashLamps(entities), [entities])
    const kinds = useMemo(() => [...new Set(all.map((l) => l.kind))], [all])
    const lit = useMemo(() => all.filter((l) => l.level > 0), [all])
    const strobeEnv = useRef(0)
    const steadyEnv = useRef(1)
    useFrame((state) => { strobeEnv.current = strobeEnvelope(state.clock.elapsedTime) })
    if (!all.length) return null
    const envOf = (kind) => (kind === 'strobe' ? strobeEnv : steadyEnv)
    return (
        <group name="rig-flashes">
            {lit.map((l) => <Face key={l.id} lamp={l} envRef={envOf(l.kind)} />)}
            {kinds.map((k) => <SharedLight key={k} kind={k} rig={flashRig(lit.filter((l) => l.kind === k))} envRef={envOf(k)} />)}
        </group>
    )
}

