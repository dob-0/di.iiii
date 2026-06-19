import { Suspense, lazy, useCallback, useEffect, useRef, useState } from 'react'
import gsap from 'gsap'
import LandingPage from './landing/LandingPage.jsx'
import './wccExperience.css'

const WccExhibition = lazy(() => import('./scene/WccExhibition.jsx'))

const SCENE_PATH = '/wcc/scene'
const LANDING_PATH = '/wcc'

// mode: 'landing' (2D only) | 'entering' (transition running) | 'scene' (3D only)
export default function WccExperience({ initialMode = 'landing' }) {
    const [mode, setMode] = useState(initialMode === 'scene' ? 'scene' : 'landing')
    const [lang, setLang] = useState('en')
    const overlayRef = useRef(null)
    const sceneWrapRef = useRef(null)
    const timelineRef = useRef(null)

    const enterExhibition = useCallback(() => {
        if (mode !== 'landing') return
        setMode('entering')
        if (typeof window !== 'undefined' && window.location.pathname !== SCENE_PATH) {
            window.history.pushState({ wccScene: true }, '', SCENE_PATH)
        }
    }, [mode])

    const exitExhibition = useCallback(() => {
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
        // Black warp flash to hide the swap.
        if (overlay) {
            tl.fromTo(overlay, { opacity: 0 }, { opacity: 1, duration: 0.5, ease: 'power2.in' }, 0.45)
        }
        // Scene fades up underneath as the flash clears.
        if (sceneWrap) {
            tl.fromTo(sceneWrap, { opacity: 0 }, { opacity: 1, duration: 0.9, ease: 'power2.out' }, 0.85)
        }
        if (overlay) {
            tl.to(overlay, { opacity: 0, duration: 0.9, ease: 'power2.out' }, 1.25)
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
                        <WccExhibition onExit={exitExhibition} lang={lang} onLangChange={setLang} />
                    </Suspense>
                </div>
            ) : null}

            {mode === 'entering' ? <div className="wcc-experience__warp" ref={overlayRef} aria-hidden="true" /> : null}
        </div>
    )
}
