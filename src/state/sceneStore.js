import { useCallback, useEffect, useMemo, useState } from 'react'
import * as sceneSchema from '../shared/sceneSchema.js'

const {
    SCENE_DATA_VERSION,
    defaultScene,
    normalizeObject,
    normalizeObjects,
    generateObjectId
} = sceneSchema

export {
    SCENE_DATA_VERSION,
    defaultScene,
    normalizeObject,
    normalizeObjects,
    generateObjectId
}

export function useSceneStore(options = {}) {
    const { initialObjects = defaultScene.objects, initialVersion = 0 } = options

    const [objects, setObjects] = useState(() => normalizeObjects(initialObjects))
    const [sceneVersion, setSceneVersion] = useState(() => Number(initialVersion) || 0)
    const [selectedObjectId, setSelectedObjectId] = useState(null)
    const [selectedObjectIds, setSelectedObjectIds] = useState([])

    const applySelection = useCallback((ids) => {
        const safeIds = Array.isArray(ids)
            ? Array.from(new Set(ids.filter(Boolean)))
            : []
        setSelectedObjectIds(safeIds)
        setSelectedObjectId(safeIds.length ? safeIds[safeIds.length - 1] : null)
    }, [])

    const clearSelection = useCallback(() => {
        setSelectedObjectIds([])
        setSelectedObjectId(null)
    }, [])

    useEffect(() => {
        setObjects(prev => {
            if (!Array.isArray(prev)) return prev
            let mutated = false
            const next = prev.map(obj => {
                if (!obj || obj.id) return obj
                mutated = true
                return normalizeObject(obj)
            })
            return mutated ? next : prev
        })
    }, [])

    useEffect(() => {
        setSelectedObjectIds(prev => {
            if (!Array.isArray(prev) || prev.length === 0) return prev
            const validIds = new Set(objects.map(obj => obj.id))
            const next = prev.filter(id => validIds.has(id))
            if (next.length === prev.length) return prev
            setSelectedObjectId(next.length ? next[next.length - 1] : null)
            return next
        })
    }, [objects])

    return useMemo(() => ({
        objects,
        setObjects,
        sceneVersion,
        setSceneVersion,
        selectedObjectId,
        setSelectedObjectId,
        selectedObjectIds,
        setSelectedObjectIds,
        applySelection,
        clearSelection
    }), [objects, sceneVersion, selectedObjectId, selectedObjectIds, applySelection, clearSelection])
}
