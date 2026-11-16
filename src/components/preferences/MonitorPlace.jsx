import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import MonitorMap from './MonitorMap.jsx'
import { useWorkspace, AskForm, AskRows } from './MonitorWorkspace.jsx'
import { NeedsYou } from './MonitorVital.jsx'
import MonitorActivity from './MonitorActivity.jsx'
import MonitorLists from './MonitorLists.jsx'
import MonitorDrawer from './MonitorDrawer.jsx'
import { HooksBody, RequestsBody, RulesBody, SkillsBody } from './KnowledgeWindows.jsx'
import { chipPriority, fitPriority, shortLabel } from './monitorPlaceFit.js'
import { ago } from './monitorFormat.js'

// The Monitor as one place (spec SPEC-monitor-one-place, 2026-11-16). One screen, the map is the stage:
//   rail   one line: live mark, vital chips (priority+ into "+N"), the worst thing that needs him, the controls
//   dock   the agents, their helpers and the open asks (folds to a thin strip)
//   stage  the map (2D / 3D / List), all the space that is left
//   panel  what was clicked: a detail, a Work list, a list of things, the activity feed
//   ask    "Tell the agents…" and the live ticker
// All state and data logic stay in MonitorSection; this file only lays them out. Container queries size the parts,
// media queries the number of columns, pointer queries the targets (24 px fine, 44 px coarse). Flat, brand tokens only.

const DOCK_KEY = 'di.monitor.dock'
const SHEETS = ['peek', 'half', 'full']
const WORK_PARTS = [['todo', 'To do', RequestsBody], ['rules', 'Rules', RulesBody], ['skills', 'Skills', SkillsBody], ['hooks', 'Hooks', HooksBody]]
const LIST_BLOCK = { machines: 'machines', people: 'presence', gear: 'connected', services: 'services', prs: 'prs' }
const PANEL_WIDE = '(min-width: 840px)'

const readFlag = (key) => { try { return window.localStorage.getItem(key) === '1' } catch { return false } }
const writeFlag = (key, on) => { try { window.localStorage.setItem(key, on ? '1' : '0') } catch { /* storage blocked: lasts this visit */ } }

// a media query as state; jsdom has no matchMedia, so tests get `fallback`
const useMedia = (query, fallback) => {
    const get = () => (typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(query).matches : fallback)
    const [on, setOn] = useState(get)
    useEffect(() => {
        if (typeof window === 'undefined' || !window.matchMedia) return undefined
        const mq = window.matchMedia(query)
        const fn = () => setOn(mq.matches)
        fn()
        mq.addEventListener?.('change', fn)
        return () => mq.removeEventListener?.('change', fn)
    }, [query])
    return on
}

// an element's size, kept by a ResizeObserver (0 until it is measured, and where there is no layout)
const useSize = (ref) => {
    const [size, setSize] = useState({ w: 0, h: 0 })
    useLayoutEffect(() => {
        const el = ref.current
        if (!el) return undefined
        const read = () => {
            const r = el.getBoundingClientRect()
            setSize((s) => (s.w === Math.round(r.width) && s.h === Math.round(r.height) ? s : { w: Math.round(r.width), h: Math.round(r.height) }))
        }
        read()
        if (typeof ResizeObserver !== 'function') return undefined
        const ro = new ResizeObserver(read)
        ro.observe(el)
        return () => ro.disconnect()
    }, [ref])
    return size
}

const same = (a, b) => !!a && !!b && a.kind === b.kind && a.id === b.id

function Chip({ c, flashing, selected, short, onPick, ruler = false }) {
    const on = same(selected, c.target)
    const attr = c.tierId ? { 'data-tier-id': c.tierId, 'data-tier-tone': c.tone } : { 'data-count-id': c.id }
    const flash = flashing?.has(c.tierId ? `t:${c.tierId}` : `k:${c.id}`)
    return (
        <button type="button" {...attr} {...(ruler ? { 'data-ruler-id': c.id, tabIndex: -1 } : { 'data-vital-id': c.id })} aria-pressed={on} title={`${c.label}: ${c.value}`}
            className={`mp-chip tone-${c.tone}${on ? ' is-selected' : ''}${flash ? ' is-changed' : ''}`} onClick={() => onPick(c.target)}>
            <b>{c.value}</b><i>{short ? shortLabel(c) : c.label}</i>
        </button>
    )
}

// The chips with a real priority+ fit: each chip is measured once in a hidden row, the pure fitPriority() says which
// ones fit the width, the rest are named to the parent (the "+N" overlay lists them).
function ChipRegion({ chips, flashing, selected, onPick, onMore, moreOpen, onHidden }) {
    const region = useRef(null)
    const ruler = useRef(null)
    const { w: avail } = useSize(region)
    const short = avail > 0 && avail < 360
    const [widths, setWidths] = useState({})
    const [moreW, setMoreW] = useState(34)
    const key = chips.map((c) => `${c.id}:${c.value}:${short ? 's' : 'l'}`).join('|')
    useLayoutEffect(() => {
        const row = ruler.current
        if (!row) return
        const next = {}
        for (const el of row.querySelectorAll('[data-ruler-id]')) next[el.getAttribute('data-ruler-id')] = Math.ceil(el.getBoundingClientRect().width)
        setWidths((prev) => (JSON.stringify(prev) === JSON.stringify(next) ? prev : next))
        const m = row.querySelector('[data-more]')
        if (m) setMoreW(Math.ceil(m.getBoundingClientRect().width) || 34)
    }, [key])
    const fit = useMemo(() => fitPriority(chips.map((c) => ({ id: c.id, w: widths[c.id] || 0, p: chipPriority(c) })), avail, 4, moreW + 4), [chips, widths, avail, moreW])
    const hiddenKey = fit.hidden.join('|')
    useEffect(() => { onHidden(hiddenKey ? hiddenKey.split('|') : []) }, [hiddenKey, onHidden])
    return (
        <div className="mp-chips" data-box="vital" role="group" aria-label="Vital signs" ref={region}>
            <div className="mp-ruler" ref={ruler} aria-hidden="true">
                {chips.map((c) => <Chip key={c.id} c={c} short={short} onPick={() => {}} ruler />)}
                <span data-more="1" className="mp-chip mp-more">+{Math.max(fit.hidden.length, 9)}</span>
            </div>
            {chips.filter((c) => fit.shown.includes(c.id)).map((c) => <Chip key={c.id} c={c} flashing={flashing} selected={selected} short={short} onPick={onPick} />)}
            {fit.hidden.length ? (
                <button type="button" className="mp-chip mp-more" data-more-chips="1" aria-expanded={moreOpen} aria-label={`${fit.hidden.length} more vital signs`} onClick={onMore}>+{fit.hidden.length}</button>
            ) : null}
        </div>
    )
}

// the one that is down comes before the ones that are only behind
const worstFirst = (needs) => [...needs].sort((a, b) => (b.tone === 'danger') - (a.tone === 'danger'))

export default function MonitorPlace(p) {
    const {
        snap, panels, query, setQuery, filterRef, paused, setPaused, markTone, heardAt, nowMs, error, needs, chips, flashing,
        selected, selectedRow, view, history, feed, earlier, knowledge, shownAgents, narrow, streaming, full, setFullScreen,
        setKeysOpen, overlay, setOverlay, far, onToggleFar, onToggleLayout, onSelectNode, onPick, onOpenTarget, onKnowledge, onPanel, onClosePanel, matches, onReload, sessions
    } = p
    const ws = useWorkspace({ asks: snap?.asks, agents: shownAgents, helpers: knowledge?.agents?.helpers || [] })
    const wide = useMedia(PANEL_WIDE, true)
    const [dockFold, setDockFold] = useState(() => readFlag(DOCK_KEY))
    const [sheet, setSheet] = useState('half')
    const [hiddenIds, setHiddenIds] = useState([])
    const [searchOpen, setSearchOpen] = useState(false)
    const [menuOpen, setMenuOpen] = useState(false)
    const stageRef = useRef(null)
    const stage = useSize(stageRef)
    // the 2D map lays itself out for the stage's own shape (rounded, so a small resize does not shuffle the nodes)
    const aspect = stage.w > 0 && stage.h > 0 ? Math.min(3, Math.max(0.6, Math.round((stage.w / stage.h) * 0.75 * 10) / 10)) : undefined

    const toggleDock = () => setDockFold((f) => { writeFlag(DOCK_KEY, !f); return !f })
    useEffect(() => { setSheet('half') }, [view?.mode, selected?.id])

    const heard = !heardAt ? 'waiting' : paused ? 'paused' : `${Math.max(0, Math.floor((nowMs - heardAt) / 1000))} s`
    const heardTitle = paused ? 'paused' : heardAt ? `heard ${Math.max(0, Math.floor((nowMs - heardAt) / 1000))} s ago` : 'waiting for the server'
    const ordered = useMemo(() => worstFirst(needs), [needs])
    const worst = ordered[0]
    const panelOpen = !!selected || !!view
    const openAsks = ws.shown.length
    const busy = ws.lanes.filter((a) => a.status === 'busy').length
    const newest = feed[0] || earlier[0]

    // a rail chip opens its list in the panel; a tier its detail; the agents chip the dock where the dock is not on screen
    const onChip = useCallback((t) => {
        if (t.kind === 'vital' && LIST_BLOCK[t.id]) onPanel({ mode: 'lists', focus: LIST_BLOCK[t.id] })
        else if (t.kind === 'vital' && t.id === 'agents' && !wide) onPanel({ mode: 'dock' })
        else onOpenTarget(t)
        setOverlay(null)
    }, [onPanel, onOpenTarget, wide, setOverlay])

    const panelRef = useRef(null)
    const scrollTo = view?.mode === 'lists' && view.focus ? `[data-panel="${view.focus}"]` : view?.mode === 'work' && view.part ? `[data-work="${view.part}"]` : null
    useEffect(() => {
        if (!scrollTo) return undefined
        const t = setTimeout(() => panelRef.current?.querySelector(scrollTo)?.scrollIntoView?.({ block: 'start' }), 0)
        return () => clearTimeout(t)
    }, [scrollTo])

    const cycleSheet = () => setSheet((s) => SHEETS[(SHEETS.indexOf(s) + 1) % SHEETS.length])

    const dockBody = (
        <>
            {ws.lanes.map((a) => {
                const helpers = ws.helpersOf.get(String(a.sessionId || '').slice(0, 8)) || []
                const tone = a.status === 'busy' ? 'success' : a.status === 'blocked' ? 'warning' : 'muted'
                return (
                    <div key={a.sessionId} className="mp-agent-group">
                        <button type="button" className={`mp-arow tone-${tone}${a.status === 'busy' ? ' is-busy' : ''}${flashing?.has(`a:${a.machine || ''}${a.sessionId}`) ? ' is-changed' : ''}`}
                            data-lane-id={a.sessionId} data-monitor-id={`a:${a.sessionId}`} onClick={() => onPick('agent', a)}>
                            <i className="mp-dot" aria-hidden="true" />
                            <span className="mp-nm">{a.title}<small>{a.status}{a.machine ? ` · ${a.machine}` : ''}</small></span>
                            <span className="mp-tm">{ago(a.lastActivity)}</span>
                        </button>
                        {helpers.map((h, i) => (
                            <div key={i} className="mp-arow is-helper" data-helper={h.label || h.type || 'helper'}>
                                <i className={`mp-dot${h.busy ? '' : ' is-off'}`} aria-hidden="true" />
                                <span className="mp-nm">{h.label || h.type || 'helper'}</span>
                                <span className="mp-tm">{h.since ? ago(h.since) : ''}</span>
                            </div>
                        ))}
                    </div>
                )
            })}
            {!ws.lanes.length ? <div className="monitor-note" data-box="agents">No live agent sessions.</div> : null}
            {ws.orphans.map((h, i) => (
                <div key={`o${i}`} className="mp-arow is-helper" data-helper={h.label || h.type || 'helper'}>
                    <i className={`mp-dot${h.busy ? '' : ' is-off'}`} aria-hidden="true" />
                    <span className="mp-nm">{h.label || h.type || 'helper'}{h.parent ? <small>of {h.parent}</small> : null}</span>
                    <span className="mp-tm">{h.since ? ago(h.since) : ''}</span>
                </div>
            ))}
            <AskRows ws={ws} asks={snap?.asks} />
        </>
    )

    let panelBody = null
    let panelTitle = ''
    if (selected) {
        panelBody = <MonitorDrawer selected={selected} row={selectedRow} snap={snap} history={history} onClose={onClosePanel} onPick={onPick} />
    } else if (view?.mode === 'work') {
        panelTitle = 'Work'
        panelBody = (
            <div className="monitor-work" data-box="work">
                <div className="mp-subtabs" role="group" aria-label="Work">
                    {WORK_PARTS.map(([id, title]) => (
                        <button key={id} type="button" className="mp-sub" aria-pressed={view.part === id} data-work-pick={id} onClick={() => onPanel({ mode: 'work', part: id })}>{title}</button>
                    ))}
                </div>
                {WORK_PARTS.filter(([id]) => id === view.part).map(([id, title, Body]) => (
                    <section key={id} className="monitor-work-part" data-work={id} aria-label={title}>
                        <Body snap={snap} error={error} />
                    </section>
                ))}
            </div>
        )
    } else if (view?.mode === 'lists') {
        panelTitle = 'Lists'
        panelBody = <MonitorLists snap={snap} panels={panels} query={query} selected={selected} flashing={flashing} nowMs={nowMs} matches={matches} onPick={onPick} />
    } else if (view?.mode === 'activity') {
        panelTitle = 'Activity'
        panelBody = <MonitorActivity feed={feed} earlier={earlier} />
    } else if (view?.mode === 'dock') {
        panelTitle = 'Agents and asks'
        panelBody = <div className="mp-dock-body">{dockBody}</div>
    }

    const hiddenChips = chips.filter((c) => hiddenIds.includes(c.id))

    return (
        <div className={`monitor-place${full ? ' is-full' : ''}`} data-monitor-layout="place" data-monitor-full={full ? 'on' : 'off'} data-view={far ? 'far' : 'near'}
            data-dock={dockFold ? 'fold' : 'open'} data-panel={panelOpen ? 'open' : 'none'}>
            <header className="mp-rail" data-box="rail" data-search={searchOpen ? 'open' : 'closed'} data-alert={worst || error ? 'yes' : 'no'}>
                <span className="mp-live" title={heardTitle}>
                    <i key={heardAt || 'none'} className={`monitor-live-mark tone-${markTone}${heardAt ? ' is-beat' : ''}`} aria-hidden="true" />
                    <span className="monitor-hero-heard">{heard}</span>
                </span>
                {sessions ? (
                    <span className="mp-sess" data-sessions="1" title={`${sessions.live} live, ${sessions.total} sessions`}><b>{sessions.live}</b> Live <b>{sessions.total}</b> Sessions</span>
                ) : null}
                <ChipRegion chips={chips} flashing={flashing} selected={selected} onPick={onChip} onHidden={setHiddenIds}
                    onMore={() => setOverlay(overlay === 'chips' ? null : 'chips')} moreOpen={overlay === 'chips'} />
                {error ? (
                    <span className="mp-alert tone-warning" data-needs="error" role="status"><span className="mp-alert-t">Cannot reach the server</span></span>
                ) : worst ? (
                    <span className={`mp-alert tone-${worst.tone}`} data-needs="rows" data-need-id={worst.id} role="status">
                        <span className="mp-alert-t" title={`${worst.what}. ${worst.why}`}>{worst.what}</span>
                        <button type="button" className="mp-alert-go" onClick={() => onOpenTarget(worst.target)}>{worst.action}</button>
                        {ordered.length > 1 ? (
                            <button type="button" className="mp-alert-n" data-needs-more="1" aria-expanded={overlay === 'needs'} aria-label={`${ordered.length - 1} more that need you`}
                                onClick={() => setOverlay(overlay === 'needs' ? null : 'needs')}>+{ordered.length - 1}</button>
                        ) : null}
                    </span>
                ) : null}
                <span className="mp-tools">
 <button type="button" className="mp-btn mp-find" title="Search every panel" aria-label="Search" aria-expanded={searchOpen} onClick={() => { setSearchOpen((o) => !o); setTimeout(() => filterRef?.current?.focus?.(), 0) }}>&#9906;</button>
                    <input ref={filterRef} className="mp-filter" type="search" placeholder="Filter /" aria-label="Filter every panel" value={query} onChange={(e) => setQuery(e.target.value)} />
                    <button type="button" className="mp-btn" title={paused ? 'Resume the live feed' : 'Pause the live feed'} aria-label={paused ? 'Resume' : 'Pause'} onClick={() => setPaused((x) => !x)}>{paused ? '▶' : 'II'}</button>
                    <button type="button" className="mp-btn mp-wide-only" title="Keys" aria-label="Show keys" onClick={() => setKeysOpen((o) => !o)}>?</button>
                    <button type="button" className="mp-btn mp-wide-only" title={full ? 'Leave full screen' : 'Full screen'} aria-label={full ? 'Leave full screen' : 'Full screen'} aria-pressed={full} onClick={() => setFullScreen(!full)}>{full ? '▣' : '□'}</button>
                    <button type="button" className="mp-btn mp-layout" title="Switch to the tabbed Monitor" aria-label="Switch to tabs" data-layout-toggle="tabs" onClick={onToggleLayout}><span className="mp-lbl">Tabs</span><span className="mp-ico" aria-hidden="true">&#9636;</span></button>
                    <button type="button" className="mp-btn mp-menu-btn" title="More" aria-label="More" aria-haspopup="true" aria-expanded={menuOpen} onClick={() => setMenuOpen((o) => !o)}>&#8943;</button>
                </span>
                {menuOpen ? (
                    <div className="mp-menu" role="menu" aria-label="More">
                        {sessions ? <div className="mp-menu-sess" role="presentation"><b>{sessions.live}</b> Live · <b>{sessions.total}</b> Sessions</div> : null}
                        <button type="button" role="menuitem" className="mp-menu-item" onClick={() => { setMenuOpen(false); onReload?.() }}>Reload</button>
                        <button type="button" role="menuitem" className="mp-menu-item mp-menu-narrow" onClick={() => { setMenuOpen(false); setKeysOpen((o) => !o) }}>Keys</button>
                        <button type="button" role="menuitem" className="mp-menu-item mp-menu-narrow" onClick={() => { setMenuOpen(false); setFullScreen(!full) }}>{full ? 'Leave full screen' : 'Full screen'}</button>
                    </div>
                ) : null}
                {overlay === 'chips' && hiddenChips.length ? (
                    <div className="mp-overlay" role="dialog" aria-label="More vital signs">
                        {hiddenChips.map((c) => <Chip key={c.id} c={c} flashing={flashing} selected={selected} onPick={onChip} />)}
                    </div>
                ) : null}
                {overlay === 'needs' ? (
                    <div className="mp-overlay is-needs" role="dialog" aria-label="Needs you">
                        <NeedsYou rows={ordered} loaded paused={false} error="" checked="" onOpen={(t) => { onOpenTarget(t); setOverlay(null) }} />
                    </div>
                ) : null}
            </header>

            <div className="mp-body">
                <aside className="mp-dock" data-box="dock" aria-label="Agents">
                    <div className="mp-dock-head">
                        <h2>Agents <span className="mp-count">{ws.lanes.length}</span></h2>
                        {openAsks ? <span className="mp-asks-n" title="Open asks">{openAsks} asks</span> : null}
                        <button type="button" className="mp-btn mp-fold" aria-label={dockFold ? 'Open the agents list' : 'Fold the agents list'} aria-pressed={!dockFold} onClick={toggleDock}>{dockFold ? '»' : '«'}</button>
                    </div>
                    <div className="mp-fnum" title={`${ws.lanes.length} agents, ${busy} busy, ${openAsks} open asks`}>{busy || ws.lanes.length}</div>
                    <div className="mp-dock-body">{dockBody}</div>
                </aside>

                <main className="mp-stage" data-box="stage" ref={stageRef}>
                    <MonitorMap map={snap?.map} knowledge={knowledge} snap={snap} onKnowledge={onKnowledge} selectedId={selected?.kind === 'node' ? selected.id : null}
                        narrow={narrow} live={streaming && !paused} query={query} onPick={onSelectNode} aspect={aspect} allViews />
                    {far ? <button type="button" className="mp-farx" onClick={onToggleFar}>Leave far view</button> : null}
                </main>

                {panelOpen ? (
                    <section className="mp-panel" data-box="panel" data-sheet={sheet} ref={panelRef} aria-label={panelTitle || 'Details'}>
                        <button type="button" className="mp-grab" aria-label={`Panel size: ${sheet}. Change`} onClick={cycleSheet}><i aria-hidden="true" /></button>
                        {panelTitle ? (
                            <div className="mp-panel-head">
                                <h2>{panelTitle}</h2>
                                <button type="button" className="mp-btn mp-x" aria-label="Close panel" onClick={onClosePanel}>×</button>
                            </div>
                        ) : null}
                        <div className="mp-panel-body">{panelBody}</div>
                    </section>
                ) : null}
            </div>

            <footer className="mp-ask" data-box="askline">
                <AskForm ws={ws} id="monitor-ask-text" rows={1} compact />
                <button type="button" className="mp-ticker" data-box="ticker" aria-label="Activity" onClick={() => onPanel({ mode: 'activity' })}>
                    <span className="mp-ticker-n">{feed.length}</span>
                    <span className="mp-ticker-t">{newest ? newest.text : 'Nothing new yet'}</span>
                </button>
            </footer>
        </div>
    )
}
