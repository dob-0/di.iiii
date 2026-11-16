// "All of di.iiii in one place", UI side: from one GET /api/monitor snapshot, the agents, the standing rules,
// the hooks and the request rows over every host that reported (this server included). Pure: no clock, no fetch.
// Rules and hooks are the same file on every machine most of the time, so equal ones are shown once with
// "same on N machines"; a machine whose file differs or could not be read is listed on its own.

const list = (value) => (Array.isArray(value) ? value : [])
const plain = (value) => (value && typeof value === 'object' && !Array.isArray(value) ? value : {})

/** [{ host, panels, stale }] for this server and every report, this server first, a host once. */
export const hostsOf = (snapshot) => {
    const seen = new Set()
    const out = []
    const add = (host, panels, stale = false) => {
        const name = String(host || '').trim()
        if (!name || seen.has(name)) return
        seen.add(name)
        out.push({ host: name, panels: plain(panels), stale })
    }
    if (snapshot?.panels) add(String(snapshot.host || 'this server').split('.')[0], snapshot.panels)
    for (const r of list(snapshot?.reports)) add(r?.host, r?.panels, Boolean(r?.stale))
    return out
}

/** Every live chat and its helpers, one row each, newest activity first. */
export const knowledgeAgents = (hosts) => {
    const chats = []
    const helpers = []
    for (const { host, panels, stale } of hosts) {
        if (stale) continue // a machine that stopped reporting is not 'at work'
        for (const a of list(panels.agents?.rows)) {
            if (a && typeof a === 'object') chats.push({ host, id: String(a.sessionId || '').slice(0, 8), title: a.title || null, status: a.status || 'live', model: a.model || null, branch: a.branch || null, lastActivity: a.lastActivity || null })
        }
        for (const h of list(panels.agents?.helpers)) {
            if (h && typeof h === 'object') helpers.push({ host, parent: h.parent || null, label: h.label || null, type: h.type || null, model: h.model || null, since: h.since || null, busy: Boolean(h.busy) })
        }
    }
    const newest = (key) => (a, b) => String(b[key] || '').localeCompare(String(a[key] || ''))
    return { chats: chats.sort(newest('lastActivity')), helpers: helpers.sort(newest('since')), busy: chats.filter((c) => c.status === 'busy').length + helpers.filter((h) => h.busy).length }
}

// two hosts hold "the same" panel when their rows are equal; the changed-time is not part of that
const sameKey = (panel) => JSON.stringify(list(panel.rows))

/** Groups hosts by equal rows: [{ hosts: [..], panel }] for readable panels, and { unreadable: [{host, why}] }. */
const groupPanels = (hosts, name) => {
    const groups = new Map()
    const unreadable = []
    for (const { host, panels } of hosts) {
        const panel = panels[name]
        if (!panel) continue
        if (panel.ok === false) { unreadable.push({ host, why: String(panel.why || 'could not be read') }); continue }
        const key = sameKey(panel)
        if (!groups.has(key)) groups.set(key, { hosts: [], panel })
        groups.get(key).hosts.push(host)
    }
    return { groups: [...groups.values()].sort((a, b) => b.hosts.length - a.hosts.length), unreadable }
}

const withSame = (g) => ({ hosts: g.hosts, same: g.hosts.length, sameText: g.hosts.length > 1 ? `same on ${g.hosts.length} machines` : null, changed: g.panel.changed || null, count: g.panel.count ?? list(g.panel.rows).length, rows: list(g.panel.rows) })

export const knowledgeRules = (hosts) => {
    const { groups, unreadable } = groupPanels(hosts, 'rules')
    return { sets: groups.map(withSame), unreadable }
}

export const knowledgeHooks = (hosts) => {
    const { groups, unreadable } = groupPanels(hosts, 'hooks')
    return { sets: groups.map((g) => ({ ...withSame(g), events: plain(g.panel.events) })), unreadable }
}

const OPEN_STATES = new Set(['NEW', 'WAITING', 'OPEN', 'BLOCKED', 'RUNNING', 'IN-PROGRESS'])

/** Ledger rows (source 'ledger'), newest touched first, with counts by state. */
export const knowledgeRows = (snapshot) => {
    const rows = list(snapshot?.asks?.rows).filter((a) => a && a.source === 'ledger')
    const parse = (t) => String(t || '')
    const sorted = [...rows].sort((a, b) => parse(b.touched).localeCompare(parse(a.touched)) || parse(b.id).localeCompare(parse(a.id), undefined, { numeric: true }))
    const byState = {}
    for (const r of sorted) byState[r.state || 'unknown'] = (byState[r.state || 'unknown'] || 0) + 1
    return { rows: sorted, count: sorted.length, byState, open: sorted.filter((r) => OPEN_STATES.has(String(r.state).toUpperCase())).length, empty: sorted.length === 0 ? 'no request rows yet: the machine that holds the ledger has not reported' : null }
}

export const monitorKnowledge = (snapshot) => {
    const hosts = hostsOf(snapshot)
    return { hosts: hosts.map((h) => h.host), agents: knowledgeAgents(hosts), rules: knowledgeRules(hosts), hooks: knowledgeHooks(hosts), rows: knowledgeRows(snapshot) }
}
