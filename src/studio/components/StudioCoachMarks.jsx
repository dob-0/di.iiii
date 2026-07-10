import { useEffect, useRef, useState } from 'react'
import { shouldShowStudioCoach, markStudioCoachDone } from '../utils/studioGuide.js'
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

export default function StudioCoachMarks({ authType, entityCount, hasSelection, shareOpen }) {
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
