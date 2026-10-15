import { Suspense, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import lazyWithReload from '../utils/lazyWithReload.js'
import { useRigLookEntities } from './useRigLook.js'
import { useLightPool } from './useLightPool.js'
import { showWords } from './showClock.js'
import { deskCues, cueClockWords } from './cueRun.js'
import LoadingScreen from '../components/LoadingScreen.jsx'

// THE SPACE VIEW FOLLOWS THE SHOW (RIG_BUILD.md §15.6, §16). /{space} — the room as it
// opens, the one the owner watches a show in — draws the lamps posed by the look that is
// on: the desk's live look where a desk answers (a local install), else the show's own
// clock (a hosted tier: every viewer computes the same cue from the wall clock, no desk,
// no account). Faded between cues, the wash at the look's level, strobes as flashes.
// Lazy-loaded by PublicProjectViewer only when the room holds a rig, so a space with
// none pays nothing. `onEntities(null)` = draw the document as it is.
//
// While the clock drives, a small SHOW chip says which look is on and, opened, lists
// the looks of the loop — the one piece of chrome, small, the room stays the picture.
// The cue list is only fetched when a chip is opened (RoomCueList.jsx).
const RoomFavourites = lazyWithReload(() => import('./RoomFavourites.jsx'), 'room-favourites')
const RoomCueList = lazyWithReload(() => import('./RoomCueList.jsx'), 'room-cue-list')

export default function RoomLookFollower({ document, onEntities, top = '1rem', showChip = true, spaceId = '', projectId = '', bare = false, slot = null }) {
    // PREVIEW (owner 2026-10-12 05:3x: "scenes where we can pick ... now I can't in view select the scenes, it's the operator-only
    // mode; can we have a preview mode"): a look chosen in the chip is shown to THIS viewer only; the show clock keeps running for
    // everyone else and the chip says so. 'Follow the show' (or another document) drops it.
    const [preview, setPreview] = useState(null)
    useEffect(() => { setPreview(null) }, [document?.projectMeta?.id])
    const look = useRigLookEntities(document)
    const previewed = useRigLookEntities(document, { explicit: preview ?? '' })
    // The light pool (lightPool.js): OFF by default; on, the look's light is carried by N
    // fixed slot lights. Off, `entities` passes through as the same array.
    const entities = useLightPool(preview ? previewed.entities : look.entities, document)
    useEffect(() => {
        onEntities(entities === document?.entities ? null : entities)
    }, [entities, document, onEntities])
    useEffect(() => () => onEntities(null), [onEntities])
    if (!showChip) return null
    // The five favourite scenes, always on screen (RoomFavourites.jsx) - wherever a desk or the clock drives the room.
    const row = spaceId && projectId && (look.driver === 'desk' || (look.driver === 'clock' && look.clock))
        ? <Suspense fallback={null}><RoomFavourites spaceId={spaceId} projectId={projectId} /></Suspense> : null
    // In the scene bar (bare) the chip is drawn INTO the bar's slot; the favourites row stays where it is (bottom of the scene).
    const place = (chip) => (bare ? (slot ? createPortal(chip, slot) : null) : chip)
    if (look.driver === 'desk') return <>{place(<DeskShowChip bare={bare} projectId={document?.projectMeta?.id} top={top} spaceId={spaceId} routeProject={projectId} />)}{row}</>
    if (look.driver !== 'clock' || !look.clock) return null
    return <>{place(<ShowChip bare={bare} show={look.show} state={look.clock} offset={look.clockOffset} top={top} spaceId={spaceId} routeProject={projectId} preview={preview} onPreview={setPreview} />)}{row}</>
}

/**
 * The words of the desk's own cue runner for this room: "3 / 13 · Act 1 · the silhouette · next in 9 s · loop", or ''
 * when the desk runs no list for this project (another room's list, or none). Pure.
 */
export const deskShowWords = (cues, projectId) => {
    if (!cues || !projectId || cues.project !== projectId || !(cues.n > 0) || cues.index == null || cues.index < 0) return ''
    return [`${cues.index + 1} / ${cues.n}`, cues.name || '', cueClockWords(cues)].filter(Boolean).join(' · ')
}

// WHERE A DESK DRIVES THE ROOM (a local install: the desk outranks the show's clock, showClock.js), the chip says so: the
// desk's own runner, read once a second while the tab is visible (the cards page reads it the same way). Before
// 2026-10-08 the room said nothing here, and a room played by the desk looked like a room playing nothing (MOXIR v1.0).
export function DeskShowChip({ projectId, top, spaceId = '', routeProject = '', bare = false }) {
    const [cues, setCues] = useState(null)
    const [open, setOpen] = useState(false)
    const [again, setAgain] = useState(0) // bumped after a choice: read the desk now, not in a second
    useEffect(() => {
        let gone = false
        const tick = async () => {
            if (typeof window !== 'undefined' && window.document?.visibilityState === 'hidden') return
            try { const c = await deskCues.read(); if (!gone) setCues(c) } catch { if (!gone) setCues(null) }
        }
        tick()
        const timer = setInterval(tick, 1000)
        return () => { gone = true; clearInterval(timer) }
    }, [again])
    // The desk answers but plays no list of THIS room (nothing yet, or another project's list): the chip stays,
    // so the cue can still be chosen from here (owner, 2026-10-09: "why can't I select and change the light cue?").
    if (!cues) return null
    const line = deskShowWords(cues, projectId)
        || (cues.project && cues.project !== projectId && cues.n > 0 ? "the desk plays another project's list · choose a cue" : 'no cue on yet · choose one')
    return (
        <div style={chipBox(bare, top)} data-testid="rig-show-chip" data-driver="desk" data-cue={cues.index}>
            <button type="button" style={buttonStyle} aria-expanded={open} onClick={() => setOpen((o) => !o)} disabled={!spaceId || !routeProject}
                title="The light desk on this machine plays the cue list; the room follows it. Tap to see the cues and choose one.">
                <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: 0, background: '#ff3b3b', boxShadow: '0 0 8px #ff3b3b', flex: '0 0 auto' }} />
                <span style={{ fontWeight: 700, letterSpacing: '0.08em', fontSize: '0.72rem', flex: '0 0 auto' }}>SHOW · DESK</span>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{line}</span>
                <Caret open={open} />
            </button>
            {open ? <Drop bare={bare}><CueListPanel spaceId={spaceId} projectId={routeProject} onChosen={() => setAgain((n) => n + 1)} /></Drop> : null}
        </div>
    )
}

function Caret({ open }) {
    return <span aria-hidden="true" style={{ marginLeft: 'auto', flex: '0 0 auto', opacity: 0.7, fontSize: '0.7rem' }}>{open ? '▲' : '▼'}</span>
}

function CueListPanel(props) {
    return <Suspense fallback={<LoadingScreen variant="inline" label="Loading the cues" text="loading the cues" />}><RoomCueList {...props} /></Suspense>
}

const chipStyle = {
    position: 'absolute',
    left: '1rem',
    zIndex: 20,
    maxWidth: 'calc(100vw - 2rem)',
    width: 'max-content',
    minWidth: 'min(22rem, calc(100vw - 2rem))',
    borderRadius: '2px',
    border: '1px solid rgba(255,255,255,0.14)',
    background: 'rgba(10, 16, 24, 0.82)',
    backdropFilter: 'blur(12px)',
    color: '#f5f7fa',
    fontSize: '0.85rem',
    lineHeight: 1.3
}

// In the scene bar (bare) the chip is one cell of the bar: no border or glass of its own, and its
// opened cue list hangs under the bar as a panel instead of growing the bar.
const chipBox = (bare, top) => (bare
    ? { position: 'relative', minWidth: 0, flex: '0 1 auto', color: '#f5f7fa', fontSize: '0.85rem', lineHeight: 1.3 }
    : { ...chipStyle, top })
const Drop = ({ bare, children }) => (bare
    ? <div style={{ position: 'absolute', top: 'calc(100% + 3px)', left: 0, width: 'max-content', minWidth: 'min(22rem, calc(100vw - 2rem))', maxWidth: 'calc(100vw - 2rem)', maxHeight: '60vh', overflowY: 'auto', borderRadius: '2px', border: '1px solid rgba(255,255,255,0.14)', background: 'rgba(10, 16, 24, 0.94)', backdropFilter: 'blur(12px)' }}>{children}</div>
    : children)

const previewButton = { font: 'inherit', fontSize: '0.78rem', color: '#fff', background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.25)', borderRadius: 0, padding: '0.22rem 0.55rem', cursor: 'pointer' }
const buttonStyle = {
    display: 'flex',
    alignItems: 'center',
    gap: '0.55rem',
    minHeight: '44px',
    padding: '0 0.95rem',
    border: 0,
    background: 'transparent',
    color: 'inherit',
    font: 'inherit',
    cursor: 'pointer',
    textAlign: 'left',
    maxWidth: '100%'
}

// The chip's own second hand: "next in N s" counts down once a second. The ROOM does not
// re-render for it — only this chip does.
const useSecondTick = () => {
    const [now, setNow] = useState(() => Date.now())
    useEffect(() => {
        const timer = setInterval(() => setNow(Date.now()), 1000)
        return () => clearInterval(timer)
    }, [])
    return now
}

export function ShowChip({ show, state, offset, top, spaceId = '', routeProject = '', bare = false, preview = null, onPreview = null }) {
    const [open, setOpen] = useState(false)
    const now = useSecondTick() + (offset?.offset || 0)
    const nextInMs = state.nextInMs == null ? null : Math.max(0, state.firedAt + (show.cues[state.index]?.holdMs || 0) - now)
    const previewCue = preview ? show.cues.find((c) => c.lookId === preview) : null
    const line = preview ? `PREVIEW · ${previewCue?.name || preview} · the show is on ${showWords({ ...state, nextInMs }, show)}` : showWords({ ...state, nextInMs }, show)
    const previewRow = onPreview ? (
        <div role="group" aria-label="preview a look, for you only" style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem', padding: '0.5rem 0.95rem 0.4rem' }}>
            {show.cues.map((c) => (
                <button key={c.id} type="button" onClick={() => onPreview(c.lookId)} aria-pressed={preview === c.lookId}
                    style={{ ...previewButton, fontWeight: preview === c.lookId ? 700 : 400, outline: preview === c.lookId ? '1px solid #fff' : 'none' }}>{c.name}</button>
            ))}
            <button type="button" onClick={() => onPreview(null)} disabled={!preview} style={{ ...previewButton, opacity: preview ? 1 : 0.5 }}>Follow the show</button>
        </div>
    ) : null
    return (
        <div style={chipBox(bare, top)} data-testid="rig-show-chip" data-look={preview || state.lookId} data-cue={state.index} data-preview={preview || undefined}>
            <button type="button" style={buttonStyle} aria-expanded={open} onClick={() => setOpen((o) => !o)}
                title="The show plays by the clock: everyone watching sees the same look at the same moment">
                <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: 0, background: '#ff3b3b', boxShadow: '0 0 8px #ff3b3b', flex: '0 0 auto' }} />
                <span style={{ fontWeight: 700, letterSpacing: '0.08em', fontSize: '0.72rem', flex: '0 0 auto' }}>SHOW</span>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{line}</span>
                <Caret open={open} />
            </button>
            {open ? <Drop bare={bare}>{previewRow}{spaceId && routeProject
                ? <CueListPanel spaceId={spaceId} projectId={routeProject} />
                : (
                    <ol style={{ margin: 0, padding: '0 0.95rem 0.7rem 2.2rem' }} aria-label="the looks of the show, in order">
                        {show.cues.map((c, i) => (
                            <li key={c.id} aria-current={i === state.index ? 'step' : undefined}
                                style={{ padding: '0.18rem 0', opacity: i === state.index ? 1 : 0.62, fontWeight: i === state.index ? 700 : 400 }}>
                                {c.name} <span style={{ opacity: 0.7 }}>· {Math.round(c.holdMs / 1000)} s</span>
                            </li>
                        ))}
                        <li style={{ listStyle: 'none', marginLeft: '-1.25rem', paddingTop: '0.35rem', opacity: 0.62, fontSize: '0.78rem' }}>
                            {show.loop ? 'Loops. ' : ''}Everyone watching sees the same look at the same moment.
                        </li>
                    </ol>
                )}</Drop> : null}
        </div>
    )
}
