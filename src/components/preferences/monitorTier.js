// What a tier row means, in plain words. One reading shared by the Needs-you list,
// the vital strip, the drawer and the activity feed.

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
    // 429: the tier answered and asked us to check less often — it is up, our probe is limited (not an outage)
    if (row.status === 429) return { tone: 'warning', note: 'limits our checks (429)', quiet: true }
    if (!isHealthy(row)) return { tone: 'danger', note: `not answering${row.status ? ` (${row.status})` : ''}` }
    if (typeof row.behindDev === 'number' && row.behindDev > 0) {
        return { tone: 'warning', note: `${row.behindDev} behind dev` }
    }
    // both commits known and different, and no git count to say how far: not on dev's commit (any tier)
    if (devCommit && row.commit && row.commit !== devCommit) {
        return { tone: 'warning', note: 'not on dev’s commit' }
    }
    // No commit known. A local tree has no release manifest: that is no action for the owner (`quiet`
    // keeps it out of Needs you). A hosted tier with no commit is still an action.
    if (row.id !== 'dev' && !row.commit) {
        const local = row.id.startsWith('local:')
        return { tone: 'warning', note: local ? 'not a release build' : 'commit unknown', quiet: local }
    }
    return { tone: 'success', note: row.id === 'dev' ? 'newest' : 'with dev' }
}
