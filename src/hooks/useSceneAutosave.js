import { useCallback, useEffect, useRef } from 'react'

/**
 * Handles local scene autosave and optional server save scheduling.
 */
export function useSceneAutosave({
    getBaseSceneData,
    getSavedViewData,
    persistSceneData,
    scheduleServerSceneSave,
    updateSceneSignature,
    isLoading,
    dependencies = []
} = {}) {
    const sceneSaveFactoryRef = useRef(null)
    const pendingSceneSaveRef = useRef(null)
    const hasHydratedSceneRef = useRef(false)

    const scheduleLocalSceneSave = useCallback((factory) => {
        sceneSaveFactoryRef.current = factory
        if (pendingSceneSaveRef.current) {
            clearTimeout(pendingSceneSaveRef.current)
        }
        pendingSceneSaveRef.current = window.setTimeout(() => {
            pendingSceneSaveRef.current = null
            const data = sceneSaveFactoryRef.current?.()
            if (data) {
                updateSceneSignature(data)
                persistSceneData(data)
                scheduleServerSceneSave?.(() => JSON.parse(JSON.stringify(data)))
            }
        }, 350)
    }, [persistSceneData, scheduleServerSceneSave, updateSceneSignature])

    useEffect(() => {
        return () => {
            if (pendingSceneSaveRef.current) {
                clearTimeout(pendingSceneSaveRef.current)
            }
        }
    }, [])

    useEffect(() => {
        if (isLoading) return
        hasHydratedSceneRef.current = true
        scheduleLocalSceneSave(() => ({
            ...getBaseSceneData(),
            savedView: getSavedViewData({ capture: false })
        }))
    }, [getBaseSceneData, getSavedViewData, isLoading, scheduleLocalSceneSave])

    useEffect(() => {
        if (!hasHydratedSceneRef.current) return
        scheduleLocalSceneSave(() => ({
            ...getBaseSceneData(),
            savedView: getSavedViewData({ capture: false })
        }))
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [getBaseSceneData, getSavedViewData, scheduleLocalSceneSave, ...dependencies])

    return {
        scheduleLocalSceneSave
    }
}
