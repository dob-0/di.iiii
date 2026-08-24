import { useEffect, useRef } from 'react'
import { useKeyboardPageScroll } from '../hooks/useKeyboardPageScroll.js'
import './legal.css'

const CONTACT_EMAIL = 'info@thedi.studio'

export default function TermsPage() {
    const rootRef = useRef(null)
    useKeyboardPageScroll(rootRef)

    useEffect(() => {
        const previous = document.title
        document.title = 'terms — di.iiii'
        return () => { document.title = previous }
    }, [])

    return (
        <div className="legal-root" data-page="terms" ref={rootRef}>
            <nav className="legal-nav">
                <a href="/" className="legal-nav-logo">di<span className="legal-dot">.</span>iiii</a>
                <div className="legal-nav-links">
                    <a href="/" className="legal-nav-link">← Home</a>
                    <a href="/wiki" className="legal-nav-link">Wiki</a>
                    <a href="/privacy" className="legal-nav-link">Privacy</a>
                </div>
            </nav>

            <header className="legal-header">
                <p className="legal-eyebrow">legal</p>
                <h1 className="legal-title">terms</h1>
                <p className="legal-lede">
                    Short and factual. The code is open, your content is yours, and the few real
                    limits are listed below.
                </p>
            </header>

            <main className="legal-content">
                <p className="legal-updated">updated 2026-08-18</p>

                <section className="legal-section">
                    <h2>the code is open</h2>
                    <p>
                        di.iiii’s code is licensed under the GNU AGPL-3.0. Anyone may
                        read, use, modify, and self-host it; anyone who hosts a modified copy must
                        publish their changes under the same license — the commons can grow but not
                        be enclosed.
                    </p>
                    <p>
                        Self-hosting is a supported path, and space bundles are exportable — your
                        work is never locked to this host.
                    </p>
                </section>

                <section className="legal-section">
                    <h2>your content stays yours</h2>
                    <p>
                        Content is separate from code. Spaces and projects you create belong to you.
                        Published spaces stay free to visit — no login is ever needed to view a
                        public space.
                    </p>
                </section>

                <section className="legal-section">
                    <h2>the free tier</h2>
                    <p>
                        Three spaces per account. No time limit, no feature gate below that number.
                        Idle spaces expire on the schedule described on the{' '}
                        <a href="/privacy">privacy page</a>.
                    </p>
                </section>

                <section className="legal-section">
                    <h2>anonymous inscriptions are permanent</h2>
                    <p>
                        Content submitted anonymously — inscriptions left without an account — is
                        append-only by design. Once submitted it cannot be edited or deleted by the
                        person who wrote it, because nothing links it back to them. A deliberate
                        choice, disclosed here so you can make yours before you write.
                    </p>
                </section>

                <section className="legal-section">
                    <h2>no warranty</h2>
                    <p>
                        The hosted service at di-studio.xyz is run by a small studio and provided
                        as-is, same as the AGPL says for the code. Back up work you care about —
                        bundle export exists for exactly that.
                    </p>
                </section>

                <section className="legal-section">
                    <h2>contact</h2>
                    <p>
                        Questions, takedowns, anything else —{' '}
                        <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
                    </p>
                </section>
            </main>

            <footer className="legal-footer">
                <span className="legal-footer-brand">di<span className="legal-dot">.</span>iiii</span>
                <span className="legal-footer-note">terms · thedi.studio</span>
            </footer>
        </div>
    )
}
