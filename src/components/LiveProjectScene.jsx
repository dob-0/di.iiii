import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Grid } from '@react-three/drei'
import * as THREE from 'three'
import { createProjectSyncService } from '../project/services/projectSyncService.js'
import {
    buildProjectEventsUrl,
    getProjectDocument,
    listProjectOps
} from '../project/services/projectsApi.js'
import { applyProjectOps, normalizeProjectDocument } from '../shared/projectSchema.js'
import { getApiSession } from '../services/apiClient.js'
import BoxObject from '../objectComponents/BoxObject.jsx'
import SphereObject from '../objectComponents/SphereObject.jsx'
import ConeObject from '../objectComponents/ConeObject.jsx'
import CylinderObject from '../objectComponents/CylinderObject.jsx'
import ImageObject from '../objectComponents/ImageObject.jsx'
import VideoObject from '../objectComponents/VideoObject.jsx'
import ModelObject from '../objectComponents/ModelObject.jsx'
import './liveProjectScene.css'

const WALK_MAX_SPEED = 4.5
const WALK_ACCEL = 14
const WALK_FRICTION = 10
const TURN_SPEED = 1.6
const DRAG_LOOK_SENSITIVITY = 0.0035
const PITCH_LIMIT = 0.55
const EYE_HEIGHT = 1.6
const BOUNDS_MARGIN = 7
const PARTICLE_COUNT = 900
const IDLE_ORBIT_RADIUS = 8
const IDLE_ORBIT_HEIGHT = 3.5
const IDLE_ORBIT_SPEED = 0.12

const tmpVec = new THREE.Vector3()
const tmpLook = new THREE.Vector3()

const isGateEntity = (entity) => /gate|threshold|entrance/i.test(entity?.name || '')
const isGroundEntity = (entity) => /ground|floor/i.test(entity?.name || '')
const isFlyEntity = (entity) => /\bfly\b/i.test(entity?.name || '')

// Same fix as GridFloorBackground: any page that renders a live scene
// without going through AuthGate has no session cookie yet on first paint.
let guestSessionPromise = null
const ensureGuestSession = () => {
    if (!guestSessionPromise) {
        guestSessionPromise = getApiSession().catch(() => null)
    }
    return guestSessionPromise
}

function EntityVisual({ entity, assetMap }) {
    const media = entity.components?.media || {}
    const appearance = entity.components?.appearance || {}
    const asset = media.assetId ? assetMap.get(media.assetId) : null

    switch (entity.type) {
    case 'box':
        return (
            <BoxObject
                color={appearance.color}
                boxSize={entity.components?.primitive?.size}
                wireframe={Boolean(appearance.wireframe)}
                opacity={appearance.opacity}
            />
        )
    case 'sphere':
        return (
            <SphereObject
                color={appearance.color}
                sphereRadius={entity.components?.primitive?.radius}
                wireframe={Boolean(appearance.wireframe)}
                opacity={appearance.opacity}
            />
        )
    case 'cone':
        return (
            <ConeObject
                color={appearance.color}
                coneRadius={entity.components?.primitive?.radius}
                coneHeight={entity.components?.primitive?.height}
                wireframe={Boolean(appearance.wireframe)}
                opacity={appearance.opacity}
            />
        )
    case 'cylinder':
        return (
            <CylinderObject
                color={appearance.color}
                cylinderRadiusTop={entity.components?.primitive?.radiusTop}
                cylinderRadiusBottom={entity.components?.primitive?.radiusBottom}
                cylinderHeight={entity.components?.primitive?.height}
                wireframe={Boolean(appearance.wireframe)}
                opacity={appearance.opacity}
            />
        )
    case 'image':
        return <ImageObject assetRef={asset || null} data={asset?.url || null} opacity={appearance.opacity} />
    case 'video':
        return <VideoObject assetRef={asset || null} data={asset?.url || null} opacity={appearance.opacity} />
    case 'model':
        return <ModelObject assetRef={asset || null} data={asset?.url || null} modelColor={appearance.color} applyModelColor={false} opacity={appearance.opacity} />
    default:
        return null
    }
}

// Idle motion layered on top of the authored transform -- gates and ground
// stay put (they're architecture), flying pieces get a real flight path,
// everything else gets a gentle bob + slow spin so the room feels alive.
function AnimatedEntity({ entity, assetMap }) {
    const groupRef = useRef(null)
    const basePos = entity.components?.transform?.position || [0, 0, 0]
    const baseRot = entity.components?.transform?.rotation || [0, 0, 0]
    const baseScale = entity.components?.transform?.scale || [1, 1, 1]
    // Deterministic per-entity phase offset so idle motion isn't synchronized.
    const seed = useMemo(() => {
        let hash = 0
        for (let i = 0; i < entity.id.length; i += 1) hash = (hash * 31 + entity.id.charCodeAt(i)) % 1000
        return (hash / 1000) * Math.PI * 2
    }, [entity.id])

    const isGate = isGateEntity(entity)
    const isGround = isGroundEntity(entity)
    const isFly = isFlyEntity(entity)

    useFrame((state) => {
        const group = groupRef.current
        if (!group) return
        const t = state.clock.getElapsedTime() + seed

        if (isGround || isGate) {
            group.position.set(...basePos)
            group.rotation.set(...baseRot)
            return
        }

        if (isFly) {
            const radius = 1.6
            group.position.set(
                basePos[0] + Math.cos(t * 0.6) * radius,
                basePos[1] + Math.sin(t * 1.3) * 0.5,
                basePos[2] + Math.sin(t * 0.6) * radius
            )
            group.rotation.set(baseRot[0], t * 0.6, baseRot[2])
            return
        }

        group.position.set(basePos[0], basePos[1] + Math.sin(t * 0.7) * 0.12, basePos[2])
        // Flat image/video planes go edge-on (and look broken) mid-spin --
        // sway them gently instead; only freestanding models get a full turntable spin.
        const isFlat = entity.type === 'image' || entity.type === 'video'
        const yaw = isFlat ? baseRot[1] + Math.sin(t * 0.4) * 0.08 : baseRot[1] + t * 0.12
        group.rotation.set(baseRot[0], yaw, baseRot[2])
    })

    return (
        <group ref={groupRef} position={basePos} rotation={baseRot} scale={baseScale}>
            <Suspense fallback={null}>
                <EntityVisual entity={entity} assetMap={assetMap} />
            </Suspense>
        </group>
    )
}

function GateGlow({ entity }) {
    const ringRef = useRef(null)
    const pos = entity.components?.transform?.position || [0, 0, 0]

    useFrame((state) => {
        const ring = ringRef.current
        if (!ring) return
        const t = state.clock.getElapsedTime()
        const pulse = 0.55 + Math.sin(t * 1.4) * 0.2
        ring.material.opacity = pulse
    })

    return (
        <mesh ref={ringRef} position={[pos[0], pos[1] + 1.2, pos[2]]} rotation={[Math.PI / 2, 0, 0]}>
            <ringGeometry args={[1.3, 1.55, 48]} />
            <meshBasicMaterial color={0xd90000} transparent opacity={0.6} toneMapped={false} side={THREE.DoubleSide} />
        </mesh>
    )
}

function AmbientField({ center }) {
    const pointsRef = useRef(null)
    const [geometry, setGeometry] = useState(null)

    useEffect(() => {
        const positions = new Float32Array(PARTICLE_COUNT * 3)
        for (let i = 0; i < PARTICLE_COUNT; i += 1) {
            positions[i * 3] = center.x + (Math.random() - 0.5) * 36
            positions[i * 3 + 1] = (Math.random() - 0.5) * 14 + 3
            positions[i * 3 + 2] = center.z + (Math.random() - 0.5) * 36
        }
        const geo = new THREE.BufferGeometry()
        geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
        setGeometry(geo)
        return () => geo.dispose()
    }, [center])

    useFrame((state) => {
        const points = pointsRef.current
        if (!points) return
        points.rotation.y = state.clock.getElapsedTime() * 0.008
    })

    if (!geometry) return null

    return (
        <points ref={pointsRef} geometry={geometry}>
            <pointsMaterial color={0xffffff} size={0.03} transparent opacity={0.3} depthWrite={false} sizeAttenuation />
        </points>
    )
}

// Free-roam walk: W/S forward-back, A/D or arrows turn, click-drag to look.
function Walker({ playerRef, onNearestZone, entities, bounds }) {
    const { camera, gl } = useThree()
    const keysRef = useRef(new Set())
    const speedRef = useRef(0)
    const bobPhaseRef = useRef(0)
    const draggingRef = useRef(false)

    useEffect(() => {
        const keys = keysRef.current
        const moveKeys = ['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright']
        const onKeyDown = (event) => {
            const key = event.key.toLowerCase()
            if (!moveKeys.includes(key)) return
            event.preventDefault()
            keys.add(key)
        }
        const onKeyUp = (event) => keys.delete(event.key.toLowerCase())
        window.addEventListener('keydown', onKeyDown)
        window.addEventListener('keyup', onKeyUp)
        return () => {
            window.removeEventListener('keydown', onKeyDown)
            window.removeEventListener('keyup', onKeyUp)
            keys.clear()
        }
    }, [])

    useEffect(() => {
        const el = gl.domElement
        const player = playerRef.current
        const onPointerDown = () => {
            draggingRef.current = true
            el.style.cursor = 'grabbing'
        }
        const onPointerUp = () => {
            draggingRef.current = false
            el.style.cursor = 'grab'
        }
        const onPointerMove = (event) => {
            if (!draggingRef.current) return
            player.yaw -= event.movementX * DRAG_LOOK_SENSITIVITY
            player.pitch = THREE.MathUtils.clamp(
                player.pitch - event.movementY * DRAG_LOOK_SENSITIVITY,
                -PITCH_LIMIT,
                PITCH_LIMIT
            )
        }
        el.style.cursor = 'grab'
        el.addEventListener('pointerdown', onPointerDown)
        window.addEventListener('pointerup', onPointerUp)
        window.addEventListener('pointermove', onPointerMove)
        return () => {
            el.style.cursor = ''
            el.removeEventListener('pointerdown', onPointerDown)
            window.removeEventListener('pointerup', onPointerUp)
            window.removeEventListener('pointermove', onPointerMove)
        }
    }, [gl, playerRef])

    useFrame((state, delta) => {
        const keys = keysRef.current
        const player = playerRef.current
        if (player.pitch === undefined) player.pitch = 0

        let turn = 0
        if (keys.has('a') || keys.has('arrowleft')) turn += 1
        if (keys.has('d') || keys.has('arrowright')) turn -= 1
        player.yaw += turn * TURN_SPEED * delta

        let forward = 0
        if (keys.has('w') || keys.has('arrowup')) forward += 1
        if (keys.has('s') || keys.has('arrowdown')) forward -= 1

        const targetSpeed = forward * WALK_MAX_SPEED
        const accel = forward !== 0 ? WALK_ACCEL : WALK_FRICTION
        speedRef.current += THREE.MathUtils.clamp(targetSpeed - speedRef.current, -accel * delta, accel * delta)
        if (Math.abs(speedRef.current) < 0.001) speedRef.current = 0

        if (speedRef.current !== 0) {
            const nextX = player.x + Math.sin(player.yaw) * speedRef.current * delta
            const nextZ = player.z + Math.cos(player.yaw) * speedRef.current * delta
            player.x = THREE.MathUtils.clamp(nextX, bounds.minX, bounds.maxX)
            player.z = THREE.MathUtils.clamp(nextZ, bounds.minZ, bounds.maxZ)
            bobPhaseRef.current += delta * Math.abs(speedRef.current) * 1.8
        }

        const bobAmount = Math.sin(bobPhaseRef.current) * 0.05 * Math.min(1, Math.abs(speedRef.current) / WALK_MAX_SPEED)
        const lookDir = tmpVec.set(
            Math.sin(player.yaw) * Math.cos(player.pitch),
            Math.sin(player.pitch),
            Math.cos(player.yaw) * Math.cos(player.pitch)
        )

        camera.position.set(player.x, EYE_HEIGHT + bobAmount, player.z)
        tmpLook.set(player.x + lookDir.x, EYE_HEIGHT + bobAmount + lookDir.y, player.z + lookDir.z)
        camera.lookAt(tmpLook)

        if (onNearestZone && entities.length) {
            let nearest = null
            let nearestDist = Infinity
            for (const entity of entities) {
                const pos = entity.components?.transform?.position
                if (!pos) continue
                const dist = (pos[0] - player.x) ** 2 + (pos[2] - player.z) ** 2
                if (dist < nearestDist) {
                    nearestDist = dist
                    nearest = entity
                }
            }
            const zoneMatch = nearest?.name?.match(/Zone\s*\d+/i)
            onNearestZone(nearestDist < 64 ? (zoneMatch?.[0] || nearest?.name || null) : null)
        }
    })

    return null
}

// Decorative, click-through camera: slow orbit around the scene centroid.
// Used wherever `interactive` is false (e.g. the landing page before
// "Enter Space" is clicked).
function IdleOrbit({ center }) {
    const { camera } = useThree()
    useFrame((state) => {
        const t = state.clock.getElapsedTime() * IDLE_ORBIT_SPEED
        camera.position.set(
            center.x + Math.cos(t) * IDLE_ORBIT_RADIUS,
            IDLE_ORBIT_HEIGHT,
            center.z + Math.sin(t) * IDLE_ORBIT_RADIUS
        )
        camera.lookAt(center.x, 0.6, center.z)
    })
    return null
}

function useLiveProjectDocument(projectId) {
    const [doc, setDoc] = useState(null)
    const documentRef = useRef(null)
    const versionRef = useRef(0)
    const syncServiceRef = useRef(createProjectSyncService())

    const applyIncomingDocument = useCallback((nextDoc) => {
        const normalized = normalizeProjectDocument(nextDoc || {})
        documentRef.current = normalized
        setDoc(normalized)
    }, [])

    const applyIncomingOps = useCallback((ops = [], version = null) => {
        if (!documentRef.current) return
        const nextDocument = applyProjectOps(documentRef.current, ops || [])
        documentRef.current = nextDocument
        setDoc(nextDocument)
        if (Number.isFinite(version)) versionRef.current = Number(version)
    }, [])

    const reloadDocument = useCallback(async () => {
        try {
            await ensureGuestSession()
            const response = await getProjectDocument(projectId)
            versionRef.current = Number(response?.version) || 0
            applyIncomingDocument(response?.document || response || {})
        } catch {
            documentRef.current = null
        }
    }, [applyIncomingDocument, projectId])

    useEffect(() => { void reloadDocument() }, [reloadDocument])

    useEffect(() => {
        const syncService = syncServiceRef.current
        let cancelled = false
        ensureGuestSession().then(() => {
            if (cancelled) return
            syncService.connect({
                eventsUrl: buildProjectEventsUrl(projectId),
                onProjectOp: ({ version, ops }) => {
                    if (!documentRef.current) {
                        void reloadDocument()
                        return
                    }
                    applyIncomingOps(ops || [], Number(version))
                },
                onReady: async () => {
                    const catchUp = await listProjectOps(projectId, versionRef.current)
                    applyIncomingOps(catchUp.ops || [], Number(catchUp.latestVersion))
                },
                onError: () => {
                    if (!documentRef.current) void reloadDocument()
                }
            })
        })
        return () => {
            cancelled = true
            syncService.disconnect()
        }
    }, [applyIncomingOps, projectId, reloadDocument])

    return doc
}

/**
 * Renders a live, editable-in-Studio project as a real 3D space: any entity
 * type, worldState-driven lighting/background, ambient particles, gate glow,
 * idle bob/spin/flight animation. `interactive` swaps between free-roam walk
 * controls (WASD + drag-look) and a decorative auto-orbit camera; `showChrome`
 * controls whether the exit button / title / hint overlay render (callers
 * that provide their own chrome, like the landing page, pass `false`).
 */
export default function LiveProjectScene({
    projectId,
    interactive = true,
    showChrome = true,
    showEntities = true,
    onExit = null,
    title = ''
}) {
    const doc = useLiveProjectDocument(projectId)
    const [nearestLabel, setNearestLabel] = useState(null)
    const playerRef = useRef({ x: 0, z: 6, yaw: Math.PI, pitch: 0 })

    const entities = useMemo(() => doc?.entities || [], [doc?.entities])
    const assetMap = useMemo(() => new Map((doc?.assets || []).map((asset) => [asset.id, asset])), [doc?.assets])
    const gateEntity = useMemo(() => entities.find(isGateEntity) || null, [entities])

    const center = useMemo(() => {
        if (!entities.length) return new THREE.Vector3(0, 0, 0)
        const sum = entities.reduce((acc, e) => {
            const pos = e.components?.transform?.position || [0, 0, 0]
            acc.x += pos[0]
            acc.z += pos[2]
            return acc
        }, { x: 0, z: 0 })
        return new THREE.Vector3(sum.x / entities.length, 0, sum.z / entities.length)
    }, [entities])

    const bounds = useMemo(() => {
        if (!entities.length) {
            return { minX: -10, maxX: 10, minZ: -10, maxZ: 10 }
        }
        let minX = Infinity
        let maxX = -Infinity
        let minZ = Infinity
        let maxZ = -Infinity
        for (const entity of entities) {
            const pos = entity.components?.transform?.position
            if (!Array.isArray(pos)) continue
            minX = Math.min(minX, pos[0])
            maxX = Math.max(maxX, pos[0])
            minZ = Math.min(minZ, pos[2])
            maxZ = Math.max(maxZ, pos[2])
        }
        return {
            minX: minX - BOUNDS_MARGIN,
            maxX: maxX + BOUNDS_MARGIN,
            minZ: minZ - BOUNDS_MARGIN,
            maxZ: maxZ + BOUNDS_MARGIN
        }
    }, [entities])

    // Start a little south of the entrance gate (if any), facing into the space.
    useEffect(() => {
        if (!interactive) return
        if (!gateEntity) return
        const pos = gateEntity.components?.transform?.position
        if (!Array.isArray(pos)) return
        playerRef.current = { x: pos[0], z: pos[2] + 6, yaw: Math.PI, pitch: 0 }
    }, [gateEntity, interactive])

    const worldState = doc?.worldState || {}
    const ambient = worldState.ambientLight || { color: '#ffffff', intensity: 0.85 }
    const directional = worldState.directionalLight || { color: '#fff7ea', intensity: 1.15, position: [8, 12, 4] }
    const backgroundColor = worldState.backgroundColor || '#0a1118'

    return (
        <>
            <Canvas
                className="live-scene-canvas"
                camera={{ position: [0, EYE_HEIGHT, 6], fov: interactive ? 60 : 45, near: 0.1, far: 200 }}
                dpr={[1, 1.8]}
                gl={{ antialias: true }}
                style={{ position: 'absolute', inset: 0, display: 'block', touchAction: 'none' }}
            >
                <color attach="background" args={[backgroundColor]} />
                <fog attach="fog" args={[backgroundColor, 8, 50]} />
                <ambientLight color={ambient.color} intensity={ambient.intensity} />
                <directionalLight color={directional.color} intensity={directional.intensity} position={directional.position} />
                <Grid args={[80, 80]} cellColor="#2a3038" sectionColor="#3c4654" fadeDistance={40} infiniteGrid />
                <AmbientField center={center} />
                {showEntities && entities.map((entity) => (
                    <AnimatedEntity key={entity.id} entity={entity} assetMap={assetMap} />
                ))}
                {showEntities && gateEntity ? <GateGlow entity={gateEntity} /> : null}
                {interactive ? (
                    <Walker playerRef={playerRef} onNearestZone={setNearestLabel} entities={entities} bounds={bounds} />
                ) : (
                    <IdleOrbit center={center} />
                )}
            </Canvas>

            {showChrome && (
                <>
                    <header className="live-scene-chrome">
                        <button type="button" className="live-scene-exit" onClick={onExit}>
                            ← Exit exhibition
                        </button>
                        <span className="live-scene-title">
                            {title}{nearestLabel ? ` · ${nearestLabel}` : ''}
                        </span>
                    </header>
                    <p className="live-scene-hint">Walk (W/S) · Turn (A/D or ←/→) · Drag to look</p>
                </>
            )}
        </>
    )
}
