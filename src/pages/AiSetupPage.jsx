import { useRef } from 'react'
import { useKeyboardPageScroll } from '../hooks/useKeyboardPageScroll.js'
import useDocumentTitle from '../hooks/useDocumentTitle.js'
import './legal.css'

// /ai/setup — how a person connects an assistant to di.iiii at their level.
// The same words live as markdown in docs/ai/public/setup.md, which serverXR
// serves at /ai/setup.md for assistants; AiSetupPage.test.jsx fails when a
// command or address on one is missing from the other. Same shell as /for-apps.

const CONTACT_EMAIL = 'info@thedi.studio'

export const NO_KEY_ADDRESSES = [
    ['https://diiii.xyz/llms.txt', 'the map. What di.iiii is, and where everything else is.'],
    ['https://diiii.xyz/ai/context', 'the context. What di.iiii is and the words it uses, in one page.'],
    ['https://diiii.xyz/ai/words.md', 'the words alone, one meaning each.']
]
export const LEVELS = ['public', 'registered', 'partner', 'crew', 'core', 'owner']
export const COMMANDS = {
    start: 'Read https://diiii.xyz/ai/context first, then answer in its words.',
    install: 'curl -fsSL https://diiii.xyz/get | sh',
    login: 'di login --to https://diiii.xyz',
    read: 'curl -H "Authorization: Bearer $DI_TOKEN" https://diiii.xyz/ai/context',
    mcp: 'claude mcp add di -- di mcp --base https://diiii.xyz/serverXR',
    http: 'node sdk/mcp.mjs --http 8787 --base https://diiii.xyz/serverXR'
}
export const TOOLS = ['di_find', 'di_describe', 'di_call', 'di_run', 'di_context']

export default function AiSetupPage() {
    const rootRef = useRef(null)
    useKeyboardPageScroll(rootRef)
    useDocumentTitle('Connect your assistant — di.iiii')

    return (
        <div className="legal-root" data-page="ai-setup" ref={rootRef}>
            <nav className="legal-nav">
                <a href="/" className="legal-nav-logo">di<span className="legal-dot">.</span>iiii</a>
                <div className="legal-nav-links">
                    <a href="/" className="legal-nav-link">← Home</a>
                    <a href="/wiki" className="legal-nav-link">Wiki</a>
                    <a href="/for-apps" className="legal-nav-link">For apps</a>
                </div>
            </nav>

            <header className="legal-header">
                <p className="legal-eyebrow">for you and your assistant</p>
                <h1 className="legal-title">connect your assistant</h1>
                <p className="legal-lede">
                    Any assistant can read what di.iiii shows the public: give it an address. To let
                    it read more, or act for you, give it a key; the key decides how far it reaches.
                </p>
            </header>

            <main className="legal-content">
                <p className="legal-updated">updated 2026-10-27 · for assistants: <a href="/ai/setup.md">/ai/setup.md</a></p>

                <section className="legal-section">
                    <h2>any assistant, no key</h2>
                    <p>
                        Claude on the web, ChatGPT, duck.ai, Gemini, Perplexity: anything that can open a
                        web address. Paste one of these into the chat and ask it to read it first.
                    </p>
                    <ul>
                        {NO_KEY_ADDRESSES.map(([url, note]) => (
                            <li key={url}><code>{url}</code>: {note}</li>
                        ))}
                    </ul>
                    <p>A line to start with:</p>
                    <pre><code>{COMMANDS.start}</code></pre>
                    <p>
                        Without a key, an assistant reads only what anyone can read. A chat on the web
                        cannot send a key, so this is as far as it goes.
                    </p>
                </section>

                <section className="legal-section">
                    <h2>your level, with a key</h2>
                    <p>
                        di.iiii keeps its context at six levels: {LEVELS.join(', ')}. Your key decides
                        yours; the server reads it from the key, never from what the assistant says. You
                        can ask for a lower level, never a higher one: that answer is 403.
                    </p>
                    <p>Get a key by signing in from a terminal, once:</p>
                    <pre><code>{`${COMMANDS.install}\n${COMMANDS.login}`}</code></pre>
                    <p>
                        Then read your level, with the key the login saved
                        in <code>~/.config/di/credentials.json</code> (or set <code>DI_TOKEN</code>):
                    </p>
                    <pre><code>{COMMANDS.read}</code></pre>
                </section>

                <section className="legal-section">
                    <h2>an assistant on your own machine</h2>
                    <p>
                        Claude Code, and any other assistant that speaks MCP (the Model Context
                        Protocol), can use di.iiii as a set of tools. After <code>di login</code>, add it once:
                    </p>
                    <pre><code>{COMMANDS.mcp}</code></pre>
                    <p>
                        The tools: {TOOLS.map((tool, i) => (
                            <span key={tool}>{i ? ', ' : ''}<code>{tool}</code></span>
                        ))} (the last is the context at your level). The assistant acts as you, never
                        past your own access. Anything public (making a space public, an invite link,
                        deleting) is refused unless you started it with <code>DI_MCP_ALLOW_PUBLIC=1</code>,
                        and each call still has to carry your yes.
                    </p>
                </section>

                <section className="legal-section">
                    <h2>the door over HTTP</h2>
                    <p>
                        For an assistant that adds tools by address, the same door runs over HTTP on a
                        machine you choose:
                    </p>
                    <pre><code>{COMMANDS.http}</code></pre>
                    <p>
                        Every request to it must carry <code>Authorization: Bearer</code> with an act
                        token from the studio&apos;s Telegram bot; without one it answers 401. Over HTTP it
                        never makes anything public.
                    </p>
                </section>

                <section className="legal-section">
                    <h2>more</h2>
                    <p>
                        How a program should name itself, and the limits: <a href="/for-apps">for apps</a>.
                        The API and the tools in full: <a href="/wiki/api-and-agents">API &amp; agents</a>.
                        Questions: <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
                    </p>
                </section>
            </main>
        </div>
    )
}
