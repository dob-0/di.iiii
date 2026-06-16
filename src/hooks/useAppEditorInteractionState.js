import { useAppEditorActions } from './useAppEditorActions.js'
import { useGuardedEditActions } from './useGuardedEditActions.js'
import { useObjectActions } from './useObjectActions.js'
import { useObjectFactory } from './useObjectFactory.js'

export function useAppEditorInteractionState({
    canEditScene,
    isReadOnly,
    setIsAdminMode,
    setIsGizmoVisible,
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
    socketEmit,
    menuPosition3D,
    setMenu,
    selectionGroups,
    persistSelectionGroups,
    resetAxisLock,
    axisConstraint,
    setAxisConstraint,
    freeTransformRef,
    controlsRef,
    isLoading,
    sceneSettings,
    setPresentation,
    setRemoteSceneVersion,
    resetRemoteAssets,
    setIsGridVisible,
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
    handleRedo
} = {}) {
    const { guardEditAction, toggleAdminMode } = useGuardedEditActions({
        canEditScene,
        isReadOnly,
        setIsAdminMode,
        setIsGizmoVisible
    })

    const objectActions = useObjectActions({
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
    })

    const { handleAddObject } = useObjectFactory({
        menuPosition3D,
        setMenu,
        setObjects,
        applySelection,
        socketEmit
    })

    const editorActions = useAppEditorActions({
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
        applyFreeTransformDelta: objectActions.applyFreeTransformDelta,
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
        deleteSelectedObject: objectActions.deleteSelectedObject,
        copySelectedObject: objectActions.copySelectedObject,
        pasteClipboardObject: objectActions.pasteClipboardObject,
        cutSelectedObject: objectActions.cutSelectedObject,
        duplicateSelectedObject: objectActions.duplicateSelectedObject,
        selectAllObjects: objectActions.selectAllObjects
    })

    return {
        guardEditAction,
        toggleAdminMode,
        handleAddObject,
        ...objectActions,
        ...editorActions
    }
}

export default useAppEditorInteractionState
