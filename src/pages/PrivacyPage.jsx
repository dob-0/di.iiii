import { useEffect, useRef } from 'react'
import { useKeyboardPageScroll } from '../hooks/useKeyboardPageScroll.js'
import './legal.css'

// Written from docs/ai/privacy-data-inventory.md — a code audit, every claim
// traced to source. If the code changes, this page must change with it.
const CONTACT_EMAIL = 'info@thedi.studio'

export default function PrivacyPage() {
    const rootRef = useRef(null)
    useKeyboardPageScroll(rootRef)

    useEffect(() => {
        const previous = document.title
        document.title = 'privacy — di.iiii'
        return () => { document.title = previous }
    }, [])

    return (
        <div className="legal-root" data-page="privacy" ref={rootRef}>
            <nav className="legal-nav">
                <a href="/" className="legal-nav-logo">di<span className="legal-dot">.</span>iiii</a>
                <div className="legal-nav-links">
                    <a href="/" className="legal-nav-link">← Home</a>
                    <a href="/wiki" className="legal-nav-link">Wiki</a>
                    <a href="/terms" className="legal-nav-link">Terms</a>
                </div>
            </nav>

            <header className="legal-header">
                <p className="legal-eyebrow">legal</p>
                <h1 className="legal-title">privacy</h1>
                <p className="legal-lede">
                    What di.iiii actually collects, keeps, and doesn&apos;t — written from a code
                    audit, not a template. Including the parts that aren&apos;t built yet.
                </p>
            </header>

            <main className="legal-content">
                <p className="legal-updated">updated 2026-08-18 · audited against the codebase 2026-07-28</p>

                <section className="legal-section">
                    <h2>the session cookie</h2>
                    <p>
                        One cookie: <code>dii_serverxr_session</code>. HttpOnly, same-site. It holds a
                        signed payload — who you are, your role, which spaces you can enter — not a
                        tracking id. If you haven&apos;t set a display name, your email address stands in
                        as your label, so the cookie can contain your email.
                    </p>
                    <p>
                        Lifetime: 12 hours signed in, 30 days as a guest. Guests get a random id and
                        the label &quot;Guest&quot; — no personal data.
                    </p>
                </section>

                <section className="legal-section">
                    <h2>signing in</h2>
                    <p>
                        Sign-in is GitHub or Google OAuth. Four fields are kept per account: provider
                        id, email, display name, avatar URL. The OAuth access tokens are discarded —
                        di.iiii cannot act on your GitHub or Google account after sign-in.
                    </p>
                    <p>
                        One exception: if you explicitly connect Google Drive to import a file, that
                        token is kept — encrypted at rest — so the import works. Disconnecting Drive
                        is the way to revoke it.
                    </p>
                </section>

                <section className="legal-section">
                    <h2>the open call form</h2>
                    <p>
                        Open-call applications collect name, email, phone, and city. The form is
                        public and works without an account. Right now those applications are kept
                        indefinitely — there is no automatic deletion. To have yours removed, email{' '}
                        <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a> and it will be deleted
                        by hand.
                    </p>
                </section>

                <section className="legal-section">
                    <h2>uploads</h2>
                    <p>
                        Files are stored by content hash (SHA-256). The original filename is kept.
                        Uploads aren&apos;t tied to your identity unless you publish them to the commons.
                    </p>
                    <p>
                        <strong>Metadata is not stripped.</strong> A full-size image you upload is
                        stored and served exactly as you sent it — including EXIF data, which can
                        contain GPS coordinates of where the photo was taken. Thumbnails drop
                        metadata; the original a visitor downloads does not. If that matters to you,
                        strip EXIF before uploading.
                    </p>
                </section>

                <section className="legal-section">
                    <h2>in your browser</h2>
                    <p>
                        The app sets around 15 localStorage keys — a persistent pseudonymous id,
                        display names, and your projects. They stay on your machine.
                        There is no consent banner; this page is the disclosure. The keys are listed,
                        and clearable, in Preferences.
                    </p>
                </section>

                <section className="legal-section">
                    <h2>logs and realtime</h2>
                    <p>
                        Server logs record method, URL, status, size, duration. No IP addresses, no
                        user agents, no user ids are written. IPs are computed in memory for rate
                        limiting and never stored.
                    </p>
                    <p>
                        Presence, cursors, and chat are relayed live and never persisted — there is
                        no chat log and no presence table.
                    </p>
                </section>

                <section className="legal-section">
                    <h2>third parties</h2>
                    <p>
                        None in the main app. No third-party analytics, no telemetry, no error
                        reporting, no session replay, no tag manager. The site loads its own
                        assets, including fonts.
                    </p>
                    <p>
                        We count our own traffic, anonymously: one first-party event per page load
                        recording the path, the time, and the referring site&apos;s hostname —
                        no cookie, no IP address, no browser fingerprint, no user id, nothing that
                        links two visits together. It answers &quot;how many, from where&quot; and
                        cannot answer &quot;who&quot;.
                    </p>
                    <p>
                        Exceptions: the Google APIs script loads only if you open the Drive import,
                        and one legacy published project (the WCC static bundle) still loads Google
                        Fonts and unpkg.com scripts on its own pages.
                    </p>
                </section>

                <section className="legal-section">
                    <h2>retention and backups</h2>
                    <ul>
                        <li>Idle spaces expire after 30 days. Guest sandboxes after 7. Account
                            sandboxes archive to a snapshot after 180 days and revive on your next
                            visit.</li>
                        <li>Edit history is capped at 500 operations per project.</li>
                        <li>Accounts, open-call applications, and published assets currently have no
                            retention limit — they persist until removed by hand.</li>
                        <li>Nightly backups are kept on the server for 14 days, nowhere else. A
                            backup restore can bring back data deleted in the meantime — there is no
                            exclusion mechanism yet.</li>
                    </ul>
                </section>

                <section className="legal-section">
                    <h2>not built yet</h2>
                    <p>Honest list. These are gaps, not features:</p>
                    <ul>
                        <li><strong>No self-service account deletion.</strong> Email{' '}
                            <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a> and your account
                            and data will be removed by hand.</li>
                        <li><strong>No data export.</strong> Same route — email, and you&apos;ll get a
                            copy of what&apos;s held about you.</li>
                        <li><strong>No per-session sign-out-everywhere.</strong> Sessions are signed
                            cookies, valid until they expire. The only kill switch rotates the
                            signing key and logs every user out at once.</li>
                        <li><strong>No retention limit</strong> on accounts, open-call applications,
                            or published assets — see above.</li>
                    </ul>
                </section>

                <section className="legal-section">
                    <h2>contact</h2>
                    <p>
                        Deletion, export, questions — <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
                        A person reads it.
                    </p>
                </section>
            </main>

            <footer className="legal-footer">
                <span className="legal-footer-brand">di<span className="legal-dot">.</span>iiii</span>
                <span className="legal-footer-note">privacy · thedi.studio</span>
            </footer>
        </div>
    )
}
