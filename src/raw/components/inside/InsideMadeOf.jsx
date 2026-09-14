import { useEffect, useState } from 'react'
import { TOP_OPERATORS, isTopType } from '../../../project/tops/topOperators.js'
import { madeOfTabs, readMadeOf } from './insideSource.js'
import NodeScriptTab from './NodeScriptTab.jsx'
import { ShaderSection, TopScriptSection } from './topSections.jsx'

// MADE OF — the real code, one tab per place it lives. Built-in code is
// read-only and says so; a picture operator's shader and script are the two
// things here a person can change, because they run where the operator runs.

const baseName = (file) => String(file || '').slice(String(file || '').lastIndexOf('/') + 1)

function CodeView({ place }) {
    const lines = place.text.split('\n')
    return (
        <figure className="raw-inside-code-figure">
            <figcaption>{baseName(place.file)} · from line {place.fromLine}</figcaption>
            <pre className="raw-inside-code is-readonly">
                {lines.map((line, index) => (
                    <span key={index} className="raw-inside-code-line">
                        <span className="raw-inside-code-number" aria-hidden="true">{place.fromLine + index}</span>
                        {line || ' '}
                    </span>
                ))}
            </pre>
        </figure>
    )
}

function SourceTab({ typeId, tabId }) {
    const [state, setState] = useState({ key: null, places: null, error: null })
    const key = `${typeId}:${tabId}`
    useEffect(() => {
        let cancelled = false
        readMadeOf(typeId, tabId)
            .then((places) => { if (!cancelled) setState({ key, places, error: null }) })
            .catch((error) => { if (!cancelled) setState({ key, places: null, error: String(error?.message || error) }) })
        return () => { cancelled = true }
    }, [typeId, tabId, key])
    if (state.key !== key) return <p className="raw-inside-dim">Fetching the lines…</p>
    if (state.error) return <p className="raw-inside-error" role="status">The lines could not be fetched. Nothing is shown rather than something guessed.</p>
    if (!state.places?.length) return <p className="raw-inside-dim">No lines of its own.</p>
    return state.places.map((place) => <CodeView key={`${place.file}:${place.fromLine}`} place={place} />)
}

export default function InsideMadeOf({
    node,
    machines = [],
    report = {},
    open = false,
    onToggle,
    onPatchValues,
    scriptTab: ScriptTab = null,
    scriptProps = null
}) {
    const tabs = madeOfTabs(node)
    const [active, setActive] = useState(null)
    const current = tabs.find((tab) => tab.id === active) || tabs[0] || null
    if (!tabs.length) return null

    const owner = machines.find((machine) => machine.id === node.values?.machine) || null
    const where = owner ? owner.name : 'wherever the page is open'
    const scriptsAllowed = owner ? owner.scripts : machines.find((machine) => machine.self)?.scripts

    const pick = (tabId) => {
        setActive(tabId)
        if (!open) onToggle?.(true)
    }
    const onTabKey = (event) => {
        if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return
        const index = tabs.findIndex((tab) => tab.id === current?.id)
        const next = tabs[(index + (event.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length]
        pick(next.id)
        event.currentTarget.parentElement?.querySelector(`[data-tab="${next.id}"]`)?.focus()
    }

    let body = null
    if (open && current) {
        if (current.id === 'shader' && isTopType(node.typeId)) {
            body = <ShaderSection node={node} operator={TOP_OPERATORS[node.typeId]} report={report} onPatchValues={onPatchValues} />
        } else if (current.id === 'script') {
            body = isTopType(node.typeId)
                ? <TopScriptSection node={node} report={report} where={where} scriptsAllowed={scriptsAllowed} onPatchValues={onPatchValues} />
                : ScriptTab
                    ? <ScriptTab node={node} onPatchValues={onPatchValues} {...(scriptProps || {})} />
                    : <NodeScriptTab node={node} onPatchValues={onPatchValues} {...(scriptProps || {})} />
        } else {
            body = <SourceTab typeId={node.typeId} tabId={current.id} />
        }
    }

    return (
        <section className={`raw-inside-madeof${open ? ' is-open' : ''}`} aria-label={`Made of — the code inside ${node.label}`}>
            <div className="raw-inside-madeof-bar">
                <h2 className="raw-inside-rail-title">Made of</h2>
                <div className="raw-inside-tabs" role="tablist" aria-label="Where its code lives">
                    {tabs.map((tab) => (
                        <button
                            key={tab.id}
                            type="button"
                            role="tab"
                            data-tab={tab.id}
                            className="raw-inside-tab"
                            aria-selected={open && tab.id === current?.id}
                            tabIndex={tab.id === current?.id ? 0 : -1}
                            onClick={() => pick(tab.id)}
                            onKeyDown={onTabKey}
                        >
                            {tab.label}
                        </button>
                    ))}
                </div>
                <button
                    type="button"
                    className="raw-inside-icon"
                    aria-expanded={open}
                    aria-label={open ? 'Close Made of' : 'Open Made of'}
                    onClick={() => onToggle?.(!open)}
                >
                    <span aria-hidden="true">{open ? '▾' : '▴'}</span>
                </button>
            </div>
            {open && current ? (
                <div className="raw-inside-madeof-body" role="tabpanel" aria-label={current.label} tabIndex={0}>
                    {current.caption ? <p className="raw-inside-dim">{current.caption}</p> : null}
                    {body}
                </div>
            ) : null}
        </section>
    )
}
