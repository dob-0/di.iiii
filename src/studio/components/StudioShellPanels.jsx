import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import JSZip from 'jszip'

// Asset URLs come in two shapes: space assets already include the /serverXR mount,
// project assets are mount-relative. Resolve without double-prefixing (the cause of
// the blank "/serverXR/serverXR/..." thumbnails).
const assetSrc = (url) => {
    if (!url) return ''
    if (/^(https?:|\/serverXR\/)/.test(url)) return url
    return `/serverXR${url.startsWith('/') ? '' : '/'}${url}`
}
import {
    Box,
    Button,
    Card,
    Dialog,
    DialogContent,
    DialogTitle,
    FormControl,
    FormControlLabel,
    IconButton,
    InputLabel,
    MenuItem,
    Paper,
    Select,
    Stack,
    Switch,
    Tab,
    Tabs,
    TextField,
    Typography
} from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import CloseIcon from '@mui/icons-material/Close'
import RocketLaunchIcon from '@mui/icons-material/RocketLaunch'
import ShareIcon from '@mui/icons-material/Share'
import { presentationStarterTemplates } from '../../utils/presentationTemplates.js'
import { cloneValue, defaultRenderSettings, defaultWorldState } from '../../shared/projectSchema.js'
import {
    getTimelinePreview,
    getTimelinePreviewVersion,
    subscribeTimelinePreview,
    setTimelinePreview,
    stopTimelinePreview
} from '../utils/timelinePreview.js'
import {
    isSupportedFile,
    normalizeFileName,
    SUPPORTED_EXTENSIONS
} from '../../utils/codeFilesBundle.js'
import { useDriveImport } from '../../hooks/useDriveImport.js'
import useAuthSession from '../../hooks/useAuthSession.js'
import { getApiAuthProviders, getOAuthUrl } from '../../services/apiClient.js'
import { listCommonsAssets } from '../../services/serverSpaces.js'
import { formatAssetSize } from '../utils/assetOptimization.js'
import { ASSET_FORMAT_HINT, canPlaceInScene } from '../utils/assetFormats.js'
import { LIGHTS, PRIMITIVES } from '../../project/entityPalette.js'

const formatTimestamp = (value) => {
    if (!value) return 'Not yet'
    try {
        return new Date(value).toLocaleString()
    } catch {
        return String(value)
    }
}

export function PanelHeader({ title, onClose, action = null }) {
    return (
        <Stack
            direction="row"
            spacing={1}
            justifyContent="space-between"
            alignItems="center"
            sx={{ px: 2, py: 1.5 }}
        >
            <Typography variant="subtitle1" fontWeight={700}>{title}</Typography>
            <Stack direction="row" spacing={0.5} alignItems="center">
                {action}
                {onClose ? (
                    <IconButton size="small" onClick={onClose}>
                        <CloseIcon fontSize="small" />
                    </IconButton>
                ) : null}
            </Stack>
        </Stack>
    )
}

export function LibraryPanel({ onCreateEntity, primitives = PRIMITIVES, lights = LIGHTS }) {
    return (
        <>
            <div className="scc-section">
                <div className="scc-section-label">Primitives</div>
                <div className="scc-buttons">
                    {primitives.map(({ key, label }) => (
                        <button key={key} className="scc-btn" onClick={() => onCreateEntity(key)}>
                            {label}
                        </button>
                    ))}
                </div>
            </div>
            {lights.length > 0 && (
                <div className="scc-section">
                    <div className="scc-section-label">Lights</div>
                    <div className="scc-buttons">
                        {lights.map(({ key, label }) => (
                            <button key={key} className="scc-btn" onClick={() => onCreateEntity(key)}>
                                {label}
                            </button>
                        ))}
                    </div>
                </div>
            )}
        </>
    )
}

// Jam mode's whole inspector: the two edits a first-timer actually wants —
// their text and its color — plus Remove. Everything routes through the same
// updateComponent patch pipeline as the full inspector (merge semantics), so
// flipping to "All tools" later shows the exact same values.
const HEX_COLOR = /^#[0-9a-fA-F]{6}$/
export function JamEditPanel({ entity, onInspectorChange, onDeleteSelected }) {
    if (!entity) {
        return <p className="sfp-empty">Tap an object to edit it.</p>
    }
    const textValue = entity.components?.text?.value ?? ''
    const appearance = entity.components?.appearance
    const colorValue = HEX_COLOR.test(appearance?.color || '') ? appearance.color : '#ffffff'
    return (
        <>
            {entity.type === 'text' && (
                <div className="insp-field">
                    <label className="insp-label" htmlFor={`jam-text-${entity.id}`}>Your text</label>
                    <textarea
                        id={`jam-text-${entity.id}`}
                        className="insp-input"
                        rows={3}
                        value={textValue}
                        onChange={(event) => onInspectorChange?.('text', { value: event.target.value })}
                    />
                </div>
            )}
            {appearance && (
                <ColorField
                    label="Colour"
                    value={colorValue}
                    onChange={(next) => onInspectorChange?.('appearance', { color: next })}
                />
            )}
            {onDeleteSelected && (
                <div className="scc-section">
                    <div className="scc-buttons">
                        <button className="scc-btn" onClick={onDeleteSelected}>✕ Remove</button>
                    </div>
                </div>
            )}
        </>
    )
}

function DriveImportSection({ onDriveImportUrl, onDriveImportSelection }) {
    const drive = useDriveImport({
        importByUrl: onDriveImportUrl,
        importBySelection: onDriveImportSelection,
    })
    return (
        <div className="insp-section">
            <button className="insp-section-btn" onClick={drive.toggleOpen}>
                <span className="scc-section-label">Google Drive</span>
                <span className="insp-arrow">{drive.open ? '▾' : '▸'}</span>
            </button>
            {drive.open && (
                <div className="insp-section-body">
                    <div className="spa-actions">
                        {drive.status?.available && (
                            drive.status.connected ? (
                                <div className="spa-drive-status">
                                    <span className="spa-drive-status-label" title={drive.status.email || ''}>
                                        Connected{drive.status.email ? ` · ${drive.status.email}` : ''}
                                    </span>
                                    <button className="spa-copy-btn" onClick={drive.disconnect}>
                                        Disconnect
                                    </button>
                                </div>
                            ) : (
                                <button className="scc-btn spa-btn-wide" onClick={drive.connect}>
                                    Connect Google Drive
                                </button>
                            )
                        )}
                        {drive.status?.connected && (
                            <>
                                <button className="scc-btn spa-btn-wide" onClick={drive.pick} disabled={drive.busy}>
                                    Pick from Drive
                                </button>
                                <div className="spa-drive-row">
                                    <input
                                        type="text"
                                        className="insp-input"
                                        placeholder="Search files you picked before"
                                        value={drive.search}
                                        onChange={(e) => drive.setSearch(e.target.value)}
                                        onKeyDown={(e) => { if (e.key === 'Enter') drive.runSearch() }}
                                        disabled={drive.listing}
                                    />
                                    <button className="scc-btn" onClick={drive.runSearch} disabled={drive.listing}>
                                        {drive.listing ? '…' : 'Search'}
                                    </button>
                                </div>
                                {drive.files.length > 0 && (
                                    <>
                                        <div className="spa-list">
                                            {drive.files.map((f) => (
                                                <label key={f.id} className={`spa-item${drive.selected.has(f.id) ? ' active' : ''}`}>
                                                    <input
                                                        type="checkbox"
                                                        checked={drive.selected.has(f.id)}
                                                        onChange={() => drive.toggleSelect(f.id)}
                                                    />
                                                    <span className="spa-name" title={f.name}>{f.name}</span>
                                                    <span className="spa-type">{formatAssetSize(Number(f.size) || 0)}</span>
                                                </label>
                                            ))}
                                        </div>
                                        <button
                                            className="scc-btn spa-btn-wide"
                                            onClick={drive.importSelected}
                                            disabled={drive.busy || drive.selected.size === 0}
                                        >
                                            {drive.busy ? 'Importing…' : `Import selected (${drive.selected.size})`}
                                        </button>
                                    </>
                                )}
                            </>
                        )}
                        <div className="spa-drive-row">
                            <input
                                type="text"
                                className="insp-input"
                                placeholder={drive.status?.connected ? '…or paste a Drive link' : 'Paste a public Drive link'}
                                value={drive.url}
                                onChange={(e) => drive.setUrl(e.target.value)}
                                onKeyDown={(e) => { if (e.key === 'Enter') drive.importUrl() }}
                                disabled={drive.busy}
                            />
                            <button className="scc-btn" onClick={drive.importUrl} disabled={drive.busy || !drive.url.trim()}>
                                {drive.busy ? '…' : 'Import'}
                            </button>
                        </div>
                        {drive.notice && (
                            <div className={`spa-drive-notice ${drive.notice.kind === 'error' ? 'is-error' : 'is-ok'}`}>
                                {drive.notice.text}
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    )
}

// Browse the public asset commons and pull assets into this space. Same
// section shape as DriveImportSection: a toggle button, then search + pick.
function CommonsSection({ onCommonsImport }) {
    const [open, setOpen] = useState(false)
    const [search, setSearch] = useState('')
    const [items, setItems] = useState(null) // null = not fetched yet
    const [selected, setSelected] = useState(() => new Set())
    const [busy, setBusy] = useState(false)
    const [listing, setListing] = useState(false)
    const [notice, setNotice] = useState(null)

    const runSearch = async (q = search) => {
        setListing(true)
        setNotice(null)
        try {
            setItems(await listCommonsAssets({ q: q.trim() }))
        } catch (error) {
            setNotice({ kind: 'error', text: error?.message || 'Could not load the commons.' })
        } finally {
            setListing(false)
        }
    }

    const toggleOpen = () => {
        const next = !open
        setOpen(next)
        setNotice(null)
        if (next && items === null) runSearch('')
    }

    const toggleSelect = (id) => {
        setSelected((prev) => {
            const next = new Set(prev)
            if (next.has(id)) next.delete(id)
            else next.add(id)
            return next
        })
    }

    const importSelected = async () => {
        const ids = [...selected]
        if (!ids.length || busy) return
        setBusy(true)
        setNotice(null)
        try {
            const result = await onCommonsImport?.(ids)
            const count = result?.entries?.length || 0
            const failed = result?.failed?.length || 0
            setNotice(count
                ? { kind: 'ok', text: `Imported ${count} asset${count === 1 ? '' : 's'}${failed ? ` · ${failed} skipped` : ''}.` }
                : { kind: 'error', text: 'Nothing was imported.' })
            if (count) setSelected(new Set())
        } catch (error) {
            setNotice({ kind: 'error', text: error?.message || 'Import failed.' })
        } finally {
            setBusy(false)
        }
    }

    return (
        <div className="insp-section">
            <button className="insp-section-btn" onClick={toggleOpen}>
                <span className="scc-section-label">Commons</span>
                <span className="insp-arrow">{open ? '▾' : '▸'}</span>
            </button>
            {open && (
                <div className="insp-section-body">
                    <div className="spa-actions">
                        <div className="spa-drive-row">
                            <input
                                type="text"
                                className="insp-input"
                                placeholder="Search public assets"
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                onKeyDown={(e) => { if (e.key === 'Enter') runSearch() }}
                                disabled={listing}
                            />
                            <button className="scc-btn" onClick={() => runSearch()} disabled={listing}>
                                {listing ? '…' : 'Search'}
                            </button>
                        </div>
                        {Array.isArray(items) && items.length === 0 && (
                            <p className="sfp-empty">Nothing shared yet — mark a space file Public to start the commons.</p>
                        )}
                        {Array.isArray(items) && items.length > 0 && (
                            <>
                                <div className="spa-list">
                                    {items.map((item) => (
                                        <label key={item.id} className={`spa-item${selected.has(item.id) ? ' active' : ''}`}>
                                            <input
                                                type="checkbox"
                                                checked={selected.has(item.id)}
                                                onChange={() => toggleSelect(item.id)}
                                            />
                                            <span className="spa-name" title={item.sharedByLabel ? `${item.name} · by ${item.sharedByLabel}` : item.name}>{item.name}</span>
                                            <span className="spa-type">{formatAssetSize(item.size)}</span>
                                        </label>
                                    ))}
                                </div>
                                <button
                                    className="scc-btn spa-btn-wide"
                                    onClick={importSelected}
                                    disabled={busy || selected.size === 0}
                                >
                                    {busy ? 'Importing…' : `Import selected (${selected.size})`}
                                </button>
                            </>
                        )}
                        {notice && (
                            <div className={`spa-drive-notice ${notice.kind === 'error' ? 'is-error' : 'is-ok'}`}>
                                {notice.text}
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    )
}

const residencyLabel = (item) => {
    if (item.inProject && item.inSpace) return 'project · space'
    return item.inProject ? 'project' : 'space'
}

export function AssetsPanel({ libraryItems = [], onAssetFilesSelected, onCreateFromAsset, onDriveImportUrl, onDriveImportSelection, onToggleAssetShared, onCommonsImport, onDeleteLibraryItem }) {
    const [copied, setCopied] = useState(null)
    const [shareNotice, setShareNotice] = useState('')
    const copyUrl = (asset) => {
        navigator.clipboard.writeText(assetSrc(asset.url)).catch(() => {})
        setCopied(asset.id)
        setTimeout(() => setCopied(null), 1500)
    }
    const toggleShare = async (asset) => {
        setShareNotice('')
        try {
            await onToggleAssetShared(asset, !asset.shared)
        } catch (e) {
            setShareNotice(e.message || 'Could not update sharing.')
        }
    }
    return (
        <>
            <div className="scc-section">
                <label className="scc-btn spa-btn-wide" style={{ cursor: 'pointer' }}>
                    ↑ Import files
                    <input type="file" multiple onChange={onAssetFilesSelected} style={{ display: 'none' }} />
                </label>
                <p className="sfp-empty" title={ASSET_FORMAT_HINT}>{ASSET_FORMAT_HINT}</p>
            </div>
            {Boolean(onDriveImportUrl) && (
                <DriveImportSection onDriveImportUrl={onDriveImportUrl} onDriveImportSelection={onDriveImportSelection} />
            )}
            {Boolean(onCommonsImport) && (
                <CommonsSection onCommonsImport={onCommonsImport} />
            )}
            <CollapsibleSection title={`Files (${libraryItems.length})`}>
                {shareNotice && <p className="spa-drive-notice is-error">{shareNotice}</p>}
                {libraryItems.length === 0 ? (
                    <p className="sfp-empty">No files yet — import above, or pull from Drive or the commons.</p>
                ) : (
                    <div className="spa-list">
                        {libraryItems.map((item) => (
                            // drag is a pointer-only shortcut for the accessible "+ Add" button below
                            // eslint-disable-next-line jsx-a11y/no-static-element-interactions
                            <div
                                key={item.id}
                                className="spa-item spa-item--space"
                                draggable={canPlaceInScene(item)}
                                onDragStart={(e) => {
                                    e.dataTransfer.setData('application/x-dii-asset', item.id)
                                    e.dataTransfer.effectAllowed = 'copy'
                                }}
                                title={canPlaceInScene(item) ? 'Drag into the viewport to place it' : undefined}
                            >
                                {item.mimeType?.startsWith('image/') && (
                                    <img
                                        src={assetSrc(item.url)}
                                        alt=""
                                        className="spa-thumb"
                                    />
                                )}
                                <span className="spa-name" title={`${item.name} — ${residencyLabel(item)}`}>
                                    {item.name}
                                    <span className="spa-badges">
                                        {item.usedByCount > 0 && <span className="spa-badge">placed ×{item.usedByCount}</span>}
                                        {item.shared && <span className="spa-badge spa-badge--public">public</span>}
                                    </span>
                                </span>
                                {onCreateFromAsset && (
                                    <button
                                        className="spa-copy-btn"
                                        onClick={() => onCreateFromAsset(item)}
                                        disabled={!canPlaceInScene(item)}
                                        title={canPlaceInScene(item)
                                            ? 'Add to the scene'
                                            : 'This file type can’t be placed in the room — link to it by URL instead'}
                                    >
                                        + Add
                                    </button>
                                )}
                                {onToggleAssetShared && item.inSpace && (
                                    <button
                                        className="spa-copy-btn"
                                        onClick={() => toggleShare(item)}
                                        title={item.shared ? 'Public in the commons — click to unshare' : 'Share to the public commons'}
                                    >
                                        {item.shared ? 'Public' : 'Share'}
                                    </button>
                                )}
                                <button
                                    className="spa-copy-btn"
                                    onClick={() => copyUrl(item)}
                                    title="Copy URL"
                                >
                                    {copied === item.id ? '✓' : 'URL'}
                                </button>
                                {onDeleteLibraryItem && (
                                    <button
                                        className="spa-copy-btn spa-copy-btn--danger"
                                        onClick={() => onDeleteLibraryItem(item)}
                                        title="Delete this file"
                                    >
                                        ×
                                    </button>
                                )}
                            </div>
                        ))}
                    </div>
                )}
                <p className="sfp-empty">
                    <a href="/wiki#studio-content-model" target="_blank" rel="noreferrer">How content flows →</a>
                </p>
            </CollapsibleSection>
        </>
    )
}

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
                <button
                    className={`spa-item${selected ? ' active' : ''}`}
                    aria-pressed={selected}
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
                            {locked ? '■' : '□'}
                        </button>
                    )}
                </button>
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

export function StructurePanel({ entities = [], selectedEntityId, selectedEntityIds = [], onSelectEntity, onToggleSelectEntity, onGroupSelected, onUngroup, onRenameEntity, onToggleEntityVisible, onToggleEntityLocked, onReparentEntity }) {
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
                <span>Objects ({entities.length})</span>
                <span style={{ display: 'flex', gap: 4 }}>
                    {canGroup && onGroupSelected && (
                        <button className="scc-btn scc-btn--xs" onClick={onGroupSelected} title="Group selected (Ctrl+G)">Group</button>
                    )}
                    {canUngroup && onUngroup && (
                        <button className="scc-btn scc-btn--xs" onClick={onUngroup} title="Ungroup (Ctrl+Shift+G)">Ungroup</button>
                    )}
                </span>
            </div>
            {entities.length === 0 ? (
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
                </div>
            )}
        </div>
    )
}

const clampNumber = (value, min, max) => {
    let next = value
    if (Number.isFinite(min)) next = Math.max(min, next)
    if (Number.isFinite(max)) next = Math.min(max, next)
    return next
}

function NumberBox({ value, onChange, min, max, step = 1 }) {
    const bump = (dir) => {
        const current = Number.isFinite(Number(value)) ? Number(value) : 0
        onChange(clampNumber(parseFloat((current + dir * step).toFixed(10)), min, max))
    }
    return (
        <div className="insp-num-wrap">
            <input
                type="number"
                className="insp-input insp-num-input"
                value={value}
                min={min}
                max={max}
                step={step}
                onChange={(event) => {
                    const next = Number(event.target.value)
                    if (Number.isFinite(next)) onChange(clampNumber(next, min, max))
                }}
            />
            <div className="insp-num-arrows">
                <button type="button" className="insp-num-btn" onClick={() => bump(1)} tabIndex={-1}>▲</button>
                <button type="button" className="insp-num-btn" onClick={() => bump(-1)} tabIndex={-1}>▼</button>
            </div>
        </div>
    )
}

function NumberField({ label, value, onChange, min, max, step = 1 }) {
    return (
        <div className="insp-field">
            <label className="insp-label">{label}</label>
            <NumberBox value={value} onChange={onChange} min={min} max={max} step={step} />
        </div>
    )
}

const AXIS_COLOR_VARS = ['var(--axis-x)', 'var(--axis-y)', 'var(--axis-z)']

function MiniRow({ fields }) {
    return (
        <div className="insp-vec3-row">
            {fields.map((field, index) => {
                const color = field.color ?? (field.axis ? AXIS_COLOR_VARS[index] : undefined)
                return (
                    <div className="insp-field insp-field--compact" key={field.label}>
                        <label className="insp-label" style={color ? { color } : undefined}>{field.label}</label>
                        <NumberBox value={field.value} onChange={field.onChange} min={field.min} max={field.max} step={field.step ?? 1} />
                    </div>
                )
            })}
        </div>
    )
}

function SliderField({ label, value, onChange, min, max, step }) {
    const pct = ((value - min) / (max - min)) * 100
    return (
        <div className="insp-field">
            <div className="insp-slider-header">
                <label className="insp-label">{label}</label>
                <span className="insp-slider-value">{value}</span>
            </div>
            <input
                type="range"
                className="insp-slider"
                value={value}
                min={min}
                max={max}
                step={step}
                onChange={(event) => onChange(Number(event.target.value))}
                style={{ '--insp-slider-fill': `${pct}%` }}
            />
        </div>
    )
}

function ColorField({ label, value, onChange }) {
    return (
        <div className="insp-field">
            <label className="insp-label">{label}</label>
            <input type="color" className="insp-color" value={value} onChange={(event) => onChange(event.target.value)} aria-label={label} />
        </div>
    )
}

function ToggleField({ label, checked, onChange }) {
    return (
        <label className="insp-toggle">
            <input type="checkbox" className="insp-toggle-input" checked={checked} onChange={(event) => onChange(event.target.checked)} />
            <span className="insp-toggle-track">
                <span className="insp-toggle-thumb" />
            </span>
            <span className="insp-toggle-label">{label}</span>
        </label>
    )
}

function CollapsibleSection({ title, children, defaultOpen = true }) {
    const [open, setOpen] = useState(defaultOpen)
    return (
        <div className="insp-section">
            <button className="insp-section-btn" onClick={() => setOpen((v) => !v)}>
                <span className="scc-section-label">{title}</span>
                <span className="insp-arrow">{open ? '▾' : '▸'}</span>
            </button>
            {open && (
                <div className="insp-section-body">
                    {children}
                </div>
            )}
        </div>
    )
}

export function ProjectPanel({
    document,
    displayName,
    onDisplayNameChange,
    onProjectMetaPatch,
    onWorldPatch,
    onRenderSettingsPatch,
    onOpenHub
}) {
    const world = document.worldState || defaultWorldState
    const render = document.renderSettings || defaultRenderSettings

    return (
        <div className="insp-root">
            <div className="insp-header">
                <span className="insp-title">{document.projectMeta?.title || 'Untitled Project'}</span>
                <span className="insp-subtitle">PROJECT</span>
            </div>

            <CollapsibleSection title="Identity">
                <div className="insp-field">
                    <label className="insp-label" htmlFor="studio-project-display-name">Display name</label>
                    <input id="studio-project-display-name" className="insp-input" value={displayName} onChange={(event) => onDisplayNameChange(event.target.value)} />
                </div>
                <div className="insp-field">
                    <label className="insp-label" htmlFor="studio-project-title">Project title</label>
                    <input id="studio-project-title" className="insp-input" value={document.projectMeta?.title || ''} onChange={(event) => onProjectMetaPatch({ title: event.target.value })} />
                </div>
            </CollapsibleSection>

            <CollapsibleSection title="Scene">
                <ColorField label="Background" value={world.backgroundColor} onChange={(v) => onWorldPatch({ backgroundColor: v })} />
                <ToggleField label="Atmosphere blend" checked={world.atmosphereBlend === true} onChange={(v) => onWorldPatch({ atmosphereBlend: v })} />
                <ToggleField label="Hub decor (rings + spokes)" checked={world.hubDecor === true} onChange={(v) => onWorldPatch({ hubDecor: v })} />
                <ToggleField label="Grid visible" checked={world.gridVisible !== false} onChange={(v) => onWorldPatch({ gridVisible: v })} />
                <NumberField label="Grid Size" value={world.gridSize} min={1} step={1} onChange={(v) => onWorldPatch({ gridSize: v })} />
                <NumberField label="Cell Size" value={world.gridCellSize} min={0.05} step={0.05} onChange={(v) => onWorldPatch({ gridCellSize: v })} />
                <NumberField label="Cell Thickness" value={world.gridCellThickness} min={0} step={0.05} onChange={(v) => onWorldPatch({ gridCellThickness: v })} />
                <NumberField label="Section Size" value={world.gridSectionSize} min={0.5} step={0.5} onChange={(v) => onWorldPatch({ gridSectionSize: v })} />
                <NumberField label="Section Thickness" value={world.gridSectionThickness} min={0} step={0.05} onChange={(v) => onWorldPatch({ gridSectionThickness: v })} />
                <NumberField label="Fade Distance" value={world.gridFadeDistance} min={0} step={1} onChange={(v) => onWorldPatch({ gridFadeDistance: v })} />
                <NumberField label="Fade Strength" value={world.gridFadeStrength} min={0} step={0.05} onChange={(v) => onWorldPatch({ gridFadeStrength: v })} />
                <ColorField label="Grid cell colour" value={world.gridCellColor} onChange={(v) => onWorldPatch({ gridCellColor: v })} />
                <ColorField label="Grid section colour" value={world.gridSectionColor} onChange={(v) => onWorldPatch({ gridSectionColor: v })} />
            </CollapsibleSection>

            <CollapsibleSection title="Lighting">
                <div className="insp-field">
                    <label className="insp-label" htmlFor="studio-world-envmap">Environment map (.hdr / .exr)</label>
                    <select
                        id="studio-world-envmap"
                        className="insp-select"
                        value={world.environmentAssetId || ''}
                        onChange={(event) => onWorldPatch({ environmentAssetId: event.target.value || null })}
                    >
                        <option value="">None</option>
                        {(document.assets || []).filter((a) => /\.(hdr|exr)$/i.test(a.name || '')).map((a) => (
                            <option key={a.id} value={a.id}>{a.name}</option>
                        ))}
                    </select>
                </div>
                {world.environmentAssetId && (
                    <SliderField label="Environment intensity" value={world.environmentIntensity ?? 1} min={0} max={3} step={0.05} onChange={(v) => onWorldPatch({ environmentIntensity: v })} />
                )}
                <ColorField label="Ambient colour" value={world.ambientLight?.color} onChange={(v) => onWorldPatch({ ambientLight: { color: v } })} />
                <SliderField label="Ambient intensity" value={world.ambientLight?.intensity ?? 0.85} min={0} max={2} step={0.05} onChange={(v) => onWorldPatch({ ambientLight: { intensity: v } })} />
                <ColorField label="Sun colour" value={world.directionalLight?.color} onChange={(v) => onWorldPatch({ directionalLight: { color: v } })} />
                <SliderField label="Sun intensity" value={world.directionalLight?.intensity ?? 1.15} min={0} max={3} step={0.05} onChange={(v) => onWorldPatch({ directionalLight: { intensity: v } })} />
                <div className="insp-vec3-group">
                    <span className="insp-label">Sun position</span>
                    <MiniRow fields={[0, 1, 2].map((axisIndex) => ({
                        label: ['X', 'Y', 'Z'][axisIndex],
                        axis: true,
                        value: world.directionalLight?.position?.[axisIndex] ?? [8, 12, 4][axisIndex],
                        min: -50, step: 0.5,
                        onChange: (v) => {
                            const next = [...(world.directionalLight?.position || [8, 12, 4])]
                            next[axisIndex] = v
                            onWorldPatch({ directionalLight: { position: next } })
                        }
                    }))} />
                </div>
            </CollapsibleSection>

            <CollapsibleSection title="Default camera" defaultOpen={false}>
                <NumberField label="FOV" value={world.savedView?.fov ?? 50} min={1} max={170} step={1} onChange={(v) => onWorldPatch({ savedView: { fov: v } })} />
                <NumberField label="Zoom" value={world.savedView?.zoom ?? 1} min={0.01} step={0.1} onChange={(v) => onWorldPatch({ savedView: { zoom: v } })} />
                <NumberField label="Near" value={world.savedView?.near ?? 0.1} min={0.001} step={0.01} onChange={(v) => onWorldPatch({ savedView: { near: v } })} />
                <NumberField label="Far" value={world.savedView?.far ?? 1000} min={0.01} step={10} onChange={(v) => onWorldPatch({ savedView: { far: v } })} />
            </CollapsibleSection>

            <CollapsibleSection title="Render" defaultOpen={false}>
                <ToggleField label="Shadows" checked={render.shadows !== false} onChange={(v) => onRenderSettingsPatch({ shadows: v })} />
                <ToggleField label="Antialias" checked={render.antialias !== false} onChange={(v) => onRenderSettingsPatch({ antialias: v })} />
                <div className="insp-field">
                    <label className="insp-label" htmlFor="studio-tone-mapping">Tone mapping</label>
                    <select id="studio-tone-mapping" className="insp-select" value={render.toneMapping || 'ACESFilmic'} onChange={(event) => onRenderSettingsPatch({ toneMapping: event.target.value })}>
                        <option value="ACESFilmic">ACES Filmic</option>
                        <option value="none">None</option>
                    </select>
                </div>
                <SliderField label="Exposure" value={render.toneMappingExposure ?? 1} min={0} max={3} step={0.05} onChange={(v) => onRenderSettingsPatch({ toneMappingExposure: v })} />
                <NumberField label="Min DPR" value={render.dprMin ?? 1} min={0.5} max={4} step={0.25} onChange={(v) => onRenderSettingsPatch({ dprMin: v })} />
                <NumberField label="Max DPR" value={render.dprMax ?? 2} min={0.5} max={4} step={0.25} onChange={(v) => onRenderSettingsPatch({ dprMax: v })} />
            </CollapsibleSection>

            <div className="insp-footer">
                <button
                    className="scc-btn spa-btn-wide"
                    onClick={() => {
                        onWorldPatch(defaultWorldState)
                        onRenderSettingsPatch(defaultRenderSettings)
                    }}
                >
                    Reset world &amp; render settings
                </button>
                <button className="scc-btn spa-btn-wide" style={{ marginTop: 6 }} onClick={onOpenHub}>
                    Back to projects
                </button>
            </div>
        </div>
    )
}

export function HistoryPanel({ steps = [], cursor = 0, onJumpTo }) {
    return (
        <CollapsibleSection title={`History (${cursor}/${steps.length})`} defaultOpen={false}>
            {steps.length === 0 ? (
                <p className="sfp-empty">Your edits this session appear here — click a step to jump back or forward.</p>
            ) : (
                <div className="spa-list">
                    <button
                        className={`spa-item${cursor === 0 ? ' active' : ''}`}
                        onClick={() => onJumpTo?.(0)}
                        title="Undo every step of this session"
                    >
                        <span className="spa-name" style={cursor === 0 ? undefined : { opacity: 0.7 }}>Session start</span>
                    </button>
                    {steps.map((step, index) => (
                        <button
                            key={step.id}
                            className={`spa-item${index + 1 === cursor ? ' active' : ''}`}
                            style={step.applied ? undefined : { opacity: 0.45 }}
                            onClick={() => onJumpTo?.(index + 1)}
                            title={step.applied ? 'Jump back to this step' : 'Redo forward to this step'}
                        >
                            <span className="spa-name">{step.label}</span>
                            <span className="spa-type">{formatTimestamp(step.at)}</span>
                        </button>
                    ))}
                </div>
            )}
        </CollapsibleSection>
    )
}

const TIMELINE_KEY_EPSILON = 0.02
const TIMELINE_DEFAULTS = { duration: 5, loop: true, tracks: [] }

const timelineKeyTimes = (timeline) =>
    [...new Set((timeline?.tracks || []).flatMap((track) => (track.keys || []).map((key) => key.t)))].sort((a, b) => a - b)

// Photoshop-history's sibling: per-entity keyframe authoring. Record captures the
// current pose at the playhead; playback preview never writes ops — only key
// edits do, so every change stays a normal undo step.
export function TimelinePanel({ entity, onTimelineChange }) {
    useSyncExternalStore(subscribeTimelinePreview, getTimelinePreviewVersion)
    const preview = getTimelinePreview()
    const stripRef = useRef(null)
    const [dragKey, setDragKey] = useState(null)

    const timeline = entity.components?.timeline || null
    const duration = timeline?.duration ?? TIMELINE_DEFAULTS.duration
    const loop = timeline?.loop ?? TIMELINE_DEFAULTS.loop
    const keyTimes = timelineKeyTimes(timeline)
    const hasKeys = keyTimes.length > 0
    const isActive = preview.entityId === entity.id
    const playhead = isActive ? Math.min(preview.time, duration) : 0
    const keyAtPlayhead = keyTimes.some((t) => Math.abs(t - playhead) < TIMELINE_KEY_EPSILON)

    useEffect(() => () => stopTimelinePreview(), [entity.id])

    const base = () => (timeline ? cloneValue(timeline) : cloneValue(TIMELINE_DEFAULTS))

    const scrubTo = (time) => {
        setTimelinePreview({ entityId: entity.id, time, playing: false, hold: true, duration, loop })
    }

    const recordKey = () => {
        const t = Number(playhead.toFixed(2))
        const next = base()
        const transform = entity.components?.transform || {}
        const upsert = (property, value) => {
            let track = next.tracks.find((entry) => entry.property === property)
            if (!track) {
                track = { property, keys: [] }
                next.tracks.push(track)
            }
            const existing = track.keys.find((key) => Math.abs(key.t - t) < TIMELINE_KEY_EPSILON)
            if (existing) {
                existing.t = t
                existing.value = cloneValue(value)
            } else {
                track.keys.push({ t, value: cloneValue(value), easing: 'ease' })
            }
            track.keys.sort((a, b) => a.t - b.t)
        }
        upsert('position', transform.position || [0, 0, 0])
        upsert('rotation', transform.rotation || [0, 0, 0])
        upsert('scale', transform.scale || [1, 1, 1])
        if (typeof entity.components?.appearance?.opacity === 'number') {
            upsert('opacity', entity.components.appearance.opacity)
        }
        onTimelineChange?.(next)
        setTimelinePreview({ entityId: entity.id, time: t, duration: next.duration, loop: next.loop })
    }

    const retimeKey = (from, to) => {
        const clamped = Math.min(duration, Math.max(0, Number(to.toFixed(2))))
        const next = base()
        next.tracks.forEach((track) => {
            track.keys.forEach((key) => {
                if (Math.abs(key.t - from) < TIMELINE_KEY_EPSILON) key.t = clamped
            })
            track.keys.sort((a, b) => a.t - b.t)
        })
        onTimelineChange?.(next)
        scrubTo(clamped)
    }

    const deleteKeysAtPlayhead = () => {
        const next = base()
        next.tracks = next.tracks
            .map((track) => ({ ...track, keys: track.keys.filter((key) => Math.abs(key.t - playhead) >= TIMELINE_KEY_EPSILON) }))
            .filter((track) => track.keys.length)
        onTimelineChange?.(next)
        if (!next.tracks.length) stopTimelinePreview()
    }

    const play = () => {
        if (!hasKeys) return
        const startAt = !loop && playhead >= duration ? 0 : playhead
        setTimelinePreview({ entityId: entity.id, time: startAt, playing: true, hold: false, duration, loop })
    }
    const pause = () => setTimelinePreview({ playing: false, hold: true })

    const stripTimeAt = (clientX) => {
        const rect = stripRef.current?.getBoundingClientRect()
        if (!rect || rect.width === 0) return 0
        return Math.min(duration, Math.max(0, ((clientX - rect.left) / rect.width) * duration))
    }

    return (
        <CollapsibleSection title="Timeline" defaultOpen={hasKeys}>
            <div className="tlp-controls">
                <button
                    className="scc-btn scc-btn--xs"
                    onClick={isActive && preview.playing ? pause : play}
                    disabled={!hasKeys}
                    title={isActive && preview.playing ? 'Pause preview' : 'Play the timeline in the viewport'}
                >
                    {isActive && preview.playing ? '❚❚' : '▶'}
                </button>
                <button
                    className="scc-btn scc-btn--xs"
                    onClick={stopTimelinePreview}
                    disabled={!isActive}
                    title="Stop preview and restore the authored pose"
                >
                    ■
                </button>
                <span className="tlp-time">{playhead.toFixed(2)}s / {duration}s</span>
            </div>
            <div className="insp-field">
                <input
                    type="range"
                    className="insp-slider"
                    min={0}
                    max={duration}
                    step={0.01}
                    value={playhead}
                    onChange={(event) => scrubTo(Number(event.target.value))}
                    aria-label="Timeline playhead"
                    style={{ '--insp-slider-fill': `${(playhead / duration) * 100}%` }}
                />
            </div>
            {hasKeys && (
                <div className="tlp-strip" ref={stripRef}>
                    {keyTimes.map((t) => {
                        const shownAt = dragKey && Math.abs(dragKey.from - t) < TIMELINE_KEY_EPSILON ? dragKey.to : t
                        const active = Math.abs(t - playhead) < TIMELINE_KEY_EPSILON
                        return (
                            <button
                                key={t}
                                className={`tlp-key${active ? ' tlp-key--active' : ''}`}
                                style={{ left: `${(shownAt / duration) * 100}%` }}
                                title={`Key at ${t.toFixed(2)}s — click to jump, drag to retime`}
                                aria-label={`Key at ${t.toFixed(2)} seconds`}
                                onPointerDown={(event) => {
                                    event.currentTarget.setPointerCapture(event.pointerId)
                                    setDragKey({ from: t, to: t })
                                }}
                                onPointerMove={(event) => {
                                    if (!dragKey || Math.abs(dragKey.from - t) >= TIMELINE_KEY_EPSILON) return
                                    setDragKey({ from: t, to: stripTimeAt(event.clientX) })
                                }}
                                onPointerUp={() => {
                                    if (!dragKey) return
                                    if (Math.abs(dragKey.to - dragKey.from) < TIMELINE_KEY_EPSILON) scrubTo(dragKey.from)
                                    else retimeKey(dragKey.from, dragKey.to)
                                    setDragKey(null)
                                }}
                            />
                        )
                    })}
                </div>
            )}
            <div className="scc-buttons">
                <button className="scc-btn scc-btn--xs" onClick={recordKey} title="Capture the current pose as a key at the playhead">
                    ● Key
                </button>
                <button className="scc-btn scc-btn--xs" onClick={deleteKeysAtPlayhead} disabled={!keyAtPlayhead} title="Delete the key at the playhead">
                    × Key
                </button>
            </div>
            <div className="insp-field">
                <label className="insp-label" htmlFor={`tlp-duration-${entity.id}`}>Duration (s)</label>
                <input
                    id={`tlp-duration-${entity.id}`}
                    type="number"
                    className="insp-input"
                    min={0.1}
                    step={0.5}
                    value={duration}
                    onChange={(event) => {
                        const next = base()
                        next.duration = Math.max(0.1, Number(event.target.value) || TIMELINE_DEFAULTS.duration)
                        onTimelineChange?.(next)
                        if (isActive) setTimelinePreview({ duration: next.duration })
                    }}
                />
            </div>
            <ToggleField
                label="Loop"
                checked={loop}
                onChange={(value) => {
                    const next = base()
                    next.loop = value
                    onTimelineChange?.(next)
                    if (isActive) setTimelinePreview({ loop: value })
                }}
            />
            {!hasKeys && (
                <p className="sfp-empty">Move the playhead, pose the object, press ● Key. Two keys make motion.</p>
            )}
        </CollapsibleSection>
    )
}

export function ActivityPanel({ activity = [] }) {
    return (
        <div className="scc-section">
            <div className="scc-section-label">Recent activity</div>
            {activity.length === 0 ? (
                <p className="sfp-empty">No project activity yet.</p>
            ) : (
                <div className="spa-activity">
                    {[...activity].reverse().map((entry) => (
                        <div key={entry.id} className="spa-activity-entry">
                            <div className="spa-activity-header">
                                <span className={`spa-activity-level spa-activity-level--${entry.level || 'info'}`}>
                                    {entry.level || 'info'}
                                </span>
                                <span className="spa-activity-time">{formatTimestamp(entry.timestamp)}</span>
                            </div>
                            <p className="spa-activity-msg">{entry.message}</p>
                        </div>
                    ))}
                </div>
            )}
        </div>
    )
}

export function FilesPanel({
    presentationState,
    onPresentationPatch,
    libraryItems = []
}) {
    const singleFileInputRef = useRef(null)
    const zipInputRef = useRef(null)
    const folderInputRef = useRef(null)
    const editorInputRef = useRef(null)
    const [activeFileName, setActiveFileName] = useState('index.html')
    const [showAddFile, setShowAddFile] = useState(false)
    const [newFileName, setNewFileName] = useState('')
    const [renameValue, setRenameValue] = useState(null) // null = not renaming
    const [insertAssetId, setInsertAssetId] = useState('')
    const [insertNotice, setInsertNotice] = useState('')
    const [embedOpen, setEmbedOpen] = useState(false)
    const [urlDraft, setUrlDraft] = useState(presentationState?.codeUrl || '')

    const files = presentationState?.codeFiles || []
    const hasLegacyHtml = Boolean(presentationState?.codeHtml && files.length === 0)
    const activeFile = files.find((f) => f.name === activeFileName) || files[0] || null

    const setFiles = (nextFiles) => onPresentationPatch({ codeFiles: nextFiles })

    const applyTemplate = (template) => {
        setFiles([{ name: 'index.html', content: template.html }])
        setActiveFileName('index.html')
        onPresentationPatch({ codeSourceType: 'html' })
    }

    const updateActiveContent = (content) => {
        const name = activeFile?.name
        if (!name) return
        setFiles(files.map((f) => (f.name === name ? { ...f, content } : f)))
    }

    const addFile = () => {
        const name = newFileName.trim()
        if (!name || files.find((f) => f.name === name)) return
        setFiles([...files, { name, content: '' }])
        setActiveFileName(name)
        setNewFileName('')
        setShowAddFile(false)
    }

    const removeFile = (name) => {
        const next = files.filter((f) => f.name !== name)
        setFiles(next)
        if (activeFileName === name) setActiveFileName(next[0]?.name || '')
    }

    const handleImportSingle = async (event) => {
        const file = event.target.files?.[0]
        event.target.value = ''
        if (!file) return
        const content = await file.text()
        const name = normalizeFileName(file.name)
        const existing = files.find((f) => f.name === name)
        if (existing) {
            setFiles(files.map((f) => (f.name === name ? { ...f, content } : f)))
        } else {
            setFiles([...files, { name, content }])
        }
        setActiveFileName(name)
    }

    const handleImportZip = async (event) => {
        const file = event.target.files?.[0]
        event.target.value = ''
        if (!file) return
        try {
            const zip = await JSZip.loadAsync(file)
            const entries = []
            zip.forEach((relativePath, entry) => {
                if (!entry.dir && isSupportedFile(relativePath)) entries.push({ relativePath, entry })
            })
            const loaded = await Promise.all(
                entries.map(async ({ relativePath, entry }) => ({
                    name: normalizeFileName(relativePath),
                    content: await entry.async('text')
                }))
            )
            if (loaded.length > 0) {
                setFiles(loaded)
                const root = loaded.find((f) => f.name === 'index.html') || loaded[0]
                setActiveFileName(root.name)
            }
        } catch { /* ignore malformed zips */ }
    }

    const handleImportFolder = async (event) => {
        const fileList = Array.from(event.target.files || [])
        event.target.value = ''
        if (!fileList.length) return
        const loaded = await Promise.all(
            fileList
                .filter((f) => isSupportedFile(f.name))
                .map(async (f) => ({
                    name: normalizeFileName(f.webkitRelativePath || f.name),
                    content: await f.text()
                }))
        )
        if (loaded.length > 0) {
            setFiles(loaded)
            const root = loaded.find((f) => f.name.endsWith('index.html')) || loaded[0]
            setActiveFileName(root.name)
        }
    }

    const handleExportZip = async () => {
        if (files.length === 0) return
        const zip = new JSZip()
        for (const f of files) zip.file(f.name, f.content)
        const blob = await zip.generateAsync({ type: 'blob' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url; a.download = 'project.zip'; a.click()
        window.setTimeout(() => URL.revokeObjectURL(url), 1_000)
    }

    // Rename a code file and rewrite href/src references to it in the html
    // files (best-effort — same string-match approach bundleCodeFiles uses).
    const renameActiveFile = () => {
        const oldName = activeFile?.name
        const name = normalizeFileName((renameValue || '').trim())
        setRenameValue(null)
        if (!oldName || !name || name === oldName || files.find((f) => f.name === name)) return
        const escaped = oldName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        const pattern = new RegExp(`(["'])${escaped}\\1`, 'g')
        setFiles(files.map((f) => {
            const renamed = f.name === oldName ? { ...f, name } : f
            if (/\.html?$/i.test(renamed.name)) {
                return { ...renamed, content: (renamed.content || '').replace(pattern, `$1${name}$1`) }
            }
            return renamed
        }))
        setActiveFileName(name)
    }

    // Write the asset's URL at the cursor of the active file; fall back to the
    // clipboard when there's no editable target.
    const insertAssetUrl = () => {
        const item = libraryItems.find((a) => a.id === insertAssetId)
        if (!item) return
        const url = assetSrc(item.url)
        const input = editorInputRef.current
        if (activeFile && input && typeof input.selectionStart === 'number') {
            const start = input.selectionStart
            const end = input.selectionEnd ?? start
            const content = activeFile.content || ''
            updateActiveContent(content.slice(0, start) + url + content.slice(end))
            requestAnimationFrame(() => {
                input.focus()
                const pos = start + url.length
                input.setSelectionRange(pos, pos)
            })
            setInsertNotice('')
        } else {
            navigator.clipboard.writeText(url).catch(() => {})
            setInsertNotice('URL copied — no open file to insert into.')
        }
    }

    const previewMode = presentationState?.mode || 'scene'

    return (
        <Stack spacing={0} sx={{ p: 0, height: '100%' }}>
            {/* ── viewport preview toggle: the switch lives with the code ── */}
            <Stack direction="row" spacing={0.5} sx={{ px: 1, py: 0.75, borderBottom: 1, borderColor: 'divider', alignItems: 'center' }}>
                <Typography variant="caption" color="text.secondary" sx={{ mr: 0.5 }}>Viewport shows</Typography>
                <Button
                    size="small"
                    variant={previewMode === 'scene' ? 'contained' : 'outlined'}
                    onClick={() => onPresentationPatch?.({ mode: 'scene' })}
                >
                    3D room
                </Button>
                <Button
                    size="small"
                    variant={previewMode === 'code' ? 'contained' : 'outlined'}
                    onClick={() => onPresentationPatch?.({ mode: 'code' })}
                >
                    Code view
                </Button>
            </Stack>
            {/* ── file tabs ── */}
            {files.length > 0 ? (
                <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, px: 1, pt: 0.5 }}>
                        <Tabs
                            value={activeFile?.name || false}
                            onChange={(_, name) => setActiveFileName(name)}
                            variant="scrollable"
                            scrollButtons="auto"
                            sx={{ flex: 1, minWidth: 0, '& .MuiTab-root': { minWidth: 0, px: 1.5, py: 0.5, fontSize: '0.72rem' } }}
                        >
                            {files.map((f) => (
                                <Tab
                                    key={f.name}
                                    value={f.name}
                                    label={
                                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                            <span>{f.name}</span>
                                            <IconButton size="small" onClick={(e) => { e.stopPropagation(); removeFile(f.name) }} sx={{ p: 0, ml: 0.25 }}>
                                                <CloseIcon sx={{ fontSize: 11 }} />
                                            </IconButton>
                                        </Box>
                                    }
                                />
                            ))}
                        </Tabs>
                        <IconButton size="small" onClick={() => setShowAddFile((v) => !v)} title="New file">
                            <AddIcon fontSize="small" />
                        </IconButton>
                    </Box>
                    {showAddFile && (
                        <Stack direction="row" spacing={1} sx={{ px: 1, pb: 1 }}>
                            <TextField
                                inputRef={el => el?.focus()} size="small" placeholder="style.css"
                                value={newFileName} onChange={(e) => setNewFileName(e.target.value)}
                                onKeyDown={(e) => { if (e.key === 'Enter') addFile(); if (e.key === 'Escape') { setShowAddFile(false); setNewFileName('') } }}
                                sx={{ flex: 1 }}
                            />
                            <Button size="small" variant="contained" onClick={addFile} disabled={!newFileName.trim()}>Add</Button>
                        </Stack>
                    )}
                </Box>
            ) : (
                <Box sx={{ p: 1.5, borderBottom: 1, borderColor: 'divider' }}>
                    {hasLegacyHtml && (
                        <Button size="small" variant="outlined" fullWidth sx={{ mb: 1 }}
                            onClick={() => { onPresentationPatch({ codeFiles: [{ name: 'index.html', content: presentationState.codeHtml }], codeHtml: '' }); setActiveFileName('index.html') }}
                        >Convert legacy HTML → index.html</Button>
                    )}
                    <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1 }}>
                        No code files yet — start from a template, or read <a href="/wiki#studio-content-model" target="_blank" rel="noreferrer" style={{ color: 'inherit' }}>how content flows →</a>
                    </Typography>
                    <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 1, mb: 1.5 }}>
                        {presentationStarterTemplates.map((template) => (
                            <Paper key={template.id} variant="outlined" onClick={() => applyTemplate(template)}
                                sx={{ p: 1, cursor: 'pointer', '&:hover': { borderColor: 'primary.light', bgcolor: 'action.hover' } }}>
                                <Typography variant="caption" color="text.secondary" display="block">{template.eyebrow}</Typography>
                                <Typography variant="body2" fontWeight={600}>{template.name}</Typography>
                            </Paper>
                        ))}
                    </Box>
                    <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
                        <Button size="small" variant="outlined" onClick={() => singleFileInputRef.current?.click()}>+ File</Button>
                        <Button size="small" variant="outlined" onClick={() => zipInputRef.current?.click()}>+ .zip</Button>
                        <Button size="small" variant="outlined" onClick={() => folderInputRef.current?.click()}>+ folder</Button>
                        <Button size="small" variant="outlined" onClick={() => { setFiles([{ name: 'index.html', content: '' }]); setActiveFileName('index.html') }}>blank index.html</Button>
                    </Stack>
                </Box>
            )}

            {/* ── code editor ── */}
            {activeFile && (
                <Box sx={{ px: 1, pt: 1, flex: 1 }}>
                    <TextField
                        key={activeFile.name}
                        multiline fullWidth
                        minRows={14}
                        value={activeFile.content}
                        onChange={(e) => updateActiveContent(e.target.value)}
                        inputRef={editorInputRef}
                        inputProps={{ style: { fontFamily: 'monospace', fontSize: '0.76rem', lineHeight: 1.5 } }}
                        sx={{ '& .MuiInputBase-root': { p: 1 } }}
                    />
                    {renameValue !== null && (
                        <Stack direction="row" spacing={1} sx={{ mt: 0.75 }}>
                            <TextField
                                inputRef={(el) => el?.focus()} size="small" placeholder={activeFile.name}
                                value={renameValue} onChange={(e) => setRenameValue(e.target.value)}
                                onKeyDown={(e) => { if (e.key === 'Enter') renameActiveFile(); if (e.key === 'Escape') setRenameValue(null) }}
                                sx={{ flex: 1 }}
                            />
                            <Button size="small" variant="contained" onClick={renameActiveFile} disabled={!renameValue.trim()}>Rename</Button>
                        </Stack>
                    )}
                    <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap sx={{ mt: 0.75, mb: 1 }}>
                        <Button size="small" variant="outlined" onClick={() => setRenameValue(activeFile.name)}>Rename</Button>
                        <Button size="small" variant="outlined" onClick={() => singleFileInputRef.current?.click()}>↑ Import</Button>
                        <Button size="small" variant="outlined" onClick={() => zipInputRef.current?.click()}>↑ .zip</Button>
                        <Button size="small" variant="outlined" onClick={() => folderInputRef.current?.click()}>↑ folder</Button>
                        <Button size="small" variant="outlined" onClick={handleExportZip}>↓ Export</Button>
                    </Stack>
                </Box>
            )}

            {/* ── code ↔ files bridge: drop any library file's URL into the code ── */}
            {libraryItems.length > 0 && (
                <Box sx={{ borderTop: 1, borderColor: 'divider', px: 1.5, py: 1 }}>
                    <Stack direction="row" spacing={1} alignItems="center">
                        <TextField
                            select size="small" label="Project file" value={insertAssetId}
                            onChange={(e) => setInsertAssetId(e.target.value)}
                            sx={{ flex: 1, minWidth: 0 }}
                        >
                            {libraryItems.map((item) => (
                                <MenuItem key={item.id} value={item.id}>{item.name}</MenuItem>
                            ))}
                        </TextField>
                        <Button size="small" variant="outlined" onClick={insertAssetUrl} disabled={!insertAssetId}>
                            Insert URL
                        </Button>
                    </Stack>
                    {insertNotice && (
                        <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 0.5 }}>{insertNotice}</Typography>
                    )}
                </Box>
            )}

            {/* ── embed an external site instead of local files ── */}
            <Box sx={{ borderTop: 1, borderColor: 'divider', px: 1.5, py: 1 }}>
                <Button size="small" variant="text" onClick={() => setEmbedOpen((v) => !v)}
                    sx={{ fontSize: '0.7rem', color: 'text.secondary', p: 0, mb: 0.5 }}>
                    {embedOpen ? '▾' : '▸'} Embed external URL{presentationState?.codeSourceType === 'url' ? ' (active)' : ''}
                </Button>
                {embedOpen && (
                    <Stack spacing={1}>
                        <Stack direction="row" spacing={1}>
                            <TextField
                                size="small" placeholder="https://example.com" value={urlDraft}
                                onChange={(e) => setUrlDraft(e.target.value)}
                                sx={{ flex: 1 }}
                            />
                            <Button
                                size="small" variant="outlined"
                                onClick={() => onPresentationPatch?.({ codeUrl: urlDraft.trim(), codeSourceType: 'url' })}
                                disabled={!urlDraft.trim()}
                            >
                                Use URL
                            </Button>
                        </Stack>
                        {presentationState?.codeSourceType === 'url' && (
                            <Button size="small" variant="text" sx={{ alignSelf: 'flex-start', p: 0 }}
                                onClick={() => onPresentationPatch?.({ codeSourceType: 'html' })}>
                                Back to code files
                            </Button>
                        )}
                    </Stack>
                )}
            </Box>

            <input ref={singleFileInputRef} type="file" accept={SUPPORTED_EXTENSIONS.map((e) => `.${e}`).join(',')} aria-label="Import single file" style={{ display: 'none' }} onChange={handleImportSingle} />
            <input ref={zipInputRef} type="file" accept=".zip,application/zip" aria-label="Import zip" style={{ display: 'none' }} onChange={handleImportZip} />
            <input ref={folderInputRef} type="file" webkitdirectory="" aria-label="Import folder" style={{ display: 'none' }} onChange={handleImportFolder} />
        </Stack>
    )
}

export function PublishPanel({
    document,
    publishState,
    liveProjectState,
    onPublishPatch,
    onSetLiveProject,
    onClearLiveProject,
    onMakeSpacePublic,
    onCopyShareLink,
    onExportProject,
    exportStatus,
    onImportProjectFile,
    xrState,
    presentationState,
    onPresentationPatch,
    onSaveCurrentCamera,
    activity
}) {
    const [activityOpen, setActivityOpen] = useState(false)
    const { type: authType } = useAuthSession()
    const isGuest = authType === 'guest'
    const [providers, setProviders] = useState(null)

    useEffect(() => {
        if (!isGuest) return undefined
        let cancelled = false
        getApiAuthProviders()
            .then((next) => { if (!cancelled) setProviders(next) })
            .catch(() => { if (!cancelled) setProviders({ github: false, google: false }) })
        return () => { cancelled = true }
    }, [isGuest])

    const exportButton = (
        <Button
            variant="outlined"
            startIcon={<RocketLaunchIcon />}
            onClick={onExportProject}
            disabled={Boolean(exportStatus && exportStatus.phase !== 'error')}
        >
            {exportStatus?.phase === 'downloading'
                ? `Exporting ${exportStatus.completed}/${exportStatus.total}`
                : exportStatus?.phase === 'packing'
                    ? `Packing ${Math.round(exportStatus.percent || 0)}%`
                    : 'Export project'}
        </Button>
    )

    // The moment a guest opens Share is the moment their work became worth
    // keeping — meet it with the upgrade path, not publish controls their
    // temporary sandbox can't meaningfully use.
    if (isGuest) {
        return (
            <Stack spacing={2} sx={{ p: 2 }}>
                <Card variant="outlined" sx={{ p: 2 }}>
                    <Stack spacing={1.5} alignItems="flex-start">
                        <Typography variant="subtitle2">Keep this work</Typography>
                        <Typography variant="body2" color="text.secondary">
                            You’re building in a temporary guest sandbox — it disappears after about a
                            week. Sign in and the room comes with you: your sandbox, everything in it,
                            kept on your account.
                        </Typography>
                        {providers?.github ? (
                            <Button variant="contained" onClick={() => { window.location.href = getOAuthUrl('github') }}>
                                Continue with GitHub
                            </Button>
                        ) : null}
                        {providers?.google ? (
                            <Button
                                variant={providers?.github ? 'outlined' : 'contained'}
                                onClick={() => { window.location.href = getOAuthUrl('google') }}
                            >
                                Continue with Google
                            </Button>
                        ) : null}
                    </Stack>
                </Card>
                <Card variant="outlined" sx={{ p: 1.5 }}>
                    <Stack spacing={1} alignItems="flex-start">
                        <Typography variant="subtitle2">No account? Take it with you</Typography>
                        <Typography variant="body2" color="text.secondary">
                            Export downloads the whole project — you can import it into any space later.
                        </Typography>
                        {exportButton}
                    </Stack>
                </Card>
            </Stack>
        )
    }

    return (
        <Stack spacing={2} sx={{ p: 2 }}>
            <FormControlLabel
                control={(
                    <Switch
                        checked={Boolean(publishState.shareEnabled)}
                        onChange={(event) => onPublishPatch({ shareEnabled: event.target.checked })}
                    />
                )}
                label="Share enabled"
            />
            <Card variant="outlined" sx={{ p: 1.5 }}>
                <Stack spacing={1}>
                    <Typography variant="subtitle2">Live space link</Typography>
                    <Typography variant="body2" color="text.secondary">
                        Public link: `/{liveProjectState?.spaceId || 'main'}`
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                        {liveProjectState?.isLiveProject
                            ? 'This project is currently live for the space viewer.'
                            : liveProjectState?.currentLiveProjectId
                                ? `Another project is currently live in this space: ${liveProjectState.currentLiveProjectId}`
                                : 'No live project is set for this space yet.'}
                    </Typography>
                    {liveProjectState?.isPublic === true ? (
                        <Typography variant="body2" color="success.main">
                            Space is public — visitors can enter at the link above.
                        </Typography>
                    ) : liveProjectState?.isPublic === false ? (
                        <Stack spacing={1} alignItems="flex-start">
                            <Typography variant="body2" color="warning.main">
                                ⚠ Space is private — visitors will see a login wall, not the project.
                            </Typography>
                            <Button
                                variant="outlined"
                                size="small"
                                onClick={onMakeSpacePublic}
                                disabled={liveProjectState?.isUpdating}
                            >
                                Make space public
                            </Button>
                        </Stack>
                    ) : null}
                    <Stack direction={{ xs: 'column', md: 'row' }} spacing={1}>
                        <Button
                            variant={liveProjectState?.isLiveProject ? 'contained' : 'outlined'}
                            onClick={onSetLiveProject}
                            disabled={!publishState.shareEnabled || liveProjectState?.isUpdating || liveProjectState?.isLiveProject}
                        >
                            {liveProjectState?.isLiveProject ? 'Currently live' : 'Set as live project'}
                        </Button>
                        <Button
                            variant="text"
                            color="inherit"
                            onClick={onClearLiveProject}
                            disabled={!liveProjectState?.isLiveProject || liveProjectState?.isUpdating}
                        >
                            Clear live project
                        </Button>
                    </Stack>
                    {!publishState.shareEnabled ? (
                        <Typography variant="caption" color="warning.main">
                            Enable sharing before setting this project live for the public space link.
                        </Typography>
                    ) : null}
                </Stack>
            </Card>
            <Card variant="outlined" sx={{ p: 1.5 }}>
                <Stack spacing={1.5}>
                    <Typography variant="subtitle2">Presentation</Typography>
                    <Typography variant="caption" color="text.secondary">
                        The session preview toggle (3D room ↔ Code view) lives in the Code window.
                    </Typography>
                    <FormControl fullWidth size="small">
                        <InputLabel>Public entry view</InputLabel>
                        <Select
                            label="Public entry view"
                            value={presentationState?.entryView || 'scene'}
                            onChange={(event) => onPresentationPatch?.({ entryView: event.target.value })}
                        >
                            <MenuItem value="scene">3D room</MenuItem>
                            <MenuItem value="code">Code view</MenuItem>
                        </Select>
                    </FormControl>
                    <Stack direction={{ xs: 'column', md: 'row' }} spacing={1}>
                        <Button variant="outlined" onClick={onSaveCurrentCamera}>Save current view</Button>
                    </Stack>
                </Stack>
            </Card>
            <FormControl fullWidth size="small">
                <InputLabel>XR default</InputLabel>
                <Select
                    label="XR default"
                    // AR is the default everywhere; legacy 'none' is treated as AR
                    // (it was only ever the old default, never a deliberate "off").
                    value={publishState.xrDefaultMode === 'vr' ? 'vr' : publishState.xrDefaultMode === 'off' ? 'off' : 'ar'}
                    onChange={(event) => onPublishPatch({ xrDefaultMode: event.target.value })}
                >
                    <MenuItem value="ar">AR (default)</MenuItem>
                    <MenuItem value="vr">VR</MenuItem>
                    <MenuItem value="off">Off</MenuItem>
                </Select>
            </FormControl>
            <Stack direction={{ xs: 'column', md: 'row' }} spacing={1}>
                <Button variant="contained" startIcon={<ShareIcon />} onClick={onCopyShareLink}>
                    Copy share link
                </Button>
                {exportButton}
                <Button component="label" variant="outlined">
                    Import project
                    <input
                        hidden
                        type="file"
                        accept=".json,.zip,application/json,application/zip"
                        onChange={onImportProjectFile}
                    />
                </Button>
            </Stack>
            {exportStatus?.phase === 'error' ? (
                <Typography variant="caption" color="error.main">
                    Export failed: {exportStatus.message}
                </Typography>
            ) : exportStatus ? (
                <Typography variant="caption" color="text.secondary">
                    Keep this tab open while Studio bundles the project assets.
                </Typography>
            ) : null}
            <Typography variant="body2" color="text.secondary">
                XR support: VR {xrState.supportedXrModes.vr ? 'available' : 'unavailable'} • AR {xrState.supportedXrModes.ar ? 'available' : 'unavailable'} — enter from the XR section of the control cluster.
            </Typography>
            <Typography variant="body2" color="text.secondary">
                Last export: {formatTimestamp(document.publishState?.lastExportAt)}
            </Typography>
            <Card variant="outlined" sx={{ p: 1.5 }}>
                <Stack spacing={1}>
                    <Button
                        variant="text"
                        size="small"
                        onClick={() => setActivityOpen((v) => !v)}
                        sx={{ alignSelf: 'flex-start', p: 0, minWidth: 0 }}
                    >
                        Activity {activityOpen ? '▾' : '▸'}
                    </Button>
                    {activityOpen && <ActivityPanel activity={activity} />}
                </Stack>
            </Card>
        </Stack>
    )
}

export function PopoutDialog({ title, open, onClose, children }) {
    return (
        <Dialog open={open} onClose={onClose} fullWidth maxWidth="md">
            <DialogTitle sx={{ pr: 6 }}>
                {title}
                <IconButton
                    aria-label="Close dialog"
                    onClick={onClose}
                    sx={{ position: 'absolute', right: 8, top: 8 }}
                >
                    <CloseIcon />
                </IconButton>
            </DialogTitle>
            <DialogContent dividers sx={{ p: 0 }}>
                {children}
            </DialogContent>
        </Dialog>
    )
}
