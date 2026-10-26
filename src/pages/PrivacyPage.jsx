import { useRef } from 'react'
import { useKeyboardPageScroll } from '../hooks/useKeyboardPageScroll.js'
import useDocumentTitle from '../hooks/useDocumentTitle.js'
import './legal.css'

// Written from docs/ai/privacy-data-inventory.md — a code audit, every claim
// traced to source. If the code changes, this page must change with it.
// PrivacyPage.test.jsx holds the page to the server: every sign-in in
// GET /api/auth/providers is named here, every link and session lifetime
// matches, and what the logs, the chat stores and the clean-ups do is said
// the way the code does it (2026-10-26).
const CONTACT_EMAIL = 'info@thedi.studio'

export default function PrivacyPage() {
    const rootRef = useRef(null)
    useKeyboardPageScroll(rootRef)

    // Sentence case for the page word, not the lowercase the page used to
    // carry — see docs/ai/vocabulary.md's naming rule.
    useDocumentTitle('Privacy — di.iiii')

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
                <p className="legal-updated">updated 2026-10-26 · audited against the codebase 2026-07-28; sessions, signing in, logs, chat and retention re-checked 2026-10-26</p>

                <section className="legal-section">
                    <h2>the session cookie</h2>
                    <p>
                        One cookie: <code>dii_serverxr_session</code>. HttpOnly, same-site. It holds a
                        signed payload — who you are, your role, which spaces you can enter — not a
                        tracking id. If you haven&apos;t set a display name, your email address stands in
                        as your label, so the cookie can contain your email.
                    </p>
                    <p>
                        Lifetime: 12 hours signed in, 7 days as a guest. Guests get a random id and
                        the label &quot;Guest&quot; — no personal data.
                    </p>
                    <p>
                        Signing out ends every session of your account at once, on every device:
                        each cookie made before it stops working. A guest session has no account
                        to sign out of; it ends when it runs out or its cookie is cleared.
                    </p>
                </section>

                <section className="legal-section">
                    <h2>signing in</h2>
                    <p>
                        Every account comes from one of four sign-ins: GitHub, Google, Telegram, or a
                        password. Password sign-in is always offered; GitHub, Google and Telegram only
                        where this di.iiii is set up for them. All four make the same kind of account
                        and the same session cookie.
                    </p>
                    <p>
                        <strong>GitHub or Google.</strong> Four fields are kept per account: provider
                        id, email, display name, avatar URL. The OAuth access tokens are discarded —
                        di.iiii cannot act on your GitHub or Google account after sign-in.
                    </p>
                    <p>
                        One exception: if you explicitly connect Google Drive to import a file, that
                        token is kept — encrypted at rest — so the import works. Disconnecting Drive
                        is the way to revoke it.
                    </p>
                    <p>
                        <strong>Telegram.</strong> The sign-in button opens our Telegram bot, which
                        sends sign-in links only in a private chat. Of what Telegram tells the bot
                        about you, it passes on two things: your numeric Telegram id, and the name on
                        your profile (your Telegram username if the profile has no name). Those two
                        are what the account keeps, and the name is refreshed each time you sign in
                        this way. No email address and no phone number are kept. A picture would be
                        kept only as a link to Telegram&apos;s own servers, and the bot sends none.
                    </p>
                    <p>
                        The sign-in link works once, for 10 minutes. The server keeps a short record
                        of it: your Telegram id, the name, and a SHA-256 fingerprint in place of the
                        link itself. A clean-up that runs every half hour deletes the record once the
                        link has been used or has run out. The bot can also ask which account your
                        Telegram id belongs to and which spaces that account can open, to answer you
                        in a private chat; nothing is written when it asks.
                    </p>
                    <p>
                        <strong>Password.</strong> An email address or a username, a password, and a
                        display name if you give one; without one, your username or address is used
                        as your name. The password itself is never stored, only a scrypt hash with a
                        random salt: enough to check a password, never enough to read one back. The
                        time you confirmed your address is kept too.
                    </p>
                    <p>
                        Where this di.iiii can send mail, it sends three kinds of link: confirm your
                        address (works for 24 hours), set a new password (30 minutes), and sign in
                        without the password (15 minutes). Each works once. Mail goes out through the
                        mail server this di.iiii is set up with. For every link, the server keeps which
                        account it was for, its kind, when it was made, used and runs out, and a
                        SHA-256 fingerprint in place of the link itself. Nothing deletes these
                        records today: they are kept after the link is used or runs out. An
                        account with a username and no email address cannot be recovered by mail
                        if its password is lost.
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
                        display names, and your projects. They stay on your machine, with one
                        exception: when you open a space or project live, your browser sends the
                        pseudonymous id and the name you appear under to the server, which shows
                        them to the others there. There is no consent banner; this page is the
                        disclosure. The keys are listed, and clearable, in Preferences.
                    </p>
                </section>

                <section className="legal-section">
                    <h2>logs and realtime</h2>
                    <p>
                        Server logs record each request&apos;s method, URL, status, size and
                        duration — no IP address, no user agent. A few lines also say who an event
                        concerns. When someone joins a space or project live, the line holds the
                        name their browser sent and which space or project it was. When a terminal
                        or our Telegram bot gets a key to act for an account, and when such a key
                        is approved or turned down, ended, or held back from a session cookie, the
                        line holds the account id.
                    </p>
                    <p>
                        IP addresses are used in memory, for rate limiting and to tell this machine
                        from others. The one place the server stores one is a change that waits
                        for approval. Where this di.iiii has an approval bot set up, some changes
                        wait for a person to approve them: a space file proposed by someone that
                        space does not trust, and admin-level changes when the approval gate is
                        switched on. For each, the server keeps who asked (account id, role, and
                        name or email address), what would change, the request&apos;s method, path
                        and IP address, and when. Nothing deletes these records: one that runs out
                        is marked expired and kept. The bot is sent a summary of the change and
                        who asked, to show the person who decides.
                    </p>
                    <p>
                        Presence and cursors are relayed live and never stored. Chat is stored:
                        each space keeps the last 500 lines of its chat, each with the name and id
                        it was sent under, the text and the time, plus one pinned line; a line can
                        be removed. Mesh rooms, which link several devices live, keep the last
                        5,000 lines of their talk.
                    </p>
                    <p>
                        Conversations with the AI assistant are kept with your account until you
                        delete them. Your messages are sent to the model server this di.iiii is
                        set up with.
                    </p>
                </section>

                <section className="legal-section">
                    <h2>third parties</h2>
                    <p>
                        No third-party tracking in the main app: no analytics, no telemetry, no
                        error reporting, no session replay, no tag manager. The site loads its own
                        assets, including fonts. Where this di.iiii is set up with them, other
                        services receive what the sections above say: the sign-in you choose,
                        Google Drive if you connect it, the mail server, the model server and the
                        approval bot.
                    </p>
                    <p>
                        We count our own traffic, anonymously: one first-party event per page load
                        recording the path, the time, and the referring site&apos;s hostname —
                        no cookie, no IP address, no browser fingerprint, no user id, nothing that
                        links two visits together. It answers &quot;how many, from where&quot; and
                        cannot answer &quot;who&quot;.
                    </p>
                    <p>
                        Programs that call our API — apps, crawlers, scripts — are counted the same
                        way: per day, by the name they give in their User-Agent header, plus the
                        contact an app chose to publish there. No IP address, no pages read, and a
                        browser is only ever part of one daily total. Kept 90 days. How programs are
                        asked to identify: <a href="/for-apps">/for-apps</a>.
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
                        <li>Edit history keeps at most the last 500 changes of each space and each
                            project.</li>
                        <li>Accounts, open-call applications, published assets, mail-link records
                            and approval records have no retention limit — nothing deletes them
                            automatically; they persist until removed by hand.</li>
                        <li>Backups, as this codebase&apos;s backup scripts make them: nightly, kept
                            on the server for 14 days, and pulled off it to a second machine that
                            keeps the last 30. A backup restore can bring back data deleted in the
                            meantime — there is no exclusion mechanism yet.</li>
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
                        <li><strong>No way to end one session alone.</strong> Signing out ends all of
                            your account&apos;s sessions at once; one device cannot be signed out on
                            its own.</li>
                        <li><strong>No retention limit</strong> on accounts, open-call applications,
                            published assets, mail-link records or approval records — see above.</li>
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
