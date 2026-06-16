import { useCallback, useMemo } from 'react'
import { useSceneHistory } from './useSceneHistory.js'

export function useAppHistoryState({
    objects,
    sceneSettings,
    renderSettings,
    setRenderSettings,
    presentation,
    setPresentation,
    isGridVisible,
    setIsGridVisible,
    isGizmoVisible,
    setIsGizmoVisible,
    isPerfVisible,
    setIsPerfVisible,
    setObjects,
    clearSelection,
    isLoading,
    defaultScene,
    defaultGridAppearance,
    defaultRenderSettings,
    perspectiveCameraSettings
} = {}) {
    const cloneObjects = useCallback((value) => JSON.parse(JSON.stringify(value)), [])

    const snapshot = useMemo(
        () => ({
            objects,
            backgroundColor: sceneSettings.backgroundColor,
            gridSize: sceneSettings.gridSize,
            gridAppearance: sceneSettings.gridAppearance,
            renderSettings,
            cameraSettings: sceneSettings.cameraSettings,
            transformSnaps: sceneSettings.transformSnaps,
            isGridVisible,
            isGizmoVisible,
            isPerfVisible,
            ambientLight: sceneSettings.ambientLight,
            directionalLight: sceneSettings.directionalLight,
            default3DView: sceneSettings.default3DView,
            presentation: {
                mode: presentation.mode,
                sourceType: presentation.sourceType,
                url: presentation.url,
                fixedCamera: presentation.fixedCamera
            },
            cameraPosition: sceneSettings.cameraPosition,
            cameraTarget: sceneSettings.cameraTarget
        }),
        [
            objects,
            sceneSettings.backgroundColor,
            sceneSettings.gridSize,
            sceneSettings.gridAppearance,
            renderSettings,
            sceneSettings.cameraSettings,
            sceneSettings.transformSnaps,
            isGridVisible,
            isGizmoVisible,
            isPerfVisible,
            sceneSettings.ambientLight,
            sceneSettings.directionalLight,
            sceneSettings.default3DView,
            presentation,
            sceneSettings.cameraPosition,
            sceneSettings.cameraTarget
        ]
    )

    const restoreSnapshot = useCallback(
        (nextSnapshot) => {
            if (!nextSnapshot || typeof nextSnapshot !== 'object') return
            setObjects(cloneObjects(nextSnapshot.objects || []))
            sceneSettings.setBackgroundColor(
                nextSnapshot.backgroundColor || defaultScene.backgroundColor
            )
            sceneSettings.setGridSize(nextSnapshot.gridSize || defaultScene.gridSize)
            sceneSettings.setGridAppearance(nextSnapshot.gridAppearance || defaultGridAppearance)
            setRenderSettings(nextSnapshot.renderSettings || defaultRenderSettings)
            sceneSettings.setCameraSettings(
                nextSnapshot.cameraSettings || perspectiveCameraSettings
            )
            sceneSettings.setTransformSnaps(
                nextSnapshot.transformSnaps || defaultScene.transformSnaps
            )
            setIsGridVisible(
                typeof nextSnapshot.isGridVisible === 'boolean'
                    ? nextSnapshot.isGridVisible
                    : defaultScene.isGridVisible
            )
            setIsGizmoVisible(
                typeof nextSnapshot.isGizmoVisible === 'boolean'
                    ? nextSnapshot.isGizmoVisible
                    : defaultScene.isGizmoVisible
            )
            setIsPerfVisible(
                typeof nextSnapshot.isPerfVisible === 'boolean'
                    ? nextSnapshot.isPerfVisible
                    : defaultScene.isPerfVisible
            )
            if (nextSnapshot.presentation) {
                setPresentation((prev) => ({
                    ...prev,
                    ...nextSnapshot.presentation,
                    fixedCamera: nextSnapshot.presentation.fixedCamera || prev.fixedCamera
                }))
            }
            sceneSettings.setAmbientLight(nextSnapshot.ambientLight || defaultScene.ambientLight)
            sceneSettings.setDirectionalLight(
                nextSnapshot.directionalLight || defaultScene.directionalLight
            )
            sceneSettings.setDefault3DView(nextSnapshot.default3DView || defaultScene.default3DView)
            sceneSettings.setCameraPosition(
                nextSnapshot.cameraPosition || defaultScene.savedView.position
            )
            sceneSettings.setCameraTarget(
                nextSnapshot.cameraTarget || defaultScene.savedView.target
            )
            clearSelection()
        },
        [
            clearSelection,
            cloneObjects,
            defaultGridAppearance,
            defaultRenderSettings,
            defaultScene,
            perspectiveCameraSettings,
            sceneSettings,
            setIsGizmoVisible,
            setIsGridVisible,
            setIsPerfVisible,
            setObjects,
            setPresentation,
            setRenderSettings
        ]
    )

    const history = useSceneHistory({
        snapshot,
        restoreSnapshot,
        isLoading,
        cloneSnapshot: cloneObjects
    })

    return {
        cloneObjects,
        ...history
    }
}

export default useAppHistoryState
