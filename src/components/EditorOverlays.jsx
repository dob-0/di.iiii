import React, { useEffect, useState } from 'react'
import LoadingScreen from './LoadingScreen.jsx'
import { isPreviewRequest } from '../utils/previewMode.js'

export default function EditorOverlays({
    isUiVisible,
    isLoading,
    isFileDragActive,
    hiddenUiButtons,
    remoteCursorMarkers,
    shouldShowStatusPanel,
    statusPanelClassName,
    statusDotClass,
    statusSummary,
    statusItems
}) {
    const [isStatusExpanded, setIsStatusExpanded] = useState(false)
    const isDockedStatusPanel = typeof statusPanelClassName === 'string' && statusPanelClassName.includes('status-panel-docked')
    const showExpandedStatusRows = isDockedStatusPanel || isStatusExpanded
    const shouldRenderStatusPanel = isUiVisible && shouldShowStatusPanel
    // Hiding the editor UI is what SURFACES this cluster, so a thumbnail — which
    // has no UI by definition — was the one place it always showed. `exit-xr`
    // stays: it is the only way out of a session, and offering no way out is
    // worse than a button in a card nobody will ever be in XR inside.
    const [isPreview] = useState(() => isPreviewRequest())
    const previewSafeKeys = isPreview
        ? ['exit-xr']
        : ['enter-vr', 'enter-ar', 'exit-xr', 'interaction-mode']
    const hiddenXrButtons = !isUiVisible && Array.isArray(hiddenUiButtons)
        ? hiddenUiButtons.filter((button) => previewSafeKeys.includes(button.key))
        : []

    useEffect(() => {
        if (!shouldRenderStatusPanel) {
            setIsStatusExpanded(false)
        }
    }, [shouldRenderStatusPanel])

    return (
        <>
            {/* Same black-and-a-spinner as every other wait in the app. The
                raised panel and the "Loading scene..." caption are gone: this
                sits over the editor for a second or two and a bordered card
                announcing itself was the loudest thing on screen for the whole
                time it was up. */}
            {isLoading && <LoadingScreen label="Loading" detail="Preparing the scene" />}

            {isFileDragActive && (
                <div className="drop-overlay">
                    <div className="drop-panel">
                        <p>Drop files to add to the room</p>
                    </div>
                </div>
            )}

            {hiddenXrButtons.length > 0 && (
                <div className="hidden-ui-xr-controls" data-testid="hidden-ui-xr-controls">
                    {hiddenXrButtons.map((button) => (
                        <button
                            key={button.key}
                            type="button"
                            className="toggle-button hidden-ui-xr-button"
                            onClick={button.onClick}
                            disabled={button.disabled}
                            title={button.title}
                        >
                            {button.label}
                        </button>
                    ))}
                </div>
            )}

            {Array.isArray(remoteCursorMarkers) && remoteCursorMarkers.length > 0 && (
                <div className="collaboration-cursor-layer" aria-hidden="true">
                    {remoteCursorMarkers.map((cursor) => (
                        <div
                            key={cursor.key}
                            className="collaboration-cursor"
                            style={{
                                left: `${Math.max(0, Math.min(100, (cursor.x || 0) * 100))}%`,
                                top: `${Math.max(0, Math.min(100, (cursor.y || 0) * 100))}%`
                            }}
                        >
                            <div className="collaboration-cursor-dot" />
                            <div className="collaboration-cursor-label">{cursor.label}</div>
                        </div>
                    ))}
                </div>
            )}

            {shouldRenderStatusPanel && (
                <div className={[statusPanelClassName, showExpandedStatusRows ? 'is-expanded' : 'is-collapsed'].join(' ')}>
                    <div className="status-header">
                        <div className="status-title">
                            <span className={statusDotClass} aria-hidden="true" />
                            <span>Activity</span>
                        </div>
                        <div className="status-header-actions">
                            <div className="status-summary">{statusSummary}</div>
                            {!isDockedStatusPanel && (
                                <button
                                    type="button"
                                    className="status-toggle-button"
                                    onClick={() => setIsStatusExpanded((prev) => !prev)}
                                    aria-expanded={showExpandedStatusRows}
                                >
                                    {showExpandedStatusRows ? 'Hide' : 'Show'}
                                </button>
                            )}
                        </div>
                    </div>
                    {showExpandedStatusRows && (
                        <div className="status-rows">
                            {statusItems.map(item => (
                                <div key={item.key} className="status-row">
                                    <div className="status-row-top">
                                        <div className="status-label">{item.label}</div>
                                        {item.detail && <div className="status-detail">{item.detail}</div>}
                                    </div>
                                    {item.showBar !== false && (item.indeterminate || 'percent' in item) && (
                                        <div className={['status-bar', item.indeterminate ? 'indeterminate' : ''].filter(Boolean).join(' ')}>
                                            {!item.indeterminate && 'percent' in item && (
                                                <div className="status-progress" style={{ width: `${Math.max(0, Math.min(100, item.percent || 0))}%` }} />
                                            )}
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}
        </>
    )
}
