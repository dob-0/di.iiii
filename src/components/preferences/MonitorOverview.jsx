import { ago } from './monitorFormat.js'
import { chatIssues } from './MonitorChats.jsx'

// The strip on top of the Monitor: one tile per tier (prod, dev, each local di)
// with commit, age, how far behind dev, health and the spaces it holds.
// Drift (a local that is not on dev's commit, a tier behind dev) turns amber.

export const shortCommit = (commit) => (commit ? String(commit).slice(0, 7) : '—')

const isHealthy = (row) => {
    // a machine that only reports was never probed: its freshness is its health
    if (row.source === 'report') return row.state !== 'warn' && row.state !== 'off'
    const s = row.status
    // Same rule as the server's isUp (monitorHub.js): only a 2xx answer is up; a redirect is not.
    if (typeof s === 'number') return s >= 200 && s < 300
    return ['ok', 'up', 'live', 'online', '200'].includes(String(s ?? '').toLowerCase())
}

export const tierLabel = (id) => (id.startsWith('local:') ? `local · ${id.slice(6)}` : id)

// 'down' | 'drift' | 'ok' and the reason in words
export const tierState = (row, devCommit) => {
    if (!isHealthy(row)) return { tone: 'danger', note: `not answering${row.status ? ` (${row.status})` : ''}` }
    // a slow answer is slow, not down; one missed check keeps the last good answer and says so
    if (row.probe === 'slow' && row.note) return { tone: 'warning', note: row.note }
    if (typeof row.behindDev === 'number' && row.behindDev > 0) {
        return { tone: 'warning', note: `${row.behindDev} behind dev` }
    }
    // both commits known and different, and no git count to say how far: not on dev's commit (any tier)
    if (devCommit && row.commit && row.commit !== devCommit) {
        return { tone: 'warning', note: 'not on dev’s commit' }
    }
    // No commit known (a local build without a release manifest): say so, never claim it is with dev.
    // A local tree has no release manifest, so this is no action for the owner: `quiet` keeps it out of the status line.
    if (row.id !== 'dev' && !row.commit) return { tone: 'warning', note: 'commit unknown', quiet: row.id.startsWith('local:') }
    return { tone: 'success', note: row.id === 'dev' ? 'the reference' : 'with dev' }
}

// The one answer on top: "All well", or what needs him, worst first.
export const heroState = (snap) => {
    const issues = []
    const rows = snap?.tiers?.rows || []
    const dev = rows.find((r) => r.id === 'dev')
    for (const row of rows) {
        const state = tierState(row, dev?.commit)
        if (state.tone === 'success' || state.quiet) continue
        const name = tierLabel(row.id).replace('local · ', 'local ')
        const text = state.tone === 'danger' || /^\d+ behind/.test(state.note) ? `${name} is ${state.note}` : `${name}: ${state.note}`
        issues.push({ tone: state.tone, text, tier: row.id })
    }
    const failed = snap?.panels?.services?.failed || 0
    if (failed) issues.push({ tone: 'danger', text: `${failed} service${failed === 1 ? '' : 's'} failed`, tier: null })
    issues.push(...chatIssues(snap?.chats))
    issues.sort((a, b) => (a.tone === 'danger' ? 0 : 1) - (b.tone === 'danger' ? 0 : 1))
    if (!issues.length) return { tone: 'success', headline: 'All well', issues }
    const tone = issues.some((i) => i.tone === 'danger') ? 'danger' : 'warning'
    const lead = issues[0].text
    // a lone problem is its own sentence; several are counted, the worst one named
    // a row can stand for several things ("3 more chats ask you")
    const total = issues.reduce((n, i) => n + (i.count || 1), 0)
    const headline = issues.length === 1 && issues[0].tone === 'danger' && !/^\d/.test(lead)
        ? lead
        : `${total} thing${total === 1 ? '' : 's'} need${total === 1 ? 's' : ''} you: ${lead}`
    return { tone, headline, issues }
}

export function Sparkline({ values }) {
    const v = (values || []).filter((n) => typeof n === 'number')
    if (v.length < 2) return <div className="monitor-spark is-empty" aria-hidden="true">collecting…</div>
    const max = Math.max(...v, 1)
    const W = 120
    const H = 28
    const pts = v.map((n, i) => `${((i / (v.length - 1)) * W).toFixed(1)},${(H - 2 - (n / max) * (H - 4)).toFixed(1)}`).join(' ')
    return (
        <svg className="monitor-spark" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label={`response time, last ${v.length} samples, now ${v[v.length - 1]} ms`}>
            <polyline points={pts} fill="none" stroke="currentColor" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
        </svg>
    )
}

export default function MonitorOverview({ tiers, spaces, history, flashing, selectedId, onPick }) {
    if (!tiers) return null
    const rows = tiers.rows || []
    // `ok` only says dev AND prod both answered: with prod down the rows are still the news
    if (!rows.length && tiers.ok === false) return <div className="monitor-note is-down">Tiers unavailable here{tiers.error ? `: ${tiers.error}` : ''}</div>
    if (!rows.length) return <div className="monitor-note">No tiers reported yet.</div>
    const dev = rows.find((r) => r.id === 'dev')
    const counts = {}
    for (const s of spaces?.rows || []) counts[s.tier] = (counts[s.tier] || 0) + 1
    return (
        <div className="monitor-overview" aria-label="Tiers overview">
            {rows.map((row) => {
                const state = tierState(row, dev?.commit)
                const cls = ['monitor-tier', `tone-${state.tone}`, flashing?.has(`t:${row.id}`) ? 'is-changed' : '', selectedId === row.id ? 'is-selected' : ''].filter(Boolean).join(' ')
                return (
                    <button key={row.id} type="button" className={cls} data-tier-id={row.id} data-tier-tone={state.tone}
                        aria-pressed={selectedId === row.id} onClick={() => onPick?.(row)}>
                        <span className="monitor-tier-name">{tierLabel(row.id)}</span>
                        <span className="monitor-tier-commit">{shortCommit(row.commit)}</span>
                        <span className="monitor-tier-note">{state.note}</span>
                        <Sparkline values={history?.[row.id]} />
                        <span className="monitor-meta">built {row.builtAt ? ago(row.builtAt) : 'n/a'}</span>
                        <span className="monitor-meta">{row.probe === 'doubt' ? `one check missed · last answered ${ago(row.lastGoodAt)}` : `${row.status ?? '—'}${typeof row.ms === 'number' ? ` · ${row.ms} ms` : ''}${row.probe === 'down' && row.lastGoodAt ? ` · last answered ${ago(row.lastGoodAt)}` : ''}`}</span>
                        <span className="monitor-meta">{spaces?.ok === false ? 'spaces n/a' : `${counts[row.id] || 0} ${row.source === 'self' ? '' : 'public '}space${counts[row.id] === 1 ? '' : 's'}`}</span>
                    </button>
                )
            })}
        </div>
    )
}

// Big buttons: the number, and one square per thing so 4/11 is seen, not read.
const MAX_DOTS = 48
export function CountTiles({ tiles, flashing, onPick }) {
    return (
        <div className="monitor-counts" aria-label="Counts">
            {tiles.map((t) => (
                <button key={t.id} type="button" className={`monitor-count tone-${t.tone}${flashing?.has(`k:${t.id}`) ? ' is-changed' : ''}`}
                    data-count-id={t.id} onClick={() => onPick?.(t)}>
                    <span className="monitor-count-value">{t.value}</span>
                    <span className="monitor-count-label">{t.label}</span>
                    <span className="monitor-dots" aria-hidden="true">
                        {(t.dots || []).slice(0, MAX_DOTS).map((d, i) => <i key={i} className={`monitor-dot tone-${d.tone}`} title={d.title} />)}
                    </span>
                </button>
            ))}
        </div>
    )
}
