import { useEffect, useMemo, useState } from 'react'
import {
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
    // '?' on the canvas opens straight onto the keys list.
    initialSection = 'start',
    // In the right region (audit 2026-10-05 §3.5): no backdrop, no scrim, a
    // panel in the layout that replaces whatever stood there.
    inline = false
}) {
    const [activeSectionId, setActiveSectionId] = useState(initialSection)
    const [activeMode, setActiveMode] = useState('basics')
    const suggestedSection = useMemo(() => getGuideSection(initialSection), [initialSection])

    useEffect(() => {
        if (!open) return
        setActiveSectionId(suggestedSection.id)
        setActiveMode('basics')
    }, [open, suggestedSection.id])

    useEffect(() => {
        if (!open) return undefined
        // Capture phase + preventDefault: closing help is the WHOLE meaning of
        // this Escape — the editor's ladder sees it handled and does not also
        // leave a level (it did, inventory 2026-10-02 §1f.1).
        const handleKeyDown = (event) => {
            if (event.key !== 'Escape' || event.defaultPrevented) return
            event.preventDefault()
            onClose?.()
        }
        window.addEventListener('keydown', handleKeyDown, true)
        return () => window.removeEventListener('keydown', handleKeyDown, true)
    }, [open, onClose])

    if (!open) return null

    const activeSection = GUIDE_SECTIONS.find((section) => section.id === activeSectionId) || suggestedSection

    return (
        <div className={inline ? 'raw-help-inline' : 'raw-help-backdrop'}>
            {inline ? null : (
                <button
                    type="button"
                    className="raw-help-scrim"
                    aria-label="Close help"
                    onClick={onClose}
                />
            )}
            <section
                className="raw-help-dialog"
                role={inline ? 'region' : 'dialog'}
                aria-modal={inline ? undefined : 'true'}
                aria-label="Help"
            >
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

            </section>
        </div>
    )
}
