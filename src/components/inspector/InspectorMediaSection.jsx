import InspectorAudioControls from './InspectorAudioControls.jsx'
import InspectorMediaVariants from './InspectorMediaVariants.jsx'

export default function InspectorMediaSection({
    selectedObject,
    isMediaObject,
    isAudioObject,
    audioUrl,
    previewAudioRef,
    onPreviewPlay,
    onPreviewStop,
    onUpdateProperty,
    onSelectMediaVariant,
    isManualOptimizing,
    needsManualOptimization,
    onManualOptimize
}) {
    if (!selectedObject || (!isMediaObject && !isAudioObject)) return null

    return (
        <>
            <InspectorMediaVariants
                selectedObject={selectedObject}
                isMediaObject={isMediaObject}
                onSelectMediaVariant={onSelectMediaVariant}
                isManualOptimizing={isManualOptimizing}
                needsManualOptimization={needsManualOptimization}
                onManualOptimize={onManualOptimize}
            />
            <InspectorAudioControls
                selectedObject={selectedObject}
                isAudioObject={isAudioObject}
                audioUrl={audioUrl}
                previewAudioRef={previewAudioRef}
                onPreviewPlay={onPreviewPlay}
                onPreviewStop={onPreviewStop}
                onUpdateProperty={onUpdateProperty}
            />
        </>
    )
}
