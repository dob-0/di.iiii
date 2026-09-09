import React from 'react'
import './surfaceBar.css'

/**
 * The one strip that is on every surface.
 *
 * Owner, 2026-09-09: "we have layers, desk, raw, studio, light, spaces — there
 * need full conected". An audit of what is actually on screen found two rooms
 * you cannot leave at all (the lighting desk, and the platform's own space
 * walked), a bare node canvas whose only exit is a wordmark, and four different
 * names — "back to spaces", "← Spaces", "Spaces", "← Home" — for one screen.
 *
 * So: one bar, one place, one set of names. It says WHERE YOU ARE on the left
 * and is the WAY OUT on the right. It is not a menu of everything; it is the
 * shortest list that means no surface is a dead end.
 *
 * It deliberately does not render in a presentation: a projector feed, an
 * embedded window and a headset are all showing the work, not the tool.
 */

// The order never changes, so the eye learns one position per destination.
// `local` marks a surface that only exists where di.iiii is actually running.
const DESTINATIONS = [
    { key: 'spaces', label: 'Spaces', href: '/spaces' },
    { key: 'studio', label: 'Studio', href: '/studio' },
    { key: 'raw', label: 'Nodes', href: '/raw' },
    { key: 'tools', label: 'Tools', href: '/tools' },
    { key: 'light', label: 'Light', href: '/light/', local: true },
    { key: 'wiki', label: 'Wiki', href: '/wiki' },
]

export const surfaceDestinations = ({ isLocalInstall = false, space = null } = {}) =>
    DESTINATIONS.filter(d => !d.local || isLocalInstall).map(d => (
        // Inside a space, Studio and Nodes mean THIS space's — landing on the
        // global hub instead is how the space you were standing in gets lost.
        space && (d.key === 'studio' || d.key === 'raw')
            ? { ...d, href: d.key === 'studio' ? `/${space}/studio` : `/${space}/raw/projects` }
            : d
    ))

export default function SurfaceBar({
    here = null,           // which destination is the current one
    space = null,          // space id, when the surface belongs to one
    spaceLabel = null,     // what to call it in words
    isLocalInstall = false,
    hidden = false,        // presentation / embed / XR
    float = false,         // the surface below is a full-bleed canvas
    children = null,       // one surface-specific control, at most
}) {
    if (hidden) return null
    const destinations = surfaceDestinations({ isLocalInstall, space })

    return (
        <nav className={`sbar${float ? ' sbar--float' : ''}`} aria-label="di.iiii">
            <a className="sbar-home" href="/spaces">di.iiii</a>
            {space && (
                <>
                    <span className="sbar-sep" aria-hidden="true">·</span>
                    <a className="sbar-where" href={`/${space}`}>{spaceLabel || space}</a>
                </>
            )}
            <div className="sbar-links">
                {destinations.map(d => (
                    <a
                        key={d.key}
                        className={`sbar-link${here === d.key ? ' is-here' : ''}`}
                        href={d.href}
                        aria-current={here === d.key ? 'page' : undefined}
                    >{d.label}</a>
                ))}
                {children}
            </div>
        </nav>
    )
}
