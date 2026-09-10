import { useCallback, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { setAppNavigate } from '../../utils/appNavigate.js'
import { readArtistEnterMessage } from '../artistEnterMessage.js'
import LandingPage from './LandingPage.jsx'

/**
 * The landing page, standing on its own — the entry `scripts/wcc-page-snapshot.mjs`
 * compiles into the `code` project that shows the landing inside the `wcc` space.
 *
 * WHY THIS FILE EXISTS. `/wcc` is compiled React with no rows in any database
 * (see src/works/works.js), so the space's own project list could not show it:
 * the owner opened /wcc/studio, counted eleven artist projects, and asked where
 * the landing page was. He was told a copy in the database becomes a second
 * source of truth, and chose the copy anyway (2026-09-10). This is that copy —
 * compiled FROM the real source rather than retyped from it, so the only way it
 * can drift is by nobody re-running the script.
 *
 * It renders the same `LandingPage` component the route renders, so every
 * section — the GSAP scrub, the R3F process field, the Armenian toggle — is the
 * real one and not an impression of it. Three things differ, and each is forced
 * by where the copy has to live (a sandboxed `about:srcdoc` iframe with an
 * opaque origin, src/utils/presentationPreviewDocument.js):
 *
 *   1. Going somewhere means the TOP window. `appNavigate`'s fallback is
 *      `window.location.assign`, which inside the iframe would load the whole
 *      app into the frame at an origin that cannot boot. Every exit — a panel
 *      link, "Enter space", the artist-works iframe's postMessage — leaves
 *      through `window.top` instead, which PAGE_SANDBOX allows on a click.
 *   2. Entering the exhibition is a navigation, not a transition. The route
 *      dissolves the landing into `LiveProjectScene` in place; a snapshot has
 *      no scene next to it, so it hands the visitor to the real address.
 *   3. `WccExperience`'s language state lives here, because the snapshot is the
 *      landing alone and nothing above it holds that state.
 */

const SCENE_PATH = '/wcc/scene'

// A click inside the frame is a user activation, which is exactly what
// allow-top-navigation-by-user-activation asks for. Falls back to this window
// when there is no parent — running the built page directly, out of an iframe.
const navigateTop = (path) => {
    if (typeof window === 'undefined' || !path) return
    try {
        const target = window.top || window
        target.location.href = path
    } catch {
        window.location.href = path
    }
}

function WccLandingSnapshot() {
    const [lang, setLang] = useState('en')

    // The route enters the exhibition in place; here the artist's own project
    // address is the honest destination — /wcc/<slug> is the same project the
    // scene would have shown, and /wcc/scene is the whole ring.
    const enterExhibition = useCallback((projectId = null) => {
        const pid = typeof projectId === 'string' ? projectId : null
        navigateTop(pid ? `/wcc/${pid}` : SCENE_PATH)
    }, [])

    // Same guard the route uses, unchanged: inside the sandbox both this
    // document and the nested artist-works iframe carry the same opaque origin,
    // so the origin check still compares like with like.
    useEffect(() => {
        const onMessage = (event) => {
            const pid = readArtistEnterMessage(event, window.location.origin)
            if (pid) enterExhibition(pid)
        }
        window.addEventListener('message', onMessage)
        return () => window.removeEventListener('message', onMessage)
    }, [enterExhibition])

    return <LandingPage lang={lang} onEnterExhibition={enterExhibition} onLangChange={setLang} />
}

// Set before the first render, not in an effect: `handleAppLinkClick` is the
// one funnel every in-page link goes through, and it must never fall through to
// this frame's own `location.assign`.
setAppNavigate((path) => navigateTop(path))

const mount = document.getElementById('wcc-landing-root')
if (mount) createRoot(mount).render(<WccLandingSnapshot />)
