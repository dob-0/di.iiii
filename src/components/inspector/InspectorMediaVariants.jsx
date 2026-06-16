export default function InspectorMediaVariants({
    selectedObject,
    isMediaObject,
    onSelectMediaVariant,
    isManualOptimizing,
    needsManualOptimization,
    onManualOptimize
}) {
    if (!selectedObject || !isMediaObject) return null

    const mediaVariantOrder = ['original', 'optimized']
    const mediaVariantLabels = { original: 'Original', optimized: 'Optimized' }
    const formatBytes = (bytes) => {
        if (!bytes && bytes !== 0) return 'N/A'
        if (bytes < 1024) return `${bytes} B`
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
        return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
    }

    return (
        <div className="prop-row-stacked media-variant-section">
            <div className="prop-label">Media Variant</div>
            {selectedObject?.mediaVariants ? (
                <>
                    <div className="media-variant-list">
                        {mediaVariantOrder.map((variantKey) => {
                            const variantMeta = selectedObject?.mediaVariants?.[variantKey]
                            const isSelected = (selectedObject?.selectedVariant || 'original') === variantKey
                            const fallbackText = variantKey === 'optimized' ? 'Processing...' : 'Not available'
                            const detailText = variantMeta
                                ? `${formatBytes(variantMeta.size)} - ${(variantMeta.mimeType || '').split('/').pop() || ''}`.replace(/\s+-\s*$/, '')
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
                                    onClick={() => onSelectMediaVariant(variantKey)}
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
                                    onClick={onManualOptimize}
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
                            onClick={onManualOptimize}
                            disabled={isManualOptimizing}
                        >
                            {isManualOptimizing ? 'Optimizing...' : 'Optimize media'}
                        </button>
                    )}
                </>
            )}
        </div>
    )
}
