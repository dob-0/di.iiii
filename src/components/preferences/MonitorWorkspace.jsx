import { useEffect, useMemo, useRef, useState } from 'react'
import { postMonitorAsk } from '../../services/apiClient.js'
import { ago } from './monitorFormat.js'

// Now, the left column: the agents at work (a live square when busy), the ask bar right under them,
// then the open asks (newest first). The machine reports (a freshness bar that runs down as the last
// report ages toward stale, 120 s) are a list and live in Lists.
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


// a chat's short id: the 8 first characters of its session id (what a helper names as its parent)
const chatId = (a) => String(a?.sessionId || '').slice(0, 8)

// one helper: a square (lit while it works), what it does, since when
function HelperLine({ h, withParent = false }) {
    return (
        <span className="monitor-meta monitor-helper" data-helper={h.label || h.type || 'helper'}>
            <i className={`monitor-helper-square${h.busy ? '' : ' is-off'}`} aria-label={h.busy ? 'working' : 'done'} />
            <span className="monitor-helper-label">{h.label || h.type || 'helper'}</span>
            <span>{withParent && h.parent ? ` · of ${h.parent}` : ''}{h.since ? ` · ${ago(h.since)}` : ''}</span>
        </span>
    )
}

// where an agent works: the folder's name, and the branch only when it is a real one ("HEAD" is no branch)
export const agentPlace = (a) => {
    const folder = String(a.cwd || '').split('/').filter(Boolean).pop() || 'home'
    const branch = a.branch && a.branch !== 'HEAD' ? ` · ${a.branch}` : ''
    return `in ${folder}${branch}`
}

export default function MonitorWorkspace({ asks, agents, helpers = [], flashing, onPick }) {
    const [text, setText] = useState('')
    const [pending, setPending] = useState([])
    const [problem, setProblem] = useState('')
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
    // each chat's helpers (subagents) under its card; a helper whose chat is not listed gets its own group
    const { helpersOf, orphans } = useMemo(() => {
        const ids = new Set(lanes.map((a) => chatId(a)))
        const of = new Map()
        const lost = []
        for (const h of helpers || []) {
            if (h?.parent && ids.has(h.parent)) of.set(h.parent, [...(of.get(h.parent) || []), h])
            else lost.push(h)
        }
        return { helpersOf: of, orphans: lost }
    }, [lanes, helpers])

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
            <div className="monitor-group-title">Agents at work <span className="preferences-tree-tag">{lanes.length}</span>
                {helpers?.length ? <> Helpers <span className="preferences-tree-tag">{helpers.length}</span></> : null}</div>
            {!lanes.length ? <div className="monitor-note" data-box="agents">No live agent sessions.</div> : null}
            <div className="monitor-agent-grid">
                {lanes.map((a) => (
                    <button key={a.sessionId} type="button" data-lane-id={a.sessionId} data-monitor-id={`a:${a.sessionId}`} data-box="agent"
                        className={`monitor-agent tone-${LANE_TONE[a.status] || 'accent'}${flashing?.has(`a:${a.machine || ''}${a.sessionId}`) ? ' is-changed' : ''}`} onClick={() => onPick('agent', a)}>
                        <span className="monitor-agent-head">
                            {a.status === 'busy' ? <i className="monitor-live-square" aria-label="busy" /> : <i className="monitor-live-square is-off" aria-hidden="true" />}
                            <span className="monitor-name">{a.title}</span>
                        </span>
                        <span className="monitor-meta">{a.status}{a.machine ? ` · ${a.machine}` : ''} · active {ago(a.lastActivity)}</span>
                        <span className="monitor-meta">{agentPlace(a)}</span>
                        {(helpersOf.get(chatId(a)) || []).map((h, i) => <HelperLine key={`${chatId(a)}:${i}`} h={h} />)}
                    </button>
                ))}
            </div>

            {orphans.length ? (
                <div className="monitor-helper-group" data-box="helpers">
                    <div className="monitor-group-title">Helpers <span className="preferences-tree-tag">{orphans.length}</span></div>
                    {orphans.map((h, i) => <HelperLine key={`o:${i}`} h={h} withParent />)}
                </div>
            ) : null}

            <form className="monitor-ask-form" data-box="ask" onSubmit={send}>
                <textarea id="monitor-ask-text" className="monitor-ask-text" rows={2} value={text} aria-label="Send an ask"
                    placeholder="Tell the agents…" onChange={(e) => setText(e.target.value)} onKeyDown={onKey} />
                <button type="submit" className="monitor-ask-send" disabled={!text.trim()}>Send ask</button>
                <span className="monitor-meta monitor-ask-hint">Enter sends · Shift+Enter new line</span>
                {problem ? <span className="monitor-note is-down">{problem}</span> : null}
            </form>

            {shown.length || asks?.ok === false ? <div className="monitor-group-title">Open asks <span className="preferences-tree-tag">{shown.length}</span></div> : null}
            {asks && asks.ok === false ? <div className="monitor-note is-down">Asks unavailable here{asks.error ? `: ${asks.error}` : ''}</div> : null}
            <div className="monitor-asks">
                {shown.map((a) => (
                    <div key={a.id} className={`monitor-ask tone-${ASK_TONE[a.state] || 'accent'}${a.state === 'sending' ? ' is-sending' : ''}`} data-ask-id={a.id} data-box="ask-row">
                        <div className="monitor-ask-text-line">{a.text}</div>
                        <div className="monitor-meta">{a.state} · {a.source === 'ledger' ? 'ledger' : 'sent here'} · {ago(a.touched)}</div>
                    </div>
                ))}
            </div>
        </div>
    )
}
