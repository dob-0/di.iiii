import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { useKeyboardPageScroll } from '../hooks/useKeyboardPageScroll.js'
import useAuthSession from '../hooks/useAuthSession.js'
import useDocumentTitle from '../hooks/useDocumentTitle.js'
import { WIKI_ARTICLES, WIKI_CATEGORIES } from './wikiContent.js'
import './wiki.css'
import SurfaceBar from '../components/SurfaceBar.jsx'
import { isEmbedRequest } from '../utils/previewMode.js'
import useLocalInstall from '../hooks/useLocalInstall.js'
import { buildWikiArticlePath, buildWikiPath } from '../utils/spaceRouting.js'

// Lazy, not static — same fix as LandingPage.jsx: a plain import ships the
// three.js vendor chunk (1.47 MB) to every wiki reader, phones included,
// whether or not the decorative background ever renders.
const GridFloorBackground = lazy(() => import('../components/GridFloorBackground.jsx'))

function ArticleBody({ body }) {
    return body.map((block, i) => {
        if (block && typeof block === 'object' && Array.isArray(block.list)) {
            return (
                <ul key={i} className="wiki-list">
                    {block.list.map((item, j) => <li key={j}>{item}</li>)}
                </ul>
            )
        }
        return <p key={i} className="wiki-paragraph">{block}</p>
    })
}

// The page's meta description, for a reader that runs scripts (a crawler that
// does not gets serverXR's og card, which says the same thing). Put back on
// leaving, like useDocumentTitle puts back the title.
function useMetaDescription(text) {
    useEffect(() => {
        if (!text || typeof document === 'undefined') return undefined
        let tag = document.querySelector('meta[name="description"]')
        const created = !tag
        if (created) {
            tag = document.createElement('meta')
            tag.setAttribute('name', 'description')
            document.head.appendChild(tag)
        }
        const previous = tag.getAttribute('content')
        tag.setAttribute('content', text)
        return () => {
            if (created) tag.remove()
            else if (previous != null) tag.setAttribute('content', previous)
        }
    }, [text])
}

export default function WikiPage({ articleId = null }) {
    const [query, setQuery] = useState('')
    // Same admin gate as StudioHub. While auth resolves, role is null
    // and the link stays hidden — anonymous readers never see a dead end.
    // Trade-off: /api/auth/session issues a guest session to first-time
    // visitors (LandingPage avoids it for exactly that reason) — accepted here
    // to reuse the one canonical role check rather than invent a second.
    const { role } = useAuthSession()
    // The lighting desk only exists where di.iiii is actually running, so the
    // bar offers it only there.
    const localInstall = useLocalInstall()
    const isEmbed = isEmbedRequest()

    // Every article has its own address, /wiki/{id} (2026-10-21, G25); the
    // page is still one long scroller, and the single page stays the index.
    // The article the address names — or, for a link made before, the old
    // /wiki#{id} — is the only "current article" this page can honestly name.
    // Read once, on arrival, the same way the deep-link scroll below reads it
    // once — not a scroll-spy that renames the tab as you read past each section.
    const openedOnArticle = useMemo(() => {
        if (typeof window === 'undefined') return null
        const id = articleId || window.location.hash.replace('#', '')
        return id ? WIKI_ARTICLES.find((a) => a.id === id) || null : null
    }, [articleId])
    useDocumentTitle(openedOnArticle ? `${openedOnArticle.title} — Wiki — di.iiii` : 'Wiki — di.iiii')
    useMetaDescription(openedOnArticle ? openedOnArticle.summary : null)

    useEffect(() => {
        document.body.classList.add('is-landing')
        return () => document.body.classList.remove('is-landing')
    }, [])

    // .wiki-root cannot take focus, so without this the reading keys are dead
    // on a page that is nothing but reading.
    const rootRef = useRef(null)
    useKeyboardPageScroll(rootRef)

    // The page scrolls inside .wiki-root (not the document), so native #hash
    // anchors don't work — scroll the target into view explicitly. Also handles
    // deep-links like /wiki#admin-manage on first load.
    const scrollToArticle = (id, smooth = true) => {
        const el = document.getElementById(id)
        if (!el) return
        el.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto', block: 'start' })
        if (window.history?.replaceState) window.history.replaceState(null, '', buildWikiArticlePath(id))
    }

    useEffect(() => {
        if (openedOnArticle) requestAnimationFrame(() => scrollToArticle(openedOnArticle.id, false))
        // An id the wiki does not have: the index, at the index's address,
        // rather than a page whose address names something it does not show.
        else if (articleId && window.history?.replaceState) window.history.replaceState(null, '', buildWikiPath())
    }, [articleId, openedOnArticle])

    const filtered = useMemo(() => {
        const q = query.trim().toLowerCase()
        if (!q) return WIKI_ARTICLES
        return WIKI_ARTICLES.filter((a) => {
            const haystack = `${a.title} ${a.summary} ${(a.tags || []).join(' ')} ${a.category}`.toLowerCase()
            return haystack.includes(q)
        })
    }, [query])

    const grouped = useMemo(() => (
        WIKI_CATEGORIES
            .map((category) => ({ category, items: filtered.filter((a) => a.category === category) }))
            .filter((group) => group.items.length > 0)
    ), [filtered])

    return (
        <div className="wiki-root" data-page="wiki" ref={rootRef}>
            <Suspense fallback={null}>
                <GridFloorBackground aria-hidden="true" interactive={false} />
            </Suspense>

            {/* The wiki described Raw, Tools and the lighting desk in named
                sections and linked to none of them; its own way home was a
                fourth name ("← Home") for the screen three other surfaces
                already called three other things. One bar, one set of names. */}
            <SurfaceBar here="wiki" isLocalInstall={localInstall.isLocal} hidden={isEmbed}>
                {role === 'admin' && <a className="sbar-link" href="/admin">Admin</a>}
            </SurfaceBar>

            <header className="wiki-header">
                <p className="wiki-eyebrow">Help &amp; Wiki</p>
                <h1 className="wiki-title">How di.iiii works</h1>
                <p className="wiki-lede">
                    Guides for spaces, access, editing, and the API. Kept up to date as di.iiii grows.
                </p>
                <input
                    type="search"
                    className="wiki-search"
                    placeholder="Search the wiki…"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    aria-label="Search the wiki"
                />
            </header>

            <div className="wiki-layout">
                <aside className="wiki-sidebar" aria-label="Wiki contents">
                    {grouped.map((group) => (
                        <div key={group.category} className="wiki-sidebar-group">
                            <p className="wiki-sidebar-category">{group.category}</p>
                            {group.items.map((a) => (
                                <a
                                    key={a.id}
                                    href={buildWikiArticlePath(a.id)}
                                    className="wiki-sidebar-link"
                                    onClick={(e) => { e.preventDefault(); scrollToArticle(a.id) }}
                                >
                                    {a.title}
                                </a>
                            ))}
                        </div>
                    ))}
                    {grouped.length === 0 && <p className="wiki-empty">No articles match “{query}”.</p>}
                </aside>

                <main className="wiki-content">
                    {filtered.map((a) => (
                        <article key={a.id} id={a.id} className="wiki-article">
                            <p className="wiki-article-category">{a.category}</p>
                            <h2 className="wiki-article-title">{a.title}</h2>
                            <p className="wiki-article-summary">{a.summary}</p>
                            <div className="wiki-article-body"><ArticleBody body={a.body} /></div>
                            <p className="wiki-article-updated">Updated {a.updated}</p>
                        </article>
                    ))}
                    {filtered.length === 0 && (
                        <p className="wiki-empty">Nothing here yet — try a different search.</p>
                    )}
                </main>
            </div>

            <footer className="wiki-footer">
                <span className="wiki-footer-brand">di<span className="wiki-dot">.</span>iiii</span>
                <span className="wiki-footer-note">Help &amp; Wiki · thedi.studio</span>
            </footer>
        </div>
    )
}
