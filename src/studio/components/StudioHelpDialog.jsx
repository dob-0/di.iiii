import { useEffect, useState } from 'react'
import {
    STUDIO_GUIDE_SECTIONS,
    STUDIO_SHORTCUT_SECTIONS
} from '../utils/studioGuide.js'
import '../styles/studio-help.css'

// Pure-CSS diagrams, one per guide section — same approach as Beta's
// SurfaceDiagram: the picture explains, the copy just anchors it.
function GuideDiagram({ sectionId }) {
    if (sectionId === 'build') {
        return (
            <div className="sh-help-diagram sh-help-diagram--build" aria-hidden="true">
                <div className="sh-help-grid" />
                <div className="sh-help-cube" />
                <div className="sh-help-plus">+</div>
                <div className="sh-help-chip-tray">
                    <span /><span /><span />
                </div>
            </div>
        )
    }
    if (sectionId === 'edit') {
        return (
            <div className="sh-help-diagram sh-help-diagram--edit" aria-hidden="true">
                <div className="sh-help-grid" />
                <div className="sh-help-cube sh-help-cube--selected" />
                <div className="sh-help-axis sh-help-axis--x" />
                <div className="sh-help-axis sh-help-axis--y" />
                <div className="sh-help-axis sh-help-axis--z" />
            </div>
        )
    }
    if (sectionId === 'share') {
        return (
            <div className="sh-help-diagram sh-help-diagram--share" aria-hidden="true">
                <div className="sh-help-grid" />
                <div className="sh-help-ring" />
                <div className="sh-help-cube sh-help-cube--small" />
                <div className="sh-help-link-pill">/space</div>
            </div>
        )
    }
    return (
        <div className="sh-help-diagram sh-help-diagram--move" aria-hidden="true">
            <div className="sh-help-grid" />
            <div className="sh-help-cube" />
            <div className="sh-help-orbit" />
            <div className="sh-help-cam" />
        </div>
    )
}

export default function StudioHelpDialog({ open, onClose, initialMode = 'basics' }) {
    const [mode, setMode] = useState(initialMode)
    const [sectionId, setSectionId] = useState('move')

    useEffect(() => {
        if (!open) return
        setMode(initialMode)
        setSectionId('move')
    }, [open, initialMode])

    if (!open) return null

    const section = STUDIO_GUIDE_SECTIONS.find((s) => s.id === sectionId) || STUDIO_GUIDE_SECTIONS[0]

    return (
        <div className="sh-help-backdrop">
            <button type="button" className="sh-help-scrim" aria-label="Close help" onClick={onClose} />
            <section className="sh-help-dialog" role="dialog" aria-modal="true" aria-label="Studio help">
                <header className="sh-help-header">
                    <span className="sh-help-mark" aria-hidden="true">{section.icon}</span>
                    <div className="sh-help-header-text">
                        <h3>{mode === 'basics' ? section.title : 'Keyboard shortcuts'}</h3>
                        <p>{mode === 'basics' ? section.description : 'Everything the mouse can do, faster.'}</p>
                    </div>
                    <button type="button" className="sh-help-close" onClick={onClose} aria-label="Close">×</button>
                </header>

                <div className="sh-help-mode-tabs" role="tablist" aria-label="Help modes">
                    <button
                        type="button"
                        role="tab"
                        aria-selected={mode === 'basics'}
                        className={mode === 'basics' ? 'is-active' : ''}
                        onClick={() => setMode('basics')}
                    >
                        Basics
                    </button>
                    <button
                        type="button"
                        role="tab"
                        aria-selected={mode === 'shortcuts'}
                        className={mode === 'shortcuts' ? 'is-active' : ''}
                        onClick={() => setMode('shortcuts')}
                    >
                        Shortcuts
                    </button>
                </div>

                {mode === 'basics' ? (
                    <>
                        <div className="sh-help-section-tabs" role="tablist" aria-label="Guide sections">
                            {STUDIO_GUIDE_SECTIONS.map((s) => (
                                <button
                                    key={s.id}
                                    type="button"
                                    role="tab"
                                    aria-selected={s.id === section.id}
                                    className={s.id === section.id ? 'is-active' : ''}
                                    onClick={() => setSectionId(s.id)}
                                >
                                    {s.label}
                                </button>
                            ))}
                        </div>
                        <div className="sh-help-body">
                            <div className="sh-help-stage">
                                <GuideDiagram sectionId={section.id} />
                                <div className="sh-help-callouts">
                                    {section.callouts.map((c) => (
                                        <article key={c.title} className="sh-help-callout">
                                            <span className="sh-help-callout-icon" aria-hidden="true">{c.icon}</span>
                                            <strong>{c.title}</strong>
                                            <p>{c.detail}</p>
                                        </article>
                                    ))}
                                </div>
                            </div>
                            <ol className="sh-help-steps">
                                {section.steps.map((step, index) => (
                                    <li key={step}>
                                        <span>{index + 1}</span>
                                        <p>{step}</p>
                                    </li>
                                ))}
                            </ol>
                        </div>
                    </>
                ) : (
                    <div className="sh-help-shortcuts">
                        {STUDIO_SHORTCUT_SECTIONS.map((group) => (
                            <div key={group.title} className="sh-help-shortcut-group">
                                <div className="sh-help-shortcut-title">{group.title}</div>
                                {group.rows.map(([key, desc]) => (
                                    <div key={key} className="sh-help-shortcut-row">
                                        <code>{key}</code>
                                        <span>{desc}</span>
                                    </div>
                                ))}
                            </div>
                        ))}
                    </div>
                )}

                <footer className="sh-help-footer">
                    <span>Shift+? opens this anytime · Esc closes</span>
                </footer>
            </section>
        </div>
    )
}
