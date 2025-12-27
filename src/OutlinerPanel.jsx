import React, { useMemo, useState } from 'react'
import { usePanelDrag } from './hooks/usePanelDrag.js'
import { usePanelResize } from './hooks/usePanelResize.js'

const formatObjectLabel = (obj) => {
    if (!obj) return 'Unknown'
    return obj.name || obj.label || obj.title || obj.type || obj.id
}

export default function OutlinerPanel({
    objects = [],
    selectionGroups = [],
    selectedObjectIds = [],
    onSelectObject,
    onToggleVisibility,
    onSelectGroup,
    onCreateGroup,
    onDeleteGroup,
    onClose,
    canCreateGroup = false
}) {
    const [query, setQuery] = useState('')
    const { panelRef, dragProps, dragStyle, isDragging, panelPointerProps } = usePanelDrag({ x: 360, y: 460 }, { baseZ: 100 })
    const { width, height, resizerProps, isResizing } = usePanelResize(320, {
        min: 280,
        max: 640,
        minHeight: 260,
        maxHeight: 900,
        initialHeight: 400
    })

    const filteredObjects = useMemo(() => {
        const safeQuery = query.trim().toLowerCase()
        if (!safeQuery) return objects
        return objects.filter(obj => {
            const label = formatObjectLabel(obj).toLowerCase()
            return label.includes(safeQuery)
        })
    }, [objects, query])

    return (
        <div
            ref={panelRef}
            style={{ ...dragStyle, width, height }}
            className="floating-panel outliner-panel draggable-panel"
            {...panelPointerProps}
        >
            <div className={`panel-header draggable-header ${isDragging ? 'dragging' : ''}`} {...dragProps}>
                <h3>Outliner</h3>
                <button className="close-button" onClick={onClose}>×</button>
            </div>
            <div className="panel-content outliner-content">
                <input
                    type="text"
                    className="text-input"
                    placeholder="Search objects..."
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                />
                <div className="object-list">
                    {filteredObjects.length === 0 ? (
                        <p className="panel-subtext">No objects match.</p>
                    ) : filteredObjects.map(obj => {
                        const isSelected = selectedObjectIds.includes(obj.id)
                        return (
                            <div
                                key={obj.id}
                                className={[
                                    'object-row',
                                    isSelected ? 'object-selected' : ''
                                ].join(' ')}
                                onClick={() => onSelectObject?.(obj.id)}
                            >
                                <div className="object-row-main">
                                    <span className="object-name">{formatObjectLabel(obj)}</span>
                                    <span className="object-meta">{obj.type}</span>
                                </div>
                                <div className="object-row-actions">
                                    <button
                                        type="button"
                                        onClick={(event) => {
                                            event.stopPropagation()
                                            onToggleVisibility?.(obj.id)
                                        }}
                                    >
                                        {obj.isVisible === false ? 'Show' : 'Hide'}
                                    </button>
                                </div>
                            </div>
                        )
                    })}
                </div>
                <div className="panel-divider" />
                <div className="groups-section">
                    <div className="groups-header">
                        <h4 className="panel-subheading">Groups</h4>
                        {onCreateGroup && (
                            <button
                                type="button"
                                className="toggle-button"
                                onClick={() => onCreateGroup()}
                                disabled={!canCreateGroup}
                            >
                                New Group
                            </button>
                        )}
                    </div>
                    {selectionGroups.length === 0 ? (
                        <p className="panel-subtext">No groups yet.</p>
                    ) : (
                        <div className="group-list">
                            {selectionGroups.map(group => (
                                <div key={group.id} className="group-row">
                                    <div className="group-row-main">
                                        <span className="group-name">{group.name}</span>
                                        <span className="group-meta">{group.members?.length || 0} item{group.members?.length === 1 ? '' : 's'}</span>
                                    </div>
                                    <div className="group-row-actions">
                                        <button type="button" onClick={() => onSelectGroup?.(group.id)}>
                                            Select
                                        </button>
                                        <button
                                            type="button"
                                            className="danger"
                                            onClick={() => onDeleteGroup?.(group.id)}
                                        >
                                            Delete
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
            <div className={`panel-resizer ${isResizing ? 'resizing' : ''}`} {...resizerProps} />
        </div>
    )
}
