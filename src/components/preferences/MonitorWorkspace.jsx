import { useEffect, useMemo, useRef, useState } from 'react'
import { postMonitorAsk } from '../../services/apiClient.js'
import { ago } from './monitorFormat.js'

// The workspace: the owner's open asks (newest first), what each agent lane is
// doing, which machines reported lately, and one box to send a new ask.

const LANE_TONE = { busy: 'success', blocked: 'warning', idle: 'muted', shell: 'accent' }
const LANE_ORDER = { busy: 0, blocked: 1, idle: 2, shell: 3 }
const ASK_TONE = { sending: 'accent', failed: 'danger' }

const touchedMs = (a) => { const t = new Date(a.touched).getTime(); return Number.isFinite(t) ? t : 0 }

export default function MonitorWorkspace({ asks, agents, reports, onPick }) {
    const [text, setText] = useState('')
    const [pending, setPending] = useState([])
    const [problem, setProblem] = useState('')
    const alive = useRef(true)
    const counter = useRef(0)
    useEffect(() => { alive.current = true; return () => { alive.current = false } }, [])

    const serverRows = useMemo(() => asks?.rows || [], [asks])
    // an optimistic ask goes away once the stream carries the same id
    const shown = useMemo(() => {
        const ids = new Set(serverRows.map((a) => String(a.id)))
        const mine = pending.filter((p) => !ids.has(String(p.id)))
        return [...mine, ...serverRows].sort((a, b) => touchedMs(b) - touchedMs(a))
    }, [serverRows, pending])

    const lanes = useMemo(() => [...(agents?.rows || [])].sort(
        (a, b) => (LANE_ORDER[a.status] ?? 9) - (LANE_ORDER[b.status] ?? 9)
            || new Date(b.lastActivity || 0) - new Date(a.lastActivity || 0)
    ), [agents])

    const send = async (ev) => {
        ev.preventDefault()
        const body = text.trim()
        if (!body) return
        const tempId = `local-${++counter.current}`
        setPending((p) => [{ id: tempId, state: 'sending', touched: new Date().toISOString(), text: body, source: 'page' }, ...p])
        setText('')
        setProblem('')
        try {
            const res = await postMonitorAsk(body)
            if (!alive.current) return
            setPending((p) => p.map((x) => (x.id === tempId ? { ...x, id: res?.id ?? tempId, state: 'open' } : x)))
        } catch (e) {
            if (!alive.current) return
            setPending((p) => p.map((x) => (x.id === tempId ? { ...x, state: 'failed' } : x)))
            setProblem(`Not sent: ${e.message || 'the server refused it'}`)
        }
    }

    return (
        <div className="monitor-workspace">
            <form className="monitor-ask-form" onSubmit={send}>
                <label className="monitor-group-title" htmlFor="monitor-ask-text">Send an ask</label>
                <textarea id="monitor-ask-text" className="monitor-filter monitor-ask-text" rows={3} value={text}
                    placeholder="What should the agents do next?" onChange={(e) => setText(e.target.value)} />
                <div className="monitor-ask-actions">
                    <button type="submit" className="preferences-inline-action" disabled={!text.trim()}>Send ask</button>
                    {problem ? <span className="monitor-note is-down">{problem}</span> : null}
                </div>
            </form>

            <div className="monitor-group-title">Open asks <span className="preferences-tree-tag">{shown.length}</span></div>
            {asks && asks.ok === false ? <div className="monitor-note is-down">Asks unavailable here{asks.error ? `: ${asks.error}` : ''}</div> : null}
            {!shown.length && asks?.ok !== false ? <div className="monitor-note">No open asks.</div> : null}
            <div className="monitor-asks">
                {shown.map((a) => (
                    <div key={a.id} className={`monitor-ask tone-${ASK_TONE[a.state] || 'accent'}`} data-ask-id={a.id}>
                        <div className="monitor-ask-text-line">{a.text}</div>
                        <div className="monitor-meta">{a.state} · {a.source === 'ledger' ? 'ledger' : 'sent here'} · {ago(a.touched)}</div>
                    </div>
                ))}
            </div>

            <div className="monitor-group-title">Agents at work <span className="preferences-tree-tag">{lanes.length}</span></div>
            {!lanes.length ? <div className="monitor-note">No live agent sessions.</div> : null}
            <div className="monitor-grid">
                {lanes.map((a) => (
                    <button key={a.sessionId} type="button" data-lane-id={a.sessionId}
                        className={`monitor-row tone-${LANE_TONE[a.status] || 'accent'}`} onClick={() => onPick('agent', a)}>
                        <span className="monitor-name">{a.title}</span>
                        <span className="monitor-meta">{a.status}{a.machine ? ` · ${a.machine}` : ''} · {ago(a.lastActivity)}</span>
                        <span className="monitor-meta">{a.branch || 'no branch'}</span>
                    </button>
                ))}
            </div>

            <div className="monitor-group-title">Reports from machines <span className="preferences-tree-tag">{(reports || []).length}</span></div>
            {!(reports || []).length ? <div className="monitor-note">No other machine has reported yet.</div> : null}
            <div className="monitor-grid">
                {(reports || []).map((r) => (
                    <div key={r.host} className={`monitor-row tone-${r.stale ? 'warning' : 'success'}`} data-report-host={r.host}>
                        <span className="monitor-name">{r.host}</span>
                        <span className="monitor-meta">{r.stale ? 'stale' : 'reporting'} · {ago(r.reportedAt)}</span>
                        <span className="monitor-meta">{r.panels?.agents?.live ?? 0} agents live</span>
                    </div>
                ))}
            </div>
        </div>
    )
}
