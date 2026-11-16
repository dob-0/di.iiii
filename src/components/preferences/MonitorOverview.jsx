// The tier reading moved to monitorTier.js; the sparkline of one tier's response times stays here
// and now lives in the drawer. Re-exports keep the old import path working.
export { shortCommit, tierLabel, tierState } from './monitorTier.js'

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
