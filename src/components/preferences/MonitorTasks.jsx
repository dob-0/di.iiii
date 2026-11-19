import { useCallback, useEffect, useRef, useState } from 'react'
import { getMonitorTasks, postMonitorTask } from '../../services/apiClient.js'
import { rowMatches } from './monitorDetail.js'

const REFRESH_MS = 15 * 1000
const GROUPS = [['waits', 'Waits on you'], ['NEW', 'New'], ['IN PROGRESS', 'In progress'], ['PARTIAL', 'Partly done'], ['other', 'Other']]

export const groupOf = (t) => (t.who === 'owner' ? 'waits' : GROUPS.some(([k]) => k === t.state) ? t.state : 'other')
// an ask line starts with the intake's own words, which every row repeats: the list shows what comes after them
export const askText = (text) => String(text || '').replace(/^(relayed,\s*)?verbatim,\s*not restated:\s*/i, '').trim() || String(text || '')
// a server that has no door sends a whole web page as its message: say it in words
export const plainError = (message) => (!message || /<[a-z!]/i.test(message) || message.length > 160 ? 'The server has no answer for the asks yet (the page may be newer than the server)' : message)
const ageText = (min) => (min < 60 ? `${min} min` : min < 2880 ? `${Math.round(min / 60)} h` : `${Math.round(min / 1440)} d`)

/** The owner's open asks, grouped by state. Rows open in the shared drawer (MonitorDetail). */
export default function MonitorTasks({ fetcher = getMonitorTasks, refreshMs = REFRESH_MS, query = '', selectedId = null, onPick, version = 0 }) {
    const [state, setState] = useState({ loading: true, data: null, error: '' })
    const [days, setDays] = useState(3)
    const alive = useRef(true)
    const load = useCallback(async () => {
        try {
            const data = await fetcher({ days })
            if (alive.current) setState({ loading: false, data, error: '' })
        } catch (error) {
            if (alive.current) setState((prev) => ({ loading: false, data: prev.data, error: plainError(error?.message) }))
        }
    }, [fetcher, days])
    useEffect(() => {
        alive.current = true
        load()
        const timer = setInterval(load, refreshMs)
        return () => { alive.current = false; clearInterval(timer) }
    }, [load, refreshMs, version])

    const { loading, data, error } = state
    if (loading) return <div className="monitor-note">Loading your asks…</div>
    if (error && !data) return <div className="monitor-note is-down">Unavailable here: {error}</div>
    if (data && data.ok === false) return <div className="monitor-note is-down" data-tasks-empty="no-ledger">{data.message || 'No ledger on this machine.'}</div>
    const rows = (data?.tasks || []).filter((t) => rowMatches(query, t))
    const by = Object.fromEntries(GROUPS.map(([k]) => [k, []]))
    rows.forEach((t) => by[groupOf(t)].push(t))
    return (<>
        <div className="monitor-tasks-bar">
            <span className="monitor-meta" data-tasks-count>{data?.total ?? rows.length} open in the last {days} {days === 1 ? 'day' : 'days'}{rows.length < (data?.total ?? rows.length) ? `, newest ${rows.length} shown` : ''}</span>
            {[1, 3, 14].map((d) => <button key={d} type="button" className={`preferences-inline-action${days === d ? ' is-active' : ''}`} aria-pressed={days === d} onClick={() => setDays(d)}>{d} {d === 1 ? 'day' : 'days'}</button>)}
        </div>
        {error ? <div className="monitor-note is-down">The last refresh failed ({error}); this list may be out of date.</div> : null}
        {!rows.length ? <div className="monitor-note">{query ? `No ask matches “${query}”.` : 'No open asks.'}</div> : null}
        {GROUPS.filter(([k]) => by[k].length).map(([k, label]) => (
            <div key={k} className="monitor-group" data-task-group={k}>
                <div className="monitor-group-title">{label} · {by[k].length}</div>
                <div className="monitor-grid">
                    {by[k].map((t) => (
                        <button key={t.id} type="button" className={`monitor-row${selectedId === t.id ? ' is-selected' : ''}${k === 'waits' ? ' tone-warning' : ''}`} data-task={t.id} aria-pressed={selectedId === t.id} onClick={() => onPick(t)}>
                            <span className="monitor-name monitor-task-text"><strong>{t.id}</strong> {askText(t.text)}</span>
                            <span className="monitor-meta">{t.state} · {ageText(t.ageMin)} ago · {t.who}</span>
                        </button>
                    ))}
                </div>
            </div>
        ))}
    </>)
}

/** Drawer footer for one task: history, and Done / Blocked / Reopen / Note through the one server door. */
export function TaskActions({ task, onChanged, fetcher = getMonitorTasks, poster = postMonitorTask }) {
    const [history, setHistory] = useState(null)
    const [mode, setMode] = useState('')
    const [text, setText] = useState('')
    const [evidence, setEvidence] = useState('')
    const [busy, setBusy] = useState(false)
    const [msg, setMsg] = useState('')
    const formRef = useRef(null)
    // choosing an action brings its form into view: on a phone the drawer is short and the form sits below the fold
    useEffect(() => { if (mode) formRef.current?.scrollIntoView?.({ block: 'nearest' }) }, [mode])
    useEffect(() => {
        let live = true
        fetcher({ id: task.id }).then((d) => { if (live) setHistory(d?.history || []) }).catch(() => { if (live) setHistory([]) })
        return () => { live = false }
    }, [task.id, fetcher, msg])
    const send = async () => {
        setBusy(true)
        try {
            const out = await poster({ id: task.id, action: mode, text, evidence })
            setMsg(`Saved as ${out.row.id}: ${out.row.state}`)
            setMode(''); setText(''); setEvidence('')
            onChanged?.(out.row)
        } catch (error) {
            setMsg(plainError(error?.message) === error?.message ? error.message : 'The change was not saved')
        } finally { setBusy(false) }
    }
    const needEvidence = mode === 'done'
    const ready = mode && (mode === 'note' ? text.trim() : needEvidence ? evidence.trim() : true)
    return (
        <div className="monitor-task-actions" data-task-actions={task.id}>
            <div className="monitor-drawer-kind">Change this ask</div>
            <div className="monitor-task-buttons">
                {[['done', 'Done'], ['blocked', 'Blocked'], ['reopen', 'Reopen'], ['note', 'Note']].map(([k, label]) => (
                    <button key={k} type="button" className={`preferences-inline-action${mode === k ? ' is-active' : ''}`} aria-pressed={mode === k} data-task-action={k} onClick={() => setMode(mode === k ? '' : k)}>{label}</button>
                ))}
            </div>
            {mode ? (
                <div className="monitor-task-form" ref={formRef}>
                    <label>{mode === 'note' ? 'Note' : 'What changed (optional)'}<textarea value={text} maxLength={600} rows={2} onChange={(e) => setText(e.target.value)} /></label>
                    {needEvidence ? <label>Proof it is done (needed)<textarea value={evidence} maxLength={600} rows={2} data-task-evidence onChange={(e) => setEvidence(e.target.value)} /></label> : null}
                    <button type="button" className="preferences-inline-action" disabled={!ready || busy} data-task-send onClick={send}>{busy ? 'Saving…' : 'Save'}</button>
                </div>
            ) : null}
            {msg ? <div className="monitor-note" role="status">{msg}</div> : null}
            <div className="monitor-drawer-kind">History</div>
            {history === null ? <div className="monitor-note">Loading…</div> : history.length ? history.map((h) => (
                <div key={h.id} className="monitor-task-history" data-history={h.id}><strong>{h.id}</strong> · {h.at} · {h.state}<div>{h.said}</div>{h.evidence ? <div className="monitor-meta">{h.evidence}</div> : null}</div>
            )) : <div className="monitor-note">No history lines found.</div>}
        </div>
    )
}
