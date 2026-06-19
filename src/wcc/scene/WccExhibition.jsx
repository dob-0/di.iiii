import { Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { useTexture } from '@react-three/drei'
import * as THREE from 'three'
import { landingContent } from '../landing/content.js'
import './scene.css'

const artworks = landingContent.artistWorks

// Three panels in a shallow arc, facing the viewer. Position + a slight inward
// yaw so the side panels angle toward the centre of the room.
const ARC = [
    { x: -4.6, y: 0.15, z: -1.1, ry: 0.42 },
    { x: 0, y: -0.05, z: 0.9, ry: 0 },
    { x: 4.6, y: 0.25, z: -1.1, ry: -0.42 }
]

const PANEL_BASE = 3.4
const tmpVec = new THREE.Vector3()
const tmpOffset = new THREE.Vector3()

function AmbientField() {
    const pointsRef = useRef(null)
    const [geometry, setGeometry] = useState(null)

    useEffect(() => {
        const count = 1100
        const positions = new Float32Array(count * 3)
        for (let i = 0; i < count; i += 1) {
            positions[i * 3] = (Math.random() - 0.5) * 34
            positions[i * 3 + 1] = (Math.random() - 0.5) * 20
            positions[i * 3 + 2] = (Math.random() - 0.5) * 26 - 4
        }
        const geo = new THREE.BufferGeometry()
        geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
        setGeometry(geo)
        return () => geo.dispose()
    }, [])

    useFrame((state) => {
        const points = pointsRef.current
        if (!points) return
        const t = state.clock.getElapsedTime()
        points.rotation.y = t * 0.012
        points.rotation.x = Math.sin(t * 0.05) * 0.04
    })

    if (!geometry) return null

    return (
        <points ref={pointsRef} geometry={geometry}>
            <pointsMaterial
                color={0xffffff}
                size={0.035}
                transparent
                opacity={0.42}
                depthWrite={false}
                sizeAttenuation
            />
        </points>
    )
}

function Artwork({ data, slot, index, focusIndex, onSelect }) {
    const groupRef = useRef(null)
    const [hovered, setHovered] = useState(false)
    const texture = useTexture(data.image)

    useEffect(() => {
        if (!texture) return
        texture.colorSpace = THREE.SRGBColorSpace
        texture.anisotropy = 8
        texture.needsUpdate = true
    }, [texture])

    const aspect = useMemo(() => {
        const image = texture?.image
        if (!image || !image.width || !image.height) return 1
        return image.width / image.height
    }, [texture])

    const width = aspect >= 1 ? PANEL_BASE : PANEL_BASE * aspect
    const height = aspect >= 1 ? PANEL_BASE / aspect : PANEL_BASE

    const isFocused = focusIndex === index
    const isDimmed = focusIndex !== null && !isFocused

    useFrame((state) => {
        const group = groupRef.current
        if (!group) return
        const t = state.clock.getElapsedTime()
        const bob = Math.sin(t * 0.6 + index * 1.7) * 0.12
        group.position.y = slot.y + bob
        const targetScale = hovered || isFocused ? 1.06 : 1
        const s = THREE.MathUtils.lerp(group.scale.x, targetScale, 0.12)
        group.scale.setScalar(s)
    })

    return (
        <group
            ref={groupRef}
            position={[slot.x, slot.y, slot.z]}
            rotation={[0, slot.ry, 0]}
            onPointerOver={(event) => {
                event.stopPropagation()
                setHovered(true)
                document.body.style.cursor = 'pointer'
            }}
            onPointerOut={() => {
                setHovered(false)
                document.body.style.cursor = ''
            }}
            onClick={(event) => {
                event.stopPropagation()
                onSelect(index)
            }}
        >
            {/* glow / backing frame */}
            <mesh position={[0, 0, -0.06]}>
                <planeGeometry args={[width + 0.42, height + 0.42]} />
                <meshBasicMaterial
                    color={isFocused ? 0xd90000 : 0x161013}
                    transparent
                    opacity={isDimmed ? 0.25 : 1}
                    toneMapped={false}
                />
            </mesh>
            {/* artwork */}
            <mesh>
                <planeGeometry args={[width, height]} />
                <meshBasicMaterial
                    map={texture}
                    transparent
                    opacity={isDimmed ? 0.32 : 1}
                    toneMapped={false}
                />
            </mesh>
        </group>
    )
}

function CameraRig({ focusIndex }) {
    const { camera, pointer } = useThree()
    const target = useRef({
        pos: new THREE.Vector3(0, 0, 22),
        look: new THREE.Vector3(0, 0, 0)
    })

    useEffect(() => {
        if (focusIndex === null) {
            target.current.pos.set(0, 0, 9)
            target.current.look.set(0, 0, 0)
            return
        }
        const slot = ARC[focusIndex]
        const slotPos = new THREE.Vector3(slot.x, slot.y, slot.z)
        // Move to a point in front of the panel along its facing normal.
        const normal = new THREE.Vector3(Math.sin(slot.ry), 0, Math.cos(slot.ry))
        target.current.pos.copy(slotPos).add(normal.multiplyScalar(3.6))
        target.current.look.copy(slotPos)
    }, [focusIndex])

    useFrame(() => {
        const drift = focusIndex === null ? 1 : 0.35
        tmpOffset.set(pointer.x * 1.1 * drift, pointer.y * 0.7 * drift, 0)
        tmpVec.copy(target.current.pos).add(tmpOffset)
        camera.position.lerp(tmpVec, 0.045)
        camera.lookAt(target.current.look)
    })

    return null
}

function ExhibitionScene({ focusIndex, onSelect }) {
    return (
        <>
            <color attach="background" args={[0x070506]} />
            <fog attach="fog" args={[0x070506, 10, 30]} />
            <AmbientField />
            <Suspense fallback={null}>
                {artworks.map((data, index) => (
                    <Artwork
                        key={data.id}
                        data={data}
                        slot={ARC[index] || ARC[0]}
                        index={index}
                        focusIndex={focusIndex}
                        onSelect={onSelect}
                    />
                ))}
            </Suspense>
            <CameraRig focusIndex={focusIndex} />
        </>
    )
}

export default function WccExhibition({ onExit, lang: controlledLang = null, onLangChange = null }) {
    const [focusIndex, setFocusIndex] = useState(null)
    const [internalLang, setInternalLang] = useState('en')
    const lang = controlledLang || internalLang
    const setLang = onLangChange || setInternalLang
    const active = focusIndex === null ? null : artworks[focusIndex]
    const concept = active ? (lang === 'hy' && active.conceptHy ? active.conceptHy : active.concept) : ''

    useEffect(() => () => { document.body.style.cursor = '' }, [])

    return (
        <div className="wcc-scene">
            <Canvas
                className="wcc-scene__canvas"
                camera={{ position: [0, 0, 22], fov: 50, near: 0.1, far: 120 }}
                dpr={[1, 1.8]}
                gl={{ antialias: true, alpha: false }}
                onPointerMissed={() => setFocusIndex(null)}
            >
                <ExhibitionScene focusIndex={focusIndex} onSelect={setFocusIndex} />
            </Canvas>

            <header className="wcc-scene__chrome">
                <button type="button" className="wcc-scene__exit" onClick={onExit}>
                    ← Exit exhibition
                </button>
                <span className="wcc-scene__title">WCC · Women Creating Change</span>
                <div className="wcc-scene__lang" role="group" aria-label="Language">
                    <button
                        type="button"
                        className={lang === 'en' ? 'is-active' : ''}
                        onClick={() => setLang('en')}
                    >
                        EN
                    </button>
                    <button
                        type="button"
                        className={lang === 'hy' ? 'is-active' : ''}
                        onClick={() => setLang('hy')}
                    >
                        ՀՅ
                    </button>
                </div>
            </header>

            {active ? (
                <aside className="wcc-scene__panel" key={active.id}>
                    <button type="button" className="wcc-scene__panel-close" onClick={() => setFocusIndex(null)}>
                        ×
                    </button>
                    <p className="wcc-scene__panel-artist">{active.artist}</p>
                    <h2 className="wcc-scene__panel-title">{active.title}</h2>
                    {active.medium ? <p className="wcc-scene__panel-medium">{active.medium}</p> : null}
                    <p className="wcc-scene__panel-concept">{concept}</p>
                </aside>
            ) : (
                <p className="wcc-scene__hint">Move to look around · click an artwork to read its story</p>
            )}
        </div>
    )
}
