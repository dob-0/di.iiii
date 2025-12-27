import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import * as THREE from 'three'
import { AppContext } from './AppContext.js'
import { 
    saveAssetFromFile, 
    saveAssetBlob, 
    getAssetBlob, 
    clearAllAssets, 
    dataUrlToBlob,
    blobToDataUrl,
    hasAssetStoreQuotaExceeded,
    resetAssetStoreQuotaExceeded
} from './storage/assetStore.js'
import { MODEL_FORMATS, detectModelFormatFromFile, detectModelFormatFromMeta, stripExtension } from './utils/modelFormats.js'
import { registerAssetSources, clearAssetSources, getAssetSourceUrl, setAssetSource, getAssetUrlCandidates } from './services/assetSources.js'
import {
    createSpace,
    listSpaces,
    deleteSpace,
    cleanupSpaces,
    markSpaceActive,
    getSpaceShareUrl,
    TEMP_SPACE_TTL_MS
} from './storage/spaceStore.js'
import {
    supportsServerSpaces,
    getServerScene,
    submitSceneOps,
    overwriteServerScene,
    uploadServerAsset,
    createServerSpace,
    listServerSpaces
} from './services/serverSpaces.js'
import { apiBaseUrl } from './services/apiClient.js'
import { defaultScene, SCENE_DATA_VERSION, normalizeObjects, generateObjectId, useSceneStore } from './state/sceneStore.js'
import { createSceneSyncService } from './services/sceneSyncService.js'
import { useUiState } from './hooks/useUiState.js'
import { useXrAr } from './hooks/useXrAr.js'
import { useRenderSettings, DEFAULT_RENDER_SETTINGS } from './hooks/useRenderSettings.js'
import { buildSceneSignature, getSceneStorageKey, persistSceneToLocalStorage } from './storage/scenePersistence.js'
import { createSceneArchive, loadSceneArchive, resolveAssetEntries } from './services/sceneArchive.js'
import { useSceneAutosave } from './hooks/useSceneAutosave.js'
import EditorLayout from './components/EditorLayout.jsx'
import { useControlSections } from './hooks/useControlSections.js'
import { useStatusPanel } from './hooks/useStatusPanel.js'
import { useControlButtons } from './hooks/useControlButtons.js'
import { useStatusItems } from './hooks/useStatusItems.js'
import { useSpaceLabel } from './hooks/useSpaceLabel.js'
import { useSpaceNaming } from './hooks/useSpaceNaming.js'
import { useSpaceActions } from './hooks/useSpaceActions.js'
import { slugifySpaceName } from './utils/spaceNames.js'

const perspectiveCameraSettings = {
    orthographic: false,
    // move camera closer and higher for a better initial view
    position: [0, 1.6, 4],
    fov: 60,
    near: 0.1,
    far: 200
}

const APP_BASE_PATH = ((import.meta.env.BASE_URL) || '/').replace(/\/+$/, '') || '/'
const getAppBasePrefix = () => (APP_BASE_PATH === '/' ? '' : APP_BASE_PATH)
const OFFLINE_MODE_STORAGE_PREFIX = '3d-editor-offline-mode'
const DEFAULT_SCENE_REMOTE_BASE = ''
const LEGACY_DEFAULT_SCENE_BASE = ''
const LIVE_SYNC_FEATURE_ENABLED = false
const DEFAULT_GRID_APPEARANCE = {
    cellSize: 0.75,
    cellThickness: 0.75,
    sectionSize: 6,
    sectionThickness: 1.2,
    fadeDistance: 100,
    fadeStrength: 0.1,
    offset: 0.015
}

const generateLiveClientId = () => {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
        return crypto.randomUUID()
    }
    return `live-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
}


const stripAppBasePath = (pathname = '/') => {
    if (!pathname) return '/'
    if (APP_BASE_PATH !== '/' && pathname.startsWith(APP_BASE_PATH)) {
        const stripped = pathname.slice(APP_BASE_PATH.length)
        return stripped || '/'
    }
    return pathname
}

const buildAppSpacePath = (spaceId) => {
    const prefix = getAppBasePrefix()
    if (!spaceId) {
        return prefix ? `${prefix}/` : '/'
    }
    return `${prefix}/${spaceId}`.replace(/\/{2,}/g, '/')
}

const DEFAULT_SPACE_ID = 'main'
const GROUPS_STORAGE_PREFIX = 'selection-groups'

const isQuotaExceededError = (error) => {
    if (!error) return false
    if (error.name === 'QuotaExceededError' || error.name === 'NS_ERROR_DOM_QUOTA_REACHED') {
        return true
    }
    return error.code === 22 || error.code === 1014
}

const getInitialSpaceIdFromLocation = () => {
    if (typeof window === 'undefined') return null
    let relative = stripAppBasePath(window.location.pathname || '/')
    relative = relative.replace(/^\/+/g, '').replace(/\/+$/g, '')
    if (relative) {
        const [segment] = relative.split('/')
        if (segment) return segment
    }
    const params = new URLSearchParams(window.location.search)
    return params.get('space')
}

export default function App() {
    // --- State ---
    const initialSpaceIdFromUrl = typeof window !== 'undefined'
        ? getInitialSpaceIdFromLocation()
        : null
    const initialSpaceId = initialSpaceIdFromUrl || DEFAULT_SPACE_ID
    const [isLoading, setIsLoading] = useState(true); 
    const [cameraPosition, setCameraPosition] = useState(defaultScene.savedView.position);
    const [cameraTarget, setCameraTarget] = useState(defaultScene.savedView.target);
    const [cameraSettings, setCameraSettings] = useState(perspectiveCameraSettings)
    const [spaceId] = useState(initialSpaceId)

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
    } = useSceneStore({ initialObjects: defaultScene.objects, initialVersion: 0 })
    const [backgroundColor, setBackgroundColor] = useState(defaultScene.backgroundColor);
    const [gridSize, setGridSize] = useState(defaultScene.gridSize);
    const [ambientLight, setAmbientLight] = useState(defaultScene.ambientLight);
    const [directionalLight, setDirectionalLight] = useState(defaultScene.directionalLight);
    const [default3DView, setDefault3DView] = useState(defaultScene.default3DView); // For the "3D" button
    const [transformSnaps, setTransformSnaps] = useState(defaultScene.transformSnaps)
    const [gridAppearance, setGridAppearance] = useState(DEFAULT_GRID_APPEARANCE)
    const controlsRef = useRef()
    const rendererRef = useRef(null)
    const { renderSettings, setRenderSettings } = useRenderSettings({ rendererRef })
    const {
        menu,
        setMenu,
        gizmoMode,
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
        isPointerDragging,
        setIsPointerDragging,
        isSelectionLocked,
        setIsSelectionLocked,
        isAdminMode,
        setIsAdminMode,
        layoutMode,
        toggleLayoutMode
    } = useUiState({
        spaceId,
        defaults: {
            isPerfVisible: defaultScene.isPerfVisible,
            isGizmoVisible: defaultScene.isGizmoVisible,
            isGridVisible: defaultScene.isGridVisible
        }
    })
    const {
        xrStore,
        isXrPresenting,
        activeXrMode,
        isArModeActive,
        supportedXrModes,
        xrOriginPosition,
        setXrOriginPosition,
        arAnchorTransform,
        setArAnchorTransform,
        arPreviewScale,
        setArPreviewScale,
        arPreviewOffset,
        setArPreviewOffset,
        resetArAnchor,
        handleEnterXrSession,
        handleExitXrSession
    } = useXrAr({
        default3DView,
        controlsRef,
        setCameraPosition,
        setCameraTarget
    })
    const [isFileDragActive, setIsFileDragActive] = useState(false)
    const [uploadProgress, setUploadProgress] = useState({
        active: false,
        total: 0,
        completed: 0
    })
    const [assetRestoreProgress, setAssetRestoreProgress] = useState({
        active: false,
        completed: 0,
        total: 0
    })
    const [serverAssetSyncPending, setServerAssetSyncPending] = useState(0)
    const [serverAssetSyncProgress, setServerAssetSyncProgress] = useState({
        active: false,
        completed: 0,
        total: 0,
        label: ''
    })
    const statusPanelStorageKey = useMemo(() => (spaceId ? `status-panel:${spaceId}` : 'status-panel:local'), [spaceId])
    const [isStatusPanelVisible, setIsStatusPanelVisible] = useState(() => {
        if (typeof window === 'undefined') return false
        try {
            const stored = window.localStorage.getItem(statusPanelStorageKey)
            if (stored === 'on') return true
            if (stored === 'off') return false
        } catch {
            // ignore
        }
        return false
    })
    useEffect(() => {
        if (typeof window === 'undefined') return
        try {
            window.localStorage.setItem(statusPanelStorageKey, isStatusPanelVisible ? 'on' : 'off')
        } catch {
            // ignore
        }
    }, [isStatusPanelVisible, statusPanelStorageKey])
    const [remoteSceneVersion, setRemoteSceneVersion] = useState(null)
    const [mediaOptimizationPreference, setMediaOptimizationPreference] = useState('original')
    const [mediaOptimizationStatus, setMediaOptimizationStatus] = useState({
        active: false,
        count: 0,
        label: '',
        total: 0,
        completed: 0,
        startedAt: null
    })
    const offlineModeStorageKey = useMemo(() => {
        if (!spaceId) return `${OFFLINE_MODE_STORAGE_PREFIX}:local`
        return `${OFFLINE_MODE_STORAGE_PREFIX}:${spaceId}`
    }, [spaceId])
    const [isOfflineMode, setIsOfflineMode] = useState(() => {
        if (typeof window === 'undefined' || !offlineModeStorageKey) return false
        try {
            return window.localStorage.getItem(offlineModeStorageKey) === 'true'
        } catch {
            return false
        }
    })
    useEffect(() => {
        if (typeof window === 'undefined' || !offlineModeStorageKey) {
            setIsOfflineMode(false)
            return
        }
        try {
            setIsOfflineMode(window.localStorage.getItem(offlineModeStorageKey) === 'true')
        } catch {
            setIsOfflineMode(false)
        }
    }, [offlineModeStorageKey])
    const persistOfflinePreference = useCallback((nextValue) => {
        if (typeof window === 'undefined' || !offlineModeStorageKey) return
        try {
            window.localStorage.setItem(offlineModeStorageKey, nextValue ? 'true' : 'false')
        } catch {
            // ignore storage errors
        }
    }, [offlineModeStorageKey])
    const setOfflineMode = useCallback((nextValue) => {
        setIsOfflineMode(nextValue)
        persistOfflinePreference(nextValue)
    }, [persistOfflinePreference])
    const sceneSignatureRef = useRef(null)
    const sceneVersionRef = useRef(sceneVersion)
    const canPublishToServer = supportsServerSpaces && Boolean(spaceId)
    const canUploadServerAssets = canPublishToServer && !isOfflineMode
    const canSyncServerScene = LIVE_SYNC_FEATURE_ENABLED && canPublishToServer
    const liveSyncStorageKey = useMemo(() => (canSyncServerScene ? `live-sync:${spaceId}` : null), [canSyncServerScene, spaceId])
    const readLiveSyncPreference = useCallback(() => {
        if (!LIVE_SYNC_FEATURE_ENABLED || !liveSyncStorageKey || typeof window === 'undefined') {
            return false
        }
        try {
            const stored = window.localStorage.getItem(liveSyncStorageKey)
            if (stored === 'on') return true
            if (stored === 'off') return false
        } catch {
            // ignore storage errors
        }
        return false
    }, [liveSyncStorageKey])
    const [isLiveSyncEnabledState, setIsLiveSyncEnabledState] = useState(false)
    const setIsLiveSyncEnabled = useCallback((nextValue) => {
        setIsLiveSyncEnabledState(nextValue)
        if (!liveSyncStorageKey || typeof window === 'undefined') return
        try {
            window.localStorage.setItem(liveSyncStorageKey, nextValue ? 'on' : 'off')
        } catch {
            // ignore
        }
    }, [liveSyncStorageKey])

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
    useEffect(() => {
        if (!LIVE_SYNC_FEATURE_ENABLED || isOfflineMode) return
        setIsLiveSyncEnabledState(readLiveSyncPreference())
    }, [isOfflineMode, readLiveSyncPreference])
    useEffect(() => {
        if (!LIVE_SYNC_FEATURE_ENABLED || !canSyncServerScene || isOfflineMode) {
            setIsLiveSyncEnabled(false)
        }
    }, [canSyncServerScene, isOfflineMode, setIsLiveSyncEnabled])
    const isLiveSyncEnabled = LIVE_SYNC_FEATURE_ENABLED && isLiveSyncEnabledState && canSyncServerScene
    const shouldSyncServerScene = LIVE_SYNC_FEATURE_ENABLED && canSyncServerScene && isLiveSyncEnabled
    const serverBaseUrl = useMemo(() => {
        if (!supportsServerSpaces) return ''
        return (apiBaseUrl || '').replace(/\/+$/, '')
    }, [])
    const serverAssetBaseUrl = useMemo(() => {
        if (!spaceId) return ''
        const path = `/api/spaces/${spaceId}/assets`
        if (!supportsServerSpaces) return path
        return serverBaseUrl ? `${serverBaseUrl}${path}` : path
    }, [serverBaseUrl, spaceId])
    const buildSpaceApiUrl = useCallback((suffix = '') => {
        if (!spaceId) return ''
        const path = `/api/spaces/${spaceId}${suffix}`
        if (!supportsServerSpaces) return path
        return serverBaseUrl ? `${serverBaseUrl}${path}` : path
    }, [serverBaseUrl, spaceId])
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
    const mergeSpaces = useCallback((localList = [], remoteList = []) => {
        const map = new Map()
        localList.forEach(space => {
            map.set(space.id, { ...space })
        })
        remoteList.forEach(space => {
            const lastActive = space.lastTouchedAt || space.updatedAt || space.createdAt || Date.now()
            const existing = map.get(space.id) || {}
            map.set(space.id, {
                ...existing,
                id: space.id,
                label: space.label || existing.label || `Space ${space.id.slice(-4)}`,
                createdAt: space.createdAt || existing.createdAt || Date.now(),
                lastActive,
                isPermanent: typeof space.permanent === 'boolean' ? space.permanent : Boolean(existing.isPermanent)
            })
        })
        return Array.from(map.values()).sort((a, b) => (b.lastActive || 0) - (a.lastActive || 0))
    }, [])

    const groupsStorageKey = useMemo(() => {
        if (!spaceId) return null
        return `${GROUPS_STORAGE_PREFIX}:${spaceId}`
    }, [spaceId])
    const loadSelectionGroups = useCallback(() => {
        if (!groupsStorageKey || typeof window === 'undefined') return []
        try {
            return JSON.parse(window.localStorage.getItem(groupsStorageKey) || '[]')
        } catch {
            return []
        }
    }, [groupsStorageKey])
    const [selectionGroups, setSelectionGroups] = useState(() => loadSelectionGroups())

    useEffect(() => {
        setSelectionGroups(loadSelectionGroups())
    }, [loadSelectionGroups])
    const persistSelectionGroups = useCallback((nextGroups) => {
        setSelectionGroups(nextGroups)
        if (!groupsStorageKey || typeof window === 'undefined') return
        try {
            window.localStorage.setItem(groupsStorageKey, JSON.stringify(nextGroups))
        } catch {
            // ignore
        }
    }, [groupsStorageKey])
    const expandIdsWithGroups = useCallback((ids) => {
        if (!Array.isArray(ids) || !ids.length) return []
        const set = new Set(ids.filter(Boolean))
        selectionGroups.forEach(group => {
            const intersects = group.members?.some(memberId => set.has(memberId))
            if (intersects) {
                group.members.forEach(memberId => set.add(memberId))
            }
        })
        return Array.from(set)
    }, [selectionGroups])
    const [spaces, setSpaces] = useState(() => listSpaces())
    const [isCreatingSpace, setIsCreatingSpace] = useState(false)
    const [newSpaceName, setNewSpaceName] = useState('')
    const refreshSpaces = useCallback(async () => {
        const localSpaces = listSpaces()
        if (!supportsServerSpaces) {
            setSpaces(localSpaces)
            return
        }
        try {
            const remote = await listServerSpaces()
            setSpaces(mergeSpaces(localSpaces, remote))
        } catch (error) {
            console.warn('Failed to load server spaces', error)
            setSpaces(localSpaces)
        }
    }, [mergeSpaces, supportsServerSpaces])
    useEffect(() => {
        if (!spaceId) return
        const exists = spaces.some(space => space.id === spaceId)
        if (!exists) {
            createSpace({
                label: spaceId === DEFAULT_SPACE_ID ? 'Main Space' : spaceId,
                slug: spaceId,
                isPermanent: true
            })
            refreshSpaces()
        }
    }, [spaceId, spaces, refreshSpaces])
    const tempSpaceTtlHours = useMemo(() => Math.round(TEMP_SPACE_TTL_MS / (1000 * 60 * 60)), [])
    const {
        trimmedSpaceName,
        newSpaceSlug,
        spaceNameFeedback,
        canCreateNamedSpace,
        canCreateSpace
    } = useSpaceNaming({
        newSpaceName,
        spaces,
        isCreatingSpace,
        buildSpacePath: buildAppSpacePath
    })
    const [controlsReady, setControlsReady] = useState(false)
    const fileInputRef = useRef()
    const clipboardRef = useRef(null)
    const isHistoryRestoring = useRef(false)
    const adminChordRef = useRef(false)
    const manualOptimizationInFlight = useRef(new Set())
    const remoteAssetsRef = useRef(null)
    const assetStoreQuotaExceededRef = useRef(false)
    const assetStoreQuotaAlertedRef = useRef(false)
    const remoteAssetsBaseRef = useRef('')
    const pendingServerSaveRef = useRef(null)
    const latestServerPayloadRef = useRef(null)
    const sceneSyncServiceRef = useRef(createSceneSyncService())
    const liveClientIdRef = useRef(generateLiveClientId())
    const skipServerLoadRef = useRef(false)

    useEffect(() => {
        sceneVersionRef.current = sceneVersion
    }, [sceneVersion])

    const remoteCursorsRef = useRef(new Map())

    const resetRemoteAssets = useCallback(() => {
        remoteAssetsRef.current = null
        remoteAssetsBaseRef.current = ''
        clearAssetSources()
    }, [])

    const setRemoteAssetsManifest = useCallback((manifest = [], baseUrl = '') => {
        remoteAssetsBaseRef.current = baseUrl || ''
        remoteAssetsRef.current = Array.isArray(manifest) ? manifest : []
        registerAssetSources(remoteAssetsRef.current, remoteAssetsBaseRef.current, [DEFAULT_SCENE_REMOTE_BASE, LEGACY_DEFAULT_SCENE_BASE])
    }, [])

    const resetAssetStoreQuotaState = useCallback(() => {
        assetStoreQuotaExceededRef.current = false
        assetStoreQuotaAlertedRef.current = false
        resetAssetStoreQuotaExceeded()
    }, [])

    const handleAssetStoreQuotaExceeded = useCallback(() => {
        if (assetStoreQuotaExceededRef.current) return
        assetStoreQuotaExceededRef.current = true
        console.warn('Asset storage quota exceeded; assets will stream from the server.')
        if (!assetStoreQuotaAlertedRef.current) {
            assetStoreQuotaAlertedRef.current = true
            alert('Browser storage is full. Assets will stream from the server instead of being cached locally.')
        }
    }, [])

    const restoreAssetsFromPayload = useCallback(async (assets = [], blobLoader) => {
        if (!Array.isArray(assets) || assets.length === 0) {
            setAssetRestoreProgress({
                active: false,
                completed: 0,
                total: 0
            })
            return { fallbackAssets: [] }
        }
        const queue = assets.map((asset) => ({
            ...asset,
            status: 'pending'
        }))
        const parallelism = 3
        setAssetRestoreProgress({
            active: true,
            completed: 0,
            total: assets.length
        })
        let completed = 0
        const fallbackAssets = []

        const hydrateAsset = async (item) => {
            try {
                let blob = null
                if (item?.dataUrl) {
                    blob = dataUrlToBlob(item.dataUrl)
                } else if (item?.archivePath && typeof blobLoader === 'function') {
                    blob = await blobLoader(item)
                } else if (item?.url) {
                    try {
                        const response = await fetch(item.url, { cache: 'no-store' })
                        if (response.ok) {
                            blob = await response.blob()
                        } else {
                            console.warn(`Failed to fetch remote asset ${item.id} from URL`, item.url)
                        }
                    } catch (fetchError) {
                        console.warn(`Error fetching asset ${item?.id} from URL`, fetchError)
                    }
                }
                if (!blob) return
                const fallbackMeta = {
                    id: item.id,
                    name: item.name,
                    mimeType: item.mimeType,
                    createdAt: item.createdAt
                }
                let storedLocally = false
                if (assetStoreQuotaExceededRef.current || hasAssetStoreQuotaExceeded()) {
                    handleAssetStoreQuotaExceeded()
                } else {
                    try {
                        await saveAssetBlob(blob, {
                            id: item.id,
                            name: item.name,
                            mimeType: item.mimeType,
                            createdAt: item.createdAt
                        })
                        storedLocally = true
                    } catch (error) {
                        if (isQuotaExceededError(error)) {
                            handleAssetStoreQuotaExceeded()
                        } else {
                            throw error
                        }
                    }
                }
                if (!storedLocally) {
                    try {
                        const dataUrl = await blobToDataUrl(blob)
                        if (dataUrl) {
                            const fallbackEntry = {
                                ...fallbackMeta,
                                dataUrl,
                                size: blob?.size ?? item.size
                            }
                            fallbackAssets.push(fallbackEntry)
                            setAssetSource(fallbackEntry)
                        }
                    } catch (error) {
                        console.warn(`Failed to create fallback source for asset ${item?.id}`, error)
                    }
                }
            } catch (error) {
                console.error(`Failed to restore asset ${item?.id}`, error)
            } finally {
                completed += 1
                setAssetRestoreProgress(prev => ({
                    ...prev,
                    completed: completed
                }))
            }
        }

        const workers = Array.from({ length: parallelism }, async () => {
            while (queue.length > 0) {
                const next = queue.shift()
                if (!next) break
                await hydrateAsset(next)
            }
        })

        await Promise.all(workers)
        setAssetRestoreProgress({
            active: false,
            completed: assets.length,
            total: assets.length
        })
        return { fallbackAssets }
    }, [handleAssetStoreQuotaExceeded, setAssetRestoreProgress])

    const upsertRemoteAssetEntry = useCallback((entry, baseUrl) => {
        if (!entry?.id) return
        const manifest = Array.isArray(remoteAssetsRef.current)
            ? remoteAssetsRef.current.filter(item => item.id !== entry.id)
            : []
        manifest.push(entry)
        remoteAssetsRef.current = manifest
        if (typeof baseUrl === 'string') {
            remoteAssetsBaseRef.current = baseUrl
        }
        setAssetSource(entry, baseUrl ?? remoteAssetsBaseRef.current)
    }, [])

    const updateSceneSignature = useCallback((data) => {
        if (!data) return
        sceneSignatureRef.current = buildSceneSignature(data)
    }, [])
    const applyRemoteScene = useCallback(async (sceneData, options = {}) => {
        const { remoteVersion = null, assetsBaseUrl = DEFAULT_SCENE_REMOTE_BASE, serverVersion = null } = options
        if (!sceneData.version || sceneData.version < SCENE_DATA_VERSION) {
            alert('Error: The remote start scene is incompatible.')
            return
        }
        await clearAllAssets()
        resetAssetStoreQuotaState()
        resetAssetStoreQuotaState()
        const assetsManifest = Array.isArray(sceneData.assets) ? sceneData.assets : []
        let mergedManifest = assetsManifest
        if (assetsManifest.length > 0) {
            const baseCandidates = []
            const pushBase = (value) => {
                const normalized = (value || '').trim()
                if (!baseCandidates.includes(normalized)) {
                    baseCandidates.push(normalized)
                }
            }
            pushBase(assetsBaseUrl || '')
            if (DEFAULT_SCENE_REMOTE_BASE) {
                pushBase(DEFAULT_SCENE_REMOTE_BASE)
            }
            if (LEGACY_DEFAULT_SCENE_BASE && LEGACY_DEFAULT_SCENE_BASE !== DEFAULT_SCENE_REMOTE_BASE) {
                pushBase(LEGACY_DEFAULT_SCENE_BASE)
            }
            const { fallbackAssets } = await restoreAssetsFromPayload(assetsManifest, async (asset) => {
                const urlCandidates = []
                baseCandidates.forEach((base) => {
                    getAssetUrlCandidates(asset, base).forEach((candidate) => {
                        if (!urlCandidates.includes(candidate)) {
                            urlCandidates.push(candidate)
                        }
                    })
                })
                const remoteUrl = getAssetSourceUrl(asset.id)
                if (remoteUrl && !urlCandidates.includes(remoteUrl)) {
                    urlCandidates.unshift(remoteUrl)
                }
                for (const candidate of urlCandidates) {
                    if (!candidate) continue
                    try {
                        const response = await fetch(candidate, { cache: 'no-store' })
                        if (!response.ok) {
                            continue
                        }
                        return await response.blob()
                    } catch {
                        // try next candidate
                    }
                }
                console.warn(`Failed to hydrate asset ${asset.id}: no sources available.`)
                return null
            })
            mergedManifest = mergeAssetsManifest(assetsManifest, fallbackAssets)
        } else {
            setAssetRestoreProgress({
                active: false,
                completed: 0,
                total: 0
            })
        }
        setRemoteAssetsManifest(mergedManifest, assetsBaseUrl)

        const remappedObjects = (sceneData.objects || defaultScene.objects).map(obj => ({
            ...obj,
            assetRef: obj.assetRef || null
        }))

        const nextObjects = normalizeObjects(remappedObjects)

        setObjects(nextObjects)
        setBackgroundColor(sceneData.backgroundColor || defaultScene.backgroundColor)
        setGridSize(sceneData.gridSize || defaultScene.gridSize)
        setGridAppearance(sceneData.gridAppearance || DEFAULT_GRID_APPEARANCE)
        setRenderSettings(sceneData.renderSettings || DEFAULT_RENDER_SETTINGS)
        setTransformSnaps(sceneData.transformSnaps || defaultScene.transformSnaps)
        setIsGridVisible(
            typeof sceneData.isGridVisible === 'boolean'
                ? sceneData.isGridVisible
                : defaultScene.isGridVisible
        )
        setIsGizmoVisible(
            typeof sceneData.isGizmoVisible === 'boolean'
                ? sceneData.isGizmoVisible
                : defaultScene.isGizmoVisible
        )
        setIsPerfVisible(
            typeof sceneData.isPerfVisible === 'boolean'
                ? sceneData.isPerfVisible
                : defaultScene.isPerfVisible
        )
        setAmbientLight(sceneData.ambientLight || defaultScene.ambientLight)
        setDirectionalLight(sceneData.directionalLight || defaultScene.directionalLight)
        
        const savedView = sceneData.savedView || defaultScene.savedView
        setCameraPosition(savedView.position)
        setCameraTarget(savedView.target)
        const storedVersion = Number(sceneData.sceneVersion)
        if (Number.isFinite(storedVersion)) {
            setSceneVersion(storedVersion)
        }
        
        clearSelection()
        setRemoteSceneVersion(remoteVersion)
        if (typeof serverVersion === 'number') {
            setSceneVersion(serverVersion)
        }
        
        const nextSceneData = {
            ...sceneData,
            assets: mergedManifest,
            assetsBaseUrl,
            defaultSceneVersion: remoteVersion,
            sceneVersion: typeof serverVersion === 'number' ? serverVersion : sceneData.sceneVersion,
            renderSettings: sceneData.renderSettings || DEFAULT_RENDER_SETTINGS
        }
        persistSceneDataWithStatus(nextSceneData, 'Loaded scene locally')
        updateSceneSignature(nextSceneData)
    }, [
        clearSelection,
        persistSceneDataWithStatus,
        resetAssetStoreQuotaState,
        restoreAssetsFromPayload,
        setAssetRestoreProgress,
        setRemoteAssetsManifest,
        setSceneVersion,
        updateSceneSignature,
        setObjects,
        setBackgroundColor,
        setGridSize,
        setGridAppearance,
        setRenderSettings,
        setTransformSnaps,
        setIsGridVisible,
        setIsGizmoVisible,
        setIsPerfVisible
    ])

    const applyScenePatch = useCallback((patch = {}) => {
        if (!patch || typeof patch !== 'object') return
        const incomingSignature = buildSceneSignature(patch)
        if (sceneSignatureRef.current && sceneSignatureRef.current === incomingSignature) {
            return
        }
        sceneSignatureRef.current = incomingSignature
        if (Array.isArray(patch.objects)) {
            setObjects(normalizeObjects(patch.objects))
        }
        if ('backgroundColor' in patch && patch.backgroundColor) {
            setBackgroundColor(patch.backgroundColor)
        }
        if ('gridSize' in patch && patch.gridSize) {
            setGridSize(patch.gridSize)
        }
        if (patch.ambientLight) {
            setAmbientLight(patch.ambientLight)
        }
        if (patch.directionalLight) {
            setDirectionalLight(patch.directionalLight)
        }
        if (patch.transformSnaps) {
            setTransformSnaps(patch.transformSnaps)
        }
        if ('isGridVisible' in patch) {
            setIsGridVisible(Boolean(patch.isGridVisible))
        }
        if ('isGizmoVisible' in patch) {
            setIsGizmoVisible(Boolean(patch.isGizmoVisible))
        }
        if ('isPerfVisible' in patch) {
            setIsPerfVisible(Boolean(patch.isPerfVisible))
        }
        if (patch.savedView?.position && patch.savedView?.target) {
            // Do not override local camera position for live patches
            setCameraTarget(patch.savedView.target)
        }
    }, [setObjects, setBackgroundColor, setGridSize, setAmbientLight, setDirectionalLight, setTransformSnaps, setIsGridVisible, setIsGizmoVisible, setIsPerfVisible, setCameraTarget])

    const handleSceneOpsEvent = useCallback((payload) => {
        if (!payload) return
        if (Array.isArray(payload.ops) && payload.ops.length) {
            const version = typeof payload.version === 'number' ? payload.version : null
            const ops = payload.ops
            const isLocal = ops.every(op => op?.clientId && op.clientId === liveClientIdRef.current)
            if (isLocal) {
                if (version !== null) {
                    setSceneVersion(version)
                }
                return
            }
            const replaceOp = ops.find(op => op?.type === 'replaceScene' && op?.payload?.scene)
            if (replaceOp) {
                applyRemoteScene(replaceOp.payload.scene, {
                    silent: true,
                    serverVersion: version
                })
                if (version !== null) {
                    setSceneVersion(version)
                }
            }
            return
        }
        if (payload.payload) {
            applyScenePatch(payload.payload)
        }
    }, [applyRemoteScene, applyScenePatch, setSceneVersion])

    useEffect(() => {
        if (!LIVE_SYNC_FEATURE_ENABLED || isOfflineMode) return undefined
        const service = sceneSyncServiceRef.current
        if (!spaceId || !supportsServerSpaces || !isLiveSyncEnabled) {
            service.disconnect()
            remoteCursorsRef.current.clear()
            return
        }
        const eventsUrl = buildSpaceApiUrl('/events')
        if (!eventsUrl) return

        service.connect({
            eventsUrl,
            onPatch: handleSceneOpsEvent,
            onCursor: (parsed) => {
                if (parsed?.cursor && parsed.clientId && parsed.clientId !== liveClientIdRef.current) {
                    remoteCursorsRef.current.set(parsed.clientId, {
                        ...parsed.cursor,
                        updatedAt: Date.now()
                    })
                }
            },
            onReady: (parsed) => {
                if (parsed?.clientId) {
                    liveClientIdRef.current = parsed.clientId
                }
            }
        })

        return () => {
            service.disconnect()
            remoteCursorsRef.current.clear()
        }
    }, [buildSpaceApiUrl, handleSceneOpsEvent, isLiveSyncEnabled, isOfflineMode, spaceId, supportsServerSpaces])

    const applyFreeTransformDelta = useCallback((mode, axis, delta) => {
        if (isSelectionLocked) return
        if (!axis || !mode || !selectedObjectIds.length || delta === 0) return
        const axisIndex = axis === 'X' ? 0 : axis === 'Y' ? 1 : 2
        const idSet = new Set(selectedObjectIds)
        setObjects(prev => prev.map(obj => {
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
            return next
        }))
    }, [isSelectionLocked, selectedObjectIds, setObjects])

    const selectObject = useCallback((id, options = {}) => {
        const { additive = false } = options
        if (!id) {
            applySelection([])
            return
        }
        const expanded = expandIdsWithGroups([id])
        if (!additive) {
            applySelection(expanded)
            return
        }
        setSelectedObjectIds(prev => {
            let next = [...prev]
            expanded.forEach(memberId => {
                if (!next.includes(memberId)) {
                    next.push(memberId)
                }
            })
            setSelectedObjectId(next.length ? next[next.length - 1] : null)
            return next
        })
    }, [applySelection, expandIdsWithGroups])

    const selectAllObjects = useCallback(() => {
        if (!objects.length) {
            applySelection([])
            return
        }
        applySelection(objects.map(obj => obj.id))
    }, [objects, applySelection])

    useEffect(() => {
        refreshSpaces()
    }, [refreshSpaces])

    useEffect(() => {
        resetAxisLock()
    }, [resetAxisLock, selectedObjectIds])

    useEffect(() => {
        cleanupSpaces(spaceId)
        if (spaceId) {
            markSpaceActive(spaceId)
        }
        refreshSpaces()
    }, [spaceId, refreshSpaces])

    useEffect(() => {
        const handleKeyToggleSelectionLock = (event) => {
            if (event.defaultPrevented) return
            if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return
            const target = event.target
            const tagName = (target?.tagName || '').toLowerCase()
            const isTyping = tagName === 'input' || tagName === 'textarea' || tagName === 'select' || target?.isContentEditable
            if (isTyping) return
            if (event.key && event.key.toLowerCase() === 'l') {
                setIsSelectionLocked(prev => !prev)
            }
        }
        window.addEventListener('keydown', handleKeyToggleSelectionLock)
        return () => window.removeEventListener('keydown', handleKeyToggleSelectionLock)
    }, [])

    // Do not auto-load server scenes; keep the locally saved scene unless the user explicitly reloads.

    useEffect(() => {
        if (!isAdminMode || !isUiVisible) {
            setIsSpacesPanelVisible(false)
        }
    }, [isAdminMode, isUiVisible])


    // --- Hooks ---
    // This hook loads the scene from localStorage
    const cloneObjects = (list) => JSON.parse(JSON.stringify(list))

    const [history, setHistory] = useState([])
    const [historyIndex, setHistoryIndexInternal] = useState(-1)
    const historyIndexRef = useRef(-1)

    const setHistoryIndex = useCallback((valueOrUpdater) => {
        setHistoryIndexInternal(prev => {
            const nextValue = typeof valueOrUpdater === 'function' ? valueOrUpdater(prev) : valueOrUpdater
            historyIndexRef.current = nextValue
            return nextValue
        })
    }, [])
    const handleCreateSpaceEntry = useCallback(async ({ isPermanent = false, label, slug } = {}) => {
        if (isCreatingSpace) return
        resetRemoteAssets()
        setIsCreatingSpace(true)
        try {
            let targetId = ''
            if (supportsServerSpaces) {
                const desiredSlug = slugifySpaceName(slug || label || '')
                const serverSpace = await createServerSpace({
                    label,
                    slug: desiredSlug,
                    isPermanent
                })
                targetId = serverSpace?.id || desiredSlug
                deleteSpace(targetId)
                createSpace({
                    isPermanent: Boolean(serverSpace?.permanent),
                    label: serverSpace?.label || label || targetId,
                    slug: targetId
                })
            } else {
                const record = createSpace({ isPermanent, label, slug })
                targetId = record.id
            }
            const blankScene = {
                ...defaultScene,
                version: SCENE_DATA_VERSION,
                objects: [],
                defaultSceneVersion: null
            }
            persistSceneToLocalStorage(blankScene, getSceneStorageKey(targetId))
            await refreshSpaces()
            const url = getSpaceShareUrl(targetId)
            window.location.href = url
        } catch (error) {
            console.warn('Failed to create space', error)
            alert('Could not create space. Please try again.')
        } finally {
            setIsCreatingSpace(false)
        }
    }, [
        createSpace,
        deleteSpace,
        getSpaceShareUrl,
        getSceneStorageKey,
        isCreatingSpace,
        persistSceneToLocalStorage,
        refreshSpaces,
        resetRemoteAssets,
        supportsServerSpaces
    ])
    const handleOpenSpace = useCallback((spaceIdentifier) => {
        const url = getSpaceShareUrl(spaceIdentifier)
        window.open(url, '_blank', 'noopener')
    }, [])
    const handleCopySpaceLink = useCallback(async (spaceIdentifier) => {
        const url = getSpaceShareUrl(spaceIdentifier)
        try {
            await navigator.clipboard.writeText(url)
            return true
        } catch (error) {
            console.warn('Clipboard API unavailable, showing link prompt.', error)
            window.prompt('Copy space link', url)
            return false
        }
    }, [])
    const handleCreateNamedSpace = useCallback(async (isPermanent = false) => {
        if (!canCreateNamedSpace || isCreatingSpace) return
        const label = trimmedSpaceName || newSpaceSlug
        await handleCreateSpaceEntry({ isPermanent, label, slug: newSpaceSlug })
        setNewSpaceName('')
    }, [canCreateNamedSpace, handleCreateSpaceEntry, isCreatingSpace, newSpaceSlug, trimmedSpaceName])

    const {
        handleDeleteSpace,
        handleToggleSpacePermanent,
        handleQuickSpaceCreate
    } = useSpaceActions({
        spaceId,
        handleCreateSpaceEntry,
        isCreatingSpace,
        spaces,
        refreshSpaces
    })

    const handleCreateSelectionGroup = useCallback((customMembers) => {
        const baseMembers = Array.isArray(customMembers) && customMembers.length
            ? customMembers
            : (Array.isArray(selectedObjectIds) ? selectedObjectIds : [])
        const members = expandIdsWithGroups(baseMembers)
        if (members.length < 2) {
            alert('Select at least two objects to group.')
            return
        }
        const defaultName = `Group ${selectionGroups.length + 1}`
        const name = window.prompt('Group name?', defaultName)?.trim()
        if (!name) return
        const newGroup = {
            id: `group-${Date.now()}`,
            name,
            members
        }
        persistSelectionGroups([...selectionGroups, newGroup])
    }, [persistSelectionGroups, selectedObjectIds, selectionGroups])

    const handleSelectSelectionGroup = useCallback((groupId) => {
        const group = selectionGroups.find(entry => entry.id === groupId)
        if (!group?.members?.length) return
        applySelection(group.members)
    }, [applySelection, selectionGroups])

    const handleDeleteSelectionGroup = useCallback((groupId) => {
        persistSelectionGroups(selectionGroups.filter(group => group.id !== groupId))
    }, [persistSelectionGroups, selectionGroups])

    const handleUngroupSelection = useCallback(() => {
        if (!selectedObjectIds.length) return
        const updated = selectionGroups
            .map(group => ({
                ...group,
                members: group.members.filter(memberId => !selectedObjectIds.includes(memberId))
            }))
            .filter(group => group.members.length >= 2)
        persistSelectionGroups(updated)
    }, [persistSelectionGroups, selectedObjectIds, selectionGroups])

    const selectionHasGroup = useMemo(() => {
        if (!selectedObjectIds.length) return false
        return selectionGroups.some(group => group.members.some(memberId => selectedObjectIds.includes(memberId)))
    }, [selectedObjectIds, selectionGroups])

    const handleSelectObjectFromOutliner = useCallback((objectId) => {
        if (!objectId) return
        selectObject(objectId, { additive: false })
    }, [selectObject])

    const handleToggleObjectVisibility = useCallback((objectId) => {
        if (!objectId) return
        setObjects(prev => prev.map(obj => {
            if (obj.id !== objectId) return obj
            return {
                ...obj,
                isVisible: obj.isVisible === false ? true : !obj.isVisible
            }
        }))
    }, [setObjects])

    useEffect(() => {
        let isCancelled = false

        const initializeScene = async () => {
            try {
                const savedData = localStorage.getItem(sceneStorageKey);
                if (!savedData) {
                    // Try loading server scene first when nothing is stored locally
                    // Skip if a clear just happened and saved empty scene
                    if (canPublishToServer && !isOfflineMode && spaceId && !skipServerLoadRef.current) {
                        try {
                            const response = await getServerScene(spaceId)
                            if (response?.scene) {
                                const baseUrl = response.scene.assetsBaseUrl || serverAssetBaseUrl || ''
                                await applyRemoteScene(response.scene, {
                                    silent: true,
                                    remoteVersion: response.scene.defaultSceneVersion || null,
                                    assetsBaseUrl: baseUrl,
                                    serverVersion: response.version ?? null
                                })
                                markServerSync('Loaded from server')
                                return
                            }
                        } catch (error) {
                            console.warn('Failed to load server scene on first open', error)
                        }
                    }

                    resetRemoteAssets()
                    setRemoteSceneVersion(null)
                    const blankScene = {
                        ...defaultScene,
                        version: SCENE_DATA_VERSION,
                        defaultSceneVersion: null
                    }
                    const normalizedBlankObjects = normalizeObjects(blankScene.objects)
                    const blankSceneData = {
                        ...blankScene,
                        objects: normalizedBlankObjects,
                        sceneVersion: 0
                    }
                    setObjects(blankSceneData.objects)
                    setBackgroundColor(blankScene.backgroundColor)
                    setGridSize(blankScene.gridSize)
                    setTransformSnaps(blankScene.transformSnaps)
                    setIsGridVisible(blankScene.isGridVisible)
                    setIsGizmoVisible(blankScene.isGizmoVisible)
                    setIsPerfVisible(blankScene.isPerfVisible)
                    setAmbientLight(blankScene.ambientLight)
                    setDirectionalLight(blankScene.directionalLight)
                    setDefault3DView(blankScene.default3DView)
                    setCameraPosition(blankScene.savedView.position)
                    setCameraTarget(blankScene.savedView.target)
                    setSceneVersion(0)
                    persistSceneDataWithStatus(blankSceneData, 'Initialized blank scene')
                    updateSceneSignature(blankSceneData)
                    return
                }
                const sceneData = JSON.parse(savedData);
                setSceneVersion(Number(sceneData.sceneVersion) || 0)
                const assetsManifest = Array.isArray(sceneData.assets) ? sceneData.assets : []
                if (assetsManifest.length) {
                    setRemoteAssetsManifest(assetsManifest, sceneData.assetsBaseUrl || DEFAULT_SCENE_REMOTE_BASE)
                } else {
                    resetRemoteAssets()
                }
                
                if (!sceneData.version || sceneData.version < SCENE_DATA_VERSION) {
                    console.warn("Old or invalid scene data version. Clearing localStorage.");
                    localStorage.removeItem(sceneStorageKey);
                    const blankScene = {
                        ...defaultScene,
                        version: SCENE_DATA_VERSION,
                        defaultSceneVersion: null
                    }
                    const normalizedBlankObjects = normalizeObjects(blankScene.objects)
                    const blankSceneData = {
                        ...blankScene,
                        objects: normalizedBlankObjects,
                        sceneVersion: 0
                    }
                    setObjects(blankSceneData.objects)
                    setBackgroundColor(blankScene.backgroundColor)
                    setGridSize(blankScene.gridSize)
                    setTransformSnaps(blankScene.transformSnaps)
                    setIsGridVisible(blankScene.isGridVisible)
                    setIsGizmoVisible(blankScene.isGizmoVisible)
                    setIsPerfVisible(blankScene.isPerfVisible)
                    setAmbientLight(blankScene.ambientLight)
                    setDirectionalLight(blankScene.directionalLight)
                    setDefault3DView(blankScene.default3DView)
                    setCameraPosition(blankScene.savedView.position)
                    setCameraTarget(blankScene.savedView.target)
                    setSceneVersion(0)
                    persistSceneDataWithStatus(blankSceneData, 'Initialized blank scene')
                    updateSceneSignature(blankSceneData)
                    return; 
                }

                const normalizedObjects = normalizeObjects(sceneData.objects || defaultScene.objects)
                const normalizedSceneData = {
                    ...sceneData,
                    objects: normalizedObjects
                }
                setObjects(normalizedObjects);
                setBackgroundColor(sceneData.backgroundColor || defaultScene.backgroundColor);
                setGridSize(sceneData.gridSize || defaultScene.gridSize);
        setAmbientLight(sceneData.ambientLight || defaultScene.ambientLight)
        setDirectionalLight(sceneData.directionalLight || defaultScene.directionalLight)
        setDefault3DView(sceneData.default3DView || defaultScene.default3DView);
        setGridAppearance(sceneData.gridAppearance || DEFAULT_GRID_APPEARANCE)
        setTransformSnaps(sceneData.transformSnaps || defaultScene.transformSnaps)
        setIsGridVisible(
            typeof sceneData.isGridVisible === 'boolean'
                ? sceneData.isGridVisible
                : defaultScene.isGridVisible
                )
                setIsGizmoVisible(
                    typeof sceneData.isGizmoVisible === 'boolean'
                        ? sceneData.isGizmoVisible
                        : defaultScene.isGizmoVisible
                )
                setIsPerfVisible(
                    typeof sceneData.isPerfVisible === 'boolean'
                        ? sceneData.isPerfVisible
                        : defaultScene.isPerfVisible
                )
                setRemoteSceneVersion(null)

                const savedView = sceneData.savedView || defaultScene.savedView;
                setCameraPosition(savedView.position);
                setCameraTarget(savedView.target);
                
                updateSceneSignature(normalizedSceneData)
                persistSceneDataWithStatus(normalizedSceneData, 'Loaded scene locally')

            } catch (error) {
                console.error("Failed to load scene from localStorage. Clearing.", error);
                localStorage.removeItem(sceneStorageKey);
            } finally {
                if (!isCancelled) {
                    setIsLoading(false);
                }
            }
        }

        initializeScene()

        return () => { isCancelled = true }
    }, [applyRemoteScene, canPublishToServer, isOfflineMode, markServerSync, persistSceneDataWithStatus, resetRemoteAssets, sceneStorageKey, serverAssetBaseUrl, setRemoteAssetsManifest, spaceId, updateSceneSignature]); 

    const canUndo = historyIndex > 0
    const canRedo = historyIndex < history.length - 1 && historyIndex >= 0

    useEffect(() => {
        if (!controlsRef.current) return
        const controls = controlsRef.current
        controls.enableDamping = false
        const handleChange = () => {
            const position = controls.object.position.toArray()
            const target = controls.target.toArray()
            setCameraPosition(position)
            setCameraTarget(target)
        }
        controls.addEventListener('change', handleChange)
        return () => controls.removeEventListener('change', handleChange)
    }, [controlsRef])

    useEffect(() => {
        if (isLoading) return
        if (isHistoryRestoring.current) {
            isHistoryRestoring.current = false
            return
        }
        setHistory(prevHistory => {
            const pointer = historyIndexRef.current
            const truncated = prevHistory.slice(0, pointer + 1)
            const snapshot = cloneObjects(objects)
            const nextHistory = [...truncated, snapshot]
            setHistoryIndex(nextHistory.length - 1)
            return nextHistory
        })
    }, [objects, isLoading, setHistoryIndex])

    // This hook updates the camera target when it changes
    useEffect(() => {
        let rafId = null
        const checkControls = () => {
            if (controlsRef.current) {
                setControlsReady(true)
                return
            }
            rafId = requestAnimationFrame(checkControls)
        }
        checkControls()
        return () => {
            if (rafId) cancelAnimationFrame(rafId)
        }
    }, [])

    useEffect(() => {
        if (!controlsReady || isLoading || !controlsRef.current) return
        controlsRef.current.object.position.set(...cameraPosition);
        controlsRef.current.object.updateProjectionMatrix?.();
        controlsRef.current.update();
    }, [controlsReady, isLoading, cameraPosition]);

    useEffect(() => {
        if (!controlsReady || isLoading || !controlsRef.current) return
        controlsRef.current.target.set(...cameraTarget);
        controlsRef.current.update();
    }, [controlsReady, isLoading, cameraTarget]);

    useEffect(() => {
        if (!controlsReady || !controlsRef.current) return
        const controls = controlsRef.current
        const handleControlEnd = () => {
            const position = controls.object.position.toArray()
            const target = controls.target.toArray()
            setCameraPosition(position)
            setCameraTarget(target)
        }
        controls.addEventListener('end', handleControlEnd)
        return () => {
            controls.removeEventListener('end', handleControlEnd)
        }
    }, [controlsReady])

    // This hook is for keydown events
    
    
    // --- Handlers ---
    // Get the base camera settings (orthographic or perspective)
    const currentCameraSettings = cameraSettings

    const handleAddObject = (type, overrides = {}) => {
        const basePosition = overrides.position ?? menu.position3D ?? { x: 0, y: 0, z: 0 }
        let payloadData = overrides.data ?? null
        let assetRef = overrides.assetRef ?? null
        setMenu(prev => ({ ...prev, visible: false }))

        if (type === 'text-3d' || type === 'text-2d') {
            payloadData = prompt('Enter your text:')
            if (!payloadData) return
        }
        
        const normalizedPosition = Array.isArray(basePosition)
            ? basePosition
            : [
                Math.round(basePosition.x ?? 0),
                Math.round(basePosition.y ?? 0),
                Math.round(basePosition.z ?? 0)
            ]

        const newObject = {
            id: generateObjectId(),
            type,
            data: payloadData,
            assetRef,
            position: [normalizedPosition[0], normalizedPosition[1] ?? 0, normalizedPosition[2]],
            rotation: overrides.rotation ?? [0, 0, 0],
            scale: overrides.scale ?? [1, 1, 1],
            color: (() => {
                if (overrides.color) return overrides.color
                if (type.includes('text')) return '#000000'
                if (type === 'audio') return '#800080'
                if (type === 'box') return '#0000ff'
                return '#ff0000'
            })(),
            isVisible: true,
            fontWeight: 'normal',
            fontStyle: 'normal',
            linkUrl: overrides.linkUrl ?? '',
            linkActive: overrides.linkActive ?? false
        }

        if (type === 'text-2d') {
            newObject.fontFamily = 'Arial'; 
        }
        if (type === 'text-3d') {
            newObject.fontSize3D = 0.5
            newObject.depth3D = 0.2
            newObject.bevelEnabled3D = true
            newObject.bevelThickness3D = 0.02
            newObject.bevelSize3D = 0.01
            newObject.font3D = 'helvetiker_regular'
        }
        if (type === 'box') {
            newObject.boxSize = overrides.boxSize || [1, 1, 1]
        }
        if (type === 'sphere') {
            newObject.sphereRadius = overrides.sphereRadius || 0.5
        }
        if (type === 'cone') {
            newObject.coneRadius = overrides.coneRadius || 0.5
            newObject.coneHeight = overrides.coneHeight || 1.5
        }
        if (type === 'cylinder') {
            newObject.cylinderRadiusTop = overrides.cylinderRadiusTop || 0.5
            newObject.cylinderRadiusBottom = overrides.cylinderRadiusBottom || 0.5
            newObject.cylinderHeight = overrides.cylinderHeight || 1.5
        }
        if (type === 'audio') {
            newObject.audioVolume = overrides.audioVolume ?? 0.8
            newObject.audioDistance = overrides.audioDistance ?? 8
            newObject.audioLoop = overrides.audioLoop ?? true
            newObject.audioAutoplay = overrides.audioAutoplay ?? true
            newObject.audioPaused = overrides.audioPaused ?? false
        }
        if (type === 'model') {
            newObject.opacity = overrides.opacity ?? 1
            newObject.applyModelColor = overrides.applyModelColor ?? false
            newObject.modelColor = overrides.modelColor ?? '#ffffff'
            newObject.modelFormat = overrides.modelFormat || detectModelFormatFromMeta(assetRef) || MODEL_FORMATS.GLTF
            newObject.materialsAssetRef = overrides.materialsAssetRef || null
        }
        if (['image', 'video'].includes(type)) {
            newObject.opacity = overrides.opacity ?? 1
        }
        if (['video', 'audio'].includes(type)) {
            newObject.mediaVariants = overrides.mediaVariants || null
            newObject.selectedVariant = overrides.selectedVariant || null
        }
        
        setObjects(prevObjects => [ ...prevObjects, newObject ])
        applySelection([newObject.id])
    }

    const getFileTypeForObject = (file) => {
        if (!file) return null
        const mime = file.type || ''
        if (mime.startsWith('image/')) return { type: 'image' }
        if (mime.startsWith('video/')) return { type: 'video' }
        if (mime.startsWith('audio/')) return { type: 'audio' }
        const modelFormat = detectModelFormatFromFile(file)
        if (modelFormat) return { type: 'model', modelFormat }
        return null
    }

    const optimizeImageFile = async (file) => {
        if (!('createImageBitmap' in window) || typeof OffscreenCanvas === 'undefined') {
            return file
        }
        try {
            const bitmap = await createImageBitmap(file)
            const maxDimension = 2048
            const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height))
            const targetWidth = Math.round(bitmap.width * scale)
            const targetHeight = Math.round(bitmap.height * scale)
            const canvas = new OffscreenCanvas(targetWidth, targetHeight)
            const ctx = canvas.getContext('2d', { alpha: true })
            ctx.drawImage(bitmap, 0, 0, targetWidth, targetHeight)
            const blob = await canvas.convertToBlob({
                type: 'image/webp',
                quality: 0.85
            })
            if (blob && blob.size < file.size) {
                return new File([blob], file.name.replace(/\.[^/.]+$/, '.webp'), { type: blob.type })
            }
        } catch (error) {
            console.warn('Failed to optimize image, falling back to original.', error)
        }
        return file
    }

    const transcodeMediaWithRecorder = async (file, { kind }) => {
        if (typeof window === 'undefined' || typeof MediaRecorder === 'undefined') {
            return file
        }
        if (kind === 'audio' && (file?.type || '').toLowerCase().includes('flac')) {
            // Skip optimization for FLAC; many browsers can't decode/capture it reliably
            return file
        }
        const element = document.createElement(kind === 'video' ? 'video' : 'audio')
        element.muted = true
        element.preload = 'auto'
        element.playsInline = true
        element.crossOrigin = 'anonymous'
        const objectUrl = URL.createObjectURL(file)
        element.src = objectUrl
        const canCapture = element.captureStream || element.mozCaptureStream
        if (!canCapture) {
            URL.revokeObjectURL(objectUrl)
            return file
        }
        const streamPromise = new Promise((resolve, reject) => {
            let timeoutId = null
            const cleanup = () => {
                element.removeEventListener('loadedmetadata', handleLoaded)
                element.removeEventListener('error', handleError)
                if (timeoutId) {
                    clearTimeout(timeoutId)
                }
            }
            const handleLoaded = () => {
                cleanup()
                resolve()
            }
            const handleError = () => {
                cleanup()
                reject(new Error('Failed to load media for optimization.'))
            }
            element.addEventListener('loadedmetadata', handleLoaded, { once: true })
            element.addEventListener('error', handleError, { once: true })
            timeoutId = window.setTimeout(() => {
                cleanup()
                reject(new Error('Timed out preparing media for optimization.'))
            }, 15000)
        })
        let stopTimeout = null
        try {
            await streamPromise
            const capture = element.captureStream ? element.captureStream() : element.mozCaptureStream()
            if (!capture) {
                URL.revokeObjectURL(objectUrl)
                return file
            }
            const mimeTypeCandidates = kind === 'video'
                ? ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm']
                : ['audio/webm;codecs=opus', 'audio/webm']
            const mimeType = mimeTypeCandidates.find(type => MediaRecorder.isTypeSupported(type)) || ''
            const recorderOpts = { mimeType }
            if (kind === 'video') {
                recorderOpts.videoBitsPerSecond = 2_500_000
            }
            const recorder = new MediaRecorder(capture, recorderOpts)
            const chunks = []
            recorder.ondataavailable = (event) => {
                if (event.data?.size) {
                    chunks.push(event.data)
                }
            }
            const stopped = new Promise((resolve, reject) => {
                recorder.addEventListener('stop', resolve, { once: true })
                recorder.addEventListener('error', reject)
            })
            const maxDurationMs = (() => {
                const duration = Number.isFinite(element.duration) ? element.duration : 0
                const clamped = duration > 0 ? Math.min(duration + 2, 180) : 60
                return clamped * 1000
            })()
            stopTimeout = window.setTimeout(() => {
                if (recorder.state !== 'inactive') {
                    recorder.stop()
                }
            }, maxDurationMs)
            const playback = element.play().catch((error) => {
                throw error || new Error('Autoplay prevented while optimizing media.')
            })
            recorder.start()
            element.addEventListener('ended', () => {
                if (recorder.state !== 'inactive') {
                    recorder.stop()
                }
            }, { once: true })
            await Promise.all([stopped, playback])
            if (stopTimeout) {
                clearTimeout(stopTimeout)
            }
            URL.revokeObjectURL(objectUrl)
            const optimizedBlob = new Blob(chunks, { type: mimeType || (kind === 'video' ? 'video/webm' : 'audio/webm') })
            if (!optimizedBlob || optimizedBlob.size === 0 || optimizedBlob.size >= file.size) {
                return file
            }
            const extension = kind === 'video' ? '.webm' : '.webm'
            const newName = file.name.replace(/\.[^/.]+$/, extension)
            return new File([optimizedBlob], newName, { type: optimizedBlob.type })
        } catch (error) {
            if (kind === 'audio') {
                // Some audio blobs can't be decoded/captured; keep original silently
                console.info('Skipping audio optimization; using original file.', error?.message || error)
                if (stopTimeout) {
                    clearTimeout(stopTimeout)
                }
                URL.revokeObjectURL(objectUrl)
                return file
            }
            console.warn(`Failed to optimize ${kind} file`, error)
            if (stopTimeout) {
                clearTimeout(stopTimeout)
            }
            URL.revokeObjectURL(objectUrl)
            return file
        }
    }

    const optimizeVideoFile = (file) => transcodeMediaWithRecorder(file, { kind: 'video' })
    const optimizeAudioFile = (file) => transcodeMediaWithRecorder(file, { kind: 'audio' })

    const beginMediaOptimizationFeedback = useCallback((label) => {
        setMediaOptimizationStatus((prev) => {
            const nextCount = prev.count + 1
            const nextTotal = prev.total + 1
            return {
                active: true,
                count: nextCount,
                total: nextTotal,
                completed: prev.completed,
                label: label || prev.label || 'Optimizing media...',
                startedAt: prev.startedAt || Date.now()
            }
        })
    }, [])

    const endMediaOptimizationFeedback = useCallback(() => {
        setMediaOptimizationStatus((prev) => {
            const nextCount = Math.max(0, prev.count - 1)
            const nextCompleted = Math.min(prev.total || 0, prev.completed + 1)
            if (nextCount === 0) {
                return { active: false, count: 0, total: 0, completed: 0, label: '', startedAt: null }
            }
            return {
                active: true,
                count: nextCount,
                total: prev.total,
                completed: nextCompleted,
                label: prev.label || 'Optimizing media...',
                startedAt: prev.startedAt
            }
        })
    }, [])

    const startMediaOptimization = useCallback(async (originalMeta, originalFile, type) => {
        if (type === 'audio' && ((originalFile?.type || '').toLowerCase().includes('flac') || (originalMeta?.mimeType || '').toLowerCase().includes('flac'))) {
            return
        }
            beginMediaOptimizationFeedback(type === 'video' ? 'Optimizing video...' : 'Optimizing audio...')
        try {
            const optimizedFile = type === 'video'
                ? await optimizeVideoFile(originalFile)
                : await optimizeAudioFile(originalFile)
            if (!optimizedFile || optimizedFile.size === 0) return
            if (optimizedFile.size >= originalFile.size) return
            const optimizedMeta = await saveAssetFromFile(optimizedFile)
            setObjects(prev => prev.map(obj => {
                if (obj.mediaVariants?.original?.id === originalMeta.id || obj.assetRef?.id === originalMeta.id) {
                    const variants = {
                        ...(obj.mediaVariants || {}),
                        original: obj.mediaVariants?.original || originalMeta,
                        optimized: optimizedMeta
                    }
                    const shouldSwitch = mediaOptimizationPreference === 'auto'
                    return {
                        ...obj,
                        mediaVariants: variants,
                        selectedVariant: shouldSwitch ? 'optimized' : (obj.selectedVariant || 'original'),
                        assetRef: shouldSwitch ? optimizedMeta : obj.assetRef
                    }
                }
                return obj
            }))
        } catch (error) {
            console.warn('Media optimization failed', error)
        } finally {
            endMediaOptimizationFeedback()
        }
    }, [beginMediaOptimizationFeedback, endMediaOptimizationFeedback, mediaOptimizationPreference, setObjects])

    const handleManualMediaOptimization = useCallback(async (objectId) => {
        const targetObject = objects.find(obj => obj.id === objectId)
        if (!targetObject) return false
        if (!['video', 'audio'].includes(targetObject.type)) return false
        const originalMeta = targetObject.mediaVariants?.original || targetObject.assetRef
        if (!originalMeta?.id) {
            alert('Original media not available for optimization.')
            return false
        }
        if (manualOptimizationInFlight.current.has(originalMeta.id)) {
            return false
        }
        try {
            manualOptimizationInFlight.current.add(originalMeta.id)
            let blob = await getAssetBlob(originalMeta.id)
            if (!blob) {
                const remoteUrl = getAssetSourceUrl(originalMeta.id)
                if (remoteUrl) {
                    const response = await fetch(remoteUrl)
                    if (!response.ok) {
                        throw new Error('Failed to fetch remote media asset.')
                    }
                    blob = await response.blob()
                }
            }
            if (!blob) {
                alert('Original media file could not be found locally.')
                return false
            }
            const filename = originalMeta.name || `${originalMeta.id}.${(originalMeta.mimeType || '').split('/').pop() || 'dat'}`
            const optimizedSource = new File([blob], filename, { type: originalMeta.mimeType || (targetObject.type === 'video' ? 'video/mp4' : 'audio/mpeg') })
            await startMediaOptimization(originalMeta, optimizedSource, targetObject.type)
            return true
        } catch (error) {
            console.warn('Manual media optimization failed', error)
            alert('Failed to optimize this media. Please try again or re-upload the original file.')
            return false
        } finally {
            manualOptimizationInFlight.current.delete(originalMeta.id)
        }
    }, [objects, startMediaOptimization])

    const uploadAssetToServer = useCallback(async ({ file, assetId, name, mimeType, trackPending = true } = {}) => {
        if (!canUploadServerAssets || !spaceId || !file) return null
        if (trackPending) {
            setServerAssetSyncPending(prev => prev + 1)
        }
        try {
            const fallbackName = name || assetId || (file?.name) || 'asset.bin'
            const fallbackType = mimeType || file?.type || 'application/octet-stream'
            const uploadBlob = file instanceof Blob ? file : new Blob([file], { type: fallbackType })
            const response = await uploadServerAsset(spaceId, uploadBlob, {
                assetId,
                filename: fallbackName
            })
            if (!response?.assetId) return null
            const entry = {
                id: response.assetId,
                name: name || file?.name || response.assetId,
                mimeType: response.mimeType || mimeType || fallbackType,
                size: response.size ?? uploadBlob.size ?? 0,
                url: response.url || (serverAssetBaseUrl ? `${serverAssetBaseUrl.replace(/\/+$/, '')}/${response.assetId}` : '')
            }
            upsertRemoteAssetEntry(entry, serverAssetBaseUrl)
            return entry
        } catch (error) {
            console.warn('Failed to upload asset to server', error)
            return null
        } finally {
            if (trackPending) {
                setServerAssetSyncPending(prev => Math.max(0, prev - 1))
            }
        }
    }, [canUploadServerAssets, spaceId, serverAssetBaseUrl, upsertRemoteAssetEntry])

    const ingestAssetFile = useCallback(async (file) => {
        if (!file) return null
        let options
        if (canUploadServerAssets) {
            const remoteEntry = await uploadAssetToServer({
                file,
                name: file?.name,
                mimeType: file?.type
            })
            if (remoteEntry?.id) {
                options = { id: remoteEntry.id }
            }
        }
        return saveAssetFromFile(file, options)
    }, [canUploadServerAssets, uploadAssetToServer, saveAssetFromFile])

    const handleAddAssetObject = async (file, type, overrides = {}) => {
        if (!file) return
        let sourceFile = file
        if (type === 'image') {
            sourceFile = await optimizeImageFile(file)
        } else if (type === 'video' || type === 'audio') {
            const originalMeta = overrides.assetRef || await ingestAssetFile(file)
            handleAddObject(type, {
                ...overrides,
                assetRef: originalMeta,
                mediaVariants: {
                    ...(overrides.mediaVariants || {}),
                    original: originalMeta
                },
                selectedVariant: overrides.selectedVariant || 'original'
            })
            return
        }
        const assetMeta = overrides.assetRef || await ingestAssetFile(sourceFile)
        handleAddObject(type, { ...overrides, assetRef: assetMeta })
    }

    const [isFullscreen, setIsFullscreen] = useState(Boolean(document.fullscreenElement))

    useEffect(() => {
        const handleFullscreenChange = () => {
            setIsFullscreen(Boolean(document.fullscreenElement))
        }
        document.addEventListener('fullscreenchange', handleFullscreenChange)
        return () => {
            document.removeEventListener('fullscreenchange', handleFullscreenChange)
        }
    }, [])

    const handleEnterFullscreen = () => {
        document.documentElement.requestFullscreen?.()
    }

    const handleAssetFilesUpload = useCallback(async (fileList, options = {}) => {
        if (!fileList) return
        const files = Array.from(fileList).filter(Boolean)
        if (files.length === 0) return
        const unsupported = []
        const consumedMaterialIndices = new Set()
        const materialLookup = new Map()

        files.forEach((file, index) => {
            const lowerName = (file.name || '').toLowerCase()
            if (lowerName.endsWith('.mtl')) {
                const baseName = stripExtension(lowerName)
                if (!materialLookup.has(baseName)) {
                    materialLookup.set(baseName, [])
                }
                materialLookup.get(baseName).push({ file, index })
            }
        })

        const incrementProgress = () => {
            setUploadProgress(prev => ({
                ...prev,
                completed: Math.min(prev.total, prev.completed + 1)
            }))
        }

        setUploadProgress({
            active: true,
            total: files.length,
            completed: 0
        })
        for (let index = 0; index < files.length; index++) {
            if (consumedMaterialIndices.has(index)) {
                incrementProgress()
                continue
            }

            const file = files[index]
            const fileIntent = getFileTypeForObject(file)
            if (!fileIntent) {
                unsupported.push(file.name)
                incrementProgress()
                continue
            }
            let positionOverride = undefined
            if (options.position && Array.isArray(options.position)) {
                const offset = Math.floor(index / 4)
                positionOverride = [
                    options.position[0] + (index % 4),
                    options.position[1],
                    options.position[2] + offset
                ]
            }
            const overridesPayload = { position: positionOverride }

            if (fileIntent.type === 'model') {
                overridesPayload.modelFormat = fileIntent.modelFormat
                if (fileIntent.modelFormat === MODEL_FORMATS.OBJ) {
                    const baseName = stripExtension(file.name || '')
                    const candidates = materialLookup.get(baseName)
                    if (candidates?.length) {
                        const materialEntry = candidates.shift()
                        consumedMaterialIndices.add(materialEntry.index)
                        try {
                            const materialMeta = await saveAssetFromFile(materialEntry.file)
                            overridesPayload.materialsAssetRef = materialMeta
                        } catch (error) {
                            console.error(`Failed to store material file ${materialEntry.file.name}`, error)
                        }
                    }
                }
            }

            try {
                await handleAddAssetObject(file, fileIntent.type, overridesPayload)
            } catch (error) {
                console.error(`Failed to add file ${file.name}`, error)
                unsupported.push(file.name)
            } finally {
                incrementProgress()
                if (files.length > 2) {
                    await new Promise(resolve => setTimeout(resolve, 0))
                }
            }
        }
        setUploadProgress({
            active: false,
            total: 0,
            completed: 0
        })
        if (!options.silent && unsupported.length === files.length) {
            alert('Unable to add the provided files. Supported formats: images, videos, audio, .glb/.gltf, .obj/.mtl, .stl.')
        } else if (!options.silent && unsupported.length > 0) {
            alert(`Some files could not be added: ${unsupported.join(', ')}`)
        }
    }, [handleAddAssetObject])

    const captureCurrentCameraView = () => {
        if (controlsRef.current) {
            const position = controlsRef.current.object.position.toArray()
            const target = controlsRef.current.target.toArray()
            setCameraPosition(position)
            setCameraTarget(target)
            return { position, target }
        }
        return { position: cameraPosition, target: cameraTarget }
    }

    // Gathers all scene data *except* the view
    const getBaseSceneData = useCallback(() => {
        const base = {
            version: SCENE_DATA_VERSION, 
            objects: objects,
            backgroundColor: backgroundColor,
            gridSize: gridSize,
            gridAppearance,
            renderSettings,
            transformSnaps,
            isGridVisible,
            isGizmoVisible,
            isPerfVisible,
            directionalLight,
            ambientLight,
            default3DView: default3DView,
            defaultSceneVersion: remoteSceneVersion,
            sceneVersion: sceneVersion
        }
        if (Array.isArray(remoteAssetsRef.current) && remoteAssetsRef.current.length) {
            base.assets = remoteAssetsRef.current
            if (remoteAssetsBaseRef.current) {
                base.assetsBaseUrl = remoteAssetsBaseRef.current
            }
        }
        return base
    }, [
        ambientLight,
        backgroundColor,
        default3DView,
        directionalLight,
        gridAppearance,
        gridSize,
        isGizmoVisible,
        isGridVisible,
        isPerfVisible,
        renderSettings,
        objects,
        remoteSceneVersion,
        sceneVersion,
        transformSnaps
    ])

    // Gathers the *current* saved view
    const getSavedViewData = useCallback((options = {}) => {
        const { capture = true } = options
        if (!capture) {
            return {
                viewMode: '3D',
                position: cameraPosition,
                target: cameraTarget
            }
        }
        const { position, target } = captureCurrentCameraView()
        return {
            viewMode: '3D',
            position,
            target
        }
    }, [cameraPosition, cameraTarget, captureCurrentCameraView])

    const mergeAssetsManifest = (manifest = [], overrides = []) => {
        const baseList = Array.isArray(manifest) ? manifest : []
        if (!Array.isArray(overrides) || overrides.length === 0) {
            return baseList
        }
        const merged = new Map()
        baseList.forEach(entry => {
            if (entry?.id) {
                merged.set(entry.id, { ...entry })
            }
        })
        overrides.forEach(entry => {
            if (!entry?.id) return
            const existing = merged.get(entry.id) || {}
            merged.set(entry.id, {
                ...existing,
                ...entry
            })
        })
        return Array.from(merged.values())
    }

    const downloadBlob = (blob, fileName) => {
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = fileName
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        URL.revokeObjectURL(url)
    }

    const scheduleServerSceneSave = useCallback((factory) => {
        if (!LIVE_SYNC_FEATURE_ENABLED || !shouldSyncServerScene) return
        try {
            latestServerPayloadRef.current = factory()
        } catch (error) {
            console.warn('Failed to build server scene payload', error)
            return
        }
        if (pendingServerSaveRef.current) {
            clearTimeout(pendingServerSaveRef.current)
        }
        pendingServerSaveRef.current = window.setTimeout(async () => {
            const payload = latestServerPayloadRef.current
            pendingServerSaveRef.current = null
            if (!payload) return
            const ops = [
                {
                    opId: generateObjectId(),
                    clientId: liveClientIdRef.current,
                    type: 'replaceScene',
                    payload: { scene: payload }
                }
            ]
            try {
                const response = await submitSceneOps(spaceId, sceneVersionRef.current || 0, ops)
                if (typeof response?.newVersion === 'number') {
                    setSceneVersion(response.newVersion)
                }
            } catch (error) {
                console.warn('Unable to sync scene to server', error)
            }
        }, 1200)
    }, [setSceneVersion, shouldSyncServerScene, spaceId])

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

    // As a safety net, persist the current scene on tab close/refresh so local copy always wins on next load.
    useEffect(() => {
        const handleBeforeUnload = () => {
            const sceneData = {
                ...getBaseSceneData(),
                savedView: getSavedViewData({ capture: false })
            }
            persistSceneDataWithStatus(sceneData, 'Saved locally (exit)')
            updateSceneSignature(sceneData)
        }
        window.addEventListener('beforeunload', handleBeforeUnload)
        return () => window.removeEventListener('beforeunload', handleBeforeUnload)
    }, [getBaseSceneData, getSavedViewData, persistSceneDataWithStatus, updateSceneSignature])

    useEffect(() => {
        return () => {
            if (pendingServerSaveRef.current) {
                clearTimeout(pendingServerSaveRef.current)
            }
        }
    }, [])

    // "Keep World" saves everything, including the *current* view
    const handleKeepCurrentWorld = () => {
        setRemoteSceneVersion(null)
        const sceneData = {
            ...getBaseSceneData(),
            savedView: getSavedViewData() // Save the current view
        }
        sceneData.defaultSceneVersion = null
        if (persistSceneDataWithStatus(sceneData, 'Saved locally (manual)')) {
            updateSceneSignature(sceneData)
            alert('Saved locally. Refresh will load this copy. Use Publish to sync to server.')
        }
    }

    const handleSave = async () => {
        setRemoteSceneVersion(null)
        resetRemoteAssets()
        const sceneData = {
            ...getBaseSceneData(),
            savedView: getSavedViewData() // Save the current view
        }
        sceneData.defaultSceneVersion = null
        delete sceneData.assets
        delete sceneData.assetsBaseUrl
        if (!persistSceneDataWithStatus(sceneData, 'Saved locally (export)')) return; 
        updateSceneSignature(sceneData)
        
        try {
            const archiveBlob = await createSceneArchive(sceneData, {
                getAssetBlob,
                getAssetSourceUrl
            })
            downloadBlob(archiveBlob, 'my-scene.zip')
        } catch (error) {
            console.error('Failed to create download file:', error);
            alert('Error: Could not create download file.');
        }
    }

    const handleReloadFromServer = useCallback(async (options = {}) => {
        const { skipConfirm = false } = options
        if (!canPublishToServer || !spaceId) {
            alert('Server sync unavailable for this space.')
            return
        }
        if (isOfflineMode) {
            alert('Disable offline mode before reloading from the server.')
            return
        }
        if (!skipConfirm) {
            const confirmed = window.confirm('Reloading will replace your local scene with the server version. Continue?')
            if (!confirmed) return
        }
        setOfflineMode(false)
        try {
            const response = await getServerScene(spaceId)
            if (response?.scene) {
                const baseUrl = response.scene.assetsBaseUrl || serverAssetBaseUrl || ''
                await applyRemoteScene(response.scene, {
                    silent: true,
                    remoteVersion: response.scene.defaultSceneVersion || null,
                    assetsBaseUrl: baseUrl,
                    serverVersion: response.version ?? null
                })
                markServerSync('Reloaded from server')
            } else {
                alert('Server scene not available.')
            }
        } catch (error) {
            console.warn('Failed to reload server scene', error)
            alert('Error: Could not reload scene from server.')
        }
    }, [applyRemoteScene, canPublishToServer, isOfflineMode, markServerSync, serverAssetBaseUrl, setOfflineMode, spaceId])

    const syncAssetsForPublish = useCallback(async () => {
        if (!canPublishToServer) return true
        const entries = await resolveAssetEntries(objects, { getAssetBlob, getAssetSourceUrl })
        const targets = entries.filter(({ meta }) => {
            if (!meta?.id) return false
            return !getAssetSourceUrl(meta.id)
        })
        if (!targets.length) {
            setServerAssetSyncProgress({
                active: false,
                completed: 0,
                total: 0,
                label: ''
            })
            return true
        }
        if (!canUploadServerAssets) {
            throw new Error('Cannot sync assets while offline. Disable offline mode and try again.')
        }
        setServerAssetSyncProgress({
            active: true,
            completed: 0,
            total: targets.length,
            label: 'Syncing assets to server...'
        })
        let completed = 0
        try {
            for (const entry of targets) {
                const meta = entry.meta
                const blob = entry.blob
                if (!blob || !meta?.id) continue
                await uploadAssetToServer({
                    file: blob,
                    assetId: meta.id,
                    name: meta.name,
                    mimeType: meta.mimeType,
                    trackPending: false
                })
                completed += 1
                setServerAssetSyncProgress(prev => ({
                    ...prev,
                    completed: completed
                }))
            }
        } finally {
            setServerAssetSyncProgress({
                active: false,
                completed: 0,
                total: 0,
                label: ''
            })
        }
        return true
    }, [canPublishToServer, canUploadServerAssets, getAssetBlob, getAssetSourceUrl, objects, uploadAssetToServer])

    const handlePublishToServer = useCallback(async () => {
        if (!canPublishToServer || !spaceId) {
            alert('Publishing is unavailable for this space.')
            return
        }
        let payload = null
        try {
            await syncAssetsForPublish()
            payload = {
                ...getBaseSceneData(),
                savedView: getSavedViewData()
            }
            setOfflineMode(false)
            const response = await submitSceneOps(spaceId, sceneVersionRef.current || 0, [
                {
                    opId: generateObjectId(),
                    clientId: liveClientIdRef.current,
                    type: 'replaceScene',
                    payload: { scene: payload }
                }
            ])
            if (typeof response?.newVersion === 'number') {
                setSceneVersion(response.newVersion)
            }
            markServerSync('Published to server')
            alert('Scene synced to server.')
        } catch (error) {
            console.warn('Failed to publish scene to server', error)
            if (error?.status === 409) {
                const latestVersion = error?.data?.latestVersion
                const reloadMessage = latestVersion
                    ? `Server scene version ${latestVersion} differs from your local copy. Choose OK to reload from server, or Cancel to consider overwriting the server scene.`
                    : 'Server scene changed since your last reload. Choose OK to reload from server, or Cancel to consider overwriting it.'
                const shouldReload = window.confirm(reloadMessage)
                if (shouldReload) {
                    await handleReloadFromServer({ skipConfirm: true })
                    return
                }
                if (!payload) {
                    alert('Cannot force publish without a scene payload.')
                    return
                }
                const force = window.confirm('Force publish and overwrite the server scene for everyone? This cannot be undone.')
                if (!force) {
                    alert('Publish cancelled.')
                    return
                }
                try {
                    const response = await overwriteServerScene(spaceId, {
                        ...payload,
                        sceneVersion: sceneVersionRef.current || payload.sceneVersion || 0
                    })
                    if (typeof response?.newVersion === 'number') {
                        setSceneVersion(response.newVersion)
                        markServerSync('Published to server (forced)')
                    } else {
                        await handleReloadFromServer({ skipConfirm: true })
                    }
                    alert('Server scene overwritten with your copy.')
                } catch (forceError) {
                    console.warn('Force publish failed', forceError)
                    alert(forceError?.message || 'Error: Force publish failed.')
                }
                return
            }
            alert(error?.message || 'Error: Could not sync scene to server.')
        }
    }, [canPublishToServer, getBaseSceneData, getSavedViewData, handleReloadFromServer, markServerSync, overwriteServerScene, setOfflineMode, spaceId, syncAssetsForPublish])

    const handleToggleOfflineMode = useCallback(() => {
        setOfflineMode(!isOfflineMode)
        alert(!isOfflineMode ? 'Offline mode enabled: server sync disabled.' : 'Offline mode disabled: server sync available.')
    }, [isOfflineMode, setOfflineMode])

    const handleLoadClick = () => {
        fileInputRef.current.click();
    }

    const applyLoadedScene = async (sceneData, assetBlobLoader, options = {}) => {
        const { silent = false } = options
        if (!sceneData.version || sceneData.version < SCENE_DATA_VERSION) {
            alert('Error: This is an old or incompatible save file.')
            return
        }

        resetRemoteAssets()
        await clearAllAssets()
        resetAssetStoreQuotaState()
        const manifest = Array.isArray(sceneData.assets) ? sceneData.assets : []
        const { fallbackAssets } = await restoreAssetsFromPayload(manifest, assetBlobLoader)
        const mergedManifest = mergeAssetsManifest(manifest, fallbackAssets)
        if (mergedManifest.length) {
            setRemoteAssetsManifest(mergedManifest, sceneData.assetsBaseUrl || '')
        }

        const remappedObjects = (sceneData.objects || defaultScene.objects).map(obj => ({
            ...obj,
            assetRef: obj.assetRef || null
        }))
        const nextObjects = normalizeObjects(remappedObjects)

        setObjects(nextObjects)
        setBackgroundColor(sceneData.backgroundColor || defaultScene.backgroundColor)
        setGridSize(sceneData.gridSize || defaultScene.gridSize)
        setGridAppearance(sceneData.gridAppearance || DEFAULT_GRID_APPEARANCE)
        setRenderSettings(sceneData.renderSettings || DEFAULT_RENDER_SETTINGS)
        setTransformSnaps(sceneData.transformSnaps || defaultScene.transformSnaps)
        setIsGridVisible(
            typeof sceneData.isGridVisible === 'boolean'
                ? sceneData.isGridVisible
                : defaultScene.isGridVisible
        )
        setIsGizmoVisible(
            typeof sceneData.isGizmoVisible === 'boolean'
                ? sceneData.isGizmoVisible
                : defaultScene.isGizmoVisible
        )
        setIsPerfVisible(
            typeof sceneData.isPerfVisible === 'boolean'
                ? sceneData.isPerfVisible
                : defaultScene.isPerfVisible
        )
        setAmbientLight(sceneData.ambientLight || defaultScene.ambientLight)
        setDirectionalLight(sceneData.directionalLight || defaultScene.directionalLight)
        setDefault3DView(sceneData.default3DView || defaultScene.default3DView)
        
        const savedView = sceneData.savedView || defaultScene.savedView
        setCameraPosition(savedView.position)
        setCameraTarget(savedView.target)
        
        clearSelection()
        
        persistSceneDataWithStatus({
            version: SCENE_DATA_VERSION,
            objects: nextObjects,
            backgroundColor: sceneData.backgroundColor || defaultScene.backgroundColor,
            gridSize: sceneData.gridSize || defaultScene.gridSize,
            gridAppearance: sceneData.gridAppearance || DEFAULT_GRID_APPEARANCE,
            isGridVisible:
                typeof sceneData.isGridVisible === 'boolean'
                    ? sceneData.isGridVisible
                    : defaultScene.isGridVisible,
            isGizmoVisible:
                typeof sceneData.isGizmoVisible === 'boolean'
                    ? sceneData.isGizmoVisible
                    : defaultScene.isGizmoVisible,
            isPerfVisible:
                typeof sceneData.isPerfVisible === 'boolean'
                    ? sceneData.isPerfVisible
                    : defaultScene.isPerfVisible,
            ambientLight: sceneData.ambientLight || defaultScene.ambientLight,
            directionalLight: sceneData.directionalLight || defaultScene.directionalLight,
            default3DView: sceneData.default3DView || defaultScene.default3DView,
            savedView,
            defaultSceneVersion: null,
            sceneVersion: Number(sceneData.sceneVersion) || 0,
            assets: mergedManifest,
            assetsBaseUrl: sceneData.assetsBaseUrl || '',
            renderSettings: sceneData.renderSettings || DEFAULT_RENDER_SETTINGS
        }, 'Loaded scene locally')
        if (!silent) {
            alert('Scene loaded successfully!')
        }
    }

    const handleArchiveSceneLoad = async (arrayBuffer, options) => {
        await loadSceneArchive(arrayBuffer, applyLoadedScene, options)
    }

    const handleFileLoad = (event) => {
        const file = event.target.files[0]
        if (!file) return
        const isArchive = file.name.endsWith('.zip') || file.type === 'application/zip' || file.type === 'application/x-zip-compressed'
        if (!isArchive) {
            alert('Please select a .zip scene exported from this editor.')
            event.target.value = null
            return
        }
        const reader = new FileReader()
        reader.onload = async (e) => {
            try {
                await handleArchiveSceneLoad(e.target.result)
            } catch (error) {
                console.error('Failed to load scene archive:', error)
                alert(`Error: Could not load scene. ${error.message || 'The file might be corrupt or not valid.'}`)
                return
            }

            // Default-scene upload path removed; publishing now handled via server publish only.
        }
        reader.onerror = () => {
            alert('Error: Could not read file.')
        }
        reader.readAsArrayBuffer(file)
        event.target.value = null
    }

    const deleteSelectedObject = useCallback(() => {
        const targets = selectedObjectIds.length
            ? selectedObjectIds
            : (selectedObjectId ? [selectedObjectId] : [])
        if (!targets.length) return
        setObjects(prev => prev.filter(obj => !targets.includes(obj.id)))
        applySelection([])
    }, [applySelection, selectedObjectId, selectedObjectIds, setObjects])

    const copySelectedObject = useCallback(() => {
        if (!selectedObjectId) return
        const original = objects.find(obj => obj.id === selectedObjectId)
        if (!original) return
        clipboardRef.current = cloneObjects([original])[0]
    }, [objects, selectedObjectId])

    const pasteClipboardObject = useCallback(() => {
        const data = clipboardRef.current
        if (!data) return
        const base = cloneObjects([data])[0]
        const newObject = {
            ...base,
            id: generateObjectId(),
            position: [base.position[0] + 1, base.position[1], base.position[2] + 1]
        }
        setObjects(prev => [...prev, newObject])
        applySelection([newObject.id])
    }, [applySelection, setObjects])

    const cutSelectedObject = useCallback(() => {
        if (!selectedObjectId) return
        copySelectedObject()
        deleteSelectedObject()
    }, [copySelectedObject, deleteSelectedObject, selectedObjectId])

    const duplicateSelectedObject = useCallback(() => {
        if (!selectedObjectId) return
        const original = objects.find(obj => obj.id === selectedObjectId)
        if (!original) return
        const clone = {
            ...cloneObjects([original])[0],
            id: generateObjectId(),
            position: [original.position[0] + 1, original.position[1], original.position[2] + 1]
        }
        setObjects(prev => [...prev, clone])
        applySelection([clone.id])
    }, [applySelection, objects, selectedObjectId, setObjects])

    const handleUndo = useCallback(() => {
        setHistoryIndex(prev => {
            if (prev <= 0) return prev
            const newIndex = prev - 1
            const snapshot = history[newIndex]
            if (snapshot) {
                isHistoryRestoring.current = true
                setObjects(cloneObjects(snapshot))
            }
            return newIndex
        })
    }, [history, setObjects, setHistoryIndex])

    const handleRedo = useCallback(() => {
        setHistoryIndex(prev => {
            if (prev >= history.length - 1) return prev
            const newIndex = prev + 1
            const snapshot = history[newIndex]
            if (snapshot) {
                isHistoryRestoring.current = true
                setObjects(cloneObjects(snapshot))
            }
            return newIndex
        })
    }, [history, setObjects, setHistoryIndex])

    const computeGroundPosition = useCallback((clientX, clientY) => {
        const canvas = document.querySelector('canvas')
        if (!canvas || !controlsRef.current) return null
        const rect = canvas.getBoundingClientRect()
        if (clientX < rect.left || clientX > rect.right || clientY < rect.top || clientY > rect.bottom) {
            return null
        }
        const ndc = {
            x: ((clientX - rect.left) / rect.width) * 2 - 1,
            y: -((clientY - rect.top) / rect.height) * 2 + 1
        }
        const camera = controlsRef.current.object
        const raycaster = new THREE.Raycaster()
        raycaster.setFromCamera(ndc, camera)
        const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)
        const point = new THREE.Vector3()
        if (raycaster.ray.intersectPlane(plane, point)) {
            return [Math.round(point.x), Math.round(point.y), Math.round(point.z)]
        }
        return null
    }, [])

    useEffect(() => {
        const hasFiles = (event) => {
            const types = event.dataTransfer?.types
            return types && Array.from(types).includes('Files')
        }

        let dragCounter = 0

        const onDragEnter = (event) => {
            if (!hasFiles(event)) return
            event.preventDefault()
            dragCounter++
            setIsFileDragActive(true)
        }

        const onDragOver = (event) => {
            if (!hasFiles(event)) return
            event.preventDefault()
        }

        const onDragLeave = (event) => {
            if (!hasFiles(event)) return
            dragCounter = Math.max(0, dragCounter - 1)
            if (dragCounter === 0) {
                setIsFileDragActive(false)
            }
        }

        const onDrop = (event) => {
            if (!hasFiles(event)) return
            event.preventDefault()
            dragCounter = 0
            setIsFileDragActive(false)
            const files = Array.from(event.dataTransfer?.files || [])
            if (files.length === 0) return
            const position = computeGroundPosition(event.clientX, event.clientY)
            handleAssetFilesUpload(files, { position })
        }

        window.addEventListener('dragenter', onDragEnter)
        window.addEventListener('dragover', onDragOver)
        window.addEventListener('dragleave', onDragLeave)
        window.addEventListener('drop', onDrop)

        return () => {
            window.removeEventListener('dragenter', onDragEnter)
            window.removeEventListener('dragover', onDragOver)
            window.removeEventListener('dragleave', onDragLeave)
            window.removeEventListener('drop', onDrop)
        }
    }, [handleAssetFilesUpload, computeGroundPosition])

    const toggleAdminMode = useCallback(() => {
        setIsAdminMode(prev => {
            const next = !prev
            if (!next) {
                setIsGizmoVisible(false)
            }
            return next
        })
    }, [setIsAdminMode, setIsGizmoVisible])

    useEffect(() => {
        const handleKeyDown = (event) => {
            const targetTag = event.target.tagName
            const isTyping = targetTag === 'INPUT' || targetTag === 'TEXTAREA' || event.target.isContentEditable
            const metaKey = event.metaKey || event.ctrlKey
            const key = event.key?.toLowerCase?.()

            if (metaKey && key === 'z') {
                event.preventDefault()
                if (event.shiftKey) {
                    handleRedo()
                } else {
                    handleUndo()
                }
                return
            }

            if (metaKey && key === 'y') {
                event.preventDefault()
                handleRedo()
                return
            }

            if (!isTyping && (event.key === 'Delete' || event.key === 'Backspace')) {
                event.preventDefault()
                deleteSelectedObject()
                return
            }

            if (metaKey && key === 'c') {
                event.preventDefault()
                copySelectedObject()
                return
            }

            if (metaKey && key === 'v') {
                event.preventDefault()
                pasteClipboardObject()
                return
            }

            if (metaKey && key === 'x') {
                event.preventDefault()
                cutSelectedObject()
                return
            }

            if (metaKey && key === 'd') {
                event.preventDefault()
                duplicateSelectedObject()
                return
            }

            if (metaKey && key === 'g') {
                event.preventDefault()
                handleCreateSelectionGroup()
                return
            }

            if (event.altKey && key === 'g') {
                event.preventDefault()
                handleUngroupSelection()
                return
            }

            if (isTyping) {
                return
            }

            const ensureGizmoVisible = () => {
                setIsGizmoVisible(true)
            }

            const handleAxisSnap = (axisKey) => {
                const axis = axisKey.toUpperCase()
                if (axisConstraint === axis) {
                    resetAxisLock()
                    return
                }
                setAxisConstraint(axis)
                freeTransformRef.current.axis = axis
            }

            if (key === 'escape' || key === 'enter') {
                adminChordRef.current = false
                resetAxisLock()
                return
            }

            if (event.shiftKey && key === 'd') {
                adminChordRef.current = true
                return
            }

            if (event.shiftKey && key === 'i' && adminChordRef.current) {
                event.preventDefault()
                adminChordRef.current = false
                toggleAdminMode()
                return
            }

            if (key === 'g') {
                event.preventDefault()
                ensureGizmoVisible()
                setGizmoMode('translate')
                freeTransformRef.current.mode = 'translate'
                freeTransformRef.current.axis = null
                setAxisConstraint(null)
                return
            }

            if (key === 'r') {
                event.preventDefault()
                ensureGizmoVisible()
                setGizmoMode('rotate')
                freeTransformRef.current.mode = 'rotate'
                freeTransformRef.current.axis = null
                setAxisConstraint(null)
                return
            }

            if (key === 's') {
                event.preventDefault()
                ensureGizmoVisible()
                setGizmoMode('scale')
                freeTransformRef.current.mode = 'scale'
                freeTransformRef.current.axis = null
                setAxisConstraint(null)
                return
            }

            if (['x', 'y', 'z'].includes(key)) {
                event.preventDefault()
                handleAxisSnap(key)
                return
            }

            if (key === 'p') {
                setIsPerfVisible(prev => !prev)
            }
            if (key === 'h') {
                setIsUiVisible(prev => !prev)
            }
            if (key === 'a') {
                if (event.altKey) {
                    return
                }
                event.preventDefault()
                selectAllObjects()
                return
            }
        }
        window.addEventListener('keydown', handleKeyDown)
        const handleKeyUp = (event) => {
            const key = event.key?.toLowerCase?.()
            if (key === 'd' || key === 'i' || !event.shiftKey) {
                adminChordRef.current = false
            }
        }
        window.addEventListener('keyup', handleKeyUp)
        return () => {
            window.removeEventListener('keydown', handleKeyDown)
            window.removeEventListener('keyup', handleKeyUp)
        }
    }, [axisConstraint, applyFreeTransformDelta, copySelectedObject, cutSelectedObject, deleteSelectedObject, duplicateSelectedObject, handleCreateSelectionGroup, handleRedo, handleUndo, handleUngroupSelection, pasteClipboardObject, resetAxisLock, selectAllObjects, setGizmoMode, setIsGizmoVisible, toggleAdminMode])

    useEffect(() => {
        const handlePointerMove = (event) => {
            const { mode, axis } = freeTransformRef.current
            if (!mode || !axis || axisConstraint !== axis) return
            const sensitivity = event.shiftKey ? 0.002 : 0.02
            const delta = ((event.movementX || 0) + (event.movementY || 0)) * sensitivity
            if (delta === 0) return
            applyFreeTransformDelta(mode, axis, delta)
        }
        window.addEventListener('pointermove', handlePointerMove)
        return () => window.removeEventListener('pointermove', handlePointerMove)
    }, [applyFreeTransformDelta, axisConstraint])

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
                        toggleAdminMode()
                    } else if (gestureType === 'ui') {
                        setIsUiVisible(prev => !prev)
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

    const handleClear = async ({ skipConfirm = false, silent = false } = {}) => {
        if (!skipConfirm) {
            const confirmed = window.confirm('Clear the local scene? This removes unsaved changes on this device only.')
            if (!confirmed) return
        }
        setObjects(defaultScene.objects);
        setBackgroundColor(defaultScene.backgroundColor);
        setGridSize(defaultScene.gridSize);
        setAmbientLight(defaultScene.ambientLight);
        setDirectionalLight(defaultScene.directionalLight);
        setDefault3DView(defaultScene.default3DView);
        setGridAppearance(DEFAULT_GRID_APPEARANCE)
        setTransformSnaps(defaultScene.transformSnaps);
        setRemoteSceneVersion(null)
        resetRemoteAssets()
        // restore UI visibility flags to defaults so a cleared scene is visible
        setIsGridVisible(defaultScene.isGridVisible)
        setIsGizmoVisible(defaultScene.isGizmoVisible)
        setIsPerfVisible(defaultScene.isPerfVisible)
        setIsUiVisible(true)
        setCameraPosition(defaultScene.savedView.position);
        setCameraTarget(defaultScene.savedView.target);
        setSceneVersion(0)

        // force controls to update immediately so camera position takes effect
        if (controlsRef.current) {
            controlsRef.current.target.set(...defaultScene.savedView.target)
            controlsRef.current.object.position.set(...defaultScene.savedView.position)
            controlsRef.current.update()
        }

        clearSelection();
        // IMPORTANT: persist the cleared scene to local storage so server doesn't reload it
        const clearedSceneData = getBaseSceneData()
        persistSceneDataWithStatus(clearedSceneData, 'Scene cleared')
        updateSceneSignature(clearedSceneData)
        // Block server sync from reloading after clear
        skipServerLoadRef.current = true
        setTimeout(() => { skipServerLoadRef.current = false }, 500)
        await clearAllAssets()
        resetAssetStoreQuotaState()
        if (!silent) {
            alert('Scene cleared.');
        }
    }

    const handleSaveView = () => {
        const savedView = getSavedViewData()
        const nextDefaultView = {
            position: savedView.position,
            target: savedView.target
        }
        setDefault3DView(nextDefaultView)
        const sceneData = {
            ...getBaseSceneData(),
            default3DView: nextDefaultView,
            savedView
        }
        if (persistSceneDataWithStatus(sceneData, 'Saved view locally')) {
            updateSceneSignature(sceneData)
            alert('View saved! It will now load on refresh.');
        }
    }

    const handleUpdateTransformSnaps = (partial = {}) => {
        setTransformSnaps(prev => {
            const next = {
                translation: partial.translation ?? prev.translation,
                rotation: partial.rotation ?? prev.rotation,
                scale: partial.scale ?? prev.scale
            }
            scheduleLocalSceneSave(() => ({
                ...getBaseSceneData(),
                transformSnaps: next,
                savedView: getSavedViewData()
            }))
            return next
        })
    }

    // This is the "Frame All" button logic, unchanged
    const handleFrameAll = useCallback(() => {
        if (!controlsRef.current) return;
        
        if (objects.length === 0) {
            controlsRef.current.update();
            return;
        }

        const controls = controlsRef.current;
        const box = new THREE.Box3();

        objects.forEach(obj => {
            box.expandByPoint(new THREE.Vector3(...obj.position));
        });

        const center = new THREE.Vector3();
        const size = new THREE.Vector3();
        box.getCenter(center);
        box.getSize(size);

        if (size.length() < 0.1) {
            box.expandByPoint(new THREE.Vector3(center.x + 1, center.y + 1, center.z + 1));
            box.expandByPoint(new THREE.Vector3(center.x - 1, center.y - 1, center.z - 1));
            box.getSize(size);
        }

        controls.target.set(center.x, center.y, center.z);
        controls.update();
    }, [objects]);


    // --- DELETED ---
    // The useEffect that called handleFrameAll on load is gone.
    // This is what you wanted.

    const spaceLabelButton = useSpaceLabel({
        spaceId,
        onCopyLink: handleCopySpaceLink
    })

    const canCreateGroupSelection = selectedObjectIds.length > 1

    const statusItems = useStatusItems({
        uploadProgress,
        assetRestoreProgress,
        serverAssetSyncProgress,
        serverAssetSyncPending,
        localSaveStatus,
        mediaOptimizationStatus,
        supportsServerSpaces,
        isOfflineMode,
        sceneVersion,
        spaceId,
        canPublishToServer,
        serverSyncInfo
    })

    const {
        shouldShowStatusPanel,
        statusPanelClassName,
        statusSummary,
        statusDotClass
    } = useStatusPanel({
        statusItems,
        isStatusPanelVisible,
        isUiVisible
    })

    const {
        sceneButtons,
        panelButtons,
        adminButtons,
        displayButtons,
        xrButtons
    } = useControlButtons({
        spaceLabelButton,
        isCreatingSpace,
        handleQuickSpaceCreate,
        canCreateGroupSelection,
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
        isSelectionLocked,
        setIsSelectionLocked,
        uiDefaultVisible,
        toggleUiDefaultVisible,
        layoutMode,
        toggleLayoutMode,
        isArModeActive,
        arAnchorTransform,
        resetArAnchor,
        isXrPresenting,
        handleEnterXrSession,
        supportedXrModes,
        activeXrMode,
        handleExitXrSession
    })

    const controlSections = useControlSections({
        isUiVisible,
        sceneButtons,
        panelButtons,
        adminButtons,
        displayButtons,
        xrButtons
    })

    return (
        <AppContext.Provider value={{
            // State
            objects,
            backgroundColor,
            gridSize,
            sceneVersion,
            selectedObjectId,
            selectedObjectIds,
            menu,
            gizmoMode,
            axisConstraint,
            isSelectionLocked,
            isPerfVisible,
            isGizmoVisible,
            isGridVisible,
            isXrPresenting,
            activeXrMode,
            supportedXrModes,
            xrOriginPosition,
            cameraSettings,
            default3DView, // This is for the "3D" preset button
            isAdminMode,
            arAnchorTransform,
            arPreviewScale,
            arPreviewOffset,
            canUndo,
            canRedo,
            ambientLight,
            directionalLight,
            transformSnaps,
            gridAppearance,
            isAssetPanelVisible,
            isLiveSyncEnabled,
            selectionGroups,
            isArModeActive,
            isPointerDragging,
            renderSettings,
            
            // Setters
            setObjects,
            setBackgroundColor,
            setGridSize,
            setSelectedObjectId,
            setSelectedObjectIds,
            setMenu,
            setGizmoMode,
            setAxisConstraint,
            setIsSelectionLocked,
            setIsPerfVisible,
            setIsGizmoVisible,
            setIsGridVisible,
            setIsWorldPanelVisible,
            setIsViewPanelVisible,
            setIsAssetPanelVisible,
            setXrOriginPosition,
            setCameraSettings,
            setAmbientLight,
            setDirectionalLight,
            setGridAppearance,
            setArAnchorTransform,
            setIsLiveSyncEnabled,
            setIsPointerDragging,
            setRenderSettings,

            // Handlers
            handleAddObject,
            handleAddAssetObject,
            handleSaveView, // This is the "Save View" button
            handleFrameAll,
            handleUpdateTransformSnaps,
            handleEnterXrSession,
            handleExitXrSession,
            handleSave,
            handleLoadClick,
            handleKeepCurrentWorld,
            handleClear,
            handleAssetFilesUpload,
            handleUndo,
            handleRedo,
            resetArAnchor,
            setArPreviewScale,
            setArPreviewOffset,
            selectObject,
            clearSelection,
            selectAllObjects,
            resetAxisLock,
            toggleAdminMode,
            requestManualMediaOptimization: handleManualMediaOptimization,
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
            // Refs
            controlsRef,
            fileInputRef
        }}>
            <EditorLayout
                menu={menu}
                setMenu={setMenu}
                fileInputRef={fileInputRef}
                handleFileLoad={handleFileLoad}
                controlSections={controlSections}
                isUiVisible={isUiVisible}
                layoutMode={layoutMode}
                toggleLayoutMode={toggleLayoutMode}
                isWorldPanelVisible={isWorldPanelVisible}
                isViewPanelVisible={isViewPanelVisible}
                isMediaPanelVisible={isMediaPanelVisible}
                isAssetPanelVisible={isAssetPanelVisible}
                isOutlinerPanelVisible={isOutlinerPanelVisible}
                isAdminMode={isAdminMode}
                isSpacesPanelVisible={isSpacesPanelVisible}
                objects={objects}
                selectionGroups={selectionGroups}
                selectedObjectIds={selectedObjectIds}
                handleSelectObjectFromOutliner={handleSelectObjectFromOutliner}
                handleToggleObjectVisibility={handleToggleObjectVisibility}
                handleSelectSelectionGroup={handleSelectSelectionGroup}
                handleCreateSelectionGroup={handleCreateSelectionGroup}
                handleDeleteSelectionGroup={handleDeleteSelectionGroup}
                canCreateGroupSelection={canCreateGroupSelection}
                spaces={spaces}
                spaceId={spaceId}
                handleCreateNamedSpace={handleCreateNamedSpace}
                handleOpenSpace={handleOpenSpace}
                handleCopySpaceLink={handleCopySpaceLink}
                handleDeleteSpace={handleDeleteSpace}
                handleToggleSpacePermanent={handleToggleSpacePermanent}
                newSpaceName={newSpaceName}
                setNewSpaceName={setNewSpaceName}
                spaceNameFeedback={spaceNameFeedback}
                canCreateSpace={canCreateSpace}
                tempSpaceTtlHours={tempSpaceTtlHours}
                isCreatingSpace={isCreatingSpace}
                isLoading={isLoading}
                isFileDragActive={isFileDragActive}
                mediaOptimizationPreference={mediaOptimizationPreference}
                setMediaOptimizationPreference={setMediaOptimizationPreference}
                setIsWorldPanelVisible={setIsWorldPanelVisible}
                setIsViewPanelVisible={setIsViewPanelVisible}
                setIsMediaPanelVisible={setIsMediaPanelVisible}
                setIsAssetPanelVisible={setIsAssetPanelVisible}
                setIsOutlinerPanelVisible={setIsOutlinerPanelVisible}
                setIsSpacesPanelVisible={setIsSpacesPanelVisible}
                isGizmoVisible={isGizmoVisible}
                isPointerDragging={isPointerDragging}
                clearSelection={clearSelection}
                xrStore={xrStore}
                currentCameraSettings={currentCameraSettings}
                cameraPosition={cameraPosition}
                renderSettings={renderSettings}
                rendererRef={rendererRef}
                shouldShowStatusPanel={shouldShowStatusPanel}
                statusPanelClassName={statusPanelClassName}
                statusDotClass={statusDotClass}
                statusSummary={statusSummary}
                statusItems={statusItems}
            />
        </AppContext.Provider>
    )
}
