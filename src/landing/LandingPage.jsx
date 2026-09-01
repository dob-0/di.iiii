/* global __APP_VERSION__ */
import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { Box, Button, Stack, Typography } from '@mui/material'
import { useKeyboardPageScroll } from '../hooks/useKeyboardPageScroll.js'
import { WIKI_HIGHLIGHTS } from '../wiki/wikiContent.js'
import { buildWikiPath, buildAppSpacePath } from '../utils/spaceRouting.js'
import { getServerConfig } from '../services/serverSpaces.js'
import { buildSpacesPath } from '../studio/utils/studioRouting.js'
import { flyInside, REST_POSE } from './enterFlight.js'

// Lazy, not static. As a plain import this pulled three.js (1.47 MB) and
// LiveProjectScene into the landing chunk for every visitor — including phones,
// which never render it. Gating the mount alone did nothing: a static import
// ships whether or not the component is used. Measured phone load before and
// after to confirm.
const GridFloorBackground = lazy(() => import('../components/GridFloorBackground.jsx'))

// The room's own words, kept quiet while the page is saying them. Frozen so
// the prop identity is stable and the scene is not re-rendered every frame.
const HERO_ECHO_TYPES = Object.freeze(['text'])

// How long the door waits for the 3D chunk on a device that had not mounted it
// — a ceiling, not a delay: the import usually resolves well inside it.
const DOOR_SCENE_WAIT_MS = 1200

// The door used to be `buildRawCanvasPath('open')` — the node canvas that lives
// in the browser's own storage. It cannot save into a space and cannot publish,
// so the front page's one door opened onto the one surface where nothing a
// visitor makes survives or can be handed to anyone. It now opens the visitor's
// OWN space, where Studio and Nodes sit side by side and "View live" exists.
//
// Progressive enhancement, on purpose: the href stays a real destination for
// no-JS, middle-click and crawlers. The click no longer upgrades it to a
// sandbox — it flies into the room that is already on screen — so nothing on
// this page asks for a session any more, which also means a passive visit can
// no longer mint a guest one by accident.
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
    // Was "br_id_ge · live at Notations #2". Notations #2 closed 2026-08-02;
    // the front door went on announcing it as live for a month, on prod. The
    // space itself is still open and still worth visiting, which is the whole
    // claim this row is allowed to make — so it says the name, like the other
    // three, and stops dating itself.
    { id: 'br-id-ge', label: 'br_id_ge', href: '/br_id_ge', className: 'landing-cta-br-id-ge' },
    { id: 'beyond-form', label: 'beyond_form', href: '/beyond-form', className: 'landing-cta-beyond-form' },
    { id: 'algovrithm', label: 'algovrithm', href: '/algovrithm', className: 'landing-cta-algo-vrithm' }
]

// A `di up` install on the visitor's own machine has no accounts and no
// quota — the server says so (config.local + requireAuth off) and this page
// must not keep speaking hosted-product copy at someone who owns the whole
// disk. Not a separate "mode": one boolean, and the two hosted sentences
// below get local-truthful variants. Voice matches the wiki's local-install
// article ("Run di.iiii on your own machine").
const LOCAL_STEP_OPEN = { n: '01', title: 'Open a space', body: 'Click "Step inside" or go to any space URL. This is your machine — everything here is yours to edit, no account involved.' }
// The hero's two lines are the hosted pitch. "No download. No install." is
// read, on a local install, by someone who has just done both — and the
// featured row below advertises di-studio.xyz's own exhibitions, which are not
// in this copy and whose spaces do not exist in a fresh install, so every chip
// is a door onto nothing. Same one boolean, no second mode.
const LOCAL_TAGLINE = 'Running on your own machine. Offline, no account, and the work stays in your home folder.'
const LOCAL_CTA_SUB = 'no account, no quota. Studio is a room on the same desk.'
const LOCAL_FEATURE_SPACES = { icon: '✦', title: 'Your machine, your spaces', desc: 'This di.iiii runs locally. Create as many spaces as you like — no sign-in, no quota, and your work stays in your own home folder.' }

// Two of the three pillars, and step 04, promise reach a local install does not
// have: `di up` binds 127.0.0.1, so there is no link anyone else can open and
// no public URL to share. Saying so is not a smaller product — the same scene
// carries to a hosted space when you want an audience, and that is the honest
// version of the sentence. (LAN exposure is a deliberate later feature, see
// docs/deploy/DI_CLI.md.)
const LOCAL_PILLAR_COLLAB = 'Everything is live in this browser and in any other on this machine. To work with someone else, push the space to a di.iiii you both can reach.'
const LOCAL_PILLAR_PUBLISH = 'Spaces live at their own URL on this machine. Nothing leaves it until you send it somewhere — this server answers only to you.'
const LOCAL_STEP_SHARE = { n: '04', title: 'Keep or carry', body: 'Your work sits in your home folder. `di backup` writes the whole thing to one file, and a space can be carried to a hosted di.iiii when it wants an audience.' }

const STEPS = [
    { n: '01', title: 'Open a space', body: 'Click "Step inside" — you get a space of your own, no account needed. Sign in to keep it and to make more.' },
    { n: '02', title: 'Add objects', body: 'A space holds projects — open one, then use the Create window for 3D shapes, text, images, or 3D models. Drag to position them.' },
    { n: '03', title: 'Set up the scene', body: 'The Scene window sets the sky, background and lighting. Select an object and edit it in the Objects window.' },
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
        desc: 'Build 3D exhibitions and installations a visitor opens from a link. No 3D software experience needed.'
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
    { icon: '◈', title: 'Everything is a node', desc: 'Every object is a typed node. Wire them, group them, script them.' },
    { icon: '◉', title: 'Real-time collaboration', desc: 'See teammates\' cursors and changes live, in the same space.' },
    { icon: '⬡', title: 'WebXR ready', desc: 'Enter VR or AR from any supported browser — no app install.' },
    { icon: '◫', title: 'Asset pipeline', desc: 'Upload images, 3D models, audio. Optimized and served automatically.' },
    { icon: '◳', title: 'Spaces', desc: 'A space is a place that is yours — its own address, its own guest list, and the projects you make in it. Share by link. Lock editing or leave it open.' },
    { icon: '◐', title: 'Publish anywhere', desc: 'Each space has a public URL. Export JSON. Embed or link directly.' },
    { icon: '◍', title: 'Guest & sandbox modes', desc: 'Visitors explore without an account — a shared global space, or a private sandbox each.' },
    { icon: '✦', title: '3 free spaces', desc: 'Sign in and create up to three of your own spaces for free. Admins are unlimited.' }
]

const ROUTES = [
    { path: '/', label: 'Landing — this page' },
    { path: '/studio', label: 'Your spaces' },
    // Space-scoped, not the bare /raw this used to list. A bare lane route
    // defaults to the restricted 'main' space, where a guest session has no
    // write scope, so a visitor who clicked this from the route map landed on
    // "sign in to open the editor" instead of an editor.
    { path: '/open/raw', label: 'The node editor, on the open space' },
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
    const studioHref = buildSpacesPath()
    const [entered, setEntered] = useState(false)
    // The room behind the page is held at the space's own composed entry
    // camera, not the decorative orbit — the page's elements are measured
    // against that shot and have to stay in register with it.
    const cameraPoseRef = useRef({ ...REST_POSE })
    const cancelFlightRef = useRef(null)
    // While the page is saying the wordmark and the line in HTML, the room
    // must not say them too — they sit one behind the other and neither reads.
    // Given back at the first frame of the flight, so the flat words hand off
    // to the standing ones instead of colliding with them.
    const [roomSpeaks, setRoomSpeaks] = useState(false)
    // A phone never mounts the decorative scene — three.js is 1.47 MB and a
    // passive visit must not pay it. But the door needs a room to fly into, so
    // the tap arms it: the scene mounts, and the flight waits for the chunk
    // rather than starting over nothing.
    const [flightArmed, setFlightArmed] = useState(false)
    // Walk/fly and the calm orbiting view are both rendered by the same
    // GridFloorBackground while "entered" -- previously the only way back to
    // the orbit view once you'd moved was a full Exit + Enter Space round
    // trip. This lets you flip between them without leaving "entered" at all.
    const [viewMode, setViewMode] = useState(false)
    // di.iiii's "Main" space (set from /admin, or inline in Studio Hub's
    // per-space "Main" badge) is the same space that already represents the
    // di.iiii elsewhere — reuse it here instead of a second, parallel
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

    // Stepping inside is not a navigation any more. The room is already on
    // screen behind this page — the same `main` document, rendered by the same
    // scene — so the door is a camera move, and the page's own elements come
    // apart into the space they were always standing in. A modified click
    // (new tab, new window, middle button) still has to behave like a link, so
    // it is left alone and follows the href.
    const openDoor = (event) => {
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return
        event.preventDefault()
        if (cancelFlightRef.current) return
        setRoomSpeaks(true)
        setFlightArmed(true)
        const start = () => {
            cancelFlightRef.current = flyInside({
                root: rootRef.current,
                cameraPoseRef,
                reducedMotion: typeof window !== 'undefined'
                    && Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches),
                onDone: () => {
                    cancelFlightRef.current = null
                    setEntered(true)
                }
            })
        }
        // Where the scene is already on screen, fly on the next frame — the
        // clones have to be measured against a page that has finished being
        // laid out. Where it is not (a phone), wait for the chunk first, and
        // fly anyway if it never arrives: a door that does nothing is worse
        // than a door that opens onto a room still drawing itself.
        if (showBackground) {
            requestAnimationFrame(start)
            return
        }
        let started = false
        const once = () => { if (!started) { started = true; start() } }
        const timeout = window.setTimeout(once, DOOR_SCENE_WAIT_MS)
        import('../components/GridFloorBackground.jsx')
            .then(() => { window.clearTimeout(timeout); once() })
            .catch(() => { window.clearTimeout(timeout); once() })
    }

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
    const showBackground = entered || flightArmed || (heroInView && !isSmallScreen)

    return (
        <Box className="lp-root" data-page="landing" ref={rootRef}>

            {/* ── NAV ──────────────────────────────────────────── */}
            {!entered && (
                <nav className="lp-nav">
                    <a href="/" className="lp-nav-logo">di<span className="lp-dot">.</span>iiii</a>
                    {/* "Raw" and "Enter Raw" were the same URL twice, and the
                        lane name is vocabulary a first visitor does not have
                        yet. The nav now carries the same one door as the hero,
                        plus the return path for people who already have work. */}
                    <div className="lp-nav-links">
                        {/* `lp-nav-spaces` is a hook, not a style: this link is
                            where the spaces grid will unfold from, and the code
                            that measures it needs to be able to name it. */}
                        <a href={studioHref} className="lp-nav-link lp-nav-spaces">Spaces</a>
                        <a href={buildWikiPath()} className="lp-nav-link">Wiki</a>
                        <a href="https://github.com/dob-0/di.iiii" target="_blank" rel="noopener noreferrer" className="lp-nav-link">GitHub</a>
                    </div>
                    <a href={studioHref} onClick={openDoor} className="lp-nav-cta">Step inside</a>
                </nav>
            )}

            {/* ── HERO ─────────────────────────────────────────── */}
            <Box className="lp-hero" component="section" ref={heroRef}>
                {showBackground && (
                    <Box className="lp-hero-bg" aria-hidden="true">
                        <Suspense fallback={null}>
                            <GridFloorBackground
                                interactive={entered && !viewMode}
                                cameraPoseRef={cameraPoseRef}
                                hideEntityTypes={roomSpeaks ? null : HERO_ECHO_TYPES}
                            />
                        </Suspense>
                    </Box>
                )}

                <Stack className={`lp-hero-inner${entered ? ' lp-hero-inner--hidden' : ''}`} alignItems="center" spacing={0}>
                    <Typography className="lp-eyebrow">
                        Public spaces &nbsp;·&nbsp; on the open web
                    </Typography>

                    <Typography className="lp-wordmark" component="h1">
                        di<span className="lp-dot">.</span>iiii
                    </Typography>

                    {/* The position, 2026-08-21: the visit is the product, the
                        editor is backstage. The old line ("immersive 3D spatial
                        experiences") sold the backstage, and "immersive" is on
                        the refusal list. */}
                    <Typography className="lp-tagline">
                        Make a space, hand out the address.<br />
                        {isLocalInstall ? LOCAL_TAGLINE : 'A link while it runs, a file when it ends.'}
                    </Typography>

                    {/* One door. Three peer buttons asked a stranger to pick a
                        lane before they knew what a lane was, and two of the
                        three led somewhere worse than the first: "Open Studio"
                        to a hub that wants an account, "Enter Space" to the
                        restricted 'main' space, where a guest is bounced to the
                        read-only viewer. Studio is now depth behind the one
                        door (a room you enter once you are inside), not a rival
                        to it. "Look around" is the decorative walkable void this
                        page renders itself — it only exists where there is no
                        real main space to enter, otherwise it is another door
                        wearing a preview's clothes. */}
                    <Stack className="lp-hero-cta-row" direction="row" spacing={2} sx={{ pt: 1, pb: 2, flexWrap: 'wrap', justifyContent: 'center' }}>
                        <Button className="landing-cta-primary" variant="contained" size="large" href={studioHref} onClick={openDoor}>
                            Step inside
                        </Button>
                        {!mainSpaceId && (
                            <Button className="landing-cta-ghost" variant="outlined" size="large" onClick={handleEnterSpace}>
                                Look around
                            </Button>
                        )}
                    </Stack>

                    <Typography className="lp-cta-sub">
                        {isLocalInstall ? LOCAL_CTA_SUB : 'no account, nothing to install — for you or for whoever opens your link.'}
                        <br />
                        <a href={studioHref}>Already have spaces? Open Studio →</a>
                    </Typography>

                    {/* The row had no name, so the only place the word "spaces"
                        appeared above the fold was a grey link in the top bar,
                        while four unlabelled coloured buttons sat at the bottom
                        of the hero looking like decoration. Naming them is what
                        turns them into the second thing on the page. Its own
                        element, before the row rather than inside it, so the
                        row still holds exactly the four doors. */}
                    {!isLocalInstall && (
                        <Typography className="lp-space-row-label">
                            Or open one that&rsquo;s already running
                        </Typography>
                    )}

                    <Stack className="lp-hero-space-row" direction="row" spacing={1.5} sx={{ pb: 2, flexWrap: 'wrap', justifyContent: 'center' }}>
                        {(isLocalInstall ? [] : FEATURED_SPACES).map((space) => (
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
                            ← Back
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
                    <Typography className="lp-section-eyebrow">The short answer</Typography>
                    <Typography className="lp-section-title" component="h2">What is di.iiii?</Typography>
                    <Typography className="lp-section-body">
                        di.iiii is where you make a 3D space and hand out its address.
                        Build scenes, place objects, set up lighting and cameras,
                        and invite others into the same space in real time — then publish,
                        and anyone opens it in a browser or a headset with nothing to install.
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
                                body: isLocalInstall ? LOCAL_PILLAR_COLLAB : 'Invite anyone with a link. See live cursors and changes. Work together across the world without any setup.'
                            },
                            {
                                vis: (
                                    <Box className="lp-vis-publish">
                                        <Box className="lp-vis-globe" />
                                        <Box className="lp-vis-arrow" />
                                    </Box>
                                ),
                                title: 'Publish',
                                body: isLocalInstall ? LOCAL_PILLAR_PUBLISH : 'Every space has a public URL. Share the link — visitors see your work in their browser or in a VR/AR headset.'
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
                        You can be building your first 3D room in under two minutes.
                    </Typography>

                    <Box className="lp-steps">
                        {(isLocalInstall ? [LOCAL_STEP_OPEN, ...STEPS.slice(1, 3), LOCAL_STEP_SHARE] : STEPS).map((step) => (
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
                            Keyboard shortcuts: <kbd>H</kbd> toggles the UI, <kbd>F</kbd> frames the selection, <kbd>Ctrl/⌘</kbd>+<kbd>Z</kbd> undoes the last action.
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
                        publishing, and the API — and it’s kept up to date as di.iiii grows.
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
                            <Typography className="lp-ai-block-title">Identity</Typography>
                            <Box className="lp-code-block">
                                {[
                                    ['name', 'di.iiii'],
                                    ['type', 'public 3D spaces on the open web'],
                                    // Was the literal '0.2.0', so this card announced 0.2.0
                                    // through v0.3.1 and every release after it. __APP_VERSION__
                                    // is the build's own version (vite.config.js prefers the
                                    // packed/tagged one over package.json, which is also stale).
                                    ['version', __APP_VERSION__],
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
                        A space of your own, empty and waiting. Build it in the browser, hand out the
                        address while it runs, and take the whole thing away as one file when it ends.
                        No account needed to start.
                    </Typography>
                    <Stack direction="row" spacing={2} sx={{ flexWrap: 'wrap', justifyContent: 'center', mb: 2 }}>
                        <Button className="landing-cta-primary" variant="contained" size="large" href={studioHref} onClick={openDoor}>
                            Step inside
                        </Button>
                    </Stack>
                    <Typography className="lp-cta-sub" sx={{ mb: 3 }}>
                        <a href={studioHref}>Already have spaces? Open Studio →</a>
                    </Typography>
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
                        {/* One door here too. This row used to read "Raw · Studio"
                            — two peer lanes, which is the choice the hero exists
                            to spare a first visitor. The entrance is the entrance;
                            "Spaces" is a destination like Wiki, matching the nav. */}
                        <a href={studioHref} onClick={openDoor} className="lp-footer-link">Step inside</a>
                        <a href={studioHref} className="lp-footer-link">Spaces</a>
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
