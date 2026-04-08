import React from 'react'
import { usePanelDrag } from '../hooks/usePanelDrag.js'
import { usePanelResize } from '../hooks/usePanelResize.js'

export function PanelShell({
    title,
    onClose,
    surfaceMode = 'floating',
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

    const isSheetMode = surfaceMode === 'sheet'
    const isDockMode = surfaceMode === 'dock'
    const isEmbeddedMode = isSheetMode || isDockMode

    const shellClassName = [
        'floating-panel',
        isSheetMode ? 'sheet-panel' : (isDockMode ? 'dock-panel' : 'draggable-panel'),
        className
    ].filter(Boolean).join(' ')

    const shellStyle = isEmbeddedMode ? undefined : { ...dragStyle, width, height }
    const shellRef = isEmbeddedMode ? undefined : panelRef
    const shellPointerProps = isEmbeddedMode ? {} : panelPointerProps
    const headerDragProps = isEmbeddedMode ? {} : dragProps

    return (
        <div
            ref={shellRef}
            style={shellStyle}
            className={shellClassName}
            {...shellPointerProps}
        >
            <div className={`panel-header ${isSheetMode ? 'sheet-panel-header' : (isDockMode ? 'dock-panel-header' : `draggable-header ${isDragging ? 'dragging' : ''}`)}`.trim()} {...headerDragProps}>
                <h3>{title}</h3>
                <div className="panel-header-actions">
                    {headerActions}
                    <button className="close-button" onClick={onClose}>x</button>
                </div>
            </div>

            <div className={['panel-content', contentClassName].filter(Boolean).join(' ')}>
                {children}
            </div>

            {!isEmbeddedMode && <div className={`panel-resizer ${isResizing ? 'resizing' : ''}`} {...resizerProps} />}
        </div>
    )
}

export default PanelShell

