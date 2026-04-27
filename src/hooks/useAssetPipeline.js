import { useCallback, useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { saveAssetFromFile } from '../storage/assetStore.js'
import { MODEL_FORMATS, detectModelFormatFromFile, stripExtension } from '../utils/modelFormats.js'
import { uploadServerAsset } from '../services/serverSpaces.js'

export function useAssetPipeline({
    controlsRef,
    handleAddObject,
    objects,
    setObjects,
    canUploadServerAssets,
    spaceId,
    serverAssetBaseUrl,
    upsertRemoteAssetEntry,
    getAssetBlob,
    getAssetSourceUrl,
    initialOptimizationPreference = 'original'
} = {}) {
    const [isFileDragActive, setIsFileDragActive] = useState(false)
    const [uploadProgress, setUploadProgress] = useState({
        active: false,
        total: 0,
        completed: 0
    })
    const [mediaOptimizationPreference, setMediaOptimizationPreference] = useState(initialOptimizationPreference)
    const [mediaOptimizationStatus, setMediaOptimizationStatus] = useState({
        active: false,
        count: 0,
        label: '',
        total: 0,
        completed: 0,
        startedAt: null
    })
    const [serverAssetSyncPending, setServerAssetSyncPending] = useState(0)
    const manualOptimizationInFlight = useRef(new Set())

    const getFileTypeForObject = useCallback((file) => {
        if (!file) return null
        const mime = file.type || ''
        if (mime.startsWith('image/')) return { type: 'image' }
        if (mime.startsWith('video/')) return { type: 'video' }
        if (mime.startsWith('audio/')) return { type: 'audio' }
        const modelFormat = detectModelFormatFromFile(file)
        if (modelFormat) return { type: 'model', modelFormat }
        return null
    }, [])

    const optimizeImageFile = useCallback(async (file) => {
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
        }
        return file
    }, [])

    const transcodeMediaWithRecorder = useCallback(async (file, { kind }) => {
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
                if (stopTimeout) {
                    clearTimeout(stopTimeout)
                }
                URL.revokeObjectURL(objectUrl)
                return file
            }
            if (stopTimeout) {
                clearTimeout(stopTimeout)
            }
            URL.revokeObjectURL(objectUrl)
            return file
        }
    }, [])

    const optimizeVideoFile = useCallback((file) => transcodeMediaWithRecorder(file, { kind: 'video' }), [transcodeMediaWithRecorder])
    const optimizeAudioFile = useCallback((file) => transcodeMediaWithRecorder(file, { kind: 'audio' }), [transcodeMediaWithRecorder])

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
            setObjects?.(prev => prev.map(obj => {
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
        } finally {
            endMediaOptimizationFeedback()
        }
    }, [
        beginMediaOptimizationFeedback,
        endMediaOptimizationFeedback,
        mediaOptimizationPreference,
        optimizeAudioFile,
        optimizeVideoFile,
        setObjects
    ])

    const handleManualMediaOptimization = useCallback(async (objectId) => {
        const targetObject = objects?.find(obj => obj.id === objectId)
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
            let blob = await getAssetBlob?.(originalMeta.id)
            if (!blob) {
                const remoteUrl = getAssetSourceUrl?.(originalMeta.id)
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
            alert('Failed to optimize this media. Please try again or re-upload the original file.')
            return false
        } finally {
            manualOptimizationInFlight.current.delete(originalMeta.id)
        }
    }, [getAssetBlob, getAssetSourceUrl, objects, startMediaOptimization])

    const handleBatchMediaOptimization = useCallback(async () => {
        const candidates = []
        const seenOriginalIds = new Set()
        ;(Array.isArray(objects) ? objects : []).forEach((obj) => {
            if (!obj || !['video', 'audio'].includes(obj.type)) return
            if (obj.mediaVariants?.optimized) return
            const originalMeta = obj.mediaVariants?.original || obj.assetRef
            if (!originalMeta?.id || seenOriginalIds.has(originalMeta.id)) return
            seenOriginalIds.add(originalMeta.id)
            candidates.push(obj.id)
        })
        let completed = 0
        for (const objectId of candidates) {
            const ok = await handleManualMediaOptimization(objectId)
            if (ok) {
                completed += 1
            }
        }
        return {
            queued: candidates.length,
            completed
        }
    }, [handleManualMediaOptimization, objects])

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
            const resolvedBase = serverAssetBaseUrl ? serverAssetBaseUrl.replace(/\/+$/, '') : ''
            const responseUrl = response.url || ''
            const responseIsAbsolute = /^https?:\/\//i.test(responseUrl)
            const resolvedUrl = responseIsAbsolute
                ? responseUrl
                : (resolvedBase ? `${resolvedBase}/${response.assetId}` : responseUrl)
            const entry = {
                id: response.assetId,
                name: name || file?.name || response.assetId,
                mimeType: response.mimeType || mimeType || fallbackType,
                size: response.size ?? uploadBlob.size ?? 0,
                url: resolvedUrl
            }
            upsertRemoteAssetEntry?.(entry, serverAssetBaseUrl)
            return entry
        } catch (error) {
            return null
        } finally {
            if (trackPending) {
                setServerAssetSyncPending(prev => Math.max(0, prev - 1))
            }
        }
    }, [canUploadServerAssets, spaceId, serverAssetBaseUrl, upsertRemoteAssetEntry])

    const ingestAssetFile = useCallback(async (file) => {
        if (!file) return null
        if (canUploadServerAssets) {
            const remoteEntry = await uploadAssetToServer({
                file,
                name: file?.name,
                mimeType: file?.type
            })
            if (!remoteEntry?.id) {
                throw new Error('Shared asset upload failed. Check the server connection and try again.')
            }
            return saveAssetFromFile(file, { id: remoteEntry.id })
        }
        return saveAssetFromFile(file)
    }, [canUploadServerAssets, uploadAssetToServer])

    const handleAddAssetObject = useCallback(async (file, type, overrides = {}) => {
        if (!file || !handleAddObject) return
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
    }, [handleAddObject, ingestAssetFile, optimizeImageFile])

    const handleAssetFilesUpload = useCallback(async (fileList, options = {}) => {
        if (!fileList) return
        const files = Array.from(fileList).filter(Boolean)
        if (files.length === 0) return
        const unsupported = []
        const failureDetails = []
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
                            const materialMeta = await ingestAssetFile(materialEntry.file)
                            overridesPayload.materialsAssetRef = materialMeta
                        } catch (error) {
                        }
                    }
                }
            }

            try {
                await handleAddAssetObject(file, fileIntent.type, overridesPayload)
            } catch (error) {
                unsupported.push(file.name)
                failureDetails.push(error?.message ? `${file.name}: ${error.message}` : file.name)
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
            const detail = failureDetails.length
                ? `\n\n${failureDetails.join('\n')}`
                : '\n\nSupported formats: images, videos, audio, .glb/.gltf, .obj/.mtl, .stl.'
            alert(`Unable to add the provided files.${detail}`)
        } else if (!options.silent && unsupported.length > 0) {
            const detail = failureDetails.length ? `\n\n${failureDetails.join('\n')}` : ''
            alert(`Some files could not be added: ${unsupported.join(', ')}${detail}`)
        }
    }, [getFileTypeForObject, handleAddAssetObject, ingestAssetFile])

    const computeGroundPosition = useCallback((clientX, clientY) => {
        const canvas = document.querySelector('canvas')
        if (!canvas || !controlsRef?.current) return null
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
    }, [controlsRef])

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
    }, [computeGroundPosition, handleAssetFilesUpload])

    return {
        isFileDragActive,
        uploadProgress,
        serverAssetSyncPending,
        mediaOptimizationPreference,
        setMediaOptimizationPreference,
        mediaOptimizationStatus,
        handleBatchMediaOptimization,
        handleManualMediaOptimization,
        handleAssetFilesUpload,
        uploadAssetToServer
    }
}

export default useAssetPipeline
