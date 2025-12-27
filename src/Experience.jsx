import { OrbitControls, Grid, Plane, Html } from '@react-three/drei'
import { useThree, useFrame } from '@react-three/fiber'
import { TeleportTarget, useXR, useXRControllerLocomotion, useXREvent, XROrigin } from '@react-three/xr'
import { Perf } from 'r3f-perf'
import { useContext, useCallback, useRef, useEffect, useState } from 'react'
import * as THREE from 'three'
import { AppContext } from './AppContext.js'
import SelectableObject from './SelectableObject.jsx'
import MultiSelectionControls from './MultiSelectionControls.jsx'

const clamp = (value, min, max) => Math.min(max, Math.max(min, value))

export default function Experience() {
    const {
        objects,
        selectedObjectId,
        selectedObjectIds,
        clearSelection,
        setMenu,
        isPerfVisible,
        backgroundColor,
        gridSize,
        controlsRef,
        isGridVisible,
        isGizmoVisible,
        gridAppearance,
        xrOriginPosition,
        setXrOriginPosition,
        ambientLight,
        directionalLight,
        selectObject,
        arAnchorTransform,
        setArAnchorTransform,
        arPreviewScale,
        arPreviewOffset
    } = useContext(AppContext)

    const { gl, camera } = useThree()
    const isXrPresenting = useXR((state) => state.session != null)
    const isArMode = useXR((state) => state.mode === 'immersive-ar')
    const simpleArMode = true
    const [isHitTestReady, setIsHitTestReady] = useState(false)
    const xrOriginRef = useRef()
    const anchorGroupRef = useRef()
    const contentGroupRef = useRef()
    const previewGroupRef = useRef()
    const reticleRef = useRef(null)
    const hitTestSourceRef = useRef(null)
    const viewerSpaceRef = useRef(null)
    const reticleSamplesRef = useRef([])
    const reticlePoseRef = useRef({
        position: new THREE.Vector3(),
        quaternion: new THREE.Quaternion()
    })
    const autoAnchorQueuedRef = useRef(false)
    const joystickPadRef = useRef(null)
    const joystickPointerRef = useRef(null)
    const joystickAnchorStartRef = useRef(new THREE.Vector3())
    const joystickOffsetRef = useRef({ x: 0, y: 0 })
    const [joystickOffset, setJoystickOffset] = useState({ x: 0, y: 0 })
    const [arWorldScale, setArWorldScale] = useState(1)

    const cleanupHitTest = useCallback(() => {
        hitTestSourceRef.current?.cancel?.()
        hitTestSourceRef.current = null
        viewerSpaceRef.current = null
        reticleSamplesRef.current = []
        setIsHitTestReady(false)
        if (reticleRef.current) reticleRef.current.visible = false
        if (previewGroupRef.current) previewGroupRef.current.visible = false
    }, [])

    useXRControllerLocomotion(
        xrOriginRef,
        isXrPresenting ? { speed: 3 } : false,
        isXrPresenting ? { type: 'snap', degrees: 30, deadZone: 0.25 } : false,
        'left'
    )

    useEffect(() => {
        if (xrOriginRef.current) {
            xrOriginRef.current.position.set(...xrOriginPosition)
        }
    }, [xrOriginPosition, isXrPresenting])

    useEffect(() => {
        if (isXrPresenting || !xrOriginRef.current) return
        const { x, y, z } = xrOriginRef.current.position
        setXrOriginPosition([x, y, z])
    }, [isXrPresenting, setXrOriginPosition])

    const handleTeleport = useCallback((point, event) => {
        if (!point) return
        if (event) {
            // Ignore non-teleport pointers unless it's an AR screen tap
            const pointerType = event.pointerType || ''
            const targetRayMode = event.nativeEvent?.inputSource?.targetRayMode
            const isTeleportPointer = pointerType.includes('teleport')
            const isScreenPointer = pointerType.startsWith('screen-') || targetRayMode === 'screen'
            const isArScreenTap = isArMode && (isScreenPointer || pointerType === 'ray')
            if (!isTeleportPointer && !isArScreenTap) return
        }
        if (isArMode) {
            // Move the anchored scene to the tapped point
            setArAnchorTransform({
                anchored: true,
                position: [point.x, point.y, point.z],
                quaternion: [0, 0, 0, 1]
            })
            return
        }
        if (simpleArMode) return
        setMenu((prev) => prev.visible ? { ...prev, visible: false } : prev)
        clearSelection()
        const destination = [point.x, point.y, point.z]
        setXrOriginPosition(destination)
        if (xrOriginRef.current) {
            xrOriginRef.current.position.set(...destination)
        }
    }, [clearSelection, isArMode, setArAnchorTransform, setMenu, setXrOriginPosition])

    useEffect(() => {
        // Two-finger pan to slide the anchored world on the ground plane (mobile AR).
        if (!isArMode || !arAnchorTransform.anchored || !camera || !camera.matrixWorld) return
        const pointers = new Map()
        const startCenter = { x: 0, y: 0 }
        const startPos = new THREE.Vector3()
        const startPinch = { distance: 0, scale: 1 }

        const updateOrigin = () => {
            if (pointers.size !== 2) return
            if (!camera?.matrixWorld) return
            const pts = Array.from(pointers.values())
            const center = {
                x: (pts[0].x + pts[1].x) / 2,
                y: (pts[0].y + pts[1].y) / 2
            }
            const dx = (center.x - startCenter.x) * 0.0025
            const dy = (center.y - startCenter.y) * 0.0025

            const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0)
            const forward = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 2).negate()
            forward.y = 0
            forward.normalize()

            const next = startPos.clone()
                .addScaledVector(right, dx)
                .addScaledVector(forward, dy)

            setArAnchorTransform((prev) => ({
                ...prev,
                position: [next.x, next.y, next.z]
            }))

            if (startPinch.distance > 0) {
                const dxPinch = pts[0].x - pts[1].x
                const dyPinch = pts[0].y - pts[1].y
                const currentDistance = Math.hypot(dxPinch, dyPinch)
                if (currentDistance > 0) {
                    const nextScale = clamp(startPinch.scale * (currentDistance / startPinch.distance), 0.25, 3)
                    setArWorldScale(nextScale)
                }
            }
        }

        const handleDown = (event) => {
            const type = event.pointerType
            // Accept mobile AR screen events that may report as 'touch', 'screen', or be undefined.
            if (type && type !== 'touch' && !type.startsWith?.('screen')) return
            pointers.set(event.pointerId, { x: event.clientX, y: event.clientY })
            if (pointers.size === 2) {
                const pts = Array.from(pointers.values())
                startCenter.x = (pts[0].x + pts[1].x) / 2
                startCenter.y = (pts[0].y + pts[1].y) / 2
                startPos.set(...arAnchorTransform.position)
                const dxPinch = pts[0].x - pts[1].x
                const dyPinch = pts[0].y - pts[1].y
                startPinch.distance = Math.hypot(dxPinch, dyPinch)
                startPinch.scale = arWorldScale
            }
        }

        const handleMove = (event) => {
            if (!pointers.has(event.pointerId)) return
            pointers.set(event.pointerId, { x: event.clientX, y: event.clientY })
            if (pointers.size === 2) {
                event.preventDefault()
                updateOrigin()
            }
        }

        const handleUp = (event) => {
            pointers.delete(event.pointerId)
        }

        window.addEventListener('pointerdown', handleDown, { passive: false })
        window.addEventListener('pointermove', handleMove, { passive: false })
        window.addEventListener('pointerup', handleUp)
        window.addEventListener('pointercancel', handleUp)

        return () => {
            window.removeEventListener('pointerdown', handleDown)
            window.removeEventListener('pointermove', handleMove)
            window.removeEventListener('pointerup', handleUp)
            window.removeEventListener('pointercancel', handleUp)
        }
    }, [arAnchorTransform.anchored, arAnchorTransform.position, arWorldScale, camera, isArMode, setArAnchorTransform])

    const applyJoystickDelta = useCallback((dx, dy) => {
        if (!camera?.matrixWorld || !arAnchorTransform.anchored) return
        const strength = 0.0025
        const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0)
        const forward = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 2).negate()
        forward.y = 0
        forward.normalize()

        const start = joystickAnchorStartRef.current.clone()
        const next = start
            .addScaledVector(right, dx * strength)
            .addScaledVector(forward, -dy * strength) // up = forward

        setArAnchorTransform((prev) => ({
            ...prev,
            position: [next.x, next.y, next.z]
        }))
    }, [arAnchorTransform.anchored, camera?.matrixWorld, setArAnchorTransform])

    const handleJoystickStart = useCallback((event) => {
        if (!joystickPadRef.current || !arAnchorTransform.anchored) return
        joystickPointerRef.current = event.pointerId
        const rect = joystickPadRef.current.getBoundingClientRect()
        const center = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
        joystickAnchorStartRef.current.set(...arAnchorTransform.position)
        joystickOffsetRef.current = { x: 0, y: 0 }
        setJoystickOffset({ x: 0, y: 0 })

        const move = (e) => {
            if (joystickPointerRef.current !== e.pointerId) return
            const dx = e.clientX - center.x
            const dy = e.clientY - center.y
            const radius = rect.width / 2
            const clampedLen = Math.min(Math.hypot(dx, dy), radius)
            const angle = Math.atan2(dy, dx)
            const clampedX = Math.cos(angle) * clampedLen
            const clampedY = Math.sin(angle) * clampedLen
            joystickOffsetRef.current = { x: clampedX, y: clampedY }
            setJoystickOffset({ x: clampedX, y: clampedY })
            applyJoystickDelta(clampedX, clampedY)
            e.preventDefault()
        }

        const end = (e) => {
            if (joystickPointerRef.current !== e.pointerId) return
            joystickPointerRef.current = null
            joystickOffsetRef.current = { x: 0, y: 0 }
            setJoystickOffset({ x: 0, y: 0 })
            window.removeEventListener('pointermove', move)
            window.removeEventListener('pointerup', end)
            window.removeEventListener('pointercancel', end)
        }

        window.addEventListener('pointermove', move, { passive: false })
        window.addEventListener('pointerup', end)
        window.addEventListener('pointercancel', end)
    }, [applyJoystickDelta, arAnchorTransform.anchored, arAnchorTransform.position])

    const hasMultiSelection = selectedObjectIds.length > 1
    const showPreview = isArMode && !simpleArMode && !arAnchorTransform.anchored && isHitTestReady

    useEffect(() => {
        if (!anchorGroupRef.current) return
        anchorGroupRef.current.position.set(...arAnchorTransform.position)
        anchorGroupRef.current.quaternion.set(...arAnchorTransform.quaternion)
        anchorGroupRef.current.visible = !isArMode || arAnchorTransform.anchored
    }, [arAnchorTransform, isArMode])

    useEffect(() => {
        const contentGroup = contentGroupRef.current
        if (!contentGroup) return
        const scale = isArMode ? arWorldScale : 1
        contentGroup.scale.set(scale, scale, scale)
        const offset = isArMode ? arPreviewOffset : [0, 0, 0]
        contentGroup.position.set(...offset)
    }, [arPreviewOffset, arWorldScale, isArMode])

    useEffect(() => {
        if (simpleArMode) return
        if (!isArMode || arAnchorTransform.anchored) {
            cleanupHitTest()
            return
        }
        const session = gl.xr?.getSession?.()
        if (!session?.requestReferenceSpace || !session.requestHitTestSource) {
            cleanupHitTest()
            return
        }
        let cancelled = false
        const setupHitTest = async () => {
            try {
                const viewerSpace = await session.requestReferenceSpace('viewer')
                const hitTestSource = await session.requestHitTestSource({ space: viewerSpace })
                if (cancelled) {
                    hitTestSource?.cancel?.()
                    return
                }
                viewerSpaceRef.current = viewerSpace
                hitTestSourceRef.current = hitTestSource
                setIsHitTestReady(true)
            } catch (error) {
                console.warn('AR hit-test setup failed', error)
                cleanupHitTest()
            }
        }
        setupHitTest()
        const handleSessionEnd = () => cleanupHitTest()
        session.addEventListener?.('end', handleSessionEnd)
        return () => {
            cancelled = true
            session.removeEventListener?.('end', handleSessionEnd)
            cleanupHitTest()
        }
    }, [arAnchorTransform.anchored, cleanupHitTest, gl, isArMode, simpleArMode])

    useEffect(() => {
        if (!isArMode || !arAnchorTransform.anchored) {
            autoAnchorQueuedRef.current = false
        }
    }, [arAnchorTransform.anchored, isArMode])

    useEffect(() => {
        // Classic AR: automatically anchor the scene as soon as AR starts, no tap/reticle required.
        if (!simpleArMode) return
        if (!isArMode || arAnchorTransform.anchored) return
        setArAnchorTransform({
            anchored: true,
            position: [0, 0, -1], // place content ~1m in front of the user
            quaternion: [0, 0, 0, 1]
        })
    }, [arAnchorTransform.anchored, isArMode, setArAnchorTransform])

    useFrame((state) => {
        if (simpleArMode || !isArMode || arAnchorTransform.anchored) {
            reticleSamplesRef.current = []
            if (reticleRef.current) reticleRef.current.visible = false
            if (previewGroupRef.current) previewGroupRef.current.visible = false
            return
        }
        const xrFrame = state.gl.xr?.getFrame?.()
        const hitTestSource = hitTestSourceRef.current
        const viewerSpace = viewerSpaceRef.current
        const referenceSpace = state.gl.xr?.getReferenceSpace?.()
        if (!xrFrame || !hitTestSource || !viewerSpace || !referenceSpace) return

        const results = xrFrame.getHitTestResults(hitTestSource)
        if (!results?.length) {
            if (reticleRef.current) reticleRef.current.visible = false
            if (previewGroupRef.current) previewGroupRef.current.visible = false
            return
        }
        const hitPose = results[0].getPose(referenceSpace)
        if (!hitPose) return
        const { position, orientation } = hitPose.transform
        reticlePoseRef.current.position.set(position.x, position.y, position.z)
        reticlePoseRef.current.quaternion.set(orientation.x, orientation.y, orientation.z, orientation.w)

        if (reticleRef.current) {
            reticleRef.current.position.copy(reticlePoseRef.current.position)
            reticleRef.current.quaternion.copy(reticlePoseRef.current.quaternion)
            reticleRef.current.visible = true
        }
        if (previewGroupRef.current) {
            const offset = new THREE.Vector3(...arPreviewOffset).applyQuaternion(reticlePoseRef.current.quaternion)
            previewGroupRef.current.position.copy(reticlePoseRef.current.position).add(offset)
            previewGroupRef.current.quaternion.copy(reticlePoseRef.current.quaternion)
            previewGroupRef.current.scale.set(arPreviewScale, arPreviewScale, arPreviewScale)
            previewGroupRef.current.visible = true
        }

        if (!autoAnchorQueuedRef.current && reticleRef.current?.visible && !arAnchorTransform.anchored) {
            autoAnchorQueuedRef.current = true
            const pos = reticlePoseRef.current.position
            const quat = reticlePoseRef.current.quaternion
            setArAnchorTransform({
                anchored: true,
                position: [pos.x, pos.y, pos.z],
                quaternion: [quat.x, quat.y, quat.z, quat.w]
            })
        }
    })

    useXREvent('select', () => {
        if (!isArMode || simpleArMode) return
        if (arAnchorTransform.anchored || !reticleRef.current || !reticleRef.current.visible) return
        const pos = reticlePoseRef.current.position
        const quat = reticlePoseRef.current.quaternion
        setArAnchorTransform({
            anchored: true,
            position: [pos.x, pos.y, pos.z],
            quaternion: [quat.x, quat.y, quat.z, quat.w]
        })
    }, [arAnchorTransform.anchored, isArMode, setArAnchorTransform, simpleArMode])

    return (
        <>
            {isPerfVisible && <Perf position="top-left" />}

            <XROrigin ref={xrOriginRef} disabled={!isXrPresenting} />

            {!isXrPresenting && camera && gl?.domElement && (
                <OrbitControls
                    ref={controlsRef}
                    args={[camera, gl.domElement]}
                    makeDefault
                    enabled={!isXrPresenting}
                    enableRotate
                    enablePan
                    enableZoom
                />
            )}

            <color args={[backgroundColor]} attach="background" />

            {isArMode && (
                <Html fullscreen zIndexRange={[10, 0]}>
                    <div style={{
                        position: 'absolute',
                        inset: 0,
                        pointerEvents: 'none'
                    }}>
                        <div
                            ref={joystickPadRef}
                            onPointerDown={handleJoystickStart}
                            style={{
                                position: 'absolute',
                                left: 16,
                                bottom: 16,
                                width: 120,
                                height: 120,
                                borderRadius: 60,
                                background: 'rgba(255,255,255,0.08)',
                                border: '1px solid rgba(255,255,255,0.2)',
                                backdropFilter: 'blur(8px)',
                                pointerEvents: 'auto',
                                touchAction: 'none',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center'
                            }}
                        >
                            <div style={{
                                width: 56,
                                height: 56,
                                borderRadius: 28,
                                background: 'rgba(255,255,255,0.18)',
                                border: '1px solid rgba(255,255,255,0.3)',
                                transform: `translate(${joystickOffset.x}px, ${joystickOffset.y}px)`,
                                transition: joystickPointerRef.current ? 'none' : 'transform 120ms ease-out'
                            }} />
                        </div>
                        <div
                            style={{
                                position: 'absolute',
                                right: 16,
                                bottom: 16,
                                width: 150,
                                padding: '10px 12px',
                                borderRadius: 12,
                                background: 'rgba(255,255,255,0.1)',
                                border: '1px solid rgba(255,255,255,0.2)',
                                backdropFilter: 'blur(8px)',
                                color: '#fff',
                                fontSize: 13,
                                fontWeight: 600,
                                pointerEvents: 'auto',
                                touchAction: 'none'
                            }}
                        >
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                                <span>Scale</span>
                                <span style={{ opacity: 0.8 }}>{arWorldScale.toFixed(2)}x</span>
                            </div>
                            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                                <button
                                    type="button"
                                    onClick={(e) => {
                                        e.preventDefault()
                                        setArWorldScale((prev) => clamp(prev * 0.9, 0.25, 3))
                                    }}
                                    style={{
                                        flex: 1,
                                        padding: '8px 0',
                                        borderRadius: 8,
                                        border: '1px solid rgba(255,255,255,0.25)',
                                        background: 'rgba(0,0,0,0.35)',
                                        color: '#fff',
                                        fontWeight: 700
                                    }}
                                >-</button>
                                <button
                                    type="button"
                                    onClick={(e) => {
                                        e.preventDefault()
                                        setArWorldScale((prev) => clamp(prev * 1.1, 0.25, 3))
                                    }}
                                    style={{
                                        flex: 1,
                                        padding: '8px 0',
                                        borderRadius: 8,
                                        border: '1px solid rgba(255,255,255,0.25)',
                                        background: 'rgba(0,0,0,0.35)',
                                        color: '#fff',
                                        fontWeight: 700
                                    }}
                                >+</button>
                            </div>
                        </div>
                    </div>
                </Html>
            )}

            {showPreview && (
                <group ref={previewGroupRef} visible={false}>
                    {objects.map((obj) => (
                        <SelectableObject
                            key={`ghost-${obj.id}`}
                            obj={obj}
                            ghostPreview
                        />
                    ))}
                </group>
            )}

            <group ref={anchorGroupRef}>
                <group ref={contentGroupRef}>
                    {isGridVisible && (
                        <Grid
                            args={[gridSize, gridSize]}
                            infiniteGrid={false}
                            position={[0, -(gridAppearance?.offset ?? 0.015), 0]}
                            cellSize={gridAppearance?.cellSize ?? 0.75}
                            cellThickness={gridAppearance?.cellThickness ?? 0.35}
                            sectionSize={gridAppearance?.sectionSize ?? 6}
                            sectionThickness={gridAppearance?.sectionThickness ?? 0.6}
                            fadeDistance={(gridAppearance?.fadeStrength ?? 0) > 0 ? (gridAppearance?.fadeDistance ?? 20) : 0}
                            fadeStrength={gridAppearance?.fadeStrength ?? 0}
                            sectionColor="#6a6a6a"
                            color="#909090"
                        />
                    )}

                    <TeleportTarget onTeleport={handleTeleport}>
                        <Plane
                            pointerEventsType={(pointer) => {
                                const type = pointer?.type
                                if (type === 'teleport') return true
                                if (!isArMode) return false
                                // Allow AR screen/touch rays to register on the ground plane
                                return type === 'ray' || type?.startsWith?.('screen-')
                            }}
                        args={[gridSize, gridSize]}
                        position={[0, gridAppearance?.offset ?? 0.01, 0]}
                        rotation-x={-Math.PI / 2}
                        material-transparent
                        material-opacity={0}
                        material-color="#000000"
                        onPointerDown={(event) => {
                            // Only clear selection when nothing is selected or gizmo is hidden,
                            // so clicks near the gizmo handles don't drop selection.
                            if (event.button === 0 && (!isGizmoVisible || selectedObjectIds.length === 0)) {
                                clearSelection()
                            }
                        }}
                        onDoubleClick={(event) => {
                            event.stopPropagation()
                                setMenu({
                                    visible: true,
                                    x: event.clientX,
                                    y: event.clientY,
                                    position3D: event.point
                                })
                            }}
                        />
                    </TeleportTarget>

                    {objects.map((obj) => {
                        const isSelected = selectedObjectIds.includes(obj.id)
                        const isPrimarySelected = selectedObjectId === obj.id
                        return (
                            <SelectableObject
                                key={obj.id}
                                obj={obj}
                                isSelected={isSelected}
                                isPrimarySelected={isPrimarySelected}
                                isMultiSelected={isSelected}
                                isMultiSelectMode={hasMultiSelection}
                                onSelect={selectObject}
                            />
                        )
                    })}

                    <MultiSelectionControls />

                    <ambientLight color={ambientLight.color} intensity={ambientLight.intensity} />
                    <directionalLight
                        position={directionalLight.position}
                        color={directionalLight.color}
                        intensity={directionalLight.intensity}
                    />

                    {arAnchorTransform.anchored && (
                        <group>
                            <gridHelper args={[1.5, 12, '#5555ff', '#5555ff']} position={[0, 0.002, 0]} />
                            <axesHelper args={[0.4]} />
                        </group>
                    )}
                </group>
            </group>

            <mesh ref={reticleRef} visible={false} rotation-x={-Math.PI / 2}>
                <ringGeometry args={[0.08, 0.105, 32]} />
                <meshBasicMaterial color="#00d4ff" transparent opacity={0.8} />
            </mesh>
        </>
    )
}
