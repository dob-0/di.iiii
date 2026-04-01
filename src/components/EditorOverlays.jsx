import React from 'react'

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
    const renderButton = (button) => {
        const classNames = ['toggle-button']
        if (button.variant === 'success') classNames.push('success-button')
        if (button.variant === 'warning') classNames.push('warning-button')
        if (button.variant === 'danger') classNames.push('clear-button')
        if (button.isActive) classNames.push('active')
        return (
            <button
                key={button.key}
                type="button"
                className={classNames.filter(Boolean).join(' ')}
                onClick={button.onClick}
                disabled={button.disabled}
                title={button.title}
            >
                <span>{button.label}</span>
                {button.hint && <span className="button-hint">{button.hint}</span>}
            </button>
        )
    }

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

            {!isUiVisible && Array.isArray(hiddenUiButtons) && hiddenUiButtons.length > 0 && (
                <div className="hidden-ui-quick-menu" data-testid="hidden-ui-quick-menu">
                    <div className="hidden-ui-quick-header">Quick Controls</div>
                    <div className="hidden-ui-quick-buttons">
                        {hiddenUiButtons.map(renderButton)}
                    </div>
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

            {shouldShowStatusPanel && (
                <div className={statusPanelClassName}>
                    <div className="status-header">
                        <div className="status-title">
                            <span className={statusDotClass} aria-hidden="true" />
                            <span>Activity</span>
                        </div>
                        <div className="status-summary">{statusSummary}</div>
                    </div>
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
        </>
    )
}
