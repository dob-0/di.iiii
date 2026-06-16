import React from 'react'

export default function SplitPanels({
    panelEntries = [],
    renderPanelContent
}) {
    const visibleEntries = panelEntries.filter((entry) => entry.isVisible)

    if (!visibleEntries.length) {
        return null
    }

    return (
        <div className="panel-container split-mode">
            <div className="split-tabs">
                {visibleEntries.map((entry) => (
                    <button
                        key={entry.key}
                        type="button"
                        className="split-tab active"
                        onClick={entry.onClose}
                    >
                        {entry.label} ×
                    </button>
                ))}
            </div>
            <div className="split-panel-content">
                {visibleEntries.map((entry) => (
                    <div key={entry.key} className="split-panel-section">
                        {renderPanelContent?.(entry)}
                    </div>
                ))}
            </div>
        </div>
    )
}
