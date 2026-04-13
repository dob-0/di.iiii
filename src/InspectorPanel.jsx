import React, { useContext, useEffect, useMemo, useState, useCallback, useRef } from 'react'
import { AppContext } from './AppContext.js'
import { deleteAsset } from './storage/assetStore.js'
import { usePanelDrag } from './hooks/usePanelDrag.js'
import { usePanelResize } from './hooks/usePanelResize.js'
import {
    evaluateExpressionString,
    getExpressionContext,
    isLikelyExpression
} from './utils/expressions.js'
import { useAssetUrl } from './hooks/useAssetUrl.js'

const formatNumberString = (input) => {
    const parsed = Number(input)
    if (!Number.isFinite(parsed)) return '0.00'
    return parsed.toFixed(2)
}

const VECTOR_SIZE = 3
const DEFAULT_VECTOR = Object.freeze([0, 0, 0])
const DEFAULT_EXPRESSIONS = Object.freeze(Array(VECTOR_SIZE).fill(null))

function Vector3Control({
    label,
    value = DEFAULT_VECTOR,
    expressions = DEFAULT_EXPRESSIONS,
    axisLabels = ['X', 'Y', 'Z'],
    onCommit
}) {
    const safeValue = useMemo(
        () => (Array.isArray(value) && value.length === VECTOR_SIZE ? value : DEFAULT_VECTOR),
        [value]
    )
    const safeExpressions = useMemo(
        () => (Array.isArray(expressions) && expressions.length === VECTOR_SIZE ? expressions : DEFAULT_EXPRESSIONS),
        [expressions]
    )

    const [inputs, setInputs] = useState(() =>
        safeValue.map((component, idx) => safeExpressions?.[idx] ?? formatNumberString(component ?? 0))
    )
    const [isEditing, setIsEditing] = useState(() => Array(VECTOR_SIZE).fill(false))

    useEffect(() => {
        setInputs(prev =>
            safeValue.map((component, idx) =>
                isEditing[idx]
                    ? prev[idx]
                    : (safeExpressions?.[idx] ?? formatNumberString(component ?? 0))
            )
        )
    }, [safeValue, safeExpressions, isEditing])

    const getModifierStep = (event) => {
        if (event.shiftKey) return 0.1
        if (event.altKey) return 0.001
        if (event.ctrlKey || event.metaKey) return 0.0001
        return 0.01
    }

    const resolveNumericValue = (raw, fallback) => {
        const parsed = Number(raw)
        if (Number.isFinite(parsed)) return parsed
        const fallbackNumber = Number(fallback)
        if (Number.isFinite(fallbackNumber)) return fallbackNumber
        return 0
    }

    const commit = (axisIndex, raw) => {
        const nextValues = [...safeValue]
        const nextExpr = [...safeExpressions]
        const trimmed = raw?.trim()
        if (!trimmed) {
            nextValues[axisIndex] = 0
            nextExpr[axisIndex] = null
            onCommit(nextValues, nextExpr)
            setInputs(prev => {
                const clone = [...prev]; clone[axisIndex] = formatNumberString(0); return clone
            })
            return
        }
        const hasLetters = isLikelyExpression(trimmed)
        const context = getExpressionContext()
        let resolved = evaluateExpressionString(trimmed, context)
        if (!hasLetters && (resolved === null || Number.isNaN(Number(trimmed)))) {
            resolved = Number(trimmed)
        }
        if (resolved === null || !Number.isFinite(resolved)) {
            setInputs(prev => {
                const clone = [...prev]; clone[axisIndex] = safeExpressions?.[axisIndex] ?? formatNumberString(safeValue?.[axisIndex] ?? 0); return clone
            })
            return
        }
        nextValues[axisIndex] = resolved
        nextExpr[axisIndex] = hasLetters ? trimmed : null
        onCommit(nextValues, nextExpr)
        setInputs(prev => {
            const clone = [...prev]; clone[axisIndex] = hasLetters ? trimmed : formatNumberString(resolved); return clone
        })
    }

    const adjust = (axisIndex, delta) => {
        const currentValue = resolveNumericValue(inputs[axisIndex], safeValue?.[axisIndex])
        const nextValue = Number((currentValue + delta).toFixed(6))
        const nextValues = [...safeValue]
        const nextExpr = [...safeExpressions]
        nextValues[axisIndex] = nextValue
        nextExpr[axisIndex] = null
        onCommit(nextValues, nextExpr)
        setInputs(prev => {
            const clone = [...prev]; clone[axisIndex] = formatNumberString(nextValue); return clone
        })
    }

    return (
        <div className="prop-row-stacked">
            <label>{label}</label>
            <div className="vec3-control">
                {axisLabels.map((axisLabel, axisIndex) => (
                    <label className="vec3-axis" key={axisLabel}>
                        <span>{axisLabel}</span>
                        <input
                            type="text"
                            inputMode="decimal"
                            value={inputs[axisIndex]}
                            onFocus={() => {
                                setIsEditing(prev => {
                                    const clone = [...prev]
                                    clone[axisIndex] = true
                                    return clone
                                })
                            }}
                            onChange={(e) => {
                                const next = e.target.value
                                setInputs(prev => { const clone = [...prev]; clone[axisIndex] = next; return clone })
                            }}
                            onBlur={() => {
                                setIsEditing(prev => {
                                    const clone = [...prev]
                                    clone[axisIndex] = false
                                    return clone
                                })
                                commit(axisIndex, inputs[axisIndex])
                            }}
                            onKeyDown={(e) => {
                                if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                                    e.preventDefault()
                                    const direction = e.key === 'ArrowUp' ? 1 : -1
                                    const step = getModifierStep(e)
                                    adjust(axisIndex, direction * step)
                                }
                                if (e.key === 'Enter') {
                                    commit(axisIndex, inputs[axisIndex])
                                }
                            }}
                            onWheel={(e) => {
                                const direction = e.deltaY < 0 ? 1 : -1
                                const step = getModifierStep(e)
                                adjust(axisIndex, direction * step)
                            }}
                        />
                    </label>
                ))}
            </div>
        </div>
    )
}

export default function InspectorPanel() {
    const {
        selectedObjectId,
        objects,
        setObjects,
        clearSelection,
        gizmoMode,
        setGizmoMode,
        requestManualMediaOptimization
    } = useContext(AppContext)

    const { panelRef, dragProps, dragStyle, isDragging, panelPointerProps } = usePanelDrag({ x: 16, y: 120 }, { baseZ: 80 })
    const { width, height, resizerProps, isResizing } = usePanelResize(320, {
        min: 280,
        max: 640,
        minHeight: 220,
        maxHeight: 1000,
        initialHeight: null
    })

    const selectedObject = useMemo(
        () => objects.find(obj => obj.id === selectedObjectId),
        [objects, selectedObjectId]
    )

    const [isManualOptimizing, setIsManualOptimizing] = useState(false)
    useEffect(() => setIsManualOptimizing(false), [selectedObjectId])

    const handleCommitVector = useCallback((valueKey, expressionsKey, nextValues, nextExpressions) => {
        if (!selectedObjectId) return
        setObjects(prev => prev.map(obj => obj.id === selectedObjectId ? { ...obj, [valueKey]: nextValues, [expressionsKey]: nextExpressions } : obj))
    }, [selectedObjectId, setObjects])

    const handleUpdateProperty = (property, newValue) => {
        if (!selectedObjectId) return
        setObjects(prev => prev.map(obj => obj.id === selectedObjectId ? { ...obj, [property]: newValue } : obj))
    }

    const handleDeleteObject = async () => {
        if (!selectedObject) return
        const objectToRemove = selectedObject
        setObjects(prev => prev.filter(obj => obj.id !== selectedObjectId))
        clearSelection()
        const removeAssetIfUnused = async (key) => {
            const assetId = objectToRemove?.[key]?.id
            if (!assetId) return
            const stillUsed = objects.some(obj => obj.id !== selectedObjectId && obj[key]?.id === assetId)
            if (!stillUsed) {
                try { await deleteAsset(assetId) } catch (error) { console.error(`Failed to delete asset ${assetId}`, error) }
            }
        }
        await removeAssetIfUnused('assetRef')
        await removeAssetIfUnused('materialsAssetRef')
    }

    const handleToggleVisibility = () => handleUpdateProperty('isVisible', !selectedObject.isVisible)
    const handleUpdateColor = (newColor) => handleUpdateProperty('color', newColor)

    const gizmoModeOptions = [
        { key: 'translate', label: 'Move', hint: 'G', icon: '✢' },
        { key: 'rotate', label: 'Rotate', hint: 'R', icon: '⟳' },
        { key: 'scale', label: 'Scale', hint: 'S', icon: '⇲' }
    ]

    const shapeTypes = ['box', 'sphere', 'cone', 'cylinder']
    const objectType = selectedObject?.type || ''
    const isTextObject = objectType.includes('text')
    const isShapeObject = shapeTypes.includes(objectType)
    const isMediaObject = objectType === 'video' || objectType === 'audio'
    const canChangeColor = objectType === 'box'
        || objectType.includes('text')
        || objectType === 'audio'
        || isShapeObject
    const isAudioObject = objectType === 'audio'
    const audioUrl = useAssetUrl(selectedObject?.assetRef)
    const previewAudioRef = useRef(null)
    const previewPreviousPausedRef = useRef(null)

    const pauseSceneAudio = useCallback(() => {
        if (!isAudioObject || !selectedObjectId) return
        setObjects(prev => prev.map(obj => obj.id === selectedObjectId
            ? { ...obj, audioPaused: true, audioAutoplay: false }
            : obj))
    }, [isAudioObject, selectedObjectId, setObjects])

    const restoreSceneAudio = useCallback(() => {
        if (!isAudioObject || !selectedObjectId) return
        const previous = previewPreviousPausedRef.current
        setObjects(prev => prev.map(obj => obj.id === selectedObjectId
            ? { ...obj, audioPaused: previous ?? obj.audioPaused }
            : obj))
    }, [isAudioObject, selectedObjectId, setObjects])

    useEffect(() => {
        return () => {
            restoreSceneAudio()
        }
    }, [restoreSceneAudio])

    const mediaVariantOrder = ['original', 'optimized']
    const mediaVariantLabels = { original: 'Original', optimized: 'Optimized' }
    const formatBytes = (bytes) => {
        if (!bytes && bytes !== 0) return 'N/A'
        if (bytes < 1024) return `${bytes} B`
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
        return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
    }

    const handleSelectMediaVariant = (variantKey) => {
        const variants = selectedObject?.mediaVariants || {}
        const variantMeta = variants[variantKey]
        if (!variantMeta) return
        setObjects(prev => prev.map(obj => obj.id === selectedObjectId
            ? { ...obj, selectedVariant: variantKey, assetRef: variantMeta }
            : obj))
    }

    const handleManualOptimize = async () => {
        if (!requestManualMediaOptimization) return
        setIsManualOptimizing(true)
        try { await requestManualMediaOptimization(selectedObjectId) } finally { setIsManualOptimizing(false) }
    }

    const needsManualOptimization = Boolean(
        requestManualMediaOptimization && (!selectedObject?.mediaVariants || !selectedObject?.mediaVariants?.optimized)
    )

    if (!selectedObject) {
        return null
    }

    return (
        <div
            ref={panelRef}
            style={{ ...dragStyle, width, height }}
            className="floating-panel inspector-panel draggable-panel"
            {...panelPointerProps}
        >
            <div className={`panel-header draggable-header ${isDragging ? 'dragging' : ''}`} {...dragProps}>
                <h3>Inspector</h3>
                <button className="close-button" onClick={clearSelection}>×</button>
            </div>

            <div className="panel-content gizmo-controls">
                <div className="gizmo-section gizmo-mode-buttons" role="group" aria-label="Transform mode">
                    {gizmoModeOptions.map(mode => (
                        <button
                            key={mode.key}
                            type="button"
                            className={['gizmo-mode-button', gizmoMode === mode.key ? 'active' : ''].filter(Boolean).join(' ')}
                            onClick={() => setGizmoMode(mode.key)}
                        >
                            <span className="gizmo-mode-icon" aria-hidden="true">{mode.icon}</span>
                            <span className="gizmo-mode-label">{mode.label}</span>
                            <span className="gizmo-mode-hint">{mode.hint}</span>
                        </button>
                    ))}
                </div>

                <div className="gizmo-section">
                    {isTextObject && (
                        <div className="prop-row-stacked">
                            <label>Text</label>
                            <textarea
                                className="text-input"
                                value={selectedObject.data}
                                onChange={(e) => handleUpdateProperty('data', e.target.value)}
                            />
                        </div>
                    )}

                    <div className="prop-row-stacked">
                        <label>Link</label>
                        <div className="prop-row link-row">
                            <button
                                className="toggle-button-small"
                                onClick={() => handleUpdateProperty('linkActive', !selectedObject.linkActive)}
                            >
                                {selectedObject.linkActive ? 'On' : 'Off'}
                            </button>
                            <input
                                type="url"
                                className="text-input"
                                placeholder="https://example.com"
                                value={selectedObject.linkUrl || ''}
                                onChange={(e) => handleUpdateProperty('linkUrl', e.target.value)}
                                disabled={!selectedObject.linkActive}
                            />
                        </div>
                    </div>

                    {isShapeObject && (
                        <>
                            {selectedObject.type === 'box' && (
                                <Vector3Control
                                    label="Dimensions"
                                    value={selectedObject.boxSize || [1, 1, 1]}
                                    axisLabels={['W', 'H', 'D']}
                                    expressions={[null, null, null]}
                                    onCommit={(nextValues) => handleUpdateProperty('boxSize', nextValues)}
                                />
                            )}
                            {selectedObject.type === 'sphere' && (
                                <div className="prop-row">
                                    <label>Radius</label>
                                    <input
                                        type="number"
                                        step="0.1"
                                        min="0.1"
                                        value={(selectedObject.sphereRadius ?? 0.5)}
                                        onChange={(e) => handleUpdateProperty('sphereRadius', Number(e.target.value))}
                                    />
                                </div>
                            )}
                            {selectedObject.type === 'cone' && (
                                <>
                                    <div className="prop-row">
                                        <label>Radius</label>
                                        <input
                                            type="number"
                                            step="0.1"
                                            min="0.1"
                                            value={(selectedObject.coneRadius ?? 0.5)}
                                            onChange={(e) => handleUpdateProperty('coneRadius', Number(e.target.value))}
                                        />
                                    </div>
                                    <div className="prop-row">
                                        <label>Height</label>
                                        <input
                                            type="number"
                                            step="0.1"
                                            min="0.1"
                                            value={(selectedObject.coneHeight ?? 1.5)}
                                            onChange={(e) => handleUpdateProperty('coneHeight', Number(e.target.value))}
                                        />
                                    </div>
                                </>
                            )}
                            {selectedObject.type === 'cylinder' && (
                                <>
                                    <div className="prop-row">
                                        <label>Top Radius</label>
                                        <input
                                            type="number"
                                            step="0.1"
                                            min="0.1"
                                            value={(selectedObject.cylinderRadiusTop ?? 0.5)}
                                            onChange={(e) => handleUpdateProperty('cylinderRadiusTop', Number(e.target.value))}
                                        />
                                    </div>
                                    <div className="prop-row">
                                        <label>Bottom Radius</label>
                                        <input
                                            type="number"
                                            step="0.1"
                                            min="0.1"
                                            value={(selectedObject.cylinderRadiusBottom ?? 0.5)}
                                            onChange={(e) => handleUpdateProperty('cylinderRadiusBottom', Number(e.target.value))}
                                        />
                                    </div>
                                    <div className="prop-row">
                                        <label>Height</label>
                                        <input
                                            type="number"
                                            step="0.1"
                                            min="0.1"
                                            value={(selectedObject.cylinderHeight ?? 1.5)}
                                            onChange={(e) => handleUpdateProperty('cylinderHeight', Number(e.target.value))}
                                        />
                                    </div>
                                </>
                            )}
                        </>
                    )}

                    {selectedObject.type === 'model' && (
                        <>
                            <div className="prop-row">
                                <label>Apply Color</label>
                                <button
                                    className="toggle-button-small"
                                    onClick={() => handleUpdateProperty('applyModelColor', !selectedObject.applyModelColor)}
                                >
                                    {selectedObject.applyModelColor ? 'On' : 'Off'}
                                </button>
                            </div>
                            <div className="prop-row">
                                <label>Model Color</label>
                                <input
                                    type="color"
                                    value={selectedObject.modelColor || '#ffffff'}
                                    onChange={(e) => handleUpdateProperty('modelColor', e.target.value)}
                                />
                            </div>
                        </>
                    )}

                    {isMediaObject && (
                        <div className="prop-row-stacked media-variant-section">
                            <label>Media Variant</label>
                            {selectedObject?.mediaVariants ? (
                                <>
                                    <div className="media-variant-list">
                                        {mediaVariantOrder.map((variantKey) => {
                                            const variantMeta = selectedObject?.mediaVariants?.[variantKey]
                                            const isSelected = (selectedObject?.selectedVariant || 'original') === variantKey
                                            const fallbackText = variantKey === 'optimized' ? 'Processing...' : 'Not available'
                                            const detailText = variantMeta
                                                ? `${formatBytes(variantMeta.size)} · ${(variantMeta.mimeType || '').split('/').pop() || ''}`.replace(/\s+·\s*$/, '')
                                                : fallbackText
                                            return (
                                                <button
                                                    key={variantKey}
                                                    type="button"
                                                    className={[
                                                        'media-variant-button',
                                                        isSelected ? 'selected' : '',
                                                        !variantMeta ? 'disabled' : ''
                                                    ].filter(Boolean).join(' ')}
                                                    onClick={() => handleSelectMediaVariant(variantKey)}
                                                    disabled={!variantMeta}
                                                >
                                                    <span className="media-variant-title">
                                                        {mediaVariantLabels[variantKey] || variantKey}
                                                    </span>
                                                    <span className="media-variant-meta">
                                                        {detailText || fallbackText}
                                                    </span>
                                                </button>
                                            )
                                        })}
                                    </div>
                                    {!selectedObject.mediaVariants?.optimized && (
                                        <>
                                            <p className="media-variant-hint">
                                                Optimized copies appear once background processing completes via Media Settings.
                                            </p>
                                            {needsManualOptimization && (
                                                <button
                                                    type="button"
                                                    className="media-variant-optimize"
                                                    onClick={handleManualOptimize}
                                                    disabled={isManualOptimizing}
                                                >
                                                    {isManualOptimizing ? 'Optimizing...' : 'Optimize media'}
                                                </button>
                                            )}
                                        </>
                                    )}
                                </>
                            ) : (
                                <>
                                    <p className="media-variant-hint">
                                        Only the original upload is available for this object.
                                    </p>
                                    {needsManualOptimization && (
                                        <button
                                            type="button"
                                            className="media-variant-optimize"
                                            onClick={handleManualOptimize}
                                            disabled={isManualOptimizing}
                                        >
                                            {isManualOptimizing ? 'Optimizing...' : 'Optimize media'}
                                        </button>
                                    )}
                                </>
                            )}
                        </div>
                    )}

                    {isAudioObject && (
                        <>
                            <div className="prop-row-stacked">
                                <label>Audio Preview</label>
                                {audioUrl ? (
                                    <audio
                                        ref={previewAudioRef}
                                        controls
                                        src={audioUrl}
                                        style={{ width: '100%' }}
                                        loop={selectedObject.audioLoop ?? true}
                                        onPlay={() => {
                                            previewPreviousPausedRef.current = selectedObject.audioPaused ?? false
                                            pauseSceneAudio()
                                        }}
                                        onPause={restoreSceneAudio}
                                        onEnded={restoreSceneAudio}
                                    />
                                ) : (
                                    <p className="media-variant-hint">No playable audio available.</p>
                                )}
                            </div>
                            <div className="prop-row">
                                <label>Autoplay</label>
                                <button
                                    className="toggle-button-small"
                                    onClick={() => handleUpdateProperty('audioAutoplay', !selectedObject.audioAutoplay)}
                                >
                                    {selectedObject.audioAutoplay ? 'On' : 'Off'}
                                </button>
                            </div>
                            <div className="prop-row">
                                <label>Loop</label>
                                <button
                                    className="toggle-button-small"
                                    onClick={() => handleUpdateProperty('audioLoop', !selectedObject.audioLoop)}
                                >
                                    {selectedObject.audioLoop ? 'On' : 'Off'}
                                </button>
                            </div>
                            <div className="prop-row">
                                <label>Distance</label>
                                <input
                                    type="range"
                                    min="1"
                                    max="50"
                                    step="1"
                                    value={Number.isFinite(selectedObject.audioDistance) ? selectedObject.audioDistance : 8}
                                    onChange={(e) => handleUpdateProperty('audioDistance', Number(e.target.value))}
                                />
                            </div>
                        </>
                    )}

                    <div className="vector-grid">
                        <Vector3Control
                            label="Position"
                            value={selectedObject.position}
                            expressions={selectedObject.positionExpressions}
                            onCommit={(values, exprs) => handleCommitVector('position', 'positionExpressions', values, exprs)}
                        />
                        <Vector3Control
                            label="Rotation"
                            value={selectedObject.rotation}
                            expressions={selectedObject.rotationExpressions}
                            onCommit={(values, exprs) => handleCommitVector('rotation', 'rotationExpressions', values, exprs)}
                        />
                        <Vector3Control
                            label="Scale"
                            value={selectedObject.scale}
                            expressions={selectedObject.scaleExpressions}
                            onCommit={(values, exprs) => handleCommitVector('scale', 'scaleExpressions', values, exprs)}
                        />
                    </div>

                    {canChangeColor && selectedObject.type !== 'model' && (
                        <div className="prop-row">
                            <label htmlFor="color-picker">Color</label>
                            <input
                                type="color"
                                id="color-picker"
                                value={selectedObject.color}
                                onChange={(e) => handleUpdateColor(e.target.value)}
                            />
                        </div>
                    )}

                    <div className="object-actions">
                        <button className="delete-button" onClick={handleDeleteObject}>
                            Delete
                        </button>
                        <button className="ghost-button" onClick={handleToggleVisibility}>
                            {selectedObject.isVisible ? 'Hide' : 'Show'}
                        </button>
                    </div>
                </div>
            </div>

            <div className={`panel-resizer ${isResizing ? 'resizing' : ''}`} {...resizerProps} />
        </div>
    )
}
