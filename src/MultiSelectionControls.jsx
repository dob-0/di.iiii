import React, { useContext, useMemo, useRef, useEffect } from 'react'
import * as THREE from 'three'
import { useThree } from '@react-three/fiber'
import { TransformControls } from '@react-three/drei'
import { AppContext } from './AppContext.js'

export default function MultiSelectionControls() {
    const {
        objects,
        selectedObjectIds,
        setObjects,
        gizmoMode,
        isGizmoVisible,
        transformSnaps,
        controlsRef,
        axisConstraint,
        setAxisConstraint,
        resetAxisLock,
        setIsPointerDragging,
        isSelectionLocked
    } = useContext(AppContext)

    const selectedObjects = useMemo(() => {
        if (!selectedObjectIds || selectedObjectIds.length === 0) return []
        const idSet = new Set(selectedObjectIds)
        return objects.filter(obj => idSet.has(obj.id))
    }, [objects, selectedObjectIds])

    const isLocked = Boolean(isSelectionLocked)
    const isActive = isGizmoVisible && selectedObjects.length > 1 && !isLocked
    const { scene } = useThree()
    const pivot = useMemo(() => new THREE.Group(), [])
    const pivotRef = useRef(pivot)
    const transformStateRef = useRef(null)
    const isTransformingRef = useRef(false)

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

    const captureInitialState = () => {
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
    }

    const applyDelta = () => {
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
        setObjects(prev => prev.map(obj => updates.get(obj.id) ? { ...obj, ...updates.get(obj.id) } : obj))
    }

    const handlePointerDown = () => {
        if (isLocked) return
        if (controlsRef.current) controlsRef.current.enabled = false
        setIsPointerDragging?.(true)
        isTransformingRef.current = true
        captureInitialState()
    }

    const handlePointerUp = () => {
        if (controlsRef.current) controlsRef.current.enabled = true
        setIsPointerDragging?.(false)
        isTransformingRef.current = false
        transformStateRef.current = null
        resetAxisLock()
    }

    const handleObjectChange = () => {
        if (!isTransformingRef.current || isLocked) return
        applyDelta()
    }

    if (!isActive) {
        pivot.visible = false
        return null
    }

    pivot.visible = true

    return (
        <TransformControls
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
            onPointerCancel={() => setIsPointerDragging?.(false)}
            onObjectChange={handleObjectChange}
        />
    )
}
