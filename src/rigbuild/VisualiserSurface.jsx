import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { getProjectDocument } from '../project/services/projectsApi.js'
import { lightingDeskPath } from '../map/lightingLink.js'
import { useLightingDeskPresent } from '../rigMirror/useLightingMirror.js'
import { buildPublicProjectPath } from '../utils/spaceRouting.js'
import { TYPE_LIBRARY } from './types/index.js'
import { libraryWithShow } from './rental.js'
import { modeOf, typeById, isAssumedMode } from './fixtureTypes.js'
import { rigProgress } from './rigProgress.js'
import RigBar from './RigSteps.jsx'
import useLocalInstall from '../hooks/useLocalInstall.js'
import './visualiser.css'

// THE VISUALISER — /{space}/visualise/{projectId}. docs/architecture/RIG_BUILD.md §18.
//
// Owner, 2026-09-29: "our light and scene sync where i can with split screen or with 2
// window see the virtual version and test the lights". The light desk on one side, the
// room on the other; move a fader, fire a cue, run a chase or send from a console, and
// the room's lamps answer at the desk's frame rate.
//
// Nothing is rebuilt: both sides are the REAL pages, framed — the desk is /light (its
// own interface, same origin, local), the room is /{space}/p/{project} (the real
// PublicProjectViewer, which follows the desk's DMX through its own mirror). So the two
// windows case is the same thing: "pop out" opens either side in its own window, and it
// stays in sync because each side reads the desk, not this page. The same pair works on
// two machines: the desk on one, the room on another, both pointed at the same install.
//
// Chrome is small: the rig's steps row, then one thin line — the layout buttons, the
// room's fps and the desk's stream rate, and, while an ASSUMED channel list drives any
// lamp, the words that say so. The split is draggable (and keyboard: ←/→ on the divider);
// the layout is kept per viewer (localStorage, a convenience — the page works without it).

const KEEP = 'di.visualise.layout'
const clampSplit = (v) => Math.min(0.85, Math.max(0.15, Number(v) || 0.5))
const readKept = () => {
    try { return { split: 0.42, swapped: false, only: null, ...JSON.parse(window.localStorage.getItem(KEEP) || '{}') } } catch { return { split: 0.42, swapped: false, only: null } }
}
const keep = (layout) => { try { window.localStorage.setItem(KEEP, JSON.stringify(layout)) } catch { /* private mode: the page still works */ } }

/** The ASSUMED lists a project's lamps are patched with: one line per (type, mode). Pure. */
export const assumedInUse = (entities = [], library) => {
    const seen = new Map()
    for (const e of entities) {
        const f = e?.components?.fixture
        if (!f?.type) continue
        const type = typeById(library, f.type)
        const mode = type ? modeOf(type, f.mode || type.defaultMode) : null
        if (!mode || !isAssumedMode(mode)) continue
        const key = `${type.code} ${mode.name}`
        const row = seen.get(key) || { key, code: type.code, mode: mode.name, words: mode.assumed, url: mode.channelsSource?.url || null, n: 0 }
        row.n += 1
        seen.set(key, row)
    }
    return [...seen.values()].sort((a, b) => a.key.localeCompare(b.key))
}

export default function VisualiserSurface({ spaceId, projectId, library: baseLibrary = TYPE_LIBRARY, loadDocument = getProjectDocument }) {
    const [doc, setDoc] = useState({ status: 'loading', document: null, error: '' })
    const [layout, setLayout] = useState(readKept)
    const [popped, setPopped] = useState({ desk: false, room: false })
    const [readout, setReadout] = useState({ fps: null, stream: null, mode: null })
    const splitRef = useRef(null)
    const roomFrame = useRef(null)
    const windows = useRef({})
    const deskPresent = useLightingDeskPresent()
    const localInstall = useLocalInstall()

    useEffect(() => {
        let alive = true
        loadDocument(projectId).then((r) => { if (alive) setDoc({ status: 'ready', document: r?.document || null, error: '' }) })
            .catch((error) => {
                if (!alive) return
                const status = Number(error?.status)
                setDoc({ status: 'error', document: null, error: status === 401 || status === 403 ? 'This project belongs to a private space. Sign in, or ask for an invite.' : status === 404 ? 'There is no project here.' : 'The project could not be read.' })
            })
        return () => { alive = false }
    }, [projectId, loadDocument])

    const entities = doc.document?.entities
    const library = useMemo(() => libraryWithShow(baseLibrary, entities || []), [baseLibrary, entities])
    const assumed = useMemo(() => assumedInUse(entities || [], library), [entities, library])
    const progress = useMemo(() => (entities ? rigProgress({ entities, library, projectId }) : null), [entities, library, projectId])
    const title = doc.document?.projectMeta?.title || projectId

    useEffect(() => {
        const previous = document.title
        document.title = `Visualiser — ${title}`
        return () => { document.title = previous }
    }, [title])

    const set = useCallback((patch) => setLayout((l) => { const next = { ...l, ...patch }; keep(next); return next }), [])

    // The two sides' addresses: the real pages. The room is asked to carry its stopwatch
    // (?probe=1, visProbe.js) so its fps can be read here and a harness can time it.
    const deskHref = useMemo(() => {
        const path = lightingDeskPath({ spaceId, projectId, label: title })
        return `${path}${path.includes('?') ? '&' : '?'}from=visualise`
    }, [spaceId, projectId, title])
    // In the split the room is a window inside this page (?embed=1: no bar, no badge, no
    // Walk/Fly of its own — PublicProjectViewer); popped out it is the whole room page.
    const roomHref = useMemo(() => `${buildPublicProjectPath(spaceId, projectId)}?probe=1`, [spaceId, projectId])
    const roomFrameSrc = `${roomHref}&embed=1`

    // The room's readout: its own drawn fps and the stream it listens to (same origin).
    useEffect(() => {
        const timer = setInterval(() => {
            const w = roomFrame.current?.contentWindow || windows.current.room
            try {
                const fps = w?.__diVis?.fps?.() ?? null
                const s = w?.__diDeskStream || null
                setReadout((r) => {
                    const frames = s ? s.frames : null
                    const rate = frames != null && r.lastFrames != null ? Math.max(0, frames - r.lastFrames) : null
                    return { fps, stream: rate, mode: s?.mode || null, lastFrames: frames }
                })
            } catch { /* not ready */ }
        }, 1000)
        return () => clearInterval(timer)
    }, [])

    const popOut = (side) => {
        const href = side === 'desk' ? deskHref : roomHref
        const w = window.open(href, `di-visualise-${side}-${spaceId}-${projectId}`, 'popup=yes,width=1280,height=800')
        if (!w) return
        windows.current[side] = w
        setPopped((p) => ({ ...p, [side]: true }))
        const watch = setInterval(() => {
            if (!w.closed) return
            clearInterval(watch)
            delete windows.current[side]
            setPopped((p) => ({ ...p, [side]: false }))
        }, 1000)
    }
    const bringBack = (side) => {
        try { windows.current[side]?.close() } catch { /* gone */ }
        delete windows.current[side]
        setPopped((p) => ({ ...p, [side]: false }))
    }

    // Dragging the divider.
    const onDividerDown = (event) => {
        event.preventDefault()
        const box = splitRef.current?.getBoundingClientRect()
        if (!box) return
        const wide = box.width >= box.height * 0.9
        const move = (e) => {
            const f = wide ? (e.clientX - box.left) / box.width : (e.clientY - box.top) / box.height
            setLayout((l) => ({ ...l, split: clampSplit(l.swapped ? 1 - f : f) }))
        }
        const up = () => {
            window.removeEventListener('pointermove', move)
            window.removeEventListener('pointerup', up)
            setLayout((l) => { keep(l); return l })
            splitRef.current?.classList.remove('is-dragging')
        }
        splitRef.current?.classList.add('is-dragging')
        window.addEventListener('pointermove', move)
        window.addEventListener('pointerup', up)
    }
    const onDividerKey = (event) => {
        const step = event.shiftKey ? 0.1 : 0.02
        if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') set({ split: clampSplit(layout.split + (layout.swapped ? step : -step)) })
        if (event.key === 'ArrowRight' || event.key === 'ArrowDown') set({ split: clampSplit(layout.split - (layout.swapped ? step : -step)) })
    }

    const showDesk = !popped.desk && layout.only !== 'room'
    const showRoom = !popped.room && layout.only !== 'desk'
    const both = showDesk && showRoom
    const deskFirst = !layout.swapped
    const grid = both
        ? (deskFirst ? `${layout.split}fr 6px ${1 - layout.split}fr` : `${1 - layout.split}fr 6px ${layout.split}fr`)
        : '1fr'

    const deskPane = (
        <section className="vis-pane vis-pane--desk" aria-label="The light desk" key="desk">
            {doc.status === 'loading' ? null : deskPresent || localInstall.isLocal
                ? <iframe title="The light desk" src={deskHref} className="vis-frame" allow="midi" />
                : (
                    <div className="vis-note">
                        <p>The light desk runs on a di.iiii on your own machine (a local install), not on this server.</p>
                        <p>Here the room plays the show by its clock. On your machine: <code>di up</code>, then open this page there.</p>
                    </div>
                )}
        </section>
    )
    const roomPane = (
        <section className="vis-pane vis-pane--room" aria-label="The room" key="room">
            <iframe ref={roomFrame} title="The room" src={roomFrameSrc} className="vis-frame" allow="xr-spatial-tracking; fullscreen" />
        </section>
    )
    const divider = both ? (
        <button
            type="button"
            key="divider"
            className="vis-divider"
            aria-label={`Resize: the desk has ${Math.round((layout.swapped ? 1 - layout.split : layout.split) * 100)}% — drag, or arrow keys`}
            title="Drag to resize — or focus and use the arrow keys (Shift for bigger steps)"
            onPointerDown={onDividerDown}
            onKeyDown={onDividerKey}
        />
    ) : null
    const panes = [showDesk && deskPane, divider, showRoom && roomPane].filter(Boolean)
    if (!deskFirst) panes.reverse()

    const assumedCount = assumed.reduce((n, a) => n + a.n, 0)
    const pill = (on) => `vis-btn${on ? ' is-on' : ''}`
    return (
        <div className="vis-page">
            <RigBar spaceId={spaceId} projectId={projectId} projectLabel={title} here="visualise" progress={progress} isLocalInstall={localInstall.isLocal} layout="flow" />
            <div className="vis-line" role="toolbar" aria-label="Visualiser layout">
                <span className="vis-title">visualiser</span>
                <button type="button" className={pill(!layout.only)} onClick={() => set({ only: null })} aria-pressed={!layout.only}>both</button>
                <button type="button" className={pill(layout.only === 'desk')} onClick={() => set({ only: 'desk' })} aria-pressed={layout.only === 'desk'}>desk only</button>
                <button type="button" className={pill(layout.only === 'room')} onClick={() => set({ only: 'room' })} aria-pressed={layout.only === 'room'}>room only</button>
                <button type="button" className="vis-btn" onClick={() => set({ swapped: !layout.swapped })} title="Swap the two sides">⇄ swap</button>
                {popped.desk
                    ? <button type="button" className="vis-btn is-on" onClick={() => bringBack('desk')}>desk back in</button>
                    : <button type="button" className="vis-btn" onClick={() => popOut('desk')} title="Open the desk in its own window — it stays in sync">desk ↗</button>}
                {popped.room
                    ? <button type="button" className="vis-btn is-on" onClick={() => bringBack('room')}>room back in</button>
                    : <button type="button" className="vis-btn" onClick={() => popOut('room')} title="Open the room in its own window (or on another machine) — it stays in sync">room ↗</button>}
                <span className="vis-read" aria-live="off">
                    {readout.fps != null ? `room ${readout.fps} fps` : 'room …'}
                    {readout.mode === 'stream' ? ` · desk ${readout.stream ?? '…'} frames/s pushed` : readout.mode === 'poll' ? ' · desk polled 10/s' : ''}
                </span>
            </div>
            {assumed.length ? (
                <details className="vis-assumed">
                    <summary>ASSUMED channel lists drive {assumedCount} lamp{assumedCount === 1 ? '' : 's'} — verify on the rental units</summary>
                    <ul>
                        {assumed.map((a) => (
                            <li key={a.key}><b>{a.key}</b> ×{a.n} — {a.words}{a.url ? <> · <a href={a.url} target="_blank" rel="noreferrer">source</a></> : null}</li>
                        ))}
                    </ul>
                </details>
            ) : null}
            {doc.status === 'error' ? <p className="vis-note">{doc.error}</p> : null}
            <main ref={splitRef} className={`vis-split${layout.swapped ? ' is-swapped' : ''}`} style={{ gridTemplateColumns: grid, '--vis-rows': grid }}>
                {panes}
                {!showDesk && !showRoom ? <div className="vis-note"><p>Both sides are in their own windows.</p></div> : null}
            </main>
        </div>
    )
}
