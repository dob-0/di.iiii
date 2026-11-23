import { useState } from 'react'
import { useDriveImport } from '../../../hooks/useDriveImport.js'
import { listCommonsAssets } from '../../../services/serverSpaces.js'
import { formatAssetSize } from '../../utils/assetOptimization.js'
import { ASSET_ACCEPT, ASSET_FORMAT_HINT, canPlaceInScene } from '../../utils/assetFormats.js'
import { assetSrc } from './panelUtils.js'
import { CollapsibleSection } from './fields.jsx'

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

export function AssetsPanel({ libraryItems = [], onAssetFilesSelected, onCreateFromAsset, onDriveImportUrl, onDriveImportSelection, onToggleAssetShared, onCommonsImport, onDeleteLibraryItem, filesWaitForFirst = false }) {
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
                    <input type="file" multiple accept={ASSET_ACCEPT} onChange={onAssetFilesSelected} style={{ display: 'none' }} />
                </label>
                <p className="sfp-empty" title={ASSET_FORMAT_HINT}>{ASSET_FORMAT_HINT}</p>
            </div>
            {Boolean(onDriveImportUrl) && (
                <DriveImportSection onDriveImportUrl={onDriveImportUrl} onDriveImportSelection={onDriveImportSelection} />
            )}
            {Boolean(onCommonsImport) && (
                <CommonsSection onCommonsImport={onCommonsImport} />
            )}
            {/* A new project's Create window: the list of files waits for the
                first file, the way the Cues section waits for a cue. */}
            {!(filesWaitForFirst && libraryItems.length === 0) && (
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
                        <a className="sfp-link" href="/wiki#studio-content-model" target="_blank" rel="noreferrer">How content flows →</a>
                    </p>
                </CollapsibleSection>
            )}
        </>
    )
}
