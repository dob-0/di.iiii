import { useEffect, useMemo, useState } from 'react'
import {
    GUIDE_AUDIENCES,
    GUIDE_SECTIONS,
    getGuideManualPath,
    getGuideSectionForSurface
} from '../utils/rawGuide.js'

function SurfaceDiagram({ sectionId = 'start' }) {
    if (sectionId === 'world') {
        return (
            <div className="raw-help-diagram raw-help-diagram-world" aria-hidden="true">
                <div className="raw-help-diagram-grid" />
                <div className="raw-help-diagram-cube raw-help-diagram-world-node" />
                <div className="raw-help-diagram-sphere raw-help-diagram-world-node" />
                <div className="raw-help-diagram-pill raw-help-diagram-label-world">World</div>
            </div>
        )
    }

    if (sectionId === 'view') {
        return (
            <div className="raw-help-diagram raw-help-diagram-view" aria-hidden="true">
                <div className="raw-help-diagram-window raw-help-diagram-window-a">
                    <span />
                    <span />
                    <span />
                </div>
                <div className="raw-help-diagram-window raw-help-diagram-window-b">
                    <span />
                    <span />
                </div>
                <div className="raw-help-diagram-pill raw-help-diagram-label-view">View</div>
            </div>
        )
    }

    if (sectionId === 'graph') {
        return (
            <div className="raw-help-diagram raw-help-diagram-graph" aria-hidden="true">
                <div className="raw-help-diagram-wire raw-help-diagram-wire-a" />
                <div className="raw-help-diagram-wire raw-help-diagram-wire-b" />
                <div className="raw-help-diagram-graph-node raw-help-diagram-graph-node-a" />
                <div className="raw-help-diagram-graph-node raw-help-diagram-graph-node-b" />
                <div className="raw-help-diagram-graph-node raw-help-diagram-graph-node-c" />
                <div className="raw-help-diagram-pill raw-help-diagram-label-graph">Graph</div>
            </div>
        )
    }

    return (
        <div className="raw-help-diagram raw-help-diagram-start" aria-hidden="true">
            <div className="raw-help-diagram-start-col raw-help-diagram-start-world" />
            <div className="raw-help-diagram-start-col raw-help-diagram-start-view" />
            <div className="raw-help-diagram-start-col raw-help-diagram-start-graph" />
            <div className="raw-help-diagram-pill raw-help-diagram-label-start">Loop</div>
        </div>
    )
}

export default function RawHelpDialog({
    open,
    surface = 'graph',
    onClose
}) {
    const [activeSectionId, setActiveSectionId] = useState('start')
    const [activeMode, setActiveMode] = useState('basics')
    const suggestedSection = useMemo(() => getGuideSectionForSurface(surface), [surface])

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

    const activeSection = GUIDE_SECTIONS.find((section) => section.id === activeSectionId) || suggestedSection
    const manualPath = getGuideManualPath()

    return (
        <div className="raw-help-backdrop">
            <button
                type="button"
                className="raw-help-scrim"
                aria-label="Close help"
                onClick={onClose}
            />
            <section className="raw-help-dialog" role="dialog" aria-modal="true" aria-label="Raw help">
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

                <div className="raw-help-tabs" role="tablist" aria-label="Guide sections">
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
                        <SurfaceDiagram sectionId={activeSection.id} />
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

                <footer className="raw-help-footer">
                    <span>Manual: {manualPath}</span>
                    <button type="button" onClick={() => setActiveSectionId(suggestedSection.id)}>
                        Jump to {suggestedSection.label}
                    </button>
                </footer>
            </section>
        </div>
    )
}
