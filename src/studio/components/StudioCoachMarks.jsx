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
//
// Two orders. A project that already holds things starts where it always did,
// on tapping one. An EMPTY project cannot: it asked a newcomer to "Tap an
// object" in a room with none (the layers decision, 2026-09-23, unit 2). There
// the first hint is to add something, and the next is to tap it — done by the
// tap itself (`selectTicks`), because placing a thing already selects it.
const STEP_LABELS = {
    touch: 'Tap an object to select it',
    add: 'Open Create and add something',
    share: 'Open Share to keep what you made'
}
const EMPTY_STEP_LABELS = {
    add: 'Add something',
    touch: 'Tap it',
    share: STEP_LABELS.share
}
const ORDERS = {
    filled: ['touch', 'add', 'share'],
    empty: ['add', 'touch', 'share']
}
const STEPS = ORDERS.filled

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

function GuestCoach({ authType, entityCount, hasSelection, selectTicks = 0, shareOpen, covered = false }) {

    const [stepIndex, setStepIndex] = useState(IDLE)
    // Which order this run follows, decided once when the coach arms — the
    // shell mounts the coach only after the real document has loaded.
    const [order, setOrder] = useState('filled')
    // Entity count when the add step arms — the document loads objects
    // asynchronously, so a mount-time baseline would complete it falsely.
    const addBaseline = useRef(null)
    // Picks and selection when the touch step arms.
    const touchBaseline = useRef(null)
    const steps = ORDERS[order]
    const labels = order === 'empty' ? EMPTY_STEP_LABELS : STEP_LABELS
    const stepId = stepIndex >= 0 && stepIndex < steps.length ? steps[stepIndex] : null

    useEffect(() => {
        if (stepIndex !== IDLE) return
        if (shouldShowStudioCoach(authType)) {
            setOrder(entityCount === 0 ? 'empty' : 'filled')
            setStepIndex(0)
        }
    }, [authType, stepIndex, entityCount])

    // Arm each step's baseline the moment it becomes the current one.
    useEffect(() => {
        if (stepId === 'add') addBaseline.current = entityCount
        if (stepId === 'touch') touchBaseline.current = { ticks: selectTicks, selected: hasSelection }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [stepId])

    useEffect(() => {
        if (stepId !== 'touch' || !hasSelection || !touchBaseline.current) return
        const armed = touchBaseline.current
        // Nothing was selected when the step armed: any selection is the tap.
        // Something already was (the thing just placed): only a new pick counts.
        if (!armed.selected || selectTicks > armed.ticks) setStepIndex((i) => i + 1)
    }, [stepId, hasSelection, selectTicks])

    useEffect(() => {
        if (stepId === 'add' && addBaseline.current !== null && entityCount > addBaseline.current) {
            setStepIndex((i) => i + 1)
        }
    }, [stepId, entityCount])

    useEffect(() => {
        if (stepId === 'share' && shareOpen) {
            markStudioCoachDone()
            setStepIndex(DONE)
        }
    }, [stepId, shareOpen])

    useEffect(() => {
        if (stepIndex !== DONE) return
        const t = setTimeout(() => setStepIndex(IDLE), 4000)
        return () => clearTimeout(t)
    }, [stepIndex])

    // A phone sheet takes the band the pill sits in; the pill waits behind it
    // (still counting) instead of lying over the sheet's own words.
    if (stepIndex === IDLE || covered) return null

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
                        {steps.map((id, i) => (
                            <span key={id} className={`studio-coach-dot${i < stepIndex ? ' is-done' : ''}${i === stepIndex ? ' is-active' : ''}`} />
                        ))}
                    </span>
                    <span className="studio-coach-label">{labels[stepId]}</span>
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
