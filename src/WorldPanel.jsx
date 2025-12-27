import React, { useContext } from 'react'
import { AppContext } from './AppContext.js' // Import context
import PanelShell from './components/PanelShell.jsx'

export default function WorldPanel() {
    
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
        setGridAppearance,
        setIsWorldPanelVisible 
    } = useContext(AppContext)

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
            dragOptions={{ baseZ: 200 }}
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
                <label>Reset</label>
                <button 
                    className="toggle-button-small"
                    onClick={resetToDefaults}
                    title="Reset all world settings to defaults"
                >
                    Reset to Defaults
                </button>
            </div>
            <div className="prop-row">
                <label>Background</label>
                <input 
                    type="color" 
                    value={backgroundColor}
                    onChange={(e) => setBackgroundColor(e.target.value)}
                />
            </div>
            <div className="prop-row">
                <label>Grid Size</label>
                <input 
                    type="number"
                    min="10"
                    step="10"
                    value={gridSize}
                    onChange={(e) => setGridSize(Number(e.target.value))}
                />
            </div>

            <div className="prop-row two-column">
                <label>Grid Cell Size</label>
                <input
                    type="number"
                    min="0.1"
                    step="0.05"
                    value={gridAppearance.cellSize}
                    onChange={(e) => handleGridInput('cellSize', e.target.value, 0.75)}
                />
            </div>
            <div className="prop-row two-column">
                <label>Grid Thickness</label>
                <input
                    type="number"
                    min="0.05"
                    step="0.05"
                    value={gridAppearance.cellThickness}
                    onChange={(e) => handleGridInput('cellThickness', e.target.value, 0.2)}
                />
            </div>
            <div className="prop-row two-column">
                <label>Grid Section Size</label>
                <input
                    type="number"
                    min="1"
                    step="1"
                    value={gridAppearance.sectionSize}
                    onChange={(e) => handleGridInput('sectionSize', e.target.value, 6)}
                />
            </div>
            <div className="prop-row two-column">
                <label>Section Thickness</label>
                <input
                    type="number"
                    min="0.1"
                    step="0.05"
                    value={gridAppearance.sectionThickness}
                    onChange={(e) => handleGridInput('sectionThickness', e.target.value, 0.45)}
                />
            </div>
            <div className="prop-row two-column">
                <label>Grid Fade Distance</label>
                <input
                    type="number"
                    min="0"
                    step="1"
                    value={gridAppearance.fadeDistance}
                    onChange={(e) => handleGridInput('fadeDistance', e.target.value, 24)}
                />
            </div>
            <div className="prop-row two-column">
                <label>Grid Fade Strength</label>
                <input
                    type="number"
                    min="0"
                    max="1"
                    step="0.05"
                    value={gridAppearance.fadeStrength}
                    onChange={(e) => handleGridInput('fadeStrength', e.target.value, 0.7)}
                />
            </div>
            <div className="prop-row two-column">
                <label>Grid Offset</label>
                <input
                    type="number"
                    min="0"
                    step="0.005"
                    value={gridAppearance.offset}
                    onChange={(e) => handleGridInput('offset', e.target.value, 0.01)}
                />
            </div>

            <div className="prop-row">
                <label>Ambient Color</label>
                <input
                    type="color"
                    value={ambientLight.color}
                    onChange={(e) => setAmbientLight(prev => ({ ...prev, color: e.target.value }))}
                />
            </div>
            <div className="prop-row">
                <label>Ambient Intensity</label>
                <input
                    type="range"
                    min="0"
                    max="2"
                    step="0.05"
                    value={ambientLight.intensity}
                    onChange={(e) => setAmbientLight(prev => ({ ...prev, intensity: Number(e.target.value) }))}
                />
            </div>

            <div className="prop-row">
                <label>Sun Color</label>
                <input
                    type="color"
                    value={directionalLight.color}
                    onChange={(e) => setDirectionalLight(prev => ({ ...prev, color: e.target.value }))}
                />
            </div>
            <div className="prop-row">
                <label>Sun Intensity</label>
                <input
                    type="range"
                    min="0"
                    max="3"
                    step="0.05"
                    value={directionalLight.intensity}
                    onChange={(e) => setDirectionalLight(prev => ({ ...prev, intensity: Number(e.target.value) }))}
                />
            </div>
            <div className="prop-row">
                <label>Sun Height</label>
                <input
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
                <label>Sun Offset</label>
                <input
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
