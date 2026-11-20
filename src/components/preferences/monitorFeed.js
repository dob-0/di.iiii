// "What changed": the pure difference between two snapshots of GET /api/monitor,
// as a list of events the page shows newest first. No clock of its own: `now`
// is passed in so a test can pin it. Each event is { key, tone, text, at }.

const rows = (panel) => (Array.isArray(panel?.rows) ? panel.rows : [])
const byKey = (list, keyOf) => new Map(list.map((r) => [keyOf(r), r]))
const tierName = (id) => (String(id).startsWith('local:') ? `local ${String(id).slice(6)}` : String(id))
const clip = (text, n = 60) => { const s = String(text ?? ''); return s.length > n ? `${s.slice(0, n - 1)}…` : s }

// a tier answers when its status is a 2xx number or a known ok word (same reading as MonitorOverview)
const tierUp = (row) => {
    if (row.source === 'report') return row.state !== 'warn' && row.state !== 'off'
    const s = row.status
    if (typeof s === 'number') return s >= 200 && s < 300
    return ['ok', 'up', 'live', 'online', '200'].includes(String(s ?? '').toLowerCase())
}

export const diffSnapshots = (prev, next, now = Date.now()) => {
    if (!prev || !next) return []
    const out = []
    const add = (key, tone, text) => out.push({ key, tone, text, at: now })
    const pp = prev.panels || {}
    const np = next.panels || {}

    // tiers: answering or not, a new commit, caught up with dev or fallen behind
    const prevTiers = byKey(rows(prev.tiers), (r) => r.id)
    for (const t of rows(next.tiers)) {
        const old = prevTiers.get(t.id)
        const name = tierName(t.id)
        if (!old) { add(`tier:${t.id}:new`, 'accent', `${name} appeared`); continue }
        const was = tierUp(old)
        const is = tierUp(t)
        if (was && !is) add(`tier:${t.id}:up`, 'danger', `${name} stopped answering`)
        else if (!was && is) add(`tier:${t.id}:up`, 'success', `${name} answers again`)
        if (old.commit && t.commit && old.commit !== t.commit) add(`tier:${t.id}:commit`, 'accent', `${name} moved to ${String(t.commit).slice(0, 7)}`)
        const a = typeof old.behindDev === 'number' ? old.behindDev : null
        const b = typeof t.behindDev === 'number' ? t.behindDev : null
        if (a === 0 && b > 0) add(`tier:${t.id}:behind`, 'warning', `${name} fell ${b} behind dev`)
        else if (a > 0 && b === 0) add(`tier:${t.id}:behind`, 'success', `${name} caught up with dev`)
    }

    // machines on the tailnet
    const prevMachines = byKey(rows(pp.machines), (r) => r.id)
    for (const m of rows(np.machines)) {
        const old = prevMachines.get(m.id)
        if (!old) { add(`machine:${m.id}:new`, 'accent', `machine ${m.name} appeared`); continue }
        if (old.online !== m.online) add(`machine:${m.id}:online`, m.online ? 'success' : 'warning', `machine ${m.name} ${m.online ? 'came online' : 'went offline'}`)
    }

    // probes
    const prevProbes = byKey(rows(pp.network), (r) => r.id)
    for (const n of rows(np.network)) {
        const old = prevProbes.get(n.id)
        if (old && old.ok !== n.ok) add(`probe:${n.id}`, n.ok ? 'success' : 'danger', n.ok ? `${n.name} answers again` : `${n.name} stopped answering`)
    }

    // agents: a new one, one that left, one that changed what it is doing. An agent is one session: the hub lists a session once,
    // whichever machine has it, and the page's rows are keyed by the session too.
    const agentKey = (a) => String(a.sessionId)
    const prevAgents = byKey(rows(pp.agents), agentKey)
    const nextAgents = byKey(rows(np.agents), agentKey)
    // The agents of another machine are in the list only while that machine's report is fresh, and this machine's own only while its
    // own list can be read: when a report goes stale or comes back, a machine is listed for the first time or dropped, or the own list
    // fails for a moment, agents leave or join the rows without having ended or started. A row can name another machine than the one
    // that supplied it, so the rows cannot be matched to the machine behind them: an agent starts or ends only if the machines list
    // (`panels.agents.machines`: who is listed, in which state) is the same in both snapshots and no list is cut at its limit (a cut
    // list hides rows, and a real end shows one of them). A start or end in the same poll as such a change is not said; a change of
    // what an agent does always is. An older server sends no list: then every change counts, as before. A machine is known by the
    // first word of its name, in lower case; an IP address is one name.
    const wordOf = (s) => { const t = String(s ?? '').toLowerCase(); return /^\d{1,3}(\.\d{1,3}){3}$/.test(t) ? t : t.split('.')[0] }
    const machinesOf = (panel) => (Array.isArray(panel?.machines) ? panel.machines : null)
    const standing = (panel) => { const list = machinesOf(panel); return list && JSON.stringify(list.map((m) => [wordOf(m?.host), m?.state]).sort()) }
    const cut = (panel) => machinesOf(panel)?.some((m) => m?.capped) === true
    const settled = standing(pp.agents) === standing(np.agents) && !cut(pp.agents) && !cut(np.agents)
    for (const [k, a] of nextAgents) {
        const old = prevAgents.get(k)
        if (!old) { if (settled) add(`agent:${k}:new`, 'accent', `agent '${clip(a.title)}' started`) }
        else if (old.status !== a.status) add(`agent:${k}:status`, a.status === 'blocked' ? 'warning' : 'accent', `agent '${clip(a.title)}' ${old.status} → ${a.status}`)
    }
    for (const [k, a] of prevAgents) if (!nextAgents.has(k) && settled) add(`agent:${k}:gone`, 'muted', `agent '${clip(a.title)}' ended`)

    // services
    const prevServices = byKey(rows(pp.services), (r) => r.unit)
    for (const s of rows(np.services)) {
        const old = prevServices.get(s.unit)
        if (old && old.active !== s.active) {
            add(`service:${s.unit}`, s.active === 'failed' ? 'danger' : 'success', `service ${s.unit.replace(/\.service$/, '')} ${old.active} → ${s.active}`)
        }
    }

    // connected things
    const prevThings = byKey(rows(pp.connected), (r) => r.id)
    for (const c of rows(np.connected)) {
        const old = prevThings.get(c.id)
        if (old && old.state !== c.state) add(`thing:${c.id}`, c.state === 'live' || c.state === 'ok' ? 'success' : 'muted', `${c.title} ${old.state} → ${c.state}`)
    }

    // people in a space or project
    const prevPlaces = byKey(rows(pp.presence), (r) => r.id)
    for (const u of rows(np.presence)) {
        const old = prevPlaces.get(u.id)
        const was = old ? old.people.length : 0
        if (u.people.length !== was) add(`place:${u.id}`, 'accent', `${u.target}: ${u.people.length} here (was ${was})`)
    }
    for (const [id, old] of prevPlaces) {
        if (!rows(np.presence).some((u) => u.id === id)) add(`place:${id}`, 'muted', `${old.target}: everyone left`)
    }

    // pull requests
    const prevPrs = byKey(rows(pp.pullRequests), (r) => r.number)
    const nextPrs = byKey(rows(np.pullRequests), (r) => r.number)
    for (const [n, p] of nextPrs) {
        const old = prevPrs.get(n)
        if (!old) add(`pr:${n}:new`, 'accent', `PR #${n} opened`)
        else if (old.draft !== p.draft) add(`pr:${n}:draft`, 'accent', `PR #${n} is ${p.draft ? 'a draft again' : 'ready for review'}`)
    }
    for (const n of prevPrs.keys()) if (!nextPrs.has(n)) add(`pr:${n}:gone`, 'muted', `PR #${n} closed`)

    // asks
    const prevAsks = byKey(rows(prev.asks), (r) => String(r.id))
    const nextAsks = byKey(rows(next.asks), (r) => String(r.id))
    for (const [id, a] of nextAsks) if (!prevAsks.has(id)) add(`ask:${id}:new`, 'accent', `new ask: ${clip(a.text, 50)}`)
    for (const [id, a] of prevAsks) if (!nextAsks.has(id)) add(`ask:${id}:gone`, 'muted', `ask done: ${clip(a.text, 50)}`)

    // machines that report in: the first report, and one that went quiet or came back
    const prevReports = byKey(prev.reports || [], (r) => r.host)
    for (const r of next.reports || []) {
        const old = prevReports.get(r.host)
        if (!old) add(`report:${r.host}`, 'accent', `${r.host} reported`)
        else if (!old.stale && r.stale) add(`report:${r.host}`, 'warning', `${r.host} went quiet`)
        else if (old.stale && !r.stale) add(`report:${r.host}`, 'success', `${r.host} reported again`)
    }
    return out
}

// newest first, never more than `limit`
export const pushEvents = (feed, events, limit = 50) => [...events.slice().reverse(), ...feed].slice(0, limit)
