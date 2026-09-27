import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import './surfaceBar.css'
import { appNavigate } from '../utils/appNavigate.js'
import { buildStudioHubPath, buildStudioProjectPath } from '../studio/utils/studioRouting.js'
import { buildRawProjectPath, buildRawProjectsPath } from '../raw/utils/rawRouting.js'
import { buildMapPath } from '../map/mapRouting.js'
import { useAllTools } from '../studio/utils/jamMode.js'

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

// Opened from a project, the desk is told which one — ?space=&project=, and the
// title as &label= when it says more than the id — so it can show the way back.
// The same shape as the Projection desk's own Light link (lightingDeskPath).
const lightHref = ({ isLocalInstall, space, project, projectLabel }) => {
    if (!isLocalInstall) return HOSTED_LIGHT_PATH
    if (!space || !project) return '/light/'
    const query = new URLSearchParams({ space, project })
    const title = typeof projectLabel === 'string' ? projectLabel.trim() : ''
    if (title && title !== project) query.set('label', title)
    return `/light/?${query.toString()}`
}

// Inside a project the bar grows with it (the layers decision, 2026-09-23,
// unit 3): each of the three later tools is on the bar once the project has
// reached its layer — Nodes when the room holds a thing, Projection when there
// is a connection, Light when a lamp stands in the room (src/project/layers.js).
// Outside a project every name stays, as before: a stranger meets the whole
// list where strangers meet it, which is why Light stayed on the hosted bar.
const LAYER_OF = { raw: 'connections', map: 'wall', light: 'lamps' }

// Has the project reached the layer that brings this tool? The one rule, read by the
// bar and by every other door to the same tools (Studio's jump buttons, desktop and
// phone) so a tool is never offered in one place while the bar still holds it back.
// `layers` null means "show everything": still loading, the open jam, "All tools".
export const layerReached = (key, layers) => !layers || !LAYER_OF[key] || Boolean(layers[LAYER_OF[key]])

export const surfaceDestinations = ({ isLocalInstall = false, space = null, project = null, projectLabel = null, layers = null, here = null } = {}) => {
    // A project only means something inside its space; without the space
    // there is no address to build.
    const inProject = Boolean(space && project)
    return DESTINATIONS
        .filter(d => !d.project || inProject)
        // `layers` is null until the project has loaded (nothing hides before
        // that), and null under "All tools". The surface you stand on is never
        // taken off the bar, whatever the project holds.
        .filter(d => !(inProject && d.key !== here && !layerReached(d.key, layers)))
        .map(d => {
            if (d.key === 'light') {
                return { ...d, href: lightHref({ isLocalInstall, space, project, projectLabel }), clientSide: !isLocalInstall }
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

// How many destinations fit, in order, before the rest go behind "More"
// (Priority+ navigation: show what fits, never slice a word off the edge).
// `widths` are each link's natural width, `gap` the space between two, `more`
// the More button's width, `avail` what the links row has. All of them fit →
// every one shows and no More. Otherwise as many as fit beside More, and at
// least none — More alone always stays reachable.
export const fitDestinations = ({ widths, gap, more, avail }) => {
    if (!(avail > 0) || !widths.length) return widths.length
    const all = widths.reduce((sum, w) => sum + w, 0) + gap * (widths.length - 1)
    if (all <= avail) return widths.length
    let used = more
    let count = 0
    for (const w of widths) {
        if (used + gap + w > avail) break
        used += gap + w
        count += 1
    }
    return count
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
    layers = null,         // inside a project: which layers are open (src/project/layers.js)
}) {
    // "⚒ All tools", kept in this browser, brings every name back.
    const allTools = useAllTools()
    const destinations = surfaceDestinations({ isLocalInstall, space, project, projectLabel, layers: allTools ? null : layers, here })

    // Priority+ (2026-09-27): a phone at 390px could not hold the bar — WIKI
    // was sliced off the right edge, and with every layer open seven names
    // need twice the width. Whatever fits shows in its fixed place; the rest
    // sits behind More. Measured off a hidden row, so a hidden name still has
    // a width to be brought back with.
    const linksRef = useRef(null)
    const measureRef = useRef(null)
    const childrenRef = useRef(null)
    const moreRef = useRef(null)
    const [shown, setShown] = useState(destinations.length)
    const [menuOpen, setMenuOpen] = useState(false)
    const [menuTop, setMenuTop] = useState(0)
    const keys = destinations.map(d => d.key).join(' ')

    const measure = useCallback(() => {
        const links = linksRef.current
        const row = measureRef.current
        if (!links || !row) return
        const items = [...row.children]
        const moreEl = items.pop()
        const style = window.getComputedStyle(links)
        const gap = parseFloat(style.columnGap) || 0
        const padding = (parseFloat(style.paddingLeft) || 0) + (parseFloat(style.paddingRight) || 0)
        const extra = childrenRef.current ? childrenRef.current.offsetWidth + gap : 0
        setShown(fitDestinations({
            widths: items.map(el => el.offsetWidth),
            gap,
            more: moreEl ? moreEl.offsetWidth : 0,
            avail: links.clientWidth - padding - extra,
        }))
    }, [])

    useLayoutEffect(() => {
        if (hidden) return undefined
        measure()
        if (typeof ResizeObserver !== 'function') return undefined
        const observer = new ResizeObserver(measure)
        if (linksRef.current) observer.observe(linksRef.current)
        if (measureRef.current) observer.observe(measureRef.current)
        return () => observer.disconnect()
    }, [hidden, keys, measure])

    // The menu closes on a choice, a tap anywhere else, Escape, or a resize.
    useEffect(() => {
        if (!menuOpen) return undefined
        const close = (event) => {
            if (event.type === 'keydown' && event.key !== 'Escape') return
            if (event.type === 'pointerdown' && (moreRef.current?.contains(event.target) || event.target.closest?.('.sbar-menu'))) return
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

    if (hidden) return null

    const visible = destinations.slice(0, shown)
    const overflow = destinations.slice(shown)
    const hereInMore = overflow.some(d => d.key === here)

    const linkFor = (d, className = 'sbar-link') => (
        <a
            key={d.key}
            className={`${className}${here === d.key ? ' is-here' : ''}`}
            href={d.href}
            aria-current={here === d.key ? 'page' : undefined}
            onClick={(event) => {
                setMenuOpen(false)
                if (d.clientSide) navigateInApp(event, d.href)
            }}
        >{d.label}</a>
    )

    const toggleMenu = () => {
        const rect = moreRef.current?.closest('.sbar')?.getBoundingClientRect()
        setMenuTop(rect ? rect.bottom : 0)
        setMenuOpen(open => !open)
    }

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
            <div className="sbar-links" ref={linksRef}>
                {visible.map(d => linkFor(d))}
                {overflow.length > 0 && (
                    <button
                        type="button"
                        ref={moreRef}
                        className={`sbar-link sbar-more${hereInMore ? ' is-here' : ''}`}
                        aria-haspopup="true"
                        aria-expanded={menuOpen}
                        onClick={toggleMenu}
                    >More</button>
                )}
                {children && <span className="sbar-extra" ref={childrenRef}>{children}</span>}
                <span className="sbar-measure-box" aria-hidden="true">
                    <span className="sbar-measure" ref={measureRef}>
                        {destinations.map(d => <span key={d.key} className="sbar-measure-item">{d.label}</span>)}
                        <span className="sbar-measure-item">More</span>
                    </span>
                </span>
            </div>
            {menuOpen && overflow.length > 0 && typeof document !== 'undefined' && createPortal(
                <div className="sbar-menu" style={{ top: menuTop }} role="menu" aria-label="More destinations">
                    {overflow.map(d => linkFor(d, 'sbar-link sbar-menu-link'))}
                </div>,
                document.body
            )}
        </nav>
    )
}
