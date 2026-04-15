import Vector3Control from './Vector3Control.jsx'

export default function InspectorTransformSection({
    selectedObject,
    onCommitPosition,
    onCommitRotation,
    onCommitScale,
    canShowColor,
    onUpdateColor,
    onDelete,
    onToggleVisibility
}) {
    if (!selectedObject) return null

    return (
        <>
            <div className="vector-grid">
                <Vector3Control
                    label="Position"
                    value={selectedObject.position}
                    expressions={selectedObject.positionExpressions}
                    onCommit={onCommitPosition}
                />
                <Vector3Control
                    label="Rotation"
                    value={selectedObject.rotation}
                    expressions={selectedObject.rotationExpressions}
                    onCommit={onCommitRotation}
                />
                <Vector3Control
                    label="Scale"
                    value={selectedObject.scale}
                    expressions={selectedObject.scaleExpressions}
                    onCommit={onCommitScale}
                />
            </div>

            {canShowColor && (
                <div className="prop-row">
                    <label htmlFor="color-picker">Color</label>
                    <input
                        type="color"
                        id="color-picker"
                        value={selectedObject.color}
                        onChange={(e) => onUpdateColor(e.target.value)}
                    />
                </div>
            )}

            <div className="object-actions">
                <button className="delete-button" onClick={onDelete}>
                    Delete
                </button>
                <button className="ghost-button" onClick={onToggleVisibility}>
                    {selectedObject.isVisible ? 'Hide' : 'Show'}
                </button>
            </div>
        </>
    )
}
