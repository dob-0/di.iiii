import { useState } from 'react'
import { ago, timeAgo } from './monitorFormat.js'
import { freshness } from './MonitorWorkspace.jsx'
import { machineLabels, THING_TONE } from './monitorCalm.js'

// Lists: the long lists, one block each. Online and failing things first; the quiet rest is folded into
// one line ("7 off · show") that opens on click, and opens by itself while a filter is typing.

const rowId = (row) => row.id ?? row.sessionId ?? row.unit ?? row.number ?? row.name

function PanelNote({ panel, empty }) {
    if (!panel) return null
    if (!panel.ok) return <div className="monitor-note is-down">Unavailable here: {panel.error}</div>
    return panel.rows?.length ? null : <div className="monitor-note">{empty}</div>
}

export function Row({ id, selected, flash, tone, onSelect, children }) {
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

// `head` always shows; `rest` hides behind one line until it is opened (or `force`: a filter is typing)
function Folded({ head, rest, noun, force, render }) {
    const [open, setOpen] = useState(false)
    const all = force || open
    return (
        <>
            <div className="monitor-grid">{head.map(render)}</div>
            {rest.length && !all ? <button type="button" className="monitor-fold" data-fold={noun} onClick={() => setOpen(true)}>{rest.length} {noun} · show</button> : null}
            {rest.length && all ? <div className="monitor-grid" data-fold-open={noun}>{rest.map(render)}</div> : null}
        </>
    )
}

function Block({ id, title, subtitle, children }) {
    return (
        <section className="monitor-block" data-panel={id}>
            <div className="monitor-block-head"><h3>{title}</h3>{subtitle ? <span className="monitor-meta">{subtitle}</span> : null}</div>
            {children}
        </section>
    )
}

const PR_HEAD = 8

export default function MonitorLists({ snap, panels, query, selected, flashing, nowMs, matches, onPick }) {
    const force = !!query.trim()
    const flash = (id) => flashing.has(id)
    const sel = (kind, id) => selected?.kind === kind && selected.id === id

    const allMachines = panels.machines?.rows || []
    const labels = machineLabels(allMachines)
    const machines = allMachines.filter((m) => matches(query, m.name, m.os, m.ip))
    const online = machines.filter((m) => m.online)
    const off = machines.filter((m) => !m.online)
    const things = (panels.connected?.rows || []).filter((c) => matches(query, c.title, c.detail, c.state))
    const places = (panels.presence?.rows || []).filter((u) => matches(query, u.target, u.kind, ...u.people.map((p) => p.name)))
    const services = (panels.services?.rows || []).filter((s) => matches(query, s.unit, s.description))
    const failedRows = services.filter((s) => s.active === 'failed')
    const runningRows = services.filter((s) => s.active !== 'failed')
    const prs = (panels.pullRequests?.rows || []).filter((p) => matches(query, p.title, p.branch, `#${p.number}`))
    // the tiers' own addresses are said by the vital strip; only the other probes are listed here
    const tierUrls = new Set((snap?.tiers?.rows || []).map((t) => t.url).filter(Boolean))
    const probes = (panels.network?.rows || []).filter((n) => !tierUrls.has(n.url) && matches(query, n.name, n.url))
    const people = panels.presence?.people ?? 0
    const placeCount = panels.presence?.places ?? 0
    const reports = snap?.reports || []
    const feeds = ['tasks', 'shows'].flatMap((key) => (panels[key]?.rows || []).map((feedRow) => ({ key, feedRow })))

    return (
        <div className="monitor-lists" data-monitor-lists>
            <Block id="machines" title="Machines" subtitle={`${online.length} on · ${off.length} off`}>
                <PanelNote panel={panels.machines} empty="No machines reported." />
                <Folded head={online} rest={off} noun="off" force={force} render={(m) => (
                    <Row key={m.id} id={`m:${m.id}`} tone={m.online ? 'success' : 'muted'} flash={flash(`m:${m.id}`)} selected={sel('machine', m.id)} onSelect={() => onPick('machine', m)}>
                        <span className="monitor-name">{labels.get(m.id)}{m.self ? ' · this' : ''}</span>
                        <span className="monitor-meta">{m.online ? 'online' : `off · ${timeAgo(m.lastSeen)}`}{labels.get(m.id) === m.name ? ` · ${m.os || '—'}` : ''}</span>
                    </Row>
                )} />
            </Block>

            <Block id="presence" title="People" subtitle={`${people} ${people === 1 ? 'person' : 'people'} in ${placeCount} space${placeCount === 1 ? '' : 's'}`}>
                <PanelNote panel={panels.presence} empty="Nobody is connected right now." />
                <div className="monitor-grid">
                    {places.map((u) => (
                        <Row key={u.id} id={`u:${u.id}`} tone="success" flash={flash(`u:${u.id}`)} selected={sel('place', u.id)} onSelect={() => onPick('place', u)}>
                            <span className="monitor-name">{u.kind} {u.target}</span>
                            <span className="monitor-meta">{u.people.length} here · {u.people.slice(0, 3).map((p) => p.name).join(', ')}{u.people.length > 3 ? '…' : ''}</span>
                        </Row>
                    ))}
                </div>
            </Block>

            <Block id="connected" title="Show gear" subtitle="Lasers, lights, show machine, video, OSC, visiting apps">
                <PanelNote panel={panels.connected} empty="Nothing reported." />
                <div className="monitor-grid">
                    {things.map((c) => (
                        <Row key={c.id} id={`c:${c.id}`} tone={THING_TONE[c.state] || 'muted'} flash={flash(`c:${c.id}`)} selected={sel('thing', c.id)} onSelect={() => onPick('thing', c)}>
                            <span className="monitor-name">{c.title}</span>
                            <span className="monitor-meta">{c.state} · {c.detail}</span>
                        </Row>
                    ))}
                </div>
            </Block>

            <Block id="services" title="Services" subtitle={`${panels.services?.running ?? 0} running · ${panels.services?.failed ?? 0} failed`}>
                <PanelNote panel={panels.services} empty="No services reported." />
                <Folded head={failedRows} rest={runningRows} noun="running" force={force} render={(sv) => (
                    <Row key={sv.unit} id={`s:${sv.unit}`} tone={sv.active === 'failed' ? 'danger' : 'success'} flash={flash(`s:${sv.unit}`)} selected={sel('service', sv.unit)} onSelect={() => onPick('service', sv)}>
                        <span className="monitor-name">{sv.unit.replace(/\.service$/, '')}</span>
                        <span className="monitor-meta">{sv.active} · {sv.sub}</span>
                    </Row>
                )} />
            </Block>

            <Block id="prs" title="Pull requests" subtitle={`${panels.pullRequests?.open ?? 0} open · ${panels.pullRequests?.drafts ?? 0} draft`}>
                <PanelNote panel={panels.pullRequests} empty="No open pull requests." />
                <Folded head={prs.slice(0, PR_HEAD)} rest={prs.slice(PR_HEAD)} noun="more" force={force} render={(p) => (
                    <Row key={p.number} id={`p:${p.number}`} tone={p.draft ? 'muted' : 'accent'} flash={flash(`p:${p.number}`)} selected={sel('pr', p.number)} onSelect={() => onPick('pr', p)}>
                        <span className="monitor-name">#{p.number} {p.title}</span>
                        <span className="monitor-meta">{p.draft ? 'draft' : 'open'} · {timeAgo(p.updatedAt)}</span>
                    </Row>
                )} />
            </Block>

            {probes.length ? (
                <Block id="network" title="Other addresses" subtitle="Probed besides the tiers">
                    <div className="monitor-grid">
                        {probes.map((n) => (
                            <Row key={n.id} id={`n:${n.id}`} tone={n.ok ? 'success' : 'danger'} flash={flash(`n:${n.id}`)} selected={sel('probe', n.id)} onSelect={() => onPick('probe', n)}>
                                <span className="monitor-name">{n.name}</span>
                                <span className="monitor-meta">{n.ok ? `${n.status} · ${n.ms} ms` : `down · ${n.status || String(n.error || 'no answer').slice(0, 30)}`}</span>
                            </Row>
                        ))}
                    </div>
                </Block>
            ) : null}

            {reports.length ? (
                <Block id="reports" title="Reports from machines" subtitle={`${reports.length}`}>
                    <div className="monitor-grid">
                        {reports.map((r) => (
                            <div key={r.host} className={`monitor-row monitor-report tone-${r.stale ? 'warning' : 'success'}`} data-report-host={r.host}>
                                <span className="monitor-name">{r.host}</span>
                                <span className="monitor-meta">{r.stale ? 'stale' : 'reporting'} · {ago(r.reportedAt)}</span>
                                <span className="monitor-meta">{r.panels?.agents?.live ?? 0} agents live</span>
                                <span className="monitor-fresh" aria-hidden="true"><i style={{ width: `${Math.round(freshness(r.reportedAt, nowMs) * 100)}%` }} /></span>
                            </div>
                        ))}
                    </div>
                </Block>
            ) : null}

            {feeds.length ? (
                <Block id="feeds" title="Tasks and shows" subtitle="Your feeds from ~/.di/monitor.json">
                    {feeds.map(({ key, feedRow }) => (
                        <div key={`${key}:${feedRow.id}`} className={`monitor-feed${feedRow.ok ? '' : ' is-down'}`}>
                            <div className="monitor-group-title">{feedRow.title} <span className="preferences-tree-tag">{key}</span>{feedRow.updatedAt ? <span className="monitor-meta"> · {timeAgo(feedRow.updatedAt)}</span> : null}</div>
                            {feedRow.ok
                                ? <pre className="monitor-pre">{feedRow.lines.filter((l) => matches(query, l)).join('\n') || '—'}</pre>
                                : <div className="monitor-note is-down">Unavailable here: {feedRow.error}</div>}
                        </div>
                    ))}
                </Block>
            ) : null}
        </div>
    )
}

export { rowId }
