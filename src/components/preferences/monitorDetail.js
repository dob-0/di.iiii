// What the Monitor's one drawer shows for any item: EVERY field the server sent, as plain label/value
// rows (exact values), the items it points to (a chat to its machine, a pull request to its branch's
// agents), and the raw record. Pure functions, so the same rule serves every kind and is tested once.
import { ago } from './monitorFormat.js'

const ISO = /^\d{4}-\d\d-\d\d[T ]\d\d:\d\d/
const MAX_DEPTH = 4

export const KIND_LABEL = {
    machine: 'Machine', tier: 'Tier', probe: 'Address probe', agent: 'Agent session', chat: 'Chat', thing: 'Connected thing',
    place: 'People in a place', service: 'Service', pr: 'Pull request', node: 'Map item', ask: 'Ask', report: 'Machine report', part: 'Part', task: 'Task'
}

// "lastSeen" -> "Last seen", "tx" stays short
export const humanize = (key) => {
    const words = String(key).replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ').trim().toLowerCase()
    return words.charAt(0).toUpperCase() + words.slice(1)
}

const isTime = (v) => typeof v === 'string' && ISO.test(v) && Number.isFinite(new Date(v).getTime())

const scalar = (value) => {
    if (value === null || value === undefined || value === '') return { text: 'none', empty: true }
    if (typeof value === 'boolean') return { text: value ? 'yes' : 'no' }
    if (isTime(value)) return { text: value, time: value, age: ago(value) }
    return { text: String(value) }
}

/** Every leaf of a record as { label, text, time?, age?, empty? }. Nothing is dropped, nothing summarised. */
export function fieldsOf(record, prefix = [], depth = 0) {
    const out = []
    if (record === null || typeof record !== 'object') return out
    const entries = Array.isArray(record) ? record.map((v, i) => [String(i + 1), v]) : Object.entries(record)
    for (const [key, value] of entries) {
        const path = [...prefix, Array.isArray(record) ? key : humanize(key)]
        const label = path.join(' · ')
        if (value !== null && typeof value === 'object' && depth < MAX_DEPTH) {
            const list = Array.isArray(value)
            if (list && !value.length) { out.push({ label, text: 'none', empty: true }); continue }
            if (list && value.every((v) => v === null || typeof v !== 'object')) {
                out.push({ label, text: value.map(String).join(', ') })
                continue
            }
            if (!list && !Object.keys(value).length) { out.push({ label, text: 'none', empty: true }); continue }
            out.push(...fieldsOf(value, path, depth + 1))
        } else if (value !== null && typeof value === 'object') {
            out.push({ label, text: JSON.stringify(value) })
        } else {
            out.push({ label, ...scalar(value) })
        }
    }
    return out
}

const lower = (v) => String(v || '').toLowerCase()
const hostOf = (name) => lower(name).split('.')[0]

/** Items this one points to: { label, text, kind, id }. Only what really exists in the snapshot. */
export function relatedOf(kind, row, snap, idOf) {
    if (!row || !snap) return []
    const panels = snap.panels || {}
    const out = []
    const machines = panels.machines?.rows || []
    const agents = panels.agents?.rows || []
    const prs = panels.pullRequests?.rows || []
    const chats = snap.chats?.rows || []
    const machineNamed = (name) => machines.find((m) => hostOf(m.name) === hostOf(name))
    const addMachine = (name, label = 'Machine') => {
        const m = name && machineNamed(name)
        if (m) out.push({ label, text: m.name, kind: 'machine', id: idOf(m) })
    }
    if (kind === 'chat') {
        addMachine(row.host)
        for (const a of agents.filter((x) => x.sessionId === row.id)) out.push({ label: 'Agent session', text: a.title, kind: 'agent', id: a.sessionId })
        for (const r of (snap.reports || []).filter((x) => hostOf(x.host) === hostOf(row.host))) out.push({ label: 'Report', text: r.host, kind: 'report', id: r.host })
    } else if (kind === 'agent') {
        addMachine(row.machine)
        for (const p of prs.filter((x) => row.branch && x.branch === row.branch)) out.push({ label: 'Pull request on its branch', text: `#${p.number} ${p.title}`, kind: 'pr', id: p.number })
        for (const c of chats.filter((x) => x.id === row.sessionId)) out.push({ label: 'Chat', text: c.title, kind: 'chat', id: c.id })
    } else if (kind === 'pr') {
        for (const a of agents.filter((x) => row.branch && x.branch === row.branch)) out.push({ label: 'Agent on its branch', text: a.title, kind: 'agent', id: a.sessionId })
    } else if (kind === 'machine') {
        for (const a of agents.filter((x) => hostOf(x.machine) === hostOf(row.name))) out.push({ label: 'Agent session', text: a.title, kind: 'agent', id: a.sessionId })
        for (const c of chats.filter((x) => hostOf(x.host) === hostOf(row.name))) out.push({ label: 'Chat', text: c.title, kind: 'chat', id: c.id })
        const tier = (snap.tiers?.rows || []).find((t) => t.id === `local:${hostOf(row.name)}`)
        if (tier) out.push({ label: 'Tier', text: tier.id, kind: 'tier', id: tier.id })
    } else if (kind === 'tier') {
        if (row.id?.startsWith('local:')) addMachine(row.id.slice(6))
    } else if (kind === 'report') {
        addMachine(row.host)
    } else if (kind === 'node') {
        const nodes = snap.map?.nodes || []
        for (const e of (snap.map?.edges || []).filter((x) => x.from === row.id || x.to === row.id)) {
            const otherId = e.from === row.id ? e.to : e.from
            const other = nodes.find((n) => n.id === otherId)
            out.push({ label: e.kind, text: other?.label || otherId, kind: 'node', id: otherId })
        }
    }
    return out
}

/** The whole drawer, as data: title, every field, related items, raw JSON, and a plain-words state line. */
export function buildDetail(kind, row, snap, idOf) {
    const fields = fieldsOf(row)
    if (kind === 'tier') {
        const spaces = (snap?.spaces?.rows || []).filter((s) => s.tier === row.id)
        if (spaces.length) fields.push({ label: 'Spaces held', text: spaces.map((s) => `${s.slug} (${s.visibility})`).join(', ') })
    }
    return {
        kind,
        kindLabel: KIND_LABEL[kind] || humanize(kind),
        fields,
        related: relatedOf(kind, row, snap, idOf),
        raw: JSON.stringify(row, null, 2)
    }
}

// One text of everything an item holds, for the filter: every value of every field, lower case.
const textCache = new WeakMap()
export const searchText = (row) => {
    if (row === null || typeof row !== 'object') return String(row ?? '').toLowerCase()
    if (!textCache.has(row)) textCache.set(row, fieldsOf(row).map((f) => f.text).join(' \n ').toLowerCase())
    return textCache.get(row)
}
export const rowMatches = (query, row) => {
    const q = String(query || '').trim().toLowerCase()
    return !q || searchText(row).includes(q)
}

/** Count what the filter keeps: { matched, total } over every kind of item the Monitor lists. */
export function searchCounts(snap, query) {
    const p = snap?.panels || {}
    const pools = [
        p.machines?.rows, p.network?.rows, p.agents?.rows, p.connected?.rows, p.presence?.rows, p.services?.rows, p.pullRequests?.rows,
        snap?.chats?.rows, snap?.asks?.rows, snap?.reports, snap?.parts?.rows, snap?.tiers?.rows
    ]
    let matched = 0
    let total = 0
    for (const rows of pools) {
        for (const row of rows || []) { total += 1; if (rowMatches(query, row)) matched += 1 }
    }
    return { matched, total }
}
