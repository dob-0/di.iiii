import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { Box, Button, Stack, Typography } from '@mui/material'
import { useKeyboardPageScroll } from '../hooks/useKeyboardPageScroll.js'
import { WIKI_HIGHLIGHTS } from '../wiki/wikiContent.js'
import { buildWikiPath, buildAppSpacePath } from '../utils/spaceRouting.js'
import { getServerConfig } from '../services/serverSpaces.js'
import { buildRawHubPath } from '../raw/utils/rawRouting.js'
import { ALGO_VRITHM_LABEL, ALGO_VRITHM_PATH, ALGO_VRITHM_SPACE_ID } from '../algoVrithm/algoVrithmRouting.js'
import { buildStudioSpacesPath } from '../studio/utils/studioRouting.js'

// Lazy, not static. As a plain import this pulled three.js (1.47 MB) and
// LiveProjectScene into the landing chunk for every visitor — including phones,
// which never render it. Gating the mount alone did nothing: a static import
// ships whether or not the component is used. Measured phone load before and
// after to confirm.
const GridFloorBackground = lazy(() => import('../components/GridFloorBackground.jsx'))

// The landing page promotes one experimental lane, and that is Raw (formerly
// Seed). Beta has been retired.
//
// Pointed at the communal 'open' space, not the bare '/raw' route: bare lane
// routes default to the 'main' space — di.iiii's restricted flagship, not a
// sandbox — so a guest session has no write scope there and AuthGate sends it
// to the read-only viewer instead of the editor it clicked for. Every session,
// guest included, already has implicit access to 'open'.
const RAW_LANE_HREF = buildRawHubPath('open')
// "Open Studio" goes to the spaces hub (`/studio`) for everyone. Two earlier
// passes landed one level too deep: `/open/studio?browse=1` is StudioHub, which
// despite the name is a *single space's project list* — the open space's — so
// the label promised the top level and delivered one room inside it. SpaceHub
// is guest-viewable (it renders the Open Space, the private sandbox and a
// "Sign in to create" affordance), so there is no session for which the
// narrower destination was the better one.
import './landing.css'

const FEATURED_SPACES = [
    { id: 'wcc', label: 'WCC Exhibition', href: '/wcc', className: 'landing-cta-wcc' },
    { id: 'br-id-ge', label: 'br_id_ge · live at Notations #2', href: '/br_id_ge', className: 'landing-cta-br-id-ge' },
    { id: 'beyond-form', label: 'beyond_form', href: '/beyond-form', className: 'landing-cta-beyond-form' },
    { id: ALGO_VRITHM_SPACE_ID, label: ALGO_VRITHM_LABEL, href: ALGO_VRITHM_PATH, className: 'landing-cta-algo-vrithm' }
]

// A `di up` install on the visitor's own machine has no accounts and no
// quota — the server says so (config.local + requireAuth off) and this page
// must not keep speaking hosted-product copy at someone who owns the whole
// disk. Not a separate "mode": one boolean, and the two hosted sentences
// below get local-truthful variants. Voice matches the wiki's local-install
// article ("Run di.iiii on your own machine").
const LOCAL_STEP_OPEN = { n: '01', title: 'Open a space', body: 'Click "Open Studio" or go to any space URL. This is your machine — everything here is yours to edit, no account involved.' }
const LOCAL_FEATURE_SPACES = { icon: '✦', title: 'Your machine, your spaces', desc: 'This di.iiii runs locally. Create as many spaces as you like — no sign-in, no quota, and your work stays in your own home folder.' }

const STEPS = [
    { n: '01', title: 'Open a space', body: 'Click "Step inside" or go to any space URL. No account required to view. Sign in only to edit.' },
    { n: '02', title: 'Add objects', body: 'Use the Library panel to add 3D shapes, text, images, or 3D models. Drag to position them.' },
    { n: '03', title: 'Customize your world', body: 'Change colors, lighting, camera angle, and background. Tweak with the Inspector on the right.' },
    { n: '04', title: 'Share or publish', body: 'Copy the space link to invite collaborators, or publish to make it live for the public.' }
]

const AUDIENCES = [
    {
        icon: (
            <svg viewBox="0 0 32 32" fill="none" className="lp-audience-icon">
                <rect x="4" y="20" width="8" height="8" stroke="currentColor" strokeWidth="1.5" rx="1"/>
                <rect x="12" y="12" width="8" height="16" stroke="currentColor" strokeWidth="1.5" rx="1"/>
                <rect x="20" y="6" width="8" height="22" stroke="currentColor" strokeWidth="1.5" rx="1"/>
            </svg>
        ),
        label: 'Artists & Creators',
        desc: 'Build visual worlds, 3D exhibitions, and immersive installations directly in the browser. No 3D software experience needed.'
    },
    {
        icon: (
            <svg viewBox="0 0 32 32" fill="none" className="lp-audience-icon">
                <polyline points="6,10 2,16 6,22" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                <polyline points="26,10 30,16 26,22" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                <line x1="11" y1="26" x2="21" y2="6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
        ),
        label: 'Developers',
        desc: 'Extend with node-based logic, connect via the serverXR API, embed in your own site, or build agent-driven experiences.'
    },
    {
        icon: (
            <svg viewBox="0 0 32 32" fill="none" className="lp-audience-icon">
                <circle cx="16" cy="16" r="12" stroke="currentColor" strokeWidth="1.5"/>
                <circle cx="16" cy="16" r="4" stroke="currentColor" strokeWidth="1.5"/>
                <line x1="16" y1="4" x2="16" y2="12" stroke="currentColor" strokeWidth="1.5"/>
                <line x1="16" y1="20" x2="16" y2="28" stroke="currentColor" strokeWidth="1.5"/>
                <line x1="4" y1="16" x2="12" y2="16" stroke="currentColor" strokeWidth="1.5"/>
                <line x1="20" y1="16" x2="28" y2="16" stroke="currentColor" strokeWidth="1.5"/>
            </svg>
        ),
        label: 'Event Organizers',
        desc: 'Create virtual venues, stage previews, and spatial layouts for live events, conferences, or art shows.'
    },
    {
        icon: (
            <svg viewBox="0 0 32 32" fill="none" className="lp-audience-icon">
                <rect x="4" y="8" width="24" height="16" rx="2" stroke="currentColor" strokeWidth="1.5"/>
                <path d="M10 14 L10 18 M14 12 L14 18 M18 15 L18 18 M22 13 L22 18" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                <line x1="16" y1="24" x2="16" y2="28" stroke="currentColor" strokeWidth="1.5"/>
                <line x1="10" y1="28" x2="22" y2="28" stroke="currentColor" strokeWidth="1.5"/>
            </svg>
        ),
        label: 'AI Agents',
        desc: 'Access scene state, modify objects, and read space data via the serverXR REST API. Machine-readable endpoints at /serverXR/api/.'
    }
]

const FEATURES = [
    { icon: '◈', title: 'Node-based scene graph', desc: 'Every object is a typed node. Wire them, group them, script them.' },
    { icon: '◉', title: 'Real-time collaboration', desc: 'See teammates\' cursors and changes live, in the same space.' },
    { icon: '⬡', title: 'WebXR ready', desc: 'Enter VR or AR from any supported browser — no app install.' },
    { icon: '◫', title: 'Asset pipeline', desc: 'Upload images, 3D models, audio. Optimized and served automatically.' },
    { icon: '◳', title: 'Spaces system', desc: 'Multiple isolated workspaces. Share by link. Lock editing or leave open.' },
    { icon: '◐', title: 'Publish anywhere', desc: 'Each space has a public URL. Export JSON. Embed or link directly.' },
    { icon: '◍', title: 'Guest & sandbox modes', desc: 'Visitors explore without an account — a shared global space, or a private sandbox each.' },
    { icon: '✦', title: '3 free spaces', desc: 'Sign in and create up to three of your own spaces for free. Admins are unlimited.' }
]

const ROUTES = [
    { path: '/', label: 'Landing — this page' },
    { path: '/studio', label: 'Studio — main authoring editor' },
    // Space-scoped, not the bare /raw this used to list. A bare lane route
    // defaults to the restricted 'main' space, where a guest session has no
    // write scope, so a visitor who clicked this from the route map landed on
    // "sign in to open the editor" instead of an editor.
    { path: '/open/raw', label: 'Raw — experimental node-first editor' },
    { path: '/:spaceId', label: 'Public space viewer' },
    { path: '/serverXR/api/health', label: 'Backend health (JSON)' },
    { path: '/serverXR/api/auth/session', label: 'Auth session state (JSON)' },
    { path: '/serverXR/api/spaces', label: 'All spaces list (JSON)' }
]

const CAPABILITIES = [
    'Read scene object list and properties',
    'Check space health and backend status',
    'List all available spaces',
    'Query auth session state',
    'Read asset manifest per space',
    'Trigger scene operations via ops API',
    'Monitor real-time events via WebSocket',
    'Publish scene state to server'
]

export default function LandingPage() {
    // One destination for every session. It used to branch on the session,
    // which also meant these static hrefs pointed at the guest destination
    // during the tick before getApiSession resolved — click fast enough as a
    // signed-in owner and you got sent somewhere else entirely.
    const studioHref = buildStudioSpacesPath()
    const [entered, setEntered] = useState(false)
    // Walk/fly and the calm orbiting view are both rendered by the same
    // GridFloorBackground while "entered" -- previously the only way back to
    // the orbit view once you'd moved was a full Exit + Enter Space round
    // trip. This lets you flip between them without leaving "entered" at all.
    const [viewMode, setViewMode] = useState(false)
    // The platform's "Main" space (set from /admin, or inline in Studio Hub's
    // per-space "Main" badge) is the same space that already represents the
    // platform elsewhere — reuse it here instead of a second, parallel
    // landing-only setting. When set, "Enter Space" opens that real,
    // populated space instead of the decorative walkable void this page's
    // own background renders.
    const [mainSpaceId, setMainSpaceId] = useState(null)
    // True only when the server declares itself a local install AND auth is
    // off — the pair that makes "sign in to edit" a false sentence. Read from
    // /api/config, which this page already fetches; deliberately NOT from
    // /api/auth/session, which would mint a guest session for every visitor.
    const [isLocalInstall, setIsLocalInstall] = useState(false)
    const [isMobile] = useState(() => typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches)
    // Phones do not get the decorative WebGL hero. landing.css has tried to
    // disable it below 520px since the hero was built, but the rule targets
    // `.lp-hero-canvas`, a class that no longer exists — the element is
    // `.lp-hero-bg`. Renaming the rule would not have helped either: this is a
    // *mount* problem, not a paint one. GridFloorBackground was rendered
    // unconditionally and the wrapper only toggled `display`, so every phone
    // visitor downloaded the 1.47 MB three-vendor chunk to look at something
    // CSS then hid. Gating the mount is what actually saves the bytes.
    const [isSmallScreen] = useState(() => typeof window !== 'undefined' && window.matchMedia?.('(max-width: 520px)').matches)
    const heroRef = useRef(null)
    const rootRef = useRef(null)

    // The page root is the only scroller (base.css fixes html/body/#root), and it
    // cannot take focus, so the reading keys need driving by hand.
    useKeyboardPageScroll(rootRef)

    useEffect(() => {
        let cancelled = false
        getServerConfig().then((cfg) => {
            if (cancelled) return
            setMainSpaceId(cfg?.defaultSpaceId || null)
            setIsLocalInstall(Boolean(cfg?.local) && cfg?.requireAuth === false)
        }).catch(() => {})
        return () => { cancelled = true }
    }, [])

    const handleEnterSpace = () => {
        if (mainSpaceId) {
            window.location.href = buildAppSpacePath(mainSpaceId)
            return
        }
        setEntered(true)
    }
    // The decorative WebGL background is fixed and full-screen; once the hero
    // scrolls out of view it's hidden behind opaque sections anyway. Stop
    // compositing/rendering it then so it doesn't stutter page scroll.
    const [heroInView, setHeroInView] = useState(true)

    useEffect(() => {
        document.body.classList.add('is-landing')
        return () => document.body.classList.remove('is-landing')
    }, [])

    useEffect(() => {
        const node = heroRef.current
        if (!node || typeof IntersectionObserver === 'undefined') return undefined
        const observer = new IntersectionObserver(
            ([entry]) => setHeroInView(entry.isIntersecting),
            { rootMargin: '0px' }
        )
        observer.observe(node)
        return () => observer.disconnect()
    }, [])

    useEffect(() => {
        if (!entered) return undefined
        const onKey = (e) => { if (e.key.toLowerCase() === 'v') setViewMode((v) => !v) }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
    }, [entered])

    // `entered` is exempt from the small-screen gate: "Step inside" *is* the
    // walkable scene, so a phone visitor who taps it has asked for three.js
    // and gets it then — on demand, rather than on every passive page view.
    const showBackground = entered || (heroInView && !isSmallScreen)

    return (
        <Box className="lp-root" data-page="landing" ref={rootRef}>

            {/* ── NAV ──────────────────────────────────────────── */}
            {!entered && (
                <nav className="lp-nav">
                    <a href="/" className="lp-nav-logo">di<span className="lp-dot">.</span>iiii</a>
                    <div className="lp-nav-links">
                        <a href={RAW_LANE_HREF} className="lp-nav-link">Raw</a>
                        <a href={buildWikiPath()} className="lp-nav-link">Wiki</a>
                        <a href="https://github.com/dob-0/di.iiii" target="_blank" rel="noopener noreferrer" className="lp-nav-link">GitHub</a>
                    </div>
                    <a href={RAW_LANE_HREF} className="lp-nav-cta">Enter Raw</a>
                </nav>
            )}

            {/* ── HERO ─────────────────────────────────────────── */}
            <Box className="lp-hero" component="section" ref={heroRef}>
                {showBackground && (
                    <Box className="lp-hero-bg" aria-hidden="true">
                        <Suspense fallback={null}>
                            <GridFloorBackground interactive={entered && !viewMode} />
                        </Suspense>
                    </Box>
                )}

                <Stack className={`lp-hero-inner${entered ? ' lp-hero-inner--hidden' : ''}`} alignItems="center" spacing={0}>
                    <Typography className="lp-eyebrow">
                        Web XR &nbsp;·&nbsp; Node-based creation &nbsp;·&nbsp; Spatial
                    </Typography>

                    <Typography className="lp-wordmark" component="h1">
                        di<span className="lp-dot">.</span>iiii
                    </Typography>

                    <Typography className="lp-tagline">
                        Build immersive 3D spatial experiences in your browser.<br />
                        No download. No install. Just open and create.
                    </Typography>

                    <Stack direction="row" spacing={2} sx={{ pt: 1, pb: 2, flexWrap: 'wrap', justifyContent: 'center' }}>
                        <Button className="landing-cta-primary" variant="contained" size="large" href={RAW_LANE_HREF}>
                            Step inside
                        </Button>
                        <Button className="landing-cta-ghost" variant="outlined" size="large" href={studioHref}>
                            Open Studio
                        </Button>
                        <Button className="landing-cta-ghost" variant="outlined" size="large" onClick={handleEnterSpace}>
                            Enter Space
                        </Button>
                    </Stack>

                    <Stack direction="row" spacing={1.5} sx={{ pb: 2, flexWrap: 'wrap', justifyContent: 'center' }}>
                        {FEATURED_SPACES.map((space) => (
                            <Button
                                key={space.id}
                                className={`landing-cta-ghost ${space.className}`}
                                variant="outlined"
                                size="small"
                                href={space.href}
                            >
                                {space.label}
                            </Button>
                        ))}
                    </Stack>

                    <Box component="a" className="lp-scroll-hint" href="#what" aria-label="Scroll to learn more">
                        <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                            <path d="M5 8l5 5 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                        </svg>
                    </Box>
                </Stack>

                {entered && (
                    <>
                        <button type="button" className="lp-enter-exit" onClick={() => { setEntered(false); setViewMode(false) }}>
                            ← Exit space
                        </button>
                        <button type="button" className="lp-enter-exit lp-enter-viewtoggle" onClick={() => setViewMode((v) => !v)}>
                            {viewMode ? '→ Walk / fly' : '◐ View mode'}
                        </button>
                        {!viewMode && (
                            <p className="lp-enter-hint">
                                {isMobile
                                    ? 'Joystick to move · Drag to look · Fly button to switch modes'
                                    : 'Walk (WASD) · Drag to look · F to fly (Space/Q up · C/E down) · V to view'}
                            </p>
                        )}
                    </>
                )}
            </Box>

            {!entered && (
            <>
            {/* ── WHAT IS DI.I ─────────────────────────────────── */}
            <Box className="lp-section" component="section" id="what">
                <Box className="lp-section-inner">
                    <Typography className="lp-section-eyebrow">The platform</Typography>
                    <Typography className="lp-section-title" component="h2">What is di.iiii?</Typography>
                    <Typography className="lp-section-body">
                        di.iiii is a collaborative 3D spatial editor that runs entirely in your web browser.
                        Think of it as a shared whiteboard — but in three dimensions.
                        Build scenes, place objects, set up lighting and cameras,
                        and invite others to join the same space in real time.
                    </Typography>

                    <Box className="lp-three-cols">
                        {[
                            {
                                vis: (
                                    <Box className="lp-col-vis">
                                        <Box className="lp-vis-box" />
                                        <Box className="lp-vis-box lp-vis-box-b" />
                                    </Box>
                                ),
                                title: 'Create',
                                body: 'Add 3D shapes, import models and images, write text in 3D space. Arrange everything with drag-and-drop controls.'
                            },
                            {
                                vis: (
                                    <Box className="lp-vis-collab">
                                        <Box className="lp-vis-dot lp-dot-a" />
                                        <Box className="lp-vis-dot lp-dot-b" />
                                        <Box className="lp-vis-dot lp-dot-c" />
                                        <Box className="lp-vis-pulse" />
                                    </Box>
                                ),
                                title: 'Collaborate',
                                body: 'Invite anyone with a link. See live cursors and changes. Work together across the world without any setup.'
                            },
                            {
                                vis: (
                                    <Box className="lp-vis-publish">
                                        <Box className="lp-vis-globe" />
                                        <Box className="lp-vis-arrow" />
                                    </Box>
                                ),
                                title: 'Publish',
                                body: 'Every space has a public URL. Share the link — visitors see your world in their browser or in VR/AR headsets.'
                            }
                        ].map((col) => (
                            <Box key={col.title} className="lp-col-card">
                                {col.vis}
                                <Typography className="lp-col-title" component="h3">{col.title}</Typography>
                                <Typography className="lp-col-body">{col.body}</Typography>
                            </Box>
                        ))}
                    </Box>
                </Box>
            </Box>

            {/* ── HOW IT WORKS ─────────────────────────────────── */}
            <Box className="lp-section" component="section" id="how">
                <Box className="lp-section-inner">
                    <Typography className="lp-section-eyebrow">Getting started</Typography>
                    <Typography className="lp-section-title" component="h2">How to use di.iiii</Typography>
                    <Typography className="lp-section-body">
                        You can be building your first 3D scene in under two minutes.
                    </Typography>

                    <Box className="lp-steps">
                        {(isLocalInstall ? [LOCAL_STEP_OPEN, ...STEPS.slice(1)] : STEPS).map((step) => (
                            <Box key={step.n} className="lp-step">
                                <Typography className="lp-step-num" aria-hidden="true">{step.n}</Typography>
                                <Box>
                                    <Typography className="lp-step-title" component="h3">{step.title}</Typography>
                                    <Typography className="lp-step-body">{step.body}</Typography>
                                </Box>
                            </Box>
                        ))}
                    </Box>

                    <Box className="lp-tip">
                        <Typography className="lp-tip-icon" component="span" aria-hidden="true">→</Typography>
                        <Typography className="lp-tip-text" component="span">
                            Keyboard shortcuts: <kbd>H</kbd> toggles the UI, <kbd>F</kbd> frames the scene, <kbd>Ctrl/⌘</kbd>+<kbd>Z</kbd> undoes the last action.
                        </Typography>
                    </Box>
                </Box>
            </Box>

            {/* ── WHO IS IT FOR ────────────────────────────────── */}
            <Box className="lp-section" component="section" id="who">
                <Box className="lp-section-inner">
                    <Typography className="lp-section-eyebrow">Audience</Typography>
                    <Typography className="lp-section-title" component="h2">Made for everyone</Typography>
                    <Typography className="lp-section-body">
                        di.iiii works for artists, developers, organizers, and automated systems alike.
                    </Typography>

                    <Box className="lp-audience-grid">
                        {AUDIENCES.map((a) => (
                            <Box key={a.label} className="lp-audience-card">
                                {a.icon}
                                <Typography className="lp-audience-label" component="h3">{a.label}</Typography>
                                <Typography className="lp-audience-desc">{a.desc}</Typography>
                            </Box>
                        ))}
                    </Box>
                </Box>
            </Box>

            {/* ── FEATURES ─────────────────────────────────────── */}
            <Box className="lp-section" component="section" id="features">
                <Box className="lp-section-inner">
                    <Typography className="lp-section-eyebrow">Capabilities</Typography>
                    <Typography className="lp-section-title" component="h2">What you can do</Typography>

                    <Box className="lp-feature-grid">
                        {(isLocalInstall
                            ? FEATURES.map((f) => (f.title === '3 free spaces' ? LOCAL_FEATURE_SPACES : f))
                            : FEATURES
                        ).map((f) => (
                            <Box key={f.title} className="lp-feature-card">
                                <Typography className="lp-feature-icon" component="span" aria-hidden="true">{f.icon}</Typography>
                                <Typography className="lp-feature-title" component="h3">{f.title}</Typography>
                                <Typography className="lp-feature-desc">{f.desc}</Typography>
                            </Box>
                        ))}
                    </Box>
                </Box>
            </Box>

            {/* ── HELP & WIKI ──────────────────────────────────── */}
            <Box className="lp-section" component="section" id="wiki">
                <Box className="lp-section-inner">
                    <Typography className="lp-section-eyebrow">Help &amp; Wiki</Typography>
                    <Typography className="lp-section-title" component="h2">Learn how it works</Typography>
                    <Typography className="lp-section-body">
                        New here? The Wiki explains spaces, guest &amp; sandbox modes, free accounts,
                        publishing, and the API — and it’s kept up to date as the platform grows.
                    </Typography>

                    <Box className="lp-feature-grid">
                        {WIKI_HIGHLIGHTS.map((a) => (
                            <Box
                                key={a.id}
                                component="a"
                                href={`${buildWikiPath()}#${a.id}`}
                                className="lp-feature-card lp-wiki-card"
                            >
                                <Typography className="lp-feature-title" component="h3">{a.title}</Typography>
                                <Typography className="lp-feature-desc">{a.summary}</Typography>
                                <Typography className="lp-wiki-card-more" component="span">Read →</Typography>
                            </Box>
                        ))}
                    </Box>

                    <Stack direction="row" spacing={2} sx={{ mt: 3, flexWrap: 'wrap' }}>
                        <Button className="landing-cta-ghost" variant="outlined" size="large" href={buildWikiPath()}>
                            Open the Wiki →
                        </Button>
                    </Stack>
                </Box>
            </Box>

            {/* ── FOR AI AGENTS ────────────────────────────────── */}
            <Box className="lp-section lp-ai-section" component="section" id="ai" data-machine-readable="true">
                <Box className="lp-section-inner">
                    <Typography className="lp-section-eyebrow">API &amp; agents</Typography>
                    <Typography className="lp-section-title" component="h2">For AI agents &amp; developers</Typography>
                    <Typography className="lp-section-body">
                        di.iiii exposes a structured REST API via serverXR. Agents and automated systems can
                        read scene state, list spaces, check health, and authenticate — all via JSON endpoints.
                    </Typography>

                    <Box className="lp-ai-cols">
                        <Box className="lp-ai-block">
                            <Typography className="lp-ai-block-title">Platform identity</Typography>
                            <Box className="lp-code-block">
                                {[
                                    ['name', 'di.iiii'],
                                    ['type', '3D spatial editor / WebXR platform'],
                                    ['version', '0.2.0'],
                                    ['backend', 'serverXR (Node.js)'],
                                    ['storage', 'SQLite + disk assets'],
                                    ['realtime', 'WebSocket (socket.io)']
                                ].map(([k, v]) => (
                                    <Box key={k} className="lp-code-line">
                                        <Typography component="span" className="lp-code-key">{k}:</Typography>
                                        <Typography component="span" className="lp-code-val"> {v}</Typography>
                                    </Box>
                                ))}
                            </Box>
                        </Box>

                        <Box className="lp-ai-block">
                            <Typography className="lp-ai-block-title">API routes</Typography>
                            <Box className="lp-route-list">
                                {ROUTES.map((r) => (
                                    <Box key={r.path} className="lp-route-row">
                                        <Typography component="code" className="lp-route-path">{r.path}</Typography>
                                        <Typography className="lp-route-label">{r.label}</Typography>
                                    </Box>
                                ))}
                            </Box>
                        </Box>
                    </Box>

                    <Box className="lp-ai-block lp-ai-caps">
                        <Typography className="lp-ai-block-title">Agent capabilities</Typography>
                        <Box className="lp-caps-grid">
                            {CAPABILITIES.map((cap) => (
                                <Box key={cap} className="lp-cap-item">
                                    <Typography component="span" className="lp-cap-check" aria-hidden="true">✓</Typography>
                                    <Typography component="span" className="lp-cap-text">{cap}</Typography>
                                </Box>
                            ))}
                        </Box>
                    </Box>
                </Box>
            </Box>

            {/* ── ENTER ────────────────────────────────────────── */}
            <Box className="lp-section lp-enter-section" component="section" id="enter">
                <Box className="lp-section-inner lp-enter-inner">
                    <Box className="lp-enter-glow" aria-hidden="true" />
                    <Typography className="lp-section-eyebrow">Ready?</Typography>
                    <Typography className="lp-enter-title" component="h2">
                        Start building your space.
                    </Typography>
                    <Typography className="lp-enter-body">
                        Step inside to build with everyone in the Open Space, or open Studio for the
                        classic panel-based editor.
                        Everything runs in your browser — no sign-up required to explore.
                    </Typography>
                    <Stack direction="row" spacing={2} sx={{ flexWrap: 'wrap', justifyContent: 'center', mb: 2 }}>
                        <Button className="landing-cta-primary" variant="contained" size="large" href={RAW_LANE_HREF}>
                            Step inside
                        </Button>
                        <Button className="landing-cta-ghost" variant="outlined" size="large" href={studioHref}>
                            Open Studio
                        </Button>
                        <Button className="landing-cta-ghost" variant="outlined" size="large" onClick={handleEnterSpace}>
                            Enter Space
                        </Button>
                    </Stack>
                    <Typography className="lp-enter-note">
                        Armenia &nbsp;·&nbsp; Web XR &nbsp;·&nbsp; <a href="https://thedi.studio" target="_blank" rel="noopener noreferrer" style={{ color: 'inherit' }}>thedi.studio</a>
                    </Typography>
                </Box>
            </Box>

            {/* ── FOOTER ───────────────────────────────────────── */}
            <footer className="lp-footer">
                <div className="lp-footer-inner">
                    <span className="lp-footer-brand">di<span className="lp-dot">.</span>iiii</span>
                    {/* inline flex-wrap: the nav row outgrew its one-line CSS
                        when Privacy/Terms/Instagram joined; .lp-footer-inner
                        already wraps, this lets the links themselves follow */}
                    <nav className="lp-footer-nav" aria-label="Footer navigation" style={{ flexWrap: 'wrap' }}>
                        <a href={RAW_LANE_HREF} className="lp-footer-link">Raw</a>
                        <a href={studioHref} className="lp-footer-link">Studio</a>
                        <a href={buildWikiPath()} className="lp-footer-link">Wiki</a>
                        <a href="/privacy" className="lp-footer-link">Privacy</a>
                        <a href="/terms" className="lp-footer-link">Terms</a>
                        <a href="https://github.com/dob-0/di.iiii" target="_blank" rel="noopener noreferrer" className="lp-footer-link">GitHub</a>
                        <a href="https://www.instagram.com/di.iiiiiiiiiiiiiiiiiiiii/" target="_blank" rel="noopener noreferrer" className="lp-footer-link">Instagram</a>
                        <a href="/serverXR/api/health" className="lp-footer-link">API</a>
                    </nav>
                    <span className="lp-footer-note">Open source · Web XR · <a href="https://thedi.studio" target="_blank" rel="noopener noreferrer" style={{ color: 'inherit' }}>thedi.studio</a></span>
                </div>
            </footer>
            </>
            )}

        </Box>
    )
}
