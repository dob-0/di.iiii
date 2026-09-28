import { Component, useMemo, useRef } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import * as THREE from 'three'

// A TINY LOOPING PREVIEW of what a device does, on the item card (RIG_BUILD.md §13): a beam,
// a laser fan, a CO₂ plume, sparks, smoke, haze. An illustration, not a simulation — shapes
// and timings are drawn to read at a glance (a CO₂ jet fires ~1 s and stops; sparks fall;
// haze makes a beam visible), never to measure anything. Mounted only when asked for, in its
// own small canvas; with no WebGL it says so and the card stays.

const N = 600
const rand = (seed) => { let s = seed; return () => { s = (s * 16807) % 2147483647; return s / 2147483647 } }

function Particles({ kind }) {
    const ref = useRef()
    const r = useMemo(() => rand(7), [])
    const state = useMemo(() => {
        const pos = new Float32Array(N * 3)
        const vel = new Float32Array(N * 3)
        const life = new Float32Array(N).map(() => r() * 2)
        return { pos, vel, life }
    }, [r])
    const spec = {
        co2: { color: '#ffffff', size: 0.28, opacity: 0.6 },
        sparks: { color: '#ffb347', size: 0.08, opacity: 1 },
        smoke: { color: '#b8b8b8', size: 0.6, opacity: 0.18 },
        lowfog: { color: '#f2f2f2', size: 0.7, opacity: 0.22 },
        mist: { color: '#e8f0ff', size: 0.08, opacity: 0.5 }
    }[kind]
    const spawn = (i, t) => {
        const { pos, vel } = state
        const k = i * 3
        if (kind === 'co2') {
            // Fires in bursts — about 1.2 s on, 0.8 s off — straight up.
            const on = (t % 2) < 1.2
            pos[k] = (r() - 0.5) * 0.12; pos[k + 1] = -1.4; pos[k + 2] = (r() - 0.5) * 0.12
            vel[k] = (r() - 0.5) * 0.5; vel[k + 1] = on ? 5 + r() * 2 : 0; vel[k + 2] = (r() - 0.5) * 0.5
            if (!on) pos[k + 1] = -99
        } else if (kind === 'sparks') {
            pos[k] = (r() - 0.5) * 0.1; pos[k + 1] = -1.4; pos[k + 2] = (r() - 0.5) * 0.1
            vel[k] = (r() - 0.5) * 0.8; vel[k + 1] = 3.5 + r() * 1.5; vel[k + 2] = (r() - 0.5) * 0.8
        } else if (kind === 'smoke') {
            pos[k] = -1.6; pos[k + 1] = -1.1 + r() * 0.2; pos[k + 2] = 0
            vel[k] = 0.9 + r() * 0.6; vel[k + 1] = 0.15 + r() * 0.25; vel[k + 2] = (r() - 0.5) * 0.4
        } else if (kind === 'lowfog') {
            pos[k] = -1.6; pos[k + 1] = -1.45; pos[k + 2] = (r() - 0.5) * 0.6
            vel[k] = 0.6 + r() * 0.5; vel[k + 1] = 0; vel[k + 2] = (r() - 0.5) * 0.8
        } else {
            pos[k] = (r() - 0.5) * 0.3; pos[k + 1] = -1.2; pos[k + 2] = 0
            vel[k] = (r() - 0.5) * 1.2; vel[k + 1] = 0.6 + r() * 0.4; vel[k + 2] = (r() - 0.5) * 0.6
        }
    }
    useFrame(({ clock }, dt) => {
        const { pos, vel, life } = state
        const t = clock.elapsedTime
        const d = Math.min(dt, 0.05)
        for (let i = 0; i < N; i++) {
            life[i] -= d
            if (life[i] <= 0) { spawn(i, t); life[i] = kind === 'co2' ? 0.8 : kind === 'sparks' ? 1.1 : 2.5 }
            const k = i * 3
            if (kind === 'sparks') vel[k + 1] -= 9.8 * d
            if (kind === 'co2') { vel[k] *= 0.98; vel[k + 1] *= 0.985 }
            pos[k] += vel[k] * d; pos[k + 1] += vel[k + 1] * d; pos[k + 2] += vel[k + 2] * d
        }
        const g = ref.current?.geometry
        if (g) g.attributes.position.needsUpdate = true
    })
    return (
        <points ref={ref}>
            <bufferGeometry>
                <bufferAttribute attach="attributes-position" args={[state.pos, 3]} />
            </bufferGeometry>
            <pointsMaterial color={spec.color} size={spec.size} transparent opacity={spec.opacity} depthWrite={false} blending={kind === 'sparks' ? THREE.AdditiveBlending : THREE.NormalBlending} sizeAttenuation />
        </points>
    )
}

function Beams({ kind, dim = 1 }) {
    const group = useRef()
    const cones = useMemo(() => {
        if (kind === 'matrix' || kind === 'effect') return Array.from({ length: 7 }, (_, i) => ({ angle: i === 0 ? 0 : 0.22, around: (i * Math.PI * 2) / 6, width: 0.06, colour: kind === 'effect' ? ['#ff3355', '#33ff88', '#3388ff', '#ffee33', '#ff33ee', '#33ffee', '#ffffff'][i] : '#ffd9a0' }))
        const width = kind === 'wash' ? 0.5 : kind === 'spot' ? 0.14 : 0.035
        return [{ angle: 0, around: 0, width, colour: kind === 'wash' ? '#7fb2ff' : '#ffffff' }]
    }, [kind])
    useFrame(({ clock }) => {
        const t = clock.elapsedTime
        if (!group.current) return
        group.current.rotation.z = Math.sin(t * 0.6) * 0.5
        group.current.rotation.y = kind === 'matrix' || kind === 'effect' ? t * 0.8 : 0
    })
    return (
        <group position={[0, 1.4, 0]}>
            <mesh><boxGeometry args={[0.35, 0.2, 0.3]} /><meshBasicMaterial color="#222" /></mesh>
            <group ref={group}>
                {cones.map((c, i) => {
                    const len = 3.2
                    const dir = new THREE.Euler(Math.sin(c.around) * c.angle, 0, Math.cos(c.around) * c.angle)
                    return (
                        <mesh key={i} rotation={dir}>
                            <group position={[0, -len / 2, 0]}>
                                <mesh>
                                    <coneGeometry args={[Math.tan(c.width) * len + 0.04, len, 24, 1, true]} />
                                    <meshBasicMaterial color={c.colour} transparent opacity={(kind === 'wash' ? 0.12 : 0.28) * dim} blending={THREE.AdditiveBlending} depthWrite={false} side={THREE.DoubleSide} />
                                </mesh>
                            </group>
                        </mesh>
                    )
                })}
            </group>
        </group>
    )
}

function Laser({ swing }) {
    const ref = useRef()
    const lines = 9
    const geo = useMemo(() => {
        const g = new THREE.BufferGeometry()
        g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(lines * 2 * 3), 3))
        return g
    }, [])
    useFrame(({ clock }) => {
        const t = clock.elapsedTime
        const p = geo.attributes.position.array
        for (let i = 0; i < lines; i++) {
            const spread = swing ? 0.12 : 1.1
            const a = (i / (lines - 1) - 0.5) * spread + (swing ? Math.sin(t * 2.2 + i * 0.7) * 0.8 : Math.sin(t * 0.9) * 0.4)
            p[i * 6] = -1.9; p[i * 6 + 1] = 0.2; p[i * 6 + 2] = 0
            p[i * 6 + 3] = -1.9 + Math.cos(a) * 5; p[i * 6 + 4] = 0.2 + Math.sin(a) * 5; p[i * 6 + 5] = 0
        }
        geo.attributes.position.needsUpdate = true
    })
    return (
        <lineSegments ref={ref} geometry={geo}>
            <lineBasicMaterial color={swing ? '#ff2a2a' : '#39ff6a'} transparent opacity={0.9} blending={THREE.AdditiveBlending} />
        </lineSegments>
    )
}

function Haze() {
    // Haze is what makes a beam visible: a beam through clear air (left), through haze (right).
    return (
        <>
            <mesh position={[0.9, 0, -0.5]}><planeGeometry args={[3, 4.2]} /><meshBasicMaterial color="#9aa0aa" transparent opacity={0.07} /></mesh>
            <group position={[-0.9, 0, 0]}><Beams kind="spot" dim={0.12} /></group>
            <group position={[0.9, 0, 0]}><Beams kind="spot" dim={1.4} /></group>
        </>
    )
}

class Boundary extends Component {
    constructor(props) { super(props); this.state = { failed: false } }
    static getDerivedStateFromError() { return { failed: true } }
    render() { return this.state.failed ? <div className="rigequip-preview is-empty rigplot-mono">no WebGL in this browser — the preview needs it</div> : this.props.children }
}

export default function EffectPreview({ kind, onClose }) {
    const particle = ['co2', 'sparks', 'smoke', 'lowfog', 'mist'].includes(kind)
    const beam = ['beam', 'spot', 'wash', 'matrix', 'effect'].includes(kind)
    return (
        <div className="rigequip-preview">
            <Boundary>
                <Canvas dpr={[1, 2]} camera={{ position: [0, 0, 6], fov: 45 }} gl={{ antialias: true, powerPreference: 'default' }}>
                    <color attach="background" args={['#0b0b0e']} />
                    <mesh position={[0, -1.5, 0]} rotation={[-Math.PI / 2, 0, 0]}><planeGeometry args={[8, 4]} /><meshBasicMaterial color="#1a1a1e" /></mesh>
                    {particle ? <Particles kind={kind} /> : null}
                    {beam ? <Beams kind={kind} /> : null}
                    {kind === 'laser-fan' ? <Laser /> : null}
                    {kind === 'laser-swing' ? <Laser swing /> : null}
                    {kind === 'haze' ? <Haze /> : null}
                </Canvas>
            </Boundary>
            <div className="rigequip-preview__foot rigplot-mono">
                <span>{kind} · an illustration, not to scale</span>
                <button type="button" className="rigequip-link" onClick={onClose}>stop</button>
            </div>
        </div>
    )
}
