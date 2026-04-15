import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { 
    getAssetBlob, 
    clearAllAssets
} from './storage/assetStore.js'
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
import { getSceneStorageKey, persistSceneToLocalStorage } from './storage/scenePersistence.js'
import EditorLayoutContainer from './components/EditorLayoutContainer.jsx'
import PreferencesPage from './components/PreferencesPage.jsx'
import { useControlButtons } from './hooks/useControlButtons.js'
import { useSpaceLabel } from './hooks/useSpaceLabel.js'
import { useSpacesController } from './hooks/useSpacesController.js'
import { useSelectionGroups } from './hooks/useSelectionGroups.js'
import { useSceneApply } from './hooks/useSceneApply.js'
import { useSceneInitializer } from './hooks/useSceneInitializer.js'
import { useSceneHistory } from './hooks/useSceneHistory.js'
import { useAssetPipeline } from './hooks/useAssetPipeline.js'
import { useObjectActions } from './hooks/useObjectActions.js'
import { useObjectFactory } from './hooks/useObjectFactory.js'
import { useCameraControls } from './hooks/useCameraControls.js'
import { useEditorShortcuts } from './hooks/useEditorShortcuts.js'
import { useSelectionGroupActions } from './hooks/useSelectionGroupActions.js'
import { useStatusState } from './hooks/useStatusState.js'
import { useSceneSyncCoordinator } from './hooks/useSceneSyncCoordinator.js'
import { useAssetRestore } from './hooks/useAssetRestore.js'
import { useSceneActions } from './hooks/useSceneActions.js'
import { useSyncPreferences } from './hooks/useSyncPreferences.js'
import { useServerEndpoints } from './hooks/useServerEndpoints.js'
import { usePresentationState } from './hooks/usePresentationState.js'
import { APP_PAGE_PREFERENCES, buildAppSpacePath } from './utils/spaceRouting.js'
import { useFullscreen } from './hooks/useFullscreen.js'
import { usePointerTransform } from './hooks/usePointerTransform.js'
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
import { useCollaborativeSession } from './hooks/useCollaborativeSession.js'

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
    const { route, navigateToEditor, navigateToPreferences } = useAppRoute({ defaultSpaceId: DEFAULT_SPACE_ID })
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
    const effectiveCameraSettings = useMemo(() => (
        isFixedCameraMode
            ? {
                orthographic: activeFixedCamera.projection === 'orthographic',
                position: activeFixedCamera.position,
                fov: activeFixedCamera.fov,
                zoom: activeFixedCamera.zoom,
                near: activeFixedCamera.near,
                far: activeFixedCamera.far
            }
            : sceneSettings.cameraSettings
    ), [activeFixedCamera, isFixedCameraMode, sceneSettings.cameraSettings])
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
    const [remoteSceneVersion, setRemoteSceneVersion] = useState(null)
    const sceneVersionRef = useRef(sceneVersion)
    const canAccessServerSpaces = supportsServerSpaces && Boolean(spaceId)
    const canSyncServerScene = LIVE_SYNC_FEATURE_ENABLED && canAccessServerSpaces
    const {
        isOfflineMode,
        setOfflineMode,
        isLiveSyncEnabled,
        setIsLiveSyncEnabled,
        shouldSyncServerScene
    } = useSyncPreferences({
        spaceId,
        liveSyncFeatureEnabled: LIVE_SYNC_FEATURE_ENABLED,
        canSyncServerScene
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
    const { serverAssetBaseUrl, buildSpaceApiUrl } = useServerEndpoints(spaceId)
    const sceneStorageKey = useMemo(() => getSceneStorageKey(spaceId), [spaceId])
    const persistSceneData = useCallback(
        (sceneData) => persistSceneToLocalStorage(sceneData, sceneStorageKey),
        [sceneStorageKey]
    )
    const [localSaveStatus, setLocalSaveStatus] = useState({ ts: null, label: 'Not saved locally' })
    const markLocalSave = useCallback((label = 'Saved locally') => {
        setLocalSaveStatus({ ts: Date.now(), label })
    }, [])
    const persistSceneDataWithStatus = useCallback(
        (sceneData, label = 'Auto-saved locally') => {
            const ok = persistSceneData(sceneData)
            if (ok) {
                markLocalSave(label)
            }
            return ok
        },
        [markLocalSave, persistSceneData]
    )
    const [serverSyncInfo, setServerSyncInfo] = useState({ ts: null, label: 'Server: not synced yet' })
    const markServerSync = useCallback((label = 'Synced with server') => {
        setServerSyncInfo({ ts: Date.now(), label })
    }, [])
    const {
        selectionGroups,
        persistSelectionGroups,
        expandIdsWithGroups
    } = useSelectionGroups({ spaceId })

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
    const currentSpace = useMemo(() => spaces.find(space => space.id === spaceId) || null, [spaces, spaceId])
    const isReadOnly = Boolean(canAccessServerSpaces && currentSpace?.allowEdits === false)
    const canEditScene = !isReadOnly || isAdminMode
    const canPublishToServer = canAccessServerSpaces && canEditScene
    const canUploadServerAssets = canPublishToServer && !isOfflineMode
    const fileInputRef = useRef()
    const skipServerLoadRef = useRef(false)

    useEffect(() => {
        sceneVersionRef.current = sceneVersion
    }, [sceneVersion])

    const { updateSceneSignature, applyRemoteScene, applyScenePatch } = useSceneApply({
        persistSceneDataWithStatus,
        resetAssetStoreQuotaState,
        restoreAssetsFromPayload,
        setAssetRestoreProgress,
        setRemoteAssetsManifest,
        setSceneVersion,
        setObjects,
        setBackgroundColor: sceneSettings.setBackgroundColor,
        setGridSize: sceneSettings.setGridSize,
        setGridAppearance: sceneSettings.setGridAppearance,
        setRenderSettings,
        setTransformSnaps: sceneSettings.setTransformSnaps,
        setIsGridVisible,
        setIsGizmoVisible,
        setIsPerfVisible,
        setPresentation,
        setAmbientLight: sceneSettings.setAmbientLight,
        setDirectionalLight: sceneSettings.setDirectionalLight,
        setCameraPosition: sceneSettings.setCameraPosition,
        setCameraTarget: sceneSettings.setCameraTarget,
        clearSelection,
        setRemoteSceneVersion,
        defaultGridAppearance,
        defaultRenderSettings: DEFAULT_RENDER_SETTINGS,
        defaultSceneRemoteBase: DEFAULT_SCENE_REMOTE_BASE,
        legacySceneRemoteBase: LEGACY_DEFAULT_SCENE_BASE,
        getAssetUrlCandidates,
        getAssetSourceUrl
    })
    const { isLoading } = useSceneInitializer({
        sceneStorageKey,
        spaceId,
        canPublishToServer: canAccessServerSpaces,
        isOfflineMode,
        preferServerScene: LIVE_SYNC_FEATURE_ENABLED && canAccessServerSpaces,
        forceServerAssetsBase: canAccessServerSpaces,
        skipServerLoadRef,
        serverAssetBaseUrl,
        applyRemoteScene,
        markServerSync,
        resetRemoteAssets,
        setRemoteSceneVersion,
        setRemoteAssetsManifest,
        persistSceneDataWithStatus,
        updateSceneSignature,
        setObjects,
        setBackgroundColor: sceneSettings.setBackgroundColor,
        setGridSize: sceneSettings.setGridSize,
        setGridAppearance: sceneSettings.setGridAppearance,
        setRenderSettings,
        setTransformSnaps: sceneSettings.setTransformSnaps,
        setIsGridVisible,
        setIsGizmoVisible,
        setIsPerfVisible,
        setPresentation,
        setAmbientLight: sceneSettings.setAmbientLight,
        setDirectionalLight: sceneSettings.setDirectionalLight,
        setDefault3DView: sceneSettings.setDefault3DView,
        setCameraPosition: sceneSettings.setCameraPosition,
        setCameraTarget: sceneSettings.setCameraTarget,
        setSceneVersion,
        getServerScene,
        defaultGridAppearance,
        defaultRenderSettings: DEFAULT_RENDER_SETTINGS,
        defaultSceneRemoteBase: DEFAULT_SCENE_REMOTE_BASE
    })

    const {
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
        sceneStreamError
    } = useCollaborativeSession({
        enabled: LIVE_SYNC_FEATURE_ENABLED,
        isLoading,
        canAccessServerSpaces,
        isOfflineMode,
        isLiveSyncEnabled,
        isPointerDragging,
        spaceId,
        supportsServerSpaces,
        buildSpaceApiUrl,
        serverAssetBaseUrl,
        getServerScene,
        getServerSceneOps: supportsServerSpaces ? getServerSceneOps : null,
        submitSceneOps,
        objects,
        backgroundColor: sceneSettings.backgroundColor,
        gridSize: sceneSettings.gridSize,
        gridAppearance: sceneSettings.gridAppearance,
        renderSettings,
        ambientLight: sceneSettings.ambientLight,
        directionalLight: sceneSettings.directionalLight,
        transformSnaps: sceneSettings.transformSnaps,
        presentation,
        default3DView: sceneSettings.default3DView,
        applyRemoteScene,
        applyScenePatch,
        setSceneVersion,
        sceneVersionRef,
        setObjects,
        setBackgroundColor: sceneSettings.setBackgroundColor,
        setGridSize: sceneSettings.setGridSize,
        setGridAppearance: sceneSettings.setGridAppearance,
        setRenderSettings,
        setTransformSnaps: sceneSettings.setTransformSnaps,
        setPresentation,
        setAmbientLight: sceneSettings.setAmbientLight,
        setDirectionalLight: sceneSettings.setDirectionalLight,
        setDefault3DView: sceneSettings.setDefault3DView,
        defaultGridAppearance
    })

    useEffect(() => {
        if (!isAdminMode || !isUiVisible) {
            setIsSpacesPanelVisible(false)
        }
    }, [isAdminMode, isUiVisible, setIsSpacesPanelVisible])


    // --- Hooks ---
    // This hook loads the scene from localStorage
    const cloneObjects = useCallback((value) => JSON.parse(JSON.stringify(value)), [])
    const sceneHistorySnapshot = useMemo(() => ({
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
    }), [
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
    ])
    const restoreSceneHistorySnapshot = useCallback((snapshot) => {
        if (!snapshot || typeof snapshot !== 'object') return
        setObjects(cloneObjects(snapshot.objects || []))
        sceneSettings.setBackgroundColor(snapshot.backgroundColor || defaultScene.backgroundColor)
        sceneSettings.setGridSize(snapshot.gridSize || defaultScene.gridSize)
        sceneSettings.setGridAppearance(snapshot.gridAppearance || defaultGridAppearance)
        setRenderSettings(snapshot.renderSettings || DEFAULT_RENDER_SETTINGS)
        sceneSettings.setCameraSettings(snapshot.cameraSettings || perspectiveCameraSettings)
        sceneSettings.setTransformSnaps(snapshot.transformSnaps || defaultScene.transformSnaps)
        setIsGridVisible(typeof snapshot.isGridVisible === 'boolean' ? snapshot.isGridVisible : defaultScene.isGridVisible)
        setIsGizmoVisible(typeof snapshot.isGizmoVisible === 'boolean' ? snapshot.isGizmoVisible : defaultScene.isGizmoVisible)
        setIsPerfVisible(typeof snapshot.isPerfVisible === 'boolean' ? snapshot.isPerfVisible : defaultScene.isPerfVisible)
        if (snapshot.presentation) {
            setPresentation((prev) => ({
                ...prev,
                ...snapshot.presentation,
                fixedCamera: snapshot.presentation.fixedCamera || prev.fixedCamera
            }))
        }
        sceneSettings.setAmbientLight(snapshot.ambientLight || defaultScene.ambientLight)
        sceneSettings.setDirectionalLight(snapshot.directionalLight || defaultScene.directionalLight)
        sceneSettings.setDefault3DView(snapshot.default3DView || defaultScene.default3DView)
        sceneSettings.setCameraPosition(snapshot.cameraPosition || defaultScene.savedView.position)
        sceneSettings.setCameraTarget(snapshot.cameraTarget || defaultScene.savedView.target)
        clearSelection()
    }, [
        clearSelection,
        cloneObjects,
        sceneSettings,
        setObjects,
        setRenderSettings,
        setIsGizmoVisible,
        setIsGridVisible,
        setIsPerfVisible,
        setPresentation
    ])
    const { canUndo, canRedo, handleUndo, handleRedo } = useSceneHistory({
        snapshot: sceneHistorySnapshot,
        restoreSnapshot: restoreSceneHistorySnapshot,
        isLoading,
        cloneSnapshot: cloneObjects
    })
    const {
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
    } = useObjectActions({
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
    const readOnlyAlertRef = useRef(0)
    const notifyReadOnly = useCallback(() => {
        if (!isReadOnly) return
        const now = Date.now()
        if (now - readOnlyAlertRef.current < 1500) return
        readOnlyAlertRef.current = now
        alert('This space is read-only. Ask an admin to enable editing.')
    }, [isReadOnly])
    
    const guardEditAction = useCallback((fn) => {
        return (...args) => {
            if (canEditScene) {
                return fn?.(...args)
            }
            notifyReadOnly()
            return undefined
        }
    }, [canEditScene, notifyReadOnly])
    const toggleAdminMode = useCallback(() => {
        setIsAdminMode(prev => {
            const next = !prev
            if (!next) {
                setIsGizmoVisible(false)
            }
            return next
        })
    }, [setIsAdminMode, setIsGizmoVisible])

    const {
        handleCreateSelectionGroup,
        handleSelectSelectionGroup,
        handleDeleteSelectionGroup,
        handleUngroupSelection,
        selectionHasGroup
    } = useSelectionGroupActions({
        selectionGroups,
        persistSelectionGroups,
        selectedObjectIds,
        applySelection,
        expandIdsWithGroups,
        resetAxisLock
    })

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

    // This hook is for keydown events
    
    
    // --- Handlers ---
    // Get the base camera settings (orthographic or perspective)
    const { handleAddObject } = useObjectFactory({
        menuPosition3D: menu.position3D,
        setMenu,
        setObjects,
        applySelection,
        socketEmit
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
    } = useAssetPipeline({
        controlsRef,
        handleAddObject: guardEditAction(handleAddObject),
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
        getBaseSceneData,
        getSavedViewData,
        scheduleLocalSceneSave,
        handleSave,
        handleLoadClick,
        handleFileLoad,
        handleKeepCurrentWorld,
        handleReloadFromServer,
        handlePublishToServer
    } = useSceneSyncCoordinator({
        controlsRef,
        cameraPosition: sceneSettings.cameraPosition,
        cameraTarget: sceneSettings.cameraTarget,
        setCameraPosition: sceneSettings.setCameraPosition,
        setCameraTarget: sceneSettings.setCameraTarget,
        captureSavedViewFromControls: presentationMode === 'scene',
        objects,
        backgroundColor: sceneSettings.backgroundColor,
        gridSize: sceneSettings.gridSize,
        gridAppearance: sceneSettings.gridAppearance,
        renderSettings,
        transformSnaps: sceneSettings.transformSnaps,
        presentation,
        isGridVisible,
        isGizmoVisible,
        isPerfVisible,
        directionalLight: sceneSettings.directionalLight,
        ambientLight: sceneSettings.ambientLight,
        default3DView: sceneSettings.default3DView,
        remoteSceneVersion,
        sceneVersion,
        remoteAssetsRef,
        remoteAssetsBaseRef,
        remoteAssetsManifest,
        remoteAssetsBaseUrl,
        persistSceneDataWithStatus,
        updateSceneSignature,
        shouldSyncServerScene: !LIVE_SYNC_FEATURE_ENABLED && shouldSyncServerScene,
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
        setBackgroundColor: sceneSettings.setBackgroundColor,
        setGridSize: sceneSettings.setGridSize,
        setGridAppearance: sceneSettings.setGridAppearance,
        setRenderSettings,
        setTransformSnaps: sceneSettings.setTransformSnaps,
        setIsGridVisible,
        setIsGizmoVisible,
        setIsPerfVisible,
        setPresentation,
        setAmbientLight: sceneSettings.setAmbientLight,
        setDirectionalLight: sceneSettings.setDirectionalLight,
        setDefault3DView: sceneSettings.setDefault3DView,
        clearSelection,
        defaultGridAppearance,
        defaultRenderSettings: DEFAULT_RENDER_SETTINGS,
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
    })

    const handleToggleOfflineMode = useCallback(() => {
        setOfflineMode(!isOfflineMode)
        alert(!isOfflineMode ? 'Offline mode enabled: server sync disabled.' : 'Offline mode disabled: server sync available.')
    }, [isOfflineMode, setOfflineMode])

    usePointerTransform({ axisConstraint, freeTransformRef, applyFreeTransformDelta: guardEditAction(applyFreeTransformDelta) })

    const {
        handleClear,
        handleSaveView,
        handleUpdateTransformSnaps,
        handleFrameAll,
        handleFrameSelection
    } = useSceneActions({
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
        resetSceneVersionOnClear: !LIVE_SYNC_FEATURE_ENABLED
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
        handleCreateSelectionGroup: guardEditAction(handleCreateSelectionGroup),
        handleUngroupSelection: guardEditAction(handleUngroupSelection),
        selectAllObjects,
        handleFrameSelection
    })

    const spaceLabelButton = useSpaceLabel({
        spaceId,
        onCopyLink: handleCopySpaceLink
    })

    const canCreateGroupSelection = selectedObjectIds.length > 1

    const {
        isStatusPanelVisible,
        setIsStatusPanelVisible
    } = useStatusState({
        spaceId,
        localSaveStatus,
        markLocalSave,
        serverSyncInfo,
        markServerSync
    })

    const handleEnterXrFocus = useCallback(() => {
        setPresentationMode('scene')
        setIsStatusPanelVisible(false)
        setIsUiVisible(false)
    }, [setIsStatusPanelVisible, setIsUiVisible, setPresentationMode])

    const xrControlButtonsProps = useMemo(() => ({
        isXrPresenting: xrContextValue.isXrPresenting ?? false,
        handleEnterXrSession: xrContextValue.handleEnterXrSession,
        supportedXrModes: xrContextValue.supportedXrModes ?? { vr: false, ar: false },
        activeXrMode: xrContextValue.activeXrMode,
        handleExitXrSession: xrContextValue.handleExitXrSession,
        showXrDiagnostics: xrContextValue.showXrDiagnostics
    }), [
        xrContextValue.isXrPresenting,
        xrContextValue.handleEnterXrSession,
        xrContextValue.supportedXrModes,
        xrContextValue.activeXrMode,
        xrContextValue.handleExitXrSession,
        xrContextValue.showXrDiagnostics
    ])

    const {
        sceneButtons,
        panelButtons,
        adminButtons,
        displayButtons,
        xrButtons,
        hiddenUiButtons
    } = useControlButtons({
        spaceLabelButton,
        isCreatingSpace,
        handleQuickSpaceCreate,
        canCreateGroupSelection,
        handleCreateSelectionGroup: guardEditAction(handleCreateSelectionGroup),
        selectionHasGroup,
        handleUngroupSelection: guardEditAction(handleUngroupSelection),
        isUiVisible,
        handleSave,
        handleLoadClick,
        isOfflineMode,
        handleToggleOfflineMode,
        handleUndo,
        handleRedo,
        canUndo,
        canRedo,
        handleClear: guardEditAction(handleClear),
        navigateToPreferences: () => navigateToPreferences(spaceId),
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
        handleToggleSpaceEditLock: (nextValue) => handleToggleSpaceEditLock(spaceId, nextValue),
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
        setIsUiVisible,
        isStatusPanelVisible,
        setIsStatusPanelVisible,
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
        presentationMode,
        setPresentationMode,
        handleEnterXrFocus,
        ...xrControlButtonsProps
    })

    const sceneSettingsContext = useMemo(() => ({
        backgroundColor: sceneSettings.backgroundColor,
        setBackgroundColor: sceneSettings.setBackgroundColor,
        gridSize: sceneSettings.gridSize,
        setGridSize: sceneSettings.setGridSize,
        cameraSettings: sceneSettings.cameraSettings,
        setCameraSettings: sceneSettings.setCameraSettings,
        default3DView: sceneSettings.default3DView, // This is for the "3D" preset button
        ambientLight: sceneSettings.ambientLight,
        setAmbientLight: sceneSettings.setAmbientLight,
        directionalLight: sceneSettings.directionalLight,
        setDirectionalLight: sceneSettings.setDirectionalLight,
        transformSnaps: sceneSettings.transformSnaps,
        setTransformSnaps: sceneSettings.setTransformSnaps,
        gridAppearance: sceneSettings.gridAppearance,
        setGridAppearance: sceneSettings.setGridAppearance,
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
        cameraPosition: sceneSettings.cameraPosition,
        cameraTarget: sceneSettings.cameraTarget,
        selectionGroups,
        canUndo,
        canRedo
    }), [
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
        canRedo
    ])

    const syncState = useMemo(() => ({
        liveSyncFeatureEnabled: LIVE_SYNC_FEATURE_ENABLED,
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
        remoteCursorMarkers
    }), [
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
        remoteCursorMarkers
    ])

    const spacesState = useMemo(() => ({
        spaces,
        newSpaceName,
        setNewSpaceName,
        openAfterCreateTarget,
        setOpenAfterCreateTarget,
        spaceNameFeedback,
        canCreateSpace,
        tempSpaceTtlHours,
        isCreatingSpace
    }), [
        spaces,
        newSpaceName,
        setNewSpaceName,
        openAfterCreateTarget,
        setOpenAfterCreateTarget,
        spaceNameFeedback,
        canCreateSpace,
        tempSpaceTtlHours,
        isCreatingSpace
    ])

    const handlers = useMemo(() => ({
        handleAddObject: guardEditAction(handleAddObject),
        handleSaveView, // This is the "Save View" button
        handleFrameAll,
        handleFrameSelection,
        handleUpdateTransformSnaps,
        handleSave,
        handleLoadClick,
        handleKeepCurrentWorld,
        handleClear: guardEditAction(handleClear),
        handleAssetFilesUpload: guardEditAction(handleAssetFilesUpload),
        handleUndo,
        handleRedo,
        selectObject,
        handleSelectObjectFromOutliner,
        handleToggleObjectVisibility: guardEditAction(handleToggleObjectVisibility),
        selectAllObjects,
        resetAxisLock,
        toggleAdminMode,
        requestManualMediaOptimization: guardEditAction(handleManualMediaOptimization),
        requestBatchMediaOptimization: guardEditAction(handleBatchMediaOptimization),
        copySelectedObject,
        pasteClipboardObject: guardEditAction(pasteClipboardObject),
        cutSelectedObject: guardEditAction(cutSelectedObject),
        duplicateSelectedObject: guardEditAction(duplicateSelectedObject),
        deleteSelectedObject: guardEditAction(deleteSelectedObject),
        handleUngroupSelection: guardEditAction(handleUngroupSelection),
        expandIdsWithGroups,
        handleCreateSelectionGroup: guardEditAction(handleCreateSelectionGroup),
        handleSelectSelectionGroup,
        handleDeleteSelectionGroup: guardEditAction(handleDeleteSelectionGroup),
        handleCreateNamedSpace,
        handleOpenSpace,
        handleCopySpaceLink,
        handleDeleteSpace,
        handleRenameSpace,
        handleToggleSpacePermanent,
        handleToggleSpaceEditLock,
        handleReloadFromServer,
        handlePublishToServer,
        socketEmit
    }), [
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
        guardEditAction,
        socketEmit
    ])

    const refs = useMemo(() => ({
        controlsRef,
        fileInputRef
    }), [controlsRef, fileInputRef])

    const editorLayoutProps = useMemo(() => ({
        handleFileLoad,
        controlButtons: {
            sceneButtons,
            panelButtons,
            adminButtons,
            displayButtons,
            xrButtons,
            hiddenUiButtons
        },
        isLoading,
        isFileDragActive,
        mediaOptimizationPreference,
        setMediaOptimizationPreference,
        canCreateGroupSelection,
        xrStore,
        currentCameraSettings: effectiveCameraSettings,
        cameraPosition: effectiveCameraPosition,
        rendererRef,
        presentation,
        remoteCursorMarkers,
        handleCanvasPointerMove,
        handleCanvasPointerLeave
    }), [
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
        effectiveCameraSettings,
        effectiveCameraPosition,
        rendererRef,
        presentation,
        remoteCursorMarkers,
        handleCanvasPointerMove,
        handleCanvasPointerLeave
    ])

    return (
        <SceneContext.Provider value={sceneStore}>
            <UiContext.Provider value={uiState}>
                <SceneSettingsContext.Provider value={sceneSettingsContext}>
                    <XrContext.Provider value={xrContextValue}>
                        <SyncContext.Provider value={syncState}>
                            <SpacesContext.Provider value={spacesState}>
                                <ActionsContext.Provider value={handlers}>
                                    <RefsContext.Provider value={refs}>
                                        {isPreferencesPage ? (
                                            <PreferencesPage onNavigateToEditor={navigateToEditor} />
                                        ) : (
                                            <EditorLayoutContainer {...editorLayoutProps} />
                                        )}
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
