import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { appNavigate } from '../../utils/appNavigate.js'
import { ALGO_VRITHM_SCENE_PATH } from '../algoVrithmRouting.js'
import { BEAT_CARDS, RUN_TIME_SEC, beatsAtSec, formatSec, leadBeatAtSec } from './beatCards.js'
import { paintFrame } from './beatSketches.js'
import './algoVrithmLanding.css'

// The front door for algovrithm.
//
// A poster with the cut on it. The one thing this page can show that a still
// cannot is the SHAPE of the piece — seven beats, unequal, overlapping — so the
// timeline is the page rather than an ornament on it: drag it, arrow-key it, or
// press play and watch the same 53 seconds the headset gets, at 2D scale.
//
// Deliberately three.js-free. The piece is a lazy route of its own
// (/algovrithm/scene) and this page must not pull 1.6 MB of renderer for a
// visitor who has not decided to enter yet — see the note at beatCards.js for
// why the edit list is copied rather than imported.

const clampSec = (seconds) => Math.max(0, Math.min(RUN_TIME_SEC, seconds))

// The piece pulses at 2.4 Hz and carries a photosensitivity warning in the
// headset. Nobody landing on a URL has consented to that, so the OS setting
// decides whether this page moves at all: reduced motion means it opens on a
// held frame and only ever moves when the visitor scrubs or presses play.
const prefersReducedMotion = () => {
    if (typeof window === 'undefined' || !window.matchMedia) return false
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

export default function AlgoVrithmLanding() {
    const [playheadSec, setPlayheadSec] = useState(0)
    const [reducedMotion] = useState(prefersReducedMotion)
    const [playing, setPlaying] = useState(() => !prefersReducedMotion())
    const [scrubbing, setScrubbing] = useState(false)
    const canvasRef = useRef(null)
    const trackRef = useRef(null)
    // The playhead lives in a ref as well as in state: the rAF loop reads and
    // advances it every frame, and closing over the state value would pin it to
    // whatever it was when the effect last ran. Every writer sets the ref FIRST
    // and then the state — never mirrored during render, which is both a lint
    // error and a way to lose a frame's worth of scrub.
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
    // strobes, the 6 Hz tick) are alive inside one and holding them still would
    // show something the beat never looks like. Under reduced motion that is
    // exactly the wrong call, so there the paint happens once per playhead
    // position and the rAF loop is not started at all.
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

            if (playing && !scrubbing) {
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
    }, [animating, paint, playing, scrubbing])

    useEffect(() => {
        if (animating) return
        paint()
    }, [animating, paint, playheadSec])

    const secondsAtClientX = useCallback((clientX) => {
        const track = trackRef.current
        if (!track) return 0
        const rect = track.getBoundingClientRect()
        if (!rect.width) return 0
        return clampSec(((clientX - rect.left) / rect.width) * RUN_TIME_SEC)
    }, [])

    const scrubTo = useCallback((clientX) => {
        const seconds = secondsAtClientX(clientX)
        playheadRef.current = seconds
        setPlayheadSec(seconds)
    }, [secondsAtClientX])

    const onPointerDown = useCallback((event) => {
        event.currentTarget.setPointerCapture?.(event.pointerId)
        setScrubbing(true)
        scrubTo(event.clientX)
    }, [scrubTo])

    const onPointerMove = useCallback((event) => {
        if (!scrubbing) return
        scrubTo(event.clientX)
    }, [scrubbing, scrubTo])

    const endScrub = useCallback(() => setScrubbing(false), [])

    // Keyboard is not a courtesy here: the seams are 1.2s wide and a pointer
    // cannot reliably land inside one, so stepping by tenths is the only way to
    // actually see a cross-fade hold both beats at once.
    const onTrackKeyDown = useCallback((event) => {
        const step = event.shiftKey ? 1 : 0.1
        if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
            event.preventDefault()
            const next = clampSec(playheadRef.current + (event.key === 'ArrowRight' ? step : -step))
            playheadRef.current = next
            setPlayheadSec(next)
            setPlaying(false)
        } else if (event.key === 'Home') {
            event.preventDefault()
            playheadRef.current = 0
            setPlayheadSec(0)
        } else if (event.key === ' ' || event.key === 'Enter') {
            event.preventDefault()
            setPlaying((was) => !was)
        }
    }, [])

    const jumpToBeat = useCallback((beat) => {
        // Land just inside the beat, past its fade-in, so clicking a card shows
        // that beat alone rather than the seam it starts in.
        const inside = clampSec(beat.startSec + Math.min(1.4, (beat.endSec - beat.startSec) * 0.35))
        playheadRef.current = inside
        setPlayheadSec(inside)
    }, [])

    const enter = useCallback(() => appNavigate(ALGO_VRITHM_SCENE_PATH), [])

    return (
        <main className="avl-root">
            <header className="avl-head">
                <p className="avl-eyebrow">di.iiii · a code-authored space</p>
                <h1 className="avl-title">algovrithm</h1>
                <p className="avl-lede">
                    A virtual installation on hyperreality: pixels and code becoming reality.
                    {' '}{BEAT_CARDS.length} beats, {formatSec(RUN_TIME_SEC)} end to end, cross-fading rather
                    than cutting. For an audience it plays itself — there is nothing to operate.
                </p>
                <div className="avl-actions">
                    <button type="button" className="avl-enter" onClick={enter}>Enter the piece</button>
                    <span className="avl-actions-note">Best in a headset. Works in a browser, and in VR where the device allows it.</span>
                </div>
            </header>

            <section className="avl-stage" aria-label="Preview of the cut">
                <canvas ref={canvasRef} className="avl-canvas" aria-hidden="true" />
                <div className="avl-stage-caption">
                    <span className="avl-stage-beat">{lead.title}</span>
                    <span className="avl-stage-clock">{formatSec(playheadSec)} / {formatSec(RUN_TIME_SEC)}</span>
                </div>
                <p className="avl-stage-disclaimer">
                    A 2D stand-in, drawn from the same edit list the piece runs on. The work itself is
                    raymarched, in stereo, and all the way around you — none of which survives a rectangle.
                </p>
                <p className="avl-live" role="status" aria-live="polite">
                    {formatSec(playheadSec)} — {live.map((entry) => entry.beat.title).join(' over ')}
                </p>
            </section>

            <section className="avl-transport">
                <button
                    type="button"
                    className="avl-play"
                    onClick={() => setPlaying((was) => !was)}
                    aria-pressed={playing}
                >
                    {playing ? 'Pause' : 'Play'}
                </button>
                <div
                    ref={trackRef}
                    className="avl-track"
                    role="slider"
                    tabIndex={0}
                    aria-label="Scrub the edit list"
                    aria-valuemin={0}
                    aria-valuemax={RUN_TIME_SEC}
                    aria-valuenow={Number(playheadSec.toFixed(1))}
                    aria-valuetext={`${formatSec(playheadSec)}, ${lead.title}`}
                    onPointerDown={onPointerDown}
                    onPointerMove={onPointerMove}
                    onPointerUp={endScrub}
                    onPointerCancel={endScrub}
                    onKeyDown={onTrackKeyDown}
                >
                    {BEAT_CARDS.map((beat, index) => (
                        <button
                            key={beat.id}
                            type="button"
                            className={`avl-clip${lead.id === beat.id ? ' is-lead' : ''}`}
                            style={{
                                left: `${(beat.startSec / RUN_TIME_SEC) * 100}%`,
                                width: `${((beat.endSec - beat.startSec) / RUN_TIME_SEC) * 100}%`,
                                // Stacked rows, not one lane: butt the clips into
                                // a single line and the 1.2s overlaps — the whole
                                // point of the picture — become invisible.
                                top: `${(index % 2) * 50}%`
                            }}
                            onClick={(event) => {
                                event.stopPropagation()
                                jumpToBeat(beat)
                            }}
                            tabIndex={-1}
                        >
                            <span className="avl-clip-label">{beat.title}</span>
                        </button>
                    ))}
                    <div className="avl-playhead" style={{ left: `${(playheadSec / RUN_TIME_SEC) * 100}%` }} />
                </div>
            </section>

            {/* The artist's statement, as written. It sits between the picture
                and the breakdown on purpose: the beats below read as craft
                (strobe rings, hairline bars, 288 reels) until you have been
                told they are gestures, and after that they read as the six
                the statement names. Nothing here is paraphrased. */}
            <section className="avl-statement" aria-label="The concept">
                <h2 className="avl-statement-title">The concept</h2>
                <p>
                    I belong to a generation that never had to cross the boundary between the
                    physical and the digital. I grew up inside both at once. My friendships,
                    memories, work, desires, and anxieties exist across these spaces so seamlessly
                    that I no longer experience the digital world as separate from reality. It is
                    simply one of the environments in which my life unfolds.
                </p>
                <p>Every day I perform the same gestures:</p>
                <p className="avl-gestures">
                    I scroll. I swipe. I refresh. I wait. I record. I repeat.
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

            <section className="avl-beats" aria-label="The beats">
                {BEAT_CARDS.map((beat) => (
                    <article
                        key={beat.id}
                        className={`avl-card${lead.id === beat.id ? ' is-lead' : ''}`}
                    >
                        <button type="button" className="avl-card-hit" onClick={() => jumpToBeat(beat)}>
                            <span className="avl-card-time">
                                {formatSec(beat.startSec)} → {formatSec(beat.endSec)}
                            </span>
                            <h2 className="avl-card-title">{beat.title}</h2>
                            <p className="avl-card-blurb">{beat.blurb}</p>
                        </button>
                    </article>
                ))}
            </section>

            <section className="avl-why">
                <h2 className="avl-why-title">Why this space has no editor</h2>
                <p>
                    Every other space on di.iiii is a project document you open in Studio. algovrithm is
                    code: its scene lives in <code>src/algoVrithm/</code> and its media is committed
                    beside it, so cloning the branch gives you the complete piece with nothing to fetch.
                    Retiming happens in an edit list — <code>startSec</code>/<code>endSec</code> rows,
                    the same thing the timeline above is drawn from — and a new beat is a new file.
                </p>
                <p className="avl-why-foot">
                    Windows overlap by 1.2 seconds on purpose. Where two overlap, both are mounted and
                    each fades on its own envelope: hold an arrow key across a seam above and you can
                    watch one beat carry the other.
                </p>
            </section>
        </main>
    )
}
