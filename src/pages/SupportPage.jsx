import { useRef } from 'react'
import { useKeyboardPageScroll } from '../hooks/useKeyboardPageScroll.js'
import useDocumentTitle from '../hooks/useDocumentTitle.js'
import { SPONSORS_URL, SUPPORT_LEDE, SUPPORT_SECTIONS } from './supportContent.js'
import './legal.css'

export default function SupportPage() {
    const rootRef = useRef(null)
    useKeyboardPageScroll(rootRef)
    useDocumentTitle('Support — di.iiii')

    return (
        <div className="legal-root" data-page="support" ref={rootRef}>
            <nav className="legal-nav">
                <a href="/" className="legal-nav-logo">di<span className="legal-dot">.</span>iiii</a>
                <div className="legal-nav-links">
                    <a href="/" className="legal-nav-link">← Home</a>
                    <a href="/wiki" className="legal-nav-link">Wiki</a>
                    <a href="/terms" className="legal-nav-link">Terms</a>
                </div>
            </nav>

            <header className="legal-header">
                <p className="legal-eyebrow">support</p>
                <h1 className="legal-title">support</h1>
                <p className="legal-lede">{SUPPORT_LEDE}</p>
            </header>

            <main className="legal-content">
                {SUPPORT_SECTIONS.map((s) => (
                    <section key={s.id} className="legal-section" id={s.id}>
                        <h2>{s.heading}</h2>
                        {s.paragraphs.map((p) => <p key={p}>{p}</p>)}
                        {s.id === 'give' && (SPONSORS_URL
                            ? <p><a href={SPONSORS_URL} rel="noopener noreferrer">Sponsor on GitHub</a></p>
                            : <p data-testid="sponsors-pending">The Sponsors account is being opened. Until then, the other three ways below are open to everyone.</p>)}
                    </section>
                ))}
            </main>
        </div>
    )
}
