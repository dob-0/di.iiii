import { useCallback, useRef } from 'react'
import { generateObjectId } from '../state/sceneStore.js'

export function useObjectActions({
    objects,
    setObjects,
    selectedObjectId,
    selectedObjectIds,
    setSelectedObjectId,
    setSelectedObjectIds,
    applySelection,
    expandIdsWithGroups,
    isSelectionLocked,
    cloneObjects,
    socketEmit
} = {}) {
    const clipboardRef = useRef(null)
    const cloneList = useCallback((list) => {
        if (typeof cloneObjects === 'function') {
            return cloneObjects(list)
        }
        return JSON.parse(JSON.stringify(list))
    }, [cloneObjects])

    const applyFreeTransformDelta = useCallback((mode, axis, delta) => {
        if (isSelectionLocked) return
        if (!axis || !mode || !selectedObjectIds?.length || delta === 0) return
        const axisIndex = axis === 'X' ? 0 : axis === 'Y' ? 1 : 2
        const idSet = new Set(selectedObjectIds)
        const modifiedObjects = []
        
        setObjects?.(prev => prev.map(obj => {
            if (!idSet.has(obj.id)) return obj
            const next = { ...obj }
            if (mode === 'translate') {
                const pos = [...(obj.position || [0, 0, 0])]
                pos[axisIndex] = (pos[axisIndex] ?? 0) + delta
                next.position = pos
            } else if (mode === 'scale') {
                const scale = [...(obj.scale || [1, 1, 1])]
                const current = scale[axisIndex] ?? 1
                scale[axisIndex] = Math.max(0.01, current + delta)
                next.scale = scale
            } else if (mode === 'rotate') {
                const rot = [...(obj.rotation || [0, 0, 0])]
                rot[axisIndex] = (rot[axisIndex] ?? 0) + delta
                next.rotation = rot
            }
            modifiedObjects.push(next)
            return next
        }))
        
        // Forward transform events only when live scene emitters are explicitly enabled.
        if (socketEmit?.objectChanged && modifiedObjects.length > 0) {
            modifiedObjects.forEach(obj => {
                socketEmit.objectChanged(obj.id, mode, obj)
            })
        }
    }, [isSelectionLocked, selectedObjectIds, setObjects, socketEmit])

    const selectObject = useCallback((id, options = {}) => {
        const { additive = false } = options
        if (!id) {
            applySelection?.([])
            return
        }
        const expanded = expandIdsWithGroups?.([id]) || [id]
        if (!additive) {
            applySelection?.(expanded)
            return
        }
        setSelectedObjectIds?.(prev => {
            const next = Array.isArray(prev) ? [...prev] : []
            expanded.forEach(memberId => {
                if (!next.includes(memberId)) {
                    next.push(memberId)
                }
            })
            setSelectedObjectId?.(next.length ? next[next.length - 1] : null)
            return next
        })
    }, [applySelection, expandIdsWithGroups, setSelectedObjectId, setSelectedObjectIds])

    const selectAllObjects = useCallback(() => {
        if (!objects?.length) {
            applySelection?.([])
            return
        }
        applySelection?.(objects.map(obj => obj.id))
    }, [objects, applySelection])

    const deleteSelectedObject = useCallback(() => {
        const targets = selectedObjectIds?.length
            ? selectedObjectIds
            : (selectedObjectId ? [selectedObjectId] : [])
        if (!targets.length) return
        setObjects?.(prev => prev.filter(obj => !targets.includes(obj.id)))
        applySelection?.([])
        
        // Forward delete events only when live scene emitters are explicitly enabled.
        if (socketEmit?.objectDeleted) {
            targets.forEach(objectId => {
                socketEmit.objectDeleted(objectId)
            })
        }
    }, [applySelection, selectedObjectId, selectedObjectIds, setObjects, socketEmit])

    const copySelectedObject = useCallback(() => {
        if (!selectedObjectId) return
        const original = objects?.find(obj => obj.id === selectedObjectId)
        if (!original) return
        clipboardRef.current = cloneList([original])[0]
    }, [cloneList, objects, selectedObjectId])

    const pasteClipboardObject = useCallback(() => {
        const data = clipboardRef.current
        if (!data) return
        const base = cloneList([data])[0]
        const newObject = {
            ...base,
            id: generateObjectId(),
            position: [base.position[0] + 1, base.position[1], base.position[2] + 1]
        }
        setObjects?.(prev => [...prev, newObject])
        applySelection?.([newObject.id])
        if (socketEmit?.objectAdded) {
            socketEmit.objectAdded(newObject)
        }
    }, [applySelection, cloneList, setObjects, socketEmit])

    const cutSelectedObject = useCallback(() => {
        if (!selectedObjectId) return
        copySelectedObject()
        deleteSelectedObject()
    }, [copySelectedObject, deleteSelectedObject, selectedObjectId])

    const duplicateSelectedObject = useCallback(() => {
        if (!selectedObjectId) return
        const original = objects?.find(obj => obj.id === selectedObjectId)
        if (!original) return
        const clone = {
            ...cloneList([original])[0],
            id: generateObjectId(),
            position: [original.position[0] + 1, original.position[1], original.position[2] + 1]
        }
        setObjects?.(prev => [...prev, clone])
        applySelection?.([clone.id])
        if (socketEmit?.objectAdded) {
            socketEmit.objectAdded(clone)
        }
    }, [applySelection, cloneList, objects, selectedObjectId, setObjects, socketEmit])

    const handleSelectObjectFromOutliner = useCallback((objectId) => {
        if (!objectId) return
        selectObject(objectId, { additive: false })
    }, [selectObject])

    const handleToggleObjectVisibility = useCallback((objectId) => {
        if (!objectId) return
        let updatedObject = null
        setObjects?.(prev => prev.map(obj => {
            if (obj.id !== objectId) return obj
            updatedObject = {
                ...obj,
                isVisible: obj.isVisible === false ? true : !obj.isVisible
            }
            return updatedObject
        }))
        if (updatedObject && socketEmit?.objectChanged) {
            socketEmit.objectChanged(objectId, 'visibility', updatedObject)
        }
    }, [setObjects, socketEmit])

    return {
        applyFreeTransformDelta,
        selectObject,
        selectAllObjects,
        deleteSelectedObject,
        copySelectedObject,
        pasteClipboardObject,
        cutSelectedObject,
        duplicateSelectedObject,
        handleSelectObjectFromOutliner,
        handleToggleObjectVisibility
    }
}

export default useObjectActions
