import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Grid } from '@react-three/drei'
import { XR } from '@react-three/xr'
import * as THREE from 'three'
import { useXrAr } from '../hooks/useXrAr.js'
import { createProjectSyncService } from '../project/services/projectSyncService.js'
import {
    buildProjectAssetUrl,
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

const WALK_MAX_SPEED = 5.2
const FLY_SPEED = 4.5
const WALK_ACCEL = 14
const WALK_FRICTION = 10
const TURN_SPEED = 1.6
const POINTER_LOCK_SENSITIVITY = 0.0022
const TOUCH_LOOK_SENSITIVITY = 0.0038
const PITCH_LIMIT = 0.55
const EYE_HEIGHT = 1.6
const JOY_RADIUS = 45
const BOUNDS_MARGIN = 22
const BOUNDS_MIN_HALF = 18
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

// Free-roam walk: WASD + arrows move/turn; desktop uses pointer lock for look;
// mobile uses touch outside the joystick zone for look.
function Walker({ playerRef, onNearestZone, entities, bounds, joystickRef, joyVisRef, joyThumbRef, onLockChange, flyMode }) {
    const { camera, gl } = useThree()
    const keysRef = useRef(new Set())
    const speedRef = useRef(0)
    const bobPhaseRef = useRef(0)
    const lockedRef = useRef(false)
    const touchLookRef = useRef(null)
    const touchMoveRef = useRef(null)
    const joyBaseRef = useRef({ x: 0, y: 0 })
    const onLockChangeRef = useRef(onLockChange)
    onLockChangeRef.current = onLockChange
    const flyRef = useRef(flyMode)
    flyRef.current = flyMode

    useEffect(() => {
        const keys = keysRef.current
        const moveKeys = ['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' ', 'q', 'e', 'c']
        const onKeyDown = (e) => {
            const key = e.key.toLowerCase()
            if (!moveKeys.includes(key)) return
            if (key === ' ') e.preventDefault()
            keys.add(key)
        }
        const onKeyUp = (e) => keys.delete(e.key.toLowerCase())
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
        const isTouch = window.matchMedia('(pointer: coarse)').matches

        if (!isTouch) {
            // Desktop: pointer lock
            const onLockChange = () => {
                const locked = document.pointerLockElement === el
                lockedRef.current = locked
                el.style.cursor = locked ? 'none' : 'crosshair'
                onLockChangeRef.current?.(locked)
            }
            const onPointerDown = () => {
                if (!lockedRef.current) el.requestPointerLock()
            }
            const onMouseMove = (e) => {
                if (!lockedRef.current) return
                player.yaw -= e.movementX * POINTER_LOCK_SENSITIVITY
                player.pitch = THREE.MathUtils.clamp(
                    player.pitch - e.movementY * POINTER_LOCK_SENSITIVITY,
                    -PITCH_LIMIT,
                    PITCH_LIMIT
                )
            }
            el.style.cursor = 'crosshair'
            el.addEventListener('pointerdown', onPointerDown)
            document.addEventListener('pointerlockchange', onLockChange)
            document.addEventListener('mousemove', onMouseMove)
            return () => {
                if (document.pointerLockElement === el) document.exitPointerLock()
                el.style.cursor = ''
                el.removeEventListener('pointerdown', onPointerDown)
                document.removeEventListener('pointerlockchange', onLockChange)
                document.removeEventListener('mousemove', onMouseMove)
            }
        } else {
            // Mobile: floating joystick on the left half (spawns at touch point,
            // no fixed dead zone), right half is always look.
            const showJoy = (x, y) => {
                joyBaseRef.current = { x, y }
                if (joyVisRef?.current) {
                    joyVisRef.current.style.left = `${x - 45}px`
                    joyVisRef.current.style.top = `${y - 45}px`
                    joyVisRef.current.style.bottom = 'auto'
                    joyVisRef.current.style.opacity = '1'
                }
                if (joyThumbRef?.current) joyThumbRef.current.style.transform = 'translate(0,0)'
            }
            const hideJoy = () => {
                if (joyVisRef?.current) joyVisRef.current.style.opacity = '0'
                if (joystickRef) { joystickRef.current.x = 0; joystickRef.current.y = 0 }
            }
            const updateJoy = (tx, ty) => {
                const dx = tx - joyBaseRef.current.x
                const dy = ty - joyBaseRef.current.y
                const dist = Math.hypot(dx, dy)
                const sc = Math.min(dist, JOY_RADIUS) / Math.max(dist, 0.001)
                if (joyThumbRef?.current) joyThumbRef.current.style.transform = `translate(${dx * sc}px,${dy * sc}px)`
                if (joystickRef) {
                    joystickRef.current.x = (dx * sc) / JOY_RADIUS
                    joystickRef.current.y = (dy * sc) / JOY_RADIUS
                }
            }
            const onTouchStart = (e) => {
                for (const t of e.changedTouches) {
                    const isLeft = t.clientX < el.clientWidth / 2
                    if (isLeft && !touchMoveRef.current) {
                        touchMoveRef.current = { id: t.identifier }
                        showJoy(t.clientX, t.clientY)
                    } else if (!isLeft && !touchLookRef.current) {
                        touchLookRef.current = { id: t.identifier, lastX: t.clientX, lastY: t.clientY }
                    }
                }
            }
            const onTouchMove = (e) => {
                e.preventDefault()
                for (const t of e.changedTouches) {
                    if (touchMoveRef.current?.id === t.identifier) {
                        updateJoy(t.clientX, t.clientY)
                    } else if (touchLookRef.current?.id === t.identifier) {
                        player.yaw -= (t.clientX - touchLookRef.current.lastX) * TOUCH_LOOK_SENSITIVITY
                        player.pitch = THREE.MathUtils.clamp(
                            player.pitch - (t.clientY - touchLookRef.current.lastY) * TOUCH_LOOK_SENSITIVITY,
                            -PITCH_LIMIT,
                            PITCH_LIMIT
                        )
                        touchLookRef.current.lastX = t.clientX
                        touchLookRef.current.lastY = t.clientY
                    }
                }
            }
            const onTouchEnd = (e) => {
                for (const t of e.changedTouches) {
                    if (touchMoveRef.current?.id === t.identifier) { touchMoveRef.current = null; hideJoy() }
                    else if (touchLookRef.current?.id === t.identifier) touchLookRef.current = null
                }
            }
            el.addEventListener('touchstart', onTouchStart, { passive: false })
            el.addEventListener('touchmove', onTouchMove, { passive: false })
            el.addEventListener('touchend', onTouchEnd)
            el.addEventListener('touchcancel', onTouchEnd)
            return () => {
                el.removeEventListener('touchstart', onTouchStart)
                el.removeEventListener('touchmove', onTouchMove)
                el.removeEventListener('touchend', onTouchEnd)
                el.removeEventListener('touchcancel', onTouchEnd)
            }
        }
    }, [gl, playerRef, joystickRef, joyVisRef, joyThumbRef])

    useFrame((_, delta) => {
        const keys = keysRef.current
        const player = playerRef.current
        const joy = joystickRef?.current || { x: 0, y: 0 }
        const fly = flyRef.current
        if (player.pitch === undefined) player.pitch = 0
        if (player.altY === undefined) player.altY = EYE_HEIGHT

        let turn = 0
        if (keys.has('a') || keys.has('arrowleft')) turn += 1
        if (keys.has('d') || keys.has('arrowright')) turn -= 1
        turn -= joy.x
        player.yaw += turn * TURN_SPEED * delta

        let forward = 0
        if (keys.has('w') || keys.has('arrowup')) forward += 1
        if (keys.has('s') || keys.has('arrowdown')) forward -= 1
        forward -= joy.y

        let vert = 0
        if (fly) {
            if (keys.has(' ') || keys.has('q')) vert += 1
            if (keys.has('e') || keys.has('c')) vert -= 1
        }

        const targetSpeed = forward * WALK_MAX_SPEED
        const accel = forward !== 0 ? WALK_ACCEL : WALK_FRICTION
        speedRef.current += THREE.MathUtils.clamp(targetSpeed - speedRef.current, -accel * delta, accel * delta)
        if (Math.abs(speedRef.current) < 0.001) speedRef.current = 0

        if (speedRef.current !== 0) {
            const pitch = fly ? player.pitch : 0
            const cosP = fly ? Math.cos(pitch) : 1
            const sinP = fly ? Math.sin(pitch) : 0
            const nextX = player.x + Math.sin(player.yaw) * speedRef.current * cosP * delta
            const nextZ = player.z + Math.cos(player.yaw) * speedRef.current * cosP * delta
            player.x = THREE.MathUtils.clamp(nextX, bounds.minX, bounds.maxX)
            player.z = THREE.MathUtils.clamp(nextZ, bounds.minZ, bounds.maxZ)
            if (fly) player.altY = THREE.MathUtils.clamp(player.altY + speedRef.current * sinP * delta, -2, 60)
            bobPhaseRef.current += delta * Math.abs(speedRef.current) * (fly ? 0 : 1.8)
        }
        if (fly && vert !== 0) {
            player.altY = THREE.MathUtils.clamp(player.altY + vert * FLY_SPEED * delta, -2, 60)
        }
        if (!fly) {
            player.altY = THREE.MathUtils.lerp(player.altY, EYE_HEIGHT, Math.min(1, delta * 3))
        }

        const bobAmount = fly ? 0 : Math.sin(bobPhaseRef.current) * 0.05 * Math.min(1, Math.abs(speedRef.current) / WALK_MAX_SPEED)
        const lookDir = tmpVec.set(
            Math.sin(player.yaw) * Math.cos(player.pitch),
            Math.sin(player.pitch),
            Math.cos(player.yaw) * Math.cos(player.pitch)
        )

        camera.position.set(player.x, player.altY + bobAmount, player.z)
        tmpLook.set(player.x + lookDir.x, player.altY + bobAmount + lookDir.y, player.z + lookDir.z)
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

// Purely visual — Walker owns all touch handling so it can arbitrate
// floating-joystick vs. look touches on the same canvas.
function MobileJoystick({ outerRef, thumbRef }) {
    return (
        <div className="live-scene-joystick" ref={outerRef}>
            <div className="live-scene-joystick-thumb" ref={thumbRef} />
        </div>
    )
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
    // GridFloorBackground starts with a fallback projectId, then swaps to the
    // space's real published project once that lookup resolves. If the
    // fallback's own document fetch is still in flight and resolves *after*
    // the swap, it would otherwise overwrite the correct doc with the wrong
    // project's content. Track which projectId is current so a late response
    // for an abandoned projectId is dropped instead of applied.
    const activeProjectIdRef = useRef(projectId)
    useEffect(() => { activeProjectIdRef.current = projectId }, [projectId])

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
        const requestedProjectId = projectId
        try {
            await ensureGuestSession()
            const response = await getProjectDocument(requestedProjectId)
            if (activeProjectIdRef.current !== requestedProjectId) return
            versionRef.current = Number(response?.version) || 0
            applyIncomingDocument(response?.document || response || {})
        } catch {
            if (activeProjectIdRef.current === requestedProjectId) documentRef.current = null
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
    const xr = useXrAr()
    const [nearestLabel, setNearestLabel] = useState(null)
    const [isLocked, setIsLocked] = useState(false)
    const [isMobile] = useState(() => typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches)
    const [flyMode, setFlyMode] = useState(false)
    const joystickRef = useRef({ x: 0, y: 0 })
    const joyVisRef = useRef(null)
    const joyThumbRef = useRef(null)
    const playerRef = useRef({ x: 0, z: 6, yaw: Math.PI, pitch: 0, altY: EYE_HEIGHT })

    useEffect(() => {
        if (!interactive) return undefined
        const onKey = (e) => { if (e.key.toLowerCase() === 'f') setFlyMode((f) => !f) }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
    }, [interactive])

    const entities = useMemo(() => doc?.entities || [], [doc?.entities])
    // Legacy-imported projects store assets with an empty `url` field (the
    // registry that fills it in -- registerAssetSources -- only ever runs
    // inside the Studio editor's useAssetRestore hook, never here). Fall back
    // to the direct per-project asset endpoint so media actually streams for
    // any public/live viewer (landing page, WCC, etc.), not just Studio.
    const assetMap = useMemo(() => new Map((doc?.assets || []).map((asset) => [
        asset.id,
        asset.url ? asset : { ...asset, url: buildProjectAssetUrl(projectId, asset.id) }
    ])), [doc?.assets, projectId])
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
            return { minX: -BOUNDS_MIN_HALF, maxX: BOUNDS_MIN_HALF, minZ: -BOUNDS_MIN_HALF, maxZ: BOUNDS_MIN_HALF }
        }
        let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity
        for (const entity of entities) {
            const pos = entity.components?.transform?.position
            if (!Array.isArray(pos)) continue
            minX = Math.min(minX, pos[0])
            maxX = Math.max(maxX, pos[0])
            minZ = Math.min(minZ, pos[2])
            maxZ = Math.max(maxZ, pos[2])
        }
        const cx = (minX + maxX) / 2
        const cz = (minZ + maxZ) / 2
        return {
            minX: Math.min(minX - BOUNDS_MARGIN, cx - BOUNDS_MIN_HALF),
            maxX: Math.max(maxX + BOUNDS_MARGIN, cx + BOUNDS_MIN_HALF),
            minZ: Math.min(minZ - BOUNDS_MARGIN, cz - BOUNDS_MIN_HALF),
            maxZ: Math.max(maxZ + BOUNDS_MARGIN, cz + BOUNDS_MIN_HALF)
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
                <XR store={xr.xrStore}>
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
                    <Walker
                        playerRef={playerRef}
                        onNearestZone={setNearestLabel}
                        entities={entities}
                        bounds={bounds}
                        joystickRef={joystickRef}
                        joyVisRef={joyVisRef}
                        joyThumbRef={joyThumbRef}
                        onLockChange={setIsLocked}
                        flyMode={flyMode}
                    />
                ) : (
                    <IdleOrbit center={center} />
                )}
                </XR>
            </Canvas>

            {showChrome && (
                <>
                    <div
                        className="live-scene-loading"
                        style={{ opacity: doc ? 0 : 1, pointerEvents: doc ? 'none' : 'all' }}
                    >
                        <div className="live-scene-loading-ring" />
                    </div>

                    <header className="live-scene-chrome">
                        <button type="button" className="live-scene-exit" onClick={onExit}>
                            ← Exit
                        </button>
                        <span className="live-scene-title">
                            {title}{nearestLabel ? ` · ${nearestLabel}` : ''}
                        </span>
                    </header>

                    {interactive && !isMobile && !isLocked && (
                        <p className="live-scene-hint live-scene-hint--lock">Click to explore</p>
                    )}
                    {interactive && !isMobile && isLocked && (
                        <p className="live-scene-hint">
                            WASD · move &nbsp;·&nbsp; Mouse · look &nbsp;·&nbsp; F · {flyMode ? 'walk' : 'fly'}
                            {flyMode ? <>&nbsp;·&nbsp; Space/Q · up &nbsp;·&nbsp; C/E · down</> : null}
                            &nbsp;·&nbsp; ESC · release
                        </p>
                    )}
                    {interactive && isMobile && (
                        <MobileJoystick outerRef={joyVisRef} thumbRef={joyThumbRef} />
                    )}
                    {interactive && (
                        <button
                            type="button"
                            className={`live-scene-fly-btn${flyMode ? ' active' : ''}`}
                            onClick={() => setFlyMode((f) => !f)}
                        >
                            {flyMode ? 'Walk' : 'Fly'}
                        </button>
                    )}
                    {(xr.supportedXrModes.vr || xr.supportedXrModes.ar) && !xr.isXrPresenting && (
                        <div style={{ position: 'absolute', bottom: 40, right: 130, display: 'flex', gap: 8, zIndex: 11 }}>
                            {xr.supportedXrModes.vr && (
                                <button type="button" className="live-scene-exit" onClick={() => xr.handleEnterXrSession('vr')}>
                                    Enter VR
                                </button>
                            )}
                            {xr.supportedXrModes.ar && (
                                <button type="button" className="live-scene-exit" onClick={() => xr.handleEnterXrSession('ar')}>
                                    Enter AR
                                </button>
                            )}
                        </div>
                    )}
                    {xr.isXrPresenting && (
                        <button type="button" className="live-scene-exit"
                            style={{ position: 'absolute', bottom: 40, right: 130, zIndex: 11 }}
                            onClick={xr.handleExitXrSession}
                        >
                            Exit XR
                        </button>
                    )}
                </>
            )}
        </>
    )
}
