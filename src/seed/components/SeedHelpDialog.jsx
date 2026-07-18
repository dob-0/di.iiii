import { useEffect, useMemo, useState } from 'react'
import {
    GUIDE_AUDIENCES,
    GUIDE_SECTIONS,
    getGuideManualPath,
    getGuideSectionForSurface
} from '../utils/seedGuide.js'

function SurfaceDiagram({ sectionId = 'start' }) {
    if (sectionId === 'world') {
        return (
            <div className="seed-help-diagram seed-help-diagram-world" aria-hidden="true">
                <div className="seed-help-diagram-grid" />
                <div className="seed-help-diagram-cube seed-help-diagram-world-node" />
                <div className="seed-help-diagram-sphere seed-help-diagram-world-node" />
                <div className="seed-help-diagram-pill seed-help-diagram-label-world">World</div>
            </div>
        )
    }

    if (sectionId === 'view') {
        return (
            <div className="seed-help-diagram seed-help-diagram-view" aria-hidden="true">
                <div className="seed-help-diagram-window seed-help-diagram-window-a">
                    <span />
                    <span />
                    <span />
                </div>
                <div className="seed-help-diagram-window seed-help-diagram-window-b">
                    <span />
                    <span />
                </div>
                <div className="seed-help-diagram-pill seed-help-diagram-label-view">View</div>
            </div>
        )
    }

    if (sectionId === 'graph') {
        return (
            <div className="seed-help-diagram seed-help-diagram-graph" aria-hidden="true">
                <div className="seed-help-diagram-wire seed-help-diagram-wire-a" />
                <div className="seed-help-diagram-wire seed-help-diagram-wire-b" />
                <div className="seed-help-diagram-graph-node seed-help-diagram-graph-node-a" />
                <div className="seed-help-diagram-graph-node seed-help-diagram-graph-node-b" />
                <div className="seed-help-diagram-graph-node seed-help-diagram-graph-node-c" />
                <div className="seed-help-diagram-pill seed-help-diagram-label-graph">Graph</div>
            </div>
        )
    }

    return (
        <div className="seed-help-diagram seed-help-diagram-start" aria-hidden="true">
            <div className="seed-help-diagram-start-col seed-help-diagram-start-world" />
            <div className="seed-help-diagram-start-col seed-help-diagram-start-view" />
            <div className="seed-help-diagram-start-col seed-help-diagram-start-graph" />
            <div className="seed-help-diagram-pill seed-help-diagram-label-start">Loop</div>
        </div>
    )
}

export default function SeedHelpDialog({
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
        <div className="seed-help-backdrop">
            <button
                type="button"
                className="seed-help-scrim"
                aria-label="Close help"
                onClick={onClose}
            />
            <section className="seed-help-dialog" role="dialog" aria-modal="true" aria-label="Seed help">
                <header className="seed-help-header">
                    <div className="seed-help-header-mark" aria-hidden="true">
                        <span>{activeSection.icon}</span>
                    </div>
                    <div>
                        <span className="seed-window-kicker">{activeSection.label}</span>
                        <h3>{activeSection.title}</h3>
                        <p>{activeSection.description}</p>
                    </div>
                    <button type="button" onClick={onClose}>Close</button>
                </header>

                <div className="seed-help-mode-tabs" role="tablist" aria-label="Help modes">
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

                <div className="seed-help-tabs" role="tablist" aria-label="Guide sections">
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

                <div className={`seed-help-body seed-help-body-${activeMode}`}>
                    <div className="seed-help-visual-stage">
                        <SurfaceDiagram sectionId={activeSection.id} />
                        <div className="seed-help-callout-row">
                            {activeSection.callouts.map((item) => (
                                <article key={item.title} className="seed-help-callout">
                                    <div className="seed-help-callout-icon" aria-hidden="true">{item.icon}</div>
                                    <strong>{item.title}</strong>
                                    <p>{item.detail}</p>
                                </article>
                            ))}
                        </div>
                    </div>

                    {activeMode === 'basics' ? (
                        <div className="seed-help-side seed-help-side-basics">
                            <div className="seed-help-step-grid">
                                {activeSection.steps.map((step, index) => (
                                    <div key={step} className="seed-help-step-card">
                                        <span>{index + 1}</span>
                                        <p>{step}</p>
                                    </div>
                                ))}
                            </div>
                            {activeSection.id === 'start' ? (
                                <div className="seed-help-audiences">
                                    {GUIDE_AUDIENCES.map((audience) => (
                                        <section key={audience.id} className="seed-help-audience-card">
                                            <div className="seed-help-audience-head">
                                                <span className="seed-help-audience-glyph" aria-hidden="true">{audience.glyph}</span>
                                                <span className="seed-window-kicker">{audience.label}</span>
                                            </div>
                                            <h4>{audience.title}</h4>
                                            <div className="seed-help-chip-row">
                                                {audience.tags.map((tag) => (
                                                    <span key={tag} className="seed-help-chip">{tag}</span>
                                                ))}
                                            </div>
                                        </section>
                                    ))}
                                </div>
                            ) : null}
                        </div>
                    ) : (
                        <div className="seed-help-side seed-help-side-controls">
                            <div className="seed-help-controls-list">
                                {activeSection.controls.map(([label, value]) => (
                                    <div key={label} className="seed-help-control-row">
                                        <span>{label}</span>
                                        <strong>{value}</strong>
                                    </div>
                                ))}
                            </div>
                            <ul className="seed-help-tip-list">
                                {activeSection.tips.map((tip) => (
                                    <li key={tip}>{tip}</li>
                                ))}
                            </ul>
                        </div>
                    )}
                </div>

                <footer className="seed-help-footer">
                    <span>Manual: {manualPath}</span>
                    <button type="button" onClick={() => setActiveSectionId(suggestedSection.id)}>
                        Jump to {suggestedSection.label}
                    </button>
                </footer>
            </section>
        </div>
    )
}
