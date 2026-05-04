import { useEffect, useMemo, useState } from 'react'
import {
    GUIDE_AUDIENCES,
    GUIDE_SECTIONS,
    getGuideManualPath,
    getGuideSectionForSurface
} from '../utils/betaGuide.js'

function SurfaceDiagram({ sectionId = 'start' }) {
    if (sectionId === 'world') {
        return (
            <div className="beta-help-diagram beta-help-diagram-world" aria-hidden="true">
                <div className="beta-help-diagram-grid" />
                <div className="beta-help-diagram-cube beta-help-diagram-world-node" />
                <div className="beta-help-diagram-sphere beta-help-diagram-world-node" />
                <div className="beta-help-diagram-pill beta-help-diagram-label-world">World</div>
            </div>
        )
    }

    if (sectionId === 'view') {
        return (
            <div className="beta-help-diagram beta-help-diagram-view" aria-hidden="true">
                <div className="beta-help-diagram-window beta-help-diagram-window-a">
                    <span />
                    <span />
                    <span />
                </div>
                <div className="beta-help-diagram-window beta-help-diagram-window-b">
                    <span />
                    <span />
                </div>
                <div className="beta-help-diagram-pill beta-help-diagram-label-view">View</div>
            </div>
        )
    }

    if (sectionId === 'graph') {
        return (
            <div className="beta-help-diagram beta-help-diagram-graph" aria-hidden="true">
                <div className="beta-help-diagram-wire beta-help-diagram-wire-a" />
                <div className="beta-help-diagram-wire beta-help-diagram-wire-b" />
                <div className="beta-help-diagram-graph-node beta-help-diagram-graph-node-a" />
                <div className="beta-help-diagram-graph-node beta-help-diagram-graph-node-b" />
                <div className="beta-help-diagram-graph-node beta-help-diagram-graph-node-c" />
                <div className="beta-help-diagram-pill beta-help-diagram-label-graph">Graph</div>
            </div>
        )
    }

    return (
        <div className="beta-help-diagram beta-help-diagram-start" aria-hidden="true">
            <div className="beta-help-diagram-start-col beta-help-diagram-start-world" />
            <div className="beta-help-diagram-start-col beta-help-diagram-start-view" />
            <div className="beta-help-diagram-start-col beta-help-diagram-start-graph" />
            <div className="beta-help-diagram-pill beta-help-diagram-label-start">Loop</div>
        </div>
    )
}

export default function BetaHelpDialog({
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
        <div className="beta-help-backdrop">
            <button
                type="button"
                className="beta-help-scrim"
                aria-label="Close help"
                onClick={onClose}
            />
            <section className="beta-help-dialog" role="dialog" aria-modal="true" aria-label="Beta help">
                <header className="beta-help-header">
                    <div className="beta-help-header-mark" aria-hidden="true">
                        <span>{activeSection.icon}</span>
                    </div>
                    <div>
                        <span className="beta-window-kicker">{activeSection.label}</span>
                        <h3>{activeSection.title}</h3>
                        <p>{activeSection.description}</p>
                    </div>
                    <button type="button" onClick={onClose}>Close</button>
                </header>

                <div className="beta-help-mode-tabs" role="tablist" aria-label="Help modes">
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

                <div className="beta-help-tabs" role="tablist" aria-label="Guide sections">
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

                <div className={`beta-help-body beta-help-body-${activeMode}`}>
                    <div className="beta-help-visual-stage">
                        <SurfaceDiagram sectionId={activeSection.id} />
                        <div className="beta-help-callout-row">
                            {activeSection.callouts.map((item) => (
                                <article key={item.title} className="beta-help-callout">
                                    <div className="beta-help-callout-icon" aria-hidden="true">{item.icon}</div>
                                    <strong>{item.title}</strong>
                                    <p>{item.detail}</p>
                                </article>
                            ))}
                        </div>
                    </div>

                    {activeMode === 'basics' ? (
                        <div className="beta-help-side beta-help-side-basics">
                            <div className="beta-help-step-grid">
                                {activeSection.steps.map((step, index) => (
                                    <div key={step} className="beta-help-step-card">
                                        <span>{index + 1}</span>
                                        <p>{step}</p>
                                    </div>
                                ))}
                            </div>
                            {activeSection.id === 'start' ? (
                                <div className="beta-help-audiences">
                                    {GUIDE_AUDIENCES.map((audience) => (
                                        <section key={audience.id} className="beta-help-audience-card">
                                            <div className="beta-help-audience-head">
                                                <span className="beta-help-audience-glyph" aria-hidden="true">{audience.glyph}</span>
                                                <span className="beta-window-kicker">{audience.label}</span>
                                            </div>
                                            <h4>{audience.title}</h4>
                                            <div className="beta-help-chip-row">
                                                {audience.tags.map((tag) => (
                                                    <span key={tag} className="beta-help-chip">{tag}</span>
                                                ))}
                                            </div>
                                        </section>
                                    ))}
                                </div>
                            ) : null}
                        </div>
                    ) : (
                        <div className="beta-help-side beta-help-side-controls">
                            <div className="beta-help-controls-list">
                                {activeSection.controls.map(([label, value]) => (
                                    <div key={label} className="beta-help-control-row">
                                        <span>{label}</span>
                                        <strong>{value}</strong>
                                    </div>
                                ))}
                            </div>
                            <ul className="beta-help-tip-list">
                                {activeSection.tips.map((tip) => (
                                    <li key={tip}>{tip}</li>
                                ))}
                            </ul>
                        </div>
                    )}
                </div>

                <footer className="beta-help-footer">
                    <span>Manual: {manualPath}</span>
                    <button type="button" onClick={() => setActiveSectionId(suggestedSection.id)}>
                        Jump to {suggestedSection.label}
                    </button>
                </footer>
            </section>
        </div>
    )
}
