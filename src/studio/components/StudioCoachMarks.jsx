import { useEffect, useRef, useState } from 'react'
import {
    shouldShowStudioCoach,
    markStudioCoachDone,
    shouldShowJamCoach,
    markJamCoachDone
} from '../utils/studioGuide.js'
import '../styles/studio-coach.css'

// Guest first-run coach: one hint on screen at a time, each completed by the
// action it teaches — select something, add something, open Share. No step is
// dismissed by reading; the pill dies when the action happens.
const STEPS = [
    { id: 'touch', label: 'Tap an object to select it' },
    { id: 'add', label: 'Open Create and add something' },
    { id: 'share', label: 'Open Share to keep what you made' }
]

const IDLE = -1
const DONE = STEPS.length

// Single-beat welcome for the communal `/open_jam` space. Someone scanned a QR
// at an event — no accounts, no learning curve: one hint that dies the moment
// they add their first visual, then a brief "you did it" that fades on its own.
const JAM_WELCOME = 'Open Create to add your visual to the jam ✨'
const JAM_DONE = 'Nice! ✨ Add as many as you like'
const JAM_IDLE = 'idle'
const JAM_WELCOMING = 'welcoming'
const JAM_DONE_STATE = 'done'

function JamCoach({ entityCount }) {
    const [phase, setPhase] = useState(JAM_IDLE)
    // Baseline = objects already in the jam when the hint arms. The coach only
    // mounts after the document has loaded (StudioShell gates on !loading), so
    // existing visuals are already counted and any increase is a real add.
    const baseline = useRef(null)

    useEffect(() => {
        if (phase !== JAM_IDLE) return
        if (shouldShowJamCoach()) {
            baseline.current = entityCount
            setPhase(JAM_WELCOMING)
        }
    }, [phase, entityCount])

    useEffect(() => {
        if (phase === JAM_WELCOMING && baseline.current !== null && entityCount > baseline.current) {
            markJamCoachDone()
            setPhase(JAM_DONE_STATE)
        }
    }, [phase, entityCount])

    useEffect(() => {
        if (phase !== JAM_DONE_STATE) return
        const t = setTimeout(() => setPhase(JAM_IDLE), 4000)
        return () => clearTimeout(t)
    }, [phase])

    if (phase === JAM_IDLE) return null

    const dismiss = () => {
        markJamCoachDone()
        setPhase(JAM_IDLE)
    }

    return (
        <div className="studio-coach" role="status">
            <span className="studio-coach-label">
                {phase === JAM_DONE_STATE ? JAM_DONE : JAM_WELCOME}
            </span>
            <button className="studio-coach-close" onClick={dismiss} aria-label="Dismiss guide">✕</button>
        </div>
    )
}

function GuestCoach({ authType, entityCount, hasSelection, shareOpen }) {

    const [stepIndex, setStepIndex] = useState(IDLE)
    // Entity count when the add step arms — the document loads objects
    // asynchronously, so a mount-time baseline would complete it falsely.
    const addBaseline = useRef(null)

    useEffect(() => {
        if (stepIndex !== IDLE) return
        if (shouldShowStudioCoach(authType)) setStepIndex(0)
    }, [authType, stepIndex])

    useEffect(() => {
        if (stepIndex === 0 && hasSelection) {
            addBaseline.current = entityCount
            setStepIndex(1)
        }
    }, [stepIndex, hasSelection, entityCount])

    useEffect(() => {
        if (stepIndex === 1 && addBaseline.current !== null && entityCount > addBaseline.current) {
            setStepIndex(2)
        }
    }, [stepIndex, entityCount])

    useEffect(() => {
        if (stepIndex === 2 && shareOpen) {
            markStudioCoachDone()
            setStepIndex(DONE)
        }
    }, [stepIndex, shareOpen])

    useEffect(() => {
        if (stepIndex !== DONE) return
        const t = setTimeout(() => setStepIndex(IDLE), 4000)
        return () => clearTimeout(t)
    }, [stepIndex])

    if (stepIndex === IDLE) return null

    const dismiss = () => {
        markStudioCoachDone()
        setStepIndex(IDLE)
    }

    return (
        <div className="studio-coach" role="status">
            {stepIndex === DONE ? (
                <span className="studio-coach-label">That&apos;s it — press ? anytime for help</span>
            ) : (
                <>
                    <span className="studio-coach-dots" aria-hidden="true">
                        {STEPS.map((step, i) => (
                            <span key={step.id} className={`studio-coach-dot${i < stepIndex ? ' is-done' : ''}${i === stepIndex ? ' is-active' : ''}`} />
                        ))}
                    </span>
                    <span className="studio-coach-label">{STEPS[stepIndex].label}</span>
                </>
            )}
            <button className="studio-coach-close" onClick={dismiss} aria-label="Dismiss guide">✕</button>
        </div>
    )
}

// Thin dispatcher (no hooks of its own, so the branch is rules-of-hooks safe):
// the communal jam gets its single-beat welcome, everywhere else the guest
// first-run walkthrough.
export default function StudioCoachMarks({ isOpenJam = false, ...props }) {
    if (isOpenJam) return <JamCoach entityCount={props.entityCount} />
    return <GuestCoach {...props} />
}
