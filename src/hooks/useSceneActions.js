import { useCallback, useEffect } from 'react'
import { defaultScene } from '../state/sceneStore.js'
import { frameSphereInControls, getPointsBoundingSphere } from '../utils/cameraFraming.js'

export function useSceneActions({
    controlsRef,
    objects,
    selectedObjectIds,
    setObjects,
    setBackgroundColor,
    setGridSize,
    setAmbientLight,
    setDirectionalLight,
    setDefault3DView,
    setGridAppearance,
    setTransformSnaps,
    setRemoteSceneVersion,
    resetRemoteAssets,
    setIsGridVisible,
    setIsGizmoVisible,
    setIsPerfVisible,
    setIsUiVisible,
    setCameraPosition,
    setCameraTarget,
    setSceneVersion,
    clearSelection,
    getBaseSceneData,
    getSavedViewData,
    persistSceneDataWithStatus,
    updateSceneSignature,
    skipServerLoadRef,
    clearAllAssets,
    resetAssetStoreQuotaState,
    scheduleLocalSceneSave,
    defaultGridAppearance,
    toggleAdminMode,
    resetSceneVersionOnClear = true
} = {}) {
    const handleClear = useCallback(async ({ skipConfirm = false, silent = false } = {}) => {
        if (!skipConfirm) {
            const confirmed = window.confirm('Clear the local scene? This removes unsaved changes on this device only.')
            if (!confirmed) return
        }
        setObjects?.(defaultScene.objects)
        setBackgroundColor?.(defaultScene.backgroundColor)
        setGridSize?.(defaultScene.gridSize)
        setAmbientLight?.(defaultScene.ambientLight)
        setDirectionalLight?.(defaultScene.directionalLight)
        setDefault3DView?.(defaultScene.default3DView)
        if (defaultGridAppearance) {
            setGridAppearance?.(defaultGridAppearance)
        }
        setTransformSnaps?.(defaultScene.transformSnaps)
        setRemoteSceneVersion?.(null)
        resetRemoteAssets?.()
        // restore UI visibility flags to defaults so a cleared scene is visible
        setIsGridVisible?.(defaultScene.isGridVisible)
        setIsGizmoVisible?.(defaultScene.isGizmoVisible)
        setIsPerfVisible?.(defaultScene.isPerfVisible)
        setIsUiVisible?.(true)
        setCameraPosition?.(defaultScene.savedView.position)
        setCameraTarget?.(defaultScene.savedView.target)
        if (resetSceneVersionOnClear) {
            setSceneVersion?.(0)
        }

        // force controls to update immediately so camera position takes effect
        if (controlsRef?.current) {
            controlsRef.current.target.set(...defaultScene.savedView.target)
            controlsRef.current.object.position.set(...defaultScene.savedView.position)
            controlsRef.current.update()
        }

        clearSelection?.()
        // IMPORTANT: persist the cleared scene to local storage so server doesn't reload it
        const clearedSceneData = getBaseSceneData?.()
        if (clearedSceneData) {
            persistSceneDataWithStatus?.(clearedSceneData, 'Scene cleared')
            updateSceneSignature?.(clearedSceneData)
        }
        // Block server sync from reloading after clear
        if (skipServerLoadRef) {
            skipServerLoadRef.current = true
            setTimeout(() => {
                skipServerLoadRef.current = false
            }, 500)
        }
        await clearAllAssets?.()
        resetAssetStoreQuotaState?.()
        if (!silent) {
            alert('Scene cleared.')
        }
    }, [
        clearAllAssets,
        clearSelection,
        controlsRef,
        defaultGridAppearance,
        getBaseSceneData,
        persistSceneDataWithStatus,
        resetAssetStoreQuotaState,
        resetRemoteAssets,
        setAmbientLight,
        setBackgroundColor,
        setCameraPosition,
        setCameraTarget,
        setDefault3DView,
        setDirectionalLight,
        setGridAppearance,
        setGridSize,
        setIsGizmoVisible,
        setIsGridVisible,
        setIsPerfVisible,
        setIsUiVisible,
        setObjects,
        setRemoteSceneVersion,
        setSceneVersion,
        setTransformSnaps,
        skipServerLoadRef,
        updateSceneSignature,
        resetSceneVersionOnClear
    ])

    const handleSaveView = useCallback(() => {
        const savedView = getSavedViewData?.()
        if (!savedView) return
        const nextDefaultView = {
            position: savedView.position,
            target: savedView.target
        }
        setDefault3DView?.(nextDefaultView)
        const sceneData = {
            ...getBaseSceneData?.(),
            default3DView: nextDefaultView,
            savedView
        }
        if (persistSceneDataWithStatus?.(sceneData, 'Saved view locally')) {
            updateSceneSignature?.(sceneData)
            alert('View saved! It will now load on refresh.')
        }
    }, [getBaseSceneData, getSavedViewData, persistSceneDataWithStatus, setDefault3DView, updateSceneSignature])

    const handleUpdateTransformSnaps = useCallback((partial = {}) => {
        setTransformSnaps?.(prev => {
            const next = {
                translation: partial.translation ?? prev.translation,
                rotation: partial.rotation ?? prev.rotation,
                scale: partial.scale ?? prev.scale
            }
            scheduleLocalSceneSave?.(() => ({
                ...getBaseSceneData?.(),
                transformSnaps: next,
                savedView: getSavedViewData?.()
            }))
            return next
        })
    }, [getBaseSceneData, getSavedViewData, scheduleLocalSceneSave, setTransformSnaps])

    const frameObjectsInView = useCallback((items, options = {}) => {
        if (!controlsRef?.current) return

        const frameTargets = Array.isArray(items) ? items.filter(Boolean) : []
        if (!frameTargets.length) {
            controlsRef.current.update()
            return
        }

        const sphere = getPointsBoundingSphere(frameTargets.map(item => item.position), {
            minRadius: options.minRadius ?? 1
        })
        const nextView = frameSphereInControls(controlsRef.current, sphere, {
            padding: options.padding ?? 1.5,
            minRadius: options.minRadius ?? 1
        })
        if (nextView) {
            setCameraPosition?.(nextView.position)
            setCameraTarget?.(nextView.target)
        }
    }, [controlsRef, setCameraPosition, setCameraTarget])

    const handleFrameAll = useCallback(() => {
        frameObjectsInView(objects, { padding: 1.5, minRadius: 1 })
    }, [frameObjectsInView, objects])

    const handleFrameSelection = useCallback(() => {
        const ids = Array.isArray(selectedObjectIds) ? selectedObjectIds : []
        if (!ids.length) {
            handleFrameAll()
            return
        }
        const idSet = new Set(ids)
        const selectedObjects = (Array.isArray(objects) ? objects : []).filter(item => idSet.has(item.id))
        frameObjectsInView(selectedObjects, {
            padding: selectedObjects.length === 1 ? 1.35 : 1.45,
            minRadius: selectedObjects.length === 1 ? 0.75 : 1
        })
    }, [frameObjectsInView, handleFrameAll, objects, selectedObjectIds])

    useEffect(() => {
        let holdTimeout = null
        let gestureType = null

        const clearHold = () => {
            if (holdTimeout) {
                clearTimeout(holdTimeout)
                holdTimeout = null
                gestureType = null
            }
        }

        const handleTouchStart = (event) => {
            const touchCount = event.touches.length
            if (touchCount < 3) {
                clearHold()
                return
            }

            if (event.cancelable) {
                event.preventDefault()
            }
            clearHold()

            let holdDuration = 600
            if (touchCount >= 4) {
                gestureType = 'admin'
                holdDuration = 3000
            } else if (touchCount === 3) {
                gestureType = 'ui'
                holdDuration = 600
            } else {
                gestureType = null
            }

            if (gestureType) {
                holdTimeout = window.setTimeout(() => {
                    if (gestureType === 'admin') {
                        toggleAdminMode?.()
                    } else if (gestureType === 'ui') {
                        setIsUiVisible?.(prev => !prev)
                    }
                    clearHold()
                }, holdDuration)
            }
        }

        const handleTouchEnd = () => {
            clearHold()
        }

        window.addEventListener('touchstart', handleTouchStart, { passive: false })
        window.addEventListener('touchend', handleTouchEnd)
        window.addEventListener('touchcancel', handleTouchEnd)

        return () => {
            window.removeEventListener('touchstart', handleTouchStart)
            window.removeEventListener('touchend', handleTouchEnd)
            window.removeEventListener('touchcancel', handleTouchEnd)
            clearHold()
        }
    }, [setIsUiVisible, toggleAdminMode])

    return {
        handleClear,
        handleSaveView,
        handleUpdateTransformSnaps,
        handleFrameAll,
        handleFrameSelection
    }
}

export default useSceneActions
