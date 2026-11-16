import { ago } from './monitorFormat.js'

// Activity: what changed since the page opened (live, newest on top), and below it "earlier" items
// the snapshot itself dates (monitorCalm.seedActivity), so the column is never an empty box.
export default function MonitorActivity({ feed, earlier }) {
    return (
        <aside className="monitor-activity" data-box="activity" aria-label="Activity">
            <div className="monitor-group-title">Activity <span className="preferences-tree-tag">{feed.length}</span></div>
            <ol className="monitor-events" data-activity="live">
                {feed.map((e) => (
                    <li key={e.id} className={`monitor-event tone-${e.tone}`} data-event-key={e.key}>
                        <span className="monitor-event-text">{e.text}</span>
                        <span className="monitor-meta">{ago(new Date(e.at).toISOString())}</span>
                    </li>
                ))}
            </ol>
            {!feed.length ? <div className="monitor-note">Nothing new since you opened this page.</div> : null}
            {earlier.length ? <div className="monitor-group-title">Earlier</div> : null}
            <ol className="monitor-events is-earlier" data-activity="earlier">
                {earlier.map((e) => (
                    <li key={e.key} className={`monitor-event tone-${e.tone}`} data-earlier-key={e.key}>
                        <span className="monitor-event-text">{e.text}</span>
                        <span className="monitor-meta">{ago(new Date(e.at).toISOString())}</span>
                    </li>
                ))}
            </ol>
        </aside>
    )
}
