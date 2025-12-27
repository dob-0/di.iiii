import React, { useContext, useMemo } from 'react'
import { AppContext } from './AppContext.js'
import { getAssetBlob } from './storage/assetStore.js'
import { getAssetSourceUrl, streamRemoteAsset } from './services/assetSources.js'
import { usePanelDrag } from './hooks/usePanelDrag.js'
import { usePanelResize } from './hooks/usePanelResize.js'

const formatBytes = (bytes) => {
    if (typeof bytes !== 'number' || Number.isNaN(bytes)) return '—'
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`
}

export default function AssetPanel({ onClose }) {
    const {
        objects,
        selectObject,
        clearSelection
    } = useContext(AppContext)
    const { panelRef, dragProps, dragStyle, isDragging, panelPointerProps } = usePanelDrag({ x: 16, y: 460 }, { baseZ: 150 })
    const { width, height, resizerProps, isResizing } = usePanelResize(320, {
        min: 280,
        max: 640,
        minHeight: 260,
        maxHeight: 900,
        initialHeight: 400
    })

    const assetEntries = useMemo(() => {
        const map = new Map()
        const register = (ref, objectId) => {
            if (!ref?.id) return
            const entry = map.get(ref.id) || {
                id: ref.id,
                name: ref.name || 'Unnamed asset',
                mimeType: ref.mimeType || 'unknown',
                size: ref.size,
                objectIds: new Set()
            }
            entry.objectIds.add(objectId)
            if (!map.has(ref.id)) {
                map.set(ref.id, entry)
            }
        }
        objects?.forEach(obj => {
            register(obj.assetRef, obj.id)
            register(obj.materialsAssetRef, obj.id)
        })
        return Array.from(map.values())
            .map(entry => ({
                ...entry,
                objectIds: Array.from(entry.objectIds),
                usageCount: entry.objectIds.size
            }))
            .sort((a, b) => (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base' }))
    }, [objects])

    const handleFocusObjects = (asset) => {
        if (!asset?.objectIds?.length || !selectObject || !clearSelection) return
        clearSelection()
        asset.objectIds.forEach((objectId, index) => {
            selectObject(objectId, { additive: index > 0 })
        })
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

    const handleDownloadAsset = async (asset) => {
        if (!asset?.id) return
        let blob = await getAssetBlob(asset.id)
        if (!blob) {
            try {
                blob = await streamRemoteAsset(asset.id)
            } catch (error) {
                console.warn('Failed to stream asset', error)
            }
        }
        if (!blob) {
            alert('Asset data is not available locally.')
            return
        }
        const fileName = asset.name || `asset-${asset.id}`
        downloadBlob(blob, fileName)
    }

    return (
        <div
            ref={panelRef}
            style={{ ...dragStyle, width, height }}
            className="floating-panel asset-panel draggable-panel"
            {...panelPointerProps}
        >
            <div className={`panel-header draggable-header ${isDragging ? 'dragging' : ''}`} {...dragProps}>
                <h3>Assets</h3>
                <button className="close-button" onClick={onClose}>×</button>
            </div>
            <div className="panel-content asset-panel-content">
                {assetEntries.length === 0 ? (
                    <p className="panel-subtext">No assets in this scene yet.</p>
                ) : (
                    <div className="asset-list">
                        {assetEntries.map(asset => (
                            <div key={asset.id} className="asset-row">
                                <div className="asset-meta">
                                    <span className="asset-name">{asset.name}</span>
                                    <span className="asset-tag">{asset.mimeType}</span>
                                </div>
                                <div className="asset-details">
                                    <span>{formatBytes(asset.size)}</span>
                                    <span>{asset.usageCount} use{asset.usageCount === 1 ? '' : 's'}</span>
                                </div>
                                <button
                                    type="button"
                                    className="asset-focus-button"
                                    onClick={() => handleFocusObjects(asset)}
                                    disabled={!asset.objectIds.length}
                                >
                                    Highlight
                                </button>
                                <button
                                    type="button"
                                    className="asset-focus-button"
                                    onClick={() => handleDownloadAsset(asset)}
                                >
                                    Download
                                </button>
                            </div>
                        ))}
                    </div>
                )}
            </div>
            <div className={`panel-resizer ${isResizing ? 'resizing' : ''}`} {...resizerProps} />
        </div>
    )
}
