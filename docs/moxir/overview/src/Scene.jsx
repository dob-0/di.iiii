import React, { Suspense, useEffect, useMemo, useRef } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { OrbitControls, useGLTF } from '@react-three/drei'
import * as THREE from 'three'
import hallUrl from './hall.glb?inline'
import lights from './lights.json'

// Hall frame (metres): x across, y up, z along the 108 m nave; stage line z 24.5, audience at larger z.
export const VIEWS = {
    overview: { pos: [-46, 30, 78], look: [10, 4, 8], roof: false },
    stage: { pos: [2.5, 2.2, 52], look: [0.5, 3.5, 20] },
    audience: { pos: [-4, 1.7, 33], look: [0.5, 4, 14] },
    top: { pos: [12, 120, 0.1], look: [12, 0, 0], roof: false },
    side: { pos: [125, 16, 8], look: [10, 5, 8] },
}

const BEAM_VERT = `varying float vT; uniform float uH; void main(){ vT = clamp(-position.y/uH,0.,1.); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }`
const BEAM_FRAG = `varying float vT; uniform vec3 uColor; uniform float uA; void main(){ float a = uA*pow(1.-vT,1.6)*smoothstep(0.,.04,vT); gl_FragColor = vec4(uColor, a); }`

const ROOF_CUT = new THREE.Plane(new THREE.Vector3(0, -1, 0), 8.8) // keeps everything below 8.8 m: the roof, trusses and lanterns go
function Hall({ show, roof }) {
    const { scene } = useGLTF(hallUrl)
    const cloned = useMemo(() => {
        const s = scene.clone(true)
        s.traverse((o) => { if (o.isMesh) { o.material = o.material.clone(); o.material.side = THREE.DoubleSide; o.material.envMapIntensity = 0.2 } })
        return s
    }, [scene])
    useEffect(() => { cloned.traverse((o) => { if (o.isMesh) { o.material.clippingPlanes = roof ? [] : [ROOF_CUT]; o.material.needsUpdate = true } }) }, [cloned, roof])
    return <primitive object={cloned} visible={show} />
}

function Lamps({ show }) {
    const refs = { par: useRef(), beam: useRef(), laser: useRef() }
    const groups = useMemo(() => ({
        par: lights.filter((l) => l.kind === 'par'), beam: lights.filter((l) => l.kind === 'beam'), laser: lights.filter((l) => l.kind === 'laser'),
    }), [])
    useEffect(() => {
        const m = new THREE.Object3D()
        for (const k of Object.keys(groups)) {
            groups[k].forEach((l, i) => { m.position.set(...l.p); m.updateMatrix(); refs[k].current.setMatrixAt(i, m.matrix) })
            refs[k].current.instanceMatrix.needsUpdate = true
        }
    }, [groups])
    return (
        <group visible={show}>
            <instancedMesh ref={refs.par} args={[null, null, groups.par.length]}><boxGeometry args={[0.3, 0.3, 0.3]} /><meshBasicMaterial color="#e9eef2" /></instancedMesh>
            <instancedMesh ref={refs.beam} args={[null, null, groups.beam.length]}><boxGeometry args={[0.38, 0.5, 0.38]} /><meshBasicMaterial color="#ffb347" /></instancedMesh>
            <instancedMesh ref={refs.laser} args={[null, null, groups.laser.length]}><boxGeometry args={[0.22, 0.22, 0.4]} /><meshBasicMaterial color="#f25f5c" /></instancedMesh>
        </group>
    )
}

function Beams({ show, strength }) {
    const items = useMemo(() => lights.filter((l) => l.kind !== 'laser').map((l) => {
        const h = Math.min(l.dist || 20, 30)
        const r = Math.tan(l.kind === 'beam' ? 0.045 : Math.max(l.ang || 0.13, 0.08)) * h
        const geo = new THREE.ConeGeometry(Math.max(r, 0.15), h, 20, 1, true); geo.translate(0, -h / 2, 0)
        const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, -1, 0), new THREE.Vector3(...l.d).normalize())
        const mat = new THREE.ShaderMaterial({ vertexShader: BEAM_VERT, fragmentShader: BEAM_FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
            uniforms: { uH: { value: h }, uColor: { value: new THREE.Color(l.color) }, uA: { value: 0.1 } } })
        return { geo, mat, q, p: l.p, id: l.id }
    }), [])
    useEffect(() => { items.forEach((i) => { i.mat.uniforms.uA.value = 0.1 * strength }) }, [strength, items])
    return <group visible={show}>{items.map((i) => <mesh key={i.id} geometry={i.geo} material={i.mat} position={i.p} quaternion={i.q} />)}</group>
}

function Rig({ show }) {
    // truss: four 3 m sections hung from the crane bridge, sloped 15 degrees; DJ step 3 x (2 x 1 m) at 0.4 m; barrier on the stage line.
    const truss = [[-5.588, 3.78], [-2.69, 4.557], [0.207, 5.333], [3.105, 6.11]]
    return (
        <group visible={show}>
            {truss.map(([x, y], i) => <mesh key={i} position={[x, y, 21]} rotation={[0, 0, 0.2618]}><boxGeometry args={[3, 0.3, 0.3]} /><meshBasicMaterial color="#9aa6b0" wireframe /></mesh>)}
            <mesh position={[0.13, 0.2, 23.5]}><boxGeometry args={[3, 0.4, 2]} /><meshBasicMaterial color="#4df9ff" wireframe /></mesh>
            <mesh position={[0.13, 0.875, 23.89]}><boxGeometry args={[1.8, 0.95, 0.8]} /><meshBasicMaterial color="#e9eef2" wireframe /></mesh>
            <mesh position={[0, 0.55, 25.79]}><boxGeometry args={[14.14, 1.1, 0.08]} /><meshBasicMaterial color="#ffb347" wireframe /></mesh>
        </group>
    )
}

function Camera({ view, interacting }) {
    const { camera } = useThree()
    const controls = useRef()
    const goal = useRef(VIEWS.overview)
    const moving = useRef(true)
    useEffect(() => { goal.current = VIEWS[view]; moving.current = true }, [view])
    useFrame((_, dt) => {
        const c = controls.current; if (!c) return
        if (moving.current) {
            const k = 1 - Math.pow(0.0006, dt)
            camera.position.lerp(new THREE.Vector3(...goal.current.pos), k)
            c.target.lerp(new THREE.Vector3(...goal.current.look), k)
            if (camera.position.distanceTo(new THREE.Vector3(...goal.current.pos)) < 0.05) moving.current = false
        }
        c.update()
    })
    return <OrbitControls ref={controls} makeDefault enableDamping dampingFactor={0.08} maxDistance={190} minDistance={2} onStart={() => { moving.current = false; interacting?.() }} />
}

export default function Scene({ view, show, strength, onInteract }) {
    return (
        <Canvas dpr={[1, 1.75]} camera={{ fov: 52, near: 0.1, far: 600, position: VIEWS.overview.pos }} gl={{ antialias: true, powerPreference: 'default' }} onCreated={({ gl }) => { gl.setClearColor('#000'); gl.localClippingEnabled = true }}>
            <ambientLight intensity={0.9} />
            <hemisphereLight args={['#9fb4c4', '#1a1410', 0.8]} />
            <directionalLight position={[40, 80, 30]} intensity={0.7} />
            <Suspense fallback={null}>
                <Hall show={show.hall} roof={show.roof} />
            </Suspense>
            <Lamps show={show.lamps} />
            <Beams show={show.beams} strength={strength} />
            <Rig show={show.rig} />
            <Camera view={view} interacting={onInteract} />
        </Canvas>
    )
}
