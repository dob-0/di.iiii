import { useCallback } from 'react'
import { useSceneAutosave } from './useSceneAutosave.js'
import { useSceneArchiveIO } from './useSceneArchiveIO.js'
import { useScenePersistenceCoordinator } from './useScenePersistenceCoordinator.js'
import { useServerPublishing } from './useServerPublishing.js'

export function useSceneSyncCoordinator({
    controlsRef,
    cameraPosition,
    cameraTarget,
    setCameraPosition,
    setCameraTarget,
    objects,
    backgroundColor,
    gridSize,
    gridAppearance,
    renderSettings,
    transformSnaps,
    isGridVisible,
    isGizmoVisible,
    isPerfVisible,
    directionalLight,
    ambientLight,
    default3DView,
    remoteSceneVersion,
    sceneVersion,
    remoteAssetsRef,
    remoteAssetsBaseRef,
    persistSceneDataWithStatus,
    updateSceneSignature,
    shouldSyncServerScene,
    submitSceneOps,
    spaceId,
    liveClientIdRef,
    sceneVersionRef,
    setSceneVersion,
    fileInputRef,
    setRemoteSceneVersion,
    resetRemoteAssets,
    getAssetBlob,
    getAssetSourceUrl,
    resetAssetStoreQuotaState,
    restoreAssetsFromPayload,
    setRemoteAssetsManifest,
    setObjects,
    setBackgroundColor,
    setGridSize,
    setGridAppearance,
    setRenderSettings,
    setTransformSnaps,
    setIsGridVisible,
    setIsGizmoVisible,
    setIsPerfVisible,
    setAmbientLight,
    setDirectionalLight,
    setDefault3DView,
    clearSelection,
    defaultGridAppearance,
    defaultRenderSettings,
    isLoading,
    canPublishToServer,
    canUploadServerAssets,
    isOfflineMode,
    serverAssetBaseUrl,
    setOfflineMode,
    markServerSync,
    applyRemoteScene,
    getServerScene,
    uploadAssetToServer,
    setServerAssetSyncProgress
}) {
    const { getBaseSceneData, getSavedViewData, scheduleServerSceneSave } = useScenePersistenceCoordinator({
        controlsRef,
        cameraPosition,
        cameraTarget,
        setCameraPosition,
        setCameraTarget,
        objects,
        backgroundColor,
        gridSize,
        gridAppearance,
        renderSettings,
        transformSnaps,
        isGridVisible,
        isGizmoVisible,
        isPerfVisible,
        directionalLight,
        ambientLight,
        default3DView,
        remoteSceneVersion,
        sceneVersion,
        remoteAssetsRef,
        remoteAssetsBaseRef,
        persistSceneDataWithStatus,
        updateSceneSignature,
        shouldSyncServerScene,
        submitSceneOps,
        spaceId,
        liveClientIdRef,
        sceneVersionRef,
        setSceneVersion
    })

    const { handleSave, handleLoadClick, handleFileLoad } = useSceneArchiveIO({
        fileInputRef,
        setRemoteSceneVersion,
        resetRemoteAssets,
        getBaseSceneData,
        getSavedViewData,
        persistSceneDataWithStatus,
        updateSceneSignature,
        getAssetBlob,
        getAssetSourceUrl,
        resetAssetStoreQuotaState,
        restoreAssetsFromPayload,
        setRemoteAssetsManifest,
        setObjects,
        setBackgroundColor,
        setGridSize,
        setGridAppearance,
        setRenderSettings,
        setTransformSnaps,
        setIsGridVisible,
        setIsGizmoVisible,
        setIsPerfVisible,
        setAmbientLight,
        setDirectionalLight,
        setDefault3DView,
        setCameraPosition,
        setCameraTarget,
        clearSelection,
        defaultGridAppearance,
        defaultRenderSettings
    })

    const { scheduleLocalSceneSave } = useSceneAutosave({
        getBaseSceneData,
        getSavedViewData,
        persistSceneData: persistSceneDataWithStatus,
        scheduleServerSceneSave,
        updateSceneSignature,
        isLoading,
        dependencies: [
            objects,
            backgroundColor,
            gridSize,
            ambientLight,
            directionalLight,
            default3DView,
            gridAppearance,
            renderSettings,
            transformSnaps,
            isGridVisible,
            isGizmoVisible,
            isPerfVisible,
            cameraPosition,
            cameraTarget,
            remoteSceneVersion
        ]
    })

    const handleKeepCurrentWorld = useCallback(() => {
        setRemoteSceneVersion(null)
        const sceneData = {
            ...getBaseSceneData(),
            savedView: getSavedViewData()
        }
        sceneData.defaultSceneVersion = null
        if (persistSceneDataWithStatus(sceneData, 'Saved locally (manual)')) {
            updateSceneSignature(sceneData)
            alert('Saved locally. Refresh will load this copy. Use Publish to sync to server.')
        }
    }, [getBaseSceneData, getSavedViewData, persistSceneDataWithStatus, setRemoteSceneVersion, updateSceneSignature])

    const { handleReloadFromServer, handlePublishToServer } = useServerPublishing({
        canPublishToServer,
        canUploadServerAssets,
        spaceId,
        isOfflineMode,
        serverAssetBaseUrl,
        setOfflineMode,
        markServerSync,
        applyRemoteScene,
        getServerScene,
        submitSceneOps,
        getBaseSceneData,
        getSavedViewData,
        objects,
        getAssetBlob,
        getAssetSourceUrl,
        uploadAssetToServer,
        setServerAssetSyncProgress,
        sceneVersionRef,
        setSceneVersion,
        liveClientIdRef
    })

    return {
        getBaseSceneData,
        getSavedViewData,
        scheduleServerSceneSave,
        scheduleLocalSceneSave,
        handleSave,
        handleLoadClick,
        handleFileLoad,
        handleKeepCurrentWorld,
        handleReloadFromServer,
        handlePublishToServer
    }
}

export default useSceneSyncCoordinator
