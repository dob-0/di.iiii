import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ShowError, blockOf, chooseCue, cleanName, favouriteButtons, isLiveScene, liveOf } from './showApi.js'
import { useShowFeed } from './useShowFeed.js'
import useRememberedOpen from '../utils/rememberedOpen.js'
import { CHIP, ACTIVE, INK, LINE } from './chromeStyle.js'

// THE TEN FAVOURITE SCENE BUTTONS (were five; owner, 2026-10-09: "10 animated scenes in favorite"), IN THE ROOM BEHIND ONE SMALL CONTROL (owner 2026-10-13:
// "look how many UI things pop up when you first load the view page; they cover the view" - before, the ten bricks stood on the scene from the first frame;
// now the scene is the page and "Scenes" opens them, remembered for that viewer only, rememberedOpen.js). A tap sends that scene to Light
// through the SAME POST .../choose as the list and the show page, so the server alone decides who may, the
// cooldown, the operator's lock; a laser scene is never in the row (the server refuses it, and never stars it).
// WHICH ten is the operator's, kept on the server with the show's control state (`control.favourites`): every
// viewer reads the same ten. Before he stars any: the first ten non-laser looks. On a phone the row wraps to two rows of five,
// on a desktop it is one row of ten. Nothing here computes a
// permission - `you.block` is read. Rectangles, 0-2 px, ember red for the live one, targets >= 44 px.
export const FAVOURITES_EVENT = 'di:show-answer'
const EMBER = 'var(--di-danger, #f25f5c)'
// A phone-wide screen wraps ten buttons to 2 x 5; wider screens keep one row. Measured by moxirMotion tests and a real browser.
const WIDE_QUERY = '(min-width: 720px)'
const useWide = () => {
    const read = () => (typeof window !== 'undefined' && typeof window.matchMedia === 'function' ? window.matchMedia(WIDE_QUERY).matches : true)
    const [wide, setWide] = useState(read)
    useEffect(() => {
        if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return undefined
        const mq = window.matchMedia(WIDE_QUERY)
        const on = () => setWide(mq.matches)
        on()
        mq.addEventListener?.('change', on)
        return () => mq.removeEventListener?.('change', on)
    }, [])
    return wide
}

export default function RoomFavourites({ spaceId, projectId, bottom = '5.2rem' }) {
    const { data, take } = useShowFeed(spaceId, projectId)
    const [sending, setSending] = useState(null)
    const [notice, setNotice] = useState('')
    const [now, setNow] = useState(() => Date.now())
    const rowRef = useRef(null)
    const wide = useWide()
    const [lift, setLift] = useState(null)
    const [open, toggleOpen] = useRememberedOpen('bricks')
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
            <div style={{ display: 'flex', justifyContent: 'center' }}>
                <button type="button" data-testid="room-favourites-toggle" aria-expanded={open} aria-controls="room-favourites-list" onClick={toggleOpen}
                    title={open ? 'Hide the scenes' : 'Show the scenes: tap one to change the light'}
                    style={{ ...CHIP, pointerEvents: 'auto', marginBottom: open ? 4 : 0, color: open ? ACTIVE : INK }}>
                    Scenes <span aria-hidden="true" style={{ opacity: 0.7 }}>{open ? '▾' : '▴'}</span>
                </button>
            </div>
            {open ? <ul id="room-favourites-list" aria-label="favourite scenes" data-cols={wide ? 10 : 5} style={{ ...listStyle, gridTemplateColumns: `repeat(${wide ? 10 : 5}, minmax(0, 1fr))` }}>
                {buttons.map((cue) => {
                    const isLive = isLiveScene(cue, live, cues)
                    const disabled = Boolean(cue.laser) || Boolean(block) || sending != null
                    const name = cue.title || cue.name
                    return (
                        <li key={cue.lookId} style={{ minWidth: 0 }}>
                            <button type="button" disabled={disabled} data-fav={cue.lookId} data-cue={cue.index} aria-current={isLive ? 'true' : undefined} title={name}
                                onClick={() => choose(cue)}
                                style={{ ...brickStyle, cursor: disabled ? 'default' : 'pointer', opacity: disabled && !isLive ? 0.55 : 1, borderColor: isLive ? EMBER : LINE, background: isLive ? 'rgba(var(--di-danger-rgb, 242, 95, 92), 0.22)' : 'var(--di-scrim-strong, rgba(4, 6, 14, 0.9))', boxShadow: isLive ? `inset 0 0 0 1px ${EMBER}` : 'none' }}>
                                <span aria-hidden="true" style={{ display: 'flex', gap: 2 }}>
                                    {(cue.swatch?.length ? cue.swatch.slice(0, 2) : [{ hex: '#000' }]).map((s, i) => (
                                        <span key={i} style={{ width: 12, height: 8, background: s.hex, border: '1px solid rgba(255,255,255,0.3)' }} />
                                    ))}
                                </span>
                                <span style={{ fontSize: 'var(--di-text-2, 0.625rem)', fontWeight: isLive ? 700 : 500, lineHeight: 1.15, maxWidth: '100%', overflowWrap: 'anywhere', textAlign: 'center', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{name}</span>
                            </button>
                        </li>
                    )
                })}
            </ul> : null}
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
    width: 'min(56rem, calc(100vw - 2rem))',
    pointerEvents: 'none', // the empty width between the control and the bricks belongs to the scene
    color: '#f5f7fa'
}
const listStyle = { listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 4, pointerEvents: 'auto' }
const brickStyle = {
    width: '100%',
    minHeight: 48,
    padding: '0.25rem 0.2rem',
    border: '1px solid',
    borderRadius: '2px',
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
const noticeStyle = { pointerEvents: 'auto', margin: '0 0 4px', padding: '0.3rem 0.5rem', background: EMBER, color: '#000', fontWeight: 700, fontSize: 'var(--di-text-3, 0.76rem)', borderRadius: '2px' }
