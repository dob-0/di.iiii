import { useMemo, useState } from 'react'
import { Drawer, Fold } from './PreferencesShared.jsx'
import { monitorKnowledge } from './monitorKnowledge.js'
import { ago } from './monitorFormat.js'

// The knowledge windows of the owner's desk: Rules, Hooks, Requests, and the helpers list the Agents
// window wears. All of it comes from monitorKnowledge(snapshot) and nothing else; a window says "Reading"
// until the first snapshot, and an unreadable file is said, never invented.

const clip = (text, n = 90) => { const s = String(text ?? ''); return s.length > n ? `${s.slice(0, n - 1)}…` : s }

const Waiting = ({ snap, error }) => (
    <div className="preferences-empty">{error && !snap ? 'Cannot reach the server' : 'Reading…'}</div>
)

const Unreadable = ({ list }) => (list.length ? (
    <ul className="admin-note-list">
        {list.map((u) => <li key={u.host} className="admin-note tone-warning"><b>{u.host}</b> {u.why}</li>)}
    </ul>
) : null)

export function RulesBody({ snap, error }) {
    const k = useMemo(() => (snap ? monitorKnowledge(snap) : null), [snap])
    const [newest, setNewest] = useState(true)
    const [picked, setPicked] = useState(null)
    if (!k) return <Waiting snap={snap} error={error} />
    const { sets, unreadable } = k.rules
    if (!sets.length) return <><div className="preferences-empty">No rules reported yet.</div><Unreadable list={unreadable} /></>
    return (
        <div className="admin-knowledge">
            {sets.map((set) => {
                const indexed = set.rows.map((row, i) => ({ row, i }))
                const rows = newest ? [...indexed].reverse() : indexed
                return (
                    <section key={set.hosts.join(',')} className="admin-knowledge-set" aria-label={set.hosts.join(', ')}>
                        <div className="admin-knowledge-head">
                            <span className="admin-chip">{set.count} rules</span>
                            <span className="admin-chip" title={set.hosts.join(', ')}>{set.sameText || set.hosts[0]}</span>
                            <button type="button" className="preferences-inline-action" aria-pressed={newest} onClick={() => setNewest((v) => !v)}>
                                {newest ? 'Newest first' : 'File order'}
                            </button>
                        </div>
                        <ul className="admin-rows">
                            {rows.map(({ row, i }) => (
                                <li key={i}>
                                    <button type="button" className="admin-row" aria-pressed={picked?.i === i} onClick={() => setPicked({ i, row })}>
                                        <span className="admin-row-title">{row.title}</span>
                                        <span className="admin-row-meta">{row.date || ''}</span>
                                    </button>
                                </li>
                            ))}
                        </ul>
                    </section>
                )
            })}
            <Unreadable list={unreadable} />
            {picked ? (
                <Drawer title={picked.row.title} onClose={() => setPicked(null)}>
                    <p className="admin-rule-text">{picked.row.text || ''}</p>
                    <div className="admin-row-meta">{picked.row.date || ''} · {picked.row.lines} lines</div>
                </Drawer>
            ) : null}
        </div>
    )
}

export function HooksBody({ snap, error }) {
    const k = useMemo(() => (snap ? monitorKnowledge(snap) : null), [snap])
    if (!k) return <Waiting snap={snap} error={error} />
    const { sets, unreadable } = k.hooks
    if (!sets.length) return <><div className="preferences-empty">No hooks reported yet.</div><Unreadable list={unreadable} /></>
    return (
        <div className="admin-knowledge">
            {sets.map((set) => {
                const byEvent = new Map()
                for (const row of set.rows) {
                    if (!byEvent.has(row.event)) byEvent.set(row.event, [])
                    byEvent.get(row.event).push(row)
                }
                return (
                    <section key={set.hosts.join(',')} className="admin-knowledge-set" aria-label={set.hosts.join(', ')}>
                        <div className="admin-knowledge-head">
                            <span className="admin-chip">{set.count} hooks</span>
                            <span className="admin-chip" title={set.hosts.join(', ')}>{set.sameText || set.hosts[0]}</span>
                        </div>
                        {[...byEvent.entries()].map(([event, rows]) => (
                            <Fold key={event} title={event} count={rows.length} open>
                                <ul className="admin-rows">
                                    {rows.map((row, i) => (
                                        <li key={i} className="admin-row is-static">
                                            <span className="admin-row-title">{row.name}</span>
                                            <span className="admin-row-meta">{row.matcher || 'any'}</span>
                                            <span className={`admin-chip scope-${row.scope}`}>{row.scope}</span>
                                        </li>
                                    ))}
                                </ul>
                            </Fold>
                        ))}
                    </section>
                )
            })}
            <Unreadable list={unreadable} />
        </div>
    )
}

const STATE_TONE = { NEW: 'warning', WAITING: 'warning', BLOCKED: 'danger', OPEN: 'default', RUNNING: 'success', DONE: 'muted', CLOSED: 'muted' }

export function RequestsBody({ snap, error }) {
    const k = useMemo(() => (snap ? monitorKnowledge(snap) : null), [snap])
    const [picked, setPicked] = useState(null)
    if (!k) return <Waiting snap={snap} error={error} />
    const { rows, empty, byState } = k.rows
    if (empty) return <div className="preferences-empty">Rows come from aylmo’s ledger when it reports.</div>
    return (
        <div className="admin-knowledge">
            <div className="admin-knowledge-head">
                {Object.entries(byState).map(([state, n]) => <span key={state} className={`admin-chip tone-${STATE_TONE[String(state).toUpperCase()] || 'default'}`}><b>{n}</b> {state}</span>)}
            </div>
            <ul className="admin-rows">
                {rows.map((row) => (
                    <li key={row.id}>
                        <button type="button" className="admin-row" aria-pressed={picked?.id === row.id} onClick={() => setPicked(row)}>
                            <i className={`admin-square tone-${STATE_TONE[String(row.state).toUpperCase()] || 'default'}`} aria-hidden="true" />
                            <span className="admin-row-id">{row.id}</span>
                            <span className="admin-row-title">{clip(row.text)}</span>
                            <span className="admin-row-meta">{row.touched || ''}</span>
                        </button>
                    </li>
                ))}
            </ul>
            {picked ? (
                <Drawer title={String(picked.id)} onClose={() => setPicked(null)}>
                    <p className="admin-rule-text">{picked.text || ''}</p>
                    <div className="admin-row-meta">{picked.state} · {picked.touched || ''}</div>
                </Drawer>
            ) : null}
        </div>
    )
}

/** The Agents window's helpers: label, a square for busy, since when. Nothing when no host reports any. */
export function HelpersList({ snap }) {
    const helpers = useMemo(() => (snap ? monitorKnowledge(snap).agents.helpers : []), [snap])
    if (!helpers.length) return null
    return (
        <Fold title="Helpers" count={helpers.length} open>
            <ul className="admin-rows" data-testid="helpers">
                {helpers.map((h, i) => (
                    <li key={`${h.host}:${h.parent}:${i}`} className="admin-row is-static">
                        <i className={`admin-square tone-${h.busy ? 'success' : 'muted'}`} aria-hidden="true" />
                        <span className="admin-row-title">{h.label || h.type || 'helper'}</span>
                        <span className="admin-row-meta">{h.parent ? `of ${h.parent}` : h.host}</span>
                        <span className="admin-row-meta">{h.since ? ago(h.since) : ''}</span>
                    </li>
                ))}
            </ul>
        </Fold>
    )
}
