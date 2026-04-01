import React, { useContext, useId } from 'react'
import { UiContext, SceneSettingsContext, ActionsContext, RefsContext } from './contexts/AppContexts.js'
import { usePanelDrag } from './hooks/usePanelDrag.js'
import { usePanelResize } from './hooks/usePanelResize.js'
import './ViewPanel.css'

export default function ViewPanel() {
    const fieldPrefix = useId()

    const { setIsViewPanelVisible, isGridVisible, setIsGridVisible, isGizmoVisible, setIsGizmoVisible } = useContext(UiContext)
    const { default3DView, cameraSettings, setCameraSettings, renderSettings, setRenderSettings } = useContext(SceneSettingsContext)
    const { handleSaveView, handleFrameAll } = useContext(ActionsContext)
    const { controlsRef } = useContext(RefsContext)


    const setCameraView = (pos, target) => {
        if (!controlsRef.current) return;
        
        controlsRef.current.object.position.set(pos[0], pos[1], pos[2]);
        controlsRef.current.target.set(target[0], target[1], target[2]);
        controlsRef.current.update();
    };

    const resetRenderToDefaults = () => {
        setCameraSettings({
            orthographic: false,
            position: [0, 1.6, 4],
            fov: 60,
            near: 0.1,
            far: 200
        })
        setRenderSettings({
            dpr: [1, 2],
            shadows: true,
            antialias: true,
            toneMapping: 'ACESFilmic',
            toneMappingExposure: 1,
            powerPreference: 'high-performance'
        })
        setIsGridVisible(true)
        setIsGizmoVisible(true)
    };

    const setTopView = () => {
        setCameraView([0, 10, 0], [0, 0, 0]);
    };
    
    const setDefault3DView = () => {
        setCameraView(default3DView.position, default3DView.target);
    };

    const setFrontView = () => {
        setCameraView([0, 0, 10], [0, 0, 0]);
    };

    const setBackView = () => {
        setCameraView([0, 0, -10], [0, 0, 0]);
    };
    
    const setSideView = () => {
        setCameraView([10, 0, 0], [0, 0, 0]);
    };

    const setLeftView = () => {
        setCameraView([-10, 0, 0], [0, 0, 0]);
    };


    const { panelRef, dragProps, dragStyle, isDragging, panelPointerProps } = usePanelDrag({ x: 360, y: 120 }, { baseZ: 100 })
    const { width, height, resizerProps, isResizing } = usePanelResize(320, {
        min: 280,
        max: 640,
        minHeight: 260,
        maxHeight: 900,
        initialHeight: 400
    })

    return (
        <div
            ref={panelRef}
            style={{ ...dragStyle, width, height }}
            className="view-panel floating-panel draggable-panel"
            {...panelPointerProps}
        >
            <div className={`panel-header draggable-header ${isDragging ? 'dragging' : ''}`} {...dragProps}>
                <h3>View Settings</h3>
                <button className="close-button" onClick={() => setIsViewPanelVisible(false)}>×</button>
            </div>
            
            <div className="panel-content">
                
                <div className="prop-row">
                    <label htmlFor={`${fieldPrefix}-reset`}>Reset</label>
                    <button 
                        id={`${fieldPrefix}-reset`}
                        className="toggle-button-small" 
                        onClick={resetRenderToDefaults}
                        title="Reset view and render settings to defaults"
                    >
                        Reset to Defaults
                    </button>
                </div>

                <div className="prop-row">
                    <label htmlFor={`${fieldPrefix}-frame-all`}>View</label>
                    <button
                        id={`${fieldPrefix}-frame-all`}
                        className="toggle-button-small"
                        onClick={handleFrameAll}
                    >
                        Frame All
                    </button>
                </div>

                <div className="prop-row">
                    <label htmlFor={`${fieldPrefix}-save-view`}>Default 3D</label>
                    <button
                        id={`${fieldPrefix}-save-view`}
                        className="toggle-button-small"
                        onClick={handleSaveView}
                    >
                        Save Current View
                    </button>
                </div>
                
                <div className="prop-row">
                    <label htmlFor={`${fieldPrefix}-show-gizmo`}>Show Gizmo</label>
                    <button 
                        id={`${fieldPrefix}-show-gizmo`}
                        className="toggle-button-small" 
                        aria-label="Toggle gizmo visibility"
                        aria-pressed={isGizmoVisible}
                        onClick={() => setIsGizmoVisible(prev => !prev)}
                    >
                        {isGizmoVisible ? 'On' : 'Off'}
                    </button>
                </div>
                <div className="prop-row">
                    <label htmlFor={`${fieldPrefix}-show-grid`}>Show Grid</label>
                    <button 
                        id={`${fieldPrefix}-show-grid`}
                        className="toggle-button-small" 
                        aria-label="Toggle grid visibility"
                        aria-pressed={isGridVisible}
                        onClick={() => setIsGridVisible(prev => !prev)}
                    >
                        {isGridVisible ? 'On' : 'Off'}
                    </button>
                </div>

                <div className="prop-row">
                    <label htmlFor={`${fieldPrefix}-fov`}>FOV</label>
                    <input
                        id={`${fieldPrefix}-fov`}
                        type="range"
                        min="20"
                        max="100"
                        step="1"
                        value={cameraSettings.fov}
                        onChange={(e) => {
                            const next = Number(e.target.value) || cameraSettings.fov
                            setCameraSettings(prev => {
                                const merged = { ...prev, fov: next }
                                if (controlsRef.current?.object) {
                                    controlsRef.current.object.fov = merged.fov
                                    controlsRef.current.object.updateProjectionMatrix?.()
                                }
                                return merged
                            })
                        }}
                    />
                    <span className="prop-value">{Math.round(cameraSettings.fov)}°</span>
                </div>

                <div className="prop-row">
                    <span className="prop-label">Near/Far</span>
                    <input
                        aria-label="Near clipping plane"
                        type="number"
                        className="inline-input"
                        min="0.01"
                        step="0.01"
                        value={cameraSettings.near}
                        onChange={(e) => {
                            const next = Math.max(0.01, Number(e.target.value) || cameraSettings.near)
                            setCameraSettings(prev => {
                                const merged = { ...prev, near: next }
                                if (controlsRef.current?.object) {
                                    controlsRef.current.object.near = merged.near
                                    controlsRef.current.object.updateProjectionMatrix?.()
                                }
                                return merged
                            })
                        }}
                    />
                    <input
                        aria-label="Far clipping plane"
                        type="number"
                        className="inline-input"
                        min="10"
                        step="1"
                        value={cameraSettings.far}
                        onChange={(e) => {
                            const next = Math.max(1, Number(e.target.value) || cameraSettings.far)
                            setCameraSettings(prev => {
                                const merged = { ...prev, far: next }
                                if (controlsRef.current?.object) {
                                    controlsRef.current.object.far = merged.far
                                    controlsRef.current.object.updateProjectionMatrix?.()
                                }
                                return merged
                            })
                        }}
                    />
                </div>

                <div className="prop-label-stacked">Rendering</div>
                <div className="prop-row">
                    <label htmlFor={`${fieldPrefix}-shadows`}>Shadows</label>
                    <button
                        id={`${fieldPrefix}-shadows`}
                        className="toggle-button-small"
                        aria-label="Toggle scene shadows"
                        aria-pressed={renderSettings.shadows}
                        onClick={() => setRenderSettings(prev => ({ ...prev, shadows: !prev.shadows }))}
                    >
                        {renderSettings.shadows ? 'On' : 'Off'}
                    </button>
                </div>

                <div className="prop-row">
                    <label htmlFor={`${fieldPrefix}-antialias`}>Antialias</label>
                    <button
                        id={`${fieldPrefix}-antialias`}
                        className="toggle-button-small"
                        aria-label="Toggle antialiasing"
                        aria-pressed={renderSettings.antialias}
                        onClick={() => setRenderSettings(prev => ({ ...prev, antialias: !prev.antialias }))}
                    >
                        {renderSettings.antialias ? 'On' : 'Off'}
                    </button>
                </div>

                <div className="prop-row">
                    <label htmlFor={`${fieldPrefix}-tone-mapping`}>Tone Mapping</label>
                    <select
                        id={`${fieldPrefix}-tone-mapping`}
                        value={renderSettings.toneMapping}
                        onChange={(e) => setRenderSettings(prev => ({ ...prev, toneMapping: e.target.value }))}
                    >
                        <option value="ACESFilmic">ACES Filmic</option>
                        <option value="None">None</option>
                    </select>
                </div>

                <div className="prop-row">
                    <label htmlFor={`${fieldPrefix}-exposure`}>Exposure</label>
                    <input
                        id={`${fieldPrefix}-exposure`}
                        type="range"
                        min="0.1"
                        max="2"
                        step="0.05"
                        value={renderSettings.toneMappingExposure}
                        onChange={(e) => setRenderSettings(prev => ({
                            ...prev,
                            toneMappingExposure: Number(e.target.value) || prev.toneMappingExposure
                        }))}
                    />
                    <span className="prop-value">{renderSettings.toneMappingExposure.toFixed(2)}</span>
                </div>

                <div className="prop-row">
                    <label htmlFor={`${fieldPrefix}-dpr`}>DPR</label>
                    <select
                        id={`${fieldPrefix}-dpr`}
                        value={Array.isArray(renderSettings.dpr) ? renderSettings.dpr.join('-') : String(renderSettings.dpr)}
                        onChange={(e) => {
                            const value = e.target.value
                            if (value === 'auto') {
                                setRenderSettings(prev => ({ ...prev, dpr: [1, 2] }))
                            } else {
                                const num = Number(value) || 1
                                setRenderSettings(prev => ({ ...prev, dpr: num }))
                            }
                        }}
                    >
                        <option value="auto">Auto (1-2)</option>
                        <option value="1">1</option>
                        <option value="1.5">1.5</option>
                        <option value="2">2</option>
                    </select>
                </div>

                <div className="prop-label-stacked">Preset Views</div>
                <div className="view-preset-grid">
                    <button className="toggle-button-small" onClick={setLeftView}>Left</button>
                    <button className="toggle-button-small" onClick={setDefault3DView}>3D</button> 
                    <button className="toggle-button-small" onClick={setSideView}>Right</button>
                    
                    <button className="toggle-button-small" onClick={setFrontView}>Front</button>
                    <button className="toggle-button-small" onClick={setTopView}>Top</button>
                    <button className="toggle-button-small" onClick={setBackView}>Back</button>
                </div>
            </div>
            <div className={`panel-resizer ${isResizing ? 'resizing' : ''}`} {...resizerProps} />
        </div>
    );
}
