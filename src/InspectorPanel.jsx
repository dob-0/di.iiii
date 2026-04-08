import React, { useContext, useEffect, useMemo, useState, useCallback, useRef } from 'react'
import { SceneContext, UiContext, ActionsContext } from './contexts/AppContexts.js'
import { deleteAsset } from './storage/assetStore.js'
import { usePanelDrag } from './hooks/usePanelDrag.js'
import { usePanelResize } from './hooks/usePanelResize.js'
import { useAssetUrl } from './hooks/useAssetUrl.js'
import GizmoModeButtons from './components/inspector/GizmoModeButtons.jsx'
import InspectorBasics from './components/inspector/InspectorBasics.jsx'
import InspectorMediaSection from './components/inspector/InspectorMediaSection.jsx'
import InspectorTransformSection from './components/inspector/InspectorTransformSection.jsx'

export default function InspectorPanel({ onClose, surfaceMode = 'floating' }) {
    const { selectedObjectId, objects, setObjects, clearSelection } = useContext(SceneContext)
    const { gizmoMode, setGizmoMode } = useContext(UiContext)
    const { requestManualMediaOptimization } = useContext(ActionsContext)
    const isSheetMode = surfaceMode === 'sheet'
    const isDockMode = surfaceMode === 'dock'
    const isEmbeddedMode = isSheetMode || isDockMode

    const dragState = usePanelDrag({ x: 16, y: 120 }, { baseZ: 100 })
    const resizeState = usePanelResize(320, {
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

    const handleCommitPosition = useCallback(
        (values, exprs) => handleCommitVector('position', 'positionExpressions', values, exprs),
        [handleCommitVector]
    )
    const handleCommitRotation = useCallback(
        (values, exprs) => handleCommitVector('rotation', 'rotationExpressions', values, exprs),
        [handleCommitVector]
    )
    const handleCommitScale = useCallback(
        (values, exprs) => handleCommitVector('scale', 'scaleExpressions', values, exprs),
        [handleCommitVector]
    )
    const canShowColor = canChangeColor && selectedObject?.type !== 'model'

    if (!selectedObject) {
        return null
    }

    return (
        <div
            ref={isEmbeddedMode ? undefined : dragState.panelRef}
            style={isEmbeddedMode ? undefined : { ...dragState.dragStyle, width: resizeState.width, height: resizeState.height }}
            className={['floating-panel', 'inspector-panel', isSheetMode ? 'sheet-panel' : (isDockMode ? 'dock-panel' : 'draggable-panel')].join(' ')}
            {...(isEmbeddedMode ? {} : dragState.panelPointerProps)}
        >
            <div className={`panel-header ${isSheetMode ? 'sheet-panel-header' : (isDockMode ? 'dock-panel-header' : `draggable-header ${dragState.isDragging ? 'dragging' : ''}`)}`.trim()} {...(isEmbeddedMode ? {} : dragState.dragProps)}>
                <h3>Inspector</h3>
                <button className="close-button" onClick={onClose}>×</button>
            </div>

            <div className="panel-content gizmo-controls">
                <GizmoModeButtons gizmoMode={gizmoMode} setGizmoMode={setGizmoMode} />

                <div className="gizmo-section">
                    <InspectorBasics
                        selectedObject={selectedObject}
                        objectType={objectType}
                        isTextObject={isTextObject}
                        isShapeObject={isShapeObject}
                        onUpdateProperty={handleUpdateProperty}
                    />

                    <InspectorMediaSection
                        selectedObject={selectedObject}
                        isMediaObject={isMediaObject}
                        isAudioObject={isAudioObject}
                        audioUrl={audioUrl}
                        previewAudioRef={previewAudioRef}
                        onPreviewPlay={() => {
                            previewPreviousPausedRef.current = selectedObject.audioPaused ?? false
                            pauseSceneAudio()
                        }}
                        onPreviewStop={restoreSceneAudio}
                        onUpdateProperty={handleUpdateProperty}
                        onSelectMediaVariant={handleSelectMediaVariant}
                        isManualOptimizing={isManualOptimizing}
                        needsManualOptimization={needsManualOptimization}
                        onManualOptimize={handleManualOptimize}
                    />

                    <InspectorTransformSection
                        selectedObject={selectedObject}
                        onCommitPosition={handleCommitPosition}
                        onCommitRotation={handleCommitRotation}
                        onCommitScale={handleCommitScale}
                        canShowColor={canShowColor}
                        onUpdateColor={handleUpdateColor}
                        onDelete={handleDeleteObject}
                        onToggleVisibility={handleToggleVisibility}
                    />
                </div>
            </div>

            {!isEmbeddedMode && <div className={`panel-resizer ${resizeState.isResizing ? 'resizing' : ''}`} {...resizeState.resizerProps} />}
        </div>
    )
}
