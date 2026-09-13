/* global __APP_VERSION__ */
import { useCallback, useEffect, useMemo, useState } from 'react'
import './toolsRoom.css'
import SurfaceBar from '../components/SurfaceBar.jsx'
import { isEmbedRequest } from '../utils/previewMode.js'
import { DeskMark, LightMark, MapperMark, RawMark, StudioMark } from './toolMarks.jsx'
import { listProjects } from '../project/services/projectsApi.js'
import { listServerSpaces } from '../services/serverSpaces.js'

/**
 * `/tools` — where every tool is opened from.
 *
 * Each of them was built and then had no door: the lighting desk answers only
 * at /light, the projection mapper at /{space}/map/{project} — an address that
 * needs a project id nothing in the interface will tell you — and Raw's own
 * front door drops you on a canvas saved to no space, which reads as broken.
 * The bar along the top of the local home named four of them and appeared on
 * exactly one page.
 *
 * The shape is the one every serious launcher settles on: a bounded set of
 * destinations, grouped by what they are for, one tile each, one picture, one
 * line of state. Not a scrolling library — there are five, and there will not
 * be twenty.
 *
 * Two things it deliberately does not do. It does not ask the lighting desk how
 * it is: that request is what builds the desk and binds its Art-Net socket
 * (serverXR/src/routes/lightingRoutes.js), and opening a door must not start
 * the machine behind it. And it draws no live thumbnails, for the same reason.
 */

const DESK_URL = 'http://localhost:4748'

export default function ToolsRoom({ isLocalInstall = false }) {
    const isEmbed = isEmbedRequest()
    const [spaces, setSpaces] = useState(null)
    const [picking, setPicking] = useState(null)   // key of the tool asking for a project
    const [inSpace, setInSpace] = useState(null)   // space chosen inside that dialog
    const [projects, setProjects] = useState({ loading: false, items: null, failed: false })

    useEffect(() => {
        let alive = true
        listServerSpaces()
            .then((list) => { if (alive) setSpaces(Array.isArray(list) ? list : []) })
            .catch(() => { if (alive) setSpaces([]) })
        return () => { alive = false }
    }, [])

    const close = useCallback(() => {
        setPicking(null)
        setInSpace(null)
        setProjects({ loading: false, items: null, failed: false })
    }, [])

    useEffect(() => {
        if (!picking) return undefined
        const onKey = (event) => { if (event.key === 'Escape') close() }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
    }, [picking, close])

    const openSpace = useCallback((spaceId) => {
        setInSpace(spaceId)
        setProjects({ loading: true, items: null, failed: false })
        listProjects(spaceId)
            .then((items) => setProjects({ loading: false, items: Array.isArray(items) ? items : [], failed: false }))
            .catch(() => setProjects({ loading: false, items: null, failed: true }))
    }, [])

    const spaceCount = spaces === null ? null : spaces.length

    const groups = useMemo(() => ([
        {
            label: 'Author',
            tools: [
                {
                    key: 'studio',
                    name: 'Studio',
                    meta: spaceCount === null ? '—' : `${spaceCount} ${spaceCount === 1 ? 'space' : 'spaces'}`,
                    Mark: StudioMark,
                    href: '/studio'
                },
                {
                    key: 'raw',
                    name: 'Raw',
                    meta: 'node canvas',
                    Mark: RawMark,
                    // A bare /raw is a canvas held in this browser and saved to
                    // no space. Offer the real work first; that door stays, named
                    // for what it is, at the bottom of the dialog.
                    picker: {
                        say: 'Open a project on the node canvas, or start a canvas that is saved nowhere.',
                        href: (spaceId, projectId) => `/${spaceId}/raw/projects/${projectId}`,
                        alsoText: 'a bare canvas, saved nowhere',
                        alsoHref: '/raw'
                    }
                }
            ]
        },
        {
            label: 'Show',
            tools: [
                isLocalInstall && {
                    key: 'light',
                    name: 'Light',
                    meta: 'Art-Net · output off',
                    Mark: LightMark,
                    href: '/light/'
                },
                {
                    key: 'map',
                    name: 'Projection',
                    meta: 'needs a project',
                    muted: true,
                    Mark: MapperMark,
                    picker: {
                        say: 'Shape the picture to the wall it is thrown on. Choose what to map.',
                        href: (spaceId, projectId) => `/${spaceId}/map/${projectId}`
                    }
                }
            ].filter(Boolean)
        },
        isLocalInstall && {
            label: 'This machine',
            tools: [
                {
                    key: 'desk',
                    name: 'Desk',
                    meta: 'port 4748',
                    muted: true,
                    Mark: DeskMark,
                    href: DESK_URL,
                    external: true
                }
            ]
        }
    ].filter(Boolean)), [isLocalInstall, spaceCount])

    const asking = useMemo(
        () => groups.flatMap((group) => group.tools).find((tool) => tool.key === picking) || null,
        [groups, picking]
    )

    return (
        <div className="tr">
            <SurfaceBar here="tools" isLocalInstall={isLocalInstall} hidden={isEmbed} />

            <div className="tr-page">
                <h1 className="tr-title">Tools</h1>
                <p className="tr-lede">
                    {isLocalInstall
                        // True on an install and false on the hosted tiers, where
                        // this same screen was telling a visitor to staging that
                        // nothing reaches the internet — from a page served over it.
                        ? 'Everything di.iiii can do, in one place. Each opens on this machine — nothing here reaches the internet.'
                        : 'Everything di.iiii can do, in one place. Some of it — the lighting desk, the sessions desk — only exists on a di.iiii running on your own machine.'}
                </p>

                <div className="tr-groups">
                {groups.map((group) => (
                    <section className="tr-group" key={group.label}>
                        <h2 className="tr-group-label">{group.label}</h2>
                        <div className="tr-grid">
                            {group.tools.map((tool) => {
                                const className = `tr-tile${tool.muted ? ' is-muted' : ''}`
                                const inside = (
                                    <>
                                        <span className="tr-mark"><tool.Mark /></span>
                                        <span className="tr-foot">
                                            <span className="tr-tile-name">{tool.name}</span>
                                            <span className="tr-tile-meta">{tool.meta}</span>
                                        </span>
                                    </>
                                )
                                return tool.picker
                                    ? (
                                        <button type="button" key={tool.key} className={className} onClick={() => setPicking(tool.key)}>
                                            {inside}
                                        </button>
                                    )
                                    : (
                                        <a
                                            key={tool.key}
                                            className={className}
                                            href={tool.href}
                                            {...(tool.external ? { target: '_blank', rel: 'noopener' } : {})}
                                        >
                                            {inside}
                                        </a>
                                    )
                            })}
                        </div>
                    </section>
                ))}
                </div>

                <div className="tr-version">di.iiii v{typeof __APP_VERSION__ === 'undefined' ? '' : __APP_VERSION__}</div>
            </div>

            {asking && (
                <div className="tr-scrim" role="presentation" onClick={(event) => { if (event.target === event.currentTarget) close() }}>
                    <div className="tr-dialog" role="dialog" aria-label={`Open ${asking.name}`}>
                        <div className="tr-dialog-head">
                            <div className="tr-dialog-title">{asking.name}</div>
                            <p className="tr-dialog-say">{asking.picker.say}</p>
                        </div>

                        <div className="tr-crumbs">
                            {inSpace
                                ? <><button type="button" onClick={() => { setInSpace(null); setProjects({ loading: false, items: null, failed: false }) }}>spaces</button><span>/</span><span>{inSpace}</span></>
                                : <span>choose a space</span>}
                        </div>

                        <div className="tr-list">
                            {!inSpace && spaces === null && <div className="tr-empty">reading your spaces…</div>}
                            {!inSpace && spaces?.length === 0 && <div className="tr-empty">no spaces on this machine yet.</div>}
                            {!inSpace && spaces?.map((space) => (
                                <button type="button" key={space.id} className="tr-row" onClick={() => openSpace(space.id)}>
                                    <span>{space.label || space.id}</span>
                                    <span className="tr-row-id">{space.id}</span>
                                </button>
                            ))}

                            {inSpace && projects.loading && <div className="tr-empty">reading {inSpace}…</div>}
                            {inSpace && projects.failed && <div className="tr-empty">{inSpace} did not answer.</div>}
                            {inSpace && projects.items?.length === 0 && <div className="tr-empty">{inSpace} has nothing to open yet.</div>}
                            {inSpace && projects.items?.map((project) => (
                                <a key={project.id} className="tr-row" href={asking.picker.href(inSpace, project.id)}>
                                    <span>{project.title || project.name || project.id}</span>
                                    <span className="tr-row-id">open →</span>
                                </a>
                            ))}
                        </div>

                        <div className="tr-dialog-foot">
                            {asking.picker.alsoHref && (
                                <a className="tr-quiet" href={asking.picker.alsoHref}>{asking.picker.alsoText}</a>
                            )}
                            <button type="button" className="tr-quiet tr-spacer" onClick={close}>close</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
