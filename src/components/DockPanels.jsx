import React from 'react'

export default function DockPanels({
    panelEntries = [],
    renderPanelContent
}) {
    const dockEntries = panelEntries.filter((entry) => entry.isVisible && entry.floatingPlacement !== 'overlay')
    const overlayEntries = panelEntries.filter((entry) => entry.isVisible && entry.floatingPlacement === 'overlay')

    return (
        <>
            {dockEntries.length > 0 && (
                <div className="panel-container panel-dock-right">
                    {dockEntries.map((entry) => (
                        <React.Fragment key={entry.key}>
                            {renderPanelContent?.(entry)}
                        </React.Fragment>
                    ))}
                </div>
            )}

            {overlayEntries.map((entry) => (
                <React.Fragment key={entry.key}>
                    {renderPanelContent?.(entry)}
                </React.Fragment>
            ))}
        </>
    )
}
