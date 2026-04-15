import { useId } from 'react'
import Vector3Control from './Vector3Control.jsx'

export default function InspectorBasics({
    selectedObject,
    objectType,
    isTextObject,
    isShapeObject,
    onUpdateProperty
}) {
    const fieldPrefix = useId()
    if (!selectedObject) return null

    return (
        <>
            {isTextObject && (
                <div className="prop-row-stacked">
                    <label htmlFor={`${fieldPrefix}-text`}>Text</label>
                    <textarea
                        id={`${fieldPrefix}-text`}
                        className="text-input"
                        value={selectedObject.data}
                        onChange={(e) => onUpdateProperty('data', e.target.value)}
                    />
                </div>
            )}

            <div className="prop-row-stacked">
                <div className="prop-row link-row">
                    <label htmlFor={`${fieldPrefix}-link-url`}>Link</label>
                    <button
                        id={`${fieldPrefix}-link-toggle`}
                        className="toggle-button-small"
                        aria-label="Toggle link"
                        aria-pressed={Boolean(selectedObject.linkActive)}
                        onClick={() => onUpdateProperty('linkActive', !selectedObject.linkActive)}
                    >
                        {selectedObject.linkActive ? 'On' : 'Off'}
                    </button>
                    <input
                        id={`${fieldPrefix}-link-url`}
                        type="url"
                        className="text-input"
                        placeholder="https://example.com"
                        value={selectedObject.linkUrl || ''}
                        onChange={(e) => onUpdateProperty('linkUrl', e.target.value)}
                        disabled={!selectedObject.linkActive}
                    />
                </div>
            </div>

            {isShapeObject && (
                <>
                    {objectType === 'box' && (
                        <Vector3Control
                            label="Dimensions"
                            value={selectedObject.boxSize || [1, 1, 1]}
                            axisLabels={['W', 'H', 'D']}
                            expressions={[null, null, null]}
                            onCommit={(nextValues) => onUpdateProperty('boxSize', nextValues)}
                        />
                    )}
                    {objectType === 'sphere' && (
                        <div className="prop-row">
                            <label htmlFor={`${fieldPrefix}-sphere-radius`}>Radius</label>
                            <input
                                id={`${fieldPrefix}-sphere-radius`}
                                type="number"
                                step="0.1"
                                min="0.1"
                                value={(selectedObject.sphereRadius ?? 0.5)}
                                onChange={(e) => onUpdateProperty('sphereRadius', Number(e.target.value))}
                            />
                        </div>
                    )}
                    {objectType === 'cone' && (
                        <>
                            <div className="prop-row">
                                <label htmlFor={`${fieldPrefix}-cone-radius`}>Radius</label>
                                <input
                                    id={`${fieldPrefix}-cone-radius`}
                                    type="number"
                                    step="0.1"
                                    min="0.1"
                                    value={(selectedObject.coneRadius ?? 0.5)}
                                    onChange={(e) => onUpdateProperty('coneRadius', Number(e.target.value))}
                                />
                            </div>
                            <div className="prop-row">
                                <label htmlFor={`${fieldPrefix}-cone-height`}>Height</label>
                                <input
                                    id={`${fieldPrefix}-cone-height`}
                                    type="number"
                                    step="0.1"
                                    min="0.1"
                                    value={(selectedObject.coneHeight ?? 1.5)}
                                    onChange={(e) => onUpdateProperty('coneHeight', Number(e.target.value))}
                                />
                            </div>
                        </>
                    )}
                    {objectType === 'cylinder' && (
                        <>
                            <div className="prop-row">
                                <label htmlFor={`${fieldPrefix}-cylinder-radius-top`}>Top Radius</label>
                                <input
                                    id={`${fieldPrefix}-cylinder-radius-top`}
                                    type="number"
                                    step="0.1"
                                    min="0.1"
                                    value={(selectedObject.cylinderRadiusTop ?? 0.5)}
                                    onChange={(e) => onUpdateProperty('cylinderRadiusTop', Number(e.target.value))}
                                />
                            </div>
                            <div className="prop-row">
                                <label htmlFor={`${fieldPrefix}-cylinder-radius-bottom`}>Bottom Radius</label>
                                <input
                                    id={`${fieldPrefix}-cylinder-radius-bottom`}
                                    type="number"
                                    step="0.1"
                                    min="0.1"
                                    value={(selectedObject.cylinderRadiusBottom ?? 0.5)}
                                    onChange={(e) => onUpdateProperty('cylinderRadiusBottom', Number(e.target.value))}
                                />
                            </div>
                            <div className="prop-row">
                                <label htmlFor={`${fieldPrefix}-cylinder-height`}>Height</label>
                                <input
                                    id={`${fieldPrefix}-cylinder-height`}
                                    type="number"
                                    step="0.1"
                                    min="0.1"
                                    value={(selectedObject.cylinderHeight ?? 1.5)}
                                    onChange={(e) => onUpdateProperty('cylinderHeight', Number(e.target.value))}
                                />
                            </div>
                        </>
                    )}
                </>
            )}

            {selectedObject.type === 'model' && (
                <>
                    <div className="prop-row">
                        <label htmlFor={`${fieldPrefix}-apply-model-color`}>Apply Color</label>
                        <button
                            id={`${fieldPrefix}-apply-model-color`}
                            className="toggle-button-small"
                            aria-label="Toggle model color override"
                            aria-pressed={Boolean(selectedObject.applyModelColor)}
                            onClick={() => onUpdateProperty('applyModelColor', !selectedObject.applyModelColor)}
                        >
                            {selectedObject.applyModelColor ? 'On' : 'Off'}
                        </button>
                    </div>
                    <div className="prop-row">
                        <label htmlFor={`${fieldPrefix}-model-color`}>Model Color</label>
                        <input
                            id={`${fieldPrefix}-model-color`}
                            type="color"
                            value={selectedObject.modelColor || '#ffffff'}
                            onChange={(e) => onUpdateProperty('modelColor', e.target.value)}
                        />
                    </div>
                </>
            )}
        </>
    )
}
