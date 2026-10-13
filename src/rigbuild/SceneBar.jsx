import { useEffect, useRef } from 'react'
import { buildVanityProjectPath } from '../utils/spaceRouting.js'
import TreeChip from '../components/TreeChip.jsx'
import { CHIP, GLASS, LINE } from './chromeStyle.js'

// THE ONE BAR of a rig scene (owner, 2026-10-12: "we need a button to go to the edit studio ... UI/UX is messed, fix
// that all"). Before: four boxes in four styles (version row, SHOW chip, Walk / Fly stack, the dev-copy chip).
// Now one strip at the top, one style: dark glass, rectangles (0-2 px), 44 px targets, read left to right:
//   [version switch] [Edit in Studio] [SHOW ...]                 [Sound] [Walk / Fly] [Free] [Lite / Full] [dev copy]
// The parts are passed in; this file owns only the strip, its cells and the shared button look. On a phone the
// strip wraps onto lines (the left group first), never under another control.

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
                flexWrap: 'wrap',
                alignItems: 'stretch',
                gap: 'var(--di-space-1, 3px)',
                color: 'var(--di-text, #fff)',
                // the strip is empty air between its chips: a click there reaches the scene
                pointerEvents: 'none'
            }}
        >
            <style>{DEV_COPY_RULE}</style>
            <div style={{ display: 'flex', alignItems: 'stretch', gap: 'var(--di-space-1, 3px)', minWidth: 0, flex: '0 1 auto', flexWrap: 'wrap', pointerEvents: 'auto' }}>
                {left}
                <div ref={slotRef} style={{ display: 'contents' }} />
            </div>
            <div style={{ display: 'flex', alignItems: 'stretch', gap: 'var(--di-space-1, 3px)', marginLeft: 'auto', flexWrap: 'wrap', justifyContent: 'flex-end', pointerEvents: 'auto' }}>
                {right}
                <TreeChip env={env} inline />
            </div>
        </header>
    )
}
