import { useCallback, useState } from 'react'
import { buildDetail } from './monitorDetail.js'

// The ONE drawer of the Monitor. Every card, row, strip item and map item opens it: all fields of the
// item as exact, copyable values, the items it points to, and the raw record in a fold.
// Right side on a wide screen, a sheet from the bottom on a phone (CSS .monitor-drawer).

const RELATED_SHOWN = 6

function CopyValue({ text }) {
    const [done, setDone] = useState(false)
    const copy = useCallback(async () => {
        try {
            await navigator.clipboard.writeText(String(text))
            setDone(true)
            setTimeout(() => setDone(false), 1200)
        } catch { /* clipboard blocked: the value is still on screen to select */ }
    }, [text])
    return <button type="button" className="monitor-copy" aria-label="Copy value" onClick={copy}>{done ? 'copied' : 'copy'}</button>
}

export default function MonitorDetail({ kind, row, title, snap, idOf, onOpen, onClose }) {
    const detail = row ? buildDetail(kind, row, snap, idOf) : null
    const [all, setAll] = useState(false)
    const related = detail ? (all ? detail.related : detail.related.slice(0, RELATED_SHOWN)) : []
    return (
        <aside className="monitor-inspector monitor-drawer" aria-label="Details" data-drawer-kind={kind}>
            <div className="monitor-drawer-head">
                <div>
                    <div className="monitor-drawer-kind">{detail?.kindLabel || 'Item'}</div>
                    <div className="preferences-stage-sidebar-title monitor-drawer-title">{title}</div>
                </div>
                <button type="button" className="preferences-inline-action monitor-drawer-close" aria-label="Close details" onClick={onClose}>×</button>
            </div>
            {!detail ? <div className="preferences-empty">That one is not in the latest data. It may have gone away.</div> : (
                <>
                    <dl className="monitor-fields" data-detail-fields={detail.fields.length}>
                        {detail.fields.map((f, i) => (
                            <div key={`${f.label}-${i}`} className="monitor-field">
                                <dt>{f.label}</dt>
                                <dd className={f.empty ? 'is-empty' : ''}>
                                    <span className="monitor-field-value">{f.text}</span>
                                    {f.age ? <span className="monitor-field-age">{f.age}</span> : null}
                                    {f.empty ? null : <CopyValue text={f.text} />}
                                </dd>
                            </div>
                        ))}
                    </dl>
                    {detail.related.length ? (
                        <div className="monitor-related" data-detail-related="">
                            <div className="monitor-drawer-kind">Related</div>
                            {related.map((r, i) => (
                                <button key={`${r.kind}-${r.id}-${i}`} type="button" className="monitor-related-item" data-related={`${r.kind}:${r.id}`} onClick={() => onOpen(r.kind, r.id)}>
                                    <span className="monitor-related-label">{r.label}</span>
                                    <span className="monitor-related-text">{r.text}</span>
                                </button>
                            ))}
                            {detail.related.length > RELATED_SHOWN ? (
                                <button type="button" className="preferences-inline-action" aria-expanded={all} onClick={() => setAll((v) => !v)}>{all ? 'Show fewer' : `Show all ${detail.related.length}`}</button>
                            ) : null}
                        </div>
                    ) : null}
                    {row.url && /^https:\/\//.test(row.url) && kind === 'pr' ? <a className="preferences-inline-action" href={row.url} target="_blank" rel="noreferrer">Open on GitHub</a> : null}
                    <details className="monitor-raw">
                        <summary>Raw record</summary>
                        <div className="monitor-raw-bar"><CopyValue text={detail.raw} /></div>
                        <pre className="monitor-pre" data-detail-raw="">{detail.raw}</pre>
                    </details>
                </>
            )}
        </aside>
    )
}
