import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import DesktopWindow from '../raw/components/DesktopWindow.jsx'
import ContextMenu from '../raw/components/ContextMenu.jsx'
import { pickEscapeWindow } from '../raw/utils/windowCascade.js'
import { navigateInApp } from '../components/SurfaceBar.jsx'
import { buildRawProjectPath } from '../raw/utils/rawRouting.js'
import { useMapApi } from '../map/useMapDocument.js'
import { buildPerformPath } from './performRouting.js'
import {
    WINDOW_KINDS,
    WINDOW_ORDER,
    choosePreset,
    GRID,
    framesFromRects,
    isComingKind,
    nextSlotId,
    presetFromArrangement,
    presetGroups,
    rectForAddedWindow,
    rectsFromFrames,
    snapFrame,
    tileRects,
    unitSize,
    widthClassOf
} from './presets.js'
import { keysOf, nextWindowId, windowKeyAction } from './windowKeys.js'
import PerformWindowBody, { windowTitle } from './PerformWindows.jsx'
import './perform.css'

// THE PERFORM DESK — the show run with only the windows the job needs.
//
// It is the Raw window desk (the same DesktopWindow, the same node windows,
// the same project document and op log) with the patch canvas taken away and
// a preset deciding which windows are open and where. Nothing new sits under
// it: every window is a view of the project that Nodes, Studio and Projection
// edit too. Nodes is one step away: the last line of "+ window".
//
// A preset is a stored view (presets.js has the method): windows + where they
// stand, wide and narrow. The arrangement on screen is kept as PERCENT
// rectangles, so it is the shape of the window at any size and survives a
// resize; pixel frames are derived for DesktopWindow.

const STRIP_FALLBACK = 84

// The area the blocks tile: the whole screen under the strip, edge to edge.
// Nodes keeps a padding and a bottom reserve (windowLayout.js) because its
// windows float over a canvas and a corner holds the zoom controls and the
// delete button. Perform has neither, and nothing is minimised into a tray (a
// minimised block stays in its place as its one header row), so nothing is
// reserved here. UNCHECKED on a phone: the account chip (AccountButton,
// fixed at the bottom-right) sits over the last block's corner.
const measureArea = (stripBottom) => {
    const width = typeof window === 'undefined' ? 1440 : window.innerWidth
    const height = typeof window === 'undefined' ? 900 : window.innerHeight
    const top = Math.max(0, Math.round(stripBottom || STRIP_FALLBACK))
    return { left: 0, top, width: Math.max(1, width), height: Math.max(1, height - top) }
}

const replaceAddress = (path) => {
    try {
        window.history.replaceState(window.history.state, '', path)
    } catch {
        // Nothing to do: the address is a convenience here, the preset is held in state.
    }
}

const copyText = async (text) => {
    try {
        if (navigator.clipboard?.writeText) {
            await navigator.clipboard.writeText(text)
            return true
        }
    } catch {
        // fall through to the prompt
    }
    if (typeof window.prompt === 'function') window.prompt('Copy the link', text)
    return false
}

export default function PerformDesk({
    perform = {},
    document,
    hasLoaded = true,
    spaceId,
    projectId,
    applyLocalOps,
    renderNode,
    machines = [],
    onAddDeck = null,
    isLocalInstall = false,
    layout
}) {
    const stripRef = useRef(null)
    const [stripBottom, setStripBottom] = useState(STRIP_FALLBACK)
    const [viewport, setViewport] = useState(() => ({
        width: typeof window === 'undefined' ? 1440 : window.innerWidth,
        height: typeof window === 'undefined' ? 900 : window.innerHeight
    }))
    useLayoutEffect(() => {
        const measure = () => {
            setViewport({ width: window.innerWidth, height: window.innerHeight })
            const bottom = stripRef.current?.getBoundingClientRect?.().bottom
            if (Number.isFinite(bottom) && bottom > 0) setStripBottom(bottom)
        }
        measure()
        window.addEventListener('resize', measure)
        return () => window.removeEventListener('resize', measure)
    }, [])
    const area = useMemo(() => measureArea(stripBottom), [stripBottom, viewport]) // eslint-disable-line react-hooks/exhaustive-deps
    const widthClass = widthClassOf(viewport.width)
    const grid = GRID[widthClass]
    const unit = useMemo(() => unitSize(area, grid), [area, grid])
    // What DesktopWindow keeps a block inside: the whole area, and no smaller than one unit.
    const bounds = useMemo(() => ({ minLeft: 0, viewportPadding: 0, bottomReserve: 0, minWidth: unit.width, minHeight: unit.height }), [unit])
    const gridProps = useMemo(() => ({ snap: (frame) => snapFrame(frame, area, grid), unit }), [area, grid, unit])

    const mine = useMemo(() => layout?.presets || [], [layout?.presets])
    const show = useMemo(() => document?.performState?.presets || [], [document?.performState?.presets])

    // Which preset opens. Chosen once the document has loaded — a show preset
    // asked for by the address is in the document — and again when the
    // person picks another.
    const [chosenId, setChosenId] = useState(null)
    const [notice, setNotice] = useState('')
    const showDefault = document?.performState?.defaultPreset || null
    const choice = useMemo(() => {
        if (!hasLoaded) return null
        if (chosenId) return choosePreset({ requested: chosenId, mine, show })
        return choosePreset({ requested: perform.preset, lastActive: layout?.activePreset, showDefault, from: perform.from, mine, show })
    }, [hasLoaded, chosenId, perform.preset, perform.from, layout?.activePreset, showDefault, mine, show])
    const preset = choice?.preset || null

    useEffect(() => {
        if (choice?.notice && !chosenId) setNotice(choice.notice)
    }, [choice?.notice, chosenId])

    // The arrangement on screen: which windows, their rectangles, their stacking.
    const [arrangement, setArrangement] = useState(null) // { presetId, widthClass, windows, rects, order, minimized }
    useEffect(() => {
        if (!preset) return
        if (arrangement && arrangement.presetId === preset.id && arrangement.widthClass === widthClass) return
        const rects = preset[widthClass] || {}
        const windows = preset.windows.filter((item) => rects[item.id])
        setArrangement({
            presetId: preset.id,
            widthClass,
            windows,
            rects: Object.fromEntries(windows.map((item) => [item.id, rects[item.id]])),
            order: windows.map((item) => item.id),
            minimized: {},
            changed: false
        })
    }, [preset, widthClass, arrangement === null]) // eslint-disable-line react-hooks/exhaustive-deps

    // The address says which preset is open, so "copy link" and a reload agree.
    useEffect(() => {
        if (!preset || !spaceId || !projectId) return
        replaceAddress(buildPerformPath(spaceId, projectId, { preset: preset.id, from: perform.from }))
        layout?.setActivePreset?.(preset.id)
    }, [preset?.id, spaceId, projectId, perform.from]) // eslint-disable-line react-hooks/exhaustive-deps

    const frames = useMemo(() => {
        if (!arrangement) return {}
        const base = framesFromRects(arrangement.rects, area, { grid })
        arrangement.order.forEach((id, index) => {
            if (base[id]) {
                base[id].zIndex = 10 + index
                base[id].minimized = Boolean(arrangement.minimized[id])
                // Maximised (and so "Restore" in the title bar) only while a rect to go back to is kept.
                base[id].maximized = Boolean(arrangement.restore?.[id])
            }
        })
        return base
    }, [arrangement, area, grid])

    const change = useCallback((fn) => setArrangement((current) => (current ? { ...fn(current), changed: true } : current)), [])

    const patchFrame = (id, patch) => change((current) => {
        const merged = { ...frames[id], ...patch }
        const rect = rectsFromFrames({ [id]: merged }, area)[id]
        return rect ? { ...current, rects: { ...current.rects, [id]: rect } } : current
    })
    const focusWindow = (id) => setArrangement((current) => {
        if (!current || current.order[current.order.length - 1] === id) return current
        return { ...current, order: [...current.order.filter((item) => item !== id), id] }
    })
    const closeWindow = (id) => change((current) => ({
        ...current,
        windows: current.windows.filter((item) => item.id !== id),
        order: current.order.filter((item) => item !== id)
    }))
    const toggleMinimize = (id) => change((current) => ({ ...current, minimized: { ...current.minimized, [id]: !current.minimized[id] } }))
    const toggleMaximize = (id) => change((current) => {
        const rect = current.rects[id]
        const full = [0, 0, 100, 100]
        const isFull = rect && rect.every((value, index) => value === full[index])
        const restore = current.restore?.[id]
        return {
            ...current,
            rects: { ...current.rects, [id]: isFull && restore ? restore : full },
            restore: { ...(current.restore || {}), [id]: isFull ? undefined : rect },
            order: [...current.order.filter((item) => item !== id), id]
        }
    })
    const addByHand = (kind) => {
        const id = nextSlotId(kind, arrangement?.windows.map((item) => item.id) || [])
        addWindow(kind)
        setAddedIds((ids) => [...ids, id])
    }
    const addWindow = (kind) => change((current) => {
        const id = nextSlotId(kind, current.windows.map((item) => item.id))
        return {
            ...current,
            windows: [...current.windows, { id, kind }],
            rects: { ...current.rects, [id]: rectForAddedWindow(widthClass, kind, current.rects) },
            order: [...current.order, id]
        }
    })

    // ARRANGE ALL: every open window tiled over the grid, no overlap, nothing minimised or maximised left over.
    const arrangeAll = () => change((current) => {
        const order = [...current.windows]
            .sort((a, b) => {
                const ra = current.rects[a.id] || [0, 0]
                const rb = current.rects[b.id] || [0, 0]
                return (ra[1] - rb[1]) || (ra[0] - rb[0])
            })
            .map((item) => item.id)
        const tiled = tileRects(order, widthClass, area)
        return {
            ...current,
            windows: current.windows.filter((item) => tiled[item.id]),
            rects: tiled,
            minimized: {},
            restore: {}
        }
    })

    // Windows put here by hand in this session: the only ones Esc hides (a preset's own are never lost to a stray key).
    const [addedIds, setAddedIds] = useState([])
    const [ctxMenu, setCtxMenu] = useState(null) // { x, y, title, items }
    const addItems = () => WINDOW_ORDER.map((kind) => ({
        id: `add-${kind}`,
        label: WINDOW_KINDS[kind].label + (isComingKind(kind) ? ' (phase 2)' : ''),
        run: () => addByHand(kind)
    }))
    const deskItems = () => ([
        { id: 'add', label: 'Add window', kb: keysOf('add'), items: addItems() },
        { id: 'arrange', label: 'Arrange all', kb: keysOf('arrange'), run: arrangeAll, disabled: !arrangement?.windows.length },
        { sep: true },
        { id: 'save-mine', label: 'Save as mine…', run: () => { setMenu('presets'); setSaving('mine') } },
        { id: 'save-show', label: 'Save to the show…', run: () => { setMenu('presets'); setSaving('show') } }
    ])
    const windowItems = (id) => {
        const full = arrangement?.rects[id]?.every((value, index) => value === [0, 0, 100, 100][index])
        return [
            { id: 'maximize', label: full ? 'Restore' : 'Maximize', kb: keysOf('maximize'), run: () => toggleMaximize(id) },
            { id: 'minimize', label: arrangement?.minimized[id] ? 'Expand' : 'Minimize', run: () => toggleMinimize(id) },
            { id: 'close', label: 'Hide this window', kb: addedIds.includes(id) ? keysOf('hide') : undefined, run: () => closeWindow(id), danger: true },
            { sep: true },
            ...deskItems()
        ]
    }
    const openDeskMenu = (event) => {
        event.preventDefault()
        setCtxMenu({ x: event.clientX, y: event.clientY, items: deskItems() })
    }
    const openWindowMenu = (item) => (event) => {
        event.preventDefault()
        event.stopPropagation()
        focusWindow(item.id)
        setCtxMenu({ x: event.clientX, y: event.clientY, title: windowTitle(item.kind), items: windowItems(item.id) })
    }

    const [menu, setMenu] = useState(null) // 'presets' | 'add' | null
    const [saving, setSaving] = useState(null) // 'mine' | 'show' | null
    const [saveName, setSaveName] = useState('')
    // An open menu closes the way menus close (WAI-ARIA APG, menu button): Escape, focus back on its button,
    // or a press anywhere outside it.
    const presetsAnchor = useRef(null)
    const addAnchor = useRef(null)
    const windowsAnchor = useRef(null)
    useEffect(() => {
        if (!menu) return undefined
        const anchor = (menu === 'presets' ? presetsAnchor : menu === 'windows' ? windowsAnchor : addAnchor).current
        const close = (refocus) => {
            setMenu(null)
            setSaving(null)
            if (refocus) anchor?.querySelector('button')?.focus()
        }
        const onKey = (event) => { if (event.key === 'Escape') { event.preventDefault(); close(true) } }
        const onDown = (event) => { if (anchor && !anchor.contains(event.target)) close(false) }
        window.addEventListener('keydown', onKey)
        window.addEventListener('pointerdown', onDown)
        return () => {
            window.removeEventListener('keydown', onKey)
            window.removeEventListener('pointerdown', onDown)
        }
    }, [menu])

    // The keys (windowKeys.js): live whenever no menu is open, never in a field.
    const keyState = useRef({})
    useEffect(() => { keyState.current = { arrangement, addedIds, ctxMenu, menu, arrangeAll, toggleMaximize, closeWindow, addItems, focusWindow } })
    useEffect(() => {
        const onKeyDown = (event) => {
            const live = keyState.current
            if (!live.arrangement || live.ctxMenu || live.menu) return
            const action = windowKeyAction(event)
            if (!action) return
            const { order, windows, minimized } = live.arrangement
            const front = order[order.length - 1] || null
            if (action === 'arrange') live.arrangeAll()
            else if (action === 'maximize') { if (!front) return; live.toggleMaximize(front) }
            else if (action === 'next' || action === 'prev') {
                const nextId = nextWindowId(order, minimized, front, action === 'prev' ? -1 : 1)
                if (!nextId) return
                live.focusWindow(nextId)
            } else if (action === 'add') {
                setCtxMenu({ x: Math.round(window.innerWidth / 2) - 80, y: Math.round(window.innerHeight / 3), title: 'Add window', items: live.addItems() })
            } else if (action === 'hide') {
                const id = pickEscapeWindow(
                    windows.map((item) => ({ id: item.id, zIndex: order.indexOf(item.id), minimized: Boolean(minimized[item.id]) })),
                    live.addedIds
                )
                if (!id) return
                live.closeWindow(id)
            }
            event.preventDefault()
        }
        window.addEventListener('keydown', onKeyDown)
        return () => window.removeEventListener('keydown', onKeyDown)
    }, [])

    const pick = (id) => {
        setChosenId(id)
        setNotice('')
        setArrangement(null)
        setMenu(null)
    }

    const save = (target) => {
        if (!arrangement || !preset) return
        const name = saveName.trim() || `${preset.name} · ${target === 'mine' ? 'mine' : 'show'}`
        const framesNow = framesFromRects(arrangement.rects, area, { grid })
        const saved = presetFromArrangement({
            name,
            source: target,
            windows: arrangement.windows,
            frames: framesNow,
            area,
            widthClass,
            previous: preset
        })
        if (!saved) return
        if (target === 'mine') {
            layout?.setPresets?.([...mine.filter((item) => item.id !== saved.id), saved])
        } else {
            applyLocalOps({ type: 'upsertPerformPreset', payload: { preset: saved } }, { activityMessage: `Gave “${saved.name}” to the show.` })
        }
        setSaving(null)
        setSaveName('')
        setMenu(null)
        setChosenId(saved.id)
        setArrangement((current) => (current ? { ...current, presetId: saved.id, changed: false } : current))
        setNotice(target === 'mine' ? `Saved as “${saved.name}” on this device.` : `“${saved.name}” is the show’s now: everyone following it has it, and it travels in the .diiii file.`)
    }

    const remove = (item) => {
        if (item.source === 'mine') layout?.setPresets?.(mine.filter((entry) => entry.id !== item.id))
        if (item.source === 'show') applyLocalOps({ type: 'deletePerformPreset', payload: { presetId: item.id } })
        if (preset?.id === item.id) pick(item.base || 'vj')
    }

    const copyLink = async () => {
        if (!preset) return
        const url = `${window.location.origin}${buildPerformPath(spaceId, projectId, { preset: preset.id })}`
        const copied = await copyText(url)
        setNotice(copied ? `Link copied: ${url}` : url)
        setMenu(null)
    }

    const [selectedId, setSelectedId] = useState(null)
    const [soloId, setSoloId] = useState(null)
    const [liveCueId, setLiveCueId] = useState(null)
    const mapApi = useMapApi(projectId, applyLocalOps)
    const wall = useMemo(() => ({ selectedId, setSelectedId, soloId, setSoloId, liveCueId, setLiveCueId }), [selectedId, soloId, liveCueId])
    const ctx = useMemo(() => ({
        document, spaceId, projectId, applyLocalOps, mapApi, renderNode, machines, wall, onAddDeck, isLocalInstall
    }), [document, spaceId, projectId, applyLocalOps, mapApi, renderNode, machines, wall, onAddDeck, isLocalInstall])

    const groups = presetGroups({ mine, show })
    // The way back to the deck: the project has a VJ deck but the windows on screen show none.
    const hasDeckNode = Boolean(document?.nodes?.some?.((node) => node?.typeId === 'vj.deck'))
    const deckOnScreen = Boolean(arrangement?.windows.some((item) => item.kind === 'deck'))
    const missingDeck = Boolean(arrangement) && hasDeckNode && !deckOnScreen
    const toggleKind = (kind) => {
        const open = arrangement?.windows.some((item) => item.kind === kind)
        if (open) change((current) => ({
            ...current,
            windows: current.windows.filter((item) => item.kind !== kind),
            order: current.order.filter((id) => current.windows.find((item) => item.id === id)?.kind !== kind)
        }))
        else addWindow(kind)
    }
    const nodesHref = buildRawProjectPath(projectId, spaceId)
    // The deck's full page: Nodes opens with this deck node entered (?enter=<node id>).
    const deckNodeId = document?.nodes?.find?.((node) => node?.typeId === 'vj.deck')?.id || null
    const deckFullHref = deckNodeId ? `${nodesHref}?enter=${encodeURIComponent(deckNodeId)}` : null

    return (
        <>
            <div className="perform-strip" ref={stripRef}>
                <div className="perform-menu-anchor" ref={presetsAnchor}>
                    <button
                        type="button"
                        className="perform-strip-button"
                        aria-haspopup="true"
                        aria-expanded={menu === 'presets'}
                        onClick={() => { setMenu(menu === 'presets' ? null : 'presets'); setSaving(null) }}
                    >
                        <span data-preset={preset?.id || ''}>{preset ? preset.name : 'Loading…'}</span>
                        {arrangement?.changed ? <span className="perform-changed">· changed</span> : null}
                        <span aria-hidden="true">▾</span>
                    </button>
                    {menu === 'presets' ? (
                        <div className="perform-menu" role="menu" aria-label="Presets">
                            {groups.map((group) => (
                                <div className="perform-menu-group" key={group.key}>
                                    <span className="perform-menu-label">{group.label}</span>
                                    {group.presets.length ? group.presets.map((item) => {
                                        const coming = item.windows.filter((entry) => isComingKind(entry.kind)).length
                                        return (
                                            <div className="perform-menu-row" key={item.id}>
                                                <button
                                                    type="button"
                                                    role="menuitem"
                                                    className={`perform-menu-item${preset?.id === item.id ? ' is-on' : ''}`}
                                                    onClick={() => pick(item.id)}
                                                    title={item.who || ''}
                                                >
                                                    {item.name}
                                                    {coming ? <span className="perform-menu-note">{coming} coming in phase 2</span> : null}
                                                </button>
                                                {group.key === 'show' ? (
                                                    <button
                                                        type="button"
                                                        className="perform-menu-remove"
                                                        aria-pressed={showDefault === item.id}
                                                        aria-label={showDefault === item.id ? `Stop ${item.name} being the show default` : `Set ${item.name} as the show default`}
                                                        title={showDefault === item.id ? 'This show opens with it. Click to stop.' : 'Make every device open this show with it'}
                                                        onClick={() => applyLocalOps({ type: 'setPerformDefaultPreset', payload: { presetId: showDefault === item.id ? '' : item.id } })}
                                                    >{showDefault === item.id ? '★' : '☆'}</button>
                                                ) : null}
                                                {group.key !== 'builtin' ? (
                                                    <button type="button" className="perform-menu-remove" aria-label={`Remove ${item.name}`} onClick={() => remove(item)}>×</button>
                                                ) : null}
                                            </div>
                                        )
                                    }) : (
                                        <p className="perform-menu-empty">{group.key === 'mine' ? 'None saved on this device yet.' : 'None given to this show yet.'}</p>
                                    )}
                                </div>
                            ))}
                            <div className="perform-menu-group perform-menu-sep">
                                {saving ? (
                                    <form className="perform-save" onSubmit={(event) => { event.preventDefault(); save(saving) }}>
                                        <input
                                            // eslint-disable-next-line jsx-a11y/no-autofocus
                                            autoFocus
                                            value={saveName}
                                            placeholder={saving === 'mine' ? 'friday, small room' : 'sunday caller'}
                                            aria-label={saving === 'mine' ? 'Name for your preset' : 'Name for the show’s preset'}
                                            onChange={(event) => setSaveName(event.target.value)}
                                        />
                                        <button type="submit" className="perform-strip-button">Save</button>
                                    </form>
                                ) : (
                                    <>
                                        <button type="button" role="menuitem" className="perform-menu-item" onClick={() => setSaving('mine')}>Save as mine…</button>
                                        <button type="button" role="menuitem" className="perform-menu-item" onClick={() => setSaving('show')}>Save to the show…</button>
                                        <button
                                            type="button"
                                            role="menuitem"
                                            className="perform-menu-item"
                                            onClick={copyLink}
                                            disabled={!preset || preset.source === 'mine'}
                                            title={preset?.source === 'mine' ? 'Yours lives on this device. Save it to the show to share it.' : ''}
                                        >
                                            Copy link
                                            {preset?.source === 'mine' ? <span className="perform-menu-note">save to the show to share</span> : null}
                                        </button>
                                    </>
                                )}
                            </div>
                        </div>
                    ) : null}
                </div>
                <div className="perform-menu-anchor" ref={addAnchor}>
                    <button
                        type="button"
                        className="perform-strip-button"
                        aria-haspopup="true"
                        aria-expanded={menu === 'add'}
                        onClick={() => setMenu(menu === 'add' ? null : 'add')}
                    >+ window</button>
                    {menu === 'add' ? (
                        <div className="perform-menu" role="menu" aria-label="Add a window">
                            <div className="perform-menu-group">
                                {WINDOW_ORDER.map((kind) => (
                                    <button key={kind} type="button" role="menuitem" className="perform-menu-item" onClick={() => { addWindow(kind); setMenu(null) }}>
                                        {WINDOW_KINDS[kind].label}
                                        {isComingKind(kind) ? <span className="perform-menu-note">phase 2</span> : null}
                                    </button>
                                ))}
                            </div>
                            <div className="perform-menu-group perform-menu-sep">
                                {deckFullHref ? <a className="perform-menu-item" role="menuitem" href={deckFullHref} onClick={(event) => navigateInApp(event, deckFullHref)}>Nodes · VJ deck, full page ›</a> : null}
                                <a className="perform-menu-item" role="menuitem" href={nodesHref} onClick={(event) => navigateInApp(event, nodesHref)}>Nodes · the whole patch ›</a>
                            </div>
                        </div>
                    ) : null}
                </div>
                <div className="perform-menu-anchor" ref={windowsAnchor}>
                    <button
                        type="button"
                        className="perform-strip-button"
                        aria-haspopup="true"
                        aria-expanded={menu === 'windows'}
                        onClick={() => setMenu(menu === 'windows' ? null : 'windows')}
                    >Windows</button>
                    {menu === 'windows' ? (
                        <div className="perform-menu" role="menu" aria-label="Windows">
                            <div className="perform-menu-group">
                                {WINDOW_ORDER.map((kind) => {
                                    const open = Boolean(arrangement?.windows.some((item) => item.kind === kind))
                                    return (
                                        <button key={kind} type="button" role="menuitemcheckbox" aria-checked={open} className={`perform-menu-item${open ? ' is-on' : ''}`} onClick={() => toggleKind(kind)}>
                                            <span aria-hidden="true">{open ? '✓ ' : '  '}</span>{WINDOW_KINDS[kind].label}
                                            <span className="perform-menu-note">{open ? 'open' : 'hidden'}</span>
                                        </button>
                                    )
                                })}
                            </div>
                            <div className="perform-menu-group perform-menu-sep">
                                <button type="button" role="menuitem" className="perform-menu-item" disabled={!preset} onClick={() => { if (preset) pick(preset.id) }}>Reset layout</button>
                            </div>
                        </div>
                    ) : null}
                </div>
                {missingDeck ? (
                    <span className="perform-strip-notice" role="status">
                        This view has no VJ deck.{' '}
                        <button type="button" className="perform-strip-button" onClick={() => addWindow('deck')}>Open VJ Deck</button>
                    </span>
                ) : null}
                {notice ? <span className="perform-strip-notice" role="status">{notice}</span> : null}
            </div>

            {/* The empty desk: a right-click on it opens the same menu as the title bars. It sits under every window. */}
            <div className="perform-desk-bg" role="presentation" data-testid="perform-desk" style={{ top: area.top }} onContextMenu={openDeskMenu} />
            <ContextMenu open={Boolean(ctxMenu)} x={ctxMenu?.x || 0} y={ctxMenu?.y || 0} title={ctxMenu?.title} items={ctxMenu?.items || []} onClose={() => setCtxMenu(null)} />

            {arrangement ? arrangement.windows.map((item) => {
                const frame = frames[item.id]
                if (!frame) return null
                return (
                    <DesktopWindow
                        key={`${arrangement.presetId}:${item.id}`}
                        windowState={frame}
                        title={windowTitle(item.kind)}
                        blockKind={item.kind}
                        bounds={bounds}
                        grid={gridProps}
                        minTop={area.top}
                        space="screen"
                        onFocus={() => focusWindow(item.id)}
                        onPatch={(patch) => patchFrame(item.id, patch)}
                        onClose={() => closeWindow(item.id)}
                        onTitleContextMenu={openWindowMenu(item)}
                        onToggleMinimize={() => toggleMinimize(item.id)}
                        onToggleMaximize={() => toggleMaximize(item.id)}
                        pinnable={false}
                    >
                        <PerformWindowBody kind={item.kind} ctx={ctx} />
                    </DesktopWindow>
                )
            }) : null}
        </>
    )
}
