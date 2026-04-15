import React, { useEffect, useState } from 'react'

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
    const hiddenXrButtons = !isUiVisible && Array.isArray(hiddenUiButtons)
        ? hiddenUiButtons.filter((button) => ['enter-vr', 'enter-ar', 'exit-xr'].includes(button.key))
        : []

    useEffect(() => {
        if (!shouldRenderStatusPanel) {
            setIsStatusExpanded(false)
        }
    }, [shouldRenderStatusPanel])

    return (
        <>
            {isLoading && (
                <div className="loading-overlay">
                    <div className="loading-panel">
                        <div className="loading-spinner" aria-hidden="true" />
                        <p>Loading scene...</p>
                    </div>
                </div>
            )}

            {isFileDragActive && (
                <div className="drop-overlay">
                    <div className="drop-panel">
                        <p>Drop files to add to your scene</p>
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
