import React, { useRef, useContext, useState, useEffect, useCallback } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { TransformControls } from '@react-three/drei'
import * as THREE from 'three'
import { SceneContext, UiContext, SceneSettingsContext, ActionsContext, RefsContext } from './contexts/AppContexts.js'
import { ObjectMap } from './objectComponents/ObjectMap.js'
import { evaluateExpressionString, getExpressionContext } from './utils/expressions.js'
import { frameSphereInControls, getObjectBoundingSphere } from './utils/cameraFraming.js'
import { createSingleObjectGizmoDragController } from './utils/singleObjectGizmoDrag.js'

const VECTOR_SIZE = 3
const CLICK_SELECTION_DELTA = 6
const POSITION_FALLBACK = [0, 0, 0]
const ROTATION_FALLBACK = [0, 0, 0]
const SCALE_FALLBACK = [1, 1, 1]

const hasVectorExpressions = (exprs = []) =>
    Array.isArray(exprs) && exprs.some((expr) => typeof expr === 'string' && expr.trim().length > 0)

const getComponentValue = (values, axis, fallback) => {
    if (Array.isArray(values)) {
        const numeric = Number(values[axis])
        if (Number.isFinite(numeric)) return numeric
    }
    return fallback[axis]
}

const applyVectorExpressions = (targetVector, baseValues, expressions, fallback, context) => {
    if (!targetVector || !hasVectorExpressions(expressions)) return false
    let applied = false
    for (let axis = 0; axis < VECTOR_SIZE; axis += 1) {
        const expr = expressions?.[axis]
        if (!expr) continue
        const resolved = evaluateExpressionString(expr, context)
        const safeValue = (typeof resolved === 'number' && Number.isFinite(resolved))
            ? resolved
            : getComponentValue(baseValues, axis, fallback)
        targetVector.setComponent(axis, safeValue)
        applied = true
    }
    return applied
}

const UnknownObject = () => (
    <mesh position-y={0.5}>
        <boxGeometry args={[1, 0.2, 1]} />
        <meshStandardMaterial color="red" />
    </mesh>
)

export default function SelectableObject({ obj, isSelected, isPrimarySelected = false, isMultiSelected = false, isMultiSelectMode = false, onSelect }) {
    const groupRef = useRef()
    const boxHelperRef = useRef(null)
    const boxRef = useRef(new THREE.Box3())
    const latestObjectRef = useRef(obj)
    const { scene } = useThree()
    
    const { setObjects } = useContext(SceneContext)
    const { controlsRef } = useContext(RefsContext)
    const {
        gizmoMode,
        isGizmoVisible,
        interactionMode,
        axisConstraint,
        resetAxisLock,
        isSelectionLocked,
        setIsPointerDragging
    } = useContext(UiContext)
    const { transformSnaps } = useContext(SceneSettingsContext)
    const { socketEmit } = useContext(ActionsContext)
    const transformControlsRef = useRef(null)

    useEffect(() => {
        latestObjectRef.current = obj
        if (!groupRef.current) return
        groupRef.current.position.set(...obj.position)
        groupRef.current.rotation.set(...obj.rotation)
        groupRef.current.scale.set(...obj.scale)
    }, [obj])

    const updateObjectTransform = useCallback(() => {
        if (groupRef.current) {
            const { position, rotation, scale } = groupRef.current
            const updatedObject = {
                ...latestObjectRef.current,
                position: [position.x, position.y, position.z],
                rotation: [rotation.x, rotation.y, rotation.z],
                scale: [scale.x, scale.y, scale.z]
            }
            latestObjectRef.current = updatedObject
            
            setObjects(prev => prev.map(item => 
                item.id === obj.id ? updatedObject : item
            ))
            
            // Forward transform events only when live scene emitters are explicitly enabled.
            if (socketEmit?.objectChanged) {
                console.log('[Socket.IO] Broadcasting transform from gizmo:', obj.id)
                socketEmit.objectChanged(obj.id, 'transform', updatedObject)
            }
        }
    }, [obj.id, setObjects, socketEmit])
    
    const [isHovered, setIsHovered] = useState(false)
    const isHidden = !obj.isVisible

    const ObjectComponent = ObjectMap[obj.type] || UnknownObject

    const openObjectLink = () => {
        if (!obj.linkActive) return
        const rawUrl = obj.linkUrl?.trim()
        if (!rawUrl) return
        const normalizedUrl = /^https?:\/\//i.test(rawUrl) ? rawUrl : `https://${rawUrl}`
        const confirmed = window.confirm('Open linked page in a new tab?')
        if (confirmed) {
            window.open(normalizedUrl, '_blank', 'noopener,noreferrer')
        }
    }

    const focusObjectInView = useCallback(() => {
        if (!controlsRef?.current || !groupRef.current) return
        const sphere = getObjectBoundingSphere(groupRef.current, { minRadius: 0.75 })
        frameSphereInControls(controlsRef.current, sphere, { padding: 1.4, minRadius: 0.75 })
    }, [controlsRef])

    const setOrbitControlsEnabled = useCallback((enabled) => {
        if (controlsRef?.current) {
            controlsRef.current.enabled = enabled
        }
    }, [controlsRef])

    useEffect(() => {
        return () => {
            document.body.style.cursor = 'default'
        }
    }, [])

    const objectMesh = (
        <group
            ref={groupRef}
            position={obj.position}
            rotation={obj.rotation}
            scale={obj.scale}
            onClick={(e) => {
                e.stopPropagation()
                if ((e.delta ?? 0) > CLICK_SELECTION_DELTA) {
                    return
                }
                if (typeof onSelect === 'function') {
                    onSelect(obj.id, { additive: e.shiftKey })
                }
            }}
            onPointerOver={(e) => {
                if (obj.linkActive) {
                    document.body.style.cursor = 'pointer'
                    setIsHovered(true)
                }
                e.stopPropagation()
            }}
            onPointerOut={(e) => {
                if (obj.linkActive) {
                    document.body.style.cursor = 'default'
                    setIsHovered(false)
                }
                e.stopPropagation()
            }}
            onDoubleClick={(e) => {
                e.stopPropagation()
                if (obj.linkActive) {
                    openObjectLink()
                    return
                }
                focusObjectInView()
            }}
        >
            <ObjectComponent {...obj} />
            {obj.linkActive && isHovered && (
                <mesh>
                    <boxGeometry args={[1.1, 1.1, 1.1]} />
                    <meshStandardMaterial color="#00b4ff" transparent opacity={0.25} />
                </mesh>
            )}
        </group>
    );
    
    useEffect(() => {
        const group = groupRef.current
        if (!group || !scene) return
        if (isHidden) return

        const attachHelper = () => {
            if (boxHelperRef.current) return
            const helper = new THREE.Box3Helper(new THREE.Box3(), 0x2ecc71)
            helper.material.transparent = true
            helper.material.opacity = 0.55
            helper.material.depthTest = false
            boxHelperRef.current = helper
            scene.add(helper)
        }

        const detachHelper = () => {
            if (!boxHelperRef.current) return
            scene.remove(boxHelperRef.current)
            boxHelperRef.current.geometry?.dispose?.()
            boxHelperRef.current.material?.dispose?.()
            boxHelperRef.current = null
        }

        const shouldShowHelper = isSelected || (isMultiSelectMode && isMultiSelected)
        if (shouldShowHelper) {
            attachHelper()
        } else {
            detachHelper()
        }

        if (boxHelperRef.current && groupRef.current) {
            boxRef.current.setFromObject(groupRef.current)
            boxHelperRef.current.box.copy(boxRef.current)
            const color = isPrimarySelected
                ? 0xffa500 // last/primary selection
                : 0x2ecc71 // other selections
            boxHelperRef.current.material.color.setHex(color)
        }

        return () => {
            detachHelper()
        }
    }, [isHidden, isMultiSelectMode, isMultiSelected, isSelected, isPrimarySelected, obj.position, obj.rotation, obj.scale, scene])

    useFrame((state) => {
        if (isHidden || !groupRef.current) return
        const currentObj = latestObjectRef.current
        if (!currentObj) return
        const needsPosition = hasVectorExpressions(currentObj.positionExpressions)
        const needsRotation = hasVectorExpressions(currentObj.rotationExpressions)
        const needsScale = hasVectorExpressions(currentObj.scaleExpressions)
        if (!needsPosition && !needsRotation && !needsScale) return
        const context = getExpressionContext(state.clock.getElapsedTime())
        if (needsPosition) {
            applyVectorExpressions(
                groupRef.current.position,
                currentObj.position,
                currentObj.positionExpressions,
                POSITION_FALLBACK,
                context
            )
        }
        if (needsRotation) {
            applyVectorExpressions(
                groupRef.current.rotation,
                currentObj.rotation,
                currentObj.rotationExpressions,
                ROTATION_FALLBACK,
                context
            )
        }
        if (needsScale) {
            applyVectorExpressions(
                groupRef.current.scale,
                currentObj.scale,
                currentObj.scaleExpressions,
                SCALE_FALLBACK,
                context
            )
        }
    })

    useFrame(() => {
        if (isHidden || !boxHelperRef.current || !groupRef.current) return
        boxRef.current.setFromObject(groupRef.current)
        boxHelperRef.current.box.copy(boxRef.current)
    })

    const gizmoActive = interactionMode === 'edit' && isSelected && isGizmoVisible && !isMultiSelectMode && !isSelectionLocked

    // Attach controls to the object and enforce local space so the gizmo follows object rotation.
    useEffect(() => {
        const controls = transformControlsRef.current
        const obj3d = groupRef.current
        if (!controls || !obj3d || !gizmoActive) return
        controls.attach(obj3d)
        controls.setSpace('local')
        return () => {
            controls.detach()
        }
    }, [gizmoActive])

    // Drive the single-object gizmo from a single drag-state authority.
    useEffect(() => {
        const controls = transformControlsRef.current
        if (!controls || !gizmoActive) return
        const singleObjectDragController = createSingleObjectGizmoDragController({
            persistTransform: updateObjectTransform,
            setPointerDragging: setIsPointerDragging,
            setOrbitControlsEnabled,
            resetAxisLock
        })

        controls.addEventListener('change', singleObjectDragController.handleChange)
        controls.addEventListener('dragging-changed', singleObjectDragController.handleDraggingChanged)
        return () => {
            controls.removeEventListener('change', singleObjectDragController.handleChange)
            controls.removeEventListener('dragging-changed', singleObjectDragController.handleDraggingChanged)
            singleObjectDragController.dispose()
        }
    }, [
        gizmoActive,
        resetAxisLock,
        setIsPointerDragging,
        setOrbitControlsEnabled,
        updateObjectTransform
    ])

    if (isHidden) {
        return null
    }

    const gizmo = gizmoActive ? (
        <TransformControls
            key={`gizmo-${obj.id}`}
            ref={transformControlsRef}
            object={groupRef}
            enabled={!isSelectionLocked}
            mode={gizmoMode}
            space="local"
            translationSnap={gizmoMode === 'translate' ? (transformSnaps?.translation ?? null) : null}
            rotationSnap={gizmoMode === 'rotate' ? THREE.MathUtils.degToRad(transformSnaps?.rotation ?? 15) : null}
            scaleSnap={gizmoMode === 'scale' ? (transformSnaps?.scale ?? 0.1) : null}
            showX={!axisConstraint || axisConstraint === 'X'}
            showY={!axisConstraint || axisConstraint === 'Y'}
            showZ={!axisConstraint || axisConstraint === 'Z'}
        />
    ) : null

    return (
        <>
            {objectMesh}
            {gizmo}
        </>
    )
}
