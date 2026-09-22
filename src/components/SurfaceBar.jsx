import React from 'react'
import './surfaceBar.css'
import { appNavigate } from '../utils/appNavigate.js'
import { buildStudioHubPath, buildStudioProjectPath } from '../studio/utils/studioRouting.js'
import { buildRawProjectPath, buildRawProjectsPath } from '../raw/utils/rawRouting.js'
import { buildMapPath } from '../map/mapRouting.js'

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
 *
 * 2026-09-23, the stranger's walk: the bar knew the SPACE and not the PROJECT,
 * so every hop between Studio, Nodes and Projection went back through a list
 * and the project got lost on the way. Given a project, the bar names it and
 * each tool opens THAT project.
 */

// The order never changes, so the eye learns one position per destination.
// `project: true` marks one that only exists for a project — Projection has
// no page of its own, only a project's wall.
const DESTINATIONS = [
    { key: 'spaces', label: 'Spaces', href: '/spaces' },
    { key: 'studio', label: 'Studio', href: '/studio' },
    { key: 'raw', label: 'Nodes', href: '/raw' },
    { key: 'map', label: 'Projection', project: true },
    { key: 'tools', label: 'Tools', href: '/tools' },
    { key: 'light', label: 'Light', href: '/light/' },
    { key: 'wiki', label: 'Wiki', href: '/wiki' },
]

// The lighting desk exists only where di.iiii runs on your own machine. On a
// hosted tier Light still shows — hiding it meant a stranger never learned the
// layer exists — and opens the page that says where the desk lives. That page
// is the app's own; a full page load of /light can reach a server that
// refuses the address, so the bar gets there without one.
const HOSTED_LIGHT_PATH = '/light'

const lightHref = ({ isLocalInstall, space, project }) => {
    if (!isLocalInstall) return HOSTED_LIGHT_PATH
    if (!space || !project) return '/light/'
    const query = new URLSearchParams({ space, project })
    return `/light/?${query.toString()}`
}

export const surfaceDestinations = ({ isLocalInstall = false, space = null, project = null } = {}) => {
    // A project only means something inside its space; without the space
    // there is no address to build.
    const inProject = Boolean(space && project)
    return DESTINATIONS
        .filter(d => !d.project || inProject)
        .map(d => {
            if (d.key === 'light') {
                return { ...d, href: lightHref({ isLocalInstall, space, project }), clientSide: !isLocalInstall }
            }
            if (d.key === 'map') return { ...d, href: buildMapPath(space, project) }
            if (!space || (d.key !== 'studio' && d.key !== 'raw')) return d
            // Inside a project, Studio and Nodes open THAT project. Inside a
            // space, they mean THIS space's — landing on the global hub instead
            // is how the space you were standing in gets lost.
            if (d.key === 'studio') {
                return { ...d, href: inProject ? buildStudioProjectPath(project, space) : buildStudioHubPath(space) }
            }
            return { ...d, href: inProject ? buildRawProjectPath(project, space) : buildRawProjectsPath(space) }
        })
}

// A plain click stays in the app; a click meant for a new tab or window is
// left to the browser. Exported for the other doors to the same card (/tools).
export const navigateInApp = (event, href) => {
    if (event.defaultPrevented || event.button !== 0) return
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
    event.preventDefault()
    appNavigate(href)
}

export default function SurfaceBar({
    here = null,           // which destination is the current one
    space = null,          // space id, when the surface belongs to one
    spaceLabel = null,     // what to call it in words
    project = null,        // project id, when the surface is one project's
    projectLabel = null,   // its title
    isLocalInstall = false,
    hidden = false,        // presentation / embed / XR
    float = false,         // the surface below is a full-bleed canvas
    children = null,       // one surface-specific control, at most
}) {
    if (hidden) return null
    const destinations = surfaceDestinations({ isLocalInstall, space, project })

    return (
        <nav className={`sbar${float ? ' sbar--float' : ''}`} aria-label="di.iiii">
            <a className="sbar-home" href="/spaces">di.iiii</a>
            {space && (
                <>
                    <span className="sbar-sep" aria-hidden="true">·</span>
                    <a className="sbar-where" href={`/${space}`}>{spaceLabel || space}</a>
                </>
            )}
            {space && project && (
                <>
                    <span className="sbar-sep" aria-hidden="true">·</span>
                    <a className="sbar-where sbar-where--project" href={buildStudioProjectPath(project, space)}>{projectLabel || project}</a>
                </>
            )}
            <div className="sbar-links">
                {destinations.map(d => (
                    <a
                        key={d.key}
                        className={`sbar-link${here === d.key ? ' is-here' : ''}`}
                        href={d.href}
                        aria-current={here === d.key ? 'page' : undefined}
                        onClick={d.clientSide ? (event) => navigateInApp(event, d.href) : undefined}
                    >{d.label}</a>
                ))}
                {children}
            </div>
        </nav>
    )
}
