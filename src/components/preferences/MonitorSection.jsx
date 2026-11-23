import MonitorFeed from './MonitorFeed.jsx'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ModuleSection } from './PreferencesShared.jsx'
import { getMonitor, monitorStreamUrl } from '../../services/apiClient.js'
import { timeAgo, formatBytes, ago } from './monitorFormat.js'
import MonitorOverview, { CountTiles, heroState, tierLabel } from './MonitorOverview.jsx'
import { diffSnapshots, pushEvents } from './monitorFeed.js'
import MonitorMap, { useNarrow } from './MonitorMap.jsx'
import { layoutMonitorMap } from './monitorMapLayout.js'
import MonitorWorkspace from './MonitorWorkspace.jsx'
import MonitorParts from './MonitorParts.jsx'
import MonitorShared from './MonitorShared.jsx'
import MonitorVersions from './MonitorVersions.jsx'
import MonitorPrs from './MonitorPrs.jsx'
import MonitorTasks, { TaskActions } from './MonitorTasks.jsx'
import MonitorDetail from './MonitorDetail.jsx'
import PanelLive from './MonitorLive.jsx'
import { rowMatches, searchCounts } from './monitorDetail.js'

// One page for everything that is going on: machines, the network, agent
// sessions (every Claude login on the machine), services, pull requests, and
// the operator's own feeds (tasks, shows). The server collects each panel on
// its own, so a dead tailnet greys one block and the rest keep moving.
// Flat on purpose (brand SYSTEM.md): square corners, no shadow, the semantic
// triple for state, motion under 0.2 s on named properties only.

const POLL_MS = 5000
const TABS = [['board', 'Board'], ['map', 'Map'], ['workspace', 'Work'], ['parts', 'Parts'], ['versions', 'Versions'], ['tasks', 'Tasks'], ['shared', 'Shared']]
const FLASH_MS = 2500
const FULL_KEY = 'di.monitor.full'
const SPARK_SAMPLES = 30
const TAB_KEYS = { 1: 'board', 2: 'map', 3: 'workspace', 4: 'parts', 5: 'versions', 6: 'tasks', 7: 'shared' }
const KEYS_HELP = [['1  2  3  4  5  6', 'Board, Map, Work, Parts, Versions, Tasks'], ['/', 'Filter everything'], ['f', 'Full screen on or off'], ['Esc', 'Close the inspector, then leave full screen'], ['?', 'This card']]

// remembered per browser; storage can be blocked, so every touch is guarded
const readFull = () => {
    try {
        if (String(window.location.hash || '').startsWith('#monitor-full')) return true
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
// #monitor[-full][/kind/id]: the open item lives in the link, so a reload or a shared link shows the same drawer
const HASH_RE = /^#monitor(-full)?(?:\/([a-z]+)\/(.+))?$/
export const parseHash = (hash) => {
    const m = HASH_RE.exec(String(hash || ''))
    if (!m || !m[2]) return null
    try { return { kind: m[2], id: decodeURIComponent(m[3]) } } catch { return null }
}
export const buildHash = (full, selected) => `#monitor${full ? '-full' : ''}${selected ? `/${selected.kind}/${encodeURIComponent(String(selected.id))}` : ''}`
const readSelected = () => { try { const got = parseHash(window.location.hash); return got ? { ...got, id: /^\d+$/.test(got.id) && got.kind === 'pr' ? Number(got.id) : got.id } : null } catch { return null } }
const typing = (el) => !!el && (['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName) || el.isContentEditable)

export { timeAgo, formatBytes }

// every row has one id the server made unique (tailnet address, URL, session id, unit, PR number)
const rowId = (row) => row.id ?? row.sessionId ?? row.unit ?? row.number ?? row.host ?? row.name

const THING_TONE = { live: 'success', ok: 'success', idle: 'muted', off: 'muted' }

const AGENT_TONE = { busy: 'success', blocked: 'warning', idle: 'muted', shell: 'accent' }

// One signature per row; when it changes between two polls the row flashes.
const signatures = (snap) => {
    const panels = snap?.panels
    const sig = {}
    for (const m of panels?.machines?.rows || []) sig[`m:${m.id}`] = String(m.online)
    for (const c of panels?.credits?.rows || []) sig[`cr:${c.id}`] = String(c.available)
    for (const n of panels?.network?.rows || []) sig[`n:${n.id}`] = `${n.ok}:${n.status}`
    // the key is the row's own id (`a:<session id>`, see the Agents rows): a machine in it would never match, and no agent would flash
    for (const a of panels?.agents?.rows || []) sig[`a:${a.sessionId}`] = a.status
    for (const s of panels?.services?.rows || []) sig[`s:${s.id ?? s.unit}`] = s.active
    for (const c of panels?.connected?.rows || []) sig[`c:${c.id}`] = `${c.state}:${c.detail}`
    for (const u of panels?.presence?.rows || []) sig[`u:${u.id}`] = String(u.people.length)
    for (const p of panels?.pullRequests?.rows || []) sig[`p:${p.number}`] = `${p.draft}:${p.updatedAt}`
    for (const t of snap?.tiers?.rows || []) sig[`t:${t.id}`] = `${t.status}:${t.commit}:${t.behindDev}`
    const k = panels
    sig['k:machines'] = `${k?.machines?.online}/${k?.machines?.total}`
    sig['k:credits'] = `${k?.credits?.ready}/${k?.credits?.total}`
    sig['k:network'] = `${k?.network?.up}/${k?.network?.total}`
    sig['k:people'] = String(k?.presence?.people)
    sig['k:things'] = `${k?.connected?.live}/${k?.connected?.total}`
    sig['k:agents'] = `${k?.agents?.live}:${k?.agents?.busy}`
    sig['k:prs'] = `${k?.pullRequests?.open}:${k?.pullRequests?.drafts}`
    sig['k:services'] = String(k?.services?.failed)
    return sig
}

function IssueItem({ issue, onOpen }) {
    const opens = Boolean(issue.chat || issue.tier || issue.key === 'chats-more' || issue.key === 'chats-stale')
    return opens
        ? <li className={`tone-${issue.tone}`} title={issue.text}><button type="button" className="monitor-issue-open" title={issue.text} data-issue={issue.key || issue.tier} onClick={() => onOpen(issue)}>{issue.text}</button></li>
        : <li className={`tone-${issue.tone}`} title={issue.text}>{issue.text}</li>
}

function PanelNote({ panel, empty }) {
    if (!panel) return null
    if (!panel.ok) return <div className="monitor-note is-down">Unavailable here: {panel.error}</div>
    // Credits only: the command that reads them is slow once an hour, so the server shows the last list and renews it in the background.
    if (panel.checking) return <div className="monitor-note" data-credits="checking">Checking now: the list appears in a moment.</div>
    // the age is read on the server's clock (panel.at is when the server built the panel), so a page on a wrong clock still tells it right
    if (panel.stale) {
        return (
            <div className="monitor-note is-down" data-credits="stale">
                This list was read {ago(panel.checkedAt, panel.at)}; {panel.refreshError ? `the latest check failed: ${panel.refreshError}` : 'a new check is running'}.
            </div>
        )
    }
    // Credits only: a machine with no list of its own shows the one another machine reported; the server marks it `from`, and the age is on its clock.
    if (panel.from) {
        return <div className="monitor-note" data-credits="from">From {panel.from}{panel.reportedAt ? `, reported ${ago(panel.reportedAt, panel.at)}` : ''}: this machine has no credits list of its own.</div>
    }
    return panel.rows?.length || !empty ? null : <div className="monitor-note">{empty}</div>
}

// Agents of every machine: a machine whose agents are not (all) in the list says why, in plain words. The age is on the server's clock (panel.at).
function agentsMachineNote(m, at) {
    if (m.state === 'stale') return `${m.host}: ${m.reportedAt ? `last report ${ago(m.reportedAt, at)}` : 'no recent report'}, so its agents are not in this list.`
    if (m.state === 'none') return `${m.host}: its report has no agents list.`
    if (m.state === 'failed') return `${m.host}: its agents list could not be read${m.error ? ` (${m.error})` : ''}.`
    return `${m.host}: ${m.shown} of ${m.live} agents shown.`
}

// The subtitle's machine count: "4 machines" when every machine's agents are in the list, "3 of 4 machines" when some are not (the notes say which).
function agentsMachinesText(machines) {
    const all = Array.isArray(machines) ? machines.length : 0
    if (all < 2) return ''
    const listed = machines.filter((m) => m.state === 'ok').length
    return listed === all ? `${all} machines · ` : `${listed} of ${all} machines · `
}

// Whose machines this Monitor lists: this one, plus the signed-in account's others (reported to dev).
function AccountNote({ account }) {
    if (!account) return null
    const text = {
        ok: `Signed in${account.name ? ` as ${account.name}` : ''}: this machine and ${account.machines} more from your account.`,
        'signed-out': 'Not signed in: this machine only. Run di login to see your other machines.',
        expired: 'Your sign-in ended: this machine only. Run di login again.',
        offline: "Your account's machines could not be reached: this machine only."
    }[account.state]
    return text ? <div className="monitor-note" data-account={account.state}>{text}</div> : null
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

// Network and services are each machine's, shown for the whole account: the subtitle names the other machines in the list.
export const machinesSubtitle = (panel, text) =>
    Array.isArray(panel?.lentFrom) && panel.lentFrom.length ? `${text} · this machine and ${panel.lentFrom.join(', ')}` : text

// Tasks and shows are the account's: rows another machine read are lent here (each tagged with its machine).
export function feedsSubtitle(panels) {
    const from = [...new Set([...(panels?.tasks?.lentFrom || []), ...(panels?.shows?.lentFrom || [])])].sort()
    return from.length
        ? `This machine's feeds and your account's from ${from.join(', ')}`
        : 'Your feeds from ~/.di/monitor.json'
}

export default function MonitorSection({ onStats }) {
    const [snap, setSnap] = useState(null)
    const [unavailable, setUnavailable] = useState(false)
    const [error, setError] = useState('')
    const [paused, setPaused] = useState(false)
    const [query, setQuery] = useState('')
    const [selected, setSelected] = useState(readSelected)
    // how old each panel's last read is (server ages + when the page heard them), for 'live · heard N s ago'
    const [ages, setAges] = useState({})
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
        const arrived = Date.now()
        setAges((old) => {
            const out = { ...old }
            for (const k of Object.keys(next.panels || {})) out[k] = { age: 0, heard: arrived }
            out.tiers = { age: 0, heard: arrived }
            out.parts = { age: 0, heard: arrived }
            out.chats = { age: typeof next.chats?.heardSecondsAgo === 'number' ? next.chats.heardSecondsAgo * 1000 : 0, heard: arrived }
            return out
        })
        setHeardAt(arrived)
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
        const onHeartbeat = (ev) => {
            if (!alive.current) return
            const arrived = Date.now()
            setHeardAt(arrived)
            try {
                const got = JSON.parse(ev.data)?.ages
                if (got && typeof got === 'object') setAges((old) => ({ ...old, ...Object.fromEntries(Object.entries(got).filter(([, v]) => typeof v === 'number').map(([k, v]) => [k, { age: v, heard: arrived }])) }))
            } catch { /* a heartbeat without ages still proves the line is open */ }
        }
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

    const selectedRef = useRef(selected)
    useEffect(() => {
        selectedRef.current = selected
        try {
            const want = buildHash(String(window.location.hash || '').startsWith('#monitor-full'), selected)
            if (window.location.hash !== want) window.history.replaceState(null, '', want)
        } catch { /* no history here */ }
    }, [selected])
    // back / a pasted link changes the hash: the drawer follows it
    useEffect(() => {
        const onHash = () => { if (String(window.location.hash || '').startsWith('#monitor')) setSelected(readSelected()) }
        window.addEventListener('hashchange', onHash)
        return () => window.removeEventListener('hashchange', onHash)
    }, [])

    const setFullScreen = useCallback((on) => {
        setFull(on)
        try { window.localStorage.setItem(FULL_KEY, on ? '1' : '0') } catch { /* storage blocked: the choice lasts this visit */ }
        try { window.history.replaceState(null, '', buildHash(on, selectedRef.current)) } catch { /* no history here */ }
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
        () => (panels.machines?.rows || []).filter((m) => rowMatches(query, m)),
        [panels.machines, query]
    )
    const credits = useMemo(
        () => (panels.credits?.rows || []).filter((c) => rowMatches(query, c)),
        [panels.credits, query]
    )
    const probes = useMemo(
        () => (panels.network?.rows || []).filter((n) => rowMatches(query, n)),
        [panels.network, query]
    )
    const agentGroups = useMemo(() => {
        const groups = new Map()
        for (const a of panels.agents?.rows || []) {
            if (!rowMatches(query, a)) continue
            const key = a.machine ? `${a.machine} / ${a.account}` : a.account
            if (!groups.has(key)) groups.set(key, [])
            groups.get(key).push(a)
        }
        return [...groups.entries()]
    }, [panels.agents, query])
    const things = useMemo(
        () => (panels.connected?.rows || []).filter((c) => rowMatches(query, c)),
        [panels.connected, query]
    )
    const places = useMemo(
        () => (panels.presence?.rows || []).filter((u) => rowMatches(query, u)),
        [panels.presence, query]
    )
    const services = useMemo(() => {
        const rows = (panels.services?.rows || []).filter((s) => rowMatches(query, s))
        return [...rows].sort((a, b) => (b.active === 'failed') - (a.active === 'failed'))
    }, [panels.services, query])
    const prs = useMemo(
        () => (panels.pullRequests?.rows || []).filter((p) => rowMatches(query, p) || `#${p.number}` === query.trim()),
        [panels.pullRequests, query]
    )

    const [taskVersion, setTaskVersion] = useState(0)
    const pick = (kind, row) => setSelected({ kind, id: rowId(row), row })

    const selectedRow = useMemo(() => {
        if (!selected) return null
        const pool = {
            machine: panels.machines?.rows, credit: panels.credits?.rows, probe: panels.network?.rows, agent: panels.agents?.rows,
            service: panels.services?.rows, pr: panels.pullRequests?.rows,
            thing: panels.connected?.rows, place: panels.presence?.rows,
            node: snap?.map?.nodes, tier: snap?.tiers?.rows,
            chat: snap?.chats?.rows, ask: snap?.asks?.rows, report: snap?.reports, part: snap?.parts?.rows
        }[selected.kind] || []
        return pool.find((r) => String(rowId(r)) === String(selected.id)) || selected.row || null
    }, [selected, panels, snap])
    const counts = useMemo(() => (query.trim() ? searchCounts(snap, query) : null), [snap, query])

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
            // while the first list is still being read there is no count yet (not "0/0"); an old list is a warning, not a green
            { id: 'credits', panel: 'credits', label: 'Credits ready', value: p.credits?.ok && p.credits.configured && !p.credits.checking ? `${p.credits.ready}/${p.credits.total}` : '—',
                tone: !p.credits?.ok || !p.credits.configured || p.credits.checking ? 'muted' : p.credits.ready && !p.credits.stale ? 'success' : 'warning',
                dots: (p.credits?.rows || []).map((c) => dot(c.available ? 'success' : 'warning', `${c.name}: ${c.available ? 'ready' : 'not ready'}`)) },
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
                dots: (p.agents?.rows || []).map((a) => dot(AGENT_TONE[a.status] || 'accent', `${a.title}${a.machine ? ` · ${a.machine}` : ''}: ${a.status}`)) },
            { id: 'prs', panel: 'prs', label: `Open PRs · ${p.pullRequests?.drafts ?? 0} draft`, value: p.pullRequests?.ok ? p.pullRequests.open : '—',
                tone: 'accent',
                dots: (p.pullRequests?.rows || []).map((r) => dot(r.draft ? 'muted' : 'accent', `#${r.number} ${r.draft ? 'draft' : 'open'}`)) },
            { id: 'services', panel: 'services', label: 'Services failed', value: p.services?.ok ? failed : '—',
                tone: failed ? 'danger' : 'success',
                dots: (p.services?.rows || []).map((sv) => dot(sv.active === 'failed' ? 'danger' : 'success', `${sv.unit}: ${sv.active}`)) }
        ]
    }, [panels, failed])

    // a strip item opens what it is about: a chat, a tier
    const openIssue = (issue) => {
        if (issue.chat) { const row = (snap?.chats?.rows || []).find((c) => c.id === issue.chat); setSelected({ kind: 'chat', id: issue.chat, row }) } else if (issue.tier) {
            const row = (snap?.tiers?.rows || []).find((t) => t.id === issue.tier)
            setSelected({ kind: 'tier', id: issue.tier, row })
        } else if (issue.key === 'chats-more' || issue.key === 'chats-stale') { setTab('workspace') }
    }

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
        ? (selected.kind === 'tier' ? tierLabel(selectedRow.id) : selectedRow.name || selectedRow.label || selectedRow.title || selectedRow.unit || selectedRow.target || selectedRow.host || (selectedRow.text ? String(selectedRow.text).slice(0, 60) : '') || (selectedRow.number ? `#${selectedRow.number}` : String(selected.id)))
        : String(selected?.id ?? '')

    return (
        <div className={`monitor-page${full ? ' is-full' : ''}${tab === 'map' ? ' is-map' : ''} tab-${tab}`} data-monitor-full={full ? 'on' : 'off'}>
            <header className="monitor-bar">
                <div className="monitor-bar-title">
                    <h2>Monitor</h2>
                    <span>{`${snap?.host || 'this machine'} · ${live ? (streaming ? 'live' : 'polling') : paused ? 'paused' : 'offline'} · ${updated}`}</span>
                </div>
                <div className="monitor-bar-tabs monitor-tabs" role="tablist" aria-label="Monitor views">
                    {TABS.map(([id, label], i) => (
                        <button key={id} type="button" role="tab" aria-selected={tab === id} data-monitor-tab={id}
                            className={`monitor-tab${tab === id ? ' is-active' : ''}`} onClick={() => setTab(id)}>{label}<i className="monitor-tab-key" data-key={i + 1} aria-hidden="true" /></button>
                    ))}
                </div>
                <div className="monitor-bar-actions">
                    <input ref={filterRef} className="monitor-filter" type="search" placeholder="Filter everything  ( / )"
                        aria-label="Filter every panel" value={query} onChange={(e) => setQuery(e.target.value)} />
                    {counts ? <span className="monitor-filter-count" data-filter-count={counts.matched} role="status">{counts.matched} of {counts.total} match</span> : null}
                    <button type="button" className="preferences-inline-action" onClick={() => setPaused((p) => !p)}>{paused ? 'Resume' : 'Pause'}</button>
                    <button type="button" className="preferences-inline-action" onClick={load}>Refresh</button>
                    <button type="button" className="preferences-inline-action" aria-pressed={full} onClick={() => setFullScreen(!full)}>{full ? 'Leave full screen' : 'Full screen'}</button>
                    <button type="button" className="preferences-inline-action" aria-label="Show keys" onClick={() => setKeysOpen((o) => !o)}>Keys ?</button>
                </div>
            </header>

            {error ? <div className="preferences-empty">{error}</div> : null}

            <div className="monitor-frame">
                <section className={`monitor-hero tone-${heroTone}`} aria-live="polite" data-hero-tone={heroTone}>
                    {snap && !paused && !error && hero.issues[0] && (hero.issues[0].chat || hero.issues[0].tier)
                        ? <button type="button" className="monitor-hero-text monitor-hero-open" data-issue={hero.issues[0].key || hero.issues[0].tier} onClick={() => openIssue(hero.issues[0])}>{heroText}</button>
                        : <div className="monitor-hero-text">{heroText}</div>}
                    <div className="monitor-hero-live">
                        <i key={heardAt || 'none'} className={`monitor-live-mark tone-${markTone}${heardAt ? ' is-beat' : ''}`} aria-hidden="true" />
                        <span className="monitor-hero-heard">{paused ? 'paused' : heardLabel(heardAt, nowMs)}</span>
                    </div>
                    {snap && !paused && !error && hero.issues.length > 1 ? (
                        <ul className="monitor-hero-issues">
                            {hero.issues.slice(1).map((i) => <IssueItem key={i.key || i.text} issue={i} onOpen={openIssue} />)}
                        </ul>
                    ) : null}
                </section>

                <div className="monitor-area-strip">
                    <div className="monitor-area-tiers">
                        <PanelLive name="tiers" ages={ages} nowMs={nowMs} paused={paused} />
                        <MonitorOverview tiers={snap?.tiers} spaces={snap?.spaces} history={history} flashing={flashing}
                            selectedId={selected?.kind === 'tier' ? selected.id : null} onPick={(row) => setSelected({ kind: 'tier', id: row.id, row })} />
                    </div>

                    <div className="monitor-area-counts">
                        <CountTiles tiles={countTiles} flashing={flashing} onPick={jumpTo} />
                    </div>
                </div>

                <div className="monitor-area-main monitor-main">
                    {snap?.shared && tab !== 'shared' && tab !== 'versions' && tab !== 'tasks' ? (
                        <div className="monitor-note monitor-this-machine" data-this-machine="">This machine{snap.host ? `: ${String(snap.host).split('.')[0]}` : ''} — its own chats, agents and services. The picture shared by every machine is in the Shared tab.</div>
                    ) : null}
                    {tab === 'shared' ? (
                        <ModuleSection title="Shared" subtitle="One picture from the dev server, the same on every machine — machines, versions, pull requests, spaces, shows, asks, tasks">
                            <MonitorShared shared={snap?.shared || null} query={query} />
                        </ModuleSection>
                    ) : null}
                    {tab === 'map' ? (
                        <ModuleSection className="monitor-map-section" title="Map" subtitle="Machines, tiers, spaces and shows — select a node for its details">
                            <MonitorMap map={snap?.map} selectedId={selected?.kind === 'node' ? selected.id : null} narrow={narrow}
                                live={streaming && !paused} kinds layoutFn={layoutMonitorMap} onPick={pickNode} />
                        </ModuleSection>
                    ) : null}
                    {tab === 'workspace' ? (
                        <ModuleSection title="Work" subtitle="Every chat, your asks, what each agent is doing, and machine reports">
                            <MonitorWorkspace chats={snap?.chats} asks={snap?.asks} agents={panels.agents} reports={snap?.reports} query={query} selected={selected} ages={ages} paused={paused}
                                onPick={pick} />
                        </ModuleSection>
                    ) : null}
                    {tab === 'tasks' ? (
                        <ModuleSection title="Tasks" subtitle="Your open asks by state — open one for its history, then mark it done, blocked, reopened or add a note">
                            <MonitorTasks query={query} selectedId={selected?.kind === 'task' ? selected.id : null} version={taskVersion} onPick={(row) => pick('task', row)} />
                        </ModuleSection>
                    ) : null}
                    {tab === 'parts' ? (
                        <ModuleSection title="Parts" subtitle="Light desk, show desk, lasers, 3D Studio — live state and the version each was packed at">
                            <PanelLive name="parts" ages={ages} nowMs={nowMs} paused={paused} />
                            <MonitorParts parts={snap?.parts} query={query} selectedId={selected?.kind === 'part' ? selected.id : null} onPick={(row) => pick('part', row)} />
                        </ModuleSection>
                    ) : null}
                    {tab === 'versions' ? (
                        <ModuleSection title="Versions" subtitle="What each machine runs against dev, and every part's latest and past versions — merged pull requests, newest first">
                            <PanelLive name="parts" ages={ages} nowMs={nowMs} paused={paused} />
                            <MonitorVersions snap={snap} query={query} />
                        </ModuleSection>
                    ) : null}
                    {tab === 'workspace' ? (
                        <ModuleSection title="Waiting to merge" subtitle="Open pull requests read from GitHub by the server — works without any machine on; merging stays your Enter">
                            <MonitorPrs query={query} selectedId={selected?.kind === 'pr' ? selected.id : null} onPick={(row) => pick('pr', row)} />
                        </ModuleSection>
                    ) : null}
                    {tab === 'board' ? (<>
                    <div data-panel="machines"><ModuleSection title="Machines" subtitle="Tailnet — who is on, who was last seen">
                        <PanelLive name="machines" ages={ages} nowMs={nowMs} paused={paused} />
                        <PanelNote panel={panels.machines} empty="No machines reported." />
                        <AccountNote account={snap?.account} />
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

                    <div data-panel="credits"><ModuleSection title="Credits" subtitle="Claude plans, API keys, Ollama, Colab — what is ready to run our work">
                        <PanelLive name="credits" ages={ages} nowMs={nowMs} paused={paused} />
                        <PanelNote panel={panels.credits} empty={panels.credits?.configured ? 'No credits reported.' : ''} />
                        {panels.credits?.ok && !panels.credits.configured ? <div className="monitor-note">This machine does not report credits (no credits feed in its monitor config).</div> : null}
                        <div className="monitor-grid">
                            {credits.map((c) => (
                                <Row key={c.id} id={`cr:${c.id}`} tone={c.available ? 'success' : 'warning'} flash={flash(`cr:${c.id}`)}
                                    selected={selected?.kind === 'credit' && selected.id === c.id} onSelect={() => pick('credit', c)}>
                                    <span className="monitor-name">{c.name}</span>
                                    <span className="monitor-meta">{[c.available ? 'ready' : 'not ready', c.meter, c.why].filter(Boolean).join(' · ')}</span>
                                </Row>
                            ))}
                        </div>
                    </ModuleSection></div>

                    <div data-panel="network"><ModuleSection title="Network" subtitle={machinesSubtitle(panels.network, 'Tiers and addresses we probe')}>
                        <PanelLive name="network" ages={ages} nowMs={nowMs} paused={paused} />
                        <PanelNote panel={panels.network} empty="No probes configured." />
                        <div className="monitor-grid">
                            {probes.map((n) => (
                                <Row key={n.id} id={`n:${n.id}`} tone={n.ok ? 'success' : 'danger'} flash={flash(`n:${n.id}`)}
                                    selected={selected?.kind === 'probe' && selected.id === n.id} onSelect={() => pick('probe', n)}>
                                    <span className="monitor-name">{n.name}</span>
                                    <span className="monitor-meta">{n.ok ? `${n.status} · ${n.ms} ms` : `down · ${n.status || String(n.error || 'no answer').slice(0, 30)}`}{n.machine ? <span data-row-machine={n.machine}> · {n.machine}</span> : null}</span>
                                </Row>
                            ))}
                        </div>
                    </ModuleSection></div>

                    <div data-panel="connected"><ModuleSection title="Connected things" subtitle="Lasers, lights, show machine, video, OSC, visiting apps">
                        <PanelLive name="connected" ages={ages} nowMs={nowMs} paused={paused} />
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
                        <PanelLive name="presence" ages={ages} nowMs={nowMs} paused={paused} />
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

                    <div data-panel="agents"><ModuleSection title="Agents" subtitle={`${panels.agents?.live ?? 0} live of ${panels.agents?.total ?? 0} sessions · ${agentsMachinesText(panels.agents?.machines)}accounts: ${(panels.agents?.accounts || []).join(', ') || 'none found'}`}>
                        <PanelLive name="agents" ages={ages} nowMs={nowMs} paused={paused} />
                        <PanelNote panel={panels.agents} empty="No live agent sessions." />
                        {(panels.agents?.remotes || []).filter((r) => !r.ok).map((r) => (
                            <div key={r.name} className="monitor-note">{r.name}: not reachable ({r.error})</div>
                        ))}
                        {(panels.agents?.machines || []).filter((m) => m.state !== 'ok' || m.capped).map((m) => (
                            <div key={m.host} className={`monitor-note${m.state === 'failed' ? ' is-down' : ''}`} data-agents={m.state === 'ok' ? 'cut' : m.state}>{agentsMachineNote(m, panels.agents.at)}</div>
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

                    <ModuleSection title="Tasks and shows" subtitle={feedsSubtitle(panels)}>
                        {!snap?.configured && !(panels.tasks?.rows?.length || panels.shows?.rows?.length) ? (
                            <div className="monitor-note">No feeds yet. Add feeds with panel &ldquo;tasks&rdquo; or &ldquo;shows&rdquo; to ~/.di/monitor.json — a command, a file or a URL each.</div>
                        ) : null}
                        <div className="monitor-feeds">
                            {['tasks', 'shows'].map((key) => (panels[key]?.rows || []).map((feedRow) => (
                                <MonitorFeed key={`${key}:${feedRow.id}`} row={feedRow} kind={key} query={query} ago={(iso) => timeAgo(iso)} />
                            )))}
                        </div>
                    </ModuleSection>

                    <div data-panel="services"><ModuleSection title="Services" subtitle={machinesSubtitle(panels.services, `${panels.services?.running ?? 0} running · ${failed} failed (failed first)`)}>
                        <PanelLive name="services" ages={ages} nowMs={nowMs} paused={paused} />
                        <PanelNote panel={panels.services} empty="No services reported." />
                        <div className="monitor-grid">
                            {services.map((sv) => (
                                <Row key={sv.id ?? sv.unit} id={`s:${sv.id ?? sv.unit}`} tone={sv.active === 'failed' ? 'danger' : 'success'} flash={flash(`s:${sv.id ?? sv.unit}`)}
                                    selected={selected?.kind === 'service' && selected.id === (sv.id ?? sv.unit)} onSelect={() => pick('service', sv)}>
                                    <span className="monitor-name">{sv.unit.replace(/\.service$/, '')}</span>
                                    <span className="monitor-meta">{sv.active} · {sv.sub}{sv.machine ? <span data-row-machine={sv.machine}> · {sv.machine}</span> : null}</span>
                                </Row>
                            ))}
                        </div>
                    </ModuleSection></div>

                    <div data-panel="prs"><ModuleSection title="Pull requests" subtitle="Open work on this repo">
                        <PanelLive name="pullRequests" ages={ages} nowMs={nowMs} paused={paused} />
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
                <MonitorDetail key={`${selected.kind}:${selected.id}`} kind={selected.kind} row={selectedRow} title={drawerTitle} snap={snap} idOf={rowId}
                    onOpen={(kind, id) => setSelected({ kind, id })} onClose={() => setSelected(null)}
                    footer={selected.kind === 'task' && selectedRow ? <TaskActions task={selectedRow} onChanged={() => setTaskVersion((v) => v + 1)} /> : null} />
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
