import { useCallback, useEffect, useRef, useState } from 'react'
import { getMonitorPrs } from '../../services/apiClient.js'
import { timeAgo } from './monitorFormat.js'

const REFRESH_MS = 60 * 1000

/**
 * Open pull requests, read-only. Merging is not here: it stays the owner's Enter in the
 * merge window, with proof. This list only tells what is waiting, so no GitHub tab is needed.
 */
export default function MonitorPrs({ fetcher = getMonitorPrs, refreshMs = REFRESH_MS }) {
    const [state, setState] = useState({ loading: true, data: null, error: '' })
    const alive = useRef(true)
    const load = useCallback(async () => {
        try {
            const data = await fetcher()
            if (alive.current) setState({ loading: false, data, error: '' })
        } catch (error) {
            if (alive.current) setState((prev) => ({ loading: false, data: prev.data, error: error?.message || 'Could not load pull requests' }))
        }
    }, [fetcher])
    useEffect(() => {
        alive.current = true
        load()
        const timer = setInterval(load, refreshMs)
        return () => { alive.current = false; clearInterval(timer) }
    }, [load, refreshMs])

    const { loading, data, error } = state
    if (loading) return <div className="monitor-note">Loading pull requests…</div>
    if (error && !data) return <div className="monitor-note is-down">Unavailable here: {error}</div>
    if (data && data.ok === false) return <div className="monitor-note is-down">{data.message || 'Pull requests are not available.'}</div>
    const prs = data?.prs || []
    if (!prs.length) return <div className="monitor-note">No open pull requests.</div>
    return (<>
        {error ? <div className="monitor-note is-down">The last refresh failed ({error}); this list may be out of date.</div> : null}
        {data?.truncated ? <div className="monitor-note">Showing the first {prs.length} open pull requests.</div> : null}
        <div className="monitor-grid" data-panel="prs-github">
            {prs.map((pr) => (
                <a key={pr.number} className={`monitor-row${pr.draft ? ' tone-muted' : ''}`} href={pr.url || undefined} target="_blank" rel="noreferrer" data-pr={pr.number}>
                    <span className="monitor-name">#{pr.number} {pr.title}</span>
                    <span className="monitor-meta">{pr.draft ? 'draft · ' : ''}{pr.branch} → {pr.base} · {pr.author} · {timeAgo(pr.updatedAt)}</span>
                </a>
            ))}
        </div>
    </>)
}
