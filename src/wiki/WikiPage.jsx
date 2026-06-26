import { useEffect, useMemo, useState } from 'react'
import GridFloorBackground from '../components/GridFloorBackground.jsx'
import { WIKI_ARTICLES, WIKI_CATEGORIES } from './wikiContent.js'
import './wiki.css'

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

export default function WikiPage() {
    const [query, setQuery] = useState('')

    useEffect(() => {
        document.body.classList.add('is-landing')
        return () => document.body.classList.remove('is-landing')
    }, [])

    // The page scrolls inside .wiki-root (not the document), so native #hash
    // anchors don't work — scroll the target into view explicitly. Also handles
    // deep-links like /wiki#admin-manage on first load.
    const scrollToArticle = (id, smooth = true) => {
        const el = document.getElementById(id)
        if (!el) return
        el.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto', block: 'start' })
        if (window.history?.replaceState) window.history.replaceState(null, '', `#${id}`)
    }

    useEffect(() => {
        const id = window.location.hash.replace('#', '')
        if (id) requestAnimationFrame(() => scrollToArticle(id, false))
    }, [])

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
        <div className="wiki-root" data-page="wiki">
            <GridFloorBackground aria-hidden="true" interactive={false} />

            <nav className="wiki-nav">
                <a href="/" className="wiki-nav-logo">di<span className="wiki-dot">.</span>iiii</a>
                <div className="wiki-nav-links">
                    <a href="/" className="wiki-nav-link">← Home</a>
                    <a href="/studio" className="wiki-nav-link">Studio</a>
                    <a href="/admin" className="wiki-nav-link">Admin</a>
                </div>
            </nav>

            <header className="wiki-header">
                <p className="wiki-eyebrow">Help &amp; Wiki</p>
                <h1 className="wiki-title">How di.iiii works</h1>
                <p className="wiki-lede">
                    Guides for spaces, access, editing, and the API. Kept up to date as the platform grows.
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
                                    href={`#${a.id}`}
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
