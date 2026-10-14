import { useEffect, useRef } from 'react'
import { buildVanityProjectPath } from '../utils/spaceRouting.js'
import TreeChip from '../components/TreeChip.jsx'

// THE ONE BAR of a rig scene (owner, 2026-10-12: "we need a button to go to the edit studio ... UI/UX is messed, fix
// that all"). Before: four boxes in four styles (version row, SHOW chip, Walk / Fly stack, the dev-copy chip).
// Now one strip at the top, one style: dark glass, rectangles (0-2 px), 44 px targets, read left to right:
//   [version switch] [Edit in Studio] [SHOW ...]                 [Sound] [Walk / Fly] [Free] [Lite / Full] [dev copy]
// The parts are passed in; this file owns only the strip, its cells and the shared button look. On a phone the
// strip wraps onto lines (the left group first), never under another control.

export const BAR_GLASS = 'rgba(10, 16, 24, 0.82)'
export const BAR_LINE = 'rgba(255,255,255,0.14)'

/** A button or link in the bar: no box of its own beyond a rectangle; the bar draws the glass. */
export const barButtonStyle = {
    appearance: 'none',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '44px',
    minWidth: '44px',
    padding: '0 0.95rem',
    border: 0,
    borderRadius: '2px',
    background: 'transparent',
    color: '#f5f7fa',
    font: 'inherit',
    fontSize: '0.9rem',
    whiteSpace: 'nowrap',
    textDecoration: 'none',
    cursor: 'pointer',
    flex: '0 0 auto'
}

/** The address of a scene's editor: /{space}/{project}/studio (spaceRouting.js, "The tool doorway"). */
export const studioHref = (spaceId, projectId) => `${buildVanityProjectPath(spaceId, projectId)}/studio`

export function EditInStudio({ spaceId, projectId }) {
    if (!spaceId || !projectId) return null
    return (
        <a
            href={studioHref(spaceId, projectId)}
            data-testid="edit-in-studio"
            title="Open this scene in Studio, where you edit it"
            style={{ ...barButtonStyle, border: '1px solid rgba(255,255,255,0.28)' }}
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
                gap: '2px',
                padding: '2px',
                borderRadius: '2px',
                border: `1px solid ${BAR_LINE}`,
                background: BAR_GLASS,
                backdropFilter: 'blur(12px)',
                color: '#f5f7fa',
                pointerEvents: 'auto'
            }}
        >
            <style>{DEV_COPY_RULE}</style>
            <div style={{ display: 'flex', alignItems: 'stretch', gap: '2px', minWidth: 0, flex: '0 1 auto', flexWrap: 'wrap' }}>
                {left}
                <div ref={slotRef} style={{ display: 'contents' }} />
            </div>
            <div style={{ display: 'flex', alignItems: 'stretch', gap: '2px', marginLeft: 'auto', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                {right}
                <TreeChip env={env} inline />
            </div>
        </header>
    )
}
