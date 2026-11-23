import { tierState } from './MonitorOverview.jsx'

// Versions: what each machine runs against dev, and the past versions of every part. Pure shaping of the
// snapshot (snap.tiers, snap.parts); nothing is invented here: no hash, date or title is made up, a field
// the data does not carry reads "unknown". Past versions come from git at PACK time (scripts/partStamps.mjs),
// "last seen working" from the part's own live probe (serverXR/src/monitorHub.js createProvenStore).

const HASH = /^[0-9a-f]{7,40}$/
export const shortCommit = (c) => (typeof c === 'string' && HASH.test(c) ? c.slice(0, 9) : null)
const sameCommit = (a, b) => Boolean(a && b) && (a.startsWith(b) || b.startsWith(a))
const tierName = (id) => (id.startsWith('local:') ? `local · ${id.slice(6)}` : id)

export const WORKS_TEXT = { working: 'working', 'not working': 'not working', idle: 'not running', unknown: 'unknown' }
export const worksTone = (works) => ({ working: 'success', 'not working': 'danger', idle: 'muted', unknown: 'muted' }[works] || 'muted')

/** One row per machine / tier: the commit it runs and how it stands against dev. */
export function buildMachines(snap) {
    const rows = snap?.tiers?.rows || []
    const dev = rows.find((r) => r.id === 'dev')
    return rows.map((row) => {
        const state = tierState(row, dev?.commit)
        return {
            id: row.id, name: tierName(row.id), commit: row.commit || null, short: shortCommit(row.commit),
            built: typeof row.builtAt === 'string' && row.builtAt ? row.builtAt.slice(0, 10) : null,
            tone: state.tone, note: state.note, behind: typeof row.behindDev === 'number' ? row.behindDev : null
        }
    })
}

/** One card per part: state, the running version, and its past versions newest first with marks. */
export function buildPartVersions(snap) {
    const rows = snap?.parts?.rows || []
    return rows.map((p) => {
        const proven = p.proven && p.proven.commit ? p.proven : null
        const history = (Array.isArray(p.history) ? p.history : []).map((h) => ({
            ...h, short: shortCommit(h.commit),
            running: sameCommit(p.commit, h.commit), proven: sameCommit(proven?.commit, h.commit)
        }))
        return {
            id: p.id, name: p.name, state: p.state, works: p.works || 'unknown', detail: p.detail,
            commit: p.commit || null, short: shortCommit(p.commit), date: p.date || null, history,
            proven,
            // the last working version is older than the history shown here: still named, not dropped
            provenOutside: Boolean(proven && !history.some((h) => h.proven)),
            // running something that was never seen working: say it, a rollback target exists only if one was seen
            unproven: Boolean(p.commit && !(proven && sameCommit(proven.commit, p.commit)))
        }
    })
}

export const filterVersions = (items, query, text) => {
    const q = String(query || '').trim().toLowerCase()
    return q ? items.filter((i) => text(i).toLowerCase().includes(q)) : items
}
