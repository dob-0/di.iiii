import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { InfoPair, ModuleSection, formatTimestamp } from './PreferencesShared.jsx'
import { getMonitor, monitorStreamUrl } from '../../services/apiClient.js'
import { timeAgo, formatBytes, ago } from './monitorFormat.js'
import MonitorOverview, { CountTiles, heroState, tierLabel, tierState, shortCommit } from './MonitorOverview.jsx'
import { diffSnapshots, pushEvents } from './monitorFeed.js'
import MonitorMap, { useNarrow } from './MonitorMap.jsx'
import MonitorWorkspace from './MonitorWorkspace.jsx'

// One page for everything that is going on: machines, the network, agent
// sessions (every Claude login on the machine), services, pull requests, and
// the operator's own feeds (tasks, shows). The server collects each panel on
// its own, so a dead tailnet greys one block and the rest keep moving.
// Flat on purpose (brand SYSTEM.md): square corners, no shadow, the semantic
// triple for state, motion under 0.2 s on named properties only.

const POLL_MS = 5000
const TABS = [['board', 'Board'], ['map', 'Map'], ['workspace', 'Work']]
const FLASH_MS = 2500
const FULL_KEY = 'di.monitor.full'
const SPARK_SAMPLES = 30
const TAB_KEYS = { 1: 'board', 2: 'map', 3: 'workspace' }
const KEYS_HELP = [['1  2  3', 'Board, Map, Work'], ['/', 'Filter everything'], ['f', 'Full screen on or off'], ['Esc', 'Close the inspector, then leave full screen'], ['?', 'This card']]

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

const THING_TONE = { live: 'success', ok: 'success', idle: 'muted', off: 'muted' }

const AGENT_TONE = { busy: 'success', blocked: 'warning', idle: 'muted', shell: 'accent' }

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

function PanelNote({ panel, empty }) {
    if (!panel) return null
    if (!panel.ok) return <div className="monitor-note is-down">Unavailable here: {panel.error}</div>
    return panel.rows?.length ? null : <div className="monitor-note">{empty}</div>
}

function Row({ id, selected, flash, tone, onSelect, children }) {
    return (
        <button
            type="button"
            className={['monitor-row', selected ? 'is-selected' : '', flash ? 'is-changed' : '', tone ? `tone-${tone}` : ''].filter(Boolean).join(' ')}
            aria-pressed={selected}
            data-monitor-id={id}
            onClick={onSelect}
        >
            {children}
        </button>
    )
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
    const [tab, setTab] = useState('board')
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
    const pickNode = useCallback((n) => setSelected({ kind: 'node', id: n.id }), [])

    const setFullScreen = useCallback((on) => {
        setFull(on)
        try { window.localStorage.setItem(FULL_KEY, on ? '1' : '0') } catch { /* storage blocked: the choice lasts this visit */ }
        try { window.history.replaceState(null, '', on ? '#monitor-full' : '#monitor') } catch { /* no history here */ }
    }, [])

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
            if (ev.key === '/') { ev.preventDefault(); filterRef.current?.focus(); return }
            if (ev.key === 'f' || ev.key === 'F') { setFullScreen(!full); return }
            if (ev.key === '?') setKeysOpen((o) => !o)
        }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
    }, [full, selected, keysOpen, setFullScreen])

    const panels = useMemo(() => snap?.panels || {}, [snap])
    const machines = useMemo(
        () => (panels.machines?.rows || []).filter((m) => matches(query, m.name, m.os, m.ip)),
        [panels.machines, query]
    )
    const probes = useMemo(
        () => (panels.network?.rows || []).filter((n) => matches(query, n.name, n.url)),
        [panels.network, query]
    )
    const agentGroups = useMemo(() => {
        const groups = new Map()
        for (const a of panels.agents?.rows || []) {
            if (!matches(query, a.title, a.account, a.machine, a.branch, a.cwd, a.status)) continue
            const key = a.machine ? `${a.machine} / ${a.account}` : a.account
            if (!groups.has(key)) groups.set(key, [])
            groups.get(key).push(a)
        }
        return [...groups.entries()]
    }, [panels.agents, query])
    const things = useMemo(
        () => (panels.connected?.rows || []).filter((c) => matches(query, c.title, c.detail, c.state)),
        [panels.connected, query]
    )
    const places = useMemo(
        () => (panels.presence?.rows || []).filter((u) => matches(query, u.target, u.kind, ...u.people.map((p) => p.name))),
        [panels.presence, query]
    )
    const services = useMemo(() => {
        const rows = (panels.services?.rows || []).filter((s) => matches(query, s.unit, s.description))
        return [...rows].sort((a, b) => (b.active === 'failed') - (a.active === 'failed'))
    }, [panels.services, query])
    const prs = useMemo(
        () => (panels.pullRequests?.rows || []).filter((p) => matches(query, p.title, p.branch, `#${p.number}`)),
        [panels.pullRequests, query]
    )

    const pick = (kind, row) => setSelected({ kind, id: rowId(row) })

    const selectedRow = useMemo(() => {
        if (!selected) return null
        const pool = {
            machine: panels.machines?.rows, probe: panels.network?.rows, agent: panels.agents?.rows,
            service: panels.services?.rows, pr: panels.pullRequests?.rows,
            thing: panels.connected?.rows, place: panels.presence?.rows,
            node: snap?.map?.nodes, tier: snap?.tiers?.rows
        }[selected.kind] || []
        return pool.find((r) => rowId(r) === selected.id) || null
    }, [selected, panels, snap])

    const failed = panels.services?.failed || 0
    const hero = useMemo(() => heroState(snap), [snap])

    // one square per machine, probe, agent … coloured by state, so 4/11 is seen
    const countTiles = useMemo(() => {
        const dot = (tone, title) => ({ tone, title })
        const p = panels
        return [
            { id: 'machines', panel: 'machines', label: 'Machines online', value: p.machines?.ok ? `${p.machines.online}/${p.machines.total}` : '—',
                tone: p.machines?.ok && p.machines.online ? 'success' : 'warning',
                dots: (p.machines?.rows || []).map((m) => dot(m.online ? 'success' : 'muted', `${m.name}: ${m.online ? 'online' : 'offline'}`)) },
            { id: 'network', panel: 'network', label: 'Network up', value: p.network?.ok ? `${p.network.up}/${p.network.total}` : '—',
                tone: p.network?.up === p.network?.total ? 'success' : 'warning',
                dots: (p.network?.rows || []).map((n) => dot(n.ok ? 'success' : 'danger', `${n.name}: ${n.ok ? 'up' : 'down'}`)) },
            { id: 'people', panel: 'presence', label: `People now · ${p.presence?.places ?? 0} place${p.presence?.places === 1 ? '' : 's'}`, value: p.presence?.ok ? p.presence.people : '—',
                tone: p.presence?.people ? 'success' : 'default',
                dots: (p.presence?.rows || []).flatMap((u) => u.people.map((who) => dot('success', `${who.name} in ${u.target}`))) },
            { id: 'things', panel: 'connected', label: 'Things connected', value: p.connected?.ok ? `${p.connected.live}/${p.connected.total}` : '—',
                tone: p.connected?.live ? 'success' : 'warning',
                dots: (p.connected?.rows || []).map((c) => dot(THING_TONE[c.state] || 'muted', `${c.title}: ${c.state}`)) },
            { id: 'agents', panel: 'agents', label: `Agents live · ${p.agents?.busy ?? 0} busy`, value: p.agents?.ok ? p.agents.live : '—',
                tone: 'accent',
                dots: (p.agents?.rows || []).map((a) => dot(AGENT_TONE[a.status] || 'accent', `${a.title}: ${a.status}`)) },
            { id: 'prs', panel: 'prs', label: `Open PRs · ${p.pullRequests?.drafts ?? 0} draft`, value: p.pullRequests?.ok ? p.pullRequests.open : '—',
                tone: 'accent',
                dots: (p.pullRequests?.rows || []).map((r) => dot(r.draft ? 'muted' : 'accent', `#${r.number} ${r.draft ? 'draft' : 'open'}`)) },
            { id: 'services', panel: 'services', label: 'Services failed', value: p.services?.ok ? failed : '—',
                tone: failed ? 'danger' : 'success',
                dots: (p.services?.rows || []).map((sv) => dot(sv.active === 'failed' ? 'danger' : 'success', `${sv.unit}: ${sv.active}`)) }
        ]
    }, [panels, failed])

    const jumpTo = (tile) => {
        setTab('board')
        setTimeout(() => document.querySelector(`[data-panel="${tile.panel}"]`)?.scrollIntoView?.({ behavior: 'smooth', block: 'start' }), 0)
    }

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

    const live = !paused && !error
    const updated = snap ? `updated ${heardAt ? timeAgo(new Date(heardAt).toISOString()) : 'now'}` : 'loading…'
    const flash = (id) => flashing.has(id)
    const heroTone = !snap ? 'muted' : paused ? 'muted' : error ? 'warning' : hero.tone
    const heroText = !snap ? 'Reading the monitor…' : paused ? 'Paused' : error ? 'Cannot reach the server' : hero.headline
    const markTone = paused ? 'muted' : streaming ? 'live' : 'warning'
    const drawerTitle = selectedRow
        ? (selected.kind === 'tier' ? tierLabel(selectedRow.id) : selectedRow.name || selectedRow.label || selectedRow.title || selectedRow.unit || selectedRow.target || `#${selectedRow.number}`)
        : ''
    const devCommit = snap?.tiers?.rows?.find((r) => r.id === 'dev')?.commit

    return (
        <div className={`monitor-page${full ? ' is-full' : ''}${tab === 'map' ? ' is-map' : ''}`} data-monitor-full={full ? 'on' : 'off'}>
            <header className="monitor-bar">
                <div className="monitor-bar-title">
                    <h2>Monitor</h2>
                    <span>{`${snap?.host || 'this machine'} · ${live ? (streaming ? 'live' : 'polling') : paused ? 'paused' : 'offline'} · ${updated}`}</span>
                </div>
                <div className="monitor-bar-actions">
                    <input ref={filterRef} className="monitor-filter" type="search" placeholder="Filter everything  ( / )"
                        aria-label="Filter every panel" value={query} onChange={(e) => setQuery(e.target.value)} />
                    <button type="button" className="preferences-inline-action" onClick={() => setPaused((p) => !p)}>{paused ? 'Resume' : 'Pause'}</button>
                    <button type="button" className="preferences-inline-action" onClick={load}>Refresh</button>
                    <button type="button" className="preferences-inline-action" aria-pressed={full} onClick={() => setFullScreen(!full)}>{full ? 'Leave full screen' : 'Full screen'}</button>
                    <button type="button" className="preferences-inline-action" aria-label="Show keys" onClick={() => setKeysOpen((o) => !o)}>Keys ?</button>
                </div>
            </header>

            {error ? <div className="preferences-empty">{error}</div> : null}

            <div className="monitor-frame">
                <section className={`monitor-hero tone-${heroTone}`} aria-live="polite" data-hero-tone={heroTone}>
                    <div className="monitor-hero-text">{heroText}</div>
                    <div className="monitor-hero-live">
                        <i key={heardAt || 'none'} className={`monitor-live-mark tone-${markTone}${heardAt ? ' is-beat' : ''}`} aria-hidden="true" />
                        <span className="monitor-hero-heard">{paused ? 'paused' : heardLabel(heardAt, nowMs)}</span>
                    </div>
                    {snap && !paused && !error && hero.issues.length > 1 ? (
                        <ul className="monitor-hero-issues">
                            {hero.issues.slice(1).map((i) => <li key={i.text} className={`tone-${i.tone}`}>{i.text}</li>)}
                        </ul>
                    ) : null}
                </section>

                <div className="monitor-area-strip">
                    <div className="monitor-area-tiers">
                        <MonitorOverview tiers={snap?.tiers} spaces={snap?.spaces} history={history} flashing={flashing}
                            selectedId={selected?.kind === 'tier' ? selected.id : null} onPick={(row) => setSelected({ kind: 'tier', id: row.id })} />
                    </div>

                    <div className="monitor-area-counts">
                        <CountTiles tiles={countTiles} flashing={flashing} onPick={jumpTo} />
                    </div>
                </div>

                <div className="monitor-area-tabs monitor-tabs" role="tablist" aria-label="Monitor views">
                    {TABS.map(([id, label], i) => (
                        <button key={id} type="button" role="tab" aria-selected={tab === id} data-monitor-tab={id}
                            className={`monitor-tab${tab === id ? ' is-active' : ''}`} onClick={() => setTab(id)}>{label}<i className="monitor-tab-key" data-key={i + 1} aria-hidden="true" /></button>
                    ))}
                </div>

                <div className="monitor-area-main monitor-main">
                    {tab === 'map' ? (
                        <ModuleSection className="monitor-map-section" title="Map" subtitle="Machines, tiers, spaces and shows — select a node for its details">
                            <MonitorMap map={snap?.map} selectedId={selected?.kind === 'node' ? selected.id : null} narrow={narrow}
                                live={streaming && !paused} onPick={pickNode} />
                        </ModuleSection>
                    ) : null}
                    {tab === 'workspace' ? (
                        <ModuleSection title="Work" subtitle="Asks, what each agent is doing, and machine reports">
                            <MonitorWorkspace asks={snap?.asks} agents={panels.agents} reports={snap?.reports}
                                onPick={(kind, row) => setSelected({ kind, id: rowId(row) })} />
                        </ModuleSection>
                    ) : null}
                    {tab === 'board' ? (<>
                    <div data-panel="machines"><ModuleSection title="Machines" subtitle="Tailnet — who is on, who was last seen">
                        <PanelNote panel={panels.machines} empty="No machines reported." />
                        <div className="monitor-grid">
                            {machines.map((m) => (
                                <Row key={m.id} id={`m:${m.id}`} tone={m.online ? 'success' : 'muted'} flash={flash(`m:${m.id}`)}
                                    selected={selected?.kind === 'machine' && selected.id === m.id} onSelect={() => pick('machine', m)}>
                                    <span className="monitor-name">{m.name}{m.self ? ' · this' : ''}</span>
                                    <span className="monitor-meta">{m.online ? 'online' : `off · ${timeAgo(m.lastSeen)}`} · {m.os || '—'}</span>
                                </Row>
                            ))}
                        </div>
                    </ModuleSection></div>

                    <div data-panel="network"><ModuleSection title="Network" subtitle="Tiers and addresses we probe">
                        <PanelNote panel={panels.network} empty="No probes configured." />
                        <div className="monitor-grid">
                            {probes.map((n) => (
                                <Row key={n.id} id={`n:${n.id}`} tone={n.ok ? 'success' : 'danger'} flash={flash(`n:${n.id}`)}
                                    selected={selected?.kind === 'probe' && selected.id === n.id} onSelect={() => pick('probe', n)}>
                                    <span className="monitor-name">{n.name}</span>
                                    <span className="monitor-meta">{n.ok ? `${n.status} · ${n.ms} ms` : `down · ${n.status || String(n.error || 'no answer').slice(0, 30)}`}</span>
                                </Row>
                            ))}
                        </div>
                    </ModuleSection></div>

                    <div data-panel="connected"><ModuleSection title="Connected things" subtitle="Lasers, lights, show machine, video, OSC, visiting apps">
                        <PanelNote panel={panels.connected} empty="Nothing reported." />
                        <div className="monitor-grid">
                            {things.map((c) => (
                                <Row key={c.id} id={`c:${c.id}`} tone={THING_TONE[c.state] || 'muted'} flash={flash(`c:${c.id}`)}
                                    selected={selected?.kind === 'thing' && selected.id === c.id} onSelect={() => pick('thing', c)}>
                                    <span className="monitor-name">{c.title}</span>
                                    <span className="monitor-meta">{c.state} · {c.detail}</span>
                                </Row>
                            ))}
                        </div>
                    </ModuleSection></div>

                    <div data-panel="presence"><ModuleSection title="People now" subtitle={`${panels.presence?.people ?? 0} connected in ${panels.presence?.places ?? 0} space${panels.presence?.places === 1 ? '' : 's'} or project${panels.presence?.places === 1 ? '' : 's'}`}>
                        <PanelNote panel={panels.presence} empty="Nobody is connected right now." />
                        <div className="monitor-grid">
                            {places.map((u) => (
                                <Row key={u.id} id={`u:${u.id}`} tone="success" flash={flash(`u:${u.id}`)}
                                    selected={selected?.kind === 'place' && selected.id === u.id} onSelect={() => pick('place', u)}>
                                    <span className="monitor-name">{u.kind} {u.target}</span>
                                    <span className="monitor-meta">{u.people.length} here · {u.people.slice(0, 3).map((p) => p.name).join(', ')}{u.people.length > 3 ? '…' : ''}</span>
                                </Row>
                            ))}
                        </div>
                    </ModuleSection></div>

                    <div data-panel="agents"><ModuleSection title="Agents" subtitle={`${panels.agents?.live ?? 0} live of ${panels.agents?.total ?? 0} sessions · accounts: ${(panels.agents?.accounts || []).join(', ') || 'none found'}`}>
                        <PanelNote panel={panels.agents} empty="No live agent sessions." />
                        {(panels.agents?.remotes || []).filter((r) => !r.ok).map((r) => (
                            <div key={r.name} className="monitor-note">{r.name}: not reachable ({r.error})</div>
                        ))}
                        {agentGroups.map(([account, rows]) => (
                            <div key={account} className="monitor-group">
                                <div className="monitor-group-title">{account} <span className="preferences-tree-tag">{rows.length}</span></div>
                                <div className="monitor-grid">
                                    {rows.map((a) => (
                                        <Row key={a.sessionId} id={`a:${a.sessionId}`} tone={AGENT_TONE[a.status] || 'accent'} flash={flash(`a:${a.sessionId}`)}
                                            selected={selected?.kind === 'agent' && selected.id === a.sessionId} onSelect={() => pick('agent', a)}>
                                            <span className="monitor-name">{a.title}</span>
                                            <span className="monitor-meta">{a.status} · {timeAgo(a.lastActivity)}</span>
                                        </Row>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </ModuleSection></div>

                    <ModuleSection title="Tasks and shows" subtitle="Your feeds from ~/.di/monitor.json">
                        {!snap?.configured ? (
                            <div className="monitor-note">No feeds yet. Add feeds with panel &ldquo;tasks&rdquo; or &ldquo;shows&rdquo; to ~/.di/monitor.json — a command, a file or a URL each.</div>
                        ) : null}
                        {['tasks', 'shows'].map((key) => (panels[key]?.rows || []).map((feedRow) => (
                            <div key={`${key}:${feedRow.id}`} className={`monitor-feed${feedRow.ok ? '' : ' is-down'}`}>
                                <div className="monitor-group-title">{feedRow.title} <span className="preferences-tree-tag">{key}</span>{feedRow.updatedAt ? <span className="monitor-meta"> · {timeAgo(feedRow.updatedAt)}</span> : null}</div>
                                {feedRow.ok
                                    ? <pre className="monitor-pre">{feedRow.lines.filter((l) => matches(query, l)).join('\n') || '—'}</pre>
                                    : <div className="monitor-note is-down">Unavailable here: {feedRow.error}</div>}
                            </div>
                        )))}
                    </ModuleSection>

                    <div data-panel="services"><ModuleSection title="Services" subtitle={`${panels.services?.running ?? 0} running · ${failed} failed (failed first)`}>
                        <PanelNote panel={panels.services} empty="No services reported." />
                        <div className="monitor-grid">
                            {services.map((sv) => (
                                <Row key={sv.unit} id={`s:${sv.unit}`} tone={sv.active === 'failed' ? 'danger' : 'success'} flash={flash(`s:${sv.unit}`)}
                                    selected={selected?.kind === 'service' && selected.id === sv.unit} onSelect={() => pick('service', sv)}>
                                    <span className="monitor-name">{sv.unit.replace(/\.service$/, '')}</span>
                                    <span className="monitor-meta">{sv.active} · {sv.sub}</span>
                                </Row>
                            ))}
                        </div>
                    </ModuleSection></div>

                    <div data-panel="prs"><ModuleSection title="Pull requests" subtitle="Open work on this repo">
                        <PanelNote panel={panels.pullRequests} empty="No open pull requests." />
                        <div className="monitor-grid">
                            {prs.map((p) => (
                                <Row key={p.number} id={`p:${p.number}`} tone={p.draft ? 'muted' : 'accent'} flash={flash(`p:${p.number}`)}
                                    selected={selected?.kind === 'pr' && selected.id === p.number} onSelect={() => pick('pr', p)}>
                                    <span className="monitor-name">#{p.number} {p.title}</span>
                                    <span className="monitor-meta">{p.draft ? 'draft' : 'open'} · {timeAgo(p.updatedAt)}</span>
                                </Row>
                            ))}
                        </div>
                    </ModuleSection></div>
                    </>) : null}
                </div>

                <aside className="monitor-area-feed monitor-changes" aria-label="What changed">
                    <div className="monitor-group-title">What changed <span className="preferences-tree-tag">{feed.length}</span></div>
                    {!feed.length ? <div className="monitor-note">Nothing has changed since you opened this page.</div> : null}
                    <ol className="monitor-events">
                        {feed.map((e) => (
                            <li key={e.id} className={`monitor-event tone-${e.tone}`} data-event-key={e.key}>
                                <span className="monitor-event-text">{e.text}</span>
                                <span className="monitor-meta">{ago(new Date(e.at).toISOString())}</span>
                            </li>
                        ))}
                    </ol>
                </aside>
            </div>

            {selected ? (
                <aside className="monitor-inspector monitor-drawer" aria-label="Inspector">
                    <div className="monitor-drawer-head">
                        <div className="preferences-stage-sidebar-title">{`Inspector${selectedRow ? ` — ${drawerTitle}` : ''}`}</div>
                        <button type="button" className="preferences-inline-action monitor-drawer-close" aria-label="Close inspector" onClick={() => setSelected(null)}>×</button>
                    </div>
                    {!selectedRow ? <div className="preferences-empty">That one is not in the latest snapshot.</div> : null}
                    {selected?.kind === 'tier' && selectedRow ? (
                        <>
                            <InfoPair label="State" value={tierState(selectedRow, devCommit).note} />
                            <InfoPair label="Commit" value={shortCommit(selectedRow.commit)} mono />
                            <InfoPair label="Address" value={selectedRow.url || 'n/a'} mono />
                            <InfoPair label="Answer" value={`${selectedRow.status ?? '—'}${typeof selectedRow.ms === 'number' ? ` · ${selectedRow.ms} ms` : ''}`} mono />
                            <InfoPair label="Built" value={selectedRow.builtAt ? formatTimestamp(selectedRow.builtAt) : 'n/a'} />
                            <InfoPair label="Behind dev" value={typeof selectedRow.behindDev === 'number' ? String(selectedRow.behindDev) : 'unknown'} mono />
                        </>
                    ) : null}
                    {selected?.kind === 'machine' && selectedRow ? (
                        <>
                            <InfoPair label="State" value={selectedRow.online ? 'online' : 'offline'} mono />
                            <InfoPair label="System" value={selectedRow.os || 'n/a'} mono />
                            <InfoPair label="Address" value={selectedRow.ip || 'n/a'} mono />
                            <InfoPair label="Last seen" value={selectedRow.online ? 'now' : formatTimestamp(selectedRow.lastSeen)} />
                            <InfoPair label="Sent / received" value={`${formatBytes(selectedRow.tx)} / ${formatBytes(selectedRow.rx)}`} mono />
                        </>
                    ) : null}
                    {selected?.kind === 'probe' && selectedRow ? (
                        <>
                            <InfoPair label="Address" value={selectedRow.url} mono />
                            <InfoPair label="Answer" value={selectedRow.status ? String(selectedRow.status) : 'no answer'} mono />
                            <InfoPair label="Time" value={`${selectedRow.ms} ms`} mono />
                            {selectedRow.error ? <InfoPair label="Error" value={selectedRow.error} mono /> : null}
                        </>
                    ) : null}
                    {selected?.kind === 'agent' && selectedRow ? (
                        <>
                            <InfoPair label="Account" value={selectedRow.account} mono />
                            <InfoPair label="Status" value={`${selectedRow.status} (${selectedRow.kind})`} mono />
                            <InfoPair label="Branch" value={selectedRow.branch || 'n/a'} mono />
                            <InfoPair label="Checkout" value={selectedRow.cwd || 'n/a'} mono />
                            <InfoPair label="Model" value={selectedRow.model || 'n/a'} mono />
                            <InfoPair label="Last activity" value={formatTimestamp(selectedRow.lastActivity)} />
                            <InfoPair label="Session" value={selectedRow.sessionId} mono />
                        </>
                    ) : null}
                    {selected?.kind === 'thing' && selectedRow ? (
                        <>
                            <InfoPair label="Thing" value={selectedRow.title} />
                            <InfoPair label="State" value={selectedRow.state} mono />
                            <InfoPair label="Detail" value={selectedRow.detail} />
                        </>
                    ) : null}
                    {selected?.kind === 'place' && selectedRow ? (
                        <>
                            <InfoPair label={selectedRow.kind} value={selectedRow.target} mono />
                            <InfoPair label="Connected" value={String(selectedRow.people.length)} />
                            {selectedRow.people.map((p, i) => (
                                <InfoPair key={`${p.name}-${i}`} label={p.name} value={`since ${timeAgo(p.since)}`} />
                            ))}
                        </>
                    ) : null}
                    {selected?.kind === 'service' && selectedRow ? (
                        <>
                            <InfoPair label="Unit" value={selectedRow.unit} mono />
                            <InfoPair label="State" value={`${selectedRow.active} · ${selectedRow.sub}`} mono />
                            <InfoPair label="What" value={selectedRow.description || 'n/a'} />
                        </>
                    ) : null}
                    {selected?.kind === 'node' && selectedRow ? (
                        <>
                            <InfoPair label={selectedRow.kind} value={selectedRow.label} />
                            <InfoPair label="State" value={selectedRow.state} mono />
                            <InfoPair label="Id" value={selectedRow.id} mono />
                            {(snap?.map?.edges || []).filter((e) => e.from === selectedRow.id || e.to === selectedRow.id).map((e, i) => {
                                const otherId = e.from === selectedRow.id ? e.to : e.from
                                const other = (snap.map.nodes || []).find((n) => n.id === otherId)
                                return <InfoPair key={`${e.kind}-${otherId}-${i}`} label={e.kind} value={other?.label || otherId} />
                            })}
                        </>
                    ) : null}
                    {selected?.kind === 'pr' && selectedRow ? (
                        <>
                            <InfoPair label="Number" value={`#${selectedRow.number}`} mono />
                            <InfoPair label="Branch" value={selectedRow.branch} mono />
                            <InfoPair label="State" value={selectedRow.draft ? 'draft' : 'open'} mono />
                            <InfoPair label="Updated" value={formatTimestamp(selectedRow.updatedAt)} />
                            <a className="preferences-inline-action" href={selectedRow.url} target="_blank" rel="noreferrer">Open on GitHub</a>
                        </>
                    ) : null}
                </aside>
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
