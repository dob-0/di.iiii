import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ShowError, blockOf, chooseCue, cleanName, favouriteButtons, isLiveScene, liveOf } from './showApi.js'
import { useShowFeed } from './useShowFeed.js'

// THE FIVE FAVOURITE SCENE BUTTONS, ALWAYS ON SCREEN IN THE ROOM (owner, 2026-10-09: "it's just to see the
// light shows, and in virtual - like the favourite 5 scene buttons there"). A tap sends that scene to Light
// through the SAME POST .../choose as the list and the show page, so the server alone decides who may, the
// cooldown, the operator's lock; a laser scene is never in the row (the server refuses it, and never stars it).
// WHICH five is the operator's, kept on the server with the show's control state (`control.favourites`): every
// viewer reads the same five. Before he stars any: the first five non-laser looks. Nothing here computes a
// permission - `you.block` is read. Rectangles, 0-2 px, ember red for the live one, targets >= 44 px.
export const FAVOURITES_EVENT = 'di:show-answer'
const EMBER = '#ff3b3b'

export default function RoomFavourites({ spaceId, projectId, bottom = '5.2rem' }) {
    const { data, take } = useShowFeed(spaceId, projectId)
    const [sending, setSending] = useState(null)
    const [notice, setNotice] = useState('')
    const [now, setNow] = useState(() => Date.now())
    const rowRef = useRef(null)
    const [lift, setLift] = useState(null)
    // Sit just above the view bar (Floor / DJ / Top ...), wherever it stands on this screen: measured, never covering it.
    useEffect(() => {
        const place = () => {
            const bar = document.querySelector('[data-smart-view-bar]')
            const parent = rowRef.current?.offsetParent
            if (!bar || !parent) return setLift(null)
            const gap = parent.getBoundingClientRect().bottom - bar.getBoundingClientRect().top + 8
            setLift((old) => (old != null && Math.abs(old - gap) < 1 ? old : Math.max(8, Math.round(gap))))
        }
        place()
        const timer = setInterval(place, 1000)
        window.addEventListener('resize', place)
        return () => { clearInterval(timer); window.removeEventListener('resize', place) }
    }, [data])
    useEffect(() => {
        const timer = setInterval(() => setNow(Date.now()), 500)
        return () => clearInterval(timer)
    }, [])
    useEffect(() => {
        if (!notice) return undefined
        const timer = setTimeout(() => setNotice(''), 5000)
        return () => clearTimeout(timer)
    }, [notice])
    // The list (stars) and this row read the same server answer; a star set in the list shows here at once.
    useEffect(() => {
        const onAnswer = (event) => {
            const d = event.detail
            if (d?.body && d.spaceId === spaceId && d.projectId === projectId) take(d.body, d.t0, d.t1)
        }
        window.addEventListener(FAVOURITES_EVENT, onAnswer)
        return () => window.removeEventListener(FAVOURITES_EVENT, onAnswer)
    }, [spaceId, projectId, take])

    const serverNow = now + (data?.offset || 0)
    const live = useMemo(() => liveOf(data, serverNow), [data, serverNow])
    const cues = useMemo(() => data?.cues || [], [data?.cues])
    const buttons = useMemo(() => favouriteButtons(cues, data?.control?.favourites), [cues, data?.control?.favourites])
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
            take(await chooseCue(spaceId, projectId, { index: cue.index, cueId: cue.id, name: cleanName(readName()) }), t0, Date.now())
        } catch (e) {
            if (e instanceof ShowError && e.body?.cues) take(e.body, t0, Date.now())
            setNotice(e.message || 'Light did not take it.')
        } finally {
            setSending(null)
        }
    }, [spaceId, projectId, sending, take])

    if (!data || !buttons.length) return null
    return (
        <div ref={rowRef} data-testid="room-favourites" style={{ ...rowStyle, bottom: lift != null ? lift : bottom }}>
            {notice ? <p role="status" style={noticeStyle}>{notice}</p> : null}
            <ul aria-label="favourite scenes" style={listStyle}>
                {buttons.map((cue) => {
                    const isLive = isLiveScene(cue, live, cues)
                    const disabled = Boolean(cue.laser) || Boolean(block) || sending != null
                    const name = cue.title || cue.name
                    return (
                        <li key={cue.lookId} style={{ flex: '1 1 0', minWidth: 0 }}>
                            <button type="button" disabled={disabled} data-fav={cue.lookId} data-cue={cue.index} aria-current={isLive ? 'true' : undefined} title={name}
                                onClick={() => choose(cue)}
                                style={{ ...brickStyle, cursor: disabled ? 'default' : 'pointer', opacity: disabled && !isLive ? 0.55 : 1, borderColor: isLive ? EMBER : 'rgba(255,255,255,0.22)', background: isLive ? 'rgba(255,59,59,0.22)' : 'rgba(10,10,10,0.86)', boxShadow: isLive ? `inset 0 0 0 1px ${EMBER}` : 'none' }}>
                                <span aria-hidden="true" style={{ display: 'flex', gap: 2 }}>
                                    {(cue.swatch?.length ? cue.swatch.slice(0, 2) : [{ hex: '#000' }]).map((s, i) => (
                                        <span key={i} style={{ width: 12, height: 8, background: s.hex, border: '1px solid rgba(255,255,255,0.3)' }} />
                                    ))}
                                </span>
                                <span style={{ fontSize: '0.68rem', fontWeight: isLive ? 700 : 500, lineHeight: 1.15, maxWidth: '100%', overflowWrap: 'anywhere', textAlign: 'center', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{name}</span>
                            </button>
                        </li>
                    )
                })}
            </ul>
        </div>
    )
}

const NAME_KEY = 'di.show.name'
const readName = () => {
    try { return window.localStorage.getItem(NAME_KEY) || '' } catch { return '' }
}

const rowStyle = {
    position: 'absolute',
    left: '50%',
    transform: 'translateX(-50%)',
    zIndex: 19,
    width: 'min(34rem, calc(100vw - 2rem))',
    color: '#f5f7fa'
}
const listStyle = { listStyle: 'none', margin: 0, padding: 0, display: 'flex', gap: 4 }
const brickStyle = {
    width: '100%',
    minHeight: 48,
    padding: '0.25rem 0.2rem',
    border: '1px solid',
    borderRadius: 2,
    color: 'inherit',
    font: 'inherit',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    touchAction: 'manipulation',
    backdropFilter: 'blur(8px)'
}
const noticeStyle = { margin: '0 0 4px', padding: '0.3rem 0.5rem', background: EMBER, color: '#000', fontWeight: 700, fontSize: '0.75rem', borderRadius: 2 }
