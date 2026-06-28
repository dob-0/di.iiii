import { Suspense, lazy, useCallback, useEffect, useRef, useState } from 'react'
import gsap from 'gsap'
import LandingPage from './landing/LandingPage.jsx'
import './wccExperience.css'

// The full exhibition now renders through the shared LiveProjectScene (same engine
// as every other space viewer); the composition lives in the `main` project as
// portal-embeds of each artist project. The old bespoke WccExhibition is retired.
const LiveProjectScene = lazy(() => import('../components/LiveProjectScene.jsx'))

const SCENE_PATH = '/wcc/scene'
const LANDING_PATH = '/wcc'

// "Enter space" for one artist lands on their own actual Studio project
// (via LiveProjectScene — the same viewer used everywhere else in the app).
// "Enter Exhibition" with no specific artist renders the full ring of all 10.
const ARTIST_TITLES = {
    'alla-virabyan': 'Alla Virabyan',
    'ani-khachatryan': 'Ani Khachatryan',
    'arthur': 'Arthur Jay Robin Sergo',
    'jeny-gevorgyan': 'Jeny Gevorgyan',
    'margarita-ghazaryan': 'Margarita Ghazaryan',
    'meri-andreasyan': 'Meri Andreasyan',
    'mery-petrosyan': 'Mery Petrosyan',
    'nush-petrosyan': 'Nush Petrosyan',
    'sanjay-j-choudari': 'Sanjay J Choudari',
    'yeva-abgaryan': 'Yeva Abgaryan',
}

// mode: 'landing' (2D only) | 'entering' (transition running) | 'scene' (3D only)

export default function WccExperience({ initialMode = 'landing' }) {
    const [mode, setMode] = useState(initialMode === 'scene' ? 'scene' : 'landing')
    const [lang, setLang] = useState('en')
    const [activeProjectId, setActiveProjectId] = useState(null)
    const overlayRef = useRef(null)
    const sceneWrapRef = useRef(null)
    const timelineRef = useRef(null)

    const enterExhibition = useCallback((projectId = null) => {
        if (mode !== 'landing') return
        // Only accept plain string slugs — guard against being called as an onClick handler
        const pid = typeof projectId === 'string' ? projectId : null
        if (pid) setActiveProjectId(pid)
        setMode('entering')
        if (typeof window !== 'undefined' && window.location.pathname !== SCENE_PATH) {
            window.history.pushState({ wccScene: true }, '', SCENE_PATH)
        }
    }, [mode])

    const exitExhibition = useCallback(() => {
        setActiveProjectId(null)
        if (typeof window !== 'undefined' && window.history.state?.wccScene) {
            window.history.back()
            return
        }
        if (typeof window !== 'undefined' && window.location.pathname !== LANDING_PATH) {
            window.history.pushState({}, '', LANDING_PATH)
        }
        setMode('landing')
    }, [])

    // Keep mode in sync with browser navigation (back/forward).
    useEffect(() => {
        const onPopState = () => {
            const onScene = window.location.pathname.replace(/\/+$/, '') === SCENE_PATH
            setMode((current) => {
                if (onScene) return current === 'landing' ? 'scene' : current
                return 'landing'
            })
        }
        window.addEventListener('popstate', onPopState)
        return () => window.removeEventListener('popstate', onPopState)
    }, [])

    // Listen for artist-space entry requests from the artist-works iframe.
    useEffect(() => {
        const onMessage = (e) => {
            if (e.data?.type !== 'dii-wcc-artist-enter') return
            const pid = e.data?.projectId
            if (pid) enterExhibition(pid)
        }
        window.addEventListener('message', onMessage)
        return () => window.removeEventListener('message', onMessage)
    }, [enterExhibition])

    // Run the dive transition once we enter "entering" mode.
    useEffect(() => {
        if (mode !== 'entering') return undefined
        const overlay = overlayRef.current
        const sceneWrap = sceneWrapRef.current

        const tl = gsap.timeline({ onComplete: () => setMode('scene') })
        timelineRef.current = tl

        // The landing's floating circles rush toward the viewer and dissolve.
        tl.to('.wcc-circle', {
            scale: 3.6,
            opacity: 0,
            duration: 1.0,
            stagger: 0.045,
            ease: 'power3.in'
        }, 0)
        tl.to('.wcc-ambient-dots span', { opacity: 0, duration: 0.5, ease: 'power2.in' }, 0)
        tl.to('.wcc-hero, .wcc-horizontal, .wcc-scroll-arrow, .wcc-cursor', {
            opacity: 0,
            duration: 0.6,
            ease: 'power2.in'
        }, 0)
        // Black warp flash — starts immediately so there's no frozen gap after click.
        if (overlay) {
            tl.fromTo(overlay, { opacity: 0 }, { opacity: 1, duration: 0.35, ease: 'power2.in' }, 0.1)
        }
        // Scene fades up underneath as the flash clears.
        if (sceneWrap) {
            tl.fromTo(sceneWrap, { opacity: 0 }, { opacity: 1, duration: 0.9, ease: 'power2.out' }, 0.65)
        }
        if (overlay) {
            tl.to(overlay, { opacity: 0, duration: 0.9, ease: 'power2.out' }, 1.05)
        }

        return () => {
            tl.kill()
            timelineRef.current = null
        }
    }, [mode])

    const showLanding = mode === 'landing' || mode === 'entering'
    const showScene = mode === 'scene' || mode === 'entering'

    return (
        <div className="wcc-experience">
            {showLanding ? (
                <div className="wcc-experience__landing">
                    <LandingPage onEnterExhibition={enterExhibition} lang={lang} onLangChange={setLang} />
                </div>
            ) : null}

            {showScene ? (
                <div
                    className="wcc-experience__scene"
                    ref={sceneWrapRef}
                    style={mode === 'entering' ? { opacity: 0 } : undefined}
                >
                    <Suspense fallback={null}>
                        <LiveProjectScene
                            projectId={activeProjectId || 'main'}
                            interactive
                            showChrome
                            onExit={exitExhibition}
                            title={activeProjectId ? (ARTIST_TITLES[activeProjectId] || activeProjectId) : 'WCC · Women Creating Change'}
                        />
                    </Suspense>
                </div>
            ) : null}

            {mode === 'entering' ? <div className="wcc-experience__warp" ref={overlayRef} aria-hidden="true" /> : null}
        </div>
    )
}
