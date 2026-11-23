import { useState } from 'react'
import { rowMatches } from './monitorDetail.js'

// Chats: one card per chat, so the owner tracks every chat from the Monitor.
// Fed by the server's `chats` block (serverXR/src/monitorChats.js): asks you first, then working, then idle.
// A chat list that is missing or old says so in words; it is never drawn as "nothing asks you".
const GROUP_LABEL = { ask: 'asks you', working: 'working', idle: 'idle' }
const GROUP_TONE = { ask: 'warning', working: 'success', idle: 'muted' }
const FILTERS = [['all', 'All'], ['ask', 'Asks you'], ['working', 'Working'], ['idle', 'Idle'], ['left', 'Left behind']]
const ASK_CHATS_IN_STRIP = 4

// "!! Plug it in" -> "Plug it in": the line marks are for terminals
const plain = (text) => String(text || '').replace(/^\s*(?:!!|\?\?)\s*/, '').trim()
const askRows = (chats) => (chats?.rows || []).filter((r) => r.group === 'ask')

// the chat's own step list: a bar, done of total, the percent and the first steps still open
export const stepsPercent = (s) => (s && s.total > 0 ? Math.round((s.done * 100) / s.total) : 0)
function Steps({ steps }) {
    const pct = stepsPercent(steps)
    return (
        <span className="monitor-chat-steps" data-chat-steps={`${steps.done}/${steps.total}`}>
            <span className="monitor-chat-bar" role="img" aria-label={`${steps.done} of ${steps.total} steps done`}><i style={{ width: `${pct}%` }} /></span>
            <span className="monitor-meta">{steps.done}/{steps.total} · {pct}%{steps.open?.length ? ` · open: ${steps.open.slice(0, 2).join('; ')}${steps.open.length > 2 ? '…' : ''}` : ''}</span>
        </span>
    )
}

export const idleLabel = (minutes) => {
    if (typeof minutes !== 'number') return 'idle time unknown'
    if (minutes < 1) return 'active just now'
    if (minutes < 60) return `idle ${minutes} min`
    const h = Math.floor(minutes / 60)
    if (h < 48) return `idle ${h} h ${minutes % 60} min`
    return `idle ${Math.floor(h / 24)} d`
}

export const heardLabel = (seconds) => {
    if (typeof seconds !== 'number') return 'never'
    if (seconds < 90) return `${seconds} s ago`
    if (seconds < 5400) return `${Math.round(seconds / 60)} min ago`
    return `${Math.round(seconds / 3600)} h ago`
}

// Rows for the "things need you" strip on top of the Monitor. Every chat that asks is one row (the first four
// by name, the rest counted); an old or unreadable chat list is one row too, so silence is never read as well.
export const chatIssues = (chats) => {
    if (!chats) return []
    if (chats.state === 'stale') return [{ tone: 'warning', key: 'chats-stale', text: `Chat list is old (heard ${heardLabel(chats.heardSecondsAgo)}), asks may be missing` }]
    if (chats.state === 'failed') return [{ tone: 'warning', key: 'chats-failed', text: `Chat list could not be read${chats.error ? `: ${chats.error}` : ''}` }]
    const asking = askRows(chats)
    const issues = asking.slice(0, ASK_CHATS_IN_STRIP).map((r) => ({
        tone: 'warning', key: `chat-${r.id}`, chat: r.id,
        text: `${r.title} asks you${r.asks?.[0] ? `: ${plain(r.asks[0])}` : ''}`
    }))
    // the server's count covers chats past its row cap; the rows only the ones it sent
    const total = Math.max(asking.length, chats.counts?.ask || 0)
    if (total > issues.length) issues.push({ tone: 'warning', key: 'chats-more', count: total - issues.length, text: `${total - issues.length} more chat${total - issues.length === 1 ? '' : 's'} ask you` })
    return issues
}

function Card({ chat, selected, onPick }) {
    return (
        <button type="button" className={`monitor-chat tone-${chat.leftBehind ? 'danger' : GROUP_TONE[chat.group] || 'muted'}${selected ? ' is-selected' : ''}`} data-chat-id={chat.id} data-chat-group={chat.group}
            aria-pressed={selected} onClick={() => onPick?.(chat)}>
            <span className="monitor-chat-head">
                {chat.group === 'working' ? <i className="monitor-live-square" aria-hidden="true" /> : <i className="monitor-live-square is-off" aria-hidden="true" />}
                <span className="monitor-chat-title">{chat.title}</span>
                <span className="monitor-chat-tag">{chat.leftBehind ? 'left behind' : GROUP_LABEL[chat.group]}</span>
            </span>
            {chat.steps ? <Steps steps={chat.steps} /> : null}
            {chat.asks?.map((a) => <p key={a} className="monitor-chat-ask">{plain(a)}</p>)}
            {chat.says ? <p className="monitor-chat-says">{plain(chat.says).replace(/^(?:\+\+|\.\.|->|==|--)\s*/, '')}</p> : null}
            <span className="monitor-meta">{chat.group === 'working' ? 'working now' : idleLabel(chat.idleMinutes)}{chat.host ? ` · ${chat.host}` : ''}{chat.failed ? ' · last turn failed' : ''}</span>
        </button>
    )
}

export default function MonitorChats({ chats, onPick, selectedId = null, query = '' }) {
    const [filter, setFilter] = useState('all')
    const counts = chats?.counts || { ask: 0, working: 0, idle: 0, left: 0, total: 0 }
    const rows = chats?.rows || []
    const byQuery = query ? rows.filter((r) => rowMatches(query, r)) : rows
    const shown = filter === 'all' ? byQuery : filter === 'left' ? byQuery.filter((r) => r.leftBehind) : byQuery.filter((r) => r.group === filter)
    const state = chats?.state || 'none'
    return (
        <div className="monitor-chats" data-monitor-chats="" data-chats-state={state}>
            {state === 'none' ? <p className="monitor-note" data-chats-note="none">No chat data. No machine is sending its chats to this monitor.</p> : null}
            {state === 'failed' ? <p className="monitor-note is-down" data-chats-note="failed">Chats could not be read{chats.error ? `: ${chats.error}` : ''}.</p> : null}
            {state === 'stale' ? <p className="monitor-note is-down" data-chats-note="stale">Chat data is old (last heard {heardLabel(chats.heardSecondsAgo)}). What is shown may have changed.</p> : null}
            {rows.length ? (
                <>
                    <div className="monitor-chips" role="group" aria-label="Filter chats">
                        {FILTERS.map(([id, label]) => (
                            <button key={id} type="button" className={`monitor-chip${id === 'ask' && counts.ask ? ' tone-warning' : ''}${id === 'left' && counts.left ? ' tone-danger' : ''}`} aria-pressed={filter === id} data-chat-filter={id}
                                onClick={() => setFilter(id)}>
                                {label} <span className="monitor-chip-count">{id === 'all' ? counts.total : counts[id] || 0}</span>
                            </button>
                        ))}
                    </div>
                    {shown.length ? (
                        <div className="monitor-chat-grid">{shown.map((c) => <Card key={c.id} chat={c} selected={selectedId === c.id} onPick={onPick} />)}</div>
                    ) : <p className="monitor-note">{query ? `No chat matches “${query}”.` : 'No chat in this group.'}</p>}
                    {chats.truncated ? <p className="monitor-note">{chats.truncated} more chat{chats.truncated === 1 ? '' : 's'} not shown (the 60 that ask or work first are listed).</p> : null}
                </>
            ) : null}
        </div>
    )
}
