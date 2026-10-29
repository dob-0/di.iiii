import { useState } from 'react'
import { VISITOR_PARTS } from '../../../shared/visitorChrome.js'
import { ToggleField, CollapsibleSection } from './fields.jsx'

// VIEWS — the project's view buttons as data (src/project/viewport/smartView/viewData.js; decisions of 2026-10-13):
// a LIVE view is a button visitors get, a WORK view is only here. A built-in is hidden (it is computed for every
// room, so it can come back); an added view is removed. `views` comes from useProjectViews (StudioEditor).
export function ViewsSection({ views }) {
    const [name, setName] = useState('')
    if (!views) return null
    const { rows, production } = views
    return (
        <CollapsibleSection title={`Views (${rows.filter((r) => r.live).length} live)`} defaultOpen={false}>
            <p className="insp-label" data-views-scope={production ? 'production' : 'project'}>
                {production
                    ? `Shared by every version of ${production.title} (${production.versions}). Live views are the buttons visitors get; work views stay here.`
                    : 'Live views are the buttons visitors get; work views stay here.'}
            </p>
            {rows.map((row) => (
                <div key={row.id} className="insp-field" data-view-row={row.id} data-live={String(row.live)}>
                    {row.hidden ? (
                        <label className="insp-label">{row.label} · hidden</label>
                    ) : (
                        <ToggleField label={`${row.label} · ${row.live ? 'live' : 'work'}`} checked={row.live} onChange={(v) => views.setLive(row.id, v)} />
                    )}
                    {row.builtIn ? (
                        <button type="button" className="scc-btn scc-btn--xs" onClick={() => views.setHidden(row.id, !row.hidden)}>
                            {row.hidden ? `Show ${row.label}` : `Hide ${row.label}`}
                        </button>
                    ) : (
                        <button type="button" className="scc-btn scc-btn--xs" onClick={() => views.remove(row.id)}>{`Remove ${row.label}`}</button>
                    )}
                </div>
            ))}
            <div className="insp-field">
                <label className="insp-label" htmlFor="studio-new-view-name">New view from this camera</label>
                <input id="studio-new-view-name" className="insp-input" value={name} maxLength={16} placeholder="Name" onChange={(event) => setName(event.target.value)} />
                <button
                    type="button"
                    className="scc-btn"
                    onClick={() => { if (views.onAddCurrent?.(name)) setName('') }}
                >
                    Add this camera
                </button>
            </div>
        </CollapsibleSection>
    )
}

// WHAT VISITORS SEE — the view page's own controls as data (src/shared/visitorChrome.js), closed by default. One switch per
// part; the page still starts every allowed panel closed. Saved with the views: shared by every version of a production.
export function VisitorChromeSection({ views }) {
    if (!views?.chrome) return null
    const { chrome, setChrome, production } = views
    return (
        <CollapsibleSection title="What visitors see" defaultOpen={false}>
            <p className="insp-label" data-chrome-scope={production ? 'production' : 'project'}>
                {production
                    ? `Shared by every version of ${production.title}. Off removes the control from the view page; on, it starts closed and a visitor opens it.`
                    : 'Off removes the control from the view page; on, it starts closed and a visitor opens it. Edit in Studio shows only to someone who can edit.'}
            </p>
            {VISITOR_PARTS.map((part) => (
                <ToggleField key={part.id} label={part.label} checked={chrome[part.id] !== false} onChange={(v) => setChrome({ ...chrome, [part.id]: v })} />
            ))}
        </CollapsibleSection>
    )
}

// LIGHT ENVIRONMENT — each version's air, ambient, exposure, bloom and surfaces side by side (src/shared/lightEnv.js).
// Try draws the live view with that version's environment and writes nothing; Take writes it to this project (one
// history step, Undo restores it). `lightEnv` comes from useLightEnvPicker (StudioEditor).
const hazeText = (s) => (s.haze === null ? 'no haze' : `haze ${s.haze} /m${s.calibrated ? '' : ' (estimate)'}`)
export function LightEnvSection({ lightEnv }) {
    if (!lightEnv || lightEnv.rows.length < 2) return null
    const { rows, tryId } = lightEnv
    return (
        <CollapsibleSection title={`Light environment (${rows.length} versions)`} defaultOpen={false}>
            <p className="insp-label">
                Each version of this space with its light: haze, ambient, exposure, bloom, surfaces. Try shows it here without writing anything; Take writes it to this project.
            </p>
            {tryId && (
                <div className="insp-field" data-light-env-trying={tryId}>
                    <label className="insp-label">{`Trying ${rows.find((r) => r.id === tryId)?.title || tryId}`}</label>
                    <button type="button" className="scc-btn scc-btn--xs" onClick={lightEnv.back}>Back</button>
                </div>
            )}
            {rows.map((row) => (
                <div key={row.id} className="insp-field" data-light-env-row={row.id} data-current={String(row.current)} data-trying={String(row.id === tryId)}>
                    <label className="insp-label">{`${row.title}${row.current ? ' · this one' : ''}`}</label>
                    <span className="insp-label">
                        {[
                            hazeText(row.summary),
                            `ambient ${row.summary.ambient ?? '–'}`,
                            `exposure ${row.summary.exposure ?? '–'}`,
                            `bloom ${row.summary.bloom ? 'on' : 'off'}`,
                            `surfaces ${row.summary.surfaces ? 'on' : 'off'}`
                        ].join(' · ')}
                    </span>
                    {!row.current && (
                        <>
                            <button type="button" className="scc-btn scc-btn--xs" onClick={() => lightEnv.tryRow(row.id)}>{`Try ${row.title}`}</button>
                            <button type="button" className="scc-btn scc-btn--xs" disabled={row.changes === 0} title={row.changes === 0 ? 'This project already has this light' : `${row.changes} values change`} onClick={() => lightEnv.take(row.id)}>{`Take ${row.title}`}</button>
                        </>
                    )}
                </div>
            ))}
        </CollapsibleSection>
    )
}
