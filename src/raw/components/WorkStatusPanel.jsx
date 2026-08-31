import { useEffect, useRef, useState } from 'react'
import { fetchWorkStatus } from '../../services/workApi.js'

const POLL_INTERVAL_MS = 10000

function summarize(data) {
    if (!data) return ''
    const running = (data.sessions || []).length
    const dirty = (data.worktrees || []).filter((tree) => (tree.dirtyCount || 0) > 0).length
    const openPrs = Array.isArray(data.prs) ? data.prs.length : 0
    return `${running} sessions · ${dirty} dirty trees · ${openPrs} open PRs`
}

export default function WorkStatusPanel({ node, onValuesChange }) {
    const [data, setData] = useState(null)
    const [error, setError] = useState(null)
    const timerRef = useRef(null)

    useEffect(() => {
        let cancelled = false
        const poll = async () => {
            try {
                const result = await fetchWorkStatus()
                if (cancelled) return
                setData(result)
                setError(null)
            } catch (err) {
                if (cancelled) return
                setError(err)
            }
        }
        poll()
        timerRef.current = setInterval(poll, POLL_INTERVAL_MS)
        return () => {
            cancelled = true
            clearInterval(timerRef.current)
        }
    }, [])

    useEffect(() => {
        if (!data) return
        const dirty = (data.worktrees || []).some((tree) => (tree.dirtyCount || 0) > 0)
        const openPrs = Array.isArray(data.prs) ? data.prs.length : 0
        onValuesChange?.(node.id, 'running', (data.sessions || []).length)
        onValuesChange?.(node.id, 'dirty', dirty)
        onValuesChange?.(node.id, 'openPrs', openPrs)
        onValuesChange?.(node.id, 'summary', summarize(data))
    }, [data, node.id, onValuesChange])

    useEffect(() => () => {
        onValuesChange?.(node.id, 'running', null)
        onValuesChange?.(node.id, 'dirty', null)
        onValuesChange?.(node.id, 'openPrs', null)
        onValuesChange?.(node.id, 'summary', null)
    }, [node.id, onValuesChange])

    if (error) {
        return (
            <div className="raw-work-status-panel raw-work-status-panel-error" role="status">
                {error.status === 404
                    ? 'Not available — this only works on a dev server running on your own machine.'
                    : `Could not reach work status: ${error.message}`}
            </div>
        )
    }

    if (!data) {
        return <div className="raw-work-status-panel raw-work-status-panel-loading" role="status">Loading…</div>
    }

    return (
        <div className="raw-work-status-panel">
            <section className="raw-work-status-section">
                <h4>Sessions</h4>
                {data.sessions.length === 0 && <p className="raw-work-status-empty">None</p>}
                <ul>
                    {data.sessions.map((session) => (
                        <li key={session.id}>{session.id.slice(0, 8)} — {new Date(session.updatedAt).toLocaleTimeString()}</li>
                    ))}
                </ul>
            </section>
            <section className="raw-work-status-section">
                <h4>Worktrees</h4>
                <ul>
                    {(data.worktrees || []).map((tree) => (
                        <li key={tree.path}>
                            <span className="raw-work-status-tree-branch">{tree.branch || '?'}</span>
                            {' '}{tree.path.split('/').pop()}
                            {tree.dirtyCount > 0 && <span className="raw-work-status-dirty"> · {tree.dirtyCount} dirty</span>}
                            {Boolean(tree.ahead) && <span> ↑{tree.ahead}</span>}
                            {Boolean(tree.behind) && <span> ↓{tree.behind}</span>}
                        </li>
                    ))}
                </ul>
            </section>
            <section className="raw-work-status-section">
                <h4>Pull requests</h4>
                {data.prs === null && <p className="raw-work-status-empty">gh unavailable</p>}
                {Array.isArray(data.prs) && data.prs.length === 0 && <p className="raw-work-status-empty">None open</p>}
                <ul>
                    {(data.prs || []).map((pr) => (
                        <li key={pr.number}>#{pr.number} {pr.title}{pr.isDraft ? ' (draft)' : ''}</li>
                    ))}
                </ul>
            </section>
            <section className="raw-work-status-section">
                <h4>Deploys</h4>
                {data.deploys === null && <p className="raw-work-status-empty">gh unavailable</p>}
                <ul>
                    {(data.deploys || []).map((run, index) => (
                        <li key={index}>{run.name} · {run.headBranch} · {run.status}{run.conclusion ? `/${run.conclusion}` : ''}</li>
                    ))}
                </ul>
            </section>
        </div>
    )
}
