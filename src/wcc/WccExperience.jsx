import { Suspense, lazy, useCallback, useEffect, useRef, useState } from 'react'
import gsap from 'gsap'
import LandingPage from './landing/LandingPage.jsx'
import { getProjectDocument } from '../project/services/projectsApi.js'
import './wccExperience.css'

// The exhibition is the Studio-authored `wcc` project, rendered by the shared
// public viewer. The 2D landing dives into it in place (no page reload).
const PublicProjectViewer = lazy(() => import('../project/components/PublicProjectViewer.jsx'))

const WCC_SPACE_ID = 'wcc'
const WCC_PROJECT_ID = 'wcc'
const SCENE_PATH = '/wcc/scene'
const LANDING_PATH = '/wcc'
const DEFAULT_ROOM_COLOR = '#070506'

// A framed "entrance" camera that stands just outside the threshold gate and
// looks through it into the zones — derived from the gate's authored position
// so it follows the exhibition if it's rearranged. Falls back to the project's
// own saved view when no gate entity is present.
function buildEntryCamera(doc) {
    const entities = Array.isArray(doc?.entities) ? doc.entities : []
    const gate = entities.find((entity) => /gate|threshold|entrance/i.test(entity?.name || ''))
    const gatePos = gate?.components?.transform?.position
    if (!Array.isArray(gatePos)) return null
    return {
        mode: 'perspective',
        position: [gatePos[0], gatePos[1] + 0.1, gatePos[2] + 5.2],
        target: [gatePos[0] - 1.2, 1.3, gatePos[2] - 8.0],
        fov: 55,
        zoom: 1,
        near: 0.1,
        far: 300
    }
}

// mode: 'landing' (2D only) | 'entering' (transition running) | 'scene' (3D only)
export default function WccExperience({ initialMode = 'landing' }) {
    const [mode, setMode] = useState(initialMode === 'scene' ? 'scene' : 'landing')
    const [meta, setMeta] = useState(null)
    const overlayRef = useRef(null)
    const sceneWrapRef = useRef(null)
    const timelineRef = useRef(null)

    // Fetch the exhibition's authored background colour + gate position up front
    // so the dive can resolve into the room colour and frame the entrance.
    useEffect(() => {
        let cancelled = false
        getProjectDocument(WCC_PROJECT_ID)
            .then((response) => {
                if (cancelled) return
                const doc = response?.document || response || {}
                setMeta({
                    roomColor: doc.worldState?.backgroundColor || DEFAULT_ROOM_COLOR,
                    entryCamera: buildEntryCamera(doc)
                })
            })
            .catch(() => {
                if (cancelled) return
                setMeta({ roomColor: DEFAULT_ROOM_COLOR, entryCamera: null })
            })
        return () => { cancelled = true }
    }, [])

    const roomColor = meta?.roomColor || DEFAULT_ROOM_COLOR

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
        // Warp flash (red bloom -> room colour) to hide the swap.
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
                    <LandingPage onEnterExhibition={enterExhibition} />
                </div>
            ) : null}

            {showScene ? (
                <div
                    className="wcc-experience__scene"
                    ref={sceneWrapRef}
                    style={{
                        background: roomColor,
                        opacity: mode === 'entering' ? 0 : undefined,
                        pointerEvents: mode === 'entering' ? 'none' : undefined
                    }}
                >
                    {meta ? (
                        <Suspense fallback={null}>
                            <PublicProjectViewer
                                spaceId={WCC_SPACE_ID}
                                projectId={WCC_PROJECT_ID}
                                spaceLabel="WCC · Women Creating Change"
                                initialCameraView={meta.entryCamera}
                            />
                        </Suspense>
                    ) : null}
                    <button type="button" className="wcc-experience__exit" onClick={exitExhibition}>
                        ← Exit exhibition
                    </button>
                </div>
            ) : null}

            {mode === 'entering' ? (
                <div
                    className="wcc-experience__warp"
                    ref={overlayRef}
                    aria-hidden="true"
                    style={{ background: `radial-gradient(circle at 50% 50%, #d90000 0%, #ff7a7a 22%, ${roomColor} 68%)` }}
                />
            ) : null}
        </div>
    )
}
