import { clearAllAssets } from '../storage/assetStore.js'
import { useEditorShortcuts } from './useEditorShortcuts.js'
import { usePointerTransform } from './usePointerTransform.js'
import { useSceneActions } from './useSceneActions.js'
import { useSelectionGroupActions } from './useSelectionGroupActions.js'

export function useAppEditorActions({
    guardEditAction,
    toggleAdminMode,
    selectionGroups,
    persistSelectionGroups,
    selectedObjectIds,
    applySelection,
    expandIdsWithGroups,
    resetAxisLock,
    axisConstraint,
    setAxisConstraint,
    freeTransformRef,
    applyFreeTransformDelta,
    controlsRef,
    isLoading,
    objects,
    setObjects,
    sceneSettings,
    setPresentation,
    setRemoteSceneVersion,
    resetRemoteAssets,
    setIsGridVisible,
    setIsGizmoVisible,
    setIsPerfVisible,
    setIsUiVisible,
    setSceneVersion,
    clearSelection,
    getBaseSceneData,
    getSavedViewData,
    persistSceneDataWithStatus,
    updateSceneSignature,
    skipServerLoadRef,
    resetAssetStoreQuotaState,
    scheduleLocalSceneSave,
    defaultGridAppearance,
    liveSyncFeatureEnabled,
    isPreferencesPage,
    setGizmoMode,
    toggleInteractionMode,
    setIsSelectionLocked,
    handleUndo,
    handleRedo,
    deleteSelectedObject,
    copySelectedObject,
    pasteClipboardObject,
    cutSelectedObject,
    duplicateSelectedObject,
    selectAllObjects
} = {}) {
    const selectionGroupActions = useSelectionGroupActions({
        selectionGroups,
        persistSelectionGroups,
        selectedObjectIds,
        applySelection,
        expandIdsWithGroups,
        resetAxisLock
    })

    const sceneActions = useSceneActions({
        controlsRef,
        objects,
        selectedObjectIds,
        setObjects,
        setBackgroundColor: sceneSettings.setBackgroundColor,
        setGridSize: sceneSettings.setGridSize,
        setAmbientLight: sceneSettings.setAmbientLight,
        setDirectionalLight: sceneSettings.setDirectionalLight,
        setDefault3DView: sceneSettings.setDefault3DView,
        setGridAppearance: sceneSettings.setGridAppearance,
        setTransformSnaps: sceneSettings.setTransformSnaps,
        setPresentation,
        setRemoteSceneVersion,
        resetRemoteAssets,
        setIsGridVisible,
        setIsGizmoVisible,
        setIsPerfVisible,
        setIsUiVisible,
        setCameraPosition: sceneSettings.setCameraPosition,
        setCameraTarget: sceneSettings.setCameraTarget,
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
        resetSceneVersionOnClear: !liveSyncFeatureEnabled
    })

    usePointerTransform({
        axisConstraint,
        freeTransformRef,
        applyFreeTransformDelta: guardEditAction(applyFreeTransformDelta)
    })

    useEditorShortcuts({
        isEnabled: !isPreferencesPage,
        axisConstraint,
        setAxisConstraint,
        resetAxisLock,
        freeTransformRef,
        setIsGizmoVisible,
        setGizmoMode,
        toggleAdminMode,
        toggleInteractionMode,
        setIsPerfVisible,
        setIsUiVisible,
        setIsSelectionLocked,
        handleUndo,
        handleRedo,
        deleteSelectedObject: guardEditAction(deleteSelectedObject),
        copySelectedObject,
        pasteClipboardObject: guardEditAction(pasteClipboardObject),
        cutSelectedObject: guardEditAction(cutSelectedObject),
        duplicateSelectedObject: guardEditAction(duplicateSelectedObject),
        handleCreateSelectionGroup: guardEditAction(
            selectionGroupActions.handleCreateSelectionGroup
        ),
        handleUngroupSelection: guardEditAction(selectionGroupActions.handleUngroupSelection),
        selectAllObjects,
        handleFrameSelection: sceneActions.handleFrameSelection
    })

    return {
        ...selectionGroupActions,
        ...sceneActions
    }
}

export default useAppEditorActions
