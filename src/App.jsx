import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { getAssetBlob } from './storage/assetStore.js'
import { getAssetSourceUrl, getAssetUrlCandidates } from './services/assetSources.js'
import {
    supportsServerSpaces,
    getServerScene,
    getServerSceneOps,
    submitSceneOps
} from './services/serverSpaces.js'
import { defaultGridAppearance, defaultScene, useSceneStore } from './state/sceneStore.js'
import { useUiState } from './hooks/useUiState.js'
import { useRenderSettings, DEFAULT_RENDER_SETTINGS } from './hooks/useRenderSettings.js'
import AppSurfaceSwitch from './components/AppSurfaceSwitch.jsx'
import { useSpacesController } from './hooks/useSpacesController.js'
import { useSelectionGroups } from './hooks/useSelectionGroups.js'
import { useAppAssetPipelineState } from './hooks/useAppAssetPipelineState.js'
import { useAppControlState } from './hooks/useAppControlState.js'
import { useAppEditorInteractionState } from './hooks/useAppEditorInteractionState.js'
import { useAppHistoryState } from './hooks/useAppHistoryState.js'
import { useAppSyncCoordinatorState } from './hooks/useAppSyncCoordinatorState.js'
import { useAppSceneSyncState } from './hooks/useAppSceneSyncState.js'
import { useAppSyncSupportState } from './hooks/useAppSyncSupportState.js'
import { useCameraControls } from './hooks/useCameraControls.js'
import { useAssetRestore } from './hooks/useAssetRestore.js'
import { usePresentationState } from './hooks/usePresentationState.js'
import { APP_PAGE_PREFERENCES, buildAppSpacePath } from './utils/spaceRouting.js'
import { useFullscreen } from './hooks/useFullscreen.js'
import { useAppContextValues } from './hooks/useAppContextValues.js'
import { useAppRoute } from './hooks/useAppRoute.js'
import { useXrAr } from './hooks/useXrAr.js'
import {
    SceneContext,
    UiContext,
    SceneSettingsContext,
    XrContext,
    SyncContext,
    SpacesContext,
    ActionsContext,
    RefsContext
} from './contexts/AppContexts.js'
import { useSceneSettings } from './hooks/useSceneSettings.js'

const perspectiveCameraSettings = {
    orthographic: false,
    // move camera closer and higher for a better initial view
    position: [0, 1.6, 4],
    fov: 60,
    near: 0.1,
    far: 200
}

const DEFAULT_SCENE_REMOTE_BASE = ''
const LEGACY_DEFAULT_SCENE_BASE = ''
const LIVE_SYNC_FEATURE_ENABLED = true

const DEFAULT_SPACE_ID = 'main'

function AppInner() {
    // --- State ---
    const { route, navigateToEditor, navigateToPreferences } = useAppRoute({
        defaultSpaceId: DEFAULT_SPACE_ID
    })
    const spaceId = route.spaceId || DEFAULT_SPACE_ID
    const isPreferencesPage = route.page === APP_PAGE_PREFERENCES
    const sceneSettings = useSceneSettings({
        defaultScene,
        defaultGridAppearance,
        perspectiveCameraSettings
    })
    const {
        presentation,
        setPresentation,
        presentationMode,
        setPresentationMode,
        presentationSourceType,
        setPresentationSourceType,
        presentationUrl,
        setPresentationUrl,
        presentationHtml,
        setPresentationHtml,
        presentationFixedCamera,
        setPresentationFixedCamera
    } = usePresentationState(defaultScene.presentation)
    const isFixedCameraMode = presentationMode === 'fixed-camera'
    const activeFixedCamera = presentationFixedCamera || defaultScene.presentation.fixedCamera
    const effectiveCameraSettings = useMemo(
        () =>
            isFixedCameraMode
                ? {
                      orthographic: activeFixedCamera.projection === 'orthographic',
                      position: activeFixedCamera.position,
                      fov: activeFixedCamera.fov,
                      zoom: activeFixedCamera.zoom,
                      near: activeFixedCamera.near,
                      far: activeFixedCamera.far
                  }
                : sceneSettings.cameraSettings,
        [activeFixedCamera, isFixedCameraMode, sceneSettings.cameraSettings]
    )
    const effectiveCameraPosition = isFixedCameraMode
        ? activeFixedCamera.position
        : sceneSettings.cameraPosition
    const effectiveCameraTarget = isFixedCameraMode
        ? activeFixedCamera.target
        : sceneSettings.cameraTarget

    const sceneStore = useSceneStore({ initialObjects: defaultScene.objects, initialVersion: 0 })
    const {
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
    } = sceneStore
    const controlsRef = useRef()
    const rendererRef = useRef(null)
    const { renderSettings, setRenderSettings } = useRenderSettings({ rendererRef })
    const uiState = useUiState({
        spaceId,
        defaults: {
            isPerfVisible: defaultScene.isPerfVisible,
            isGizmoVisible: defaultScene.isGizmoVisible,
            isGridVisible: defaultScene.isGridVisible
        }
    })
    const {
        menu,
        setMenu,
        setGizmoMode,
        axisConstraint,
        setAxisConstraint,
        freeTransformRef,
        resetAxisLock,
        isPerfVisible,
        setIsPerfVisible,
        isWorldPanelVisible,
        setIsWorldPanelVisible,
        isViewPanelVisible,
        setIsViewPanelVisible,
        isMediaPanelVisible,
        setIsMediaPanelVisible,
        isAssetPanelVisible,
        setIsAssetPanelVisible,
        isOutlinerPanelVisible,
        setIsOutlinerPanelVisible,
        isSpacesPanelVisible,
        setIsSpacesPanelVisible,
        isGizmoVisible,
        setIsGizmoVisible,
        isGridVisible,
        setIsGridVisible,
        isUiVisible,
        setIsUiVisible,
        uiDefaultVisible,
        toggleUiDefaultVisible,
        isSelectionLocked,
        setIsSelectionLocked,
        interactionMode,
        toggleInteractionMode,
        isAdminMode,
        setIsAdminMode,
        layoutMode,
        toggleLayoutMode,
        layoutSide,
        cycleLayoutSide,
        isPointerDragging
    } = uiState
    const xrContextValue = useXrAr({
        default3DView: sceneSettings.default3DView,
        controlsRef,
        setCameraPosition: sceneSettings.setCameraPosition,
        setCameraTarget: sceneSettings.setCameraTarget
    })
    const xrStore = xrContextValue.xrStore
    const [assetRestoreProgress, setAssetRestoreProgress] = useState({
        active: false,
        completed: 0,
        total: 0
    })
    const [serverAssetSyncProgress, setServerAssetSyncProgress] = useState({
        active: false,
        completed: 0,
        total: 0,
        label: ''
    })
    const {
        canAccessServerSpaces,
        canSyncServerScene,
        isOfflineMode,
        setOfflineMode,
        isLiveSyncEnabled,
        setIsLiveSyncEnabled,
        shouldSyncServerScene,
        serverAssetBaseUrl,
        buildSpaceApiUrl,
        sceneStorageKey,
        localSaveStatus,
        markLocalSave,
        persistSceneDataWithStatus,
        serverSyncInfo,
        markServerSync
    } = useAppSyncSupportState({
        spaceId,
        liveSyncFeatureEnabled: LIVE_SYNC_FEATURE_ENABLED
    })
    // Safety: ensure orbit controls are not left disabled after any interaction
    useEffect(() => {
        const ensureControlsEnabled = () => {
            if (controlsRef.current) {
                controlsRef.current.enabled = true
            }
        }
        window.addEventListener('pointerup', ensureControlsEnabled)
        window.addEventListener('pointercancel', ensureControlsEnabled)
        return () => {
            window.removeEventListener('pointerup', ensureControlsEnabled)
            window.removeEventListener('pointercancel', ensureControlsEnabled)
        }
    }, [])
    const { selectionGroups, persistSelectionGroups, expandIdsWithGroups } = useSelectionGroups({
        spaceId
    })

    const remoteAssetsRef = useRef(null)
    const remoteAssetsBaseRef = useRef('')
    const {
        remoteAssetsManifest,
        remoteAssetsBaseUrl,
        resetRemoteAssets,
        setRemoteAssetsManifest,
        resetAssetStoreQuotaState,
        restoreAssetsFromPayload,
        upsertRemoteAssetEntry
    } = useAssetRestore({
        defaultSceneRemoteBase: DEFAULT_SCENE_REMOTE_BASE,
        legacySceneRemoteBase: LEGACY_DEFAULT_SCENE_BASE,
        setAssetRestoreProgress,
        remoteAssetsRef,
        remoteAssetsBaseRef
    })

    const {
        spaces,
        isCreatingSpace,
        newSpaceName,
        setNewSpaceName,
        openAfterCreateTarget,
        setOpenAfterCreateTarget,
        tempSpaceTtlHours,
        spaceNameFeedback,
        canCreateSpace,
        handleCreateNamedSpace,
        handleOpenSpace,
        handleCopySpaceLink,
        handleDeleteSpace,
        handleRenameSpace,
        handleToggleSpacePermanent,
        handleToggleSpaceEditLock,
        handleQuickSpaceCreate
    } = useSpacesController({
        spaceId,
        defaultSpaceId: DEFAULT_SPACE_ID,
        supportsServerSpaces,
        isOfflineMode,
        buildSpacePath: buildAppSpacePath,
        resetRemoteAssets
    })
    const currentSpace = useMemo(
        () => spaces.find((space) => space.id === spaceId) || null,
        [spaces, spaceId]
    )
    const isReadOnly = Boolean(canAccessServerSpaces && currentSpace?.allowEdits === false)
    const canEditScene = !isReadOnly || isAdminMode
    const canPublishToServer = canAccessServerSpaces && canEditScene
    const canUploadServerAssets = canPublishToServer && !isOfflineMode

    const {
        remoteSceneVersion,
        sceneVersionRef,
        updateSceneSignature,
        applyRemoteScene,
        isLoading,
        liveClientIdRef,
        displayName,
        setDisplayName,
        effectiveDisplayName,
        isSocketConnected,
        collaborators,
        usersInSpace,
        participantRoster,
        remoteCursorMarkers,
        handleCanvasPointerMove,
        handleCanvasPointerLeave,
        socketEmit,
        isSceneStreamConnected,
        sceneStreamState,
        sceneStreamError,
        fileInputRef,
        skipServerLoadRef,
        setRemoteSceneVersion
    } = useAppSceneSyncState({
        liveSyncFeatureEnabled: LIVE_SYNC_FEATURE_ENABLED,
        sceneStorageKey,
        spaceId,
        canAccessServerSpaces,
        isOfflineMode,
        isLiveSyncEnabled,
        isPointerDragging,
        buildSpaceApiUrl,
        serverAssetBaseUrl,
        supportsServerSpaces,
        getServerScene,
        getServerSceneOps,
        submitSceneOps,
        sceneSettings,
        objects,
        renderSettings,
        setRenderSettings,
        presentation,
        setPresentation,
        sceneVersion,
        setSceneVersion,
        persistSceneDataWithStatus,
        markServerSync,
        setAssetRestoreProgress,
        setRemoteAssetsManifest,
        resetRemoteAssets,
        resetAssetStoreQuotaState,
        restoreAssetsFromPayload,
        clearSelection,
        getAssetUrlCandidates,
        getAssetSourceUrl,
        defaultGridAppearance,
        defaultRenderSettings: DEFAULT_RENDER_SETTINGS,
        defaultSceneRemoteBase: DEFAULT_SCENE_REMOTE_BASE,
        legacySceneRemoteBase: LEGACY_DEFAULT_SCENE_BASE,
        setObjects,
        setIsGridVisible,
        setIsGizmoVisible,
        setIsPerfVisible
    })

    const { cloneObjects, canUndo, canRedo, handleUndo, handleRedo } = useAppHistoryState({
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
        defaultRenderSettings: DEFAULT_RENDER_SETTINGS,
        perspectiveCameraSettings
    })

    useEffect(() => {
        if (!isAdminMode || !isUiVisible) {
            setIsSpacesPanelVisible(false)
        }
    }, [isAdminMode, isUiVisible, setIsSpacesPanelVisible])
    useCameraControls({
        controlsRef,
        isLoading,
        cameraSettings: effectiveCameraSettings,
        cameraPosition: effectiveCameraPosition,
        cameraTarget: effectiveCameraTarget,
        setCameraPosition: sceneSettings.setCameraPosition,
        setCameraTarget: sceneSettings.setCameraTarget,
        captureCameraChanges: presentationMode === 'scene'
    })

    // Break the editor/sync initialization cycle with stable wrappers.
    const getBaseSceneDataRef = useRef(() => null)
    const getSavedViewDataRef = useRef(() => null)
    const scheduleLocalSceneSaveRef = useRef(() => {})
    const getBaseSceneDataForEditor = useCallback((...args) => getBaseSceneDataRef.current(...args), [])
    const getSavedViewDataForEditor = useCallback((...args) => getSavedViewDataRef.current(...args), [])
    const scheduleLocalSceneSaveForEditor = useCallback((...args) => scheduleLocalSceneSaveRef.current(...args), [])

    const {
        guardEditAction,
        toggleAdminMode,
        handleAddObject,
        handleCreateSelectionGroup,
        handleSelectSelectionGroup,
        handleDeleteSelectionGroup,
        handleUngroupSelection,
        selectionHasGroup,
        handleClear,
        handleSaveView,
        handleUpdateTransformSnaps,
        handleFrameAll,
        handleFrameSelection,
        selectObject,
        selectAllObjects,
        copySelectedObject,
        pasteClipboardObject,
        cutSelectedObject,
        duplicateSelectedObject,
        deleteSelectedObject,
        handleSelectObjectFromOutliner,
        handleToggleObjectVisibility
    } = useAppEditorInteractionState({
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
        menuPosition3D: menu.position3D,
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
        getBaseSceneData: getBaseSceneDataForEditor,
        getSavedViewData: getSavedViewDataForEditor,
        persistSceneDataWithStatus,
        updateSceneSignature,
        skipServerLoadRef,
        resetAssetStoreQuotaState,
        scheduleLocalSceneSave: scheduleLocalSceneSaveForEditor,
        defaultGridAppearance,
        liveSyncFeatureEnabled: LIVE_SYNC_FEATURE_ENABLED,
        isPreferencesPage,
        setGizmoMode,
        toggleInteractionMode,
        setIsSelectionLocked,
        handleUndo,
        handleRedo
    })

    const {
        isFileDragActive,
        uploadProgress,
        serverAssetSyncPending,
        mediaOptimizationPreference,
        setMediaOptimizationPreference,
        mediaOptimizationStatus,
        handleBatchMediaOptimization,
        handleAssetFilesUpload,
        handleManualMediaOptimization,
        uploadAssetToServer
    } = useAppAssetPipelineState({
        controlsRef,
        guardEditAction,
        handleAddObject,
        objects,
        setObjects,
        canUploadServerAssets,
        spaceId,
        serverAssetBaseUrl,
        upsertRemoteAssetEntry,
        getAssetBlob,
        getAssetSourceUrl
    })

    const { isFullscreen, handleEnterFullscreen } = useFullscreen()

    const {
        handleSave,
        handleLoadClick,
        handleFileLoad,
        handleKeepCurrentWorld,
        handleReloadFromServer,
        handlePublishToServer,
        handleToggleOfflineMode,
        getBaseSceneData: getBaseSceneDataFromSync,
        getSavedViewData: getSavedViewDataFromSync,
        scheduleLocalSceneSave: scheduleLocalSceneSaveFromSync
    } = useAppSyncCoordinatorState({
        liveSyncFeatureEnabled: LIVE_SYNC_FEATURE_ENABLED,
        shouldSyncServerScene,
        captureSavedViewFromControls: presentationMode === 'scene',
        controlsRef,
        sceneSettings,
        objects,
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
        remoteSceneVersion,
        sceneVersion,
        remoteAssetsRef,
        remoteAssetsBaseRef,
        remoteAssetsManifest,
        remoteAssetsBaseUrl,
        persistSceneDataWithStatus,
        updateSceneSignature,
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
        clearSelection,
        defaultGridAppearance,
        defaultRenderSettings: DEFAULT_RENDER_SETTINGS,
        isLoading,
        canPublishToServer,
        canUploadServerAssets,
        isOfflineMode,
        setOfflineMode,
        serverAssetBaseUrl,
        markServerSync,
        applyRemoteScene,
        getServerScene,
        uploadAssetToServer,
        setServerAssetSyncProgress
    })

    getBaseSceneDataRef.current = getBaseSceneDataFromSync
    getSavedViewDataRef.current = getSavedViewDataFromSync
    scheduleLocalSceneSaveRef.current = scheduleLocalSceneSaveFromSync

    const {
        canCreateGroupSelection,
        isStatusPanelVisible,
        setIsStatusPanelVisible,
        sceneButtons,
        panelButtons,
        adminButtons,
        displayButtons,
        xrButtons,
        hiddenUiButtons
    } = useAppControlState({
        spaceId,
        handleCopySpaceLink,
        selectedObjectIds,
        localSaveStatus,
        markLocalSave,
        serverSyncInfo,
        markServerSync,
        setPresentationMode,
        setIsUiVisible,
        xrContextValue,
        isCreatingSpace,
        handleQuickSpaceCreate,
        guardEditAction,
        handleCreateSelectionGroup,
        selectionHasGroup,
        handleUngroupSelection,
        isUiVisible,
        handleSave,
        handleLoadClick,
        isOfflineMode,
        handleToggleOfflineMode,
        handleUndo,
        handleRedo,
        canUndo,
        canRedo,
        handleClear,
        navigateToPreferences,
        isViewPanelVisible,
        setIsViewPanelVisible,
        isWorldPanelVisible,
        setIsWorldPanelVisible,
        isMediaPanelVisible,
        setIsMediaPanelVisible,
        isAssetPanelVisible,
        setIsAssetPanelVisible,
        isOutlinerPanelVisible,
        setIsOutlinerPanelVisible,
        isAdminMode,
        isReadOnly,
        canAccessServerSpaces,
        handleToggleSpaceEditLock,
        isSpacesPanelVisible,
        setIsSpacesPanelVisible,
        liveSyncFeatureEnabled: LIVE_SYNC_FEATURE_ENABLED,
        isLiveSyncEnabled,
        setIsLiveSyncEnabled,
        canSyncServerScene,
        handleReloadFromServer,
        handlePublishToServer,
        canPublishToServer,
        isFullscreen,
        handleEnterFullscreen,
        interactionMode,
        toggleInteractionMode,
        isSelectionLocked,
        setIsSelectionLocked,
        uiDefaultVisible,
        toggleUiDefaultVisible,
        layoutMode,
        toggleLayoutMode,
        layoutSide,
        cycleLayoutSide,
        presentationMode
    })

    const { sceneSettingsContext, syncState, spacesState, handlers, refs, editorLayoutProps } =
        useAppContextValues({
            sceneSettings,
            renderSettings,
            setRenderSettings,
            presentation,
            setPresentation,
            presentationMode,
            setPresentationMode,
            presentationSourceType,
            setPresentationSourceType,
            presentationUrl,
            setPresentationUrl,
            presentationHtml,
            setPresentationHtml,
            presentationFixedCamera,
            setPresentationFixedCamera,
            selectionGroups,
            canUndo,
            canRedo,
            liveSyncFeatureEnabled: LIVE_SYNC_FEATURE_ENABLED,
            supportsServerSpaces,
            isLiveSyncEnabled,
            setIsLiveSyncEnabled,
            canSyncServerScene,
            spaceId,
            isOfflineMode,
            setOfflineMode,
            shouldSyncServerScene,
            canPublishToServer,
            isReadOnly,
            serverSyncInfo,
            localSaveStatus,
            uploadProgress,
            assetRestoreProgress,
            serverAssetSyncProgress,
            serverAssetSyncPending,
            mediaOptimizationStatus,
            remoteAssetsManifest,
            remoteAssetsBaseUrl,
            setRemoteAssetsManifest,
            isStatusPanelVisible,
            setIsStatusPanelVisible,
            displayName,
            setDisplayName,
            effectiveDisplayName,
            isSocketConnected,
            isSceneStreamConnected,
            sceneStreamState,
            sceneStreamError,
            collaborators,
            usersInSpace,
            participantRoster,
            remoteCursorMarkers,
            spaces,
            newSpaceName,
            setNewSpaceName,
            openAfterCreateTarget,
            setOpenAfterCreateTarget,
            spaceNameFeedback,
            canCreateSpace,
            tempSpaceTtlHours,
            isCreatingSpace,
            guardEditAction,
            handleAddObject,
            handleSaveView,
            handleFrameAll,
            handleFrameSelection,
            handleUpdateTransformSnaps,
            handleSave,
            handleLoadClick,
            handleKeepCurrentWorld,
            handleClear,
            handleAssetFilesUpload,
            handleUndo,
            handleRedo,
            selectObject,
            handleSelectObjectFromOutliner,
            handleToggleObjectVisibility,
            selectAllObjects,
            resetAxisLock,
            toggleAdminMode,
            handleManualMediaOptimization,
            handleBatchMediaOptimization,
            copySelectedObject,
            pasteClipboardObject,
            cutSelectedObject,
            duplicateSelectedObject,
            deleteSelectedObject,
            handleUngroupSelection,
            expandIdsWithGroups,
            handleCreateSelectionGroup,
            handleSelectSelectionGroup,
            handleDeleteSelectionGroup,
            handleCreateNamedSpace,
            handleOpenSpace,
            handleCopySpaceLink,
            handleDeleteSpace,
            handleRenameSpace,
            handleToggleSpacePermanent,
            handleToggleSpaceEditLock,
            handleReloadFromServer,
            handlePublishToServer,
            socketEmit,
            controlsRef,
            fileInputRef,
            handleFileLoad,
            sceneButtons,
            panelButtons,
            adminButtons,
            displayButtons,
            xrButtons,
            hiddenUiButtons,
            isLoading,
            isFileDragActive,
            mediaOptimizationPreference,
            setMediaOptimizationPreference,
            canCreateGroupSelection,
            xrStore,
            currentCameraSettings: effectiveCameraSettings,
            cameraPosition: effectiveCameraPosition,
            rendererRef,
            handleCanvasPointerMove,
            handleCanvasPointerLeave
        })

    return (
        <SceneContext.Provider value={sceneStore}>
            <UiContext.Provider value={uiState}>
                <SceneSettingsContext.Provider value={sceneSettingsContext}>
                    <XrContext.Provider value={xrContextValue}>
                        <SyncContext.Provider value={syncState}>
                            <SpacesContext.Provider value={spacesState}>
                                <ActionsContext.Provider value={handlers}>
                                    <RefsContext.Provider value={refs}>
                                        <AppSurfaceSwitch
                                            isPreferencesPage={isPreferencesPage}
                                            onNavigateToEditor={navigateToEditor}
                                            editorLayoutProps={editorLayoutProps}
                                        />
                                    </RefsContext.Provider>
                                </ActionsContext.Provider>
                            </SpacesContext.Provider>
                        </SyncContext.Provider>
                    </XrContext.Provider>
                </SceneSettingsContext.Provider>
            </UiContext.Provider>
        </SceneContext.Provider>
    )
}

export default function App() {
    return <AppInner />
}
