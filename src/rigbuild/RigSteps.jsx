import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import SurfaceBar, { navigateInApp } from '../components/SurfaceBar.jsx'
import { RIG_STEPS, rigNeighbours, rigRow } from './rigTools.js'
import '../components/surfaceBar.css'
import './rigSteps.css'

// THE STEPS ROW — the same on every rig page and in the room (RIG_BUILD.md §14).
//
// A second row in the SurfaceBar's own words and tokens (src/components/surfaceBar.css:
// the mono, the dim names, the cyan "you are here", the rule under it). Nothing new is
// drawn: it IS the bar, holding the rig's steps in the order a show is made — room ·
// 1 equipment · 2 build · 3 plot · 4 cards & looks · 5 patch sheet · 6 crew link ·
// light desk — with the step before and the step after at its two ends.
//
// It takes no key. It hides while the pointer is locked (walking or building a room)
// and comes back with Esc, like everything else over the room. On a narrow screen the
// row folds to  ‹ back · 3/6 plot ▾ · next ›  : back and next one tap each, the whole
// list one tap away in the bar's own menu, every row a finger tall.

const stepAt = (row, key) => row.find((s) => s.key === key) || null

// Does the room have the pointer? (Walk mode and build mode lock it; Esc gives it back.)
export const usePointerLocked = () => {
    const [locked, setLocked] = useState(() => typeof document !== 'undefined' && document.pointerLockElement != null)
    useEffect(() => {
        const on = () => setLocked(document.pointerLockElement != null)
        document.addEventListener('pointerlockchange', on)
        return () => document.removeEventListener('pointerlockchange', on)
    }, [])
    return locked
}

function StepLink({ step, said, warn, hint, className = '', onPick }) {
    return (
        <a
            className={`sbar-link rigsteps-step${step.here ? ' is-here' : ''}${warn ? ' is-warn' : ''}${className ? ` ${className}` : ''}`}
            href={step.href}
            aria-current={step.here ? 'page' : undefined}
            title={hint ? `${step.hint} — ${hint}` : step.hint}
            onClick={(event) => {
                onPick?.()
                if (step.clientSide) navigateInApp(event, step.href)
            }}
        >
            {step.n ? <span className="rigsteps-n" aria-hidden="true">{step.n}</span> : null}
            <span className="rigsteps-label">{step.label}</span>
            {said ? <span className="rigsteps-said">{said}</span> : null}
        </a>
    )
}

/**
 * spaceId, projectId, projectLabel — the show
 * here        'room' or a step key; null in a place that is neither
 * progress    rigProgress(): what each step says, and the step the show waits on
 * hidden      the room has the pointer
 * className   placement (rigsteps--under: under a floating SurfaceBar)
 */
export function RigSteps({ spaceId, projectId, projectLabel = null, here = null, progress = null, isLocalInstall = true, hidden = false, className = '' }) {
    const [menuOpen, setMenuOpen] = useState(false)
    const [menuTop, setMenuTop] = useState(0)
    const navRef = useRef(null)
    const pickRef = useRef(null)

    useEffect(() => {
        if (!menuOpen) return undefined
        const close = (event) => {
            if (event.type === 'keydown' && event.key !== 'Escape') return
            if (event.type === 'pointerdown' && (pickRef.current?.contains(event.target) || event.target.closest?.('.rigsteps-menu'))) return
            setMenuOpen(false)
        }
        window.addEventListener('pointerdown', close)
        window.addEventListener('keydown', close)
        window.addEventListener('resize', close)
        return () => {
            window.removeEventListener('pointerdown', close)
            window.removeEventListener('keydown', close)
            window.removeEventListener('resize', close)
        }
    }, [menuOpen])
    useEffect(() => { if (hidden) setMenuOpen(false) }, [hidden])

    const row = rigRow({ spaceId, projectId, projectLabel, here, isLocalInstall })
    if (hidden || !row.length) return null
    const { back, next } = rigNeighbours(here, progress?.suggested)
    const backStep = back ? stepAt(row, back.key) : null
    const nextStep = next ? stepAt(row, next.key) : null
    const current = stepAt(row, here)
    const said = (key) => progress?.said?.[key] || ''
    const warn = (key) => Boolean(progress?.warn?.[key])
    const numbered = current?.n ? `${current.n}/${RIG_STEPS.length}` : ''

    const toggleMenu = () => {
        const rect = navRef.current?.getBoundingClientRect()
        setMenuTop(rect ? rect.bottom : 0)
        setMenuOpen((open) => !open)
    }

    return (
        <nav className={`sbar rigsteps${className ? ` ${className}` : ''}`} aria-label="The rig, step by step" ref={navRef}>
            <span className="rigsteps-title" aria-hidden="true">rig</span>
            {backStep ? (
                <a className="sbar-link rigsteps-back" href={backStep.href} title={`back to ${backStep.label}`} aria-label={`back to ${backStep.label}`}>
                    ‹<span className="rigsteps-wide"> {backStep.label}</span>
                </a>
            ) : null}
            <ol className="rigsteps-list">
                {row.map((step) => (
                    <li key={step.key}>
                        <StepLink step={step} said={said(step.key)} warn={warn(step.key)} hint={progress?.hints?.[step.key] || ''} />
                    </li>
                ))}
            </ol>
            <button
                type="button"
                ref={pickRef}
                className={`sbar-link rigsteps-pick${current ? ' is-here' : ''}`}
                aria-haspopup="true"
                aria-expanded={menuOpen}
                onClick={toggleMenu}
            >
                {numbered ? <span className="rigsteps-n">{numbered}</span> : null}
                <span className="rigsteps-label">{current ? current.label : 'all steps'}</span>
                <span aria-hidden="true"> ▾</span>
            </button>
            {nextStep ? (
                <a className="sbar-link rigsteps-next" href={nextStep.href} title={nextStep.hint} onClick={(event) => { if (nextStep.clientSide) navigateInApp(event, nextStep.href) }}>
                    next<span className="rigsteps-wide"> · {nextStep.n ? `${nextStep.n} ` : ''}{nextStep.label}</span> ›
                </a>
            ) : null}
            {menuOpen && typeof document !== 'undefined' && createPortal(
                <div className="sbar-menu rigsteps-menu" style={{ top: menuTop }} role="menu" aria-label="The rig, step by step">
                    {row.map((step) => (
                        <StepLink key={step.key} step={step} said={said(step.key)} warn={warn(step.key)} hint={progress?.hints?.[step.key] || ''} className="sbar-menu-link" onPick={() => setMenuOpen(false)} />
                    ))}
                </div>,
                document.body
            )}
        </nav>
    )
}

/**
 * The top of a rig page: the platform's bar (where you are in di.iiii, the way out)
 * and under it the steps row. `float` over a room (build, crew); the paper pages give
 * it a row of their own. `layout="flow"` for a page that scrolls (the patch sheet).
 */
export default function RigBar({ spaceId, spaceLabel = null, projectId, projectLabel = null, here, progress = null, isLocalInstall = false, hidden = false, float = false, layout = 'fixed' }) {
    if (hidden) return null
    return (
        <div className={`rigbar rigbar--${layout}${float ? ' rigbar--float' : ''}`}>
            <SurfaceBar space={spaceId} spaceLabel={spaceLabel} project={projectId} projectLabel={projectLabel} isLocalInstall={isLocalInstall} />
            <RigSteps spaceId={spaceId} projectId={projectId} projectLabel={projectLabel} here={here} progress={progress} isLocalInstall={isLocalInstall} />
        </div>
    )
}
