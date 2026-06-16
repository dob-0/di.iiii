import { useCallback, useMemo, useRef, useState } from 'react'
import { defaultScene, normalizeObjects } from '../state/sceneStore.js'
import { DEFAULT_RENDER_SETTINGS } from './useRenderSettings.js'
import { buildCollaborativeSceneSnapshot } from '../services/collaborativeSceneOps.js'
import { useRealtimeCollaboration } from './useRealtimeCollaboration.js'
import { useLiveSync } from './useLiveSync.js'

const generateLiveClientId = () => {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
        return crypto.randomUUID()
    }
    return `live-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
}

export function useCollaborativeSession({
    enabled = false,
    isLoading = false,
    canAccessServerSpaces = false,
    isOfflineMode = false,
    isLiveSyncEnabled = false,
    isPointerDragging = false,
    spaceId,
    supportsServerSpaces,
    buildSpaceApiUrl,
    serverAssetBaseUrl,
    getServerSceneOps,
    getServerScene,
    submitSceneOps,
    objects,
    backgroundColor,
    gridSize,
    gridAppearance,
    renderSettings,
    ambientLight,
    directionalLight,
    transformSnaps,
    presentation,
    default3DView,
    applyRemoteScene,
    applyScenePatch,
    setSceneVersion,
    sceneVersionRef,
    setObjects,
    setBackgroundColor,
    setGridSize,
    setGridAppearance,
    setRenderSettings,
    setTransformSnaps,
    setPresentation,
    setAmbientLight,
    setDirectionalLight,
    setDefault3DView,
    defaultGridAppearance
} = {}) {
    const [liveClientId] = useState(() => generateLiveClientId())
    const liveClientIdRef = useRef(liveClientId)

    const sceneSnapshot = useMemo(() => buildCollaborativeSceneSnapshot({
        objects,
        backgroundColor,
        gridSize,
        gridAppearance,
        renderSettings,
        ambientLight,
        directionalLight,
        transformSnaps,
        presentation,
        default3DView
    }), [
        objects,
        backgroundColor,
        gridSize,
        gridAppearance,
        renderSettings,
        ambientLight,
        directionalLight,
        transformSnaps,
        presentation,
        default3DView
    ])

    const applyCollaborativeSceneState = useCallback((sceneData, options = {}) => {
        if (!sceneData || typeof sceneData !== 'object') return
        const { serverVersion = null } = options
        setObjects(normalizeObjects(sceneData.objects || defaultScene.objects))
        setBackgroundColor(sceneData.backgroundColor || defaultScene.backgroundColor)
        setGridSize(sceneData.gridSize || defaultScene.gridSize)
        setGridAppearance(sceneData.gridAppearance || defaultGridAppearance)
        setRenderSettings(sceneData.renderSettings || DEFAULT_RENDER_SETTINGS)
        setTransformSnaps(sceneData.transformSnaps || defaultScene.transformSnaps)
        setPresentation?.(sceneData.presentation || defaultScene.presentation)
        setAmbientLight(sceneData.ambientLight || defaultScene.ambientLight)
        setDirectionalLight(sceneData.directionalLight || defaultScene.directionalLight)
        setDefault3DView(sceneData.default3DView || defaultScene.default3DView)
        if (typeof serverVersion === 'number') {
            setSceneVersion(serverVersion)
        }
    }, [
        defaultGridAppearance,
        setAmbientLight,
        setBackgroundColor,
        setDefault3DView,
        setDirectionalLight,
        setGridAppearance,
        setGridSize,
        setObjects,
        setRenderSettings,
        setSceneVersion,
        setTransformSnaps,
        setPresentation
    ])

    const realtimeCollaboration = useRealtimeCollaboration({
        canAccessServerSpaces,
        spaceId,
        liveClientId,
        enableSceneEditEvents: false
    })

    const liveSyncState = useLiveSync({
        enabled,
        isLoading,
        isOfflineMode,
        isLiveSyncEnabled,
        spaceId,
        supportsServerSpaces,
        buildSpaceApiUrl,
        serverAssetBaseUrl,
        getServerSceneOps,
        getServerScene,
        submitSceneOps,
        sceneSnapshot,
        applyRemoteScene,
        applySceneState: applyCollaborativeSceneState,
        applyScenePatch,
        setSceneVersion,
        liveClientIdRef,
        sceneVersionRef
    })

    const handleCanvasPointerMove = useCallback((event) => {
        const sourceEvent = event?.nativeEvent || event
        const buttons = Number(event?.buttons ?? sourceEvent?.buttons ?? 0)
        if (isPointerDragging || buttons !== 0) return
        const target = event?.currentTarget || sourceEvent?.currentTarget || sourceEvent?.target
        const rect = target?.getBoundingClientRect?.()
        if (!rect || rect.width <= 0 || rect.height <= 0) return
        const clientX = Number(sourceEvent?.clientX)
        const clientY = Number(sourceEvent?.clientY)
        if (!Number.isFinite(clientX) || !Number.isFinite(clientY)) return
        realtimeCollaboration.broadcastCursor?.({
            x: (clientX - rect.left) / rect.width,
            y: (clientY - rect.top) / rect.height
        })
    }, [isPointerDragging, realtimeCollaboration])

    const handleCanvasPointerLeave = useCallback(() => {
        // Remote cursors fade out automatically if we stop sending updates.
    }, [])

    return {
        liveClientId,
        liveClientIdRef,
        handleCanvasPointerMove,
        handleCanvasPointerLeave,
        ...realtimeCollaboration,
        ...liveSyncState
    }
}

export default useCollaborativeSession
