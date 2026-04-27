import React, { useContext, useId, useRef } from 'react'
import { UiContext, SceneSettingsContext, ActionsContext, RefsContext } from './contexts/AppContexts.js'
import { usePanelDrag } from './hooks/usePanelDrag.js'
import { usePanelResize } from './hooks/usePanelResize.js'
import { defaultPresentation } from './shared/sceneSchema.js'
import {
    defaultPresentationTemplate,
    getPresentationTemplateById,
    presentationStarterTemplates
} from './utils/presentationTemplates.js'
import './ViewPanel.css'

export default function ViewPanel({ onClose, surfaceMode = 'floating' }) {
    const fieldPrefix = useId()
    const htmlFileInputRef = useRef(null)
    const isSheetMode = surfaceMode === 'sheet'
    const isDockMode = surfaceMode === 'dock'
    const isEmbeddedMode = isSheetMode || isDockMode

    const { setIsViewPanelVisible, isGridVisible, setIsGridVisible, isGizmoVisible, setIsGizmoVisible } = useContext(UiContext)
    const {
        default3DView,
        cameraPosition,
        setCameraPosition,
        cameraTarget,
        setCameraTarget,
        cameraSettings,
        setCameraSettings,
        renderSettings,
        setRenderSettings,
        presentationMode,
        setPresentationMode,
        presentationSourceType,
        setPresentationSourceType,
        presentationUrl,
        setPresentationUrl,
        presentationHtml,
        setPresentationHtml,
        presentationFixedCamera,
        setPresentationFixedCamera
    } = useContext(SceneSettingsContext)
    const { handleSaveView, handleFrameAll } = useContext(ActionsContext)
    const { controlsRef } = useContext(RefsContext)

    const setEditorCameraView = (pos, target) => {
        setCameraPosition?.(pos)
        setCameraTarget?.(target)
        if (!controlsRef.current) return
        controlsRef.current.object.position.set(pos[0], pos[1], pos[2])
        controlsRef.current.target.set(target[0], target[1], target[2])
        controlsRef.current.update()
    }

    const updateFixedCamera = (nextValue) => {
        setPresentationFixedCamera((prev) => ({
            ...prev,
            ...(typeof nextValue === 'function' ? nextValue(prev) : nextValue),
            locked: true
        }))
    }

    const setFixedCameraView = (pos, target) => {
        setPresentationMode('fixed-camera')
        updateFixedCamera({
            position: pos,
            target
        })
    }

    const readCurrentCameraSnapshot = () => {
        const camera = controlsRef.current?.object
        const nextPosition = camera?.position?.toArray?.() || cameraPosition || presentationFixedCamera.position
        const nextTarget = controlsRef.current?.target?.toArray?.() || cameraTarget || presentationFixedCamera.target
        return {
            projection: camera?.isOrthographicCamera || cameraSettings?.orthographic ? 'orthographic' : 'perspective',
            position: nextPosition,
            target: nextTarget,
            fov: Number.isFinite(camera?.fov) ? camera.fov : presentationFixedCamera.fov,
            zoom: Number.isFinite(camera?.zoom) ? camera.zoom : presentationFixedCamera.zoom,
            near: Number.isFinite(camera?.near) ? camera.near : presentationFixedCamera.near,
            far: Number.isFinite(camera?.far) ? camera.far : presentationFixedCamera.far,
            locked: true
        }
    }

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
        setPresentationFixedCamera(defaultPresentation.fixedCamera)
        setIsGridVisible(true)
        setIsGizmoVisible(true)
    }

    const setTopView = () => {
        setEditorCameraView([0, 10, 0], [0, 0, 0])
    }

    const setDefault3DView = () => {
        setEditorCameraView(default3DView.position, default3DView.target)
    }

    const setFrontView = () => {
        setEditorCameraView([0, 0, 10], [0, 0, 0])
    }

    const setBackView = () => {
        setEditorCameraView([0, 0, -10], [0, 0, 0])
    }

    const setSideView = () => {
        setEditorCameraView([10, 0, 0], [0, 0, 0])
    }

    const setLeftView = () => {
        setEditorCameraView([-10, 0, 0], [0, 0, 0])
    }

    const handleOpenPresentationUrl = () => {
        const nextUrl = presentationUrl.trim()
        if (!nextUrl) return
        window.open(nextUrl, '_blank', 'noopener,noreferrer')
    }

    const applyPresentationTemplate = (templateId) => {
        const nextTemplate = getPresentationTemplateById(templateId)
        setPresentationSourceType('html')
        setPresentationMode('code')
        setPresentationHtml(nextTemplate.html)
    }

    const handleUseStarterHtml = () => {
        applyPresentationTemplate(defaultPresentationTemplate.id)
    }

    const handleImportPresentationHtml = async (event) => {
        const nextFile = event.target.files?.[0]
        event.target.value = ''
        if (!nextFile) return

        try {
            const nextHtml = await nextFile.text()
            setPresentationSourceType('html')
            setPresentationMode('code')
            setPresentationHtml(nextHtml)
        } catch (error) {
        }
    }

    const handleOpenPresentationHtml = () => {
        const nextHtml = presentationHtml.trim() || defaultPresentationTemplate.html
        const objectUrl = URL.createObjectURL(new Blob([nextHtml], { type: 'text/html' }))
        window.open(objectUrl, '_blank', 'noopener,noreferrer')
        window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000)
    }

    const handleDownloadPresentationHtml = () => {
        const nextHtml = presentationHtml.trim() || defaultPresentationTemplate.html
        const objectUrl = URL.createObjectURL(new Blob([nextHtml], { type: 'text/html' }))
        const link = document.createElement('a')
        link.href = objectUrl
        link.download = 'space-code-view.html'
        link.click()
        window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1_000)
    }

    const handleUseCurrentCamera = () => {
        setPresentationMode('fixed-camera')
        setPresentationFixedCamera(readCurrentCameraSnapshot())
    }

    const closePanel = onClose || (() => setIsViewPanelVisible(false))
    const dragState = usePanelDrag({ x: 360, y: 120 }, { baseZ: 100 })
    const resizeState = usePanelResize(320, {
        min: 280,
        max: 640,
        minHeight: 260,
        maxHeight: 900,
        initialHeight: 560
    })

    const isSceneView = presentationMode === 'scene'
    const isFixedCameraView = presentationMode === 'fixed-camera'
    const isCodeView = presentationMode === 'code'
    const isUrlSource = presentationSourceType === 'url'

    return (
        <div
            ref={isEmbeddedMode ? undefined : dragState.panelRef}
            style={isEmbeddedMode ? undefined : { ...dragState.dragStyle, width: resizeState.width, height: resizeState.height }}
            className={['view-panel', 'floating-panel', isSheetMode ? 'sheet-panel' : (isDockMode ? 'dock-panel' : 'draggable-panel')].join(' ')}
            {...(isEmbeddedMode ? {} : dragState.panelPointerProps)}
        >
            <div className={`panel-header ${isSheetMode ? 'sheet-panel-header' : (isDockMode ? 'dock-panel-header' : `draggable-header ${dragState.isDragging ? 'dragging' : ''}`)}`.trim()} {...(isEmbeddedMode ? {} : dragState.dragProps)}>
                <h3>View Settings</h3>
                <button className="close-button" onClick={closePanel}>×</button>
            </div>

            <div className="panel-content view-panel-content">
                <section className="view-panel-section">
                    <div className="view-section-heading">Presentation</div>
                    <div className="view-panel-toggle-group">
                        <button
                            type="button"
                            className={`toggle-button-small ${isSceneView ? 'is-active' : ''}`.trim()}
                            onClick={() => setPresentationMode('scene')}
                        >
                            3D Scene
                        </button>
                        <button
                            type="button"
                            className={`toggle-button-small ${isFixedCameraView ? 'is-active' : ''}`.trim()}
                            onClick={() => setPresentationMode('fixed-camera')}
                        >
                            2D Camera
                        </button>
                        <button
                            type="button"
                            className={`toggle-button-small ${isCodeView ? 'is-active' : ''}`.trim()}
                            onClick={() => setPresentationMode('code')}
                        >
                            Code View
                        </button>
                    </div>
                    <p className="panel-subtext">
                        Switch between the live 3D scene, a locked presentation camera, and a flat 2D/code layer.
                    </p>

                    {isCodeView && (
                        <>
                            <div className="prop-row">
                                <label htmlFor={`${fieldPrefix}-presentation-source`}>Source</label>
                                <select
                                    id={`${fieldPrefix}-presentation-source`}
                                    value={presentationSourceType}
                                    onChange={(event) => setPresentationSourceType(event.target.value)}
                                >
                                    <option value="html">Custom HTML</option>
                                    <option value="url">Public Link</option>
                                </select>
                            </div>

                            {isUrlSource ? (
                                <div className="prop-row-stacked">
                                    <label htmlFor={`${fieldPrefix}-presentation-url`}>Preview Link</label>
                                    <input
                                        id={`${fieldPrefix}-presentation-url`}
                                        type="url"
                                        className="text-input"
                                        placeholder="https://example.com"
                                        value={presentationUrl}
                                        onChange={(event) => setPresentationUrl(event.target.value)}
                                    />
                                    <div className="view-panel-inline-actions">
                                        <button
                                            type="button"
                                            className="toggle-button-small"
                                            onClick={handleOpenPresentationUrl}
                                            disabled={!presentationUrl.trim()}
                                        >
                                            Open Link
                                        </button>
                                    </div>
                                    <p className="panel-subtext">
                                        Use this when a space should present an external page, prototype, or published microsite.
                                        Switch back to Custom HTML when the artist needs a deployable page directly inside the project.
                                    </p>
                                </div>
                            ) : (
                                <div className="prop-row-stacked">
                                    <div className="view-panel-code-heading-row">
                                        <div className="prop-label">Custom HTML</div>
                                        <span className="view-panel-code-hint">Studio-ready code handoff</span>
                                    </div>
                                    <div className="view-panel-template-grid">
                                        {presentationStarterTemplates.map((template) => (
                                            <button
                                                key={template.id}
                                                type="button"
                                                className={`view-panel-template-card ${presentationHtml.trim() === template.html.trim() ? 'is-active' : ''}`.trim()}
                                                onClick={() => applyPresentationTemplate(template.id)}
                                            >
                                                <span className="view-panel-template-eyebrow">{template.eyebrow}</span>
                                                <strong>{template.name}</strong>
                                                <span>{template.description}</span>
                                            </button>
                                        ))}
                                    </div>
                                    <div className="view-panel-inline-actions view-panel-code-actions">
                                        <button
                                            type="button"
                                            className="toggle-button-small"
                                            onClick={handleUseStarterHtml}
                                        >
                                            XR Starter
                                        </button>
                                        <button
                                            type="button"
                                            className="toggle-button-small"
                                            onClick={() => htmlFileInputRef.current?.click()}
                                        >
                                            Import HTML
                                        </button>
                                        <button
                                            type="button"
                                            className="toggle-button-small"
                                            onClick={handleOpenPresentationHtml}
                                        >
                                            Open Preview
                                        </button>
                                        <button
                                            type="button"
                                            className="toggle-button-small"
                                            onClick={handleDownloadPresentationHtml}
                                        >
                                            Download HTML
                                        </button>
                                    </div>
                                    <input
                                        ref={htmlFileInputRef}
                                        type="file"
                                        accept=".html,.htm,.txt,text/html,text/plain"
                                        aria-label="Import HTML file"
                                        style={{ display: 'none' }}
                                        onChange={handleImportPresentationHtml}
                                    />
                                    <label htmlFor={`${fieldPrefix}-presentation-html`}>Custom HTML</label>
                                    <textarea
                                        id={`${fieldPrefix}-presentation-html`}
                                        className="presentation-code-input"
                                        spellCheck="false"
                                        value={presentationHtml}
                                        onChange={(event) => setPresentationHtml(event.target.value)}
                                        placeholder="Paste a standalone HTML document, an artist microsite, or a custom page fragment."
                                    />
                                    <div className="view-panel-code-note">
                                        <strong>Deploy-ready tip</strong>
                                        <span>
                                            Single-file HTML is the safest path for artist handoff inside this editor.
                                            You can still paste React, CDN, or Three.js experiments, but those are usually better once the project already has a public host.
                                        </span>
                                    </div>
                                    <p className="panel-subtext">
                                        Paste a full HTML layout here to let this space behave more like a web page while our tools stay available on top.
                                        The starter cards above are tuned for deployable artist pages, open calls, and client launches.
                                    </p>
                                </div>
                            )}
                        </>
                    )}
                </section>

                <section className="view-panel-section">
                    <div className="view-section-heading">Camera</div>

                    {isFixedCameraView && (
                        <>
                            <div className="view-panel-inline-actions">
                                <button
                                    type="button"
                                    className="toggle-button-small"
                                    onClick={handleUseCurrentCamera}
                                >
                                    Use Current Camera
                                </button>
                            </div>
                            <div className="view-preset-grid fixed-camera-preset-grid">
                                <button
                                    type="button"
                                    className="toggle-button-small"
                                    onClick={() => setFixedCameraView([0, 10, 0], [0, 0, 0])}
                                >
                                    Top
                                </button>
                                <button
                                    type="button"
                                    className="toggle-button-small"
                                    onClick={() => setFixedCameraView(default3DView.position, default3DView.target)}
                                >
                                    3D Saved View
                                </button>
                                <button
                                    type="button"
                                    className="toggle-button-small"
                                    onClick={() => setFixedCameraView([0, 1, 10], [0, 1, 0])}
                                >
                                    Front
                                </button>
                            </div>
                            <details className="view-panel-advanced">
                                <summary>Advanced camera controls</summary>
                                <div className="view-panel-advanced-content">
                                    <div className="prop-label-stacked">Projection</div>
                                    <div className="view-panel-toggle-group view-panel-toggle-group-dual">
                                        <button
                                            type="button"
                                            className={`toggle-button-small ${presentationFixedCamera.projection === 'perspective' ? 'is-active' : ''}`.trim()}
                                            onClick={() => updateFixedCamera({ projection: 'perspective' })}
                                        >
                                            Perspective
                                        </button>
                                        <button
                                            type="button"
                                            className={`toggle-button-small ${presentationFixedCamera.projection === 'orthographic' ? 'is-active' : ''}`.trim()}
                                            onClick={() => updateFixedCamera({ projection: 'orthographic' })}
                                        >
                                            Orthographic
                                        </button>
                                    </div>
                                    <div className="prop-row">
                                        <label htmlFor={`${fieldPrefix}-fixed-fov`}>FOV</label>
                                        <input
                                            id={`${fieldPrefix}-fixed-fov`}
                                            type="range"
                                            min="20"
                                            max="100"
                                            step="1"
                                            value={presentationFixedCamera.fov}
                                            onChange={(event) => updateFixedCamera({
                                                fov: Number(event.target.value) || presentationFixedCamera.fov
                                            })}
                                        />
                                        <span className="prop-value">{Math.round(presentationFixedCamera.fov)}°</span>
                                    </div>
                                    <div className="prop-row">
                                        <label htmlFor={`${fieldPrefix}-fixed-zoom`}>Zoom</label>
                                        <input
                                            id={`${fieldPrefix}-fixed-zoom`}
                                            type="number"
                                            className="inline-input"
                                            min="0.1"
                                            max="10"
                                            step="0.1"
                                            value={presentationFixedCamera.zoom}
                                            onChange={(event) => updateFixedCamera({
                                                zoom: Math.max(0.1, Number(event.target.value) || presentationFixedCamera.zoom)
                                            })}
                                        />
                                    </div>
                                    <div className="prop-row">
                                        <span className="prop-label">Near/Far</span>
                                        <input
                                            aria-label="Locked camera near clipping plane"
                                            type="number"
                                            className="inline-input"
                                            min="0.01"
                                            step="0.01"
                                            value={presentationFixedCamera.near}
                                            onChange={(event) => updateFixedCamera({
                                                near: Math.max(0.01, Number(event.target.value) || presentationFixedCamera.near)
                                            })}
                                        />
                                        <input
                                            aria-label="Locked camera far clipping plane"
                                            type="number"
                                            className="inline-input"
                                            min="10"
                                            step="1"
                                            value={presentationFixedCamera.far}
                                            onChange={(event) => updateFixedCamera({
                                                far: Math.max(1, Number(event.target.value) || presentationFixedCamera.far)
                                            })}
                                        />
                                    </div>
                                </div>
                            </details>
                            <p className="panel-subtext">
                                This saved camera locks orbiting so the 3D scene can behave more like a composed 2D page.
                            </p>
                        </>
                    )}

                    {isSceneView && (
                        <>
                            <div className="view-preset-grid">
                                <button className="toggle-button-small" onClick={setLeftView}>Left</button>
                                <button className="toggle-button-small" onClick={setDefault3DView}>3D</button>
                                <button className="toggle-button-small" onClick={setSideView}>Right</button>
                                <button className="toggle-button-small" onClick={setFrontView}>Front</button>
                                <button className="toggle-button-small" onClick={setTopView}>Top</button>
                                <button className="toggle-button-small" onClick={setBackView}>Back</button>
                            </div>
                            <div className="view-panel-inline-actions">
                                <button
                                    id={`${fieldPrefix}-frame-all`}
                                    type="button"
                                    className="toggle-button-small"
                                    onClick={handleFrameAll}
                                >
                                    Frame All
                                </button>
                                <button
                                    id={`${fieldPrefix}-save-view`}
                                    type="button"
                                    className="toggle-button-small"
                                    onClick={handleSaveView}
                                >
                                    Save Current View
                                </button>
                            </div>
                            <details className="view-panel-advanced">
                                <summary>Advanced camera controls</summary>
                                <div className="view-panel-advanced-content">
                                    <div className="prop-row">
                                        <label htmlFor={`${fieldPrefix}-fov`}>FOV</label>
                                        <input
                                            id={`${fieldPrefix}-fov`}
                                            type="range"
                                            min="20"
                                            max="100"
                                            step="1"
                                            value={cameraSettings.fov}
                                            onChange={(event) => {
                                                const next = Number(event.target.value) || cameraSettings.fov
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
                                            onChange={(event) => {
                                                const next = Math.max(0.01, Number(event.target.value) || cameraSettings.near)
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
                                            onChange={(event) => {
                                                const next = Math.max(1, Number(event.target.value) || cameraSettings.far)
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
                                </div>
                            </details>
                        </>
                    )}

                    {isCodeView && (
                        <p className="panel-subtext">
                            Camera controls are inactive in Code View because this mode renders a sandboxed 2D presentation layer instead of the scene camera.
                        </p>
                    )}
                </section>

                <section className="view-panel-section">
                    <div className="view-section-heading">Display</div>
                    <div className="view-panel-inline-actions">
                        <button
                            id={`${fieldPrefix}-reset`}
                            type="button"
                            className="toggle-button-small"
                            onClick={resetRenderToDefaults}
                            title="Reset view and render settings to defaults"
                        >
                            Reset to Defaults
                        </button>
                    </div>
                    <div className="view-panel-display-grid">
                        <div className="prop-row">
                            <label htmlFor={`${fieldPrefix}-show-gizmo`}>Show Gizmo</label>
                            <button
                                id={`${fieldPrefix}-show-gizmo`}
                                type="button"
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
                                type="button"
                                className="toggle-button-small"
                                aria-label="Toggle grid visibility"
                                aria-pressed={isGridVisible}
                                onClick={() => setIsGridVisible(prev => !prev)}
                            >
                                {isGridVisible ? 'On' : 'Off'}
                            </button>
                        </div>
                    </div>
                </section>

                <section className="view-panel-section">
                    <div className="view-section-heading">Render</div>
                    <div className="prop-row">
                        <label htmlFor={`${fieldPrefix}-shadows`}>Shadows</label>
                        <button
                            id={`${fieldPrefix}-shadows`}
                            type="button"
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
                            type="button"
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
                            onChange={(event) => setRenderSettings(prev => ({ ...prev, toneMapping: event.target.value }))}
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
                            onChange={(event) => setRenderSettings(prev => ({
                                ...prev,
                                toneMappingExposure: Number(event.target.value) || prev.toneMappingExposure
                            }))}
                        />
                        <span className="prop-value">{renderSettings.toneMappingExposure.toFixed(2)}</span>
                    </div>

                    <details className="view-panel-advanced">
                        <summary>Advanced render controls</summary>
                        <div className="view-panel-advanced-content">
                            <div className="prop-row">
                                <label htmlFor={`${fieldPrefix}-dpr`}>DPR</label>
                                <select
                                    id={`${fieldPrefix}-dpr`}
                                    value={Array.isArray(renderSettings.dpr) ? renderSettings.dpr.join('-') : String(renderSettings.dpr)}
                                    onChange={(event) => {
                                        const value = event.target.value
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
                        </div>
                    </details>
                </section>
            </div>
            {!isEmbeddedMode && <div className={`panel-resizer ${resizeState.isResizing ? 'resizing' : ''}`} {...resizeState.resizerProps} />}
        </div>
    )
}
