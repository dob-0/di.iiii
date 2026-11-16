import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import DesktopWindow from '../../raw/components/DesktopWindow.jsx'
import { framesFromRects, snapFrame, unitSize } from '../../perform/presets.js'
import { nextWindowId } from '../../perform/windowKeys.js'
import { Hint } from './PreferencesShared.jsx'
import AdminWindowBody, { windowMoreItems } from './AdminWindowBodies.jsx'
import {
    ADMIN_GROUPS,
    ADMIN_KEYS,
    GRID,
    adminKeyAction,
    arrangeAll,
    availableKinds,
    closeAll,
    closeWindow,
    deskWidthClass,
    focusWindow,
    kindOf,
    loadLayout,
    openWindow,
    parseAdminHash,
    placeWindow,
    rectFromFrame,
    restrictLayout,
    saveLayout,
    toggleMaximize
} from './adminWindows.js'
import useAdminTiles from './useAdminTiles.js'
import '../../styles/adminDesk.css'

// THE ADMIN DESK. /admin is one desk in di.iiii's window style: a tile per section (a number or a
// state, no sentence), and a click opens the section as a window — several side by side, dragged,
// resized, maximised, closed, remembered per device. The windows are the Nodes/Perform DesktopWindow
// in `screen` space on the unit grid; the table of what a window is lives in adminWindows.js.
// A phone (< 600 px) shows the tiles, and one window at a time filling the screen.

const BAR_FALLBACK = 48

const useViewport = () => {
    const read = () => ({ width: typeof window === 'undefined' ? 1440 : window.innerWidth, height: typeof window === 'undefined' ? 900 : window.innerHeight })
    const [size, setSize] = useState(read)
    useEffect(() => {
        const on = () => setSize(read())
        window.addEventListener('resize', on)
        return () => window.removeEventListener('resize', on)
    }, [])
    return size
}

// Three small squares: the "more" menu mark, drawn, not a Unicode glyph.
const MoreMark = () => (
    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true" focusable="false">
        <rect x="1" y="6" width="2.5" height="2.5" fill="currentColor" />
        <rect x="5.75" y="6" width="2.5" height="2.5" fill="currentColor" />
        <rect x="10.5" y="6" width="2.5" height="2.5" fill="currentColor" />
    </svg>
)

function useMenu() {
    const [open, setOpen] = useState(false)
    const ref = useRef(null)
    useEffect(() => {
        if (!open) return undefined
        const onKey = (event) => { if (event.key === 'Escape') { event.stopPropagation(); setOpen(false) } }
        const onDown = (event) => { if (ref.current && !ref.current.contains(event.target)) setOpen(false) }
        window.addEventListener('keydown', onKey, true)
        window.addEventListener('pointerdown', onDown)
        return () => { window.removeEventListener('keydown', onKey, true); window.removeEventListener('pointerdown', onDown) }
    }, [open])
    return { open, setOpen, ref }
}

function WindowsMenu({ kinds, openKeys, onChoose, onCloseAll }) {
    const { open, setOpen, ref } = useMenu()
    return (
        <span className="admin-menu-anchor" ref={ref}>
            <button type="button" className="admin-bar-button" aria-haspopup="true" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
                Windows{openKeys.length ? ` · ${openKeys.length}` : ''}
            </button>
            {open ? (
                <div className="admin-menu" role="menu" aria-label="Windows">
                    {kinds.map((kind) => (
                        <button
                            key={kind.key}
                            type="button"
                            role="menuitemcheckbox"
                            aria-checked={openKeys.includes(kind.key)}
                            className={`admin-menu-item${openKeys.includes(kind.key) ? ' is-on' : ''}`}
                            onClick={() => { onChoose(kind.key); setOpen(false) }}
                        >
                            <span className="admin-menu-mark" aria-hidden="true" />
                            {kind.label}
                        </button>
                    ))}
                    <button type="button" role="menuitem" className="admin-menu-item admin-menu-sep" disabled={!openKeys.length} onClick={() => { onCloseAll(); setOpen(false) }}>
                        Close all
                    </button>
                </div>
            ) : null}
        </span>
    )
}

function Find({ kinds, onOpen, inputRef }) {
    const [text, setText] = useState('')
    const query = text.trim().toLowerCase()
    const matches = query ? kinds.filter((kind) => kind.label.toLowerCase().includes(query) || kind.key.includes(query)) : []
    const pick = (key) => { onOpen(key); setText('') }
    return (
        <span className="admin-find">
            <input
                ref={inputRef}
                type="search"
                className="admin-find-input"
                aria-label="Find a window"
                placeholder="Find"
                value={text}
                onChange={(event) => setText(event.target.value)}
                onKeyDown={(event) => {
                    if (event.key === 'Enter' && matches[0]) pick(matches[0].key)
                    if (event.key === 'Escape') { setText(''); event.target.blur() }
                }}
            />
            {matches.length ? (
                <div className="admin-menu admin-find-list" role="listbox" aria-label="Matches">
                    {matches.map((kind) => (
                        <button key={kind.key} type="button" role="option" aria-selected="false" className="admin-menu-item" onMouseDown={(e) => e.preventDefault()} onClick={() => pick(kind.key)}>
                            {kind.label}
                        </button>
                    ))}
                </div>
            ) : null}
        </span>
    )
}

function KeyCard({ onClose }) {
    return (
        <div className="admin-keycard" role="dialog" aria-label="Keys">
            <div className="admin-keycard-head">
                <span>Keys</span>
                <button type="button" className="admin-bar-button" onClick={onClose}>Close</button>
            </div>
            {ADMIN_KEYS.map((row) => (
                <div key={row.keys} className="admin-keycard-row"><kbd>{row.keys}</kbd><span>{row.label}</span></div>
            ))}
        </div>
    )
}

function Tile({ kind, tile, onOpen }) {
    const tone = tile?.tone || 'default'
    return (
        <div className={`admin-tile tone-${tone}`}>
            <button type="button" className="admin-tile-open" onClick={() => onOpen(kind.key)} aria-label={`${kind.label}: ${tile?.value ?? '—'} ${tile?.word || ''}`.trim()}>
                <span className="admin-tile-band" aria-hidden="true" />
                <span className="admin-tile-name">{kind.label}</span>
                <span className="admin-tile-value">{tile?.value ?? '—'}</span>
                <span className="admin-tile-word">{tile?.word || ''}</span>
            </button>
            <span className="admin-tile-hint"><Hint text={kind.hint} label={`About ${kind.label}`} /></span>
        </div>
    )
}

/** The strip at the top of a window: the section's facts as chips, and one "more" menu. */
function WindowStrip({ chips, items, onReload }) {
    const { open, setOpen, ref } = useMenu()
    return (
        <div className="admin-strip">
            <div className="admin-chips">
                {chips.map((chip) => (
                    <span key={chip.label} className={`admin-chip tone-${chip.tone || 'default'}`}><b>{chip.value}</b> {chip.label}</span>
                ))}
            </div>
            <span className="admin-menu-anchor" ref={ref}>
                <button type="button" className="admin-bar-button admin-more" aria-label="More" aria-haspopup="true" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
                    <MoreMark />
                </button>
                {open ? (
                    <div className="admin-menu admin-menu-right" role="menu" aria-label="More">
                        <button type="button" role="menuitem" className="admin-menu-item" onClick={() => { onReload(); setOpen(false) }}>Reload</button>
                        {items.map((item) => (
                            <button key={item.id} type="button" role="menuitem" className="admin-menu-item" onClick={() => { item.run?.(); setOpen(false) }}>{item.label}</button>
                        ))}
                    </div>
                ) : null}
            </span>
        </div>
    )
}

export default function AdminDesk({ data, monitorState = 'pending', spaceId = 'main', connected = false, onBack }) {
    const viewport = useViewport()
    const widthClass = deskWidthClass(viewport.width)
    const narrow = widthClass === 'narrow'
    const monitorAllowed = monitorState === 'yes'
    const kinds = useMemo(() => availableKinds({ monitorAllowed }), [monitorAllowed])
    const allowed = useMemo(() => kinds.map((kind) => kind.key), [kinds])

    const page = useMemo(() => ({
        entries: data.entries || [],
        managementButtons: data.managementButtons || [],
        backendHealthStatus: data.backendHealthStatus,
        connected,
        objectCount: data.objects?.length || 0,
        people: data.sync?.participantRoster?.length || 0
    }), [data.entries, data.managementButtons, data.backendHealthStatus, connected, data.objects, data.sync?.participantRoster])
    const { tiles, report, refresh } = useAdminTiles({ monitorAllowed, page })

    // The layout of this device and width class. The Monitor kind is dropped until the server said 200.
    const [layout, setLayout] = useState(() => loadLayout(widthClass, null))
    const [loadedClass, setLoadedClass] = useState(widthClass)
    useEffect(() => {
        if (loadedClass === widthClass) return
        setLoadedClass(widthClass)
        setLayout(loadLayout(widthClass, null))
    }, [widthClass, loadedClass])
    const shown = useMemo(() => restrictLayout(layout, allowed), [layout, allowed])
    useEffect(() => { if (loadedClass === widthClass) saveLayout(widthClass, shown) }, [shown, widthClass, loadedClass])

    const open = useCallback((key, opts = {}) => {
        setLayout((prev) => openWindow(restrictLayout(prev, allowed), key, { narrow, ...opts }))
    }, [allowed, narrow])

    // /admin#<section> opens that window (on a phone it fills the screen; #monitor-full fills the desk).
    // A #monitor link opens nothing of the Monitor until the server said 200; a 404 opens Spaces and users.
    useEffect(() => {
        const apply = () => {
            const hit = parseAdminHash(window.location.hash)
            if (!hit) return
            if (hit.key === 'monitor' && monitorState === 'pending') return
            if (hit.key === 'monitor' && monitorState === 'no') { open('manage'); return }
            open(hit.key, { full: hit.full })
        }
        apply()
        window.addEventListener('hashchange', apply)
        return () => window.removeEventListener('hashchange', apply)
    }, [monitorState, open])

    // The desk area: below the bar, edge to edge, on the 12 x 8 unit grid.
    const barRef = useRef(null)
    const [barBottom, setBarBottom] = useState(BAR_FALLBACK)
    useLayoutEffect(() => {
        const bottom = barRef.current?.getBoundingClientRect?.().bottom
        if (Number.isFinite(bottom) && bottom > 0) setBarBottom(bottom)
    }, [viewport.width, narrow])
    const area = useMemo(() => ({ left: 0, top: barBottom, width: viewport.width, height: Math.max(1, viewport.height - barBottom) }), [barBottom, viewport])
    const unit = useMemo(() => unitSize(area, GRID.wide), [area])
    const bounds = useMemo(() => ({ minLeft: 0, viewportPadding: 0, bottomReserve: 0, minWidth: narrow ? area.width : unit.width, minHeight: unit.height }), [unit, narrow, area.width])
    const gridProps = useMemo(() => ({ snap: (frame) => snapFrame(frame, area, GRID.wide), unit }), [area, unit])

    const frames = useMemo(() => {
        const rects = {}
        for (const key of shown.order) rects[key] = shown.rects[key]
        const base = framesFromRects(rects, area, { zBase: 10, grid: GRID.wide })
        if (shown.max && base[shown.max]) base[shown.max] = { ...base[shown.max], x: 0, y: area.top, width: area.width, height: area.height }
        if (narrow) for (const key of Object.keys(base)) base[key] = { ...base[key], x: 0, y: area.top, width: area.width, height: area.height }
        return base
    }, [shown, area, narrow])

    const [reloads, setReloads] = useState({})
    const [keysOpen, setKeysOpen] = useState(false)
    const findRef = useRef(null)
    const front = shown.order[shown.order.length - 1] || null

    // Keys, from the table in adminWindows.js. Never while typing; the Monitor window keeps /, ? and Esc for itself.
    useEffect(() => {
        const onKey = (event) => {
            const action = adminKeyAction(event)
            if (!action) return
            const monitorFront = front === 'monitor'
            if (monitorFront && (action === 'help' || action === 'add' || action === 'escape')) return
            if (action === 'help') { setKeysOpen((v) => !v); return }
            if (action === 'escape') {
                if (keysOpen) setKeysOpen(false)
                else if (front && shown.max === front && !narrow) setLayout((prev) => toggleMaximize(prev, front))
                return
            }
            if (action === 'add') { event.preventDefault(); findRef.current?.focus(); return }
            if (narrow) return
            if (action === 'arrange') setLayout((prev) => arrangeAll(prev))
            else if (action === 'maximize') { if (front) setLayout((prev) => toggleMaximize(prev, front)) }
            else if (action === 'next' || action === 'prev') {
                event.preventDefault()
                const target = nextWindowId(shown.order, {}, front, action === 'next' ? 1 : -1)
                if (target) setLayout((prev) => focusWindow(prev, target))
            }
        }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
    }, [front, keysOpen, narrow, shown.max, shown.order])

    const onStats = useCallback((key, stats) => report(key, stats), [report])
    const openKinds = shown.open.filter((key) => kindOf(key))
    const groups = ADMIN_GROUPS.map((group) => ({ ...group, kinds: kinds.filter((kind) => kind.group === group.key) }))

    return (
        <div className="admin-desk" data-width={widthClass}>
            <header className="admin-bar" ref={barRef}>
                <div className="admin-bar-left">
                    <span className="admin-bar-title">Admin</span>
                    <span className="admin-chip admin-space-chip" title="The space this page works on">{spaceId}</span>
                    <span className={`admin-live${connected ? ' is-live' : ''}`} role="status" aria-label={connected ? 'Live link on' : 'Live link off'}>
                        <i aria-hidden="true" />{connected ? 'Live' : 'Offline'}
                    </span>
                </div>
                <div className="admin-bar-right">
                    <button type="button" className="admin-bar-button" onClick={() => setLayout(closeAll())} disabled={!openKinds.length}>{narrow ? 'Back' : 'Desk'}</button>
                    <WindowsMenu kinds={kinds} openKeys={openKinds} onChoose={(key) => open(key)} onCloseAll={() => setLayout(closeAll())} />
                    <Find kinds={kinds} onOpen={(key) => open(key)} inputRef={findRef} />
                    {narrow ? null : <button type="button" className="admin-bar-button" aria-label="Keys" onClick={() => setKeysOpen((v) => !v)}>?</button>}
                    <button type="button" className="admin-bar-button" onClick={() => onBack?.(spaceId)}>Space</button>
                </div>
            </header>

            <div className="admin-home" style={{ top: area.top }} data-testid="admin-desk" hidden={openKinds.length > 0}>
                {groups.map((group) => (
                    <section key={group.key} className="admin-group" aria-label={group.label}>
                        <h2 className="admin-group-title">{group.label}</h2>
                        <div className="admin-tiles">
                            {group.kinds.map((kind) => <Tile key={kind.key} kind={kind} tile={tiles[kind.key]} onOpen={(key) => open(key)} />)}
                        </div>
                    </section>
                ))}
            </div>

            {shown.order.map((key) => {
                const kind = kindOf(key)
                const frame = frames[key]
                if (!kind || !frame) return null
                const chips = tiles[key]?.chips || []
                return (
                    <DesktopWindow
                        key={key}
                        windowState={{ ...frame, maximized: shown.max === key }}
                        title={kind.label}
                        blockKind={key}
                        bounds={bounds}
                        grid={gridProps}
                        minTop={area.top}
                        space="screen"
                        pinnable={false}
                        onFocus={() => setLayout((prev) => focusWindow(prev, key))}
                        onPatch={(patch) => setLayout((prev) => placeWindow(prev, key, rectFromFrame({ ...frame, ...patch }, area)))}
                        onClose={() => setLayout((prev) => closeWindow(prev, key))}
                        onToggleMinimize={() => setLayout((prev) => closeWindow(prev, key))}
                        onToggleMaximize={narrow ? undefined : () => setLayout((prev) => toggleMaximize(prev, key))}
                    >
                        <div className="admin-window" onPointerDown={() => { if (front !== key) setLayout((prev) => focusWindow(prev, key)) }}>
                            <WindowStrip
                                chips={chips}
                                items={windowMoreItems(key, data)}
                                onReload={() => { setReloads((prev) => ({ ...prev, [key]: (prev[key] || 0) + 1 })); refresh() }}
                            />
                            <div className="admin-window-scroll preferences-content" key={reloads[key] || 0}>
                                <AdminWindowBody kind={key} data={data} openKind={(k) => open(k)} onStats={onStats} />
                            </div>
                        </div>
                    </DesktopWindow>
                )
            })}

            {keysOpen ? <KeyCard onClose={() => setKeysOpen(false)} /> : null}
        </div>
    )
}
