import { useCallback, useEffect, useState } from 'react'
import { deleteOpenCallApplication, listOpenCallApplications, updateOpenCallApplication } from '../../services/openCallApi.js'
import { MetricCard, ModuleSection } from './PreferencesShared.jsx'

const OPEN_CALLS = [
    { id: 'beyond_form', label: 'Beyond Form — Gyumri Art Week' }
]

const STATUSES = ['new', 'shortlist', 'accepted', 'declined']
const BADGE_TONES = { new: '', shortlist: ' warning', accepted: ' success', declined: ' muted' }

// payload keys the beyond_form form submits, in review-friendly order
const PAYLOAD_LABELS = [
    ['dob', 'Date of birth'],
    ['about', 'About'],
    ['why', 'Why participate'],
    ['theme', 'On the theme'],
    ['idea', 'Idea'],
    ['experience', 'Experience'],
    ['portfolio', 'Portfolio'],
    ['expect', 'Expectations'],
    ['days', 'All three days'],
    ['laptop', 'Laptop']
]

// CSV formula injection: a spreadsheet app treats a cell starting with
// =/+/-/@ (or tab/CR, which can smuggle a leading one past casual review)
// as a formula, not text — a public submission field opened straight into
// Excel/Sheets could run attacker-controlled logic. Prefixing with a
// leading apostrophe is the standard mitigation; spreadsheet apps render
// it as plain text and drop the mark, csvEscape's own quoting handles the
// rest for text apps.
const FORMULA_INJECTION_PREFIX = /^[=+\-@\t\r]/
const csvEscape = (value) => {
    let text = String(value ?? '')
    if (FORMULA_INJECTION_PREFIX.test(text)) text = `'${text}`
    return `"${text.replace(/"/g, '""')}"`
}

export const buildCsv = (applications) => {
    const payloadKeys = PAYLOAD_LABELS.map(([key]) => key)
    const header = ['id', 'created', 'status', 'name', 'email', 'phone', 'city', ...payloadKeys, 'notes']
    const rows = applications.map((app) => [
        app.id,
        new Date(app.createdAt).toISOString(),
        app.status,
        app.name,
        app.email,
        app.phone,
        app.city,
        ...payloadKeys.map((key) => Array.isArray(app.payload?.[key]) ? app.payload[key].join('; ') : app.payload?.[key] ?? ''),
        app.notes
    ].map(csvEscape).join(','))
    return [header.map(csvEscape).join(','), ...rows].join('\n')
}

function ApplicationRow({ app, busy, onSetStatus, onSaveNotes, onDelete }) {
    const [open, setOpen] = useState(false)
    const [notesDraft, setNotesDraft] = useState(app.notes)

    return (
        <div className="preferences-space-row">
            <div className="preferences-space-top">
                <button
                    type="button"
                    className="preferences-inline-action"
                    onClick={() => setOpen((v) => !v)}
                >
                    {open ? '▾' : '▸'} {app.name}
                </button>
                <div className="preferences-space-flags">
                    <span className={`preferences-badge${BADGE_TONES[app.status] || ''}`}>{app.status}</span>
                    {STATUSES.filter((s) => s !== app.status).map((s) => (
                        <button
                            key={s}
                            type="button"
                            className="preferences-inline-action"
                            disabled={busy}
                            onClick={() => onSetStatus(app, s)}
                        >
                            → {s}
                        </button>
                    ))}
                    <button
                        type="button"
                        className="preferences-inline-action warning"
                        disabled={busy}
                        onClick={() => onDelete(app)}
                    >
                        Delete
                    </button>
                </div>
            </div>
            <div className="preferences-space-meta mono">
                {[app.email, app.phone, app.city, new Date(app.createdAt).toLocaleString()].filter(Boolean).join(' · ')}
            </div>
            {open && (
                <div className="preferences-space-meta">
                    {PAYLOAD_LABELS.map(([key, label]) => {
                        const value = app.payload?.[key]
                        const text = Array.isArray(value) ? value.join(', ') : value
                        if (!text) return null
                        return (
                            <div key={key} style={{ marginBottom: '0.4rem' }}>
                                <strong>{label}:</strong> {text}
                            </div>
                        )
                    })}
                    <div className="preferences-inline-form">
                        <input
                            className="preferences-input"
                            placeholder="Review notes"
                            value={notesDraft}
                            onChange={(e) => setNotesDraft(e.target.value)}
                        />
                        <button
                            type="button"
                            className="toggle-button"
                            disabled={busy || notesDraft === app.notes}
                            onClick={() => onSaveNotes(app, notesDraft)}
                        >
                            Save notes
                        </button>
                    </div>
                </div>
            )}
        </div>
    )
}

export default function OpenCallSection() {
    const [callId] = useState(OPEN_CALLS[0].id)
    const [applications, setApplications] = useState(null) // null = loading
    const [filter, setFilter] = useState('')
    const [error, setError] = useState('')
    const [busyId, setBusyId] = useState(null)

    const load = useCallback(async () => {
        try {
            setApplications(await listOpenCallApplications(callId))
            setError('')
        } catch (e) {
            setApplications([])
            setError(e.message || 'Failed to load applications (admin sign-in required).')
        }
    }, [callId])

    useEffect(() => { load() }, [load])

    const patch = async (app, patchBody) => {
        setBusyId(app.id); setError('')
        try {
            const updated = await updateOpenCallApplication(callId, app.id, patchBody)
            setApplications((prev) => prev ? prev.map((a) => (a.id === app.id ? { ...a, ...updated } : a)) : prev)
        } catch (e) {
            setError(e.message || 'Update failed.')
        } finally {
            setBusyId(null)
        }
    }

    const remove = async (app) => {
        if (!window.confirm(`Delete application from "${app.name}" (${app.email})? This cannot be undone.`)) return
        setBusyId(app.id); setError('')
        try {
            await deleteOpenCallApplication(callId, app.id)
            setApplications((prev) => prev ? prev.filter((a) => a.id !== app.id) : prev)
        } catch (e) {
            setError(e.message || 'Delete failed.')
        } finally {
            setBusyId(null)
        }
    }

    const exportCsv = () => {
        const blob = new Blob([buildCsv(applications || [])], { type: 'text/csv;charset=utf-8' })
        const link = document.createElement('a')
        link.href = URL.createObjectURL(blob)
        link.download = `${callId}-applications.csv`
        link.click()
        URL.revokeObjectURL(link.href)
    }

    const visible = (applications || []).filter((a) => !filter || a.status === filter)
    const counts = STATUSES.reduce((acc, s) => ({ ...acc, [s]: (applications || []).filter((a) => a.status === s).length }), {})
    const call = OPEN_CALLS.find((c) => c.id === callId)

    return (
        <ModuleSection
            title={call?.label || callId}
            subtitle={applications === null ? 'Loading…' : `${applications.length} application${applications.length === 1 ? '' : 's'}`}
            actions={
                <button type="button" className="toggle-button" onClick={exportCsv} disabled={!applications?.length}>
                    Export CSV
                </button>
            }
        >
            <div className="preferences-status-grid">
                <MetricCard label="New" value={counts.new || 0} tone={counts.new ? 'accent' : 'default'} />
                <MetricCard label="Shortlist" value={counts.shortlist || 0} tone="warning" />
                <MetricCard label="Accepted" value={counts.accepted || 0} tone="success" />
                <MetricCard label="Declined" value={counts.declined || 0} />
            </div>
            <div className="preferences-command-grid">
                <button type="button" className={`toggle-button${filter === '' ? ' active' : ''}`} onClick={() => setFilter('')}>
                    All
                </button>
                {STATUSES.map((s) => (
                    <button
                        key={s}
                        type="button"
                        className={`toggle-button${filter === s ? ' active' : ''}`}
                        onClick={() => setFilter(s)}
                    >
                        {s}
                    </button>
                ))}
            </div>
            <div className="preferences-space-list">
                {visible.map((app) => (
                    <ApplicationRow
                        key={app.id}
                        app={app}
                        busy={busyId === app.id}
                        onSetStatus={(a, status) => patch(a, { status })}
                        onSaveNotes={(a, notes) => patch(a, { notes })}
                        onDelete={remove}
                    />
                ))}
                {applications !== null && visible.length === 0 && !error && (
                    <div className="preferences-space-row"><div className="preferences-empty">No applications yet.</div></div>
                )}
            </div>
            {error && <div className="preferences-empty">{error}</div>}
        </ModuleSection>
    )
}
