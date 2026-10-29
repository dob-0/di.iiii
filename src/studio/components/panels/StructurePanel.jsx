import { useMemo, useState } from 'react'
import { LockMark } from './PanelHeader.jsx'

function StructureRow({ entity, depth, childMap, selectedIds, selectedEntityId, onSelectEntity, onToggleSelectEntity, onRenameEntity, onToggleEntityVisible, onToggleEntityLocked, onReparentEntity }) {
    const [expanded, setExpanded] = useState(true)
    const [renaming, setRenaming] = useState(false)
    const [nameDraft, setNameDraft] = useState('')
    const [dropTarget, setDropTarget] = useState(false)
    const isGroup = entity.type === 'group'
    const children = childMap.get(entity.id) || []
    const selected = selectedIds.has(entity.id)
    const hidden = entity.components?.runtime?.visible === false
    const locked = entity.components?.runtime?.locked === true

    const startRename = () => {
        if (!onRenameEntity) return
        setNameDraft(entity.name || entity.id)
        setRenaming(true)
    }
    const commitRename = () => {
        setRenaming(false)
        onRenameEntity?.(entity.id, nameDraft)
    }

    return (
        <>
            {renaming ? (
                <div className="spa-item active" style={depth > 0 ? { paddingLeft: depth * 14 + 8 } : undefined}>
                    <input
                        className="insp-input"
                        value={nameDraft}
                        ref={(el) => el?.focus()}
                        aria-label="Object name"
                        onChange={(e) => setNameDraft(e.target.value)}
                        onBlur={commitRename}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') commitRename()
                            if (e.key === 'Escape') setRenaming(false)
                        }}
                    />
                </div>
            ) : (
                <div
                    className={`spa-item${selected ? ' active' : ''}`}
                    role="button"
                    tabIndex={0}
                    aria-pressed={selected}
                    onKeyDown={(event) => {
                        if (event.target !== event.currentTarget) return
                        if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault()
                            event.currentTarget.click()
                        }
                    }}
                    style={{
                        ...(depth > 0 ? { paddingLeft: depth * 14 + 8 } : {}),
                        ...(dropTarget ? { outline: '1px dashed currentColor', outlineOffset: -1 } : {})
                    }}
                    onClick={(event) => {
                        const additive = event.ctrlKey || event.metaKey || event.shiftKey
                        if (additive) onToggleSelectEntity(entity.id)
                        else onSelectEntity(entity.id)
                    }}
                    onDoubleClick={startRename}
                    title={isGroup ? 'Double-click to rename · drop objects here to nest them' : 'Double-click to rename · drag onto a group to nest'}
                    draggable={Boolean(onReparentEntity)}
                    onDragStart={(e) => {
                        e.dataTransfer.setData('application/x-dii-entity', entity.id)
                        e.dataTransfer.effectAllowed = 'move'
                    }}
                    onDragOver={onReparentEntity ? (e) => {
                        if (!e.dataTransfer.types.includes('application/x-dii-entity')) return
                        e.preventDefault()
                        e.stopPropagation()
                        if (isGroup) setDropTarget(true)
                    } : undefined}
                    onDragLeave={isGroup ? () => setDropTarget(false) : undefined}
                    onDrop={onReparentEntity ? (e) => {
                        e.preventDefault()
                        e.stopPropagation()
                        setDropTarget(false)
                        const draggedId = e.dataTransfer.getData('application/x-dii-entity')
                        // onto a group = nest inside it; onto any other row = become its sibling
                        if (draggedId) onReparentEntity(draggedId, isGroup ? entity.id : (entity.parentId || null))
                    } : undefined}
                >
                    {isGroup && (
                        <button
                            type="button"
                            className="spa-fold"
                            onClick={(e) => { e.stopPropagation(); setExpanded((v) => !v) }}
                            aria-label={expanded ? 'Collapse group' : 'Expand group'}
                        >
                            {expanded ? '▾' : '▸'}
                        </button>
                    )}
                    <span className="spa-name" style={hidden ? { opacity: 0.5 } : undefined}>{entity.name || entity.id}</span>
                    <span className="spa-type">
                        {entity.type}
                        {entity.id === selectedEntityId && selectedIds.size > 1 ? ' · primary' : ''}
                    </span>
                    {onToggleEntityVisible && (
                        <button
                            type="button"
                            className="spa-fold"
                            aria-label={hidden ? 'Show' : 'Hide'}
                            aria-pressed={hidden}
                            title={hidden ? 'Show' : 'Hide'}
                            style={hidden ? undefined : { opacity: 0.55 }}
                            onClick={(e) => { e.stopPropagation(); onToggleEntityVisible(entity.id) }}
                        >
                            {hidden ? '○' : '●'}
                        </button>
                    )}
                    {onToggleEntityLocked && (
                        <button
                            type="button"
                            className="spa-fold"
                            aria-label={locked ? 'Unlock' : 'Lock'}
                            aria-pressed={locked}
                            title={locked ? 'Unlock (allow moving)' : 'Lock (prevent moving)'}
                            style={locked ? undefined : { opacity: 0.55 }}
                            onClick={(e) => { e.stopPropagation(); onToggleEntityLocked(entity.id) }}
                        >
                            <LockMark locked={locked} />
                        </button>
                    )}
                </div>
            )}
            {isGroup && expanded && children.map((child) => (
                <StructureRow
                    key={child.id}
                    entity={child}
                    depth={depth + 1}
                    childMap={childMap}
                    selectedIds={selectedIds}
                    selectedEntityId={selectedEntityId}
                    onSelectEntity={onSelectEntity}
                    onToggleSelectEntity={onToggleSelectEntity}
                    onRenameEntity={onRenameEntity}
                    onToggleEntityVisible={onToggleEntityVisible}
                    onToggleEntityLocked={onToggleEntityLocked}
                    onReparentEntity={onReparentEntity}
                />
            ))}
        </>
    )
}

// A thing the scene shows that is a node, not a document entity (made in Nodes,
// a template or a page layer). Listed so the count and the list match the scene.
// A Geo opens (Studio goes inside it); the others are shown, not editable here.
function NodeRow({ row, onOpen, onEditInNodes }) {
    const open = row.isGeo && onOpen ? () => onOpen(row.id) : null
    const label = row.name || row.id
    return open ? (
        <div
            className="spa-item"
            role="button"
            tabIndex={0}
            onClick={open}
            onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault()
                    open()
                }
            }}
            title="Open it to edit what stands inside"
        >
            <span className="spa-name">{label}</span>
            <span className="spa-type">{row.type} · open</span>
        </div>
    ) : (
        <div className="spa-item spa-item--static" title="Made in Nodes — edit it there">
            <span className="spa-name">{label}</span>
            <span className="spa-type">{row.type}</span>
            {onEditInNodes && (
                <button type="button" className="spa-node-edit" onClick={onEditInNodes} title="Made in Nodes — open Nodes to edit it" aria-label={`Edit ${label} in Nodes`}>
                    Edit in Nodes
                </button>
            )}
        </div>
    )
}

export function StructurePanel({ entities = [], nodeRows = [], onOpenNodeRow, onEditNodeRowInNodes, selectedEntityId, selectedEntityIds = [], onSelectEntity, onToggleSelectEntity, onGroupSelected, onUngroup, onRenameEntity, onToggleEntityVisible, onToggleEntityLocked, onReparentEntity }) {
    const selectedIds = new Set(selectedEntityIds)
    const childMap = useMemo(() => {
        const map = new Map()
        for (const entity of entities) {
            if (entity.parentId) {
                if (!map.has(entity.parentId)) map.set(entity.parentId, [])
                map.get(entity.parentId).push(entity)
            }
        }
        return map
    }, [entities])
    const roots = useMemo(() => entities.filter((e) => !e.parentId), [entities])
    const canGroup = selectedEntityIds.length > 1
    const selectedEntity = entities.find((e) => e.id === selectedEntityId)
    const canUngroup = selectedEntity?.type === 'group'

    return (
        <div className="scc-section">
            <div className="scc-section-label" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span>Objects ({entities.length + nodeRows.length})</span>
                <span style={{ display: 'flex', gap: 4 }}>
                    {canGroup && onGroupSelected && (
                        <button className="scc-btn scc-btn--xs" onClick={onGroupSelected} title="Group selected (Ctrl+G)">Group</button>
                    )}
                    {canUngroup && onUngroup && (
                        <button className="scc-btn scc-btn--xs" onClick={onUngroup} title="Ungroup (Ctrl+Shift+G)">Ungroup</button>
                    )}
                </span>
            </div>
            {entities.length + nodeRows.length === 0 ? (
                <p className="sfp-empty">No objects yet.</p>
            ) : (
                // eslint-disable-next-line jsx-a11y/no-static-element-interactions -- drop-to-root target; rows stay native buttons
                <div
                    className="spa-list"
                    onDragOver={onReparentEntity ? (e) => {
                        if (e.dataTransfer.types.includes('application/x-dii-entity')) e.preventDefault()
                    } : undefined}
                    onDrop={onReparentEntity ? (e) => {
                        e.preventDefault()
                        const draggedId = e.dataTransfer.getData('application/x-dii-entity')
                        if (draggedId) onReparentEntity(draggedId, null)
                    } : undefined}
                >
                    {roots.map((entity) => (
                        <StructureRow
                            key={entity.id}
                            entity={entity}
                            depth={0}
                            childMap={childMap}
                            selectedIds={selectedIds}
                            selectedEntityId={selectedEntityId}
                            onSelectEntity={onSelectEntity}
                            onToggleSelectEntity={onToggleSelectEntity}
                            onRenameEntity={onRenameEntity}
                            onToggleEntityVisible={onToggleEntityVisible}
                            onToggleEntityLocked={onToggleEntityLocked}
                            onReparentEntity={onReparentEntity}
                        />
                    ))}
                    {nodeRows.map((row) => <NodeRow key={row.id} row={row} onOpen={onOpenNodeRow} onEditInNodes={onEditNodeRowInNodes} />)}
                </div>
            )}
        </div>
    )
}
