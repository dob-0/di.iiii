import React, { useContext, useId } from 'react'
import { SceneSettingsContext, UiContext } from './contexts/AppContexts.js'
import PanelShell from './components/PanelShell.jsx'
import { defaultGridAppearance, defaultScene } from './state/sceneStore.js'

export default function WorldPanel({ onClose, surfaceMode = 'floating' }) {
    const fieldPrefix = useId()
    
    // --- Get what we need from context ---
    const {
        backgroundColor,
        setBackgroundColor,
        gridSize,
        setGridSize,
        ambientLight,
        setAmbientLight,
        directionalLight,
        setDirectionalLight,
        gridAppearance,
        setGridAppearance
    } = useContext(SceneSettingsContext)
    const { setIsWorldPanelVisible } = useContext(UiContext)
    const closePanel = onClose || (() => setIsWorldPanelVisible(false))

    const handleGridInput = (key, value, fallback) => {
        const numeric = Number(value)
        setGridAppearance(prev => ({
            ...prev,
            [key]: Number.isFinite(numeric) ? numeric : (fallback ?? prev[key])
        }))
    }

    const resetToDefaults = () => {
        setBackgroundColor(defaultScene.backgroundColor)
        setGridSize(defaultScene.gridSize)
        setAmbientLight(defaultScene.ambientLight)
        setDirectionalLight(defaultScene.directionalLight)
        setGridAppearance(defaultGridAppearance)
    }

    return (
        <PanelShell
            title="World Settings"
            onClose={closePanel}
            surfaceMode={surfaceMode}
            initialPosition={{ x: 704, y: 120 }}
            dragOptions={{ baseZ: 100 }}
            sizeOptions={{
                initialWidth: 320,
                min: 280,
                max: 640,
                minHeight: 260,
                maxHeight: 900,
                initialHeight: 400
            }}
            className="world-panel"
        >
            <div className="prop-row">
                <label htmlFor={`${fieldPrefix}-reset`}>Reset</label>
                <button 
                    id={`${fieldPrefix}-reset`}
                    className="toggle-button-small"
                    onClick={resetToDefaults}
                    title="Reset all world settings to defaults"
                >
                    Reset to Defaults
                </button>
            </div>
            <div className="prop-row">
                <label htmlFor={`${fieldPrefix}-background`}>Background</label>
                <input 
                    id={`${fieldPrefix}-background`}
                    type="color" 
                    value={backgroundColor}
                    onChange={(e) => setBackgroundColor(e.target.value)}
                />
            </div>
            <div className="prop-row">
                <label htmlFor={`${fieldPrefix}-grid-size`}>Grid Size</label>
                <input 
                    id={`${fieldPrefix}-grid-size`}
                    type="number"
                    min="10"
                    step="10"
                    value={gridSize}
                    onChange={(e) => setGridSize(Number(e.target.value))}
                />
            </div>

            <div className="prop-row two-column">
                <label htmlFor={`${fieldPrefix}-grid-cell-size`}>Grid Cell Size</label>
                <input
                    id={`${fieldPrefix}-grid-cell-size`}
                    type="number"
                    min="0.1"
                    step="0.05"
                    value={gridAppearance.cellSize}
                    onChange={(e) => handleGridInput('cellSize', e.target.value, defaultGridAppearance.cellSize)}
                />
            </div>
            <div className="prop-row two-column">
                <label htmlFor={`${fieldPrefix}-grid-thickness`}>Grid Thickness</label>
                <input
                    id={`${fieldPrefix}-grid-thickness`}
                    type="number"
                    min="0.05"
                    step="0.05"
                    value={gridAppearance.cellThickness}
                    onChange={(e) => handleGridInput('cellThickness', e.target.value, defaultGridAppearance.cellThickness)}
                />
            </div>
            <div className="prop-row two-column">
                <label htmlFor={`${fieldPrefix}-grid-section-size`}>Grid Section Size</label>
                <input
                    id={`${fieldPrefix}-grid-section-size`}
                    type="number"
                    min="1"
                    step="1"
                    value={gridAppearance.sectionSize}
                    onChange={(e) => handleGridInput('sectionSize', e.target.value, defaultGridAppearance.sectionSize)}
                />
            </div>
            <div className="prop-row two-column">
                <label htmlFor={`${fieldPrefix}-section-thickness`}>Section Thickness</label>
                <input
                    id={`${fieldPrefix}-section-thickness`}
                    type="number"
                    min="0.1"
                    step="0.05"
                    value={gridAppearance.sectionThickness}
                    onChange={(e) => handleGridInput('sectionThickness', e.target.value, defaultGridAppearance.sectionThickness)}
                />
            </div>
            <div className="prop-row two-column">
                <label htmlFor={`${fieldPrefix}-grid-fade-distance`}>Grid Fade Distance</label>
                <input
                    id={`${fieldPrefix}-grid-fade-distance`}
                    type="number"
                    min="0"
                    step="1"
                    value={gridAppearance.fadeDistance}
                    onChange={(e) => handleGridInput('fadeDistance', e.target.value, defaultGridAppearance.fadeDistance)}
                />
            </div>
            <div className="prop-row two-column">
                <label htmlFor={`${fieldPrefix}-grid-fade-strength`}>Grid Fade Strength</label>
                <input
                    id={`${fieldPrefix}-grid-fade-strength`}
                    type="number"
                    min="0"
                    max="1"
                    step="0.05"
                    value={gridAppearance.fadeStrength}
                    onChange={(e) => handleGridInput('fadeStrength', e.target.value, defaultGridAppearance.fadeStrength)}
                />
            </div>
            <div className="prop-row two-column">
                <label htmlFor={`${fieldPrefix}-grid-offset`}>Grid Offset</label>
                <input
                    id={`${fieldPrefix}-grid-offset`}
                    type="number"
                    min="0"
                    step="0.005"
                    value={gridAppearance.offset}
                    onChange={(e) => handleGridInput('offset', e.target.value, defaultGridAppearance.offset)}
                />
            </div>

            <div className="prop-row">
                <label htmlFor={`${fieldPrefix}-ambient-color`}>Ambient Color</label>
                <input
                    id={`${fieldPrefix}-ambient-color`}
                    type="color"
                    value={ambientLight.color}
                    onChange={(e) => setAmbientLight(prev => ({ ...prev, color: e.target.value }))}
                />
            </div>
            <div className="prop-row">
                <label htmlFor={`${fieldPrefix}-ambient-intensity`}>Ambient Intensity</label>
                <input
                    id={`${fieldPrefix}-ambient-intensity`}
                    type="range"
                    min="0"
                    max="2"
                    step="0.05"
                    value={ambientLight.intensity}
                    onChange={(e) => setAmbientLight(prev => ({ ...prev, intensity: Number(e.target.value) }))}
                />
            </div>

            <div className="prop-row">
                <label htmlFor={`${fieldPrefix}-sun-color`}>Sun Color</label>
                <input
                    id={`${fieldPrefix}-sun-color`}
                    type="color"
                    value={directionalLight.color}
                    onChange={(e) => setDirectionalLight(prev => ({ ...prev, color: e.target.value }))}
                />
            </div>
            <div className="prop-row">
                <label htmlFor={`${fieldPrefix}-sun-intensity`}>Sun Intensity</label>
                <input
                    id={`${fieldPrefix}-sun-intensity`}
                    type="range"
                    min="0"
                    max="3"
                    step="0.05"
                    value={directionalLight.intensity}
                    onChange={(e) => setDirectionalLight(prev => ({ ...prev, intensity: Number(e.target.value) }))}
                />
            </div>
            <div className="prop-row">
                <label htmlFor={`${fieldPrefix}-sun-height`}>Sun Height</label>
                <input
                    id={`${fieldPrefix}-sun-height`}
                    type="range"
                    min="-20"
                    max="20"
                    step="0.5"
                    value={directionalLight.position[1]}
                    onChange={(e) => setDirectionalLight(prev => ({
                        ...prev,
                        position: [prev.position[0], Number(e.target.value), prev.position[2]]
                    }))}
                />
            </div>
            <div className="prop-row">
                <label htmlFor={`${fieldPrefix}-sun-offset`}>Sun Offset</label>
                <input
                    id={`${fieldPrefix}-sun-offset`}
                    type="range"
                    min="-20"
                    max="20"
                    step="0.5"
                    value={directionalLight.position[0]}
                    onChange={(e) => setDirectionalLight(prev => ({
                        ...prev,
                        position: [Number(e.target.value), prev.position[1], prev.position[2]]
                    }))}
                />
            </div>
        </PanelShell>
    )
}
