import { useCallback, useRef } from 'react'
import { buildSceneSignature } from '../storage/scenePersistence.js'
import { defaultScene, SCENE_DATA_VERSION, normalizeObjects } from '../state/sceneStore.js'
import { mergeAssetsManifest } from '../utils/assetManifest.js'

export function useSceneApply({
    persistSceneDataWithStatus,
    resetAssetStoreQuotaState,
    restoreAssetsFromPayload,
    setAssetRestoreProgress,
    setRemoteAssetsManifest,
    setSceneVersion,
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
    setCameraPosition,
    setCameraTarget,
    clearSelection,
    setRemoteSceneVersion,
    defaultGridAppearance,
    defaultRenderSettings,
    defaultSceneRemoteBase = '',
    legacySceneRemoteBase = '',
    getAssetUrlCandidates,
    getAssetSourceUrl
} = {}) {
    const sceneSignatureRef = useRef(null)

    const updateSceneSignature = useCallback((data) => {
        if (!data) return
        sceneSignatureRef.current = buildSceneSignature(data)
    }, [])

    const applyRemoteScene = useCallback(async (sceneData, options = {}) => {
        const { remoteVersion = null, assetsBaseUrl = defaultSceneRemoteBase, serverVersion = null } = options
        if (!sceneData?.version || sceneData.version < SCENE_DATA_VERSION) {
            alert('Error: The remote start scene is incompatible.')
            return
        }
        // Keep locally cached blobs available across refreshes so a server scene can
        // still render media even if a remote asset URL is temporarily unavailable.
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
            if (defaultSceneRemoteBase) {
                pushBase(defaultSceneRemoteBase)
            }
            if (legacySceneRemoteBase && legacySceneRemoteBase !== defaultSceneRemoteBase) {
                pushBase(legacySceneRemoteBase)
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
                        const contentType = response.headers.get('content-type') || ''
                        if (contentType.includes('text/html')) {
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
        setGridAppearance(sceneData.gridAppearance || defaultGridAppearance)
        setRenderSettings(sceneData.renderSettings || defaultRenderSettings)
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
        setRemoteSceneVersion?.(remoteVersion)
        if (typeof serverVersion === 'number') {
            setSceneVersion(serverVersion)
        }

        const nextSceneData = {
            ...sceneData,
            assets: mergedManifest,
            assetsBaseUrl,
            defaultSceneVersion: remoteVersion,
            sceneVersion: typeof serverVersion === 'number' ? serverVersion : sceneData.sceneVersion,
            renderSettings: sceneData.renderSettings || defaultRenderSettings
        }
        persistSceneDataWithStatus(nextSceneData, 'Loaded scene locally')
        updateSceneSignature(nextSceneData)
    }, [
        clearSelection,
        defaultGridAppearance,
        defaultRenderSettings,
        defaultSceneRemoteBase,
        getAssetSourceUrl,
        getAssetUrlCandidates,
        legacySceneRemoteBase,
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
        setIsPerfVisible,
        setPresentation,
        setAmbientLight,
        setDirectionalLight,
        setCameraPosition,
        setCameraTarget,
        setRemoteSceneVersion
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
        if ('presentation' in patch) {
            setPresentation?.(patch.presentation || defaultScene.presentation)
        }
        if (patch.savedView?.position && patch.savedView?.target) {
            // Do not override local camera position for live patches
            setCameraTarget(patch.savedView.target)
        }
    }, [
        setObjects,
        setBackgroundColor,
        setGridSize,
        setAmbientLight,
        setDirectionalLight,
        setTransformSnaps,
        setIsGridVisible,
        setIsGizmoVisible,
        setIsPerfVisible,
        setPresentation,
        setCameraTarget
    ])

    return {
        updateSceneSignature,
        applyRemoteScene,
        applyScenePatch
    }
}

export default useSceneApply
