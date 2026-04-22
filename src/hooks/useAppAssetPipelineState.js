import { useAssetPipeline } from './useAssetPipeline.js'

export function useAppAssetPipelineState({
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
} = {}) {
    return useAssetPipeline({
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
}

export default useAppAssetPipelineState
