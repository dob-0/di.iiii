import React, { useContext, useId } from 'react'
import { SceneSettingsContext, UiContext } from './contexts/AppContexts.js'
import PanelShell from './components/PanelShell.jsx'

export default function WorldPanel() {
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

    const handleGridInput = (key, value, fallback) => {
        const numeric = Number(value)
        setGridAppearance(prev => ({
            ...prev,
            [key]: Number.isFinite(numeric) ? numeric : (fallback ?? prev[key])
        }))
    }

    const resetToDefaults = () => {
        setBackgroundColor('#f7f6ef')
        setGridSize(20)
        setAmbientLight({ color: '#ffffff', intensity: 0.8 })
        setDirectionalLight({ color: '#ffffff', intensity: 1, position: [10, 10, 5] })
        setGridAppearance({
            cellSize: 0.75,
            cellThickness: 0.2,
            sectionSize: 6,
            sectionThickness: 0.45,
            fadeDistance: 24,
            fadeStrength: 0.7,
            offset: 0.01
        })
    }

    return (
        <PanelShell
            title="World Settings"
            onClose={() => setIsWorldPanelVisible(false)}
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
                    onChange={(e) => handleGridInput('cellSize', e.target.value, 0.75)}
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
                    onChange={(e) => handleGridInput('cellThickness', e.target.value, 0.2)}
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
                    onChange={(e) => handleGridInput('sectionSize', e.target.value, 6)}
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
                    onChange={(e) => handleGridInput('sectionThickness', e.target.value, 0.45)}
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
                    onChange={(e) => handleGridInput('fadeDistance', e.target.value, 24)}
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
                    onChange={(e) => handleGridInput('fadeStrength', e.target.value, 0.7)}
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
                    onChange={(e) => handleGridInput('offset', e.target.value, 0.01)}
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
