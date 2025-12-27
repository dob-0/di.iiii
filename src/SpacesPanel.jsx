import React, { useState } from 'react'
import { usePanelDrag } from './hooks/usePanelDrag.js'
import { usePanelResize } from './hooks/usePanelResize.js'

const formatRelativeTime = (timestamp) => {
    if (!timestamp) return 'never'
    const diff = Date.now() - timestamp
    const minute = 1000 * 60
    const hour = minute * 60
    const day = hour * 24
    if (diff < minute) return 'just now'
    if (diff < hour) return `${Math.floor(diff / minute)} min ago`
    if (diff < day) return `${Math.floor(diff / hour)} h ago`
    return `${Math.floor(diff / day)} d ago`
}

const getSpaceLabel = (space) => space.label || `Space ${space.id.slice(-4)}`

export default function SpacesPanel({
    spaces,
    currentSpaceId,
    onClose,
    onCreateSpace,
    onCreatePermanentSpace,
    onOpenSpace,
    onCopyLink,
    onDeleteSpace,
    onTogglePermanent,
    newSpaceName,
    onSpaceNameChange,
    spaceNameFeedback,
    canCreateSpace,
    ttlHours,
    isCreatingSpace,
    selectionGroups = [],
    onCreateGroup,
    onSelectGroup,
    onDeleteGroup,
    canCreateGroup
}) {
    const [copiedId, setCopiedId] = useState(null)
    const { panelRef, dragProps, dragStyle, isDragging, panelPointerProps } = usePanelDrag({ x: 704, y: 460 }, { baseZ: 150 })
    const { width, height, resizerProps, isResizing } = usePanelResize(320, {
        min: 280,
        max: 640,
        minHeight: 260,
        maxHeight: 900,
        initialHeight: 400
    })

    const handleCopy = async (spaceId) => {
        if (!onCopyLink) return
        const ok = await onCopyLink(spaceId)
        if (ok) {
            setCopiedId(spaceId)
            setTimeout(() => setCopiedId(null), 2000)
        }
    }

    return (
        <div
            ref={panelRef}
            style={{ ...dragStyle, width, height }}
            className="floating-panel spaces-panel draggable-panel"
            {...panelPointerProps}
        >
            <div className={`panel-header draggable-header ${isDragging ? 'dragging' : ''}`} {...dragProps}>
                <h3>Spaces</h3>
                <button className="close-button" onClick={onClose}>×</button>
            </div>
            <div className="panel-content spaces-panel-content">
                <div className="space-name-field">
                    <label htmlFor="space-name-input">Space Name</label>
                    <input
                        id="space-name-input"
                        type="text"
                        value={newSpaceName}
                        onChange={(event) => onSpaceNameChange?.(event.target.value)}
                        placeholder="e.g. showroom"
                        className="text-input"
                    />
                    {spaceNameFeedback?.message && (
                        <p className={[
                            'panel-subtext',
                            spaceNameFeedback.tone === 'error' ? 'panel-subtext-error' : '',
                            spaceNameFeedback.tone === 'success' ? 'panel-subtext-success' : ''
                        ].filter(Boolean).join(' ')}>
                            {spaceNameFeedback.message}
                        </p>
                    )}
                </div>
                <div className="spaces-panel-actions">
                    <button
                        type="button"
                        className="toggle-button"
                        onClick={onCreateSpace}
                        disabled={!canCreateSpace}
                    >
                        {isCreatingSpace ? 'Creating...' : 'New Temp Space'}
                    </button>
                    <button
                        type="button"
                        className="toggle-button success-button"
                        onClick={onCreatePermanentSpace}
                        disabled={!canCreateSpace}
                    >
                        {isCreatingSpace ? 'Please wait...' : 'Permanent Space'}
                    </button>
                </div>
                {onCreateGroup && (
                    <div className="spaces-panel-actions">
                        <button
                            type="button"
                            className="toggle-button"
                            onClick={onCreateGroup}
                            disabled={!canCreateGroup}
                        >
                            Group Selection
                        </button>
                    </div>
                )}
                <p className="panel-subtext">
                    Temporary spaces auto-delete after {ttlHours}h of inactivity unless marked “Keep Forever”.
                </p>
                <div className="space-list">
                    {spaces.length === 0 ? (
                        <p className="panel-subtext">No shared spaces yet.</p>
                    ) : spaces.map(space => (
                        <div
                            key={space.id}
                            className={[
                                'space-row',
                                space.id === currentSpaceId ? 'current-space' : ''
                            ].filter(Boolean).join(' ')}
                        >
                            <div className="space-row-header">
                                <span className="space-row-name">{getSpaceLabel(space)}</span>
                                <span className={[
                                    'space-row-badge',
                                    space.isPermanent ? 'badge-permanent' : 'badge-temp'
                                ].join(' ')}>
                                    {space.isPermanent ? 'Permanent' : 'Temporary'}
                                </span>
                            </div>
                            <div className="space-row-meta">
                                <span>ID: {space.id}</span>
                                <span>Updated {formatRelativeTime(space.lastActive)}</span>
                            </div>
                            <div className="space-row-actions">
                                <button type="button" onClick={() => onOpenSpace?.(space.id)}>
                                    Open
                                </button>
                                <button type="button" onClick={() => handleCopy(space.id)}>
                                    {copiedId === space.id ? 'Copied!' : 'Copy Link'}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => onTogglePermanent?.(space.id, !space.isPermanent)}
                                >
                                    {space.isPermanent ? 'Make Temp' : 'Keep Forever'}
                                </button>
                                <button
                                    type="button"
                                    className="danger"
                                    onClick={() => onDeleteSpace?.(space.id)}
                                    disabled={space.id === currentSpaceId}
                                >
                                    Delete
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
                {selectionGroups.length > 0 && (
                    <>
                        <div className="panel-divider" />
                        <div className="groups-section">
                            <h4 className="panel-subheading">Groups</h4>
                            <div className="space-list">
                                {selectionGroups.map(group => (
                                    <div key={group.id} className="space-row">
                                        <div className="space-row-header">
                                            <span className="space-row-name">{group.name}</span>
                                            <span className="space-row-badge">
                                                {group.members?.length || 0} item{group.members?.length === 1 ? '' : 's'}
                                            </span>
                                        </div>
                                        <div className="space-row-actions">
                                            <button
                                                type="button"
                                                onClick={() => onSelectGroup?.(group.id)}
                                                disabled={!group.members?.length}
                                            >
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
                        </div>
                    </>
                )}
            </div>
            <div className={`panel-resizer ${isResizing ? 'resizing' : ''}`} {...resizerProps} />
        </div>
    )
}
