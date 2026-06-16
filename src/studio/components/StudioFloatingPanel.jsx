import { useState } from 'react'
import { usePanelDrag } from '../../hooks/usePanelDrag.js'
import { usePanelResize } from '../../hooks/usePanelResize.js'

export default function StudioFloatingPanel({
    title,
    onClose,
    initialPosition = { x: 16, y: 16 },
    initialWidth = 280,
    minWidth = 180,
    maxWidth = 640,
    minHeight = 80,
    maxHeight = 900,
    snapEdges = false,
    children
}) {
    const [collapsed, setCollapsed] = useState(false)
    const { panelRef, dragProps, dragStyle, panelPointerProps } = usePanelDrag(initialPosition, { snapEdges })
    const { width, height, resizerProps } = usePanelResize(initialWidth, {
        min: minWidth,
        max: maxWidth,
        minHeight,
        maxHeight
    })

    return (
        <div
            ref={panelRef}
            style={{ ...dragStyle, width }}
            className="sfp-shell"
            {...panelPointerProps}
        >
            <div className="sfp-header" {...dragProps}>
                <span className="sfp-title">{title}</span>
                <button
                    className="scc-collapse-btn"
                    onClick={() => setCollapsed((v) => !v)}
                    title={collapsed ? 'Expand' : 'Collapse'}
                >
                    {collapsed ? '▸' : '▾'}
                </button>
                {onClose && (
                    <button className="sfp-close" onClick={onClose} title="Close">×</button>
                )}
            </div>
            {!collapsed && (
                <>
                    <div className="sfp-content" style={height ? { height } : undefined}>
                        {children}
                    </div>
                    <div className="sfp-resizer" {...resizerProps} />
                </>
            )}
        </div>
    )
}
