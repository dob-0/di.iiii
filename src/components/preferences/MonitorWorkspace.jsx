import { useEffect, useMemo, useRef, useState } from 'react'
import { postMonitorAsk } from '../../services/apiClient.js'
import { ago } from './monitorFormat.js'
import MonitorChats from './MonitorChats.jsx'

// Work: one big ask bar on top, the open asks (newest first), what each agent is
// doing (a live square when busy), and which machines reported lately, each with
// a freshness bar that runs down as its last report ages toward stale (120 s).
export const STALE_MS = 120000
export const freshness = (iso, nowMs = Date.now()) => {
    const age = nowMs - new Date(iso).getTime()
    if (!Number.isFinite(age)) return 0
    return Math.max(0, Math.min(1, 1 - age / STALE_MS))
}

const LANE_TONE = { busy: 'success', blocked: 'warning', idle: 'muted', shell: 'accent' }
const LANE_ORDER = { busy: 0, blocked: 1, idle: 2, shell: 3 }
const ASK_TONE = { sending: 'accent', failed: 'danger' }

const touchedMs = (a) => { const t = new Date(a.touched).getTime(); return Number.isFinite(t) ? t : 0 }

export const dropSeen = (pending, serverRows) => {
    const ids = new Set((serverRows || []).map((a) => String(a.id)))
    const left = pending.filter((p) => !ids.has(String(p.id)))
    return left.length === pending.length ? pending : left
}

export default function MonitorWorkspace({ chats, asks, agents, reports, onPick }) {
    const [text, setText] = useState('')
    const [pending, setPending] = useState([])
    const [problem, setProblem] = useState('')
    const [now, setNow] = useState(() => Date.now())
    useEffect(() => {
        const timer = setInterval(() => setNow(Date.now()), 1000)
        return () => clearInterval(timer)
    }, [])
    const alive = useRef(true)
    const counter = useRef(0)
    useEffect(() => { alive.current = true; return () => { alive.current = false } }, [])

    const serverRows = useMemo(() => asks?.rows || [], [asks])
    // an optimistic ask goes away once the server's list has shown the same id, and stays gone: the list is
    // only the open asks, so an ask an agent finishes must not come back from `pending` as "open"
    useEffect(() => {
        setPending((p) => dropSeen(p, serverRows))
    }, [serverRows])
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

    const onKey = (ev) => {
        // Enter sends, Shift+Enter is a new line
        if (ev.key === 'Enter' && !ev.shiftKey && !ev.nativeEvent?.isComposing) send(ev)
    }

    return (
        <div className="monitor-workspace">
            <form className="monitor-ask-form" onSubmit={send}>
                <textarea id="monitor-ask-text" className="monitor-ask-text" rows={2} value={text} aria-label="Send an ask"
                    placeholder="Tell the agents…" onChange={(e) => setText(e.target.value)} onKeyDown={onKey} />
                <button type="submit" className="monitor-ask-send" disabled={!text.trim()}>Send ask</button>
                <span className="monitor-meta monitor-ask-hint">Enter sends · Shift+Enter new line</span>
                {problem ? <span className="monitor-note is-down">{problem}</span> : null}
            </form>

            <div className="monitor-group-title">Chats <span className="preferences-tree-tag">{chats?.counts?.total ?? 0}</span></div>
            <MonitorChats chats={chats} />

            <div className="monitor-group-title">Open asks <span className="preferences-tree-tag">{shown.length}</span></div>
            {asks && asks.ok === false ? <div className="monitor-note is-down">Asks unavailable here{asks.error ? `: ${asks.error}` : ''}</div> : null}
            {!shown.length && asks?.ok !== false ? <div className="monitor-note">No open asks.</div> : null}
            <div className="monitor-asks">
                {shown.map((a) => (
                    <div key={a.id} className={`monitor-ask tone-${ASK_TONE[a.state] || 'accent'}${a.state === 'sending' ? ' is-sending' : ''}`} data-ask-id={a.id}>
                        <div className="monitor-ask-text-line">{a.text}</div>
                        <div className="monitor-meta">{a.state} · {a.source === 'ledger' ? 'ledger' : 'sent here'} · {ago(a.touched)}</div>
                    </div>
                ))}
            </div>

            <div className="monitor-group-title">Agents at work <span className="preferences-tree-tag">{lanes.length}</span></div>
            {!lanes.length ? <div className="monitor-note">No live agent sessions.</div> : null}
            <div className="monitor-agent-grid">
                {lanes.map((a) => (
                    <button key={a.sessionId} type="button" data-lane-id={a.sessionId}
                        className={`monitor-agent tone-${LANE_TONE[a.status] || 'accent'}`} onClick={() => onPick('agent', a)}>
                        <span className="monitor-agent-head">
                            {a.status === 'busy' ? <i className="monitor-live-square" aria-label="busy" /> : <i className="monitor-live-square is-off" aria-hidden="true" />}
                            <span className="monitor-name">{a.title}</span>
                        </span>
                        <span className="monitor-meta">{a.status}{a.machine ? ` · ${a.machine}` : ''} · {ago(a.lastActivity)}</span>
                        <span className="monitor-meta">{a.branch || 'no branch'}</span>
                    </button>
                ))}
            </div>

            <div className="monitor-group-title">Reports from machines <span className="preferences-tree-tag">{(reports || []).length}</span></div>
            {!(reports || []).length ? <div className="monitor-note">No other machine has reported yet.</div> : null}
            <div className="monitor-grid">
                {(reports || []).map((r) => (
                    <div key={r.host} className={`monitor-row monitor-report tone-${r.stale ? 'warning' : 'success'}`} data-report-host={r.host}>
                        <span className="monitor-name">{r.host}</span>
                        <span className="monitor-meta">{r.stale ? 'stale' : 'reporting'} · {ago(r.reportedAt)}</span>
                        <span className="monitor-meta">{r.panels?.agents?.live ?? 0} agents live</span>
                        <span className="monitor-fresh" aria-hidden="true"><i style={{ width: `${Math.round(freshness(r.reportedAt, now) * 100)}%` }} /></span>
                    </div>
                ))}
            </div>
        </div>
    )
}
