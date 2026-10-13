import { useEffect } from 'react'

// Keeps a private screen out of search results: adds <meta name="robots"
// content="noindex"> to the head while the screen is mounted and takes it away
// when it goes. It is the page's own word to crawlers that run scripts; it does
// not replace a server-side X-Robots-Tag, which only the web server can send.
//
// robots.txt is not the tool for this — it is pinned by ForAppsPage.test.jsx to
// two Disallow lines (the owner's call, 2026-09-13) — and a Disallow there would
// stop a crawler reading this very tag.
export default function useNoIndex() {
    useEffect(() => {
        const meta = document.createElement('meta')
        meta.setAttribute('name', 'robots')
        meta.setAttribute('content', 'noindex')
        document.head.appendChild(meta)
        return () => { meta.remove() }
    }, [])
}
