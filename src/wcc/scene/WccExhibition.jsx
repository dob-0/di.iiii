import { Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Grid, Text, Billboard } from '@react-three/drei'
import { XR, XROrigin, useXR, useXRControllerLocomotion } from '@react-three/xr'
import * as THREE from 'three'
import { useXrAr } from '../../hooks/useXrAr.js'
import { getProjectDocument } from '../../project/services/projectsApi.js'
import { normalizeProjectDocument } from '../../shared/projectSchema.js'
import { getApiSession } from '../../services/apiClient.js'
import BoxObject from '../../objectComponents/BoxObject.jsx'
import SphereObject from '../../objectComponents/SphereObject.jsx'
import ConeObject from '../../objectComponents/ConeObject.jsx'
import CylinderObject from '../../objectComponents/CylinderObject.jsx'
import ImageObject from '../../objectComponents/ImageObject.jsx'
import VideoObject from '../../objectComponents/VideoObject.jsx'
import ModelObject from '../../objectComponents/ModelObject.jsx'
import '../../components/liveProjectScene.css'
import './scene.css'

// ── Artists ───────────────────────────────────────────────────────────────────

const ARTISTS = [
    { id: 'alla-virabyan',      title: 'Alla Virabyan' },
    { id: 'ani-khachatryan',    title: 'Ani Khachatryan' },
    { id: 'arthur',             title: 'Arthur Jay Robin Sergo' },
    { id: 'jeny-gevorgyan',     title: 'Jeny Gevorgyan' },
    { id: 'margarita-ghazaryan',title: 'Margarita Ghazaryan' },
    { id: 'meri-andreasyan',    title: 'Meri Andreasyan' },
    { id: 'mery-petrosyan',     title: 'Mery Petrosyan' },
    { id: 'nush-petrosyan',     title: 'Nush Petrosyan' },
    { id: 'sanjay-j-choudari',  title: 'Sanjay J Choudari' },
    { id: 'yeva-abgaryan',      title: 'Yeva Abgaryan' },
]
const ARTIST_IDS = ARTISTS.map((a) => a.id)

// The hub itself is now an editable Studio project ("main", same space as the
// artists) instead of pure hand-coded geometry -- entities placed in it render
// centered at the hub origin, same fade-in/asset pipeline as a zone.
const MAIN_PROJECT_ID = 'main'
const MAIN_DOC_IDS = [MAIN_PROJECT_ID]
const HUB_CENTER = new THREE.Vector3(0, 0, 0)

// ── Scene constants ───────────────────────────────────────────────────────────

const RING_RADIUS        = 38
const ZONE_LABEL_DIST    = 10
const EYE_HEIGHT         = 1.6
const WALK_MAX_SPEED     = 5.2
const FLY_SPEED          = 4.5
const WALK_ACCEL         = 14
const WALK_FRICTION      = 10
const TURN_SPEED         = 1.6
const PTR_SENSITIVITY    = 0.0055
const TOUCH_SENSITIVITY  = 0.0038
// Walking keeps a smaller cap (orientation against the horizon); flying has
// none to stay oriented against, so it gets (almost) the full vertical range.
const WALK_PITCH_LIMIT   = 1.45
const FLY_PITCH_LIMIT    = 1.55
const JOY_RADIUS         = 45   // floating joystick thumb travel radius (px)
const PARTICLE_COUNT     = 1400
const BOUNDS_HALF        = RING_RADIUS + 50  // walk bounds; fly uses 400

const DEFAULT_BG      = '#0a1118'
const DEFAULT_AMBIENT = { color: '#ffffff', intensity: 0.85 }
const DEFAULT_DIR     = { color: '#fff7ea', intensity: 1.15, position: [8, 12, 4] }

// Zone centers arranged in a ring for the "Enter Exhibition" full view.
const ZONE_CENTERS_RING = ARTISTS.map((_, i) => {
    const angle = (i / ARTISTS.length) * Math.PI * 2
    return new THREE.Vector3(Math.sin(angle) * RING_RADIUS, 0, Math.cos(angle) * RING_RADIUS)
})

const tmpVec   = new THREE.Vector3()
const tmpLook  = new THREE.Vector3()
const tmpColor = new THREE.Color()
const tmpColorB = new THREE.Color()
const tmpColorC = new THREE.Color()
const tmpColorD = new THREE.Color()
const defaultBgColor  = new THREE.Color(DEFAULT_BG)
const defaultAmbColor = new THREE.Color(DEFAULT_AMBIENT.color)
const defaultDirColor = new THREE.Color(DEFAULT_DIR.color)

// ── Guest session singleton ───────────────────────────────────────────────────

let guestSessionPromise = null
const ensureGuestSession = () => {
    if (!guestSessionPromise) {
        guestSessionPromise = getApiSession().catch(() => null)
    }
    return guestSessionPromise
}

// ── Entity helpers ────────────────────────────────────────────────────────────

const isGround = (e) => /ground|floor/i.test(e?.name || '')
const isFly    = (e) => /\bfly\b/i.test(e?.name || '')

function EntityVisual({ entity, assetMap }) {
    const media      = entity.components?.media || {}
    const appearance = entity.components?.appearance || {}
    const asset      = media.assetId ? assetMap.get(media.assetId) : null

    switch (entity.type) {
    case 'box':
        return <BoxObject color={appearance.color} boxSize={entity.components?.primitive?.size} wireframe={Boolean(appearance.wireframe)} opacity={appearance.opacity} />
    case 'sphere':
        return <SphereObject color={appearance.color} sphereRadius={entity.components?.primitive?.radius} wireframe={Boolean(appearance.wireframe)} opacity={appearance.opacity} />
    case 'cone':
        return <ConeObject color={appearance.color} coneRadius={entity.components?.primitive?.radius} coneHeight={entity.components?.primitive?.height} wireframe={Boolean(appearance.wireframe)} opacity={appearance.opacity} />
    case 'cylinder':
        return <CylinderObject color={appearance.color} cylinderRadiusTop={entity.components?.primitive?.radiusTop} cylinderRadiusBottom={entity.components?.primitive?.radiusBottom} cylinderHeight={entity.components?.primitive?.height} wireframe={Boolean(appearance.wireframe)} opacity={appearance.opacity} />
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

function AnimatedEntity({ entity, assetMap, zoneCenter }) {
    const groupRef = useRef(null)
    const localPos = entity.components?.transform?.position || [0, 0, 0]
    const baseRot  = entity.components?.transform?.rotation || [0, 0, 0]
    const baseScale = entity.components?.transform?.scale  || [1, 1, 1]
    const worldPos  = [localPos[0] + zoneCenter.x, localPos[1], localPos[2] + zoneCenter.z]

    const seed = useMemo(() => {
        let h = 0
        for (let i = 0; i < entity.id.length; i++) h = (h * 31 + entity.id.charCodeAt(i)) % 1000
        return (h / 1000) * Math.PI * 2
    }, [entity.id])

    const isGroundE = isGround(entity)
    const isFlyE    = isFly(entity)

    useFrame((state) => {
        const group = groupRef.current
        if (!group) return
        const t = state.clock.getElapsedTime() + seed

        if (isGroundE) {
            group.position.set(...worldPos)
            group.rotation.set(...baseRot)
            return
        }
        if (isFlyE) {
            const r = 1.6
            group.position.set(
                worldPos[0] + Math.cos(t * 0.6) * r,
                worldPos[1] + Math.sin(t * 1.3) * 0.5,
                worldPos[2] + Math.sin(t * 0.6) * r,
            )
            group.rotation.set(baseRot[0], t * 0.6, baseRot[2])
            return
        }
        group.position.set(worldPos[0], worldPos[1] + Math.sin(t * 0.7) * 0.12, worldPos[2])
        const isFlat = entity.type === 'image' || entity.type === 'video'
        const yaw = isFlat ? baseRot[1] + Math.sin(t * 0.4) * 0.08 : baseRot[1] + t * 0.12
        group.rotation.set(baseRot[0], yaw, baseRot[2])
    })

    return (
        <group ref={groupRef} position={worldPos} rotation={baseRot} scale={baseScale}>
            <Suspense fallback={null}>
                <EntityVisual entity={entity} assetMap={assetMap} />
            </Suspense>
        </group>
    )
}

// ── Zone portal: a glowing gateway + floating name at the hub-facing edge of
// each zone, so the hub reads as a real floor plan with ten clear paths
// instead of an empty void with nothing to walk toward. ───────────────────────

const PORTAL_DIST = RING_RADIUS - 15

function ZonePortal({ artist, center }) {
    const ringRef = useRef(null)
    const dir = useMemo(() => {
        const len = Math.hypot(center.x, center.z) || 1
        return { x: center.x / len, z: center.z / len }
    }, [center])
    const pos = useMemo(
        () => new THREE.Vector3(dir.x * PORTAL_DIST, 0, dir.z * PORTAL_DIST),
        [dir],
    )

    useFrame((state) => {
        const ring = ringRef.current
        if (!ring) return
        const t = state.clock.getElapsedTime()
        ring.material.opacity = 0.18 + Math.sin(t * 1.4 + pos.x) * 0.08
        ring.rotation.z = t * 0.12
    })

    return (
        <group position={pos}>
            <mesh ref={ringRef} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, 0]}>
                <ringGeometry args={[2.4, 3, 48]} />
                <meshBasicMaterial color={0xffffff} transparent opacity={0.22} depthWrite={false} side={THREE.DoubleSide} />
            </mesh>
            <Billboard position={[0, 2.8, 0]}>
                <Text fontSize={0.7} maxWidth={8} color="#ffffff" outlineWidth={0.02} outlineColor="#000000" anchorX="center" anchorY="middle">
                    {artist.title}
                </Text>
            </Billboard>
        </group>
    )
}

// Thin, low-opacity floor lines from the hub center to each portal, so the
// ten paths out of the hub are visible at a glance.
function HubSpokes({ zoneCenters }) {
    const positions = useMemo(() => {
        const arr = new Float32Array(zoneCenters.length * 6)
        zoneCenters.forEach((c, i) => {
            const len = Math.hypot(c.x, c.z) || 1
            const dx = (c.x / len) * PORTAL_DIST
            const dz = (c.z / len) * PORTAL_DIST
            arr[i * 6] = 0; arr[i * 6 + 1] = 0.02; arr[i * 6 + 2] = 0
            arr[i * 6 + 3] = dx; arr[i * 6 + 4] = 0.02; arr[i * 6 + 5] = dz
        })
        return arr
    }, [zoneCenters])

    return (
        <lineSegments>
            <bufferGeometry>
                <bufferAttribute attach="attributes-position" args={[positions, 3]} />
            </bufferGeometry>
            <lineBasicMaterial color={0xffffff} transparent opacity={0.1} />
        </lineSegments>
    )
}

// Soft glow ring at the hub's own center so the starting point feels intentional.
function HubMarker() {
    const ringRef = useRef(null)
    useFrame((state) => {
        if (!ringRef.current) return
        const t = state.clock.getElapsedTime()
        ringRef.current.material.opacity = 0.3 + Math.sin(t * 0.9) * 0.08
    })
    return (
        <mesh ref={ringRef} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
            <ringGeometry args={[3.6, 4.2, 64]} />
            <meshBasicMaterial color={0xffffff} transparent opacity={0.3} depthWrite={false} side={THREE.DoubleSide} />
        </mesh>
    )
}

// ── Exhibition-only entity corrections ───────────────────────────────────────
// Artists authored content in their own LiveProjectScene (unbounded, local
// coords). The ring puts zones 38m out with a 10m radius. These overrides fix
// placement without touching the artists' saved project data.

const ZONE_OVERRIDES = {
    // Meri has 3 copies of the same video placed ±14-16m apart — two land
    // inside Mery's and Margarita's zones. Keep only the primary (no "copy").
    'meri-andreasyan': {
        filter: (e) => !e.name?.toLowerCase().includes('copy'),
    },
    // Arthur placed his video at y=7.1m in personal space; at eye height (1.8m)
    // the large scale reads as intentional cinema instead of floating debris.
    'arthur': {
        transform: (e) => {
            const tr = e.components?.transform || {}
            const pos = tr.position || [0, 0, 0]
            return { ...e, components: { ...e.components, transform: { ...tr, position: [pos[0], 1.8, pos[2]] } } }
        },
    },
    // Jeny's GLBs sit 5m toward the hub (local x = -5) so they bleed into
    // adjacent zones when viewed from the center. Shift them back into her zone.
    'jeny-gevorgyan': {
        transform: (e) => {
            const tr = e.components?.transform || {}
            const pos = tr.position || [0, 0, 0]
            return { ...e, components: { ...e.components, transform: { ...tr, position: [pos[0] + 5, pos[1], pos[2]] } } }
        },
    },
    // Ani's entities are scale=1. At 38m approach distance they're invisible.
    'ani-khachatryan': {
        transform: (e) => {
            const tr = e.components?.transform || {}
            return { ...e, components: { ...e.components, transform: { ...tr, scale: [2.5, 2.5, 2.5] } } }
        },
    },
}

// ── Per-zone group (memoises its entity + asset lists) ────────────────────────

function ZoneGroup({ artist, doc, center, showRing = true }) {
    const overrides = ZONE_OVERRIDES[artist.id]
    const entities = useMemo(() => {
        let list = doc?.entities || []
        if (overrides?.filter) list = list.filter(overrides.filter)
        if (overrides?.transform) list = list.map(overrides.transform)
        return list
    }, [doc, overrides])
    const assetMap = useMemo(
        () => new Map((doc?.assets || []).map((a) => [a.id, a])),
        [doc],
    )
    const groupRef = useRef(null)
    const fadeRef  = useRef(0)
    const fadeDone = useRef(false)

    useFrame((_, delta) => {
        if (fadeDone.current || !groupRef.current) return
        fadeRef.current = Math.min(1, fadeRef.current + delta * 1.25)
        const v = fadeRef.current
        groupRef.current.traverse((obj) => {
            if (obj.isMesh && obj.material) {
                obj.material.transparent = true
                obj.material.opacity = v
            }
        })
        if (v >= 1) fadeDone.current = true
    })

    return (
        <group ref={groupRef}>
            {showRing ? (
                <mesh position={[center.x, 0.01, center.z]} rotation={[-Math.PI / 2, 0, 0]}>
                    <ringGeometry args={[ZONE_LABEL_DIST - 1, ZONE_LABEL_DIST, 64]} />
                    <meshBasicMaterial color={0x334455} transparent opacity={0.15} depthWrite={false} side={THREE.DoubleSide} />
                </mesh>
            ) : null}
            {entities.map((entity) => (
                <AnimatedEntity
                    key={`${artist.id}:${entity.id}`}
                    entity={entity}
                    assetMap={assetMap}
                    zoneCenter={center}
                />
            ))}
        </group>
    )
}

// Shown at a zone's position while its project doc is still fetching.
function ZonePlaceholder({ center }) {
    const ringRef  = useRef(null)
    const dotRef   = useRef(null)
    useFrame((state) => {
        const t = state.clock.getElapsedTime()
        if (ringRef.current)  ringRef.current.material.opacity  = 0.28 + Math.sin(t * 1.6 + center.x) * 0.14
        if (dotRef.current)   dotRef.current.material.opacity   = 0.55 + Math.sin(t * 2.2 + center.z) * 0.25
    })
    return (
        <group>
            {/* pulsing ring marking the zone boundary */}
            <mesh ref={ringRef} position={[center.x, 0.02, center.z]} rotation={[-Math.PI / 2, 0, 0]}>
                <ringGeometry args={[ZONE_LABEL_DIST - 0.6, ZONE_LABEL_DIST, 64]} />
                <meshBasicMaterial color={0xffffff} transparent opacity={0.12} depthWrite={false} side={THREE.DoubleSide} />
            </mesh>
            {/* small pulsing dot at center so the zone is visible from far away */}
            <mesh ref={dotRef} position={[center.x, 0.03, center.z]} rotation={[-Math.PI / 2, 0, 0]}>
                <circleGeometry args={[0.6, 32]} />
                <meshBasicMaterial color={0xffffff} transparent opacity={0.25} depthWrite={false} />
            </mesh>
        </group>
    )
}

// ── Atmosphere blender ────────────────────────────────────────────────────────
// Reads each zone's worldState, blends via inverse-distance from the player,
// and lerps the scene background + scene lights every frame.

// Below this distance from the nearest zone, that zone's atmosphere is at full
// strength; beyond it, the hub fades to a neutral default instead of averaging
// all the zones together (which produced a washed-out, "abnormal" colour in
// the middle of the ring where every zone is roughly equidistant).
const ZONE_FULL_DIST  = 16
const ZONE_FADE_DIST  = 32

function AtmosphereBlender({ docs, artists, zoneCenters, playerRef, ambientRef, dirRef }) {
    const { scene } = useThree()
    const currentBg = useRef(new THREE.Color(DEFAULT_BG))

    useFrame(() => {
        const player = playerRef.current
        if (!player) return

        let totalW = 0
        let nearestD2 = Infinity
        const weights = zoneCenters.map((center) => {
            const dx = center.x - player.x
            const dz = center.z - player.z
            const d2 = dx * dx + dz * dz
            if (d2 < nearestD2) nearestD2 = d2
            // +400 flattens the influence curve so there's no hard "home" zone at the center
            const w = 1 / (d2 + 400)
            totalW += w
            return w
        })

        let r = 0, g = 0, b = 0
        let aR = 0, aG = 0, aB = 0, aI = 0
        let dR = 0, dG = 0, dB = 0, dI = 0

        for (let i = 0; i < artists.length; i++) {
            const w  = weights[i] / totalW
            const ws = docs[artists[i].id]?.worldState || {}
            const bg  = ws.backgroundColor || DEFAULT_BG
            const amb = ws.ambientLight    || DEFAULT_AMBIENT
            const dir = ws.directionalLight || DEFAULT_DIR

            tmpColor.set(bg);   r += tmpColor.r * w; g += tmpColor.g * w; b += tmpColor.b * w
            tmpColorB.set(amb.color || '#ffffff')
            aR += tmpColorB.r * w; aG += tmpColorB.g * w; aB += tmpColorB.b * w
            aI += (amb.intensity ?? 0.85) * w
            tmpColor.set(dir.color || '#fff7ea')
            dR += tmpColor.r * w; dG += tmpColor.g * w; dB += tmpColor.b * w
            dI += (dir.intensity ?? 1.15) * w
        }

        const nearestD = Math.sqrt(nearestD2)
        const zoneStrength = THREE.MathUtils.clamp(1 - (nearestD - ZONE_FULL_DIST) / (ZONE_FADE_DIST - ZONE_FULL_DIST), 0, 1)

        tmpColorB.setRGB(r, g, b)
        tmpColorC.copy(defaultBgColor).lerp(tmpColorB, zoneStrength)
        currentBg.current.lerp(tmpColorC, 0.04)
        if (scene.background instanceof THREE.Color) scene.background.copy(currentBg.current)
        if (scene.fog) scene.fog.color.copy(currentBg.current)

        if (ambientRef.current) {
            tmpColorD.setRGB(aR, aG, aB)
            tmpColorC.copy(defaultAmbColor).lerp(tmpColorD, zoneStrength)
            ambientRef.current.color.copy(tmpColorC)
            ambientRef.current.intensity = THREE.MathUtils.lerp(DEFAULT_AMBIENT.intensity, aI, zoneStrength)
        }
        if (dirRef.current) {
            tmpColorD.setRGB(dR, dG, dB)
            tmpColorC.copy(defaultDirColor).lerp(tmpColorD, zoneStrength)
            dirRef.current.color.copy(tmpColorC)
            dirRef.current.intensity = THREE.MathUtils.lerp(DEFAULT_DIR.intensity, dI, zoneStrength)
        }
    })

    return null
}

// ── Ambient particle field (ring-distributed) ─────────────────────────────────

function AmbientField({ fieldRadius = RING_RADIUS }) {
    const pointsRef = useRef(null)
    const [geometry, setGeometry] = useState(null)

    useEffect(() => {
        const positions = new Float32Array(PARTICLE_COUNT * 3)
        for (let i = 0; i < PARTICLE_COUNT; i++) {
            const angle  = (i / PARTICLE_COUNT) * Math.PI * 2 + Math.random() * 0.4
            const radius = (0.2 + Math.random() * 1.1) * fieldRadius
            positions[i * 3]     = Math.cos(angle) * radius
            positions[i * 3 + 1] = (Math.random() - 0.5) * 14 + 3
            positions[i * 3 + 2] = Math.sin(angle) * radius
        }
        const geo = new THREE.BufferGeometry()
        geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
        setGeometry(geo)
        return () => geo.dispose()
    }, [fieldRadius])

    useFrame((state) => {
        if (pointsRef.current) pointsRef.current.rotation.y = state.clock.getElapsedTime() * 0.006
    })

    if (!geometry) return null
    return (
        <points ref={pointsRef} geometry={geometry}>
            <pointsMaterial color={0xffffff} size={0.035} transparent opacity={0.22} depthWrite={false} sizeAttenuation />
        </points>
    )
}

// ── Walker ────────────────────────────────────────────────────────────────────

function Walker({ playerRef, onNearestZone, joystickRef, joyVisRef, joyThumbRef, vertTouchRef, onLockChange, flyMode, zoneCenters, artists, boundsHalf, isArActive, arTouchElRef }) {
    const { camera, gl } = useThree()
    // During an XR session the camera pose is owned by the headset/phone and
    // locomotion runs through XROrigin (see XrLocomotion). Walker must NOT write
    // camera.position/lookAt then, or it yanks the camera back to the flat-screen
    // player pose every frame, fighting head-tracking and XROrigin movement.
    const isPresenting = useXR((state) => state.session != null)
    const keysRef      = useRef(new Set())
    const speedRef     = useRef(0)
    const strafeSpeedRef = useRef(0)
    const bobRef       = useRef(0)
    const lockedRef    = useRef(false)
    const touchLookRef = useRef(null)
    const touchMoveRef = useRef(null)
    const joyBaseRef   = useRef({ x: 0, y: 0 })
    const lockCbRef    = useRef(onLockChange)
    lockCbRef.current  = onLockChange
    const flyRef       = useRef(flyMode)
    flyRef.current      = flyMode

    useEffect(() => {
        const keys     = keysRef.current
        const moveKeys = ['w','a','s','d','arrowup','arrowdown','arrowleft','arrowright',' ','q','e','c']
        const dn = (e) => {
            const k = e.key.toLowerCase()
            if (!moveKeys.includes(k)) return
            if (k === ' ') e.preventDefault()
            keys.add(k)
        }
        const up = (e) => keys.delete(e.key.toLowerCase())
        window.addEventListener('keydown', dn)
        window.addEventListener('keyup', up)
        return () => { window.removeEventListener('keydown', dn); window.removeEventListener('keyup', up); keys.clear() }
    }, [])

    useEffect(() => {
        // During a handheld AR session, only the WebXR dom-overlay root (and its
        // descendants) reliably receives input -- the page's own canvas does not.
        // Attach touch handling to the dedicated overlay element instead when AR
        // is active, mirroring LiveProjectScene.
        const el     = (isArActive && arTouchElRef?.current) || gl.domElement
        const player = playerRef.current
        const isTouch = isArActive || window.matchMedia('(pointer: coarse)').matches

        if (!isTouch) {
            const onLockChange = () => {
                const locked = document.pointerLockElement === el
                lockedRef.current = locked
                el.style.cursor = locked ? 'none' : 'crosshair'
                lockCbRef.current?.(locked)
            }
            const onDown  = () => { if (!lockedRef.current) el.requestPointerLock() }
            const onMove  = (e) => {
                if (!lockedRef.current) return
                const pitchLimit = flyRef.current ? FLY_PITCH_LIMIT : WALK_PITCH_LIMIT
                player.yaw -= e.movementX * PTR_SENSITIVITY
                player.pitch = THREE.MathUtils.clamp(player.pitch - e.movementY * PTR_SENSITIVITY, -pitchLimit, pitchLimit)
            }
            el.style.cursor = 'crosshair'
            el.addEventListener('pointerdown', onDown)
            document.addEventListener('pointerlockchange', onLockChange)
            document.addEventListener('mousemove', onMove)
            return () => {
                if (document.pointerLockElement === el) document.exitPointerLock()
                el.style.cursor = ''
                el.removeEventListener('pointerdown', onDown)
                document.removeEventListener('pointerlockchange', onLockChange)
                document.removeEventListener('mousemove', onMove)
            }
        } else {
            // Floating joystick: touching the left half spawns it at the touch
            // point (no fixed dead zone); right half is always look.
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
            const ts = (e) => {
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
            const tm = (e) => {
                e.preventDefault()
                for (const t of e.changedTouches) {
                    if (touchMoveRef.current?.id === t.identifier) {
                        updateJoy(t.clientX, t.clientY)
                    } else if (touchLookRef.current?.id === t.identifier) {
                        const pitchLimit = flyRef.current ? FLY_PITCH_LIMIT : WALK_PITCH_LIMIT
                        player.yaw -= (t.clientX - touchLookRef.current.lastX) * TOUCH_SENSITIVITY
                        player.pitch = THREE.MathUtils.clamp(player.pitch - (t.clientY - touchLookRef.current.lastY) * TOUCH_SENSITIVITY, -pitchLimit, pitchLimit)
                        touchLookRef.current.lastX = t.clientX
                        touchLookRef.current.lastY = t.clientY
                    }
                }
            }
            const te = (e) => {
                for (const t of e.changedTouches) {
                    if (touchMoveRef.current?.id === t.identifier) { touchMoveRef.current = null; hideJoy() }
                    else if (touchLookRef.current?.id === t.identifier) touchLookRef.current = null
                }
            }
            el.addEventListener('touchstart', ts, { passive: false })
            el.addEventListener('touchmove',  tm, { passive: false })
            el.addEventListener('touchend',   te)
            el.addEventListener('touchcancel',te)
            return () => {
                el.removeEventListener('touchstart', ts)
                el.removeEventListener('touchmove',  tm)
                el.removeEventListener('touchend',   te)
                el.removeEventListener('touchcancel',te)
            }
        }
    }, [gl, playerRef, joystickRef, joyVisRef, joyThumbRef, isArActive, arTouchElRef])

    useFrame((_, delta) => {
        // XrLocomotion owns movement + camera during a session.
        if (isPresenting) return
        const keys   = keysRef.current
        const player = playerRef.current
        const joy    = joystickRef?.current || { x: 0, y: 0 }
        const fly    = flyRef.current
        if (player.pitch === undefined) player.pitch = 0
        if (player.altY === undefined) player.altY = EYE_HEIGHT

        // Only arrow keys (and mouse/touch drag, and the joystick's x axis)
        // turn the camera -- A/D strafe sideways instead, matching the FPS
        // convention most people expect rather than a tank-style turn.
        let turn = 0
        if (keys.has('arrowleft'))  turn += 1
        if (keys.has('arrowright')) turn -= 1
        turn -= joy.x
        player.yaw += turn * TURN_SPEED * delta

        let fwd = 0
        if (keys.has('w') || keys.has('arrowup'))   fwd += 1
        if (keys.has('s') || keys.has('arrowdown')) fwd -= 1
        fwd -= joy.y

        let strafe = 0
        if (keys.has('d')) strafe += 1
        if (keys.has('a')) strafe -= 1

        let vert = 0
        if (fly) {
            if (keys.has(' ') || keys.has('q')) vert += 1
            if (keys.has('e') || keys.has('c')) vert -= 1
            vert += vertTouchRef?.current || 0
        }

        const targetSpeed = fwd * WALK_MAX_SPEED
        const accel = fwd !== 0 ? WALK_ACCEL : WALK_FRICTION
        speedRef.current += THREE.MathUtils.clamp(targetSpeed - speedRef.current, -accel * delta, accel * delta)
        if (Math.abs(speedRef.current) < 0.001) speedRef.current = 0

        const targetStrafeSpeed = strafe * WALK_MAX_SPEED
        const strafeAccel = strafe !== 0 ? WALK_ACCEL : WALK_FRICTION
        strafeSpeedRef.current += THREE.MathUtils.clamp(targetStrafeSpeed - strafeSpeedRef.current, -strafeAccel * delta, strafeAccel * delta)
        if (Math.abs(strafeSpeedRef.current) < 0.001) strafeSpeedRef.current = 0

        const bound = fly ? 400 : (boundsHalf ?? BOUNDS_HALF)

        if (speedRef.current !== 0 || strafeSpeedRef.current !== 0) {
            // Forward/strafe always move on the horizontal plane, even while
            // flying -- like a drone, not a jet. Looking down to film the
            // ground below shouldn't also make you descend; altitude only
            // ever changes explicitly, via Space/Q (up) and C/E (down).
            const forwardX = Math.sin(player.yaw) * speedRef.current
            const forwardZ = Math.cos(player.yaw) * speedRef.current
            const rightX = -Math.cos(player.yaw) * strafeSpeedRef.current
            const rightZ = Math.sin(player.yaw) * strafeSpeedRef.current
            player.x = THREE.MathUtils.clamp(player.x + (forwardX + rightX) * delta, -bound, bound)
            player.z = THREE.MathUtils.clamp(player.z + (forwardZ + rightZ) * delta, -bound, bound)
            bobRef.current += delta * Math.hypot(speedRef.current, strafeSpeedRef.current) * (fly ? 0 : 1.8)
        }
        if (fly && vert !== 0) {
            player.altY = THREE.MathUtils.clamp(player.altY + vert * FLY_SPEED * delta, -2, 60)
        }
        if (!fly) {
            player.altY = THREE.MathUtils.lerp(player.altY, EYE_HEIGHT, Math.min(1, delta * 3))
        }

        const bob     = fly ? 0 : Math.sin(bobRef.current) * 0.05 * Math.min(1, Math.hypot(speedRef.current, strafeSpeedRef.current) / WALK_MAX_SPEED)
        const lookDir = tmpVec.set(
            Math.sin(player.yaw) * Math.cos(player.pitch),
            Math.sin(player.pitch),
            Math.cos(player.yaw) * Math.cos(player.pitch),
        )
        camera.position.set(player.x, player.altY + bob, player.z)
        tmpLook.set(player.x + lookDir.x, player.altY + bob + lookDir.y, player.z + lookDir.z)
        camera.lookAt(tmpLook)

        if (onNearestZone) {
            let nearest = -1
            let nearestD = Infinity
            for (let i = 0; i < zoneCenters.length; i++) {
                const dx = zoneCenters[i].x - player.x
                const dz = zoneCenters[i].z - player.z
                const d2 = dx * dx + dz * dz
                if (d2 < nearestD) { nearestD = d2; nearest = i }
            }
            onNearestZone(nearestD < ZONE_LABEL_DIST * ZONE_LABEL_DIST ? artists[nearest]?.title : null)
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
function XrLocomotion({ playerRef, joystickRef }) {
    const originRef = useRef(null)
    const isPresenting = useXR((state) => state.session != null)
    const wasPresentingRef = useRef(false)

    useXRControllerLocomotion(
        originRef,
        { speed: WALK_MAX_SPEED },
        { type: 'smooth', speed: TURN_SPEED }
    )

    useFrame((_, delta) => {
        const origin = originRef.current
        if (!origin) return
        const player = playerRef.current

        if (isPresenting && !wasPresentingRef.current) {
            origin.position.set(player.x, 0, player.z)
            origin.rotation.set(0, player.yaw, 0)
        }
        wasPresentingRef.current = isPresenting

        if (isPresenting) {
            // Handheld AR has no controllers, so useXRControllerLocomotion does
            // nothing there. Drive the same XROrigin from the touch joystick:
            // joy.x turns, joy.y moves forward along that virtual yaw (the phone
            // IMU still controls look on top of this -- same as walk mode).
            const joy = joystickRef?.current
            if (joy && (Math.abs(joy.x) > 0.05 || Math.abs(joy.y) > 0.05)) {
                origin.rotation.y -= joy.x * TURN_SPEED * delta
                const fwd = -joy.y * WALK_MAX_SPEED * delta
                origin.position.x += Math.sin(origin.rotation.y) * fwd
                origin.position.z += Math.cos(origin.rotation.y) * fwd
            }

            player.x = origin.position.x
            player.z = origin.position.z
            player.yaw = origin.rotation.y
        }
    })

    return <XROrigin ref={originRef} />
}

// ── Mobile joystick (purely visual — Walker owns all touch handling so it can
// arbitrate floating-joystick vs. look touches on the same canvas) ───────────

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

// ── Multi-project live-sync hook ──────────────────────────────────────────────
// HTTP-only: loads all 10 docs in parallel on mount, refreshes every 60 s.
// SSE is intentionally omitted — the exhibition is read-only during the event,
// and 10 persistent SSE connections compete with the 10 HTTP GETs for the
// browser's 6-connection-per-origin limit, leaving 3–4 zones stuck forever.

function useWccProjectDocuments(ids) {
    const [docs, setDocs] = useState(() => Object.fromEntries(ids.map((id) => [id, null])))
    const docRefs = useRef(Object.fromEntries(ids.map((id) => [id, null])))

    useEffect(() => {
        let cancelled = false
        docRefs.current = Object.fromEntries(ids.map((id) => [id, null]))
        setDocs(Object.fromEntries(ids.map((id) => [id, null])))

        const setDoc = (id, doc) => {
            docRefs.current[id] = doc
            setDocs((prev) => ({ ...prev, [id]: doc }))
        }

        const load = async (id) => {
            try {
                const res = await getProjectDocument(id)
                if (cancelled) return
                setDoc(id, normalizeProjectDocument(res?.document || res || {}))
            } catch {
                if (!cancelled) setDoc(id, normalizeProjectDocument({}))
            }
        }

        const loadAll = () => { if (!cancelled) ids.forEach((id) => void load(id)) }

        ensureGuestSession().then(() => { if (!cancelled) loadAll() })

        const interval = setInterval(loadAll, 60_000)
        return () => { cancelled = true; clearInterval(interval) }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [ids.join(',')])

    return docs
}

// ── Main component ────────────────────────────────────────────────────────────

export default function WccExhibition({ onExit }) {
    // Always the full 10-artist ring — "Enter space" for a single artist now
    // routes to LiveProjectScene with their own project instead (see
    // WccExperience.jsx), so this component is exhibition-only.
    const docs          = useWccProjectDocuments(ARTIST_IDS)
    const mainDocs      = useWccProjectDocuments(MAIN_DOC_IDS)
    const mainDoc       = mainDocs[MAIN_PROJECT_ID]
    const [label, setLabel]     = useState(null)
    const [isLocked, setLocked] = useState(false)
    const [isMobile]  = useState(() => typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches)
    const [flyMode, setFlyMode] = useState(false)
    const joystickRef  = useRef({ x: 0, y: 0 })
    const joyVisRef    = useRef(null)
    const joyThumbRef  = useRef(null)
    // Fly mode's altitude keys (Space/Q up, C/E down) have no touch
    // equivalent -- without this, mobile fly has no way to ascend/descend at all.
    const vertTouchRef = useRef(0)
    const arTouchElRef = useRef(null)
    const ambientRef  = useRef(null)
    const dirRef      = useRef(null)

    const playerRef = useRef({ x: 0, z: 0, yaw: 0, pitch: 0, altY: EYE_HEIGHT })

    useEffect(() => {
        const onKey = (e) => { if (e.key.toLowerCase() === 'f') setFlyMode((f) => !f) }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
    }, [])

    const xr = useXrAr()
    const isArActive = xr.isArModeActive && xr.isXrPresenting
    const loadedCount = Object.values(docs).filter(Boolean).length
    const allLoaded   = loadedCount === ARTISTS.length

    // The library only toggles display:block/none on the dom-overlay root -- it
    // has no inherent size/position, so anything portaled into it (the touch
    // surface, joystick, buttons) has no positioning context without this.
    useEffect(() => {
        const root = xr.domOverlayRoot
        if (!root) return
        Object.assign(root.style, { position: 'fixed', inset: '0', width: '100%', height: '100%' })
    }, [xr.domOverlayRoot])

    return (
        <div className="wcc-scene">
            <Canvas
                className="live-scene-canvas"
                camera={{ position: [0, EYE_HEIGHT, 0], fov: 60, near: 0.1, far: 300 }}
                dpr={[1, 1.8]}
                gl={{ antialias: true }}
                style={{ position: 'absolute', inset: 0, display: 'block', touchAction: 'none' }}
            >
                <XR store={xr.xrStore}>
                <color attach="background" args={[DEFAULT_BG]} />
                <fog attach="fog" args={[DEFAULT_BG, 10, 110]} />
                <ambientLight ref={ambientRef} color={DEFAULT_AMBIENT.color} intensity={DEFAULT_AMBIENT.intensity} />
                <directionalLight ref={dirRef} color={DEFAULT_DIR.color} intensity={DEFAULT_DIR.intensity} position={DEFAULT_DIR.position} />
                <Grid args={[240, 240]} cellColor="#2a3038" sectionColor="#3c4654" fadeDistance={70} infiniteGrid />
                <HubMarker />
                {mainDoc ? <ZoneGroup artist={{ id: MAIN_PROJECT_ID }} doc={mainDoc} center={HUB_CENTER} showRing={false} /> : null}
                <HubSpokes zoneCenters={ZONE_CENTERS_RING} />
                {ARTISTS.map((artist, i) => (
                    <ZonePortal key={artist.id} artist={artist} center={ZONE_CENTERS_RING[i]} />
                ))}
                <AmbientField fieldRadius={RING_RADIUS} />
                <AtmosphereBlender docs={docs} artists={ARTISTS} zoneCenters={ZONE_CENTERS_RING} playerRef={playerRef} ambientRef={ambientRef} dirRef={dirRef} />
                <Walker
                    playerRef={playerRef}
                    onNearestZone={setLabel}
                    joystickRef={joystickRef}
                    joyVisRef={joyVisRef}
                    joyThumbRef={joyThumbRef}
                    vertTouchRef={vertTouchRef}
                    onLockChange={setLocked}
                    flyMode={flyMode}
                    zoneCenters={ZONE_CENTERS_RING}
                    artists={ARTISTS}
                    boundsHalf={BOUNDS_HALF}
                    isArActive={isArActive}
                    arTouchElRef={arTouchElRef}
                />
                {ARTISTS.map((artist, i) => {
                    const doc = docs[artist.id]
                    if (!doc) return <ZonePlaceholder key={artist.id} center={ZONE_CENTERS_RING[i]} />
                    return (
                        <ZoneGroup
                            key={artist.id}
                            artist={artist}
                            doc={doc}
                            center={ZONE_CENTERS_RING[i]}
                        />
                    )
                })}
                <XrLocomotion playerRef={playerRef} joystickRef={joystickRef} />
                </XR>
            </Canvas>

            <div style={{
                position: 'absolute', top: 0, left: 0, right: 0, height: 2,
                zIndex: 20, pointerEvents: 'none',
                opacity: allLoaded ? 0 : 1,
                transition: 'opacity 0.8s ease',
            }}>
                <div style={{
                    height: '100%',
                    width: `${(loadedCount / ARTISTS.length) * 100}%`,
                    background: '#d90000',
                    transition: 'width 0.4s ease',
                    boxShadow: '0 0 6px rgba(217,0,0,0.8)',
                }} />
            </div>

            <header className="live-scene-chrome">
                <button type="button" className="live-scene-exit" onClick={onExit}>← Exit</button>
                <span className="live-scene-title">
                    WCC · Women Creating Change{label ? ` · ${label}` : ''}
                </span>
            </header>

            {!isMobile && !isLocked && (
                <p className="live-scene-hint live-scene-hint--lock">Click to explore</p>
            )}
            {!isMobile && isLocked && (
                <p className="live-scene-hint">
                    WASD · move &nbsp;·&nbsp; Mouse · look &nbsp;·&nbsp; F · {flyMode ? 'walk' : 'fly'}
                    {flyMode ? <>&nbsp;·&nbsp; Space/Q · up &nbsp;·&nbsp; C/E · down</> : null}
                    &nbsp;·&nbsp; ESC · release
                </p>
            )}
            {(() => {
                const controlsUI = (
                    <>
                        {isMobile && <MobileJoystick outerRef={joyVisRef} thumbRef={joyThumbRef} />}
                        {isMobile && flyMode && <VerticalTouchControls vertTouchRef={vertTouchRef} />}
                        <button
                            type="button"
                            className={`live-scene-fly-btn${flyMode ? ' active' : ''}`}
                            onClick={() => setFlyMode((f) => !f)}
                        >
                            {flyMode ? 'Walk' : 'Fly'}
                        </button>
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

                // Normal page DOM isn't composited during a handheld AR session --
                // only the WebXR dom-overlay root is. Portal the same controls (plus
                // a full-viewport element for Walker to receive touches on) into it
                // whenever AR is active, matching LiveProjectScene.
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
        </div>
    )
}
