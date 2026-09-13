import { useCallback, useEffect, useState } from 'react'
import { getAppVisitors, setAppVisitorBlocked } from '../../services/appVisitorsApi.js'
import { MetricCard, ModuleSection } from './PreferencesShared.jsx'

// The guest book (Ops Graph → Visitors): the programs that reached di.iiii — AI
// agents, crawlers, apps that identified themselves, and anonymous scripts — with
// a block toggle per name. Built only from the canonical preferences-* pieces,
// laid out like the Open Call section. What is and is not stored is written in
// serverXR/src/appVisitorStore.js; the door sign programs are pointed at is /for-apps.

// Display order and the word a person reads for each stored kind.
export const KIND_LABELS = {
    app: 'identified app',
    crawler: 'crawler / AI',
    anonymous: 'anonymous program',
    browser: 'browsers'
}
const KIND_FILTERS = ['app', 'crawler', 'anonymous']
const KIND_TONES = { app: ' success', crawler: '', anonymous: ' warning', browser: ' muted' }

const formatWhen = (timestamp) => (timestamp ? new Date(timestamp).toLocaleString() : null)

// A contact is whatever the caller wrote into its own User-Agent. It becomes a
// link only when it is plainly an http(s) URL or an email address; anything
// else stays text, so a hostile string can never become a javascript: link.
export const contactHref = (contact) => {
    const value = String(contact || '')
    if (/^https?:\/\/[^\s]+$/i.test(value)) return value
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return `mailto:${value}`
    return null
}

function VisitorRow({ entry, busy, onToggleBlock }) {
    const href = contactHref(entry.contact)
    const isProgram = entry.kind !== 'browser' && entry.agent !== '(other)'
    return (
        <div className="preferences-space-row">
            <div className="preferences-space-top">
                <span className="preferences-link-label mono">{entry.agent}</span>
                <div className="preferences-space-flags">
                    {entry.kind && (
                        <span className={`preferences-badge${KIND_TONES[entry.kind] || ''}`}>{KIND_LABELS[entry.kind] || entry.kind}</span>
                    )}
                    {entry.blocked && <span className="preferences-badge warning">blocked</span>}
                    {isProgram && (
                        <button
                            type="button"
                            className={`preferences-inline-action${entry.blocked ? '' : ' warning'}`}
                            disabled={busy}
                            onClick={() => onToggleBlock(entry)}
                        >
                            {entry.blocked ? 'Unblock' : 'Block'}
                        </button>
                    )}
                </div>
            </div>
            <div className="preferences-space-meta mono">
                {[
                    `${entry.today} today`,
                    `${entry.week} in 7 days`,
                    entry.firstSeen ? `first ${formatWhen(entry.firstSeen)}` : null,
                    entry.lastSeen ? `last ${formatWhen(entry.lastSeen)}` : null
                ].filter(Boolean).join(' · ')}
            </div>
            {entry.contact && (
                <div className="preferences-space-meta mono">
                    contact:{' '}
                    {href
                        ? <a className="preferences-link-value" href={href} target="_blank" rel="noopener noreferrer">{entry.contact}</a>
                        : <span className="preferences-link-value">{entry.contact}</span>}
                </div>
            )}
        </div>
    )
}

export default function AppVisitorsSection() {
    const [data, setData] = useState(null) // null = loading
    const [filter, setFilter] = useState('')
    const [error, setError] = useState('')
    const [busyAgent, setBusyAgent] = useState(null)

    const load = useCallback(async () => {
        try {
            setData(await getAppVisitors())
            setError('')
        } catch (e) {
            setData({ enabled: true, agents: [], totals: {} })
            setError(e.message || 'Failed to load the guest book (admin sign-in required).')
        }
    }, [])

    useEffect(() => { load() }, [load])

    const toggleBlock = async (entry) => {
        const next = !entry.blocked
        if (next && !window.confirm(`Block "${entry.agent}"? Every request it makes will get a 403 pointing to /for-apps. Signed-in accounts are never affected.`)) return
        setBusyAgent(entry.agent); setError('')
        try {
            await setAppVisitorBlocked(entry.agent, next)
            setData((prev) => prev ? {
                ...prev,
                agents: prev.agents.map((a) => (a.agent === entry.agent ? { ...a, blocked: next } : a))
            } : prev)
        } catch (e) {
            setError(e.message || 'Could not change the block.')
        } finally {
            setBusyAgent(null)
        }
    }

    const agents = data?.agents || []
    const totals = data?.totals || {}
    const programs = agents.filter((a) => a.kind !== 'browser')
    const visible = programs.filter((a) => !filter || a.kind === filter || (filter === 'blocked' && a.blocked))
    const browserRow = agents.find((a) => a.kind === 'browser')

    const subtitle = data === null
        ? 'Loading…'
        : data.enabled === false
            ? 'Not kept on this install'
            : `${programs.length} program${programs.length === 1 ? '' : 's'} in the last ${data.retentionDays || 90} days`

    return (
        <ModuleSection
            title="Visitors"
            subtitle={subtitle}
            actions={
                <button type="button" className="toggle-button" onClick={load} disabled={data === null}>
                    Refresh
                </button>
            }
        >
            {data?.enabled === false ? (
                <div className="preferences-empty">
                    A local install keeps no guest book — everyone reaching it is you. On a hosted
                    di.iiii this lists the apps, crawlers and scripts that called, and lets you block one.
                </div>
            ) : (
                <>
                    <div className="preferences-status-grid">
                        <MetricCard label="Apps · 7 days" value={totals.app?.week || 0} tone={totals.app?.week ? 'success' : 'default'} />
                        <MetricCard label="Crawlers · 7 days" value={totals.crawler?.week || 0} tone={totals.crawler?.week ? 'accent' : 'default'} />
                        <MetricCard label="Anonymous · 7 days" value={totals.anonymous?.week || 0} tone={totals.anonymous?.week ? 'warning' : 'default'} />
                        <MetricCard label="Browsers · today" value={browserRow?.today || 0} />
                    </div>
                    <div className="preferences-tree-note">
                        Counts per day and program name only — no addresses, no pages, no people.
                        A name is what the program says it is and can be faked; the per-address
                        limits are what actually hold. Programs are asked to identify at /for-apps.
                    </div>
                    <div className="preferences-command-grid">
                        <button type="button" className={`toggle-button${filter === '' ? ' active' : ''}`} onClick={() => setFilter('')}>
                            All
                        </button>
                        {KIND_FILTERS.map((kind) => (
                            <button
                                key={kind}
                                type="button"
                                className={`toggle-button${filter === kind ? ' active' : ''}`}
                                onClick={() => setFilter(kind)}
                            >
                                {KIND_LABELS[kind]}
                            </button>
                        ))}
                        <button type="button" className={`toggle-button${filter === 'blocked' ? ' active' : ''}`} onClick={() => setFilter('blocked')}>
                            blocked
                        </button>
                    </div>
                    <div className="preferences-space-list">
                        {visible.map((entry) => (
                            <VisitorRow
                                key={`${entry.kind || 'blocked'}:${entry.agent}`}
                                entry={entry}
                                busy={busyAgent === entry.agent}
                                onToggleBlock={toggleBlock}
                            />
                        ))}
                        {data !== null && visible.length === 0 && !error && (
                            <div className="preferences-space-row"><div className="preferences-empty">No programs have called yet.</div></div>
                        )}
                    </div>
                </>
            )}
            {error && <div className="preferences-empty">{error}</div>}
        </ModuleSection>
    )
}
