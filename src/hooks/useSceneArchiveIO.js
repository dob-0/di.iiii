import { useCallback } from 'react'
import { createSceneArchive, loadSceneArchive } from '../services/sceneArchive.js'
import { clearAllAssets } from '../storage/assetStore.js'
import { defaultScene, SCENE_DATA_VERSION, normalizeObjects } from '../state/sceneStore.js'
import { mergeAssetsManifest } from '../utils/assetManifest.js'

export function useSceneArchiveIO({
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
} = {}) {
    const downloadBlob = useCallback((blob, fileName) => {
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = fileName
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        URL.revokeObjectURL(url)
    }, [])

    const handleSave = useCallback(async () => {
        setRemoteSceneVersion?.(null)
        resetRemoteAssets?.()
        const sceneData = {
            ...getBaseSceneData(),
            savedView: getSavedViewData() // Save the current view
        }
        sceneData.defaultSceneVersion = null
        if (!persistSceneDataWithStatus(sceneData, 'Saved locally (export)')) return
        updateSceneSignature(sceneData)
        const exportSceneData = {
            ...sceneData
        }
        delete exportSceneData.assets
        delete exportSceneData.assetsBaseUrl

        try {
            const archiveBlob = await createSceneArchive(exportSceneData, {
                getAssetBlob,
                getAssetSourceUrl
            })
            downloadBlob(archiveBlob, 'my-scene.zip')
        } catch (error) {
            console.error('Failed to create download file:', error)
            alert('Error: Could not create download file.')
        }
    }, [
        downloadBlob,
        getAssetBlob,
        getAssetSourceUrl,
        getBaseSceneData,
        getSavedViewData,
        persistSceneDataWithStatus,
        resetRemoteAssets,
        setRemoteSceneVersion,
        updateSceneSignature
    ])

    const handleLoadClick = useCallback(() => {
        fileInputRef?.current?.click()
    }, [fileInputRef])

    const applyLoadedScene = useCallback(async (sceneData, assetBlobLoader, options = {}) => {
        const { silent = false } = options
        if (!sceneData.version || sceneData.version < SCENE_DATA_VERSION) {
            alert('Error: This is an old or incompatible save file.')
            return
        }

        resetRemoteAssets?.()
        await clearAllAssets()
        resetAssetStoreQuotaState?.()
        const manifest = Array.isArray(sceneData.assets) ? sceneData.assets : []
        const { fallbackAssets } = await restoreAssetsFromPayload?.(manifest, assetBlobLoader) ?? { fallbackAssets: [] }
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
            gridAppearance: sceneData.gridAppearance || defaultGridAppearance,
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
            renderSettings: sceneData.renderSettings || defaultRenderSettings
        }, 'Loaded scene locally')
        if (!silent) {
            alert('Scene loaded successfully!')
        }
    }, [
        clearSelection,
        defaultGridAppearance,
        defaultRenderSettings,
        persistSceneDataWithStatus,
        resetAssetStoreQuotaState,
        resetRemoteAssets,
        restoreAssetsFromPayload,
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
        setObjects,
        setRemoteAssetsManifest,
        setRenderSettings,
        setTransformSnaps
    ])

    const handleArchiveSceneLoad = useCallback(async (arrayBuffer, options) => {
        await loadSceneArchive(arrayBuffer, applyLoadedScene, options)
    }, [applyLoadedScene])

    const handleFileLoad = useCallback((event) => {
        const file = event.target.files[0]
        if (!file) return
        const isArchive = file.name.endsWith('.zip')
            || file.type === 'application/zip'
            || file.type === 'application/x-zip-compressed'
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
        }
        reader.onerror = () => {
            alert('Error: Could not read file.')
        }
        reader.readAsArrayBuffer(file)
        event.target.value = null
    }, [handleArchiveSceneLoad])

    return {
        handleSave,
        handleLoadClick,
        handleFileLoad
    }
}

export default useSceneArchiveIO
