// The calm Monitor, as pure functions of one snapshot of GET /api/monitor:
//   needsYou     the things that need him, each with ONE action that opens its detail
//   vitalChips   the one-row strip (state + number + plain label)
//   vitalDetail  what a chip opens in the drawer
//   seedActivity "earlier" items built from the snapshot's own timestamps
//   machineLabels two devices with one name never read as two identical rows
// No clock of its own: `nowMs` is passed in so a test can pin it.

import { ago } from './monitorFormat.js'
import { shortCommit, tierLabel, tierState } from './monitorTier.js'

const rows = (panel) => (Array.isArray(panel?.rows) ? panel.rows : [])
const clip = (text, n = 40) => { const s = String(text ?? ''); return s.length > n ? `${s.slice(0, n - 1)}…` : s }
const tierName = (id) => (String(id).startsWith('local:') ? `local ${String(id).slice(6)}` : String(id))
const unitName = (unit) => String(unit || '').replace(/\.service$/, '')
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`
const DAY_MS = 24 * 3600 * 1000

export const THING_TONE = { live: 'success', ok: 'success', idle: 'muted', off: 'muted' }
export const AGENT_TONE = { busy: 'success', blocked: 'warning', idle: 'muted', shell: 'accent' }

// ---- Needs you -------------------------------------------------------------------------
// One row per item: what (big), why (one short line), one action. Worst first, a stable order inside a tone.
export const needsYou = (snap) => {
    const out = []
    const tiers = rows(snap?.tiers)
    const dev = tiers.find((r) => r.id === 'dev')
    for (const row of tiers) {
        const st = tierState(row, dev?.commit)
        if (st.tone === 'success' || st.quiet) continue
        const name = tierName(row.id)
        const target = { kind: 'tier', id: row.id }
        if (st.tone === 'danger') {
            out.push({ id: `tier:${row.id}`, tone: 'danger', what: `${name} is not answering`, why: row.status ? `The probe got ${row.status}.` : 'The probe got no answer.', action: 'See the probe', target })
        } else if (typeof row.behindDev === 'number' && row.behindDev > 0) {
            out.push({ id: `tier:${row.id}`, tone: 'warning', what: `${name} is behind dev`, why: `${plural(row.behindDev, 'commit', 'commits')} behind${row.builtAt ? `, built ${ago(row.builtAt)}` : ''}.`, action: 'Compare with dev', target })
        } else if (row.commit && dev?.commit && row.commit !== dev.commit) {
            out.push({ id: `tier:${row.id}`, tone: 'warning', what: `${name} is not on dev’s commit`, why: `On ${shortCommit(row.commit)}; dev is on ${shortCommit(dev.commit)}.`, action: 'Compare with dev', target })
        } else {
            out.push({ id: `tier:${row.id}`, tone: 'warning', what: `${name} reports no commit`, why: 'It cannot be compared with dev.', action: 'See the tier', target })
        }
    }
    for (const sv of rows(snap?.panels?.services)) {
        if (sv.active !== 'failed') continue
        out.push({ id: `service:${sv.unit}`, tone: 'danger', what: `${unitName(sv.unit)} failed`, why: sv.description || 'A service stopped with an error.', action: 'See the service', target: { kind: 'service', id: sv.unit } })
    }
    for (const a of rows(snap?.panels?.agents)) {
        if (a.status !== 'blocked') continue
        out.push({ id: `agent:${a.sessionId}`, tone: 'warning', what: `${clip(a.title, 36)} is waiting for you`, why: 'The agent stopped and needs an answer.', action: 'See the agent', target: { kind: 'agent', id: a.sessionId } })
    }
    // probes that are not a tier's own address (the tiers already say it)
    const tierUrls = new Set(tiers.map((t) => t.url).filter(Boolean))
    for (const p of rows(snap?.panels?.network)) {
        if (p.ok || tierUrls.has(p.url)) continue
        out.push({ id: `probe:${p.id}`, tone: 'danger', what: `${p.name} is down`, why: p.status ? `The probe got ${p.status}.` : String(p.error || 'No answer.').slice(0, 60), action: 'See the probe', target: { kind: 'probe', id: p.id } })
    }
    return out.map((r, i) => ({ r, i })).sort((a, b) => (a.r.tone === 'danger' ? 0 : 1) - (b.r.tone === 'danger' ? 0 : 1) || a.i - b.i).map((x) => x.r)
}

// ---- Vital strip -----------------------------------------------------------------------
// A fact that is a headline in Needs you is not repeated with its number here: the chip keeps only its state.
export const vitalChips = (snap, host = snap?.host) => {
    const out = []
    const tiers = rows(snap?.tiers)
    const dev = tiers.find((r) => r.id === 'dev')
    for (const row of tiers) {
        const st = tierState(row, dev?.commit)
        const mine = row.id === `local:${host}`
        const label = mine ? 'this machine' : tierLabel(row.id)
        let value
        if (st.tone === 'danger') value = 'not answering'
        else if (st.tone === 'warning') value = st.quiet ? st.note : st.note.replace(/^\d+ behind dev$/, 'behind')
        else value = `✓ ${shortCommit(row.commit)}`
        out.push({ id: `tier:${row.id}`, tierId: row.id, label, value, tone: st.tone, target: { kind: 'tier', id: row.id } })
    }
    const p = snap?.panels || {}
    const dash = '—'
    if (p.machines) {
        out.push({ id: 'machines', label: 'Machines', value: p.machines.ok ? `${p.machines.online} of ${p.machines.total}` : dash, tone: p.machines.ok && p.machines.online ? 'success' : 'warning', target: { kind: 'vital', id: 'machines' } })
    }
    if (p.agents) {
        const blocked = rows(p.agents).some((a) => a.status === 'blocked')
        out.push({ id: 'agents', label: 'Agents', value: p.agents.ok ? `${p.agents.live} · ${p.agents.busy} busy` : dash, tone: blocked ? 'warning' : 'accent', target: { kind: 'vital', id: 'agents' } })
    }
    if (p.pullRequests) {
        out.push({ id: 'prs', label: 'PRs', value: p.pullRequests.ok ? String(p.pullRequests.open) : dash, tone: 'accent', target: { kind: 'vital', id: 'prs' } })
    }
    if (p.services) {
        const total = rows(p.services).length
        const failed = p.services.failed || 0
        const running = p.services.running ?? total - failed
        out.push({ id: 'services', label: 'Services', value: !p.services.ok ? dash : failed ? `${running} of ${total} running` : 'all running', tone: failed ? 'danger' : 'success', target: { kind: 'vital', id: 'services' } })
    }
    if (p.connected && (p.connected.total || !p.connected.ok)) {
        out.push({ id: 'gear', label: 'Show gear', value: p.connected.ok ? `${p.connected.live} of ${p.connected.total} ready` : dash, tone: p.connected.live ? 'success' : 'warning', target: { kind: 'vital', id: 'gear' } })
    }
    if (p.presence) {
        out.push({ id: 'people', label: 'People', value: p.presence.ok ? String(p.presence.people) : dash, tone: p.presence.people ? 'success' : 'default', target: { kind: 'vital', id: 'people' } })
    }
    return out
}

// What a chip opens: dot row + the rows behind it; each row opens its own detail.
export const machineLabels = (list) => {
    const byName = new Map()
    for (const m of list) byName.set(m.name, (byName.get(m.name) || 0) + 1)
    const byNameOs = new Map()
    for (const m of list) byNameOs.set(`${m.name}|${m.os}`, (byNameOs.get(`${m.name}|${m.os}`) || 0) + 1)
    const out = new Map()
    for (const m of list) {
        let label = m.name
        if (byName.get(m.name) > 1) label = `${m.name} · ${m.os || 'unknown system'}`
        if (byNameOs.get(`${m.name}|${m.os}`) > 1) label = `${label} · …${String(m.ip || m.id).split('.').slice(-2).join('.')}`
        out.set(m.id, label)
    }
    return out
}

export const vitalDetail = (snap, id) => {
    const p = snap?.panels || {}
    const dot = (tone, title) => ({ tone, title })
    if (id === 'machines') {
        const labels = machineLabels(rows(p.machines))
        const list = [...rows(p.machines)].sort((a, b) => Number(b.online) - Number(a.online))
        return { title: 'Machines', rows: list.map((m) => ({ key: m.id, kind: 'machine', row: m, name: labels.get(m.id), meta: m.online ? 'online' : `off · ${ago(m.lastSeen)}`, tone: m.online ? 'success' : 'muted' })), dots: list.map((m) => dot(m.online ? 'success' : 'muted', `${labels.get(m.id)}: ${m.online ? 'online' : 'off'}`)) }
    }
    if (id === 'agents') {
        const list = rows(p.agents)
        return { title: 'Agents', rows: list.map((a) => ({ key: a.sessionId, kind: 'agent', row: a, name: a.title, meta: `${a.status} · ${ago(a.lastActivity)}`, tone: AGENT_TONE[a.status] || 'accent' })), dots: list.map((a) => dot(AGENT_TONE[a.status] || 'accent', `${a.title}: ${a.status}`)) }
    }
    if (id === 'prs') {
        const list = rows(p.pullRequests)
        return { title: 'Pull requests', rows: list.map((r) => ({ key: r.number, kind: 'pr', row: r, name: `#${r.number} ${r.title}`, meta: `${r.draft ? 'draft' : 'open'} · ${ago(r.updatedAt)}`, tone: r.draft ? 'muted' : 'accent' })), dots: list.map((r) => dot(r.draft ? 'muted' : 'accent', `#${r.number} ${r.draft ? 'draft' : 'open'}`)) }
    }
    if (id === 'services') {
        const list = [...rows(p.services)].sort((a, b) => (b.active === 'failed') - (a.active === 'failed'))
        return { title: 'Services', rows: list.map((s) => ({ key: s.unit, kind: 'service', row: s, name: unitName(s.unit), meta: `${s.active} · ${s.sub}`, tone: s.active === 'failed' ? 'danger' : 'success' })), dots: list.map((s) => dot(s.active === 'failed' ? 'danger' : 'success', `${unitName(s.unit)}: ${s.active}`)) }
    }
    if (id === 'gear') {
        const list = rows(p.connected)
        return { title: 'Show gear', rows: list.map((c) => ({ key: c.id, kind: 'thing', row: c, name: c.title, meta: `${c.state} · ${c.detail}`, tone: THING_TONE[c.state] || 'muted' })), dots: list.map((c) => dot(THING_TONE[c.state] || 'muted', `${c.title}: ${c.state}`)) }
    }
    if (id === 'people') {
        const list = rows(p.presence)
        return { title: 'People', rows: list.map((u) => ({ key: u.id, kind: 'place', row: u, name: `${u.kind} ${u.target}`, meta: `${plural(u.people.length, 'person', 'people')} · ${u.people.slice(0, 3).map((x) => x.name).join(', ')}`, tone: 'success' })), dots: list.flatMap((u) => u.people.map((who) => dot('success', `${who.name} in ${u.target}`))) }
    }
    return { title: '', rows: [], dots: [] }
}

// ---- Activity: "earlier" ---------------------------------------------------------------
// Built from the snapshot's own timestamps, newest first, so the column is never empty while the
// snapshot has any: agents' last activity, machines seen in the last 24 h, pull requests updated in
// the last 24 h, tiers' built times, machine reports.
export const seedActivity = (snap, nowMs = Date.now(), limit = 12) => {
    const out = []
    const add = (key, tone, text, iso) => {
        const at = Date.parse(iso)
        if (Number.isFinite(at)) out.push({ key, tone, text, at })
    }
    for (const a of rows(snap?.panels?.agents)) add(`agent:${a.sessionId}`, a.status === 'blocked' ? 'warning' : a.status === 'busy' ? 'success' : 'muted', `agent '${clip(a.title)}' ${a.status}`, a.lastActivity)
    for (const m of rows(snap?.panels?.machines)) {
        if (m.online || !m.lastSeen) continue
        const t = Date.parse(m.lastSeen)
        if (Number.isFinite(t) && nowMs - t <= DAY_MS) add(`machine:${m.id}`, 'muted', `machine ${m.name} last seen`, m.lastSeen)
    }
    let prs = 0
    for (const r of rows(snap?.panels?.pullRequests)) {
        const t = Date.parse(r.updatedAt)
        if (!Number.isFinite(t) || nowMs - t > DAY_MS || prs >= 6) continue
        prs += 1
        add(`pr:${r.number}`, 'accent', `PR #${r.number} updated: ${clip(r.title, 44)}`, r.updatedAt)
    }
    for (const t of rows(snap?.tiers)) if (t.builtAt) add(`tier:${t.id}`, 'accent', `${tierName(t.id)} built ${shortCommit(t.commit)}`, t.builtAt)
    for (const r of snap?.reports || []) add(`report:${r.host}`, r.stale ? 'warning' : 'success', `${r.host} reported`, r.reportedAt)
    return out.sort((a, b) => b.at - a.at).slice(0, limit)
}
