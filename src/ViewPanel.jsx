import React, { useContext } from 'react'
import { AppContext } from './AppContext.js'
import { usePanelDrag } from './hooks/usePanelDrag.js'
import { usePanelResize } from './hooks/usePanelResize.js'
import './ViewPanel.css'

export default function ViewPanel() {

    const {
        setIsViewPanelVisible,
        controlsRef,
        isGridVisible,
        setIsGridVisible,
        isGizmoVisible,
        setIsGizmoVisible,
        default3DView,
        handleSaveView,
        handleFrameAll,
        cameraSettings,
        setCameraSettings,
        renderSettings,
        setRenderSettings
    } = useContext(AppContext)


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
                    <label>Reset</label>
                    <button 
                        className="toggle-button-small" 
                        onClick={resetRenderToDefaults}
                        title="Reset view and render settings to defaults"
                    >
                        Reset to Defaults
                    </button>
                </div>

                <div className="prop-row">
                    <label>View</label>
                    <button className="toggle-button-small" onClick={handleFrameAll}>
                        Frame All
                    </button>
                </div>

                <div className="prop-row">
                    <label>Default 3D</label>
                    <button className="toggle-button-small" onClick={handleSaveView}>
                        Save Current View
                    </button>
                </div>
                
                <div className="prop-row">
                    <label>Show Gizmo</label>
                    <button 
                        className="toggle-button-small" 
                        onClick={() => setIsGizmoVisible(prev => !prev)}
                    >
                        {isGizmoVisible ? 'On' : 'Off'}
                    </button>
                </div>
                <div className="prop-row">
                    <label>Show Grid</label>
                    <button 
                        className="toggle-button-small" 
                        onClick={() => setIsGridVisible(prev => !prev)}
                    >
                        {isGridVisible ? 'On' : 'Off'}
                    </button>
                </div>

                <div className="prop-row">
                    <label>FOV</label>
                    <input
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
                    <label>Near/Far</label>
                    <input
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

                <label className="prop-label-stacked">Rendering</label>
                <div className="prop-row">
                    <label>Shadows</label>
                    <button
                        className="toggle-button-small"
                        onClick={() => setRenderSettings(prev => ({ ...prev, shadows: !prev.shadows }))}
                    >
                        {renderSettings.shadows ? 'On' : 'Off'}
                    </button>
                </div>

                <div className="prop-row">
                    <label>Antialias</label>
                    <button
                        className="toggle-button-small"
                        onClick={() => setRenderSettings(prev => ({ ...prev, antialias: !prev.antialias }))}
                    >
                        {renderSettings.antialias ? 'On' : 'Off'}
                    </button>
                </div>

                <div className="prop-row">
                    <label>Tone Mapping</label>
                    <select
                        value={renderSettings.toneMapping}
                        onChange={(e) => setRenderSettings(prev => ({ ...prev, toneMapping: e.target.value }))}
                    >
                        <option value="ACESFilmic">ACES Filmic</option>
                        <option value="None">None</option>
                    </select>
                </div>

                <div className="prop-row">
                    <label>Exposure</label>
                    <input
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
                    <label>DPR</label>
                    <select
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

                <label className="prop-label-stacked">Preset Views</label>
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
