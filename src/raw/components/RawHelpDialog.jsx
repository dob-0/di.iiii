import { useEffect, useMemo, useState } from 'react'
import {
    GUIDE_AUDIENCES,
    GUIDE_SECTIONS,
    getGuideSection
} from '../utils/rawGuide.js'

// The graph diagram survives the surface axis: cards and wires are still the
// truth of the product. The World/View diagrams taught surfaces that no
// longer exist and are gone with them.
function GuideDiagram() {
    return (
        <div className="raw-help-diagram raw-help-diagram-graph" aria-hidden="true">
            <div className="raw-help-diagram-wire raw-help-diagram-wire-a" />
            <div className="raw-help-diagram-wire raw-help-diagram-wire-b" />
            <div className="raw-help-diagram-graph-node raw-help-diagram-graph-node-a" />
            <div className="raw-help-diagram-graph-node raw-help-diagram-graph-node-b" />
            <div className="raw-help-diagram-graph-node raw-help-diagram-graph-node-c" />
        </div>
    )
}

export default function RawHelpDialog({
    open,
    onClose,
    // Design audit C7: the Start section's first step read "The canvas
    // starts empty" even when opened over a full canvas — the one line in
    // this dialog that could be flatly wrong about what the person was
    // looking at. Pass whether the canvas already holds work.
    hasNodes = false
}) {
    const [activeSectionId, setActiveSectionId] = useState('start')
    const [activeMode, setActiveMode] = useState('basics')
    const suggestedSection = useMemo(() => getGuideSection('start'), [])

    useEffect(() => {
        if (!open) return
        setActiveSectionId(suggestedSection.id)
        setActiveMode('basics')
    }, [open, suggestedSection.id])

    useEffect(() => {
        if (!open) return undefined
        const handleKeyDown = (event) => {
            if (event.key !== 'Escape') return
            onClose?.()
        }
        window.addEventListener('keydown', handleKeyDown)
        return () => window.removeEventListener('keydown', handleKeyDown)
    }, [open, onClose])

    if (!open) return null

    const rawSection = GUIDE_SECTIONS.find((section) => section.id === activeSectionId) || suggestedSection
    // Design audit C7: worded for the state the canvas is actually in,
    // rather than always assuming a fresh one.
    const activeSection = rawSection.id === 'start'
        ? {
            ...rawSection,
            steps: [
                hasNodes ? 'This canvas already has work in it.' : 'The canvas starts empty.',
                ...rawSection.steps.slice(1)
            ]
        }
        : rawSection

    return (
        <div className="raw-help-backdrop">
            <button
                type="button"
                className="raw-help-scrim"
                aria-label="Close help"
                onClick={onClose}
            />
            <section className="raw-help-dialog" role="dialog" aria-modal="true" aria-label="Help">
                <header className="raw-help-header">
                    <div className="raw-help-header-mark" aria-hidden="true">
                        <span>{activeSection.icon}</span>
                    </div>
                    <div>
                        <span className="raw-window-kicker">{activeSection.label}</span>
                        <h3>{activeSection.title}</h3>
                        <p>{activeSection.description}</p>
                    </div>
                    <button type="button" onClick={onClose}>Close</button>
                </header>

                <div className="raw-help-mode-tabs" role="tablist" aria-label="Help modes">
                    {['basics', 'controls'].map((mode) => (
                        <button
                            key={mode}
                            type="button"
                            role="tab"
                            aria-selected={activeMode === mode}
                            className={activeMode === mode ? 'is-active' : ''}
                            onClick={() => setActiveMode(mode)}
                        >
                            {mode === 'basics' ? 'Navigation Basics' : 'All Controls'}
                        </button>
                    ))}
                </div>

                <div className="raw-help-tabs" role="tablist" aria-label="Guide sections" hidden={GUIDE_SECTIONS.length < 2}>
                    {GUIDE_SECTIONS.map((section) => (
                        <button
                            key={section.id}
                            type="button"
                            role="tab"
                            aria-selected={section.id === activeSection.id}
                            className={section.id === activeSection.id ? 'is-active' : ''}
                            onClick={() => setActiveSectionId(section.id)}
                        >
                            {section.label}
                        </button>
                    ))}
                </div>

                <div className={`raw-help-body raw-help-body-${activeMode}`}>
                    <div className="raw-help-visual-stage">
                        <GuideDiagram />
                        <div className="raw-help-callout-row">
                            {activeSection.callouts.map((item) => (
                                <article key={item.title} className="raw-help-callout">
                                    <div className="raw-help-callout-icon" aria-hidden="true">{item.icon}</div>
                                    <strong>{item.title}</strong>
                                    <p>{item.detail}</p>
                                </article>
                            ))}
                        </div>
                    </div>

                    {activeMode === 'basics' ? (
                        <div className="raw-help-side raw-help-side-basics">
                            <div className="raw-help-step-grid">
                                {activeSection.steps.map((step, index) => (
                                    <div key={step} className="raw-help-step-card">
                                        <span>{index + 1}</span>
                                        <p>{step}</p>
                                    </div>
                                ))}
                            </div>
                            {activeSection.id === 'start' ? (
                                <div className="raw-help-audiences">
                                    {GUIDE_AUDIENCES.map((audience) => (
                                        <section key={audience.id} className="raw-help-audience-card">
                                            <div className="raw-help-audience-head">
                                                <span className="raw-help-audience-glyph" aria-hidden="true">{audience.glyph}</span>
                                                <span className="raw-window-kicker">{audience.label}</span>
                                            </div>
                                            <h4>{audience.title}</h4>
                                            <div className="raw-help-chip-row">
                                                {audience.tags.map((tag) => (
                                                    <span key={tag} className="raw-help-chip">{tag}</span>
                                                ))}
                                            </div>
                                        </section>
                                    ))}
                                </div>
                            ) : null}
                        </div>
                    ) : (
                        <div className="raw-help-side raw-help-side-controls">
                            <div className="raw-help-controls-list">
                                {activeSection.controls.map(([label, value]) => (
                                    <div key={label} className="raw-help-control-row">
                                        <span>{label}</span>
                                        <strong>{value}</strong>
                                    </div>
                                ))}
                            </div>
                            <ul className="raw-help-tip-list">
                                {activeSection.tips.map((tip) => (
                                    <li key={tip}>{tip}</li>
                                ))}
                            </ul>
                        </div>
                    )}
                </div>

                <footer className="raw-help-footer" />
            </section>
        </div>
    )
}
