import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { appNavigate } from '../../utils/appNavigate.js'
import { ALGO_VRITHM_SCENE_PATH } from '../algoVrithmRouting.js'
import { BEAT_CARDS, RUN_TIME_SEC, beatsAtSec, leadBeatAtSec } from './beatCards.js'
import { paintFrame } from './beatSketches.js'
import './algoVrithmLanding.css'

// The front door for algovrithm.
//
// A poster. It shows the piece moving, says why it exists, and opens the door.
// It does not measure the piece.
//
// This page used to carry the edit on its face: a draggable timeline of the
// seven clip windows, their 1.2s overlaps stacked on two rows, a playhead and a
// running clock. That was a good exhibit and it is gone on purpose. It answered
// a question about how the artefact was assembled, on the page of a work whose
// subject is a system that composes without being seen — "the algorithm is
// never seen, yet it continuously composes the reality I experience". Handing a
// visitor a scrubber over the composition contradicts the sentence the page
// exists to deliver, and it contradicted the lede directly above it, which
// promises there is nothing to operate. The windows still live in
// sequences/index.js and the director panel, which is where somebody who needs
// them looks.
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
    const canvasRef = useRef(null)
    // The playhead lives in a ref as well as in state: the rAF loop reads and
    // advances it every frame, and closing over the state value would pin it to
    // whatever it was when the effect last ran.
    const playheadRef = useRef(0)

    const live = useMemo(() => beatsAtSec(playheadSec), [playheadSec])
    const lead = useMemo(() => leadBeatAtSec(playheadSec), [playheadSec])

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

    // A paused frame still animates by default, because half the beats (the
    // strobes, the tick) are alive inside one and holding them still would show
    // something the beat never looks like. Under reduced motion that is exactly
    // the wrong call, so there the paint happens once per playhead position and
    // the rAF loop is not started at all.
    const animating = playing || !reducedMotion

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

    const enter = useCallback(() => appNavigate(ALGO_VRITHM_SCENE_PATH), [])

    return (
        <main className="avl-root">
            <header className="avl-head">
                <p className="avl-eyebrow">di.iiii · a virtual installation</p>
                <h1 className="avl-title">algovrithm</h1>
                <p className="avl-lede">
                    On hyperreality: a reality composed through pixels, code, algorithms.
                    Fifty-three seconds, looping. It plays itself — there is nothing to operate.
                </p>
                <div className="avl-actions">
                    <button type="button" className="avl-enter" onClick={enter}>Enter the piece</button>
                    <span className="avl-actions-note">Best in a headset.</span>
                </div>
            </header>

            <section className="avl-stage" aria-label="The piece">
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
                    {playing ? 'Pause the preview' : 'Play the preview'}
                </button>

                <p className="avl-stage-note">
                    A flat stand-in. The work happens around you, and that is the part a
                    rectangle cannot hold.
                </p>

                {/* The live region carries what the canvas carries, for anyone
                    not getting the canvas: which movement is on, and where a
                    seam holds two at once. It changes about fourteen times in
                    the loop — the clock is not in here and there is no longer a
                    clock anywhere to put back. Off-screen rather than dim: the
                    same names are set visibly, and at leisure, in the score. */}
                <p className="avl-live avl-sr" role="status" aria-live="polite">
                    {live.map((entry) => entry.beat.title).join(' over ')}
                </p>
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

            {/* The score: seven movements in order, named, with no windows, no
                timecodes and nothing to click. It is also the text equivalent of
                the canvas for anyone not getting it — previously the only way to
                discover what the piece contains was to find a slider and drive
                it. role="list" is explicit because list-style:none drops list
                semantics in Safari. */}
            <section className="avl-score" aria-labelledby="avl-score-h">
                <h2 className="avl-sr" id="avl-score-h">The score</h2>
                {/* eslint-disable-next-line jsx-a11y/no-redundant-roles --
                    redundant everywhere except Safari, which drops list
                    semantics from any list carrying list-style:none. This one
                    does, and it is the text equivalent of the canvas, so losing
                    "list, 7 items" there is not a cosmetic loss. */}
                <ol className="avl-score-list" role="list">
                    {BEAT_CARDS.map((beat) => (
                        <li
                            key={beat.id}
                            className="avl-score-line"
                            aria-current={lead.id === beat.id ? 'true' : undefined}
                        >
                            <span className="avl-score-name">{beat.title}</span>
                            <span className="avl-score-note">{beat.blurb}</span>
                        </li>
                    ))}
                </ol>
            </section>
        </main>
    )
}
