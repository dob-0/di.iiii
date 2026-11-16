import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ModuleSection } from './PreferencesShared.jsx'
import { getMonitor, monitorStreamUrl } from '../../services/apiClient.js'
import { timeAgo, formatBytes } from './monitorFormat.js'
import { diffSnapshots, pushEvents } from './monitorFeed.js'
import MonitorMap, { useNarrow } from './MonitorMap.jsx'
import MonitorWorkspace from './MonitorWorkspace.jsx'
import { NeedsYou, VitalStrip } from './MonitorVital.jsx'
import MonitorActivity from './MonitorActivity.jsx'
import MonitorLists from './MonitorLists.jsx'
import MonitorDrawer from './MonitorDrawer.jsx'
import useBackEntry from '../../hooks/useBackEntry.js'
import { needsYou, vitalChips, seedActivity } from './monitorCalm.js'
import { monitorKnowledge } from './monitorKnowledge.js'
import { HooksBody, RequestsBody, RulesBody, SkillsBody } from './KnowledgeWindows.jsx'

// One page for everything that is going on, in the order a person needs it:
// the bar, what needs him (one row, one action), the vital strip, then Now / Map / Lists.
// Flat on purpose (brand SYSTEM.md): square corners, no shadow, the semantic triple for state,
// motion under 0.2 s on named properties only.

const POLL_MS = 5000
const TABS = [['now', 'Now'], ['map', 'Map'], ['lists', 'Lists'], ['work', 'Work']]
const FLASH_MS = 2500
const FULL_KEY = 'di.monitor.full'
const SPARK_SAMPLES = 30
const TAB_KEYS = { 1: 'now', 2: 'map', 3: 'lists', 4: 'work' }
const KEYS_HELP = [['1  2  3  4', 'Now, Map, Lists, Work'], ['/', 'Filter everything'], ['r', 'Read the server again'], ['f', 'Full screen on or off'], ['Esc', 'Close the inspector, then leave full screen'], ['?', 'This card']]

// remembered per browser; storage can be blocked, so every touch is guarded
const readFull = () => {
    try {
        if (String(window.location.hash || '') === '#monitor-full') return true
        return window.localStorage.getItem(FULL_KEY) === '1'
    } catch { return false }
}
const heardLabel = (heardAt, nowMs) => {
    if (!heardAt) return 'waiting'
    const s = Math.max(0, Math.floor((nowMs - heardAt) / 1000))
    if (s < 1) return 'heard just now'
    if (s < 60) return `heard ${s} s ago`
    return `heard ${Math.floor(s / 60)} min ago`
}
const typing = (el) => !!el && (['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName) || el.isContentEditable)

export { timeAgo, formatBytes }

// every row has one id the server made unique (tailnet address, URL, session id, unit, PR number)
const rowId = (row) => row.id ?? row.sessionId ?? row.unit ?? row.number ?? row.name

// One signature per row; when it changes between two polls the row flashes.
// One signature per row; when it changes between two polls the row flashes.
const signatures = (snap) => {
    const panels = snap?.panels
    const sig = {}
    for (const m of panels?.machines?.rows || []) sig[`m:${m.id}`] = String(m.online)
    for (const n of panels?.network?.rows || []) sig[`n:${n.id}`] = `${n.ok}:${n.status}`
    for (const a of panels?.agents?.rows || []) sig[`a:${a.machine || ''}${a.sessionId}`] = a.status
    for (const s of panels?.services?.rows || []) sig[`s:${s.unit}`] = s.active
    for (const c of panels?.connected?.rows || []) sig[`c:${c.id}`] = `${c.state}:${c.detail}`
    for (const u of panels?.presence?.rows || []) sig[`u:${u.id}`] = String(u.people.length)
    for (const p of panels?.pullRequests?.rows || []) sig[`p:${p.number}`] = `${p.draft}:${p.updatedAt}`
    for (const t of snap?.tiers?.rows || []) sig[`t:${t.id}`] = `${t.status}:${t.commit}:${t.behindDev}`
    const k = panels
    sig['k:machines'] = `${k?.machines?.online}/${k?.machines?.total}`
    sig['k:network'] = `${k?.network?.up}/${k?.network?.total}`
    sig['k:people'] = String(k?.presence?.people)
    sig['k:things'] = `${k?.connected?.live}/${k?.connected?.total}`
    sig['k:agents'] = `${k?.agents?.live}:${k?.agents?.busy}`
    sig['k:prs'] = `${k?.pullRequests?.open}:${k?.pullRequests?.drafts}`
    sig['k:services'] = String(k?.services?.failed)
    return sig
}


const matches = (query, ...parts) => {
    const q = query.trim().toLowerCase()
    return !q || parts.some((part) => String(part ?? '').toLowerCase().includes(q))
}

const RECONNECT_MIN_MS = 3000
const RECONNECT_MAX_MS = 30000
export const nextBackoff = (ms) => Math.min(RECONNECT_MAX_MS, ms * 2)

export default function MonitorSection({ onStats }) {
    const [snap, setSnap] = useState(null)
    const [unavailable, setUnavailable] = useState(false)
    const [error, setError] = useState('')
    const [paused, setPaused] = useState(false)
    const [query, setQuery] = useState('')
    const [selected, setSelected] = useState(null)
    const [tab, setTab] = useState('now')
    const [streaming, setStreaming] = useState(false)
    // when the page last heard from the server (a snapshot or a heartbeat), not when the data was built
    const [heardAt, setHeardAt] = useState(null)
    const [full, setFull] = useState(readFull)
    const [keysOpen, setKeysOpen] = useState(false)
    // response times of each tier, the last SPARK_SAMPLES snapshots, kept in the page only
    const [history, setHistory] = useState({})
    const [feed, setFeed] = useState([])
    const narrow = useNarrow()
    const [flashing, setFlashing] = useState(() => new Set())
    const [nowMs, setNowMs] = useState(() => Date.now())
    const previous = useRef(null)
    const previousSnap = useRef(null)
    const eventCount = useRef(0)
    const filterRef = useRef(null)
    const seq = useRef(0)
    const flashTimer = useRef(null)
    const alive = useRef(true)
    // set on every mount: StrictMode (src/index.jsx) mounts, unmounts and mounts again in dev,
    // and a flag left false by that first cleanup drops every answer (the page stayed "loading…")
    useEffect(() => {
        alive.current = true
        return () => { alive.current = false; clearTimeout(flashTimer.current) }
    }, [])

    // one place that takes a snapshot, from a poll or from the stream
    const apply = useCallback((next) => {
        const sig = signatures(next)
        if (previous.current) {
            const changed = Object.keys(sig).filter((k) => previous.current[k] !== sig[k])
            if (changed.length) {
                setFlashing(new Set(changed))
                clearTimeout(flashTimer.current)
                flashTimer.current = setTimeout(() => setFlashing(new Set()), FLASH_MS)
            }
        }
        previous.current = sig
        const events = diffSnapshots(previousSnap.current, next)
        previousSnap.current = next
        if (events.length) {
            const stamped = events.map((e) => ({ ...e, id: ++eventCount.current }))
            setFeed((f) => pushEvents(f, stamped))
        }
        setHistory((h) => {
            const out = { ...h }
            for (const t of next.tiers?.rows || []) {
                if (typeof t.ms === 'number') out[t.id] = [...(out[t.id] || []), t.ms].slice(-SPARK_SAMPLES)
            }
            return out
        })
        setHeardAt(Date.now())
        setSnap(next)
        setUnavailable(false)
        setError('')
        const a = next.panels?.agents
        onStats?.({ live: a?.live || 0, total: a?.total || 0 })
    }, [onStats])

    const load = useCallback(async () => {
        const mine = ++seq.current
        try {
            const next = await getMonitor()
            // a slower, older answer must not overwrite a newer one (or land after unmount)
            if (!alive.current || mine !== seq.current) return
            apply(next)
        } catch (e) {
            if (!alive.current || mine !== seq.current) return
            if (e.status === 404) setUnavailable(true)
            else setError(e.message || 'Failed to load the monitor.')
        }
    }, [apply])

    // live: the stream carries every change; polling runs only while it does not.
    // A CLOSED source (an HTTP refusal, e.g. a 502 while serverXR restarts) is reopened with a backoff.
    useEffect(() => {
        if (paused || typeof EventSource === 'undefined') return undefined
        let source = null
        let retry = null
        let delay = RECONNECT_MIN_MS
        let stopped = false
        const onSnapshot = (ev) => {
            if (!alive.current) return
            try {
                const next = JSON.parse(ev.data)
                seq.current += 1 // an older poll answer must not land over it
                apply(next)
                setStreaming(true)
            } catch { /* a broken frame is skipped; the next one or the poll recovers */ }
        }
        const onHeartbeat = () => { if (alive.current) setHeardAt(Date.now()) }
        const drop = () => {
            if (!source) return
            source.removeEventListener('snapshot', onSnapshot)
            source.removeEventListener('heartbeat', onHeartbeat)
            source.close()
            source = null
        }
        const open = () => {
            retry = null
            try { source = new EventSource(monitorStreamUrl(), { withCredentials: true }) } catch { source = null; schedule(); return }
            const mine = source
            source.addEventListener('snapshot', onSnapshot)
            source.addEventListener('heartbeat', onHeartbeat)
            source.onopen = () => { delay = RECONNECT_MIN_MS }
            source.onerror = () => {
                // The server ends streams on purpose (15 min, session expiry, a slow client) and says
                // retry: 3000, so the browser reconnects by itself: polling covers the gap and the next
                // snapshot says "live" again. Only a CLOSED source is over: we open a new one later.
                if (alive.current) setStreaming(false)
                if (stopped || mine !== source) return
                if (mine.readyState === EventSource.CLOSED) { drop(); schedule() }
            }
        }
        function schedule() {
            if (stopped || retry) return
            retry = setTimeout(open, delay)
            delay = nextBackoff(delay)
        }
        open()
        return () => {
            stopped = true
            clearTimeout(retry)
            drop()
            setStreaming(false)
        }
    }, [apply, paused])

    // one read at the start (it also finds out the page is refused); the stream
    // flipping on or off must not trigger another, it would land over a newer snapshot
    useEffect(() => { load() }, [load, paused])
    useEffect(() => {
        if (paused || streaming) return undefined
        const timer = setInterval(load, POLL_MS)
        return () => clearInterval(timer)
    }, [load, paused, streaming])

    // the "heard Ns ago" label moves every second without another request
    useEffect(() => {
        const timer = setInterval(() => setNowMs(Date.now()), 1000)
        return () => clearInterval(timer)
    }, [])

    // stable: the 3D map is memoized and must not wake up for the 1 s clock above it
    const pickNode = useCallback((n) => setSelected({ kind: 'node', id: n.id, node: n }), [])

    // a to do / rules / skills / hooks node on the map opens that part of the Work view
    const openWork = useCallback((part) => {
        setTab('work')
        setTimeout(() => document.querySelector(`[data-work="${part}"]`)?.scrollIntoView?.({ block: 'start' }), 0)
    }, [])

    const setFullScreen = useCallback((on) => {
        setFull(on)
        try { window.localStorage.setItem(FULL_KEY, on ? '1' : '0') } catch { /* storage blocked: the choice lasts this visit */ }
    }, [])

    // Back: each place is one history entry, so Back leaves full screen, closes the inspector or the keys card, and the
    // Map or Lists tab goes back to Now, before it leaves the Monitor (it used to replace the entry and leave /admin).
    // Leaving by the page's own button or Esc removes the entry again. See src/hooks/useBackEntry.js.
    useBackEntry(full, () => setFullScreen(false), { id: 'monitor-full', url: '#monitor-full' })
    useBackEntry(!!selected, () => setSelected(null), { id: 'monitor-inspector' })
    useBackEntry(keysOpen, () => setKeysOpen(false), { id: 'monitor-keys' })
    useBackEntry(tab !== 'now', () => setTab('now'), { id: 'monitor-tab' })

    // keys: ignored while typing in a field (Esc still works: it closes things)
    useEffect(() => {
        const onKey = (ev) => {
            if (ev.ctrlKey || ev.metaKey || ev.altKey) return
            if (ev.key === 'Escape') {
                if (keysOpen) setKeysOpen(false)
                else if (selected) setSelected(null)
                else if (full) setFullScreen(false)
                else if (typing(ev.target)) ev.target.blur?.()
                return
            }
            if (typing(ev.target)) return
            if (TAB_KEYS[ev.key]) { setTab(TAB_KEYS[ev.key]); return }
            if (ev.key === 'r' || ev.key === 'R') { load(); return }
            if (ev.key === '/') { ev.preventDefault(); filterRef.current?.focus(); return }
            if (ev.key === 'f' || ev.key === 'F') { setFullScreen(!full); return }
            if (ev.key === '?') setKeysOpen((o) => !o)
        }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
    }, [full, selected, keysOpen, setFullScreen, load])

    const panels = useMemo(() => snap?.panels || {}, [snap])
    const pick = (kind, row) => setSelected({ kind, id: rowId(row) })
    const openTarget = useCallback((t) => setSelected({ kind: t.kind, id: t.id }), [])

    const selectedRow = useMemo(() => {
        if (!selected) return null
        if (selected.kind === 'vital') return { id: selected.id }
        if (selected.kind === 'node') return selected.node || null
        const pool = {
            machine: panels.machines?.rows, probe: panels.network?.rows, agent: panels.agents?.rows,
            service: panels.services?.rows, pr: panels.pullRequests?.rows,
            thing: panels.connected?.rows, place: panels.presence?.rows, tier: snap?.tiers?.rows
        }[selected.kind] || []
        return pool.find((r) => rowId(r) === selected.id) || null
    }, [selected, panels, snap])

    const needs = useMemo(() => needsYou(snap), [snap])
    const chips = useMemo(() => vitalChips(snap, snap?.host), [snap])
    const earlier = useMemo(() => seedActivity(snap, nowMs), [snap]) // eslint-disable-line react-hooks/exhaustive-deps
    // what drives the agents, from every machine's report: to do, rules, skills, hooks, helpers
    const knowledge = useMemo(() => (snap ? monitorKnowledge(snap) : null), [snap])
    const shownAgents = useMemo(() => {
        const rows = (panels.agents?.rows || []).filter((a) => matches(query, a.title, a.account, a.machine, a.branch, a.cwd, a.status))
        return { ...(panels.agents || {}), rows }
    }, [panels.agents, query])

    if (unavailable) {
        return (
            <ModuleSection title="Monitor" subtitle="Only on the machine you are sitting at">
                <div className="preferences-empty">
                    The monitor runs on a local di, signed in as admin. This server refuses it from anywhere else
                    because it lists machines and session titles.
                </div>
            </ModuleSection>
        )
    }

    const markTone = paused ? 'muted' : streaming ? 'live' : 'warning'
    const checked = heardAt ? `checked ${Math.max(0, Math.floor((nowMs - heardAt) / 1000))} s ago` : 'checking'

    return (
        <div className={`monitor-page${full ? ' is-full' : ''}${tab === 'map' ? ' is-map' : ''}`} data-monitor-full={full ? 'on' : 'off'}>
            <header className="monitor-bar" data-box="bar">
                <h2 className="monitor-bar-name">Monitor</h2>
                <span className="monitor-bar-live">
                    <i key={heardAt || 'none'} className={`monitor-live-mark tone-${markTone}${heardAt ? ' is-beat' : ''}`} aria-hidden="true" />
                    <span className="monitor-hero-heard">{paused ? 'paused' : heardLabel(heardAt, nowMs)}</span>
                </span>
                <div className="monitor-bar-actions">
                    <input ref={filterRef} className="monitor-filter" type="search" placeholder="Filter  ( / )"
                        aria-label="Filter every panel" value={query} onChange={(e) => setQuery(e.target.value)} />
                    <button type="button" className="preferences-inline-action" onClick={() => setPaused((p) => !p)}>{paused ? 'Resume' : 'Pause'}</button>
                    <button type="button" className="preferences-inline-action" aria-label="Show keys" onClick={() => setKeysOpen((o) => !o)}>Keys ?</button>
                    <button type="button" className="preferences-inline-action" aria-pressed={full} onClick={() => setFullScreen(!full)}>{full ? 'Leave full screen' : 'Full screen'}</button>
                </div>
            </header>

            {error ? <div className="preferences-empty">{error}</div> : null}

            <NeedsYou rows={needs} loaded={!!snap} paused={paused} error={error} checked={checked} onOpen={openTarget} />
            <VitalStrip chips={chips} flashing={flashing} selected={selected} onPick={openTarget} />

            <div className="monitor-tabs" data-box="tabs" role="tablist" aria-label="Monitor views">
                {TABS.map(([id, label], i) => (
                    <button key={id} type="button" role="tab" aria-selected={tab === id} data-monitor-tab={id}
                        className={`monitor-tab${tab === id ? ' is-active' : ''}`} onClick={() => setTab(id)}>{label}<i className="monitor-tab-key" data-key={i + 1} aria-hidden="true" /></button>
                ))}
            </div>

            <div className="monitor-main">
                {tab === 'now' ? (
                    <div className="monitor-now">
                        <MonitorWorkspace asks={snap?.asks} agents={shownAgents} helpers={knowledge?.agents?.helpers || []} flashing={flashing} onPick={pick} />
                        <MonitorActivity feed={feed} earlier={earlier} />
                    </div>
                ) : null}
                {tab === 'map' ? (
                    <ModuleSection className="monitor-map-section" title="Map" subtitle="Spaces by name, with the tiers they live on — select a node for its details">
                        <MonitorMap map={snap?.map} knowledge={knowledge} snap={snap} onKnowledge={openWork} selectedId={selected?.kind === 'node' ? selected.id : null} narrow={narrow}
                            live={streaming && !paused} query={query} onPick={pickNode} />
                    </ModuleSection>
                ) : null}
                {tab === 'work' ? (
                    <div className="monitor-work" data-box="work">
                        {[['todo', 'To do', RequestsBody], ['rules', 'Rules', RulesBody], ['skills', 'Skills', SkillsBody], ['hooks', 'Hooks', HooksBody]].map(([id, title, Body]) => (
                            <section key={id} className="monitor-work-part" data-work={id} aria-label={title}>
                                <div className="monitor-group-title">{title}</div>
                                <Body snap={snap} error={error} />
                            </section>
                        ))}
                    </div>
                ) : null}
                {tab === 'lists' ? (
                    <MonitorLists snap={snap} panels={panels} query={query} selected={selected} flashing={flashing} nowMs={nowMs} matches={matches} onPick={pick} />
                ) : null}
            </div>

            {selected ? (
                <MonitorDrawer selected={selected} row={selectedRow} snap={snap} history={history} onClose={() => setSelected(null)} onPick={pick} />
            ) : null}

            {keysOpen ? (
                <div className="monitor-keys" role="dialog" aria-label="Keys">
                    <div className="monitor-drawer-head">
                        <div className="preferences-stage-sidebar-title">Keys</div>
                        <button type="button" className="preferences-inline-action monitor-drawer-close" aria-label="Close keys" onClick={() => setKeysOpen(false)}>×</button>
                    </div>
                    {KEYS_HELP.map(([k, what]) => (
                        <div key={k} className="monitor-keys-row"><kbd>{k}</kbd><span>{what}</span></div>
                    ))}
                </div>
            ) : null}
        </div>
    )
}
