import { useCallback, useEffect, useRef } from 'react'
import { SCENE_DATA_VERSION, generateObjectId } from '../state/sceneStore.js'

export function useScenePersistenceCoordinator({
    controlsRef,
    cameraPosition,
    cameraTarget,
    setCameraPosition,
    setCameraTarget,
    captureSavedViewFromControls = true,
    objects,
    backgroundColor,
    gridSize,
    gridAppearance,
    renderSettings,
    transformSnaps,
    presentation,
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
} = {}) {
    const pendingServerSaveRef = useRef(null)
    const latestServerPayloadRef = useRef(null)

    const captureCurrentCameraView = useCallback(() => {
        if (controlsRef?.current && captureSavedViewFromControls) {
            const position = controlsRef.current.object.position.toArray()
            const target = controlsRef.current.target.toArray()
            setCameraPosition?.(position)
            setCameraTarget?.(target)
            return { position, target }
        }
        return { position: cameraPosition, target: cameraTarget }
    }, [cameraPosition, cameraTarget, captureSavedViewFromControls, controlsRef, setCameraPosition, setCameraTarget])

    const getBaseSceneData = useCallback(() => {
        const base = {
            version: SCENE_DATA_VERSION,
            objects,
            backgroundColor,
            gridSize,
            gridAppearance,
            renderSettings,
            transformSnaps,
            presentation,
            isGridVisible,
            isGizmoVisible,
            isPerfVisible,
            directionalLight,
            ambientLight,
            default3DView,
            defaultSceneVersion: remoteSceneVersion,
            sceneVersion
        }
        if (Array.isArray(remoteAssetsRef?.current) && remoteAssetsRef.current.length) {
            base.assets = remoteAssetsRef.current
            if (remoteAssetsBaseRef?.current) {
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
        objects,
        presentation,
        remoteAssetsBaseRef,
        remoteAssetsRef,
        remoteSceneVersion,
        renderSettings,
        sceneVersion,
        transformSnaps
    ])

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

    const scheduleServerSceneSave = useCallback((factory) => {
        if (!shouldSyncServerScene) return
        try {
            latestServerPayloadRef.current = factory()
        } catch (error) {
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
                    clientId: liveClientIdRef?.current,
                    type: 'replaceScene',
                    payload: { scene: payload }
                }
            ]
            try {
                const response = await submitSceneOps?.(spaceId, sceneVersionRef?.current || 0, ops)
                if (typeof response?.newVersion === 'number') {
                    setSceneVersion?.(response.newVersion)
                }
            } catch (error) {
            }
        }, 1200)
    }, [liveClientIdRef, sceneVersionRef, setSceneVersion, shouldSyncServerScene, spaceId, submitSceneOps])

    useEffect(() => {
        const handleBeforeUnload = () => {
            const sceneData = {
                ...getBaseSceneData(),
                savedView: getSavedViewData({ capture: false })
            }
            persistSceneDataWithStatus?.(sceneData, 'Saved locally (exit)')
            updateSceneSignature?.(sceneData)
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

    return {
        getBaseSceneData,
        getSavedViewData,
        scheduleServerSceneSave
    }
}

export default useScenePersistenceCoordinator
