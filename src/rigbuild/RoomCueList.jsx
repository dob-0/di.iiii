import { useCallback, useEffect, useMemo, useState } from 'react'
import { buildVanityProjectPath } from '../utils/spaceRouting.js'
import { ShowError, blockOf, chooseCue, cleanName, isLiveScene, liveOf, sceneButtons, setFavourites, toggledFavourites, youWords } from './showApi.js'
import { FAVOURITES_EVENT } from './RoomFavourites.jsx'
import { useShowFeed } from './useShowFeed.js'

// THE SCENE BUTTONS INSIDE THE ROOM (simple buttons, 2026-10-09: a press changes the scene and it HOLDS)
//
// THE CUE LIST INSIDE THE ROOM (RIG_BUILD.md §24). Owner, 2026-10-09, in the MOXIR v1.1 room:
// "why can't I select and change the light cue?" — the SHOW · DESK chip only displayed. Opened,
// the chip now lists the cues of the show; a tap sends that cue to Light through the SAME
// POST /api/spaces/:space/show/:project/choose as the show page, so the server alone decides:
// who may (operator · team · everyone), the cooldown, the operator's lock — and a laser
// moment is refused for everybody (here: listed, never tappable). Nothing here computes a
// permission; `you.block` is read. Rectangles, 0–2 px, targets ≥ 44 px, house look.
//
// Only mounted while the chip is open, so a closed chip costs the room no request.
const EMBER = '#ff3b3b'
const brickBase = {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    width: '100%',
    minHeight: '48px',
    padding: '0.3rem 0.6rem',
    border: '1px solid rgba(255,255,255,0.14)',
    borderRadius: 2,
    background: '#0a0a0a',
    color: 'inherit',
    font: 'inherit',
    textAlign: 'left'
}

const starStyle = (on) => ({
    position: 'absolute', top: 0, right: 0, width: 44, height: '100%', minHeight: 44, border: 0, borderRadius: 0,
    background: 'transparent', color: on ? EMBER : 'rgba(255,255,255,0.7)', font: 'inherit', fontSize: '1.15rem', cursor: 'pointer', touchAction: 'manipulation'
})

function Squares({ swatch = [] }) {
    return (
        <span aria-hidden="true" style={{ display: 'inline-flex', gap: 2, flex: '0 0 auto' }}>
            {(swatch.length ? swatch.slice(0, 2) : [{ hex: '#000' }]).map((s, i) => (
                <span key={i} style={{ width: 14, height: 14, borderRadius: 0, background: s.hex, border: '1px solid rgba(255,255,255,0.3)' }} />
            ))}
        </span>
    )
}

export default function RoomCueList({ spaceId, projectId, onChosen }) {
    const { data, error, take } = useShowFeed(spaceId, projectId)
    const [sending, setSending] = useState(null) // index being sent
    const [notice, setNotice] = useState('')
    const [mine, setMine] = useState(null)
    const [now, setNow] = useState(() => Date.now())
    useEffect(() => {
        const timer = setInterval(() => setNow(Date.now()), 500)
        return () => clearInterval(timer)
    }, [])
    useEffect(() => {
        if (!notice) return undefined
        const timer = setTimeout(() => setNotice(''), 6000)
        return () => clearTimeout(timer)
    }, [notice])

    const serverNow = now + (data?.offset || 0)
    const live = useMemo(() => liveOf(data, serverNow), [data, serverNow])
    const cues = data?.cues || []
    const cooldownLeftMs = data ? Math.max(0, (data.control?.cooldownLeftMs || 0) - Math.max(0, now - data.receivedAt)) : 0
    const lightBlocked = Boolean(data && (data.light?.state === 'none' || data.clock?.showSource === 'clock'))
    const lightBusy = Boolean(data && (data.light?.otherList || data.light?.otherShow))
    const block = lightBlocked ? 'no-light' : lightBusy ? 'busy' : blockOf(data, cooldownLeftMs)

    const choose = useCallback(async (cue) => {
        if (cue.laser || sending != null) return
        setSending(cue.index)
        setNotice('')
        const t0 = Date.now()
        try {
            const body = await chooseCue(spaceId, projectId, { index: cue.index, cueId: cue.id, name: cleanName(readName()) })
            take(body, t0, Date.now())
            setMine({ title: cue.title || cue.name })
            onChosen?.()
        } catch (e) {
            if (e instanceof ShowError && e.body?.cues) take(e.body, t0, Date.now())
            setNotice(e.message || 'Light did not take it.')
        } finally {
            setSending(null)
        }
    }, [spaceId, projectId, sending, take, onChosen])

    // The operator's stars: the five favourite buttons in the room (RoomFavourites.jsx). The server keeps and checks the list.
    const isOperator = data?.you?.who === 'operator'
    const favourites = useMemo(() => data?.control?.favourites || [], [data?.control?.favourites])
    const star = useCallback(async (cue) => {
        const t0 = Date.now()
        try {
            const body = await setFavourites(spaceId, projectId, toggledFavourites(favourites, cue.lookId))
            take(body, t0, Date.now())
            window.dispatchEvent(new CustomEvent(FAVOURITES_EVENT, { detail: { body, spaceId, projectId, t0, t1: Date.now() } }))
        } catch (e) {
            setNotice(e.message || 'The favourites did not save.')
        }
    }, [spaceId, projectId, favourites, take])

    const showHref = buildVanityProjectPath(spaceId, projectId).replace(/\/([^/]+)$/, '/show/$1')
    const why = block ? youWords(data, cooldownLeftMs, mine) : ''
    return (
        <div data-testid="room-cue-list" style={{ borderTop: '1px solid rgba(255,255,255,0.14)' }}>
            {error ? <p role="alert" style={{ margin: 0, padding: '0.5rem 0.95rem', background: EMBER, color: '#000', fontWeight: 700, fontSize: '0.8rem' }}>{error.status ? error.message : 'No link to the server — this list is old. Trying again…'}</p> : null}
            {!data && !error ? <p style={{ margin: 0, padding: '0.5rem 0.95rem', fontSize: '0.8rem', opacity: 0.8 }}>Loading the scenes…</p> : null}
            {notice || why ? <p role="status" data-block={block || ''} style={{ margin: 0, padding: '0.4rem 0.95rem', borderLeft: `2px solid ${notice ? EMBER : 'rgba(255,255,255,0.4)'}`, fontSize: '0.8rem', opacity: notice ? 1 : 0.75 }}>{notice || why}</p> : null}
            <ol aria-label="the scenes of the show" style={{ listStyle: 'none', margin: 0, padding: '0.5rem 0.6rem', display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 6, maxHeight: 'min(52dvh, 24rem)', overflowY: 'auto' }}>
                {sceneButtons(cues).map((cue) => {
                    const isLive = isLiveScene(cue, live, cues)
                    const disabled = Boolean(cue.laser) || Boolean(block) || sending != null
                    return (
                        <li key={cue.id} style={{ position: 'relative' }}>
                            <button type="button" disabled={disabled} data-cue={cue.index} aria-current={isLive ? 'true' : undefined}
                                title={cue.laser ? 'laser scene — operator only' : undefined}
                                onClick={() => choose(cue)}
                                style={{ ...brickBase, paddingRight: isOperator && !cue.laser ? '2.9rem' : brickBase.padding.split(' ')[1], cursor: disabled ? 'default' : 'pointer', borderStyle: cue.laser ? 'dashed' : 'solid', opacity: cue.laser ? 0.6 : 1, background: isLive ? 'rgba(255,59,59,0.16)' : brickBase.background, borderColor: isLive ? EMBER : "rgba(255,255,255,0.14)", boxShadow: isLive ? `inset 0 0 0 1px ${EMBER}` : 'none', touchAction: 'manipulation' }}>
                                <Squares swatch={cue.swatch} />
                                {/* The name keeps whole words (a narrow phone broke "RETURNS" mid-word); the
                                    operator tag sits under the name, not beside it, so it never squeezes the name. */}
                                <span style={{ flex: '1 1 auto', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
                                    <span style={{ fontSize: '0.8rem', fontWeight: isLive ? 700 : 500, lineHeight: 1.2, overflowWrap: 'break-word', hyphens: 'auto' }}>{cue.title || cue.name}</span>
                                    {cue.laser && !isLive ? <span style={{ fontSize: '0.55rem', letterSpacing: '0.08em', opacity: 0.7 }}>OPERATOR ONLY</span> : null}
                                </span>
                                {isLive ? <span style={{ fontSize: '0.6rem', letterSpacing: '0.12em', color: EMBER, flex: '0 0 auto' }}>LIVE</span> : null}
                            </button>
                            {isOperator && !cue.laser ? (
                                <button type="button" data-star={cue.lookId} aria-pressed={favourites.includes(cue.lookId)} aria-label={`${favourites.includes(cue.lookId) ? 'Remove' : 'Add'} ${cue.title || cue.name} ${favourites.includes(cue.lookId) ? 'from' : 'to'} the favourites`}
                                    onClick={() => star(cue)} style={starStyle(favourites.includes(cue.lookId))}>
                                    {favourites.includes(cue.lookId) ? '★' : '☆'}
                                </button>
                            ) : null}
                        </li>
                    )
                })}
            </ol>
            <a href={showHref} style={{ display: 'flex', alignItems: 'center', minHeight: '44px', padding: '0 0.95rem', borderTop: '1px solid rgba(255,255,255,0.08)', color: EMBER, fontSize: '0.8rem' }}>
                open the show page
            </a>
        </div>
    )
}

const NAME_KEY = 'di.show.name'
const readName = () => {
    try { return window.localStorage.getItem(NAME_KEY) || '' } catch { return '' }
}
