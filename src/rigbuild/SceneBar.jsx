import { useEffect, useRef } from 'react'
import { buildVanityProjectPath } from '../utils/spaceRouting.js'
import TreeChip from '../components/TreeChip.jsx'
import { CHIP, GLASS, LINE } from './chromeStyle.js'

// THE ONE BAR of a rig scene (owner, 2026-10-12: "we need a button to go to the edit studio ... UI/UX is messed, fix
// that all"). Before: four boxes in four styles (version row, SHOW chip, Walk / Fly stack, the dev-copy chip).
// Now one strip at the top, one style: dark glass, rectangles (0-2 px), 44 px targets, read left to right:
//   [version switch] [Edit in Studio] [SHOW ...]                 [Sound] [Walk / Fly] [Free] [Low / High] [dev copy]
// The parts are passed in; this file owns only the strip, its cells and the shared button look. Under 900 px the
// strip is two rows (the left group, then the right); from 900 px it is one row that never wraps (BAR_RULE).

export const BAR_GLASS = GLASS
export const BAR_LINE = LINE

/** A button or link in the bar: a small chip of its own (chromeStyle.js); the bar itself draws nothing, so nothing covers the scene between them. */
export const barButtonStyle = CHIP

/** The address of a scene's editor: /{space}/{project}/studio (spaceRouting.js, "The tool doorway"). */
export const studioHref = (spaceId, projectId) => `${buildVanityProjectPath(spaceId, projectId)}/studio`

export function EditInStudio({ spaceId, projectId }) {
    if (!spaceId || !projectId) return null
    return (
        <a
            href={studioHref(spaceId, projectId)}
            data-testid="edit-in-studio"
            title="Open this scene in Studio, where you edit it"
            style={barButtonStyle}
        >
            Edit in Studio
        </a>
    )
}

// While a bar is on screen the dev-copy chip lives in it (treeChip.css hides the corner one).
const DEV_COPY_RULE = 'html[data-scene-bar] .tree-chip:not(.tree-chip--inline){display:none}'

// ONE ROW AT EVERY WIDTH FROM 900 PX (owner, 2026-10-15: "why is the UI messed" - at 1700 px the bar had wrapped into two rows).
// The left group (versions, Edit in Studio, SHOW) is the one that gives: its chips shrink and their text takes an ellipsis
// (min width = the touch target) before anything wraps; the right group (Display, Sound, Walk / Fly, dev copy) never shrinks.
// Under 900 px the bar is two rows by design: the left group on the first, the right group (with the dev-copy chip) on the
// second. Layout lives in CSS (not inline) so the media query can change it.
const BAR_RULE = [
    '.scene-bar{flex-wrap:nowrap}',
    '.scene-bar__left{display:flex;align-items:stretch;gap:var(--di-space-1,3px);min-width:0;flex:1 1 auto;flex-wrap:nowrap;pointer-events:auto}',
    '.scene-bar__left>*{min-width:0}',
    '.scene-bar__left [data-testid="rig-show-chip"],.scene-bar__left nav{flex:0 1 auto;min-width:var(--di-touch-target,44px)}',
    '.scene-bar__left [data-testid="rig-show-chip"]>button,.scene-bar__left nav>button{max-width:100%;width:100%;min-width:var(--di-touch-target,44px);overflow:hidden}',
    '.scene-bar__right{min-width:0;display:flex;align-items:stretch;gap:var(--di-space-1,3px);margin-left:auto;flex:0 0 auto;flex-wrap:nowrap;justify-content:flex-end;pointer-events:auto}',
    '@media (max-width:899px){.scene-bar{flex-wrap:wrap}.scene-bar__left{flex:1 1 100%}.scene-bar__right{flex:1 1 100%}.scene-bar__right .tree-chip{flex:0 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}}'
].join('')

export default function SceneBar({ top = '1rem', left, right, slotRef, env, onHeight }) {
    const box = useRef(null)
    useEffect(() => {
        const el = box.current
        if (!el || !onHeight || typeof ResizeObserver === 'undefined') return undefined
        const ro = new ResizeObserver(() => onHeight(Math.round(el.getBoundingClientRect().height)))
        ro.observe(el)
        return () => ro.disconnect()
    }, [onHeight])
    return (
        <header
            role="toolbar"
            aria-label="scene"
            data-testid="scene-bar"
            className="scene-bar"
            ref={(el) => {
                box.current = el
                // html[data-scene-bar] tells the corner chip to give way; set while the bar is mounted
                if (typeof document === 'undefined') return
                if (el) document.documentElement.setAttribute('data-scene-bar', '1')
                else document.documentElement.removeAttribute('data-scene-bar')
            }}
            style={{
                position: 'absolute',
                top,
                left: '1rem',
                right: '1rem',
                zIndex: 30,
                display: 'flex',
                alignItems: 'stretch',
                gap: 'var(--di-space-1, 3px)',
                color: 'var(--di-text, #fff)',
                // the strip is empty air between its chips: a click there reaches the scene
                pointerEvents: 'none'
            }}
        >
            <style>{DEV_COPY_RULE + BAR_RULE}</style>
            <div className="scene-bar__left" data-testid="scene-bar-left">
                {left}
                <div ref={slotRef} style={{ display: 'contents' }} />
            </div>
            <div className="scene-bar__right" data-testid="scene-bar-right">
                {right}
                <TreeChip env={env} inline />
            </div>
        </header>
    )
}
