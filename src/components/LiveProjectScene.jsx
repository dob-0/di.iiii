import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Grid, Text, Billboard } from '@react-three/drei'
import { XR, XROrigin, useXR, useXRControllerLocomotion, useXRInputSourceState } from '@react-three/xr'
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
import Text2DObject from '../objectComponents/Text2DObject.jsx'
import Text3DObject from '../objectComponents/Text3DObject.jsx'
import PortalObject from '../project/viewport/PortalObject.jsx'
import { resolveAnimation, applyAnimation } from '../project/viewport/entityAnimation.js'
import './liveProjectScene.css'

const WALK_MAX_SPEED = 5.2
const FLY_SPEED = 4.5
const WALK_ACCEL = 14
const WALK_FRICTION = 10
const TURN_SPEED = 1.6
const POINTER_LOCK_SENSITIVITY = 0.0055
const TOUCH_LOOK_SENSITIVITY = 0.005
// Just shy of straight up/down (PI/2) to avoid the camera flipping at the pole.
const WALK_PITCH_LIMIT = 1.45
// Flying has no horizon to stay oriented against, so allow (almost) the full
// vertical range -- straight up/down -- rather than walking's smaller cap.
const FLY_PITCH_LIMIT = 1.55
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
const tmpDir = new THREE.Vector3()

const isGateEntity = (entity) => /gate|threshold|entrance/i.test(entity?.name || '')

// Billboard titles are fixed world-size, so they overflow a narrow portrait phone.
// Scale them down on a coarse-pointer (touch) viewport so they fit.
const COARSE_POINTER = typeof window !== 'undefined' && !!window.matchMedia?.('(pointer: coarse)').matches
const BILLBOARD_TEXT_SCALE = COARSE_POINTER ? 0.45 : 1

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
    case 'portal':
        return <PortalObject entity={entity} />
    case 'text': {
        const tc = entity.components?.text || {}
        const value = (tc.value || '').replace(/\\n/g, '\n')
        if (tc.billboard) {
            // Billboarded title/caption: always faces the viewer, drawn over geometry.
            // `lines` lets one billboard stack several per-line-styled rows (so a title
            // keeps its size/colour hierarchy and stays readable even viewed end-on).
            const lines = Array.isArray(tc.lines) && tc.lines.length
                ? tc.lines
                : [{ value, fontSize: tc.fontSize3D || 0.5, color: appearance.color || '#ffffff' }]
            const gaps = lines.map((ln) => (ln.fontSize || 0.4) * 1.45)
            const totalH = gaps.reduce((a, b) => a + b, 0)
            let cursor = totalH / 2
            return (
                <Billboard scale={BILLBOARD_TEXT_SCALE}>
                    {lines.map((ln, i) => {
                        const y = cursor - gaps[i] / 2
                        cursor -= gaps[i]
                        return (
                            <Text
                                key={i}
                                position={[0, y, 0]}
                                fontSize={ln.fontSize || 0.4}
                                maxWidth={tc.maxWidth || 16}
                                color={ln.color || '#ffffff'}
                                anchorX="center"
                                anchorY="middle"
                                outlineWidth={(ln.fontSize || 0.4) > 0.4 ? 0.014 : 0.006}
                                outlineColor="#04070c"
                                renderOrder={20}
                                material-depthTest={false}
                                material-depthWrite={false}
                            >
                                {(ln.value || '').replace(/\\n/g, '\n')}
                            </Text>
                        )
                    })}
                </Billboard>
            )
        }
        if (tc.variant === '3d') {
            return <Text3DObject data={value} color={appearance.color || '#ffffff'} fontSize3D={tc.fontSize3D} depth3D={tc.depth3D} />
        }
        return <Text2DObject data={value} color={appearance.color || '#ffffff'} fontFamily={tc.fontFamily} fontWeight={tc.fontWeight} fontStyle={tc.fontStyle} />
    }
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

    const anim = useMemo(() => resolveAnimation(entity), [entity])

    useFrame((state) => {
        const group = groupRef.current
        if (!group) return
        const t = state.clock.getElapsedTime() + seed
        applyAnimation(group, anim, basePos, baseRot, t)
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
function Walker({ playerRef, onNearestZone, entities, bounds, joystickRef, joyVisRef, joyThumbRef, vertTouchRef, onLockChange, flyMode, isArActive, arTouchElRef }) {
    const { camera, gl } = useThree()
    // During an XR session the camera pose is owned by the headset/phone and
    // locomotion is driven through XROrigin (see XrLocomotion). Walker must NOT
    // write camera.position/lookAt then, or it yanks the camera back to the
    // flat-screen player pose every frame -- fighting head-tracking and
    // defeating XROrigin movement entirely.
    const isPresenting = useXR((state) => state.session != null)
    const keysRef = useRef(new Set())
    const speedRef = useRef(0)
    const strafeSpeedRef = useRef(0)
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
        // During a handheld AR session, only the WebXR dom-overlay root (and
        // its descendants) reliably receives input -- the page's own canvas
        // does not. Attach the same touch handling to the dedicated overlay
        // element instead whenever AR is active.
        const el = (isArActive && arTouchElRef?.current) || gl.domElement
        const player = playerRef.current
        const isTouch = isArActive || window.matchMedia('(pointer: coarse)').matches

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
                const pitchLimit = flyRef.current ? FLY_PITCH_LIMIT : WALK_PITCH_LIMIT
                player.yaw -= e.movementX * POINTER_LOCK_SENSITIVITY
                player.pitch = THREE.MathUtils.clamp(
                    player.pitch - e.movementY * POINTER_LOCK_SENSITIVITY,
                    -pitchLimit,
                    pitchLimit
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
                        const pitchLimit = flyRef.current ? FLY_PITCH_LIMIT : WALK_PITCH_LIMIT
                        player.yaw -= (t.clientX - touchLookRef.current.lastX) * TOUCH_LOOK_SENSITIVITY
                        player.pitch = THREE.MathUtils.clamp(
                            player.pitch - (t.clientY - touchLookRef.current.lastY) * TOUCH_LOOK_SENSITIVITY,
                            -pitchLimit,
                            pitchLimit
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
    }, [gl, playerRef, joystickRef, joyVisRef, joyThumbRef, isArActive, arTouchElRef])

    useFrame((_, delta) => {
        // XrLocomotion owns movement + camera during a session.
        if (isPresenting) return
        const keys = keysRef.current
        const player = playerRef.current
        const joy = joystickRef?.current || { x: 0, y: 0 }
        const fly = flyRef.current
        if (player.pitch === undefined) player.pitch = 0
        if (player.altY === undefined) player.altY = EYE_HEIGHT

        // Only arrow keys (and mouse/touch drag, and the mobile joystick's x
        // axis) turn the camera -- A/D strafe sideways instead, matching the
        // FPS convention most people expect rather than a tank-style turn.
        let turn = 0
        if (keys.has('arrowleft')) turn += 1
        if (keys.has('arrowright')) turn -= 1
        turn -= joy.x
        player.yaw += turn * TURN_SPEED * delta

        let forward = 0
        if (keys.has('w') || keys.has('arrowup')) forward += 1
        if (keys.has('s') || keys.has('arrowdown')) forward -= 1
        forward -= joy.y

        let strafe = 0
        if (keys.has('d')) strafe += 1
        if (keys.has('a')) strafe -= 1

        let vert = 0
        if (fly) {
            if (keys.has(' ') || keys.has('q')) vert += 1
            if (keys.has('e') || keys.has('c')) vert -= 1
            vert += vertTouchRef?.current || 0
        }

        const targetSpeed = forward * WALK_MAX_SPEED
        const accel = forward !== 0 ? WALK_ACCEL : WALK_FRICTION
        speedRef.current += THREE.MathUtils.clamp(targetSpeed - speedRef.current, -accel * delta, accel * delta)
        if (Math.abs(speedRef.current) < 0.001) speedRef.current = 0

        const targetStrafeSpeed = strafe * WALK_MAX_SPEED
        const strafeAccel = strafe !== 0 ? WALK_ACCEL : WALK_FRICTION
        strafeSpeedRef.current += THREE.MathUtils.clamp(targetStrafeSpeed - strafeSpeedRef.current, -strafeAccel * delta, strafeAccel * delta)
        if (Math.abs(strafeSpeedRef.current) < 0.001) strafeSpeedRef.current = 0

        if (speedRef.current !== 0 || strafeSpeedRef.current !== 0) {
            // Forward/strafe always move on the horizontal plane, even while
            // flying -- like a drone, not a jet. Looking down to film the
            // ground below shouldn't also make you descend; altitude is only
            // ever changed explicitly, via Space/Q (up) and C/E (down).
            const forwardX = Math.sin(player.yaw) * speedRef.current
            const forwardZ = Math.cos(player.yaw) * speedRef.current
            const rightX = -Math.cos(player.yaw) * strafeSpeedRef.current
            const rightZ = Math.sin(player.yaw) * strafeSpeedRef.current
            const nextX = player.x + (forwardX + rightX) * delta
            const nextZ = player.z + (forwardZ + rightZ) * delta
            player.x = THREE.MathUtils.clamp(nextX, bounds.minX, bounds.maxX)
            player.z = THREE.MathUtils.clamp(nextZ, bounds.minZ, bounds.maxZ)
            bobPhaseRef.current += delta * Math.hypot(speedRef.current, strafeSpeedRef.current) * (fly ? 0 : 1.8)
        }
        if (fly && vert !== 0) {
            player.altY = THREE.MathUtils.clamp(player.altY + vert * FLY_SPEED * delta, -2, 60)
        }
        if (!fly) {
            player.altY = THREE.MathUtils.lerp(player.altY, EYE_HEIGHT, Math.min(1, delta * 3))
        }

        const bobAmount = fly ? 0 : Math.sin(bobPhaseRef.current) * 0.05 * Math.min(1, Math.hypot(speedRef.current, strafeSpeedRef.current) / WALK_MAX_SPEED)
        const lookDir = tmpVec.set(
            Math.sin(player.yaw) * Math.cos(player.pitch),
            Math.sin(player.pitch),
            Math.cos(player.yaw) * Math.cos(player.pitch)
        )

        camera.position.set(player.x, player.altY + bobAmount, player.z)
        tmpLook.set(player.x + lookDir.x, player.altY + bobAmount + lookDir.y, player.z + lookDir.z)
        camera.lookAt(tmpLook)

        if (onNearestZone && entities.length) {
            // In a composed exhibition the "zones" are the portal embeds; fall back to
            // all entities for plain single-project scenes.
            const portals = entities.filter((e) => e.type === 'portal')
            const pool = portals.length ? portals : entities
            let nearest = null
            let nearestDist = Infinity
            for (const entity of pool) {
                const pos = entity.components?.transform?.position
                if (!pos) continue
                const dist = (pos[0] - player.x) ** 2 + (pos[2] - player.z) ** 2
                if (dist < nearestDist) {
                    nearestDist = dist
                    nearest = entity
                }
            }
            const label = nearest?.components?.reference?.label
                || nearest?.name?.match(/Zone\s*\d+/i)?.[0]
                || nearest?.name || null
            onNearestZone(nearestDist < (portals.length ? 900 : 64) ? label : null)
        }
    })

    return null
}

// No XROrigin was ever rendered inside <XR>, so a VR/AR session started at
// world (0,0,0) with no connection to the desktop/touch Walker's position,
// and no locomotion existed beyond @react-three/xr's default teleport
// pointer. Adds standard smooth thumbstick locomotion (left stick moves,
// right stick turns) and keeps it in sync with playerRef so position
// carries over correctly entering and leaving a session.
function XrLocomotion({ playerRef, joystickRef, flyMode, vertTouchRef }) {
    const originRef = useRef(null)
    const isPresenting = useXR((state) => state.session != null)
    const isVr = useXR((state) => state.mode === 'immersive-vr')
    const rightController = useXRInputSourceState('controller', 'right')
    const wasPresentingRef = useRef(false)

    useXRControllerLocomotion(
        originRef,
        { speed: WALK_MAX_SPEED },
        { type: 'smooth', speed: TURN_SPEED }
    )

    useFrame((state, delta) => {
        const origin = originRef.current
        if (!origin) return
        const player = playerRef.current

        if (isPresenting && !wasPresentingRef.current) {
            // Just entered XR -- start from wherever the desktop/touch walker last
            // was, instead of world origin. origin.y carries altitude (0 == floor).
            origin.position.set(player.x, Math.max(0, (player.altY ?? EYE_HEIGHT) - EYE_HEIGHT), player.z)
            origin.rotation.set(0, player.yaw, 0)
        }
        wasPresentingRef.current = isPresenting

        if (isPresenting) {
            // Joystick mirrors walk-mode convention: joy.x turns (rotates
            // XROrigin yaw), joy.y moves forward along that virtual yaw.
            // The phone IMU still controls the look direction on top of
            // this, so the user can look around freely while the virtual
            // compass turns with the joystick -- same muscle memory as walk.
            const joy = joystickRef?.current
            if (joy && (Math.abs(joy.x) > 0.05 || Math.abs(joy.y) > 0.05)) {
                origin.rotation.y -= joy.x * TURN_SPEED * delta
                // Move along the camera's real horizontal forward, not a yaw
                // reconstruction: the XR camera looks down the rig's local -Z,
                // the OPPOSITE of +(sin,cos), so deriving forward from
                // origin.rotation.y inverted/mirrored the joystick.
                const fwd = -joy.y * WALK_MAX_SPEED * delta
                state.camera.getWorldDirection(tmpDir)
                tmpDir.y = 0
                if (tmpDir.lengthSq() > 1e-6) {
                    tmpDir.normalize()
                    origin.position.x += tmpDir.x * fwd
                    origin.position.z += tmpDir.z * fwd
                }
            }

            // Vertical (fly). AR has no controllers, so the ▲▼ touch buttons set
            // vertTouchRef; VR has no reachable 2D Fly button, so the right
            // thumbstick's Y axis always flies (left stick walks, right stick X
            // turns -- Y is free). Horizontal locomotion never touched origin.y.
            const touchVert = vertTouchRef?.current || 0
            const stickY = rightController?.gamepad?.['xr-standard-thumbstick']?.yAxis ?? 0
            const stickVert = Math.abs(stickY) > 0.15 ? -stickY : 0 // push up = ascend
            if (isVr) {
                origin.position.y = THREE.MathUtils.clamp(origin.position.y + (touchVert + stickVert) * FLY_SPEED * delta, 0, 58)
            } else if (flyMode) {
                origin.position.y = THREE.MathUtils.clamp(origin.position.y + touchVert * FLY_SPEED * delta, 0, 58)
            } else {
                origin.position.y = THREE.MathUtils.lerp(origin.position.y, 0, Math.min(1, delta * 3))
            }

            // Keep playerRef in sync so other logic (nearest-zone, bounds)
            // tracks correctly during a session, and leaving XR resumes
            // from the same spot instead of snapping back.
            player.x = origin.position.x
            player.z = origin.position.z
            player.yaw = origin.rotation.y
            player.altY = EYE_HEIGHT + origin.position.y
        }
    })

    return <XROrigin ref={originRef} />
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

// Fly mode's altitude keys (Space/Q, C/E) have no touch equivalent --
// press-and-hold buttons fill that gap. Pointer events (not click) so
// altitude changes continuously while held, like the keyboard.
// Animated first-visit movement cue: a ghost joystick demo on mobile (the real
// joystick is invisible until touched), pulsing WASD keys on desktop.
function MoveHintVisual({ isMobile }) {
    if (isMobile) {
        return (
            <div className="ls-move-hint">
                <div className="ls-ghost-joy"><div className="ls-ghost-thumb" /></div>
                <span className="ls-hint-label ls-hint-label--joy">drag · move</span>
                <div className="ls-ghost-swipe" />
                <span className="ls-hint-label ls-hint-label--look">swipe · look</span>
            </div>
        )
    }
    return (
        <div className="ls-move-hint">
            <div className="ls-keys">
                <div className="ls-keys-row"><span className="ls-key ls-key--w">W</span></div>
                <div className="ls-keys-row">
                    <span className="ls-key ls-key--a">A</span>
                    <span className="ls-key ls-key--s">S</span>
                    <span className="ls-key ls-key--d">D</span>
                </div>
            </div>
        </div>
    )
}

function VerticalTouchControls({ vertTouchRef }) {
    const setVert = (value) => (e) => {
        e.preventDefault()
        vertTouchRef.current = value
    }
    const clearVert = () => { vertTouchRef.current = 0 }
    return (
        <div className="live-scene-vert-controls">
            <button
                type="button"
                className="live-scene-vert-btn"
                onPointerDown={setVert(1)}
                onPointerUp={clearVert}
                onPointerLeave={clearVert}
                onPointerCancel={clearVert}
                aria-label="Ascend"
            >
                ▲
            </button>
            <button
                type="button"
                className="live-scene-vert-btn"
                onPointerDown={setVert(-1)}
                onPointerUp={clearVert}
                onPointerLeave={clearVert}
                onPointerCancel={clearVert}
                aria-label="Descend"
            >
                ▼
            </button>
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
        if (!requestedProjectId) return
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
        if (!projectId) return undefined
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
// Color transitions: when worldState.atmosphereBlend is on, the background + fog
// drift toward the distance-weighted colors of nearby zones (each portal's
// authored colour) as you walk — ported from the old bespoke exhibition, now a
// data toggle that works for any project.
const _atmAcc = new THREE.Color()
const _atmTarget = new THREE.Color()
function AtmosphereBlender({ zones, playerRef, baseBg }) {
    const { scene } = useThree()
    const base = useMemo(() => new THREE.Color(baseBg), [baseBg])
    const current = useRef(new THREE.Color(baseBg))
    useFrame(() => {
        const p = playerRef.current
        if (!p || !zones.length) return
        let tot = 0
        for (const z of zones) { const dx = z.x - p.x, dz = z.z - p.z; z._w = 1 / (dx * dx + dz * dz + 400); tot += z._w }
        let r = 0, g = 0, b = 0, nd2 = Infinity
        for (const z of zones) {
            const k = z._w / tot
            _atmAcc.set(z.color); r += _atmAcc.r * k; g += _atmAcc.g * k; b += _atmAcc.b * k
            const dx = z.x - p.x, dz = z.z - p.z; const d2 = dx * dx + dz * dz; if (d2 < nd2) nd2 = d2
        }
        const nd = Math.sqrt(nd2)
        const strength = THREE.MathUtils.clamp(1 - (nd - 8) / (40 - 8), 0, 1)
        _atmAcc.setRGB(r, g, b)
        _atmTarget.copy(base).lerp(_atmAcc, strength)
        current.current.lerp(_atmTarget, 0.04)
        if (scene.background?.isColor) scene.background.copy(current.current)
        if (scene.fog) scene.fog.color.copy(current.current)
    })
    return null
}

// Wayfinding floor decor for a composed hub (opt-in via worldState.hubDecor):
// a pulsing centre ring, faint spokes out to each zone, and a glow ring under
// each zone — ported from the old bespoke exhibition.
function HubDecor({ zones }) {
    const centerRef = useRef(null)
    useFrame((state) => {
        if (centerRef.current) centerRef.current.material.opacity = 0.3 + Math.sin(state.clock.getElapsedTime() * 0.9) * 0.08
    })
    const spokes = useMemo(() => {
        const a = new Float32Array(zones.length * 6)
        zones.forEach((z, i) => { a[i * 6 + 1] = 0.02; a[i * 6 + 3] = z.x; a[i * 6 + 4] = 0.02; a[i * 6 + 5] = z.z })
        return a
    }, [zones])
    return (
        <>
            <mesh ref={centerRef} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
                <ringGeometry args={[3.6, 4.2, 64]} />
                <meshBasicMaterial color={0xffffff} transparent opacity={0.3} depthWrite={false} side={THREE.DoubleSide} />
            </mesh>
            <lineSegments key={zones.length}>
                <bufferGeometry>
                    <bufferAttribute attach="attributes-position" args={[spokes, 3]} />
                </bufferGeometry>
                <lineBasicMaterial color={0xffffff} transparent opacity={0.1} />
            </lineSegments>
            {zones.map((z, i) => (
                <mesh key={i} rotation={[-Math.PI / 2, 0, 0]} position={[z.x, 0.03, z.z]}>
                    <ringGeometry args={[2.4, 3, 48]} />
                    <meshBasicMaterial color={0xffffff} transparent opacity={0.16} depthWrite={false} side={THREE.DoubleSide} />
                </mesh>
            ))}
        </>
    )
}

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
    // First-visit movement hint: fades on a timer, but dismiss immediately on the
    // first interaction so the ghost-joystick demo never overlaps the real joystick.
    const [showMoveHint, setShowMoveHint] = useState(true)
    useEffect(() => {
        const t = setTimeout(() => setShowMoveHint(false), 12000)
        const dismiss = () => setShowMoveHint(false)
        window.addEventListener('pointerdown', dismiss, { once: true })
        window.addEventListener('touchstart', dismiss, { once: true })
        return () => {
            clearTimeout(t)
            window.removeEventListener('pointerdown', dismiss)
            window.removeEventListener('touchstart', dismiss)
        }
    }, [])
    const [flyMode, setFlyMode] = useState(false)
    const joystickRef = useRef({ x: 0, y: 0 })
    const joyVisRef = useRef(null)
    const joyThumbRef = useRef(null)
    // Fly mode's altitude keys (Space/Q up, C/E down) have no touch
    // equivalent -- without this, mobile fly has no way to ascend/descend at all.
    const vertTouchRef = useRef(0)
    const arTouchElRef = useRef(null)
    const isArActive = xr.isArModeActive && xr.isXrPresenting
    const playerRef = useRef({ x: 0, z: 6, yaw: Math.PI, pitch: 0, altY: EYE_HEIGHT })

    // Data-driven arrival: a project can author worldState.spawn to place/aim the
    // visitor on entry (otherwise the default above). Applied once per project load.
    const spawnAppliedRef = useRef(null)
    useEffect(() => {
        const s = doc?.worldState?.spawn
        if (!s || spawnAppliedRef.current === projectId) return
        spawnAppliedRef.current = projectId
        playerRef.current = {
            x: s.x ?? 0, z: s.z ?? 0, yaw: s.yaw ?? 0,
            pitch: s.pitch ?? 0, altY: s.altY ?? EYE_HEIGHT
        }
    }, [doc, projectId])

    // The library only toggles display:block/none on this element -- it has
    // no inherent size/position, so anything portaled into it (the touch
    // surface, joystick, buttons) has no positioning context without this.
    useEffect(() => {
        const root = xr.domOverlayRoot
        if (!root) return
        Object.assign(root.style, { position: 'fixed', inset: '0', width: '100%', height: '100%' })
    }, [xr.domOverlayRoot])

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
    // Zone tint sources for atmosphere blend: each portal's position + authored colour.
    const atmosphereZones = useMemo(() => entities
        .filter((e) => e.type === 'portal')
        .map((e) => {
            const pos = e.components?.transform?.position || [0, 0, 0]
            return { x: pos[0], z: pos[2], color: e.components?.appearance?.color || backgroundColor }
        }), [entities, backgroundColor])

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
                {interactive && worldState.atmosphereBlend && atmosphereZones.length > 0 ? (
                    <AtmosphereBlender zones={atmosphereZones} playerRef={playerRef} baseBg={backgroundColor} />
                ) : null}
                {worldState.hubDecor && atmosphereZones.length > 0 ? (
                    <HubDecor zones={atmosphereZones} />
                ) : null}
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
                        vertTouchRef={vertTouchRef}
                        onLockChange={setIsLocked}
                        flyMode={flyMode}
                        isArActive={isArActive}
                        arTouchElRef={arTouchElRef}
                    />
                ) : (
                    <IdleOrbit center={center} />
                )}
                {interactive && <XrLocomotion playerRef={playerRef} joystickRef={joystickRef} flyMode={flyMode} vertTouchRef={vertTouchRef} />}
                </XR>
            </Canvas>

            {/* Joystick and the Fly toggle are functional controls, not
                branding chrome -- a touch device has no F key and no other
                way to reach fly mode, so these render regardless of
                showChrome. Callers that supply their own exit button/hint
                (the landing page) still only get one of those, not two. */}
            {(() => {
                const controlsUI = (
                    <>
                        {interactive && isMobile && (
                            <MobileJoystick outerRef={joyVisRef} thumbRef={joyThumbRef} />
                        )}
                        {interactive && isMobile && flyMode && (
                            <VerticalTouchControls vertTouchRef={vertTouchRef} />
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
                        {xr.isXrPresenting && (
                            <button type="button" className="live-scene-exit"
                                style={{ position: 'absolute', bottom: 40, right: 130, zIndex: 11 }}
                                onClick={xr.handleExitXrSession}
                            >
                                Exit XR
                            </button>
                        )}
                    </>
                )

                // Normal page DOM (this component's own render output) isn't
                // composited during a handheld AR session -- only the
                // WebXR-managed dom-overlay root is. Portal the same controls
                // (plus a full-viewport element for Walker to actually
                // receive touches on) into it whenever AR is active.
                if (isArActive && xr.domOverlayRoot) {
                    return createPortal(
                        <>
                            <div ref={arTouchElRef} className="live-scene-ar-touch-capture" />
                            {controlsUI}
                        </>,
                        xr.domOverlayRoot
                    )
                }
                return controlsUI
            })()}

            {/* Enter AR/VR are functional controls too -- a caller that hides
                chrome (the landing page) still needs a way to actually start
                a session, not just walk/fly on the flat screen. Still gated
                on `interactive` -- a purely decorative background (e.g.
                Studio Hub's) has no Walker/locomotion wired up to make a
                session usable. */}
            {interactive && (xr.supportedXrModes.vr || xr.supportedXrModes.ar) && !xr.isXrPresenting && (
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
                        <p className="live-scene-hint live-scene-hint--lock">
                            Click to explore &nbsp;·&nbsp; walk &nbsp;·&nbsp; mouse · look &nbsp;·&nbsp; F · fly
                        </p>
                    )}
                    {interactive && !isMobile && isLocked && (
                        <p className="live-scene-hint">
                            WASD · move &nbsp;·&nbsp; Mouse · look &nbsp;·&nbsp; F · {flyMode ? 'walk' : 'fly'}
                            {flyMode ? <>&nbsp;·&nbsp; Space/Q · up &nbsp;·&nbsp; C/E · down</> : null}
                            &nbsp;·&nbsp; ESC · release
                        </p>
                    )}
                    {interactive && showMoveHint && (isMobile || !isLocked) && (
                        <MoveHintVisual isMobile={isMobile} />
                    )}
                </>
            )}
        </>
    )
}
