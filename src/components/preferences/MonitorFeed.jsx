import { useMemo, useState } from 'react'
import { feedSize, feedSubtitle, readFeed } from './monitorFeedText.js'

// One feed of the Tasks and shows box, drawn as di rows (not a raw text dump): a head with its title, machine and age,
// the summary line, then sections of rows with a state edge, or a table. Long feeds show the first FEED_FIRST rows
// and a "Show all N" button; the filter on the page narrows the rows it matches.

export const FEED_FIRST = 6

const matchItem = (query, it) => !query || `${it.lead} ${it.title} ${it.detail}`.toLowerCase().includes(query.toLowerCase())

export default function MonitorFeed({ row, kind, query = '', ago }) {
    const [open, setOpen] = useState(false)
    const feed = useMemo(() => readFeed(row.lines), [row.lines])
    const total = feedSize(feed)
    const sub = [feedSubtitle(feed.title, row.title), feed.summary].filter(Boolean).join(' · ')
    let left = open ? Infinity : FEED_FIRST
    const sections = feed.sections
        .map((s) => ({ ...s, items: s.items.filter((it) => matchItem(query, it)) }))
        .filter((s) => s.items.length)
        .map((s) => { const items = s.items.slice(0, Math.max(0, left)); left -= items.length; return { ...s, items } })
        .filter((s) => s.items.length)
    const tableRows = feed.table ? feed.table.rows.filter((r) => !query || r.join(' ').toLowerCase().includes(query.toLowerCase())) : []
    const shownTable = open ? tableRows : tableRows.slice(0, FEED_FIRST)
    const shown = feed.table ? shownTable.length : sections.reduce((n, s) => n + s.items.length, 0)
    const matching = feed.table ? tableRows.length : feed.sections.reduce((n, s) => n + s.items.filter((it) => matchItem(query, it)).length, 0)

    return (
        <article className={`monitor-feed${row.ok ? '' : ' is-down'}`} data-feed={row.id}>
            <header className="monitor-feed-head">
                <span className="monitor-feed-title">{row.title}</span>
                <span className="monitor-feed-count" data-feed-count>{total}</span>
                <span className="monitor-feed-meta">
                    {kind}{row.machine ? <span data-feed-machine={row.machine}> · from {row.machine}</span> : null}{row.updatedAt && ago ? ` · ${ago(row.updatedAt)}` : ''}
                </span>
            </header>
            {!row.ok ? <div className="monitor-note is-down">Unavailable here: {row.error}</div> : null}
            {row.ok && sub ? <div className="monitor-feed-summary">{sub}</div> : null}
            {row.ok && feed.table ? (
                <div className="monitor-feed-table-wrap">
                    <table className="monitor-feed-table">
                        <thead><tr>{feed.table.columns.map((c) => <th key={c} scope="col">{c}</th>)}</tr></thead>
                        <tbody>{shownTable.map((r, i) => <tr key={`${r[0]}-${i}`}>{r.map((c, j) => <td key={j} title={c}>{c}</td>)}</tr>)}</tbody>
                    </table>
                    {(feed.table.notes || []).map((n, i) => <div key={i} className="monitor-feed-summary" data-feed-note>{n}</div>)}
                </div>
            ) : null}
            {row.ok ? sections.map((s, si) => (
                <section key={`${s.title}-${si}`} className="monitor-feed-section">
                    {s.title ? <h4 className="monitor-feed-section-title">{s.title}</h4> : null}
                    <ul className="monitor-feed-items">
                        {s.items.map((it, i) => (
                            <li key={i} className={`monitor-feed-item tone-${it.tone || 'muted'}`} data-feed-item>
                                {it.mark ? <span className="monitor-feed-mark" data-feed-mark>{it.mark}</span> : null}
                                <span className="monitor-feed-item-title">{it.title}</span>
                                {it.detail || it.lead ? <span className="monitor-feed-item-detail">{[it.lead, it.detail].filter(Boolean).join(' · ')}</span> : null}
                            </li>
                        ))}
                    </ul>
                </section>
            )) : null}
            {row.ok && !total ? <div className="monitor-note">Nothing in this feed.</div> : null}
            {row.ok && total && query && !matching ? <div className="monitor-note">Nothing here matches the filter.</div> : null}
            {row.ok && matching > FEED_FIRST ? (
                <button type="button" className="monitor-feed-more" data-feed-more aria-expanded={open} onClick={() => setOpen((v) => !v)}>
                    {open ? 'Show fewer' : `Show all ${matching}`}{open ? '' : ` · ${matching - shown} more`}
                </button>
            ) : null}
        </article>
    )
}
