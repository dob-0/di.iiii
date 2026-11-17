import { useCallback, useEffect, useState } from 'react'
import { getMonitorPrs } from '../../services/apiClient.js'
import { timeAgo } from './monitorFormat.js'

const REFRESH_MS = 60 * 1000

/**
 * Open pull requests, read-only. Merging is not here: it stays the owner's Enter in the
 * merge window, with proof. This list only tells what is waiting, so no GitHub tab is needed.
 */
export default function MonitorPrs({ fetcher = getMonitorPrs, refreshMs = REFRESH_MS }) {
    const [state, setState] = useState({ loading: true, data: null, error: '' })
    const load = useCallback(async () => {
        try {
            const data = await fetcher()
            setState({ loading: false, data, error: '' })
        } catch (error) {
            setState((prev) => ({ loading: false, data: prev.data, error: error?.message || 'Could not load pull requests' }))
        }
    }, [fetcher])
    useEffect(() => {
        load()
        const timer = setInterval(load, refreshMs)
        return () => clearInterval(timer)
    }, [load, refreshMs])

    const { loading, data, error } = state
    if (loading) return <div className="monitor-note">Loading pull requests…</div>
    if (error && !data) return <div className="monitor-note is-down">Unavailable here: {error}</div>
    if (data && data.ok === false) return <div className="monitor-note is-down">{data.message || 'Pull requests are not available.'}</div>
    const prs = data?.prs || []
    if (!prs.length) return <div className="monitor-note">No open pull requests.</div>
    return (
        <div className="monitor-grid" data-panel="prs">
            {prs.map((pr) => (
                <a key={pr.number} className={`monitor-row${pr.draft ? ' tone-muted' : ''}`} href={pr.url} target="_blank" rel="noreferrer" data-pr={pr.number}>
                    <span className="monitor-name">#{pr.number} {pr.title}</span>
                    <span className="monitor-meta">{pr.draft ? 'draft · ' : ''}{pr.branch} → {pr.base} · {pr.author} · {timeAgo(pr.updatedAt)}</span>
                </a>
            ))}
        </div>
    )
}
