import React, { useContext, useMemo, useRef, useState } from 'react'
import { SceneContext, ActionsContext, SyncContext } from './contexts/AppContexts.js'
import { deleteAsset, getAssetBlob } from './storage/assetStore.js'
import { streamRemoteAsset } from './services/assetSources.js'
import { usePanelDrag } from './hooks/usePanelDrag.js'
import { usePanelResize } from './hooks/usePanelResize.js'

const formatBytes = (bytes) => {
    if (typeof bytes !== 'number' || Number.isNaN(bytes)) return '—'
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`
}

const titleCase = (value = '') => value
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase())

const mergeMeta = (current, next) => {
    if (!next?.id) return current
    if (!current) return next
    return {
        ...current,
        ...next,
        name: current.name || next.name,
        mimeType: current.mimeType || next.mimeType,
        size: Number.isFinite(current.size) && current.size > 0 ? current.size : next.size
    }
}

const downloadBlob = (blob, fileName) => {
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = fileName
    document.body.appendChild(anchor)
    anchor.click()
    document.body.removeChild(anchor)
    URL.revokeObjectURL(url)
}

export default function AssetPanel({ onClose, surfaceMode = 'floating' }) {
    const isSheetMode = surfaceMode === 'sheet'
    const isDockMode = surfaceMode === 'dock'
    const isEmbeddedMode = isSheetMode || isDockMode
    const { objects, setObjects, clearSelection } = useContext(SceneContext)
    const {
        selectObject,
        handleAssetFilesUpload,
        requestManualMediaOptimization,
        requestBatchMediaOptimization
    } = useContext(ActionsContext)
    const {
        uploadProgress,
        mediaOptimizationStatus,
        remoteAssetsManifest,
        remoteAssetsBaseUrl,
        setRemoteAssetsManifest
    } = useContext(SyncContext)
    const fileInputRef = useRef(null)
    const [busyRowKey, setBusyRowKey] = useState(null)
    const [isRunningBatchOptimize, setIsRunningBatchOptimize] = useState(false)
    const [isRemovingUnused, setIsRemovingUnused] = useState(false)
    const [expandedAssetKey, setExpandedAssetKey] = useState(null)
    const dragState = usePanelDrag({ x: 16, y: 460 }, { baseZ: 100 })
    const resizeState = usePanelResize(380, {
        min: 320,
        max: 760,
        minHeight: 300,
        maxHeight: 900,
        initialHeight: 520
    })

    const assetEntries = useMemo(() => {
        const rows = new Map()
        const assetIdToRowKey = new Map()

        const ensureRow = (key, seed = {}) => {
            if (!rows.has(key)) {
                rows.set(key, {
                    key,
                    kind: seed.kind || 'asset',
                    name: seed.name || 'Unnamed asset',
                    mimeType: seed.mimeType || '',
                    assetIds: new Set(),
                    objectIds: new Set(),
                    objectTypes: new Set(),
                    usageKinds: new Set(),
                    selectedVariants: { original: 0, optimized: 0 },
                    metaById: new Map(),
                    original: null,
                    optimized: null
                })
            }
            const row = rows.get(key)
            if (seed.name && (!row.name || row.name === 'Unnamed asset')) {
                row.name = seed.name
            }
            if (seed.mimeType && !row.mimeType) {
                row.mimeType = seed.mimeType
            }
            return row
        }

        const attachMetaToRow = (row, meta) => {
            if (!meta?.id) return
            row.assetIds.add(meta.id)
            assetIdToRowKey.set(meta.id, row.key)
            row.metaById.set(meta.id, mergeMeta(row.metaById.get(meta.id), meta))
            if (!row.mimeType && meta.mimeType) {
                row.mimeType = meta.mimeType
            }
            if ((!row.name || row.name === 'Unnamed asset') && meta.name) {
                row.name = meta.name
            }
        }

        const registerStandardAsset = (meta, objectId, options = {}) => {
            if (!meta?.id) return
            const key = assetIdToRowKey.get(meta.id) || `${options.kind || 'asset'}:${meta.id}`
            const row = ensureRow(key, {
                kind: options.kind || 'asset',
                name: meta.name,
                mimeType: meta.mimeType
            })
            row.objectIds.add(objectId)
            if (options.objectType) {
                row.objectTypes.add(options.objectType)
            }
            if (options.kind) {
                row.usageKinds.add(options.kind)
            }
            attachMetaToRow(row, meta)
        }

        const registerMediaAsset = (obj) => {
            const originalMeta = obj.mediaVariants?.original || obj.assetRef
            if (!originalMeta?.id) return false
            const key = assetIdToRowKey.get(originalMeta.id) || `media:${originalMeta.id}`
            const row = ensureRow(key, {
                kind: 'media',
                name: originalMeta.name,
                mimeType: originalMeta.mimeType
            })
            row.objectIds.add(obj.id)
            row.objectTypes.add(obj.type)
            row.usageKinds.add('media')
            row.original = mergeMeta(row.original, originalMeta)
            attachMetaToRow(row, originalMeta)
            const optimizedMeta = obj.mediaVariants?.optimized || null
            if (optimizedMeta?.id) {
                row.optimized = mergeMeta(row.optimized, optimizedMeta)
                attachMetaToRow(row, optimizedMeta)
            }
            const selectedVariant = obj.selectedVariant === 'optimized' && optimizedMeta?.id
                ? 'optimized'
                : 'original'
            row.selectedVariants[selectedVariant] += 1
            return true
        }

        ;(Array.isArray(objects) ? objects : []).forEach((obj) => {
            if (!obj?.id) return
            if (['video', 'audio'].includes(obj.type) && registerMediaAsset(obj)) {
                return
            }
            registerStandardAsset(obj.assetRef, obj.id, { kind: 'asset', objectType: obj.type })
            registerStandardAsset(obj.materialsAssetRef, obj.id, { kind: 'materials', objectType: obj.type })
            registerStandardAsset(obj.asset, obj.id, { kind: 'asset', objectType: obj.type })
            if (Array.isArray(obj.assets)) {
                obj.assets.forEach((asset) => registerStandardAsset(asset, obj.id, { kind: 'asset', objectType: obj.type }))
            }
        })

        ;(Array.isArray(remoteAssetsManifest) ? remoteAssetsManifest : []).forEach((asset) => {
            if (!asset?.id) return
            const existingKey = assetIdToRowKey.get(asset.id)
            if (existingKey) {
                const row = rows.get(existingKey)
                attachMetaToRow(row, asset)
                if (row.original?.id === asset.id) {
                    row.original = mergeMeta(row.original, asset)
                }
                if (row.optimized?.id === asset.id) {
                    row.optimized = mergeMeta(row.optimized, asset)
                }
                return
            }
            const row = ensureRow(`asset:${asset.id}`, {
                kind: 'manifest',
                name: asset.name,
                mimeType: asset.mimeType
            })
            attachMetaToRow(row, asset)
        })

        return Array.from(rows.values())
            .map((row) => {
                const assetIds = Array.from(row.assetIds)
                const objectIds = Array.from(row.objectIds)
                const totalSize = assetIds.reduce((sum, assetId) => {
                    const size = Number(row.metaById.get(assetId)?.size)
                    return Number.isFinite(size) ? sum + size : sum
                }, 0)
                const mimeType = row.mimeType || row.original?.mimeType || row.optimized?.mimeType || ''
                const topLevel = (mimeType.split('/')[0] || '').trim()
                const activeVariant = row.kind === 'media'
                    ? (
                        row.selectedVariants.optimized > 0 && row.selectedVariants.original === 0
                            ? 'optimized'
                            : (
                                row.selectedVariants.original > 0 && row.selectedVariants.optimized === 0
                                    ? 'original'
                                    : 'mixed'
                            )
                    )
                    : 'single'
                const typeLabel = row.kind === 'media'
                    ? titleCase(Array.from(row.objectTypes)[0] || topLevel || 'media')
                    : (
                        row.usageKinds.size === 1 && row.usageKinds.has('materials')
                            ? 'Material'
                            : titleCase(topLevel || 'asset')
                    )
                const optimizationStatus = row.kind === 'media'
                    ? (row.optimized?.id ? 'Ready' : 'Original only')
                    : (row.kind === 'manifest' ? 'Manifest only' : 'Single file')
                return {
                    key: row.key,
                    kind: row.kind,
                    name: row.name,
                    mimeType,
                    typeLabel,
                    optimizationStatus,
                    totalSize,
                    assetIds,
                    objectIds,
                    usageCount: objectIds.length,
                    original: row.original,
                    optimized: row.optimized,
                    activeVariant,
                    metaById: row.metaById
                }
            })
            .sort((a, b) => {
                if (a.usageCount !== b.usageCount) {
                    return b.usageCount - a.usageCount
                }
                return (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base' })
            })
    }, [objects, remoteAssetsManifest])

    const unusedEntryCount = assetEntries.filter((entry) => entry.usageCount === 0).length

    const handleFocusObjects = (asset) => {
        if (!asset?.objectIds?.length || !selectObject || !clearSelection) return
        clearSelection()
        asset.objectIds.forEach((objectId, index) => {
            selectObject(objectId, { additive: index > 0 })
        })
    }

    const handleDownloadAsset = async (asset) => {
        if (!asset) return
        const preferredAssetId = asset.kind === 'media' && asset.activeVariant === 'optimized' && asset.optimized?.id
            ? asset.optimized.id
            : (asset.original?.id || asset.assetIds[0])
        if (!preferredAssetId) return
        let blob = await getAssetBlob(preferredAssetId)
        if (!blob) {
            try {
                blob = await streamRemoteAsset(preferredAssetId)
            } catch (error) {
                console.warn('Failed to stream asset', error)
            }
        }
        if (!blob) {
            alert('Asset data is not available locally.')
            return
        }
        const fileName = asset.metaById.get(preferredAssetId)?.name || asset.name || `asset-${preferredAssetId}`
        downloadBlob(blob, fileName)
    }

    const handleImportClick = () => {
        fileInputRef.current?.click()
    }

    const handleImportChange = async (event) => {
        const files = event.target.files
        if (files?.length) {
            await handleAssetFilesUpload?.(files)
        }
        event.target.value = null
    }

    const handleSetMediaVariant = (asset, variantKey) => {
        const variantMeta = variantKey === 'optimized' ? asset.optimized : asset.original
        if (!variantMeta?.id || !asset.original?.id) return
        setObjects((prev) => prev.map((obj) => {
            if (!['video', 'audio'].includes(obj.type)) return obj
            const originalId = obj.mediaVariants?.original?.id || obj.assetRef?.id
            if (originalId !== asset.original.id) return obj
            return {
                ...obj,
                selectedVariant: variantKey,
                assetRef: variantMeta
            }
        }))
    }

    const handleOptimizeAsset = async (asset) => {
        if (!asset?.objectIds?.length || !requestManualMediaOptimization) return
        setBusyRowKey(asset.key)
        try {
            await requestManualMediaOptimization(asset.objectIds[0])
        } finally {
            setBusyRowKey(null)
        }
    }

    const handleBatchOptimize = async () => {
        if (!requestBatchMediaOptimization) return
        setIsRunningBatchOptimize(true)
        try {
            await requestBatchMediaOptimization()
        } finally {
            setIsRunningBatchOptimize(false)
        }
    }

    const handleRemoveUnusedEntry = async (asset) => {
        if (!asset || asset.usageCount > 0) return
        setBusyRowKey(asset.key)
        try {
            await Promise.all(asset.assetIds.map((assetId) => deleteAsset(assetId)))
            const filteredManifest = (Array.isArray(remoteAssetsManifest) ? remoteAssetsManifest : [])
                .filter((item) => !asset.assetIds.includes(item.id))
            setRemoteAssetsManifest?.(filteredManifest, remoteAssetsBaseUrl || '')
        } finally {
            setBusyRowKey(null)
        }
    }

    const handleRemoveUnusedEntries = async () => {
        const unusedEntries = assetEntries.filter((entry) => entry.usageCount === 0)
        if (!unusedEntries.length) return
        setIsRemovingUnused(true)
        try {
            for (const entry of unusedEntries) {
                await handleRemoveUnusedEntry(entry)
            }
        } finally {
            setIsRemovingUnused(false)
            setBusyRowKey(null)
        }
    }

    return (
        <div
            ref={isEmbeddedMode ? undefined : dragState.panelRef}
            style={isEmbeddedMode ? undefined : { ...dragState.dragStyle, width: resizeState.width, height: resizeState.height }}
            className={['floating-panel', 'asset-panel', isSheetMode ? 'sheet-panel' : (isDockMode ? 'dock-panel' : 'draggable-panel')].join(' ')}
            {...(isEmbeddedMode ? {} : dragState.panelPointerProps)}
        >
            <div className={`panel-header ${isSheetMode ? 'sheet-panel-header' : (isDockMode ? 'dock-panel-header' : `draggable-header ${dragState.isDragging ? 'dragging' : ''}`)}`.trim()} {...(isEmbeddedMode ? {} : dragState.dragProps)}>
                <h3>Project Assets</h3>
                <button className="close-button" onClick={onClose}>×</button>
            </div>
            <div className="panel-content asset-panel-content">
                <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    hidden
                    onChange={handleImportChange}
                />

                <div className="asset-toolbar">
                    <button type="button" className="asset-action-button primary" onClick={handleImportClick}>
                        Import
                    </button>
                    <button
                        type="button"
                        className="asset-action-button"
                        onClick={handleBatchOptimize}
                        disabled={!requestBatchMediaOptimization || isRunningBatchOptimize}
                    >
                        {isRunningBatchOptimize ? 'Optimizing...' : 'Optimize'}
                    </button>
                    <button
                        type="button"
                        className="asset-action-button warning"
                        onClick={handleRemoveUnusedEntries}
                        disabled={unusedEntryCount === 0 || isRemovingUnused}
                    >
                        {isRemovingUnused ? 'Cleaning...' : `Clean Up (${unusedEntryCount})`}
                    </button>
                </div>

                <div className="asset-workspace-summary">
                    <span>Drag and drop files anywhere into the editor, or import them here.</span>
                    {uploadProgress?.active && (
                        <span>Importing {uploadProgress.completed}/{uploadProgress.total}</span>
                    )}
                    {mediaOptimizationStatus?.active && (
                        <span>{mediaOptimizationStatus.label || 'Optimizing media...'} {mediaOptimizationStatus.completed}/{mediaOptimizationStatus.total}</span>
                    )}
                </div>

                {assetEntries.length === 0 ? (
                    <p className="panel-subtext">No assets in this project yet.</p>
                ) : (
                    <div className="asset-list">
                        {assetEntries.map((asset) => {
                            const isBusy = busyRowKey === asset.key
                            const isMediaAsset = asset.kind === 'media'
                            const showsVariantSwitcher = isMediaAsset && Boolean(asset.optimized?.id)
                            const hasSecondaryActions = asset.usageCount === 0 || (isMediaAsset && (!asset.optimized?.id || showsVariantSwitcher))
                            const isExpanded = expandedAssetKey === asset.key
                            return (
                                <div key={asset.key} className={`asset-row ${asset.usageCount === 0 ? 'is-unused' : ''}`.trim()}>
                                    <div className="asset-meta">
                                        <div className="asset-title-block">
                                            <span className="asset-name">{asset.name}</span>
                                            <span className="asset-subtitle">
                                                {asset.typeLabel}
                                                {asset.mimeType ? ` • ${asset.mimeType}` : ''}
                                            </span>
                                        </div>
                                        <span className="asset-tag">{asset.optimizationStatus}</span>
                                    </div>

                                    <div className="asset-details">
                                        <span>{formatBytes(asset.totalSize)}</span>
                                        <span>{asset.usageCount} use{asset.usageCount === 1 ? '' : 's'}</span>
                                        <span>{asset.assetIds.length} stored file{asset.assetIds.length === 1 ? '' : 's'}</span>
                                    </div>

                                    {isMediaAsset && (
                                        <div className="asset-variant-summary">
                                            <span>Original: {formatBytes(asset.original?.size)}</span>
                                            <span>
                                                Optimized: {asset.optimized?.id ? formatBytes(asset.optimized?.size) : 'Pending'}
                                            </span>
                                            <span>Active: {titleCase(asset.activeVariant)}</span>
                                        </div>
                                    )}

                                    <div className="asset-actions">
                                        <button
                                            type="button"
                                            className="asset-action-button"
                                            onClick={() => handleFocusObjects(asset)}
                                            disabled={!asset.objectIds.length}
                                        >
                                            Reveal
                                        </button>
                                        <button
                                            type="button"
                                            className="asset-action-button"
                                            onClick={() => handleDownloadAsset(asset)}
                                        >
                                            Download
                                        </button>
                                        {hasSecondaryActions && (
                                            <button
                                                type="button"
                                                className={`asset-action-button ${isExpanded ? 'primary' : ''}`.trim()}
                                                onClick={() => setExpandedAssetKey((current) => (current === asset.key ? null : asset.key))}
                                            >
                                                {isExpanded ? 'Less' : 'More'}
                                            </button>
                                        )}
                                    </div>

                                    {isExpanded && hasSecondaryActions && (
                                        <div className="asset-secondary-actions">
                                            {isMediaAsset && !asset.optimized?.id && (
                                                <button
                                                    type="button"
                                                    className="asset-action-button"
                                                    onClick={() => handleOptimizeAsset(asset)}
                                                    disabled={!requestManualMediaOptimization || isBusy}
                                                >
                                                    {isBusy ? 'Optimizing...' : 'Optimize This Asset'}
                                                </button>
                                            )}
                                            {asset.usageCount === 0 && (
                                                <button
                                                    type="button"
                                                    className="asset-action-button warning"
                                                    onClick={() => handleRemoveUnusedEntry(asset)}
                                                    disabled={isBusy}
                                                >
                                                    Remove Unused
                                                </button>
                                            )}
                                            {showsVariantSwitcher && (
                                                <div className="asset-actions asset-variant-actions">
                                                    <button
                                                        type="button"
                                                        className={`asset-action-button ${asset.activeVariant === 'original' ? 'primary' : ''}`.trim()}
                                                        onClick={() => handleSetMediaVariant(asset, 'original')}
                                                    >
                                                        Use Original
                                                    </button>
                                                    <button
                                                        type="button"
                                                        className={`asset-action-button ${asset.activeVariant === 'optimized' ? 'primary' : ''}`.trim()}
                                                        onClick={() => handleSetMediaVariant(asset, 'optimized')}
                                                    >
                                                        Use Optimized
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            )
                        })}
                    </div>
                )}
            </div>
            {!isEmbeddedMode && <div className={`panel-resizer ${resizeState.isResizing ? 'resizing' : ''}`} {...resizeState.resizerProps} />}
        </div>
    )
}
