import React from 'react'
import { usePanelDrag } from '../hooks/usePanelDrag.js'
import { usePanelResize } from '../hooks/usePanelResize.js'

export function PanelShell({
    title,
    onClose,
    initialPosition = { x: 16, y: 16 },
    sizeOptions = { initialWidth: 320 },
    dragOptions = {},
    className = '',
    contentClassName = '',
    headerActions = null,
    children
}) {
    const {
        panelRef,
        dragProps,
        dragStyle,
        isDragging,
        panelPointerProps
    } = usePanelDrag(initialPosition, dragOptions)

    const {
        width,
        height,
        resizerProps,
        isResizing
    } = usePanelResize(sizeOptions.initialWidth || 320, sizeOptions)

    return (
        <div
            ref={panelRef}
            style={{ ...dragStyle, width, height }}
            className={['floating-panel', 'draggable-panel', className].filter(Boolean).join(' ')}
            {...panelPointerProps}
        >
            <div className={`panel-header draggable-header ${isDragging ? 'dragging' : ''}`} {...dragProps}>
                <h3>{title}</h3>
                <div className="panel-header-actions">
                    {headerActions}
                    <button className="close-button" onClick={onClose}>×</button>
                </div>
            </div>

            <div className={['panel-content', contentClassName].filter(Boolean).join(' ')}>
                {children}
            </div>

            <div className={`panel-resizer ${isResizing ? 'resizing' : ''}`} {...resizerProps} />
        </div>
    )
}

export default PanelShell
