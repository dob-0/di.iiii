import React, { useRef, useContext, useState, useEffect, useCallback } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { TransformControls } from '@react-three/drei'
import * as THREE from 'three'
import { AppContext } from './AppContext.js'
import { ObjectMap } from './objectComponents/ObjectMap.js'
import { evaluateExpressionString, getExpressionContext } from './utils/expressions.js'

const VECTOR_SIZE = 3
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
    const { scene, camera, gl } = useThree()
    
    const { 
        setObjects, 
        controlsRef, 
        gizmoMode, 
        isGizmoVisible,
        transformSnaps,
        axisConstraint,
        setAxisConstraint,
        resetAxisLock,
        objects: sceneObjects,
        selectedObjectIds,
        expandIdsWithGroups,
        isSelectionLocked,
        setIsPointerDragging
    } = useContext(AppContext)
    const dragStateRef = useRef({ active: false })
    const transformControlsRef = useRef(null)
    const [isDragging, setIsDragging] = useState(false)

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
            latestObjectRef.current = {
                ...latestObjectRef.current,
                position: [position.x, position.y, position.z],
                rotation: [rotation.x, rotation.y, rotation.z],
                scale: [scale.x, scale.y, scale.z]
            }
            setObjects(prev => prev.map(item => 
                item.id === obj.id 
                ? { ...item, 
                    position: [position.x, position.y, position.z], 
                    rotation: [rotation.x, rotation.y, rotation.z], 
                    scale: [scale.x, scale.y, scale.z] 
                  }
                : item
            ));
        }
    }, [obj.id, setObjects])
    
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
    
    useEffect(() => {
        return () => {
            document.body.style.cursor = 'default'
        }
    }, [])

    // Allow mesh drag moves whenever selection isn't locked; gizmo handles remain usable.
    const allowPointerDragMove = !isSelectionLocked

    const getGroundPoint = useCallback((clientX, clientY, fixedY = 0) => {
        if (!gl?.domElement || !camera) return null
        const rect = gl.domElement.getBoundingClientRect()
        const x = ((clientX - rect.left) / rect.width) * 2 - 1
        const y = -((clientY - rect.top) / rect.height) * 2 + 1
        const raycaster = new THREE.Raycaster()
        raycaster.setFromCamera({ x, y }, camera)
        const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -fixedY)
        const point = new THREE.Vector3()
        if (raycaster.ray.intersectPlane(plane, point)) {
            return [point.x, fixedY, point.z]
        }
        return null
    }, [camera, gl])

    const beginDrag = useCallback((event, selectionOverride) => {
        // Only start drag on primary/left button (touch has button === 0). Right-click should remain for camera orbit.
        if (typeof event.button === 'number' && event.button !== 0) return false
        if (!allowPointerDragMove) return false
        if (isSelectionLocked) return false
        const selectionArray = Array.isArray(selectionOverride) && selectionOverride.length
            ? selectionOverride
            : (Array.isArray(selectedObjectIds) && selectedObjectIds.includes(obj.id) && selectedObjectIds.length > 0
                ? selectedObjectIds
                : [obj.id])
        const uniqueSelection = Array.from(new Set(selectionArray))
        const targets = []
        uniqueSelection.forEach(id => {
            const target = sceneObjects?.find(item => item.id === id)
            if (target) {
                targets.push({
                    id,
                    startPosition: [
                        target.position?.[0] ?? 0,
                        target.position?.[1] ?? 0,
                        target.position?.[2] ?? 0
                    ]
                })
            }
        })
        if (!targets.length) return false
        const planeY = targets.length === 1 ? targets[0].startPosition[1] : 0
        const intersection = getGroundPoint(event.clientX, event.clientY, planeY)
        if (!intersection) return false
        dragStateRef.current = {
            active: true,
            pointerId: event.pointerId,
            planeY,
            startPoint: intersection,
            targets
        }
        setIsPointerDragging?.(true)
        if (controlsRef?.current) {
            controlsRef.current.enabled = false
        }
        event.target.setPointerCapture?.(event.pointerId)
        document.body.style.cursor = 'grabbing'
        setIsDragging(true)
        return true
    }, [allowPointerDragMove, controlsRef, getGroundPoint, isSelectionLocked, obj.id, sceneObjects, selectedObjectIds])

    const updateDragPosition = useCallback((event) => {
        if (!allowPointerDragMove || isSelectionLocked) return
        const state = dragStateRef.current
        if (!state?.active || state.pointerId !== event.pointerId) return
        const intersection = getGroundPoint(event.clientX, event.clientY, state.planeY ?? 0)
        if (!intersection) return
        const deltaX = intersection[0] - state.startPoint[0]
        const deltaZ = intersection[2] - state.startPoint[2]
        const updates = new Map()
        state.targets.forEach(target => {
            updates.set(target.id, [
                Math.round(target.startPosition[0] + deltaX),
                target.startPosition[1],
                Math.round(target.startPosition[2] + deltaZ)
            ])
        })
        const updatedPosition = updates.get(obj.id)
        if (updatedPosition) {
            latestObjectRef.current = {
                ...latestObjectRef.current,
                position: updatedPosition
            }
        }
        setObjects(prev => prev.map(item => updates.has(item.id)
            ? { ...item, position: updates.get(item.id) }
            : item
        ))
    }, [allowPointerDragMove, getGroundPoint, isSelectionLocked, obj.id, setObjects])

    const endDrag = useCallback((event, cancelled = false) => {
        const state = dragStateRef.current
        if (!state?.active || (event && state.pointerId !== event.pointerId)) return
        dragStateRef.current = { active: false }
        event?.target?.releasePointerCapture?.(event.pointerId)
        document.body.style.cursor = 'default'
        setIsDragging(false)
        setIsPointerDragging?.(false)
        if (!cancelled) {
            updateObjectTransform()
        }
        if (controlsRef?.current) {
            controlsRef.current.enabled = true
        }
    }, [controlsRef, updateObjectTransform])

    useEffect(() => {
        return () => {
            if (dragStateRef.current.active) {
                dragStateRef.current = { active: false }
                document.body.style.cursor = 'default'
                setIsDragging(false)
            }
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
                if (typeof onSelect === 'function') {
                    onSelect(obj.id, { additive: e.shiftKey })
                }
            }}
            onPointerDown={(e) => {
                if (e.button !== 0) return
                e.stopPropagation()
                let selectionForDrag = selectedObjectIds
                if (typeof onSelect === 'function') {
                    if (!isSelected || e.shiftKey) {
                        const baseSelection = e.shiftKey
                            ? [...selectedObjectIds, obj.id]
                            : [obj.id]
                        const expanded = expandIdsWithGroups?.(baseSelection) || baseSelection
                        selectionForDrag = expanded
                        onSelect(obj.id, { additive: e.shiftKey })
                    } else if (expandIdsWithGroups) {
                        selectionForDrag = expandIdsWithGroups(selectedObjectIds)
                    }
                }
                if (isSelectionLocked) return
                if (!allowPointerDragMove) return
                beginDrag(e, selectionForDrag)
            }}
            onPointerMove={(e) => {
                setIsPointerDragging?.(true)
                if (!allowPointerDragMove || isSelectionLocked || !dragStateRef.current.active) return
                e.stopPropagation()
                updateDragPosition(e)
            }}
            onPointerUp={(e) => {
                e.stopPropagation()
                setIsPointerDragging?.(false)
                if (allowPointerDragMove && !isSelectionLocked && dragStateRef.current.active) {
                    endDrag(e)
                }
            }}
            onPointerLeave={(e) => {
                e.stopPropagation()
                setIsPointerDragging?.(false)
                if (allowPointerDragMove && !isSelectionLocked && dragStateRef.current.active) {
                    endDrag(e)
                }
            }}
            onPointerCancel={(e) => {
                e.stopPropagation()
                setIsPointerDragging?.(false)
                if (allowPointerDragMove && !isSelectionLocked && dragStateRef.current.active) {
                    endDrag(e, true)
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
                openObjectLink()
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

    const gizmoActive = isSelected && isGizmoVisible && !isMultiSelectMode && !isSelectionLocked

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

    // Keep orbit controls in sync while dragging the gizmo and persist transforms as they change.
    useEffect(() => {
        const controls = transformControlsRef.current
        if (!controls || !gizmoActive) return
        const orbit = controlsRef?.current
        const handleChange = () => updateObjectTransform()
        const handleDraggingChanged = (event) => {
            const dragging = Boolean(event?.value)
            if (orbit) orbit.enabled = !dragging
            setIsPointerDragging?.(dragging)
            if (!dragging) {
                updateObjectTransform()
                resetAxisLock()
            }
        }
        controls.addEventListener('change', handleChange)
        controls.addEventListener('dragging-changed', handleDraggingChanged)
        return () => {
            controls.removeEventListener('change', handleChange)
            controls.removeEventListener('dragging-changed', handleDraggingChanged)
            if (orbit) orbit.enabled = true
            setIsPointerDragging?.(false)
        }
    }, [controlsRef, gizmoActive, resetAxisLock, setIsPointerDragging, updateObjectTransform])

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
            onObjectChange={updateObjectTransform}
        />
    ) : null

    return (
        <>
            {objectMesh}
            {gizmo}
        </>
    )
}
