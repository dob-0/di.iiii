import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { InfoPair, MetricCard, ModuleSection, formatTimestamp } from './PreferencesShared.jsx'
import { getMonitor, monitorStreamUrl } from '../../services/apiClient.js'
import { timeAgo, formatBytes } from './monitorFormat.js'
import MonitorOverview from './MonitorOverview.jsx'
import MonitorMap, { useNarrow } from './MonitorMap.jsx'
import MonitorWorkspace from './MonitorWorkspace.jsx'

// One page for everything that is going on: machines, the network, agent
// sessions (every Claude login on the machine), services, pull requests, and
// the operator's own feeds (tasks, shows). The server collects each panel on
// its own, so a dead tailnet greys one block and the rest keep moving.
// Flat on purpose (brand SYSTEM.md): square corners, no shadow, the semantic
// triple for state, motion under 0.2 s on named properties only.

const POLL_MS = 5000
const TABS = [['board', 'Board'], ['map', 'Map'], ['workspace', 'Workspace']]
const FLASH_MS = 2500

export { timeAgo, formatBytes }

// every row has one id the server made unique (tailnet address, URL, session id, unit, PR number)
const rowId = (row) => row.id ?? row.sessionId ?? row.unit ?? row.number ?? row.name

const THING_TONE = { live: 'success', ok: 'success', idle: 'muted', off: 'muted' }

const AGENT_TONE = { busy: 'success', blocked: 'warning', idle: 'muted', shell: 'accent' }

// One signature per row; when it changes between two polls the row flashes.
const signatures = (panels) => {
    const sig = {}
    for (const m of panels?.machines?.rows || []) sig[`m:${m.id}`] = String(m.online)
    for (const n of panels?.network?.rows || []) sig[`n:${n.id}`] = `${n.ok}:${n.status}`
    for (const a of panels?.agents?.rows || []) sig[`a:${a.machine || ''}${a.sessionId}`] = a.status
    for (const s of panels?.services?.rows || []) sig[`s:${s.unit}`] = s.active
    for (const c of panels?.connected?.rows || []) sig[`c:${c.id}`] = `${c.state}:${c.detail}`
    for (const u of panels?.presence?.rows || []) sig[`u:${u.id}`] = String(u.people.length)
    for (const p of panels?.pullRequests?.rows || []) sig[`p:${p.number}`] = `${p.draft}:${p.updatedAt}`
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

export default function MonitorSection({ onStats }) {
    const [snap, setSnap] = useState(null)
    const [unavailable, setUnavailable] = useState(false)
    const [error, setError] = useState('')
    const [paused, setPaused] = useState(false)
    const [query, setQuery] = useState('')
    const [selected, setSelected] = useState(null)
    const [tab, setTab] = useState('board')
    const [streaming, setStreaming] = useState(false)
    const narrow = useNarrow()
    const [flashing, setFlashing] = useState(() => new Set())
    const [, setTick] = useState(0)
    const previous = useRef(null)
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
        const sig = signatures(next.panels)
        if (previous.current) {
            const changed = Object.keys(sig).filter((k) => previous.current[k] !== sig[k])
            if (changed.length) {
                setFlashing(new Set(changed))
                clearTimeout(flashTimer.current)
                flashTimer.current = setTimeout(() => setFlashing(new Set()), FLASH_MS)
            }
        }
        previous.current = sig
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

    // live: the stream carries every change; polling runs only while it does not
    useEffect(() => {
        if (paused || typeof EventSource === 'undefined') return undefined
        let source
        try { source = new EventSource(monitorStreamUrl(), { withCredentials: true }) } catch { return undefined }
        const onSnapshot = (ev) => {
            if (!alive.current) return
            try {
                const next = JSON.parse(ev.data)
                seq.current += 1 // an older poll answer must not land over it
                apply(next)
                setStreaming(true)
            } catch { /* a broken frame is skipped; the next one or the poll recovers */ }
        }
        source.addEventListener('snapshot', onSnapshot)
        source.onerror = () => {
            // 404 or a dropped connection: close for good and let polling carry on
            source.close()
            if (alive.current) setStreaming(false)
        }
        return () => { source.removeEventListener('snapshot', onSnapshot); source.close(); setStreaming(false) }
    }, [apply, paused])

    // one read at the start (it also finds out the page is refused); the stream
    // flipping on or off must not trigger another, it would land over a newer snapshot
    useEffect(() => { load() }, [load, paused])
    useEffect(() => {
        if (paused || streaming) return undefined
        const timer = setInterval(load, POLL_MS)
        return () => clearInterval(timer)
    }, [load, paused, streaming])

    // the "updated Ns ago" label moves every second without another request
    useEffect(() => {
        const timer = setInterval(() => setTick((n) => n + 1), 1000)
        return () => clearInterval(timer)
    }, [])

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
            node: snap?.map?.nodes
        }[selected.kind] || []
        return pool.find((r) => rowId(r) === selected.id) || null
    }, [selected, panels, snap])

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

    const failed = panels.services?.failed || 0
    const live = !paused && !error
    const updated = snap ? `updated ${timeAgo(snap.generatedAt)}` : 'loading…'

    const flash = (id) => flashing.has(id)

    return (
        <>
            <ModuleSection
                title="Monitor"
                subtitle={`${snap?.host || 'this machine'} · ${live ? (streaming ? 'live' : 'polling') : paused ? 'paused' : 'offline'} · ${updated}`}
                actions={(
                    <>
                        <input
                            className="monitor-filter"
                            type="search"
                            placeholder="Filter everything"
                            aria-label="Filter every panel"
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                        />
                        <button type="button" className="preferences-inline-action" onClick={() => setPaused((p) => !p)}>
                            {paused ? 'Resume' : 'Pause'}
                        </button>
                        <button type="button" className="preferences-inline-action" onClick={load}>Refresh</button>
                    </>
                )}
            >
                {error ? <div className="preferences-empty">{error}</div> : null}
                <MonitorOverview tiers={snap?.tiers} spaces={snap?.spaces} />
                <div className="monitor-metrics">
                    <MetricCard label="Machines online" value={panels.machines?.ok ? `${panels.machines.online}/${panels.machines.total}` : '—'} tone={panels.machines?.ok ? (panels.machines.online ? 'success' : 'warning') : 'warning'} />
                    <MetricCard label="Network up" value={panels.network?.ok ? `${panels.network.up}/${panels.network.total}` : '—'} tone={panels.network?.up === panels.network?.total ? 'success' : 'warning'} />
                    <MetricCard label={`People now · ${panels.presence?.places ?? 0} place${panels.presence?.places === 1 ? '' : 's'}`} value={panels.presence?.ok ? panels.presence.people : '—'} tone={panels.presence?.people ? 'success' : 'default'} />
                    <MetricCard label="Things connected" value={panels.connected?.ok ? `${panels.connected.live}/${panels.connected.total}` : '—'} tone={panels.connected?.live ? 'success' : 'warning'} />
                    <MetricCard label={`Agents live · ${panels.agents?.busy ?? 0} busy`} value={panels.agents?.ok ? panels.agents.live : '—'} tone="accent" />
                    <MetricCard label="Services failed" value={panels.services?.ok ? failed : '—'} tone={failed ? 'warning' : 'success'} />
                    <MetricCard label={`Open PRs · ${panels.pullRequests?.drafts ?? 0} draft`} value={panels.pullRequests?.ok ? panels.pullRequests.open : '—'} tone="accent" />
                </div>
                <div className="monitor-tabs" role="tablist" aria-label="Monitor views">
                    {TABS.map(([id, label]) => (
                        <button key={id} type="button" role="tab" aria-selected={tab === id} data-monitor-tab={id}
                            className={`monitor-tab${tab === id ? ' is-active' : ''}`} onClick={() => setTab(id)}>{label}</button>
                    ))}
                </div>
            </ModuleSection>

            <div className="monitor-layout">
                <div className="monitor-main">
                    {tab === 'map' ? (
                        <ModuleSection title="Map" subtitle="Machines, tiers, spaces and shows — select a node for its details">
                            <MonitorMap map={snap?.map} selectedId={selected?.kind === 'node' ? selected.id : null} narrow={narrow}
                                onPick={(n) => setSelected({ kind: 'node', id: n.id })} />
                        </ModuleSection>
                    ) : null}
                    {tab === 'workspace' ? (
                        <ModuleSection title="Workspace" subtitle="Asks, agent lanes and machine reports">
                            <MonitorWorkspace asks={snap?.asks} agents={panels.agents} reports={snap?.reports}
                                onPick={(kind, row) => setSelected({ kind, id: rowId(row) })} />
                        </ModuleSection>
                    ) : null}
                    {tab === 'board' ? (<>
                    <ModuleSection title="Machines" subtitle="Tailnet — who is on, who was last seen">
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
                    </ModuleSection>

                    <ModuleSection title="Network" subtitle="Tiers and addresses we probe">
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
                    </ModuleSection>

                    <ModuleSection title="Connected things" subtitle="Lasers, lights, show machine, video, OSC, visiting apps">
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
                    </ModuleSection>

                    <ModuleSection title="People now" subtitle={`${panels.presence?.people ?? 0} connected in ${panels.presence?.places ?? 0} space${panels.presence?.places === 1 ? '' : 's'} or project${panels.presence?.places === 1 ? '' : 's'}`}>
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
                    </ModuleSection>

                    <ModuleSection title="Agents" subtitle={`${panels.agents?.live ?? 0} live of ${panels.agents?.total ?? 0} sessions · accounts: ${(panels.agents?.accounts || []).join(', ') || 'none found'}`}>
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
                    </ModuleSection>

                    <ModuleSection title="Tasks and shows" subtitle="Your feeds from ~/.di/monitor.json">
                        {!snap?.configured ? (
                            <div className="monitor-note">No feeds yet. Add feeds with panel &ldquo;tasks&rdquo; or &ldquo;shows&rdquo; to ~/.di/monitor.json — a command, a file or a URL each.</div>
                        ) : null}
                        {['tasks', 'shows'].map((key) => (panels[key]?.rows || []).map((feed) => (
                            <div key={`${key}:${feed.id}`} className={`monitor-feed${feed.ok ? '' : ' is-down'}`}>
                                <div className="monitor-group-title">{feed.title} <span className="preferences-tree-tag">{key}</span>{feed.updatedAt ? <span className="monitor-meta"> · {timeAgo(feed.updatedAt)}</span> : null}</div>
                                {feed.ok
                                    ? <pre className="monitor-pre">{feed.lines.filter((l) => matches(query, l)).join('\n') || '—'}</pre>
                                    : <div className="monitor-note is-down">Unavailable here: {feed.error}</div>}
                            </div>
                        )))}
                    </ModuleSection>

                    <ModuleSection title="Services" subtitle={`${panels.services?.running ?? 0} running · ${failed} failed (failed first)`}>
                        <PanelNote panel={panels.services} empty="No services reported." />
                        <div className="monitor-grid">
                            {services.map((s) => (
                                <Row key={s.unit} id={`s:${s.unit}`} tone={s.active === 'failed' ? 'danger' : 'success'} flash={flash(`s:${s.unit}`)}
                                    selected={selected?.kind === 'service' && selected.id === s.unit} onSelect={() => pick('service', s)}>
                                    <span className="monitor-name">{s.unit.replace(/\.service$/, '')}</span>
                                    <span className="monitor-meta">{s.active} · {s.sub}</span>
                                </Row>
                            ))}
                        </div>
                    </ModuleSection>

                    <ModuleSection title="Pull requests" subtitle="Open work on this repo">
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
                    </ModuleSection>
                    </>) : null}
                </div>

                <aside className="monitor-inspector preferences-stage-sidebar-block preferences-node-inspector" aria-label="Inspector">
                    <div className="preferences-stage-sidebar-title">Inspector{selectedRow ? ` — ${selectedRow.name || selectedRow.label || selectedRow.title || selectedRow.unit || selectedRow.target || `#${selectedRow.number}`}` : ''}</div>
                    {!selectedRow ? <div className="preferences-empty">Select anything on the page to see its details.</div> : null}
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
            </div>
        </>
    )
}
