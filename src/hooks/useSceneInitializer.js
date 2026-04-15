import { useCallback, useEffect, useState } from 'react'
import { defaultScene, SCENE_DATA_VERSION, normalizeObjects } from '../state/sceneStore.js'
import { preferLocalAssetsBaseUrl } from '../utils/assetsBaseUrl.js'

export function useSceneInitializer({
    sceneStorageKey,
    spaceId,
    canPublishToServer,
    isOfflineMode,
    preferServerScene = false,
    forceServerAssetsBase = false,
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
    setBackgroundColor,
    setGridSize,
    setGridAppearance,
    setRenderSettings,
    setTransformSnaps,
    setIsGridVisible,
    setIsGizmoVisible,
    setIsPerfVisible,
    setPresentation,
    setAmbientLight,
    setDirectionalLight,
    setDefault3DView,
    setCameraPosition,
    setCameraTarget,
    setSceneVersion,
    getServerScene,
    defaultGridAppearance,
    defaultRenderSettings,
    defaultSceneRemoteBase
} = {}) {
    const [isLoading, setIsLoading] = useState(true)

    const getPreferredAssetsBase = useCallback((sceneBaseUrl) => {
        return preferLocalAssetsBaseUrl({
            sceneBaseUrl,
            serverAssetBaseUrl,
            forceServerAssetsBase
        })
    }, [forceServerAssetsBase, serverAssetBaseUrl])

    const initializeBlankScene = useCallback(() => {
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
            gridAppearance: defaultGridAppearance,
            renderSettings: defaultRenderSettings,
            sceneVersion: 0
        }
        setObjects(blankSceneData.objects)
        setBackgroundColor(blankScene.backgroundColor)
        setGridSize(blankScene.gridSize)
        setGridAppearance(defaultGridAppearance)
        setRenderSettings(defaultRenderSettings)
        setTransformSnaps(blankScene.transformSnaps)
        setIsGridVisible(blankScene.isGridVisible)
        setIsGizmoVisible(blankScene.isGizmoVisible)
        setIsPerfVisible(blankScene.isPerfVisible)
        setPresentation?.(blankScene.presentation)
        setAmbientLight(blankScene.ambientLight)
        setDirectionalLight(blankScene.directionalLight)
        setDefault3DView(blankScene.default3DView)
        setCameraPosition(blankScene.savedView.position)
        setCameraTarget(blankScene.savedView.target)
        setSceneVersion(0)
        persistSceneDataWithStatus(blankSceneData, 'Initialized blank scene')
        updateSceneSignature(blankSceneData)
    }, [
        defaultGridAppearance,
        defaultRenderSettings,
        persistSceneDataWithStatus,
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
        setPresentation,
        setObjects,
        setRenderSettings,
        setRemoteSceneVersion,
        setSceneVersion,
        setTransformSnaps,
        updateSceneSignature
    ])

    useEffect(() => {
        let isCancelled = false

        const initializeScene = async () => {
            try {
                const savedData = localStorage.getItem(sceneStorageKey)

                if (preferServerScene && canPublishToServer && !isOfflineMode && spaceId) {
                    try {
                        const response = await getServerScene(spaceId)
                        if (response?.scene) {
                            const baseUrl = getPreferredAssetsBase(response.scene.assetsBaseUrl)
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
                        console.warn('Failed to load server scene (admin prefer)', error)
                    }
                }
                if (!savedData) {
                    // Try loading server scene first when nothing is stored locally
                    // Skip if a clear just happened and saved empty scene
                    if (canPublishToServer && !isOfflineMode && spaceId && !skipServerLoadRef.current) {
                        try {
                            const response = await getServerScene(spaceId)
                            if (response?.scene) {
                                const baseUrl = getPreferredAssetsBase(response.scene.assetsBaseUrl)
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

                    initializeBlankScene()
                    return
                }

                const sceneData = JSON.parse(savedData)
                setSceneVersion(Number(sceneData.sceneVersion) || 0)
                const assetsManifest = Array.isArray(sceneData.assets) ? sceneData.assets : []
                if (assetsManifest.length) {
                    setRemoteAssetsManifest(assetsManifest, getPreferredAssetsBase(sceneData.assetsBaseUrl || defaultSceneRemoteBase))
                } else {
                    resetRemoteAssets()
                }

                if (!sceneData.version || sceneData.version < SCENE_DATA_VERSION) {
                    console.warn('Old or invalid scene data version. Clearing localStorage.')
                    localStorage.removeItem(sceneStorageKey)
                    initializeBlankScene()
                    return
                }

                const normalizedObjects = normalizeObjects(sceneData.objects || defaultScene.objects)
                const normalizedSceneData = {
                    ...sceneData,
                    objects: normalizedObjects
                }
                setObjects(normalizedObjects)
                setBackgroundColor(sceneData.backgroundColor || defaultScene.backgroundColor)
                setGridSize(sceneData.gridSize || defaultScene.gridSize)
                setRenderSettings(sceneData.renderSettings || defaultRenderSettings)
                setAmbientLight(sceneData.ambientLight || defaultScene.ambientLight)
                setDirectionalLight(sceneData.directionalLight || defaultScene.directionalLight)
                setDefault3DView(sceneData.default3DView || defaultScene.default3DView)
                setGridAppearance(sceneData.gridAppearance || defaultGridAppearance)
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
                setPresentation?.(sceneData.presentation || defaultScene.presentation)
                setRemoteSceneVersion(null)

                const savedView = sceneData.savedView || defaultScene.savedView
                setCameraPosition(savedView.position)
                setCameraTarget(savedView.target)

                updateSceneSignature(normalizedSceneData)
                persistSceneDataWithStatus(normalizedSceneData, 'Loaded scene locally')
            } catch (error) {
                console.error('Failed to load scene from localStorage. Clearing.', error)
                localStorage.removeItem(sceneStorageKey)
                if (!isCancelled) {
                    initializeBlankScene()
                }
            } finally {
                if (!isCancelled) {
                    setIsLoading(false)
                }
            }
        }

        initializeScene()

        return () => { isCancelled = true }
    }, [
        applyRemoteScene,
        canPublishToServer,
        defaultGridAppearance,
        defaultRenderSettings,
        defaultSceneRemoteBase,
        getServerScene,
        getPreferredAssetsBase,
        initializeBlankScene,
        isOfflineMode,
        markServerSync,
        preferServerScene,
        persistSceneDataWithStatus,
        resetRemoteAssets,
        sceneStorageKey,
        serverAssetBaseUrl,
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
        setPresentation,
        setObjects,
        setRenderSettings,
        setRemoteAssetsManifest,
        setRemoteSceneVersion,
        setSceneVersion,
        setTransformSnaps,
        skipServerLoadRef,
        spaceId,
        updateSceneSignature
    ])

    return { isLoading }
}

export default useSceneInitializer
