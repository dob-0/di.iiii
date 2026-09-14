import { useRef } from 'react'
import { useKeyboardPageScroll } from '../hooks/useKeyboardPageScroll.js'
import useDocumentTitle from '../hooks/useDocumentTitle.js'
import './legal.css'

// The door sign for programs — apps, scripts, crawlers and AIs. The server's 429
// and 403 answers to programs point here (serverXR/src/appVisitors.js), and so do
// public/robots.txt and public/llms.txt. Same shell as /terms: short, plain, read.

const CONTACT_EMAIL = 'info@thedi.studio'

// Kept equal to ANONYMOUS_READS_PER_MINUTE / IDENTIFIED_READS_PER_MINUTE in
// serverXR/src/appVisitors.js — ForAppsPage.test.jsx fails if they drift, because
// a door sign that quotes the wrong limit is worse than none.
export const ANONYMOUS_READS_PER_MINUTE = 30
export const IDENTIFIED_READS_PER_MINUTE = 300

export default function ForAppsPage() {
    const rootRef = useRef(null)
    useKeyboardPageScroll(rootRef)

    // Sentence case for the page word, not the lowercase the page used to
    // carry — see docs/ai/vocabulary.md's naming rule.
    useDocumentTitle('For apps — di.iiii')

    return (
        <div className="legal-root" data-page="for-apps" ref={rootRef}>
            <nav className="legal-nav">
                <a href="/" className="legal-nav-logo">di<span className="legal-dot">.</span>iiii</a>
                <div className="legal-nav-links">
                    <a href="/" className="legal-nav-link">← Home</a>
                    <a href="/wiki" className="legal-nav-link">Wiki</a>
                    <a href="/terms" className="legal-nav-link">Terms</a>
                </div>
            </nav>

            <header className="legal-header">
                <p className="legal-eyebrow">for apps, scripts and AIs</p>
                <h1 className="legal-title">for apps</h1>
                <p className="legal-lede">
                    Programs are welcome to read what di.iiii shows the public. Say who you are,
                    and you get more room and a name in our guest book.
                </p>
            </header>

            <main className="legal-content">
                <p className="legal-updated">updated 2026-09-13</p>

                <section className="legal-section">
                    <h2>what you may read</h2>
                    <p>
                        Anything a visitor without an account can open: public spaces, published
                        pages, the list at <a href="/spaces">/spaces</a>, the <a href="/wiki">wiki</a>,
                        and the API reads behind them (<code>GET /serverXR/api/…</code> for a public
                        space). Search engines and AI crawlers — answering and training alike — are
                        welcome; see <a href="/robots.txt">robots.txt</a> and{' '}
                        <a href="/llms.txt">llms.txt</a>.
                    </p>
                </section>

                <section className="legal-section">
                    <h2>say who you are</h2>
                    <p>
                        Send a <code>User-Agent</code> header with your program&apos;s name and version,
                        and a way to reach you in parentheses — an email address or a web page:
                    </p>
                    <ul>
                        <li><code>User-Agent: SpaceMirror/1.4 ( ops@example.org )</code></li>
                        <li><code>User-Agent: my-research-bot/0.2 (+https://example.org/bot)</code></li>
                    </ul>
                    <p>
                        It is the same convention MusicBrainz asks of its API users. A library&apos;s
                        default — <code>curl/8</code>, <code>python-requests</code>,{' '}
                        <code>Go-http-client</code>, <code>node</code>, or no header at all — tells us
                        nothing, so it is treated as an anonymous program.
                    </p>
                </section>

                <section className="legal-section">
                    <h2>the limits</h2>
                    <ul>
                        <li>
                            Identified apps and crawlers: {IDENTIFIED_READS_PER_MINUTE} API reads a
                            minute from one address.
                        </li>
                        <li>
                            Anonymous programs: {ANONYMOUS_READS_PER_MINUTE} API reads a minute from
                            one address.
                        </li>
                        <li>People in a browser, and anyone signed in with an account or a token, are not counted against either.</li>
                    </ul>
                    <p>
                        Over the limit you get <code>429</code> with a <code>Retry-After</code> header;
                        wait that many seconds. Writing (uploads, sign-in, forms) has its own, stricter
                        limits. A name is only what a program says it is, so the per-address limits
                        apply whatever the header claims.
                    </p>
                </section>

                <section className="legal-section">
                    <h2>what is off-limits</h2>
                    <ul>
                        <li><code>/admin</code> and <code>/preferences</code>.</li>
                        <li>Private spaces, and anything else behind sign-in.</li>
                        <li>Guessing passwords or tokens, or creating accounts and guest sessions in bulk.</li>
                        <li>Sending forms automatically — open-call applications and inscriptions are for people.</li>
                    </ul>
                    <p>
                        A program that ignores this can be turned away by name; it then gets{' '}
                        <code>403</code> and a pointer back to this page.
                    </p>
                </section>

                <section className="legal-section">
                    <h2>what we keep about you</h2>
                    <p>
                        A count per day per program name, and the contact you put in your header.
                        No IP address, no list of the pages you read. Kept for 90 days. The full list
                        of what di.iiii stores is on the <a href="/privacy">privacy page</a>.
                    </p>
                </section>

                <section className="legal-section">
                    <h2>need more</h2>
                    <p>
                        A higher allowance, a bulk export, or a block you think is a mistake — write to{' '}
                        <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a> with your program&apos;s
                        name, how to reach you, what you read and how often.
                    </p>
                </section>
            </main>

            <footer className="legal-footer">
                <span className="legal-footer-brand">di<span className="legal-dot">.</span>iiii</span>
                <span className="legal-footer-note">for apps · thedi.studio</span>
            </footer>
        </div>
    )
}
