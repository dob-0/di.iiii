import React, { useContext, useMemo, useRef, useEffect, useCallback } from 'react'
import * as THREE from 'three'
import { useThree } from '@react-three/fiber'
import { TransformControls } from '@react-three/drei'
import { SceneContext, UiContext, SceneSettingsContext, RefsContext, ActionsContext } from './contexts/AppContexts.js'

export default function MultiSelectionControls() {
    const { objects, selectedObjectIds, setObjects } = useContext(SceneContext)
    const {
        gizmoMode,
        isGizmoVisible,
        resetAxisLock,
        setIsPointerDragging,
        isSelectionLocked
    } = useContext(UiContext)
    const { transformSnaps } = useContext(SceneSettingsContext)
    const { controlsRef } = useContext(RefsContext)
    const { socketEmit } = useContext(ActionsContext)

    const selectedObjects = useMemo(() => {
        if (!selectedObjectIds || selectedObjectIds.length === 0) return []
        const idSet = new Set(selectedObjectIds)
        return objects.filter(obj => idSet.has(obj.id))
    }, [objects, selectedObjectIds])

    const isLocked = Boolean(isSelectionLocked)
    const isActive = isGizmoVisible && selectedObjects.length > 1 && !isLocked
    const { scene } = useThree()
    const pivot = useMemo(() => new THREE.Group(), [])
    const transformStateRef = useRef(null)
    const isTransformingRef = useRef(false)
    const transformControlsRef = useRef(null)
    const dragStateRef = useRef(false)

    const centroid = useMemo(() => {
        if (selectedObjects.length === 0) return [0, 0, 0]
        const sum = selectedObjects.reduce((acc, obj) => {
            return [
                acc[0] + (obj.position?.[0] ?? 0),
                acc[1] + (obj.position?.[1] ?? 0),
                acc[2] + (obj.position?.[2] ?? 0)
            ]
        }, [0, 0, 0])
        return sum.map(value => value / selectedObjects.length)
    }, [selectedObjects])

    useEffect(() => {
        if (!isActive || isTransformingRef.current) return
        pivot.position.set(centroid[0], centroid[1], centroid[2])
        pivot.rotation.set(0, 0, 0)
        pivot.scale.set(1, 1, 1)
    }, [centroid, isActive, pivot])

    useEffect(() => {
        if (!scene) return
        scene.add(pivot)
        return () => {
            scene.remove(pivot)
        }
    }, [pivot, scene])

    const captureInitialState = useCallback(() => {
        const pivotMatrix = new THREE.Matrix4().compose(
            pivot.position.clone(),
            pivot.quaternion.clone(),
            pivot.scale.clone()
        )
        const pivotInverse = pivotMatrix.clone().invert()
        const entries = selectedObjects.map(obj => {
            const position = new THREE.Vector3(...(obj.position || [0, 0, 0]))
            const euler = new THREE.Euler(...(obj.rotation || [0, 0, 0]))
            const quaternion = new THREE.Quaternion().setFromEuler(euler)
            const scale = new THREE.Vector3(...(obj.scale || [1, 1, 1]))
            const matrix = new THREE.Matrix4().compose(position, quaternion, scale)
            return { id: obj.id, matrix }
        })
        transformStateRef.current = { pivotMatrix, pivotInverse, entries }
    }, [pivot, selectedObjects])

    const applyDelta = useCallback(() => {
        const state = transformStateRef.current
        if (!state) return
        const currentPivotMatrix = new THREE.Matrix4().compose(
            pivot.position.clone(),
            pivot.quaternion.clone(),
            pivot.scale.clone()
        )
        const delta = new THREE.Matrix4().copy(currentPivotMatrix).multiply(state.pivotInverse)
        const updates = new Map()
        state.entries.forEach(entry => {
            const result = new THREE.Matrix4().copy(delta).multiply(entry.matrix)
            const position = new THREE.Vector3()
            const quaternion = new THREE.Quaternion()
            const scale = new THREE.Vector3()
            result.decompose(position, quaternion, scale)
            const euler = new THREE.Euler().setFromQuaternion(quaternion)
            updates.set(entry.id, {
                position: [position.x, position.y, position.z],
                rotation: [euler.x, euler.y, euler.z],
                scale: [scale.x, scale.y, scale.z]
            })
        })
        if (updates.size === 0) return
        const updatedObjects = []
        setObjects(prev => prev.map(obj => {
            if (!updates.has(obj.id)) return obj
            const next = { ...obj, ...updates.get(obj.id) }
            updatedObjects.push(next)
            return next
        }))
        if (socketEmit?.objectChanged) {
            updatedObjects.forEach((updatedObject) => {
                socketEmit.objectChanged(updatedObject.id, 'transform', updatedObject)
            })
        }
    }, [pivot, setObjects, socketEmit])

    const handlePointerDown = useCallback((event) => {
        event?.stopPropagation?.()
        event?.preventDefault?.()
        if (isLocked) return
        if (controlsRef.current) controlsRef.current.enabled = false
        setIsPointerDragging?.(true)
        isTransformingRef.current = true
        captureInitialState()
    }, [captureInitialState, controlsRef, isLocked, setIsPointerDragging])

    const handlePointerUp = useCallback((event) => {
        event?.stopPropagation?.()
        event?.preventDefault?.()
        if (controlsRef.current) controlsRef.current.enabled = true
        setIsPointerDragging?.(false)
        isTransformingRef.current = false
        transformStateRef.current = null
        resetAxisLock()
    }, [controlsRef, resetAxisLock, setIsPointerDragging])

    const handleObjectChange = useCallback(() => {
        if (!isTransformingRef.current || isLocked) return
        applyDelta()
    }, [applyDelta, isLocked])

    useEffect(() => {
        const controls = transformControlsRef.current
        if (!controls) return
        const checkDragging = (event) => {
            const dragging = typeof event?.value === 'boolean'
                ? event.value
                : Boolean(controls.dragging)
            if (dragging === dragStateRef.current) return
            dragStateRef.current = dragging
            setIsPointerDragging?.(dragging)
            if (controlsRef.current) {
                controlsRef.current.enabled = !dragging
            }
            if (dragging && !isTransformingRef.current) {
                isTransformingRef.current = true
                captureInitialState()
            }
            if (!dragging) {
                isTransformingRef.current = false
                transformStateRef.current = null
                resetAxisLock()
            }
        }
        controls.addEventListener('dragging-changed', checkDragging)
        return () => controls.removeEventListener('dragging-changed', checkDragging)
    }, [captureInitialState, controlsRef, resetAxisLock, setIsPointerDragging])

    if (!isActive) {
        pivot.visible = false
        return null
    }

    pivot.visible = true

    return (
        <TransformControls
            ref={transformControlsRef}
            object={pivot}
            mode={gizmoMode}
            translationSnap={gizmoMode === 'translate' ? (transformSnaps?.translation || 1) : null}
            rotationSnap={gizmoMode === 'rotate' ? THREE.MathUtils.degToRad(transformSnaps?.rotation || 15) : null}
            scaleSnap={gizmoMode === 'scale' ? (transformSnaps?.scale || 0.1) : null}
            showX
            showY
            showZ
            enabled={!isLocked}
            onMouseDown={handlePointerDown}
            onPointerDown={handlePointerDown}
            onMouseUp={handlePointerUp}
            onPointerUp={handlePointerUp}
            onPointerCancel={(event) => {
                event?.stopPropagation?.()
                event?.preventDefault?.()
                setIsPointerDragging?.(false)
                if (controlsRef.current) controlsRef.current.enabled = true
                isTransformingRef.current = false
                transformStateRef.current = null
            }}
            onObjectChange={handleObjectChange}
        />
    )
}
