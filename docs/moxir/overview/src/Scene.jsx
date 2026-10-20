import React, { Suspense, useEffect, useMemo, useRef } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { OrbitControls, useGLTF } from '@react-three/drei'
import * as THREE from 'three'
import hallUrl from './hall.glb?inline'
import scene from './scene.json'

// Hall frame (metres): x across, y up, z along the 108 m nave; stage line z 24.5, audience at larger z, lasers deep at negative z.
export const VIEWS = {
    overview: { pos: [-46, 30, 78], look: [10, 4, 8], roof: false },
    stage: { pos: [2.5, 2.2, 52], look: [0.5, 3.5, 20] },
    audience: { pos: [-4, 1.7, 33], look: [0.5, 4, 14] },
    lasers: { pos: [0.1, 2.0, 40], look: [0, 7, -30] },
    top: { pos: [12, 120, 0.1], look: [12, 0, 0], roof: false },
    side: { pos: [125, 16, 8], look: [10, 5, 8] },
}

const BEAM_VERT = `varying float vT; uniform float uH; void main(){ vT = clamp(-position.y/uH,0.,1.); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }`
const BEAM_FRAG = `varying float vT; uniform vec3 uColor; uniform float uA; void main(){ float a = uA*pow(1.-vT,1.6)*smoothstep(0.,.04,vT); gl_FragColor = vec4(uColor, a); }`
const ROOF_CUT = new THREE.Plane(new THREE.Vector3(0, -1, 0), 8.8) // keeps everything below 8.8 m: the roof, trusses and lanterns go

const MARK = { par: ['#e9eef2', [0.3, 0.3, 0.3]], beam: ['#ffb347', [0.38, 0.5, 0.38]], wash: ['#d9573a', [0.3, 0.3, 0.3]], bee: ['#9aa6b0', [0.3, 0.3, 0.3]], blinder: ['#e8e4dc', [0.4, 0.3, 0.3]], strobe: ['#c9d3dc', [0.3, 0.3, 0.3]], laser: ['#f25f5c', [0.22, 0.22, 0.4]] }
const BOX = { truss: '#9aa6b0', step: '#4df9ff', table: '#e9eef2', barrier: '#ffb347', ashwall: '#7f8b96', tower: '#f25f5c', pa: '#c9d3dc', rigging: '#6d7882' }

function Hall({ show, roof }) {
    const { scene: glb } = useGLTF(hallUrl)
    const cloned = useMemo(() => {
        const s = glb.clone(true)
        s.traverse((o) => { if (o.isMesh) { o.material = o.material.clone(); o.material.side = THREE.DoubleSide; o.material.envMapIntensity = 0.2 } })
        return s
    }, [glb])
    useEffect(() => { cloned.traverse((o) => { if (o.isMesh) { o.material.clippingPlanes = roof ? [] : [ROOF_CUT]; o.material.needsUpdate = true } }) }, [cloned, roof])
    return <primitive object={cloned} visible={show} />
}

function Lamps({ show, held }) {
    const list = useMemo(() => scene.lights.filter((l) => (held ? l.held : !l.held)), [held])
    const byKind = useMemo(() => Object.keys(MARK).map((k) => [k, list.filter((l) => l.kind === k)]).filter(([, a]) => a.length), [list])
    return (
        <group visible={show}>
            {byKind.map(([k, arr]) => <Marks key={k} kind={k} arr={arr} ghost={held} />)}
        </group>
    )
}
function Marks({ kind, arr, ghost }) {
    const ref = useRef()
    useEffect(() => {
        const m = new THREE.Object3D()
        arr.forEach((l, i) => { m.position.set(...l.p); m.updateMatrix(); ref.current.setMatrixAt(i, m.matrix) })
        ref.current.instanceMatrix.needsUpdate = true
    }, [arr])
    const [color, size] = MARK[kind]
    return <instancedMesh ref={ref} args={[null, null, arr.length]}><boxGeometry args={size} /><meshBasicMaterial color={ghost ? '#4b545c' : color} wireframe={ghost} /></instancedMesh>
}

function Beams({ show, strength }) {
    const items = useMemo(() => scene.lights.filter((l) => !l.held && ['par', 'beam', 'wash'].includes(l.kind)).map((l) => {
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

// Laser beams are drawn as thin lines to where the design ends them, never as cones.
function Lasers({ show }) {
    const geo = useMemo(() => {
        const pts = []
        for (const l of scene.lights) { if (l.kind !== 'laser') continue; const a = new THREE.Vector3(...l.p); const b = a.clone().addScaledVector(new THREE.Vector3(...l.d).normalize(), Math.min(l.dist || 60, 80)); pts.push(a, b) }
        return new THREE.BufferGeometry().setFromPoints(pts)
    }, [])
    return <lineSegments visible={show} geometry={geo}><lineBasicMaterial color="#f25f5c" transparent opacity={0.85} /></lineSegments>
}

function Rig({ show, rigging }) {
    return (
        <group visible={show}>
            {scene.boxes.filter((b) => (b.kind === 'rigging') === rigging).map((b, i) => (
                <mesh key={i} position={b.p} rotation={b.r}><boxGeometry args={b.s} /><meshBasicMaterial color={BOX[b.kind] || '#9aa6b0'} wireframe /></mesh>
            ))}
            {!rigging && scene.smoke.map((p, i) => <mesh key={'s' + i} position={[p[0], p[1] + 0.3, p[2]]}><boxGeometry args={[0.6, 0.6, 0.6]} /><meshBasicMaterial color="#7f8b96" wireframe /></mesh>)}
        </group>
    )
}

function Camera({ view }) {
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
    return <OrbitControls ref={controls} makeDefault enableDamping dampingFactor={0.08} maxDistance={190} minDistance={2} onStart={() => { moving.current = false }} />
}

export default function Scene({ view, show, strength }) {
    return (
        <Canvas dpr={[1, 1.75]} camera={{ fov: 52, near: 0.1, far: 600, position: VIEWS.overview.pos }} gl={{ antialias: true, powerPreference: 'default' }} onCreated={({ gl }) => { gl.setClearColor('#000'); gl.localClippingEnabled = true }}>
            <ambientLight intensity={0.9} />
            <hemisphereLight args={['#9fb4c4', '#1a1410', 0.8]} />
            <directionalLight position={[40, 80, 30]} intensity={0.7} />
            <Suspense fallback={null}><Hall show={show.hall} roof={show.roof} /></Suspense>
            <Lamps show={show.lamps} held={false} />
            <Lamps show={show.held} held />
            <Beams show={show.beams} strength={strength} />
            <Lasers show={show.lasers} />
            <Rig show={show.rig} rigging={false} />
            <Rig show={show.rigging} rigging />
            <Camera view={view} />
        </Canvas>
    )
}
