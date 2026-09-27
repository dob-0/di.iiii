import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import DesktopWindow from '../raw/components/DesktopWindow.jsx'
import { navigateInApp } from '../components/SurfaceBar.jsx'
import { buildRawProjectPath } from '../raw/utils/rawRouting.js'
import { RAW_WINDOW_PADDING, getBottomReserve } from '../raw/utils/windowLayout.js'
import { useMapApi } from '../map/useMapDocument.js'
import { buildPerformPath } from './performRouting.js'
import {
    WINDOW_KINDS,
    WINDOW_ORDER,
    choosePreset,
    framesFromRects,
    isComingKind,
    nextSlotId,
    presetFromArrangement,
    presetGroups,
    rectForAddedWindow,
    rectsFromFrames,
    widthClassOf
} from './presets.js'
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

// The same bounds DesktopWindow's clamp keeps a window inside (windowLayout.js):
// a padding each side, and the bottom reserve the corner chrome needs (the
// account chip on a phone). A preset laid into anything larger would be
// squeezed by the clamp and its windows would overlap.
const measureArea = (stripBottom) => {
    const width = typeof window === 'undefined' ? 1440 : window.innerWidth
    const height = typeof window === 'undefined' ? 900 : window.innerHeight
    const top = Math.max(0, Math.round(stripBottom || STRIP_FALLBACK)) + 4
    const bottom = height - RAW_WINDOW_PADDING - getBottomReserve(width)
    return { left: RAW_WINDOW_PADDING, top, width: Math.max(1, width - RAW_WINDOW_PADDING * 2), height: Math.max(1, bottom - top) }
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

    const mine = useMemo(() => layout?.presets || [], [layout?.presets])
    const show = useMemo(() => document?.performState?.presets || [], [document?.performState?.presets])

    // Which preset opens. Chosen once the document has loaded — a show preset
    // asked for by the address is in the document — and again when the
    // person picks another.
    const [chosenId, setChosenId] = useState(null)
    const [notice, setNotice] = useState('')
    const choice = useMemo(() => {
        if (!hasLoaded) return null
        if (chosenId) return choosePreset({ requested: chosenId, mine, show })
        return choosePreset({ requested: perform.preset, lastActive: layout?.activePreset, from: perform.from, mine, show })
    }, [hasLoaded, chosenId, perform.preset, perform.from, layout?.activePreset, mine, show])
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
    }, [preset, widthClass]) // eslint-disable-line react-hooks/exhaustive-deps

    // The address says which preset is open, so "copy link" and a reload agree.
    useEffect(() => {
        if (!preset || !spaceId || !projectId) return
        replaceAddress(buildPerformPath(spaceId, projectId, { preset: preset.id, from: perform.from }))
        layout?.setActivePreset?.(preset.id)
    }, [preset?.id, spaceId, projectId, perform.from]) // eslint-disable-line react-hooks/exhaustive-deps

    const frames = useMemo(() => {
        if (!arrangement) return {}
        const base = framesFromRects(arrangement.rects, area)
        arrangement.order.forEach((id, index) => {
            if (base[id]) {
                base[id].zIndex = 10 + index
                base[id].minimized = Boolean(arrangement.minimized[id])
            }
        })
        return base
    }, [arrangement, area])

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
    const addWindow = (kind) => change((current) => {
        const id = nextSlotId(kind, current.windows.map((item) => item.id))
        return {
            ...current,
            windows: [...current.windows, { id, kind }],
            rects: { ...current.rects, [id]: rectForAddedWindow(widthClass) },
            order: [...current.order, id]
        }
    })

    const [menu, setMenu] = useState(null) // 'presets' | 'add' | null
    const [saving, setSaving] = useState(null) // 'mine' | 'show' | null
    const [saveName, setSaveName] = useState('')

    const pick = (id) => {
        setChosenId(id)
        setNotice('')
        setArrangement(null)
        setMenu(null)
    }

    const save = (target) => {
        if (!arrangement || !preset) return
        const name = saveName.trim() || `${preset.name} · ${target === 'mine' ? 'mine' : 'show'}`
        const framesNow = framesFromRects(arrangement.rects, area)
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
    const nodesHref = buildRawProjectPath(projectId, spaceId)

    return (
        <>
            <div className="perform-strip" ref={stripRef}>
                <div className="perform-menu-anchor">
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
                                            placeholder={saving === 'mine' ? 'friday at MOCT' : 'sunday caller'}
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
                <div className="perform-menu-anchor">
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
                                <a className="perform-menu-item" role="menuitem" href={nodesHref} onClick={(event) => navigateInApp(event, nodesHref)}>Nodes · the whole patch ›</a>
                            </div>
                        </div>
                    ) : null}
                </div>
                {notice ? <span className="perform-strip-notice" role="status">{notice}</span> : null}
            </div>

            {arrangement ? arrangement.windows.map((item) => {
                const frame = frames[item.id]
                if (!frame) return null
                const known = WINDOW_KINDS[item.kind]
                return (
                    <DesktopWindow
                        key={`${arrangement.presetId}:${item.id}`}
                        windowState={frame}
                        title={windowTitle(item.kind)}
                        kicker={known?.family || ''}
                        minTop={area.top}
                        space="screen"
                        onFocus={() => focusWindow(item.id)}
                        onPatch={(patch) => patchFrame(item.id, patch)}
                        onClose={() => closeWindow(item.id)}
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
