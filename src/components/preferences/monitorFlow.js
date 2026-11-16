// "How the info flows": the pure maths behind the map's pulses and the Flow panel. Everything comes from the real
// snapshots; nothing here is decoration. No clock of its own: `now` is passed in so a test can pin it.
//   flowPulses(prev, next, events)  one pulse per source whose report is new (along its edge) and one per change (on its node)
//   flowRates(log, reports, now)    per source: reports per minute (last 5 minutes), last heard, and whether it went silent
//   perMinute(log, now, minutes)    events per minute, oldest first, for the sparkline

const WINDOW_MS = 5 * 60 * 1000
const MIN_SILENT_MS = 90 * 1000
const rowsOf = (list) => (Array.isArray(list) ? list : [])

// the map node a feed key ("tier:dev:up", "agent:host/session:status", "machine:id:online", "report:host") points at
export const nodeOfKey = (key) => {
    const k = String(key || '')
    const [kind, id] = k.split(':')
    if (kind === 'tier') return k.slice(5, k.lastIndexOf(':')) ? `tier:${k.slice(5, k.lastIndexOf(':'))}` : null
    if (kind === 'machine') return id ? `machine:${id}` : null
    if (kind === 'report') return id ? `machine:${id}` : null
    if (kind === 'agent') {
        const [host, session] = String(k.slice(6, k.lastIndexOf(':'))).split('/')
        return session ? `agent:${host}:${session.slice(0, 8)}` : null
    }
    return null
}

// the edge a machine's report travels: machine to the tier it reports to
export const reportEdge = (host) => ({ from: `machine:${host}`, to: `tier:local:${host}` })

export const flowPulses = (prev, next, events = []) => {
    if (!prev || !next) return []
    const out = []
    const before = new Map(rowsOf(prev.reports).map((r) => [r.host, r.reportedAt]))
    for (const r of rowsOf(next.reports)) {
        if (before.has(r.host) && before.get(r.host) !== r.reportedAt) out.push({ ...reportEdge(r.host), tone: 'accent', kind: 'report', host: r.host })
    }
    for (const e of events) {
        const node = nodeOfKey(e.key)
        if (node) out.push({ from: node, to: node, tone: e.tone || 'accent', kind: 'change', text: e.text })
    }
    return out
}

export const flowRates = (log, reports, now) => {
    const byHost = new Map()
    for (const e of log) if (e.kind === 'report') byHost.set(e.host, [...(byHost.get(e.host) || []), e.t])
    const out = {}
    const hosts = new Set([...byHost.keys(), ...rowsOf(reports).map((r) => r.host)])
    for (const host of hosts) {
        const ts = (byHost.get(host) || []).sort((a, b) => a - b)
        const recent = ts.filter((t) => now - t <= WINDOW_MS)
        const gaps = ts.slice(1).map((t, i) => t - ts[i]).sort((a, b) => a - b)
        const gap = gaps.length ? gaps[Math.floor(gaps.length / 2)] : 0
        const heard = ts.length ? ts[ts.length - 1] : (Date.parse(rowsOf(reports).find((r) => r.host === host)?.reportedAt) || null)
        const stale = !!rowsOf(reports).find((r) => r.host === host)?.stale
        const silent = stale || (heard != null && gap > 0 && now - heard > Math.max(MIN_SILENT_MS, gap * 3))
        out[host] = { perMin: +(recent.length / (WINDOW_MS / 60000)).toFixed(1), lastAt: heard, silent }
    }
    return out
}

export const perMinute = (log, now, minutes = 15) => {
    const out = Array(minutes).fill(0)
    for (const e of log) {
        const back = Math.floor((now - e.t) / 60000)
        if (back >= 0 && back < minutes) out[minutes - 1 - back] += 1
    }
    return out
}
