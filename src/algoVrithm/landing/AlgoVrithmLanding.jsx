import { useCallback, useEffect, useRef, useState } from 'react'
import { appNavigate } from '../../utils/appNavigate.js'
import { ALGO_VRITHM_SCENE_PATH } from '../algoVrithmRouting.js'
import { RUN_TIME_SEC, beatsAtSec } from './beatCards.js'
import { paintFrame } from './beatSketches.js'
import './algoVrithmLanding.css'

// The front door for algovrithm.
//
// The work's name, the way in, the work moving, and the artist's statement.
// Nothing else. Every word of prose on this page is the artist's, verbatim.
//
// Three rounds of cutting got here, and each round removed a vocabulary rather
// than a decoration. First the repo's: src/algoVrithm/, startSec/endSec, "a new
// beat is a new file". Then the cutting room's: a draggable timeline of the
// seven clip windows with their overlaps stacked on two rows, a playhead, a
// running clock, timecodes on every beat. Then the render pipeline's: the beat
// names themselves — "Metaball field", "Test pattern", "Dispersion sphere",
// "Scan" are techniques, and a list of them is a spec sheet however well it is
// set. None of that is in the concept, and the concept is what this page is
// built from.
//
// What it costs is real and worth stating: a visitor can no longer find out
// what the piece contains without entering it. That is the trade — the work is
// 53 seconds long and the door is right there. The beats, their windows and
// their overlaps live in sequences/index.js and the director panel.
//
// Deliberately three.js-free. The piece is a lazy route of its own
// (/algovrithm/scene) and this page must not pull 1.6 MB of renderer for a
// visitor who has not decided to enter yet — see the note at beatCards.js for
// why the edit list is copied rather than imported.

// The piece pulses and carries a photosensitivity warning in the headset.
// Nobody landing on a URL has consented to that, so the OS setting decides
// whether this page moves at all: reduced motion means it opens on a held frame
// and only ever moves if the visitor asks for it.
const prefersReducedMotion = () => {
    if (typeof window === 'undefined' || !window.matchMedia) return false
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

export default function AlgoVrithmLanding() {
    const [playheadSec, setPlayheadSec] = useState(0)
    const [reducedMotion] = useState(prefersReducedMotion)
    const [playing, setPlaying] = useState(() => !prefersReducedMotion())
    const [stageVisible, setStageVisible] = useState(true)
    const canvasRef = useRef(null)
    const rootRef = useRef(null)
    const stageRef = useRef(null)
    // The playhead lives in a ref as well as in state: the rAF loop reads and
    // advances it every frame, and closing over the state value would pin it to
    // whatever it was when the effect last ran.
    const playheadRef = useRef(0)

    const paint = useCallback(() => {
        const canvas = canvasRef.current
        if (!canvas) return
        const ctx = canvas.getContext('2d')
        if (!ctx) return
        const width = canvas.clientWidth
        const height = canvas.clientHeight
        if (!width || !height) return
        const ratio = Math.min(2, window.devicePixelRatio || 1)
        if (canvas.width !== Math.round(width * ratio) || canvas.height !== Math.round(height * ratio)) {
            canvas.width = Math.round(width * ratio)
            canvas.height = Math.round(height * ratio)
        }
        ctx.setTransform(ratio, 0, 0, ratio, 0, 0)
        paintFrame(ctx, {
            width,
            height,
            elapsed: playheadRef.current,
            live: beatsAtSec(playheadRef.current)
        })
    }, [])

    // The loop ran forever, including while the visitor was a thousand pixels
    // down reading the statement with the frame entirely off screen — a
    // strobing, device-pixel-ratio-scaled repaint every frame, for nobody, on
    // whatever battery they are holding. Same mount-gate the landing page uses
    // for its background scene.
    useEffect(() => {
        const stage = stageRef.current
        if (!stage || typeof IntersectionObserver === 'undefined') return undefined
        const observer = new IntersectionObserver(
            ([entry]) => setStageVisible(entry.isIntersecting),
            { threshold: 0 }
        )
        observer.observe(stage)
        return () => observer.disconnect()
    }, [])

    // A paused frame still animates by default, because half the beats (the
    // strobes, the tick) are alive inside one and holding them still would show
    // something the beat never looks like. Under reduced motion that is exactly
    // the wrong call, so there the paint happens once per playhead position and
    // the rAF loop is not started at all.
    const animating = (playing || !reducedMotion) && stageVisible

    useEffect(() => {
        if (!animating) return undefined
        let frame = 0
        let last = 0
        let stopped = false

        const tick = (now) => {
            if (stopped) return
            const deltaSec = last ? Math.min(0.1, (now - last) / 1000) : 0
            last = now

            if (playing) {
                const next = playheadRef.current + deltaSec
                playheadRef.current = next >= RUN_TIME_SEC ? 0 : next
                setPlayheadSec(playheadRef.current)
            }

            paint()
            frame = window.requestAnimationFrame(tick)
        }

        frame = window.requestAnimationFrame(tick)
        return () => {
            stopped = true
            window.cancelAnimationFrame(frame)
        }
    }, [animating, paint, playing])

    useEffect(() => {
        if (animating) return
        paint()
    }, [animating, paint, playheadSec])

    // Space, PageDown, End and the arrow keys do nothing on this page unless
    // something makes them. html/body/#root are position:fixed (base.css), so
    // the document never scrolls and this root owns the scroll — and the
    // browser only drives a scroller that is FOCUSED. A plain <main> cannot
    // take focus, so every reading key was dead.
    //
    // Focusing the root on mount fixed it until the first click: pressing Pause
    // left focus on BODY, which is the unscrollable fixed element, and the keys
    // died again. Anything that depends on where focus happens to be will keep
    // finding a new way to be wrong, so the keys are handled outright.
    useEffect(() => {
        const onKey = (event) => {
            const root = rootRef.current
            if (!root || event.metaKey || event.ctrlKey || event.altKey) return
            const el = document.activeElement
            if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return
            // Space on a button is that button being pressed, not a page turn.
            // Left to the browser deliberately: preventDefault here stops the
            // press as well, and the browser does not scroll for it anyway.
            if (event.key === ' ' && el && (el.tagName === 'BUTTON' || el.tagName === 'A')) return
            const page = root.clientHeight * 0.9
            const step = {
                ' ': event.shiftKey ? -page : page,
                PageDown: page,
                PageUp: -page,
                ArrowDown: 64,
                ArrowUp: -64,
                End: root.scrollHeight,
                Home: -root.scrollHeight
            }[event.key]
            if (step === undefined) return
            event.preventDefault()
            root.scrollBy({ top: step, behavior: 'smooth' })
        }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
    }, [])

    const enter = useCallback(() => appNavigate(ALGO_VRITHM_SCENE_PATH), [])

    return (
        <main className="avl-root" ref={rootRef} tabIndex={-1}>
            <header className="avl-head">
                <h1 className="avl-title">algovrithm</h1>
                <div className="avl-actions">
                    <button type="button" className="avl-enter" onClick={enter}>Enter the piece</button>
                </div>
            </header>

            <section className="avl-stage" aria-label="The piece" ref={stageRef}>
                <canvas ref={canvasRef} className="avl-canvas" aria-hidden="true" />

                {/* Not a transport. This canvas starts by itself and strobes for
                    the whole loop, so it has to be stoppable — and under reduced
                    motion it is the only way IN to the motion, which is why the
                    control survived when the timeline did not. The label changes
                    rather than carrying aria-pressed: both together make some
                    screen readers announce "Pause, pressed" for a thing that is
                    playing. */}
                <button
                    type="button"
                    className="avl-hold"
                    onClick={() => setPlaying((was) => !was)}
                >
                    {playing ? 'Pause' : 'Play'}
                </button>
            </section>

            {/* The artist's statement, as written. Nothing here is paraphrased. */}
            <section className="avl-statement" aria-labelledby="avl-statement-h">
                <h2 className="avl-sr" id="avl-statement-h">The concept</h2>
                <p>
                    I belong to a generation that never had to cross the boundary between the
                    physical and the digital. I grew up inside both at once. My friendships,
                    memories, work, desires, and anxieties exist across these spaces so seamlessly
                    that I no longer experience the digital world as separate from reality. It is
                    simply one of the environments in which my life unfolds.
                </p>
                <p>Every day I perform the same gestures:</p>
                {/* One line per gesture, so the six I's stack on one x-axis. Set
                    as prose they wrapped wherever the viewport happened to put
                    them, which reads as a list of habits — the exact thing the
                    sentence after it says they are not. The trailing space is
                    inside the span and collapses at the end of a line, but it
                    keeps textContent readable as a sentence. */}
                <p className="avl-gestures">
                    {['I scroll.', 'I swipe.', 'I refresh.', 'I wait.', 'I record.', 'I repeat.']
                        .map((gesture) => <span key={gesture}>{gesture}{' '}</span>)}
                </p>
                <p>
                    These actions seem ordinary, almost invisible, yet they quietly organize my
                    attention, emotions, relationships, and sense of time. I began to wonder whether
                    these repetitive digital behaviors are more than habits. What if they are the
                    rituals of my generation?
                </p>
                <p>
                    The algorithm is never seen, yet it continuously composes the reality I
                    experience. It determines what becomes visible, what disappears, what deserves
                    attention, and what remains in memory. My reality is increasingly assembled
                    through pixels, code, and computational decisions.
                </p>
                <p>
                    “Hyperreality” as a condition in which simulations become more influential than
                    the physical world they represent. I don’t experience this as a future scenario
                    or a warning. It is simply the condition in which I have learned to live—a
                    reality continuously composed through pixels, code, algorithms.
                </p>
            </section>

        </main>
    )
}
