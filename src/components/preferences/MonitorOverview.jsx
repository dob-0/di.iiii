import { ago } from './monitorFormat.js'

// The strip on top of the Monitor: one card per tier (prod, dev, each local di)
// with commit, age, how far behind dev, health and the spaces it holds.
// Drift (a local that is not on dev's commit, a tier behind dev) turns amber.

export const shortCommit = (commit) => (commit ? String(commit).slice(0, 7) : '—')

const isHealthy = (row) => {
    const s = row.status
    if (typeof s === 'number') return s > 0 && s < 400
    return ['ok', 'up', 'live', 'online', '200'].includes(String(s ?? '').toLowerCase())
}

export const tierLabel = (id) => (id.startsWith('local:') ? `local · ${id.slice(6)}` : id)

// 'down' | 'drift' | 'ok' and the reason in words
export const tierState = (row, devCommit) => {
    if (!isHealthy(row)) return { tone: 'danger', note: `not answering${row.status ? ` (${row.status})` : ''}` }
    if (typeof row.behindDev === 'number' && row.behindDev > 0) {
        return { tone: 'warning', note: `${row.behindDev} behind dev` }
    }
    if (row.id.startsWith('local:') && devCommit && row.commit && row.commit !== devCommit) {
        return { tone: 'warning', note: 'not on dev’s commit' }
    }
    return { tone: 'success', note: row.id === 'dev' ? 'the reference' : 'with dev' }
}

export default function MonitorOverview({ tiers, spaces }) {
    if (!tiers) return null
    if (!tiers.ok) return <div className="monitor-note is-down">Tiers unavailable here{tiers.error ? `: ${tiers.error}` : ''}</div>
    const rows = tiers.rows || []
    if (!rows.length) return <div className="monitor-note">No tiers reported yet.</div>
    const dev = rows.find((r) => r.id === 'dev')
    const counts = {}
    for (const s of spaces?.rows || []) counts[s.tier] = (counts[s.tier] || 0) + 1
    return (
        <div className="monitor-overview" aria-label="Tiers overview">
            {rows.map((row) => {
                const state = tierState(row, dev?.commit)
                return (
                    <div key={row.id} className={`monitor-tier tone-${state.tone}`} data-tier-id={row.id} data-tier-tone={state.tone}>
                        <div className="monitor-name">{tierLabel(row.id)}</div>
                        <div className="monitor-tier-commit">{shortCommit(row.commit)}</div>
                        <div className="monitor-meta">built {row.builtAt ? ago(row.builtAt) : 'n/a'}</div>
                        <div className="monitor-meta">{row.status ?? '—'}{typeof row.ms === 'number' ? ` · ${row.ms} ms` : ''}</div>
                        <div className="monitor-meta">{spaces?.ok === false ? 'spaces n/a' : `${counts[row.id] || 0} space${counts[row.id] === 1 ? '' : 's'}`}</div>
                        <div className="monitor-tier-note">{state.note}</div>
                    </div>
                )
            })}
        </div>
    )
}
